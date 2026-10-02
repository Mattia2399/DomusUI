import React from 'react';
import { FlaskConical } from 'lucide-react';
import NestedPageHeader from '../../components/ui/NestedPageHeader';

export type IntervalKey = '24H' | '7G' | '30G';

export function DetailScaffold({
  title,
  onBack,
  left,
  right,
  children,
}: {
  title: string;
  onBack: () => void;
  left?: React.ReactNode;
  right?: React.ReactNode;
  /** Full-width content replacing the two-column layout. */
  children?: React.ReactNode;
}) {
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  return (
    <div ref={scrollContainerRef} className="h-full w-full overflow-y-auto">
      <NestedPageHeader
        title={title}
        subtitle="Analisi consumi e andamento"
        backLabel="Consumi"
        backAriaLabel="Torna a Consumi"
        onBack={onBack}
        scrollContainerRef={scrollContainerRef}
        trailing={(
          <span className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-3 text-[10px] font-semibold uppercase tracking-[0.13em] text-[color:var(--ui-text-secondary)]">
            <FlaskConical size={13} />
            <span className="hidden sm:inline">Anteprima beta</span>
            <span className="sm:hidden">Beta</span>
          </span>
        )}
      />

      <div className="px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-4 sm:px-6 sm:pb-6 sm:pt-6 lg:px-8 lg:pb-8">
        {children ?? (
        <div className="grid min-h-0 grid-cols-1 gap-4 lg:gap-6 xl:grid-cols-12 xl:gap-8">
          <div className="liquid-glass-card relative flex min-h-[24rem] items-center justify-center overflow-hidden p-3 sm:min-h-[32rem] sm:p-6 lg:p-8 xl:col-span-7 xl:min-h-0">
            {left}
          </div>

          <div className="flex flex-col gap-4 overflow-visible pr-0 sm:gap-6 xl:col-span-5 xl:pr-1">
            {right}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

export function ChartCard({
  title,
  controls,
  children,
}: {
  title: string;
  controls?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="liquid-glass-card p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium uppercase tracking-[0.14em] text-[color:var(--ui-text-tertiary)]">{title}</p>
        {controls}
      </div>
      <div className="h-48 min-h-48 min-w-0 sm:h-56">{children}</div>
    </div>
  );
}

type TooltipPayload = {
  name?: string;
  value?: string | number;
  color?: string;
};

export function PremiumTooltip({
  active,
  payload,
  label,
  suffix = '',
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string | number;
  suffix?: string;
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <div className="liquid-glass-card rounded-xl px-3 py-2 text-sm text-[color:var(--ui-text-primary)]">
      {label !== undefined ? <p className="mb-1 text-xs text-[color:var(--ui-text-secondary)]">{label}</p> : null}
      <div className="space-y-1">
        {payload.map((item, index) => (
          <div key={`${item.name ?? 'value'}-${index}`} className="flex items-center justify-between gap-4">
            <span className="text-[color:var(--ui-text-secondary)]">{item.name ?? 'Valore'}</span>
            <span className="font-semibold text-[color:var(--ui-text-primary)]">
              {item.value}
              {suffix}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
