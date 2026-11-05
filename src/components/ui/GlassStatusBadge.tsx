import React from 'react';
import clsx from 'clsx';
import type { GlassIndicatorProps, GlassMeaning } from './glassIndicator';

export type GlassStatusBadgeProps = GlassIndicatorProps & {
  label: React.ReactNode;
  meaning?: GlassMeaning;
  icon?: React.ReactNode;
};

/* A label of state with the colour of what it means. */
export function GlassStatusBadge({ label, meaning = 'off', icon, size = 'group', className }: GlassStatusBadgeProps) {
  return (
    <span className={clsx('glass-status-badge', `is-${size}`, `glass-tint-${meaning}`, className)}>
      {icon ? <i aria-hidden="true">{icon}</i> : null}
      {label}
    </span>
  );
}

export default GlassStatusBadge;
