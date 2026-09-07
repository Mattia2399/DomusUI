import React, { useEffect, useState } from 'react';
import { Droplets, Fan, Flame, Minus, Plus, Power, Snowflake, Sparkles, Wind, X } from 'lucide-react';
import type { DashboardStateShape } from '../../hooks/useDashboardState';
import { useObservedElementSize } from '../../hooks/useObservedElementSize';
import type { Widget } from '../../types/dashboardModels';
import type { MockEntityState } from '../../types/ha';
import type { GridEngineBreakpoint } from '../dashboard/dashboardBreakpointConfig';
import { useI18n } from '../../i18n/I18nProvider';
import {
  CLIMATE_FEATURE_TARGET_HUMIDITY,
  climateFeatureEnabled,
  resolveClimatePrimaryControl,
} from './climateCardModel';
import {
  resolveClimatePixelDisplayVariant,
  resolveWidgetDisplayVariant,
  type WidgetDisplayMetrics,
  type WidgetDisplayVariant,
} from './widgetDisplayVariant';

type ClimateCardProps = {
  widget: Widget;
  state: DashboardStateShape;
  isSelected: boolean;
  isEditMode: boolean;
  onClick: () => void;
  liveEntity?: MockEntityState;
  onTemperatureChange?: (nextTemp: number) => void;
  onTargetRangeChange?: (low: number, high: number) => void;
  onTargetHumidityChange?: (nextHumidity: number) => void;
  onPowerToggle?: () => void;
  onModeChange?: (nextMode: string) => void;
  onFanModeChange?: (nextMode: string) => void;
  onPresetModeChange?: (nextMode: string) => void;
  onSwingModeChange?: (nextMode: string) => void;
  onSwingHorizontalModeChange?: (nextMode: string) => void;
  gridBreakpoint?: GridEngineBreakpoint;
  displayVariant?: WidgetDisplayVariant;
  onDisplayMetricsChange?: (metrics: WidgetDisplayMetrics) => void;
};

const CLIMATE_PENDING_TARGET_ATTRIBUTE_KEY = '__dashboard_pending_climate_target';
const CLIMATE_PENDING_FAN_ATTRIBUTE_KEY = '__dashboard_pending_climate_fan';
const CLIMATE_PENDING_HUMIDITY_ATTRIBUTE_KEY = '__dashboard_pending_climate_humidity';

type ClimateSurface = {
  gradient: string;
  border: string;
  glow: string;
  iconSurface: string;
  controlSurface: string;
  fanAccent: string;
};

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

function toTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
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

function normalizeMode(value: string | undefined) {
  return (value ?? '').trim().toLowerCase();
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

function toRgba(color: string, alpha: number) {
  const normalized = color.trim();
  const clampedAlpha = Math.max(0, Math.min(1, alpha));
  const shortHex = /^#([0-9a-f]{3})$/i;
  const longHex = /^#([0-9a-f]{6})$/i;
  if (shortHex.test(normalized)) {
    const [, hex] = normalized.match(shortHex)!;
    const r = Number.parseInt(`${hex[0]}${hex[0]}`, 16);
    const g = Number.parseInt(`${hex[1]}${hex[1]}`, 16);
    const b = Number.parseInt(`${hex[2]}${hex[2]}`, 16);
    return `rgba(${r}, ${g}, ${b}, ${clampedAlpha})`;
  }
  if (longHex.test(normalized)) {
    const [, hex] = normalized.match(longHex)!;
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${clampedAlpha})`;
  }
  return normalized;
}

function formatFanModeLabel(mode: string) {
  if (mode === 'auto') {
    return 'Auto';
  }
  if (mode === 'quiet') {
    return 'Quiet';
  }
  if (mode === 'turbo') {
    return 'Turbo';
  }
  if (mode === 'low') {
    return 'Low';
  }
  if (mode === 'medium' || mode === 'med') {
    return 'Med';
  }
  if (mode === 'high') {
    return 'High';
  }
  if (mode === 'on') {
    return 'On';
  }
  if (mode === 'off') {
    return 'Off';
  }
  return mode.length ? mode.toUpperCase() : '--';
}

function resolveNextClimateOption(modes: string[], currentMode: string) {
  if (modes.length === 0) return '';
  const currentIndex = modes.findIndex((mode) => normalizeMode(mode) === normalizeMode(currentMode));
  return modes[(currentIndex + 1 + modes.length) % modes.length] ?? modes[0] ?? '';
}

function toCanonicalClimateMode(value: string | undefined) {
  const normalized = (value ?? '').trim().toLowerCase().replace(/\s+/g, '_');
  if (!normalized) {
    return '';
  }
  if (normalized === 'heating' || normalized === 'heat') {
    return 'heat';
  }
  if (normalized === 'cooling' || normalized === 'cool') {
    return 'cool';
  }
  if (normalized === 'drying' || normalized === 'dry') {
    return 'dry';
  }
  if (normalized === 'fan' || normalized === 'fan_only') {
    return 'fan_only';
  }
  if (normalized === 'heat_cool') {
    return 'heat_cool';
  }
  if (normalized === 'auto') {
    return 'auto';
  }
  if (normalized === 'off' || normalized === 'unavailable') {
    return 'off';
  }
  if (normalized === 'on') {
    return 'auto';
  }
  return normalized;
}

function isEquivalentMode(currentMode: string, candidateMode: string) {
  if (currentMode === candidateMode) {
    return true;
  }
  return (
    (currentMode === 'auto' && candidateMode === 'heat_cool') ||
    (currentMode === 'heat_cool' && candidateMode === 'auto')
  );
}

function resolveActiveMode(entity: MockEntityState | undefined, widget: Widget, state: DashboardStateShape) {
  const isDemoClimate = !entity && widget.dataSource === 'mock' && widget.entityId === 'climate.air_conditioner';
  const fallbackFromState =
    isDemoClimate
      ? toCanonicalClimateMode(state.climate.mode)
      : '';
  const fallbackFromWidget = toCanonicalClimateMode(widget.status);

  // Demo widget: mode selection in builder should immediately drive the card surface.
  if (isDemoClimate && fallbackFromState) {
    return fallbackFromState;
  }

  const rawAttributes = entity?.rawAttributes;
  const hvacMode =
    (typeof entity?.hvacMode === 'string' ? entity.hvacMode : undefined) ??
    (typeof rawAttributes?.hvac_mode === 'string' ? rawAttributes.hvac_mode : undefined) ??
    (typeof entity?.state === 'string' ? entity.state : undefined) ??
    '';
  const hvacAction =
    (typeof entity?.hvacAction === 'string' ? entity.hvacAction : undefined) ??
    (typeof rawAttributes?.hvac_action === 'string' ? rawAttributes.hvac_action : undefined) ??
    '';

  const mode = toCanonicalClimateMode(hvacMode);
  const action = toCanonicalClimateMode(hvacAction);

  if (mode === 'off') {
    return 'off';
  }
  if (action === 'heat') {
    return 'heat';
  }
  if (action === 'cool') {
    return 'cool';
  }
  if (action === 'dry') {
    return 'dry';
  }
  if (action === 'fan_only') {
    return 'fan_only';
  }
  if (mode) {
    return mode;
  }
  return fallbackFromState || fallbackFromWidget || (widget.isOn ? 'auto' : 'off');
}

function modeToLabel(mode: string) {
  if (mode === 'heat') {
    return 'Riscaldamento';
  }
  if (mode === 'cool') {
    return 'Raffrescamento';
  }
  if (mode === 'heat_cool' || mode === 'auto') {
    return 'Automatico';
  }
  if (mode === 'dry') {
    return 'Deumidifica';
  }
  if (mode === 'fan_only') {
    return 'Ventilazione';
  }
  if (mode === 'off') {
    return 'Spento';
  }
  return 'Inattivo';
}

function modeChipLabel(mode: string) {
  if (mode === 'heat') {
    return 'Caldo';
  }
  if (mode === 'cool') {
    return 'Freddo';
  }
  if (mode === 'heat_cool' || mode === 'auto') {
    return 'Auto';
  }
  if (mode === 'dry') {
    return 'Dry';
  }
  if (mode === 'fan_only') {
    return 'Fan';
  }
  if (mode === 'off') {
    return 'Off';
  }
  return mode.length ? mode.replace(/[_-]+/g, ' ') : 'Mode';
}

function modeControlIcon(mode: string, size: number) {
  if (mode === 'heat') {
    return <Flame size={size} />;
  }
  if (mode === 'cool') {
    return <Snowflake size={size} />;
  }
  if (mode === 'heat_cool' || mode === 'auto') {
    return <Sparkles size={size} />;
  }
  if (mode === 'dry') {
    return <Droplets size={size} />;
  }
  if (mode === 'off') {
    return <Power size={size} />;
  }
  return <Wind size={size} />;
}

function translateClimateStatus(status: string | undefined, fallback: string) {
  const raw = toTrimmedString(status);
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

function modeToSurface(mode: string): ClimateSurface {
  if (mode === 'heat') {
    return {
      gradient: 'from-[#E97822] via-[#A9451E] to-[#44261E]',
      border: 'border-[#FF9F0A]/50',
      glow: 'shadow-[0_0_28px_rgba(255,159,10,0.42),inset_0_1px_0_rgba(255,255,255,0.24)]',
      iconSurface: 'bg-[#FF9F0A]/16 border border-[#FF9F0A]/36',
      controlSurface: 'border border-white/[0.10] bg-white/[0.08] text-white backdrop-blur-xl hover:bg-white/[0.13]',
      fanAccent: '#FF9F0A',
    };
  }
  if (mode === 'cool') {
    return {
      gradient: 'from-[#0A84FF] via-[#145FC4] to-[#193253]',
      border: 'border-[#0A84FF]/52',
      glow: 'shadow-[0_0_28px_rgba(10,132,255,0.44),inset_0_1px_0_rgba(255,255,255,0.24)]',
      iconSurface: 'bg-[#0A84FF]/16 border border-[#0A84FF]/38',
      controlSurface: 'border border-white/[0.10] bg-white/[0.08] text-white backdrop-blur-xl hover:bg-white/[0.13]',
      fanAccent: '#0A84FF',
    };
  }
  if (mode === 'heat_cool' || mode === 'auto') {
    return {
      gradient: 'from-[#2FD66C] via-[#1C8C52] to-[#1F3B2D]',
      border: 'border-[#32D74B]/46',
      glow: 'shadow-[0_0_28px_rgba(50,215,75,0.36),inset_0_1px_0_rgba(255,255,255,0.24)]',
      iconSurface: 'bg-[#32D74B]/14 border border-[#32D74B]/34',
      controlSurface: 'border border-white/[0.10] bg-white/[0.08] text-white backdrop-blur-xl hover:bg-white/[0.13]',
      fanAccent: '#32D74B',
    };
  }
  if (mode === 'dry') {
    return {
      gradient: 'from-[#64D2FF] via-[#297DA8] to-[#213B4D]',
      border: 'border-[#64D2FF]/46',
      glow: 'shadow-[0_0_28px_rgba(100,210,255,0.36),inset_0_1px_0_rgba(255,255,255,0.24)]',
      iconSurface: 'bg-[#64D2FF]/14 border border-[#64D2FF]/34',
      controlSurface: 'border border-white/[0.10] bg-white/[0.08] text-white backdrop-blur-xl hover:bg-white/[0.13]',
      fanAccent: '#64D2FF',
    };
  }
  if (mode === 'fan_only') {
    return {
      gradient: 'from-[#8E8E93] via-[#575E6B] to-[#2A2E37]',
      border: 'border-[#A1A1AA]/42',
      glow: 'shadow-[0_0_24px_rgba(161,161,170,0.26),inset_0_1px_0_rgba(255,255,255,0.22)]',
      iconSurface: 'bg-white/[0.12] border border-white/[0.20]',
      controlSurface: 'border border-white/[0.10] bg-white/[0.08] text-white backdrop-blur-xl hover:bg-white/[0.13]',
      fanAccent: '#C7C7CC',
    };
  }
  return {
    gradient: 'from-[color:var(--ui-surface-glass)] via-[color:var(--ui-surface-secondary)] to-[color:var(--ui-surface-glass-soft)]',
    border: 'border-[color:var(--ui-border)]',
    glow: 'shadow-[0_14px_34px_var(--ui-shadow-soft),inset_0_1px_0_rgb(var(--ui-glass-highlight-rgb)/0.16)]',
    iconSurface: 'bg-[color:var(--ui-fill-tertiary)] border border-[color:var(--ui-border)]',
    controlSurface: 'border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-primary)] backdrop-blur-xl hover:bg-[color:var(--ui-fill-secondary)]',
    fanAccent: '#8E8E93',
  };
}

function formatSingleTarget(value: number | undefined) {
  if (value === undefined) {
    return '--';
  }
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${Math.round(rounded)}` : rounded.toFixed(1);
}

function formatRangeTarget(low: number, high: number) {
  return `${Math.round(low)}-${Math.round(high)}`;
}

function normalizeTemperatureUnit(value: unknown) {
  const raw = toTrimmedString(value)?.toUpperCase();
  if (!raw) {
    return '\u00B0C';
  }
  if (raw === 'C' || raw === '\u00B0C') {
    return '\u00B0C';
  }
  if (raw === 'F' || raw === '\u00B0F') {
    return '\u00B0F';
  }
  return raw;
}

export function ClimateCard({
  widget,
  state,
  isSelected,
  isEditMode,
  onClick,
  liveEntity,
  onTemperatureChange,
  onTargetRangeChange,
  onTargetHumidityChange,
  onPowerToggle,
  onModeChange,
  onFanModeChange,
  onPresetModeChange,
  onSwingModeChange,
  onSwingHorizontalModeChange,
  gridBreakpoint,
  displayVariant,
  onDisplayMetricsChange,
}: ClimateCardProps) {
  const { t } = useI18n();
  const localizedModeLabel = (mode: string) => {
    const normalized = normalizeMode(mode);
    if (normalized === 'heat') return t('controls.climate.label.heating');
    if (normalized === 'cool') return t('controls.climate.label.cooling');
    if (normalized === 'heat_cool' || normalized === 'auto' || normalized === 'automatic') return t('controls.climate.label.automatic');
    if (normalized === 'dry' || normalized === 'drying' || normalized === 'dehumidify') return t('controls.climate.label.dry');
    if (normalized === 'fan' || normalized === 'fan_only' || normalized === 'ventilate') return t('controls.climate.label.ventilation');
    if (normalized === 'off') return t('controls.climate.label.off');
    if (normalized === 'unavailable') return t('controls.climate.label.unavailable');
    if (normalized === 'on') return t('controls.common.on');
    return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1).replace(/[_-]+/g, ' ') : t('controls.climate.label.inactive');
  };
  const localizedModeChip = (mode: string) => {
    const normalized = normalizeMode(mode);
    if (normalized === 'heat') return t('controls.climate.label.heat');
    if (normalized === 'cool') return t('controls.climate.label.cool');
    if (normalized === 'heat_cool' || normalized === 'auto') return t('controls.climate.label.auto');
    if (normalized === 'dry') return t('controls.climate.label.dry');
    if (normalized === 'fan_only') return t('controls.climate.label.fan');
    if (normalized === 'off') return t('controls.climate.label.off');
    return normalized ? normalized.replace(/[_-]+/g, ' ') : t('controls.climate.mode');
  };
  const localizedOptionLabel = (mode: string) => {
    const normalized = normalizeMode(mode).replace(/[_-]+/g, ' ');
    if (!normalized) return '--';
    if (normalized === 'none') return t('controls.climate.label.none');
    if (normalized === 'off') return t('controls.climate.label.stopped');
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  };
  const localizedFanLabel = (mode: string) => {
    const normalized = normalizeMode(mode);
    if (normalized === 'low') return t('controls.climate.label.low');
    if (normalized === 'medium' || normalized === 'med') return t('controls.climate.label.medium');
    if (normalized === 'high') return t('controls.climate.label.high');
    if (normalized === 'quiet') return t('controls.climate.label.quiet');
    if (normalized === 'on') return t('controls.common.on');
    if (normalized === 'off') return t('controls.common.off');
    return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : '--';
  };
  const fallbackVariant = displayVariant ?? resolveWidgetDisplayVariant({
    kind: 'climate',
    breakpoint: gridBreakpoint,
    layout: widget.layout,
    parentSectionId: widget.parentSectionId,
  });
  const { ref: cardRef, size: observedSize } = useObservedElementSize<HTMLDivElement>(widget.id);
  const measuredSize = observedSize?.identity === widget.id ? observedSize : null;
  const layoutVariant = measuredSize
    ? resolveClimatePixelDisplayVariant({ width: measuredSize.width, height: measuredSize.height })
    : fallbackVariant;
  const cardWidth = measuredSize?.width ?? 0;
  const cardHeight = measuredSize?.height ?? 0;
  const hasCardSize = measuredSize !== null;
  const isDemoClimate = !liveEntity && widget.dataSource === 'mock' && widget.entityId === 'climate.air_conditioner';
  const rawAttributes = liveEntity?.rawAttributes;
  const activeMode = resolveActiveMode(liveEntity, widget, state);
  const fallbackStatus = localizedModeLabel(activeMode);
  const rawStatus =
    toTrimmedString(liveEntity?.stateLabel) ??
      toTrimmedString(liveEntity?.hvacAction) ??
      toTrimmedString(rawAttributes?.hvac_action) ??
      toTrimmedString(liveEntity?.hvacMode) ??
      toTrimmedString(rawAttributes?.hvac_mode) ??
      toTrimmedString(liveEntity?.state) ??
      (isDemoClimate ? toTrimmedString(state.climate.status) ?? toTrimmedString(state.climate.mode) : undefined);
  const statusLine = rawStatus ? localizedModeLabel(rawStatus) : fallbackStatus;
  const currentTemp =
    toFiniteNumber(liveEntity?.currentValue) ??
    toFiniteNumber(rawAttributes?.current_temperature) ??
    (isDemoClimate ? toFiniteNumber(state.climate.currentTemp) : undefined);
  const targetTemp =
    toFiniteNumber(liveEntity?.targetValue) ??
    toFiniteNumber(rawAttributes?.temperature) ??
    (isDemoClimate ? toFiniteNumber(state.climate.targetTemp) : undefined);
  const targetTempLow =
    toFiniteNumber(liveEntity?.targetTempLow) ??
    toFiniteNumber(rawAttributes?.target_temp_low) ??
    (isDemoClimate ? toFiniteNumber(state.climate.targetTempLow) : undefined);
  const targetTempHigh =
    toFiniteNumber(liveEntity?.targetTempHigh) ??
    toFiniteNumber(rawAttributes?.target_temp_high) ??
    (isDemoClimate ? toFiniteNumber(state.climate.targetTempHigh) : undefined);
  const minTemp =
    toFiniteNumber(liveEntity?.minTemp) ??
    toFiniteNumber(rawAttributes?.min_temp) ??
    (isDemoClimate ? toFiniteNumber(state.climate.minTemp) : undefined);
  const maxTemp =
    toFiniteNumber(liveEntity?.maxTemp) ??
    toFiniteNumber(rawAttributes?.max_temp) ??
    (isDemoClimate ? toFiniteNumber(state.climate.maxTemp) : undefined);
  const targetStep =
    toFiniteNumber(liveEntity?.targetTempStep) ??
    toFiniteNumber(rawAttributes?.target_temp_step) ??
    (isDemoClimate ? toFiniteNumber(state.climate.targetTempStep) : undefined) ??
    0.5;
  const supportedFeatures =
    toFiniteNumber(liveEntity?.supportedFeatures) ??
    toFiniteNumber(rawAttributes?.supported_features);
  const currentHumidity =
    toFiniteNumber(liveEntity?.currentHumidity) ??
    toFiniteNumber(rawAttributes?.current_humidity) ??
    (isDemoClimate ? toFiniteNumber(state.climate.currentHumidity) : undefined);
  const targetHumidity =
    toFiniteNumber(liveEntity?.targetHumidity) ??
    toFiniteNumber(rawAttributes?.humidity) ??
    (isDemoClimate ? toFiniteNumber(state.climate.targetHumidity) : undefined);
  const minHumidity =
    toFiniteNumber(liveEntity?.minHumidity) ??
    toFiniteNumber(rawAttributes?.min_humidity) ??
    (isDemoClimate ? toFiniteNumber(state.climate.minHumidity) : undefined) ??
    30;
  const maxHumidity =
    toFiniteNumber(liveEntity?.maxHumidity) ??
    toFiniteNumber(rawAttributes?.max_humidity) ??
    (isDemoClimate ? toFiniteNumber(state.climate.maxHumidity) : undefined) ??
    99;
  const targetHumidityStep =
    toFiniteNumber(liveEntity?.targetHumidityStep) ??
    toFiniteNumber(rawAttributes?.target_humidity_step) ??
    (isDemoClimate ? toFiniteNumber(state.climate.targetHumidityStep) : undefined) ??
    1;
  const supportsTargetHumidity =
    climateFeatureEnabled(supportedFeatures, CLIMATE_FEATURE_TARGET_HUMIDITY) ??
    targetHumidity !== undefined;
  const hasRangeTarget = targetTempLow !== undefined && targetTempHigh !== undefined;
  const hvacModesFromAttributes = toStringArray(rawAttributes?.hvac_modes);
  const hvacModesSource =
    Array.isArray(liveEntity?.hvacModes) && liveEntity.hvacModes.length > 0
      ? liveEntity.hvacModes
      : hvacModesFromAttributes.length > 0
        ? hvacModesFromAttributes
        : isDemoClimate
          ? (state.climate.hvacModes ?? [])
          : [];
  const hvacModes = normalizeModes(hvacModesSource).filter((mode) => mode !== 'unavailable' && mode !== 'unknown');
  const selectedHvacMode =
    toCanonicalClimateMode(toTrimmedString(liveEntity?.hvacMode)) ||
    toCanonicalClimateMode(toTrimmedString(rawAttributes?.hvac_mode)) ||
    toCanonicalClimateMode(toTrimmedString(liveEntity?.state)) ||
    (isDemoClimate ? toCanonicalClimateMode(toTrimmedString(state.climate.mode)) : '') ||
    activeMode;
  const fanModesFromAttributes = toStringArray(rawAttributes?.fan_modes);
  const fanModesSource =
    Array.isArray(liveEntity?.fanModes) && liveEntity.fanModes.length > 0
      ? liveEntity.fanModes
      : fanModesFromAttributes.length > 0
        ? fanModesFromAttributes
        : isDemoClimate
          ? (state.climate.fanModes ?? [])
          : [];
  const fanModes = normalizeModes(fanModesSource);
  const activeFanMode = normalizeMode(
    toTrimmedString(liveEntity?.fanMode) ??
      toTrimmedString(rawAttributes?.fan_mode) ??
      (isDemoClimate ? toTrimmedString(state.climate.fanMode) : undefined) ??
      fanModes[0],
  );
  const presetModesFromAttributes = toStringArray(rawAttributes?.preset_modes);
  const presetModes = normalizeModes(
    Array.isArray(liveEntity?.presetModes) && liveEntity.presetModes.length > 0
      ? liveEntity.presetModes
      : presetModesFromAttributes.length > 0
        ? presetModesFromAttributes
        : isDemoClimate
          ? (state.climate.presetModes ?? [])
          : [],
  );
  const activePresetMode = normalizeMode(
    toTrimmedString(liveEntity?.presetMode) ??
      toTrimmedString(rawAttributes?.preset_mode) ??
      (isDemoClimate ? toTrimmedString(state.climate.presetMode) : undefined) ??
      presetModes[0],
  );
  const swingModesFromAttributes = toStringArray(rawAttributes?.swing_modes);
  const swingModes = normalizeModes(
    Array.isArray(liveEntity?.swingModes) && liveEntity.swingModes.length > 0
      ? liveEntity.swingModes
      : swingModesFromAttributes.length > 0
        ? swingModesFromAttributes
        : isDemoClimate
          ? (state.climate.swingModes ?? [])
          : [],
  );
  const activeSwingMode = normalizeMode(
    toTrimmedString(liveEntity?.swingMode) ??
      toTrimmedString(rawAttributes?.swing_mode) ??
      (isDemoClimate ? toTrimmedString(state.climate.swingMode) : undefined) ??
      swingModes[0],
  );
  const swingHorizontalModesFromAttributes = toStringArray(rawAttributes?.swing_horizontal_modes);
  const swingHorizontalModes = normalizeModes(
    Array.isArray(liveEntity?.swingHorizontalModes) && liveEntity.swingHorizontalModes.length > 0
      ? liveEntity.swingHorizontalModes
      : swingHorizontalModesFromAttributes.length > 0
        ? swingHorizontalModesFromAttributes
        : isDemoClimate
          ? (state.climate.swingHorizontalModes ?? [])
          : [],
  );
  const activeSwingHorizontalMode = normalizeMode(
    toTrimmedString(liveEntity?.swingHorizontalMode) ??
      toTrimmedString(rawAttributes?.swing_horizontal_mode) ??
      (isDemoClimate ? toTrimmedString(state.climate.swingHorizontalMode) : undefined) ??
      swingHorizontalModes[0],
  );
  const targetPending = rawAttributes?.[CLIMATE_PENDING_TARGET_ATTRIBUTE_KEY] === true;

  const [localTarget, setLocalTarget] = useState<number | undefined>(targetTemp);
  const [localRange, setLocalRange] = useState<{ low: number; high: number } | null>(
    hasRangeTarget ? { low: targetTempLow, high: targetTempHigh } : null,
  );
  const [localFanMode, setLocalFanMode] = useState(activeFanMode);
  const [localHumidity, setLocalHumidity] = useState<number | undefined>(targetHumidity);
  const [localPresetMode, setLocalPresetMode] = useState(activePresetMode);
  const [localSwingMode, setLocalSwingMode] = useState(activeSwingMode);
  const [localSwingHorizontalMode, setLocalSwingHorizontalMode] = useState(activeSwingHorizontalMode);
  const [localTargetPending, setLocalTargetPending] = useState(false);
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false);

  useEffect(() => {
    if (targetPending) {
      return;
    }
    if (localTargetPending) {
      if (
        targetTemp !== undefined &&
        localTarget !== undefined &&
        Math.abs(targetTemp - localTarget) <= Math.max(0.05, targetStep / 2)
      ) {
        setLocalTargetPending(false);
      }
      return;
    }
    setLocalTarget(targetTemp);
  }, [localTarget, localTargetPending, targetPending, targetStep, targetTemp]);

  useEffect(() => {
    if (targetPending) {
      return;
    }
    if (hasRangeTarget) {
      if (localTargetPending && localRange) {
        const lowMatches = Math.abs(targetTempLow - localRange.low) <= Math.max(0.05, targetStep / 2);
        const highMatches = Math.abs(targetTempHigh - localRange.high) <= Math.max(0.05, targetStep / 2);
        if (lowMatches && highMatches) {
          setLocalTargetPending(false);
        }
        return;
      }
      setLocalRange((current) =>
        current && current.low === targetTempLow && current.high === targetTempHigh
          ? current
          : { low: targetTempLow, high: targetTempHigh },
      );
      return;
    }
    if (localTargetPending) {
      return;
    }
    setLocalRange(null);
  }, [hasRangeTarget, localRange, localTargetPending, targetPending, targetStep, targetTempHigh, targetTempLow]);

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

  useEffect(() => {
    setLocalPresetMode(activePresetMode);
  }, [activePresetMode]);

  useEffect(() => {
    setLocalSwingMode(activeSwingMode);
  }, [activeSwingMode]);

  useEffect(() => {
    setLocalSwingHorizontalMode(activeSwingHorizontalMode);
  }, [activeSwingHorizontalMode]);

  useEffect(() => {
    if (!measuredSize || !onDisplayMetricsChange) return;
    onDisplayMetricsChange({
      widgetId: widget.id,
      width: measuredSize.width,
      height: measuredSize.height,
      variant: layoutVariant,
    });
  }, [layoutVariant, measuredSize, onDisplayMetricsChange, widget.id]);

  useEffect(() => {
    if (isEditMode) setIsModeMenuOpen(false);
  }, [isEditMode]);

  const safeMin = minTemp ?? Number.NEGATIVE_INFINITY;
  const safeMax = maxTemp ?? Number.POSITIVE_INFINITY;
  const safeStep = targetStep > 0 ? targetStep : 0.5;
  const surface = modeToSurface(activeMode);
  const usesSemanticSurface = !['heat', 'cool', 'heat_cool', 'auto', 'dry', 'fan_only'].includes(activeMode);
  const primaryTextClass = usesSemanticSurface ? 'text-[color:var(--ui-text-primary)]' : 'text-white';
  const secondaryTextClass = usesSemanticSurface ? 'text-[color:var(--ui-text-secondary)]' : 'text-white/80';
  const tertiaryTextClass = usesSemanticSurface ? 'text-[color:var(--ui-text-tertiary)]' : 'text-white/54';
  const isTargetPending = targetPending || localTargetPending;
  const fanPending = rawAttributes?.[CLIMATE_PENDING_FAN_ATTRIBUTE_KEY] === true;
  const humidityPending = rawAttributes?.[CLIMATE_PENDING_HUMIDITY_ATTRIBUTE_KEY] === true;
  const primaryControl = resolveClimatePrimaryControl(activeMode, supportsTargetHumidity);
  const humidityMin = Math.min(minHumidity, maxHumidity);
  const humidityMax = Math.max(minHumidity, maxHumidity);
  const humidityStep = targetHumidityStep > 0 ? targetHumidityStep : 1;
  const humidityValue = clamp(
    localHumidity ?? targetHumidity ?? currentHumidity ?? humidityMin,
    humidityMin,
    humidityMax,
  );
  const setToLabel = localRange
    ? formatRangeTarget(localRange.low, localRange.high)
    : formatSingleTarget(localTarget);
  const temperatureUnit = normalizeTemperatureUnit(
    rawAttributes?.temperature_unit ??
      liveEntity?.unit ??
      (isDemoClimate ? state.climate.temperatureUnit : undefined) ??
      widget.unit,
  );
  const currentTempLabel =
    currentTemp !== undefined ? `${currentTemp.toFixed(1)}${temperatureUnit}` : `--${temperatureUnit}`;
  const subtitleLine = `${statusLine} \u2022 ${currentTempLabel}`;
  const isDenseCard = layoutVariant === 'compact';
  const isCompactClimateCard = layoutVariant !== 'full';
  const showFullDetails = layoutVariant === 'full' && primaryControl !== 'off';
  const fullDetailSwingModes = swingModes.length > 0 ? swingModes : swingHorizontalModes;
  const fullDetailSwingMode = swingModes.length > 0 ? localSwingMode : localSwingHorizontalMode;
  const setFullDetailSwingMode = swingModes.length > 0
    ? (nextMode: string) => {
        setLocalSwingMode(nextMode);
        onSwingModeChange?.(nextMode);
      }
    : (nextMode: string) => {
        setLocalSwingHorizontalMode(nextMode);
        onSwingHorizontalModeChange?.(nextMode);
      };
  const normalizedTitle = widget.title.trim();
  const isLongTitle = normalizedTitle.length >= (isDenseCard ? 12 : isCompactClimateCard ? 16 : 22);
  const hasFanModeControlSpace =
    layoutVariant !== 'compact' &&
    (!hasCardSize || (cardWidth >= 200 && cardHeight >= 148));
  const showFanModeControl = fanModes.length > 0 && hasFanModeControlSpace && Boolean(onFanModeChange);
  const showHvacModeControl = hvacModes.length > 1 && Boolean(onModeChange);
  const cardRadiusClass = isDenseCard
    ? 'rounded-[1.7rem]'
    : isCompactClimateCard
      ? 'rounded-[1.85rem]'
      : 'rounded-[2rem]';
  const cardPaddingClass = isDenseCard ? 'px-3 py-2.5' : isCompactClimateCard ? 'px-3.5 py-3' : 'px-4 py-4';
  const headerGapClass = isDenseCard ? 'gap-2.5' : isCompactClimateCard ? 'gap-2.5' : 'gap-3';
  const controlsGapClass = isDenseCard ? 'gap-2' : 'gap-2.5';
  const titleClass = isDenseCard
    ? `leading-[1.08] font-semibold tracking-[-0.01em] ${primaryTextClass} whitespace-normal break-words [overflow-wrap:anywhere] ${
        isLongTitle ? 'text-[clamp(0.78rem,1.5vw,0.9rem)]' : 'text-[clamp(0.84rem,1.7vw,0.98rem)]'
      }`
    : isCompactClimateCard
      ? `leading-[1.08] font-semibold tracking-[-0.01em] ${primaryTextClass} whitespace-normal break-words [overflow-wrap:anywhere] ${
          isLongTitle ? 'text-[clamp(0.84rem,1.8vw,1.02rem)]' : 'text-[clamp(0.92rem,2vw,1.12rem)]'
        }`
      : `leading-[1.06] font-semibold tracking-[-0.01em] ${primaryTextClass} whitespace-normal break-words [overflow-wrap:anywhere] ${
          isLongTitle ? 'text-[clamp(0.94rem,2.15vw,1.16rem)]' : 'text-[clamp(1.02rem,2.35vw,1.32rem)]'
        }`;
  const subtitleClass = isDenseCard
    ? `line-clamp-1 mt-0.5 overflow-hidden text-[0.7rem] ${secondaryTextClass}`
    : isCompactClimateCard
      ? `line-clamp-1 mt-0.5 overflow-hidden text-[0.78rem] ${secondaryTextClass}`
      : `line-clamp-1 mt-0.5 overflow-hidden text-[0.9rem] ${secondaryTextClass}`;
  const controlsClass = isDenseCard
    ? 'h-9 w-9'
    : isCompactClimateCard
      ? 'h-10 w-10'
      : 'h-12 w-12';
  const controlIconSize = isDenseCard ? 16 : isCompactClimateCard ? 17 : 20;
  const setPointClass = isDenseCard
    ? `text-[1.95rem] leading-none font-semibold tracking-tight drop-shadow-[0_6px_14px_var(--ui-shadow-soft)] ${isTargetPending ? secondaryTextClass : primaryTextClass}`
    : isCompactClimateCard
      ? `text-[2.05rem] leading-none font-semibold tracking-tight drop-shadow-[0_6px_14px_var(--ui-shadow-soft)] ${isTargetPending ? secondaryTextClass : primaryTextClass}`
      : `text-[2.2rem] leading-none font-semibold tracking-tight drop-shadow-[0_6px_14px_var(--ui-shadow-soft)] ${isTargetPending ? secondaryTextClass : primaryTextClass}`;
  const unitClass = isDenseCard
    ? `mt-0.5 text-[0.58rem] leading-none font-semibold tracking-[0.18em] ${isTargetPending ? tertiaryTextClass : secondaryTextClass}`
    : isCompactClimateCard
      ? `mt-0.5 text-[0.62rem] leading-none font-semibold tracking-[0.18em] ${isTargetPending ? tertiaryTextClass : secondaryTextClass}`
      : `mt-1 text-[0.74rem] leading-none font-semibold tracking-[0.2em] ${isTargetPending ? tertiaryTextClass : secondaryTextClass}`;
  const fanModeIconIndex = Math.max(0, fanModes.findIndex((mode) => mode === 'auto'));
  const fanModesAreCrowded = fanModes.length > (isDenseCard ? 4 : isCompactClimateCard ? 5 : 7);
  const fanTrackClass = isDenseCard
    ? 'mx-auto mt-1.5 w-full rounded-[0.68rem] border p-[3px] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur-xl'
    : isCompactClimateCard
      ? 'mx-auto mt-2 w-full rounded-[0.76rem] border p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur-xl'
      : 'mx-auto mt-3 w-full rounded-[0.82rem] border p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur-xl';
  const fanStepClass = isDenseCard ? 'h-5' : isCompactClimateCard ? 'h-6' : 'h-7';
  const fanCrowdedWidthClass = isDenseCard ? 'w-[1.45rem]' : isCompactClimateCard ? 'w-[1.7rem]' : 'w-[1.95rem]';
  const fanItemsClass = fanModesAreCrowded ? 'flex items-center gap-1 overflow-x-auto pr-0.5' : 'flex items-center gap-1';
  const fanItemsStyle: React.CSSProperties | undefined = fanModesAreCrowded
    ? { scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' as 'auto' | 'touch' }
    : undefined;
  const fanTrackStyle = {
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    borderColor: toRgba(surface.fanAccent, 0.24),
    boxShadow: `0 0 18px ${toRgba(surface.fanAccent, 0.14)}, inset 0 1px 0 rgba(255,255,255,0.16)`,
  };
  const titleLineClamp = isDenseCard ? 2 : isCompactClimateCard ? 3 : 3;
  const titleWrapStyle: React.CSSProperties = {
    display: '-webkit-box',
    WebkitLineClamp: titleLineClamp,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  };

  return (
    <div
      ref={cardRef}
      className={`relative flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden ${cardRadiusClass} ${
        isSelected ? 'selection-corners' : ''
      }`}
      onClick={(event) => {
        if (isEditMode) {
          return;
        }
        event.stopPropagation();
        onClick();
      }}
    >
      <div
        className={`relative h-full w-full min-h-0 min-w-0 overflow-hidden ${cardRadiusClass} border bg-gradient-to-br ${surface.gradient} ${surface.border} ${surface.glow} ${cardPaddingClass} flex flex-col backdrop-blur-xl ${
          isEditMode ? 'pointer-events-none' : ''
        }`}
      >
        <div className={`pointer-events-none absolute inset-0 ${cardRadiusClass} bg-[radial-gradient(95%_80%_at_15%_0%,rgba(255,255,255,0.10),transparent_64%)]`} />

        <div className={`relative z-20 flex items-start ${headerGapClass} min-w-0`}>
          <div className="min-w-0 flex-1">
            <p className={titleClass} style={titleWrapStyle}>
              {normalizedTitle}
            </p>
            <p className={subtitleClass}>{subtitleLine}</p>
          </div>
          {showHvacModeControl ? (
            <div className="relative shrink-0">
              <button
                type="button"
                className={`inline-flex max-w-[7.75rem] items-center justify-center gap-1.5 rounded-full ${surface.controlSurface} shadow-[inset_0_1px_0_rgb(var(--ui-glass-highlight-rgb)/0.18)] transition-all active:scale-95 ${
                  isDenseCard ? 'h-8 w-8 p-0' : 'h-9 px-3 text-[0.72rem]'
                }`}
                onClick={(event) => {
                  event.stopPropagation();
                  setIsModeMenuOpen((current) => !current);
                }}
                aria-label={`${t('controls.climate.mode')}: ${localizedModeLabel(selectedHvacMode)}`}
                title={`${t('controls.climate.mode')}: ${localizedModeLabel(selectedHvacMode)}`}
              >
                {modeControlIcon(selectedHvacMode, isDenseCard ? 14 : 15)}
                {!isDenseCard ? (
                  <span className="min-w-0 truncate font-semibold leading-none">{localizedModeChip(selectedHvacMode)}</span>
                ) : null}
              </button>
            </div>
          ) : null}
        </div>

        {primaryControl === 'temperature' ? (
          <div className={`relative mt-auto flex items-center justify-between ${controlsGapClass} ${isEditMode ? 'pointer-events-none' : ''}`}>
            <button
              type="button"
              className={`${controlsClass} rounded-full ${surface.controlSurface} flex items-center justify-center shadow-[0_0_16px_rgba(255,255,255,0.08)] transition-all active:scale-95`}
              onClick={(event) => {
                event.stopPropagation();
                if (localRange && onTargetRangeChange) {
                  const nextLow = clamp(localRange.low - safeStep, safeMin, safeMax);
                  const nextHigh = clamp(localRange.high - safeStep, safeMin, safeMax);
                  const low = Math.min(nextLow, nextHigh);
                  const high = Math.max(nextLow, nextHigh);
                  setLocalRange({ low, high });
                  setLocalTargetPending(true);
                  onTargetRangeChange(low, high);
                  return;
                }
                if (localTarget !== undefined && onTemperatureChange) {
                  const next = clamp(localTarget - safeStep, safeMin, safeMax);
                  setLocalTarget(next);
                  setLocalTargetPending(true);
                  onTemperatureChange(next);
                }
              }}
              aria-label={t('controls.climate.decreaseTemperature')}
            >
              <Minus size={controlIconSize} />
            </button>

            <div className="min-w-0 flex-1 text-center">
              <p className={setPointClass}>{setToLabel}</p>
              <p className={unitClass}>{temperatureUnit}</p>
            </div>

            <button
              type="button"
              className={`${controlsClass} rounded-full ${surface.controlSurface} flex items-center justify-center shadow-[0_0_16px_rgba(255,255,255,0.08)] transition-all active:scale-95`}
              onClick={(event) => {
                event.stopPropagation();
                if (localRange && onTargetRangeChange) {
                  const nextLow = clamp(localRange.low + safeStep, safeMin, safeMax);
                  const nextHigh = clamp(localRange.high + safeStep, safeMin, safeMax);
                  const low = Math.min(nextLow, nextHigh);
                  const high = Math.max(nextLow, nextHigh);
                  setLocalRange({ low, high });
                  setLocalTargetPending(true);
                  onTargetRangeChange(low, high);
                  return;
                }
                if (localTarget !== undefined && onTemperatureChange) {
                  const next = clamp(localTarget + safeStep, safeMin, safeMax);
                  setLocalTarget(next);
                  setLocalTargetPending(true);
                  onTemperatureChange(next);
                }
              }}
              aria-label={t('controls.climate.increaseTemperature')}
            >
              <Plus size={controlIconSize} />
            </button>
          </div>
        ) : null}

        {primaryControl === 'humidity' ? (
          <div className={`relative mt-auto flex items-center justify-between ${controlsGapClass} ${isEditMode ? 'pointer-events-none' : ''}`}>
            <button
              type="button"
              className={`${controlsClass} rounded-full ${surface.controlSurface} flex items-center justify-center shadow-[0_0_16px_rgba(100,210,255,0.12)] transition-all active:scale-95`}
              onClick={(event) => {
                event.stopPropagation();
                const next = clamp(humidityValue - humidityStep, humidityMin, humidityMax);
                setLocalHumidity(next);
                onTargetHumidityChange?.(next);
              }}
              aria-label={t('controls.climate.decreaseHumidity')}
            >
              <Minus size={controlIconSize} />
            </button>
            <div className="min-w-0 flex-1 text-center">
              <p className={`${setPointClass} ${humidityPending ? 'opacity-70' : ''}`}>{Math.round(humidityValue)}</p>
              <p className={unitClass}>%</p>
            </div>
            <button
              type="button"
              className={`${controlsClass} rounded-full ${surface.controlSurface} flex items-center justify-center shadow-[0_0_16px_rgba(100,210,255,0.12)] transition-all active:scale-95`}
              onClick={(event) => {
                event.stopPropagation();
                const next = clamp(humidityValue + humidityStep, humidityMin, humidityMax);
                setLocalHumidity(next);
                onTargetHumidityChange?.(next);
              }}
              aria-label={t('controls.climate.increaseHumidity')}
            >
              <Plus size={controlIconSize} />
            </button>
          </div>
        ) : null}

        {primaryControl === 'dry-status' ? (
          <div className="relative mt-auto flex min-w-0 flex-col items-center justify-center text-center">
            <Droplets className="mb-1.5 h-7 w-7 text-[#64D2FF]/85" strokeWidth={1.7} />
            <p className="truncate text-sm font-semibold text-white/88">{t('controls.climate.dehumidify')}</p>
            <p className="mt-0.5 truncate text-[0.68rem] text-white/58">
              {currentHumidity !== undefined ? t('controls.climate.humidity', { value: Math.round(currentHumidity) }) : t('controls.climate.targetUnavailable')}
            </p>
          </div>
        ) : null}

        {primaryControl === 'fan' ? (
          <div className="relative mt-auto flex min-w-0 flex-col items-center justify-center text-center">
            <Fan className={`mb-1.5 h-7 w-7 text-white/88 ${fanPending ? 'animate-pulse' : ''}`} strokeWidth={1.7} />
            <p className="max-w-full truncate text-sm font-semibold text-white/90">
              {localFanMode ? localizedFanLabel(localFanMode) : t('controls.climate.label.fan')}
            </p>
            <p className="mt-0.5 text-[0.68rem] text-white/56">{t('controls.climate.fanSpeed')}</p>
          </div>
        ) : null}

        {primaryControl === 'off' ? (
          <div className="relative mt-auto flex min-w-0 flex-col items-center justify-center text-center">
            <button
              type="button"
              className={`${isDenseCard ? 'h-10 w-10' : 'h-12 w-12'} ${surface.controlSurface} flex items-center justify-center rounded-full shadow-[inset_0_1px_0_rgb(var(--ui-glass-highlight-rgb)/0.16)] transition-all active:scale-95`}
              onClick={(event) => {
                event.stopPropagation();
                onPowerToggle?.();
              }}
              aria-label={t('controls.climate.turnOn')}
            >
              <Power size={isDenseCard ? 17 : 20} />
            </button>
            <p className={`mt-1.5 text-[0.68rem] ${tertiaryTextClass}`}>
              {currentTemp !== undefined ? `Ambiente ${currentTemp.toFixed(1)}${temperatureUnit}` : 'Clima spento'}
            </p>
          </div>
        ) : null}

        {showFanModeControl && primaryControl !== 'off' ? (
          <div className={`relative ${isEditMode ? 'pointer-events-none' : ''}`}>
            <div className={fanTrackClass} style={fanTrackStyle}>
              <div className={fanItemsClass} style={fanItemsStyle}>
                {fanModes.map((entry, index) => {
                  const normalized = normalizeMode(entry);
                  const active = localFanMode === normalized;
                  const label = localizedFanLabel(normalized);
                  const activeStyle = fanPending
                    ? {
                        backgroundColor: toRgba(surface.fanAccent, 0.16),
                        boxShadow: `0 0 14px ${toRgba(surface.fanAccent, 0.18)}`,
                      }
                    : {
                        backgroundColor: toRgba(surface.fanAccent, 0.24),
                        boxShadow: `0 0 16px ${toRgba(surface.fanAccent, 0.28)}`,
                      };
                  return (
                    <button
                      key={entry}
                      type="button"
                      className={`${fanStepClass} ${fanModesAreCrowded ? `${fanCrowdedWidthClass} shrink-0` : 'flex-1 min-w-0'} rounded-[0.58rem] flex items-center justify-center transition-colors ${
                        active
                          ? ''
                          : 'bg-white/[0.03] hover:bg-white/[0.08]'
                      }`}
                      style={active ? activeStyle : undefined}
                      onClick={(event) => {
                        event.stopPropagation();
                        setLocalFanMode(normalized);
                        onFanModeChange?.(normalized);
                      }}
                      aria-label={t('card.climate.setFan', { mode: label })}
                      title={`Fan mode: ${label}`}
                    >
                      {index === fanModeIconIndex ? (
                        <Wind
                          size={fanModesAreCrowded ? (isDenseCard ? 11 : 12) : isDenseCard ? 12 : 13}
                          style={{ color: active ? '#ffffff' : toRgba(surface.fanAccent, 0.72) }}
                        />
                      ) : (
                        <span
                          className={`rounded-full transition-all ${
                            active ? 'h-2 w-2' : 'h-1.5 w-1.5'
                          }`}
                          style={{ backgroundColor: active ? '#ffffff' : toRgba(surface.fanAccent, 0.72) }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}

        {showFullDetails ? (
          <div className={`relative mt-2 grid min-w-0 grid-cols-3 gap-1.5 ${isEditMode ? 'pointer-events-none' : ''}`}>
            {presetModes.length > 0 ? (
              <button
                type="button"
                className="flex min-w-0 items-center justify-center gap-1 rounded-xl border border-white/[0.10] bg-white/[0.065] px-1.5 py-1.5 text-white/76 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-xl transition hover:bg-white/[0.11] hover:text-white active:scale-[0.97]"
                onClick={(event) => {
                  event.stopPropagation();
                  const nextMode = resolveNextClimateOption(presetModes, localPresetMode);
                  if (!nextMode) return;
                  setLocalPresetMode(nextMode);
                  onPresetModeChange?.(nextMode);
                }}
                aria-label={`${t('controls.climate.preset')}: ${localizedOptionLabel(localPresetMode)}`}
              >
                <Sparkles size={12} className="shrink-0 text-white/58" />
                <span className="min-w-0 truncate text-[0.62rem] font-semibold">
                  {localizedOptionLabel(localPresetMode)}
                </span>
              </button>
            ) : <span />}

            {fullDetailSwingModes.length > 0 ? (
              <button
                type="button"
                className="flex min-w-0 items-center justify-center gap-1 rounded-xl border border-white/[0.10] bg-white/[0.065] px-1.5 py-1.5 text-white/76 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-xl transition hover:bg-white/[0.11] hover:text-white active:scale-[0.97]"
                onClick={(event) => {
                  event.stopPropagation();
                  const nextMode = resolveNextClimateOption(fullDetailSwingModes, fullDetailSwingMode);
                  if (!nextMode) return;
                  setFullDetailSwingMode(nextMode);
                }}
                aria-label={`${t('controls.climate.swing')}: ${localizedOptionLabel(fullDetailSwingMode)}`}
              >
                <Wind size={12} className="shrink-0 text-white/58" />
                <span className="min-w-0 truncate text-[0.62rem] font-semibold">
                  {localizedOptionLabel(fullDetailSwingMode)}
                </span>
              </button>
            ) : <span />}

            <div className="flex min-w-0 items-center justify-center gap-1 rounded-xl border border-white/[0.08] bg-white/[0.045] px-1.5 py-1.5 text-white/68 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl">
              <Droplets size={12} className="shrink-0 text-white/50" />
              <span className="min-w-0 truncate text-[0.62rem] font-semibold">
                {currentHumidity !== undefined ? `${Math.round(currentHumidity)}%` : '--%'}
              </span>
            </div>
          </div>
        ) : null}

        {isModeMenuOpen ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('card.climate.choose')}
            tabIndex={-1}
            className={`absolute inset-0 z-40 flex min-h-0 flex-col overflow-hidden ${cardRadiusClass} border border-[color:var(--ui-border-strong)] bg-[color:var(--ui-surface-glass-strong)] ${isDenseCard ? 'p-2' : 'p-3'} text-[color:var(--ui-text-primary)] shadow-[inset_0_1px_0_rgb(var(--ui-glass-highlight-rgb)/0.22),0_18px_44px_var(--ui-shadow)] backdrop-blur-[30px] backdrop-saturate-[1.45]`}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setIsModeMenuOpen(false);
            }}
          >
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_68%_at_12%_0%,rgb(var(--ui-glass-highlight-rgb)/0.18),transparent_58%)]" />
            <div aria-hidden="true" className="pointer-events-none absolute -left-[12%] -top-[34%] h-[62%] w-[72%] rotate-[-10deg] rounded-[50%] border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] blur-[1px]" />
            <div className={`${isDenseCard ? 'mb-1.5' : 'mb-2.5'} relative z-10 flex items-center justify-between gap-3`}>
              <p className={`min-w-0 truncate font-semibold tracking-[-0.01em] text-[color:var(--ui-text-primary)] ${isDenseCard ? 'text-xs' : 'text-sm'}`}>{t('card.climate.choose')}</p>
              <button
                type="button"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)] shadow-[0_5px_16px_var(--ui-shadow-soft)] backdrop-blur-xl transition hover:bg-[color:var(--ui-fill-secondary)] hover:text-[color:var(--ui-text-primary)] active:scale-95"
                onClick={(event) => {
                  event.stopPropagation();
                  setIsModeMenuOpen(false);
                }}
                aria-label={t('card.climate.closeModes')}
              >
                <X size={15} />
              </button>
            </div>
            <div className={`relative z-10 grid min-h-0 flex-1 auto-rows-min ${isDenseCard ? 'grid-cols-2 gap-1.5' : 'grid-cols-3 gap-2'} overflow-y-auto pr-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}>
              {hvacModes.map((mode) => {
                const active = isEquivalentMode(selectedHvacMode, mode);
                return (
                  <button
                    key={mode}
                    type="button"
                    className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border px-2 text-center transition-all active:scale-[0.96] ${isDenseCard ? 'min-h-[2.6rem] py-1' : 'min-h-[3.25rem] py-2'} ${
                      active
                        ? 'border-[color:rgb(var(--ui-accent-rgb)/0.52)] bg-[color:rgb(var(--ui-accent-rgb)/0.18)] text-[color:var(--ui-text-primary)] shadow-[0_10px_24px_rgb(var(--ui-accent-rgb)/0.16)] backdrop-blur-2xl'
                        : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)] backdrop-blur-xl hover:border-[color:var(--ui-border-strong)] hover:bg-[color:var(--ui-fill-secondary)] hover:text-[color:var(--ui-text-primary)]'
                    }`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setIsModeMenuOpen(false);
                      onModeChange?.(mode);
                    }}
                    aria-pressed={active}
                    aria-label={t('card.climate.setMode', { mode: localizedModeLabel(mode) })}
                  >
                    <span className="flex h-5 w-5 items-center justify-center">{modeControlIcon(mode, 17)}</span>
                    <span className="max-w-full truncate text-[0.64rem] font-semibold">{localizedModeChip(mode)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {isEditMode ? (
        <div
          role="button"
          tabIndex={0}
          onClick={(event) => {
            event.stopPropagation();
            onClick();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              onClick();
            }
          }}
          className={`absolute inset-0 ${cardRadiusClass} widget-card-handle cursor-grab`}
          aria-label={t('card.open', { name: widget.title })}
        />
      ) : null}
    </div>
  );
}
