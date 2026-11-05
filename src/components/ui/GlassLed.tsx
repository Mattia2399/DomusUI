import React from 'react';
import clsx from 'clsx';
import type { GlassIndicatorProps, GlassMeaning } from './glassIndicator';

export type GlassLedProps = GlassIndicatorProps & {
  label: React.ReactNode;
  note?: React.ReactNode;
  meaning?: GlassMeaning;
  blink?: boolean;
};

/* A point of light that can be seen from afar, steady or blinking for what is under way. */
export function GlassLed({ label, note, meaning = 'off', blink = false, size = 'group', className }: GlassLedProps) {
  return (
    <div className={clsx('glass-led', `is-${size}`, className)}>
      <i className={clsx(`glass-light-${meaning}`, blink && 'is-blinking')} aria-hidden="true" />
      <span>
        <b>{label}</b>
        {note ? <span>{note}</span> : null}
      </span>
    </div>
  );
}

export default GlassLed;
