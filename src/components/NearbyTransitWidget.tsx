import { useState, type FormEvent } from 'react';
import { LoaderCircle, LocateFixed, MapPin, Navigation, RefreshCw, Signal, WifiOff } from 'lucide-react';
import { useGeolocation } from '../hooks/useGeolocation';
import { useNearbyRoutes } from '../hooks/useNearbyRoutes';

const searchRadii = [
  { label: '500 m', meters: 500 },
  { label: '1 km', meters: 1_000 },
  { label: '2 km', meters: 2_000 },
] as const;

function formatDistance(meters: number): string {
  return `${Math.round(meters).toLocaleString()} m`;
}

function formatCoordinate(value: number): string {
  return value.toFixed(5);
}

export function NearbyTransitWidget() {
  const {
    position,
    status: locationStatus,
    error: locationError,
    isSupported,
    requestLocation,
    stopTracking,
  } = useGeolocation();
  const [radiusMeters, setRadiusMeters] = useState<number>(1_000);
  const [latitudeInput, setLatitudeInput] = useState('');
  const [longitudeInput, setLongitudeInput] = useState('');
  const [customCoordinates, setCustomCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [coordinateError, setCoordinateError] = useState('');
  const activeCoordinates = customCoordinates ?? (position
    ? { latitude: position.latitude, longitude: position.longitude }
    : null);
  const { routes, isLoading, error: routeError, refetch } = useNearbyRoutes({
    latitude: activeCoordinates?.latitude ?? null,
    longitude: activeCoordinates?.longitude ?? null,
    radiusMeters,
  });

  const handleUseCurrentLocation = () => {
    setCustomCoordinates(null);
    setCoordinateError('');
    requestLocation();
  };

  const handleCoordinatesSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const latitude = Number(latitudeInput);
    const longitude = Number(longitudeInput);
    if (
      !latitudeInput.trim()
      || !longitudeInput.trim()
      || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
    ) {
      setCoordinateError('Enter a valid latitude (-90 to 90) and longitude (-180 to 180).');
      return;
    }
    setCoordinateError('');
    setCustomCoordinates({ latitude, longitude });
    stopTracking();
  };

  const locationStatusText = customCoordinates
    ? 'Custom coordinates'
    : locationStatus === 'loading'
    ? 'Detecting location…'
    : locationStatus === 'success' && position
      ? `Live GPS · accuracy ±${Math.round(position.accuracy)} m`
      : locationStatus === 'error'
        ? locationError.startsWith('Permission Denied') ? 'Permission Denied' : 'Location unavailable'
        : 'Location not requested';

  return (
    <section className="mx-auto max-w-5xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 text-white shadow-xl">
      <header className="border-b border-slate-800 bg-slate-950/70 p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-500">Nearby transit</p>
            <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Find routes around you.</h1>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Use your live location or enter coordinates to find transit stops within walking distance.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200">
            <Signal className={`h-4 w-4 ${customCoordinates || locationStatus === 'success' ? 'text-emerald-400' : locationStatus === 'error' ? 'text-red-400' : 'text-amber-500'}`} />
            {locationStatusText}
          </span>
        </div>

        {locationError && (
          <p role="alert" className="mt-4 rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2.5 text-xs leading-5 text-red-200">
            {locationError}
          </p>
        )}

        {position && !customCoordinates && (
          <p className="mt-3 text-xs text-slate-400">
            Current coordinates: {formatCoordinate(position.latitude)}, {formatCoordinate(position.longitude)}
          </p>
        )}
        {customCoordinates && (
          <p role="status" className="mt-3 text-xs text-amber-200">
            Searching custom coordinates: {formatCoordinate(customCoordinates.latitude)}, {formatCoordinate(customCoordinates.longitude)}
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={!isSupported || locationStatus === 'loading'}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {locationStatus === 'loading'
              ? <LoaderCircle className="h-4 w-4 animate-spin" />
              : <LocateFixed className="h-4 w-4" />}
            {locationStatus === 'success' && !customCoordinates ? 'Refresh my location' : 'Use my live location'}
          </button>
          {locationStatus === 'success' && !customCoordinates && (
            <button
              type="button"
              onClick={stopTracking}
              className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
            >
              Stop GPS
            </button>
          )}
        </div>
        {!isSupported && (
          <p className="mt-2 text-xs text-amber-200">This browser does not provide GPS. You can still search by coordinates below.</p>
        )}
      </header>

      <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[0.85fr,1.15fr]">
        <div className="space-y-5">
          <form onSubmit={handleCoordinatesSubmit} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="mb-4 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-amber-500" />
              <h2 className="text-sm font-bold text-slate-100">Search custom coordinates</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-semibold text-slate-300">
                Latitude
                <input
                  type="number"
                  min="-90"
                  max="90"
                  step="any"
                  required
                  value={latitudeInput}
                  onChange={(event) => setLatitudeInput(event.target.value)}
                  placeholder="6.5244"
                  className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                />
              </label>
              <label className="text-xs font-semibold text-slate-300">
                Longitude
                <input
                  type="number"
                  min="-180"
                  max="180"
                  step="any"
                  required
                  value={longitudeInput}
                  onChange={(event) => setLongitudeInput(event.target.value)}
                  placeholder="3.3792"
                  className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                />
              </label>
            </div>
            {coordinateError && <p role="alert" className="mt-2 text-xs text-red-300">{coordinateError}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="submit" className="inline-flex items-center gap-2 rounded-lg border border-amber-500/50 px-3 py-2 text-xs font-bold text-amber-400 transition hover:bg-amber-500/10">
                <Navigation className="h-3.5 w-3.5" />
                Search these coordinates
              </button>
              {customCoordinates && (
                <button type="button" onClick={handleUseCurrentLocation} className="text-xs font-semibold text-slate-400 hover:text-white">
                  Switch back to GPS
                </button>
              )}
            </div>
          </form>

          <fieldset>
            <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Search radius</legend>
            <div className="grid grid-cols-3 gap-2">
              {searchRadii.map((radius) => (
                <button
                  key={radius.meters}
                  type="button"
                  aria-pressed={radiusMeters === radius.meters}
                  onClick={() => setRadiusMeters(radius.meters)}
                  className={`rounded-lg border px-3 py-2.5 text-sm font-bold transition ${
                    radiusMeters === radius.meters
                      ? 'border-amber-500 bg-amber-500 text-slate-950'
                      : 'border-slate-700 bg-slate-950/50 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  {radius.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">Changing the radius refreshes nearby routes automatically.</p>
          </fieldset>
        </div>

        <section aria-live="polite" className="min-h-64 rounded-xl border border-slate-800 bg-slate-950/50 p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-white">Nearby stops and routes</h2>
              <p className="mt-1 text-xs text-slate-400">
                {activeCoordinates
                  ? `Within ${radiusMeters >= 1_000 ? `${radiusMeters / 1_000} km` : `${radiusMeters} m`}`
                  : 'Choose a location to begin'}
              </p>
            </div>
            {activeCoordinates && !isLoading && (
              <button
                type="button"
                onClick={refetch}
                aria-label="Refresh nearby routes"
                className="rounded-lg border border-slate-700 p-2 text-slate-300 transition hover:bg-slate-800 hover:text-amber-400"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="flex min-h-48 flex-col items-center justify-center text-center">
              <LoaderCircle className="h-7 w-7 animate-spin text-amber-500" />
              <p className="mt-3 text-sm font-semibold text-slate-200">Scanning nearby routes…</p>
              <p className="mt-1 text-xs text-slate-500">Checking stops within your selected radius.</p>
            </div>
          ) : routeError ? (
            <div className="flex min-h-48 flex-col items-center justify-center text-center">
              <WifiOff className="h-7 w-7 text-red-400" />
              <p role="alert" className="mt-3 text-sm font-semibold text-red-200">{routeError}</p>
              {activeCoordinates && (
                <button onClick={refetch} className="mt-3 text-xs font-bold text-amber-400 hover:text-amber-300">Try again</button>
              )}
            </div>
          ) : !activeCoordinates ? (
            <div className="flex min-h-48 flex-col items-center justify-center text-center">
              <LocateFixed className="h-7 w-7 text-slate-600" />
              <p className="mt-3 text-sm font-semibold text-slate-200">Set your starting point</p>
              <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">Allow GPS access or enter latitude and longitude to see nearby transit.</p>
            </div>
          ) : routes.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center text-center">
              <MapPin className="h-7 w-7 text-slate-600" />
              <p className="mt-3 text-sm font-semibold text-slate-200">No routes found nearby</p>
              <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">Try expanding the radius or choosing another location.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-800">
              {routes.map((route, index) => (
                <li key={`${route.route_id}:${route.stop_sequence}:${index}`} className="flex flex-wrap items-start justify-between gap-3 py-4 first:pt-1 last:pb-1">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-white">{route.route_name}</h3>
                      {route.route_code && <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">{route.route_code}</span>}
                      <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-400">
                        {route.transport_mode}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm font-semibold text-slate-200">{route.nearby_stop_name}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{route.stop_area} · Stop {route.stop_sequence}</p>
                  </div>
                  <span className="shrink-0 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-bold text-amber-400">
                    {formatDistance(route.distance_to_stop_meters)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}
