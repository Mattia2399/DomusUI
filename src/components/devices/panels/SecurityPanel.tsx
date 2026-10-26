import { Lock, LockOpen, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useDevicesTranslations } from '../../../i18n/devicesTranslations';
import { useI18n } from '../../../i18n/I18nProvider';
import { onSpans, type SecurityModel, type StateChange } from '../model/security';
import { SECURITY_ICONS, securityTone } from '../cards/SecurityCard';
import { clockOf, durationWord, LOCK_KEY, SECURITY_KIND_KEY, securityStatus } from '../cards/securityText';

/*
 * The detail of a security device: what it says now and since when, the
 * day of a contact or a motion sensor as a strip, its last changes, and for
 * a lock the buttons to lock, unlock and open.
 */

export type SecurityPanelProps = {
  model: SecurityModel;
  roomName?: string;
  history: StateChange[];
  onLock: () => void;
  onUnlock: () => void;
  onOpenDoor: () => void;
  onClose: () => void;
};

const DAY_MS = 24 * 3_600_000;

export function SecurityPanel({ model, roomName, history, onLock, onUnlock, onOpenDoor, onClose }: SecurityPanelProps) {
  const dt = useDevicesTranslations();
  const { locale } = useI18n();
  const now = Date.now();
  const Icon = SECURITY_ICONS[model.kind];
  const tone = securityTone(model);
  const kind = dt(SECURITY_KIND_KEY[model.kind]);
  const subtitle = roomName ? `${roomName} · ${kind}` : kind;
  const since = model.changedAt === null ? null : now - model.changedAt;
  const locked = model.lock === 'locked' || model.lock === 'locking';

  const hero = (() => {
    if (!model.available) return dt('unavailable');
    if (model.kind === 'lock') return model.lock === 'locked' ? dt('lockLockedHero') : model.lock ? dt(LOCK_KEY[model.lock]) : dt('unavailable');
    if (model.kind === 'contact') return model.active ? dt('contactOpen') : dt('contactClosed');
    if (model.kind === 'motion') return model.active ? dt('motionNowWord') : dt('motionNone');
    return securityStatus(model, dt);
  })();
  const sinceLine = (() => {
    if (!model.available || model.changedAt === null || since === null) return null;
    const clock = clockOf(model.changedAt, locale);
    if (model.kind === 'contact') return model.active ? dt('sinceOpen', { time: durationWord(since, dt), clock }) : dt('sinceClosed', { clock });
    if (model.kind === 'motion') return model.active ? dt('sinceMotionNow') : dt('sinceMotion', { clock, time: durationWord(since, dt) });
    if (model.kind === 'lock') return locked ? dt('sinceLock', { clock }) : dt('sinceUnlocked', { clock });
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

  return (
    <div className="dv-panel">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className={clsx('dv-security-badge flex h-12 w-12 flex-none items-center justify-center rounded-full', `is-${tone}`)}>
          {model.kind === 'lock' && !locked ? <LockOpen size={23} strokeWidth={2} /> : <Icon size={23} strokeWidth={2} />}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="m-0 truncate text-xl font-bold tracking-[-0.02em]">{model.name}</p>
          <span className="dv-t2 text-[13px] font-semibold">{subtitle}</span>
        </div>
        <button type="button" className="dv-round dv-round-sm" aria-label={dt('close')} onClick={onClose}>
          <X size={15} strokeWidth={2.4} aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <span className={clsx('text-[34px] font-bold tracking-[-0.03em]', `dv-security-hero is-${tone}`)} aria-live="polite">
          {hero}
        </span>
        {sinceLine ? <span className="dv-t2 text-sm font-medium">{sinceLine}</span> : null}
      </div>

      {model.kind === 'lock' && model.available ? (
        <div className="flex flex-wrap gap-2">
          {locked ? (
            <button type="button" className="dv-option is-on inline-flex items-center gap-2" onClick={onUnlock}>
              <LockOpen size={16} strokeWidth={2.4} aria-hidden="true" />
              {dt('unlockAction')}
            </button>
          ) : (
            <button type="button" className="dv-option is-on inline-flex items-center gap-2" onClick={onLock}>
              <Lock size={16} strokeWidth={2.4} aria-hidden="true" />
              {dt('lockAction')}
            </button>
          )}
          {model.canOpen ? (
            <button type="button" className="dv-option" onClick={onOpenDoor}>
              {dt('openAction')}
            </button>
          ) : null}
        </div>
      ) : null}

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
    </div>
  );
}

export default SecurityPanel;
