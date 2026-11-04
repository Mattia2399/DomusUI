import React from 'react';
import { Route, Routes } from 'react-router';
import { ExperienceGate } from './components/onboarding/ExperienceGate';
import LazyLoadBoundary from './components/common/LazyLoadBoundary';

// The presentation site (src/pages/BetaLandingPage) is built on its own with
// `npm run build:site`; the dashboard does not ship it.
// Its sample cards show everything, like the demo; loaded with the page, never in the dashboard bundle.
const GridTestView = import.meta.env.DEV
  ? React.lazy(async () => {
      const [{ default: View }, { AccessControlProvider }, { DEMO_ACCESS }] = await Promise.all([
        import('./pages/GridTestView'),
        import('./security/AccessControlProvider'),
        import('./security/accessControl'),
      ]);
      return {
        default: () => (
          <AccessControlProvider access={DEMO_ACCESS}>
            <View />
          </AccessControlProvider>
        ),
      };
    })
  : null;
// The shared device cards in every format, to compare with the design boards.
const DevicesLab = import.meta.env.DEV ? React.lazy(() => import('./pages/DevicesLab')) : null;
// Every shared control in its states, and the panel in its three shapes.
const ComponentsLab = import.meta.env.DEV ? React.lazy(() => import('./pages/dev/ComponentsLab')) : null;

export default function App() {
  return (
    <div className="apple-bg-main min-h-screen">
      <Routes>
        {GridTestView ? (
          <Route
            path="/grid-test/*"
            element={
              <LazyLoadBoundary fallback={null}>
                <GridTestView />
              </LazyLoadBoundary>
            }
          />
        ) : null}
        {DevicesLab ? (
          <Route
            path="/devices-lab/*"
            element={
              <LazyLoadBoundary fallback={null}>
                <DevicesLab />
              </LazyLoadBoundary>
            }
          />
        ) : null}
        {ComponentsLab ? (
          <Route
            path="/dev/componenti"
            element={
              <LazyLoadBoundary fallback={null}>
                <ComponentsLab />
              </LazyLoadBoundary>
            }
          />
        ) : null}
        <Route path="*" element={<ExperienceGate />} />
      </Routes>
    </div>
  );
}
