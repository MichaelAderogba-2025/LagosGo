import { isSupabaseConfigured, supabase } from '../lib/supabase';

export type LngLat = [longitude: number, latitude: number];

export interface GeocodingSuggestion {
  id: string;
  name: string;
  area: string;
  address: string;
  latitude: number;
  longitude: number;
  coordinates: LngLat;
  source: 'database' | 'mapbox';
}

interface LocationRpcRow {
  id: string;
  name: string;
  area: string;
  address: string;
  latitude: number;
  longitude: number;
}

interface MapboxContext {
  id: string;
  text: string;
}

interface MapboxFeature {
  id: string;
  text: string;
  place_name: string;
  center: LngLat;
  context?: MapboxContext[];
}

interface MapboxGeocodingResponse {
  features: MapboxFeature[];
}

const MAPBOX_GEOCODING_URL = 'https://api.mapbox.com/geocoding/v5/mapbox.places';
const LAGOS_BOUNDS = '2.68,6.38,3.70,6.72';
const LOCATION_SEARCH_LIMIT = 5;

function getMapboxToken(): string {
  const token = import.meta.env.VITE_MAPBOX_TOKEN?.trim();
  if (!token) {
    throw new Error('Mapbox is not configured. Add VITE_MAPBOX_TOKEN to your .env.local file.');
  }
  return token;
}

function mapMapboxFeature(feature: MapboxFeature): GeocodingSuggestion {
  const [longitude, latitude] = feature.center;
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    throw new Error(`Mapbox returned invalid coordinates for "${feature.place_name}".`);
  }

  return {
    id: `mapbox:${feature.id}`,
    name: feature.text,
    area: feature.context?.find((entry) =>
      /^(place|locality|district|region)\./.test(entry.id),
    )?.text ?? 'Lagos',
    address: feature.place_name,
    latitude,
    longitude,
    coordinates: [longitude, latitude],
    source: 'mapbox',
  };
}

function mapDatabaseLocation(row: LocationRpcRow): GeocodingSuggestion {
  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error(`Location "${row.name}" has invalid coordinates in the database.`);
  }
  return {
    id: row.id,
    name: row.name,
    area: row.area,
    address: row.address,
    latitude,
    longitude,
    coordinates: [longitude, latitude],
    source: 'database',
  };
}

async function searchDatabase(query: string): Promise<GeocodingSuggestion[]> {
  if (!isSupabaseConfigured) return [];

  const { data, error } = await supabase.rpc('search_lagos_locations', {
    search_text: query,
    limit_val: LOCATION_SEARCH_LIMIT,
  });
  if (error) {
    throw new Error(`Could not search saved Lagos locations: ${error.message}`);
  }
  return ((data ?? []) as LocationRpcRow[]).map(mapDatabaseLocation);
}

function isWithinLagosBounds([longitude, latitude]: LngLat): boolean {
  return longitude >= 2.68 && longitude <= 3.70 && latitude >= 6.38 && latitude <= 6.72;
}

/**
 * Search saved Lagos locations and Mapbox places. Coordinates use [longitude, latitude].
 */
export async function searchLagosPlaces(query: string): Promise<GeocodingSuggestion[]> {
  const searchText = query.trim();
  if (!searchText) return [];

  const params = new URLSearchParams({
    access_token: getMapboxToken(),
    country: 'NG',
    bbox: LAGOS_BOUNDS,
    limit: String(LOCATION_SEARCH_LIMIT),
    autocomplete: 'true',
  });
  const response = await fetch(
    `${MAPBOX_GEOCODING_URL}/${encodeURIComponent(searchText)}.json?${params.toString()}`,
  );

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

  const body = await response.json() as MapboxGeocodingResponse;
  if (!Array.isArray(body.features)) {
    throw new Error('Mapbox returned an invalid geocoding response.');
  }

  const [databaseLocations, mapboxLocations] = await Promise.all([
    searchDatabase(searchText),
    Promise.resolve(body.features.map(mapMapboxFeature)),
  ]);
  const merged = new Map<string, GeocodingSuggestion>();
  for (const location of [...databaseLocations, ...mapboxLocations]) {
    if (!isWithinLagosBounds(location.coordinates)) continue;
    const key = `${location.coordinates[0].toFixed(5)},${location.coordinates[1].toFixed(5)}`;
    if (!merged.has(key)) merged.set(key, location);
  }
  return [...merged.values()];
}
