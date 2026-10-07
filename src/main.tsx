import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { MotionConfig } from 'framer-motion';
import App from './App.tsx';
import { ErrorBoundary } from './components/common/ErrorBoundary.tsx';
import { captureAppBase } from './config/publicAssets';
import { NotificationProvider } from './context/NotificationProvider';
import { I18nProvider } from './i18n/I18nProvider';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import './assets/index.css';

declare global {
  interface Window {
    /** Set by public/compat-check.js when this browser cannot run Domus UI. */
    __DOMUS_UNSUPPORTED_BROWSER__?: boolean;
  }
}

// Before the router can move the page away from index.html.
captureAppBase();

// The compatibility check already explains what to update: do not start the app over it.
if (!window.__DOMUS_UNSUPPORTED_BROWSER__) createRoot(document.getElementById('root')!).render(
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
