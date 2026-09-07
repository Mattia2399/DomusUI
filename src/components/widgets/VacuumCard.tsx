import React, { useEffect, useMemo } from 'react';
import { useObservedElementSize } from '../../hooks/useObservedElementSize';
import type { Widget } from '../../types/dashboardModels';
import type { MockEntityState } from '../../types/ha';
import type { GridEngineBreakpoint } from '../dashboard/dashboardBreakpointConfig';
import { buildVacuumCardModel } from './vacuumCardModel';
import { VacuumCardView } from './VacuumCardView';
import {
  resolveVacuumPixelDisplayVariant,
  resolveWidgetDisplayVariant,
  type WidgetDisplayMetrics,
  type WidgetDisplayVariant,
} from './widgetDisplayVariant';
import { useI18n } from '../../i18n/I18nProvider';

type VacuumCardProps = {
  widget: Widget;
  isSelected: boolean;
  isEditMode: boolean;
  onClick: () => void;
  onStartPause?: () => void;
  onStop?: () => void;
  onReturnToBase?: () => void;
  liveEntity?: MockEntityState;
  gridBreakpoint?: GridEngineBreakpoint;
  displayVariant?: WidgetDisplayVariant;
  onDisplayMetricsChange?: (metrics: WidgetDisplayMetrics) => void;
};

export function VacuumCard({
  widget,
  isSelected,
  isEditMode,
  onClick,
  onStartPause,
  onStop,
  onReturnToBase,
  liveEntity,
  gridBreakpoint,
  displayVariant,
  onDisplayMetricsChange,
}: VacuumCardProps) {
  const { locale } = useI18n();
  const fallbackVariant = displayVariant ?? resolveWidgetDisplayVariant({
    kind: 'vacuum',
    breakpoint: gridBreakpoint,
    layout: widget.layout,
    parentSectionId: widget.parentSectionId,
  });
  const { ref: cardRef, size: observedSize } = useObservedElementSize<HTMLDivElement>(widget.id);
  const measuredSize = observedSize?.identity === widget.id ? observedSize : null;
  const layoutVariant = measuredSize
    ? resolveVacuumPixelDisplayVariant({ width: measuredSize.width, height: measuredSize.height })
    : fallbackVariant;
  const model = useMemo(() => buildVacuumCardModel({ widget, liveEntity, locale }), [liveEntity, locale, widget]);

  useEffect(() => {
    if (!measuredSize || !onDisplayMetricsChange) return;
    onDisplayMetricsChange({
      widgetId: widget.id,
      width: measuredSize.width,
      height: measuredSize.height,
      variant: layoutVariant,
    });
  }, [layoutVariant, measuredSize, onDisplayMetricsChange, widget.id]);

  return (
    <VacuumCardView
      model={model}
      layoutVariant={layoutVariant}
      isSelected={isSelected}
      isEditMode={isEditMode}
      rootRef={cardRef}
      onOpen={onClick}
      onStartPause={onStartPause}
      onStop={onStop}
      onReturnToBase={onReturnToBase}
    />
  );
}
