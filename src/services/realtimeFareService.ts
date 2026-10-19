import { useEffect, useMemo, useState } from 'react';
import type { RealtimePostgresInsertPayload } from '@supabase/supabase-js';
import type { RouteOption, TransportMode } from '../types';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

const FARE_REPORT_WINDOW_MS = 4 * 60 * 60 * 1000;
const FARE_REPORT_SELECT = 'id, segment_id, route_title, mode, reported_fare, created_at';

export interface SubmitFareReportInput {
  segmentId?: string | null;
  routeTitle: string;
  mode: TransportMode;
  reportedFare: number;
}

interface FareReport {
  id: string;
  segment_id: string | null;
  route_title: string;
  mode: TransportMode;
  reported_fare: number;
  created_at: string;
}

export interface LiveFareUpdate {
  totalCostNgn: number;
  stepCosts: number[];
  updatedAt: string;
  minCostNgn: number;
  maxCostNgn: number;
  reportCount: number;
}

const transportModes: TransportMode[] = ['danfo', 'brt', 'keke', 'ferry', 'train', 'uber'];

function mapFareReport(value: unknown): FareReport {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Supabase returned an invalid fare report.');
  }

  const row = value as Record<string, unknown>;
  const fare = typeof row.reported_fare === 'number' || typeof row.reported_fare === 'string'
    ? Number(row.reported_fare)
    : Number.NaN;
  if (
    typeof row.id !== 'string'
    || (row.segment_id !== null && typeof row.segment_id !== 'string')
    || typeof row.route_title !== 'string'
    || !transportModes.includes(row.mode as TransportMode)
    || !Number.isFinite(fare)
    || fare <= 0
    || typeof row.created_at !== 'string'
    || !Number.isFinite(Date.parse(row.created_at))
  ) {
    throw new Error('Supabase returned invalid fare report details.');
  }

  return {
    id: row.id,
    segment_id: row.segment_id,
    route_title: row.route_title,
    mode: row.mode as TransportMode,
    reported_fare: fare,
    created_at: row.created_at,
  };
}

export async function submitFareReport({
  segmentId = null,
  routeTitle,
  mode,
  reportedFare,
}: SubmitFareReportInput): Promise<void> {
  if (!isSupabaseConfigured) {
    throw new Error('Fare reporting is unavailable because Supabase is not configured.');
  }
  if (!routeTitle.trim()) throw new Error('A route or corridor is required for a fare report.');
  if (!transportModes.includes(mode)) throw new Error('Choose a valid transport mode.');
  if (!Number.isFinite(reportedFare) || reportedFare <= 0) {
    throw new Error('Enter a fare greater than zero.');
  }

  const { error } = await supabase.from('fare_reports').insert({
    segment_id: segmentId,
    route_title: routeTitle.trim(),
    mode,
    reported_fare: reportedFare,
  });
  if (error) {
    throw new Error(`Could not submit fare report: ${error.message}`);
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function routeMatchesReport(route: RouteOption, report: FareReport): boolean {
  const titleMatches = route.title.trim().toLocaleLowerCase() === report.route_title.trim().toLocaleLowerCase();
  return route.steps.some((step) =>
    report.segment_id
      ? step.segmentId === report.segment_id
      : titleMatches && step.mode === report.mode,
  );
}

function buildFareUpdate(route: RouteOption, reports: FareReport[]): LiveFareUpdate | null {
  const stepReports = route.steps.map((step) => {
    const segmentReports = step.segmentId
      ? reports.filter((report) => report.segment_id === step.segmentId)
      : [];
    return segmentReports.length > 0
      ? segmentReports
      : reports.filter((report) =>
          report.segment_id === null
          && report.route_title.trim().toLocaleLowerCase() === route.title.trim().toLocaleLowerCase()
          && report.mode === step.mode,
        );
  });
  const stepCosts = route.steps.map((step, index) =>
    stepReports[index].length > 0
      ? median(stepReports[index].map((report) => report.reported_fare))
      : step.cost,
  );
  const applicableReports = reports.filter((report) => routeMatchesReport(route, report));
  if (applicableReports.length === 0) return null;
  const minCostNgn = route.steps.reduce((total, step, index) =>
    total + (stepReports[index].length > 0
      ? Math.min(...stepReports[index].map((report) => report.reported_fare))
      : step.cost), 0);
  const maxCostNgn = route.steps.reduce((total, step, index) =>
    total + (stepReports[index].length > 0
      ? Math.max(...stepReports[index].map((report) => report.reported_fare))
      : step.cost), 0);

  return {
    totalCostNgn: stepCosts.reduce((total, cost) => total + cost, 0),
    stepCosts,
    updatedAt: applicableReports.reduce((latest, report) =>
      Date.parse(report.created_at) > Date.parse(latest) ? report.created_at : latest,
    applicableReports[0].created_at),
    minCostNgn,
    maxCostNgn,
    reportCount: applicableReports.length,
  };
}

function parseRealtimeInsert(payload: RealtimePostgresInsertPayload<Record<string, unknown>>): FareReport {
  return mapFareReport(payload.new);
}

/**
 * Loads recent corridor prices and keeps them current from Realtime INSERT events.
 */
export function useLiveFareUpdates(routes: RouteOption[]): {
  updates: Record<string, LiveFareUpdate>;
  error: string;
} {
  const [reports, setReports] = useState<FareReport[]>([]);
  const [error, setError] = useState('');
  const routeKey = routes.map((route) =>
    `${route.id}:${route.title}:${route.steps.map((step) => `${step.segmentId ?? ''}:${step.mode}:${step.cost}`).join(',')}`,
  ).join('|');

  useEffect(() => {
    let active = true;
    setReports([]);
    setError('');
    if (!isSupabaseConfigured || routes.length === 0) return () => { active = false; };

    const channel = supabase
      .channel('public:fare_reports')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'fare_reports' },
        (payload) => {
          try {
            const report = parseRealtimeInsert(payload as RealtimePostgresInsertPayload<Record<string, unknown>>);
            if (!routes.some((route) => routeMatchesReport(route, report))) return;
            setReports((current) => [
              report,
              ...current.filter((existing) => existing.id !== report.id),
            ]);
            setError('');
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Received an invalid live fare update.');
          }
        },
      )
      .subscribe((status) => {
        if (!active) return;
        if (status === 'SUBSCRIBED') setError('');
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setError('Live fare updates are temporarily unavailable.');
        }
      });

    const loadRecentReports = async () => {
      const cutoff = new Date(Date.now() - FARE_REPORT_WINDOW_MS).toISOString();
      const { data, error: queryError } = await supabase
        .from('fare_reports')
        .select(FARE_REPORT_SELECT)
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(1000);
      if (!active) return;
      if (queryError) {
        setError(`Could not load recent fare reports: ${queryError.message}`);
        return;
      }
      try {
        const recentReports = (data ?? []).map(mapFareReport);
        setReports((current) => {
          const byId = new Map(recentReports.map((report) => [report.id, report]));
          current.forEach((report) => byId.set(report.id, report));
          return [...byId.values()].filter((report) =>
            Date.now() - Date.parse(report.created_at) < FARE_REPORT_WINDOW_MS,
          );
        });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not read recent fare reports.');
      }
    };
    void loadRecentReports();

    const expiryTimer = window.setInterval(() => {
      setReports((current) => current.filter((report) =>
        Date.now() - Date.parse(report.created_at) < FARE_REPORT_WINDOW_MS,
      ));
    }, 60_000);

    return () => {
      active = false;
      window.clearInterval(expiryTimer);
      void supabase.removeChannel(channel);
    };
  }, [routeKey, routes]);

  const updates = useMemo(() => {
    const now = Date.now();
    const recentReports = reports.filter((report) =>
      now - Date.parse(report.created_at) < FARE_REPORT_WINDOW_MS,
    );
    return Object.fromEntries(routes.flatMap((route) => {
      const update = buildFareUpdate(route, recentReports);
      return update ? [[route.id, update]] : [];
    }));
  }, [reports, routeKey, routes]);

  return { updates, error };
}
