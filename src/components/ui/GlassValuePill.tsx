import React from 'react';
import clsx from 'clsx';
import type { GlassIndicatorProps, GlassMeaning } from './glassIndicator';

export type GlassValuePillProps = GlassIndicatorProps & {
  label: React.ReactNode;
  value: React.ReactNode;
  icon?: React.ReactNode;
  meaning?: GlassMeaning;
};

/* A value in a small pill, to put in a row. As the protagonist it grows with the name above it. */
export function GlassValuePill({ label, value, icon, meaning = 'off', size = 'group', className }: GlassValuePillProps) {
  return (
    <span className={clsx('glass-value-pill', `is-${size}`, className)}>
      {icon ? <i className={`glass-mean-${meaning}`} aria-hidden="true">{icon}</i> : null}
      <span>{label}</span>
      <b>{value}</b>
    </span>
  );
}

export default GlassValuePill;
