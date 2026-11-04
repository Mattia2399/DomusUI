import React from 'react';
import clsx from 'clsx';
import './panelShell.css';

/*
 * The skeleton of a panel, for every device and every page. Whoever opens it says
 * the surface, and the surface is what it looks like: the sheet of a phone, the
 * neutral column of the Home, or the dialog of Rooms. The width only decides one
 * column or two (above 520 px), through a container query. Portal, focus and drag
 * stay with whoever hosts it. Rules: docs/design/pannelli/NOTA-regole-pannelli.md
 */

export type PanelSurface = 'sheet' | 'column' | 'dialog';

/** The colour of the device: a CSS colour, what reads on it, and the same colour as "r g b". */
export type PanelAccent = { color: string; ink: string; rgb: string };

export type PanelShellProps = {
  surface: PanelSurface;
  accent?: PanelAccent;
  /** Whether a sheet or a dialog takes the colour of the device: not while it is off. The column never does. */
  tint?: boolean;
  /** What drags the sheet away, from whoever hosts it. */
  handle?: React.ReactNode;
  header: React.ReactNode;
  /** PanelStates, between the header and the rest. */
  states?: React.ReactNode;
  hero: React.ReactNode;
  /** Shown in one column. */
  controls?: React.ReactNode;
  /** Shown in two columns, at the right of the hero. */
  groups?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
};

export function PanelShell({ surface, accent, tint = true, handle, header, states, hero, controls, groups, footer, className }: PanelShellProps) {
  const style = accent
    ? ({ '--device-accent': accent.color, '--device-accent-ink': accent.ink, '--device-accent-rgb': accent.rgb } as React.CSSProperties)
    : undefined;
  return (
    <div
      className={clsx('panel-shell', tint && surface !== 'column' && Boolean(accent) && 'is-tinted', className)}
      data-surface={surface}
      style={style}
    >
      {surface === 'sheet' ? handle ?? <span className="panel-shell-handle" aria-hidden="true" /> : null}
      <div className="panel-shell-body">
        {header}
        {states}
        <div className="panel-shell-main">
          {hero}
          {controls}
          {groups}
        </div>
        {footer}
      </div>
    </div>
  );
}

export default PanelShell;
