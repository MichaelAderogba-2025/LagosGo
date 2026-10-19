-- Keep all administrative changes behind the existing Supabase admin role.
ALTER TABLE public.transit_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transit_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fare_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "routes_admin_manage" ON public.routes;
CREATE POLICY "routes_admin_manage"
  ON public.routes FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "transit_stops_admin_manage" ON public.transit_stops;
CREATE POLICY "transit_stops_admin_manage"
  ON public.transit_stops FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "transit_segments_admin_manage" ON public.transit_segments;
CREATE POLICY "transit_segments_admin_manage"
  ON public.transit_segments FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "fare_reports_admin_delete" ON public.fare_reports;
CREATE POLICY "fare_reports_admin_delete"
  ON public.fare_reports FOR DELETE TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "reports_admin_delete" ON public.reports;
CREATE POLICY "reports_admin_delete"
  ON public.reports FOR DELETE TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "reports_admin_manage" ON public.reports;
CREATE POLICY "reports_admin_manage"
  ON public.reports FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transit_stops TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transit_segments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.routes TO authenticated;
GRANT SELECT, DELETE ON public.fare_reports TO authenticated;
GRANT SELECT, UPDATE, DELETE ON public.reports TO authenticated;
