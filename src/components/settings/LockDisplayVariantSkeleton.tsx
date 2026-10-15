import React from 'react';
import type { WidgetDisplayVariant } from '../widgets/widgetDisplayVariant';

type LockDisplayVariantSkeletonProps = {
  variant: WidgetDisplayVariant;
  active: boolean;
  disabled: boolean;
};

// A miniature of the ring lock card: the ring with its two laps, the state and,
// in the expanded size, the details list.
export function LockDisplayVariantSkeleton({ variant, active, disabled }: LockDisplayVariantSkeletonProps) {
  const tone = disabled ? 'var(--ui-text-disabled)' : active ? 'var(--ui-accent)' : 'var(--ui-success)';
  const strong = disabled ? 'bg-[color:var(--ui-fill-tertiary)]' : 'bg-[color:var(--ui-fill-primary)]';
  const soft = disabled ? 'bg-[color:var(--ui-fill-tertiary)]' : 'bg-[color:var(--ui-fill-secondary)]';
  const frame = 'dashboard-content-surface-soft relative overflow-hidden rounded-[0.82rem] p-2';

  const ring = (size: string, stroke: number) => (
    <span
      className={`relative inline-flex ${size} shrink-0 items-center justify-center rounded-full`}
      style={{ background: `color-mix(in srgb, ${tone} 16%, transparent)` }}
    >
      <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="44" fill="none" stroke={tone} strokeWidth={stroke} strokeLinecap="round" pathLength={100} strokeDasharray="62 100" />
        {disabled ? null : (
          <circle
            cx="50"
            cy="50"
            r="44"
            fill="none"
            stroke="var(--ui-accent)"
            strokeWidth={stroke}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray="0 66 22 100"
            opacity={active ? 1 : 0.55}
          />
        )}
      </svg>
      <span
        className="h-[66%] w-[66%] rounded-full"
        style={{ background: disabled ? 'var(--ui-fill-secondary)' : `color-mix(in srgb, ${tone} 88%, #000000)` }}
      />
    </span>
  );

  const line = (width: string, className = strong, height = 'h-1.5') => (
    <span className={`block ${height} ${width} rounded-full ${className}`} />
  );

  if (variant === 'mini') {
    return (
      <div className="flex h-[4.75rem] items-center" aria-hidden="true">
        <div className={`${frame} flex h-[4.35rem] w-full flex-col justify-between`}>
          {ring('h-7 w-7', 9)}
          <span className="flex flex-col gap-1">
            {line('w-[54%]', soft, 'h-1')}
            {line('w-[72%]', strong, 'h-2')}
          </span>
        </div>
      </div>
    );
  }

  if (variant === 'compact' || variant === 'standard') {
    return (
      <div className="flex h-[4.75rem] items-center" aria-hidden="true">
        <div className={`${frame} flex h-[4.35rem] w-full flex-col gap-1.5`}>
          <span className="flex items-center justify-between gap-2">
            {line('w-[42%]', soft, 'h-1')}
            {line('w-[22%]', soft, 'h-1')}
          </span>
          <span className="flex min-h-0 flex-1 items-center gap-2">
            {ring('h-9 w-9', 6)}
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              {line('w-[64%]', strong, 'h-2')}
              {line('w-[86%]', soft, 'h-1')}
            </span>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[4.75rem] items-center" aria-hidden="true">
      <div className={`${frame} flex h-[4.6rem] w-full flex-col gap-[3px]`}>
        <span className="flex items-center justify-between gap-2">
          {line('w-[40%]', strong, 'h-1')}
          <span className={`h-2 w-5 rounded-full ${soft}`} />
        </span>
        <span className="flex flex-col items-center gap-[3px]">
          {ring('h-5 w-5', 8)}
          {line('w-[36%]', strong, 'h-1')}
        </span>
        <span className={`mt-auto flex flex-col gap-[3px] rounded-[0.4rem] px-1.5 py-[3px] ${soft}`}>
          <span className="flex justify-between">
            {line('w-[30%]', strong, 'h-[3px]')}
            {line('w-[18%]', strong, 'h-[3px]')}
          </span>
          <span className="flex justify-between">
            {line('w-[38%]', strong, 'h-[3px]')}
            {line('w-[14%]', strong, 'h-[3px]')}
          </span>
        </span>
      </div>
    </div>
  );
}
