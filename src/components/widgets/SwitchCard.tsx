import React, { useEffect, useMemo } from 'react';
import { useObservedElementSize } from '../../hooks/useObservedElementSize';
import type { Widget } from '../../types/dashboardModels';
import type { MockEntityState } from '../../types/ha';
import { SwitchCardView } from './SwitchCardView';
import { buildSwitchCardModel } from './switchCardModel';
import {
  resolveSwitchPixelDisplayVariant,
  type WidgetDisplayMetrics,
} from './widgetDisplayVariant';
import { useI18n } from '../../i18n/I18nProvider';

type SwitchCardProps = {
  widget: Widget;
  isSelected: boolean;
  isEditMode: boolean;
  onClick: () => void;
  onToggleSwitch?: () => void;
  liveEntity?: MockEntityState;
  consumptionEntity?: MockEntityState;
  onDisplayMetricsChange?: (metrics: WidgetDisplayMetrics) => void;
};

export function SwitchCard({
  widget,
  isSelected,
  isEditMode,
  onClick,
  onToggleSwitch,
  liveEntity,
  consumptionEntity,
  onDisplayMetricsChange,
}: SwitchCardProps) {
  const { locale } = useI18n();
  const { ref: cardRef, size: observedSize } = useObservedElementSize<HTMLDivElement>(widget.id);
  const measuredSize = observedSize?.identity === widget.id ? observedSize : null;
  const measuredVariant = measuredSize
    ? resolveSwitchPixelDisplayVariant({ width: measuredSize.width, height: measuredSize.height })
    : null;
  const model = useMemo(
    () => buildSwitchCardModel({ widget, liveEntity, consumptionEntity, locale }),
    [consumptionEntity, liveEntity, locale, widget],
  );

  useEffect(() => {
    if (!measuredSize || !measuredVariant || !onDisplayMetricsChange) return;
    onDisplayMetricsChange({
      widgetId: widget.id,
      width: measuredSize.width,
      height: measuredSize.height,
      variant: measuredVariant,
    });
  }, [measuredSize, measuredVariant, onDisplayMetricsChange, widget.id]);

  return (
    <SwitchCardView
      model={model}
      isSelected={isSelected}
      isEditMode={isEditMode}
      onToggle={onToggleSwitch ?? onClick}
      onOpen={onClick}
      rootRef={cardRef}
    />
  );
}
