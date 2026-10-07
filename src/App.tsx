import React from 'react';
import { Route, Routes } from 'react-router';
import { ExperienceGate } from './components/onboarding/ExperienceGate';
import LazyLoadBoundary from './components/common/LazyLoadBoundary';

// The presentation site (src/pages/BetaLandingPage) is built on its own with
// `npm run build:site`; the dashboard does not ship it.
const GridTestView = import.meta.env.DEV ? React.lazy(() => import('./pages/GridTestView')) : null;

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
        <Route path="*" element={<ExperienceGate />} />
      </Routes>
    </div>
  );
}
