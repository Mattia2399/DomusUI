import { Timer } from 'lucide-react';
import { usePanelSpecTranslations } from '../../../../i18n/panelSpecTranslations';
import { useI18n } from '../../../../i18n/I18nProvider';
import { useDevicesTranslations } from '../../../../i18n/devicesTranslations';
import { GlassChips } from '../../../ui/GlassChips';
import { GlassRing } from '../../../ui/GlassRing';
import { formatTimerDuration, minutesLeft, TIMER_PRESETS, type DeviceTimer } from '../../model/deviceTimer';
import { relativeLuminance, type Rgb } from '../../model/tileColor';
import type { PanelControl } from '../registry';
import type { PanelAccent } from '../shell/PanelShell';
import './shared.css';

/* What the entries of the registry have in common. */

export const ICON = { size: 20, strokeWidth: 2 } as const;

/** A colour as the panel wants it, with the ink that reads on it. */
export function accentOf(rgb: Rgb | string): PanelAccent {
  const channels = (typeof rgb === 'string' ? rgb.split(' ').map(Number) : rgb) as Rgb;
  return {
    color: `rgb(${channels.join(' ')})`,
    ink: relativeLuminance(channels) > 0.42 ? '#1a1206' : '#ffffff',
    rgb: channels.join(' '),
  };
}

/** The switch-off timer of a device: a large ring with five pills, and what is left, which the card says too. */
export function useTimerControl(timer: DeviceTimer | null | undefined, now: number | undefined, onSetTimer: ((minutes: number) => void) | undefined): PanelControl[] {
  const dt = useDevicesTranslations();
  const sp = usePanelSpecTranslations();
  const { locale } = useI18n();
  if (!onSetTimer) return [];
  const at = now ?? Date.now();
  const active = timer && timer.endsAt > at ? timer : null;
  const left = active ? minutesLeft(active, at) : 0;
  const time = active ? new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(active.endsAt) : '';
  const value = active ? dt('timerEnds', { time, left: formatTimerDuration(left, dt) }) : dt('timerNone');
  const pills = (size: 'default' | 'dialog') => (
    <GlassChips<number>
      size={size}
      ariaLabel={dt('timerTitle')}
      options={TIMER_PRESETS.map((minutes) => ({ value: minutes, label: minutes === 0 ? dt('timerOff') : formatTimerDuration(minutes, dt) }))}
      value={active ? active.minutes : 0}
      onChange={onSetTimer}
    />
  );
  return [
    {
      id: 'timer',
      icon: <Timer {...ICON} />,
      label: dt('timerShort'),
      title: dt('timerTitle'),
      value,
      lit: Boolean(active),
      looks: ['timer'],
      big: () => (
        <>
          <GlassRing
            percent={active ? (left / active.minutes) * 100 : 0}
            value={active ? formatTimerDuration(left, dt) : dt('timerNone')}
            note={active ? sp.t('timerOffAt', { time }) : sp.t('timerPick')}
          />
          {pills('default')}
        </>
      ),
      group: pills('dialog'),
    },
  ];
}

/** Rows of a name and a value: what a device reports, and nothing it does not. */
export function PanelRows({ rows }: { rows: ReadonlyArray<readonly [string, string]> }) {
  return (
    <div className="panel-rows">
      {rows.map(([label, value], index) => (
        <div key={index} className="panel-row">
          <span>{label}</span>
          <b>{value}</b>
        </div>
      ))}
    </div>
  );
}
