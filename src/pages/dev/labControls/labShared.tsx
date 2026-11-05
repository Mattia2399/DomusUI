import React from 'react';

/* What the cards of the newer controls have in common, in development only. */

export const LAB_STATES = [
  ['normale', {}],
  ['disabilitato', { disabled: true }],
  ['in attesa', { pending: true }],
  ['errore', { error: true }],
] as const;

export function LabCard({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section className="lab-card" data-testid={`lab-${id}`}>
      <h3>
        <code>{id}</code> {title}
      </h3>
      <div className="lab-card-body">{children}</div>
    </section>
  );
}

export function LabNamed({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="lab-named">
      <span>{name}</span>
      {children}
    </div>
  );
}

/** The space of a protagonist, to see a large version fill it. */
export function LabHero({ children }: { children: React.ReactNode }) {
  return (
    <LabNamed name="grande">
      <div className="lab-hero-frame">{children}</div>
    </LabNamed>
  );
}
