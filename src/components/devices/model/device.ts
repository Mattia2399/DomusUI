import type { MockEntityState } from '../../../types/ha';

/*
 * The devices of a room that are not lights: plugs and switches (with their
 * power when a meter reports it), virtual switches, fans, covers and
 * humidifiers. Plain functions: what the device can do, what it is doing,
 * how to say it, and the Home Assistant call for each command.
 */

export type DeviceKind = 'outlet' | 'switch' | 'virtual' | 'fan' | 'cover' | 'humidifier';

export type FanState = {
  /** 0–100. */
  pct: number;
  /** Whether its speed can be set at all. */
  canSetSpeed: boolean;
  /** Speeds the fan has, 0 when it takes any percentage. */
  steps: number;
  oscillating: boolean | null;
  direction: 'forward' | 'reverse' | null;
  presets: string[];
  preset: string | null;
};

export type CoverState = {
  /** 0 closed – 100 open; null when the cover only opens and closes. */
  position: number | null;
  moving: 'opening' | 'closing' | null;
  canPosition: boolean;
  canStop: boolean;
  /** Without a declaration, both: only what the entity rules out is taken away. */
  canOpen: boolean;
  canClose: boolean;
  tilt: number | null;
};

export type HumidifierState = {
  current: number | null;
  target: number | null;
  min: number;
  max: number;
  modes: string[];
  mode: string | null;
};

export type DeviceModel = {
  entityId: string;
  name: string;
  kind: DeviceKind;
  available: boolean;
  on: boolean;
  /** Power now, in watts, when a meter reports it. */
  watts: number | null;
  fan: FanState | null;
  cover: CoverState | null;
  humidifier: HumidifierState | null;
};

/** Below this a plug that is on is only keeping something on standby. */
export const STANDBY_WATTS = 8;

const FAN_FEATURE_SET_SPEED = 1;
const FAN_FEATURE_OSCILLATE = 2;
const FAN_FEATURE_DIRECTION = 4;
const COVER_FEATURE_OPEN = 1;
const COVER_FEATURE_CLOSE = 2;
const COVER_FEATURE_SET_POSITION = 4;
const COVER_FEATURE_STOP = 8;
const COVER_FEATURE_SET_TILT = 128;

function readNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function readStrings(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '') : [];
}

function readName(entityId: string, entity: MockEntityState | undefined) {
  const friendly = entity?.rawAttributes?.friendly_name;
  if (typeof friendly === 'string' && friendly.trim()) return friendly.trim();
  const slug = entityId.split('.').at(1) ?? entityId;
  return slug
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function deviceKindOf(entityId: string, entity: MockEntityState | undefined): DeviceKind | null {
  const domain = entityId.split('.')[0];
  if (domain === 'fan') return 'fan';
  if (domain === 'cover') return 'cover';
  if (domain === 'humidifier') return 'humidifier';
  if (domain === 'input_boolean') return 'virtual';
  if (domain === 'switch') return `${entity?.rawAttributes?.device_class ?? ''}` === 'outlet' ? 'outlet' : 'switch';
  return null;
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
  const isPower = (id: string) => {
    const state = states[id];
    const unit = `${state?.rawAttributes?.unit_of_measurement ?? state?.unit ?? ''}`.trim();
    return id.startsWith('sensor.') && (`${state?.rawAttributes?.device_class ?? ''}` === 'power' || unit === 'W' || unit === 'kW');
  };
  const candidates = Object.keys(states).filter(isPower);
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

function fanStateOf(entity: MockEntityState | undefined): FanState {
  const attributes = entity?.rawAttributes ?? {};
  const features = readNumber(attributes.supported_features) ?? entity?.supportedFeatures ?? 0;
  const step = readNumber(attributes.percentage_step);
  const canSetSpeed = (features & FAN_FEATURE_SET_SPEED) !== 0 || readNumber(attributes.percentage) !== undefined;
  const steps = canSetSpeed && step && step > 1 ? Math.round(100 / step) : 0;
  const direction = attributes.direction === 'reverse' ? 'reverse' : attributes.direction === 'forward' ? 'forward' : null;
  return {
    pct: Math.max(0, Math.min(100, Math.round(readNumber(attributes.percentage) ?? 0))),
    canSetSpeed,
    steps: steps > 0 && steps <= 10 ? steps : 0,
    oscillating:
      typeof attributes.oscillating === 'boolean' ? attributes.oscillating : (features & FAN_FEATURE_OSCILLATE) !== 0 ? false : null,
    direction: direction ?? ((features & FAN_FEATURE_DIRECTION) !== 0 ? 'forward' : null),
    presets: readStrings(attributes.preset_modes),
    preset: typeof attributes.preset_mode === 'string' && attributes.preset_mode ? attributes.preset_mode : null,
  };
}

function coverStateOf(entity: MockEntityState | undefined): CoverState {
  const attributes = entity?.rawAttributes ?? {};
  const features = readNumber(attributes.supported_features) ?? entity?.supportedFeatures ?? 0;
  const state = `${entity?.state ?? ''}`.toLowerCase();
  const position = readNumber(attributes.current_position);
  const tilt = readNumber(attributes.current_tilt_position);
  return {
    position: position === undefined ? null : Math.max(0, Math.min(100, Math.round(position))),
    moving: state === 'opening' ? 'opening' : state === 'closing' ? 'closing' : null,
    canPosition: (features & COVER_FEATURE_SET_POSITION) !== 0 || position !== undefined,
    canStop: (features & COVER_FEATURE_STOP) !== 0,
    canOpen: features === 0 || (features & COVER_FEATURE_OPEN) !== 0,
    canClose: features === 0 || (features & COVER_FEATURE_CLOSE) !== 0,
    tilt: (features & COVER_FEATURE_SET_TILT) !== 0 || tilt !== undefined ? Math.round(tilt ?? 0) : null,
  };
}

function humidifierStateOf(entity: MockEntityState | undefined): HumidifierState {
  const attributes = entity?.rawAttributes ?? {};
  const target = readNumber(attributes.humidity);
  const current = readNumber(attributes.current_humidity);
  return {
    current: current === undefined ? null : Math.round(current),
    target: target === undefined ? null : Math.round(target),
    min: readNumber(attributes.min_humidity) ?? 30,
    max: readNumber(attributes.max_humidity) ?? 70,
    modes: readStrings(attributes.available_modes),
    mode: typeof attributes.mode === 'string' && attributes.mode ? attributes.mode : null,
  };
}

export function toDeviceModel(
  entityId: string,
  entity: MockEntityState | undefined,
  options: { watts?: number | null } = {},
): DeviceModel | null {
  const kind = deviceKindOf(entityId, entity);
  if (!kind) return null;
  const state = `${entity?.state ?? ''}`.trim().toLowerCase();
  const cover = kind === 'cover' ? coverStateOf(entity) : null;
  const on =
    kind === 'cover'
      ? state === 'open' || state === 'opening' || (cover?.position ?? 0) > 0
      : state === 'on';
  return {
    entityId,
    name: readName(entityId, entity),
    kind,
    available: Boolean(entity) && state !== 'unavailable' && state !== 'unknown' && state !== '',
    on,
    watts: kind === 'outlet' || kind === 'switch' ? options.watts ?? null : null,
    fan: kind === 'fan' ? fanStateOf(entity) : null,
    cover,
    humidifier: kind === 'humidifier' ? humidifierStateOf(entity) : null,
  };
}

export function isStandby(model: DeviceModel) {
  return model.on && model.watts !== null && model.watts <= STANDBY_WATTS;
}

/** A panel for the devices with more than on and off. */
export function deviceHasPanel(model: DeviceModel) {
  return model.kind === 'fan' || model.kind === 'cover' || model.kind === 'humidifier' || model.watts !== null;
}

export function fanLevel(fan: FanState) {
  return fan.steps ? Math.max(1, Math.round((fan.pct / 100) * fan.steps)) : fan.pct;
}

/** The words of the status line, before translation. */
export type DeviceStatus =
  | { kind: 'unavailable' }
  | { kind: 'off'; device: DeviceKind; humidity?: number | null }
  | { kind: 'on'; device: DeviceKind }
  | { kind: 'watts'; watts: number; standby: boolean }
  | { kind: 'fan'; preset: string | null; level: number; steps: number; oscillating: boolean; winter: boolean }
  | { kind: 'cover'; moving: 'opening' | 'closing' | null; position: number | null; open: boolean }
  | { kind: 'humidity'; current: number | null; target: number | null };

export function deviceStatusOf(model: DeviceModel): DeviceStatus {
  if (!model.available) return { kind: 'unavailable' };
  if (model.kind === 'cover' && model.cover) {
    return { kind: 'cover', moving: model.cover.moving, position: model.cover.position, open: model.on };
  }
  if (!model.on) {
    return model.kind === 'humidifier'
      ? { kind: 'off', device: model.kind, humidity: model.humidifier?.current ?? null }
      : { kind: 'off', device: model.kind };
  }
  if (model.watts !== null) return { kind: 'watts', watts: model.watts, standby: isStandby(model) };
  if (model.kind === 'fan' && model.fan) {
    return {
      kind: 'fan',
      preset: model.fan.preset,
      level: fanLevel(model.fan),
      steps: model.fan.steps,
      oscillating: Boolean(model.fan.oscillating),
      winter: model.fan.direction === 'reverse',
    };
  }
  if (model.kind === 'humidifier' && model.humidifier) {
    return { kind: 'humidity', current: model.humidifier.current, target: model.humidifier.target };
  }
  return { kind: 'on', device: model.kind };
}

export type DeviceAction =
  | { type: 'turn_on' }
  | { type: 'turn_off' }
  | { type: 'fan_pct'; pct: number }
  | { type: 'fan_oscillate'; oscillating: boolean }
  | { type: 'fan_direction'; direction: 'forward' | 'reverse' }
  | { type: 'fan_preset'; preset: string | null }
  | { type: 'cover_open' }
  | { type: 'cover_close' }
  | { type: 'cover_stop' }
  | { type: 'cover_position'; position: number }
  | { type: 'cover_tilt'; tilt: number }
  | { type: 'humidity'; target: number }
  | { type: 'humidifier_mode'; mode: string };

/** What the icon of the card does: on and off; for a cover open, close, or stop while it moves. */
export function iconActionOf(model: DeviceModel): DeviceAction {
  if (model.kind === 'cover') {
    if (model.cover?.moving && model.cover.canStop) return { type: 'cover_stop' };
    return model.on ? { type: 'cover_close' } : { type: 'cover_open' };
  }
  return model.on ? { type: 'turn_off' } : { type: 'turn_on' };
}

export type DeviceServiceCall = { domain: string; service: string; data: Record<string, unknown> };

export function deviceServiceCall(model: DeviceModel, action: DeviceAction): DeviceServiceCall {
  const domain = model.entityId.split('.')[0];
  const target = { entity_id: model.entityId };
  switch (action.type) {
    case 'turn_on':
      return { domain, service: 'turn_on', data: target };
    case 'turn_off':
      return { domain, service: 'turn_off', data: target };
    case 'fan_pct':
      return { domain: 'fan', service: 'set_percentage', data: { ...target, percentage: Math.max(0, Math.min(100, Math.round(action.pct))) } };
    case 'fan_oscillate':
      return { domain: 'fan', service: 'oscillate', data: { ...target, oscillating: action.oscillating } };
    case 'fan_direction':
      return { domain: 'fan', service: 'set_direction', data: { ...target, direction: action.direction } };
    case 'fan_preset':
      return action.preset
        ? { domain: 'fan', service: 'set_preset_mode', data: { ...target, preset_mode: action.preset } }
        : { domain: 'fan', service: 'set_percentage', data: { ...target, percentage: model.fan?.pct || 50 } };
    case 'cover_open':
      return { domain: 'cover', service: 'open_cover', data: target };
    case 'cover_close':
      return { domain: 'cover', service: 'close_cover', data: target };
    case 'cover_stop':
      return { domain: 'cover', service: 'stop_cover', data: target };
    case 'cover_position':
      return { domain: 'cover', service: 'set_cover_position', data: { ...target, position: Math.round(action.position) } };
    case 'cover_tilt':
      return { domain: 'cover', service: 'set_cover_tilt_position', data: { ...target, tilt_position: Math.round(action.tilt) } };
    case 'humidity':
      return { domain: 'humidifier', service: 'set_humidity', data: { ...target, humidity: Math.round(action.target) } };
    case 'humidifier_mode':
      return { domain: 'humidifier', service: 'set_mode', data: { ...target, mode: action.mode } };
    default:
      return { domain, service: 'turn_on', data: target };
  }
}

/** The device as it will be once the command lands, to show it straight away. */
export function applyDeviceAction(model: DeviceModel, action: DeviceAction): DeviceModel {
  switch (action.type) {
    case 'turn_on':
      return { ...model, on: true };
    case 'turn_off':
      return { ...model, on: false };
    case 'fan_pct':
      return model.fan ? { ...model, on: action.pct > 0, fan: { ...model.fan, pct: Math.round(action.pct), preset: null } } : model;
    case 'fan_oscillate':
      return model.fan ? { ...model, fan: { ...model.fan, oscillating: action.oscillating } } : model;
    case 'fan_direction':
      return model.fan ? { ...model, fan: { ...model.fan, direction: action.direction } } : model;
    case 'fan_preset':
      return model.fan ? { ...model, on: true, fan: { ...model.fan, preset: action.preset } } : model;
    case 'cover_open':
      return model.cover ? { ...model, on: true, cover: { ...model.cover, moving: 'opening' } } : model;
    case 'cover_close':
      return model.cover ? { ...model, cover: { ...model.cover, moving: 'closing' } } : model;
    case 'cover_stop':
      return model.cover ? { ...model, cover: { ...model.cover, moving: null } } : model;
    case 'cover_position':
      return model.cover
        ? {
            ...model,
            cover: {
              ...model.cover,
              moving:
                model.cover.position === null || action.position === model.cover.position
                  ? null
                  : action.position > model.cover.position
                    ? 'opening'
                    : 'closing',
            },
          }
        : model;
    case 'cover_tilt':
      return model.cover ? { ...model, cover: { ...model.cover, tilt: Math.round(action.tilt) } } : model;
    case 'humidity':
      return model.humidifier ? { ...model, on: true, humidifier: { ...model.humidifier, target: Math.round(action.target) } } : model;
    case 'humidifier_mode':
      return model.humidifier ? { ...model, on: true, humidifier: { ...model.humidifier, mode: action.mode } } : model;
    default:
      return model;
  }
}

/** Whether the live device now agrees with what was asked. */
export function deviceConfirmed(live: DeviceModel, wanted: DeviceModel) {
  if (live.kind === 'cover') {
    return (live.cover?.moving ?? null) === (wanted.cover?.moving ?? null);
  }
  if (live.on !== wanted.on) return false;
  if (live.fan && wanted.fan && wanted.on) {
    return Math.abs(live.fan.pct - wanted.fan.pct) <= 2 && live.fan.preset === wanted.fan.preset;
  }
  if (live.humidifier && wanted.humidifier) return live.humidifier.target === wanted.humidifier.target;
  return true;
}
