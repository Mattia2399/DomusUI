import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useCan } from '../../security/AccessControlProvider';
import { useObservedElementSize } from '../../hooks/useObservedElementSize';
import type { Widget } from '../../types/dashboardModels';
import type { MockEntityState } from '../../types/ha';
import type { GridEngineBreakpoint } from '../dashboard/dashboardBreakpointConfig';
import { AlarmCardView } from './AlarmCardView';
import { buildAlarmCardModel, type AlarmArmMode } from './alarmCardModel';
import {
  resolveAlarmPixelDisplayVariant,
  resolveWidgetDisplayVariant,
  type WidgetDisplayMetrics,
  type WidgetDisplayVariant,
} from './widgetDisplayVariant';

type AlarmCardProps = {
  widget: Widget;
  isSelected: boolean;
  isEditMode: boolean;
  onClick: () => void;
  onQuickDisarm?: () => void;
  onQuickArm?: (mode: AlarmArmMode) => void;
  liveEntity?: MockEntityState;
  gridBreakpoint?: GridEngineBreakpoint;
  displayVariant?: WidgetDisplayVariant;
  onDisplayMetricsChange?: (metrics: WidgetDisplayMetrics) => void;
};

export function AlarmCard({
  widget,
  isSelected,
  isEditMode,
  onClick,
  onQuickDisarm,
  onQuickArm,
  liveEntity,
  gridBreakpoint,
  displayVariant,
  onDisplayMetricsChange,
}: AlarmCardProps) {
  const fallbackVariant = displayVariant ?? resolveWidgetDisplayVariant({
    kind: 'alarm',
    breakpoint: gridBreakpoint,
    layout: widget.layout,
    parentSectionId: widget.parentSectionId,
  });
  const { ref: cardRef, size: observedSize } = useObservedElementSize<HTMLDivElement>(widget.id);
  const measuredSize = observedSize?.identity === widget.id ? observedSize : null;
  const layoutVariant = measuredSize
    ? resolveAlarmPixelDisplayVariant({ width: measuredSize.width, height: measuredSize.height })
    : fallbackVariant;
  const model = useMemo(() => buildAlarmCardModel(widget, liveEntity), [liveEntity, widget]);
  const canControl = useCan('security.control');
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false);
  const [selectedArmMode, setSelectedArmMode] = useState<AlarmArmMode | undefined>(
    model.activeMode ?? model.supportedModes[0]?.id,
  );
  const previousActiveModeRef = useRef<AlarmArmMode | undefined>(model.activeMode);

  useEffect(() => {
    if (isEditMode || model.isTransitioning || model.isUnavailable) {
      setIsModeMenuOpen(false);
    }
  }, [isEditMode, model.isTransitioning, model.isUnavailable]);

  useEffect(() => {
    const previousActiveMode = previousActiveModeRef.current;
    const activeModeChanged = previousActiveMode !== model.activeMode;
    previousActiveModeRef.current = model.activeMode;

    setSelectedArmMode((current) => {
      const currentIsSupported = Boolean(current && model.supportedModes.some((mode) => mode.id === current));

      if (model.activeMode && (activeModeChanged || !currentIsSupported)) {
        return model.activeMode;
      }

      if (!model.activeMode && !currentIsSupported) {
        return model.supportedModes[0]?.id;
      }

      return current;
    });
  }, [model.activeMode, model.supportedModes]);

  useEffect(() => {
    if (!measuredSize || !onDisplayMetricsChange) return;
    onDisplayMetricsChange({
      widgetId: widget.id,
      width: measuredSize.width,
      height: measuredSize.height,
      variant: layoutVariant,
    });
  }, [layoutVariant, measuredSize, onDisplayMetricsChange, widget.id]);

  const arm = (mode: AlarmArmMode) => {
    setIsModeMenuOpen(false);
    if (onQuickArm) {
      onQuickArm(mode);
      return;
    }
    onClick();
  };

  const disarm = () => {
    if (onQuickDisarm) {
      onQuickDisarm();
      return;
    }
    onClick();
  };

  return (
    <AlarmCardView
      model={model}
      layoutVariant={layoutVariant}
      isSelected={isSelected}
      isEditMode={isEditMode}
      isModeMenuOpen={isModeMenuOpen}
      selectedArmMode={selectedArmMode}
      rootRef={cardRef}
      onOpen={onClick}
      onOpenModeMenu={() => setIsModeMenuOpen(true)}
      onCloseModeMenu={() => setIsModeMenuOpen(false)}
      onSelectArmMode={setSelectedArmMode}
      onConfirmArm={() => {
        if (selectedArmMode) arm(selectedArmMode);
      }}
      onDisarm={disarm}
      onArm={arm}
      canControl={canControl}
    />
  );
}
