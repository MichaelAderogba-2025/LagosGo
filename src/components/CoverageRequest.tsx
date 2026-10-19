import { useState, type FormEvent } from 'react';
import { MapPinned } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { trackProductEvent } from '../services/productAnalytics';

interface CoverageRequestProps {
  originArea: string;
  destinationArea: string;
  userId?: string;
  onSignIn?: () => void;
}

export function CoverageRequest({ originArea, destinationArea, userId, onSignIn }: CoverageRequestProps) {
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!userId) return;
    setSubmitting(true);
    setMessage('');
    setError('');
    try {
      const { error: insertError } = await supabase.from('route_coverage_requests').insert({
        origin_area: originArea.trim(),
        destination_area: destinationArea.trim(),
      });
      if (insertError) {
        setError(`Could not request this corridor: ${insertError.message}`);
      } else {
        setMessage('Thanks. We have added this corridor to the coverage queue.');
        await trackProductEvent('coverage_requested');
      }
    } catch (cause) {
      setError(cause instanceof Error ? `Could not request this corridor: ${cause.message}` : 'Could not request this corridor.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex gap-3">
        <MapPinned className="mt-0.5 h-5 w-5 shrink-0 text-amber-800" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-amber-950">Help us map this corridor</h3>
          <p className="mt-1 text-xs leading-5 text-amber-900">
            We don’t have a mapped public-transit path for {originArea} to {destinationArea} yet.
          </p>
          {message ? <p role="status" className="mt-3 text-xs font-semibold text-emerald-800">{message}</p>
            : userId ? (
              <form onSubmit={(event) => void handleSubmit(event)} className="mt-3">
                <button disabled={submitting} className="rounded-lg bg-amber-900 px-3 py-2 text-xs font-bold text-white hover:bg-amber-950 disabled:opacity-60">
                  {submitting ? 'Sending…' : 'Request this route'}
                </button>
              </form>
            ) : (
              <p className="mt-3 text-xs text-amber-900">
                {onSignIn ? <><button onClick={onSignIn} className="font-bold underline">Sign in</button> to request this route.</> : 'Sign-in is unavailable right now.'}
              </p>
            )}
          {error && <p role="alert" className="mt-2 text-xs font-semibold text-red-800">{error}</p>}
        </div>
      </div>
    </section>
  );
}
