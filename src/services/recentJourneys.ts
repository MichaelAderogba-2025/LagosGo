import type { GeocodingSuggestion } from './geocodingService';
import type { RouteResult } from './routingService';
import type { RouteOption } from '../types';

export interface RecentJourney {
  savedAt: string;
  origin: GeocodingSuggestion;
  destination: GeocodingSuggestion;
  drivingRoute: RouteResult;
  transitRoutes: RouteOption[];
}

const storageKey = (userId?: string) => `lagosgo:recent-journeys:v1:${userId ?? 'guest'}`;
const MAX_RECENT_JOURNEYS = 5;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTransportMode(value: unknown): boolean {
  return typeof value === 'string' && ['brt', 'danfo', 'keke', 'ferry', 'train', 'uber'].includes(value);
}

function isSuggestion(value: unknown): value is GeocodingSuggestion {
  if (!isRecord(value) || !Array.isArray(value.coordinates)) return false;
  return typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.area === 'string'
    && typeof value.address === 'string'
    && typeof value.latitude === 'number'
    && Number.isFinite(value.latitude)
    && value.latitude >= -90
    && value.latitude <= 90
    && typeof value.longitude === 'number'
    && Number.isFinite(value.longitude)
    && value.longitude >= -180
    && value.longitude <= 180
    && value.coordinates.length === 2
    && value.coordinates.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))
    && (value.source === 'database' || value.source === 'mapbox');
}

function isRouteOption(value: unknown): value is RouteOption {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && isTransportMode(value.mode)
    && (value.dataQuality === 'curated' || value.dataQuality === 'estimate')
    && (value.timeBasis === 'transit-estimate' || value.timeBasis === 'driving-proxy')
    && (value.fareBasis === 'baseline' || value.fareBasis === 'estimate' || value.fareBasis === 'community')
    && typeof value.startPoint === 'string'
    && typeof value.endPoint === 'string'
    && typeof value.totalTimeMinutes === 'number'
    && Number.isFinite(value.totalTimeMinutes)
    && value.totalTimeMinutes >= 0
    && typeof value.totalCostNgn === 'number'
    && Number.isFinite(value.totalCostNgn)
    && value.totalCostNgn >= 0
    && ['low', 'moderate', 'heavy', 'gridlock', 'unknown'].includes(String(value.trafficStatus))
    && typeof value.transfersCount === 'number'
    && Number.isInteger(value.transfersCount)
    && value.transfersCount >= 0
    && Array.isArray(value.steps)
    && value.steps.every((step) => isRecord(step)
      && typeof step.instruction === 'string'
      && isTransportMode(step.mode)
      && typeof step.duration === 'number'
      && Number.isFinite(step.duration)
      && step.duration >= 0
      && typeof step.cost === 'number'
      && Number.isFinite(step.cost)
      && step.cost >= 0
      && (step.stopName === undefined || typeof step.stopName === 'string')
      && (step.segmentId === undefined || typeof step.segmentId === 'string'));
}

function isDrivingRoute(value: unknown): value is RouteResult {
  return isRecord(value)
    && typeof value.originName === 'string'
    && typeof value.destinationName === 'string'
    && typeof value.distanceKm === 'number'
    && Number.isFinite(value.distanceKm)
    && value.distanceKm >= 0
    && typeof value.durationMinutes === 'number'
    && Number.isFinite(value.durationMinutes)
    && value.durationMinutes >= 0
    && isRecord(value.geometry)
    && value.geometry.type === 'LineString'
    && Array.isArray(value.geometry.coordinates)
    && value.geometry.coordinates.every((point) => Array.isArray(point)
      && point.length === 2
      && point.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate)))
    && Array.isArray(value.steps)
    && value.steps.every((step) => isRecord(step)
      && typeof step.instruction === 'string'
      && typeof step.distanceMeters === 'number'
      && Number.isFinite(step.distanceMeters)
      && typeof step.durationMinutes === 'number'
      && Number.isFinite(step.durationMinutes)
      && typeof step.maneuverType === 'string'
      && typeof step.roadName === 'string')
    && typeof value.fareNgn === 'number'
    && Number.isFinite(value.fareNgn)
    && value.fareNgn >= 0
    && (value.fareSource === 'database' || value.fareSource === 'estimated')
    && typeof value.transportMode === 'string'
    && typeof value.title === 'string';
}

function isRecentJourney(value: unknown): value is RecentJourney {
  return isRecord(value)
    && typeof value.savedAt === 'string'
    && Number.isFinite(Date.parse(value.savedAt))
    && isSuggestion(value.origin)
    && isSuggestion(value.destination)
    && isDrivingRoute(value.drivingRoute)
    && Array.isArray(value.transitRoutes)
    && value.transitRoutes.every(isRouteOption);
}

export function readRecentJourneys(userId?: string): { journeys: RecentJourney[]; error: string } {
  try {
    const stored = localStorage.getItem(storageKey(userId));
    if (!stored) return { journeys: [], error: '' };
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed) || !parsed.every(isRecentJourney)) {
      return { journeys: [], error: 'Your recent-trip cache is invalid and could not be loaded.' };
    }
    return { journeys: parsed.slice(0, MAX_RECENT_JOURNEYS), error: '' };
  } catch (cause) {
    return {
      journeys: [],
      error: cause instanceof Error ? `Could not load recent trips from this device: ${cause.message}` : 'Could not load recent trips from this device.',
    };
  }
}

export function cacheRecentJourney(journey: RecentJourney, userId?: string): { journeys: RecentJourney[]; error: string } {
  const current = readRecentJourneys(userId);
  if (current.error) return { journeys: current.journeys, error: current.error };
  const next = [
    journey,
    ...current.journeys.filter((item) =>
      item.origin.id !== journey.origin.id || item.destination.id !== journey.destination.id,
    ),
  ].slice(0, MAX_RECENT_JOURNEYS);
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(next));
    return { journeys: next, error: '' };
  } catch (cause) {
    return {
      journeys: current.journeys,
      error: cause instanceof Error ? `Could not cache this journey on your device: ${cause.message}` : 'Could not cache this journey on your device.',
    };
  }
}
