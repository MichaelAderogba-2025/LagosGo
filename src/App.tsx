import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AlertTriangle, Clock3, Route, Wallet } from 'lucide-react';
import { AdminDashboard } from './components/AdminDashboard';
import { AuthScreen } from './components/AuthScreen';
import { CommunityReports } from './components/CommunityReports';
import { CoverageRequest } from './components/CoverageRequest';
import { Header } from './components/Header';
import { JourneyTimeline } from './components/JourneyTimeline';
import { NearbyTransitWidget } from './components/NearbyTransitWidget';
import { RouteResultCard } from './components/RouteResultCard';
import { RouteSearch } from './components/RouteSearch';
import { SavedLocations } from './components/SavedLocations';
import { StepModeModal } from './components/StepModeModal';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import { searchLagosPlaces, type GeocodingSuggestion } from './services/geocodingService';
import { calculateHybridLagosRoute, findMultiLegRoutes, type RouteResult } from './services/routingService';
import { trackProductEvent } from './services/productAnalytics';
import { cacheRecentJourney, readRecentJourneys, type RecentJourney } from './services/recentJourneys';
import { rankRoutes } from './services/routeRanking';
import { formatCommuterRoute } from './services/commuterGuidance';
import { useLiveFareUpdates } from './services/realtimeFareService';
import type { RouteOption, RouteStop, TransportMode } from './types';

const MapView = lazy(() =>
  import('./components/MapView').then((module) => ({ default: module.MapView })),
);

type Profile = {
  id: string;
  full_name: string | null;
  role: 'commuter' | 'admin';
};

const transportModes: TransportMode[] = ['brt', 'danfo', 'keke', 'ferry', 'train', 'uber'];

function mapRoute(record: {
  id: string;
  title: string;
  origin: string;
  destination: string;
  mode: string;
  est_duration_minutes: number;
  est_cost_ngn: number;
  traffic_level: string | null;
}): RouteOption | null {
  if (!transportModes.includes(record.mode as TransportMode)) return null;

  const mode = record.mode as TransportMode;
  return {
    id: record.id,
    title: record.title,
    mode,
    dataQuality: 'curated',
    timeBasis: 'transit-estimate',
    fareBasis: 'baseline',
    startPoint: record.origin,
    endPoint: record.destination,
    totalTimeMinutes: record.est_duration_minutes,
    totalCostNgn: record.est_cost_ngn,
    trafficStatus: 'unknown',
    transfersCount: 0,
    steps: [{
      instruction: `${record.title}: travel from ${record.origin} to ${record.destination}.`,
      mode,
      duration: record.est_duration_minutes,
      cost: record.est_cost_ngn,
    }],
  };
}

function matchesLocation(query: string, location: string): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return normalizedQuery.length === 0 || location.toLocaleLowerCase().includes(normalizedQuery);
}

function findGeocodingMatch(
  suggestions: GeocodingSuggestion[],
  place: string,
): GeocodingSuggestion | undefined {
  const normalizedPlace = place.trim().toLocaleLowerCase();
  return suggestions.find((suggestion) =>
    [suggestion.name, suggestion.area, suggestion.address]
      .some((value) => value.trim().toLocaleLowerCase() === normalizedPlace),
  ) ?? suggestions.find((suggestion) =>
    suggestion.name.toLocaleLowerCase().includes(normalizedPlace)
      || suggestion.address.toLocaleLowerCase().includes(normalizedPlace),
  );
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('search');
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [searchedRoutes, setSearchedRoutes] = useState<RouteOption[] | null>(null);
  const [routesError, setRoutesError] = useState('');
  const [selectedRoute, setSelectedRoute] = useState<RouteOption | null>(null);
  const [search, setSearch] = useState<{ origin: string; destination: string; modes: TransportMode[] } | null>(null);
  const [sortBy, setSortBy] = useState<'fastest' | 'cheapest'>('fastest');
  const [appError, setAppError] = useState('');
  const [mapLocations, setMapLocations] = useState<{ origin: GeocodingSuggestion; destination: GeocodingSuggestion } | null>(null);
  const [calculatedRoute, setCalculatedRoute] = useState<RouteResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState('');
  const [recentJourneys, setRecentJourneys] = useState<RecentJourney[]>(() => readRecentJourneys().journeys);
  const [cachedJourneyAt, setCachedJourneyAt] = useState('');
  const [fareModalOpen, setFareModalOpen] = useState(false);
  const [stepModeRoute, setStepModeRoute] = useState<RouteOption | null>(null);
  const [stepDetails, setStepDetails] = useState<
    { mode: 'public'; route: RouteOption } | { mode: 'driving'; route: RouteResult } | null
  >(null);
  const [stepDirectionsLoading, setStepDirectionsLoading] = useState(false);
  const [stepDirectionsError, setStepDirectionsError] = useState('');
  const sessionUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const cached = readRecentJourneys(session?.user.id);
    setRecentJourneys(cached.journeys);
    if (cached.error) setAppError(cached.error);
  }, [session?.user.id]);

  const routeStops = useMemo<RouteStop[]>(() => {
    if (!mapLocations) return [];
    return [
      {
        id: mapLocations.origin.id,
        name: mapLocations.origin.name,
        location: [mapLocations.origin.latitude, mapLocations.origin.longitude],
        estimatedTimeMinutes: 0,
      },
      {
        id: mapLocations.destination.id,
        name: mapLocations.destination.name,
        location: [mapLocations.destination.latitude, mapLocations.destination.longitude],
        estimatedTimeMinutes: calculatedRoute?.durationMinutes ?? 0,
      },
    ];
  }, [calculatedRoute?.durationMinutes, mapLocations]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    let mounted = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) setAppError(error.message);
      const nextUserId = data.session?.user.id ?? null;
      const userChanged = sessionUserIdRef.current !== nextUserId;
      sessionUserIdRef.current = nextUserId;
      setSession(data.session);
      if (userChanged) {
        if (nextUserId) setLoading(true);
        else {
          setProfile(null);
          setProfileError('');
          setLoading(false);
        }
      } else if (!nextUserId) {
        setLoading(false);
      }
    }).catch((error: unknown) => {
      if (!mounted) return;
      setAppError(error instanceof Error ? error.message : 'Could not restore your session.');
      setSession(null);
      setProfile(null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const nextUserId = nextSession?.user.id ?? null;
      const userChanged = sessionUserIdRef.current !== nextUserId;
      sessionUserIdRef.current = nextUserId;
      setSession(nextSession);
      if (userChanged) {
        setProfile(null);
        setProfileError('');
        setActiveTab('search');
        setLoading(Boolean(nextUserId));
      } else if (!nextUserId) {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!session?.user.id || !isSupabaseConfigured) {
      setProfile(null);
      return;
    }

    setLoading(true);
    supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setProfileError(`Could not load your account profile: ${error.message}`);
          setProfile(null);
        } else if (!data) {
          setProfileError('Your account has no matching profile row. Re-run supabase/schema.sql in the Supabase SQL Editor to create profiles for existing accounts, then refresh this page.');
          setProfile(null);
        } else {
          setProfile(data);
          setProfileError('');
        }
        setLoading(false);
      }, (error: unknown) => {
        if (!active) return;
        setProfileError(
          error instanceof Error
            ? `Could not load your account profile: ${error.message}`
            : 'Could not load your account profile. Check your connection and try again.',
        );
        setProfile(null);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [session?.user.id]);

  useEffect(() => {
    let active = true;
    if (!isSupabaseConfigured) {
      setRoutes([]);
      return;
    }

    setRoutesError('');
    supabase
      .from('routes')
      .select('id, title, origin, destination, mode, est_duration_minutes, est_cost_ngn, traffic_level')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setRoutesError(`Could not load transit routes: ${error.message}`);
          setRoutes([]);
          return;
        }
        const mappedRoutes = (data ?? [])
          .map((record) => mapRoute(record))
          .filter((route): route is RouteOption => route !== null);
        setRoutes(mappedRoutes);
      });

    return () => {
      active = false;
    };
  }, [profile?.id]);

  const routeCandidates = useMemo(() => {
    const matching = search && searchedRoutes !== null
      ? searchedRoutes.filter((route) => route.steps.every((step) => search.modes.includes(step.mode)))
      : search
      ? routes.filter((route) =>
          matchesLocation(search.origin, route.startPoint)
          && matchesLocation(search.destination, route.endPoint)
          && search.modes.some((mode) => route.mode === mode || route.steps.every((step) => search.modes.includes(step.mode)))
        )
      : [...routes];
    return matching;
  }, [routes, searchedRoutes, search]);

  const { updates: liveFareUpdates, error: liveFareError } = useLiveFareUpdates(routeCandidates);

  const visibleRoutes = useMemo(() => rankRoutes(routeCandidates.map((route) => {
      const update = liveFareUpdates[route.id];
      return update
        ? {
            ...route,
            totalCostNgn: update.totalCostNgn,
            fareBasis: 'community' as const,
            steps: route.steps.map((step, index) => ({
              ...step,
              cost: update.stepCosts[index] ?? step.cost,
            })),
          }
          : route;
    }), sortBy), [routeCandidates, liveFareUpdates, sortBy]);

  const handleSignOut = async () => {
    if (!isSupabaseConfigured) return;
    const { error } = await supabase.auth.signOut();
    if (error) setAppError(`Could not sign out: ${error.message}`);
    else setAppError('');
  };

  const handleChoosePublicTransport = () => {
    if (!stepModeRoute) return;
    setStepDetails({ mode: 'public', route: formatCommuterRoute(stepModeRoute) });
    setStepModeRoute(null);
    setStepDirectionsError('');
  };

  const handleChooseDriving = async () => {
    if (!stepModeRoute) return;
    const selectedRouteOption = stepModeRoute;
    setStepDirectionsLoading(true);
    setStepDirectionsError('');
    try {
      if (
        calculatedRoute
        && mapLocations
        && searchedRoutes?.some((route) => route.id === selectedRouteOption.id)
      ) {
        setStepDetails({ mode: 'driving', route: calculatedRoute });
        setStepModeRoute(null);
        return;
      }

      const [originMatches, destinationMatches] = await Promise.all([
        searchLagosPlaces(selectedRouteOption.startPoint),
        searchLagosPlaces(selectedRouteOption.endPoint),
      ]);
      const origin = findGeocodingMatch(originMatches, selectedRouteOption.startPoint) ?? originMatches[0];
      const destination = findGeocodingMatch(destinationMatches, selectedRouteOption.endPoint) ?? destinationMatches[0];
      if (!origin || !destination) {
        throw new Error('Could not locate both route endpoints for driving directions. Try a more specific location search.');
      }

      const drivingRoute = await calculateHybridLagosRoute(
        origin.coordinates,
        destination.coordinates,
        origin.name,
        destination.name,
      );
      setMapLocations({ origin, destination });
      setCalculatedRoute(drivingRoute);
      setStepDetails({ mode: 'driving', route: drivingRoute });
      setStepModeRoute(null);
    } catch (error) {
      setStepDirectionsError(error instanceof Error ? error.message : 'Could not load driving directions for this route.');
    } finally {
      setStepDirectionsLoading(false);
    }
  };

  const handleSearch = (origin: GeocodingSuggestion, destination: GeocodingSuggestion, modes: TransportMode[]) => {
    setCachedJourneyAt('');
    setAppError('');
    void trackProductEvent('route_search_submitted');
    setSearch({ origin: origin.name, destination: destination.name, modes });
    setSearchedRoutes(null);
    setStepDetails(null);
    setStepModeRoute(null);
    setRoutesError('');
    setSelectedRoute(null);
    setMapLocations({ origin, destination });
    setCalculatedRoute(null);
    setRouteError('');
    setRouteLoading(true);
    setActiveTab('search');
    void calculateHybridLagosRoute(origin.coordinates, destination.coordinates, origin.name, destination.name)
      .then(async (route) => {
        setCalculatedRoute(route);
        try {
          const options = await findMultiLegRoutes(
            origin.area,
            destination.area,
            route.distanceKm,
            route.durationMinutes,
            modes,
          );
          setSearchedRoutes(options);
          const cached = cacheRecentJourney({
            savedAt: new Date().toISOString(),
            origin,
            destination,
            drivingRoute: route,
            transitRoutes: options,
          }, session?.user.id);
          setRecentJourneys(cached.journeys);
          if (cached.error) setAppError(cached.error);
          void trackProductEvent('route_results_viewed');
        } catch (error) {
          setSearchedRoutes([]);
          setRoutesError(error instanceof Error ? error.message : 'Could not find transit routes for this journey.');
        }
      })
      .catch((error: unknown) => {
        setRouteError(error instanceof Error ? error.message : 'Could not calculate a driving route.');
      })
      .finally(() => setRouteLoading(false));
  };

  const handleOpenRecentJourney = (journey: RecentJourney) => {
    setSearch({
      origin: journey.origin.name,
      destination: journey.destination.name,
      modes: [...new Set(journey.transitRoutes.flatMap((route) => route.steps.map((step) => step.mode)))],
    });
    setSearchedRoutes(journey.transitRoutes);
    setMapLocations({ origin: journey.origin, destination: journey.destination });
    setCalculatedRoute(journey.drivingRoute);
    setSelectedRoute(null);
    setRouteError('');
    setRoutesError('');
    setRouteLoading(false);
    setCachedJourneyAt(journey.savedAt);
    setActiveTab('search');
  };

  const handleSavedPlan = async (destination: string) => {
    try {
      const [originResults, destinationResults] = await Promise.all([
        searchLagosPlaces('CMS Bus Terminal'),
        searchLagosPlaces(destination),
      ]);
      if (!originResults[0] || !destinationResults[0]) {
        throw new Error('Could not resolve the saved destination. Try searching for it by name.');
      }
      handleSearch(originResults[0], destinationResults[0], transportModes);
    } catch (error) {
      setAppError(error instanceof Error ? error.message : 'Could not plan a trip to this saved place.');
      setActiveTab('search');
    }
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm font-medium text-slate-300">Loading your LagosGo account…</div>;
  }

  if (profileError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-5 text-white">
        <div className="max-w-lg rounded-2xl border border-red-300/20 bg-white/[0.04] p-7">
          <AlertTriangle className="mb-4 h-8 w-8 text-amber-300" />
          <h1 className="text-xl font-bold">Account setup needs attention</h1>
          <p role="alert" className="mt-3 text-sm leading-6 text-slate-300">{profileError}</p>
          <p className="mt-3 text-sm leading-6 text-slate-400">The latest <code>supabase/schema.sql</code> also backfills accounts that were created before the profile trigger existed. Run it in your Supabase SQL Editor, then refresh this page.</p>
          <button onClick={handleSignOut} className="mt-6 rounded-lg bg-yellow-400 px-4 py-2.5 text-sm font-bold text-slate-950">Sign out</button>
        </div>
      </div>
    );
  }

  if (profile?.role === 'admin') {
    return (
      <AdminDashboard
        adminName={profile.full_name ?? session?.user.email ?? 'Administrator'}
        onSignOut={handleSignOut}
      />
    );
  }

  if (activeTab === 'admin') {
    return <AuthScreen initialMode="admin" onCancel={() => setActiveTab('search')} />;
  }

  if (activeTab === 'signin') {
    return <AuthScreen initialMode="signin" onCancel={() => setActiveTab('search')} />;
  }

  const chosenRoute = visibleRoutes.find((route) => route.id === selectedRoute?.id) ?? visibleRoutes[0] ?? null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Header
        activeTab={activeTab}
        setActiveTab={(tab) => setActiveTab(tab === 'saved' && !session ? 'signin' : tab)}
        displayName={profile?.full_name ?? session?.user.email ?? 'Guest commuter'}
        onSignOut={session ? handleSignOut : undefined}
        onSignIn={isSupabaseConfigured ? () => setActiveTab('signin') : undefined}
      />

      <main className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
        {appError && <p role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{appError}</p>}
        {activeTab === 'nearby' && <NearbyTransitWidget />}
        {activeTab === 'search' && (
          <>
            <section className="mb-8 overflow-hidden rounded-3xl bg-slate-950 px-6 py-8 text-white sm:px-9 sm:py-10">
              <div className="grid gap-7 md:grid-cols-[1fr,auto] md:items-end">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Your city, within reach</p>
                  <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Good day, {profile?.full_name?.split(' ')[0] ?? 'commuter'}.</h1>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">Compare routes across Lagos and choose a journey that fits your time and budget.</p>
                </div>
                <div className="flex gap-3 text-xs">
                  <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <span className="block text-lg font-bold text-yellow-300">{routes.length}</span>
                    <span className="text-slate-400">listed routes</span>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <span className="block text-lg font-bold text-emerald-300">6</span>
                    <span className="text-slate-400">travel modes</span>
                  </div>
                </div>
              </div>
            </section>

            <div className="grid grid-cols-1 gap-7 lg:grid-cols-12 lg:gap-8">
              <section className="lg:col-span-7">
                <RouteSearch
                  initialOrigin={search?.origin}
                  initialDestination={search?.destination}
                  onSearch={handleSearch}
                />
                {cachedJourneyAt && (
                  <p role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                    Showing a trip saved on this device ({new Date(cachedJourneyAt).toLocaleString()}). Fares and conditions may have changed.
                  </p>
                )}
                {!cachedJourneyAt && recentJourneys.length > 0 && (
                  <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
                    <h2 className="text-xs font-bold text-slate-800">Recent trips saved on this device</h2>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {recentJourneys.slice(0, 3).map((journey) => (
                        <button
                          key={`${journey.origin.id}:${journey.destination.id}:${journey.savedAt}`}
                          onClick={() => handleOpenRecentJourney(journey)}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:border-emerald-300 hover:bg-emerald-50"
                        >
                          {journey.origin.name} → {journey.destination.name}
                          <span className="mt-0.5 block text-[10px] font-normal text-slate-500">Saved {new Date(journey.savedAt).toLocaleDateString()}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                )}
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Route options <span className="ml-1 text-sm font-medium text-slate-400">{visibleRoutes.length}</span></h2>
                    <p className="mt-0.5 text-xs text-slate-500">{search ? 'Matching your search' : 'Available transit corridors'}</p>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-slate-500">
                    Sort by
                    <select
                      value={sortBy}
                      onChange={(event) => setSortBy(event.target.value as 'fastest' | 'cheapest')}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-emerald-500"
                    >
                      <option value="fastest">Fastest</option>
                      <option value="cheapest">Lowest fare</option>
                    </select>
                  </label>
                </div>

                {(routesError || liveFareError) && (
                  <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                    {[routesError, liveFareError].filter(Boolean).join(' ')}
                  </p>
                )}
                {!routesError && visibleRoutes.length === 0 && !calculatedRoute && !routeLoading && (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
                    <Route className="mx-auto h-8 w-8 text-slate-300" />
                    <h3 className="mt-3 font-bold text-slate-800">No matching routes yet</h3>
                    <p className="mt-1 text-sm text-slate-500">Try different locations or select more transport modes.</p>
                  </div>
                )}
                {visibleRoutes.map((route) => (
                  <RouteResultCard
                    key={route.id}
                    route={route}
                    isSelected={chosenRoute?.id === route.id}
                    onSelect={() => {
                      setSelectedRoute(route);
                      void trackProductEvent('route_selected');
                    }}
                    onViewSteps={() => {
                      setStepDirectionsError('');
                      setStepModeRoute(route);
                    }}
                    liveFareUpdatedAt={liveFareUpdates[route.id]?.updatedAt}
                    liveFareRange={liveFareUpdates[route.id] ? {
                      min: liveFareUpdates[route.id].minCostNgn,
                      max: liveFareUpdates[route.id].maxCostNgn,
                      reportCount: liveFareUpdates[route.id].reportCount,
                    } : undefined}
                    onFareModalOpenChange={setFareModalOpen}
                    canReportFare={Boolean(session)}
                    onSignIn={isSupabaseConfigured ? () => setActiveTab('signin') : undefined}
                  />
                ))}
                {isSupabaseConfigured && search && mapLocations && visibleRoutes.some((route) => route.dataQuality === 'estimate') && (
                  <CoverageRequest
                    originArea={mapLocations.origin.area}
                    destinationArea={mapLocations.destination.area}
                    userId={session?.user.id}
                    onSignIn={isSupabaseConfigured ? () => setActiveTab('signin') : undefined}
                  />
                )}
              </section>

              <aside className="space-y-5 lg:col-span-5">
                {!fareModalOpen && !stepModeRoute && (
                  <Suspense fallback={<div className="h-[390px] animate-pulse rounded-2xl bg-slate-200" />}>
                    <MapView
                      stops={routeStops}
                      route={calculatedRoute}
                      loading={routeLoading}
                      error={routeError}
                    />
                  </Suspense>
                )}
                {calculatedRoute && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">Journey estimate</p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">{calculatedRoute.originName} → {calculatedRoute.destinationName}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${calculatedRoute.fareSource === 'database' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                        {calculatedRoute.fareSource === 'database' ? 'Curated fare baseline' : 'Distance-based estimate'}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-600">
                      {calculatedRoute.distanceKm.toFixed(1)} km · about {calculatedRoute.durationMinutes.toFixed(0)} minutes · {calculatedRoute.transportMode.toUpperCase()}
                    </p>
                    <p className="mt-2 text-lg font-bold text-slate-900">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(calculatedRoute.fareNgn)}</p>
                    <p className="text-[10px] text-slate-600">Fare can vary by operator and traffic conditions.</p>
                  </div>
                )}
                {stepDetails && (
                  <JourneyTimeline
                    key={`${stepDetails.mode}:${stepDetails.route.title}`}
                    route={stepDetails.route}
                  />
                )}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Driving estimate', value: calculatedRoute ? `${calculatedRoute.durationMinutes.toFixed(0)} min` : chosenRoute ? `${chosenRoute.totalTimeMinutes} min` : '—', icon: Clock3 },
                    { label: 'Lowest listed fare', value: visibleRoutes.length ? `₦${Math.min(...visibleRoutes.map((route) => route.totalCostNgn)).toLocaleString()}` : '—', icon: Wallet },
                    { label: 'Route matches', value: String(visibleRoutes.length), icon: Route },
                  ].map(({ label, value, icon: Icon }) => (
                    <div key={label} className="rounded-xl border border-slate-200 bg-white p-3">
                      <Icon className="h-4 w-4 text-emerald-600" />
                      <p className="mt-2 text-sm font-bold text-slate-900">{value}</p>
                      <p className="mt-0.5 text-[10px] leading-4 text-slate-500">{label}</p>
                    </div>
                  ))}
                </div>
              </aside>
            </div>
          </>
        )}
        {activeTab === 'reports' && isSupabaseConfigured ? (
          <CommunityReports
            userId={session?.user.id}
            onSignIn={isSupabaseConfigured ? () => setActiveTab('signin') : undefined}
          />
        ) : activeTab === 'reports' ? (
          <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Community alerts are unavailable because the Supabase backend is not configured.</p>
        ) : null}
        {activeTab === 'saved' && session && (
          <SavedLocations
            userId={session.user.id}
            onPlan={(destination) => void handleSavedPlan(destination)}
          />
        )}
      </main>

      {stepModeRoute && (
        <StepModeModal
          routeTitle={stepModeRoute.title}
          isEstimate={stepModeRoute.dataQuality === 'estimate'}
          loadingDriving={stepDirectionsLoading}
          error={stepDirectionsError}
          onChooseDriving={() => void handleChooseDriving()}
          onChoosePublicTransport={handleChoosePublicTransport}
          onClose={() => {
            setStepModeRoute(null);
            setStepDirectionsError('');
          }}
        />
      )}

      <footer className="border-t border-slate-200 bg-white py-5 text-center text-xs text-slate-500">
        <p>© 2026 LagosGo Transit Mobility Platform</p>
        {isSupabaseConfigured && <p className="mt-1">Anonymous usage counts help us improve route coverage. Search locations and account details are not included.</p>}
      </footer>
    </div>
  );
}

export default App;
