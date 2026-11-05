import React from 'react';
import clsx from 'clsx';
import type { GlassIndicatorProps } from './glassIndicator';

export type GlassConnectionProps = GlassIndicatorProps & {
  /** From 0 (offline) to 4 notches. */
  bars: number;
  label: React.ReactNode;
  note?: React.ReactNode;
};

/** How many notches a signal in dBm is worth. */
export const barsOfSignal = (dbm: number) => (dbm >= -55 ? 4 : dbm >= -67 ? 3 : dbm >= -78 ? 2 : dbm >= -90 ? 1 : 0);

/* The notches of the signal with online or offline and when it was last seen. */
export function GlassConnection({ bars, label, note, size = 'group', className }: GlassConnectionProps) {
  return (
    <div className={clsx('glass-connection', `is-${size}`, className)}>
      <i aria-hidden="true">
        {[1, 2, 3, 4].map((notch) => (
          <i key={notch} className={clsx(notch <= bars && (bars >= 2 ? 'glass-fill-ok' : 'glass-fill-warn'))} style={{ height: `${notch * 25}%` }} />
        ))}
      </i>
      <span>
        <b>{label}</b>
        {note ? <span>{note}</span> : null}
      </span>
    </div>
  );
}

export default GlassConnection;
