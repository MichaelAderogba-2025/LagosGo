import { CarFront, BusFront, LoaderCircle, X } from 'lucide-react';

interface StepModeModalProps {
  routeTitle: string;
  isEstimate: boolean;
  loadingDriving: boolean;
  error: string;
  onChooseDriving: () => void;
  onChoosePublicTransport: () => void;
  onClose: () => void;
}

export function StepModeModal({
  routeTitle,
  isEstimate,
  loadingDriving,
  error,
  onChooseDriving,
  onChoosePublicTransport,
  onClose,
}: StepModeModalProps) {
  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/60 p-4"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="step-mode-title"
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="step-mode-title" className="text-lg font-bold text-slate-900">How are you making this trip?</h2>
            <p className="mt-1 text-sm text-slate-500">{routeTitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close travel mode selection"
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={loadingDriving}
            onClick={onChooseDriving}
            className="rounded-xl border border-slate-200 p-4 text-left transition hover:border-emerald-600 hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-70"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
              {loadingDriving ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <CarFront className="h-5 w-5" />}
            </span>
            <span className="mt-3 block font-bold text-slate-900">
              {loadingDriving ? 'Loading directions…' : 'Driving / Personal Car'}
            </span>
            <span className="mt-1 block text-xs leading-5 text-slate-500">Mapbox turn-by-turn directions using streets and roads.</span>
          </button>
          <button
            type="button"
            disabled={loadingDriving}
            onClick={onChoosePublicTransport}
            className="rounded-xl border border-slate-200 p-4 text-left transition hover:border-emerald-600 hover:bg-emerald-50 disabled:opacity-70"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <BusFront className="h-5 w-5" />
            </span>
            <span className="mt-3 block font-bold text-slate-900">{isEstimate ? 'View estimate details' : 'Public Transport / Commuter'}</span>
            <span className="mt-1 block text-xs leading-5 text-slate-500">
              {isEstimate
                ? 'No mapped boarding, transfer or alighting instructions are available for this corridor.'
                : 'Local boarding, transfer and alighting instructions for each mapped leg.'}
            </span>
          </button>
        </div>

        {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      </section>
    </div>
  );
}
