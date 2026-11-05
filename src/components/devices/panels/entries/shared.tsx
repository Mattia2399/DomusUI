import { Timer } from 'lucide-react';
import { useI18n } from '../../../../i18n/I18nProvider';
import { useDevicesTranslations } from '../../../../i18n/devicesTranslations';
import { GlassChips } from '../../../ui/GlassChips';
import { formatTimerDuration, minutesLeft, TIMER_PRESETS, type DeviceTimer } from '../../model/deviceTimer';
import { relativeLuminance, type Rgb } from '../../model/tileColor';
import type { PanelItem, PanelDrawnIn } from '../registry';
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

export const chipSize = (place: PanelDrawnIn) => (place === 'group' ? ('dialog' as const) : ('default' as const));

/** The switch-off timer of a device: five pills, and what is left, which the card says too. */
export function useTimerItem(timer: DeviceTimer | null | undefined, now: number | undefined, onSetTimer: ((minutes: number) => void) | undefined): PanelItem[] {
  const dt = useDevicesTranslations();
  const { locale } = useI18n();
  if (!onSetTimer) return [];
  const at = now ?? Date.now();
  const active = timer && timer.endsAt > at ? timer : null;
  const value = active
    ? dt('timerEnds', {
        time: new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(active.endsAt),
        left: formatTimerDuration(minutesLeft(active, at), dt),
      })
    : dt('timerNone');
  return [
    {
      key: 'timer',
      kind: 'opens',
      icon: <Timer {...ICON} />,
      label: dt('timerShort'),
      title: dt('timerTitle'),
      value,
      content: (place) => (
        <GlassChips<number>
          size={chipSize(place)}
          ariaLabel={dt('timerTitle')}
          options={TIMER_PRESETS.map((minutes) => ({ value: minutes, label: minutes === 0 ? dt('timerOff') : formatTimerDuration(minutes, dt) }))}
          value={active ? active.minutes : 0}
          onChange={onSetTimer}
        />
      ),
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
