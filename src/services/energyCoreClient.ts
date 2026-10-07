export const ENERGY_CORE_TYPES = {
  getState: 'domusos/energy/get_state',
  discover: 'domusos/energy/discover',
  getProfile: 'domusos/energy/get_profile',
  saveProfile: 'domusos/energy/save_profile',
  getHistory: 'domusos/energy/get_history',
} as const;

export type EnergyModuleId = 'grid' | 'solar' | 'home' | 'battery' | 'wallbox';
export const ENERGY_MODULES: EnergyModuleId[] = ['grid', 'solar', 'home', 'battery', 'wallbox'];

export type EnergyValueStatus = 'ok' | 'unavailable' | 'invalid' | 'not_measured';

/** Whether a valid value is still being reported; absent on integrations older than this field. */
export type EnergyFreshness = 'fresh' | 'stale';

/** Where a module value comes from (multi-device integrations); absent on older ones. */
export type EnergyQuantityOrigin =
  | 'device'
  | 'devices_sum'
  | 'devices_weighted_usable'
  | 'devices_weighted_nominal'
  | 'total';

export type EnergyQuantity = {
  status: EnergyValueStatus;
  value: number | null;
  unit: string;
  source: 'measured' | 'derived' | null;
  entity_ids: string[];
  reason: string | null;
  freshness?: EnergyFreshness | null;
  /** Oldest report behind the value (server clock). */
  reported_at?: string | null;
  /** Seconds a measured value stays fresh without a new report. */
  stale_after?: number | null;
  origin?: EnergyQuantityOrigin | null;
  /** Sum of the devices that do report, when some do not; never the module value. */
  partial_value?: number | null;
  coverage?: { contributing: number; configured: number } | null;
};

/** One configured device of a module, as normalized by the backend. */
export type EnergyDeviceState = {
  device_id: string;
  name: string | null;
  /** `not_measured`: the device has energy meters only, no live power. */
  status: 'online' | 'offline' | 'not_measured';
  complete: boolean;
  freshness: EnergyFreshness | null;
  sign_convention: string | null;
  reason: string | null;
  quantities: Record<string, EnergyQuantity>;
};

/** The sensor that measures the whole module, when one is configured. */
export type EnergyTotalState = Omit<EnergyDeviceState, 'device_id' | 'name' | 'status'> & { status: 'online' | 'offline' };

export type EnergyModuleState = {
  status: 'online' | 'offline';
  complete: boolean;
  freshness?: EnergyFreshness | null;
  sign_convention: string | null;
  quantities: Record<string, EnergyQuantity>;
  devices?: EnergyDeviceState[];
  total?: EnergyTotalState | null;
};

export type EnergyTariffScheme = 'single' | 'two_band' | 'three_band';

export type EnergyTariff = {
  scheme: EnergyTariffScheme;
  prices: Record<string, number>;
  fixed_monthly: number | null;
  vat_percent: number | null;
  export_price: number | null;
};

export type EnergyTariffState = {
  scheme: EnergyTariffScheme;
  band: 'F1' | 'F2' | 'F3';
  band_label: string;
  price: number;
  export_price: number | null;
  /** VAT rate the prices exclude, when the user set one. */
  vat_percent?: number | null;
  currency: 'EUR';
};

export type EnergyState = {
  configured: boolean;
  load_error: boolean;
  available: boolean;
  profile_revision: number;
  observed_at: string;
  modules: Partial<Record<EnergyModuleId, EnergyModuleState>>;
  absent_modules: EnergyModuleId[];
  offline_modules: EnergyModuleId[];
  home_consumption: EnergyQuantity | null;
  tariff?: EnergyTariffState | null;
  /** Installed modules without a live power sensor (energy meters only). */
  unsupported_modules?: Partial<Record<EnergyModuleId, string>>;
};

export type EnergyModuleDocument = { sensors: Record<string, string>; sign_convention?: string };
export type EnergyProfileModules = Partial<Record<EnergyModuleId, EnergyModuleDocument>>;

/* Energy Profile v2 (docs/energy-core.md): the stored, authoritative profile. */
export type EnergyMeterRole =
  | 'import_energy'
  | 'export_energy'
  | 'production_energy'
  | 'consumption_energy'
  | 'charge_energy'
  | 'discharge_energy'
  | 'charging_energy';
export type EnergyMeters = Partial<Record<EnergyMeterRole, string[]>>;
export type EnergyCapacity = { nominal_kwh: number | null; usable_kwh: number | null };
export type EnergySources = { power?: EnergyModuleDocument; energy?: EnergyMeters };
export type EnergyDeviceDocument = EnergySources & {
  id: string;
  name: string | null;
  ha_device_id: string | null;
  capacity?: EnergyCapacity;
};
export type EnergyModulePlan = { devices: EnergyDeviceDocument[]; total?: EnergySources };
export type EnergyPlant = Partial<Record<EnergyModuleId, EnergyModulePlan>>;

export type EnergyProfileV1Document = {
  revision: number;
  updated_at: string | null;
  load_error: boolean;
  modules: EnergyProfileModules;
  tariff?: EnergyTariff | null;
};

export type EnergyProfileV2Document = {
  schema: 'domusos-energy-profile';
  version: 2;
  revision: number;
  updated_at: string | null;
  load_error: boolean;
  migrated_from: { version: number; revision: number; updated_at: string | null } | null;
  plant: EnergyPlant;
  tariff: EnergyTariff | null;
  retired_device_ids: string[];
};

export type EnergyMeterStatus = 'valid' | 'pending' | 'unavailable' | 'incompatible' | 'unknown' | 'recorder_unavailable';

export type EnergyMeterInfo = {
  statistic_id: string;
  status: EnergyMeterStatus;
  reason: string | null;
  source: string | null;
  unit: string | null;
  has_sum: boolean | null;
  entity_id: string | null;
  long_term: boolean;
};

export type EnergyMetersReport = {
  recorder: 'available' | 'unavailable';
  /** `incomplete` while Home Assistant or the Recorder is still starting. */
  verification?: 'complete' | 'incomplete';
  meters: Record<string, EnergyMeterInfo>;
};

export type EnergyProfileResult = {
  /** The v1 view: `null` when v1 cannot hold the profile (it is not "not configured"). */
  profile: EnergyProfileV1Document | null;
  module_status: Record<EnergyModuleId, 'absent' | 'offline' | 'online'>;
  /* Present from Energy Profile v2 integrations on. */
  profile_v2?: EnergyProfileV2Document;
  v1_compatible?: boolean;
  runtime?: { supported: boolean; reason: string | null; unsupported_modules?: Partial<Record<EnergyModuleId, string>> };
  legacy_v1?: { valid: boolean; revision: number | null; updated_at: string | null; diverged: boolean } | null;
  energy_meters?: EnergyMetersReport;
};

export type EnergyConfidence = 'high' | 'medium' | 'low';

export type EnergyProposal = {
  entity_id: string;
  confidence: EnergyConfidence;
  score: number;
  evidence: string[];
  sign_convention: string | null;
  requires: string[];
};

export type EnergyReading = {
  entity_id: string;
  status: EnergyValueStatus;
  value: number | null;
  unit: string;
  reason: string | null;
};

export type EnergyCandidate = {
  entity_id: string;
  name: string | null;
  kind: 'power' | 'state_of_charge';
  device: { name: string | null; manufacturer: string | null; model: string | null } | null;
  preview: EnergyReading;
};

export type EnergyDiscoveryV2Device = {
  key: string;
  module: EnergyModuleId;
  status: 'new' | 'configured' | 'update' | 'conflict';
  device_id: string | null;
  ha_device_id?: string | null;
  name: string | null;
  integration?: string | null;
  confidence?: EnergyConfidence;
  eligible?: boolean;
  /** False for a configured device the discovery did not find. */
  detected?: boolean;
  power?: Array<{ role: string; entity_id: string; confidence: EnergyConfidence; evidence: string[]; sign_convention: string | null; requires: string[] }>;
  energy?: Array<{ role: EnergyMeterRole; statistic_ids: string[]; confidence: EnergyConfidence; evidence: string[]; statuses: EnergyMeterStatus[] }>;
  additions?: Array<{ kind: 'power' | 'energy'; role: string; ids: string[] }>;
  corrections?: Array<{ kind: 'power' | 'energy' | 'sign_convention'; role: string; configured: string[]; proposed: string[] }>;
  warnings?: Array<{ code: string; role?: string; ids?: string[] }>;
};

/** The multi-device proposal of the discovery: suggestions only, never applied as such. */
export type EnergyDiscoveryV2 = {
  profile: { configured: boolean; revision: number; load_error?: boolean };
  verification: 'complete' | 'incomplete';
  recorder: 'available' | 'unavailable';
  devices: EnergyDiscoveryV2Device[];
  totals: Array<{ module: EnergyModuleId; kind: 'power' | 'energy'; role: string; ids: string[]; status: 'verified' | 'presumed' | 'configured'; covers: string[]; evidence: string[] }>;
  meters: Record<string, EnergyMeterInfo>;
  ambiguous: Array<{ module: EnergyModuleId | null; role: string | null; entity_ids: string[]; reason: string; alternatives?: string[][] }>;
  suggested_plant: EnergyPlant | null;
  low_confidence: Array<{ kind: 'power' | 'energy'; module: EnergyModuleId; role: string; id: string }>;
  low_confidence_truncated?: boolean;
};

export type EnergyDiscovery = {
  energy_dashboard: string;
  suggested_profile: { modules: EnergyProfileModules };
  proposals: Partial<Record<EnergyModuleId, Record<string, EnergyProposal[]>>>;
  ambiguous: Array<{ module: EnergyModuleId; role: string | null; entity_ids: string[]; reason: string }>;
  requires_input: Array<{ module: EnergyModuleId; role: string; entity_id: string; missing: string[] }>;
  unassigned: string[];
  candidates: Record<string, EnergyCandidate>;
  v2?: EnergyDiscoveryV2;
};

/*
 * `domusos/energy/get_history` (A2.0): energy per bucket from the Home
 * Assistant Recorder, in kWh. The buckets, their time zone and every total
 * come from the backend; `getEnergyHistory` only validates the document.
 */
export type EnergyHistoryBucket = 'hour' | 'day' | 'week' | 'month';
export type EnergyHistorySeriesName =
  | 'production'
  | 'consumption'
  | 'grid_import'
  | 'grid_export'
  | 'battery_charge'
  | 'battery_discharge'
  | 'wallbox_consumption';

/** Presets of the backend: 24 hours, 7 and 30 days, 12 months. */
export type EnergyHistoryPreset = '24h' | '7d' | '30d' | '12m';

export type EnergyHistoryRequest = { include_devices?: boolean; compare?: 'previous' } & (
  | { range: EnergyHistoryPreset }
  | { start: string; end: string; bucket: EnergyHistoryBucket }
);

export type EnergyHistoryResultPoint = {
  start: string;
  /** Null when a part or a term is missing, never 0. */
  value: number | null;
  missing?: string[];
  /** The parts present, when the total is incomplete; never the total. */
  partial_value?: number;
  reason?: 'incoherent_balance';
};

export type EnergyHistorySeries = {
  source: 'total' | 'devices' | 'derived' | 'meter';
  statistic_ids: string[];
  points: EnergyHistoryResultPoint[];
  /** Every closed bucket has a value. */
  complete: boolean;
  status: 'complete' | 'partial_data';
  /** The last bucket is still in progress. */
  in_progress_last: boolean;
  coverage?: { contributing: number; configured: number };
  terms?: Partial<Record<EnergyHistorySeriesName, 1 | -1>>;
};

export type EnergyHistoryUnavailable = {
  reason: 'no_energy_meter' | 'no_data' | 'recorder_unavailable' | 'incompatible_configuration';
  statistic_ids: string[];
  meters?: Record<string, string>;
  needs?: EnergyHistorySeriesName[];
  terms?: Record<string, string>;
};

export type EnergyHistoryResult = {
  configured: boolean;
  range: { start: string; end: string; bucket: EnergyHistoryBucket; timezone: string };
  unit: 'kWh';
  recorder: 'available';
  verification: 'complete' | 'incomplete';
  series: Partial<Record<EnergyHistorySeriesName, EnergyHistorySeries>>;
  unavailable: Partial<Record<EnergyHistorySeriesName, EnergyHistoryUnavailable>>;
  devices: Record<string, {
    module: EnergyModuleId;
    name: string | null;
    series: Partial<Record<EnergyHistorySeriesName, EnergyHistorySeries>>;
    unavailable: Partial<Record<EnergyHistorySeriesName, EnergyHistoryUnavailable>>;
  }>;
  cost: null;
  previous: null;
  generated_at: string;
};

export type EnergyCallApi = <T = unknown>(
  message: Record<string, unknown>,
  options?: { reportError?: boolean; throwOnError?: boolean },
) => Promise<T | null>;

export type EnergyErrorCode =
  | 'invalid_profile'
  | 'revision_conflict'
  | 'profile_requires_v2'
  | 'energy_unavailable'
  | 'unauthorized'
  | 'unsupported'
  | 'invalid_response'
  | 'recorder_unavailable'
  | 'history_unavailable'
  | 'invalid_request'
  | 'network';

export class EnergyCoreError extends Error {
  constructor(public readonly code: EnergyErrorCode, message: string) {
    super(message);
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const ERROR_MESSAGES: Record<EnergyErrorCode, string> = {
  invalid_profile: 'Le associazioni non sono valide.',
  revision_conflict: "L'impianto è stato modificato altrove. Ricarica prima di salvare.",
  profile_requires_v2: 'L’impianto contiene dispositivi o contatori che questa schermata non può salvare senza perderli: nulla è stato modificato.',
  energy_unavailable: 'Domus Energy non è attivo. Ricarica l’integrazione Domus UI.',
  unauthorized: 'Serve un amministratore di Home Assistant.',
  unsupported: 'Aggiorna l’integrazione Domus UI per usare Domus Energy.',
  invalid_response: 'Risposta di Domus Energy non valida.',
  recorder_unavailable: 'Lo storico di Home Assistant non è temporaneamente disponibile.',
  history_unavailable: 'Home Assistant non è riuscito a leggere lo storico energetico.',
  invalid_request: 'Richiesta dello storico non valida.',
  network: 'Home Assistant non risponde. Riprova tra poco.',
};

/** Normalize websocket and panel-bridge failures into stable Energy codes. */
export function toEnergyCoreError(error: unknown): EnergyCoreError {
  if (error instanceof EnergyCoreError) return error;
  const rawMessage = isRecord(error) && typeof error.message === 'string' ? error.message : String(error ?? '');
  const rawCode = isRecord(error) && typeof error.code === 'string'
    ? error.code
    : rawMessage.match(/\[([a-z_]+)\]\s*$/)?.[1] ?? '';
  let code: EnergyErrorCode = 'network';
  if (rawCode === 'invalid_profile' || rawCode === 'revision_conflict' || rawCode === 'profile_requires_v2' ||
      rawCode === 'energy_unavailable' || rawCode === 'unauthorized' ||
      rawCode === 'recorder_unavailable' || rawCode === 'history_unavailable') {
    code = rawCode;
  } else if (rawCode === 'invalid_request' || rawCode === 'invalid_range' || rawCode === 'invalid_bucket') {
    code = 'invalid_request';
  } else if (rawCode === 'unknown_command' || /non ammess[oa]/i.test(rawMessage)) {
    code = 'unsupported';
  }
  // Server validation details are specific and safe to show next to the summary.
  const detail = code === 'invalid_profile' ? rawMessage.replace(/\s*\[[a-z_]+\]\s*$/, '') : '';
  return new EnergyCoreError(code, detail ? `${ERROR_MESSAGES[code]} ${detail}` : ERROR_MESSAGES[code]);
}

async function call(callApi: EnergyCallApi, message: Record<string, unknown>): Promise<unknown> {
  try {
    return await callApi<unknown>(message, { reportError: false, throwOnError: true });
  } catch (error) {
    throw toEnergyCoreError(error);
  }
}

async function request<T>(callApi: EnergyCallApi, message: Record<string, unknown>, isValid: (value: unknown) => boolean) {
  const result = await call(callApi, message);
  if (!isValid(result)) throw new EnergyCoreError('invalid_response', ERROR_MESSAGES.invalid_response);
  return result as T;
}

export const isEnergyState = (value: unknown): value is EnergyState =>
  isRecord(value) && typeof value.configured === 'boolean' && isRecord(value.modules) &&
  Array.isArray(value.absent_modules) && Number.isInteger(value.profile_revision);

const isProfileV2 = (value: unknown): value is EnergyProfileV2Document =>
  isRecord(value) && Number.isInteger(value.revision) && isRecord(value.plant);

/**
 * A v1 view, a v2 document, or both. `profile: null` is valid only next to a
 * v2 document: it means v1 cannot hold the profile, never "not configured".
 */
const isProfileResult = (value: unknown): value is EnergyProfileResult => {
  if (!isRecord(value) || !isRecord(value.module_status)) return false;
  if (value.profile_v2 !== undefined && !isProfileV2(value.profile_v2)) return false;
  if (value.profile === null) return value.profile_v2 !== undefined;
  return isRecord(value.profile) && Number.isInteger(value.profile.revision) && isRecord(value.profile.modules);
};

/** The revision to send with any save: the v2 document is authoritative when present. */
export const profileRevision = (result: EnergyProfileResult) =>
  result.profile_v2?.revision ?? result.profile?.revision ?? 0;

/** Whether this integration stores Energy Profile v2 (and accepts `profile_v2` saves). */
export const supportsProfileV2 = (result: EnergyProfileResult) => result.profile_v2 !== undefined;

/** Whether the v1 settings and wizard can edit the profile without losing data. */
export const editableAsV1 = (result: EnergyProfileResult): result is EnergyProfileResult & { profile: EnergyProfileV1Document } =>
  result.profile !== null && result.v1_compatible !== false;

/** The stored tariff, from whichever document the integration provides. */
export const profileTariff = (result: EnergyProfileResult) =>
  result.profile_v2 ? result.profile_v2.tariff : result.profile?.tariff;

const isDiscovery = (value: unknown): value is EnergyDiscovery =>
  isRecord(value) && isRecord(value.suggested_profile) && isRecord(value.proposals) &&
  isRecord(value.candidates) && Array.isArray(value.ambiguous) && Array.isArray(value.requires_input);

export const getEnergyState = (callApi: EnergyCallApi) =>
  request<EnergyState>(callApi, { type: ENERGY_CORE_TYPES.getState }, isEnergyState);

export const getEnergyProfile = (callApi: EnergyCallApi) =>
  request<EnergyProfileResult>(callApi, { type: ENERGY_CORE_TYPES.getProfile }, isProfileResult);

export const discoverEnergy = (callApi: EnergyCallApi) =>
  request<EnergyDiscovery>(callApi, { type: ENERGY_CORE_TYPES.discover }, isDiscovery);

/** Without `tariff` the stored tariff is kept; `null` removes it. */
export const TARIFF_UPDATE_MESSAGE =
  'L’integrazione Domus UI installata su Home Assistant non gestisce ancora la tariffa: aggiornala e riavvia Home Assistant.';

/**
 * Integrations with tariff support always return a `tariff` key (null when unset);
 * older ones omit it and silently drop a tariff on save.
 */
export const supportsTariff = (document: object) => 'tariff' in document;

/**
 * Save a whole Energy Profile v2 plant. Devices not listed are removed, so the
 * caller always sends every device; without `tariff` the stored tariff is kept.
 */
export function saveEnergyPlant(
  callApi: EnergyCallApi,
  plant: EnergyPlant,
  expectedRevision: number | null,
  tariff?: EnergyTariff | null,
) {
  return request<EnergyProfileResult>(
    callApi,
    {
      type: ENERGY_CORE_TYPES.saveProfile,
      profile_v2: tariff === undefined ? { plant } : { plant, tariff },
      expected_revision: expectedRevision,
    },
    (value) => isProfileResult(value) && isRecord(value) && isProfileV2(value.profile_v2),
  );
}

export async function saveEnergyProfile(
  callApi: EnergyCallApi,
  modules: EnergyProfileModules,
  expectedRevision: number | null,
  tariff?: EnergyTariff | null,
) {
  const result = await request<EnergyProfileResult>(
    callApi,
    {
      type: ENERGY_CORE_TYPES.saveProfile,
      profile: tariff === undefined ? { modules } : { modules, tariff },
      expected_revision: expectedRevision,
    },
    isProfileResult,
  );
  if (tariff && result.profile && !supportsTariff(result.profile)) {
    throw new EnergyCoreError('unsupported', TARIFF_UPDATE_MESSAGE);
  }
  return result;
}

/* --- History (get_history) --------------------------------------------------- */

export const ENERGY_HISTORY_SERIES: readonly EnergyHistorySeriesName[] = [
  'production',
  'consumption',
  'grid_import',
  'grid_export',
  'battery_charge',
  'battery_discharge',
  'wallbox_consumption',
];
const HISTORY_BUCKETS: readonly EnergyHistoryBucket[] = ['hour', 'day', 'week', 'month'];
const HISTORY_SOURCES: readonly EnergyHistorySeries['source'][] = ['total', 'devices', 'derived', 'meter'];
const HISTORY_STATUSES: readonly EnergyHistorySeries['status'][] = ['complete', 'partial_data'];
const UNAVAILABLE_REASONS: readonly EnergyHistoryUnavailable['reason'][] = [
  'no_energy_meter',
  'no_data',
  'recorder_unavailable',
  'incompatible_configuration',
];

/** The member of `values` equal to `value`, typed, or null. */
const member = <T extends string | number>(values: readonly T[], value: unknown): T | null =>
  values.find((item) => item === value) ?? null;
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');
const isDate = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value));
const isStringMap = (value: unknown): value is Record<string, string> =>
  isRecord(value) && Object.values(value).every((item) => typeof item === 'string');

function historyPoint(value: unknown): EnergyHistoryResultPoint | null {
  if (!isRecord(value) || !isDate(value.start)) return null;
  // A missing bucket stays null: it is never read as 0.
  const amount = value.value === null ? null : isFiniteNumber(value.value) ? value.value : undefined;
  if (amount === undefined) return null;
  const point: EnergyHistoryResultPoint = { start: value.start, value: amount };
  if (value.missing !== undefined) {
    if (!isStringArray(value.missing)) return null;
    point.missing = value.missing;
  }
  if (value.partial_value !== undefined) {
    if (!isFiniteNumber(value.partial_value)) return null;
    point.partial_value = value.partial_value;
  }
  if (value.reason !== undefined) {
    if (value.reason !== 'incoherent_balance') return null;
    point.reason = value.reason;
  }
  return point;
}

function historyTerms(value: unknown): Partial<Record<EnergyHistorySeriesName, 1 | -1>> | null {
  if (!isRecord(value)) return null;
  const terms: Partial<Record<EnergyHistorySeriesName, 1 | -1>> = {};
  for (const [key, sign] of Object.entries(value)) {
    const name = member(ENERGY_HISTORY_SERIES, key);
    const direction = member([1, -1] as const, sign);
    if (name === null || direction === null) return null;
    terms[name] = direction;
  }
  return terms;
}

function historySeries(value: unknown): EnergyHistorySeries | null {
  if (!isRecord(value) || !Array.isArray(value.points) || !isStringArray(value.statistic_ids)) return null;
  const source = member(HISTORY_SOURCES, value.source);
  const status = member(HISTORY_STATUSES, value.status);
  const points = value.points.map(historyPoint);
  if (source === null || status === null || typeof value.complete !== 'boolean' || typeof value.in_progress_last !== 'boolean') return null;
  if (!points.every((point): point is EnergyHistoryResultPoint => point !== null)) return null;
  const series: EnergyHistorySeries = {
    source,
    statistic_ids: value.statistic_ids,
    points,
    complete: value.complete,
    status,
    in_progress_last: value.in_progress_last,
  };
  if (value.coverage !== undefined) {
    const { coverage } = value;
    if (!isRecord(coverage) || !Number.isInteger(coverage.contributing) || !Number.isInteger(coverage.configured)) return null;
    series.coverage = { contributing: Number(coverage.contributing), configured: Number(coverage.configured) };
  }
  if (value.terms !== undefined) {
    const terms = historyTerms(value.terms);
    if (terms === null) return null;
    series.terms = terms;
  }
  return series;
}

function historyUnavailable(value: unknown): EnergyHistoryUnavailable | null {
  if (!isRecord(value) || !isStringArray(value.statistic_ids)) return null;
  const reason = member(UNAVAILABLE_REASONS, value.reason);
  if (reason === null) return null;
  const unavailable: EnergyHistoryUnavailable = { reason, statistic_ids: value.statistic_ids };
  if (value.meters !== undefined) {
    if (!isStringMap(value.meters)) return null;
    unavailable.meters = value.meters;
  }
  if (value.terms !== undefined) {
    if (!isStringMap(value.terms)) return null;
    unavailable.terms = value.terms;
  }
  if (value.needs !== undefined) {
    if (!Array.isArray(value.needs)) return null;
    const needs = value.needs.map((item) => member(ENERGY_HISTORY_SERIES, item));
    if (!needs.every((item): item is EnergyHistorySeriesName => item !== null)) return null;
    unavailable.needs = needs;
  }
  return unavailable;
}

/** A map keyed by series name, every value read by `parse`; null when anything is unknown. */
function historyMap<T>(value: unknown, parse: (item: unknown) => T | null): Partial<Record<EnergyHistorySeriesName, T>> | null {
  if (!isRecord(value)) return null;
  const map: Partial<Record<EnergyHistorySeriesName, T>> = {};
  for (const [key, item] of Object.entries(value)) {
    const name = member(ENERGY_HISTORY_SERIES, key);
    const parsed = parse(item);
    if (name === null || parsed === null) return null;
    map[name] = parsed;
  }
  return map;
}

/** Every series of one document shares the same buckets: the chart relies on it. */
const sameBuckets = (all: EnergyHistorySeries[]) =>
  all.every((series) => series.points.length === all[0].points.length && series.points.every((point, index) => point.start === all[0].points[index].start));

/** The `get_history` document, validated field by field; null when it does not match A2.0. */
export function parseEnergyHistory(value: unknown): EnergyHistoryResult | null {
  if (!isRecord(value) || typeof value.configured !== 'boolean' || !isRecord(value.range) || !isRecord(value.devices)) return null;
  const { range } = value;
  const bucket = member(HISTORY_BUCKETS, range.bucket);
  const verification = member(['complete', 'incomplete'] as const, value.verification);
  if (bucket === null || !isDate(range.start) || !isDate(range.end) || typeof range.timezone !== 'string' || !range.timezone) return null;
  if (value.unit !== 'kWh' || value.recorder !== 'available' || verification === null || typeof value.generated_at !== 'string') return null;
  // Costs and the previous period come with A2.2.
  if (value.cost !== null || value.previous !== null) return null;
  const series = historyMap(value.series, historySeries);
  const unavailable = historyMap(value.unavailable, historyUnavailable);
  if (series === null || unavailable === null) return null;
  const devices: EnergyHistoryResult['devices'] = {};
  const every = Object.values(series);
  for (const [id, device] of Object.entries(value.devices)) {
    if (!isRecord(device)) return null;
    const label = device.name;
    const name = typeof label === 'string' ? label : label === null ? null : undefined;
    if (name === undefined) return null;
    const module = member(ENERGY_MODULES, device.module);
    const own = historyMap(device.series, historySeries);
    const missing = historyMap(device.unavailable, historyUnavailable);
    if (module === null || own === null || missing === null) return null;
    devices[id] = { module, name, series: own, unavailable: missing };
    every.push(...Object.values(own));
  }
  if (every.length && !sameBuckets(every)) return null;
  return {
    configured: value.configured,
    range: { start: range.start, end: range.end, bucket, timezone: range.timezone },
    unit: 'kWh',
    recorder: 'available',
    verification,
    series,
    unavailable,
    devices,
    cost: null,
    previous: null,
    generated_at: value.generated_at,
  };
}

/** Aggregated energy history of a preset period; devices and comparisons are not requested. */
export async function getEnergyHistory(callApi: EnergyCallApi, range: EnergyHistoryPreset) {
  const result = parseEnergyHistory(await call(callApi, { type: ENERGY_CORE_TYPES.getHistory, range }));
  if (result === null) throw new EnergyCoreError('invalid_response', ERROR_MESSAGES.invalid_response);
  return result;
}
