import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import './pageKit.css';
import './pageFrame.css';

/** From this width of the page (not of the window) a subpage and a sheet open as a column at the right. */
export const PAGE_COLUMN_MIN_WIDTH = 760;

/** `sheet`: a narrow page, where a sheet rises from the bottom; `column`: a wide one. */
export type PageLayout = 'sheet' | 'column';

/** The functions with a colour of their own (glassTokens.css, data-fn). */
export type PageFunction = 'security' | 'irrigation' | 'climate' | 'energy' | 'waste';

export function pageLayoutFor(width: number): PageLayout {
  return width >= PAGE_COLUMN_MIN_WIDTH ? 'column' : 'sheet';
}

type PageFrameValue = { layout: PageLayout; fn?: PageFunction };

const PageFrameContext = createContext<PageFrameValue | null>(null);

/** The layout of the page around, and its function; null outside a PageFrame. */
export function usePageFrame() {
  return useContext(PageFrameContext);
}

export type PageFrameProps = {
  children: ReactNode;
  /** The function the page belongs to: its colour reaches everything inside, sheets included. */
  fn?: PageFunction;
  className?: string;
};

/**
 * The container of a new page. It measures its own width, so that what opens over it
 * (subpage, sheet) takes its shape from the page and not from the window.
 */
export function PageFrame({ children, fn, className }: PageFrameProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<PageLayout>('sheet');

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    setLayout(pageLayoutFor(frame.clientWidth));
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setLayout(pageLayoutFor(entry.contentRect.width)));
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const value = useMemo(() => ({ layout, fn }), [layout, fn]);
  return (
    <PageFrameContext.Provider value={value}>
      <div ref={frameRef} className={clsx('page-frame', className)} data-fn={fn} data-layout={layout} data-testid="page-frame">
        {children}
      </div>
    </PageFrameContext.Provider>
  );
}

export default PageFrame;
