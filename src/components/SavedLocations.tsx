import { useEffect, useState, type FormEvent } from 'react';
import { Bookmark, Briefcase, Clock3, Home, MapPin, Plus, Star, Trash2 } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

type SavedPlace = {
  id: string;
  name: string;
  address: string;
};

interface SavedLocationsProps {
  userId: string;
  onPlan: (destination: string) => void;
}

const storageKey = (userId: string) => `lagosgo:saved-locations:${userId}`;
const deletionKey = (userId: string) => `${storageKey(userId)}:pending-deletions`;

function isSavedPlace(value: unknown): value is SavedPlace {
  if (typeof value !== 'object' || value === null) return false;
  const place = value as Record<string, unknown>;
  return typeof place.id === 'string' && typeof place.name === 'string' && typeof place.address === 'string';
}

export function SavedLocations({ userId, onPlan }: SavedLocationsProps) {
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      let localPlaces: SavedPlace[] = [];
      try {
        const stored = localStorage.getItem(storageKey(userId));
        if (stored) {
          const parsed: unknown = JSON.parse(stored);
          if (!Array.isArray(parsed) || !parsed.every(isSavedPlace)) {
            throw new Error('Saved places data is invalid. Remove the saved places entry from this browser to start fresh.');
          }
          localPlaces = parsed;
        }
      } catch (storageError) {
        if (active) setError(storageError instanceof Error ? storageError.message : 'Could not load saved places from this browser.');
      }
      if (!isSupabaseConfigured) {
        if (active) {
          setPlaces(localPlaces);
          setSyncing(false);
        }
        return;
      }

      const { data: remotePlaces, error: loadError } = await supabase
        .from('saved_locations')
        .select('id, name, address')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (loadError) {
        if (active) {
          setPlaces(localPlaces);
          setError(`Could not sync saved places. Your device copy is still available: ${loadError.message}`);
          setSyncing(false);
        }
        return;
      }

      let pendingDeletions: string[] = [];
      try {
        const storedDeletions = localStorage.getItem(deletionKey(userId));
        if (storedDeletions) {
          const parsed: unknown = JSON.parse(storedDeletions);
          if (!Array.isArray(parsed) || !parsed.every((id) => typeof id === 'string')) {
            throw new Error('Pending saved-place deletions are invalid.');
          }
          pendingDeletions = parsed;
        }
      } catch (storageError) {
        if (active) setError(storageError instanceof Error ? storageError.message : 'Could not load pending saved-place changes.');
      }
      if (pendingDeletions.length > 0) {
        const { error: deleteError } = await supabase
          .from('saved_locations')
          .delete()
          .eq('user_id', userId)
          .in('id', pendingDeletions);
        if (deleteError) {
          if (active) {
            setPlaces(localPlaces);
            setError(`Could not sync saved-place deletions: ${deleteError.message}`);
            setSyncing(false);
          }
          return;
        }
        try {
          localStorage.removeItem(deletionKey(userId));
        } catch (storageError) {
          if (active) setError(storageError instanceof Error ? `Places were removed, but the sync marker could not be cleared: ${storageError.message}` : 'Places were removed, but the sync marker could not be cleared.');
        }
      }

      const knownPlaces = new Set((remotePlaces ?? []).map((place) =>
        `${place.name.trim().toLocaleLowerCase()}|${place.address.trim().toLocaleLowerCase()}`,
      ));
      const legacyPlaces = localPlaces
        .filter((place) => {
          const key = `${place.name.trim().toLocaleLowerCase()}|${place.address.trim().toLocaleLowerCase()}`;
          if (knownPlaces.has(key)) return false;
          knownPlaces.add(key);
          return true;
        })
        .map(({ name: placeName, address: placeAddress }) => ({
          user_id: userId,
          name: placeName,
          address: placeAddress,
        }));
      let legacySyncFailed = false;
      if (legacyPlaces.length > 0) {
        const { error: migrationError } = await supabase
          .from('saved_locations')
          .upsert(legacyPlaces, { onConflict: 'user_id,name,address', ignoreDuplicates: true });
        if (migrationError) {
          legacySyncFailed = true;
          if (active) setError(`Could not migrate this device’s saved places to your account: ${migrationError.message}`);
        }
      }

      const { data: syncedPlaces, error: refreshError } = await supabase
        .from('saved_locations')
        .select('id, name, address')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (refreshError) {
        if (active) {
          setPlaces(localPlaces);
          setError(`Could not refresh saved places from your account: ${refreshError.message}`);
        }
      } else if (active) {
        const mapped = (syncedPlaces ?? []).map((place) => ({
          id: place.id,
          name: place.name,
          address: place.address,
        }));
        const syncedKeys = new Set(mapped.map((place) =>
          `${place.name.trim().toLocaleLowerCase()}|${place.address.trim().toLocaleLowerCase()}`,
        ));
        const merged = legacySyncFailed
          ? [...mapped, ...localPlaces.filter((place) => {
              const key = `${place.name.trim().toLocaleLowerCase()}|${place.address.trim().toLocaleLowerCase()}`;
              if (syncedKeys.has(key)) return false;
              syncedKeys.add(key);
              return true;
            })]
          : mapped;
        setPlaces(merged);
        try {
          localStorage.setItem(storageKey(userId), JSON.stringify(merged));
        } catch (storageError) {
          setError(storageError instanceof Error ? `Places synced, but this device cache could not be updated: ${storageError.message}` : 'Places synced, but this device cache could not be updated.');
        }
      }
      if (active) setSyncing(false);
    };
    void load();
    return () => { active = false; };
  }, [userId]);

  const persistLocally = (nextPlaces: SavedPlace[]) => {
    try {
      localStorage.setItem(storageKey(userId), JSON.stringify(nextPlaces));
      setPlaces(nextPlaces);
      setError('');
    } catch (storageError) {
      setError(storageError instanceof Error ? `Could not save this place: ${storageError.message}` : 'Could not save this place in this browser.');
    }
  };

  const handleAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const place: SavedPlace = {
      id: `${Date.now()}`,
      name: name.trim(),
      address: address.trim(),
    };
    if (!place.name || !place.address) return;
    persistLocally([place, ...places]);
    if (isSupabaseConfigured) {
      void supabase.from('saved_locations').upsert({
        user_id: userId,
        name: place.name,
        address: place.address,
      }, { onConflict: 'user_id,name,address', ignoreDuplicates: true }).then(({ error: saveError }) => {
        if (saveError) {
          setError(`Saved on this device, but could not sync to your account: ${saveError.message}`);
          return;
        }
        void supabase.from('saved_locations').select('id, name, address').eq('user_id', userId).order('created_at', { ascending: false })
          .then(({ data, error: refreshError }) => {
            if (refreshError) {
              setError(`Saved on your account, but could not refresh the list: ${refreshError.message}`);
              return;
            }
            const mapped = (data ?? []).map((item) => ({ id: item.id, name: item.name, address: item.address }));
            setPlaces(mapped);
            try {
              localStorage.setItem(storageKey(userId), JSON.stringify(mapped));
              setError('');
            } catch (storageError) {
              setError(storageError instanceof Error ? `Places synced, but this device cache could not be updated: ${storageError.message}` : 'Places synced, but this device cache could not be updated.');
            }
          });
      });
    }
    setName('');
    setAddress('');
  };

  const handleRemove = (id: string) => {
    persistLocally(places.filter((place) => place.id !== id));
    if (isSupabaseConfigured && /^[0-9a-f-]{36}$/i.test(id)) {
      try {
        const stored = localStorage.getItem(deletionKey(userId));
        const pending: unknown = stored ? JSON.parse(stored) : [];
        if (!Array.isArray(pending) || !pending.every((item) => typeof item === 'string')) {
          throw new Error('Pending saved-place deletions are invalid.');
        }
        if (!pending.includes(id)) localStorage.setItem(deletionKey(userId), JSON.stringify([...pending, id]));
      } catch (storageError) {
        setError(storageError instanceof Error ? `Removed on this device, but could not queue the cloud deletion: ${storageError.message}` : 'Removed on this device, but could not queue the cloud deletion.');
        return;
      }
      void supabase.from('saved_locations').delete().eq('id', id).eq('user_id', userId).then(({ error: deleteError }) => {
        if (deleteError) {
          setError(`Removed on this device. The account deletion will retry next time you are online: ${deleteError.message}`);
          return;
        }
        try {
          const stored = localStorage.getItem(deletionKey(userId));
          const pending: unknown = stored ? JSON.parse(stored) : [];
          if (Array.isArray(pending) && pending.every((item) => typeof item === 'string')) {
            localStorage.setItem(deletionKey(userId), JSON.stringify(pending.filter((item) => item !== id)));
          }
        } catch (storageError) {
          setError(storageError instanceof Error ? `Removed from your account, but could not clear the local sync marker: ${storageError.message}` : 'Removed from your account, but could not clear the local sync marker.');
        }
      });
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-950 p-6 text-white sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">Your personal shortcuts</p>
        <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">The places you go most.</h1>
        <p className="mt-2 text-sm leading-6 text-slate-300">Save frequent destinations on this device and plan your next journey in one click.</p>
      </section>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <span className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700"><Bookmark className="h-5 w-5" /></span>
          <div>
            <h2 className="font-bold text-slate-900">Saved places</h2>
            <p className="mt-0.5 text-xs text-slate-500">{syncing ? 'Loading your saved places…' : isSupabaseConfigured ? 'Synced to your account and cached on this device.' : 'Stored privately in this browser.'}</p>
          </div>
        </div>

        {places.length === 0 && syncing ? (
          <p className="mb-5 rounded-xl bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">Loading your saved places…</p>
        ) : places.length === 0 ? (
          <div className="mb-5 rounded-xl border border-dashed border-slate-200 px-5 py-8 text-center">
            <MapPin className="mx-auto h-7 w-7 text-slate-300" />
            <p className="mt-3 text-sm font-bold text-slate-800">No saved places yet</p>
            <p className="mt-1 text-xs text-slate-500">Add home, work, school or a regular stop below.</p>
          </div>
        ) : (
          <div className="mb-6 grid gap-3 sm:grid-cols-2">
            {places.map((place, index) => {
              const Icon = index === 0 ? Home : index === 1 ? Briefcase : Star;
              return (
                <article key={place.id} className="rounded-xl border border-slate-200 p-4 transition hover:border-emerald-300 hover:shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="rounded-lg bg-emerald-50 p-2 text-emerald-700"><Icon className="h-4 w-4" /></span>
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-bold text-slate-900">{place.name}</h3>
                        <p className="mt-1 truncate text-xs text-slate-500">{place.address}</p>
                      </div>
                    </div>
                    <button onClick={() => handleRemove(place.id)} aria-label={`Remove ${place.name}`} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-700">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <button onClick={() => onPlan(place.address)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-800">
                    <Clock3 className="h-3.5 w-3.5" /> Plan a trip here
                  </button>
                </article>
              );
            })}
          </div>
        )}

        <form onSubmit={handleAdd} className="grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-[0.7fr,1.3fr,auto] sm:items-end">
          <label className="text-xs font-semibold text-slate-700">
            Place name
            <input required maxLength={40} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Office" className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-emerald-500" />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Address or stop
            <input required maxLength={120} value={address} onChange={(event) => setAddress(event.target.value)} placeholder="e.g. Ikeja Along" className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-emerald-500" />
          </label>
          <button className="flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-800">
            <Plus className="h-4 w-4" /> Save place
          </button>
        </form>
      </section>
    </div>
  );
}
