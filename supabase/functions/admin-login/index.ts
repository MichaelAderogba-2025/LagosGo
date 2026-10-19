import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function respond(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return respond({ error: 'Method not allowed.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return respond({ error: 'Admin sign-in is not configured on the server.' }, 500);
  }

  let credentials: { name?: unknown; password?: unknown };
  try {
    credentials = await request.json();
  } catch {
    return respond({ error: 'Enter your admin name and password.' }, 400);
  }

  if (
    typeof credentials.name !== 'string'
    || credentials.name.trim().length === 0
    || credentials.name.length > 64
    || typeof credentials.password !== 'string'
    || credentials.password.length === 0
    || credentials.password.length > 256
  ) {
    return respond({ error: 'Enter your admin name and password.' }, 400);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const adminName = credentials.name.trim().toLocaleLowerCase();
  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .eq('admin_name', adminName)
    .maybeSingle();

  if (profileError || !profile) return respond({ error: 'Invalid admin name or password.' }, 401);

  const { data: account, error: accountError } = await adminClient.auth.admin.getUserById(profile.id);
  if (accountError || !account.user?.email) return respond({ error: 'Invalid admin name or password.' }, 401);

  const { data: auth, error: authError } = await authClient.auth.signInWithPassword({
    email: account.user.email,
    password: credentials.password,
  });
  if (authError || !auth.session) return respond({ error: 'Invalid admin name or password.' }, 401);

  return respond({
    access_token: auth.session.access_token,
    refresh_token: auth.session.refresh_token,
  });
});
