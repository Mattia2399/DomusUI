import type {
  EnergyDeviceState,
  EnergyModuleId,
  EnergyModuleState,
  EnergyQuantity,
  EnergyTotalState,
} from '../../../services/energyCoreClient';
import { MODULE_META, REASON_LABEL, SOURCE_LABEL, formatAge, formatPower, staleSince } from './energyModel';
import { translateConsumption } from '../../../i18n/consumptionCopy';
import type { AppLocale } from '../../../i18n/I18nProvider';

/*
 * Presentation of modules with several devices or a total sensor. Every value
 * comes from get_state as the backend aggregated it: nothing is summed,
 * averaged or completed here.
 */

/** The figure a module or device is read by. */
export const MAIN_ROLE: Record<EnergyModuleId, string> = {
  grid: 'net_power',
  solar: 'production_power',
  home: 'consumption_power',
  battery: 'net_power',
  wallbox: 'charging_power',
};

/** Signed quantities: a partial sum of these is not even a lower bound. */
const SIGNED_ROLES = new Set(['net_power']);

/** Several devices or a total: the module has a detail worth showing. */
export const hasDeviceDetail = (module: EnergyModuleState | undefined) =>
  Boolean(module && ((module.devices?.length ?? 0) > 1 || module.total));

const devicesWord = (count: number, locale: AppLocale) => count === 1
  ? translateConsumption(locale, '1 dispositivo')
  : translateConsumption(locale, '{count} dispositivi', { count });

/** Where a valid value comes from, in plain words; single devices keep the A0 labels. */
export function originLabel(quantity: EnergyQuantity, locale: AppLocale = 'it'): string {
  switch (quantity.origin) {
    case 'devices_sum':
      return translateConsumption(locale, 'Somma di {devices}', { devices: devicesWord(quantity.coverage?.configured ?? 0, locale) });
    case 'devices_weighted_usable':
      return translateConsumption(locale, 'Media pesata sulla capacità utilizzabile');
    case 'devices_weighted_nominal':
      return translateConsumption(locale, 'Media pesata sulla capacità nominale');
    case 'total':
      return translateConsumption(locale, quantity.source === 'measured' ? 'Misurato dal sensore totale' : 'Derivato dal sensore totale');
    default:
      return translateConsumption(locale, quantity.source ? SOURCE_LABEL[quantity.source] : 'Non disponibile');
  }
}

/** Origin of a valid value, or why there is none (with how many devices report). */
export function quantityLabel(quantity: EnergyQuantity | undefined | null, locale: AppLocale = 'it'): string {
  if (quantity?.status === 'ok') return originLabel(quantity, locale);
  const reason = translateConsumption(locale, REASON_LABEL[quantity?.reason ?? ''] ?? 'Non disponibile');
  const coverage = quantity?.coverage;
  return quantity?.reason === 'partial_devices' && coverage
    ? translateConsumption(locale, '{reason} · {contributing} di {configured}', { reason, ...coverage })
    : reason;
}

/**
 * What the reporting devices give when the module value is missing. Never the
 * module value: "3,5 kW dai dispositivi disponibili", and for signed flows the
 * direction instead of a bound.
 */
export function partialLine(id: EnergyModuleId, role: string, quantity: EnergyQuantity | undefined, locale: AppLocale = 'it'): [string, string] | null {
  if (!quantity || quantity.status === 'ok' || quantity.partial_value == null || !quantity.coverage) return null;
  const { contributing, configured } = quantity.coverage;
  const value = quantity.partial_value;
  let text = formatPower(Math.abs(value), locale);
  if (SIGNED_ROLES.has(role)) {
    const inbound = translateConsumption(locale, id === 'grid' ? 'in prelievo' : 'in scarica');
    const outbound = translateConsumption(locale, id === 'grid' ? 'in immissione' : 'in carica');
    text = Math.abs(value) < 10 ? translateConsumption(locale, 'nessuno scambio') : `${value > 0 ? inbound : outbound} ${text}`;
  }
  return [
    translateConsumption(locale, 'Dai dispositivi disponibili'),
    translateConsumption(locale, '{text} · {contributing} di {configured}', { text, contributing, configured }),
  ];
}

export type ModuleCondition = 'complete' | 'detail_incomplete' | 'partial';

/**
 * A configured total that is valid keeps the module value trustworthy even when
 * one device is offline: only its detail is incomplete.
 */
export function moduleCondition(id: EnergyModuleId, module: EnergyModuleState): ModuleCondition {
  if (module.complete) return 'complete';
  const main = module.quantities[MAIN_ROLE[id]];
  if (module.total && module.total.status === 'online' && module.total.complete && main?.status === 'ok' && main.origin === 'total') {
    return 'detail_incomplete';
  }
  return 'partial';
}

export type DeviceRow = {
  key: string;
  name: string;
  /** Main reading, or a dash. */
  value: string;
  /** Status, staleness or why the value is missing. */
  caption: string;
  tone: 'ok' | 'warning' | 'muted';
  convention: string | null;
  quantities: Array<[string, EnergyQuantity]>;
};

const conventionText = (id: EnergyModuleId, convention: string | null, locale: AppLocale) => {
  const text = convention ? MODULE_META[id].conventions?.find(([value]) => value === convention)?.[1] ?? null : null;
  return text ? translateConsumption(locale, text) : null;
};

function mainValue(id: EnergyModuleId, quantities: Record<string, EnergyQuantity>, locale: AppLocale): { value: string; caption: string | null } {
  const main = quantities[MAIN_ROLE[id]];
  const soc = quantities.state_of_charge;
  const power = main?.status === 'ok' && main.value !== null ? main.value : null;
  if (id === 'battery') {
    const level = soc?.status === 'ok' && soc.value !== null ? `${Math.round(soc.value)}%` : null;
    const flow = power === null ? null : Math.abs(power) < 10 ? translateConsumption(locale, 'In attesa') : `${translateConsumption(locale, power > 0 ? 'In scarica' : 'In carica')} ${formatPower(Math.abs(power), locale)}`;
    return { value: level ?? (power === null ? '—' : formatPower(Math.abs(power), locale)), caption: level ? flow : power === null ? null : translateConsumption(locale, power > 0 ? 'In scarica' : 'In carica') };
  }
  if (id === 'grid') {
    return { value: power === null ? '—' : formatPower(Math.abs(power), locale), caption: power === null ? null : translateConsumption(locale, Math.abs(power) < 10 ? 'Nessuno scambio' : power > 0 ? 'Prelievo' : 'Immissione') };
  }
  return { value: power === null ? '—' : formatPower(power, locale), caption: null };
}

const listedQuantities = (id: EnergyModuleId, quantities: Record<string, EnergyQuantity>, locale: AppLocale): Array<[string, EnergyQuantity]> =>
  MODULE_META[id].roles
    .filter((spec) => quantities[spec.role] && quantities[spec.role].status !== 'not_measured')
    .map((spec) => [translateConsumption(locale, spec.label), quantities[spec.role]]);

function rowFor(
  id: EnergyModuleId,
  key: string,
  name: string,
  source: Pick<EnergyDeviceState, 'status' | 'freshness' | 'quantities' | 'sign_convention'> & { status: string },
  now: string,
  locale: AppLocale,
): DeviceRow {
  const { value, caption } = mainValue(id, source.quantities, locale);
  const convention = conventionText(id, source.sign_convention, locale);
  const quantities = listedQuantities(id, source.quantities, locale);
  if (source.status === 'not_measured') {
    return { key, name, value: '—', caption: translateConsumption(locale, 'Solo contatori di energia, nessuna potenza in tempo reale'), tone: 'muted', convention, quantities };
  }
  if (source.status === 'offline') {
    return { key, name, value: '—', caption: translateConsumption(locale, 'Offline · i sensori non forniscono dati'), tone: 'warning', convention, quantities };
  }
  if (source.freshness === 'stale') {
    return { key, name, value, caption: translateConsumption(locale, 'Non aggiornato {age}', { age: formatAge(staleSince(source.quantities), now, locale) }), tone: 'warning', convention, quantities };
  }
  const main = source.quantities[MAIN_ROLE[id]];
  const missing = main && main.status !== 'ok' && main.status !== 'not_measured' ? quantityLabel(main, locale) : null;
  return { key, name, value, caption: missing ?? caption ?? translateConsumption(locale, 'Attivo'), tone: missing ? 'warning' : 'ok', convention, quantities };
}

/** One row per configured device, in profile order; unnamed devices are numbered. */
export function deviceRows(id: EnergyModuleId, module: EnergyModuleState, now: string, locale: AppLocale = 'it'): DeviceRow[] {
  return (module.devices ?? []).map((device, index) =>
    rowFor(id, device.device_id, device.name ?? `${translateConsumption(locale, MODULE_META[id].label)} ${index + 1}`, device, now, locale),
  );
}

/** The total sensor, kept apart from the devices it covers. */
export function totalRow(id: EnergyModuleId, total: EnergyTotalState | null | undefined, now: string, locale: AppLocale = 'it'): DeviceRow | null {
  return total ? rowFor(id, 'total', translateConsumption(locale, 'Sensore totale'), total, now, locale) : null;
}

/** Entity ids of devices and totals as well, so any of them refreshes the projection. */
export function detailEntityIds(module: EnergyModuleState | undefined): string[] {
  const sources = [...(module?.devices ?? []), ...(module?.total ? [module.total] : [])];
  return sources.flatMap((source) => Object.values(source.quantities).flatMap((quantity) => quantity.entity_ids));
}
