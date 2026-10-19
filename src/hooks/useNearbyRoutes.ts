import { useCallback, useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import type { NearbyRoute } from '../types/nearbyRoutes';

export interface UseNearbyRoutesOptions {
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
}

interface UseNearbyRoutesResult {
  routes: NearbyRoute[];
  isLoading: boolean;
  error: string;
  refetch: () => void;
}

function isNearbyRoute(value: unknown): value is NearbyRoute {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const route = value as Record<string, unknown>;
  return typeof route.route_id === 'string'
    && typeof route.route_name === 'string'
    && (typeof route.route_code === 'string' || route.route_code === null)
    && typeof route.transport_mode === 'string'
    && ['brt', 'danfo', 'keke', 'ferry', 'train', 'uber'].includes(route.transport_mode)
    && typeof route.nearby_stop_name === 'string'
    && typeof route.stop_area === 'string'
    && typeof route.stop_sequence === 'number'
    && Number.isInteger(route.stop_sequence)
    && typeof route.distance_to_stop_meters === 'number'
    && Number.isFinite(route.distance_to_stop_meters)
    && route.distance_to_stop_meters >= 0;
}

export function useNearbyRoutes({
  latitude,
  longitude,
  radiusMeters,
}: UseNearbyRoutesOptions): UseNearbyRoutesResult {
  const [routes, setRoutes] = useState<NearbyRoute[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [requestVersion, setRequestVersion] = useState(0);
  const refetch = useCallback(() => setRequestVersion((version) => version + 1), []);

  useEffect(() => {
    let active = true;

    if (latitude === null || longitude === null) {
      setRoutes([]);
      setIsLoading(false);
      setError('');
      return () => { active = false; };
    }
    if (
      !Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
    ) {
      setRoutes([]);
      setIsLoading(false);
      setError('Enter valid latitude and longitude coordinates.');
      return () => { active = false; };
    }
    if (!Number.isInteger(radiusMeters) || radiusMeters <= 0) {
      setRoutes([]);
      setIsLoading(false);
      setError('Search radius must be a positive number of meters.');
      return () => { active = false; };
    }
    if (!isSupabaseConfigured) {
      setRoutes([]);
      setIsLoading(false);
      setError('Nearby route search is unavailable because Supabase is not configured.');
      return () => { active = false; };
    }

    setRoutes([]);
    setIsLoading(true);
    setError('');
    void (async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc('get_nearby_routes', {
          user_lng: longitude,
          user_lat: latitude,
          radius_meters: radiusMeters,
        });
        if (!active) return;
        if (rpcError) {
          if (rpcError.code === 'PGRST202') {
            const diagnostic = [rpcError.details, rpcError.hint].filter(Boolean).join(' ');
            setError(
              `Supabase cannot resolve get_nearby_routes(user_lng double precision, user_lat double precision, radius_meters integer). Check the function argument names/types and that it exists in the same project configured for LagosGo, then refresh the PostgREST schema cache.${diagnostic ? ` ${diagnostic}` : ''}`,
            );
          } else {
            setError(`Could not load nearby routes: ${rpcError.message}`);
          }
          setRoutes([]);
          return;
        }
        if (!Array.isArray(data) || !data.every(isNearbyRoute)) {
          setError('Nearby routes returned an unexpected response. Please try again.');
          setRoutes([]);
          return;
        }
        setRoutes([...data].sort((left, right) =>
          left.distance_to_stop_meters - right.distance_to_stop_meters,
        ));
      } catch (cause) {
        if (!active) return;
        setRoutes([]);
        setError(cause instanceof Error ? `Could not load nearby routes: ${cause.message}` : 'Could not load nearby routes.');
      } finally {
        if (active) setIsLoading(false);
      }
    })();

    return () => { active = false; };
  }, [latitude, longitude, radiusMeters, requestVersion]);

  return { routes, isLoading, error, refetch };
}
