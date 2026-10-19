import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, Check, Clock3, MapPin, PlusCircle, ThumbsUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { trackProductEvent } from '../services/productAnalytics';
import type { IncidentReport } from '../types';

type ReportType = IncidentReport['issueType'];

type CommunityReport = IncidentReport & {
  status: string;
  user_id: string | null;
};

const reportTypes: { value: ReportType; label: string }[] = [
  { value: 'traffic', label: 'Heavy traffic' },
  { value: 'brt_queue', label: 'Long transit queue' },
  { value: 'fare_hike', label: 'Fare change' },
  { value: 'roadblock', label: 'Roadblock or disruption' },
];

interface CommunityReportsProps {
  userId?: string;
  onSignIn?: () => void;
}

const ACTIVE_REPORT_WINDOW_MS = 24 * 60 * 60 * 1000;
const STALE_REPORT_AFTER_MS = 2 * 60 * 60 * 1000;

function formatReportAge(createdAt: string, now: number): string {
  const ageMinutes = Math.max(0, Math.floor((now - Date.parse(createdAt)) / 60_000));
  if (ageMinutes < 1) return 'Just now';
  if (ageMinutes < 60) return `${ageMinutes} min ago`;
  const hours = Math.floor(ageMinutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  return 'Over a day ago';
}

export function CommunityReports({ userId, onSignIn }: CommunityReportsProps) {
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [issueType, setIssueType] = useState<ReportType>('traffic');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data, error: reportsError } = await supabase
      .from('reports')
      .select('id, user_id, location, issue_type, description, created_at, upvotes, status')
      .neq('status', 'resolved')
      .gte('created_at', new Date(Date.now() - ACTIVE_REPORT_WINDOW_MS).toISOString())
      .order('created_at', { ascending: false });
    if (reportsError) {
      setError(`Could not load commuter reports: ${reportsError.message}`);
      setLoading(false);
      return;
    }

    let votes: { report_id: string }[] = [];
    if (userId) {
      const { data: userVotes, error: votesError } = await supabase
        .from('report_votes')
        .select('report_id')
        .eq('user_id', userId);
      if (votesError) {
        setError(`Could not load your report confirmations: ${votesError.message}`);
        setLoading(false);
        return;
      }
      votes = userVotes ?? [];
    }

    setReports((data ?? []).map((report) => ({
      id: report.id,
      location: report.location,
      issueType: report.issue_type as ReportType,
      description: report.description,
      createdAt: report.created_at,
      upvotes: report.upvotes ?? 0,
      status: report.status ?? 'pending',
      user_id: report.user_id,
    })));
    setVotedIds(new Set((votes ?? []).map((vote) => vote.report_id)));
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const handleAddReport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!userId) return;
    setBusy('new-report');
    setError('');
    const { error: insertError } = await supabase.from('reports').insert({
      user_id: userId,
      location: location.trim(),
      issue_type: issueType,
      description: description.trim(),
    });
    if (insertError) {
      setError(`Could not submit your alert: ${insertError.message}`);
    } else {
      setLocation('');
      setDescription('');
      await loadReports();
      await trackProductEvent('report_submitted');
    }
    setBusy('');
  };

  const handleVote = async (reportId: string) => {
    if (!userId) return;
    setBusy(reportId);
    setError('');
    const { data, error: voteError } = await supabase.rpc('confirm_report', { target_report_id: reportId });
    if (voteError) {
      setError(`Could not confirm this report: ${voteError.message}`);
    } else {
      setVotedIds((current) => new Set(current).add(reportId));
      if (data) {
        setReports((current) => current.map((report) =>
          report.id === reportId ? { ...report, upvotes: report.upvotes + 1 } : report
        ));
      }
    }
    setBusy('');
  };

  const handleResolve = async (reportId: string) => {
    setBusy(reportId);
    setError('');
    const { data, error: resolveError } = await supabase.rpc('resolve_own_report', { target_report_id: reportId });
    if (resolveError) {
      setError(`Could not mark your alert as cleared: ${resolveError.message}`);
    } else if (!data) {
      setError('This alert could not be cleared. Refresh the list and try again.');
    } else {
      setReports((current) => current.filter((report) => report.id !== reportId));
    }
    setBusy('');
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="overflow-hidden rounded-2xl bg-slate-950 p-6 text-white sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">From the community</p>
        <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Know before you go.</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">Share current road and transit conditions to help fellow Lagos commuters make better decisions.</p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[0.85fr,1.15fr]">
        <section className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center gap-3">
            <span className="rounded-xl bg-amber-50 p-2.5 text-amber-700"><PlusCircle className="h-5 w-5" /></span>
            <div>
              <h2 className="font-bold text-slate-900">Post a commuter alert</h2>
              <p className="mt-0.5 text-xs text-slate-500">Help people travelling through your area.</p>
            </div>
          </div>

          {userId ? <form onSubmit={handleAddReport} className="space-y-4">
            <label className="block text-xs font-semibold text-slate-700">
              Location
              <span className="relative mt-1.5 block">
                <MapPin className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input required maxLength={120} value={location} onChange={(event) => setLocation(event.target.value)} placeholder="e.g. Third Mainland Bridge" className="w-full rounded-lg border border-slate-200 py-2.5 pl-10 pr-3 text-sm font-normal outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10" />
              </span>
            </label>
            <label className="block text-xs font-semibold text-slate-700">
              Alert type
              <select value={issueType} onChange={(event) => setIssueType(event.target.value as ReportType)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-emerald-500">
                {reportTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-700">
              What is happening?
              <textarea required minLength={8} maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the current conditions…" rows={4} className="mt-1.5 w-full resize-y rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-emerald-500" />
            </label>
            <button disabled={busy === 'new-report'} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50">
              <PlusCircle className="h-4 w-4" />{busy === 'new-report' ? 'Submitting…' : 'Share alert'}
            </button>
          </form> : (
            <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-600">
              Sign in to post an alert or confirm a report.
              {onSignIn && <button onClick={onSignIn} className="ml-1 font-bold text-emerald-800 underline">Sign in</button>}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 font-bold text-slate-900"><AlertCircle className="h-4 w-4 text-amber-600" /> Recent commuter reports</h2>
              <p className="mt-1 text-xs text-slate-500">Reports older than 24 hours are hidden; confirm an alert only if it is still happening.</p>
            </div>
            <button onClick={() => void loadReports()} className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50">Refresh</button>
          </div>

          {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">{error}</p>}
          {loading ? (
            <p className="py-12 text-center text-sm text-slate-500">Loading live reports…</p>
          ) : reports.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 px-5 py-12 text-center">
              <AlertCircle className="mx-auto h-7 w-7 text-slate-300" />
              <h3 className="mt-3 text-sm font-bold text-slate-800">All clear for now</h3>
              <p className="mt-1 text-xs text-slate-500">Be the first to share a local update.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {reports.map((report) => {
                const hasVoted = votedIds.has(report.id);
                const stale = now - Date.parse(report.createdAt) >= STALE_REPORT_AFTER_MS;
                return (
                  <article key={report.id} className={`py-4 first:pt-0 last:pb-0 ${stale ? 'opacity-60' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-bold text-slate-900">{report.location}</h3>
                          <span className="rounded-full bg-amber-50 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-amber-800">{report.issueType.replace('_', ' ')}</span>
                          {stale && <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-600">May be stale</span>}
                        </div>
                        <p className="mt-1.5 text-xs leading-5 text-slate-600">{report.description}</p>
                        <p className="mt-2 flex items-center gap-1 text-[10px] text-slate-400"><Clock3 className="h-3 w-3" />{formatReportAge(report.createdAt, now)}</p>
                      </div>
                      {userId && report.user_id === userId ? (
                        <button onClick={() => void handleResolve(report.id)} disabled={busy === report.id} className="shrink-0 rounded-lg border border-emerald-200 px-2.5 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50">
                          Mark cleared
                        </button>
                      ) : <button
                        onClick={() => void handleVote(report.id)}
                        disabled={!userId || hasVoted || stale || busy === report.id}
                        aria-label={stale ? 'This report may be stale' : hasVoted ? `Confirmed report, ${report.upvotes} confirmations` : `Confirm report, ${report.upvotes} confirmations`}
                        className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-bold transition disabled:cursor-default ${hasVoted ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-600 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800'}`}
                      >
                        {hasVoted ? <Check className="h-3.5 w-3.5" /> : <ThumbsUp className="h-3.5 w-3.5" />}
                        {stale ? 'Stale' : userId ? report.upvotes : 'Sign in to confirm'}
                      </button>}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
