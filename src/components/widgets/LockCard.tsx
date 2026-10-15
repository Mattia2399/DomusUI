import React, { useEffect, useMemo } from 'react';
import { useObservedElementSize } from '../../hooks/useObservedElementSize';
import type { Widget } from '../../types/dashboardModels';
import type { MockEntityState } from '../../types/ha';
import type { GridEngineBreakpoint } from '../dashboard/dashboardBreakpointConfig';
import { LockCardView } from './LockCardView';
import { buildLockCardModel } from './lockCardModel';
import { resolveLockRingMode, useLockRingPress } from './useLockRingPress';
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
  const canOpen = model.canOpenLatch && Boolean(onOpenDoor);
  // A narrow standard card has no room for the ring beside the state: it uses the mini layout.
  const presentationVariant = layoutVariant === 'standard' && measuredSize && measuredSize.width < 250
    ? 'compact'
    : layoutVariant;

  // First lap unlocks, a second lap opens the latch; from unlocked a tap locks.
  const ring = useLockRingPress({
    mode: resolveLockRingMode({ enabled: !isEditMode && Boolean(onToggleLock), state: model.state, canOpen }),
    canOpenAfterUnlock: canOpen,
    onUnlock: () => onToggleLock?.(),
    onLock: () => {
      onToggleLock?.();
    },
    onOpen: () => onOpenDoor?.(),
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
      layoutVariant={presentationVariant}
      isSelected={isSelected}
      isEditMode={isEditMode}
      rootRef={cardRef}
      ring={ring}
      onOpen={() => {
        ring.reset();
        onClick();
      }}
      onResetHold={ring.reset}
    />
  );
}
