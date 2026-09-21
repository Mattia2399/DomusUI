import { useEffect, useState } from 'react';
import { Fan, Power } from 'lucide-react';
import type { MockEntityState } from '../../types/ha';
import { useI18n } from '../../i18n/I18nProvider';
import { resolveFanModel, quantizeFanPercentage } from '../widgets/fanModel';
import GlassSegmentSelect from '../ui/GlassSegmentSelect';
import { ContextPanelHeader } from './ContextPanelHeader';
import { CONTEXT_PANEL_LAYOUT } from './layoutClasses';
import { CircularTemperatureSlider } from './CircularTemperatureSlider';
import './FanControls.css';

type FanControlsProps = {
  name: string;
  entity?: MockEntityState;
  commandsEnabled?: boolean;
  onPowerToggle: () => void;
  onPercentageChange: (percentage: number) => void;
  onPresetChange: (mode: string) => void;
  onOscillationChange: (oscillating: boolean) => void;
  onDirectionChange: (direction: 'forward' | 'reverse') => void;
};

export function FanControls({
  name,
  entity,
  commandsEnabled = true,
  onPowerToggle,
  onPercentageChange,
  onPresetChange,
  onOscillationChange,
  onDirectionChange,
}: FanControlsProps) {
  const { t } = useI18n();
  const model = resolveFanModel(entity);
  const [dragValue, setDragValue] = useState<number | null>(null);
  const pending = Object.values(model.pending).some((value) => value !== undefined);
  const percentage = dragValue ?? model.percentage;
  const presetOptions = model.presetModes.map((mode) => ({ value: mode, label: mode }));

  useEffect(() => {
    if (model.pending.percentage !== undefined || !model.available || model.percentage === dragValue) setDragValue(null);
  }, [model.available, model.pending.percentage, model.percentage]);

  const commitSpeed = (value: number) => {
    if (!commandsEnabled || !model.canSetSpeed || pending) return;
    const next = quantizeFanPercentage(value, model.speedCount);
    if (next !== model.percentage) onPercentageChange(next);
    setDragValue(null);
  };

  const stateLabel = !model.available
    ? t('fan.state.unavailable')
    : pending
      ? t('fan.state.pending')
      : model.isOn
        ? t('fan.state.on')
        : t('fan.state.off');

  return (
    <div className={CONTEXT_PANEL_LAYOUT.shell} aria-busy={pending || undefined}>
      <ContextPanelHeader title={name} subtitle={stateLabel} icon={<Fan size={23} />} />
      <section className={CONTEXT_PANEL_LAYOUT.section}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-[color:var(--ui-text-primary)]">{t('fan.controls.power')}</h3>
            <p className="text-sm text-[color:var(--ui-text-secondary)]">{stateLabel}</p>
          </div>
          <button
            type="button"
            className="glass-icon-button h-11 w-11"
            aria-label={model.isOn ? t('fan.controls.turnOff') : t('fan.controls.turnOn')}
            aria-pressed={model.isOn}
            disabled={!commandsEnabled || pending || !(model.isOn ? model.canTurnOff : model.canTurnOn)}
            onClick={onPowerToggle}
          ><Power size={19} /></button>
        </div>
      </section>

      {model.canSetSpeed ? (
        <section className={CONTEXT_PANEL_LAYOUT.section}>
          <h3 className="mb-2 font-semibold text-[color:var(--ui-text-primary)]">{t('fan.controls.speed')}</h3>
          <CircularTemperatureSlider
            value={percentage}
            min={0}
            max={100}
            step={model.speedCount && model.speedCount <= 12 ? 100 / model.speedCount : 1}
            unit="%"
            label={t('fan.controls.speed')}
            accentColor="var(--ui-accent)"
            segmentCount={model.speedCount}
            pending={pending}
            disabled={!commandsEnabled || pending || !model.available}
            className="mx-auto w-full max-w-[17rem]"
            onChange={(value) => setDragValue(quantizeFanPercentage(value, model.speedCount))}
            onCommit={commitSpeed}
          >
            <div className="flex h-[68%] w-[68%] flex-col items-center justify-center rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-secondary)] text-center">
              <Fan size={32} strokeWidth={1.5} className={`mb-2 text-[color:var(--ui-accent)] ${model.isOn ? 'fan-panel__rotor--active' : ''}`} aria-hidden="true" />
              <strong className="text-3xl font-light tabular-nums text-[color:var(--ui-text-primary)]">{Math.round(percentage ?? 0)}%</strong>
            </div>
          </CircularTemperatureSlider>
          <p className="mt-2 text-center text-xs text-[color:var(--ui-text-secondary)]">{t('fan.controls.speedDescription')}</p>
        </section>
      ) : null}

      {model.canSetPreset ? (
        <section className={CONTEXT_PANEL_LAYOUT.section}>
          <h3 className="mb-3 font-semibold text-[color:var(--ui-text-primary)]">{t('fan.controls.preset')}</h3>
          <GlassSegmentSelect
            ariaLabel={t('fan.controls.preset')}
            options={presetOptions}
            value={model.presetMode}
            scrollable={presetOptions.length > 3}
            disabled={!commandsEnabled || pending || !model.available}
            onChange={onPresetChange}
          />
        </section>
      ) : null}

      {model.canOscillate || model.canSetDirection ? (
        <section className={CONTEXT_PANEL_LAYOUT.section}>
          {model.canOscillate ? (
            <div>
              <h3 className="mb-3 font-semibold text-[color:var(--ui-text-primary)]">{t('fan.controls.oscillation')}</h3>
              <GlassSegmentSelect
                ariaLabel={t('fan.controls.oscillation')}
                options={[
                  { value: 'off', label: t('fan.controls.oscillationOff') },
                  { value: 'on', label: t('fan.controls.oscillationOn') },
                ]}
                value={model.oscillating ? 'on' : 'off'}
                disabled={!commandsEnabled || pending || !model.available}
                onChange={(value) => onOscillationChange(value === 'on')}
              />
            </div>
          ) : null}
          {model.canSetDirection ? (
            <div className={model.canOscillate ? 'mt-5' : ''}>
              <h3 className="mb-3 font-semibold text-[color:var(--ui-text-primary)]">{t('fan.controls.direction')}</h3>
              <GlassSegmentSelect
                ariaLabel={t('fan.controls.direction')}
                options={[
                  { value: 'forward', label: t('fan.controls.forward') },
                  { value: 'reverse', label: t('fan.controls.reverse') },
                ]}
                value={model.direction}
                disabled={!commandsEnabled || pending || !model.available}
                onChange={(value) => onDirectionChange(value as 'forward' | 'reverse')}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      {model.available && !model.canSetSpeed && !model.canSetPreset && !model.canOscillate && !model.canSetDirection ? (
        <p className="text-sm text-[color:var(--ui-text-secondary)]">{t('fan.controls.unsupported')}</p>
      ) : null}
    </div>
  );
}
