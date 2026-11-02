import type { MockEntityState, MockEntityStateMap } from '../../types/ha';
import type { DeviceKind } from '../devices/model/entityKind';
import { resolveClimateStep, toClimateModel, type ClimateAction, type ClimateModel } from '../devices/model/climate';
import { toDeviceModel, type DeviceAction, type DeviceModel } from '../devices/model/device';
import type { LightAction, LightCaps, LightModel } from '../devices/model/light';
import {
  homeDeviceEntityId,
  homeEntityOf,
  type HomeClimate,
  type HomeCover,
  type HomeLamp,
  type HomePanelActions,
  type HomePanelProps,
} from './homePanelRoute';

/*
 * The panels of Rooms in the detail of the Home. The Home keeps what it already
 * prepares for its detail, the state of the card and its commands, and these
 * adapters turn them into the models and the actions of a shared panel. A card
 * whose entity cannot be read keeps its old content (homePanelRoute.ts).
 */

const AWAY_STATES = new Set(['unavailable', 'unknown', 'non disponibile']);

const isAway = (status: string | undefined) => AWAY_STATES.has(`${status ?? ''}`.trim().toLowerCase());

export function lampToLightModel(entityId: string, name: string, lamp: HomeLamp): LightModel {
  const caps: LightCaps = lamp.supportsColor ? 'color' : lamp.supportsColorTemp ? 'ct' : lamp.supportsBrightness ? 'dim' : 'onoff';
  const [hue = 30, saturation = 100] = lamp.hsColor ?? [];
  return {
    entityId,
    name,
    available: !isAway(lamp.status),
    on: lamp.isOn,
    caps,
    // A light in a colour has no temperature to report.
    mode: caps === 'color' && !lamp.colorTemp ? 'color' : 'temp',
    brightnessPct: caps === 'onoff' ? null : Math.max(1, Math.min(100, Math.round(lamp.brightness))),
    kelvin: lamp.colorTemp || 2700,
    hue,
    saturation: saturation > 0 ? saturation : 100,
    minKelvin: lamp.minColorTempKelvin ?? 2000,
    maxKelvin: lamp.maxColorTempKelvin ?? 6500,
    colorPayloadMode: 'hs',
  };
}

export function runLightAction(action: LightAction, model: LightModel, actions: HomePanelActions) {
  switch (action.type) {
    case 'turn_on':
    case 'turn_off':
      actions.toggleLamp();
      break;
    case 'brightness':
      actions.setLampBrightness(action.pct);
      break;
    case 'kelvin':
      actions.setLampColorTemp(action.kelvin);
      break;
    case 'hue':
      actions.setLampHsColor([action.hue, 100]);
      break;
    case 'mode':
      if (action.mode === 'color') actions.setLampHsColor([model.hue, 100]);
      else actions.setLampColorTemp(model.kelvin);
      break;
  }
}

/** The climate of the Home, read by the same builder Rooms uses. */
export function homeClimateToModel(entityId: string, name: string, climate: HomeClimate): ClimateModel {
  // Without a live entity the Home gives every temperature as NaN.
  const away = Number.isNaN(climate.targetTemp) && Number.isNaN(climate.maxTemp);
  const entity = {
    state: away ? 'unavailable' : climate.mode,
    rawAttributes: {
      friendly_name: name,
      hvac_modes: climate.hvacModes,
      hvac_action: climate.hvacAction,
      current_temperature: climate.currentTemp,
      temperature: climate.targetTemp,
      target_temp_low: climate.targetTempLow,
      target_temp_high: climate.targetTempHigh,
      min_temp: climate.minTemp,
      max_temp: climate.maxTemp,
      target_temp_step: climate.targetTempStep,
      fan_modes: climate.fanModes,
      fan_mode: climate.fanMode,
      swing_modes: climate.swingModes,
      swing_mode: climate.swingMode,
      preset_modes: climate.presetModes,
      preset_mode: climate.presetMode,
    },
  } as unknown as MockEntityState;
  return { ...toClimateModel(entityId, entity), name };
}

export function runClimateAction(raw: ClimateAction, model: ClimateModel, actions: HomePanelActions) {
  const action = resolveClimateStep(model, raw);
  switch (action.type) {
    case 'turn_on':
    case 'turn_off':
      actions.toggleClimatePower();
      break;
    case 'mode':
      actions.setClimateMode?.(action.mode);
      break;
    case 'target':
      actions.setClimateTargetTemp?.(action.target);
      break;
    case 'range':
      actions.setClimateTargetRange?.(action.low, action.high);
      break;
    case 'fan':
      actions.setClimateFanMode?.(action.fanMode);
      break;
    case 'swing':
      actions.setClimateSwingMode?.(action.swing);
      break;
    case 'preset':
      actions.setClimatePresetMode?.(action.preset);
      break;
  }
}

/** The cover of the Home, read by the same builder Rooms uses. */
export function homeCoverToModel(name: string, cover: HomeCover): DeviceModel | null {
  const entity = {
    state: cover.state,
    rawAttributes: {
      ...cover.rawAttributes,
      current_position: cover.position ?? cover.rawAttributes?.current_position,
      current_tilt_position: cover.tiltPosition ?? cover.rawAttributes?.current_tilt_position,
      supported_features: cover.supportedFeatures ?? cover.rawAttributes?.supported_features,
    },
  } as unknown as MockEntityState;
  const model = toDeviceModel('cover.home_panel', entity);
  return model ? { ...model, name } : null;
}

export function runDeviceAction(action: DeviceAction, kind: DeviceKind, actions: HomePanelActions) {
  switch (action.type) {
    case 'turn_on':
    case 'turn_off':
      if (kind === 'fan') actions.toggleFan();
      else if (kind === 'humidifier') actions.toggleHumidifier();
      else actions.toggleSwitch();
      break;
    case 'fan_pct':
      actions.setFanPercentage(action.pct);
      break;
    case 'fan_preset':
      if (action.preset) actions.setFanPreset(action.preset);
      break;
    case 'fan_oscillate':
      actions.setFanOscillation(action.oscillating);
      break;
    case 'fan_direction':
      actions.setFanDirection(action.direction);
      break;
    case 'cover_open':
      actions.openCover?.();
      break;
    case 'cover_close':
      actions.closeCover?.();
      break;
    case 'cover_stop':
      actions.stopCover?.();
      break;
    case 'cover_position':
      actions.setCoverPosition?.(action.position);
      break;
    case 'cover_tilt':
      actions.setCoverTiltPosition?.(action.tilt);
      break;
    case 'humidity':
      actions.setHumidifierTargetHumidity(action.target);
      break;
    case 'humidifier_mode':
      actions.setHumidifierMode(action.mode);
      break;
  }
}

function readWatts(entity: MockEntityState | undefined) {
  const value = Number(entity?.state);
  if (!entity || entity.state === '' || !Number.isFinite(value)) return null;
  const unit = `${entity.rawAttributes?.unit_of_measurement ?? ''}`.trim();
  return unit === 'kW' ? value * 1000 : value;
}

const byName = (haStates: MockEntityStateMap, domain: string, name: string) =>
  Object.keys(haStates).find((id) => id.startsWith(`${domain}.`) && haStates[id]?.rawAttributes?.friendly_name === name);

const byAttributes = (haStates: MockEntityStateMap, domain: string, attributes: Record<string, unknown> | undefined) =>
  attributes ? Object.keys(haStates).find((id) => id.startsWith(`${domain}.`) && haStates[id]?.rawAttributes === attributes) : undefined;

/**
 * The entity behind the open panel, for the states they all share. The Home
 * hands over its attributes or its card, not always its id: a card without a
 * readable entity simply has no such states.
 */
export function homeLiveEntityIdOf(props: HomePanelProps): string | null {
  const { activeDevice, haStates } = props;
  const direct = (domain: string) => (activeDevice.id.startsWith(`${domain}.`) && haStates[activeDevice.id] ? activeDevice.id : undefined);
  switch (activeDevice.type) {
    case 'sensor':
      return activeDevice.sensorEntityId ?? null;
    case 'calendar':
      return activeDevice.calendarEntityId ?? null;
    case 'light':
    case 'climate':
      return direct(activeDevice.type) ?? byName(haStates, activeDevice.type, activeDevice.name) ?? null;
    case 'alarm':
      return byAttributes(haStates, 'alarm_control_panel', props.alarm.rawAttributes) ?? direct('alarm_control_panel') ?? null;
    case 'vacuum':
      return byAttributes(haStates, 'vacuum', props.vacuum.rawAttributes) ?? direct('vacuum') ?? null;
    case 'cover':
      return byAttributes(haStates, 'cover', props.cover.rawAttributes) ?? direct('cover') ?? null;
    case 'switch':
    case 'fan':
    case 'humidifier':
      return homeDeviceEntityId(props) ?? null;
    default:
      return null;
  }
}

export function deviceModelOf(props: HomePanelProps): DeviceModel | null {
  const { activeDevice, cover, coverIsReadOnly, haStates } = props;
  if (activeDevice.type === 'cover') return coverIsReadOnly ? null : homeCoverToModel(activeDevice.name, cover);
  const entityId = homeDeviceEntityId(props);
  const entity = homeEntityOf(haStates, entityId);
  if (!entityId || !entity) return null;
  const watts = readWatts(homeEntityOf(haStates, activeDevice.switchConsumptionEntityId));
  const model = toDeviceModel(entityId, entity, { watts });
  return model ? { ...model, name: activeDevice.name } : null;
}
