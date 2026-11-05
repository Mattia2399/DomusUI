import React from 'react';
import clsx from 'clsx';
import type { GlassIndicatorProps, GlassMeaning } from './glassIndicator';

export type GlassStatusGlowProps = GlassIndicatorProps & {
  title: React.ReactNode;
  note?: React.ReactNode;
  meaning?: GlassMeaning;
};

/* A box that glows with the colour of the state, for the one message that must jump to the eye. */
export function GlassStatusGlow({ title, note, meaning = 'ok', size = 'group', className }: GlassStatusGlowProps) {
  return (
    <div role={meaning === 'bad' ? 'alert' : undefined} className={clsx('glass-status-glow', `is-${size}`, `glass-tint-${meaning}`, className)}>
      <b>{title}</b>
      {note ? <span>{note}</span> : null}
    </div>
  );
}

export default GlassStatusGlow;
