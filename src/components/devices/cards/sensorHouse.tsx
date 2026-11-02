import React from 'react';
import type { MockEntityState } from '../../../types/ha';
import { resolveSensorFamily, toKw, type SensorFamily } from '../model/sensorFamily';
import { HouseStatesContext, type HouseStates } from './houseStatesContext';

/*
 * The sensors of the whole house, for the Expanded cards that gather them
 * (docs/design-reference/sensori): the batteries, the detectors, the
 * connected devices, what draws power now, and the sensors beside one (the
 * PM2.5 next to a CO₂, the gusts next to the wind). The Home provides its live
 * states (HouseStatesProvider); without them each card shows only itself.
 */

export type SensorHouseRow = {
  entityId: string;
  name: string;
  family: SensorFamily;
  deviceClass: string;
  unit: string;
  value: number | null;
  state: string;
  available: boolean;
  changedAt: number | null;
};

export type SensorHouse = { rows: SensorHouseRow[] };

// One house per map of states, however many cards ask for it.
const houses = new WeakMap<HouseStates, SensorHouse>();

export function useSensorHouse() {
  const states = React.useContext(HouseStatesContext);
  if (!states) return null;
  let house = houses.get(states);
  if (!house) {
    house = buildSensorHouse(states);
    houses.set(states, house);
  }
  return house;
}

function readTime(value: unknown) {
  if (typeof value !== 'string' || !value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildSensorHouse(states: Record<string, MockEntityState | undefined>): SensorHouse {
  const rows: SensorHouseRow[] = [];
  for (const [entityId, entity] of Object.entries(states)) {
    if (!entity || !(entityId.startsWith('sensor.') || entityId.startsWith('binary_sensor.'))) continue;
    const attributes = entity.rawAttributes ?? {};
    const deviceClass = `${attributes.device_class ?? ''}`.trim().toLowerCase();
    const unit = `${attributes.unit_of_measurement ?? ''}`.trim();
    const state = `${entity.state ?? ''}`.trim();
    const family = resolveSensorFamily({ entityId, deviceClass, unit, state });
    if (!family) continue;
    const number = Number(state.replace(',', '.'));
    const friendly = attributes.friendly_name;
    rows.push({
      entityId,
      name: typeof friendly === 'string' && friendly.trim() ? friendly.trim() : entityId.split('.')[1] ?? entityId,
      family,
      deviceClass,
      unit,
      value: state !== '' && Number.isFinite(number) ? number : null,
      state: state.toLowerCase(),
      available: state !== '' && state !== 'unavailable' && state !== 'unknown',
      changedAt: readTime(attributes.__last_changed ?? attributes.last_changed),
    });
  }
  return { rows };
}

/*
 * The sensors named after the same device: "sensor.living_air_co2" sits
 * beside "sensor.living_air_pm25", "sensor.garden_wind_speed" beside
 * "sensor.garden_rain". The name is shortened a word at a time until three
 * are found, never below its first word.
 */
export function sensorPeers(house: SensorHouse | null, entityId: string, families: SensorFamily[]) {
  if (!house) return [];
  const words = (entityId.split('.')[1] ?? '').split('_');
  let peers: SensorHouseRow[] = [];
  for (let length = words.length - 1; length >= 1; length -= 1) {
    const base = `${words.slice(0, length).join('_')}_`;
    peers = house.rows.filter(
      (row) =>
        row.entityId !== entityId &&
        row.entityId.startsWith('sensor.') &&
        families.includes(row.family) &&
        (row.entityId.split('.')[1] ?? '').startsWith(base),
    );
    if (peers.length >= 3) break;
  }
  return peers;
}

export const houseBatteries = (house: SensorHouse | null) =>
  house ? house.rows.filter((row) => row.family === 'battery' && row.value !== null) : [];

export const houseDetectors = (house: SensorHouse | null) =>
  house ? house.rows.filter((row) => row.family === 'safety' && row.available) : [];

export const houseConnections = (house: SensorHouse | null) =>
  house ? house.rows.filter((row) => row.family === 'device' && row.deviceClass === 'connectivity' && row.state !== '') : [];

/** What draws power now, largest first, in kW. */
export function housePowers(house: SensorHouse | null, except: string) {
  if (!house) return [];
  return house.rows
    .filter((row) => row.entityId !== except && row.family === 'energy' && row.deviceClass === 'power' && row.value !== null && row.value > 0)
    .map((row) => ({ row, kw: toKw(row.value ?? 0, row.unit) }))
    .sort((a, b) => b.kw - a.kw);
}
