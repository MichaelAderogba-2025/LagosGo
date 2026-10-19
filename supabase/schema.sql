-- LagosGo database schema, access policies, and starter route data.

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  phone_number TEXT,
  preferred_transport_mode TEXT DEFAULT 'brt',
  role TEXT NOT NULL DEFAULT 'commuter',
  admin_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'commuter',
  ADD COLUMN IF NOT EXISTS admin_name TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_admin_name_unique_idx
  ON public.profiles (lower(admin_name))
  WHERE admin_name IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  mode TEXT NOT NULL,
  est_duration_minutes INT NOT NULL,
  est_cost_ngn INT NOT NULL,
  traffic_level TEXT DEFAULT 'moderate',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  location TEXT NOT NULL,
  issue_type TEXT NOT NULL,
  description TEXT NOT NULL,
  upvotes INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.report_votes (
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (report_id, user_id)
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_votes ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, NULLIF(trim(NEW.raw_user_meta_data ->> 'full_name'), ''))
  ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Backfill accounts created before the profile trigger was installed.
INSERT INTO public.profiles (id, full_name)
SELECT
  id,
  NULLIF(trim(raw_user_meta_data ->> 'full_name'), '')
FROM auth.users
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "profiles_read_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_read_own_or_admin"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "routes_public_read" ON public.routes;
CREATE POLICY "routes_public_read"
  ON public.routes FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "routes_admin_manage" ON public.routes;
CREATE POLICY "routes_admin_manage"
  ON public.routes FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "reports_public_read" ON public.reports;
CREATE POLICY "reports_public_read"
  ON public.reports FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "reports_authenticated_create" ON public.reports;
CREATE POLICY "reports_authenticated_create"
  ON public.reports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "reports_admin_manage" ON public.reports;
CREATE POLICY "reports_admin_manage"
  ON public.reports FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "report_votes_read_own" ON public.report_votes;
CREATE POLICY "report_votes_read_own"
  ON public.report_votes FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.confirm_report(target_report_id UUID)
RETURNS BOOLEAN
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  inserted_rows INT;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to confirm a report.';
  END IF;

  PERFORM 1 FROM public.reports
  WHERE id = target_report_id AND status <> 'resolved'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This report is no longer available for confirmation.';
  END IF;

  INSERT INTO public.report_votes (report_id, user_id)
  VALUES (target_report_id, current_user_id)
  ON CONFLICT (report_id, user_id) DO NOTHING;

  GET DIAGNOSTICS inserted_rows = ROW_COUNT;
  IF inserted_rows = 1 THEN
    UPDATE public.reports SET upvotes = COALESCE(upvotes, 0) + 1 WHERE id = target_report_id;
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_report(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_report(UUID) TO authenticated;

GRANT SELECT ON public.routes, public.reports TO anon, authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.report_votes TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.routes TO authenticated;
GRANT INSERT ON public.reports TO authenticated;
GRANT UPDATE ON public.reports TO authenticated;

INSERT INTO public.routes (title, origin, destination, mode, est_duration_minutes, est_cost_ngn, traffic_level)
SELECT seed.title, seed.origin, seed.destination, seed.mode, seed.est_duration_minutes, seed.est_cost_ngn, seed.traffic_level
FROM (VALUES
  ('CMS to Ikeja BRT Direct', 'CMS Bus Stop', 'Ikeja Along', 'brt', 50, 850, 'moderate'),
  ('Mile 2 to Marina Blue Line Rail', 'Mile 2 Station', 'Marina Terminal', 'train', 20, 750, 'low'),
  ('Ikorodu to CMS Lagferry Route', 'Ikorodu Terminal', 'CMS Jetty', 'ferry', 40, 1500, 'low'),
  ('Ojota to Lekki Phase 1 via Danfo', 'Ojota Motor Park', 'Lekki Phase 1', 'danfo', 75, 1200, 'heavy')
) AS seed(title, origin, destination, mode, est_duration_minutes, est_cost_ngn, traffic_level)
WHERE NOT EXISTS (
  SELECT 1 FROM public.routes existing WHERE existing.title = seed.title
);

-- After creating the administrator's account, set its role and admin username:
-- UPDATE public.profiles
-- SET role = 'admin', admin_name = lower('your-admin-name')
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@example.com');
