import React from 'react';
import clsx from 'clsx';
import { PanelSurfaceContext, type PanelSurface } from './panelSurface';
import './panelShell.css';

/*
 * The skeleton of a panel, for every device and every page. It looks as what holds
 * it: the sheet of a phone, the neutral column of the Home, or the dialog of Rooms.
 * The width only decides one column or two (above 520 px), through a container query.
 * Rules: docs/design/pannelli/NOTA-regole-pannelli.md
 */

export type { PanelSurface } from './panelSurface';

/** The colour of the device: a CSS colour, what reads on it, and the same colour as "r g b". */
export type PanelAccent = { color: string; ink: string; rgb: string };

/** The states every panel has in common, from usePanelLiveState. */
export type PanelLive = {
  /** The device does not answer: its controls are off. */
  off?: boolean;
  notice?: React.ReactNode;
};

export type PanelShellProps = {
  /** Only outside a host, as on the page of the tests: a sheet or a dialog says it through the context. */
  surface?: PanelSurface;
  accent?: PanelAccent;
  /** Whether a sheet or a dialog takes the colour of the device: not while it is off. The column never does. */
  tint?: boolean;
  /** The device does not answer: its controls can be read, not pressed. */
  off?: boolean;
  /** What drags the sheet away, outside a host. */
  handle?: React.ReactNode;
  header: React.ReactNode;
  /** PanelStates, between the header and the rest. */
  states?: React.ReactNode;
  hero?: React.ReactNode;
  /** The row at the bottom, on a phone. */
  nav?: React.ReactNode;
  /** In the column under the hero, in a dialog at its right. */
  groups?: React.ReactNode;
  /** On a phone and in the column in place of everything else; in a dialog at the right of the hero. */
  page?: React.ReactNode;
  /** Only on a phone: elsewhere the groups already say it. */
  pagePhoneOnly?: boolean;
  /** A panel with a structure of its own, under the same header and footer. */
  children?: React.ReactNode;
  className?: string;
};

/** A sheet or a dialog is painted as a whole, up to its edges: the colour goes on it. */
function useHostTint(ref: React.RefObject<HTMLDivElement | null>, rgb: string | null) {
  React.useLayoutEffect(() => {
    const host = ref.current?.closest<HTMLElement>('.device-context-surface, [role="dialog"]');
    if (!host || !rgb) return undefined;
    host.style.setProperty('--device-accent-rgb', rgb);
    host.classList.add('panel-host-tinted');
    return () => {
      host.classList.remove('panel-host-tinted');
      host.style.removeProperty('--device-accent-rgb');
    };
  }, [ref, rgb]);
}

export function PanelShell({ surface, accent, tint = true, off = false, handle, header, states, hero, nav, groups, page, pagePhoneOnly = false, children, className }: PanelShellProps) {
  const held = React.useContext(PanelSurfaceContext);
  const hosted = surface === undefined;
  const shape = surface ?? held ?? 'column';
  const root = React.useRef<HTMLDivElement>(null);
  const tinted = tint && shape !== 'column' && Boolean(accent);
  useHostTint(root, hosted && tinted && accent ? accent.rgb : null);
  const style = accent
    ? ({ '--device-accent': accent.color, '--device-accent-ink': accent.ink, '--device-accent-rgb': accent.rgb } as React.CSSProperties)
    : undefined;
  return (
    <div
      ref={root}
      className={clsx('panel-shell', hosted && 'is-hosted', tinted && !hosted && 'is-tinted', off && 'is-off', Boolean(page) && 'has-page', pagePhoneOnly && 'has-phone-page', className)}
      data-surface={shape}
      style={style}
    >
      {shape === 'sheet' && !hosted ? handle ?? <span className="panel-shell-handle" aria-hidden="true" /> : null}
      <div className="panel-shell-body">
        {header}
        {states}
        {children !== undefined ? (
          <div className="panel-shell-free" inert={off || undefined}>
            {children}
          </div>
        ) : (
          <>
            <div className="panel-shell-main" inert={off || undefined}>
              {hero}
              {nav}
              <div className="panel-side">
                {groups}
                {page}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default PanelShell;
