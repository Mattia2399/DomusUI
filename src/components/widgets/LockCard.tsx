import React, { useEffect, useMemo, useRef } from 'react';
import type { Widget } from '../../types/dashboardModels';
import type { MockEntityState } from '../../types/ha';
import type { GridEngineBreakpoint } from '../dashboard/dashboardBreakpointConfig';
import { LockCardView } from './LockCardView';
import { buildLockCardModel } from './lockCardModel';
import { resolveLockRingMode, useLockRingPress } from './useLockRingPress';
import {
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

// Reports the card's size to the builder while it asks for it, without
// re-rendering the card: the composition itself comes from container queries.
function useReportedCardSize(
  ref: React.RefObject<HTMLDivElement | null>,
  widgetId: string,
  variant: WidgetDisplayVariant,
  onChange: ((metrics: WidgetDisplayMetrics) => void) | undefined,
) {
  useEffect(() => {
    const element = ref.current;
    if (!element || !onChange) return;
    let frame = 0;
    const report = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const bounds = element.getBoundingClientRect();
        if (bounds.width <= 0 || bounds.height <= 0) return;
        onChange({
          widgetId,
          width: Math.round(bounds.width),
          height: Math.round(bounds.height),
          variant,
        });
      });
    };
    report();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', report);
      return () => {
        window.cancelAnimationFrame(frame);
        window.removeEventListener('resize', report);
      };
    }
    const observer = new ResizeObserver(report);
    observer.observe(element);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [onChange, ref, variant, widgetId]);
}

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
  // The size name (mini, standard, expanded) comes from the grid.
  const sizeVariant = displayVariant ?? resolveWidgetDisplayVariant({
    kind: 'lock',
    breakpoint: gridBreakpoint,
    layout: widget.layout,
    parentSectionId: widget.parentSectionId,
  });
  const cardRef = useRef<HTMLDivElement | null>(null);
  useReportedCardSize(cardRef, widget.id, sizeVariant, onDisplayMetricsChange);
  const model = useMemo(() => buildLockCardModel(widget, liveEntity, locale), [liveEntity, locale, widget]);
  const canOpen = model.canOpenLatch && Boolean(onOpenDoor);

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

  return (
    <LockCardView
      model={model}
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
