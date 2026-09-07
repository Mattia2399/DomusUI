import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { MotionConfig } from 'framer-motion';
import App from './App.tsx';
import { ErrorBoundary } from './components/common/ErrorBoundary.tsx';
import { NotificationProvider } from './context/NotificationProvider';
import { I18nProvider } from './i18n/I18nProvider';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import './assets/index.css';

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
