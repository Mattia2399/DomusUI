export const ENERGY_CORE_TYPES = {
  getState: 'domusos/energy/get_state',
  discover: 'domusos/energy/discover',
  getProfile: 'domusos/energy/get_profile',
  saveProfile: 'domusos/energy/save_profile',
} as const;

export type EnergyModuleId = 'grid' | 'solar' | 'home' | 'battery' | 'wallbox';
export const ENERGY_MODULES: EnergyModuleId[] = ['grid', 'solar', 'home', 'battery', 'wallbox'];

export type EnergyValueStatus = 'ok' | 'unavailable' | 'invalid' | 'not_measured';

/** Whether a valid value is still being reported; absent on integrations older than this field. */
export type EnergyFreshness = 'fresh' | 'stale';

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
};

export type EnergyModuleState = {
  status: 'online' | 'offline';
  complete: boolean;
  freshness?: EnergyFreshness | null;
  sign_convention: string | null;
  quantities: Record<string, EnergyQuantity>;
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

/* Proposed `domusos/energy/get_history` contract (docs/energy-core.md). No backend command exists yet. */
export type EnergyHistoryPeriod = '24h' | '7d' | '30d';
export type EnergyHistorySeriesId = 'production' | 'consumption' | 'import' | 'export' | 'battery_charge' | 'battery_discharge';
/** `value: null` is a bucket without data, never zero. */
export type EnergyHistoryPoint = { start: string; value: number | null };
export type EnergyHistoryCost = {
  currency: 'EUR';
  energy: number;
  fixed: number;
  vat: number;
  export_credit: number;
  net: number;
  savings: number | null;
};
export type EnergyHistory = {
  period: EnergyHistoryPeriod;
  bucket: 'hour' | 'day';
  unit: 'kWh';
  series: Partial<Record<EnergyHistorySeriesId, EnergyHistoryPoint[]>>;
  derived: EnergyHistorySeriesId[];
  cost: EnergyHistoryCost | null;
  previous: { consumption: number | null; net_cost: number | null } | null;
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
};

export type EnergyModuleDocument = { sensors: Record<string, string>; sign_convention?: string };
export type EnergyProfileModules = Partial<Record<EnergyModuleId, EnergyModuleDocument>>;

export type EnergyProfileResult = {
  profile: { revision: number; updated_at: string | null; load_error: boolean; modules: EnergyProfileModules; tariff?: EnergyTariff | null };
  module_status: Record<EnergyModuleId, 'absent' | 'offline' | 'online'>;
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

export type EnergyDiscovery = {
  energy_dashboard: string;
  suggested_profile: { modules: EnergyProfileModules };
  proposals: Partial<Record<EnergyModuleId, Record<string, EnergyProposal[]>>>;
  ambiguous: Array<{ module: EnergyModuleId; role: string | null; entity_ids: string[]; reason: string }>;
  requires_input: Array<{ module: EnergyModuleId; role: string; entity_id: string; missing: string[] }>;
  unassigned: string[];
  candidates: Record<string, EnergyCandidate>;
};

export type EnergyCallApi = <T = unknown>(
  message: Record<string, unknown>,
  options?: { reportError?: boolean; throwOnError?: boolean },
) => Promise<T | null>;

export type EnergyErrorCode =
  | 'invalid_profile'
  | 'revision_conflict'
  | 'energy_unavailable'
  | 'unauthorized'
  | 'unsupported'
  | 'invalid_response'
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
  energy_unavailable: 'Domus Energy non è attivo. Ricarica l’integrazione Domus UI.',
  unauthorized: 'Serve un amministratore di Home Assistant.',
  unsupported: 'Aggiorna l’integrazione Domus UI per usare Domus Energy.',
  invalid_response: 'Risposta di Domus Energy non valida.',
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
  if (rawCode === 'invalid_profile' || rawCode === 'revision_conflict' ||
      rawCode === 'energy_unavailable' || rawCode === 'unauthorized') {
    code = rawCode;
  } else if (rawCode === 'unknown_command' || /non ammess[oa]/i.test(rawMessage)) {
    code = 'unsupported';
  }
  // Server validation details are specific and safe to show next to the summary.
  const detail = code === 'invalid_profile' ? rawMessage.replace(/\s*\[[a-z_]+\]\s*$/, '') : '';
  return new EnergyCoreError(code, detail ? `${ERROR_MESSAGES[code]} ${detail}` : ERROR_MESSAGES[code]);
}

async function request<T>(callApi: EnergyCallApi, message: Record<string, unknown>, isValid: (value: unknown) => boolean) {
  let result: unknown;
  try {
    result = await callApi<T>(message, { reportError: false, throwOnError: true });
  } catch (error) {
    throw toEnergyCoreError(error);
  }
  if (!isValid(result)) throw new EnergyCoreError('invalid_response', ERROR_MESSAGES.invalid_response);
  return result as T;
}

export const isEnergyState = (value: unknown): value is EnergyState =>
  isRecord(value) && typeof value.configured === 'boolean' && isRecord(value.modules) &&
  Array.isArray(value.absent_modules) && Number.isInteger(value.profile_revision);

const isProfileResult = (value: unknown): value is EnergyProfileResult =>
  isRecord(value) && isRecord(value.profile) && Number.isInteger(value.profile.revision) &&
  isRecord(value.profile.modules) && isRecord(value.module_status);

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
  if (tariff && !supportsTariff(result.profile)) {
    throw new EnergyCoreError('unsupported', TARIFF_UPDATE_MESSAGE);
  }
  return result;
}
