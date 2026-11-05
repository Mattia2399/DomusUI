import React from 'react';
import { clsx } from 'clsx';
import { ChevronLeft } from 'lucide-react';

export type PanelHeroProps = {
  /** While a shortcut has taken its place: the protagonist with its value, which goes back. */
  back?: { label: string; onPress: () => void };
  /** Under the protagonist and always in view, in one column: the positions of a cover. */
  below?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

/*
 * The space of the protagonist: all there is between the header and the row at the
 * bottom. It does not move and never scrolls; what stands in it can change.
 */
export function PanelHero({ back, below, children, className }: PanelHeroProps) {
  return (
    <div className={clsx('panel-hero', className)}>
      {back ? (
        <button type="button" className="panel-hero-back" onClick={back.onPress}>
          <ChevronLeft size={14} strokeWidth={2.6} aria-hidden="true" />
          <span>{back.label}</span>
        </button>
      ) : null}
      <div className="panel-hero-main">{children}</div>
      {below ? <div className="panel-hero-below">{below}</div> : null}
    </div>
  );
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
