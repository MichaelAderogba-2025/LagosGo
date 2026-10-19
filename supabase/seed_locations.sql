INSERT INTO public.locations (name, area, address, coordinates)
SELECT
  seed.name,
  seed.area,
  seed.address,
  extensions.ST_SetSRID(
    extensions.ST_MakePoint(seed.longitude, seed.latitude),
    4326
  )::extensions.geography
FROM (VALUES
  (
    'Ikeja Airport (Murtala Muhammed International Airport)',
    'Ikeja',
    'Airport Road, Ikeja, Lagos',
    3.3212::DOUBLE PRECISION,
    6.5774::DOUBLE PRECISION
  ),
  (
    'Oshodi Transport Interchange',
    'Oshodi',
    'Oshodi-Apapa Expressway, Oshodi, Lagos',
    3.3508::DOUBLE PRECISION,
    6.5550::DOUBLE PRECISION
  ),
  (
    'Lekki Toll Gate',
    'Lekki',
    'Lekki-Epe Expressway, Lekki, Lagos',
    3.6967::DOUBLE PRECISION,
    6.4341::DOUBLE PRECISION
  ),
  (
    'Lagos Berger Bus Stop',
    'Berger',
    'Lagos-Ibadan Expressway, Ojodu Berger, Lagos',
    3.3711::DOUBLE PRECISION,
    6.6496::DOUBLE PRECISION
  ),
  (
    'Victoria Island',
    'Victoria Island',
    'Ahmadu Bello Way, Victoria Island, Lagos',
    3.4210::DOUBLE PRECISION,
    6.4281::DOUBLE PRECISION
  ),
  (
    'CMS Bus Terminal',
    'Lagos Island',
    'Marina, Lagos Island, Lagos',
    3.3982::DOUBLE PRECISION,
    6.4527::DOUBLE PRECISION
  ),
  (
    'Marina Blue Line Station',
    'Lagos Island',
    'Marina Road, Lagos Island, Lagos',
    3.3975::DOUBLE PRECISION,
    6.4520::DOUBLE PRECISION
  ),
  (
    'Ikeja City Mall',
    'Alausa, Ikeja',
    'Obafemi Awolowo Way, Alausa, Ikeja, Lagos',
    3.3577::DOUBLE PRECISION,
    6.6178::DOUBLE PRECISION
  ),
  (
    'Yaba Railway Station',
    'Yaba',
    'Railway Compound, Yaba, Lagos',
    3.3785::DOUBLE PRECISION,
    6.5151::DOUBLE PRECISION
  ),
  (
    'Mile 2 Bus Terminal',
    'Amuwo-Odofin',
    'Mile 2, Badagry Expressway, Lagos',
    3.2815::DOUBLE PRECISION,
    6.4698::DOUBLE PRECISION
  )
) AS seed(name, area, address, longitude, latitude)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.locations AS existing
  WHERE lower(existing.name) = lower(seed.name)
    AND lower(existing.area) = lower(seed.area)
);
