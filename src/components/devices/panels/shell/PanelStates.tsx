import React from 'react';
import { clsx } from 'clsx';
import { AlertCircle, BatteryLow, Clock3 } from 'lucide-react';
import { usePanelLiveTranslations } from '../../../../i18n/panelLiveTranslations';

/* A device has this long to confirm a command, then the panel says it has not answered. */
export const PANEL_COMMAND_LIMIT_MS = 10_000;

export type PanelStateValue =
  | { kind: 'unavailable'; since?: string; lastKnown?: { state: string; time: string }; onRetry?: () => void; homeAssistantHref?: string }
  | { kind: 'stale'; since: string; lastAt: string; battery?: number | null }
  /** `startedAt` starts the wait over: a new command is under way. */
  | { kind: 'pending'; startedAt: number; limitMs?: number }
  | { kind: 'none' };

/* The three states every panel has in common: it does not answer, its data are old, a command waits. */
export function PanelStates({ state }: { state: PanelStateValue }) {
  const pt = usePanelLiveTranslations();
  const startedAt = state.kind === 'pending' ? state.startedAt : null;
  const limitMs = state.kind === 'pending' ? state.limitMs ?? PANEL_COMMAND_LIMIT_MS : PANEL_COMMAND_LIMIT_MS;
  const [expired, setExpired] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (startedAt === null) return undefined;
    const timer = window.setTimeout(() => setExpired(startedAt), Math.max(0, startedAt + limitMs - Date.now()));
    return () => window.clearTimeout(timer);
  }, [limitMs, startedAt]);

  if (state.kind === 'unavailable') {
    return (
      <div className="panel-state is-off" role="status">
        <AlertCircle size={18} strokeWidth={2.2} aria-hidden="true" />
        <span>
          <b>{state.since ? pt('lvAwayFor', { time: state.since }) : pt('lvAway')}</b>
          {state.lastKnown ? <span>{pt('lvLastKnown', state.lastKnown)}</span> : null}
          <span>{pt('lvAwayTip')}</span>
          {state.onRetry || state.homeAssistantHref ? (
            <span className="panel-state-actions">
              {state.onRetry ? (
                <button type="button" onClick={state.onRetry}>
                  {pt('lvRetry')}
                </button>
              ) : null}
              {state.homeAssistantHref ? (
                <a href={state.homeAssistantHref} target="_blank" rel="noreferrer">
                  {pt('lvOpenHa')}
                </a>
              ) : null}
            </span>
          ) : null}
        </span>
      </div>
    );
  }

  if (state.kind === 'stale') {
    const lowBattery = typeof state.battery === 'number' && state.battery <= 20;
    const Icon = lowBattery ? BatteryLow : Clock3;
    return (
      <div className="panel-state is-warning" role="status">
        <Icon size={18} strokeWidth={2.2} aria-hidden="true" />
        <span>
          <b>{pt('lvStale', { time: state.since })}</b>
          <span>{pt('lvStaleAt', { time: state.lastAt })}</span>
          <span>{lowBattery ? pt('lvStaleBattery', { pct: Math.round(state.battery as number) }) : pt('lvStaleTip')}</span>
        </span>
      </div>
    );
  }

  if (state.kind === 'pending') {
    if (expired === state.startedAt) {
      return (
        <div className="panel-state is-off" role="alert">
          <AlertCircle size={18} strokeWidth={2.2} aria-hidden="true" />
          <span>
            <b>{pt('lvNoAnswer')}</b>
          </span>
        </div>
      );
    }
    return (
      <div className={clsx('panel-state is-waiting')} role="status">
        <span className="panel-state-spin" aria-hidden="true" />
        <span>
          <b>{pt('lvSent')}</b>
          <span>{pt('lvWaiting')}</span>
        </span>
      </div>
    );
  }

  return null;
}

export default PanelStates;
