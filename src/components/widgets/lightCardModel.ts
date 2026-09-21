import type { Widget } from '../../types/dashboardModels';
import type { MockEntityState } from '../../types/ha';

const LIGHT_TOGGLE_PENDING_ATTRIBUTE_KEY = '__dashboard_pending_light_toggle';

export type LightCardModel = {
  title: string;
  available: boolean;
  isOn: boolean;
  pending: boolean;
  pendingTargetOn?: boolean;
  brightness: number;
  statusLabel: string;
  supportsBrightness: boolean;
  supportsColor: boolean;
  supportsColorTemp: boolean;
  hue: number;
  saturation: number;
  rgb: [number, number, number];
  colorTempKelvin?: number;
  effect?: string;
  timerActive: boolean;
};

type BuildLightCardModelInput = {
  widget: Widget;
  liveEntity?: MockEntityState;
  fallbackBrightness?: number;
  fallbackHsColor?: [number, number];
  fallbackColorTempKelvin?: number;
  activeTimerEnd?: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizeBrightness(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  const percent = value > 100 ? (value / 255) * 100 : value;
  return clamp(Math.round(percent), 0, 100);
}

function normalizeHs(value: unknown): [number, number] | undefined {
  if (!Array.isArray(value) || value.length < 2) return undefined;
  const hue = Number(value[0]);
  const saturation = Number(value[1]);
  if (!Number.isFinite(hue) || !Number.isFinite(saturation)) return undefined;
  return [((hue % 360) + 360) % 360, clamp(saturation, 0, 100)];
}

function normalizeRgb(value: unknown): [number, number, number] | undefined {
  if (!Array.isArray(value) || value.length < 3) return undefined;
  const channels = value.slice(0, 3).map(Number);
  if (channels.some((channel) => !Number.isFinite(channel))) return undefined;
  return channels.map((channel) => clamp(Math.round(channel), 0, 255)) as [number, number, number];
}

export function hsToLightRgb(hue: number, saturation: number): [number, number, number] {
  const h = ((hue % 360) + 360) % 360;
  const s = clamp(saturation / 100, 0, 1);
  const c = s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  let red = 0;
  let green = 0;
  let blue = 0;
  if (h < 60) [red, green] = [c, x];
  else if (h < 120) [red, green] = [x, c];
  else if (h < 180) [green, blue] = [c, x];
  else if (h < 240) [green, blue] = [x, c];
  else if (h < 300) [red, blue] = [x, c];
  else [red, blue] = [c, x];
  const offset = 1 - c;
  return [red, green, blue].map((channel) => Math.round((channel + offset) * 255)) as [number, number, number];
}

function rgbToHs(rgb: [number, number, number]): [number, number] {
  const [red, green, blue] = rgb.map((channel) => channel / 255);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;
  if (delta > 0) {
    if (max === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (max === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }
  if (hue < 0) hue += 360;
  return [hue, max === 0 ? 0 : (delta / max) * 100];
}

function readSupportedModes(entity: MockEntityState | undefined) {
  const raw = entity?.supportedColorModes ?? entity?.supported_color_modes ?? entity?.rawAttributes?.supported_color_modes;
  return Array.isArray(raw)
    ? raw.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.toLowerCase())
    : [];
}

export function buildLightCardModel({
  widget,
  liveEntity,
  fallbackBrightness,
  fallbackHsColor,
  fallbackColorTempKelvin,
  activeTimerEnd,
}: BuildLightCardModelInput): LightCardModel {
  const rawState = normalizeText(liveEntity?.stateLabel ?? liveEntity?.state ?? widget.status);
  const available = !['unavailable', 'unknown', 'non disponibile'].includes(rawState);
  const isOn = available && (
    typeof liveEntity?.toggleOn === 'boolean'
      ? liveEntity.toggleOn
      : liveEntity
        ? rawState === 'on' || rawState === 'accesa'
        : widget.isOn
  );
  const pendingValue = liveEntity?.rawAttributes?.[LIGHT_TOGGLE_PENDING_ATTRIBUTE_KEY];
  const pendingTargetOn = typeof pendingValue === 'boolean'
    ? pendingValue
    : pendingValue === 'on'
      ? true
      : pendingValue === 'off'
        ? false
        : undefined;
  const pending = pendingTargetOn !== undefined;
  const brightness = normalizeBrightness(
    liveEntity?.brightness ?? liveEntity?.numericValue ?? widget.value ?? fallbackBrightness,
  );
  const supportedModes = readSupportedModes(liveEntity);
  const colorModes = ['hs', 'xy', 'rgb', 'rgbw', 'rgbww'];
  // Explicit HA color modes are authoritative; stale widget values must not
  // turn an on/off-only lamp into a dimmable one.
  const supportsColor = supportedModes.length > 0
    ? supportedModes.some((mode) => colorModes.includes(mode))
    : Boolean(liveEntity?.hsColor ?? liveEntity?.hs_color ?? liveEntity?.rgbColor ?? liveEntity?.rgb_color ?? fallbackHsColor);
  const supportsColorTemp = supportedModes.length > 0
    ? supportedModes.includes('color_temp')
    : Number.isFinite(liveEntity?.colorTempKelvin ?? liveEntity?.color_temp_kelvin ?? fallbackColorTempKelvin);
  const supportsBrightness = supportedModes.length > 0
    ? supportedModes.some((mode) => mode !== 'onoff')
    : liveEntity
      ? Number.isFinite(liveEntity.brightness)
      : Number.isFinite(widget.value ?? fallbackBrightness);
  const explicitRgb = normalizeRgb(liveEntity?.rgbColor ?? liveEntity?.rgb_color);
  const explicitHs = normalizeHs(liveEntity?.hsColor ?? liveEntity?.hs_color ?? fallbackHsColor);
  const [hue, saturation] = explicitHs ?? (explicitRgb ? rgbToHs(explicitRgb) : [42, 18]);
  const rgb = explicitRgb ?? hsToLightRgb(hue, saturation);
  const colorTempValue = liveEntity?.colorTempKelvin ?? liveEntity?.color_temp_kelvin ?? fallbackColorTempKelvin;
  const colorTempKelvin = typeof colorTempValue === 'number' && Number.isFinite(colorTempValue)
    ? Math.round(colorTempValue)
    : undefined;
  const effectValue = liveEntity?.effect ?? liveEntity?.rawAttributes?.effect;
  const effect = typeof effectValue === 'string' && !['', 'none', 'off'].includes(effectValue.trim().toLowerCase())
    ? effectValue.trim()
    : undefined;
  const statusLabel = !available
    ? 'Non disponibile'
    : pending
      ? pendingTargetOn === false
        ? 'Spegnimento…'
        : 'Accensione…'
      : isOn
        ? supportsBrightness
          ? `Accesa · ${brightness}%`
          : 'Accesa'
        : 'Spenta';

  return {
    title: widget.title,
    available,
    isOn,
    pending,
    pendingTargetOn,
    brightness,
    statusLabel,
    supportsBrightness,
    supportsColor,
    supportsColorTemp,
    hue: Math.round(hue),
    saturation: Math.round(saturation),
    rgb,
    colorTempKelvin,
    effect,
    timerActive: typeof activeTimerEnd === 'number' && activeTimerEnd > Date.now(),
  };
}
