import React from 'react';
import { CalendarDays } from 'lucide-react';
import type { WidgetDisplayVariant } from '../widgets/widgetDisplayVariant';

export function CalendarDisplayVariantSkeleton({
  variant,
  active,
  disabled,
}: {
  variant: WidgetDisplayVariant;
  active: boolean;
  disabled: boolean;
}) {
  const accent = active ? 'text-emerald-300 bg-emerald-400/15' : 'text-[color:var(--ui-text-tertiary)] bg-[color:var(--ui-fill-secondary)]';
  const muted = disabled ? 'bg-[color:var(--ui-fill-tertiary)]' : 'bg-[color:var(--ui-fill-primary)]';
  const compact = variant === 'mini' || variant === 'compact';
  return (
    <div className="flex h-[4.75rem] items-center justify-center" aria-hidden="true">
      <div className="dashboard-content-surface-soft flex h-[4.25rem] w-full flex-col overflow-hidden rounded-[0.82rem] p-2">
        <div className="flex items-center gap-2">
          <span className={`flex h-6 w-6 items-center justify-center rounded-full ${accent}`}><CalendarDays size={12} /></span>
          <span className="min-w-0 flex-1 space-y-1"><span className={`block h-1.5 w-3/5 rounded-full ${muted}`} /><span className={`block h-1 w-2/5 rounded-full ${muted}`} /></span>
        </div>
        {!compact ? <div className="mt-2 min-h-0 flex-1 rounded-lg bg-[color:var(--ui-fill-tertiary)] p-1.5"><span className={`block h-1.5 w-3/4 rounded-full ${muted}`} />{variant === 'full' ? <span className={`mt-1.5 block h-1 w-1/2 rounded-full ${muted}`} /> : null}</div> : null}
      </div>
    </div>
  );
}
