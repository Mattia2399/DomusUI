import type { Widget } from '../../types/dashboardModels';
import type { MockEntityState } from '../../types/ha';
import { translateForLocale, type AppLocale } from '../../i18n/I18nProvider';

const SWITCH_TOGGLE_PENDING_ATTRIBUTE_KEY = '__dashboard_pending_switch_toggle';

export type SwitchDeviceIcon =
  | 'power'
  | 'plug'
  | 'toggle'
  | 'fan'
  | 'light'
  | 'irrigation'
  | 'water'
  | 'heater'
  | 'tv'
  | 'monitor'
  | 'router'
  | 'pool';

export type SwitchCardModel = {
  title: string;
  available: boolean;
  isOn: boolean;
  pending: boolean;
  pendingTargetOn?: boolean;
  statusLabel: string;
  compactStatusLabel: string;
  deviceIcon: SwitchDeviceIcon;
  consumption: {
    available: boolean;
    valueText: string;
    unit?: string;
    combinedText: string;
    label: string;
    helperText?: string;
  };
};

type BuildSwitchCardModelInput = {
  locale?: AppLocale;
  widget: Widget;
  liveEntity?: MockEntityState;
  consumptionEntity?: MockEntityState;
};

type SwitchState = 'on' | 'off' | 'unavailable' | 'unknown';

function normalizeToken(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/[\s-]+/g, '_') : '';
}

function normalizeSwitchState(value: unknown): SwitchState {
  const normalized = normalizeToken(value);
  if (['on', 'active', 'enabled', 'true', 'acceso', 'accesa', 'attivo', 'attiva'].includes(normalized)) {
    return 'on';
  }
  if (['off', 'inactive', 'disabled', 'false', 'spento', 'spenta', 'disattivo', 'disattiva'].includes(normalized)) {
    return 'off';
  }
  if (['unavailable', 'non_disponibile'].includes(normalized)) {
    return 'unavailable';
  }
  return 'unknown';
}

function resolvePendingTarget(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (value === 'on') return true;
  if (value === 'off') return false;
  return undefined;
}

function toFiniteNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.trim().replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function formatConsumptionValue(value: number, locale: AppLocale) {
  const absoluteValue = Math.abs(value);
  const maximumFractionDigits = absoluteValue >= 100 ? 0 : absoluteValue >= 10 ? 1 : 2;
  return value.toLocaleString(locale, { maximumFractionDigits });
}

function resolveConsumptionLabel(unit: string | undefined) {
  const normalized = (unit ?? '').trim().toLowerCase();
  if (['w', 'kw', 'mw'].includes(normalized)) return 'power';
  if (['wh', 'kwh', 'mwh'].includes(normalized)) return 'energy';
  if (['a', 'ma'].includes(normalized)) return 'current';
  return 'consumption';
}

function resolveConsumptionFromSwitchAttributes(liveEntity: MockEntityState | undefined) {
  const attributes = liveEntity?.rawAttributes;
  if (!attributes) return undefined;
  const candidates: Array<{ keys: string[]; unit: string; label: 'power' | 'energy' | 'current' }> = [
    { keys: ['power', 'current_power', 'current_power_w', 'load_power', 'power_consumption'], unit: 'W', label: 'power' },
    { keys: ['energy', 'total_energy', 'energy_consumption'], unit: 'kWh', label: 'energy' },
    { keys: ['current', 'current_a'], unit: 'A', label: 'current' },
  ];
  for (const candidate of candidates) {
    for (const key of candidate.keys) {
      const value = toFiniteNumber(attributes[key]);
      if (value === undefined) continue;
      const explicitUnit = typeof attributes[`${key}_unit`] === 'string'
        ? String(attributes[`${key}_unit`]).trim()
        : '';
      return {
        value,
        unit: explicitUnit || candidate.unit,
        label: candidate.label,
      };
    }
  }
  return undefined;
}

export function resolveSwitchDeviceIcon(widget: Widget, liveEntity?: MockEntityState): SwitchDeviceIcon {
  const deviceClass = normalizeToken(liveEntity?.rawAttributes?.device_class);
  const entityId = widget.entityId.toLowerCase();
  const friendlyName = normalizeToken(liveEntity?.rawAttributes?.friendly_name);
  const domain = entityId.split('.')[0] ?? '';
  const searchText = `${deviceClass} ${entityId} ${friendlyName}`;

  if (domain === 'fan' || deviceClass === 'fan' || searchText.includes('ventola')) return 'fan';
  if (domain === 'input_boolean') return 'toggle';
  if (deviceClass === 'outlet' || deviceClass === 'plug') return 'plug';
  if (deviceClass === 'switch') return 'toggle';
  if (deviceClass === 'light') return 'light';
  if (deviceClass === 'irrigation' || deviceClass === 'sprinkler') return 'irrigation';
  if (['pump', 'water', 'valve'].includes(deviceClass)) return 'water';
  if (deviceClass === 'heater' || deviceClass === 'heat') return 'heater';
  if (deviceClass === 'tv' || deviceClass === 'television') return 'tv';
  if (deviceClass === 'monitor' || deviceClass === 'display') return 'monitor';
  if (deviceClass === 'router' || deviceClass === 'network') return 'router';
  if (/presa|socket|outlet|plug/.test(searchText)) return 'plug';
  if (/lamp|luce|light/.test(searchText)) return 'light';
  if (/irrig|garden|giardino/.test(searchText)) return 'irrigation';
  if (/pump|pompa|water|acqua/.test(searchText)) return 'water';
  if (/heater|stufa|boiler|caldaia/.test(searchText)) return 'heater';
  if (/television|\btv\b/.test(searchText)) return 'tv';
  if (/monitor|display/.test(searchText)) return 'monitor';
  if (/router|wifi|network/.test(searchText)) return 'router';
  if (/waves|pool|piscina/.test(searchText)) return 'pool';
  return 'power';
}

export function buildSwitchCardModel({
  widget,
  liveEntity,
  consumptionEntity,
  locale = 'it',
}: BuildSwitchCardModelInput): SwitchCardModel {
  const rawState = typeof liveEntity?.toggleOn === 'boolean'
    ? liveEntity.toggleOn ? 'on' : 'off'
    : liveEntity?.state ?? liveEntity?.stateLabel ?? widget.status ?? (widget.isOn ? 'on' : 'off');
  const resolvedState = normalizeSwitchState(rawState);
  const available = resolvedState !== 'unavailable' && resolvedState !== 'unknown';
  const pendingTargetOn = resolvePendingTarget(
    liveEntity?.rawAttributes?.[SWITCH_TOGGLE_PENDING_ATTRIBUTE_KEY],
  );
  const pending = pendingTargetOn !== undefined;
  const isOn = available && (pending ? pendingTargetOn : resolvedState === 'on');
  const relatedConsumptionValue =
    toFiniteNumber(consumptionEntity?.numericValue) ?? toFiniteNumber(consumptionEntity?.state);
  const relatedConsumptionUnit =
    consumptionEntity?.unit?.trim() ||
    String(consumptionEntity?.rawAttributes?.unit_of_measurement ?? '').trim() ||
    undefined;
  const attributeConsumption = resolveConsumptionFromSwitchAttributes(liveEntity);
  const consumptionValue = relatedConsumptionValue ?? attributeConsumption?.value;
  const consumptionUnit = relatedConsumptionValue !== undefined
    ? relatedConsumptionUnit
    : attributeConsumption?.unit;
  const consumptionLabelId = relatedConsumptionValue !== undefined
    ? resolveConsumptionLabel(consumptionUnit)
    : attributeConsumption?.label ?? 'consumption';
  const consumptionLabel = translateForLocale(locale, `card.switch.${consumptionLabelId}`);
  const consumptionAvailable = consumptionValue !== undefined;
  const formattedConsumptionValue = consumptionAvailable ? formatConsumptionValue(consumptionValue, locale) : '—';
  const consumption = {
    available: consumptionAvailable,
    valueText: formattedConsumptionValue,
    unit: consumptionAvailable ? consumptionUnit : undefined,
    combinedText: consumptionAvailable
      ? `${formattedConsumptionValue}${consumptionUnit ? ` ${consumptionUnit}` : ''}`
      : '—',
    label: consumptionLabel,
    helperText: consumptionAvailable
      ? undefined
      : widget.switchConsumptionEntityId?.trim()
        ? translateForLocale(locale, 'card.switch.dataUnavailable')
        : translateForLocale(locale, 'card.switch.configureConsumption'),
  };
  const statusLabel = !available
    ? translateForLocale(locale, 'builder.unavailable')
    : pending
      ? pendingTargetOn ? translateForLocale(locale, 'card.switch.turningOn') : translateForLocale(locale, 'card.switch.turningOff')
      : isOn ? translateForLocale(locale, 'builder.on') : translateForLocale(locale, 'builder.off');

  return {
    title: widget.title || 'Switch',
    available,
    isOn,
    pending,
    pendingTargetOn,
    statusLabel,
    compactStatusLabel: isOn && !pending && consumption.available
      ? `${statusLabel} \u2022 ${consumption.combinedText}`
      : statusLabel,
    deviceIcon: resolveSwitchDeviceIcon(widget, liveEntity),
    consumption,
  };
}
