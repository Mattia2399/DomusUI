import React from 'react';
import clsx from 'clsx';
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import type { GlassIndicatorProps, GlassMeaning } from './glassIndicator';

export type GlassTrendProps = GlassIndicatorProps & {
  direction: 'up' | 'down' | 'flat';
  label: React.ReactNode;
  /** What the change means here: rising heat is fine, rising damp is not. */
  meaning?: GlassMeaning;
};

const ICONS = { up: ArrowUpRight, down: ArrowDownRight, flat: ArrowRight };

/* An arrow and the change over a period, coloured by what it means. */
export function GlassTrend({ direction, label, meaning = 'off', size = 'group', className }: GlassTrendProps) {
  const Icon = ICONS[direction];
  return (
    <p className={clsx('glass-trend', `is-${size}`, `glass-mean-${meaning}`, className)}>
      <Icon size={size === 'hero' ? 40 : 18} strokeWidth={2.4} aria-hidden="true" />
      <span>{label}</span>
    </p>
  );
}

export default GlassTrend;
