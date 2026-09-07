import React from 'react';
import { AlertTriangle, ChevronRight, DoorOpen, Lock, Unlock } from 'lucide-react';
import type { LockCardModel } from './lockCardModel';
import type { WidgetDisplayVariant } from './widgetDisplayVariant';
import './LockCard.css';
import { useI18n } from '../../i18n/I18nProvider';

type LockCardViewProps = {
  model: LockCardModel;
  layoutVariant: WidgetDisplayVariant;
  isSelected: boolean;
  isEditMode: boolean;
  holdProgress: number;
  isHolding: boolean;
  isSuccessPulse: boolean;
  rootRef?: React.Ref<HTMLDivElement>;
  onOpen: () => void;
  onPrimaryAction: () => void;
  onOpenLatch?: () => void;
  onStartHold: () => void;
  onEndHold: () => void;
  onResetHold: () => void;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function LockCardView({
  model,
  layoutVariant,
  isSelected,
  isEditMode,
  holdProgress,
  isHolding,
  isSuccessPulse,
  rootRef,
  onOpen,
  onPrimaryAction,
  onOpenLatch,
  onStartHold,
  onEndHold,
  onResetHold,
}: LockCardViewProps) {
  const { t } = useI18n();
  const MiniIcon = model.isJammed || model.isUnavailable ? AlertTriangle : model.isLocked ? Lock : Unlock;
  const SliderIcon = model.primaryAction === 'lock' ? Lock : model.primaryAction === 'unlock' ? Unlock : MiniIcon;
  const canAct = !isEditMode && model.primaryAction !== 'none';
  const requiresHold = canAct && model.primaryAction === 'unlock';
  const isSliderControl = model.primaryAction === 'unlock';
  const canSlide = canAct && isSliderControl;
  const canPressControl = canAct && model.primaryAction === 'lock';
  const canOpenLatch = !isEditMode && Boolean(onOpenLatch && model.supportsOpen && !model.isTransitioning && !model.isJammed && !model.isUnavailable);
  const headerStateLabel = model.isLocked
    ? 'Chiusa'
    : model.isUnlocked || model.isOpen
      ? 'Aperta'
      : model.stateLabel;
  const progressStyle = { '--lock-hold-progress': String(Math.max(0, Math.min(1, holdProgress))) } as React.CSSProperties;
  const sliderRef = React.useRef<HTMLButtonElement | null>(null);
  const sliderDragRef = React.useRef<{
    pointerId: number;
    startClientX: number;
    startX: number;
    maxX: number;
  } | null>(null);
  const sliderProgressRef = React.useRef(0);
  const sliderCompleteTimeoutRef = React.useRef<number | null>(null);
  const [sliderX, setSliderX] = React.useState(0);
  const [sliderProgress, setSliderProgress] = React.useState(0);
  const [isSliderDragging, setIsSliderDragging] = React.useState(false);

  const setSliderPosition = React.useCallback((nextX: number, maxX: number) => {
    const safeMax = Math.max(1, maxX);
    const safeX = clamp(nextX, 0, safeMax);
    const nextProgress = clamp(safeX / safeMax, 0, 1);
    sliderProgressRef.current = nextProgress;
    setSliderX(Math.round(safeX * 10) / 10);
    setSliderProgress(nextProgress);
  }, []);

  const resetSlider = React.useCallback(() => {
    if (sliderCompleteTimeoutRef.current !== null) {
      window.clearTimeout(sliderCompleteTimeoutRef.current);
      sliderCompleteTimeoutRef.current = null;
    }
    sliderProgressRef.current = 0;
    setSliderX(0);
    setSliderProgress(0);
    setIsSliderDragging(false);
    sliderDragRef.current = null;
  }, []);

  const measureSliderMax = React.useCallback(() => {
    const track = sliderRef.current;
    if (!track) return 0;
    const thumb = track.querySelector<HTMLElement>('.lock-card__slider-thumb');
    const trackStyle = window.getComputedStyle(track);
    const paddingLeft = Number.parseFloat(trackStyle.paddingLeft) || 0;
    const paddingRight = Number.parseFloat(trackStyle.paddingRight) || 0;
    const thumbWidth = thumb?.offsetWidth ?? 40;
    return Math.max(1, track.clientWidth - paddingLeft - paddingRight - thumbWidth);
  }, []);

  const updateSliderFromPointer = React.useCallback((clientX: number) => {
    const drag = sliderDragRef.current;
    if (!drag) return;
    setSliderPosition(drag.startX + clientX - drag.startClientX, drag.maxX);
  }, [setSliderPosition]);

  const runMiniClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!canAct || requiresHold) return;
    onPrimaryAction();
  };

  const handlePrimaryKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!canAct || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    event.stopPropagation();
    if (requiresHold) {
      if (!event.repeat) {
        onStartHold();
      }
      return;
    }
    onPrimaryAction();
  };

  const handlePrimaryKeyUp = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!requiresHold || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    event.stopPropagation();
    onEndHold();
  };

  const handleSliderPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!canSlide) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const maxX = measureSliderMax();
    if (maxX <= 0) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Some embedded browsers can reject pointer capture; dragging still works while over the element.
    }
    sliderDragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startX: sliderX,
      maxX,
    };
    setIsSliderDragging(true);
  };

  const handleSliderPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = sliderDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    updateSliderFromPointer(event.clientX);
  };

  const finishSliderDrag = (event: React.PointerEvent<HTMLButtonElement>, shouldCommit: boolean) => {
    const drag = sliderDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    updateSliderFromPointer(event.clientX);
    const maxX = drag.maxX;
    const completed = shouldCommit && sliderProgressRef.current >= 0.74;
    sliderDragRef.current = null;
    setIsSliderDragging(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be gone.
    }
    if (!completed) {
      resetSlider();
      return;
    }
    setSliderPosition(maxX, maxX);
    sliderCompleteTimeoutRef.current = window.setTimeout(() => {
      onPrimaryAction();
      resetSlider();
    }, 110);
  };

  const handleSliderKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!canSlide || (event.key !== 'ArrowRight' && event.key !== 'End' && event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    event.stopPropagation();
    onPrimaryAction();
    resetSlider();
  };

  const handleControlButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!canPressControl) return;
    onPrimaryAction();
  };

  const holdHandlers = requiresHold
    ? {
        onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
          if (event.pointerType === 'mouse' && event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // Pointer capture can fail in some browser shells; the hold still starts.
          }
          onStartHold();
        },
        onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => {
          event.preventDefault();
          event.stopPropagation();
          onEndHold();
        },
        onPointerCancel: (event: React.PointerEvent<HTMLButtonElement>) => {
          event.preventDefault();
          event.stopPropagation();
          onEndHold();
        },
        onLostPointerCapture: onEndHold,
        onPointerLeave: (event: React.PointerEvent<HTMLButtonElement>) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) return;
          onEndHold();
        },
        onContextMenu: (event: React.MouseEvent<HTMLButtonElement>) => event.preventDefault(),
      }
    : {};

  React.useEffect(() => {
    resetSlider();
  }, [model.primaryAction, model.state, resetSlider]);

  React.useEffect(() => {
    return () => {
      if (sliderCompleteTimeoutRef.current !== null) {
        window.clearTimeout(sliderCompleteTimeoutRef.current);
      }
    };
  }, []);

  const sliderLabel =
    model.primaryAction === 'unlock'
      ? 'Scorri per aprire'
      : model.primaryAction === 'lock'
        ? 'Blocca'
        : model.stateLabel;
  const sliderStyle = {
    ...progressStyle,
    '--lock-slide-fill': `${Math.round(sliderProgress * 100)}%`,
  } as React.CSSProperties;
  const sliderThumbStyle = {
    transform: `translate3d(${sliderX}px, 0, 0)`,
  } as React.CSSProperties;

  return (
    <div
      ref={rootRef}
      className={`lock-card ${isSelected ? 'selection-corners' : ''}`}
      data-lock-state={model.state}
      data-lock-tone={model.tone}
      data-lock-variant={layoutVariant}
      data-lock-action={model.primaryAction}
      data-lock-holding={isHolding ? 'true' : 'false'}
      data-lock-success={isSuccessPulse ? 'true' : 'false'}
      style={progressStyle}
      onClick={(event) => {
        if (isEditMode) return;
        event.stopPropagation();
        onOpen();
      }}
      aria-label={`${model.title}, ${model.stateLabel}`}
      aria-busy={model.isTransitioning || undefined}
    >
      <div className="liquid-glass-card lock-card__surface">
        <span className="lock-card__meta">
          <span className="lock-card__title" title={model.title}>{model.title}</span>
          <span className="lock-card__status">{headerStateLabel}</span>
        </span>

        <button
          type="button"
          className="lock-card__mini-toggle"
          disabled={!canAct}
          onClick={runMiniClick}
          onKeyDown={handlePrimaryKeyDown}
          onKeyUp={handlePrimaryKeyUp}
          aria-label={`${model.primaryActionLabel} ${model.title}`}
          title={canAct ? model.hint : model.stateLabel}
          {...holdHandlers}
        >
          <span className="lock-card__hold-ring" aria-hidden="true" />
          <MiniIcon className="lock-card__mini-icon" />
        </button>

        <button
          ref={sliderRef}
          type="button"
          className="lock-card__control"
          disabled={isSliderControl ? !canSlide : !canPressControl}
          data-control={isSliderControl ? 'slider' : 'button'}
          data-action={model.primaryAction}
          data-transitioning={model.isTransitioning ? 'true' : 'false'}
          data-dragging={isSliderDragging ? 'true' : 'false'}
          data-complete={sliderProgress >= 0.74 ? 'true' : 'false'}
          style={sliderStyle}
          onPointerDown={isSliderControl ? handleSliderPointerDown : undefined}
          onPointerMove={isSliderControl ? handleSliderPointerMove : undefined}
          onPointerUp={isSliderControl ? (event) => finishSliderDrag(event, true) : undefined}
          onPointerCancel={isSliderControl ? (event) => finishSliderDrag(event, false) : undefined}
          onLostPointerCapture={isSliderControl ? (event) => finishSliderDrag(event, false) : undefined}
          onClick={isSliderControl ? (event) => {
            event.preventDefault();
            event.stopPropagation();
          } : handleControlButtonClick}
          onKeyDown={isSliderControl ? handleSliderKeyDown : undefined}
          aria-label={`${sliderLabel} ${model.title}`}
          title={isSliderControl ? (canSlide ? sliderLabel : model.stateLabel) : (canPressControl ? sliderLabel : model.stateLabel)}
        >
          {isSliderControl ? (
            <>
              <span className="lock-card__slider-fill" aria-hidden="true" />
              <span className="lock-card__slider-label" aria-hidden="true">
                <span className="lock-card__slider-text">{sliderLabel}</span>
              </span>
              <span className="lock-card__slider-chevron" aria-hidden="true">
                <ChevronRight size={14} />
              </span>
              <span className="lock-card__slider-thumb" style={sliderThumbStyle} aria-hidden="true">
                <SliderIcon className="lock-card__slider-icon" />
              </span>
            </>
          ) : (
            <>
              <span className="lock-card__button-glow" aria-hidden="true" />
              <span className="lock-card__button-content">
                <span className="lock-card__button-label">{sliderLabel}</span>
              </span>
            </>
          )}
        </button>

        <span className="lock-card__caption">{model.caption}</span>

        <span className="lock-card__details">
          <span>
            <small>{t('card.edit')}</small>
            <strong>{model.changedBy ?? 'Sincronizzata'}</strong>
          </span>
          <span>
            <small>{t('card.lock.latch')}</small>
            <strong>{model.supportsOpen ? 'Supportato' : 'Non esposto'}</strong>
          </span>
        </span>

        <span className="lock-card__actions">
          {model.supportsOpen ? (
            <button
              type="button"
              className="lock-card__secondary-action"
              disabled={!canOpenLatch}
              onClick={(event) => {
                event.stopPropagation();
                if (!canOpenLatch) return;
                onOpenLatch?.();
              }}
              aria-label={`${model.secondaryActionLabel} ${model.title}`}
            >
              <DoorOpen size={14} />
              <span>{model.secondaryActionLabel}</span>
            </button>
          ) : null}
        </span>
      </div>

      {isEditMode ? (
        <div
          role="button"
          tabIndex={0}
          className="lock-card__edit-handle widget-card-handle cursor-grab"
          onClick={(event) => {
            event.stopPropagation();
            onResetHold();
            onOpen();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              onResetHold();
              onOpen();
            }
          }}
          aria-label={`Configura ${model.title}`}
        />
      ) : null}
    </div>
  );
}
