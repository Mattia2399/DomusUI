import React, { useEffect, useMemo } from 'react';
import { useObservedElementSize } from '../../hooks/useObservedElementSize';
import type { Widget } from '../../types/dashboardModels';
import type { MockEntityState } from '../../types/ha';
import type { GridEngineBreakpoint } from '../dashboard/dashboardBreakpointConfig';
import { CoverCardView } from './CoverCardView';
import { buildCoverCardModel } from './coverCardModel';
import {
  resolveCoverPixelDisplayVariant,
  type WidgetDisplayMetrics,
  type WidgetDisplayVariant,
} from './widgetDisplayVariant';
import { useI18n } from '../../i18n/I18nProvider';

type CoverCardProps = {
  widget: Widget;
  isSelected: boolean;
  isEditMode: boolean;
  onClick: () => void;
  liveEntity?: MockEntityState;
  gridBreakpoint?: GridEngineBreakpoint;
  displayVariant?: WidgetDisplayVariant;
  onDisplayMetricsChange?: (metrics: WidgetDisplayMetrics) => void;
  onPositionChange?: (position: number) => void;
  onTiltPositionChange?: (position: number) => void;
  onOpenCover?: () => void;
  onStopCover?: () => void;
  onCloseCover?: () => void;
};

export function CoverCard({
  widget,
  isSelected,
  isEditMode,
  onClick,
  liveEntity,
  onDisplayMetricsChange,
  onPositionChange,
  onTiltPositionChange,
  onOpenCover,
  onStopCover,
  onCloseCover,
}: CoverCardProps) {
  const { locale } = useI18n();
  const { ref: cardRef, size: observedSize } = useObservedElementSize<HTMLDivElement>(widget.id);
  const measuredSize = observedSize?.identity === widget.id ? observedSize : null;
  const model = useMemo(() => buildCoverCardModel({ widget, liveEntity, locale }), [liveEntity, locale, widget]);

  useEffect(() => {
    if (!measuredSize || !onDisplayMetricsChange) {
      return;
    }
    onDisplayMetricsChange({
      widgetId: widget.id,
      width: measuredSize.width,
      height: measuredSize.height,
      variant: resolveCoverPixelDisplayVariant({ width: measuredSize.width, height: measuredSize.height }),
    });
  }, [measuredSize, onDisplayMetricsChange, widget.id]);

  return (
    <CoverCardView
      model={model}
      isSelected={isSelected}
      isEditMode={isEditMode}
      rootRef={cardRef}
      onOpen={onClick}
      onPositionChange={onPositionChange}
      onTiltPositionChange={onTiltPositionChange}
      onOpenCover={onOpenCover}
      onStopCover={onStopCover}
      onCloseCover={onCloseCover}
    />
  );
}
