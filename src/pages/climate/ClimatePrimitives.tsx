import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export const PANEL = 'rounded-[1.5rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass-soft)] shadow-[0_16px_34px_var(--ui-shadow-soft)] backdrop-blur-2xl';
export const MUTED = 'text-[color:var(--ui-text-secondary)]';

export function ClimateSectionHeading({ eyebrow, title, detail, action }: {
  eyebrow?: string; title: string; detail?: string; action?: ReactNode;
}) {
  return <div className="flex flex-wrap items-end justify-between gap-3 px-1">
    <div className="min-w-0">
      {eyebrow && <p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${MUTED}`}>{eyebrow}</p>}
      <h2 className="mt-1 text-xl font-semibold tracking-[-0.035em] text-[color:var(--ui-text-primary)] sm:text-2xl">{title}</h2>
      {detail && <p className={`mt-1 max-w-2xl text-sm leading-6 ${MUTED}`}>{detail}</p>}
    </div>
    {action}
  </div>;
}

export function ClimateIcon({ icon: Icon, tone = 'warm' }: { icon: LucideIcon; tone?: 'warm' | 'cool' | 'neutral' }) {
  const color = tone === 'warm' ? 'bg-orange-500/12 text-orange-500' : tone === 'cool' ? 'bg-sky-500/12 text-sky-500' : 'bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]';
  return <span aria-hidden="true" className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${color}`}><Icon size={20} strokeWidth={1.8} /></span>;
}

export function ClimateInfoRow({ label, value, detail, icon: Icon }: {
  label: string; value: ReactNode; detail?: ReactNode; icon?: LucideIcon;
}) {
  return <div className="flex min-h-16 items-center gap-3 border-b border-[color:var(--ui-separator)] px-4 py-3 last:border-b-0">
    {Icon && <ClimateIcon icon={Icon} tone="neutral" />}
    <div className="min-w-0 flex-1">
      <p className={`text-xs ${MUTED}`}>{label}</p>
      <div className="mt-0.5 text-sm font-semibold text-[color:var(--ui-text-primary)]">{value}</div>
      {detail && <div className={`mt-0.5 text-xs leading-5 ${MUTED}`}>{detail}</div>}
    </div>
  </div>;
}
