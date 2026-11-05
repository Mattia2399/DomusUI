import React from 'react';
import { clsx } from 'clsx';
import { ChevronRight } from 'lucide-react';

export type PanelGroup = {
  key: string;
  icon?: React.ReactNode;
  /** The icon takes the colour of the device: this is in use. */
  lit?: boolean;
  title: string;
  /** What it is set to now, beside the title. */
  value?: React.ReactNode;
  /** A switch or a button at the end of the title. */
  trailing?: React.ReactNode;
  note?: React.ReactNode;
  children?: React.ReactNode;
};

/** The last row: what is in Altro, with its main values already in view. */
export type PanelMoreRow = {
  icon: React.ReactNode;
  lit?: boolean;
  title: string;
  count: string;
  summary: string;
  onPress: () => void;
};

/* In the column and at the right of a dialog: every main control in view, in the order of the row of a phone. */
export function PanelGroups({ groups, before, more }: { groups: readonly PanelGroup[]; before?: React.ReactNode; more?: PanelMoreRow }) {
  return (
    <div className="panel-groups">
      {before}
      {groups.map((group) => (
        <section key={group.key} className="panel-group" aria-label={group.title}>
          <div className="panel-group-head">
            {group.icon ? (
              <span className={clsx('panel-group-icon', group.lit && 'is-lit')} aria-hidden="true">
                {group.icon}
              </span>
            ) : null}
            <b>{group.title}</b>
            {group.value !== undefined ? <span className="panel-group-value">{group.value}</span> : null}
            {group.trailing ? <span className="panel-group-trailing">{group.trailing}</span> : null}
          </div>
          {group.children}
          {group.note ? <p className="panel-group-note">{group.note}</p> : null}
        </section>
      ))}
      {more ? (
        <button type="button" className="panel-group panel-group-more" onClick={more.onPress}>
          <span className="panel-group-head">
            <span className={clsx('panel-group-icon', more.lit && 'is-lit')} aria-hidden="true">
              {more.icon}
            </span>
            <b>{more.title}</b>
            <span className="panel-group-value">{more.count}</span>
            <ChevronRight className="panel-group-trailing" size={18} strokeWidth={2.2} aria-hidden="true" />
          </span>
          {more.summary ? <span className="panel-group-summary">{more.summary}</span> : null}
        </button>
      ) : null}
    </div>
  );
}

export default PanelGroups;
