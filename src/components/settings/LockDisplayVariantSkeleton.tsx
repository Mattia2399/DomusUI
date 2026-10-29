import React from 'react';
import type { WidgetDisplayVariant } from '../widgets/widgetDisplayVariant';

type LockDisplayVariantSkeletonProps = {
  variant: WidgetDisplayVariant;
  active: boolean;
  disabled: boolean;
  /** The phone grid (sm, xs): its sizes are one size smaller in shape. */
  phone?: boolean;
};

// A miniature of the ring lock card at each grid size: the ring with its two laps,
// the state and, when expanded on a wide grid, the details list.
export function LockDisplayVariantSkeleton({ variant, active, disabled, phone = false }: LockDisplayVariantSkeletonProps) {
  const tone = disabled ? 'var(--ui-text-disabled)' : active ? 'var(--ui-accent)' : '#12a372';
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
            stroke="#0a84ff"
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
        style={{ background: disabled ? 'var(--ui-fill-secondary)' : tone }}
      />
    </span>
  );

  const line = (width: string, className = strong, height = 'h-1.5') => (
    <span className={`block ${height} ${width} rounded-full ${className}`} />
  );

  // A tile: the ring on top, the name and state below.
  const tile = (
    <div className={`${frame} flex h-[4.35rem] w-full flex-col justify-between`}>
      {ring('h-7 w-7', 9)}
      <span className="flex flex-col gap-1">
        {line('w-[54%]', soft, 'h-1')}
        {line('w-[72%]', strong, 'h-2')}
      </span>
    </div>
  );

  // Wide: name and last change, then the ring beside the state.
  const wide = (
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
  );

  // Compact (phone mini): the ring with its hint, the name and state below.
  const compact = (
    <div className={`${frame} flex h-[3.4rem] w-full flex-col justify-between`}>
      <span className="flex items-center gap-1.5">
        {ring('h-5 w-5', 10)}
        {line('w-[48%]', soft, 'h-1')}
      </span>
      <span className="flex flex-col gap-1">
        {line('w-[50%]', soft, 'h-1')}
        {line('w-[66%]', strong, 'h-1.5')}
      </span>
    </div>
  );

  // Panorama (expanded on tablet and desktop): the state on the left, the details on the right.
  const panorama = (
    <div className={`${frame} flex h-[4.35rem] w-full flex-col gap-1.5`}>
      <span className="flex items-center justify-between gap-2">
        {line('w-[38%]', strong, 'h-1')}
        <span className={`h-2 w-5 rounded-full ${soft}`} />
      </span>
      <span className="grid min-h-0 flex-1 grid-cols-2 items-center gap-2">
        <span className="flex flex-col items-center gap-1">
          {ring('h-7 w-7', 8)}
          {line('w-[60%]', strong, 'h-1')}
        </span>
        <span className={`flex flex-col gap-[3px] rounded-[0.4rem] px-1.5 py-1 ${soft}`}>
          <span className="flex justify-between">
            {line('w-[42%]', strong, 'h-[3px]')}
            {line('w-[22%]', strong, 'h-[3px]')}
          </span>
          <span className="flex justify-between">
            {line('w-[50%]', strong, 'h-[3px]')}
            {line('w-[18%]', strong, 'h-[3px]')}
          </span>
        </span>
      </span>
    </div>
  );

  // The same size name draws a different shape on a phone grid and on a wide one.
  const shape = phone
    ? variant === 'mini' ? compact : variant === 'full' ? wide : tile
    : variant === 'mini' ? tile : variant === 'full' ? panorama : wide;

  return (
    <div className="flex h-[4.75rem] items-center" aria-hidden="true">
      {shape}
    </div>
  );
}
