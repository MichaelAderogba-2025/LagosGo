import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { calculateLagosEstimatedFare } from '../utils/fareCalculator';
import type { RouteOption, TransportMode } from '../types';
import { buildDistanceEstimateRoutes } from './routeEstimates';
import type { LngLat } from './geocodingService';

export interface NavigationStep {
  instruction: string;
  distanceMeters: number;
  durationMinutes: number;
  maneuverType: string;
  roadName: string;
}

export interface RouteResult {
  originName: string;
  destinationName: string;
  distanceKm: number;
  durationMinutes: number;
  geometry: {
    type: 'LineString';
    coordinates: LngLat[];
  };
  steps: NavigationStep[];
  fareNgn: number;
  fareSource: 'database' | 'estimated';
  transportMode: string;
  title: string;
}

interface CuratedRoute {
  id: string;
  title: string;
  origin: string;
  destination: string;
  mode: string;
  est_duration_minutes: number;
  est_cost_ngn: number;
}

interface MapboxManeuver {
  type: string;
  instruction: string;
}

interface MapboxStep {
  distance: number;
  duration: number;
  name: string;
  maneuver: MapboxManeuver;
}

interface MapboxLeg {
  steps: MapboxStep[];
}

interface MapboxDirectionsRoute {
  distance: number;
  duration: number;
  geometry: {
    type: 'LineString';
    coordinates: LngLat[];
  };
  legs: MapboxLeg[];
}

interface MapboxDirectionsResponse {
  code: string;
  message?: string;
  routes: MapboxDirectionsRoute[];
}

const MAPBOX_DIRECTIONS_URL = 'https://api.mapbox.com/directions/v5/mapbox/driving';
const TRANSPORT_MODES: TransportMode[] = ['brt', 'danfo', 'keke', 'ferry', 'train', 'uber'];

interface MultiLegRouteStep {
  instruction: string;
  mode: TransportMode;
  duration: number;
  cost: number;
  stopName?: string;
  segmentId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTransportMode(value: unknown): value is TransportMode {
  return typeof value === 'string' && TRANSPORT_MODES.includes(value as TransportMode);
}

function parseFiniteNumber(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isTrafficStatus(value: unknown): value is RouteOption['trafficStatus'] {
  return value === 'low' || value === 'moderate' || value === 'heavy' || value === 'gridlock';
}

function mapMultiLegRoute(value: unknown): RouteOption {
  if (!isRecord(value) || !Array.isArray(value.steps)) {
    throw new Error('The multi-leg routes RPC returned an invalid route.');
  }

  const {
    id,
    title,
    mode,
    start_point: startPoint,
    end_point: endPoint,
    total_time_minutes: totalTimeMinutes,
    total_cost_ngn: totalCostNgn,
    traffic_status: trafficStatus,
    transfers_count: transfersCount,
  } = value;
  const parsedDuration = parseFiniteNumber(totalTimeMinutes);
  const parsedCost = parseFiniteNumber(totalCostNgn);
  const parsedTransfers = parseFiniteNumber(transfersCount);
  if (
    typeof id !== 'string'
    || typeof title !== 'string'
    || !isTransportMode(mode)
    || typeof startPoint !== 'string'
    || typeof endPoint !== 'string'
    || parsedDuration === null
    || parsedDuration < 0
    || parsedCost === null
    || parsedCost < 0
    || parsedTransfers === null
    || !Number.isInteger(parsedTransfers)
    || parsedTransfers < 0
    || !isTrafficStatus(trafficStatus)
  ) {
    throw new Error('The multi-leg routes RPC returned invalid route details.');
  }

  const steps = value.steps.map((step): MultiLegRouteStep => {
    const duration = isRecord(step) ? parseFiniteNumber(step.duration) : null;
    const cost = isRecord(step) ? parseFiniteNumber(step.cost) : null;
    if (
      !isRecord(step)
      || typeof step.instruction !== 'string'
      || !isTransportMode(step.mode)
      || duration === null
      || duration < 0
      || cost === null
      || cost < 0
      || (step.stopName !== undefined && typeof step.stopName !== 'string')
      || (step.segmentId !== undefined && typeof step.segmentId !== 'string')
    ) {
      throw new Error('The multi-leg routes RPC returned an invalid route step.');
    }
    return {
      instruction: step.instruction,
      mode: step.mode,
      duration,
      cost,
      ...(typeof step.stopName === 'string' ? { stopName: step.stopName } : {}),
      ...(typeof step.segmentId === 'string' ? { segmentId: step.segmentId } : {}),
    };
  });
  if (steps.length === 0) {
    throw new Error('The multi-leg routes RPC returned a route without steps.');
  }

  return {
    id,
    title,
    mode,
    dataQuality: 'curated',
    timeBasis: 'transit-estimate',
    fareBasis: 'baseline',
    startPoint,
    endPoint,
    totalTimeMinutes: parsedDuration,
    totalCostNgn: parsedCost,
    trafficStatus: 'unknown',
    transfersCount: parsedTransfers,
    steps,
  };
}

/**
 * Find transit paths for two areas, falling back to fare estimates when no
 * matching database path exists. Distance and duration come from directions.
 */
export async function findMultiLegRoutes(
  originArea: string,
  destinationArea: string,
  distanceKm: number,
  durationMinutes: number,
  modes: TransportMode[],
): Promise<RouteOption[]> {
  const selectedModes = modes.filter(isTransportMode);
  if (selectedModes.length === 0) return [];

  if (isSupabaseConfigured) {
    const { data, error } = await supabase.rpc('find_multi_leg_routes', {
      origin_area: originArea,
      dest_area: destinationArea,
    });
    if (error) {
      throw new Error(`Could not find multi-leg transit routes: ${error.message}`);
    }

    const routes = ((data ?? []) as unknown[]).map(mapMultiLegRoute);
    const matchingRoutes = routes.filter((route) =>
      route.steps.every((step) => selectedModes.includes(step.mode)),
    );
    if (matchingRoutes.length > 0) return matchingRoutes;
  }

  return buildDistanceEstimateRoutes(originArea, destinationArea, distanceKm, durationMinutes, selectedModes);
}

function getMapboxToken(): string {
  const token = import.meta.env.VITE_MAPBOX_TOKEN?.trim();
  if (!token) {
    throw new Error('Mapbox is not configured. Add VITE_MAPBOX_TOKEN to your .env.local file.');
  }
  return token;
}

function validateCoordinates(origin: LngLat, destination: LngLat): void {
  if ([...origin, ...destination].some((coordinate) => !Number.isFinite(coordinate))) {
    throw new Error('Origin and destination must contain valid longitude and latitude values.');
  }
}

async function findCuratedRoute(originName: string, destinationName: string): Promise<CuratedRoute | null> {
  if (!isSupabaseConfigured) return null;

  const escapeLikePattern = (value: string) => value.replace(/[\\%_]/g, '\\$&');
  const { data, error } = await supabase
    .from('routes')
    .select('id, title, origin, destination, mode, est_duration_minutes, est_cost_ngn')
    .ilike('origin', escapeLikePattern(originName))
    .ilike('destination', escapeLikePattern(destinationName))
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not check curated Lagos routes: ${error.message}`);
  }
  if (!data) return null;
  if (
    data.origin.trim().toLocaleLowerCase() !== originName.trim().toLocaleLowerCase()
    || data.destination.trim().toLocaleLowerCase() !== destinationName.trim().toLocaleLowerCase()
  ) return null;
  if (!Number.isFinite(data.est_cost_ngn) || !Number.isFinite(data.est_duration_minutes)) {
    throw new Error('The curated route contains invalid data.');
  }
  return data;
}

async function fetchDrivingDirections(origin: LngLat, destination: LngLat): Promise<MapboxDirectionsRoute> {
  const params = new URLSearchParams({
    access_token: getMapboxToken(),
    geometries: 'geojson',
    overview: 'full',
    steps: 'true',
  });
  const coordinates = `${origin.join(',')};${destination.join(',')}`;
  const response = await fetch(`${MAPBOX_DIRECTIONS_URL}/${coordinates}?${params.toString()}`);

  if (!response.ok) {
    let message: string | undefined;
    try {
      const body = await response.json() as { message?: string };
      message = body.message;
    } catch {
      // Preserve the HTTP error when Mapbox does not return JSON.
    }
    throw new Error(message
      ? `Mapbox request failed (${response.status}): ${message}`
      : `Mapbox request failed with HTTP ${response.status}.`);
  }

  const body = await response.json() as MapboxDirectionsResponse;
  if (body.code !== 'Ok' || !Array.isArray(body.routes) || body.routes.length === 0) {
    throw new Error(body.message ?? `Mapbox could not calculate a route (${body.code || 'unknown error'}).`);
  }

  const route = body.routes[0];
  if (
    route.geometry?.type !== 'LineString'
    || !Array.isArray(route.geometry.coordinates)
    || !Number.isFinite(route.distance)
    || !Number.isFinite(route.duration)
    || !Array.isArray(route.legs)
    || route.geometry.coordinates.some((coordinate) =>
      !Array.isArray(coordinate)
      || coordinate.length !== 2
      || coordinate.some((value) => !Number.isFinite(value)),
    )
    || route.legs.some((leg) => !Array.isArray(leg.steps))
  ) {
    throw new Error('Mapbox returned an invalid route response.');
  }
  for (const leg of route.legs) {
    for (const step of leg.steps) {
      if (
        !step.maneuver
        || typeof step.maneuver.instruction !== 'string'
        || typeof step.maneuver.type !== 'string'
        || !Number.isFinite(step.distance)
        || !Number.isFinite(step.duration)
        || typeof step.name !== 'string'
      ) {
        throw new Error('Mapbox returned invalid turn by turn directions.');
      }
    }
  }
  return route;
}

export async function calculateHybridLagosRoute(
  originCoords: LngLat,
  destinationCoords: LngLat,
  originName: string,
  destinationName: string,
): Promise<RouteResult> {
  validateCoordinates(originCoords, destinationCoords);
  const curatedRoute = await findCuratedRoute(originName, destinationName);
  const directions = await fetchDrivingDirections(originCoords, destinationCoords);
  const distanceKm = directions.distance / 1000;
  const durationMinutes = directions.duration / 60;
  const fareNgn = curatedRoute
    ? curatedRoute.est_cost_ngn
    : calculateLagosEstimatedFare(distanceKm, durationMinutes);
  const steps = directions.legs.flatMap((leg) => leg.steps).map((step) => ({
    instruction: step.maneuver.instruction,
    distanceMeters: step.distance,
    durationMinutes: step.duration / 60,
    maneuverType: step.maneuver.type,
    roadName: step.name,
  }));

  if (steps.some((step) => !step.instruction || !Number.isFinite(step.durationMinutes))) {
    throw new Error('Mapbox returned invalid turn by turn directions.');
  }

  return {
    originName,
    destinationName,
    distanceKm,
    durationMinutes,
    geometry: directions.geometry,
    steps,
    fareNgn,
    fareSource: curatedRoute ? 'database' : 'estimated',
    transportMode: curatedRoute?.mode ?? 'driving',
    title: curatedRoute?.title ?? `${originName} to ${destinationName}`,
  };
}
