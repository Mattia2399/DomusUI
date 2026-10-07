import type { MockEntityStateMap } from '../../../types/ha';
import type { EnergyDiscovery, EnergyMeterInfo } from '../../../services/energyCoreClient';

/*
 * The sensors Home Assistant offers for one kind of binding, with the same
 * gates as the backend (normalization.py, meters.py): power is never accepted
 * from an energy meter and an energy meter never from a power sensor. The
 * backend still has the final word on save.
 */

export type SensorKind = 'power' | 'soc' | 'energy';

const POWER_UNITS = new Set(['mW', 'W', 'kW', 'MW', 'GW', 'TW', 'BTU/h']);
const ENERGY_UNITS = new Set(['mWh', 'Wh', 'kWh', 'MWh', 'GWh', 'TWh', 'J', 'kJ', 'MJ', 'GJ', 'cal', 'kcal', 'Mcal', 'Gcal']);
const METER_STATE_CLASSES = new Set(['total', 'total_increasing']);

export type SensorOption = {
  id: string;
  name: string;
  unit: string | null;
  device: string | null;
  /** Why it cannot be used for this kind, or null when it can. */
  problem: string | null;
};

const text = (value: unknown) => (typeof value === 'string' && value ? value : null);

type Attributes = { unit: string | null; deviceClass: string | null; stateClass: string | null };

function attributesOf(states: MockEntityStateMap, id: string): Attributes | null {
  const state = states[id];
  if (!state) return null;
  const raw = state.rawAttributes ?? {};
  return {
    unit: text(raw.unit_of_measurement) ?? text(state.unit),
    deviceClass: text(raw.device_class),
    stateClass: text(raw.state_class),
  };
}

/** Why a sensor cannot fill this kind of binding, judging by what it declares. */
export function sensorProblem(kind: SensorKind, attributes: Attributes): string | null {
  const { unit, deviceClass, stateClass } = attributes;
  if (kind === 'energy') {
    if (deviceClass && deviceClass !== 'energy') return deviceClass === 'power' ? 'È una potenza, non un contatore di energia' : 'Non è un contatore di energia';
    if (!unit || !ENERGY_UNITS.has(unit)) return unit && POWER_UNITS.has(unit) ? 'È una potenza (W), non un contatore di energia' : 'L’unità non è un’energia (Wh, kWh…)';
    if (!stateClass || !METER_STATE_CLASSES.has(stateClass)) return 'Non è un contatore cumulativo: Home Assistant non ne conserva le statistiche';
    return null;
  }
  if (unit && ENERGY_UNITS.has(unit)) return 'È un contatore di energia (kWh), non una potenza';
  if (kind === 'soc') {
    if (unit !== '%') return 'Lo stato di carica si misura in %';
    return deviceClass && deviceClass !== 'battery' ? 'Non è uno stato di carica' : null;
  }
  if (deviceClass && deviceClass !== 'power') return 'Non è un sensore di potenza';
  if (!unit || !POWER_UNITS.has(unit)) return 'L’unità non è una potenza (W, kW…)';
  if (stateClass && METER_STATE_CLASSES.has(stateClass)) return 'È un valore cumulativo, non una potenza istantanea';
  return null;
}

/** Problem of a chosen id: unknown entities are checked by the backend on save. */
export function entityProblem(states: MockEntityStateMap, kind: SensorKind, id: string): string | null {
  const attributes = attributesOf(states, id);
  return attributes ? sensorProblem(kind, attributes) : null;
}

/** Every sensor, with whether it fits this kind; compatible ones first. */
export function sensorOptions(states: MockEntityStateMap, discovery: EnergyDiscovery | null, kind: SensorKind): SensorOption[] {
  const options: SensorOption[] = [];
  for (const id of Object.keys(states)) {
    if (!id.startsWith('sensor.')) continue;
    const attributes = attributesOf(states, id)!;
    const candidate = discovery?.candidates[id];
    options.push({
      id,
      name: text(states[id].rawAttributes?.friendly_name) ?? candidate?.name ?? id,
      unit: attributes.unit,
      device: candidate?.device?.name ?? null,
      problem: sensorProblem(kind, attributes),
    });
  }
  return options.sort((a, b) => Number(Boolean(a.problem)) - Number(Boolean(b.problem)) || a.name.localeCompare(b.name, 'it'));
}

/** What the Recorder said about a meter, from the profile or the discovery. */
export type MeterStatuses = Record<string, EnergyMeterInfo>;

/**
 * Checks new references only: a configured sensor that changed in Home
 * Assistant is reported by the backend, and must not block unrelated edits.
 */
export function referenceCheck(states: MockEntityStateMap, meters: MeterStatuses, known: ReadonlySet<string>) {
  return (kind: SensorKind, id: string): string | null => {
    if (known.has(id)) return null;
    if (kind === 'energy' && meters[id]?.status === 'incompatible') return 'Home Assistant non lo considera un contatore di energia';
    return entityProblem(states, kind, id);
  };
}

/** Whether Home Assistant knows a meter: verified by the Recorder, or an entity that fits. */
export function meterKnown(states: MockEntityStateMap, meters: MeterStatuses, id: string) {
  const info = meters[id];
  if (info) return info.status === 'valid' || info.status === 'pending' || info.status === 'unavailable';
  return id.startsWith('sensor.') && Boolean(states[id]) && !entityProblem(states, 'energy', id);
}

export const isExternalStatistic = (id: string) => /^(?!_)(?!.*__)[a-z0-9_]+(?<!_):(?!_)[a-z0-9_]+(?<!_)$/.test(id);
