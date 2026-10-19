import { Bus, LogOut, UserRound } from 'lucide-react';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  displayName: string;
  onSignOut?: () => void;
  onSignIn?: () => void;
}

export const Header = ({ activeTab, setActiveTab, displayName, onSignOut, onSignIn }: HeaderProps) => (
  <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950 text-white">
    <div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-6 lg:px-8">
      <button className="flex items-center gap-3" onClick={() => setActiveTab('search')} aria-label="LagosGo home">
        <span className="flex items-center justify-center rounded-lg bg-yellow-400 p-2 text-slate-950">
          <Bus className="h-5 w-5" />
        </span>
        <span className="text-left">
          <span className="block text-lg font-black tracking-tight">Lagos<span className="text-yellow-400">Go</span></span>
          <span className="hidden text-[10px] font-medium uppercase tracking-widest text-slate-400 sm:block">City mobility</span>
        </span>
      </button>

      <nav aria-label="Main navigation" className="order-3 flex w-full items-center justify-between gap-1 overflow-x-auto sm:order-none sm:w-auto sm:justify-start sm:gap-1">
        {[
          ['search', 'Route finder'],
          ['nearby', 'Nearby transit'],
          ['reports', 'Traffic alerts'],
          ['saved', 'Saved places'],
        ].map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition-colors sm:text-sm ${activeTab === tab ? 'bg-white/10 text-yellow-300' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="flex items-center gap-2 sm:gap-3">
        {onSignOut ? (
          <>
            <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 sm:flex">
              <UserRound className="h-3.5 w-3.5 text-emerald-300" />
              <span className="max-w-32 truncate text-xs font-medium text-slate-200">{displayName}</span>
            </div>
            <button
              onClick={onSignOut}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-400 transition hover:bg-red-400/10 hover:text-red-200 sm:px-3 sm:text-sm"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </>
        ) : onSignIn ? (
          <button
            onClick={onSignIn}
            className="rounded-lg bg-yellow-400 px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-yellow-300 sm:text-sm"
          >
            Sign in
          </button>
        ) : null}
      </div>
    </div>
  </header>
);
