import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import clsx from 'clsx';
import { motion, useReducedMotion } from 'framer-motion';
import { PageHeader } from './PageHeader';
import { usePageFrame } from './PageFrame';
import { isTopOverlay, pushOverlay, removeOverlay } from './overlayStack';
import { PUSH_DURATION_MS, PUSH_EASING_CURVE } from './usePagePushTransition';
import './pageFrame.css';

export type SubPageProps = {
  title: ReactNode;
  /** A small line under the title. */
  detail?: ReactNode;
  /** At the right of the title: PageHeaderButton. */
  tools?: ReactNode;
  /** Closes it: ‹ and Esc. */
  onClose: () => void;
  /** Spoken name of ‹; "Indietro" when not given. */
  backLabel?: string;
  children: ReactNode;
  className?: string;
};

const SIDE_EASING = [0.2, 0.8, 0.2, 1] as const;

/**
 * The second level: "Tutte ›", the gear, a row. In a narrow page it covers the page,
 * coming from the right; in a wide one (from 760 px of the page) it opens as a column of
 * glass at the right, and the page stays in view. Put it in the `subPage` of a PageFrame.
 * docs/design/app/REGOLE-app.md §4.
 */
export function SubPage({ title, detail, tools, onClose, backLabel, children, className }: SubPageProps) {
  const frame = usePageFrame();
  const layout = frame?.layout ?? 'sheet';
  const reduceMotion = useReducedMotion();
  const overlayId = useId();
  const titleId = `${overlayId}-title`;
  const titleRef = useRef<HTMLHeadingElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // The focus goes to the title, and back to what opened it when it closes.
  useLayoutEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    titleRef.current?.focus({ preventScroll: true });
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  // Esc closes it, unless a sheet or a dialog is open over it.
  useEffect(() => {
    pushOverlay(overlayId);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || !isTopOverlay(overlayId)) return;
      event.preventDefault();
      onCloseRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      removeOverlay(overlayId);
    };
  }, [overlayId]);

  const motionProps = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.16 } }
    : layout === 'column'
      ? { initial: { opacity: 0.5, x: 30 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: 30 }, transition: { duration: 0.3, ease: SIDE_EASING } }
      : { initial: { x: '100%' }, animate: { x: 0 }, exit: { x: '100%' }, transition: { duration: PUSH_DURATION_MS / 1000, ease: PUSH_EASING_CURVE } };

  return (
    <motion.section
      className={clsx('page-subpage page-glass', className)}
      aria-labelledby={titleId}
      data-layout={layout}
      data-testid="sub-page"
      {...motionProps}
    >
      <PageHeader title={title} detail={detail} tools={tools} onBack={onClose} backLabel={backLabel} headingLevel={2} titleId={titleId} titleRef={titleRef} />
      {children}
    </motion.section>
  );
}

export default SubPage;
