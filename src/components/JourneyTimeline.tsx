import React from 'react';
import { CheckCircle2, MapPin, Navigation } from 'lucide-react';
import type { RouteResult } from '../services/routingService';
import type { RouteOption } from '../types';
import { formatCurrency } from '../lib/utils';

interface JourneyTimelineProps {
  route: RouteResult | RouteOption;
}

export const JourneyTimeline: React.FC<JourneyTimelineProps> = ({ route }) => {
  const isCalculatedRoute = 'fareSource' in route;
  const originName = isCalculatedRoute ? route.originName : route.startPoint;
  const destinationName = isCalculatedRoute ? route.destinationName : route.endPoint;
  const fareNgn = isCalculatedRoute ? route.fareNgn : route.totalCostNgn;
  const fareLabel = isCalculatedRoute
    ? route.fareSource === 'database' ? 'Curated rate' : 'Driving fare estimate'
    : route.fareBasis === 'baseline' ? 'Transit baseline' : route.fareBasis === 'estimate' ? 'Rough estimate' : 'Community fare';

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-md font-bold text-slate-900 mb-1">{isCalculatedRoute ? 'Turn by turn directions' : route.title}</h3>
          <p className="text-xs text-slate-500 mb-6">Directions from {originName} to {destinationName}</p>
        </div>
        <div className="shrink-0 text-right">
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${fareLabel === 'Transit baseline' || fareLabel === 'Community fare' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
            {fareLabel}
          </span>
          <p className="mt-2 text-sm font-bold text-slate-900">{formatCurrency(fareNgn)}</p>
          <p className="text-[10px] text-slate-500">Estimated transport fare</p>
        </div>
      </div>

      <div className="relative pl-6 border-l-2 border-emerald-500 space-y-6">
        <div className="relative">
          <div className="absolute -left-[31px] top-0 bg-emerald-600 text-white rounded-full p-1">
            <MapPin className="w-3.5 h-3.5" />
          </div>
          <p className="text-xs font-bold uppercase text-emerald-600 tracking-wider">Start</p>
          <p className="text-sm font-semibold text-slate-800">{originName}</p>
        </div>

        {isCalculatedRoute ? route.steps.map((step, index) => (
          <div key={index} className="relative">
            <div className="absolute -left-[31px] top-0 bg-slate-900 text-yellow-400 rounded-full p-1">
              <Navigation className="w-3.5 h-3.5" />
            </div>
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
              <div className="flex justify-between items-start">
                <span className="text-xs font-bold uppercase text-slate-500">{step.maneuverType.replace(/_/g, ' ')}</span>
                <span className="text-xs font-semibold text-slate-700">
                  {step.distanceMeters >= 1000 ? `${(step.distanceMeters / 1000).toFixed(1)} km` : `${Math.round(step.distanceMeters)} m`}
                </span>
              </div>
              <p className="text-sm text-slate-800 font-medium mt-1">{step.instruction}</p>
              {step.roadName && <span className="text-xs text-slate-500 mt-2 block">{step.roadName}</span>}
              <span className="text-xs text-slate-500 mt-2 block">About {step.durationMinutes.toFixed(0)} minutes</span>
            </div>
          </div>
        )) : route.steps.map((step, index) => (
          <div key={`${route.id}:${index}`} className="relative">
            <div className="absolute -left-[31px] top-0 bg-slate-900 text-yellow-400 rounded-full p-1">
              <Navigation className="w-3.5 h-3.5" />
            </div>
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
              <div className="flex justify-between items-start">
                <span className="text-xs font-bold uppercase text-slate-500">{step.mode} segment</span>
                <span className="text-xs font-semibold text-slate-700">{formatCurrency(step.cost)}</span>
              </div>
              <p className="text-sm text-slate-800 font-medium mt-1">{step.instruction}</p>
              {step.stopName && <span className="text-xs text-slate-500 mt-2 block">{step.stopName}</span>}
              <span className="text-xs text-slate-500 mt-2 block">
                {route.timeBasis === 'driving-proxy'
                  ? 'Driving estimate, not transit time'
                  : `About ${step.duration} minutes (transit estimate)`}
              </span>
            </div>
          </div>
        ))}

        <div className="relative">
          <div className="absolute -left-[31px] top-0 bg-emerald-600 text-white rounded-full p-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
          </div>
          <p className="text-xs font-bold uppercase text-emerald-600 tracking-wider">Destination</p>
          <p className="text-sm font-semibold text-slate-800">{destinationName}</p>
        </div>
      </div>
    </div>
  );
};
