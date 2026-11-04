import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { MotionConfig } from 'framer-motion';
import App from './App.tsx';
import { ErrorBoundary } from './components/common/ErrorBoundary.tsx';
import { captureAppBase } from './config/publicAssets';
import { NotificationProvider } from './context/NotificationProvider';
import { I18nProvider, preloadInitialTranslationCatalog, resolveInitialLocale } from './i18n/I18nProvider';
import { loadOnboardingTranslations } from './i18n/onboardingTranslations';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import './assets/index.css';
import './theme/glassTokens.css';
import './components/ui/glassControl.css';
import './components/ui/glassButton.css';

declare global {
  interface Window {
    /** Set by public/compat-check.js when this browser cannot run Domus UI. */
    __DOMUS_UNSUPPORTED_BROWSER__?: boolean;
  }
}

// Before the router can move the page away from index.html.
captureAppBase();

function renderApp() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <MotionConfig reducedMotion="user">
          <ErrorBoundary>
            <I18nProvider>
              <NotificationProvider>
                <App />
              </NotificationProvider>
            </I18nProvider>
          </ErrorBoundary>
        </MotionConfig>
      </BrowserRouter>
    </StrictMode>,
  );
}

// The compatibility check already explains what to update: do not start the app over it.
if (!window.__DOMUS_UNSUPPORTED_BROWSER__) {
  // The words of first-run setup in the starting language come with it, in
  // parallel and without holding the first paint; setup waits for them if
  // they are late (docs/performance-onboarding-boot.md).
  void loadOnboardingTranslations(resolveInitialLocale()).catch(() => undefined);
  void preloadInitialTranslationCatalog().then(renderApp).catch((error) => {
    console.error('[Domus UI] Translation catalog could not be loaded.', error);
    const root = document.getElementById('root');
    if (root) {
      root.setAttribute('role', 'alert');
      root.textContent = 'Domus UI could not load the interface language. Reload the page to try again.';
    }
  });
}
