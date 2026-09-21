import React, { useEffect, useMemo } from 'react';
import type { Widget } from '../../types/dashboardModels';
import type { MockEntityState } from '../../types/ha';
import { useObservedElementSize } from '../../hooks/useObservedElementSize';
import { SensorCardView } from './SensorCardView';
import { BinarySensorCardView } from './BinarySensorCardView';
import { buildSensorCardModel } from './sensorCardModel';
import { resolveBinarySensorPresentation } from './binarySensorPresentation';
import {
  resolveSensorPixelDisplayVariant,
  type WidgetDisplayMetrics,
} from './widgetDisplayVariant';
import { useI18n } from '../../i18n/I18nProvider';

type SensorCardProps = {
  widget: Widget;
  isSelected: boolean;
  value?: number;
  sensorHistory?: number[];
  isEditMode: boolean;
  onClick: () => void;
  liveEntity?: MockEntityState;
  batteryEntity?: MockEntityState;
  onDisplayMetricsChange?: (metrics: WidgetDisplayMetrics) => void;
};

export function SensorCard({
  widget,
  isSelected,
  value,
  sensorHistory,
  isEditMode,
  onClick,
  liveEntity,
  batteryEntity,
  onDisplayMetricsChange,
}: SensorCardProps) {
  const { locale } = useI18n();
  const { ref: cardRef, size: observedSize } = useObservedElementSize<HTMLDivElement>(widget.id);
  const measuredSize = observedSize?.identity === widget.id ? observedSize : null;
  const measuredVariant = measuredSize
    ? resolveSensorPixelDisplayVariant({ width: measuredSize.width, height: measuredSize.height })
    : null;
  const isBinarySensor = widget.entityId.startsWith('binary_sensor.');
  const model = useMemo(
    () => isBinarySensor ? null : buildSensorCardModel({ widget, value, sensorHistory, liveEntity, batteryEntity, locale }),
    [batteryEntity, isBinarySensor, liveEntity, locale, sensorHistory, value, widget],
  );
  const binaryPresentation = useMemo(
    () => isBinarySensor
      ? resolveBinarySensorPresentation(
          liveEntity?.state ?? (widget.dataSource === 'mock' ? undefined : 'unavailable'),
          liveEntity?.rawAttributes?.device_class,
          locale,
        )
      : null,
    [isBinarySensor, liveEntity, locale, widget.dataSource],
  );

  useEffect(() => {
    if (!measuredSize || !measuredVariant || !onDisplayMetricsChange) {
      return;
    }
    onDisplayMetricsChange({
      widgetId: widget.id,
      width: measuredSize.width,
      height: measuredSize.height,
      variant: measuredVariant,
    });
  }, [measuredSize, measuredVariant, onDisplayMetricsChange, widget.id]);

  return binaryPresentation ? (
    <BinarySensorCardView
      title={widget.title}
      presentation={binaryPresentation}
      isSelected={isSelected}
      isEditMode={isEditMode}
      onClick={onClick}
      rootRef={cardRef}
    />
  ) : model ? (
    <SensorCardView
      model={model}
      isSelected={isSelected}
      isEditMode={isEditMode}
      onClick={onClick}
      rootRef={cardRef}
    />
  ) : null;
}
