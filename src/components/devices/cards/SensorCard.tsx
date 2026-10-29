import { ArrowDown, ArrowUp, BatteryLow, Check, Droplet, Flame, Sun, Thermometer, Volume2, Wind, type LucideIcon } from 'lucide-react';
import { clsx } from 'clsx';
import { useDevicesTranslations } from '../../../i18n/devicesTranslations';
import { useI18n } from '../../../i18n/I18nProvider';
import { isLowBattery, seriesTrend, sparkline, type SensorKind, type SensorModel, type SeriesPoint } from '../model/sensor';
import { sensorFace, withUnit } from './sensorText';
import '../theme/devices.css';

/*
 * A sensor of the room: its name and icon, the value in large type with a
 * trend arrow, a line of the last 24 hours and where the value sits. While
 * the history is on its way the line is a faint outline; the real one fades
 * in. The card only opens the detail; while editing it selects.
 */

export const SENSOR_ICONS: Record<SensorKind, LucideIcon> = {
  temp: Thermometer,
  hum: Droplet,
  co2: Wind,
  pm: Wind,
  lux: Sun,
  noise: Volume2,
  smoke: Flame,
};

export type SensorCardProps = {
  model: SensorModel;
  history: SeriesPoint[];
  /** The history has not arrived yet. */
  historyLoading?: boolean;
  editing?: boolean;
  selected?: boolean;
  hiddenItem?: boolean;
  onOpenPanel: () => void;
  onSelect?: () => void;
};

export function SensorCard({ model, history, historyLoading = false, editing = false, selected = false, hiddenItem = false, onOpenPanel, onSelect }: SensorCardProps) {
  const dt = useDevicesTranslations();
  const { locale } = useI18n();
  const Icon = SENSOR_ICONS[model.kind];
  const face = sensorFace(model, dt, locale);
  const trend = model.available ? seriesTrend(history, model.kind) : 0;
  const line = model.available && model.kind !== 'smoke' ? sparkline(history, 32) : null;
  const valueText = face.unit ? withUnit(model.kind, face.value) : face.value;
  const trendWord = trend > 0 ? `, ${dt('trendRising')}` : trend < 0 ? `, ${dt('trendFalling')}` : '';

  return (
    <button
      type="button"
      className={clsx('dv-tile dv-sensor', `dv-sn-${model.kind}`, editing && selected && 'is-selected', hiddenItem && 'is-hidden-item')}
      onClick={editing ? onSelect : onOpenPanel}
      aria-pressed={editing ? selected : undefined}
      aria-label={editing ? dt('select', { name: model.name }) : dt('sensorAria', { name: model.name, value: valueText, note: `${face.note}${trendWord}` })}
    >
      <span className={clsx('dv-t2 flex items-center gap-[7px] text-[13px] font-semibold', editing && 'pr-7')}>
        <span className="dv-sensor-tint flex" aria-hidden="true">
          <Icon size={16} strokeWidth={2.2} />
        </span>
        <span className="min-w-0 flex-1 truncate">{model.name}</span>
        {isLowBattery(model) ? (
          <span className="flex text-[color:var(--dv-amber)]" aria-hidden="true">
            <BatteryLow size={16} strokeWidth={2.2} />
          </span>
        ) : null}
      </span>
      <span className="flex items-baseline gap-[3px]" style={{ opacity: model.available || model.kind === 'smoke' ? 1 : 0.55 }}>
        <span className="text-[30px] font-semibold leading-none tracking-[-0.03em] tabular-nums">{face.value}</span>
        {face.unit ? <span className="dv-t2 text-[15px] font-semibold">{face.unit}</span> : null}
        {trend !== 0 ? (
          <span className="dv-t3 ml-0.5 flex self-center" aria-hidden="true">
            {trend > 0 ? <ArrowUp size={15} strokeWidth={2.6} /> : <ArrowDown size={15} strokeWidth={2.6} />}
          </span>
        ) : null}
      </span>
      <span className="dv-spark-wrap" aria-hidden="true">
        {line ? (
          <svg className="dv-spark" viewBox="0 0 100 32" preserveAspectRatio="none">
            <polygon points={line.area} />
            <polyline points={line.line} />
          </svg>
        ) : historyLoading && model.available && model.kind !== 'smoke' ? (
          <svg className="dv-spark is-waiting" viewBox="0 0 100 32" preserveAspectRatio="none">
            <polyline points="0,22 18,18 36,20 54,14 72,17 100,12" />
          </svg>
        ) : null}
      </span>
      <span className={clsx('truncate text-xs font-semibold', face.warn ? 'text-[color:var(--dv-amber)]' : 'dv-t2')}>{face.note}</span>
      {editing ? (
        <span className={clsx('dv-check', selected && 'is-selected')} aria-hidden="true">
          <Check size={12} strokeWidth={3.2} />
        </span>
      ) : null}
    </button>
  );
}

export default SensorCard;
