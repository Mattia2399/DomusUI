import {
  BarChart3,
  Bell,
  DoorOpen,
  LayoutGrid,
  MoreHorizontal,
  Settings,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';

/**
 * Lightweight replica of the Domus UI shell (sidebar rail, attention banner,
 * greeting and bottom bar) around live cards. It mirrors the navigation of
 * dashboardNavigation.tsx: Dashboard, Rooms, Security, Consumption.
 */

const NAV = [
  { icon: LayoutGrid, label: 'Dashboard' },
  { icon: DoorOpen, label: 'Stanze' },
  { icon: ShieldCheck, label: 'Sicurezza' },
  { icon: BarChart3, label: 'Consumi' },
] as const;

export function AttentionBanner({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-full border border-white/[0.07] bg-white/[0.03] ${
        compact ? 'px-2 py-1.5' : 'px-2.5 py-2'
      }`}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#ff9a4d]/15 text-[#ffb27a]">
        <TriangleAlert className="h-3.5 w-3.5" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-[0.72rem] font-semibold text-white">Richiede attenzione</p>
        <p className="truncate text-[0.66rem] text-white/50">Finestra studio aperta · +2</p>
      </div>
      {compact ? null : (
        <span className="shrink-0 rounded-full bg-white/[0.06] px-2.5 py-1 text-[0.62rem] font-medium text-white/60">
          3 attenzioni
        </span>
      )}
    </div>
  );
}

export function Greeting({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        <p
          className={`${compact ? 'text-xl' : 'text-[1.9rem]'} font-semibold leading-none tracking-[-0.03em] text-white`}
        >
          Buongiorno!
        </p>
        <p className="mt-1.5 truncate text-[0.72rem] text-white/50">Casa pronta. 4 preferiti attivi.</p>
      </div>
      <div className="shrink-0 text-right leading-tight">
        <p className={`${compact ? 'text-lg' : 'text-2xl'} font-semibold tracking-tight text-white`}>21°</p>
        <p className="text-[0.66rem] text-white/45">Pioggia 12%</p>
      </div>
    </div>
  );
}

export function SideRail() {
  return (
    <nav
      aria-hidden
      className="flex w-14 shrink-0 flex-col items-center gap-2 rounded-[1.4rem] border border-white/[0.07] bg-white/[0.025] py-3"
    >
      <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-[0.7rem] font-semibold text-white/80">
        M
      </span>
      {NAV.map(({ icon: Icon, label }, index) => (
        <span
          key={label}
          className={`flex h-9 w-9 items-center justify-center rounded-xl ${
            index === 0 ? 'bg-[#1768d5] text-white shadow-[0_6px_20px_-6px_#1768d5]' : 'text-white/45'
          }`}
        >
          <Icon className="h-4 w-4" strokeWidth={1.9} />
        </span>
      ))}
      <span className="flex h-9 w-9 items-center justify-center text-white/45">
        <MoreHorizontal className="h-4 w-4" />
      </span>
      <span className="mt-auto flex h-9 w-9 items-center justify-center text-white/45">
        <Bell className="h-4 w-4" />
      </span>
      <span className="flex h-9 w-9 items-center justify-center text-white/45">
        <Settings className="h-4 w-4" />
      </span>
    </nav>
  );
}

export function BottomBar() {
  return (
    <nav
      aria-hidden
      className="flex items-center justify-around rounded-[1.4rem] border border-white/[0.08] bg-[#0d1220]/90 px-2 py-2 backdrop-blur-xl"
    >
      {NAV.map(({ icon: Icon, label }, index) => (
        <span
          key={label}
          className={`flex flex-col items-center gap-0.5 rounded-xl px-2 py-1 text-[0.55rem] font-medium ${
            index === 0 ? 'text-[#5ba8ff]' : 'text-white/45'
          }`}
        >
          <Icon className="h-4 w-4" strokeWidth={1.9} />
          {label}
        </span>
      ))}
      <span className="flex flex-col items-center gap-0.5 px-2 py-1 text-[0.55rem] font-medium text-white/45">
        <MoreHorizontal className="h-4 w-4" />
        Altro
      </span>
    </nav>
  );
}
