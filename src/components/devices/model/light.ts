import type { MockEntityState } from '../../../types/ha';
import {
  buildLightColorServicePayload,
  percentToHaBrightness,
  resolveLightCapabilities,
  type LightColorPayloadMode,
} from '../../dashboard/mainboard/mainBoardLightModel';

/*
 * A Home Assistant light as the device cards and panels see it. Plain
 * functions: what the light can do, what it is doing, how to say it and the
 * service call for each command.
 */

/** What a light can do besides turning on and off. */
export type LightCaps = 'onoff' | 'dim' | 'ct' | 'color';
/** White light (a temperature) or a colour, for the lights that do both. */
export type LightMode = 'temp' | 'color';
export type LightTone = 'candle' | 'warm' | 'neutral' | 'cool';

export type LightModel = {
  entityId: string;
  name: string;
  available: boolean;
  on: boolean;
  caps: LightCaps;
  mode: LightMode;
  /** 1–100, or null when the light does not report it. */
  brightnessPct: number | null;
  kelvin: number;
  hue: number;
  saturation: number;
  minKelvin: number;
  maxKelvin: number;
  /** The colour payload Home Assistant expects from this light. */
  colorPayloadMode: LightColorPayloadMode;
};

export const LIGHT_TEMPERATURE_PRESETS = [2200, 2700, 4000, 6500] as const;
export const LIGHT_HUE_PRESETS = [0, 30, 55, 130, 200, 265, 310] as const;
const DEFAULT_KELVIN = 2700;
const COLOR_MODES = ['hs', 'xy', 'rgb', 'rgbw', 'rgbww'];

function readNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function readModes(entity: MockEntityState | undefined) {
  const raw = entity?.rawAttributes?.supported_color_modes;
  return Array.isArray(raw)
    ? raw.filter((mode): mode is string => typeof mode === 'string').map((mode) => mode.trim().toLowerCase())
    : [];
}

/** What the light can do, from `supported_color_modes`; older lights by their features. */
export function lightCapsOf(entity: MockEntityState | undefined): LightCaps {
  const modes = readModes(entity);
  if (modes.length > 0) {
    if (modes.some((mode) => COLOR_MODES.includes(mode))) return 'color';
    if (modes.includes('color_temp')) return 'ct';
    if (modes.includes('brightness') || modes.includes('white')) return 'dim';
    return 'onoff';
  }
  if (!entity) return 'onoff';
  const legacy = resolveLightCapabilities(entity);
  if (legacy.supportsColor) return 'color';
  if (legacy.supportsColorTemp) return 'ct';
  return legacy.supportsBrightness ? 'dim' : 'onoff';
}

/** 0–255 from Home Assistant to 1–100; the live map may already carry a percentage. */
export function lightBrightnessPct(entity: MockEntityState | undefined): number | null {
  const raw = readNumber(entity?.rawAttributes?.brightness);
  if (raw !== undefined) {
    return Math.max(1, Math.min(100, Math.round((raw / 255) * 100)));
  }
  const pct = readNumber(entity?.brightness);
  return pct === undefined ? null : Math.max(1, Math.min(100, Math.round(pct)));
}

function readKelvin(entity: MockEntityState | undefined) {
  const kelvin = readNumber(entity?.rawAttributes?.color_temp_kelvin);
  if (kelvin !== undefined) return Math.round(kelvin);
  const mired = readNumber(entity?.rawAttributes?.color_temp);
  return mired !== undefined && mired > 0 ? Math.round(1_000_000 / mired) : undefined;
}

function hueFromRgb(rgb: unknown): [number, number] | undefined {
  if (!Array.isArray(rgb) || rgb.length < 3) return undefined;
  const [r, g, b] = rgb.slice(0, 3).map((value) => (readNumber(value) ?? 0) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (max === 0) return [0, 0];
  let hue = 0;
  if (delta > 0) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
  }
  hue = Math.round(hue * 60);
  return [hue < 0 ? hue + 360 : hue, Math.round((delta / max) * 100)];
}

function readHueSaturation(entity: MockEntityState | undefined): [number, number] | undefined {
  const hs = entity?.rawAttributes?.hs_color;
  if (Array.isArray(hs) && hs.length >= 2) {
    const hue = readNumber(hs[0]);
    const saturation = readNumber(hs[1]);
    if (hue !== undefined && saturation !== undefined) return [Math.round(hue), Math.round(saturation)];
  }
  return hueFromRgb(entity?.rawAttributes?.rgb_color);
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

export function toLightModel(entityId: string, entity: MockEntityState | undefined): LightModel {
  const state = `${entity?.state ?? ''}`.trim().toLowerCase();
  const caps = lightCapsOf(entity);
  const colorMode = `${entity?.rawAttributes?.color_mode ?? ''}`.trim().toLowerCase();
  const [hue, saturation] = readHueSaturation(entity) ?? [30, 100];
  const legacy = resolveLightCapabilities(entity);
  return {
    entityId,
    name: readName(entityId, entity),
    available: Boolean(entity) && state !== 'unavailable' && state !== 'unknown' && state !== '',
    on: state === 'on',
    caps,
    mode: caps === 'color' && COLOR_MODES.includes(colorMode) ? 'color' : 'temp',
    brightnessPct: caps === 'onoff' ? null : lightBrightnessPct(entity),
    kelvin: readKelvin(entity) ?? DEFAULT_KELVIN,
    hue,
    saturation: saturation > 0 ? saturation : 100,
    minKelvin: legacy.minColorTempKelvin,
    maxKelvin: legacy.maxColorTempKelvin,
    colorPayloadMode: legacy.preferredColorMode ?? 'hs',
  };
}

/** Whether the light has anything to control besides on and off, so a panel. */
export function lightHasPanel(model: LightModel) {
  return model.caps !== 'onoff';
}

export function lightTone(kelvin: number): LightTone {
  if (kelvin < 2500) return 'candle';
  if (kelvin < 3300) return 'warm';
  if (kelvin < 4800) return 'neutral';
  return 'cool';
}

/** The words of the status line, before translation. */
export type LightStatus =
  | { kind: 'unavailable' }
  | { kind: 'off' }
  | { kind: 'on' }
  | { kind: 'level'; pct: number; detail: LightTone | 'color' | null };

export function lightStatusOf(model: LightModel): LightStatus {
  if (!model.available) return { kind: 'unavailable' };
  if (!model.on) return { kind: 'off' };
  if (model.caps === 'onoff') return { kind: 'on' };
  const pct = model.brightnessPct ?? 100;
  if (model.caps === 'dim') return { kind: 'level', pct, detail: null };
  if (model.caps === 'color' && model.mode === 'color') return { kind: 'level', pct, detail: 'color' };
  return { kind: 'level', pct, detail: lightTone(model.kelvin) };
}

export type LightAction =
  | { type: 'turn_on' }
  | { type: 'turn_off' }
  | { type: 'brightness'; pct: number }
  | { type: 'kelvin'; kelvin: number }
  | { type: 'hue'; hue: number; saturation?: number }
  | { type: 'mode'; mode: LightMode };

export type LightServiceCall = { domain: 'light'; service: 'turn_on' | 'turn_off'; data: Record<string, unknown> };

/** The Home Assistant call for a command; every command but "off" also turns the light on. */
export function lightServiceCall(model: LightModel, action: LightAction): LightServiceCall {
  const target = { entity_id: model.entityId };
  switch (action.type) {
    case 'turn_off':
      return { domain: 'light', service: 'turn_off', data: target };
    case 'brightness':
      return {
        domain: 'light',
        service: 'turn_on',
        data: { ...target, brightness: percentToHaBrightness(Math.max(1, Math.min(100, action.pct))) },
      };
    case 'kelvin':
      return { domain: 'light', service: 'turn_on', data: { ...target, color_temp_kelvin: Math.round(action.kelvin) } };
    case 'hue':
      return {
        domain: 'light',
        service: 'turn_on',
        data: { ...target, ...buildLightColorServicePayload(model.colorPayloadMode, [action.hue, action.saturation ?? model.saturation]) },
      };
    case 'mode':
      return action.mode === 'color'
        ? lightServiceCall(model, { type: 'hue', hue: model.hue })
        : lightServiceCall(model, { type: 'kelvin', kelvin: model.kelvin });
    default:
      return { domain: 'light', service: 'turn_on', data: target };
  }
}

/** The light as it will be once the command lands, to show it straight away. */
export function applyLightAction(model: LightModel, action: LightAction): LightModel {
  switch (action.type) {
    case 'turn_off':
      return { ...model, on: false };
    case 'turn_on':
      return { ...model, on: true };
    case 'brightness':
      return { ...model, on: true, brightnessPct: Math.max(1, Math.min(100, Math.round(action.pct))) };
    case 'kelvin':
      return { ...model, on: true, mode: 'temp', kelvin: Math.round(action.kelvin) };
    case 'hue':
      return { ...model, on: true, mode: 'color', hue: Math.round(action.hue), saturation: action.saturation ?? model.saturation };
    case 'mode':
      return { ...model, on: true, mode: action.mode };
    default:
      return model;
  }
}
