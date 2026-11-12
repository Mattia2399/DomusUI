import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import clsx from 'clsx';
import { resolveOverlayThemeClass, type DashboardThemeClass } from './portalTheme';
import { isTopOverlay, pushOverlay, removeOverlay } from './overlayStack';
import { useI18n } from '../../i18n/I18nProvider';

export type GlassModalSize = 'sm' | 'md' | 'lg' | 'xl';
export type GlassModalVariant = 'dialog' | 'responsive' | 'fullscreen';

export type GlassModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  /** A round mark before the title: beside it (a device), or above it (a question to confirm). */
  icon?: React.ReactNode;
  iconLayout?: 'inline' | 'stacked';
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
  /** data-* attributes on the overlay, as the shape and the function of a GlassSheet. */
  overlayData?: Record<string, string | undefined>;
  /** How the panel comes in: as always (default), rising from the bottom, or from the right. */
  panelMotion?: 'pop' | 'rise' | 'side';
};

// As the sheets of the prototypes (docs/design/app/sicurezza.html: up, side).
const SHEET_EASE = [0.2, 0.8, 0.2, 1] as const;
const PANEL_MOTION = {
  rise: { initial: { opacity: 0.5, y: 40 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 40 }, transition: { duration: 0.3, ease: SHEET_EASE } },
  side: { initial: { opacity: 0.5, x: 30 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: 30 }, transition: { duration: 0.3, ease: SHEET_EASE } },
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
  icon,
  iconLayout = 'inline',
  eyebrow,
  description,
  children,
  footer,
  size = 'md',
  variant = 'dialog',
  closeLabel,
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
  overlayData,
  panelMotion = 'pop',
}: GlassModalProps) {
  const { t } = useI18n();
  const resolvedCloseLabel = closeLabel ?? t('common.closeDialog');
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
    pushOverlay(modalId);
    lockBodyScroll();

    const focusTimer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const preferredFocus = initialFocusRef?.current;
      const firstFocusable = getFocusableElements(panel)[0];
      (preferredFocus ?? firstFocusable ?? panel).focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTopOverlay(modalId)) return;
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
      removeOverlay(modalId);
      unlockBodyScroll();
      previousFocusRef.current?.focus?.();
    };
  }, [dismissible, initialFocusRef, isOpen, modalId]);

  const isResponsive = variant === 'responsive';
  const isFullscreen = variant === 'fullscreen';
  const overlayClassName = clsx(
    usePortal && themeClass,
    'fixed inset-0 flex min-h-0 justify-center',
    isResponsive && 'items-stretch justify-stretch p-0 md:items-center md:justify-center md:p-8',
    isFullscreen && 'items-stretch justify-stretch p-0',
    // As on the Rooms board: on a phone a dialog rises from the bottom, 8 px above it; on a large screen it is centred.
    variant === 'dialog' && 'items-end p-2 pb-[calc(env(safe-area-inset-bottom)+8px)] md:items-center md:p-6',
    className,
  );
  const responsivePanelClass = isResponsive
    ? 'h-[100dvh] max-w-none rounded-none border-0 p-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)] md:h-auto md:max-h-[90dvh] md:rounded-[30px] md:border md:p-[18px]'
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
          {...(overlayData && Object.fromEntries(Object.entries(overlayData).map(([key, value]) => [`data-${key}`, value])))}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        >
          <div
            aria-hidden="true"
            className={clsx('absolute inset-0 bg-[color:var(--ui-scrim)] backdrop-blur-[8px]', backdropClassName)}
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
              'glass-sheet-surface relative z-10 flex w-full min-h-0 flex-col overflow-hidden text-[color:var(--ui-text-primary)] outline-none',
              !isFullscreen && !isResponsive && SIZE_CLASS[size],
              isResponsive && RESPONSIVE_SIZE_CLASS[size],
              responsivePanelClass,
              fullscreenPanelClass,
              variant === 'dialog' && 'max-h-[90dvh] rounded-[30px] p-[18px]',
              panelClassName,
            )}
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.985 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            {...(panelMotion === 'pop' ? null : PANEL_MOTION[panelMotion])}
            onClick={(event) => event.stopPropagation()}
          >
            <header
              className={clsx(
                'relative shrink-0',
                showCloseButton && 'min-h-10 pr-12',
                icon && iconLayout === 'inline' && 'flex items-center gap-3',
                icon && iconLayout === 'stacked' && 'flex flex-col items-start gap-3.5',
                headerClassName,
              )}
            >
              {icon ? <span aria-hidden="true" className="flex shrink-0">{icon}</span> : null}
              {icon ? (
                <div className="min-w-0 flex-1">
                  {eyebrow ? <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--ui-text-tertiary)]">{eyebrow}</p> : null}
                  <h2
                    id={titleId}
                    className={clsx(
                      'font-bold leading-tight tracking-[-0.02em] text-[color:var(--ui-text-primary)]',
                      iconLayout === 'inline' ? 'truncate text-[20px]' : 'text-[19px]',
                      eyebrow && 'mt-1',
                    )}
                  >
                    {title}
                  </h2>
                  {description ? (
                    <p
                      id={descriptionId}
                      className={clsx(
                        'text-[color:var(--ui-text-secondary)]',
                        iconLayout === 'inline' ? 'mt-0.5 truncate text-[13px] font-semibold' : 'mt-2 text-sm font-medium leading-[1.45]',
                      )}
                    >
                      {description}
                    </p>
                  ) : null}
                </div>
              ) : (
                <>
                  {eyebrow ? <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--ui-text-tertiary)]">{eyebrow}</p> : null}
                  <h2
                    id={titleId}
                    className={clsx('text-[19px] font-bold leading-tight tracking-[-0.02em] text-[color:var(--ui-text-primary)]', eyebrow ? 'mt-1.5' : 'pt-2')}
                  >
                    {title}
                  </h2>
                  {description ? <p id={descriptionId} className="mt-1.5 text-sm leading-relaxed text-[color:var(--ui-text-secondary)]">{description}</p> : null}
                </>
              )}
              {showCloseButton ? (
                <button
                  type="button"
                  onClick={onClose}
                  disabled={!dismissible}
                  className={clsx('glass-sheet-close h-10 w-10 disabled:opacity-35', icon && iconLayout === 'inline' ? 'absolute right-0 top-1/2 -translate-y-1/2' : 'absolute right-0 top-0')}
                  aria-label={resolvedCloseLabel}
                >
                  <X size={15} strokeWidth={2.4} />
                </button>
              ) : null}
            </header>

            {children ? <div className={clsx('mt-[14px] min-h-0 flex-1 overflow-y-auto overscroll-contain glass-scrollbar', bodyClassName)}>{children}</div> : null}
            {footer ? <footer className={clsx('mt-auto flex shrink-0 items-center justify-end gap-2.5 pt-[14px]', footerClassName)}>{footer}</footer> : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  if (usePortal && typeof document !== 'undefined') return createPortal(modal, document.body);
  return modal;
}

export default GlassModal;
