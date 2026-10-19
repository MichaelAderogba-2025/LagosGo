CREATE TABLE IF NOT EXISTS public.saved_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 40),
  address TEXT NOT NULL CHECK (length(trim(address)) BETWEEN 1 AND 120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name, address)
);

ALTER TABLE public.saved_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "saved_locations_read_own" ON public.saved_locations;
CREATE POLICY "saved_locations_read_own"
  ON public.saved_locations FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "saved_locations_create_own" ON public.saved_locations;
CREATE POLICY "saved_locations_create_own"
  ON public.saved_locations FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "saved_locations_update_own" ON public.saved_locations;
CREATE POLICY "saved_locations_update_own"
  ON public.saved_locations FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "saved_locations_delete_own" ON public.saved_locations;
CREATE POLICY "saved_locations_delete_own"
  ON public.saved_locations FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_locations TO authenticated;

CREATE TABLE IF NOT EXISTS public.route_coverage_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE DEFAULT auth.uid(),
  origin_area TEXT NOT NULL CHECK (length(trim(origin_area)) BETWEEN 1 AND 120),
  destination_area TEXT NOT NULL CHECK (length(trim(destination_area)) BETWEEN 1 AND 120),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'covered', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (lower(trim(origin_area)) <> lower(trim(destination_area)))
);

CREATE INDEX IF NOT EXISTS route_coverage_requests_status_created_idx
  ON public.route_coverage_requests (status, created_at DESC);

ALTER TABLE public.route_coverage_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coverage_requests_create_own" ON public.route_coverage_requests;
CREATE POLICY "coverage_requests_create_own"
  ON public.route_coverage_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "coverage_requests_admin_read" ON public.route_coverage_requests;
CREATE POLICY "coverage_requests_admin_read"
  ON public.route_coverage_requests FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "coverage_requests_admin_update" ON public.route_coverage_requests;
CREATE POLICY "coverage_requests_admin_update"
  ON public.route_coverage_requests FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT INSERT ON public.route_coverage_requests TO authenticated;
GRANT SELECT, UPDATE ON public.route_coverage_requests TO authenticated;

CREATE OR REPLACE FUNCTION public.get_coverage_demand()
RETURNS TABLE (
  origin_area TEXT,
  destination_area TEXT,
  request_count BIGINT,
  latest_request TIMESTAMPTZ
)
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    min(request.origin_area),
    min(request.destination_area),
    count(*),
    max(request.created_at)
  FROM public.route_coverage_requests AS request
  WHERE request.status = 'open'
  GROUP BY lower(trim(request.origin_area)), lower(trim(request.destination_area))
  ORDER BY count(*) DESC, max(request.created_at) DESC;
$$;

REVOKE ALL ON FUNCTION public.get_coverage_demand() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_coverage_demand() TO authenticated;

CREATE TABLE IF NOT EXISTS public.product_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_name TEXT NOT NULL CHECK (event_name IN (
    'route_search_submitted',
    'route_results_viewed',
    'route_selected',
    'report_submitted',
    'coverage_requested'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_events_created_idx
  ON public.product_events (created_at DESC, event_name);

ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_events_insert" ON public.product_events;
CREATE POLICY "product_events_insert"
  ON public.product_events FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "product_events_admin_read" ON public.product_events;
CREATE POLICY "product_events_admin_read"
  ON public.product_events FOR SELECT TO authenticated
  USING (public.is_admin());

GRANT INSERT ON public.product_events TO anon, authenticated;
GRANT SELECT ON public.product_events TO authenticated;

CREATE OR REPLACE FUNCTION public.get_product_metrics()
RETURNS TABLE (event_name TEXT, total BIGINT)
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT events.event_name, count(*) AS total
  FROM public.product_events AS events
  WHERE events.created_at >= now() - INTERVAL '30 days'
  GROUP BY events.event_name
  ORDER BY events.event_name;
$$;

REVOKE ALL ON FUNCTION public.get_product_metrics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_product_metrics() TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_own_report(target_report_id UUID)
RETURNS BOOLEAN
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.reports
  SET status = 'resolved'
  WHERE id = target_report_id
    AND user_id = auth.uid()
    AND status <> 'resolved';
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_own_report(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_own_report(UUID) TO authenticated;
