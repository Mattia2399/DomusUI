import { useEffect, useState } from 'react';
import { ArrowLeftRight, Fan, Gauge, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useObservedElementSize } from '../../hooks/useObservedElementSize';
import { useI18n } from '../../i18n/I18nProvider';
import type { Widget } from '../../types/dashboardModels';
import type { MockEntityState } from '../../types/ha';
import { FAN_CARD_CAPABILITY } from './cardCapabilityRegistry';
import { quantizeFanPercentage, resolveFanModel } from './fanModel';
import { CardValueSlider } from './CardValueSlider';
import { DeviceControlCardHeader } from './DeviceControlCardHeader';
import GlassSegmentSelect from '../ui/GlassSegmentSelect';
import type { WidgetDisplayMetrics } from './widgetDisplayVariant';
import './FanCard.css';

type FanCardProps = {
  widget: Widget;
  entity?: MockEntityState;
  isSelected: boolean;
  isEditMode: boolean;
  onOpen: () => void;
  onPowerToggle?: () => void;
  onPercentageChange?: (percentage: number) => void;
  onPresetChange?: (mode: string) => void;
  onOscillationChange?: (oscillating: boolean) => void;
  onDirectionChange?: (direction: 'forward' | 'reverse') => void;
  onDisplayMetricsChange?: (metrics: WidgetDisplayMetrics) => void;
};

type FanCardControl = 'speed' | 'preset' | 'oscillation' | 'direction';

export function FanCard({
  widget,
  entity,
  isSelected,
  isEditMode,
  onOpen,
  onPowerToggle,
  onPercentageChange,
  onPresetChange,
  onOscillationChange,
  onDirectionChange,
  onDisplayMetricsChange,
}: FanCardProps) {
  const { t } = useI18n();
  const model = resolveFanModel(entity);
  const { ref, size } = useObservedElementSize<HTMLDivElement>(widget.id);
  const measuredSize = size?.identity === widget.id ? size : null;
  const [dragValue, setDragValue] = useState<number | null>(null);
  const [controlMode, setControlMode] = useState<FanCardControl>('speed');
  const percentage = dragValue ?? model.percentage;
  const controls: FanCardControl[] = [
    ...(model.canSetSpeed ? ['speed' as const] : []),
    ...(model.canSetPreset ? ['preset' as const] : []),
    ...(model.canOscillate ? ['oscillation' as const] : []),
    ...(model.canSetDirection ? ['direction' as const] : []),
  ];
  const activeControl = controls.includes(controlMode) ? controlMode : controls[0];
  const nextControl = controls.length > 1 ? controls[(controls.indexOf(activeControl) + 1) % controls.length] : undefined;
  const pending = Object.values(model.pending).some((value) => value !== undefined);
  const powerSupported = model.isOn ? model.canTurnOff : model.canTurnOn;
  const canSetSpeed = !isEditMode && model.canSetSpeed && model.isOn && Boolean(onPercentageChange);

  useEffect(() => {
    if (!measuredSize || !onDisplayMetricsChange) return;
    onDisplayMetricsChange({ widgetId: widget.id, width: measuredSize.width, height: measuredSize.height, variant: FAN_CARD_CAPABILITY.resolvePixelDisplayVariant({ width: measuredSize.width, height: measuredSize.height }) });
  }, [measuredSize, onDisplayMetricsChange, widget.id]);

  useEffect(() => {
    if (model.pending.percentage !== undefined || !model.available) setDragValue(null);
  }, [model.available, model.pending.percentage]);

  const commitSpeed = (value: number) => {
    if (!canSetSpeed) return;
    const next = quantizeFanPercentage(value, model.speedCount);
    if (next !== model.percentage) onPercentageChange?.(next);
    setDragValue(null);
  };

  const stateLabel = !model.available
    ? t('fan.state.unavailable')
    : pending
      ? t('fan.state.pending')
      : model.isOn
        ? t('fan.state.on')
        : t('fan.state.off');
  const controlLabel = (mode: FanCardControl) => mode === 'speed' ? t('fan.controls.speed')
    : mode === 'preset' ? t('fan.controls.preset')
      : mode === 'oscillation' ? t('fan.controls.oscillation') : t('fan.controls.direction');
  const nextControlIcon = nextControl === 'speed' ? <Gauge aria-hidden="true" />
    : nextControl === 'preset' ? <SlidersHorizontal aria-hidden="true" />
      : nextControl === 'oscillation' ? <RotateCcw aria-hidden="true" />
        : nextControl === 'direction' ? <ArrowLeftRight aria-hidden="true" /> : undefined;
  const activeDetail = activeControl === 'speed' && percentage !== undefined ? `${Math.round(percentage)}%`
    : activeControl === 'preset' ? model.presetMode
      : activeControl === 'oscillation' ? t(model.oscillating ? 'fan.controls.oscillationOn' : 'fan.controls.oscillationOff')
        : activeControl === 'direction' ? t(model.direction === 'reverse' ? 'fan.controls.reverse' : 'fan.controls.forward') : undefined;

  return (
    <div
      ref={ref}
      className={`fan-card ${isSelected ? 'selection-corners' : ''}`}
      data-fan-state={!model.available ? 'unavailable' : model.isOn ? 'on' : 'off'}
      data-fan-control-mode={activeControl ?? 'none'}
      aria-busy={pending || undefined}
    >
      <div className="fan-card__surface liquid-glass-card">
      <DeviceControlCardHeader
        title={widget.title}
        status={`${stateLabel}${model.isOn && activeDetail ? ` · ${activeDetail}` : ''}`}
        icon={<Fan aria-hidden="true" />}
        onOpen={onOpen}
        openLabel={t('fan.card.open')}
        onToggle={onPowerToggle}
        toggleLabel={model.isOn ? t('fan.controls.turnOff') : t('fan.controls.turnOn')}
        isOn={model.isOn}
        toggleDisabled={isEditMode || !powerSupported || pending}
        secondaryIcon={nextControlIcon}
        secondaryLabel={nextControl ? controlLabel(nextControl) : undefined}
        secondaryDisabled={isEditMode || pending || !model.isOn}
        onSecondaryClick={nextControl ? () => {
          setDragValue(null);
          setControlMode(nextControl);
        } : undefined}
      />

      {controls.length > 0 ? (
        <div className="fan-card__controls" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
          {model.canSetSpeed ? (
            <div className="fan-card__speed-label">
              <span>{t('fan.card.speed')}</span>
              <strong>{percentage !== undefined ? `${Math.round(percentage)}%` : '—'}</strong>
            </div>
          ) : null}
          {model.canSetSpeed ? <div className="fan-card__control fan-card__control--speed" data-active={activeControl === 'speed' ? 'true' : 'false'}><CardValueSlider
            value={percentage ?? 0}
            min={0}
            max={100}
            step={1}
            label={t('fan.controls.speed')}
            valueText={`${Math.round(percentage ?? 0)}%`}
            tone="fan"
            segmentCount={model.speedCount}
            disabled={!canSetSpeed || pending}
            snap={(value) => quantizeFanPercentage(value, model.speedCount)}
            onPreview={setDragValue}
            onCommit={commitSpeed}
            onCancel={() => setDragValue(null)}
          /></div> : null}
          {model.canSetPreset ? <div className="fan-card__control fan-card__control--preset" data-active={activeControl === 'preset' ? 'true' : 'false'}><GlassSegmentSelect
            className="card-control-track card-control-track--segments"
            ariaLabel={t('fan.controls.preset')}
            options={model.presetModes.map((mode) => ({ value: mode, label: mode }))}
            value={model.presetMode}
            scrollable={model.presetModes.length > 3}
            disabled={isEditMode || pending || !model.isOn || !onPresetChange}
            onChange={(mode) => onPresetChange?.(mode)}
          /></div> : null}
          {model.canOscillate ? <div className="fan-card__control fan-card__control--oscillation" data-active={activeControl === 'oscillation' ? 'true' : 'false'}><GlassSegmentSelect
            className="card-control-track card-control-track--segments"
            ariaLabel={t('fan.controls.oscillation')}
            options={[
              { value: 'off', label: t('fan.controls.oscillationOff') },
              { value: 'on', label: t('fan.controls.oscillationOn') },
            ]}
            value={model.oscillating ? 'on' : 'off'}
            disabled={isEditMode || pending || !model.isOn || !onOscillationChange}
            onChange={(value) => onOscillationChange?.(value === 'on')}
          /></div> : null}
          {model.canSetDirection ? <div className="fan-card__control fan-card__control--direction" data-active={activeControl === 'direction' ? 'true' : 'false'}><GlassSegmentSelect
            className="card-control-track card-control-track--segments"
            ariaLabel={t('fan.controls.direction')}
            options={[
              { value: 'forward', label: t('fan.controls.forward') },
              { value: 'reverse', label: t('fan.controls.reverse') },
            ]}
            value={model.direction}
            disabled={isEditMode || pending || !model.isOn || !onDirectionChange}
            onChange={(value) => onDirectionChange?.(value as 'forward' | 'reverse')}
          /></div> : null}
        </div>
      ) : null}

      </div>

      {isEditMode ? (
        <button type="button" className="fan-card__edit widget-card-handle" onClick={onOpen} aria-label={t('fan.card.configure')} />
      ) : null}
    </div>
  );
}
