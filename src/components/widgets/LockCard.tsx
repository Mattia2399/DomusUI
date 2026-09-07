import React, { useEffect, useMemo, useRef } from 'react';
import { useHoldToConfirm } from '../../hooks/useHoldToConfirm';
import { useObservedElementSize } from '../../hooks/useObservedElementSize';
import type { Widget } from '../../types/dashboardModels';
import type { MockEntityState } from '../../types/ha';
import type { GridEngineBreakpoint } from '../dashboard/dashboardBreakpointConfig';
import { LockCardView } from './LockCardView';
import { buildLockCardModel } from './lockCardModel';
import {
  resolveLockPixelDisplayVariant,
  resolveWidgetDisplayVariant,
  type WidgetDisplayMetrics,
  type WidgetDisplayVariant,
} from './widgetDisplayVariant';
import { useI18n } from '../../i18n/I18nProvider';

type LockCardProps = {
  widget: Widget;
  isSelected: boolean;
  isEditMode: boolean;
  onClick: () => void;
  onToggleLock?: () => boolean | void;
  onOpenDoor?: () => void;
  liveEntity?: MockEntityState;
  gridBreakpoint?: GridEngineBreakpoint;
  displayVariant?: WidgetDisplayVariant;
  onDisplayMetricsChange?: (metrics: WidgetDisplayMetrics) => void;
};

export function LockCard({
  widget,
  isSelected,
  isEditMode,
  onClick,
  onToggleLock,
  onOpenDoor,
  liveEntity,
  gridBreakpoint,
  displayVariant,
  onDisplayMetricsChange,
}: LockCardProps) {
  const { locale } = useI18n();
  const fallbackVariant = displayVariant ?? resolveWidgetDisplayVariant({
    kind: 'lock',
    breakpoint: gridBreakpoint,
    layout: widget.layout,
    parentSectionId: widget.parentSectionId,
  });
  const { ref: cardRef, size: observedSize } = useObservedElementSize<HTMLDivElement>(widget.id);
  const measuredSize = observedSize?.identity === widget.id ? observedSize : null;
  const layoutVariant = measuredSize
    ? resolveLockPixelDisplayVariant({ width: measuredSize.width, height: measuredSize.height })
    : fallbackVariant;
  const model = useMemo(() => buildLockCardModel(widget, liveEntity, locale), [liveEntity, locale, widget]);
  const suppressNextClickRef = useRef(false);

  const runPrimaryAction = () => {
    if (isEditMode || model.primaryAction === 'none') return;
    const didStartAction = onToggleLock?.();
    suppressNextClickRef.current = true;
    if (didStartAction === false) return;
  };

  const {
    progress,
    isHolding,
    isSuccessPulse,
    startHold,
    endHold,
    forceReset,
  } = useHoldToConfirm({
    enabled: !isEditMode && model.primaryAction === 'unlock',
    durationMs: 1000,
    onComplete: runPrimaryAction,
  });

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
    <LockCardView
      model={model}
      layoutVariant={layoutVariant}
      isSelected={isSelected}
      isEditMode={isEditMode}
      rootRef={cardRef}
      holdProgress={progress}
      isHolding={isHolding}
      isSuccessPulse={isSuccessPulse}
      onOpen={() => {
        if (suppressNextClickRef.current) {
          suppressNextClickRef.current = false;
          return;
        }
        forceReset();
        onClick();
      }}
      onPrimaryAction={() => {
        forceReset();
        runPrimaryAction();
      }}
      onOpenLatch={() => {
        suppressNextClickRef.current = true;
        onOpenDoor?.();
      }}
      onStartHold={startHold}
      onEndHold={endHold}
      onResetHold={forceReset}
    />
  );
}
