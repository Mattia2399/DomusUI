import { MotionConfig } from 'framer-motion';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from '../src/components/common/ErrorBoundary';
import { I18nProvider } from '../src/i18n/I18nProvider';
import { BetaLandingPage } from '../src/pages/BetaLandingPage';
import './styles.css';

/**
 * Entry point of the standalone website build (vite.site.config.ts).
 * Only the providers the real cards need: translations, reduced-motion
 * preference and an error boundary. No router, no Home Assistant session.
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <ErrorBoundary>
        <I18nProvider>
          <BetaLandingPage />
        </I18nProvider>
      </ErrorBoundary>
    </MotionConfig>
  </StrictMode>,
);
