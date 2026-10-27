import { ArrowDown, ArrowUp, Lightbulb, X } from 'lucide-react';
import { clsx } from 'clsx';
import GlassSegmentSelect from '../../ui/GlassSegmentSelect';
import { useDevicesTranslations } from '../../../i18n/devicesTranslations';
import { useI18n } from '../../../i18n/I18nProvider';
import {
  isLowBattery,
  SENSOR_KINDS,
  seriesStats,
  seriesTrend,
  type SensorModel,
  type SensorPeriod,
  type SeriesPoint,
} from '../model/sensor';
import { SENSOR_ICONS } from '../cards/SensorCard';
import { formatSensorValue, sensorFace, sensorUpdated, TIP_KEY, withUnit, ZONE_KEYS } from '../cards/sensorText';

/*
 * The detail of a sensor: the value and where it sits, a tip when something
 * should be done, its history over 6 hours, 24 hours or 7 days against the
 * ideal band, the lowest, highest and mean, the scale of the kind, and the
 * battery. A smoke detector shows its state; a sensor that is away says so.
 */


export type SensorPanelProps = {
  model: SensorModel;
  roomName?: string;
  history: SeriesPoint[];
  historyLoading: boolean;
  period: SensorPeriod;
  onPeriod: (period: SensorPeriod) => void;
  onClose: () => void;
};

export function SensorPanel({ model, roomName, history, historyLoading, period, onPeriod, onClose }: SensorPanelProps) {
  const dt = useDevicesTranslations();
  const { locale } = useI18n();
  const Icon = SENSOR_ICONS[model.kind];
  const face = sensorFace(model, dt, locale);
  const updated = sensorUpdated(model, dt);
  const subtitle = [roomName, model.available ? updated : dt('sensorAway')].filter(Boolean).join(' · ');

  const header = (
    <div className="flex items-center gap-3">
      <span aria-hidden="true" className="dv-sensor-badge flex h-12 w-12 flex-none items-center justify-center rounded-full">
        <Icon size={23} strokeWidth={2} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="m-0 truncate text-xl font-bold tracking-[-0.02em]">{model.name}</p>
        <span className="dv-t2 text-[13px] font-semibold">{subtitle}</span>
      </div>
      <button type="button" className="dv-round dv-round-sm" aria-label={dt('close')} onClick={onClose}>
        <X size={15} strokeWidth={2.4} aria-hidden="true" />
      </button>
    </div>
  );

  const battery =
    model.battery !== null ? (
      <div className="dv-card flex flex-col gap-1.5 !py-3">
        <span className={clsx('text-[15px] font-semibold', isLowBattery(model) && 'text-[color:var(--dv-amber)]')}>
          {dt('batteryPct', { pct: Math.round(model.battery) })}
        </span>
        {isLowBattery(model) ? <span className="dv-t2 text-[13px] font-medium leading-[1.4]">{dt('batteryLowTip')}</span> : null}
      </div>
    ) : null;

  if (model.kind === 'smoke') {
    return (
      <div className={clsx('dv-panel', `dv-sn-${model.kind}`)}>
        {header}
        <div className="flex flex-col gap-1">
          <span className={clsx('text-[34px] font-bold tracking-[-0.03em]', model.alarm && 'text-[color:var(--dv-red)]')}>
            {model.alarm ? dt('smokeDetected') : dt('smokeNone')}
          </span>
          <span className="dv-t2 text-sm font-medium">{dt('smokeNote')}</span>
        </div>
        {battery}
      </div>
    );
  }

  if (!model.available || model.value === null) {
    return (
      <div className={clsx('dv-panel', `dv-sn-${model.kind}`)}>
        {header}
        <div className="dv-banner" role="status">
          <span>{dt('sensorAwayText')}</span>
        </div>
        {battery}
      </div>
    );
  }

  const spec = SENSOR_KINDS[model.kind];
  const value = model.value;
  const format = (number: number) => formatSensorValue(model.kind, number, locale);
  const unitText = (number: number) => withUnit(model.kind, format(number));
  const trend = seriesTrend(history, model.kind);
  const stats = seriesStats(history);
  const lowest = Math.min(stats?.min ?? value, spec.ideal[0]);
  const highest = Math.max(stats?.max ?? value, spec.ideal[1]);
  const pad = (highest - lowest) * 0.12 || 1;
  const y0 = Math.max(spec.lo, lowest - pad);
  const y1 = highest + pad;
  const y = (number: number) => (1 - (number - y0) / (y1 - y0)) * 100;
  const t0 = history[0]?.t ?? 0;
  const span = (history[history.length - 1]?.t ?? 1) - t0 || 1;
  const coordinates = history.map((point) => `${(((point.t - t0) / span) * 100).toFixed(2)},${y(point.v).toFixed(2)}`);
  const bandTop = Math.max(0, y(spec.ideal[1]));
  const bandBottom = Math.min(100, y(spec.ideal[0]));
  const scaleWidth = spec.hi - spec.lo;
  const cut = spec.zoneCut ?? spec.ideal;
  const zones = [
    [spec.lo, cut[0]],
    [cut[0], cut[1]],
    [cut[1], spec.hi],
  ].map(([from, to], index) => ({ width: `${((Math.max(0, to - from) / scaleWidth) * 100).toFixed(2)}%`, key: ZONE_KEYS[model.kind as keyof typeof ZONE_KEYS][index], index }));
  const mark = Math.max(0, Math.min(1, (value - spec.lo) / scaleWidth)) * 100;
  const tipKey = TIP_KEY[model.kind];
  const periods: Array<[SensorPeriod, 'period6h' | 'period24h' | 'period7d']> = [
    ['6h', 'period6h'],
    ['24h', 'period24h'],
    ['7d', 'period7d'],
  ];
  const axis = period === '6h' ? [dt('ago6h'), dt('ago3h'), dt('agoNow')] : period === '24h' ? [dt('ago24h'), dt('ago12h'), dt('agoNow')] : [dt('ago7d'), dt('ago3d'), dt('agoToday')];
  const periodWord = dt(periods.find(([key]) => key === period)?.[1] ?? 'period24h');

  return (
    <div className={clsx('dv-panel', `dv-sn-${model.kind}`)}>
      {header}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="flex items-baseline gap-1.5">
            <span className="text-[56px] font-bold leading-none tracking-[-0.045em] tabular-nums">{face.value}</span>
            <span className="dv-t2 text-xl font-semibold">{spec.unit}</span>
          </span>
          <span className={clsx('text-[15px] font-bold', face.warn ? 'text-[color:var(--dv-amber)]' : 'dv-t2')}>{face.note}</span>
        </div>
        <span className="dv-t2 flex items-center gap-1.5 text-[13px] font-semibold">
          {trend > 0 ? <ArrowUp size={15} strokeWidth={2.6} aria-hidden="true" /> : null}
          {trend < 0 ? <ArrowDown size={15} strokeWidth={2.6} aria-hidden="true" /> : null}
          {trend === 0
            ? dt('trendStable')
            : trend > 0
              ? dt('trendUp', { v: unitText(Math.abs(trend)) })
              : dt('trendDown', { v: unitText(Math.abs(trend)) })}
        </span>
      </div>

      {face.warn && tipKey ? (
        <div className="dv-banner" role="note">
          <Lightbulb size={18} strokeWidth={2.2} aria-hidden="true" />
          <span>{dt(tipKey)}</span>
        </div>
      ) : null}

      <div className="dv-card flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <span className="dv-t2 text-[13px] font-bold">
            {dt('idealRange', { lo: format(spec.ideal[0]), hi: unitText(spec.ideal[1]) })}
          </span>
          <GlassSegmentSelect<SensorPeriod>
            className="dv-seg"
            ariaLabel={dt('periodLabel')}
            options={periods.map(([key, label]) => ({ value: key, label: dt(label) }))}
            value={period}
            onChange={onPeriod}
          />
        </div>
        {history.length > 1 && stats ? (
          <>
            <div
              className="dv-chart"
              role="img"
              aria-label={dt('chartAria', {
                name: model.name,
                period: periodWord,
                min: unitText(stats.min),
                max: unitText(stats.max),
                now: unitText(value),
              })}
            >
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <rect x="0" y={bandTop.toFixed(2)} width="100" height={Math.max(0, bandBottom - bandTop).toFixed(2)} className="dv-chart-band" />
                <polygon points={`0,100 ${coordinates.join(' ')} 100,100`} className="dv-chart-area" />
                <polyline points={coordinates.join(' ')} className="dv-chart-line" />
              </svg>
              <span className="dv-chart-y top-0">{format(y1)}</span>
              <span className="dv-chart-y bottom-0">{format(y0)}</span>
              <span className="dv-chart-band-label" style={{ top: `${bandTop.toFixed(2)}%` }}>
                {dt('idealWord')}
              </span>
              <span className="dv-chart-dot" style={{ top: `${y(value).toFixed(2)}%` }} />
            </div>
            <div className="dv-t3 flex justify-between text-[11px] font-semibold" aria-hidden="true">
              {axis.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            <div className="dv-stats">
              {(
                [
                  ['statMin', stats.min],
                  ['statMax', stats.max],
                  ['statAvg', stats.avg],
                ] as const
              ).map(([key, number]) => (
                <div key={key}>
                  <span className="dv-t2">{dt(key)}</span>
                  <strong>{unitText(number)}</strong>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="dv-t2 m-0 py-6 text-center text-sm">{historyLoading ? dt('historyLoading') : dt('historyEmpty')}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="dv-t2 text-[13px] font-bold">{dt('whereNow')}</span>
        <div className="dv-scale" aria-hidden="true">
          {zones.map((zone) => (
            <span key={zone.index} className={`dv-scale-zone-${zone.index}`} style={{ width: zone.width }} />
          ))}
          <i style={{ left: `${mark.toFixed(2)}%` }} />
        </div>
        <div className="dv-t3 flex text-[11px] font-semibold" aria-hidden="true">
          {zones.map((zone) => (
            <span key={zone.index} className="truncate text-center" style={{ width: zone.width }}>
              {zone.key ? dt(zone.key) : ''}
            </span>
          ))}
        </div>
      </div>

      {battery}
    </div>
  );
}

export default SensorPanel;
