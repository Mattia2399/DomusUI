import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CircleOff,
  Droplets,
  Fan,
  Flame,
  Home,
  Leaf,
  Minus,
  Moon,
  MoveHorizontal,
  MoveVertical,
  Orbit,
  Pause,
  Plus,
  Power,
  Rocket,
  SignalHigh,
  SignalLow,
  SignalMedium,
  Snowflake,
  Sparkles,
  Sun,
  Thermometer,
  VolumeX,
  Wind,
} from 'lucide-react';
import { CONTEXT_PANEL_LAYOUT } from './layoutClasses';
import { CircularTemperatureSlider, snapTemperatureToStep } from './CircularTemperatureSlider';
import { useI18n } from '../../i18n/I18nProvider';
import type { TranslationKey } from '../../i18n/translations';
import { GlassButton } from '../ui/GlassButton';
import GlassSlider from '../ui/GlassSlider';
import GlassSegmentSelect from '../ui/GlassSegmentSelect';
import { ContextPanelHeader } from './ContextPanelHeader';
import {
  CLIMATE_FEATURE_FAN_MODE,
  CLIMATE_FEATURE_PRESET_MODE,
  CLIMATE_FEATURE_SWING_HORIZONTAL_MODE,
  CLIMATE_FEATURE_SWING_MODE,
  CLIMATE_FEATURE_TARGET_HUMIDITY,
  CLIMATE_FEATURE_TARGET_TEMPERATURE,
  CLIMATE_FEATURE_TARGET_TEMPERATURE_RANGE,
  CLIMATE_FEATURE_TURN_OFF,
  CLIMATE_FEATURE_TURN_ON,
  resolveClimatePrimaryControl,
} from '../widgets/climateCardModel';

interface ClimateControlsProps {
  climate: {
    name: string;
    mode: string;
    isOn: boolean;
    status?: string;
    currentTemp: number;
    targetTemp: number;
    minTemp: number;
    maxTemp: number;
    targetTempLow?: number;
    targetTempHigh?: number;
    targetTempStep?: number;
    hvacModes?: string[];
    hvacAction?: string;
    fanMode?: string;
    fanModes?: string[];
    supportedFeatures?: number;
    precision?: number;
    currentHumidity?: number;
    targetHumidity?: number;
    minHumidity?: number;
    maxHumidity?: number;
    targetHumidityStep?: number;
    presetMode?: string;
    presetModes?: string[];
    swingMode?: string;
    swingModes?: string[];
    swingHorizontalMode?: string;
    swingHorizontalModes?: string[];
    supportsTargetTemperature?: boolean;
    supportsTargetTemperatureRange?: boolean;
    supportsTargetHumidity?: boolean;
    supportsFanMode?: boolean;
    supportsPresetMode?: boolean;
    supportsSwingMode?: boolean;
    supportsSwingHorizontalMode?: boolean;
    supportsTurnOn?: boolean;
    supportsTurnOff?: boolean;
    temperatureUnit?: string;
    rawAttributes?: Record<string, unknown>;
  };
  onTogglePower: () => void;
  onDecreaseTarget: () => void;
  onIncreaseTarget: () => void;
  onAutoAdjust: () => void;
  onRefreshCurrent: () => void;
  onSetTargetTemp?: (value: number) => void;
  onSetTargetRange?: (low: number, high: number) => void;
  onSetMode?: (mode: string) => void;
  onSetFanMode?: (mode: string) => void;
  onSetTargetHumidity?: (value: number) => void;
  onSetPresetMode?: (mode: string) => void;
  onSetSwingMode?: (mode: string) => void;
  onSetSwingHorizontalMode?: (mode: string) => void;
  hideHeader?: boolean;
  density?: 'default' | 'compact';
}

const CLIMATE_PENDING_TARGET_ATTRIBUTE_KEY = '__dashboard_pending_climate_target';
const CLIMATE_PENDING_FAN_ATTRIBUTE_KEY = '__dashboard_pending_climate_fan';
const CLIMATE_PENDING_HUMIDITY_ATTRIBUTE_KEY = '__dashboard_pending_climate_humidity';
const CLIMATE_PENDING_PRESET_ATTRIBUTE_KEY = '__dashboard_pending_climate_preset';
const CLIMATE_PENDING_SWING_ATTRIBUTE_KEY = '__dashboard_pending_climate_swing';
const CLIMATE_PENDING_SWING_HORIZONTAL_ATTRIBUTE_KEY = '__dashboard_pending_climate_swing_horizontal';

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.trim().replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function toPlausibleClimateTemperature(value: unknown, min?: number, max?: number): number | undefined {
  const nextValue = toFiniteNumber(value);
  if (nextValue === undefined) {
    return undefined;
  }
  if (min !== undefined && max !== undefined && max > min) {
    const tolerance = Math.max(12, (max - min) * 0.35);
    return nextValue >= min - tolerance && nextValue <= max + tolerance ? nextValue : undefined;
  }
  return nextValue > -80 && nextValue < 160 ? nextValue : undefined;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function normalizeMode(mode: string | undefined) {
  return (mode ?? '').trim().toLowerCase();
}

function normalizeModes(modes: string[]) {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const mode of modes) {
    const next = normalizeMode(mode);
    if (!next || seen.has(next)) {
      continue;
    }
    seen.add(next);
    normalized.push(next);
  }
  return normalized;
}

function modeIcon(mode: string, size = 16) {
  if (mode === 'heat') {
    return <Flame size={size} />;
  }
  if (mode === 'cool') {
    return <Snowflake size={size} />;
  }
  if (mode === 'auto' || mode === 'heat_cool') {
    return <Sparkles size={size} />;
  }
  if (mode === 'fan_only') {
    return <Wind size={size} />;
  }
  if (mode === 'dry') {
    return <Droplets size={size} />;
  }
  if (mode === 'off') {
    return <Power size={size} />;
  }
  return <Thermometer size={size} />;
}

function modeSelectorIcon(mode: string, size = 16) {
  if (mode === 'heat') {
    return <Sun size={size} />;
  }
  return modeIcon(mode, size);
}

function modeSegmentIcon(mode: string, className = 'h-4 w-4') {
  if (mode === 'heat') {
    return <Sun className={className} />;
  }
  if (mode === 'cool') {
    return <Snowflake className={className} />;
  }
  if (mode === 'auto' || mode === 'heat_cool') {
    return <Sparkles className={className} />;
  }
  if (mode === 'fan_only') {
    return <Wind className={className} />;
  }
  if (mode === 'dry') {
    return <Droplets className={className} />;
  }
  if (mode === 'off') {
    return <Power className={className} />;
  }
  return <Thermometer className={className} />;
}

function modeAccentIconClass(mode: string) {
  if (mode === 'heat') {
    return 'text-[#FF9F0A]';
  }
  if (mode === 'cool') {
    return 'text-[#0A84FF]';
  }
  if (mode === 'auto' || mode === 'heat_cool') {
    return 'text-[#32D74B]';
  }
  if (mode === 'dry') {
    return 'text-[#64D2FF]';
  }
  if (mode === 'fan_only') {
    return 'text-white';
  }
  if (mode === 'off') {
    return 'text-white/65';
  }
  return 'text-white';
}

function modeSelectorLabel(mode: string) {
  if (mode === 'off') {
    return 'On/Off';
  }
  return formatModeLabel(mode);
}

function modeActionChipLabel(mode: string) {
  if (mode === 'off') {
    return 'Spento';
  }
  if (mode === 'heat') {
    return 'Caldo';
  }
  if (mode === 'cool') {
    return 'Freddo';
  }
  if (mode === 'heat_cool' || mode === 'auto') {
    return 'Auto';
  }
  if (mode === 'fan_only') {
    return 'Ventola';
  }
  if (mode === 'dry') {
    return 'Dry';
  }
  return mode.length ? mode.replace(/[_-]+/g, ' ') : 'Mode';
}

type RoomClimateAction = {
  id: string;
  value: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  iconClassName: string;
};

function isEquivalentClimateMode(currentMode: string, candidateMode: string) {
  if (currentMode === candidateMode) {
    return true;
  }
  return (
    (currentMode === 'auto' && candidateMode === 'heat_cool') ||
    (currentMode === 'heat_cool' && candidateMode === 'auto')
  );
}

function titleCaseModeLabel(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function fanActionLabel(mode: string) {
  const normalized = normalizeMode(mode);
  if (normalized === 'auto') {
    return 'Auto';
  }
  if (normalized === 'low') {
    return 'Bassa';
  }
  if (normalized === 'medium' || normalized === 'mid') {
    return 'Media';
  }
  if (normalized === 'high') {
    return 'Alta';
  }
  if (normalized === 'turbo') {
    return 'Turbo';
  }
  if (normalized === 'silent' || normalized === 'quiet') {
    return 'Silenziosa';
  }
  return titleCaseModeLabel(mode);
}

function fanActionIcon(mode: string, className = 'h-4 w-4') {
  const normalized = normalizeMode(mode);
  if (normalized === 'off') {
    return <CircleOff className={className} />;
  }
  if (normalized === 'auto') {
    return <Sparkles className={className} />;
  }
  if (normalized === 'low') {
    return <SignalLow className={className} />;
  }
  if (normalized === 'medium' || normalized === 'mid') {
    return <SignalMedium className={className} />;
  }
  if (normalized === 'high') {
    return <SignalHigh className={className} />;
  }
  if (normalized === 'turbo' || normalized === 'boost') {
    return <Rocket className={className} />;
  }
  if (normalized === 'silent' || normalized === 'quiet') {
    return <VolumeX className={className} />;
  }
  if (normalized === 'natural' || normalized === 'breeze') {
    return <Wind className={className} />;
  }
  return <Fan className={className} />;
}

function presetActionLabel(mode: string) {
  const normalized = normalizeMode(mode);
  if (normalized === 'none') {
    return 'Nessuno'; // i18n-audit-ignore: canonical label translated by localizedClimateLabel.
  }
  if (normalized === 'eco') {
    return 'Eco';
  }
  if (normalized === 'comfort') {
    return 'Comfort';
  }
  if (normalized === 'away') {
    return 'Fuori casa';
  }
  if (normalized === 'sleep') {
    return 'Notte';
  }
  if (normalized === 'boost') {
    return 'Boost';
  }
  if (normalized === 'home') {
    return 'Casa';
  }
  if (normalized === 'activity') {
    return 'Attivita';
  }
  return titleCaseModeLabel(mode);
}

function presetActionIcon(mode: string, className = 'h-4 w-4') {
  const normalized = normalizeMode(mode);
  if (normalized === 'none') {
    return <CircleOff className={className} />;
  }
  if (normalized === 'eco') {
    return <Leaf className={className} />;
  }
  if (normalized === 'comfort') {
    return <Sparkles className={className} />;
  }
  if (normalized === 'away') {
    return <MoveHorizontal className={className} />;
  }
  if (normalized === 'sleep') {
    return <Moon className={className} />;
  }
  if (normalized === 'boost') {
    return <Rocket className={className} />;
  }
  if (normalized === 'home') {
    return <Home className={className} />;
  }
  if (normalized === 'activity') {
    return <Activity className={className} />;
  }
  return <Sparkles className={className} />;
}

function swingActionLabel(mode: string) {
  const normalized = normalizeMode(mode);
  if (normalized === 'off') {
    return 'Ferma';
  }
  if (normalized === 'on') {
    return 'Attiva';
  }
  if (normalized === 'vertical') {
    return 'Verticale';
  }
  if (normalized === 'horizontal') {
    return 'Orizzontale';
  }
  if (normalized === 'both') {
    return 'Entrambe';
  }
  return titleCaseModeLabel(mode);
}

function swingDirectionIcon(mode: string, className = 'h-4 w-4') {
  const normalized = normalizeMode(mode);
  if (normalized === 'off' || normalized === 'stop' || normalized === 'stopped') {
    return <Pause className={className} />;
  }
  if (normalized === 'vertical' || normalized.includes('vertical') || normalized.includes('up') || normalized.includes('down')) {
    return <MoveVertical className={className} />;
  }
  if (
    normalized === 'horizontal' ||
    normalized.includes('horizontal') ||
    normalized.includes('left') ||
    normalized.includes('right')
  ) {
    return <MoveHorizontal className={className} />;
  }
  if (normalized === 'both' || normalized === 'all' || normalized === '3d') {
    return <Orbit className={className} />;
  }
  return <Wind className={className} />;
}

function swingHorizontalIcon(mode: string, className = 'h-4 w-4') {
  const normalized = normalizeMode(mode);
  if (normalized === 'off' || normalized === 'stop' || normalized === 'stopped') {
    return <Pause className={className} />;
  }
  return <MoveHorizontal className={className} />;
}

function formatModeLabel(mode: string) {
  if (mode === 'heat') {
    return 'Riscaldamento';
  }
  if (mode === 'cool') {
    return 'Raffrescamento';
  }
  if (mode === 'heat_cool' || mode === 'auto') {
    return 'Automatico';
  }
  if (mode === 'fan_only') {
    return 'Ventilazione';
  }
  if (mode === 'dry') {
    return 'Deumidifica';
  }
  if (mode === 'off') {
    return 'Spento';
  }
  return mode.length ? mode : 'Inattivo';
}

export function translateClimateStatus(status: string | undefined, fallback: string) {
  const raw = status?.trim();
  if (!raw) {
    return fallback;
  }
  const normalized = raw.toLowerCase().replace(/\s+/g, '_');
  if (normalized === 'heating' || normalized === 'heat') {
    return 'Riscaldamento';
  }
  if (normalized === 'cooling' || normalized === 'cool') {
    return 'Raffrescamento';
  }
  if (normalized === 'heat_cool' || normalized === 'auto' || normalized === 'automatic') {
    return 'Automatico';
  }
  if (normalized === 'dry' || normalized === 'drying' || normalized === 'dehumidify') {
    return 'Deumidifica';
  }
  if (normalized === 'fan' || normalized === 'fan_only' || normalized === 'ventilate') {
    return 'Ventilazione';
  }
  if (normalized === 'off') {
    return 'Spento';
  }
  if (normalized === 'idle') {
    return 'Inattivo';
  }
  if (normalized === 'unavailable') {
    return 'Non disponibile';
  }
  if (normalized === 'on') {
    return 'Acceso';
  }
  return raw;
}

const CLIMATE_LABEL_KEYS: Record<string, TranslationKey> = {
    Spento: 'controls.climate.label.off', Caldo: 'controls.climate.label.heat', Freddo: 'controls.climate.label.cool', Auto: 'controls.climate.label.auto', Ventola: 'controls.climate.label.fan', Dry: 'controls.climate.label.dry', Bassa: 'controls.climate.label.low', Media: 'controls.climate.label.medium', Alta: 'controls.climate.label.high', Turbo: 'controls.climate.label.turbo', Silenziosa: 'controls.climate.label.quiet', Nessuno: 'controls.climate.label.none', Eco: 'controls.climate.label.eco', Comfort: 'controls.climate.label.comfort', 'Fuori casa': 'controls.climate.label.away', Notte: 'controls.climate.label.night', Boost: 'controls.climate.label.boost', Casa: 'controls.climate.label.home', Attivita: 'controls.climate.label.activity', Ferma: 'controls.climate.label.stopped', Attiva: 'controls.climate.label.active', Verticale: 'controls.climate.label.vertical', Orizzontale: 'controls.climate.label.horizontal', Entrambe: 'controls.climate.label.both', Riscaldamento: 'controls.climate.label.heating', Raffrescamento: 'controls.climate.label.cooling', Automatico: 'controls.climate.label.automatic', Ventilazione: 'controls.climate.label.ventilation', Deumidifica: 'controls.climate.label.dry', Inattivo: 'controls.climate.label.inactive', 'Non disponibile': 'controls.climate.label.unavailable', Acceso: 'controls.common.on', Mode: 'controls.climate.mode', // i18n-audit-ignore: lookup keys are translated immediately below.
};

function localizeClimateLabel(t: ReturnType<typeof useI18n>['t'], label: string) {
  const key = CLIMATE_LABEL_KEYS[label];
  return key ? t(key) : label;
}

export function ClimateControlsPanel({
  climate,
  onTogglePower,
  onDecreaseTarget,
  onIncreaseTarget,
  onAutoAdjust,
  onRefreshCurrent,
  onSetTargetTemp,
  onSetTargetRange,
  onSetMode,
  onSetFanMode,
  onSetTargetHumidity,
  onSetPresetMode,
  onSetSwingMode,
  onSetSwingHorizontalMode,
  hideHeader = false,
  density = 'default',
}: ClimateControlsProps) {
  const { t } = useI18n();
  void onRefreshCurrent;

  const unit = climate.temperatureUnit?.trim() || '\u00B0C';
  const rawAttributes = climate.rawAttributes;
  const supportedFeatures =
    typeof climate.supportedFeatures === 'number'
      ? climate.supportedFeatures
      : toFiniteNumber(rawAttributes?.supported_features);
  const featureEnabled = (feature: number) =>
    supportedFeatures === undefined ? undefined : (supportedFeatures & feature) !== 0;

  const hvacModes = useMemo(() => {
    const source =
      Array.isArray(climate.hvacModes) && climate.hvacModes.length > 0
        ? climate.hvacModes
        : toStringArray(rawAttributes?.hvac_modes);
    return normalizeModes(source).filter((entry) => !['unknown', 'unavailable'].includes(entry));
  }, [climate.hvacModes, rawAttributes]);

  const fanModes = useMemo(
    () =>
      Array.isArray(climate.fanModes) && climate.fanModes.length > 0
        ? climate.fanModes
        : toStringArray(rawAttributes?.fan_modes),
    [climate.fanModes, rawAttributes],
  );
  const presetModes = useMemo(
    () =>
      Array.isArray(climate.presetModes) && climate.presetModes.length > 0
        ? climate.presetModes
        : toStringArray(rawAttributes?.preset_modes),
    [climate.presetModes, rawAttributes],
  );
  const swingModes = useMemo(
    () =>
      Array.isArray(climate.swingModes) && climate.swingModes.length > 0
        ? climate.swingModes
        : toStringArray(rawAttributes?.swing_modes),
    [climate.swingModes, rawAttributes],
  );
  const swingHorizontalModes = useMemo(
    () =>
      Array.isArray(climate.swingHorizontalModes) && climate.swingHorizontalModes.length > 0
        ? climate.swingHorizontalModes
        : toStringArray(rawAttributes?.swing_horizontal_modes),
    [climate.swingHorizontalModes, rawAttributes],
  );

  const mode = normalizeMode(climate.mode);
  const targetTemp = toFiniteNumber(climate.targetTemp);
  const targetLow = toFiniteNumber(climate.targetTempLow);
  const targetHigh = toFiniteNumber(climate.targetTempHigh);
  const hasRangeTarget = targetLow !== undefined && targetHigh !== undefined;
  const minTemp = toFiniteNumber(climate.minTemp);
  const maxTemp = toFiniteNumber(climate.maxTemp);
  const currentTemp = toPlausibleClimateTemperature(climate.currentTemp, minTemp, maxTemp);
  const step = toFiniteNumber(climate.targetTempStep) ?? 0.5;
  const activeFanMode = normalizeMode(climate.fanMode);
  const activePresetMode = normalizeMode(climate.presetMode ?? (typeof rawAttributes?.preset_mode === 'string' ? rawAttributes.preset_mode : undefined));
  const activeSwingMode = normalizeMode(climate.swingMode ?? (typeof rawAttributes?.swing_mode === 'string' ? rawAttributes.swing_mode : undefined));
  const activeSwingHorizontalMode = normalizeMode(
    climate.swingHorizontalMode ??
      (typeof rawAttributes?.swing_horizontal_mode === 'string' ? rawAttributes.swing_horizontal_mode : undefined),
  );
  const currentHumidity = toFiniteNumber(climate.currentHumidity) ?? toFiniteNumber(rawAttributes?.current_humidity);
  const targetHumidity = toFiniteNumber(climate.targetHumidity) ?? toFiniteNumber(rawAttributes?.humidity);
  const minHumidity = toFiniteNumber(climate.minHumidity) ?? toFiniteNumber(rawAttributes?.min_humidity) ?? 30;
  const maxHumidity = toFiniteNumber(climate.maxHumidity) ?? toFiniteNumber(rawAttributes?.max_humidity) ?? 99;
  const humidityStep = toFiniteNumber(climate.targetHumidityStep) ?? toFiniteNumber(rawAttributes?.target_humidity_step) ?? 1;
  const supportsTargetTemperature =
    climate.supportsTargetTemperature ??
    featureEnabled(CLIMATE_FEATURE_TARGET_TEMPERATURE) ??
    (targetTemp !== undefined);
  const supportsTargetTemperatureRange =
    climate.supportsTargetTemperatureRange ??
    featureEnabled(CLIMATE_FEATURE_TARGET_TEMPERATURE_RANGE) ??
    hasRangeTarget;
  const supportsTargetHumidity =
    climate.supportsTargetHumidity ??
    featureEnabled(CLIMATE_FEATURE_TARGET_HUMIDITY) ??
    (targetHumidity !== undefined);
  const supportsFanMode =
    climate.supportsFanMode ?? featureEnabled(CLIMATE_FEATURE_FAN_MODE) ?? (fanModes.length > 0);
  const supportsPresetMode =
    climate.supportsPresetMode ?? featureEnabled(CLIMATE_FEATURE_PRESET_MODE) ?? (presetModes.length > 0);
  const supportsSwingMode =
    climate.supportsSwingMode ?? featureEnabled(CLIMATE_FEATURE_SWING_MODE) ?? (swingModes.length > 0);
  const supportsSwingHorizontalMode =
    climate.supportsSwingHorizontalMode ??
    featureEnabled(CLIMATE_FEATURE_SWING_HORIZONTAL_MODE) ??
    (swingHorizontalModes.length > 0);
  const supportsTurnOn =
    climate.supportsTurnOn ?? featureEnabled(CLIMATE_FEATURE_TURN_ON) ?? hvacModes.some((entry) => entry !== 'off');
  const supportsTurnOff =
    climate.supportsTurnOff ?? featureEnabled(CLIMATE_FEATURE_TURN_OFF) ?? hvacModes.includes('off');
  const supportsPowerToggle = (supportsTurnOn || supportsTurnOff) && onTogglePower !== undefined;
  const targetPending = rawAttributes?.[CLIMATE_PENDING_TARGET_ATTRIBUTE_KEY] === true;
  const fanPending = rawAttributes?.[CLIMATE_PENDING_FAN_ATTRIBUTE_KEY] === true;
  const humidityPending = rawAttributes?.[CLIMATE_PENDING_HUMIDITY_ATTRIBUTE_KEY] === true;
  const presetPending = rawAttributes?.[CLIMATE_PENDING_PRESET_ATTRIBUTE_KEY] === true;
  const swingPending = rawAttributes?.[CLIMATE_PENDING_SWING_ATTRIBUTE_KEY] === true;
  const swingHorizontalPending = rawAttributes?.[CLIMATE_PENDING_SWING_HORIZONTAL_ATTRIBUTE_KEY] === true;

  const [localTarget, setLocalTarget] = useState<number | undefined>(targetTemp);
  const [localRange, setLocalRange] = useState<{ low: number; high: number } | null>(
    hasRangeTarget ? { low: targetLow, high: targetHigh } : null,
  );
  const [localTargetPending, setLocalTargetPending] = useState(false);
  const [localFanMode, setLocalFanMode] = useState(activeFanMode);
  const [localHumidity, setLocalHumidity] = useState<number | undefined>(targetHumidity);

  useEffect(() => {
    if (targetPending) {
      return;
    }
    if (localTargetPending) {
      if (
        targetTemp !== undefined &&
        localTarget !== undefined &&
        Math.abs(targetTemp - localTarget) <= Math.max(0.05, step / 2)
      ) {
        setLocalTargetPending(false);
      }
      return;
    }
    setLocalTarget(targetTemp);
  }, [localTarget, localTargetPending, step, targetPending, targetTemp]);

  useEffect(() => {
    if (targetPending) {
      return;
    }
    if (hasRangeTarget) {
      if (localTargetPending && localRange) {
        const lowMatches = Math.abs(targetLow - localRange.low) <= Math.max(0.05, step / 2);
        const highMatches = Math.abs(targetHigh - localRange.high) <= Math.max(0.05, step / 2);
        if (lowMatches && highMatches) {
          setLocalTargetPending(false);
        }
        return;
      }
      setLocalRange({ low: targetLow, high: targetHigh });
      return;
    }
    if (localTargetPending) {
      return;
    }
    setLocalRange(null);
  }, [hasRangeTarget, localRange, localTargetPending, step, targetHigh, targetLow, targetPending]);

  useEffect(() => {
    if (!localTargetPending) {
      return undefined;
    }
    const timeoutId = window.setTimeout(() => setLocalTargetPending(false), 3500);
    return () => window.clearTimeout(timeoutId);
  }, [localTargetPending]);

  useEffect(() => {
    setLocalFanMode(activeFanMode);
  }, [activeFanMode]);

  useEffect(() => {
    setLocalHumidity(targetHumidity);
  }, [targetHumidity]);

  const targetForProgress = localRange ? (localRange.low + localRange.high) / 2 : localTarget;
  const dialAccentColor = mode === 'heat' ? '#FF9F0A' : mode === 'cool' ? '#0A84FF' : '#32D74B';
  const dialGlowFilter =
    mode === 'heat'
      ? 'drop-shadow(0 0 15px rgba(255,159,10,0.4))'
      : mode === 'cool'
        ? 'drop-shadow(0 0 15px rgba(10,132,255,0.35))'
        : 'drop-shadow(0 0 10px rgba(50,215,75,0.26))';

  const translatedStatus = localizeClimateLabel(t, translateClimateStatus(
    climate.status ?? climate.hvacAction ?? climate.mode,
    formatModeLabel(mode),
  ));
  const isCompact = density === 'compact';
  const shellClass = isCompact
    ? 'flex flex-col gap-2 px-2.5 pt-2.5 pb-2.5 sm:gap-2.5 sm:px-3 sm:pt-3 sm:pb-3'
    : `${CONTEXT_PANEL_LAYOUT.shell} gap-3 sm:gap-4`;
  const sectionClass = isCompact
    ? 'liquid-glass-card rounded-[1.35rem] p-2.5 sm:p-3'
    : CONTEXT_PANEL_LAYOUT.sectionCompact;
  const dialSizeClass = isCompact
    ? 'max-w-[11.5rem] sm:max-w-[12rem] xl:max-w-[12.25rem]'
    : 'max-w-64';
  const targetValueClass = isCompact ? 'text-4xl sm:text-[2.5rem]' : 'text-5xl sm:text-6xl';
  const targetUnitClass = isCompact ? 'mt-1 text-base sm:text-lg' : 'mt-1.5 text-lg sm:text-xl';
  const currentTempClass = isCompact ? 'mt-1 text-xs' : 'mt-1.5 text-sm';
  const canUseCircularSlider =
    (supportsTargetTemperature || supportsTargetTemperatureRange) &&
    minTemp !== undefined &&
    maxTemp !== undefined &&
    maxTemp > minTemp;
  const isTargetPending = targetPending || localTargetPending;
  const applyPanelTargetValue = (value: number, commit: boolean) => {
    if (minTemp === undefined || maxTemp === undefined || maxTemp <= minTemp) {
      return;
    }
    const snappedValue = snapTemperatureToStep(clamp(value, minTemp, maxTemp), step, minTemp);
    setLocalTargetPending(true);
    if (localRange) {
      const rangeSize = Math.max(0, localRange.high - localRange.low);
      let low = snappedValue - rangeSize / 2;
      let high = snappedValue + rangeSize / 2;
      if (low < minTemp) {
        high = Math.min(maxTemp, high + (minTemp - low));
        low = minTemp;
      }
      if (high > maxTemp) {
        low = Math.max(minTemp, low - (high - maxTemp));
        high = maxTemp;
      }
      low = snapTemperatureToStep(clamp(low, minTemp, maxTemp), step, minTemp);
      high = snapTemperatureToStep(clamp(high, minTemp, maxTemp), step, minTemp);
      if (low > high) {
        [low, high] = [high, low];
      }
      setLocalRange({ low, high });
      if (commit) {
        onSetTargetRange?.(low, high);
      }
      return;
    }
    setLocalTarget(snappedValue);
    if (commit) {
      onSetTargetTemp?.(snappedValue);
    }
  };
  const updatePanelTargetByStep = (direction: -1 | 1) => {
    if (targetForProgress !== undefined && canUseCircularSlider) {
      applyPanelTargetValue(targetForProgress + direction * step, true);
      return;
    }
    if (direction < 0) {
      onDecreaseTarget();
      return;
    }
    onIncreaseTarget();
  };
  const applyHumidityValue = (value: number, commit = true) => {
    const safeStep = humidityStep > 0 ? humidityStep : 1;
    const safeMin = Math.min(minHumidity, maxHumidity);
    const safeMax = Math.max(minHumidity, maxHumidity);
    const nextValue = clamp(Math.round(value / safeStep) * safeStep, safeMin, safeMax);
    setLocalHumidity(nextValue);
    if (commit) {
      onSetTargetHumidity?.(nextValue);
    }
  };
  const updateHumidityByStep = (direction: -1 | 1) => {
    const safeStep = humidityStep > 0 ? humidityStep : 1;
    applyHumidityValue(humidityValue + direction * safeStep);
  };
  const renderIconSegmentedControl = (
    label: string,
    options: string[],
    activeValue: string,
    onSelect: ((value: string) => void) | undefined,
    getIcon: (value: string, className?: string) => React.ReactNode,
    formatLabel: (value: string) => string,
    isActiveOption?: (entry: string, activeValue: string) => boolean,
    trailingNode?: React.ReactNode,
    scrollable = false,
  ) =>
    options.length > 0
      ? (() => (
            <div className="min-w-0">
              <div className="mb-2 flex items-center justify-between gap-3 px-1">
                <span className="min-w-0 truncate text-xs font-semibold text-[color:var(--ui-text-tertiary)]">{label}</span>
                <span className="ml-auto max-w-[7.5rem] truncate text-xs font-semibold text-[color:var(--ui-text-secondary)]">
                  {localizeClimateLabel(t, formatLabel(activeValue)) || t('controls.climate.notSet')}
                </span>
                {trailingNode}
              </div>
              <GlassSegmentSelect
                ariaLabel={label}
                options={options.map((entry) => ({
                  value: entry,
                  label: getIcon(entry, 'h-4 w-4 sm:h-[1.05rem] sm:w-[1.05rem]'),
                  ariaLabel: localizeClimateLabel(t, formatLabel(entry)),
                  title: localizeClimateLabel(t, formatLabel(entry)),
                }))}
                value={options.find((entry) => {
                  const normalized = normalizeMode(entry);
                  return isActiveOption ? isActiveOption(normalized, activeValue) : normalized === activeValue;
                })}
                onChange={(entry) => onSelect?.(entry)}
                scrollable={scrollable}
                optionClassName="h-9 px-2 sm:h-10 sm:px-3"
              />
            </div>
          ))()
      : null;
  const hasSwingModeControl = supportsSwingMode && swingModes.length > 0;
  const hasSwingHorizontalControl = supportsSwingHorizontalMode && swingHorizontalModes.length > 0;
  const isSwingPending = swingPending || swingHorizontalPending;
  const humidityMin = Math.min(minHumidity, maxHumidity);
  const humidityMax = Math.max(minHumidity, maxHumidity);
  const humidityValue = clamp(localHumidity ?? targetHumidity ?? currentHumidity ?? humidityMin, humidityMin, humidityMax);
  const humidityPresetTargets = [30, 60, 75].filter((value) => value >= humidityMin && value <= humidityMax);
  const humidityPresetTolerance = Math.max(0.5, (humidityStep > 0 ? humidityStep : 1) / 2);
  const activeHumidityPreset = humidityPresetTargets.find((value) => Math.abs(humidityValue - value) <= humidityPresetTolerance);
  const primaryControl = resolveClimatePrimaryControl(mode, supportsTargetHumidity);
  const applyFanMode = (entry: string) => {
    setLocalFanMode(normalizeMode(entry));
    onSetFanMode?.(entry);
  };
  const climatePowerButton = supportsPowerToggle ? (
    <button
      type="button"
      onClick={onTogglePower}
      className={`glass-button flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-all active:scale-[0.97] sm:h-9 sm:w-9 ${
        climate.isOn
          ? 'liquid-glass-selection border-[color:var(--ui-border-strong)] text-[color:var(--ui-accent)]'
          : 'text-[color:var(--ui-text-secondary)] hover:text-[color:var(--ui-text-primary)]'
      }`}
      aria-label={climate.isOn ? t('controls.climate.turnOff') : t('controls.climate.turnOn')}
    >
      <Power size={15} />
    </button>
  ) : null;
  const renderHumidityPresets = () =>
    humidityPresetTargets.length > 0 ? (
      <div>
        <div className="mb-2 flex items-center justify-between gap-3 px-1">
          <span className="min-w-0 truncate text-xs font-semibold text-[color:var(--ui-text-tertiary)]">{t('controls.climate.quickTarget')}</span>
          <span className="ml-auto max-w-[7.5rem] truncate text-xs font-semibold text-[color:var(--ui-text-secondary)]">
            {activeHumidityPreset !== undefined ? `${Math.round(activeHumidityPreset)}%` : t('controls.climate.custom')}
          </span>
        </div>
        <GlassSegmentSelect
          ariaLabel={t('controls.climate.humidityQuickTarget')}
          options={humidityPresetTargets.map((value) => ({
            value,
            label: `${value}%`,
            ariaLabel: t('controls.climate.setHumidity', { value }),
          }))}
          value={activeHumidityPreset}
          onChange={(value) => applyHumidityValue(value)}
          optionClassName="h-9 sm:h-10"
        />
      </div>
    ) : null;
  const renderHumidityStepper = (showRangeLabel = true) => (
    <div>
      {showRangeLabel ? (
        <div className="mb-2 flex items-center justify-between gap-3 px-1">
          <span className="min-w-0 truncate text-xs font-semibold text-[color:var(--ui-text-tertiary)]">{t('controls.climate.custom')}</span>
          <span className="shrink-0 text-xs font-semibold text-[color:var(--ui-text-tertiary)]">
            {Math.round(humidityMin)}-{Math.round(humidityMax)}%
          </span>
        </div>
      ) : null}
      <div className="liquid-segmented-control">
        <div className="grid grid-cols-[2.7rem_minmax(0,1fr)_2.7rem] items-center gap-1 sm:grid-cols-[3rem_minmax(0,1fr)_3rem]">
          <button
            type="button"
            className="flex h-10 min-w-0 items-center justify-center rounded-full text-[color:var(--ui-text-secondary)] transition-all hover:bg-[color:var(--ui-fill-secondary)] hover:text-[color:var(--ui-text-primary)] active:scale-[0.95] sm:h-11"
            onClick={() => updateHumidityByStep(-1)}
            aria-label={t('controls.climate.decreaseHumidity')}
          >
            <Minus size={18} />
          </button>

          <div className="liquid-segmented-thumb flex h-10 min-w-0 items-center justify-center px-4 text-xs font-semibold sm:h-11">
            <span className="pointer-events-none">{Math.round(humidityValue)}%</span>
            <GlassSlider
              variant="overlay"
              className="absolute inset-0 h-full w-full cursor-pointer touch-none opacity-0"
              min={humidityMin}
              max={humidityMax}
              step={humidityStep > 0 ? humidityStep : 1}
              value={humidityValue}
              onChange={(event) => applyHumidityValue(Number(event.target.value))}
              aria-label={t('controls.climate.humidityTarget')}
              aria-valuetext={`${Math.round(humidityValue)}%`}
            />
          </div>

          <button
            type="button"
            className="flex h-10 min-w-0 items-center justify-center rounded-full text-[color:var(--ui-text-secondary)] transition-all hover:bg-[color:var(--ui-fill-secondary)] hover:text-[color:var(--ui-text-primary)] active:scale-[0.95] sm:h-11"
            onClick={() => updateHumidityByStep(1)}
            aria-label={t('controls.climate.increaseHumidity')}
          >
            <Plus size={18} />
          </button>
        </div>
      </div>
    </div>
  );
  return (
    <div className={shellClass}>
      {!hideHeader ? (
        <ContextPanelHeader title={climate.name} subtitle={translatedStatus} icon={modeIcon(mode, 20)} fallbackTitle={t('controls.climate.title')} />
      ) : null}

      <div className={sectionClass}>
        {primaryControl === 'temperature' ? (
          <>
            <CircularTemperatureSlider
              value={targetForProgress}
              min={minTemp}
              max={maxTemp}
              step={step}
              unit={unit}
              accentColor={dialAccentColor}
              glowFilter={dialGlowFilter}
              pending={isTargetPending}
              disabled={!canUseCircularSlider}
              className={`mx-auto w-full ${dialSizeClass}`}
              onChange={(value) => applyPanelTargetValue(value, false)}
              onCommit={(value) => applyPanelTargetValue(value, true)}
            >
              <div
                className={`flex h-[72%] w-[72%] flex-col items-center justify-center rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-secondary)] px-3 text-center ${
                  mode === 'heat' ? 'glow-active-orange' : mode === 'cool' ? 'glow-active-blue' : mode === 'auto' || mode === 'heat_cool' ? 'glow-active-green' : 'shadow-lg'
                }`}
              >
                <div className="flex items-start">
                  <span className={`${targetValueClass} font-light leading-none tracking-tight transition-colors duration-200 ${isTargetPending ? 'text-[color:var(--ui-text-disabled)]' : 'text-[color:var(--ui-text-primary)]'}`}>
                    {localRange
                      ? `${Math.round(localRange.low)}-${Math.round(localRange.high)}`
                      : localTarget !== undefined
                        ? localTarget.toFixed(1)
                        : '--'}
                  </span>
                  <span className={`${targetUnitClass} transition-colors duration-200 ${isTargetPending ? 'text-[color:var(--ui-text-disabled)]' : 'text-[color:var(--ui-text-secondary)]'}`}>{unit}</span>
                </div>
                <p className={`${currentTempClass} text-[color:var(--ui-text-tertiary)]`}>
                  {currentTemp !== undefined ? t('controls.climate.current', { value: `${currentTemp.toFixed(1)}${unit}` }) : t('controls.climate.currentUnavailable')}
                </p>
              </div>
            </CircularTemperatureSlider>

            {canUseCircularSlider ? (
              <div className={`liquid-segmented-control ${isCompact ? 'mt-1' : 'mt-1.5'}`}>
                <div className="grid grid-cols-[2.7rem_minmax(0,1fr)_2.7rem] items-center gap-1 sm:grid-cols-[3rem_minmax(0,1fr)_3rem]">
                  <button
                    type="button"
                    className="flex h-10 min-w-0 items-center justify-center rounded-full text-[color:var(--ui-text-secondary)] transition-all hover:bg-[color:var(--ui-fill-secondary)] hover:text-[color:var(--ui-text-primary)] active:scale-[0.95] sm:h-11"
                    onClick={() => updatePanelTargetByStep(-1)}
                    aria-label={t('controls.climate.decreaseTemperature')}
                  >
                    <Minus size={18} />
                  </button>

                  <button
                    type="button"
                    className="liquid-segmented-thumb flex h-10 min-w-0 items-center justify-center px-4 text-xs font-semibold active:scale-[0.98] sm:h-11"
                    onClick={() => {
                      if (currentTemp !== undefined) {
                        applyPanelTargetValue(currentTemp, true);
                        return;
                      }
                      onAutoAdjust();
                    }}
                  >
                    {t('controls.climate.align')}
                  </button>

                  <button
                    type="button"
                    className="flex h-10 min-w-0 items-center justify-center rounded-full text-[color:var(--ui-text-secondary)] transition-all hover:bg-[color:var(--ui-fill-secondary)] hover:text-[color:var(--ui-text-primary)] active:scale-[0.95] sm:h-11"
                    onClick={() => updatePanelTargetByStep(1)}
                    aria-label={t('controls.climate.increaseTemperature')}
                  >
                    <Plus size={18} />
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {primaryControl === 'humidity' ? (
          <>
            <CircularTemperatureSlider
              value={humidityValue}
              min={humidityMin}
              max={humidityMax}
              step={humidityStep > 0 ? humidityStep : 1}
              unit="%"
              label={t('controls.climate.humidityTarget')}
              accentColor="#64D2FF"
              glowFilter="drop-shadow(0 0 14px rgba(100,210,255,0.34))"
              pending={humidityPending}
              disabled={!supportsTargetHumidity || humidityMax <= humidityMin}
              className={`mx-auto w-full ${dialSizeClass}`}
              onChange={(value) => applyHumidityValue(value, false)}
              onCommit={(value) => applyHumidityValue(value)}
            >
              <div className="flex h-[72%] w-[72%] flex-col items-center justify-center rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-secondary)] px-3 text-center shadow-[0_16px_35px_rgba(100,210,255,0.08)]">
                <div className="flex items-start">
                  <span className={`${targetValueClass} font-light leading-none text-[color:var(--ui-text-primary)] transition-colors duration-200 ${humidityPending ? 'opacity-60' : ''}`}>
                    {Math.round(humidityValue)}
                  </span>
                  <span className={`${targetUnitClass} text-[color:var(--ui-text-secondary)]`}>%</span>
                </div>
                <p className={`${currentTempClass} text-[color:var(--ui-text-tertiary)]`}>
                  {currentHumidity !== undefined ? t('controls.climate.current', { value: `${Math.round(currentHumidity)}%` }) : t('controls.climate.currentUnavailable')}
                </p>
              </div>
            </CircularTemperatureSlider>
            <div className={isCompact ? 'mt-1' : 'mt-1.5'}>{renderHumidityStepper(false)}</div>
            <div className="mt-3">{renderHumidityPresets()}</div>
          </>
        ) : null}

        {primaryControl === 'fan' ? (
          <>
            <div className={`relative mx-auto flex aspect-square w-full items-center justify-center ${dialSizeClass}`}>
              <div className="absolute inset-[6%] rounded-full border-[0.7rem] border-[color:var(--ui-border)] shadow-[inset_0_1px_0_rgb(var(--ui-accent-rgb)/0.08),0_18px_45px_var(--ui-shadow-soft)]" />
              <div className="flex h-[72%] w-[72%] flex-col items-center justify-center rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-secondary)] px-4 text-center shadow-[0_18px_40px_var(--ui-shadow-soft)]">
                <Fan className="mb-3 h-9 w-9 text-[color:var(--ui-text-secondary)]" strokeWidth={1.6} />
                <span className="max-w-full truncate text-lg font-semibold text-[color:var(--ui-text-primary)]">
                  {localFanMode ? localizeClimateLabel(t, fanActionLabel(localFanMode)) : t('controls.climate.fan')}
                </span>
                <p className={`${currentTempClass} text-[color:var(--ui-text-tertiary)]`}>
                  {fanPending ? t('controls.climate.updating') : t('controls.climate.fanSpeed')}
                </p>
              </div>
            </div>
            {supportsFanMode && fanModes.length > 0 ? (
              <div className={isCompact ? 'mt-1' : 'mt-1.5'}>
                {renderIconSegmentedControl(
                  t('controls.climate.fan'),
                  fanModes,
                  localFanMode,
                  applyFanMode,
                  fanActionIcon,
                  (value) => localizeClimateLabel(t, fanActionLabel(value)),
                  undefined,
                  fanPending ? <span className="text-xs font-semibold text-[color:var(--ui-text-tertiary)]">{t('controls.climate.updating')}</span> : null,
                  fanModes.length > 4,
                )}
              </div>
            ) : null}
          </>
        ) : null}

        {primaryControl === 'dry-status' ? (
          <div className={`relative mx-auto flex aspect-square w-full items-center justify-center ${dialSizeClass}`}>
            <div className="absolute inset-[6%] rounded-full border-[0.7rem] border-[#64D2FF]/12 shadow-[0_16px_38px_rgba(100,210,255,0.06)]" />
            <div className="flex h-[72%] w-[72%] flex-col items-center justify-center rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-secondary)] px-4 text-center">
              <Droplets className="mb-3 h-9 w-9 text-[#64D2FF]/78" strokeWidth={1.6} />
              <span className="text-lg font-semibold text-[color:var(--ui-text-primary)]">{t('controls.climate.dehumidify')}</span>
              <p className={`${currentTempClass} text-[color:var(--ui-text-tertiary)]`}>
                {currentHumidity !== undefined ? t('controls.climate.humidity', { value: Math.round(currentHumidity) }) : t('controls.climate.targetUnavailable')}
              </p>
            </div>
          </div>
        ) : null}

        {primaryControl === 'off' ? (
          <div className={`relative mx-auto flex aspect-square w-full items-center justify-center ${dialSizeClass}`}>
            <div className="absolute inset-[6%] rounded-full border-[0.7rem] border-[color:var(--ui-border)]" />
            <div className="flex h-[72%] w-[72%] flex-col items-center justify-center rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-secondary)] px-4 text-center">
              <Power className="mb-3 h-9 w-9 text-[color:var(--ui-text-tertiary)]" strokeWidth={1.5} />
              <span className="text-lg font-semibold text-[color:var(--ui-text-primary)]">{t('controls.climate.label.off')}</span>
              <p className={`${currentTempClass} text-[color:var(--ui-text-tertiary)]`}>
                {currentTemp !== undefined ? t('controls.climate.room', { value: `${currentTemp.toFixed(1)}${unit}` }) : t('controls.climate.inactive')}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {hvacModes.length > 0 || supportsPowerToggle ? (
        <div className={sectionClass}>
          {hvacModes.length > 0 ? (
            renderIconSegmentedControl(
              t('controls.climate.mode'),
              hvacModes,
              mode,
              onSetMode,
              modeSegmentIcon,
              (value) => localizeClimateLabel(t, modeActionChipLabel(value)),
              isEquivalentClimateMode,
            )
          ) : (
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-xs font-semibold text-[color:var(--ui-text-tertiary)]">{t('controls.climate.power')}</span>
              {climatePowerButton}
            </div>
          )}
        </div>
      ) : null}

      {supportsFanMode && fanModes.length > 0 && primaryControl !== 'fan' && primaryControl !== 'off' ? (
        <div className={sectionClass}>
          {renderIconSegmentedControl(
            t('controls.climate.fan'),
            fanModes,
            localFanMode,
            applyFanMode,
            fanActionIcon,
            (value) => localizeClimateLabel(t, fanActionLabel(value)),
            undefined,
            fanPending ? <span className="text-xs font-semibold text-[color:var(--ui-text-tertiary)]">{t('controls.climate.updating')}</span> : null,
            fanModes.length > 4,
          )}
        </div>
      ) : null}

      {supportsPresetMode && presetModes.length > 0 && primaryControl !== 'off' ? (
        <div className={sectionClass}>
          {renderIconSegmentedControl(
            t('controls.climate.preset'),
            presetModes,
            activePresetMode,
            onSetPresetMode,
            presetActionIcon,
            (value) => localizeClimateLabel(t, presetActionLabel(value)),
          )}
        </div>
      ) : null}

      {(hasSwingModeControl || hasSwingHorizontalControl) && primaryControl !== 'off' ? (
        <div className={`${sectionClass} space-y-4`}>
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex min-w-0 items-center gap-2 text-sm font-medium text-[color:var(--ui-text-primary)]">
              <Wind size={15} className="text-[#64D2FF]" />
              {t('controls.climate.swing')}
            </span>
            {isSwingPending ? <span className="text-xs font-semibold text-[color:var(--ui-text-tertiary)]">{t('controls.climate.updating')}</span> : null}
          </div>
          {hasSwingModeControl
            ? renderIconSegmentedControl(
                t('controls.climate.direction'),
                swingModes,
                activeSwingMode,
                onSetSwingMode,
                swingDirectionIcon,
                (value) => localizeClimateLabel(t, swingActionLabel(value)),
              )
            : null}
          {hasSwingHorizontalControl
            ? renderIconSegmentedControl(
                hasSwingModeControl ? t('controls.climate.horizontalLouvers') : t('controls.climate.horizontal'),
                swingHorizontalModes,
                activeSwingHorizontalMode,
                onSetSwingHorizontalMode,
                swingHorizontalIcon,
                (value) => localizeClimateLabel(t, swingActionLabel(value)),
              )
            : null}
        </div>
      ) : null}
    </div>
  );
}

export const ClimateControls = ClimateControlsPanel;

export function RoomClimateCard({
  climate,
  onDecreaseTarget,
  onIncreaseTarget,
  onAutoAdjust,
  onRefreshCurrent,
  onSetTargetTemp,
  onSetTargetRange,
  onSetMode,
  onSetFanMode,
}: ClimateControlsProps) {
  void onAutoAdjust;
  void onRefreshCurrent;
  const { t } = useI18n();

  const unit = climate.temperatureUnit?.trim() || '\u00B0C';
  const rawAttributes = climate.rawAttributes;
  const hvacModes = useMemo(() => {
    const source =
      Array.isArray(climate.hvacModes) && climate.hvacModes.length > 0
        ? climate.hvacModes
        : toStringArray(rawAttributes?.hvac_modes);
    return normalizeModes(source);
  }, [climate.hvacModes, rawAttributes]);
  const fanModes = useMemo(
    () =>
      Array.isArray(climate.fanModes) && climate.fanModes.length > 0
        ? climate.fanModes
        : toStringArray(rawAttributes?.fan_modes),
    [climate.fanModes, rawAttributes],
  );
  const mode = normalizeMode(climate.mode);
  const fanMode = normalizeMode(climate.fanMode ?? (typeof rawAttributes?.fan_mode === 'string' ? rawAttributes.fan_mode : undefined));
  const targetTemp = toFiniteNumber(climate.targetTemp);
  const targetLow = toFiniteNumber(climate.targetTempLow);
  const targetHigh = toFiniteNumber(climate.targetTempHigh);
  const hasRangeTarget = targetLow !== undefined && targetHigh !== undefined;
  const minTemp = toFiniteNumber(climate.minTemp);
  const maxTemp = toFiniteNumber(climate.maxTemp);
  const currentTemp = toPlausibleClimateTemperature(climate.currentTemp, minTemp, maxTemp);
  const step = toFiniteNumber(climate.targetTempStep) ?? 0.5;
  const targetPending = rawAttributes?.[CLIMATE_PENDING_TARGET_ATTRIBUTE_KEY] === true;

  const [localTarget, setLocalTarget] = useState<number | undefined>(targetTemp);
  const [localRange, setLocalRange] = useState<{ low: number; high: number } | null>(
    hasRangeTarget ? { low: targetLow, high: targetHigh } : null,
  );
  const [localTargetPending, setLocalTargetPending] = useState(false);

  useEffect(() => {
    setLocalTarget(targetTemp);
    setLocalTargetPending(false);
  }, [targetTemp]);

  useEffect(() => {
    if (hasRangeTarget) {
      setLocalRange({ low: targetLow, high: targetHigh });
      setLocalTargetPending(false);
      return;
    }
    setLocalRange(null);
    setLocalTargetPending(false);
  }, [hasRangeTarget, targetHigh, targetLow]);

  useEffect(() => {
    if (!localTargetPending) {
      return undefined;
    }
    const timeoutId = window.setTimeout(() => setLocalTargetPending(false), 3500);
    return () => window.clearTimeout(timeoutId);
  }, [localTargetPending]);

  const targetForProgress = localRange ? (localRange.low + localRange.high) / 2 : localTarget;
  const dialAccentColor = mode === 'heat' ? '#FF9F0A' : mode === 'cool' ? '#0A84FF' : '#32D74B';
  const dialGlowFilter =
    mode === 'heat'
      ? 'drop-shadow(0 0 15px rgba(255,159,10,0.4))'
      : mode === 'cool'
        ? 'drop-shadow(0 0 15px rgba(10,132,255,0.35))'
        : 'drop-shadow(0 0 10px rgba(50,215,75,0.26))';
  const translatedStatus = localizeClimateLabel(t, translateClimateStatus(
    climate.status ?? climate.hvacAction ?? climate.mode,
    formatModeLabel(mode),
  ));
  const hvacActions = useMemo<RoomClimateAction[]>(
    () =>
      hvacModes
        .filter((entry) => !['unavailable', 'unknown'].includes(normalizeMode(entry)))
        .map((entry) => {
          const normalized = normalizeMode(entry);
          return {
            id: `hvac:${normalized}`,
            value: entry,
            label: localizeClimateLabel(t, modeActionChipLabel(normalized)),
            icon: modeSelectorIcon(normalized, 18),
            active: isEquivalentClimateMode(mode, normalized),
            iconClassName: modeAccentIconClass(normalized),
          };
        }),
    [hvacModes, mode, t],
  );
  const fanActions = useMemo<RoomClimateAction[]>(
    () =>
      fanModes
        .map((entry) => ({ entry, normalized: normalizeMode(entry) }))
        .filter(({ normalized }) => Boolean(normalized) && !['unknown', 'unavailable'].includes(normalized))
        .map(({ entry, normalized }) => ({
          id: `fan:${normalized}`,
          value: entry,
          label: localizeClimateLabel(t, fanActionLabel(entry)),
          icon: <Wind size={18} />,
          active: fanMode === normalized,
          iconClassName: 'text-[#64D2FF]',
        })),
    [fanMode, fanModes, t],
  );
  const targetValue = localRange
    ? `${Math.round(localRange.low)}-${Math.round(localRange.high)}`
    : localTarget !== undefined
      ? `${Number.isInteger(localTarget) ? Math.round(localTarget) : localTarget.toFixed(1)}`
      : '--';
  const displayUnit = unit.includes('\u00B0') ? '\u00B0' : unit;
  const canUseCircularSlider = minTemp !== undefined && maxTemp !== undefined && maxTemp > minTemp;
  const isTargetPending = targetPending || localTargetPending;

  const applyTargetValue = (value: number, commit: boolean) => {
    if (minTemp === undefined || maxTemp === undefined || maxTemp <= minTemp) {
      return;
    }
    const snappedValue = snapTemperatureToStep(clamp(value, minTemp, maxTemp), step, minTemp);
    setLocalTargetPending(true);
    if (localRange) {
      const rangeSize = Math.max(0, localRange.high - localRange.low);
      let low = snappedValue - rangeSize / 2;
      let high = snappedValue + rangeSize / 2;
      if (low < minTemp) {
        high = Math.min(maxTemp, high + (minTemp - low));
        low = minTemp;
      }
      if (high > maxTemp) {
        low = Math.max(minTemp, low - (high - maxTemp));
        high = maxTemp;
      }
      low = snapTemperatureToStep(clamp(low, minTemp, maxTemp), step, minTemp);
      high = snapTemperatureToStep(clamp(high, minTemp, maxTemp), step, minTemp);
      if (low > high) {
        [low, high] = [high, low];
      }
      setLocalRange({ low, high });
      if (commit) {
        onSetTargetRange?.(low, high);
      }
      return;
    }
    setLocalTarget(snappedValue);
    if (commit) {
      onSetTargetTemp?.(snappedValue);
    }
  };

  const updateTargetByStep = (direction: -1 | 1) => {
    if (targetForProgress !== undefined && canUseCircularSlider) {
      applyTargetValue(targetForProgress + direction * step, true);
      return;
    }
    if (direction < 0) {
      onDecreaseTarget();
      return;
    }
    onIncreaseTarget();
  };
  const renderActionRail = (
    label: string,
    actions: RoomClimateAction[],
    onSelect: ((value: string) => void) | undefined,
  ) =>
    actions.length > 0 ? (
      <div className="flex w-full min-w-0 flex-col gap-2 [@container_(min-width:_19rem)]:flex-row [@container_(min-width:_19rem)]:items-center [@container_(min-width:_19rem)]:justify-between">
        <p className="shrink-0 text-xs font-semibold tracking-tight text-[color:var(--ui-text-secondary)]">{label}</p>
        <GlassSegmentSelect
          ariaLabel={label}
          className="[@container_(min-width:_19rem)]:flex-1"
          options={actions.map((action) => ({
            value: action.value,
            label: /^[0-9]+$/.test(action.label)
              ? <span className="min-w-4 text-center text-xs font-bold tracking-tight">{action.label}</span>
              : <span>{action.icon}</span>,
            ariaLabel: t('controls.climate.setAction', { action: action.label }),
            title: action.label,
          }))}
          value={actions.find((action) => action.active)?.value}
          onChange={(value) => onSelect?.(value)}
          optionClassName="h-9 px-2"
        />
      </div>
    ) : null;

  return (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden rounded-[inherit] px-[clamp(0.85rem,5cqw,1.25rem)] pb-[clamp(0.85rem,3.4cqh,1.25rem)] pt-[clamp(1rem,3.8cqh,1.35rem)]">
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="line-clamp-2 text-[clamp(0.92rem,4.8cqw,1.05rem)] font-semibold leading-[1.12] tracking-tight text-[color:var(--ui-text-primary)]">
            {climate.name || t('controls.climate.thermostat')}
          </h2>
          <p className="mt-1 truncate text-xs font-medium text-[color:var(--ui-text-secondary)]">{translatedStatus}</p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-0 py-[clamp(0.35rem,1.4cqh,0.75rem)]">
        <CircularTemperatureSlider
          value={targetForProgress}
          min={minTemp}
          max={maxTemp}
          step={step}
          unit={unit}
          accentColor={dialAccentColor}
          glowFilter={dialGlowFilter}
          pending={isTargetPending}
          disabled={!canUseCircularSlider}
          className="mx-auto w-full max-w-[min(17rem,92cqw,52cqh)]"
          onChange={(value) => applyTargetValue(value, false)}
          onCommit={(value) => applyTargetValue(value, true)}
        >
          <div className="flex h-[63%] w-[63%] flex-col items-center justify-center rounded-full bg-[color:var(--ui-fill-tertiary)] px-2 text-center backdrop-blur-md">
            <div className="flex items-start">
              <span className={`text-[clamp(2.2rem,15cqw,3.08rem)] font-light leading-none tracking-tight transition-colors duration-200 ${isTargetPending ? 'text-[color:var(--ui-text-secondary)]' : 'text-[color:var(--ui-text-primary)]'}`}>
                {targetValue}
              </span>
              <span className={`mt-[0.3em] text-[clamp(0.88rem,5.2cqw,1.25rem)] transition-colors duration-200 ${isTargetPending ? 'text-[color:var(--ui-text-tertiary)]' : 'text-[color:var(--ui-text-secondary)]'}`}>{displayUnit}</span>
            </div>
            <p className="mt-1 max-w-full truncate text-[clamp(0.62rem,3.4cqw,0.75rem)] font-semibold tracking-tight text-[color:var(--ui-text-tertiary)]">
              {currentTemp !== undefined ? t('controls.climate.current', { value: `${currentTemp.toFixed(1)}${unit}` }) : t('controls.climate.currentUnavailable')}
            </p>
          </div>
        </CircularTemperatureSlider>

        <div className="-mt-[clamp(0.6rem,2.1cqh,1.05rem)] flex items-center justify-center gap-3">
          <GlassButton
            size="icon"
            className="h-10 w-10 rounded-full border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)] hover:bg-[color:var(--ui-fill-secondary)] hover:text-[color:var(--ui-text-primary)]"
            onClick={() => updateTargetByStep(-1)}
            aria-label={t('controls.climate.decreaseTemperature')}
          >
            <Minus size={18} />
          </GlassButton>
          <GlassButton
            size="icon"
            className="h-10 w-10 rounded-full border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)] hover:bg-[color:var(--ui-fill-secondary)] hover:text-[color:var(--ui-text-primary)]"
            onClick={() => updateTargetByStep(1)}
            aria-label={t('controls.climate.increaseTemperature')}
          >
            <Plus size={18} />
          </GlassButton>
        </div>
      </div>

      {hvacActions.length > 0 || fanActions.length > 0 ? (
        <div className="mt-[clamp(0.1rem,0.55cqh,0.35rem)] shrink-0 rounded-[1.35rem] border border-white/[0.06] bg-white/[0.035] p-[clamp(0.65rem,3.2cqw,0.85rem)] shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_18px_42px_rgba(0,0,0,0.14)] backdrop-blur-2xl">
          {renderActionRail(t('controls.climate.mode'), hvacActions, onSetMode)}
          {hvacActions.length > 0 && fanActions.length > 0 ? <div className="my-2 h-px w-full bg-white/[0.055]" /> : null}
          {renderActionRail(t('controls.climate.label.ventilation'), fanActions, onSetFanMode)}
        </div>
      ) : null}
    </div>
  );
}
