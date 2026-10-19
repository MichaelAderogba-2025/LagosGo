import { useState, type FormEvent } from 'react';
import { ArrowRight, Bus, LockKeyhole, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

type AuthMode = 'signin' | 'signup' | 'admin';

interface AuthScreenProps {
  initialMode?: AuthMode;
  onCancel?: () => void;
}

export function AuthScreen({ initialMode = 'signin', onCancel }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selectMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError('');
    setNotice('');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);

    try {
      if (mode === 'admin') {
        const { data, error: invokeError } = await supabase.functions.invoke<{
          access_token: string;
          refresh_token: string;
        }>('admin-login', {
          body: { name: name.trim(), password },
        });

        if (invokeError) {
          const response = invokeError.context;
          if (response instanceof Response) {
            const payload: unknown = await response.json().catch(() => null);
            if (
              typeof payload === 'object'
              && payload !== null
              && 'error' in payload
              && typeof payload.error === 'string'
            ) {
              throw new Error(payload.error);
            }
          }
          throw invokeError;
        }
        if (!data?.access_token || !data.refresh_token) {
          throw new Error('Admin sign-in did not return a valid session.');
        }

        const { error: sessionError } = await supabase.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        });
        if (sessionError) throw sessionError;
      } else if (mode === 'signup') {
        const { data, error: signupError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: name.trim() } },
        });

        if (signupError) throw signupError;
        if (!data.session) {
          setNotice('Check your email for a confirmation link, then sign in to continue.');
        }
      } else {
        const { error: signinError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signinError) throw signinError;
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Unable to authenticate. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const isAdmin = mode === 'admin';
  const isSignup = mode === 'signup';

  return (
    <main
      className="min-h-screen bg-slate-950 bg-cover bg-center bg-fixed text-white lg:grid lg:grid-cols-[1.05fr,0.95fr]"
      style={{
        backgroundImage: "linear-gradient(90deg, rgba(2, 6, 23, 0.58), rgba(2, 6, 23, 0.86)), url('/lagosgo-landing.png')",
      }}
    >
      <section className="relative hidden overflow-hidden border-r border-white/10 px-12 py-10 lg:flex lg:flex-col lg:justify-between xl:px-20">
        <div className="absolute -bottom-32 -left-24 h-96 w-96 rounded-full border border-emerald-300/10" />
        <div className="absolute -bottom-20 -left-12 h-72 w-72 rounded-full border border-emerald-300/10" />

        <a href="/" className="relative z-10 inline-flex w-fit items-center gap-3">
          <span className="rounded-xl bg-yellow-400 p-2.5 text-slate-950"><Bus className="h-6 w-6" /></span>
          <span className="text-2xl font-black tracking-tight">Lagos<span className="text-yellow-400">Go</span></span>
        </a>

        <div className="relative z-10 max-w-xl py-12">
          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-emerald-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> Mobility for the city
          </span>
          <h1 className="text-5xl font-black leading-tight tracking-tight xl:text-6xl">
            Move smarter.<br /><span className="text-yellow-400">Get there together.</span>
          </h1>
          <p className="mt-6 max-w-md text-base leading-7 text-slate-300">
            Plan Lagos journeys, compare transport options and share the latest conditions with your community.
          </p>
          <div className="mt-10 flex flex-wrap gap-3 text-sm text-slate-300">
            <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2">BRT & buses</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2">Rail & ferry</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2">Community alerts</span>
          </div>
        </div>

        <p className="relative z-10 text-xs text-slate-500">Built for the everyday Lagos commute.</p>
      </section>

      <section className="relative z-10 flex min-h-screen items-center justify-center bg-slate-950/70 px-5 py-10 backdrop-blur-[2px] sm:px-8">
        <div className="w-full max-w-md">
          <a href="/" className="mb-10 inline-flex items-center gap-2 text-xl font-black lg:hidden">
            <span className="rounded-lg bg-yellow-400 p-2 text-slate-950"><Bus className="h-5 w-5" /></span>
            Lagos<span className="text-yellow-400">Go</span>
          </a>

          <div className="mb-8">
            <p className="text-sm font-semibold uppercase tracking-widest text-emerald-300">
              {isAdmin ? 'Operations portal' : 'Welcome to LagosGo'}
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">
              {isAdmin ? 'Admin sign in' : isSignup ? 'Create your account' : 'Good to see you again'}
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              {isAdmin
                ? 'Authorized team members only. Sign in with your admin name and password.'
                : isSignup
                  ? 'Join your community and make every Lagos trip easier.'
                  : 'Sign in to plan and save your Lagos journeys.'}
            </p>
          </div>

          <div className="mb-6 grid grid-cols-3 rounded-xl border border-white/10 bg-white/[0.04] p-1">
            {([
              ['signin', 'Sign in'],
              ['signup', 'Sign up'],
              ['admin', 'Admin'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => selectMode(value)}
                className={`rounded-lg px-2 py-2.5 text-sm font-semibold transition-colors ${
                  mode === value ? 'bg-white text-slate-950 shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {!isSupabaseConfigured && (
            <div role="alert" className="mb-5 rounded-xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">
              Supabase is not configured. Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to your local environment to enable accounts.
            </div>
          )}
          {error && <p role="alert" className="mb-5 rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</p>}
          {notice && <p role="status" className="mb-5 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">{notice}</p>}

          <form onSubmit={handleSubmit} className="space-y-4">
            {(isSignup || isAdmin) && (
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-200">{isAdmin ? 'Admin name' : 'Full name'}</span>
                <span className="relative block">
                  {isAdmin ? <ShieldCheck className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-500" /> : <UserRound className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-500" />}
                  <input
                    autoComplete={isAdmin ? 'username' : 'name'}
                    className="w-full rounded-xl border border-white/10 bg-white/[0.05] py-3 pl-11 pr-4 text-sm text-white outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={isAdmin ? 'Your admin username' : 'e.g. Tola Adebayo'}
                    required
                  />
                </span>
              </label>
            )}

            {!isAdmin && (
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-200">Email address</span>
                <span className="relative block">
                  <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-500" />
                  <input
                    type="email"
                    autoComplete="email"
                    className="w-full rounded-xl border border-white/10 bg-white/[0.05] py-3 pl-11 pr-4 text-sm text-white outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    required
                  />
                </span>
              </label>
            )}

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-200">Password</span>
              <span className="relative block">
                <LockKeyhole className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-500" />
                <input
                  type="password"
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                  minLength={isSignup ? 8 : undefined}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.05] py-3 pl-11 pr-4 text-sm text-white outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={isSignup ? 'At least 8 characters' : 'Enter your password'}
                  required
                />
              </span>
            </label>

            <button
              type="submit"
              disabled={busy || !isSupabaseConfigured}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-yellow-400 px-4 py-3.5 font-bold text-slate-950 transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Please wait…' : isAdmin ? 'Enter admin console' : isSignup ? 'Create account' : 'Sign in'}
              {!busy && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>

          <p className="mt-6 text-center text-xs leading-5 text-slate-500">
  {isAdmin
    ? 'Rest easy. Admin privileges are strictly managed by system roles.'
    : 'You are in good hands. Your credentials are fully protected.'}
</p>
          {onCancel && (
            <button onClick={onCancel} className="mt-4 w-full text-center text-xs font-semibold text-slate-400 transition hover:text-white">
              Back to the commuter app
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
