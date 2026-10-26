import type { MockEntityState } from '../../../types/ha';

/*
 * A Home Assistant climate device as the cards and panels see it: its modes,
 * what it is doing, the temperatures it aims at and the call for each command.
 */

export type ClimateMode = 'off' | 'heat' | 'cool' | 'heat_cool' | 'auto' | 'dry' | 'fan_only';
export type ClimateActivity = 'heating' | 'cooling' | 'idle' | 'off' | 'drying' | 'fan' | 'waiting';

export const CLIMATE_MODES: ClimateMode[] = ['off', 'heat', 'cool', 'heat_cool', 'auto', 'dry', 'fan_only'];

export type ClimateModel = {
  entityId: string;
  name: string;
  available: boolean;
  mode: ClimateMode;
  modes: ClimateMode[];
  /** What it is doing now, from Home Assistant when it says so, else worked out. */
  activity: ClimateActivity;
  current: number | null;
  target: number | null;
  low: number | null;
  high: number | null;
  min: number;
  max: number;
  step: number;
  fanModes: string[];
  fanMode: string | null;
  swingModes: string[];
  swing: string | null;
  presets: string[];
  preset: string | null;
};

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

function readText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
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

const asMode = (value: unknown): ClimateMode | null =>
  typeof value === 'string' && (CLIMATE_MODES as string[]).includes(value) ? (value as ClimateMode) : null;

function activityOf(
  mode: ClimateMode,
  action: string | null,
  current: number | null,
  target: number | null,
  low: number | null,
  high: number | null,
): ClimateActivity {
  if (mode === 'off') return 'off';
  if (action === 'heating' || action === 'preheating') return 'heating';
  if (action === 'cooling') return 'cooling';
  if (action === 'drying') return 'drying';
  if (action === 'fan') return 'fan';
  if (action === 'idle' || action === 'off') return 'idle';
  if (mode === 'dry') return 'drying';
  if (mode === 'fan_only') return 'fan';
  if (current === null) return 'waiting';
  if (mode === 'heat' && target !== null) return current < target - 0.2 ? 'heating' : 'idle';
  if (mode === 'cool' && target !== null) return current > target + 0.2 ? 'cooling' : 'idle';
  if (mode === 'heat_cool' && low !== null && high !== null) return current < low ? 'heating' : current > high ? 'cooling' : 'idle';
  return 'waiting';
}

export function toClimateModel(entityId: string, entity: MockEntityState | undefined): ClimateModel {
  const attributes = entity?.rawAttributes ?? {};
  const state = `${entity?.state ?? ''}`.trim().toLowerCase();
  const mode = asMode(state) ?? asMode(entity?.hvacMode) ?? 'off';
  const listed = readStrings(attributes.hvac_modes).map(asMode).filter((entry): entry is ClimateMode => entry !== null);
  const modes = CLIMATE_MODES.filter((entry) => listed.includes(entry) || entry === mode || (entry === 'off' && listed.length === 0));
  const current = readNumber(attributes.current_temperature) ?? null;
  const target = readNumber(attributes.temperature) ?? null;
  const low = readNumber(attributes.target_temp_low) ?? null;
  const high = readNumber(attributes.target_temp_high) ?? null;
  return {
    entityId,
    name: readName(entityId, entity),
    available: Boolean(entity) && state !== 'unavailable' && state !== 'unknown' && state !== '',
    mode,
    modes,
    activity: activityOf(mode, readText(attributes.hvac_action), current, target, low, high),
    current,
    target,
    low,
    high,
    min: readNumber(attributes.min_temp) ?? 7,
    max: readNumber(attributes.max_temp) ?? 35,
    step: readNumber(attributes.target_temp_step) ?? 0.5,
    fanModes: readStrings(attributes.fan_modes),
    fanMode: readText(attributes.fan_mode),
    swingModes: readStrings(attributes.swing_modes),
    swing: readText(attributes.swing_mode),
    presets: readStrings(attributes.preset_modes).filter((preset) => preset !== 'none'),
    preset: readText(attributes.preset_mode) === 'none' ? null : readText(attributes.preset_mode),
  };
}

export function climateIsOn(model: ClimateModel) {
  return model.available && model.mode !== 'off';
}

/** The mode it goes back to when turned on: heating first, as most homes use it. */
export function climateOnMode(model: ClimateModel): ClimateMode {
  return (['heat', 'cool', 'heat_cool', 'auto', 'dry', 'fan_only'] as ClimateMode[]).find((mode) => model.modes.includes(mode)) ?? 'heat';
}

/** Whether + and − change something now: one target, or a range. */
export function climateCanStep(model: ClimateModel) {
  if (!climateIsOn(model)) return false;
  if (model.mode === 'heat_cool') return model.low !== null && model.high !== null;
  return (model.mode === 'heat' || model.mode === 'cool' || model.mode === 'auto') && model.target !== null;
}

/** A swing that is only on or off, shown as a switch. */
export function climateSwingToggle(model: ClimateModel) {
  if (model.swingModes.length < 2 || !model.swingModes.includes('off')) return null;
  return { on: model.swing !== null && model.swing !== 'off', onMode: model.swingModes.find((mode) => mode !== 'off') ?? 'on' };
}

export type ClimateAction =
  | { type: 'turn_on' }
  | { type: 'turn_off' }
  | { type: 'mode'; mode: ClimateMode }
  | { type: 'target'; target: number }
  | { type: 'range'; low: number; high: number }
  | { type: 'step'; delta: number }
  | { type: 'fan'; fanMode: string }
  | { type: 'swing'; swing: string }
  | { type: 'preset'; preset: string };

function clampTo(model: ClimateModel, value: number) {
  const stepped = Math.round(value / model.step) * model.step;
  return Math.round(Math.max(model.min, Math.min(model.max, stepped)) * 10) / 10;
}

/** A step turned into the target or range it gives. */
export function resolveClimateStep(model: ClimateModel, action: ClimateAction): ClimateAction {
  if (action.type !== 'step') return action;
  const delta = action.delta * model.step;
  if (model.mode === 'heat_cool' && model.low !== null && model.high !== null) {
    return { type: 'range', low: clampTo(model, model.low + delta), high: clampTo(model, model.high + delta) };
  }
  return { type: 'target', target: clampTo(model, (model.target ?? model.current ?? 20) + delta) };
}

export type ClimateServiceCall = { domain: 'climate'; service: string; data: Record<string, unknown> };

export function climateServiceCall(model: ClimateModel, rawAction: ClimateAction): ClimateServiceCall {
  const action = resolveClimateStep(model, rawAction);
  const target = { entity_id: model.entityId };
  switch (action.type) {
    case 'turn_off':
      return { domain: 'climate', service: 'set_hvac_mode', data: { ...target, hvac_mode: 'off' } };
    case 'turn_on':
      return { domain: 'climate', service: 'set_hvac_mode', data: { ...target, hvac_mode: climateOnMode(model) } };
    case 'mode':
      return { domain: 'climate', service: 'set_hvac_mode', data: { ...target, hvac_mode: action.mode } };
    case 'target':
      return { domain: 'climate', service: 'set_temperature', data: { ...target, temperature: clampTo(model, action.target) } };
    case 'range':
      return {
        domain: 'climate',
        service: 'set_temperature',
        data: { ...target, target_temp_low: clampTo(model, action.low), target_temp_high: clampTo(model, action.high) },
      };
    case 'fan':
      return { domain: 'climate', service: 'set_fan_mode', data: { ...target, fan_mode: action.fanMode } };
    case 'swing':
      return { domain: 'climate', service: 'set_swing_mode', data: { ...target, swing_mode: action.swing } };
    case 'preset':
      return { domain: 'climate', service: 'set_preset_mode', data: { ...target, preset_mode: action.preset } };
    default:
      return { domain: 'climate', service: 'set_hvac_mode', data: { ...target, hvac_mode: model.mode } };
  }
}

export function applyClimateAction(model: ClimateModel, rawAction: ClimateAction): ClimateModel {
  const action = resolveClimateStep(model, rawAction);
  const withMode = (mode: ClimateMode): ClimateModel => ({
    ...model,
    mode,
    activity: activityOf(mode, null, model.current, model.target, model.low, model.high),
  });
  switch (action.type) {
    case 'turn_off':
      return withMode('off');
    case 'turn_on':
      return withMode(climateOnMode(model));
    case 'mode':
      return withMode(action.mode);
    case 'target': {
      const target = clampTo(model, action.target);
      return { ...model, target, activity: activityOf(model.mode, null, model.current, target, model.low, model.high) };
    }
    case 'range':
      return { ...model, low: clampTo(model, action.low), high: clampTo(model, action.high) };
    case 'fan':
      return { ...model, fanMode: action.fanMode };
    case 'swing':
      return { ...model, swing: action.swing };
    case 'preset':
      return { ...model, preset: action.preset };
    default:
      return model;
  }
}

export function climateConfirmed(live: ClimateModel, wanted: ClimateModel) {
  return (
    live.mode === wanted.mode &&
    live.target === wanted.target &&
    live.low === wanted.low &&
    live.high === wanted.high &&
    live.fanMode === wanted.fanMode &&
    live.swing === wanted.swing &&
    live.preset === wanted.preset
  );
}
