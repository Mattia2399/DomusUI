import { LockOpen } from 'lucide-react';
import { clsx } from 'clsx';
import { useDevicesTranslations } from '../../../i18n/devicesTranslations';
import { useI18n } from '../../../i18n/I18nProvider';
import { useCan } from '../../../security/AccessControlProvider';
import { onSpans, type LockCommand, type SecurityModel, type StateChange } from '../model/security';
import { SECURITY_ICONS, securityTone } from '../cards/SecurityCard';
import { LockRing, lockRingInk, lockRingText, useLockRing } from '../cards/LockRing';
import { clockOf, durationWord, LOCK_KEY, SECURITY_KIND_KEY, securityStatus } from '../cards/securityText';
import { PanelShell, type PanelLive } from './PanelShell';

/*
 * The detail of a security device: what it says now and since when, the
 * day of a contact or a motion sensor as a strip, and its last changes. A
 * lock shows its two rings large, with what they do.
 */

export type SecurityPanelProps = {
  model: SecurityModel;
  roomName?: string;
  history: StateChange[];
  details?: { rawAttributes?: Record<string, unknown>; changedBy?: string };
  commandsEnabled?: boolean;
  embedded?: boolean;
  live?: PanelLive;
  onLockCommand: (command: LockCommand) => boolean | void;
  onClose: () => void;
};

const DAY_MS = 24 * 3_600_000;

export function SecurityPanel({ model, roomName, history, details, commandsEnabled = true, embedded, live, onLockCommand, onClose }: SecurityPanelProps) {
  const dt = useDevicesTranslations();
  const { locale, t } = useI18n();
  const canControlAccess = useCan('access.control') && commandsEnabled;
  const now = Date.now();
  const isLock = model.kind === 'lock';
  const ring = useLockRing(model, onLockCommand, !isLock || !canControlAccess);
  const ringText = isLock ? lockRingText(model, ring, dt) : null;
  const Icon = isLock && (model.lock === 'unlocked' || model.lock === 'open') ? LockOpen : SECURITY_ICONS[model.kind];
  const tone = securityTone(model);
  const kind = dt(SECURITY_KIND_KEY[model.kind]);
  const subtitle = roomName ? `${roomName} · ${kind}` : kind;
  const since = model.changedAt === null ? null : now - model.changedAt;

  const hero = (() => {
    if (!model.available) return dt('unavailable');
    if (model.kind === 'contact') return model.active ? dt('contactOpen') : dt('contactClosed');
    if (model.kind === 'motion') return model.active ? dt('motionNowWord') : dt('motionNone');
    return securityStatus(model, dt);
  })();
  const sinceLine = (() => {
    if (!model.available || model.changedAt === null || since === null) return null;
    const clock = clockOf(model.changedAt, locale);
    if (model.kind === 'contact') return model.active ? dt('sinceOpen', { time: durationWord(since, dt), clock }) : dt('sinceClosed', { clock });
    if (model.kind === 'motion') return model.active ? dt('sinceMotionNow') : dt('sinceMotion', { clock, time: durationWord(since, dt) });
    return dt('sinceLock', { clock });
  })();

  const from = now - DAY_MS;
  const day = history.filter((change) => change.t >= from - DAY_MS);
  const spans = model.kind === 'contact' ? onSpans(day, from, now) : [];
  const ticks = model.kind === 'motion' ? day.filter((change) => change.state === 'on' && change.t >= from).map((change) => (change.t - from) / DAY_MS) : [];
  const word = (state: string) => {
    if (model.kind === 'lock') return (LOCK_KEY as Record<string, Parameters<typeof dt>[0]>)[state] ? dt((LOCK_KEY as Record<string, Parameters<typeof dt>[0]>)[state]) : state;
    if (model.kind === 'contact') return state === 'on' ? dt('historyOn') : dt('historyOff');
    if (model.kind === 'motion') return state === 'on' ? dt('historyMotion') : dt('historyStill');
    if (model.kind === 'leak') return state === 'on' ? dt('historyWet') : dt('historyDry');
    return state === 'on' ? dt('historyVibration') : dt('vibrationNone');
  };
  const events = [...history].reverse().filter((change) => model.kind !== 'motion' || change.state === 'on').slice(0, 5);
  const attributes = details?.rawAttributes ?? {};
  const autoLock = typeof attributes.auto_lock === 'boolean'
    ? attributes.auto_lock
    : typeof attributes.auto_lock_enabled === 'boolean'
      ? attributes.auto_lock_enabled
      : null;
  const autoLockDelay = Number(attributes.auto_lock_time ?? attributes.auto_lock_delay);
  const detailRows = isLock ? [
    typeof attributes.door_state === 'string' && attributes.door_state.trim()
      ? [t('card.lock.door'), attributes.door_state.trim()]
      : null,
    autoLock !== null
      ? [t('card.lock.autoLock'), autoLock
          ? Number.isFinite(autoLockDelay) && autoLockDelay > 0
            ? t('card.lock.autoLock.after', { seconds: Math.round(autoLockDelay) })
            : t('card.lock.autoLock.on')
          : t('card.lock.autoLock.off')]
      : null,
    model.battery !== null ? [t('card.lock.battery'), `${Math.round(model.battery)}%`] : null,
    details?.changedBy ? [t('card.lock.lastActivity'), details.changedBy] : null,
  ].filter((entry): entry is [string, string] => entry !== null) : [];

  return (
    <PanelShell
      icon={<Icon size={23} strokeWidth={2} />}
      iconClassName={clsx('dv-security-badge', `is-${tone}`)}
      name={model.name}
      subtitle={subtitle}
      embedded={embedded}
      live={live}
      onClose={onClose}
    >

      {ringText ? (
        <div className="flex flex-col items-center gap-3.5 pb-0.5 pt-1.5">
          <LockRing model={model} ring={ring} label={ringText.aria} size="lg" disabled={!canControlAccess} />
          <div className="flex flex-col items-center gap-1 text-center">
            <span className={clsx('text-[30px] font-bold leading-[1.1] tracking-[-0.025em]', lockRingInk(model, ring))} aria-live="polite">
              {ringText.headline}
            </span>
            {ringText.caption ? (
              <span className={clsx('text-[13px] font-semibold leading-[1.35]', ring.nudge || ring.phase === 'lap2' || ring.phase === 'lap2b' ? lockRingInk(model, ring) : 'dv-t2')}>
                {ringText.caption}
              </span>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <span className={clsx('text-[34px] font-bold tracking-[-0.03em]', `dv-security-hero is-${tone}`)} aria-live="polite">
            {hero}
          </span>
          {sinceLine ? <span className="dv-t2 text-sm font-medium">{sinceLine}</span> : null}
        </div>
      )}

      {model.kind === 'contact' || model.kind === 'motion' ? (
        <div className="flex flex-col gap-2">
          <span className="dv-t2 text-[13px] font-bold">{model.kind === 'contact' ? dt('stripContact') : dt('stripMotion')}</span>
          <div className="dv-day-strip" aria-hidden="true">
            {spans.map((span) => (
              <span key={span.start} className="dv-day-span" style={{ left: `${(span.start * 100).toFixed(2)}%`, width: `${Math.max(0.8, (span.end - span.start) * 100).toFixed(2)}%` }} />
            ))}
            {ticks.map((tick) => (
              <span key={tick} className="dv-day-tick" style={{ left: `${(tick * 100).toFixed(2)}%` }} />
            ))}
          </div>
          <div className="dv-t3 flex justify-between text-[11px] font-semibold tabular-nums" aria-hidden="true">
            <span>{dt('ago24h')}</span>
            <span>{dt('ago12h')}</span>
            <span>{dt('agoNow')}</span>
          </div>
        </div>
      ) : null}

      {detailRows.length > 0 ? (
        <div className="dv-card dv-pn-rows">
          {detailRows.map(([label, value]) => (
            <div key={label} className="dv-pn-row">
              <span className="dv-pn-rt"><b>{label}</b></span>
              <span className="dv-pn-tm dv-t2">{value}</span>
            </div>
          ))}
        </div>
      ) : null}

      {events.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="dv-t2 text-[13px] font-bold">{dt('historyLabel')}</span>
          <div className="dv-card !py-0">
            {events.map((change) => (
              <div key={change.t} className="dv-history-row">
                <span className="dv-t2 w-12 text-sm font-semibold tabular-nums">{clockOf(change.t, locale)}</span>
                <span className="text-[15px] font-medium">{word(change.state)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </PanelShell>
  );
}

export default SecurityPanel;
