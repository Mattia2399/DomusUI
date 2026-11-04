import React from 'react';

export type PanelGroup = {
  key: string;
  icon?: React.ReactNode;
  title: string;
  /** What it is set to now, beside the title. */
  value?: React.ReactNode;
  children?: React.ReactNode;
};

/* In two columns, at the right of the protagonist: every control in view, in groups, with no shortcuts. */
export function PanelGroups({ groups }: { groups: readonly PanelGroup[] }) {
  return (
    <div className="panel-groups">
      {groups.map((group) => (
        <section key={group.key} className="panel-group" aria-label={group.title}>
          <div className="panel-group-head">
            {group.icon ? (
              <span className="panel-group-icon" aria-hidden="true">
                {group.icon}
              </span>
            ) : null}
            <b>{group.title}</b>
            {group.value !== undefined ? <span>{group.value}</span> : null}
          </div>
          {group.children}
        </section>
      ))}
    </div>
  );
}

export default PanelGroups;
