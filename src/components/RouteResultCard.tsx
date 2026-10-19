import React, { useEffect, useState } from 'react';
import type { RouteOption } from '../types';
import { Clock, Wallet, ChevronRight, Plus } from 'lucide-react';
import { formatCurrency } from '../lib/utils';
import { SubmitFareModal } from './SubmitFareModal';

interface RouteResultCardProps {
  route: RouteOption;
  isSelected: boolean;
  onSelect: () => void;
  onViewSteps: () => void;
  liveFareUpdatedAt?: string;
  liveFareRange?: { min: number; max: number; reportCount: number };
  onFareModalOpenChange?: (isOpen: boolean) => void;
  canReportFare?: boolean;
  onSignIn?: () => void;
}

export const RouteResultCard: React.FC<RouteResultCardProps> = ({
  route,
  isSelected,
  onSelect,
  onViewSteps,
  liveFareUpdatedAt,
  liveFareRange,
  onFareModalOpenChange,
  canReportFare = true,
  onSignIn,
}) => {
  const [showFareModal, setShowFareModal] = useState(false);
  const [now, setNow] = useState(Date.now());

  const closeFareModal = () => {
    setShowFareModal(false);
    onFareModalOpenChange?.(false);
  };

  useEffect(() => {
    if (!liveFareUpdatedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [liveFareUpdatedAt]);

  const getTrafficColor = (status: RouteOption['trafficStatus']) => {
    switch (status) {
      case 'low': return 'bg-emerald-100 text-emerald-800';
      case 'moderate': return 'bg-yellow-100 text-yellow-800';
      case 'heavy': return 'bg-orange-100 text-orange-800';
      case 'gridlock': return 'bg-red-100 text-red-800';
      case 'unknown': return 'bg-slate-100 text-slate-600';
    }
  };

  return (
    <div
      onClick={onSelect}
      className={`border rounded-xl p-4 transition-all cursor-pointer mb-3 ${
        isSelected ? 'border-emerald-600 bg-emerald-50/40 ring-2 ring-emerald-600/20' : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
    >
      <div className="flex justify-between items-start">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{route.mode.toUpperCase()} ROUTE</span>
          <h3 className="text-base font-bold text-slate-900 mt-0.5">{route.title}</h3>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${getTrafficColor(route.trafficStatus)}`}>
          {route.trafficStatus === 'unknown' ? 'TRAFFIC NOT LIVE' : `${route.trafficStatus.toUpperCase()} TRAFFIC`}
        </span>
      </div>

      <div className={`mt-3 rounded-lg px-3 py-2 text-xs leading-5 ${route.dataQuality === 'estimate' ? 'border border-amber-200 bg-amber-50 text-amber-900' : 'border border-emerald-100 bg-emerald-50 text-emerald-900'}`}>
        {route.dataQuality === 'estimate'
          ? 'No mapped public-transport path is available. Time is a driving estimate, not a transit ETA; fare is a rough distance-based estimate.'
          : 'Listed in the curated transit network. Journey times and fares are estimates and may be outdated.'}
      </div>

      <div className="flex items-center space-x-6 mt-4 text-sm text-slate-600">
        <div className="flex items-center space-x-1.5">
          <Clock className="w-4 h-4 text-slate-400" />
          <span className="font-semibold text-slate-800">~{route.totalTimeMinutes} min {route.timeBasis === 'driving-proxy' ? 'driving proxy' : 'transit estimate'}</span>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          {route.fareBasis === 'community'
            ? `Recent community fare · ${liveFareRange?.reportCount ?? 1} report${(liveFareRange?.reportCount ?? 1) === 1 ? '' : 's'}`
            : route.fareBasis === 'baseline'
              ? 'Configured transit baseline; confirm locally'
              : 'Rough distance-based fare estimate'}
          {liveFareRange && liveFareRange.max > liveFareRange.min
            ? ` · reported range ${formatCurrency(liveFareRange.min)}–${formatCurrency(liveFareRange.max)}`
            : ''}
        </p>
        <div className="flex items-center space-x-1.5">
          <Wallet className="w-4 h-4 text-slate-400" />
          <span className="font-semibold text-slate-800">{formatCurrency(route.totalCostNgn)}</span>
        </div>
        {liveFareUpdatedAt && (
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-800">
            LIVE PRICE · {Math.max(0, Math.floor((now - Date.parse(liveFareUpdatedAt)) / 60_000))} MIN AGO
          </span>
        )}
        <div className="text-xs text-slate-500">
          {route.transfersCount === 0 ? 'Direct Route' : `${route.transfersCount} Transfer(s)`}
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center space-x-2">
          {route.steps.map((step, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && <span className="text-slate-300">→</span>}
              <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-700 font-medium">
                {step.mode.toUpperCase()}
              </span>
            </React.Fragment>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {canReportFare ? <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setShowFareModal(true);
              onFareModalOpenChange?.(true);
            }}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold text-emerald-700 hover:bg-emerald-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Report fare
          </button> : onSignIn ? (
            <button type="button" onClick={(event) => { event.stopPropagation(); onSignIn(); }} className="rounded-md px-2 py-1 font-semibold text-emerald-700 hover:bg-emerald-50">
              Sign in to report fare
            </button>
          ) : null}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onSelect();
              onViewSteps();
            }}
            className="inline-flex items-center text-emerald-600 font-medium space-x-0.5"
          >
            <span>View Steps</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      {showFareModal && <SubmitFareModal route={route} onClose={closeFareModal} />}
    </div>
  );
};
