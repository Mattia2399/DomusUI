import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, BatteryLow, Clock3 } from 'lucide-react';
import { usePanelsTranslations } from '../../../i18n/panelsTranslations';
import { useI18n } from '../../../i18n/I18nProvider';
import { loadHassAuthTokensFromStorage } from '../../../services/haLive';
import type { MockEntityState } from '../../../types/ha';
import { entityChangedAt, formatPanelSpan } from '../model/panelRules';
import { parseStateHistory } from '../model/security';
import type { SensorFamily } from '../model/sensorFamily';
import type { PanelLive } from './PanelShell';
import { usePanelServices } from './panelServicesContext';
import '../theme/panels.css';

/*
 * The three states every panel has in common: the device does not answer, its
 * data are old, a command waits for its confirmation. The Home asks here once
 * for whichever panel it opens, and PanelShell draws the answer.
 */

/** The attribute with which the Home marks an entity whose command is under way. */
const COMMAND_PHASE_KEY = '__dashboard_command_phase';

export const COMMAND_TIMEOUT_MS = 10_000;

const HOUR = 3_600_000;

/*
 * After how long the silence of a sensor is suspicious. On a battery it reports
 * regularly, so 2 hours is a lot; a word or a yes/no reports only when it changes,
 * so its silence says nothing.
 */
const STALE_ON_MAINS_MS: Partial<Record<SensorFamily, number>> = {
  temperature: 6 * HOUR,
  humidity: 6 * HOUR,
  air: 6 * HOUR,
  light: 6 * HOUR,
  weather: 6 * HOUR,
  signal: 6 * HOUR,
  measure: 6 * HOUR,
  energy: 6 * HOUR,
};

export function staleAfterMs(family: SensorFamily | null | undefined, onBattery: boolean) {
  if (!family || !(family in STALE_ON_MAINS_MS)) return null;
  return onBattery ? 2 * HOUR : STALE_ON_MAINS_MS[family] ?? null;
}

export function isEntityAway(entity: MockEntityState | undefined, unknownCounts = true) {
  return entity?.state === 'unavailable' || (unknownCounts && entity?.state === 'unknown');
}

/** What must change for a command to count as obeyed: the state and the attributes the device reports. */
function fingerprint(entity: MockEntityState | undefined) {
  const attributes = Object.entries(entity?.rawAttributes ?? {}).filter(([key]) => !key.startsWith('__'));
  return JSON.stringify([entity?.state, attributes]);
}

export type PanelLiveInput = {
  entityId: string | null;
  entity: MockEntityState | undefined;
  /** What the panel knows on its own: a light whose status says it is away. */
  away?: boolean;
  /** A calendar in "unknown" just has no event, it is not away. */
  unknownCounts?: boolean;
  family?: SensorFamily | null;
  battery?: number | null;
};

export function usePanelLiveState({ entityId, entity, away = false, unknownCounts = true, family = null, battery = null }: PanelLiveInput): PanelLive & { stale: boolean } {
  const pt = usePanelsTranslations();
  const { locale } = useI18n();
  const services = usePanelServices();
  const off = away || isEntityAway(entity, unknownCounts);
  const phase = entity?.rawAttributes?.[COMMAND_PHASE_KEY];
  const pending = phase === 'sending' || phase === 'awaiting_confirmation';
  const stateNow = fingerprint(entity);

  /* ---- A command under way ---- */
  const before = useRef<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    if (pending) {
      before.current = stateNow;
      setTimedOut(false);
      setWaiting(true);
      return undefined;
    }
    if (before.current !== null) {
      // The Home gave up on the command: nothing the device reports has moved.
      if (before.current === stateNow) setTimedOut(true);
      before.current = null;
    }
    setWaiting(false);
    return undefined;
    // Only the start and the end of a command matter here, not every change in between.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  useEffect(() => {
    if (!waiting) return undefined;
    const timer = window.setTimeout(() => {
      setWaiting(false);
      setTimedOut(true);
    }, COMMAND_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [waiting]);

  /* ---- The last thing a device that is away said ---- */
  const [lastKnown, setLastKnown] = useState<{ state: string; at: number } | null>(null);
  const [haUrl, setHaUrl] = useState<string | null>(null);
  const callApi = services?.callApi;
  useEffect(() => {
    if (!off || !entityId) return undefined;
    let alive = true;
    if (callApi) {
      const end = new Date();
      void callApi({
        type: 'history/history_during_period',
        start_time: new Date(end.getTime() - 24 * HOUR).toISOString(),
        end_time: end.toISOString(),
        entity_ids: [entityId],
        include_start_time_state: true,
        significant_changes_only: false,
        minimal_response: true,
        no_attributes: true,
      }, { reportError: false }).then((payload) => {
        if (!alive) return;
        const known = parseStateHistory(payload, entityId).filter((change) => change.state !== 'unavailable' && change.state !== 'unknown').pop();
        if (known) setLastKnown({ state: known.state, at: known.t });
      }).catch(() => undefined);
    }
    void loadHassAuthTokensFromStorage().then((tokens) => {
      const url = (tokens as { hassUrl?: unknown } | null | undefined)?.hassUrl;
      if (alive && typeof url === 'string' && url) setHaUrl(url.replace(/\/+$/, ''));
    }).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [callApi, entityId, off]);

  const now = Date.now();
  const spanWords = { min: pt('spanMin'), hour: pt('spanHour'), day: pt('spanDay') };
  const span = (ms: number) => formatPanelSpan(ms, spanWords);
  const clock = (time: number) => new Date(time).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

  /* ---- Old data ---- */
  const updatedAt = entityChangedAt(entity, '__last_updated');
  const limit = staleAfterMs(family, battery !== null);
  const stale = !off && limit !== null && updatedAt !== null && now - updatedAt > limit;

  const retry = () => {
    if (entityId) void services?.callService('homeassistant', 'update_entity', { entity_id: entityId });
  };

  const notice = useMemo(() => {
    if (off) {
      const changedAt = entityChangedAt(entity);
      return (
        <div className="dv-banner dv-pn-banner is-grey" role="status">
          <AlertCircle size={18} strokeWidth={2.2} aria-hidden="true" />
          <span>
            <b>{changedAt !== null ? pt('lvAwayFor', { time: span(now - changedAt) }) : pt('lvAway')}</b>
            {lastKnown ? <span>{pt('lvLastKnown', { state: lastKnown.state, time: clock(lastKnown.at) })}</span> : null}
            <span>{pt('lvAwayTip')}</span>
            <span className="dv-pn-actions">
              {services && entityId ? <button type="button" className="dv-pn-pill is-on" onClick={retry}>{pt('lvRetry')}</button> : null}
              {haUrl && entityId ? (
                <a className="dv-pn-pill" href={`${haUrl}/history?entity_id=${encodeURIComponent(entityId)}`} target="_blank" rel="noreferrer">{pt('lvOpenHa')}</a>
              ) : null}
            </span>
          </span>
        </div>
      );
    }
    if (waiting) {
      return (
        <div className="dv-pn-wait" role="status">
          <span className="dv-pn-spin" aria-hidden="true" />
          <span><b>{pt('lvSent')}</b><span className="dv-t2">{pt('lvWaiting')}</span></span>
        </div>
      );
    }
    if (timedOut) {
      return (
        <div className="dv-banner dv-pn-banner is-grey" role="alert">
          <AlertCircle size={18} strokeWidth={2.2} aria-hidden="true" />
          <span><b>{pt('lvNoAnswer')}</b></span>
        </div>
      );
    }
    if (stale && updatedAt !== null) {
      const lowBattery = battery !== null && battery <= 20;
      const Icon = lowBattery ? BatteryLow : Clock3;
      return (
        <div className="dv-banner dv-pn-banner" role="status">
          <Icon size={18} strokeWidth={2.2} aria-hidden="true" />
          <span>
            <b>{pt('lvStale', { time: span(now - updatedAt) })}</b>
            <span>{pt('lvStaleAt', { time: clock(updatedAt) })}</span>
            <span>{lowBattery ? pt('lvStaleBattery', { pct: Math.round(battery) }) : pt('lvStaleTip')}</span>
          </span>
        </div>
      );
    }
    return null;
    // `now` and the translated helpers follow the renders that the entity causes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battery, entity, entityId, haUrl, lastKnown, off, pt, services, stale, timedOut, updatedAt, waiting]);

  return { off, notice, stale };
}
