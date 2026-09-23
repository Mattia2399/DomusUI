import { useEffect, useState } from 'react';
import { DropletOff, Droplets, SlidersHorizontal } from 'lucide-react';
import { useObservedElementSize } from '../../hooks/useObservedElementSize';
import { useI18n } from '../../i18n/I18nProvider';
import type { Widget } from '../../types/dashboardModels';
import type { MockEntityState } from '../../types/ha';
import { HUMIDIFIER_CARD_CAPABILITY } from './cardCapabilityRegistry';
import { clampHumidifierTarget, resolveHumidifierModel } from './humidifierModel';
import { CardValueSlider } from './CardValueSlider';
import { DeviceControlCardHeader } from './DeviceControlCardHeader';
import GlassSegmentSelect from '../ui/GlassSegmentSelect';
import type { WidgetDisplayMetrics } from './widgetDisplayVariant';
import './HumidifierCard.css';

type Props = {
  widget: Widget;
  entity?: MockEntityState;
  isSelected: boolean;
  isEditMode: boolean;
  onOpen: () => void;
  onPowerToggle?: () => void;
  onTargetHumidityChange?: (value: number) => void;
  onModeChange?: (mode: string) => void;
  displayVariant?: WidgetDisplayMetrics['variant'];
  onDisplayMetricsChange?: (metrics: WidgetDisplayMetrics) => void;
};

type HumidifierCardControl = 'humidity' | 'mode';

export function HumidifierCard({ widget, entity, isSelected, isEditMode, onOpen, onPowerToggle, onTargetHumidityChange, onModeChange, displayVariant = 'standard', onDisplayMetricsChange }: Props) {
  const { t } = useI18n();
  const model = resolveHumidifierModel(entity);
  const { ref, size } = useObservedElementSize<HTMLDivElement>(widget.id);
  const measured = size?.identity === widget.id ? size : null;
  const [localTarget, setLocalTarget] = useState<number | null>(null);
  const [controlMode, setControlMode] = useState<HumidifierCardControl>('humidity');
  const target = localTarget ?? model.targetHumidity;
  const controls: HumidifierCardControl[] = [
    ...(model.canSetHumidity ? ['humidity' as const] : []),
    ...(model.canSetMode ? ['mode' as const] : []),
  ];
  const activeControl = controls.includes(controlMode) ? controlMode : controls[0];
  const nextControl = controls.length > 1 ? controls[(controls.indexOf(activeControl) + 1) % controls.length] : undefined;
  const pending = Object.values(model.pending).some((value) => value !== undefined);
  const dehumidifier = model.deviceClass === 'dehumidifier';

  useEffect(() => {
    if (!measured || !onDisplayMetricsChange) return;
    onDisplayMetricsChange({ widgetId: widget.id, width: measured.width, height: measured.height, variant: HUMIDIFIER_CARD_CAPABILITY.resolvePixelDisplayVariant({ width: measured.width, height: measured.height }) });
  }, [measured, onDisplayMetricsChange, widget.id]);
  useEffect(() => {
    if (!pending) setLocalTarget(null);
  }, [model.targetHumidity, pending]);

  const actionKey = !model.available ? 'humidifier.state.unavailable'
    : pending ? 'humidifier.state.pending'
      : !model.isOn ? 'humidifier.state.off'
      : model.action === 'humidifying' ? 'humidifier.state.humidifying'
        : model.action === 'drying' ? 'humidifier.state.drying'
          : model.action === 'idle' ? 'humidifier.state.idle'
            : model.isOn ? 'humidifier.state.on' : 'humidifier.state.off';
  const snapTarget = (value: number) => clampHumidifierTarget(value, model.minHumidity, model.maxHumidity, model.targetHumidityStep);
  const commitTarget = (value: number) => {
    const next = snapTarget(value);
    if (next !== model.targetHumidity) onTargetHumidityChange?.(next);
    setLocalTarget(null);
  };
  const activeDetail = model.isOn
    ? model.currentHumidity !== undefined
      ? `${Math.round(model.currentHumidity)}%`
      : target !== undefined
        ? t('humidifier.controls.targetCompact', { value: Math.round(target) })
        : model.mode
    : undefined;

  return (
    <div ref={ref} className={`humidifier-card adaptive-device-card ${isSelected ? 'selection-corners' : ''}`} data-display-variant={displayVariant} data-humidifier-state={!model.available ? 'unavailable' : model.isOn ? 'on' : 'off'} data-humidifier-control-mode={activeControl ?? 'none'} data-humidifier-display-variant={displayVariant} data-humidifier-device={model.deviceClass} aria-busy={pending || undefined}>
      <div className="humidifier-card__surface adaptive-device-card__surface liquid-glass-card">
      <DeviceControlCardHeader
        title={widget.title}
        status={`${t(actionKey)}${activeDetail ? ` · ${activeDetail}` : ''}`}
        icon={dehumidifier ? <DropletOff aria-hidden="true" /> : <Droplets aria-hidden="true" />}
        onOpen={onOpen}
        openLabel={t(dehumidifier ? 'humidifier.card.openDehumidifier' : 'humidifier.card.open')}
        onToggle={onPowerToggle}
        toggleLabel={t(model.isOn
          ? dehumidifier ? 'humidifier.controls.turnOffDehumidifier' : 'humidifier.controls.turnOff'
          : dehumidifier ? 'humidifier.controls.turnOnDehumidifier' : 'humidifier.controls.turnOn')}
        isOn={model.isOn}
        toggleDisabled={isEditMode || pending || !model.available}
        secondaryIcon={nextControl === 'mode' ? <SlidersHorizontal aria-hidden="true" /> : nextControl === 'humidity' ? <Droplets aria-hidden="true" /> : undefined}
        secondaryLabel={nextControl === 'mode' ? t('humidifier.controls.mode') : nextControl === 'humidity' ? t('humidifier.controls.target') : undefined}
        secondaryDisabled={isEditMode || pending || !model.isOn}
        onSecondaryClick={nextControl ? () => {
          setLocalTarget(null);
          setControlMode(nextControl);
        } : undefined}
      />
      {target !== undefined || model.currentHumidity !== undefined ? (
        <div className="humidifier-card__values">
          {target !== undefined ? <div><small>{t('humidifier.controls.target')}</small><strong>{Math.round(target)}%</strong></div> : null}
          {model.currentHumidity !== undefined ? <div><small>{t('humidifier.controls.current', { value: Math.round(model.currentHumidity) })}</small></div> : null}
        </div>
      ) : null}
      {controls.length > 0 ? (
        <div className="humidifier-card__controls" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
          {model.canSetHumidity && target !== undefined ? <div className="humidifier-card__control humidifier-card__control--humidity" data-active={activeControl === 'humidity' ? 'true' : 'false'}><CardValueSlider
            value={target}
            min={model.minHumidity}
            max={model.maxHumidity}
            step={model.targetHumidityStep}
            label={t('humidifier.controls.target')}
            valueText={`${Math.round(target)}%`}
            tone="humidity"
            markerValue={model.currentHumidity}
            disabled={pending || isEditMode || !model.isOn || !onTargetHumidityChange}
            snap={snapTarget}
            onPreview={setLocalTarget}
            onCommit={commitTarget}
            onCancel={() => setLocalTarget(null)}
          /></div> : null}
          {model.canSetMode ? <div className="humidifier-card__control humidifier-card__control--mode" data-active={activeControl === 'mode' ? 'true' : 'false'}><GlassSegmentSelect
            className="card-control-track card-control-track--segments"
            ariaLabel={t('humidifier.controls.mode')}
            options={model.availableModes.map((mode) => ({ value: mode, label: mode }))}
            value={model.mode}
            scrollable={model.availableModes.length > 3}
            disabled={isEditMode || pending || !model.isOn || !onModeChange}
            onChange={(mode) => onModeChange?.(mode)}
          /></div> : null}
        </div>
      ) : null}
      </div>
      {isEditMode ? <button type="button" className="humidifier-card__edit adaptive-device-card__edit widget-card-handle" onClick={onOpen} aria-label={t(dehumidifier ? 'humidifier.card.configureDehumidifier' : 'humidifier.card.configure')} /> : null}
    </div>
  );
}
