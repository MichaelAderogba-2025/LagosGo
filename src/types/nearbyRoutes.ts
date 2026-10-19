import type { TransportMode } from './index';

export interface NearbyRoute {
  route_id: string;
  route_name: string;
  route_code: string | null;
  transport_mode: TransportMode;
  nearby_stop_name: string;
  stop_area: string;
  stop_sequence: number;
  distance_to_stop_meters: number;
}
