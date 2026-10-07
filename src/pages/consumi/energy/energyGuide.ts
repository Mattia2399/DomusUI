import type { MockEntityStateMap } from '../../../types/ha';
import type {
  EnergyConfidence,
  EnergyDiscovery,
  EnergyDiscoveryV2,
  EnergyMeterInfo,
  EnergyMeterRole,
  EnergyModuleId,
} from '../../../services/energyCoreClient';
import { activeRoles } from './energyDraft';
import { MODULE_META, formatPower } from './energyModel';
import type { DiscoveryReview } from './energyDiscoveryModel';
import { METER_ROLES, meterLines, type PlantDraft, type PlantDraftDevice } from './energyPlantDraft';
import { entityProblem, type SensorKind } from './energySensorCatalog';

/*
 * Words of the guided setup: what the user sees instead of entity ids,
 * Recorder statuses, confidences and sign conventions. Only presentation; the
 * draft, the discovery and the backend codes are unchanged.
 */

/** User-facing states of a device, a module or a meter. */
export type GuideStatus = 'ready' | 'check' | 'waiting' | 'problem' | 'missing';

export const STATUS_TEXT: Record<GuideStatus, string> = {
  ready: 'Pronto',
  check: 'Da verificare',
  waiting: 'In attesa',
  problem: 'Da completare',
  missing: 'Non trovato',
};

export const CONFIDENCE_TEXT: Record<EnergyConfidence, string> = {
  high: 'Rilevato automaticamente',
  medium: 'Da verificare',
  low: 'Trovato solo per nome',
};

type ModuleWords = {
  /** Title of its step. */
  title: string;
  /** "inverter", "accumulo"… (all masculine, for "trovato"/"configurato"). */
  noun: [string, string];
  /** "Aggiungi un inverter" / "Aggiungi un altro inverter". */
  add: [string, string];
  pitch: string;
};

export const MODULE_WORDS: Record<EnergyModuleId, ModuleWords> = {
  grid: {
    title: 'La tua rete elettrica',
    noun: ['contatore', 'contatori'],
    add: ['Aggiungi il contatore di rete', 'Aggiungi un altro contatore di rete'],
    pitch: 'Il contatore che misura l’energia scambiata con la rete',
  },
  solar: {
    title: 'Il tuo fotovoltaico',
    noun: ['inverter', 'inverter'],
    add: ['Aggiungi un inverter', 'Aggiungi un altro inverter'],
    pitch: 'Produco energia con pannelli solari',
  },
  battery: {
    title: 'La tua batteria',
    noun: ['accumulo', 'accumuli'],
    add: ['Aggiungi una batteria', 'Aggiungi un’altra batteria'],
    pitch: 'Accumulo energia per usarla più tardi',
  },
  wallbox: {
    title: 'La tua wallbox',
    noun: ['caricatore', 'caricatori'],
    add: ['Aggiungi una wallbox', 'Aggiungi un’altra wallbox'],
    pitch: 'Ricarico un’auto elettrica',
  },
  home: {
    title: 'I consumi della casa',
    noun: ['misuratore', 'misuratori'],
    add: ['Aggiungi il misuratore della casa', 'Aggiungi un altro misuratore'],
    pitch: 'Ho un misuratore dedicato ai consumi di casa',
  },
};

export const count = (module: EnergyModuleId, n: number) => `${n} ${MODULE_WORDS[module].noun[n === 1 ? 0 : 1]}`;

const ROLE_TEXT: Record<string, string> = {
  'grid:import_power': 'Potenza prelevata dalla rete',
  'grid:export_power': 'Potenza immessa in rete',
  'grid:net_power': 'Potenza scambiata con la rete',
  'solar:production_power': 'Potenza fotovoltaico',
  'home:consumption_power': 'Consumo della casa',
  'battery:state_of_charge': 'Livello di carica',
  'battery:charge_power': 'Potenza in carica',
  'battery:discharge_power': 'Potenza in scarica',
  'battery:net_power': 'Potenza della batteria',
  'wallbox:charging_power': 'Potenza di ricarica',
};

export const guidedRole = (module: EnergyModuleId, role: string) =>
  ROLE_TEXT[`${module}:${role}`] ?? MODULE_META[module].roles.find((spec) => spec.role === role)?.label ?? role;

export const HISTORY_TEXT: Record<EnergyMeterRole, string> = {
  import_energy: 'Energia acquistata',
  export_energy: 'Energia venduta',
  production_energy: 'Produzione fotovoltaica',
  consumption_energy: 'Consumi della casa',
  charge_energy: 'Energia caricata',
  discharge_energy: 'Energia restituita',
  charging_energy: 'Energia per l’auto',
};

export const sensorKind = (role: string): SensorKind => (role === 'state_of_charge' ? 'soc' : 'power');

const POWER_FACTOR: Record<string, number> = { mW: 0.001, W: 1, kW: 1000, MW: 1_000_000 };

/** "3,8 kW", "80%" from the live Home Assistant state, or null when it has no usable number. */
export function liveReading(states: MockEntityStateMap, id: string | undefined): string | null {
  const state = id ? states[id] : undefined;
  if (!state || state.state.trim() === '') return null;
  const value = Number(state.state);
  if (!Number.isFinite(value)) return null;
  const raw = state.rawAttributes?.unit_of_measurement;
  const unit = typeof raw === 'string' ? raw : state.unit ?? '';
  if (unit === '%') return `${Math.round(value)}%`;
  if (POWER_FACTOR[unit]) return formatPower(value * POWER_FACTOR[unit]);
  return `${value.toLocaleString('it-IT', { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ''}`;
}

/** The name a person recognises: Home Assistant's friendly name, the discovery's, or the id. */
export function sensorName(states: MockEntityStateMap, discovery: EnergyDiscovery | null, id: string) {
  const friendly = states[id]?.rawAttributes?.friendly_name;
  return (typeof friendly === 'string' && friendly) || discovery?.candidates[id]?.name || id;
}

export const sensorDevice = (discovery: EnergyDiscovery | null, id: string) => discovery?.candidates[id]?.device?.name ?? null;

/** What the device reads now, for its card: never a guess, only bound sensors with a number. */
export function deviceReading(module: EnergyModuleId, device: PlantDraftDevice, states: MockEntityStateMap): string | null {
  if (!device.power.present) return null;
  const sensors = device.power.sensors;
  const parts = activeRoles(module, device.power.mode)
    .map((role) => {
      const value = liveReading(states, sensors[role]?.trim());
      if (!value) return null;
      if (module === 'battery' && role === 'state_of_charge') return `Carica ${value}`;
      if (role === 'import_power') return `Prelievo ${value}`;
      if (role === 'export_power') return `Immissione ${value}`;
      if (role === 'charge_power') return `In carica ${value}`;
      if (role === 'discharge_power') return `In scarica ${value}`;
      return `${value} ora`;
    })
    .filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

/** A meter in plain words: what Home Assistant said about it, or whether it at least fits. */
export function meterState(info: EnergyMeterInfo | undefined, fits: boolean): { status: GuideStatus; text: string } {
  switch (info?.status) {
    case 'valid':
      return { status: 'ready', text: 'Pronto' };
    case 'pending':
      return { status: 'waiting', text: 'In attesa di Home Assistant' };
    case 'recorder_unavailable':
      return { status: 'waiting', text: 'Verifica temporaneamente non disponibile' };
    case 'unavailable':
      return { status: 'check', text: 'Non disponibile ora' };
    case 'incompatible':
      return { status: 'problem', text: 'Non compatibile' };
    case 'unknown':
      return { status: 'check', text: 'Non siamo riusciti a verificarlo' };
    default:
      return fits ? { status: 'ready', text: 'Contatore trovato' } : { status: 'check', text: 'Non siamo riusciti a verificarlo' };
  }
}

/**
 * The sensor Domus recommends for an empty role: the discovery's best match
 * that fits the role and is not used elsewhere. Never applied on its own.
 */
export function recommendedSensor(
  module: EnergyModuleId,
  role: string,
  discovery: EnergyDiscovery | null,
  proposals: EnergyDiscoveryV2 | null,
  states: MockEntityStateMap,
  taken: Record<string, string>,
): string | null {
  const candidates = [
    ...(proposals?.devices ?? []).filter((device) => device.module === module && device.status === 'new')
      .flatMap((device) => (device.power ?? []).filter((item) => item.role === role && item.confidence !== 'low').map((item) => item.entity_id)),
    ...(discovery?.proposals[module]?.[role] ?? []).filter((item) => item.confidence !== 'low').map((item) => item.entity_id),
  ];
  return candidates.find((id) => !taken[id] && !entityProblem(states, sensorKind(role), id)) ?? null;
}

export type ModuleFinding = {
  module: EnergyModuleId;
  status: GuideStatus;
  headline: string;
  /** Names and sensors of what was found, for the technical details. */
  details: string[];
};

/** One line per chosen module for the detection summary. */
export function moduleFindings(review: DiscoveryReview | null, configured: Partial<Record<EnergyModuleId, number>>, modules: EnergyModuleId[]): ModuleFinding[] {
  return modules.map((module) => {
    const found = review?.newDevices.filter((device) => device.module === module) ?? [];
    const updates = review?.changes.filter((device) => device.module === module) ?? [];
    const doubts = (review?.ambiguous.filter((item) => item.module === module).length ?? 0) + (review?.conflicts.filter((item) => item.module === module).length ?? 0);
    const stored = configured[module] ?? 0;
    const details = [...found, ...updates].map((device) => [
      device.name ?? MODULE_META[module].label,
      device.confidence ? CONFIDENCE_TEXT[device.confidence] : null,
      device.integration ?? null,
      ...(device.power ?? []).map((item) => item.entity_id),
      ...(device.energy ?? []).flatMap((item) => item.statistic_ids),
    ].filter(Boolean).join(' · '));
    const meterOnly = found.length > 0 && found.every((device) => !(device.power ?? []).length
      && (device.energy ?? []).every((item) => item.statuses.every((status) => status === 'pending' || status === 'recorder_unavailable')));
    let status: GuideStatus;
    let headline: string;
    if (!found.length && !stored) {
      status = doubts ? 'check' : 'missing';
      headline = doubts ? 'Trovato qualcosa da verificare: lo vedrai nel suo passaggio' : 'Nessun dispositivo trovato: lo configurerai tu';
    } else if (found.length) {
      const unsure = found.filter((device) => !device.eligible).length;
      status = doubts || unsure ? 'check' : meterOnly ? 'waiting' : 'ready';
      headline = `${count(module, found.length)} ${found.length === 1 ? 'trovato' : 'trovati'}`;
      if (unsure) headline += unsure === found.length ? ', da verificare' : `, ${unsure} da verificare`;
      if (stored) headline += `, oltre ${stored === 1 ? 'a quello configurato' : `ai ${stored} configurati`}`;
    } else {
      status = doubts ? 'check' : 'ready';
      headline = `${count(module, stored)} già ${stored === 1 ? 'configurato' : 'configurati'}${updates.length ? ' · Domus ha qualche suggerimento' : ''}`;
    }
    return { module, status, headline, details };
  });
}

/** Devices, sensors and meters a plant draft would save, for the final check. */
export function plantCounts(draft: PlantDraft) {
  let devices = 0;
  let sensors = 0;
  let meters = 0;
  for (const module of Object.keys(draft) as EnergyModuleId[]) {
    for (const device of draft[module]?.devices ?? []) {
      if (device.removed) continue;
      devices += 1;
      if (device.power.present) sensors += activeRoles(module, device.power.mode).filter((role) => device.power.sensors[role]?.trim()).length;
      meters += METER_ROLES[module].reduce((sum, { role }) => sum + meterLines(device.meters[role]).length, 0);
    }
  }
  return { devices, sensors, meters };
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
