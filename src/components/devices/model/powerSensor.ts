import type { MockEntityState } from '../../../types/ha';

export function readNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function isPowerSensor(entityId: string, state: MockEntityState | undefined) {
  const unit = `${state?.rawAttributes?.unit_of_measurement ?? state?.unit ?? ''}`.trim();
  return entityId.startsWith('sensor.') && (`${state?.rawAttributes?.device_class ?? ''}` === 'power' || unit === 'W' || unit === 'kW');
}

/*
 * The meter of a plug: a power sensor of the same device in the registry, or
 * one named after the plug ("switch.tv" → "sensor.tv_power").
 */
export function findPowerSensor(
  entityId: string,
  states: Record<string, MockEntityState | undefined>,
  deviceIdOf: (entityId: string) => string | null | undefined = () => null,
) {
  const objectId = entityId.split('.')[1] ?? '';
  const deviceId = deviceIdOf(entityId);
  const candidates = Object.keys(states).filter((id) => isPowerSensor(id, states[id]));
  return (
    (deviceId ? candidates.find((id) => deviceIdOf(id) === deviceId) : undefined) ??
    candidates.find((id) => id === `sensor.${objectId}_power` || id === `sensor.${objectId}_current_power`) ??
    null
  );
}

export function readWatts(sensor: MockEntityState | undefined) {
  const value = readNumber(sensor?.state);
  if (value === undefined) return null;
  const unit = `${sensor?.rawAttributes?.unit_of_measurement ?? sensor?.unit ?? ''}`.trim();
  return Math.round(unit === 'kW' ? value * 1000 : value);
}
