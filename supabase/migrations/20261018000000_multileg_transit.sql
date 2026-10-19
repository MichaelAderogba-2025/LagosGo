-- Store transit stops and the individual legs that connect them.
CREATE TABLE IF NOT EXISTS public.transit_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  area TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  is_major_hub BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.transit_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode TEXT NOT NULL CHECK (mode IN ('brt', 'danfo', 'keke', 'ferry', 'train', 'uber')),
  origin_stop_id UUID NOT NULL REFERENCES public.transit_stops(id) ON DELETE CASCADE,
  destination_stop_id UUID NOT NULL REFERENCES public.transit_stops(id) ON DELETE CASCADE,
  base_fare NUMERIC(10, 2) NOT NULL CHECK (base_fare >= 0),
  est_duration_mins INTEGER NOT NULL CHECK (est_duration_mins > 0),
  CHECK (origin_stop_id <> destination_stop_id)
);

CREATE INDEX IF NOT EXISTS transit_stops_area_idx
  ON public.transit_stops (lower(area));

CREATE INDEX IF NOT EXISTS transit_segments_origin_idx
  ON public.transit_segments (origin_stop_id);

CREATE INDEX IF NOT EXISTS transit_segments_destination_idx
  ON public.transit_segments (destination_stop_id);

ALTER TABLE public.transit_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transit_segments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transit_stops_public_read" ON public.transit_stops;
CREATE POLICY "transit_stops_public_read"
  ON public.transit_stops FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "transit_segments_public_read" ON public.transit_segments;
CREATE POLICY "transit_segments_public_read"
  ON public.transit_segments FOR SELECT TO anon, authenticated
  USING (true);

GRANT SELECT ON public.transit_stops, public.transit_segments TO anon, authenticated;

-- Return direct journeys and journeys with exactly one transfer at a major hub.
-- The JSON steps match the fields consumed by the frontend RouteOption type.
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
      'direct'::TEXT AS route_kind,
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
      'transfer'::TEXT AS route_kind,
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
      candidate.route_kind,
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
