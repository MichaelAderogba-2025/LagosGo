import { useEffect } from 'react';
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import { Layers, Map, Navigation, Route as RouteIcon } from 'lucide-react';
import type { RouteResult } from '../services/routingService';
import type { RouteStop } from '../types';

interface MapViewProps {
  stops: RouteStop[];
  route: RouteResult | null;
  loading?: boolean;
  error?: string;
}

const lagosCenter: [number, number] = [6.5244, 3.3792];

function MapViewport({ stops, route }: Pick<MapViewProps, 'stops' | 'route'>) {
  const map = useMap();

  useEffect(() => {
    const positions: [number, number][] = stops.map((stop) => stop.location);
    if (route) {
      positions.push(...route.geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude] as [number, number]));
    }

    if (positions.length > 1) {
      map.fitBounds(positions, { padding: [36, 36], maxZoom: 14 });
    } else if (positions.length === 1) {
      map.setView(positions[0], 14);
    } else {
      map.setView(lagosCenter, 11);
    }
  }, [map, route, stops]);

  return null;
}

export function MapView({ stops, route, loading = false, error = '' }: MapViewProps) {
  const line = route?.geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude] as [number, number]) ?? [];

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-emerald-50 p-2 text-emerald-700"><Map className="h-4 w-4" /></span>
          <div>
            <h2 className="text-xs font-bold text-slate-900">Lagos journey map</h2>
            <p className="text-[10px] text-slate-500">OpenStreetMap · Mapbox Directions</p>
          </div>
        </div>
        <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${route ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
          {loading ? <Navigation className="h-3 w-3 animate-pulse" /> : route ? <RouteIcon className="h-3 w-3" /> : <Layers className="h-3 w-3" />}
          {loading ? 'Calculating route' : route ? `${route.distanceKm.toFixed(1)} km · ${(route.durationMinutes).toFixed(0)} min` : 'Search a journey'}
        </span>
      </div>

      <div className="relative h-[340px]">
        <MapContainer
          center={lagosCenter}
          zoom={11}
          scrollWheelZoom
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapViewport stops={stops} route={route} />
          {line.length > 1 && (
            <Polyline positions={line} pathOptions={{ color: '#059669', weight: 6, opacity: 0.9 }} />
          )}
          {stops.map((stop, index) => (
            <CircleMarker
              key={stop.id}
              center={stop.location}
              radius={9}
              pathOptions={{
                color: '#ffffff',
                weight: 3,
                fillColor: index === 0 ? '#059669' : '#ef4444',
                fillOpacity: 1,
              }}
            >
              <Popup>
                <strong>{index === 0 ? 'Origin' : 'Destination'}:</strong> {stop.name}
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>

        {!route && !loading && stops.length === 0 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 z-[500] flex justify-center">
            <span className="rounded-full bg-slate-950/85 px-3 py-1.5 text-[10px] font-medium text-white shadow">Search for two places to plot your driving route</span>
          </div>
        )}
        {error && (
          <div role="alert" className="absolute inset-x-3 bottom-3 z-[500] rounded-lg border border-red-200 bg-white/95 px-3 py-2 text-xs text-red-800 shadow">
            {error}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-2.5 text-[10px] text-slate-500">
        <span>{stops.length === 2 ? `${stops[0].name} → ${stops[1].name}` : 'Lagos metropolitan area'}</span>
        <span className="flex shrink-0 items-center gap-1"><Layers className="h-3 w-3" />Drag to pan · scroll to zoom</span>
      </div>
    </section>
  );
}
