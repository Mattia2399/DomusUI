import { useEffect, useState } from 'react';
import { Droplets, Minus, Plus, Power } from 'lucide-react';
import type { MockEntityState } from '../../types/ha';
import { useI18n } from '../../i18n/I18nProvider';
import { clampHumidifierTarget, resolveHumidifierModel } from '../widgets/humidifierModel';
import GlassSegmentSelect from '../ui/GlassSegmentSelect';
import { CircularTemperatureSlider } from './CircularTemperatureSlider';
import { ContextPanelHeader } from './ContextPanelHeader';
import { CONTEXT_PANEL_LAYOUT } from './layoutClasses';

type Props = {
  name: string;
  entity?: MockEntityState;
  commandsEnabled?: boolean;
  onPowerToggle: () => void;
  onTargetHumidityChange: (humidity: number) => void;
  onModeChange: (mode: string) => void;
};

export function HumidifierControls({
  name,
  entity,
  commandsEnabled = true,
  onPowerToggle,
  onTargetHumidityChange,
  onModeChange,
}: Props) {
  const { t } = useI18n();
  const model = resolveHumidifierModel(entity);
  const [localTarget, setLocalTarget] = useState<number | null>(null);
  const pending = Object.values(model.pending).some((value) => value !== undefined);
  const target = localTarget ?? model.targetHumidity ?? model.minHumidity;
  const modeOptions = model.availableModes.map((mode) => ({ value: mode, label: mode }));
  const stateLabel = !model.available
    ? t('humidifier.state.unavailable')
    : pending
      ? t('humidifier.state.pending')
      : !model.isOn
        ? t('humidifier.state.off')
      : model.action === 'humidifying'
        ? t('humidifier.state.humidifying')
        : model.action === 'drying'
          ? t('humidifier.state.drying')
          : model.action === 'idle'
            ? t('humidifier.state.idle')
            : model.isOn
              ? t('humidifier.state.on')
              : t('humidifier.state.off');

  useEffect(() => {
    if (!pending) setLocalTarget(null);
  }, [model.targetHumidity, pending]);

  const applyTarget = (value: number, commit = false) => {
    if (!commandsEnabled || !model.canSetHumidity || pending) return;
    const next = clampHumidifierTarget(value, model.minHumidity, model.maxHumidity, model.targetHumidityStep);
    setLocalTarget(next);
    if (commit && next !== model.targetHumidity) onTargetHumidityChange(next);
  };

  return (
    <div className={CONTEXT_PANEL_LAYOUT.shell} aria-busy={pending || undefined}>
      <ContextPanelHeader title={name} subtitle={stateLabel} icon={<Droplets size={23} />} />

      <section className={CONTEXT_PANEL_LAYOUT.section}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-[color:var(--ui-text-primary)]">{t('humidifier.controls.power')}</h3>
            <p className="text-sm text-[color:var(--ui-text-secondary)]">{stateLabel}</p>
          </div>
          <button
            type="button"
            className="glass-icon-button h-11 w-11"
            aria-label={model.isOn ? t('humidifier.controls.turnOff') : t('humidifier.controls.turnOn')}
            aria-pressed={model.isOn}
            disabled={!commandsEnabled || pending || !model.available}
            onClick={onPowerToggle}
          ><Power size={19} /></button>
        </div>
      </section>

      {model.canSetHumidity ? (
        <section className={CONTEXT_PANEL_LAYOUT.section}>
          <CircularTemperatureSlider
            value={target}
            min={model.minHumidity}
            max={model.maxHumidity}
            step={model.targetHumidityStep}
            unit="%"
            label={t('humidifier.controls.target')}
            accentColor="#64D2FF"
            glowFilter="drop-shadow(0 0 14px rgba(100,210,255,0.34))"
            pending={pending}
            disabled={!commandsEnabled || pending}
            className="mx-auto w-full max-w-[17rem]"
            onChange={(value) => applyTarget(value)}
            onCommit={(value) => applyTarget(value, true)}
          >
            <div className="flex h-[72%] w-[72%] flex-col items-center justify-center rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-secondary)] px-3 text-center">
              <div className="flex items-start">
                <span className="text-4xl font-light leading-none text-[color:var(--ui-text-primary)]">{Math.round(target)}</span>
                <span className="text-sm text-[color:var(--ui-text-secondary)]">%</span>
              </div>
              <p className="mt-1 text-xs text-[color:var(--ui-text-tertiary)]">
                {model.currentHumidity !== undefined
                  ? t('humidifier.controls.current', { value: Math.round(model.currentHumidity) })
                  : t('humidifier.controls.currentUnavailable')}
              </p>
            </div>
          </CircularTemperatureSlider>
          <div className="liquid-segmented-control mt-2">
            <div className="grid grid-cols-[3rem_minmax(0,1fr)_3rem] items-center gap-1">
              <button type="button" className="flex h-11 items-center justify-center rounded-full" aria-label={t('humidifier.controls.decrease')} disabled={!commandsEnabled || pending} onClick={() => applyTarget(target - model.targetHumidityStep, true)}><Minus size={18} /></button>
              <div className="liquid-segmented-thumb flex h-11 items-center justify-center text-xs font-semibold">{Math.round(target)}%</div>
              <button type="button" className="flex h-11 items-center justify-center rounded-full" aria-label={t('humidifier.controls.increase')} disabled={!commandsEnabled || pending} onClick={() => applyTarget(target + model.targetHumidityStep, true)}><Plus size={18} /></button>
            </div>
          </div>
        </section>
      ) : null}

      {model.canSetMode ? (
        <section className={CONTEXT_PANEL_LAYOUT.section}>
          <h3 className="mb-3 font-semibold text-[color:var(--ui-text-primary)]">{t('humidifier.controls.mode')}</h3>
          <GlassSegmentSelect
            ariaLabel={t('humidifier.controls.mode')}
            options={modeOptions}
            value={model.mode}
            scrollable={modeOptions.length > 3}
            disabled={!commandsEnabled || pending}
            onChange={onModeChange}
          />
        </section>
      ) : null}
    </div>
  );
}
