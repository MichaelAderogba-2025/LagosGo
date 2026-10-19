-- Collect current fares reported by commuters for transit segments or corridors.
CREATE TABLE IF NOT EXISTS public.fare_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id UUID REFERENCES public.transit_segments(id) ON DELETE SET NULL,
  route_title TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('danfo', 'brt', 'keke', 'ferry', 'train', 'uber')),
  reported_fare NUMERIC(10, 2) NOT NULL CHECK (reported_fare > 0),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (length(trim(route_title)) > 0)
);

CREATE INDEX IF NOT EXISTS fare_reports_segment_created_idx
  ON public.fare_reports (segment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS fare_reports_corridor_created_idx
  ON public.fare_reports (lower(route_title), mode, created_at DESC);

ALTER TABLE public.fare_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fare_reports_public_read" ON public.fare_reports;
CREATE POLICY "fare_reports_public_read"
  ON public.fare_reports FOR SELECT TO anon, authenticated
  USING (true);

-- Require a signed-in user and bind the submitted user_id to that identity.
DROP POLICY IF EXISTS "fare_reports_authenticated_insert" ON public.fare_reports;
CREATE POLICY "fare_reports_authenticated_insert"
  ON public.fare_reports FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

GRANT SELECT ON public.fare_reports TO anon, authenticated;
GRANT INSERT ON public.fare_reports TO authenticated;

-- Calculate the median fare reported in the last four hours, or use the
-- segment's configured fare when no recent reports exist.
CREATE OR REPLACE FUNCTION public.get_latest_corridor_fare(p_segment_id UUID)
RETURNS NUMERIC
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT percentile_cont(0.5)
        WITHIN GROUP (ORDER BY report.reported_fare::DOUBLE PRECISION)::NUMERIC
      FROM public.fare_reports AS report
      WHERE report.segment_id = p_segment_id
        AND report.created_at >= now() - INTERVAL '4 hours'
    ),
    (
      SELECT segment.base_fare
      FROM public.transit_segments AS segment
      WHERE segment.id = p_segment_id
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_latest_corridor_fare(UUID) TO anon, authenticated;

-- Include segment IDs in route steps so fare reports can be attached to the
-- exact leg even when this migration is applied after the original route RPC.
CREATE OR REPLACE FUNCTION public.find_multi_leg_routes(
  origin_area TEXT,
  dest_area TEXT
)
RETURNS TABLE (
  id TEXT,
  title TEXT,
  mode TEXT,
  start_point TEXT,
  end_point TEXT,
  total_time_minutes INTEGER,
  total_cost_ngn NUMERIC,
  traffic_status TEXT,
  transfers_count INTEGER,
  steps JSONB
)
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH candidates AS (
    SELECT
      first_leg.id AS first_leg_id,
      NULL::UUID AS second_leg_id
    FROM public.transit_stops AS origin
    JOIN public.transit_segments AS first_leg
      ON first_leg.origin_stop_id = origin.id
    JOIN public.transit_stops AS destination
      ON destination.id = first_leg.destination_stop_id
    WHERE NULLIF(trim(origin_area), '') IS NOT NULL
      AND NULLIF(trim(dest_area), '') IS NOT NULL
      AND lower(origin.area) = lower(trim(origin_area))
      AND lower(destination.area) = lower(trim(dest_area))

    UNION ALL

    SELECT
      first_leg.id AS first_leg_id,
      second_leg.id AS second_leg_id
    FROM public.transit_stops AS origin
    JOIN public.transit_segments AS first_leg
      ON first_leg.origin_stop_id = origin.id
    JOIN public.transit_stops AS hub
      ON hub.id = first_leg.destination_stop_id
      AND hub.is_major_hub
    JOIN public.transit_segments AS second_leg
      ON second_leg.origin_stop_id = hub.id
    JOIN public.transit_stops AS destination
      ON destination.id = second_leg.destination_stop_id
    WHERE NULLIF(trim(origin_area), '') IS NOT NULL
      AND NULLIF(trim(dest_area), '') IS NOT NULL
      AND lower(origin.area) = lower(trim(origin_area))
      AND lower(destination.area) = lower(trim(dest_area))
      AND origin.id <> hub.id
      AND destination.id <> hub.id
      AND origin.id <> destination.id
  ),
  route_legs AS (
    SELECT
      first_leg.id AS first_leg_id,
      second_leg.id AS second_leg_id,
      origin.name AS origin_name,
      destination.name AS destination_name,
      first_leg.mode AS first_mode,
      first_leg.est_duration_mins
        + COALESCE(second_leg.est_duration_mins, 0) AS duration_mins,
      first_leg.base_fare
        + COALESCE(second_leg.base_fare, 0) AS fare_ngn,
      jsonb_build_array(
        jsonb_build_object(
          'instruction',
          'Travel from ' || origin.name || ' to ' || first_destination.name
            || ' by ' || upper(first_leg.mode) || '.',
          'mode', first_leg.mode,
          'duration', first_leg.est_duration_mins,
          'cost', first_leg.base_fare,
          'stopName', first_destination.name,
          'segmentId', first_leg.id
        )
      ) || CASE
        WHEN second_leg.id IS NULL THEN '[]'::JSONB
        ELSE jsonb_build_array(
          jsonb_build_object(
            'instruction',
            'Transfer at ' || first_destination.name || ' and continue to '
              || destination.name || ' by ' || upper(second_leg.mode) || '.',
            'mode', second_leg.mode,
            'duration', second_leg.est_duration_mins,
            'cost', second_leg.base_fare,
            'stopName', destination.name,
            'segmentId', second_leg.id
          )
        )
      END AS route_steps
    FROM candidates AS candidate
    JOIN public.transit_segments AS first_leg
      ON first_leg.id = candidate.first_leg_id
    JOIN public.transit_stops AS origin
      ON origin.id = first_leg.origin_stop_id
    JOIN public.transit_stops AS first_destination
      ON first_destination.id = first_leg.destination_stop_id
    LEFT JOIN public.transit_segments AS second_leg
      ON second_leg.id = candidate.second_leg_id
    JOIN public.transit_stops AS destination
      ON destination.id = COALESCE(second_leg.destination_stop_id, first_leg.destination_stop_id)
  )
  SELECT
    CASE
      WHEN route_legs.second_leg_id IS NULL THEN 'direct:' || route_legs.first_leg_id::TEXT
      ELSE 'transfer:' || route_legs.first_leg_id::TEXT || ':' || route_legs.second_leg_id::TEXT
    END AS id,
    route_legs.origin_name || ' to ' || route_legs.destination_name AS title,
    route_legs.first_mode AS mode,
    route_legs.origin_name AS start_point,
    route_legs.destination_name AS end_point,
    route_legs.duration_mins AS total_time_minutes,
    route_legs.fare_ngn AS total_cost_ngn,
    'moderate'::TEXT AS traffic_status,
    CASE WHEN route_legs.second_leg_id IS NULL THEN 0 ELSE 1 END AS transfers_count,
    route_legs.route_steps AS steps
  FROM route_legs
  ORDER BY route_legs.duration_mins, route_legs.fare_ngn
  LIMIT 20;
$$;

GRANT EXECUTE ON FUNCTION public.find_multi_leg_routes(TEXT, TEXT) TO anon, authenticated;

-- Keep this migration rerunnable in projects where the table may already have
-- been added to the Realtime publication manually.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'fare_reports'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.fare_reports;
  END IF;
END;
$$;
