import React from 'react';

/*
 * The notifications panel loads the first time it is opened, not with the Dashboard, so that it
 * stays out of the Dashboard chunk. Once loaded it stays mounted, so closing it animates as before.
 * Used by the bell of the side bar (LeftSidebar) and by the bell of the phone (XsNotificationBell).
 */

const DashboardNotificationsPanel = React.lazy(() => import('./DashboardNotificationsPanel'));

export function LazyDashboardNotificationsPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [wanted, setWanted] = React.useState(isOpen);
  if (isOpen && !wanted) setWanted(true);
  if (!wanted) return null;
  return (
    <React.Suspense fallback={null}>
      <DashboardNotificationsPanel isOpen={isOpen} onClose={onClose} />
    </React.Suspense>
  );
}

export default LazyDashboardNotificationsPanel;
