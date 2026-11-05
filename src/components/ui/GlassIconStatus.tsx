import React from 'react';
import clsx from 'clsx';
import type { GlassIndicatorProps, GlassMeaning } from './glassIndicator';

export type GlassIconStatusProps = GlassIndicatorProps & {
  icon: React.ReactNode;
  title: React.ReactNode;
  note?: React.ReactNode;
  meaning?: GlassMeaning;
};

/* A large icon coloured by the state, with name and explanation: sensors that say yes or no. */
export function GlassIconStatus({ icon, title, note, meaning = 'off', size = 'group', className }: GlassIconStatusProps) {
  return (
    <div className={clsx('glass-icon-status', `is-${size}`, className)}>
      <i className={`glass-tint-${meaning}`} aria-hidden="true">{icon}</i>
      <span>
        <b>{title}</b>
        {note ? <span>{note}</span> : null}
      </span>
    </div>
  );
}

export default GlassIconStatus;
