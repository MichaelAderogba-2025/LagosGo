import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Activity, AlertTriangle, ArrowDownLeft, Bus, Check, Clock3, DollarSign, LayoutDashboard,
  LogOut, MapPin, Plus, Route, ShieldCheck, Trash2, Users,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/utils';
import type { TransportMode } from '../types';

type AdminReport = {
  id: string;
  location: string;
  issue_type: string;
  description: string;
  created_at: string;
  upvotes: number;
  status: string;
};

type AdminRoute = {
  id: string;
  title: string;
  origin: string;
  destination: string;
  mode: string;
  est_duration_minutes: number;
  est_cost_ngn: number;
  traffic_level: string | null;
};

type AdminStop = {
  id: string;
  name: string;
  area: string;
  latitude: number;
  longitude: number;
  is_major_hub: boolean;
};

type AdminSegment = {
  id: string;
  mode: TransportMode;
  origin_stop_id: string;
  destination_stop_id: string;
  base_fare: number;
  est_duration_mins: number;
};

type AdminFareReport = {
  id: string;
  segment_id: string | null;
  route_title: string;
  mode: TransportMode;
  reported_fare: number;
  created_at: string;
};

type AdminCoverageRequest = {
  id: string;
  origin_area: string;
  destination_area: string;
  status: 'open' | 'covered' | 'closed';
  created_at: string;
};

type ProductMetric = {
  event_name: string;
  total: number;
};

type CoverageDemand = {
  origin_area: string;
  destination_area: string;
  request_count: number;
  latest_request: string;
};

interface AdminDashboardProps {
  adminName: string;
  onSignOut: () => void;
}

const routeModes: TransportMode[] = ['brt', 'danfo', 'keke', 'ferry', 'train', 'uber'];

export function AdminDashboard({ adminName, onSignOut }: AdminDashboardProps) {
  const [section, setSection] = useState<'overview' | 'routes' | 'network' | 'reports' | 'fares' | 'coverage'>('overview');
  const [routeCount, setRouteCount] = useState(0);
  const [userCount, setUserCount] = useState(0);
  const [pendingReportCount, setPendingReportCount] = useState(0);
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [routes, setRoutes] = useState<AdminRoute[]>([]);
  const [stops, setStops] = useState<AdminStop[]>([]);
  const [segments, setSegments] = useState<AdminSegment[]>([]);
  const [fareReports, setFareReports] = useState<AdminFareReport[]>([]);
  const [coverageRequests, setCoverageRequests] = useState<AdminCoverageRequest[]>([]);
  const [coverageDemand, setCoverageDemand] = useState<CoverageDemand[]>([]);
  const [productMetrics, setProductMetrics] = useState<ProductMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [showRouteForm, setShowRouteForm] = useState(false);
  const [editingRouteId, setEditingRouteId] = useState('');
  const [editingStopId, setEditingStopId] = useState('');
  const [showStopForm, setShowStopForm] = useState(false);
  const [showSegmentForm, setShowSegmentForm] = useState(false);
  const [stopDraft, setStopDraft] = useState({
    name: '', area: '', latitude: '', longitude: '', isMajorHub: false,
  });
  const [segmentDraft, setSegmentDraft] = useState({
    originStopId: '', destinationStopId: '', mode: 'danfo' as TransportMode,
    duration: '', fare: '',
  });
  const [baselineDrafts, setBaselineDrafts] = useState<Record<string, string>>({});
  const [newRoute, setNewRoute] = useState({
    title: '',
    origin: '',
    destination: '',
    mode: 'brt' as TransportMode,
    duration: '',
    fare: '',
  });

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    const [routesResult, usersResult, pendingResult, reportsResult, routeListResult, stopsResult, segmentsResult, faresResult, coverageResult, coverageDemandResult, metricsResult] = await Promise.all([
      supabase.from('routes').select('id', { count: 'exact', head: true }),
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase
        .from('reports')
        .select('id, location, issue_type, description, created_at, upvotes, status', { count: 'exact' })
        .order('created_at', { ascending: false })
        .limit(8),
      supabase
        .from('routes')
        .select('id, title, origin, destination, mode, est_duration_minutes, est_cost_ngn, traffic_level')
        .order('created_at', { ascending: false })
        .limit(8),
      supabase
        .from('transit_stops')
        .select('id, name, area, latitude, longitude, is_major_hub')
        .order('area')
        .order('name')
        .limit(500),
      supabase
        .from('transit_segments')
        .select('id, mode, origin_stop_id, destination_stop_id, base_fare, est_duration_mins')
        .order('mode')
        .limit(500),
      supabase
        .from('fare_reports')
        .select('id, segment_id, route_title, mode, reported_fare, created_at')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('route_coverage_requests')
        .select('id, origin_area, destination_area, status, created_at')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.rpc('get_coverage_demand'),
      supabase.rpc('get_product_metrics'),
    ]);

    const failed = [
      routesResult.error,
      usersResult.error,
      pendingResult.error,
      reportsResult.error,
      routeListResult.error,
      stopsResult.error,
      segmentsResult.error,
      faresResult.error,
      coverageResult.error,
      coverageDemandResult.error,
      metricsResult.error,
    ].find(Boolean);
    if (failed) {
      setError(`Could not load the admin dashboard: ${failed.message}`);
    } else {
      setRouteCount(routesResult.count ?? 0);
      setUserCount(usersResult.count ?? 0);
      setPendingReportCount(pendingResult.count ?? 0);
      setReports((reportsResult.data ?? []) as AdminReport[]);
      setRoutes((routeListResult.data ?? []) as AdminRoute[]);
      setStops((stopsResult.data ?? []) as AdminStop[]);
      setSegments((segmentsResult.data ?? []) as AdminSegment[]);
      setFareReports((faresResult.data ?? []) as AdminFareReport[]);
      setCoverageRequests((coverageResult.data ?? []) as AdminCoverageRequest[]);
      setCoverageDemand((coverageDemandResult.data ?? []) as CoverageDemand[]);
      setProductMetrics((metricsResult.data ?? []) as ProductMetric[]);
    }
    setLoading(false);
  }, []);

  const handleCoverageStatus = async (request: AdminCoverageRequest, status: AdminCoverageRequest['status']) => {
    setBusyId(request.id);
    setError('');
    const { error: updateError } = await supabase
      .from('route_coverage_requests')
      .update({ status })
      .eq('id', request.id);
    if (updateError) {
      setError(`Could not update this coverage request: ${updateError.message}`);
    } else {
      setCoverageRequests((current) => current.map((item) =>
        item.id === request.id ? { ...item, status } : item,
      ));
    }
    setBusyId('');
  };

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const handleReportStatus = async (report: AdminReport) => {
    const status = report.status === 'approved' ? 'pending' : 'approved';
    setBusyId(report.id);
    setError('');
    const { error: updateError } = await supabase
      .from('reports')
      .update({ status, reviewed_at: status === 'approved' ? new Date().toISOString() : null })
      .eq('id', report.id);
    if (updateError) {
      setError(`Could not update the report: ${updateError.message}`);
    } else {
      setReports((current) => current.map((item) => item.id === report.id ? { ...item, status } : item));
      if (report.status === 'pending' && status !== 'pending') {
        setPendingReportCount((count) => Math.max(0, count - 1));
      } else if (report.status !== 'pending' && status === 'pending') {
        setPendingReportCount((count) => count + 1);
      }
    }
    setBusyId('');
  };

  const handleDeleteReport = async (reportId: string) => {
    if (!window.confirm('Delete this community report permanently?')) return;
    setBusyId(reportId);
    setError('');
    const { error: deleteError } = await supabase.from('reports').delete().eq('id', reportId);
    if (deleteError) {
      setError(`Could not delete the community report: ${deleteError.message}`);
    } else {
      const removedReport = reports.find((report) => report.id === reportId);
      setReports((current) => current.filter((report) => report.id !== reportId));
      if (removedReport && removedReport.status !== 'resolved') {
        setPendingReportCount((count) => Math.max(0, count - 1));
      }
    }
    setBusyId('');
  };

  const handleDeleteFareReport = async (reportId: string) => {
    if (!window.confirm('Remove this fare submission from the crowdsource data?')) return;
    setBusyId(reportId);
    setError('');
    const { error: deleteError } = await supabase.from('fare_reports').delete().eq('id', reportId);
    if (deleteError) {
      setError(`Could not remove the fare submission: ${deleteError.message}`);
    } else {
      setFareReports((current) => current.filter((report) => report.id !== reportId));
    }
    setBusyId('');
  };

  const handleSaveStop = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const latitude = Number(stopDraft.latitude);
    const longitude = Number(stopDraft.longitude);
    if (
      !Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
    ) {
      setError('Enter valid latitude and longitude coordinates.');
      return;
    }

    setBusyId('stop');
    setError('');
    const values = {
      name: stopDraft.name.trim(),
      area: stopDraft.area.trim(),
      latitude,
      longitude,
      is_major_hub: stopDraft.isMajorHub,
    };
    const result = editingStopId
      ? await supabase.from('transit_stops').update(values).eq('id', editingStopId)
      : await supabase.from('transit_stops').insert(values);
    if (result.error) {
      setError(`Could not save the transit stop: ${result.error.message}`);
    } else {
      setStopDraft({ name: '', area: '', latitude: '', longitude: '', isMajorHub: false });
      setEditingStopId('');
      setShowStopForm(false);
      await loadDashboard();
    }
    setBusyId('');
  };

  const handleDeleteStop = async (stop: AdminStop) => {
    if (!window.confirm(`Delete ${stop.name}? Transit segments attached to it will also be deleted.`)) return;
    setBusyId(stop.id);
    setError('');
    const { error: deleteError } = await supabase.from('transit_stops').delete().eq('id', stop.id);
    if (deleteError) {
      setError(`Could not delete the transit stop: ${deleteError.message}`);
    } else {
      await loadDashboard();
    }
    setBusyId('');
  };

  const handleCreateSegment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const duration = Number(segmentDraft.duration);
    const fare = Number(segmentDraft.fare);
    if (
      !segmentDraft.originStopId
      || !segmentDraft.destinationStopId
      || segmentDraft.originStopId === segmentDraft.destinationStopId
      || !Number.isInteger(duration) || duration < 1
      || !Number.isFinite(fare) || fare < 0
    ) {
      setError('Choose different origin and destination stops, a positive duration, and a non-negative fare.');
      return;
    }

    setBusyId('segment');
    setError('');
    const { error: insertError } = await supabase.from('transit_segments').insert({
      origin_stop_id: segmentDraft.originStopId,
      destination_stop_id: segmentDraft.destinationStopId,
      mode: segmentDraft.mode,
      est_duration_mins: duration,
      base_fare: fare,
    });
    if (insertError) {
      setError(`Could not add the transit leg: ${insertError.message}`);
    } else {
      setSegmentDraft({ originStopId: '', destinationStopId: '', mode: 'danfo', duration: '', fare: '' });
      setShowSegmentForm(false);
      await loadDashboard();
    }
    setBusyId('');
  };

  const handleUpdateBaseline = async (segment: AdminSegment) => {
    const fare = Number(baselineDrafts[segment.id]);
    if (!Number.isFinite(fare) || fare < 0) {
      setError('Enter a valid non-negative baseline fare.');
      return;
    }
    setBusyId(segment.id);
    setError('');
    const { error: updateError } = await supabase
      .from('transit_segments')
      .update({ base_fare: fare })
      .eq('id', segment.id);
    if (updateError) {
      setError(`Could not update the baseline fare: ${updateError.message}`);
    } else {
      setSegments((current) => current.map((item) =>
        item.id === segment.id ? { ...item, base_fare: fare } : item,
      ));
      setBaselineDrafts((current) => {
        const next = { ...current };
        delete next[segment.id];
        return next;
      });
    }
    setBusyId('');
  };

  const handleCreateRoute = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const duration = Number(newRoute.duration);
    const fare = Number(newRoute.fare);
    if (!Number.isInteger(duration) || duration < 1 || !Number.isInteger(fare) || fare < 0) {
      setError('Enter a positive whole number for journey time and a non-negative whole number for fare.');
      return;
    }

    setBusyId('new-route');
    const routeValues = {
      title: newRoute.title.trim(),
      origin: newRoute.origin.trim(),
      destination: newRoute.destination.trim(),
      mode: newRoute.mode,
      est_duration_minutes: duration,
      est_cost_ngn: fare,
      traffic_level: 'moderate',
    };
    const result = editingRouteId
      ? await supabase.from('routes').update(routeValues).eq('id', editingRouteId)
      : await supabase.from('routes').insert(routeValues);
    if (result.error) {
      setError(`Could not ${editingRouteId ? 'update' : 'add'} this route: ${result.error.message}`);
    } else {
      setEditingRouteId('');
      setNewRoute({ title: '', origin: '', destination: '', mode: 'brt', duration: '', fare: '' });
      setShowRouteForm(false);
      await loadDashboard();
    }
    setBusyId('');
  };

  const handleDeleteRoute = async (routeId: string) => {
    if (!window.confirm('Delete this corridor from the route directory?')) return;
    setBusyId(routeId);
    setError('');
    const { error: deleteError } = await supabase.from('routes').delete().eq('id', routeId);
    if (deleteError) {
      setError(`Could not delete this corridor: ${deleteError.message}`);
    } else {
      await loadDashboard();
    }
    setBusyId('');
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 lg:grid lg:grid-cols-[250px,1fr]">
      <aside className="flex flex-col bg-slate-950 px-5 py-5 text-white lg:min-h-screen lg:px-4 lg:py-7">
        <a href="/" className="mb-8 flex items-center gap-3 px-2">
          <span className="rounded-xl bg-yellow-400 p-2.5 text-slate-950"><Bus className="h-5 w-5" /></span>
          <span className="text-lg font-black">Lagos<span className="text-yellow-400">Go</span><span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Operations</span></span>
        </a>

        <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Workspace</p>
        <nav aria-label="Admin navigation" className="flex gap-2 overflow-x-auto lg:flex-col">
          {([
            ['overview', 'Overview', LayoutDashboard],
            ['routes', 'Transit routes', Route],
            ['network', 'Stops & segments', MapPin],
            ['reports', 'Community reports', AlertTriangle],
            ['fares', 'Fare oversight', DollarSign],
            ['coverage', 'Coverage requests', MapPin],
          ] as const).map(([value, label, Icon]) => (
            <button
              key={value}
              onClick={() => setSection(value)}
              className={`flex items-center gap-3 whitespace-nowrap rounded-xl px-3 py-3 text-left text-sm font-semibold transition ${section === value ? 'bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-400/20' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
            >
              <Icon className="h-4 w-4" />
              {label}
              {value === 'reports' && pendingReportCount > 0 && (
                <span className="ml-auto rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-bold text-slate-950">{pendingReportCount}</span>
              )}
              {value === 'coverage' && coverageDemand.length > 0 && (
                <span className="ml-auto rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-bold text-slate-950">{coverageDemand.length}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="mt-auto hidden rounded-2xl border border-white/10 bg-white/[0.04] p-4 lg:block">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300"><ShieldCheck className="h-5 w-5" /></span>
          <p className="mt-3 text-xs font-bold text-white">Protected workspace</p>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">Admin permissions are enforced by Supabase Row Level Security.</p>
        </div>
      </aside>

      <section className="min-w-0">
        <header className="flex min-h-[72px] flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3 sm:px-8">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">LagosGo / operations</p>
            <h1 className="mt-0.5 text-lg font-bold text-slate-900">
              {section === 'overview' ? 'Dashboard overview'
                : section === 'routes' ? 'Transit routes'
                  : section === 'network' ? 'Stops & segments'
                    : section === 'reports' ? 'Community reports'
                      : section === 'fares' ? 'Fare oversight' : 'Coverage requests'}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="max-w-48 truncate text-xs font-bold text-slate-800">{adminName}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Administrator</p>
            </div>
            <button onClick={onSignOut} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700">
              <LogOut className="h-3.5 w-3.5" /><span>Sign out</span>
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-6xl space-y-6 px-5 py-6 sm:px-8 sm:py-8">
          {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
          {loading ? (
            <p className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Loading live operations data…</p>
          ) : (
            <>
              {section === 'overview' && (
                <>
                  <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-950 p-6 text-white sm:p-8">
                    <Activity className="absolute -right-4 -top-7 h-44 w-44 text-white/[0.04]" />
                    <div className="relative">
                      <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-200"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> System status</span>
                      <h2 className="mt-4 max-w-2xl text-2xl font-black tracking-tight sm:text-3xl">Keep Lagos moving.</h2>
                      <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">Monitor the route network and review commuter reports from one operations workspace.</p>
                    </div>
                  </section>

                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {[
                      { label: 'Transit corridors', value: routeCount, detail: 'Routes in the database', icon: Route, color: 'text-emerald-700 bg-emerald-50' },
                      { label: 'Commuter accounts', value: userCount, detail: 'Registered profiles', icon: Users, color: 'text-blue-700 bg-blue-50' },
                      { label: 'Reports to review', value: pendingReportCount, detail: 'Awaiting moderation', icon: AlertTriangle, color: 'text-amber-700 bg-amber-50' },
                      { label: 'Open coverage corridors', value: coverageDemand.length, detail: `${coverageDemand.reduce((total, item) => total + item.request_count, 0)} requests total`, icon: MapPin, color: 'text-violet-700 bg-violet-50' },
                      { label: 'Route searches', value: productMetrics.find((metric) => metric.event_name === 'route_search_submitted')?.total ?? 0, detail: 'Last 30 days', icon: Activity, color: 'text-blue-700 bg-blue-50' },
                      { label: 'Results viewed', value: productMetrics.find((metric) => metric.event_name === 'route_results_viewed')?.total ?? 0, detail: 'Last 30 days', icon: Clock3, color: 'text-cyan-700 bg-cyan-50' },
                      { label: 'Routes selected', value: productMetrics.find((metric) => metric.event_name === 'route_selected')?.total ?? 0, detail: 'Last 30 days', icon: Route, color: 'text-indigo-700 bg-indigo-50' },
                    ].map(({ label, value, detail, icon: Icon, color }) => (
                      <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex items-start justify-between">
                          <span className="text-xs font-semibold text-slate-500">{label}</span>
                          <span className={`rounded-xl p-2 ${color}`}><Icon className="h-4 w-4" /></span>
                        </div>
                        <p className="mt-4 text-3xl font-black tracking-tight text-slate-950">{value}</p>
                        <p className="mt-1 text-[11px] text-slate-500">{detail}</p>
                      </article>
                    ))}
                  </div>

                  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <h2 className="font-bold text-slate-900">Latest community reports</h2>
                        <p className="mt-1 text-xs text-slate-500">Review commuter-submitted updates</p>
                      </div>
                      <button onClick={() => setSection('reports')} className="text-xs font-bold text-emerald-700 hover:text-emerald-900">View all</button>
                    </div>
                    <ReportList
                      reports={reports.slice(0, 4)}
                      busyId={busyId}
                      onToggleStatus={handleReportStatus}
                      onDelete={handleDeleteReport}
                    />
                  </section>
                </>
              )}

              {section === 'routes' && (
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="font-bold text-slate-900">Route directory</h2>
                      <p className="mt-1 text-xs text-slate-500">Manage corridors available to commuters.</p>
                    </div>
                    <button onClick={() => {
                      setEditingRouteId('');
                      setNewRoute({ title: '', origin: '', destination: '', mode: 'brt', duration: '', fare: '' });
                      setShowRouteForm((shown) => !shown);
                    }} className="flex items-center gap-2 rounded-lg bg-slate-950 px-3.5 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-800">
                      <Plus className="h-4 w-4" /> Add corridor
                    </button>
                  </div>

                  {showRouteForm && (
                    <form onSubmit={handleCreateRoute} className="mb-6 grid gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 sm:grid-cols-2">
                      <label className="text-xs font-semibold text-slate-700 sm:col-span-2">Route name<input required maxLength={120} value={newRoute.title} onChange={(event) => setNewRoute({ ...newRoute, title: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-emerald-500" placeholder="e.g. CMS to Ikeja BRT" /></label>
                      <label className="text-xs font-semibold text-slate-700">Origin<input required maxLength={120} value={newRoute.origin} onChange={(event) => setNewRoute({ ...newRoute, origin: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-emerald-500" /></label>
                      <label className="text-xs font-semibold text-slate-700">Destination<input required maxLength={120} value={newRoute.destination} onChange={(event) => setNewRoute({ ...newRoute, destination: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-emerald-500" /></label>
                      <label className="text-xs font-semibold text-slate-700">Transport mode<select value={newRoute.mode} onChange={(event) => setNewRoute({ ...newRoute, mode: event.target.value as TransportMode })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-emerald-500">{routeModes.map((mode) => <option key={mode} value={mode}>{mode.toUpperCase()}</option>)}</select></label>
                      <label className="text-xs font-semibold text-slate-700">Journey time (minutes)<input required type="number" min="1" step="1" value={newRoute.duration} onChange={(event) => setNewRoute({ ...newRoute, duration: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-emerald-500" /></label>
                      <label className="text-xs font-semibold text-slate-700">Fare (NGN)<input required type="number" min="0" step="1" value={newRoute.fare} onChange={(event) => setNewRoute({ ...newRoute, fare: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-emerald-500" /></label>
                      <div className="flex items-end gap-2 sm:col-span-2">
                        <button disabled={busyId === 'new-route'} className="rounded-lg bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50">{busyId === 'new-route' ? 'Saving…' : editingRouteId ? 'Update route' : 'Save route'}</button>
                        <button type="button" onClick={() => { setShowRouteForm(false); setEditingRouteId(''); }} className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600">Cancel</button>
                      </div>
                    </form>
                  )}

                  <RouteList
                    routes={routes}
                    busyId={busyId}
                    onEdit={(route) => {
                      setEditingRouteId(route.id);
                      setNewRoute({
                        title: route.title,
                        origin: route.origin,
                        destination: route.destination,
                        mode: routeModes.includes(route.mode as TransportMode) ? route.mode as TransportMode : 'brt',
                        duration: String(route.est_duration_minutes),
                        fare: String(route.est_cost_ngn),
                      });
                      setShowRouteForm(true);
                    }}
                    onDelete={(routeId) => void handleDeleteRoute(routeId)}
                  />
                </section>
              )}

              {section === 'coverage' && (
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                  <div className="mb-5">
                    <h2 className="font-bold text-slate-900">Requested corridors</h2>
                    <p className="mt-1 text-xs text-slate-500">Prioritize route-network updates using commuter demand.</p>
                  </div>
                  <CoverageRequestList
                    requests={coverageRequests}
                    demand={coverageDemand}
                    busyId={busyId}
                    onStatusChange={(request, status) => void handleCoverageStatus(request, status)}
                  />
                </section>
              )}

              {section === 'reports' && (
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                  <div className="mb-5">
                    <h2 className="font-bold text-slate-900">Report moderation</h2>
                    <p className="mt-1 text-xs text-slate-500">Mark reviewed items resolved or return them to the review queue.</p>
                  </div>
                  <ReportList
                    reports={reports}
                    busyId={busyId}
                    onToggleStatus={handleReportStatus}
                    onDelete={handleDeleteReport}
                  />
                </section>
              )}

              {section === 'network' && (
                <section className="space-y-6">
                  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="font-bold text-slate-900">Official stops and stations</h2>
                        <p className="mt-1 text-xs text-slate-500">Manage boarding points, terminals and major interchange hubs.</p>
                      </div>
                      <button
                        onClick={() => {
                          setEditingStopId('');
                          setStopDraft({ name: '', area: '', latitude: '', longitude: '', isMajorHub: false });
                          setShowStopForm((shown) => !shown);
                        }}
                        className="flex items-center gap-2 rounded-lg bg-slate-950 px-3.5 py-2.5 text-xs font-bold text-white hover:bg-emerald-800"
                      >
                        <Plus className="h-4 w-4" /> Add stop
                      </button>
                    </div>

                    {showStopForm && (
                      <form onSubmit={handleSaveStop} className="mb-5 grid gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 sm:grid-cols-2">
                        <label className="text-xs font-semibold text-slate-700">Stop or station name
                          <input required maxLength={120} value={stopDraft.name} onChange={(event) => setStopDraft({ ...stopDraft, name: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal" />
                        </label>
                        <label className="text-xs font-semibold text-slate-700">Area
                          <input required maxLength={120} value={stopDraft.area} onChange={(event) => setStopDraft({ ...stopDraft, area: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal" />
                        </label>
                        <label className="text-xs font-semibold text-slate-700">Latitude
                          <input required type="number" min="-90" max="90" step="any" value={stopDraft.latitude} onChange={(event) => setStopDraft({ ...stopDraft, latitude: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal" />
                        </label>
                        <label className="text-xs font-semibold text-slate-700">Longitude
                          <input required type="number" min="-180" max="180" step="any" value={stopDraft.longitude} onChange={(event) => setStopDraft({ ...stopDraft, longitude: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal" />
                        </label>
                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 sm:col-span-2">
                          <input type="checkbox" checked={stopDraft.isMajorHub} onChange={(event) => setStopDraft({ ...stopDraft, isMajorHub: event.target.checked })} />
                          Major interchange hub
                        </label>
                        <div className="flex gap-2 sm:col-span-2">
                          <button disabled={busyId === 'stop'} className="rounded-lg bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">
                            {busyId === 'stop' ? 'Saving…' : editingStopId ? 'Update stop' : 'Save stop'}
                          </button>
                          <button type="button" onClick={() => { setShowStopForm(false); setEditingStopId(''); }} className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600">Cancel</button>
                        </div>
                      </form>
                    )}

                    <StopList
                      stops={stops}
                      busyId={busyId}
                      onEdit={(stop) => {
                        setEditingStopId(stop.id);
                        setStopDraft({
                          name: stop.name,
                          area: stop.area,
                          latitude: String(stop.latitude),
                          longitude: String(stop.longitude),
                          isMajorHub: stop.is_major_hub,
                        });
                        setShowStopForm(true);
                      }}
                      onDelete={(stop) => void handleDeleteStop(stop)}
                    />
                  </section>

                  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="font-bold text-slate-900">Transit segments and baseline fares</h2>
                        <p className="mt-1 text-xs text-slate-500">Create the individual mode-specific legs used to calculate commuter journeys.</p>
                      </div>
                      <button onClick={() => setShowSegmentForm((shown) => !shown)} disabled={stops.length < 2} className="flex items-center gap-2 rounded-lg bg-slate-950 px-3.5 py-2.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50">
                        <Plus className="h-4 w-4" /> Add segment
                      </button>
                    </div>
                    {showSegmentForm && (
                      <form onSubmit={handleCreateSegment} className="mb-5 grid gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 sm:grid-cols-2">
                        <label className="text-xs font-semibold text-slate-700">Origin stop
                          <select required value={segmentDraft.originStopId} onChange={(event) => setSegmentDraft({ ...segmentDraft, originStopId: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal">
                            <option value="">Select a stop</option>
                            {stops.map((stop) => <option key={stop.id} value={stop.id}>{stop.name} · {stop.area}</option>)}
                          </select>
                        </label>
                        <label className="text-xs font-semibold text-slate-700">Destination stop
                          <select required value={segmentDraft.destinationStopId} onChange={(event) => setSegmentDraft({ ...segmentDraft, destinationStopId: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal">
                            <option value="">Select a stop</option>
                            {stops.map((stop) => <option key={stop.id} value={stop.id}>{stop.name} · {stop.area}</option>)}
                          </select>
                        </label>
                        <label className="text-xs font-semibold text-slate-700">Mode
                          <select value={segmentDraft.mode} onChange={(event) => setSegmentDraft({ ...segmentDraft, mode: event.target.value as TransportMode })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal">
                            {routeModes.map((mode) => <option key={mode} value={mode}>{mode.toUpperCase()}</option>)}
                          </select>
                        </label>
                        <label className="text-xs font-semibold text-slate-700">Estimated duration (minutes)
                          <input required type="number" min="1" step="1" value={segmentDraft.duration} onChange={(event) => setSegmentDraft({ ...segmentDraft, duration: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal" />
                        </label>
                        <label className="text-xs font-semibold text-slate-700">Baseline fare (NGN)
                          <input required type="number" min="0" step="any" value={segmentDraft.fare} onChange={(event) => setSegmentDraft({ ...segmentDraft, fare: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal" />
                        </label>
                        <div className="flex items-end gap-2">
                          <button disabled={busyId === 'segment'} className="rounded-lg bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{busyId === 'segment' ? 'Saving…' : 'Save segment'}</button>
                          <button type="button" onClick={() => setShowSegmentForm(false)} className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600">Cancel</button>
                        </div>
                      </form>
                    )}
                    <SegmentList
                      segments={segments}
                      stops={stops}
                      busyId={busyId}
                      baselineDrafts={baselineDrafts}
                      onFareChange={(id, value) => setBaselineDrafts((current) => ({ ...current, [id]: value }))}
                      onUpdateBaseline={(segment) => void handleUpdateBaseline(segment)}
                    />
                  </section>
                </section>
              )}

              {section === 'fares' && (
                <section className="space-y-6">
                  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                    <h2 className="font-bold text-slate-900">Set baseline corridor prices</h2>
                    <p className="mb-5 mt-1 text-xs text-slate-500">Baseline fares are used when no recent community reports are available.</p>
                    <SegmentList
                      segments={segments}
                      stops={stops}
                      busyId={busyId}
                      baselineDrafts={baselineDrafts}
                      onFareChange={(id, value) => setBaselineDrafts((current) => ({ ...current, [id]: value }))}
                      onUpdateBaseline={(segment) => void handleUpdateBaseline(segment)}
                    />
                  </section>
                  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                    <h2 className="font-bold text-slate-900">Crowdsourced fare submissions</h2>
                    <p className="mb-5 mt-1 text-xs text-slate-500">Review recent reports and remove spam or invalid prices.</p>
                    <FareReportList reports={fareReports} stops={stops} segments={segments} busyId={busyId} onDelete={(id) => void handleDeleteFareReport(id)} />
                  </section>
                </section>
              )}
            </>
          )}
        </main>
      </section>
    </div>
  );
}

function CoverageRequestList({ requests, demand, busyId, onStatusChange }: {
  requests: AdminCoverageRequest[];
  demand: CoverageDemand[];
  busyId: string;
  onStatusChange: (request: AdminCoverageRequest, status: AdminCoverageRequest['status']) => void;
}) {
  if (requests.length === 0) {
    return <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">No corridor requests yet.</p>;
  }

  const demandByRoute = new Map(demand.map((item) => [
    `${item.origin_area.trim().toLocaleLowerCase()}|${item.destination_area.trim().toLocaleLowerCase()}`,
    item.request_count,
  ]));

  return (
    <div className="divide-y divide-slate-100">
      {requests.map((request) => (
        <article key={request.id} className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
          <div>
            <p className="text-sm font-bold text-slate-900">{request.origin_area} → {request.destination_area}</p>
            {request.status === 'open' && (
              <p className="mt-1 text-[10px] font-semibold text-violet-700">
                {demandByRoute.get(`${request.origin_area.trim().toLocaleLowerCase()}|${request.destination_area.trim().toLocaleLowerCase()}`) ?? 1} commuter requests for this direction
              </p>
            )}
            <p className="mt-1 text-[10px] text-slate-500">
              Requested {new Date(request.created_at).toLocaleString()} · <span className="font-semibold uppercase">{request.status}</span>
            </p>
          </div>
          {request.status === 'open' && (
            <div className="flex gap-2">
              <button disabled={busyId === request.id} onClick={() => onStatusChange(request, 'covered')} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-bold text-emerald-800 disabled:opacity-50">
                Mark covered
              </button>
              <button disabled={busyId === request.id} onClick={() => onStatusChange(request, 'closed')} className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600 disabled:opacity-50">
                Close request
              </button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function ReportList({ reports, busyId, onToggleStatus, onDelete }: {
  reports: AdminReport[];
  busyId: string;
  onToggleStatus: (report: AdminReport) => void;
  onDelete: (reportId: string) => void;
}) {
  if (reports.length === 0) {
    return <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">No reports to display yet.</p>;
  }

  return (
    <div className="divide-y divide-slate-100">
      {reports.map((report) => (
        <article key={report.id} className="flex flex-wrap items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">{report.location}</h3>
              <span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wider ${report.status === 'approved' || report.status === 'resolved' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{report.status || 'pending'}</span>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">{report.issue_type.replace('_', ' ')}</span>
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">{report.description}</p>
            <p className="mt-2 flex items-center gap-3 text-[10px] text-slate-400">
              <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{new Date(report.created_at).toLocaleString()}</span>
              <span>{report.upvotes ?? 0} confirmations</span>
            </p>
          </div>
          <button
            disabled={busyId === report.id}
            onClick={() => onToggleStatus(report)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-[10px] font-bold transition disabled:opacity-50 ${report.status === 'approved' ? 'border-slate-200 text-slate-600 hover:bg-slate-50' : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'}`}
          >
            {report.status === 'approved' ? <><ArrowDownLeft className="h-3.5 w-3.5" /> Return to queue</> : <><Check className="h-3.5 w-3.5" /> Approve</>}
          </button>
          <button
            disabled={busyId === report.id}
            onClick={() => onDelete(report.id)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-[10px] font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </article>
      ))}
    </div>
  );
}

function StopList({
  stops,
  busyId,
  onEdit,
  onDelete,
}: {
  stops: AdminStop[];
  busyId: string;
  onEdit: (stop: AdminStop) => void;
  onDelete: (stop: AdminStop) => void;
}) {
  if (stops.length === 0) {
    return <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">No official stops have been added yet.</p>;
  }

  return (
    <div className="divide-y divide-slate-100">
      {stops.map((stop) => (
        <article key={stop.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">{stop.name}</h3>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold uppercase text-slate-600">{stop.area}</span>
              {stop.is_major_hub && <span className="rounded-full bg-emerald-100 px-2 py-1 text-[9px] font-bold uppercase text-emerald-800">Major hub</span>}
            </div>
            <p className="mt-1 text-[10px] text-slate-500">{stop.latitude}, {stop.longitude}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => onEdit(stop)} className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-700 hover:bg-slate-50">Edit</button>
            <button disabled={busyId === stop.id} onClick={() => onDelete(stop)} className="flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-[10px] font-bold text-red-700 hover:bg-red-50 disabled:opacity-50">
              <Trash2 className="h-3 w-3" /> Delete
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

function SegmentList({
  segments,
  stops,
  busyId,
  baselineDrafts,
  onFareChange,
  onUpdateBaseline,
}: {
  segments: AdminSegment[];
  stops: AdminStop[];
  busyId: string;
  baselineDrafts: Record<string, string>;
  onFareChange: (id: string, value: string) => void;
  onUpdateBaseline: (segment: AdminSegment) => void;
}) {
  if (segments.length === 0) {
    return <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">No transit segments are configured yet.</p>;
  }
  const stopNames = new Map(stops.map((stop) => [stop.id, `${stop.name} · ${stop.area}`]));

  return (
    <div className="divide-y divide-slate-100">
      {segments.map((segment) => (
        <article key={segment.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900">
              {stopNames.get(segment.origin_stop_id) ?? 'Unknown stop'}
              <span className="mx-2 text-slate-400">→</span>
              {stopNames.get(segment.destination_stop_id) ?? 'Unknown stop'}
            </p>
            <p className="mt-1 text-[10px] uppercase text-slate-500">{segment.mode} · {segment.est_duration_mins} min</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor={`baseline-${segment.id}`}>Baseline fare in naira</label>
            <input
              id={`baseline-${segment.id}`}
              type="number"
              min="0"
              step="any"
              value={baselineDrafts[segment.id] ?? String(segment.base_fare)}
              onChange={(event) => onFareChange(segment.id, event.target.value)}
              className="w-28 rounded-lg border border-slate-200 px-3 py-2 text-right text-xs"
            />
            <button
              disabled={busyId === segment.id || baselineDrafts[segment.id] === undefined}
              onClick={() => onUpdateBaseline(segment)}
              className="rounded-lg bg-emerald-700 px-3 py-2 text-[10px] font-bold text-white disabled:opacity-50"
            >
              {busyId === segment.id ? 'Saving…' : 'Set fare'}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

function FareReportList({
  reports,
  stops,
  segments,
  busyId,
  onDelete,
}: {
  reports: AdminFareReport[];
  stops: AdminStop[];
  segments: AdminSegment[];
  busyId: string;
  onDelete: (reportId: string) => void;
}) {
  if (reports.length === 0) {
    return <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">No fare reports have been submitted yet.</p>;
  }
  const stopNames = new Map(stops.map((stop) => [stop.id, stop.name]));
  const segmentsById = new Map(segments.map((segment) => [segment.id, segment]));

  return (
    <div className="divide-y divide-slate-100">
      {reports.map((report) => (
        <article key={report.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900">{report.route_title}</p>
            <p className="mt-1 text-xs text-slate-600">
              {report.mode.toUpperCase()} · {formatCurrency(report.reported_fare)}
              {report.segment_id
                ? ` · ${stopNames.get(segmentsById.get(report.segment_id)?.origin_stop_id ?? '') ?? 'Stop'} → ${stopNames.get(segmentsById.get(report.segment_id)?.destination_stop_id ?? '') ?? 'Stop'}`
                : ' · Corridor report'}
            </p>
            <p className="mt-1 text-[10px] text-slate-400">{new Date(report.created_at).toLocaleString()}</p>
          </div>
          <button
            disabled={busyId === report.id}
            onClick={() => onDelete(report.id)}
            className="flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-[10px] font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remove report
          </button>
        </article>
      ))}
    </div>
  );
}

function RouteList({
  routes,
  busyId,
  onEdit,
  onDelete,
}: {
  routes: AdminRoute[];
  busyId: string;
  onEdit: (route: AdminRoute) => void;
  onDelete: (routeId: string) => void;
}) {
  if (routes.length === 0) return <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">No routes have been added yet.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[600px] text-left text-xs">
        <thead className="border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-400">
          <tr><th className="px-3 py-3 font-bold">Corridor</th><th className="px-3 py-3 font-bold">Mode</th><th className="px-3 py-3 font-bold">Time</th><th className="px-3 py-3 font-bold">Fare</th><th className="px-3 py-3 font-bold">Traffic</th><th className="px-3 py-3 font-bold">Manage</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {routes.map((route) => (
            <tr key={route.id}>
              <td className="px-3 py-3"><p className="font-bold text-slate-800">{route.title}</p><p className="mt-1 text-[10px] text-slate-400">{route.origin} → {route.destination}</p></td>
              <td className="px-3 py-3 font-semibold text-slate-600">{route.mode.toUpperCase()}</td>
              <td className="px-3 py-3 text-slate-600">{route.est_duration_minutes} min</td>
              <td className="px-3 py-3 font-semibold text-slate-700">{formatCurrency(route.est_cost_ngn)}</td>
              <td className="px-3 py-3"><span className="inline-flex items-center gap-1.5 text-slate-600"><Activity className="h-3 w-3 text-emerald-600" />{route.traffic_level ?? 'moderate'}</span></td>
              <td className="px-3 py-3">
                <div className="flex gap-2">
                  <button onClick={() => onEdit(route)} className="rounded-md border border-slate-200 px-2.5 py-1.5 font-bold text-slate-700 hover:bg-slate-50">Edit</button>
                  <button disabled={busyId === route.id} onClick={() => onDelete(route.id)} className="rounded-md border border-red-200 px-2.5 py-1.5 font-bold text-red-700 hover:bg-red-50 disabled:opacity-50">Delete</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
