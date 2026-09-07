import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Lightbulb, Palette, Power, Sparkles, Sun, Timer, Zap } from 'lucide-react';
import { HexColorInput, HexColorPicker } from 'react-colorful';
import './LightControls.css';
import { CONTEXT_PANEL_LAYOUT } from './layoutClasses';
import { ContextPanelHeader } from './ContextPanelHeader';
import GlassSlider from '../ui/GlassSlider';
import GlassSegmentSelect from '../ui/GlassSegmentSelect';
import { useI18n } from '../../i18n/I18nProvider';
import type { TranslationKey } from '../../i18n/translations';

const COLOR_PICKER_DEBOUNCE_MS = 160;

const QUICK_COLOR_PRESETS = [
  { labelKey: 'controls.light.color.amber' as TranslationKey, hue: 32, saturation: 94 },
  { labelKey: 'controls.light.color.blue' as TranslationKey, hue: 225, saturation: 68 },
  { labelKey: 'controls.light.color.green' as TranslationKey, hue: 152, saturation: 72 },
  { labelKey: 'controls.light.color.purple' as TranslationKey, hue: 272, saturation: 70 },
] as const;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeHsColor(value: unknown): [number, number] {
  if (!Array.isArray(value) || value.length < 2) {
    return [0, 0];
  }
  const rawHue = Number(value[0]);
  const rawSaturation = Number(value[1]);
  const hue = Number.isFinite(rawHue) ? ((rawHue % 360) + 360) % 360 : 0;
  const saturation = Number.isFinite(rawSaturation) ? clamp(rawSaturation, 0, 100) : 0;
  return [hue, saturation];
}

function hsToRgb(hue: number, saturation: number): [number, number, number] {
  const h = ((Number(hue) || 0) % 360 + 360) % 360;
  const s = clamp((Number(saturation) || 0) / 100, 0, 1);
  const c = s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;
  if (h < 60) {
    rPrime = c;
    gPrime = x;
  } else if (h < 120) {
    rPrime = x;
    gPrime = c;
  } else if (h < 180) {
    gPrime = c;
    bPrime = x;
  } else if (h < 240) {
    gPrime = x;
    bPrime = c;
  } else if (h < 300) {
    rPrime = x;
    bPrime = c;
  } else {
    rPrime = c;
    bPrime = x;
  }
  const m = 1 - c;
  return [Math.round((rPrime + m) * 255), Math.round((gPrime + m) * 255), Math.round((bPrime + m) * 255)];
}

function componentToHex(value: number) {
  return clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0');
}

function rgbToHex(rgb: [number, number, number]) {
  return `#${componentToHex(rgb[0])}${componentToHex(rgb[1])}${componentToHex(rgb[2])}`;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const normalized = hex.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return null;
  }
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

function rgbToHs(rgb: [number, number, number]): [number, number] {
  const [r, g, b] = rgb.map((channel) => clamp(channel, 0, 255) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let hue = 0;
  if (delta !== 0) {
    if (max === r) {
      hue = 60 * (((g - b) / delta) % 6);
    } else if (max === g) {
      hue = 60 * ((b - r) / delta + 2);
    } else {
      hue = 60 * ((r - g) / delta + 4);
    }
  }
  if (hue < 0) {
    hue += 360;
  }
  const sat = max === 0 ? 0 : (delta / max) * 100;
  return [Math.round(hue), Math.round(sat)];
}

interface LightControlsProps {
  lamp: {
    name: string;
    isOn: boolean;
    brightness: number;
    status: string;
    hsColor?: [number, number] | number[];
    colorTemp: number;
    supportsBrightness?: boolean;
    supportsColorTemp?: boolean;
    supportsColor?: boolean;
    supportsWhite?: boolean;
    supportsEffects?: boolean;
    supportsFlash?: boolean;
    supportsTransition?: boolean;
    minColorTempKelvin?: number;
    maxColorTempKelvin?: number;
    effect?: string;
    effectList?: string[];
  };
  onToggle: () => void;
  onBrightnessChange: (value: number, options?: { transition?: number }) => void;
  onColorTempChange: (kelvin: number, options?: { transition?: number }) => void;
  onColorChange: (hs: [number, number], options?: { transition?: number }) => void;
  onWhiteChange: (value: number, options?: { transition?: number }) => void;
  onEffectChange: (effect: string, options?: { transition?: number }) => void;
  onFlash: (mode: 'short' | 'long') => void;
}

export function LightControlsPanel({
  lamp,
  onToggle,
  onBrightnessChange,
  onColorTempChange,
  onColorChange,
  onWhiteChange,
  onEffectChange,
  onFlash,
}: LightControlsProps) {
  const { t } = useI18n();
  const colorDebounceRef = useRef<number | null>(null);
  const skipNextBrightnessBlurCommitRef = useRef(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isAdjustingBrightness, setIsAdjustingBrightness] = useState(false);
  const brightness = Math.round(lamp.brightness);
  const [brightnessDraft, setBrightnessDraft] = useState(brightness);
  const [whiteDraft, setWhiteDraft] = useState(brightness);
  const [transitionSeconds, setTransitionSeconds] = useState(0);
  const supportsBrightness = lamp.supportsBrightness ?? true;
  const supportsColorTemp = lamp.supportsColorTemp ?? true;
  const supportsColor = lamp.supportsColor ?? true;
  const supportsWhite = lamp.supportsWhite ?? false;
  const supportsEffects = lamp.supportsEffects ?? false;
  const supportsFlash = lamp.supportsFlash ?? false;
  const supportsTransition = lamp.supportsTransition ?? false;
  const hsColor = useMemo(() => normalizeHsColor(lamp.hsColor), [lamp.hsColor]);
  const colorTempMin = Math.min(lamp.minColorTempKelvin ?? 2000, lamp.maxColorTempKelvin ?? 6500);
  const colorTempMax = Math.max(lamp.minColorTempKelvin ?? 2000, lamp.maxColorTempKelvin ?? 6500);
  const commandOptions = supportsTransition && transitionSeconds > 0 ? { transition: transitionSeconds } : undefined;
  const presets = useMemo<Array<{ label: string; kelvin: number }>>(() => {
    const range = Math.max(0, colorTempMax - colorTempMin);
    return [
      { label: t('controls.light.preset.warm'), kelvin: colorTempMin },
      { label: t('controls.light.preset.neutral'), kelvin: Math.round(colorTempMin + range * 0.38) },
      { label: t('controls.light.preset.cool'), kelvin: Math.round(colorTempMin + range * 0.68) },
      { label: t('controls.light.preset.day'), kelvin: colorTempMax },
    ];
  }, [colorTempMax, colorTempMin, t]);
  const effectOptions = useMemo(() => {
    const entries = (lamp.effectList ?? []).map((entry) => entry.trim()).filter(Boolean);
    const hasOff = entries.some((entry) => ['off', 'none'].includes(entry.toLowerCase()));
    return hasOff ? entries : ['off', ...entries];
  }, [lamp.effectList]);
  const currentStateLabel = lamp.isOn ? t('controls.common.onFeminine') : t('controls.common.offFeminine');
  const activeEffect = (lamp.effect?.trim() || 'off').toLowerCase();
  const hasAdvancedControls = supportsWhite || (supportsEffects && effectOptions.length > 0) || supportsFlash || supportsTransition;

  const activeTempIndex = useMemo(() => {
    let nearest = 0;
    let nearestDiff = Number.POSITIVE_INFINITY;
    presets.forEach((preset, index) => {
      const diff = Math.abs(lamp.colorTemp - preset.kelvin);
      if (diff < nearestDiff) {
        nearest = index;
        nearestDiff = diff;
      }
    });
    return nearest;
  }, [lamp.colorTemp, presets]);

  const activeSwatchIndex = useMemo(() => {
    let nearest = 0;
    let nearestDiff = Number.POSITIVE_INFINITY;
    QUICK_COLOR_PRESETS.forEach((preset, index) => {
      const diff = Math.abs(preset.hue - hsColor[0]);
      if (diff < nearestDiff) {
        nearest = index;
        nearestDiff = diff;
      }
    });
    return nearest;
  }, [hsColor]);

  const displayedBrightness = lamp.isOn ? brightnessDraft : 0;
  const displayedWhite = lamp.isOn ? whiteDraft : 0;
  const currentColorHex = useMemo(() => rgbToHex(hsToRgb(hsColor[0], hsColor[1])), [hsColor]);
  const [pickerColor, setPickerColor] = useState(currentColorHex);

  useEffect(() => {
    setPickerColor(currentColorHex);
  }, [currentColorHex]);

  useEffect(() => {
    if (isAdjustingBrightness) {
      return;
    }
    setBrightnessDraft(brightness);
    setWhiteDraft(brightness);
  }, [brightness, isAdjustingBrightness]);

  const clearPendingColorDebounce = () => {
    if (colorDebounceRef.current !== null) {
      window.clearTimeout(colorDebounceRef.current);
      colorDebounceRef.current = null;
    }
  };

  useEffect(
    () => () => {
      clearPendingColorDebounce();
    },
    [],
  );

  useEffect(() => {
    if (!supportsColor) {
      clearPendingColorDebounce();
      setIsPickerOpen(false);
    }
  }, [supportsColor]);

  useEffect(() => {
    if (!supportsBrightness) {
      setIsAdjustingBrightness(false);
    }
  }, [supportsBrightness]);

  const handlePickerChange = (nextHex: string) => {
    setPickerColor(nextHex);
    if (!supportsColor) {
      return;
    }
    clearPendingColorDebounce();
    colorDebounceRef.current = window.setTimeout(() => {
      const rgb = hexToRgb(nextHex);
      if (!rgb) {
        return;
      }
      onColorChange(rgbToHs(rgb), commandOptions);
      colorDebounceRef.current = null;
    }, COLOR_PICKER_DEBOUNCE_MS);
  };

  const commitBrightness = (rawValue: number) => {
    const nextValue = clamp(Math.round(rawValue), 0, 100);
    setBrightnessDraft(nextValue);
    onBrightnessChange(nextValue, commandOptions);
  };

  return (
    <div className={CONTEXT_PANEL_LAYOUT.shell}>
      <ContextPanelHeader title={lamp.name} subtitle={currentStateLabel} icon={<Lightbulb size={22} />} />

      <div className={`${CONTEXT_PANEL_LAYOUT.section} mb-1`}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-sm text-[color:var(--ui-text-secondary)]">{supportsBrightness ? t('controls.light.brightness') : t('controls.common.status')}</span>
            <p className="mt-0.5 text-xs text-[color:var(--ui-text-tertiary)]">{currentStateLabel}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            {supportsBrightness ? <span className="text-sm text-[color:var(--ui-text-secondary)]">{`${Math.round(displayedBrightness)}%`}</span> : null}
            <button
              type="button"
              onClick={onToggle}
              className={`h-10 w-10 rounded-full border flex items-center justify-center transition-all ${
                lamp.isOn
                  ? 'border-[color:rgb(var(--ui-accent-rgb)/0.58)] bg-[color:var(--ui-accent)] text-[color:var(--ui-accent-contrast)] shadow-[0_8px_24px_rgb(var(--ui-accent-rgb)/0.22)]'
                  : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-primary)]'
              }`}
              aria-label={t('controls.light.toggle')}
              title={t('controls.light.toggle')}
            >
              <Power size={17} />
            </button>
          </div>
        </div>

        {supportsBrightness ? (
          <div
            className="ha-light-brightness-slider"
            data-adjusting={isAdjustingBrightness ? 'true' : 'false'}
            style={{
              '--ha-light-panel-progress': `${Math.max(0, Math.min(100, displayedBrightness))}%`,
            } as React.CSSProperties}
          >
            <span className="ha-light-brightness-slider__fill" aria-hidden="true" />
            <span className="ha-light-brightness-slider__handle" aria-hidden="true" />

            <GlassSlider
              variant="overlay"
              className="ha-light-brightness-slider__input"
              min={0}
              max={100}
              step={1}
              value={displayedBrightness}
              onPointerDown={(event) => {
                setIsAdjustingBrightness(true);
                setBrightnessDraft(Number(event.currentTarget.value));
              }}
              onPointerUp={(event) => {
                commitBrightness(Number(event.currentTarget.value));
                setIsAdjustingBrightness(false);
                skipNextBrightnessBlurCommitRef.current = true;
              }}
              onPointerCancel={() => {
                setIsAdjustingBrightness(false);
                setBrightnessDraft(brightness);
              }}
              onBlur={(event) => {
                setIsAdjustingBrightness(false);
                if (skipNextBrightnessBlurCommitRef.current) {
                  skipNextBrightnessBlurCommitRef.current = false;
                  return;
                }
                if (brightnessDraft !== brightness) {
                  commitBrightness(Number(event.currentTarget.value));
                }
              }}
              onChange={(event) => {
                const nextValue = clamp(Number(event.target.value), 0, 100);
                setBrightnessDraft(nextValue);
              }}
              onKeyUp={(event) => {
                if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
                  commitBrightness(Number(event.currentTarget.value));
                }
              }}
              aria-label={t('controls.light.brightnessAria')}
              aria-valuetext={`${Math.round(displayedBrightness)}%`}
            />
          </div>
        ) : null}
      </div>

      {supportsColorTemp ? (
        <div className={`${CONTEXT_PANEL_LAYOUT.section} mb-1`}>
          <div className="mb-4 flex items-center justify-between gap-3 text-[color:var(--ui-text-secondary)]">
            <span className="inline-flex min-w-0 items-center gap-2">
              <Sun size={16} />
              <span className="text-sm text-[color:var(--ui-text-secondary)]">{t('controls.light.colorTemperature')}</span>
            </span>
          </div>

          <GlassSegmentSelect
            ariaLabel={t('controls.light.colorTemperature')}
            options={presets.map((preset) => ({ value: preset.kelvin, label: preset.label }))}
            value={presets[activeTempIndex]?.kelvin}
            onChange={(kelvin) => onColorTempChange(kelvin, commandOptions)}
            optionClassName="font-medium"
          />
        </div>
      ) : null}

      {supportsColor ? (
        <div className={`${CONTEXT_PANEL_LAYOUT.section} ${hasAdvancedControls ? 'mb-1' : 'mt-auto'}`}>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2 text-[color:var(--ui-text-secondary)]">
              <Palette size={16} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-[color:var(--ui-text-secondary)]">{t('controls.light.color')}</p>
              </div>
            </div>
            <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-2.5 py-1 text-xs font-medium text-[color:var(--ui-text-secondary)]">
              <span
                className="h-3.5 w-3.5 rounded-full border border-[#fff]/45"
                style={{ backgroundColor: pickerColor }}
                aria-hidden="true"
              />
              {pickerColor.toUpperCase()}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2.5">
            {QUICK_COLOR_PRESETS.map((preset, index) => (
              <button
                key={preset.labelKey}
                type="button"
                onClick={() => {
                  clearPendingColorDebounce();
                  onColorChange([preset.hue, preset.saturation], commandOptions);
                }}
                className={`group flex min-h-[4.6rem] flex-col items-center justify-center gap-2 rounded-2xl border px-2 py-2.5 text-center transition-all active:scale-[0.97] ${
                  index === activeSwatchIndex
                    ? 'liquid-glass-selection border-[color:var(--ui-border-strong)] shadow-[inset_0_1px_0_rgb(var(--ui-glass-highlight-rgb)/0.14)]'
                    : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] hover:bg-[color:var(--ui-fill-secondary)]'
                }`}
                aria-label={t('controls.light.setColor', { color: t(preset.labelKey) })}
                title={t(preset.labelKey)}
              >
                <span
                  className={`h-9 w-9 rounded-full border transition-transform group-hover:scale-105 ${
                    index === activeSwatchIndex
                      ? 'border-[#fff]/85 shadow-[0_0_0_3px_rgb(var(--ui-accent-rgb)/0.16),0_10px_20px_var(--ui-shadow-soft)]'
                      : 'border-[#fff]/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]'
                  }`}
                  style={{ backgroundColor: `hsl(${preset.hue} ${preset.saturation}% 52%)` }}
                  aria-hidden="true"
                />
                <span className="max-w-full truncate text-[11px] font-semibold leading-none text-[color:var(--ui-text-secondary)]">{t(preset.labelKey)}</span>
              </button>
            ))}
          </div>

          <div className="dashboard-content-surface-soft mt-4 overflow-hidden rounded-2xl">
            <button
              type="button"
              onClick={() => {
                setIsPickerOpen((prev) => !prev);
              }}
              className="flex min-h-11 w-full items-center justify-between gap-3 px-3.5 py-3 text-left transition-colors hover:bg-[color:var(--ui-fill-secondary)] active:scale-[0.99]"
              aria-expanded={isPickerOpen}
              aria-label={t('controls.light.customColor')}
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="ha-light-spectrum-swatch h-10 w-10 shrink-0 rounded-full border border-[#fff]/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_10px_20px_var(--ui-shadow-soft)]" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-[color:var(--ui-text-primary)]">{t('controls.light.custom')}</span>
                  <span className="mt-0.5 block truncate text-xs text-[color:var(--ui-text-tertiary)]">{pickerColor.toUpperCase()}</span>
                </span>
              </span>
              <span
                className={`h-8 w-8 shrink-0 rounded-full border transition-transform ${
                  isPickerOpen ? 'scale-110 border-[#fff]/70' : 'border-[#fff]/30'
                }`}
                style={{ backgroundColor: pickerColor }}
                aria-hidden="true"
              />
            </button>

            {isPickerOpen ? (
              <div className="ha-light-color-picker border-t border-[color:var(--ui-separator)] px-3.5 pb-3.5 pt-3">
                <HexColorPicker color={pickerColor} onChange={handlePickerChange} />
                <div className="mt-3 flex items-center gap-3">
                  <HexColorInput
                    color={pickerColor}
                    onChange={handlePickerChange}
                    prefixed
                    className="ha-light-color-picker__input"
                    aria-label={t('controls.light.hex')}
                  />
                  <span
                    className="ha-light-color-picker__swatch"
                    style={{ backgroundColor: pickerColor }}
                    aria-hidden="true"
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {hasAdvancedControls ? (
        <div className={`${CONTEXT_PANEL_LAYOUT.section} mt-auto space-y-4`}>
          <div className="flex items-center gap-2 text-[color:var(--ui-text-secondary)]">
            <Sparkles size={16} />
            <span className="text-sm font-medium text-[color:var(--ui-text-secondary)]">{t('controls.light.functions')}</span>
          </div>

          {supportsWhite ? (
            <div className="dashboard-content-surface-soft rounded-2xl p-3.5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="min-w-0 text-sm font-medium text-[color:var(--ui-text-primary)]">{t('controls.light.white')}</span>
                <span className="shrink-0 text-xs font-semibold text-[color:var(--ui-text-secondary)]">{Math.round(displayedWhite)}%</span>
              </div>
              <GlassSlider
                min={0}
                max={100}
                step={1}
                value={displayedWhite}
                onChange={(event) => {
                  const nextValue = clamp(Number(event.target.value), 0, 100);
                  setWhiteDraft(nextValue);
                  onWhiteChange(nextValue, commandOptions);
                }}
                aria-label={t('controls.light.whiteChannel')}
                tone="accent"
              />
            </div>
          ) : null}

          {supportsEffects && effectOptions.length > 0 ? (
            <div className="dashboard-content-surface-soft rounded-2xl p-3.5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="min-w-0 text-sm font-medium text-[color:var(--ui-text-primary)]">{t('controls.light.effects')}</span>
                <span className="truncate text-xs text-[color:var(--ui-text-tertiary)]">{lamp.effect || 'off'}</span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {effectOptions.map((effectName) => {
                  const normalizedEffect = effectName.toLowerCase();
                  const isActive = normalizedEffect === activeEffect;
                  const label = ['off', 'none'].includes(normalizedEffect) ? t('controls.light.noEffect') : effectName;
                  return (
                    <button
                      key={effectName}
                      type="button"
                      onClick={() => onEffectChange(effectName, commandOptions)}
                      className={`shrink-0 rounded-full border px-3.5 py-2 text-xs font-semibold transition-all active:scale-[0.97] ${
                        isActive
                          ? 'liquid-glass-selection border-[color:var(--ui-border-strong)] shadow-[inset_0_1px_0_rgb(var(--ui-glass-highlight-rgb)/0.18)]'
                          : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)] hover:bg-[color:var(--ui-fill-secondary)] hover:text-[color:var(--ui-text-primary)]'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {supportsFlash ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 text-sm font-medium text-[color:var(--ui-text-primary)]">Flash</span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => onFlash('short')}
                  className="glass-button min-h-11 rounded-2xl px-3 py-3 text-sm font-semibold active:scale-[0.97]"
                >
                  <Zap size={15} />
                  {t('controls.light.short')}
                </button>
                <button
                  type="button"
                  onClick={() => onFlash('long')}
                  className="glass-button min-h-11 rounded-2xl px-3 py-3 text-sm font-semibold active:scale-[0.97]"
                >
                  <Zap size={15} />
                  {t('controls.light.long')}
                </button>
              </div>
            </div>
          ) : null}

          {supportsTransition ? (
            <div className="dashboard-content-surface-soft rounded-2xl p-3.5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-sm font-medium text-[color:var(--ui-text-primary)]">
                  <Timer size={15} />
                  {t('controls.light.transition')}
                </span>
                <span className="text-xs font-semibold text-[color:var(--ui-text-secondary)]">{transitionSeconds.toFixed(transitionSeconds % 1 === 0 ? 0 : 1)}s</span>
              </div>
              <GlassSlider
                min={0}
                max={10}
                step={0.5}
                value={transitionSeconds}
                onChange={(event) => setTransitionSeconds(clamp(Number(event.target.value), 0, 10))}
                aria-label={t('controls.light.transitionDuration')}
                tone="accent"
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export const LightControls = LightControlsPanel;
