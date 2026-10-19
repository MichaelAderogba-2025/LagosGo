import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRightLeft, Bus, Car, LoaderCircle, MapPin, Navigation, Ship, SlidersHorizontal, Train } from 'lucide-react';
import { searchLagosPlaces, type GeocodingSuggestion } from '../services/geocodingService';
import type { TransportMode } from '../types';

interface RouteSearchProps {
  onSearch: (origin: GeocodingSuggestion, destination: GeocodingSuggestion, modes: TransportMode[]) => void;
  initialOrigin?: string;
  initialDestination?: string;
}

interface LocationPickerProps {
  label: string;
  placeholder: string;
  value: string;
  selected: GeocodingSuggestion | null;
  pinColor: 'green' | 'red';
  onValueChange: (value: string) => void;
  onSelect: (location: GeocodingSuggestion | null) => void;
}

function LocationPicker({
  label,
  placeholder,
  value,
  selected,
  pinColor,
  onValueChange,
  onSelect,
}: LocationPickerProps) {
  const [suggestions, setSuggestions] = useState<GeocodingSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const query = value.trim();
    if (query.length < 3 || selected || !focused) {
      setSuggestions([]);
      setLoading(false);
      setError('');
      return;
    }

    let active = true;
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const results = await searchLagosPlaces(query);
        if (active) setSuggestions(results);
      } catch (searchError) {
        if (active) {
          setSuggestions([]);
          setError(searchError instanceof Error ? searchError.message : 'Location search failed.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }, 350);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [focused, selected, value]);

  return (
    <div className="relative">
      <label className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</label>
      <MapPin className={`absolute left-3 top-[2.55rem] h-4 w-4 ${pinColor === 'green' ? 'text-emerald-600' : 'text-red-500'}`} />
      <input
        type="text"
        value={value}
        onChange={(event) => {
          onValueChange(event.target.value);
          onSelect(null);
        }}
        onBlur={() => window.setTimeout(() => setFocused(false), 150)}
        onFocus={() => setFocused(true)}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={focused && suggestions.length > 0}
        aria-autocomplete="list"
        className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-10 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
        required
      />
      {loading && <LoaderCircle className="absolute right-3 top-[2.55rem] h-4 w-4 animate-spin text-slate-400" />}
      {error && <p role="alert" className="mt-1.5 text-[11px] text-red-700">{error}</p>}

      {focused && suggestions.length > 0 && (
        <ul role="listbox" aria-label={`${label} suggestions`} className="absolute left-0 right-0 top-full z-[1000] mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
          {suggestions.map((suggestion) => (
            <li key={suggestion.id}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onSelect(suggestion);
                  onValueChange(`${suggestion.name}, ${suggestion.area}`);
                  setSuggestions([]);
                }}
                className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-emerald-50"
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-800">{suggestion.name}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-slate-500">{suggestion.address}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const RouteSearch = ({
  onSearch,
  initialOrigin = '',
  initialDestination = '',
}: RouteSearchProps) => {
  const [originText, setOriginText] = useState(initialOrigin);
  const [destinationText, setDestinationText] = useState(initialDestination);
  const [originLocation, setOriginLocation] = useState<GeocodingSuggestion | null>(null);
  const [destinationLocation, setDestinationLocation] = useState<GeocodingSuggestion | null>(null);
  const [selectedModes, setSelectedModes] = useState<TransportMode[]>(['brt', 'danfo', 'ferry', 'train']);
  const [modeError, setModeError] = useState('');
  const [searchError, setSearchError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const toggleMode = (mode: TransportMode) => {
    setSelectedModes((previous) =>
      previous.includes(mode) ? previous.filter((item) => item !== mode) : [...previous, mode],
    );
  };

  const handleSwap = () => {
    setOriginText(destinationText);
    setDestinationText(originText);
    setOriginLocation(destinationLocation);
    setDestinationLocation(originLocation);
  };

  const resolveLocation = async (
    value: string,
    selected: GeocodingSuggestion | null,
  ): Promise<GeocodingSuggestion> => {
    if (selected) return selected;
    const results = await searchLagosPlaces(value);
    const firstResult = results[0];
    if (!firstResult) throw new Error(`No Lagos locations found for "${value}". Choose a suggestion or try another search.`);
    return firstResult;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearchError('');
    if (selectedModes.length === 0) {
      setModeError('Choose at least one transport mode to search.');
      return;
    }

    setModeError('');
    setSubmitting(true);
    try {
      const [origin, destination] = await Promise.all([
        resolveLocation(originText.trim(), originLocation),
        resolveLocation(destinationText.trim(), destinationLocation),
      ]);
      setOriginLocation(origin);
      setDestinationLocation(destination);
      setOriginText(`${origin.name}, ${origin.area}`);
      setDestinationText(`${destination.name}, ${destination.area}`);
      onSearch(origin, destination, selectedModes);
    } catch (submitError) {
      setSearchError(submitError instanceof Error ? submitError.message : 'Could not find these locations.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-slate-900">
        <Navigation className="h-5 w-5 text-emerald-600" />
        Plan your journey
      </h2>
      <p className="mb-5 text-xs text-slate-500">Search Lagos landmarks and stops, then view your driving route on the map.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-[1fr,auto,1fr]">
          <LocationPicker
            label="Starting point"
            placeholder="Search Lagos location"
            value={originText}
            selected={originLocation}
            pinColor="green"
            onValueChange={setOriginText}
            onSelect={setOriginLocation}
          />

          <button
            type="button"
            onClick={handleSwap}
            className="mt-5 rounded-full border border-slate-200 p-2.5 text-slate-600 transition-colors hover:bg-slate-100"
            title="Swap origin and destination"
            aria-label="Swap origin and destination"
          >
            <ArrowRightLeft className="h-4 w-4" />
          </button>

          <LocationPicker
            label="Destination"
            placeholder="Search Lagos destination"
            value={destinationText}
            selected={destinationLocation}
            pinColor="red"
            onValueChange={setDestinationText}
            onSelect={setDestinationLocation}
          />
        </div>

        <div className="pt-2">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Preferred transport modes
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'brt', label: 'BRT Bus', icon: Bus },
              { id: 'danfo', label: 'Danfo / Commercial Bus', icon: Bus },
              { id: 'train', label: 'Blue/Red Rail', icon: Train },
              { id: 'ferry', label: 'Lagos Ferry (Lagferry)', icon: Ship },
              { id: 'keke', label: 'Keke Napep', icon: Car },
              { id: 'uber', label: 'Ride-hailing', icon: Car },
            ].map((item) => {
              const Icon = item.icon;
              const active = selectedModes.includes(item.id as TransportMode);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    toggleMode(item.id as TransportMode);
                    setModeError('');
                  }}
                  aria-pressed={active}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? 'border-slate-900 bg-slate-900 text-yellow-400'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
          {modeError && <p role="alert" className="mt-2 text-xs font-medium text-red-700">{modeError}</p>}
          {searchError && <p role="alert" className="mt-2 text-xs font-medium text-red-700">{searchError}</p>}
        </div>

        <button
          type="submit"
          disabled={submitting || !originText.trim() || !destinationText.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
        >
          {submitting && <LoaderCircle className="h-4 w-4 animate-spin" />}
          {submitting ? 'Finding locations…' : 'Find route and show on map'}
        </button>
      </form>
    </div>
  );
};
