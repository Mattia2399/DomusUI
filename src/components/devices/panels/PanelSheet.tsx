import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { clsx } from 'clsx';
import '../theme/panelSheet.css';

/*
 * How a panel opens on a phone, the same in every page: it slides up from the
 * bottom to one fixed height, so that going from a panel to another shows no
 * difference, and a drag on the handle lets it go.
 */

const CLOSE_AFTER_PX = 88;

const FOCUSABLE = 'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])';

export type PanelSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  /** The name of the panel for assistive technology. */
  title: string;
  closeLabel?: string;
  /** A short sheet that is not a device panel: as tall as what it holds. */
  fitContent?: boolean;
  /** Above what the page draws; the Home stays below its full screen player. */
  zIndex?: number;
  /** What stays above the scrolling content. */
  head?: React.ReactNode;
  children: React.ReactNode;
};

export function PanelSheet({ isOpen, onClose, title, closeLabel, fitContent = false, zIndex = 260, head, children }: PanelSheetProps) {
  const surface = React.useRef<HTMLDivElement | null>(null);
  const [offset, setOffset] = React.useState(0);
  const drag = React.useRef<{ pointer: number; startY: number; offset: number } | null>(null);
  const close = React.useRef(onClose);
  close.current = onClose;

  React.useEffect(() => {
    if (!isOpen) return undefined;
    const before = document.activeElement as HTMLElement | null;
    surface.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close.current();
        return;
      }
      const node = surface.current;
      if (event.key !== 'Tab' || !node) return;
      const focusable = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === node)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      before?.focus?.({ preventScroll: true });
    };
  }, [isOpen]);

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    drag.current = null;
    setOffset(0);
    if (current.offset >= CLOSE_AFTER_PX) onClose();
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen ? (
        <React.Fragment key="panel-sheet">
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="dv-panel-sheet-scrim"
            style={{ zIndex }}
            aria-label={closeLabel ?? title}
          />
          <div className="dv-panel-sheet-place" style={{ zIndex: zIndex + 1 }}>
            <motion.section
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="w-full"
            >
              <div
                ref={surface}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                tabIndex={-1}
                className={clsx('device-context-surface glass-sheet-surface dv-panel-sheet', fitContent && 'is-fit')}
                style={offset > 0 ? { transform: `translateY(${offset}px)` } : undefined}
              >
                <div
                  className="dv-panel-sheet-handle"
                  onPointerDown={(event) => {
                    drag.current = { pointer: event.pointerId, startY: event.clientY, offset: 0 };
                    event.currentTarget.setPointerCapture?.(event.pointerId);
                  }}
                  onPointerMove={(event) => {
                    const current = drag.current;
                    if (!current || current.pointer !== event.pointerId) return;
                    current.offset = Math.max(0, event.clientY - current.startY);
                    setOffset(current.offset);
                  }}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                >
                  <span className="liquid-glass-drag-handle" />
                </div>
                {head}
                <div className="dv-panel-sheet-body">{children}</div>
              </div>
            </motion.section>
          </div>
        </React.Fragment>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

export default PanelSheet;
