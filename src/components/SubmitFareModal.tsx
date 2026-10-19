import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { submitFareReport } from '../services/realtimeFareService';
import type { RouteOption } from '../types';

interface SubmitFareModalProps {
  route: RouteOption;
  onClose: () => void;
}

export function SubmitFareModal({ route, onClose }: SubmitFareModalProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [reportedFare, setReportedFare] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const selectedStep = route.steps[stepIndex];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedStep) {
      setError('This route does not have a reportable transport step.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await submitFareReport({
        segmentId: selectedStep.segmentId,
        routeTitle: route.title,
        mode: selectedStep.mode,
        reportedFare: Number(reportedFare),
      });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not submit the fare report.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="submit-fare-title"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="submit-fare-title" className="text-lg font-bold text-slate-900">Report a current fare</h2>
            <p className="mt-1 text-sm text-slate-500">{route.title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close fare report"
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {route.steps.length > 1 && (
            <label className="block text-sm font-medium text-slate-700">
              Route step
              <select
                value={stepIndex}
                onChange={(event) => setStepIndex(Number(event.target.value))}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
              >
                {route.steps.map((step, index) => (
                  <option key={`${step.segmentId ?? step.mode}:${index}`} value={index}>
                    {step.mode.toUpperCase()} — {step.stopName ?? step.instruction}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block text-sm font-medium text-slate-700">
            Current fare (NGN)
            <div className="mt-1.5 flex items-center rounded-lg border border-slate-300 px-3 focus-within:border-emerald-600">
              <span className="text-slate-500">₦</span>
              <input
                type="number"
                min="1"
                step="1"
                required
                value={reportedFare}
                onChange={(event) => setReportedFare(event.target.value)}
                placeholder="e.g. 500"
                className="w-full border-0 px-2 py-2.5 outline-none"
              />
            </div>
          </label>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <p className="text-xs text-slate-500">Recent reports are combined into a median fare and shown for four hours.</p>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !selectedStep}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {submitting ? 'Submitting…' : 'Submit fare'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
