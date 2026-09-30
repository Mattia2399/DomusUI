import React from 'react';
import { Route, Routes } from 'react-router';
import { ExperienceGate } from './components/onboarding/ExperienceGate';
import LazyLoadBoundary from './components/common/LazyLoadBoundary';

// The presentation site ships in its own chunk so it never weighs on the dashboard.
const BetaLandingPage = React.lazy(() => import('./pages/BetaLandingPage'));
const GridTestView = import.meta.env.DEV ? React.lazy(() => import('./pages/GridTestView')) : null;

export default function App() {
  return (
    <div className="apple-bg-main min-h-screen">
      <Routes>
        <Route
          path="/beta"
          element={
            <LazyLoadBoundary fallback={<div className="min-h-screen bg-[#03050a]" />}>
              <BetaLandingPage />
            </LazyLoadBoundary>
          }
        />
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
