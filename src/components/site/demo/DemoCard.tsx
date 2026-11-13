import { Component, lazy, Suspense, useRef, type ReactNode } from 'react';
import { useInView } from 'framer-motion';
import type { GridEngineBreakpoint } from '../../dashboard/dashboardBreakpointConfig';
import { useSiteCopy } from '../i18n/SiteLocaleProvider';
import type { DemoCardId } from './fixtures';

const Runtime = lazy(() => import('./DemoCardRuntime'));

export type CardSpan = { w: number; h: number };
export type DemoCardProps = {
  id: DemoCardId;
  span?: CardSpan;
  breakpoint?: GridEngineBreakpoint;
  interactive?: boolean;
};

// A failed optional demo must not take the presentation or installation links down.
class DemoBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/** Mount real widgets only near the viewport; preserve the scene's grid geometry. */
export function DemoCard(props: DemoCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref, { margin: '200px 0px' });
  const { demo, live } = useSiteCopy();
  const fallback = (
    <div className="s-demo-placeholder">
      <span>{demo.titles[props.id]}</span>
      <small>{live.badge}</small>
    </div>
  );
  return (
    <div ref={ref} className="h-full w-full" data-demo-card={props.id}>
      <DemoBoundary fallback={fallback}>
        <Suspense fallback={fallback}>{visible ? <Runtime {...props} /> : fallback}</Suspense>
      </DemoBoundary>
    </div>
  );
}
