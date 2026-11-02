import React from 'react';
import { LazyLoadErrorBoundary } from '../common/LazyLoadBoundary';
import type { MobileSidebarDrawerProps } from './MobileSidebarDrawer';

/*
 * The phone menu, with its quick cards, loads when it is first wanted rather
 * than with the Home: after the Home has settled, or as soon as the menu
 * button is touched or focused. It mounts closed and opens on the next frame,
 * so the first opening slides in and takes the focus like every other.
 */

const loadMobileSidebarDrawer = () => import('./MobileSidebarDrawer');
const MobileSidebarDrawer = React.lazy(() =>
  loadMobileSidebarDrawer().then((module) => ({ default: module.MobileSidebarDrawer })),
);

export function preloadMobileSidebarDrawer() {
  void loadMobileSidebarDrawer().catch(() => undefined);
}

function AfterMount({ onMounted }: { onMounted: () => void }) {
  React.useEffect(() => {
    const frame = window.requestAnimationFrame(onMounted);
    return () => window.cancelAnimationFrame(frame);
  }, [onMounted]);
  return null;
}

export function LazyMobileSidebarDrawer(props: MobileSidebarDrawerProps) {
  const [wanted, setWanted] = React.useState(props.isOpen);
  const [mounted, setMounted] = React.useState(false);
  const markMounted = React.useCallback(() => setMounted(true), []);
  if (props.isOpen && !wanted) setWanted(true);

  React.useEffect(() => {
    if (wanted) return undefined;
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(preloadMobileSidebarDrawer, { timeout: 4000 });
      return () => window.cancelIdleCallback(handle);
    }
    const timer = window.setTimeout(preloadMobileSidebarDrawer, 1500);
    return () => window.clearTimeout(timer);
  }, [wanted]);

  if (!wanted) return null;
  return (
    <LazyLoadErrorBoundary failure={null}>
      <React.Suspense fallback={null}>
        <MobileSidebarDrawer {...props} isOpen={props.isOpen && mounted} />
        {mounted ? null : <AfterMount onMounted={markMounted} />}
      </React.Suspense>
    </LazyLoadErrorBoundary>
  );
}
