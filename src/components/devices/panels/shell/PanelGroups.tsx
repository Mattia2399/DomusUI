import React from 'react';
import { clsx } from 'clsx';

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

/* In two columns, at the right of the protagonist: every control in view, in groups, with no shortcuts. */
export function PanelGroups({ groups, before }: { groups: readonly PanelGroup[]; before?: React.ReactNode }) {
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
    </div>
  );
}

export default PanelGroups;
