import React, { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { ArrowDownRight, ArrowUpRight, BatteryMedium, ChartColumn, Gauge, Layers, ListChecks } from 'lucide-react';
import { useSensorFamilyTranslations, type SensorFamilyWordKey } from '../../../../i18n/sensorFamilyTranslations';
import { usePanelsTranslations, type PanelsTranslationKey } from '../../../../i18n/panelsTranslations';
import { useI18n } from '../../../../i18n/I18nProvider';
import type { MockEntityState, MockEntityStateMap } from '../../../../types/ha';
import { GlassChips } from '../../../ui/GlassChips';
import { GlassValueRows, type GlassValueRow } from '../../../ui/GlassListRow';
import { usePanelSpecTranslations } from '../../../../i18n/panelSpecTranslations';
import { describeFamilySensor, toFamilySensorModel } from '../../cards/SensorFamilyCard';
import { buildSensorHouse, houseBatteries, houseConnections, houseDetectors, housePowers, sensorPeers } from '../../cards/sensorHouse';
import type { StateChange } from '../../model/security';
import { findBatterySensor, seriesStats, type SeriesPoint } from '../../model/sensor';
import { formatPanelSpan } from '../../model/panelRules';
import { batteryBand, type SensorAlertReason, type SensorFamily } from '../../model/sensorFamily';
import { changeOver, hourlyIncrease, hourlyMeans, hourlyYes, startOfDay, yesSpans } from '../../model/sensorFigures';
import {
  chartKindOf,
  dailyBars,
  idealBandOf,
  periodsOf,
  scaleOf,
  statisticsToPoints,
  type SensorPanelPeriod,
} from '../../model/sensorPanel';
import { useEntityRegistry, usePanelHouseContext, usePanelTechnicalEntities, useSensorSeries } from '../panelData';
import { dashboardHouseLookups } from '../../../../services/dashboardHouseContext';
import { usePanelServices } from '../panelServicesContext';
import type { PanelControl, PanelEntry, PanelSpec } from '../registry';
import { accentOf, ICON, PanelRows } from './shared';
import '../../theme/panels.css';
import './data.css';

/*
 * The panel of a sensor, one for each of the 17 families: the value and its
 * word, the alert when something is wrong and the chart; its period, its values and a
 * block that changes with the family as controls. Nothing is made up: a block without
 * data, or an action without its device, is not there.
 */

export type SensorPanelInput = {
  entityId: string;
  name: string;
  history?: number[];
  /** What a page without Home Assistant knows of the sensor: the demo of Rooms. */
  givenSeries?: (hours: number) => SeriesPoint[];
  givenChanges?: StateChange[];
  givenBattery?: number | null;
  /** The room, when the page already knows it. */
  roomName?: string;
  haStates: MockEntityStateMap;
  /** What the card knows, for a sensor the Home cannot read. */
  fallbackEntity?: MockEntityState;
  /** Its data are old: the value goes grey. */
  stale?: boolean;
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

// Where the word under the value says that all is well.
const GOOD_WORD_FAMILIES = new Set<SensorFamily>(['temperature', 'humidity', 'air', 'battery']);

const SHADING_COVERS = new Set(['blind', 'shutter', 'shade', 'curtain', 'awning']);

const PERIOD_WORDS: Record<SensorPanelPeriod, { label: PanelsTranslationKey; title: PanelsTranslationKey }> = {
  '24h': { label: 'sn24h', title: 'snLast24h' },
  '7d': { label: 'sn7d', title: 'snLast7d' },
  '30d': { label: 'sn30d', title: 'snLast30d' },
  '6mo': { label: 'sn6mo', title: 'snLast6mo' },
  '1y': { label: 'sn1y', title: 'snLast1y' },
};

const clock = (time: number, locale: string) => new Date(time).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

const formatNumber = (value: number, locale: string, decimals?: number) =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: decimals ?? (Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 1 ? 1 : 2) }).format(value).replace(/^-/, '−');

type BlockRow = { key: string; label: string; value: string; note?: string; color?: string };

function containsEntityReference(value: unknown, entityId: string, depth = 0): boolean {
  if (depth > 4) return false;
  if (typeof value === 'string') return value === entityId || value.split(/[\s,]+/).includes(entityId);
  if (Array.isArray(value)) return value.some((entry) => containsEntityReference(entry, entityId, depth + 1));
  if (!value || typeof value !== 'object') return false;
  return Object.values(value as Record<string, unknown>).some((entry) => containsEntityReference(entry, entityId, depth + 1));
}

const GIVEN_HOURS: Partial<Record<SensorPanelPeriod, number>> = { '24h': 24, '7d': 168, '30d': 720 };

function useSensorSpec({ entityId, name, history, givenSeries, givenChanges, givenBattery, roomName, haStates, fallbackEntity, stale = false }: SensorPanelInput): PanelSpec {
  const sp = usePanelSpecTranslations();
  const dt = useSensorFamilyTranslations();
  const pt = usePanelsTranslations();
  const { locale } = useI18n();
  const services = usePanelServices();
  const legacySecurity = entityId.startsWith('binary_sensor.');
  const registry = useEntityRegistry(legacySecurity);
  const houseContext = usePanelHouseContext(!legacySecurity);
  const houseLookups = React.useMemo(() => dashboardHouseLookups(houseContext), [houseContext]);
  const technicalEntities = usePanelTechnicalEntities();
  const roomIdOf = (id: string) => legacySecurity ? registry?.entityAreaByEntityId[id] ?? null : houseLookups.roomIdOf(id);
  const now = Date.now();
  const entity = haStates[entityId] ?? fallbackEntity;

  const batteryId = findBatterySensor(entityId, haStates, (id) => technicalEntities.find((entry) => entry.entityId === id)?.deviceId);
  const batteryValue = batteryId ? Number(haStates[batteryId]?.state) : Number.NaN;
  const battery = Number.isFinite(batteryValue) ? batteryValue : givenBattery ?? null;
  const model = toFamilySensorModel(entityId, entity, { name, battery, fallbackFamily: entityId.startsWith('binary_sensor.') ? 'device' : 'measure' });
  const [period, setPeriod] = useState<SensorPanelPeriod>(() =>
    model ? periodsOf(model.family, model.attributes, false)[0] ?? '24h' : '24h',
  );

  const fallback = useMemo<SeriesPoint[]>(() => {
    if (givenSeries) return givenSeries(GIVEN_HOURS[period] ?? 24);
    const values = history ?? [];
    return values.map((v, index) => ({ t: now - (values.length - 1 - index) * ((24 * 3_600_000) / Math.max(1, values.length - 1)), v }));
    // Drawn once from what the card had when the panel opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [givenSeries === undefined, history, period]);
  const historyPeriods = Boolean(model && ['opening', 'motion', 'safety', 'device'].includes(model.family));
  const series = useSensorSeries(entityId, period, fallback, { historyPeriods });
  const house = useMemo(() => buildSensorHouse(haStates), [haStates]);


  // Without Home Assistant there is nobody to ask for a longer period.
  const periods = model && (services || givenSeries) ? periodsOf(model.family, model.attributes, series.statisticsMissing) : (['24h'] as SensorPanelPeriod[]);
  useEffect(() => {
    if (!periods.includes(period)) setPeriod(periods[0] ?? '24h');
  }, [period, periods]);

  if (!model) {
    return { owner: entityId, name, status: '', accent: accentOf('142 142 147'), tint: false, heroKind: 'data', hero: null, controls: [] };
  }
  const changes = series.changes.length > 0 ? series.changes : givenChanges ?? [];

  const { alert, face, reading } = describeFamilySensor(model, {
    history: series.points,
    changes: changes,
    house,
    now,
    dt,
    locale,
  });

  const tint = FAMILY_RGB[model.family];
  const Icon = face?.icon ?? Gauge;
  const chart = chartKindOf(model.family);
  const isWord = !model.available || model.value === null || chart === 'strip' || model.family === 'motion';
  const spans = { min: pt('spanMin'), hour: pt('spanHour'), day: pt('spanDay') };
  const span = (ms: number) => formatPanelSpan(ms, spans);
  const unitText = reading.unit === '°' || reading.unit === '%' ? reading.unit : reading.unit ? ` ${reading.unit}` : '';
  const withUnit = (value: number, decimals?: number) => `${formatNumber(value, locale, decimals)}${unitText}`;

  const area = roomIdOf(entityId);
  const areaName = roomName ?? (legacySecurity ? (area ? registry?.areaNames[area] : undefined) : houseLookups.roomNameOf(entityId));
  const updatedAt = model.changedAt;
  const subtitle = [
    areaName,
    updatedAt !== null ? (now - updatedAt < 60_000 ? pt('snUpdatedNow') : pt('snUpdatedAgo', { time: span(now - updatedAt) })) : null,
  ].filter(Boolean).join(' · ');

  const inSameRoom = (prefix: string) =>
    area ? Object.keys(haStates).filter((id) => id !== entityId && id.startsWith(prefix) && roomIdOf(id) === area) : [];

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
  const timelineStart = period === '7d' && historyPeriods ? now - 7 * 86_400_000 : dayStart;
  const timelineLength = now - timelineStart || 1;
  const longPeriod = period !== '24h' && !givenSeries;
  const usesChange = model.family === 'water' || (model.family === 'energy' && model.deviceClass !== 'power');
  const linePoints = longPeriod ? statisticsToPoints(series.rows) : series.points;
  const stats = seriesStats(linePoints);
  const longMin = longPeriod && series.rows.length > 0 ? Math.min(...series.rows.map((row) => row.min ?? row.mean ?? Infinity)) : null;
  const longMax = longPeriod && series.rows.length > 0 ? Math.max(...series.rows.map((row) => row.max ?? row.mean ?? -Infinity)) : null;

  const bars = chart !== 'bars'
    ? []
    : model.family === 'motion'
      ? period === '7d'
        ? Array.from({ length: 7 }, (_, index) => {
            const from = now - (7 - index) * 86_400_000;
            const to = from + 86_400_000;
            return changes.filter((change) => change.state === 'on' && change.t >= from && change.t < to).length;
          })
        : hourlyYes(changes, now)
      : longPeriod
        ? dailyBars(series.rows, (row) => (usesChange ? row.change : row.mean), usesChange ? 'sum' : 'mean')
        : usesChange
          ? hourlyIncrease(series.points, now).map((value) => value ?? 0)
          : hourlyMeans(series.points, now).map((value) => value ?? 0);
  const barTop = Math.max(0, ...bars) || 1;
  const barsTotal = bars.reduce((sum, value) => sum + value, 0);

  const isYesNo = model.state.toLowerCase() === 'on' || model.state.toLowerCase() === 'off' || entityId.startsWith('binary_sensor.');
  const dayChanges = changes.length > 0
    ? changes
    : model.changedAt !== null ? [{ t: model.changedAt, state: model.state.toLowerCase() }] : [];
  const yesParts = chart === 'strip' && isYesNo ? yesSpans(dayChanges, timelineStart, now) : [];
  const yesTotal = yesParts.reduce((sum, part) => sum + (part.end - part.start), 0);
  const wordParts = chart === 'strip' && !isYesNo && model.family === 'state'
    ? changes.map((change, index) => ({ start: Math.max(change.t, timelineStart), end: changes[index + 1]?.t ?? now, state: change.state })).filter((part) => part.end > timelineStart)
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
  const bandEdge = (value: number) => formatNumber(value, locale);
  const chartTitle = chart === 'strip' && period === '24h'
    ? pt('snToday')
    : band && band[0] > 0
      ? dt('idealRange', { lo: bandEdge(band[0]), hi: withUnit(band[1]) })
      : pt(PERIOD_WORDS[period].title);
  const hourChange = !isWord && model.value !== null ? changeOver(series.points, 1, now) : 0;
  const trendMin = Math.max(0.1, Math.abs(model.value ?? 0) * 0.01);
  const trend = Math.abs(hourChange) >= trendMin ? hourChange : 0;
  const axis = period === '24h'
    ? ['0:00', '6:00', '12:00', '18:00', pt('snNowWord')]
    : [pt(PERIOD_WORDS[period].label), pt('snNowWord')];
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

  const rowsOf = (): { title: string; word: string; rows: BlockRow[] } | null => {
    const currentRegistry = technicalEntities.find((entry) => entry.entityId === entityId);
    const sameDevice = currentRegistry?.deviceId
      ? technicalEntities.filter((entry) => entry.entityId !== entityId && entry.deviceId === currentRegistry.deviceId)
      : [];
    const relatedRows = sameDevice.flatMap((entry) => {
      const relatedState = haStates[entry.entityId];
      if (!relatedState) return [];
      return [{
        key: entry.entityId,
        label: String(relatedState.rawAttributes?.friendly_name ?? entry.name ?? entry.originalName ?? entry.entityId),
        value: String(relatedState.state ?? ''),
      }];
    }).slice(0, 6);
    const automationRows = Object.entries(haStates)
      .filter(([id, state]) => id.startsWith('automation.') && containsEntityReference(state.rawAttributes, entityId))
      .map(([id, state]) => ({ key: id, label: String(state.rawAttributes?.friendly_name ?? id), value: String(state.state ?? '') }))
      .slice(0, 6);
    const roomRows = (): BlockRow[] => [
      ...house.rows
        .filter((row) => row.entityId !== entityId && row.available && (row.family === 'temperature' || row.family === 'humidity') && area !== null && roomIdOf(row.entityId) === area)
        .map((row) => ({ key: row.entityId, label: row.name, value: row.value !== null ? `${formatNumber(row.value, locale)}${row.unit === '%' ? '%' : row.unit.includes('°') ? '°' : ` ${row.unit}`}` : row.state })),
      ...climates.map((id) => ({ key: id, label: String(haStates[id]?.rawAttributes?.friendly_name ?? id), value: String(haStates[id]?.state ?? '') })),
    ];
    switch (model.family) {
      case 'temperature':
      case 'humidity': {
        const rows = roomRows();
        return rows.length > 0 ? { title: pt('snSameRoom'), word: pt('snSameRoomWord'), rows } : null;
      }
      case 'air':
      case 'weather': {
        const peers = sensorPeers(house, entityId, [model.family]).filter((row) => row.available);
        const rows = peers.map((row) => ({ key: row.entityId, label: row.name, value: row.value !== null ? `${formatNumber(row.value, locale)} ${row.unit}` : row.state }));
        return rows.length > 0 ? { title: model.family === 'air' ? pt('snSameDevice') : pt('snWeatherStation'), word: model.family === 'air' ? pt('snSameDeviceWord') : pt('snWeatherStationWord'), rows } : null;
      }
      case 'energy': {
        const rows = housePowers(house, entityId).slice(0, 5).map(({ row, kw }) => ({ key: row.entityId, label: row.name, value: kw < 1 ? `${Math.round(kw * 1000)} W` : `${formatNumber(kw, locale, 1)} kW` }));
        return rows.length > 0 ? { title: pt('snWhoUses'), word: pt('snWhoUsesWord'), rows } : null;
      }
      case 'light':
        return automationRows.length > 0 ? { title: pt('snUsedBy'), word: pt('snUsedByWord'), rows: automationRows } : null;
      case 'battery': {
        const rows = houseBatteries(house)
          .filter((row) => row.entityId !== entityId)
          .sort((a, b) => (a.value ?? 0) - (b.value ?? 0))
          .slice(0, 6)
          .map((row) => {
            const band2 = batteryBand(row.value ?? 0);
            return { key: row.entityId, label: row.name, value: `${Math.round(row.value ?? 0)}%`, color: band2 === 0 ? '#ff453a' : band2 === 1 ? '#ff9f0a' : '#30d158' };
          });
        return rows.length > 0 ? { title: pt('snAllBatteries'), word: pt('snAllBatteriesWord'), rows } : null;
      }
      case 'signal': {
        const rows = house.rows
          .filter((row) => row.entityId !== entityId && row.family === 'signal' && row.available && row.deviceClass === model.deviceClass)
          .slice(0, 6)
          .map((row) => ({ key: row.entityId, label: row.name, value: row.value !== null ? `${formatNumber(row.value, locale)} ${row.unit}` : row.state }));
        return rows.length > 0 ? { title: pt('snSignals'), word: pt('snSignalsWord'), rows } : null;
      }
      case 'state': {
        const options = Array.isArray(model.attributes.options) ? (model.attributes.options as unknown[]).filter((option): option is string => typeof option === 'string') : [];
        const rows = options.map((option) => ({
          key: option,
          label: option.replace(/_/g, ' ').replace(/^./, (first) => first.toLocaleUpperCase(locale)),
          value: option === model.state ? pt('snNowWord') : '',
          color: option === model.state ? `rgb(${tint})` : undefined,
        }));
        return rows.length > 0 ? { title: pt('snPhases'), word: pt('snPhasesWord'), rows } : null;
      }
      case 'time': {
        const reminders = relatedRows.filter((row) => row.key.startsWith('calendar.') || row.key.startsWith('todo.') || row.key.startsWith('automation.'));
        const rows = reminders.length > 0 ? reminders : automationRows;
        return rows.length > 0 ? { title: pt('snReminders'), word: pt('snRemindersWord'), rows } : null;
      }
      case 'price':
        return automationRows.length > 0 ? { title: pt('snPriceFollowers'), word: pt('snPriceFollowersWord'), rows: automationRows } : null;
      case 'motion':
        return relatedRows.length > 0 ? { title: pt('snLinkedTo'), word: pt('snLinkedToWord'), rows: relatedRows } : null;
      case 'opening': {
        const rows = [...yesParts].reverse().slice(0, 5).map((part) => ({
          key: String(part.start),
          label: clock(part.start, locale),
          value: part.end >= now - 60_000 ? pt('snNowWord') : span(part.end - part.start),
        }));
        return rows.length > 0 ? { title: pt('snOpenedToday'), word: pt('snOpenedTodayWord'), rows } : null;
      }
      case 'safety': {
        const rows = houseDetectors(house)
          .filter((row) => row.entityId !== entityId)
          .map((row) => ({ key: row.entityId, label: row.name, value: row.state === 'on' ? dt('ssSafetyOn') : dt('ssSafetyOff'), color: row.state === 'on' ? '#ff453a' : '#30d158' }));
        return rows.length > 0 ? { title: pt('snDetectors'), word: pt('snDetectorsWord'), rows } : null;
      }
      case 'device': {
        const rows = houseConnections(house)
          .filter((row) => row.entityId !== entityId)
          .map((row) => ({ key: row.entityId, label: row.name, value: row.state === 'on' ? dt('ssOnline') : dt('ssOffline'), color: row.state === 'on' ? '#30d158' : '#ff453a' }));
        return rows.length > 0 ? { title: pt('snOtherDevices'), word: pt('snOtherDevicesWord'), rows } : null;
      }
      default:
        return null;
    }
  };
  const block = rowsOf();

  // The card titles a word as "Name · word": that word is the value of what has no number.
  const titleWord = face && face.title.startsWith(`${model.name} · `) ? face.title.slice(model.name.length + 3) : null;
  const bigWord = !model.available ? dt('unavailable') : isWord ? titleWord ?? face?.mini.split(' · ')[0] ?? model.state : null;
  const noteLine = !model.available ? null : isWord ? face?.expandedStatus ?? face?.status : face?.status;
  const note = noteLine && noteLine !== bigWord ? noteLine : null;
  // A tip may say the state and the advice as one: "Above ideal · close the shutters".
  const tipParts = (words?.tip ? dt(words.tip) : words?.panelTip ? pt(words.panelTip) : '').split(' · ');
  const alertTip = tipParts.length > 1 ? tipParts.slice(1).join(' · ') : tipParts[0];
  const alertSince = alert?.since ? dt('ssSince', { time: span(now - alert.since) }) : null;
  const alertHead = tipParts.length > 1 ? tipParts[0] : words ? dt(words.title).replace(/[.!]+$/, '') : '';
  const alertTitle = [alertHead, alertSince].filter(Boolean).join(' ');
  // The advice once: as a button when there is one that does it, or else in words.
  const advice = alertTip && !actions.some((action) => action.label.toLocaleLowerCase(locale) === alertTip.toLocaleLowerCase(locale))
    ? alertTip.replace(/^./, (first) => first.toLocaleUpperCase(locale))
    : null;
  const hasAlertBody = Boolean(alertTitle || advice || actions.length > 0);
  const shownNote = showAlert && note === alertHead ? null : note;

  const colours = { '--dv-pn-tint': alert?.level === 'critical' ? '255 69 58' : '255 159 10', '--dv-pn-chart': `rgb(${tint})`, '--sn-tint': `rgb(${tint})` } as React.CSSProperties;
  const chartNode = hasChart || series.loading ? (
    <div className="dv-pn-chart">
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
                  <i key={part.start} style={{ left: `${((part.start - timelineStart) / timelineLength) * 100}%`, width: `${((part.end - part.start) / timelineLength) * 100}%` }} />
                ))}
                {wordParts.map((part) => (
                  <i
                    key={part.start}
                    style={{
                      left: `${((part.start - timelineStart) / timelineLength) * 100}%`,
                      width: `${((part.end - part.start) / timelineLength) * 100}%`,
                      opacity: 0.4 + (0.6 * (wordsSeen.indexOf(part.state) + 1)) / wordsSeen.length,
                    }}
                  />
                ))}
              </div>
            )}
            {hasChart ? <div className="dv-pn-axis" aria-hidden="true">{axis.map((label) => <span key={label}>{label}</span>)}</div> : null}
    </div>
  ) : null;
  const figureTiles = figures.length > 0 ? (
    <div className="panel-sensor-stats">
      {figures.map(([label, value]) => (
        <span key={label}>
          <span>{label}</span>
          <b>{value}</b>
        </span>
      ))}
    </div>
  ) : null;
  const periodChips = (size: 'default' | 'dialog') => (
    <GlassChips<SensorPanelPeriod> size={size} ariaLabel={pt('snPeriod')} options={periods.map((key) => ({ value: key, label: pt(PERIOD_WORDS[key].label) }))} value={period} onChange={setPeriod} />
  );
  const scaleNode = scale ? (
    <div className="dv-pn-line">
      <span className="dv-pn-label">{pt('snWhere')}</span>
      <div className="dv-pn-scale" aria-hidden="true">
        {scale.zones.map((zone) => <span key={zone.label} style={{ width: `${zone.width}%`, background: zone.color }} />)}
        <i style={{ left: `${scale.mark * 100}%` }} />
      </div>
      <div className="dv-pn-zones" aria-hidden="true">
        {scale.zones.map((zone) => <span key={zone.label} style={{ width: `${zone.width}%` }}>{zone.label === 'snHigh' || zone.label === 'snLimit' ? pt(zone.label) : dt(zone.label as never)}</span>)}
      </div>
    </div>
  ) : null;

  // The values hour by hour, and yesterday when the data reach it.
  const hourRows: GlassValueRow[] = [];
  if (chart === 'line') {
    const byHour = new Map<number, number[]>();
    for (const point of series.points) {
      if (point.t < dayStart) continue;
      const hour = Math.floor(point.t / 3_600_000);
      byHour.set(hour, [...(byHour.get(hour) ?? []), point.v]);
    }
    const hours = [...byHour.entries()].map(([hour, values]) => ({ hour, value: values.reduce((sum, value) => sum + value, 0) / values.length })).sort((first, second) => second.hour - first.hour);
    const hoursRows = hours.map(({ hour, value }, index) => {
      const before = hours[index + 1]?.value;
      const change = before === undefined ? null : value - before;
      return {
        key: `h-${hour}`,
        title: clock(hour * 3_600_000, locale),
        note: change === null ? undefined : sp.t('valuesBefore', { value: `${change >= 0 ? '+' : '−'}${withUnit(Math.abs(change))}` }),
        value: withUnit(value),
      };
    });
    if (hoursRows.length > 0) hourRows.push({ key: 'today', heading: sp.t('valuesToday') }, ...hoursRows);
    const yesterday = series.points.filter((point) => point.t < dayStart && point.t >= dayStart - 86_400_000);
    if (yesterday.length > 1) {
      const low = yesterday.reduce((best, point) => (point.v < best.v ? point : best));
      const high = yesterday.reduce((best, point) => (point.v > best.v ? point : best));
      const mean = yesterday.reduce((sum, point) => sum + point.v, 0) / yesterday.length;
      hourRows.push(
        { key: 'yesterday', heading: sp.t('valuesYesterday') },
        { key: 'y-max', title: `${sp.t('valuesMax')} · ${clock(high.t, locale)}`, value: withUnit(high.v) },
        { key: 'y-min', title: `${sp.t('valuesMin')} · ${clock(low.t, locale)}`, value: withUnit(low.v) },
        { key: 'y-avg', title: sp.t('valuesAvg'), value: withUnit(mean) },
      );
    }
  }
  const valueRows: GlassValueRow[] = hourRows.length > 0 ? hourRows : figures.map(([title, value]) => ({ key: title, title, value }));

  const controls: PanelControl[] = [];
  if (periods.length > 1) {
    controls.push({
      id: 'period',
      icon: <ChartColumn {...ICON} />,
      label: pt('snPeriod'),
      value: pt(PERIOD_WORDS[period].label),
      looks: ['chart'],
      big: () => (
        <div className="panel-sensor is-big" style={colours}>
          {periodChips('default')}
          {chartNode}
          {figureTiles}
        </div>
      ),
      group: periodChips('dialog'),
    });
  }
  if (valueRows.length > 0 || scale) {
    controls.push({
      id: 'values',
      icon: <ListChecks {...ICON} />,
      label: sp.t('sensorValues'),
      value: hourRows.length > 0 ? sp.t('valuesHourly') : undefined,
      looks: ['rows'],
      big: () => (
        <div className="panel-two-lists is-big-list">
          {scaleNode}
          <GlassValueRows rows={valueRows} />
        </div>
      ),
      group: (
        <>
          {scaleNode}
          {hasChart && figures.length > 0 ? <PanelRows rows={figures} /> : null}
        </>
      ),
    });
  }
  if (block) {
    const blockRows = block.rows.map((row) => ({ key: row.key, title: row.label, note: row.note, value: row.value }));
    controls.push({
      id: 'block',
      icon: <Layers {...ICON} />,
      label: block.word,
      title: block.title,
      looks: ['rows'],
      big: () => <GlassValueRows size="hero" rows={blockRows} />,
      group: <GlassValueRows rows={blockRows} />,
    });
  }

  return {
    owner: entityId,
    name: model.name,
    status: subtitle,
    layout: 'sensor',
    heroName: [bigWord ?? `${reading.value}${!isWord && reading.unit ? reading.unit : ''}`, shownNote].filter(Boolean).join(' · '),
    accent: accentOf(showAlert ? (alert?.level === 'critical' ? '255 69 58' : '255 159 10') : tint),
    tint: true,
    heroKind: 'data',
    hero: (
      <div className="panel-sensor" style={colours}>
        {showAlert && hasAlertBody ? (
          <div className={clsx('dv-banner dv-pn-banner', alert?.level === 'critical' && 'is-red')} role="alert">
            <Icon size={18} strokeWidth={2.2} aria-hidden="true" />
            <span>
              <span className="dv-pn-banner-text">
                {alertTitle ? <b>{alertTitle}.</b> : null}
                {advice ? ` ${advice}` : null}
              </span>
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
        <div className={clsx('dv-pn-value', isWord && 'is-word', stale && 'is-stale')}>
          <span>
            <b style={showAlert ? { color: alertColor } : undefined}>{bigWord ?? reading.value}</b>
            {!isWord && reading.unit ? <i>{reading.unit}</i> : null}
          </span>
          {shownNote ? (
            <span className="dv-pn-note" style={{ color: showAlert ? alertColor : GOOD_WORD_FAMILIES.has(model.family) ? '#30d158' : undefined }}>{shownNote}</span>
          ) : null}
          {trend !== 0 ? (
            <span className="dv-pn-trend inline-flex items-center gap-1">
              {trend > 0 ? <ArrowUpRight size={14} strokeWidth={2.6} aria-hidden="true" /> : <ArrowDownRight size={14} strokeWidth={2.6} aria-hidden="true" />}
              {pt('snTrendHour', { value: `${trend > 0 ? '+' : '−'}${withUnit(Math.abs(trend))}` })}
            </span>
          ) : null}
        </div>
        {chartNode}
        {figureTiles}
        {battery !== null && model.family !== 'battery' ? (
          <div className={clsx('dv-pn-foot', battery <= 20 && 'text-[color:var(--dv-amber)]')}>
            <BatteryMedium size={15} strokeWidth={2} aria-hidden="true" />{pt('snBattery', { pct: Math.round(battery) })}
          </div>
        ) : null}
      </div>
    ),
    controls,
  };
}

export const sensorEntry: PanelEntry<SensorPanelInput> = { useSpec: useSensorSpec };
