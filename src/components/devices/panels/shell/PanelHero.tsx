import React from 'react';
import { clsx } from 'clsx';

/*
 * The space of the protagonist: a slider, a card of data, the colour disc. It takes
 * what the header, the zone below and the footer leave, and those have fixed heights:
 * so it does not change height or place, whatever the zone below holds.
 */
export function PanelHero({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={clsx('panel-hero', className)}>{children}</div>;
}

/** Where there is nothing to drag: what it is doing, large. */
export function PanelHeroValue({ value, note, icon }: { value: React.ReactNode; note?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="panel-hero-value">
      {icon ? (
        <span className="panel-hero-value-icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <b>{value}</b>
      {note ? <span>{note}</span> : null}
    </div>
  );
}

export default PanelHero;
