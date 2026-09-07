import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { Check, Info, Sparkles, type LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import GlassLoader from '../ui/GlassLoader';
import GlassModal from '../ui/GlassModal';
import {
  SetupActionButton,
  SetupSecondaryButton,
  useDeviceAppearance,
} from '../onboarding/OnboardingGlass';
import { useI18n } from '../../i18n/I18nProvider';

export type GuidedSetupStep = {
  id?: string;
  title: string;
  description: string;
  hint?: string;
  icon?: LucideIcon;
  target?: string;
  actionLabel?: string;
  advanceOnTargetClick?: boolean;
  actionBehavior?: 'target' | 'continue';
};

type GuidedSetupOverlayProps = {
  isOpen: boolean;
  tag: string;
  heading: string;
  description?: string;
  steps: GuidedSetupStep[];
  onDismiss: () => void;
  onStepChange?: (step: GuidedSetupStep, index: number) => void;
  isStepComplete?: (step: GuidedSetupStep, index: number) => boolean;
  completeLabel?: string;
  skipLabel?: string;
};

type TargetSnapshot = {
  element: HTMLElement;
  top: number;
  left: number;
  width: number;
  height: number;
  borderRadius: string;
};

type CoachmarkSize = {
  width: number;
  height: number;
};

type CoachmarkPlacement = {
  top: number;
  left: number;
  side: 'above' | 'below' | 'left' | 'right' | 'center';
};

const COACHMARK_MARGIN = 16;
const COACHMARK_TARGET_GAP = 18;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

export function resolveCoachmarkPlacement({
  target,
  viewportWidth,
  viewportHeight,
  coachmark,
}: {
  target: TargetSnapshot | null;
  viewportWidth: number;
  viewportHeight: number;
  coachmark: CoachmarkSize;
}): CoachmarkPlacement {
  const maxLeft = viewportWidth - coachmark.width - COACHMARK_MARGIN;
  const maxTop = viewportHeight - coachmark.height - COACHMARK_MARGIN;

  if (!target) {
    return {
      side: 'center',
      left: clamp((viewportWidth - coachmark.width) / 2, COACHMARK_MARGIN, maxLeft),
      top: clamp((viewportHeight - coachmark.height) / 2, COACHMARK_MARGIN, maxTop),
    };
  }

  const targetRight = target.left + target.width;
  const targetBottom = target.top + target.height;
  const targetCenterX = target.left + target.width / 2;
  const targetCenterY = target.top + target.height / 2;
  const room = {
    right: viewportWidth - COACHMARK_MARGIN - targetRight - COACHMARK_TARGET_GAP,
    left: target.left - COACHMARK_MARGIN - COACHMARK_TARGET_GAP,
    below: viewportHeight - COACHMARK_MARGIN - targetBottom - COACHMARK_TARGET_GAP,
    above: target.top - COACHMARK_MARGIN - COACHMARK_TARGET_GAP,
  };

  const fits = {
    right: room.right >= coachmark.width,
    left: room.left >= coachmark.width,
    below: room.below >= coachmark.height,
    above: room.above >= coachmark.height,
  };

  // Controls close to a lateral edge are easier to understand when the
  // explanation opens beside them. This also keeps bottom navigation targets
  // visible instead of covering them with a tall callout.
  if (targetCenterX <= viewportWidth * 0.34 && fits.right) {
    return {
      side: 'right',
      left: targetRight + COACHMARK_TARGET_GAP,
      top: clamp(targetCenterY - coachmark.height / 2, COACHMARK_MARGIN, maxTop),
    };
  }
  if (targetCenterX >= viewportWidth * 0.66 && fits.left) {
    return {
      side: 'left',
      left: target.left - COACHMARK_TARGET_GAP - coachmark.width,
      top: clamp(targetCenterY - coachmark.height / 2, COACHMARK_MARGIN, maxTop),
    };
  }
  if (targetCenterY >= viewportHeight * 0.6 && fits.above) {
    return {
      side: 'above',
      left: clamp(targetCenterX - coachmark.width / 2, COACHMARK_MARGIN, maxLeft),
      top: target.top - COACHMARK_TARGET_GAP - coachmark.height,
    };
  }
  if (targetCenterY <= viewportHeight * 0.4 && fits.below) {
    return {
      side: 'below',
      left: clamp(targetCenterX - coachmark.width / 2, COACHMARK_MARGIN, maxLeft),
      top: targetBottom + COACHMARK_TARGET_GAP,
    };
  }

  const candidates = [
    { side: 'right' as const, room: room.right, required: coachmark.width },
    { side: 'left' as const, room: room.left, required: coachmark.width },
    { side: 'below' as const, room: room.below, required: coachmark.height },
    { side: 'above' as const, room: room.above, required: coachmark.height },
  ]
    .filter((candidate) => candidate.room >= candidate.required)
    .sort((first, second) => (second.room - second.required) - (first.room - first.required));

  const side = candidates[0]?.side;
  if (side === 'right' || side === 'left') {
    return {
      side,
      left: side === 'right'
        ? targetRight + COACHMARK_TARGET_GAP
        : target.left - COACHMARK_TARGET_GAP - coachmark.width,
      top: clamp(targetCenterY - coachmark.height / 2, COACHMARK_MARGIN, maxTop),
    };
  }
  if (side === 'above' || side === 'below') {
    return {
      side,
      left: clamp(targetCenterX - coachmark.width / 2, COACHMARK_MARGIN, maxLeft),
      top: side === 'below'
        ? targetBottom + COACHMARK_TARGET_GAP
        : target.top - COACHMARK_TARGET_GAP - coachmark.height,
    };
  }

  // Very small viewports may not have a fully free side. Keep the callout
  // inside the viewport and place it on the half furthest from the target.
  const preferTop = targetCenterY >= viewportHeight / 2;
  return {
    side: preferTop ? 'above' : 'below',
    left: clamp(targetCenterX - coachmark.width / 2, COACHMARK_MARGIN, maxLeft),
    top: preferTop ? COACHMARK_MARGIN : maxTop,
  };
}

function findVisibleTarget(selector: string) {
  try {
    return Array.from(document.querySelectorAll<HTMLElement>(selector)).find((element) => {
      if (element.closest('[aria-hidden="true"]')) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity || 1) > 0 &&
        rect.width > 0 &&
        rect.height > 0 &&
        rect.right > 0 &&
        rect.bottom > 0 &&
        rect.left < window.innerWidth &&
        rect.top < window.innerHeight
      );
    }) ?? null;
  } catch {
    return null;
  }
}

function findScrollableTarget(selector: string) {
  try {
    return Array.from(document.querySelectorAll<HTMLElement>(selector)).find((element) => {
      if (element.closest('[aria-hidden="true"]')) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity || 1) > 0 &&
        rect.width > 0 &&
        rect.height > 0
      );
    }) ?? null;
  } catch {
    return null;
  }
}

function readTargetSnapshot(element: HTMLElement): TargetSnapshot {
  const rect = element.getBoundingClientRect();
  return {
    element,
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    borderRadius: window.getComputedStyle(element).borderRadius || '1rem',
  };
}

function sameSnapshot(previous: TargetSnapshot | null, next: TargetSnapshot | null) {
  if (!previous || !next) return previous === next;
  return (
    previous.element === next.element &&
    Math.abs(previous.top - next.top) < 0.5 &&
    Math.abs(previous.left - next.left) < 0.5 &&
    Math.abs(previous.width - next.width) < 0.5 &&
    Math.abs(previous.height - next.height) < 0.5 &&
    previous.borderRadius === next.borderRadius
  );
}

export function GuidedSetupOverlay({
  isOpen,
  tag,
  heading,
  description = 'Scopri le funzioni essenziali e inizia a personalizzare la tua esperienza.',
  steps,
  onDismiss,
  onStepChange,
  isStepComplete,
  completeLabel = 'Fine guida',
  skipLabel = 'Salta guida',
}: GuidedSetupOverlayProps) {
  const { t } = useI18n();
  const appearance = useDeviceAppearance();
  const [stepIndex, setStepIndex] = useState(0);
  const [targetSnapshot, setTargetSnapshot] = useState<TargetSnapshot | null>(null);
  const [coachmarkSize, setCoachmarkSize] = useState<CoachmarkSize>({ width: 0, height: 0 });
  const coachmarkRef = useRef<HTMLElement | null>(null);
  const safeSteps = useMemo(() => (steps.length > 0 ? steps : [{
    title: t('settings.guide.quick'),
    description: t('settings.guide.noSteps'),
    icon: Sparkles,
  }]), [steps, t]);

  useEffect(() => {
    if (isOpen) setStepIndex(0);
  }, [heading, isOpen]);

  const safeStepIndex = Math.min(stepIndex, safeSteps.length - 1);
  const currentStep = safeSteps[safeStepIndex];
  const CurrentIcon = currentStep.icon ?? Sparkles;
  const isLastStep = safeStepIndex === safeSteps.length - 1;
  const progress = ((safeStepIndex + 1) / safeSteps.length) * 100;
  const isTargetStep = Boolean(currentStep.target);
  const neutralScopeClass = clsx(
    'onboarding-neutral-scope onboarding-accent-neutral',
    appearance === 'light' ? 'dashboard-theme-light' : 'dashboard-theme-dark',
  );

  const goBack = useCallback(() => setStepIndex((current) => Math.max(0, current - 1)), []);
  const goForward = useCallback(() => {
    if (isLastStep) {
      onDismiss();
      return;
    }
    setStepIndex((current) => Math.min(safeSteps.length - 1, current + 1));
  }, [isLastStep, onDismiss, safeSteps.length]);

  useEffect(() => {
    if (!isOpen) return;
    onStepChange?.(currentStep, safeStepIndex);
  }, [currentStep, isOpen, onStepChange, safeStepIndex]);

  useEffect(() => {
    if (!isOpen || !currentStep.target) {
      setTargetSnapshot(null);
      return undefined;
    }

    const updateTarget = () => {
      let target = findVisibleTarget(currentStep.target!);
      if (!target) {
        const scrollableTarget = findScrollableTarget(currentStep.target!);
        if (scrollableTarget) {
          scrollableTarget.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
          target = findVisibleTarget(currentStep.target!);
        }
      }
      const next = target ? readTargetSnapshot(target) : null;
      setTargetSnapshot((previous) => (sameSnapshot(previous, next) ? previous : next));
    };

    const mutationObserver = new MutationObserver(updateTarget);
    mutationObserver.observe(document.body, { attributes: true, childList: true, subtree: true });
    window.addEventListener('resize', updateTarget);
    window.addEventListener('scroll', updateTarget, true);
    const frameId = window.requestAnimationFrame(updateTarget);
    const settleTimers = [120, 280].map((delay) => window.setTimeout(updateTarget, delay));

    return () => {
      window.cancelAnimationFrame(frameId);
      settleTimers.forEach((timer) => window.clearTimeout(timer));
      mutationObserver.disconnect();
      window.removeEventListener('resize', updateTarget);
      window.removeEventListener('scroll', updateTarget, true);
    };
  }, [currentStep.target, isOpen]);

  useLayoutEffect(() => {
    if (!isOpen || !isTargetStep || !coachmarkRef.current) return undefined;
    const coachmark = coachmarkRef.current;
    const measure = () => {
      const rect = coachmark.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      setCoachmarkSize((previous) => (
        Math.abs(previous.width - rect.width) < 0.5 && Math.abs(previous.height - rect.height) < 0.5
          ? previous
          : { width: rect.width, height: rect.height }
      ));
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(coachmark);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [currentStep.id, isOpen, isTargetStep]);

  const stepIsComplete = isOpen && Boolean(isStepComplete?.(currentStep, safeStepIndex));
  useEffect(() => {
    if (!isTargetStep || !stepIsComplete) return undefined;
    const timer = window.setTimeout(goForward, 260);
    return () => window.clearTimeout(timer);
  }, [goForward, isTargetStep, stepIsComplete]);

  useEffect(() => {
    const target = targetSnapshot?.element;
    if (!target || !currentStep.advanceOnTargetClick) return undefined;
    const handleTargetClick = () => window.setTimeout(goForward, 0);
    target.addEventListener('click', handleTargetClick);
    return () => target.removeEventListener('click', handleTargetClick);
  }, [currentStep.advanceOnTargetClick, goForward, targetSnapshot?.element]);

  useEffect(() => {
    if (!isOpen || !isTargetStep) return undefined;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, isTargetStep, onDismiss]);

  if (!isOpen) return null;

  if (isTargetStep) {
    const viewportWidth = typeof window === 'undefined' ? 1024 : window.innerWidth;
    const viewportHeight = typeof window === 'undefined' ? 768 : window.innerHeight;
    const calloutWidth = Math.min(370, Math.max(280, viewportWidth - 24));
    const measuredCoachmark = {
      width: coachmarkSize.width || calloutWidth,
      height: coachmarkSize.height || (currentStep.hint ? 390 : 320),
    };
    const placement = resolveCoachmarkPlacement({
      target: targetSnapshot,
      viewportWidth,
      viewportHeight,
      coachmark: measuredCoachmark,
    });

    const targetOverlay = (
      <div className={clsx('fixed inset-0 z-[220] pointer-events-none', neutralScopeClass)} data-guided-step={currentStep.id}>
        {targetSnapshot ? (
          <motion.div
            className="fixed z-[221] border-2 border-[rgb(var(--ui-accent-rgb)/0.9)] shadow-[0_0_0_9999px_rgba(0,0,0,0.34),0_0_0_7px_rgb(var(--ui-accent-rgb)/0.16),0_14px_38px_rgb(var(--ui-accent-rgb)/0.24)]"
            initial={false}
            animate={{
              top: targetSnapshot.top - 6,
              left: targetSnapshot.left - 6,
              width: targetSnapshot.width + 12,
              height: targetSnapshot.height + 12,
            }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            style={{ borderRadius: `calc(${targetSnapshot.borderRadius} + 6px)` }}
            aria-hidden
          />
        ) : (
          <div className="absolute inset-0 bg-[color:var(--ui-scrim)]" aria-hidden />
        )}

        <motion.aside
          ref={coachmarkRef}
          role="dialog"
          aria-modal="false"
          aria-label={`${heading}: ${currentStep.title}`}
          className="guided-setup-coachmark onboarding-card pointer-events-auto fixed z-[222] max-h-[calc(100dvh-24px)] overflow-y-auto p-5 shadow-[0_28px_80px_var(--ui-shadow)] sm:p-6"
          initial={{ opacity: 0, y: 10, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          data-placement={placement.side}
          style={{ top: placement.top, left: placement.left, width: calloutWidth }}
        >
          {!targetSnapshot ? (
            <GlassLoader size="sm" ariaLabel="Preparazione del passaggio guidato" className="mb-4" />
          ) : null}
          <div className="flex items-start gap-3">
            <span className="onboarding-choice-icon !h-10 !w-10 !rounded-[0.85rem]">
              <CurrentIcon size={18} strokeWidth={1.8} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ui-text-secondary)]">
                <span>{tag}</span>
                <span>{safeStepIndex + 1} di {safeSteps.length}</span>
              </div>
              <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[color:var(--ui-text-primary)]">
                {currentStep.title}
              </h3>
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-[color:var(--ui-text-secondary)]">{currentStep.description}</p>
          {currentStep.hint ? (
            <div className="onboarding-notice mt-4 !p-3">
              <span className="onboarding-notice-icon !h-8 !w-8"><Info size={15} /></span>
              <p className="min-w-0 text-xs leading-5 text-[color:var(--ui-text-secondary)]">{currentStep.hint}</p>
            </div>
          ) : null}
          <div className="mt-5 flex items-center justify-between gap-2 border-t border-[color:var(--ui-border)] pt-4">
            <button type="button" onClick={onDismiss} className="shrink-0 whitespace-nowrap px-1 text-xs font-semibold text-[color:var(--ui-text-secondary)] transition hover:text-[color:var(--ui-text-primary)]">
              {skipLabel}
            </button>
            <div className="flex gap-2">
              {safeStepIndex > 0 ? <SetupSecondaryButton onClick={goBack} className="shrink-0 whitespace-nowrap !min-h-10 !px-4">Indietro</SetupSecondaryButton> : null}
              <SetupActionButton
                onClick={() => {
                  if (currentStep.actionBehavior === 'continue') {
                    goForward();
                    return;
                  }
                  targetSnapshot?.element.click();
                }}
                disabled={!targetSnapshot}
                trailingArrow={false}
                fullOnMobile={false}
                className="whitespace-nowrap !min-h-10 !px-4"
              >
                {currentStep.actionLabel ?? 'Mostrami'}
              </SetupActionButton>
            </div>
          </div>
        </motion.aside>
      </div>
    );
    return typeof document === 'undefined' ? targetOverlay : createPortal(targetOverlay, document.body);
  }

  return (
    <GlassModal
      isOpen
      onClose={onDismiss}
      title={heading}
      eyebrow={tag}
      description={description}
      size="xl"
      variant="responsive"
      showCloseButton={false}
      usePortal={false}
      zIndex={280}
      className={clsx('guided-setup-overlay', neutralScopeClass)}
      panelClassName="guided-setup-modal onboarding-window !min-h-0 md:!h-auto md:!min-h-[min(38rem,calc(100dvh-4rem))] md:!max-w-4xl"
      headerClassName="guided-setup-header !pr-0"
      bodyClassName="guided-setup-body !mt-5 md:!mt-6"
      footerClassName="guided-setup-footer border-t border-[color:var(--ui-border)]"
      backdropClassName="!bg-[color:var(--ui-scrim)]"
      footer={(
        <>
          <SetupSecondaryButton onClick={onDismiss} className="guided-setup-skip">{skipLabel}</SetupSecondaryButton>
          <div className="guided-setup-navigation flex min-w-0 gap-2">
            {safeStepIndex > 0 ? <SetupSecondaryButton onClick={goBack} className="min-w-0 flex-1 sm:flex-none">Indietro</SetupSecondaryButton> : null}
            <SetupActionButton onClick={goForward} trailingArrow={!isLastStep} fullOnMobile={false} className="min-w-0 flex-1 sm:flex-none">
              {isLastStep ? completeLabel : 'Continua'}
            </SetupActionButton>
          </div>
        </>
      )}
    >
      <div className="guided-setup-progress lg:hidden">
        <div className="flex items-center justify-between gap-3 text-[11px] font-semibold text-[color:var(--ui-text-secondary)]">
          <span>Passaggio {safeStepIndex + 1} di {safeSteps.length}</span><span>{Math.round(progress)}%</span>
        </div>
        <div className="onboarding-progress-track mt-2" aria-hidden><span style={{ width: `${progress}%` }} /></div>
      </div>
      <div className="grid min-h-0 gap-5 lg:h-full lg:grid-cols-[14.5rem_minmax(0,1fr)]">
        <nav className="hidden min-h-0 space-y-2 overflow-y-auto pr-1 lg:block" aria-label="Passaggi configurazione guidata">
          {safeSteps.map((step, index) => {
            const StepIcon = step.icon ?? Sparkles;
            const active = index === safeStepIndex;
            const complete = index < safeStepIndex;
            return (
              <button key={`${step.title}-${index}`} type="button" onClick={() => setStepIndex(index)} className={`onboarding-step-item w-full text-left ${active ? 'onboarding-step-item-active' : ''} ${complete ? 'onboarding-step-item-complete' : ''}`} aria-current={active ? 'step' : undefined}>
                <span className="onboarding-step-icon">{complete ? <Check size={14} strokeWidth={2.5} /> : <StepIcon size={15} />}</span>
                <span className="min-w-0"><span className="block text-[10px] font-semibold uppercase tracking-[0.14em] opacity-50">Passaggio {index + 1}</span><span className="mt-0.5 block truncate text-sm font-semibold">{step.title}</span></span>
              </button>
            );
          })}
        </nav>
        <section className="onboarding-card relative flex min-h-[18rem] min-w-0 flex-col justify-center overflow-hidden p-5 sm:p-7 lg:min-h-0 lg:p-8">
          <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-[rgb(var(--ui-accent-rgb)/0.09)] blur-3xl" aria-hidden />
          <motion.div key={`${heading}-${safeStepIndex}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} className="relative">
            <span className="onboarding-choice-icon !h-12 !w-12 !rounded-[1rem] sm:!h-14 sm:!w-14"><CurrentIcon size={22} strokeWidth={1.8} /></span>
            <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.17em] text-[color:var(--ui-text-secondary)]">Passaggio {safeStepIndex + 1}</p>
            <h3 className="mt-2 text-[clamp(1.35rem,4vw,2rem)] font-semibold leading-tight tracking-[-0.035em] text-[color:var(--ui-text-primary)]">{currentStep.title}</h3>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[color:var(--ui-text-secondary)] sm:text-[0.95rem]">{currentStep.description}</p>
            {currentStep.hint ? <div className="onboarding-notice mt-5 !p-3.5"><span className="onboarding-notice-icon !h-8 !w-8"><Info size={15} /></span><p className="min-w-0 text-xs leading-5 text-[color:var(--ui-text-secondary)]">{currentStep.hint}</p></div> : null}
          </motion.div>
        </section>
      </div>
    </GlassModal>
  );
}

export default GuidedSetupOverlay;
