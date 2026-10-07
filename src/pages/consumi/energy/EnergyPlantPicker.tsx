import type { EnergyModuleId } from '../../../services/energyCoreClient';

/* House illustration of the guided setup: only the hardware the plant has. */

/** Line drawing of a house with only the installed hardware around it. */
export function PlantIllustration({ modules, className = '' }: { modules: EnergyModuleId[]; className?: string }) {
  const has = (id: EnergyModuleId) => modules.includes(id);
  const other = modules.length === 0;
  return (
    <svg viewBox="0 0 176 100" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" className={className} aria-hidden="true">
      <path d="M8 88h160" stroke="currentColor" strokeOpacity=".25" className="text-[color:var(--ui-text-secondary)]" />
      <g stroke="currentColor" className="text-[color:var(--ui-text-secondary)]" strokeDasharray={other ? '3 3' : undefined}>
        <path d="M62 57v31h52V57" />
        <path d="M56 57l14-23h36l14 23" />
        <rect x="80" y="70" width="12" height="18" rx="1" />
        <rect x="67" y="64" width="8" height="8" rx="1" />
        <rect x="98" y="64" width="9" height="8" rx="1" />
      </g>
      {other ? (
        <g stroke="currentColor" className="text-[color:var(--ui-accent)]">
          <circle cx="138" cy="34" r="12" />
          <path d="M138 28v12M132 34h12" />
        </g>
      ) : null}
      {has('grid') ? (
        <g stroke="currentColor" className="text-sky-500">
          <path d="M26 88V22M15 30h22M19 38h14M21 30l5-8 5 8" />
          <circle cx="15" cy="28" r="1.4" fill="currentColor" />
          <circle cx="37" cy="28" r="1.4" fill="currentColor" />
          <path d="M37 30q14 12 25 28" strokeDasharray="2 2.5" />
        </g>
      ) : null}
      {has('solar') ? (
        <g stroke="currentColor" className="text-amber-500">
          <path d="M66 53l9-15h26l9 15z" fill="currentColor" fillOpacity=".18" />
          <path d="M83.7 38l-3 15M92.3 38l3 15M70.5 45.5h35" strokeWidth="1.1" />
        </g>
      ) : null}
      {has('battery') ? (
        <g stroke="currentColor" className="text-emerald-500">
          <rect x="46" y="67" width="11" height="21" rx="2" />
          <path d="M49.5 64.5h4" strokeWidth="2.2" />
          <rect x="48.5" y="76" width="6" height="9.5" rx=".8" fill="currentColor" fillOpacity=".55" stroke="none" />
        </g>
      ) : null}
      {has('wallbox') ? (
        <g stroke="currentColor" className="text-violet-500">
          <rect x="121" y="60" width="9" height="13" rx="2" />
          <path d="M125.5 73v15M125.5 70q2 10 12 9" />
          <path d="M136 86v-5q1-6 7-7h11q5 0 8 6l3 1v5z" fill="currentColor" fillOpacity=".15" />
          <circle cx="142" cy="87" r="3" fill="var(--ui-surface-primary)" />
          <circle cx="158" cy="87" r="3" fill="var(--ui-surface-primary)" />
        </g>
      ) : null}
    </svg>
  );
}
