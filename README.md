# LagosGo

LagosGo is a Lagos transit and urban mobility app for planning journeys, sharing commuter alerts, and managing transit corridors.

## Features

- Supabase email/password sign-up and sign-in for commuters.
- Role-protected operations dashboard with admin-name/password sign-in.
- Guest access to the route planner; an account is needed for saved places, fare reports, and community contributions.
- Route search across the configured transit corridors, with transport-mode filters and fastest/lowest-fare sorting.
- Clear labels for curated transit data versus rough distance-based estimates; fallback drive times are not presented as transit ETAs.
- Lagos location autocomplete, Mapbox driving directions, and an interactive Leaflet map with route geometry and location markers.
- Nearby transit lookup by live browser GPS or manually entered coordinates, with 500 m, 1 km, and 2 km radius options.
- Recent community alerts with relative age, stale-report warnings, and a way for the author to mark an alert cleared.
- Admin route creation and report moderation, protected by Supabase Row Level Security.
- Account-synced saved places, with migration of existing browser-saved places and local fallback.
- Up to five recent journeys cached on the current device for reopening when the network is unavailable.
- Anonymous aggregate product-event counts and a commuter-requested corridor queue in the admin dashboard.

## Local development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_MAPBOX_TOKEN` to your project values. The Mapbox browser token is public; restrict it to your app's allowed URLs in Mapbox.

3. Run `supabase/schema.sql` in the Supabase SQL Editor. It creates the account, transit, and report tables, access policies, and voting function.

4. Run `supabase/migrations/20261007170000_location_search.sql` to enable PostGIS and create the indexed locations table and `search_lagos_locations` RPC. Then run `supabase/seed_locations.sql` to add major Lagos landmarks.

5. The route planner uses `src/services/geocodingService.ts` for Mapbox autocomplete constrained to Lagos and `src/services/routingService.ts` for directions and transit-network lookup. Distance fallbacks are built in `src/services/routeEstimates.ts`: they show a rough distance-based fare and clearly label Mapbox driving duration as a proxy, not public-transit travel time. Mapbox Directions provides turn-by-turn driving steps and GeoJSON geometry, which `src/components/MapView.tsx` displays on the Leaflet map. Coordinates use `[longitude, latitude]`; `RouteStop.location` uses `[latitude, longitude]`.

6. Apply the migrations in timestamp order, including `supabase/migrations/20261018000000_multileg_transit.sql`, `20261018010000_realtime_fare_reports.sql`, `20261018020000_admin_transit_management.sql`, and finally `20261019000000_user_adoption_foundations.sql`. The last migration creates account-synced saved places, authenticated corridor requests, report-resolution support, and aggregate event metrics. It is versioned in this repository but must be applied manually to your Supabase project before using those features. The nearby transit page calls the already-installed `get_nearby_routes(user_lng, user_lat, radius_meters)` RPC; browser GPS requires a secure context such as HTTPS or localhost.

7. Deploy the admin sign-in Edge Function:

   ```bash
   supabase functions deploy admin-login
   ```

   The function uses the project's `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` secrets. Configure these for the function in the Supabase dashboard or with the Supabase CLI. Never expose the service-role key in frontend environment variables.
   In VS Code, install the Deno extension to get Deno-aware diagnostics for the Edge Function; the workspace enables it only for `supabase/functions`.

8. Create an account through LagosGo and confirm its email if email confirmation is enabled for the project. To grant that account administrator access, run the following in the SQL Editor, replacing the email and admin name:

   ```sql
   UPDATE public.profiles
   SET role = 'admin', admin_name = lower(trim('your-admin-name'))
   WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@example.com');
   ```

   Admins then choose **Admin** on the sign-in screen and use that admin name with their account password. A public sign-up cannot assign itself an admin role.

9. Start the app:

   ```bash
   npm run dev
   ```

   Open [http://localhost:5173](http://localhost:5173).

## Build

```bash
npm run build
```

## Tests

```bash
npm test
```

Recent journey caches are scoped to the current guest or account on this device; unsynced saved-place changes remain local until the account is reachable. Anonymous product events contain only event names and timestamps; they do not include searched locations or account identifiers. Transit estimates are indicative only, and community reports older than 24 hours are hidden.
