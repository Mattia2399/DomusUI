import React, { Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { ExperienceGate } from './components/onboarding/ExperienceGate';

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
            <Suspense fallback={<div className="min-h-screen bg-[#03050a]" />}>
              <BetaLandingPage />
            </Suspense>
          }
        />
        {GridTestView ? (
          <Route
            path="/grid-test/*"
            element={
              <Suspense fallback={null}>
                <GridTestView />
              </Suspense>
            }
          />
        ) : null}
        <Route path="*" element={<ExperienceGate />} />
      </Routes>
    </div>
  );
}
