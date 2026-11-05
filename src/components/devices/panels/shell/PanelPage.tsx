import React from 'react';
import { ChevronLeft } from 'lucide-react';

export type PanelPageProps = {
  title: string;
  /** What it is set to now, at the end of the title. */
  sub?: React.ReactNode;
  backLabel: string;
  onBack: () => void;
  /** A control at full size, that holds its own space: not a list. */
  fill?: boolean;
  children: React.ReactNode;
};

/* A list at full height under the header of the panel: only the list scrolls, and the row at the bottom steps aside. */
export function PanelPage({ title, sub, backLabel, onBack, fill = false, children }: PanelPageProps) {
  return (
    <div className="panel-page">
      <div className="panel-page-head">
        <button type="button" className="panel-page-back" aria-label={backLabel} onClick={onBack}>
          <ChevronLeft size={18} strokeWidth={2.4} aria-hidden="true" />
        </button>
        <h3>{title}</h3>
        {sub !== undefined && sub !== null && sub !== '' ? <span>{sub}</span> : null}
      </div>
      <div className={fill ? 'panel-page-fill' : 'panel-page-list'}>{children}</div>
    </div>
  );
}

/** A title between the rows of a page. */
export function PanelPageHeading({ children }: { children: React.ReactNode }) {
  return <p className="panel-page-heading">{children}</p>;
}

export default PanelPage;
