import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { BatteryMedium, ChevronDown, ChevronUp, Gauge, Minus, Plus } from 'lucide-react';
import { useSensorFamilyTranslations, type SensorFamilyWordKey } from '../../../i18n/sensorFamilyTranslations';
import { usePanelsTranslations, type PanelsTranslationKey } from '../../../i18n/panelsTranslations';
import { useI18n } from '../../../i18n/I18nProvider';
import type { MockEntityStateMap } from '../../../types/ha';
import GlassSegmentSelect from '../../ui/GlassSegmentSelect';
import { describeFamilySensor, toFamilySensorModel } from '../cards/SensorFamilyCard';
import { buildSensorHouse, houseBatteries, houseConnections, houseDetectors, housePowers, sensorPeers } from '../cards/sensorHouse';
import { findBatterySensor, seriesStats, type SeriesPoint } from '../model/sensor';
import { formatPanelSpan } from '../model/panelRules';
import { batteryBand, type SensorAlertReason, type SensorFamily } from '../model/sensorFamily';
import { hourlyIncrease, hourlyMeans, hourlyYes, startOfDay, yesSpans } from '../model/sensorFigures';
import {
  chartKindOf,
  dailyBars,
  idealBandOf,
  periodsOf,
  readStoredThresholds,
  scaleOf,
  statisticsToPoints,
  stepThreshold,
  storeThreshold,
  thresholdCrossed,
  thresholdRuleOf,
  type SensorPanelPeriod,
} from '../model/sensorPanel';
import { useEntityRegistry, useSensorSeries } from './panelData';
import { usePanelServices } from './panelServicesContext';
import { PanelShell, type PanelLive } from './PanelShell';
import '../theme/panels.css';

/*
 * The panel of a sensor, one for each of the 17 families: the value and its
 * word, the alert when something is wrong, the chart with its period, where the
 * value sits, a block that changes with the family, and the threshold. Nothing
 * is made up: a block without data, or an action without its device, is not there.
 * The threshold is saved on the device; notifications wait for a way to send them.
 */

export type SensorFamilyPanelProps = {
  entityId: string;
  name: string;
  history?: number[];
  haStates: MockEntityStateMap;
  embedded?: boolean;
  live?: PanelLive;
  /** Its data are old: the value goes grey. */
  stale?: boolean;
  onClose: () => void;
};

const FAMILY_RGB: Record<SensorFamily, string> = {
  temperature: '255 159 10',
  humidity: '90 200 250',
  air: '48 209 88',
  energy: '255 214 10',
  water: '10 132 255',
  battery: '48 209 88',
  light: '255 214 10',
  weather: '100 210 255',
  signal: '10 132 255',
  time: '191 90 242',
  state: '100 210 255',
  price: '48 209 88',
  measure: '142 142 147',
  opening: '255 159 10',
  motion: '10 132 255',
  safety: '48 209 88',
  device: '48 209 88',
};

type AlertWords = { title: SensorFamilyWordKey; tip?: SensorFamilyWordKey; panelTip?: PanelsTranslationKey };

const ALERT_WORDS: Partial<Record<SensorAlertReason, AlertWords>> = {
  hot: { title: 'ssTempHot', tip: 'ssHotTip' },
  cold: { title: 'ssTempCold', tip: 'ssColdTip' },
  humid: { title: 'ssHumHumid', tip: 'ssHumidTip' },
  dry: { title: 'ssHumDry', tip: 'ssDryTip' },
  airPoor: { title: 'ssAirPoor', tip: 'ssAirTip' },
  airBad: { title: 'ssAirBad', tip: 'ssAirTip' },
  nearLimit: { title: 'ssNearLimitCap', tip: 'ssLimitTip' },
  leak: { title: 'ssLeakCap', panelTip: 'snLeakTip' },
  batteryLow: { title: 'ssBattChange', panelTip: 'snBatteryTip' },
  batteryEmpty: { title: 'ssBattChange', panelTip: 'snBatteryTip' },
  windStrong: { title: 'ssWindStrongWord', panelTip: 'snWindTip' },
  signalWeak: { title: 'ssSig1', panelTip: 'snSignalTip' },
  priceHigh: { title: 'ssPriceDear' },
  loud: { title: 'ssNoisy' },
  detected: { title: 'ssSafetyOn', panelTip: 'snDetected' },
  offline: { title: 'ssOffline', panelTip: 'snOfflineTip' },
};

const SHADING_COVERS = new Set(['blind', 'shutter', 'shade', 'curtain', 'awning']);

const PERIOD_WORDS: Record<SensorPanelPeriod, { label: PanelsTranslationKey; title: PanelsTranslationKey }> = {
  '24h': { label: 'sn24h', title: 'snLast24h' },
  '7d': { label: 'sn7d', title: 'snLast7d' },
  '30d': { label: 'sn30d', title: 'snLast30d' },
};

const clock = (time: number, locale: string) => new Date(time).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

const formatNumber = (value: number, locale: string, decimals?: number) =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: decimals ?? (Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 1 ? 1 : 2) }).format(value).replace(/^-/, '−');

type BlockRow = { key: string; label: string; value: string; note?: string; color?: string };

export function SensorFamilyPanel({ entityId, name, history, haStates, embedded = false, live, stale = false, onClose }: SensorFamilyPanelProps) {
  const dt = useSensorFamilyTranslations();
  const pt = usePanelsTranslations();
  const { locale } = useI18n();
  const services = usePanelServices();
  const registry = useEntityRegistry();
  const [period, setPeriod] = useState<SensorPanelPeriod>('24h');
  const [moreOpen, setMoreOpen] = useState(false);
  const now = Date.now();
  const entity = haStates[entityId];

  const batteryId = findBatterySensor(entityId, haStates, (id) => registry?.registryEntities.find((entry) => entry.entityId === id)?.deviceId);
  const batteryValue = batteryId ? Number(haStates[batteryId]?.state) : Number.NaN;
  const battery = Number.isFinite(batteryValue) ? batteryValue : null;
  const model = toFamilySensorModel(entityId, entity, { name, battery });

  const fallback = useMemo<SeriesPoint[]>(() => {
    const values = history ?? [];
    return values.map((v, index) => ({ t: now - (values.length - 1 - index) * ((24 * 3_600_000) / Math.max(1, values.length - 1)), v }));
    // Drawn once from what the card had when the panel opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history]);
  const series = useSensorSeries(entityId, period, fallback);
  const house = useMemo(() => buildSensorHouse(haStates), [haStates]);

  const rule = model ? thresholdRuleOf(model.family, model.deviceClass, model.unit) : null;
  const [threshold, setThreshold] = useState<number | null>(null);
  useEffect(() => {
    setThreshold(readStoredThresholds()[entityId] ?? null);
  }, [entityId]);

  const periods = model ? periodsOf(model.family, model.attributes, series.statisticsMissing) : (['24h'] as SensorPanelPeriod[]);
  useEffect(() => {
    if (!periods.includes(period)) setPeriod('24h');
  }, [period, periods]);

  if (!model) return null;

  const { alert, face, reading } = describeFamilySensor(model, {
    history: series.points,
    changes: series.changes,
    house,
    now,
    dt,
    locale,
  });

  const tint = FAMILY_RGB[model.family];
  const Icon = face?.icon ?? Gauge;
  const chart = chartKindOf(model.family);
  const isWord = model.value === null || chart === 'strip' || model.family === 'motion';
  const spans = { min: pt('spanMin'), hour: pt('spanHour'), day: pt('spanDay') };
  const span = (ms: number) => formatPanelSpan(ms, spans);
  const unitText = reading.unit === '°' || reading.unit === '%' ? reading.unit : reading.unit ? ` ${reading.unit}` : '';
  const withUnit = (value: number, decimals?: number) => `${formatNumber(value, locale, decimals)}${unitText}`;

  const area = registry?.entityAreaByEntityId[entityId] ?? null;
  const areaName = area ? registry?.areaNames[area] : undefined;
  const updatedAt = model.changedAt;
  const subtitle = [
    areaName,
    updatedAt !== null ? (now - updatedAt < 60_000 ? pt('snUpdatedNow') : pt('snUpdatedAgo', { time: span(now - updatedAt) })) : null,
  ].filter(Boolean).join(' · ');

  const inSameRoom = (prefix: string) =>
    area ? Object.keys(haStates).filter((id) => id !== entityId && id.startsWith(prefix) && registry?.entityAreaByEntityId[id] === area) : [];

  /* ---- The alert ---- */
  const words = alert ? ALERT_WORDS[alert.reason] : undefined;
  const showAlert = Boolean(words && alert && alert.level !== 'notice');
  const alertColor = alert?.level === 'critical' ? 'var(--dv-red)' : 'var(--dv-amber)';
  const climates = inSameRoom('climate.');
  const fans = inSameRoom('fan.');
  const covers = inSameRoom('cover.').filter((id) => SHADING_COVERS.has(String(haStates[id]?.rawAttributes?.device_class ?? '')));
  const run = (domain: string, service: string, ids: string[]) => void services?.callService(domain, service, { entity_id: ids });
  const actions: Array<{ key: string; label: string; onPress: () => void }> = [];
  if (services && (alert?.reason === 'hot' || alert?.reason === 'cold') && climates.length > 0) {
    actions.push({ key: 'climate', label: pt('snOnClimate'), onPress: () => run('climate', 'turn_on', climates) });
  }
  if (services && alert?.reason === 'hot' && covers.length > 0) {
    actions.push({ key: 'covers', label: pt('snCloseCovers'), onPress: () => run('cover', 'close_cover', covers) });
  }
  if (services && alert?.reason === 'humid' && fans.length > 0) {
    actions.push({ key: 'fan', label: pt('snOnFan'), onPress: () => run('fan', 'turn_on', fans) });
  }

  /* ---- The chart ---- */
  const dayStart = startOfDay(now);
  const dayLength = now - dayStart || 1;
  const longPeriod = period !== '24h';
  const usesChange = model.family === 'water' || (model.family === 'energy' && model.deviceClass !== 'power');
  const linePoints = longPeriod ? statisticsToPoints(series.rows) : series.points;
  const stats = seriesStats(linePoints);
  const longMin = longPeriod && series.rows.length > 0 ? Math.min(...series.rows.map((row) => row.min ?? row.mean ?? Infinity)) : null;
  const longMax = longPeriod && series.rows.length > 0 ? Math.max(...series.rows.map((row) => row.max ?? row.mean ?? -Infinity)) : null;

  const bars = chart !== 'bars'
    ? []
    : model.family === 'motion'
      ? hourlyYes(series.changes, now)
      : longPeriod
        ? dailyBars(series.rows, (row) => (usesChange ? row.change : row.mean), usesChange ? 'sum' : 'mean')
        : usesChange
          ? hourlyIncrease(series.points, now).map((value) => value ?? 0)
          : hourlyMeans(series.points, now).map((value) => value ?? 0);
  const barTop = Math.max(0, ...bars) || 1;
  const barsTotal = bars.reduce((sum, value) => sum + value, 0);

  const isYesNo = model.state.toLowerCase() === 'on' || model.state.toLowerCase() === 'off' || entityId.startsWith('binary_sensor.');
  const dayChanges = series.changes.length > 0
    ? series.changes
    : model.changedAt !== null ? [{ t: model.changedAt, state: model.state.toLowerCase() }] : [];
  const yesParts = chart === 'strip' && isYesNo ? yesSpans(dayChanges, dayStart, now) : [];
  const yesTotal = yesParts.reduce((sum, part) => sum + (part.end - part.start), 0);
  const wordParts = chart === 'strip' && !isYesNo && model.family === 'state'
    ? series.changes.map((change, index) => ({ start: Math.max(change.t, dayStart), end: series.changes[index + 1]?.t ?? now, state: change.state })).filter((part) => part.end > dayStart)
    : [];
  const wordsSeen = [...new Set(wordParts.map((part) => part.state))];

  const band = chart === 'line' ? idealBandOf(model.family, model.deviceClass, model.unit) : null;
  const lineValues = linePoints.map((point) => point.v);
  const yLow = Math.min(...lineValues, ...(band ?? []), model.value ?? Infinity);
  const yHigh = Math.max(...lineValues, ...(band ?? []), model.value ?? -Infinity);
  const pad = (yHigh - yLow) * 0.12 || 1;
  // What cannot be negative is not drawn below zero.
  const y0 = yLow >= 0 ? Math.max(0, yLow - pad) : yLow - pad;
  const y1 = yHigh + pad;
  const yOf = (value: number) => (1 - (value - y0) / (y1 - y0)) * 100;
  const t0 = linePoints[0]?.t ?? 0;
  const timeSpan = (linePoints[linePoints.length - 1]?.t ?? 1) - t0 || 1;
  const coordinates = linePoints.map((point) => `${(((point.t - t0) / timeSpan) * 100).toFixed(2)},${yOf(point.v).toFixed(2)}`);

  const hasChart = chart === 'line' ? linePoints.length > 1 : chart === 'bars' ? bars.some((value) => value > 0) : yesParts.length > 0 || wordParts.length > 0;
  const chartTitle = chart === 'strip' ? pt('snToday') : pt(PERIOD_WORDS[period].title);
  const axis = chart === 'strip' || period === '24h'
    ? ['0:00', '6:00', '12:00', '18:00', pt('snNowWord')]
    : period === '7d' ? [pt('sn7d'), pt('snNowWord')] : [pt('sn30d'), pt('snNowWord')];
  const figures: Array<[string, string]> = chart === 'line'
    ? stats
      ? [[dt('statMin'), withUnit(longMin ?? stats.min)], [dt('statMax'), withUnit(longMax ?? stats.max)], [dt('statAvg'), withUnit(stats.avg)]]
      : []
    : chart === 'bars'
      ? model.family === 'motion'
        ? [[pt('snPassages'), String(barsTotal)], ...(model.changedAt !== null ? [[pt('snLast'), clock(model.changedAt, locale)] as [string, string]] : [])]
        : usesChange
          ? [[pt('snTotal'), withUnit(barsTotal)], [pt('snPeak'), withUnit(barTop)]]
          : [[pt('snPeak'), withUnit(barTop)]]
      : yesParts.length > 0
        ? [[pt('snTimes'), String(yesParts.length)], [pt('snTimeOn'), span(yesTotal)]]
        : [];

  /* ---- Where it sits, and the block of the family ---- */
  const scale = scaleOf(model.family, model.deviceClass, model.unit, model.value, 3.3);

  const rowsOf = (): { title: string; rows: BlockRow[] } | null => {
    const roomRows = (): BlockRow[] => [
      ...house.rows
        .filter((row) => row.entityId !== entityId && row.available && (row.family === 'temperature' || row.family === 'humidity') && area !== null && registry?.entityAreaByEntityId[row.entityId] === area)
        .map((row) => ({ key: row.entityId, label: row.name, value: row.value !== null ? `${formatNumber(row.value, locale)}${row.unit === '%' ? '%' : row.unit.includes('°') ? '°' : ` ${row.unit}`}` : row.state })),
      ...climates.map((id) => ({ key: id, label: String(haStates[id]?.rawAttributes?.friendly_name ?? id), value: String(haStates[id]?.state ?? '') })),
    ];
    switch (model.family) {
      case 'temperature':
      case 'humidity': {
        const rows = roomRows();
        return rows.length > 0 ? { title: pt('snSameRoom'), rows } : null;
      }
      case 'air':
      case 'weather': {
        const peers = sensorPeers(house, entityId, [model.family]).filter((row) => row.available);
        const rows = peers.map((row) => ({ key: row.entityId, label: row.name, value: row.value !== null ? `${formatNumber(row.value, locale)} ${row.unit}` : row.state }));
        return rows.length > 0 ? { title: model.family === 'air' ? pt('snSameDevice') : pt('snWeatherStation'), rows } : null;
      }
      case 'energy': {
        const rows = housePowers(house, entityId).slice(0, 5).map(({ row, kw }) => ({ key: row.entityId, label: row.name, value: kw < 1 ? `${Math.round(kw * 1000)} W` : `${formatNumber(kw, locale, 1)} kW` }));
        return rows.length > 0 ? { title: pt('snWhoUses'), rows } : null;
      }
      case 'battery': {
        const rows = houseBatteries(house)
          .filter((row) => row.entityId !== entityId)
          .sort((a, b) => (a.value ?? 0) - (b.value ?? 0))
          .slice(0, 6)
          .map((row) => {
            const band2 = batteryBand(row.value ?? 0);
            return { key: row.entityId, label: row.name, value: `${Math.round(row.value ?? 0)}%`, color: band2 === 0 ? '#ff453a' : band2 === 1 ? '#ff9f0a' : '#30d158' };
          });
        return rows.length > 0 ? { title: pt('snAllBatteries'), rows } : null;
      }
      case 'signal': {
        const rows = house.rows
          .filter((row) => row.entityId !== entityId && row.family === 'signal' && row.available && row.deviceClass === model.deviceClass)
          .slice(0, 6)
          .map((row) => ({ key: row.entityId, label: row.name, value: row.value !== null ? `${formatNumber(row.value, locale)} ${row.unit}` : row.state }));
        return rows.length > 0 ? { title: pt('snSignals'), rows } : null;
      }
      case 'state': {
        const options = Array.isArray(model.attributes.options) ? (model.attributes.options as unknown[]).filter((option): option is string => typeof option === 'string') : [];
        const rows = options.map((option) => ({
          key: option,
          label: option.replace(/_/g, ' ').replace(/^./, (first) => first.toLocaleUpperCase(locale)),
          value: option === model.state ? pt('snNowWord') : '',
          color: option === model.state ? `rgb(${tint})` : undefined,
        }));
        return rows.length > 0 ? { title: pt('snPhases'), rows } : null;
      }
      case 'opening': {
        const rows = [...yesParts].reverse().slice(0, 5).map((part) => ({
          key: String(part.start),
          label: clock(part.start, locale),
          value: part.end >= now - 60_000 ? pt('snNowWord') : span(part.end - part.start),
        }));
        return rows.length > 0 ? { title: pt('snOpenedToday'), rows } : null;
      }
      case 'safety': {
        const rows = houseDetectors(house)
          .filter((row) => row.entityId !== entityId)
          .map((row) => ({ key: row.entityId, label: row.name, value: row.state === 'on' ? dt('ssSafetyOn') : dt('ssSafetyOff'), color: row.state === 'on' ? '#ff453a' : '#30d158' }));
        return rows.length > 0 ? { title: pt('snDetectors'), rows } : null;
      }
      case 'device': {
        const rows = houseConnections(house)
          .filter((row) => row.entityId !== entityId)
          .map((row) => ({ key: row.entityId, label: row.name, value: row.state === 'on' ? dt('ssOnline') : dt('ssOffline'), color: row.state === 'on' ? '#30d158' : '#ff453a' }));
        return rows.length > 0 ? { title: pt('snOtherDevices'), rows } : null;
      }
      default:
        return null;
    }
  };
  const block = rowsOf();

  /* ---- The threshold ---- */
  const currentThreshold = rule ? threshold ?? rule.start : 0;
  const thresholdText = rule ? `${new Intl.NumberFormat(locale, { minimumFractionDigits: rule.decimals, maximumFractionDigits: rule.decimals }).format(currentThreshold)}${rule.unit ?? ''}` : '';
  const crossed = rule !== null && threshold !== null && !showAlert && thresholdCrossed(rule, threshold, model.value, model.unit);
  const step = (direction: 1 | -1) => {
    if (!rule) return;
    const next = stepThreshold(rule, currentThreshold, direction);
    setThreshold(next);
    storeThreshold(entityId, next);
  };

  // The card titles a word as "Name · word": that word is the value of what has no number.
  const titleWord = face && face.title.startsWith(`${model.name} · `) ? face.title.slice(model.name.length + 3) : null;
  const bigWord = isWord ? titleWord ?? face?.mini.split(' · ')[0] ?? model.state : null;
  const noteLine = !model.available ? null : isWord ? face?.expandedStatus ?? face?.status : face?.status;
  const note = noteLine && noteLine !== bigWord ? noteLine : null;
  const alertTitle = words ? dt(words.title).replace(/[.!]+$/, '') : '';
  const alertTip = words?.tip ? dt(words.tip) : words?.panelTip ? pt(words.panelTip) : null;
  const alertSince = alert?.since ? dt('ssSince', { time: span(now - alert.since) }) : null;
  const showTitle = alertTitle !== note && alertTitle !== bigWord;
  const hasAlertBody = showTitle || alertTip || alertSince || actions.length > 0;

  return (
    <div style={{ '--dv-pn-tint': alert?.level === 'critical' ? '255 69 58' : '255 159 10', '--dv-pn-chart': `rgb(${tint})`, '--sn-tint': `rgb(${tint})` } as React.CSSProperties}>
      <PanelShell
        className={clsx(showAlert && 'dv-pn-tinted')}
        icon={<Icon size={23} strokeWidth={2} />}
        iconStyle={showAlert && alert?.level === 'critical' ? { background: 'rgb(255 69 58)', color: '#ffffff' } : { background: `rgb(${tint} / 0.18)`, color: `rgb(${tint})` }}
        name={model.name}
        subtitle={subtitle}
        embedded={embedded}
        live={live}
        onClose={onClose}
      >
        <div className={clsx('dv-pn-value', isWord && 'is-word', stale && 'is-stale')}>
          <span>
            <b style={showAlert ? { color: alertColor } : undefined}>{bigWord ?? reading.value}</b>
            {!isWord && reading.unit ? <i>{reading.unit}</i> : null}
          </span>
          {note ? <span className="dv-pn-note" style={showAlert ? { color: alertColor } : undefined}>{note}</span> : null}
        </div>

        {showAlert && hasAlertBody ? (
          <div className={clsx('dv-banner dv-pn-banner', alert?.level === 'critical' && 'is-red')} role="alert">
            <Icon size={18} strokeWidth={2.2} aria-hidden="true" />
            <span>
              {showTitle ? <b>{alertTitle}.</b> : null}
              {alertSince ? <span>{alertSince.replace(/^./, (first) => first.toLocaleUpperCase(locale))}</span> : null}
              {alertTip ? <span>{alertTip}</span> : null}
              {actions.length > 0 ? (
                <span className="dv-pn-actions">
                  {actions.map((action, index) => (
                    <button key={action.key} type="button" className={clsx('dv-pn-pill', index === 0 && 'is-on')} onClick={action.onPress}>{action.label}</button>
                  ))}
                </span>
              ) : null}
            </span>
          </div>
        ) : null}

        {crossed ? (
          <div className="dv-banner dv-pn-banner" role="status"><span><b>{pt('snCrossed', { value: thresholdText })}</b></span></div>
        ) : null}

        {hasChart || series.loading || periods.length > 1 ? (
          <div className="dv-card dv-pn-chart">
            <div className="dv-pn-chart-top">
              <span className="dv-pn-chart-title">{chartTitle}</span>
              {periods.length > 1 ? (
                <GlassSegmentSelect<SensorPanelPeriod>
                  className="dv-seg"
                  ariaLabel={pt('snPeriod')}
                  options={periods.map((key) => ({ value: key, label: pt(PERIOD_WORDS[key].label) }))}
                  value={period}
                  onChange={setPeriod}
                />
              ) : null}
            </div>
            {!hasChart ? (
              <p className="dv-t2 m-0 py-6 text-center text-sm">{series.loading ? pt('snLoading') : pt('snNoData')}</p>
            ) : chart === 'line' ? (
              <div className="dv-chart" role="img" aria-label={chartTitle} data-testid="sensor-panel-line">
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  {band ? <rect x="0" y={Math.max(0, yOf(band[1])).toFixed(2)} width="100" height={Math.max(0, yOf(band[0]) - yOf(band[1])).toFixed(2)} className="dv-chart-band" /> : null}
                  <polygon points={`0,100 ${coordinates.join(' ')} 100,100`} className="dv-chart-area" />
                  <polyline points={coordinates.join(' ')} className="dv-chart-line" />
                </svg>
                <span className="dv-chart-y top-0">{formatNumber(y1, locale)}</span>
                <span className="dv-chart-y bottom-0">{formatNumber(y0, locale)}</span>
                {model.value !== null ? <span className="dv-chart-dot" style={{ top: `${yOf(model.value).toFixed(2)}%` }} /> : null}
              </div>
            ) : chart === 'bars' ? (
              <div className="dv-pn-bars" role="img" aria-label={chartTitle} data-testid="sensor-panel-bars">
                {bars.map((value, index) => <i key={index} style={{ height: `${(value / barTop) * 100}%` }} />)}
              </div>
            ) : (
              <div className="dv-pn-strip" role="img" aria-label={chartTitle} data-testid="sensor-panel-strip">
                {yesParts.map((part) => (
                  <i key={part.start} style={{ left: `${((part.start - dayStart) / dayLength) * 100}%`, width: `${((part.end - part.start) / dayLength) * 100}%` }} />
                ))}
                {wordParts.map((part) => (
                  <i
                    key={part.start}
                    style={{
                      left: `${((part.start - dayStart) / dayLength) * 100}%`,
                      width: `${((part.end - part.start) / dayLength) * 100}%`,
                      opacity: 0.4 + (0.6 * (wordsSeen.indexOf(part.state) + 1)) / wordsSeen.length,
                    }}
                  />
                ))}
              </div>
            )}
            {hasChart ? <div className="dv-pn-axis" aria-hidden="true">{axis.map((label) => <span key={label}>{label}</span>)}</div> : null}
            {hasChart && figures.length > 0 ? (
              <div className="dv-stats">
                {figures.map(([label, value]) => (
                  <div key={label}><span className="dv-t2">{label}</span><strong>{value}</strong></div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {scale || block ? (
          <button type="button" className="dv-pn-more" aria-expanded={moreOpen} onClick={() => setMoreOpen((open) => !open)}>
            {moreOpen ? pt('snLess') : pt('snMore')}
            {moreOpen ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
          </button>
        ) : null}
        <div className={clsx('dv-pn-more-body', !moreOpen && 'is-closed')}>
          {scale ? (
            <div className="dv-pn-line">
              <span className="dv-pn-label">{pt('snWhere')}</span>
              <div className="dv-pn-scale" aria-hidden="true">
                {scale.zones.map((zone) => <span key={zone.label} style={{ width: `${zone.width}%`, background: zone.color }} />)}
                <i style={{ left: `${scale.mark * 100}%` }} />
              </div>
              <div className="dv-pn-zones" aria-hidden="true">
                {scale.zones.map((zone) => <span key={zone.label} style={{ width: `${zone.width}%` }}>{zone.label === 'snHigh' || zone.label === 'snLimit' ? pt(zone.label) : dt(zone.label)}</span>)}
              </div>
            </div>
          ) : null}
          {block ? (
            <>
              <div className="dv-pn-label">{block.title}</div>
              <div className="dv-card dv-pn-rows">
                {block.rows.map((row) => (
                  <div key={row.key} className="dv-pn-row">
                    {row.color ? <i className="dv-pn-dot" style={{ background: row.color }} aria-hidden="true" /> : null}
                    <span className="dv-pn-rt"><b>{row.label}</b>{row.note ? <span className="dv-t2">{row.note}</span> : null}</span>
                    {row.value ? <span className="dv-pn-tm dv-t2">{row.value}</span> : null}
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>

        {rule ? (
          <div className="dv-card dv-pn-rows" data-testid="sensor-threshold">
            <div className="dv-pn-row">
              <span className="dv-pn-rt">
                <b>{pt(rule.direction === 'above' ? 'snThresholdAbove' : rule.direction === 'below' ? 'snThresholdBelow' : 'snThresholdLonger', { value: thresholdText })}</b>
                <span className="dv-t2">{pt('snThresholdNote')}</span>
              </span>
              <span className="dv-pn-steps">
                <button type="button" className="dv-round dv-round-sm" aria-label={pt('snThresholdDown')} onClick={() => step(-1)}><Minus size={15} strokeWidth={2.6} aria-hidden="true" /></button>
                <button type="button" className="dv-round dv-round-sm" aria-label={pt('snThresholdUp')} onClick={() => step(1)}><Plus size={15} strokeWidth={2.6} aria-hidden="true" /></button>
              </span>
            </div>
          </div>
        ) : null}

        {battery !== null && model.family !== 'battery' ? (
          <div className={clsx('dv-pn-foot', battery <= 20 && 'text-[color:var(--dv-amber)]')}>
            <BatteryMedium size={15} strokeWidth={2} aria-hidden="true" />{pt('snBattery', { pct: Math.round(battery) })}
          </div>
        ) : null}
      </PanelShell>
    </div>
  );
}

export default SensorFamilyPanel;
