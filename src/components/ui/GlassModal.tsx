import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import clsx from 'clsx';
import { resolveOverlayThemeClass, type DashboardThemeClass } from './portalTheme';

export type GlassModalSize = 'sm' | 'md' | 'lg' | 'xl';
export type GlassModalVariant = 'dialog' | 'responsive' | 'fullscreen';

export type GlassModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: GlassModalSize;
  variant?: GlassModalVariant;
  closeLabel?: string;
  dismissible?: boolean;
  showCloseButton?: boolean;
  usePortal?: boolean;
  zIndex?: number;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  className?: string;
  panelClassName?: string;
  headerClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
  backdropClassName?: string;
};

const SIZE_CLASS: Record<GlassModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-xl',
  xl: 'max-w-3xl',
};

const RESPONSIVE_SIZE_CLASS: Record<GlassModalSize, string> = {
  sm: 'max-w-none md:max-w-sm',
  md: 'max-w-none md:max-w-md',
  lg: 'max-w-none md:max-w-xl',
  xl: 'max-w-none md:max-w-3xl',
};

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

let bodyLockCount = 0;
let bodyOverflowBeforeLock = '';
const openModalStack: string[] = [];

function lockBodyScroll() {
  if (bodyLockCount === 0) {
    bodyOverflowBeforeLock = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  bodyLockCount += 1;
}

function unlockBodyScroll() {
  bodyLockCount = Math.max(0, bodyLockCount - 1);
  if (bodyLockCount === 0) {
    document.body.style.overflow = bodyOverflowBeforeLock;
  }
}

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.getAttribute('aria-hidden') !== 'true',
  );
}

export function GlassModal({
  isOpen,
  onClose,
  title,
  eyebrow,
  description,
  children,
  footer,
  size = 'md',
  variant = 'dialog',
  closeLabel = 'Chiudi finestra',
  dismissible = true,
  showCloseButton = true,
  usePortal = true,
  zIndex = 260,
  initialFocusRef,
  className,
  panelClassName,
  headerClassName,
  bodyClassName,
  footerClassName,
  backdropClassName,
}: GlassModalProps) {
  const reactId = useId();
  const modalId = `glass-modal-${reactId}`;
  const titleId = `${modalId}-title`;
  const descriptionId = `${modalId}-description`;
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const [themeClass, setThemeClass] = useState<DashboardThemeClass | undefined>();

  // Read the theme before paint, while focus is still on the control that opened us.
  useLayoutEffect(() => {
    if (isOpen && usePortal) setThemeClass(resolveOverlayThemeClass());
  }, [isOpen, usePortal]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    openModalStack.push(modalId);
    lockBodyScroll();

    const focusTimer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const preferredFocus = initialFocusRef?.current;
      const firstFocusable = getFocusableElements(panel)[0];
      (preferredFocus ?? firstFocusable ?? panel).focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (openModalStack.at(-1) !== modalId) return;
      if (event.key === 'Escape' && dismissible) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;
      const focusableElements = getFocusableElements(panel);
      if (focusableElements.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      const stackIndex = openModalStack.lastIndexOf(modalId);
      if (stackIndex >= 0) openModalStack.splice(stackIndex, 1);
      unlockBodyScroll();
      previousFocusRef.current?.focus?.();
    };
  }, [dismissible, initialFocusRef, isOpen, modalId]);

  const isResponsive = variant === 'responsive';
  const isFullscreen = variant === 'fullscreen';
  const overlayClassName = clsx(
    usePortal && themeClass,
    'fixed inset-0 flex min-h-0 items-center justify-center',
    isResponsive && 'items-stretch justify-stretch p-0 md:items-center md:justify-center md:p-8',
    isFullscreen && 'items-stretch justify-stretch p-0',
    variant === 'dialog' && 'p-4 sm:p-6',
    className,
  );
  const responsivePanelClass = isResponsive
    ? 'h-[100dvh] max-w-none rounded-none border-0 p-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)] md:h-auto md:max-h-[calc(100dvh-4rem)] md:rounded-[2rem] md:border md:p-6'
    : '';
  const fullscreenPanelClass = isFullscreen
    ? 'h-[100dvh] max-w-none rounded-none border-0 p-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)]'
    : '';

  const modal = (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          className={overlayClassName}
          style={{ zIndex }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        >
          <div
            aria-hidden="true"
            className={clsx('absolute inset-0 bg-[color:var(--ui-scrim)] backdrop-blur-2xl', backdropClassName)}
            onClick={dismissible ? onClose : undefined}
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            className={clsx(
              'liquid-glass-panel relative z-10 flex w-full min-h-0 flex-col overflow-hidden text-[color:var(--ui-text-primary)] outline-none',
              !isFullscreen && !isResponsive && SIZE_CLASS[size],
              isResponsive && RESPONSIVE_SIZE_CLASS[size],
              responsivePanelClass,
              fullscreenPanelClass,
              variant === 'dialog' && 'max-h-[calc(100dvh-2rem)] rounded-[2rem] p-5 sm:max-h-[calc(100dvh-3rem)] sm:p-6',
              panelClassName,
            )}
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.985 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            onClick={(event) => event.stopPropagation()}
          >
            <header className={clsx('relative shrink-0 pr-10', headerClassName)}>
              {eyebrow ? <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--ui-text-tertiary)]">{eyebrow}</p> : null}
              <h2 id={titleId} className={clsx('font-semibold tracking-tight text-[color:var(--ui-text-primary)]', eyebrow ? 'mt-2 text-xl sm:text-2xl' : 'text-xl sm:text-2xl')}>
                {title}
              </h2>
              {description ? <p id={descriptionId} className="mt-2 text-sm leading-relaxed text-[color:var(--ui-text-secondary)]">{description}</p> : null}
              {showCloseButton ? (
                <button
                  type="button"
                  onClick={onClose}
                  disabled={!dismissible}
                  className="glass-icon-button absolute right-0 top-0 h-11 w-11 disabled:opacity-35"
                  aria-label={closeLabel}
                >
                  <X size={16} />
                </button>
              ) : null}
            </header>

            {children ? <div className={clsx('mt-5 min-h-0 flex-1 overflow-y-auto overscroll-contain glass-scrollbar', bodyClassName)}>{children}</div> : null}
            {footer ? <footer className={clsx('mt-auto flex shrink-0 items-center justify-end gap-3 pt-5', footerClassName)}>{footer}</footer> : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  if (usePortal && typeof document !== 'undefined') return createPortal(modal, document.body);
  return modal;
}

export default GlassModal;
