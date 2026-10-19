CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  area TEXT NOT NULL,
  address TEXT NOT NULL,
  coordinates extensions.geography(Point, 4326) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS locations_coordinates_gist_idx
  ON public.locations USING GIST (coordinates);

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "locations_public_read" ON public.locations;
CREATE POLICY "locations_public_read"
  ON public.locations FOR SELECT TO anon, authenticated
  USING (true);

GRANT SELECT ON public.locations TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.search_lagos_locations(
  search_text TEXT,
  limit_val INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  area TEXT,
  address TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION
)
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  SELECT
    location.id,
    location.name,
    location.area,
    location.address,
    extensions.ST_Y(location.coordinates::extensions.geometry) AS latitude,
    extensions.ST_X(location.coordinates::extensions.geometry) AS longitude
  FROM public.locations AS location
  WHERE NULLIF(trim(search_text), '') IS NOT NULL
    AND (
      location.name ILIKE '%' || trim(search_text) || '%'
      OR location.area ILIKE '%' || trim(search_text) || '%'
      OR location.address ILIKE '%' || trim(search_text) || '%'
    )
  ORDER BY
    CASE
      WHEN location.name ILIKE trim(search_text) THEN 0
      WHEN location.name ILIKE trim(search_text) || '%' THEN 1
      ELSE 2
    END,
    location.name
  LIMIT LEAST(GREATEST(COALESCE(limit_val, 10), 1), 50);
$$;

GRANT EXECUTE ON FUNCTION public.search_lagos_locations(TEXT, INT) TO anon, authenticated;
