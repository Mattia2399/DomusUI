import React, { useEffect, useMemo } from 'react';
import { useCan } from '../../security/AccessControlProvider';
import { isPhysicalAccessCover } from '../../security/entityControlAccess';
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
  gridBreakpoint,
  displayVariant,
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
  const builtModel = useMemo(() => buildCoverCardModel({ widget, liveEntity, locale }), [liveEntity, locale, widget]);
  // A gate, a garage or a motorized door is physical access (access.control): without it the
  // card shows where the cover is and offers no command.
  const canControlAccess = useCan('access.control');
  const readOnly = isPhysicalAccessCover(builtModel.deviceClass) && !canControlAccess;
  const model = useMemo(
    () =>
      readOnly
        ? {
            ...builtModel,
            supportsSetPosition: false,
            supportsSetTiltPosition: false,
            supportsOpen: false,
            supportsStop: false,
            supportsClose: false,
            supportsOpenTilt: false,
            supportsCloseTilt: false,
          }
        : builtModel,
    [builtModel, readOnly],
  );
  const effectiveDisplayVariant =
    displayVariant ??
    (measuredSize
      ? resolveCoverPixelDisplayVariant({ width: measuredSize.width, height: measuredSize.height })
      : undefined);

  useEffect(() => {
    if (!measuredSize || !onDisplayMetricsChange) {
      return;
    }
    onDisplayMetricsChange({
      widgetId: widget.id,
      width: measuredSize.width,
      height: measuredSize.height,
      variant: effectiveDisplayVariant ?? resolveCoverPixelDisplayVariant({ width: measuredSize.width, height: measuredSize.height }),
    });
  }, [effectiveDisplayVariant, measuredSize, onDisplayMetricsChange, widget.id]);

  return (
    <CoverCardView
      model={model}
      isSelected={isSelected}
      isEditMode={isEditMode}
      displayVariant={effectiveDisplayVariant}
      gridBreakpoint={gridBreakpoint}
      rootRef={cardRef}
      onOpen={onClick}
      onPositionChange={readOnly ? undefined : onPositionChange}
      onTiltPositionChange={readOnly ? undefined : onTiltPositionChange}
      onOpenCover={readOnly ? undefined : onOpenCover}
      onStopCover={readOnly ? undefined : onStopCover}
      onCloseCover={readOnly ? undefined : onCloseCover}
    />
  );
}
