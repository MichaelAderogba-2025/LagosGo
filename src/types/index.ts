export type TransportMode = 'brt' | 'danfo' | 'keke' | 'ferry' | 'train' | 'uber';

export interface RouteStop {
  id: string;
  name: string;
  location: [number, number]; // [latitude, longitude]
  estimatedTimeMinutes: number;
}

export interface RouteOption {
  id: string;
  title: string;
  mode: TransportMode;
  dataQuality: 'curated' | 'estimate';
  timeBasis: 'transit-estimate' | 'driving-proxy';
  fareBasis: 'baseline' | 'estimate' | 'community';
  startPoint: string;
  endPoint: string;
  totalTimeMinutes: number;
  totalCostNgn: number;
  trafficStatus: 'low' | 'moderate' | 'heavy' | 'gridlock' | 'unknown';
  transfersCount: number;
  steps: {
    instruction: string;
    mode: TransportMode;
    duration: number;
    cost: number;
    stopName?: string;
    segmentId?: string;
  }[];
}

export interface IncidentReport {
  id: string;
  location: string;
  issueType: 'traffic' | 'brt_queue' | 'fare_hike' | 'roadblock';
  description: string;
  createdAt: string;
  upvotes: number;
}
