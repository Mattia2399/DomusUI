import { MotionConfig } from 'framer-motion';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { SiteLocale } from '../src/components/site/i18n/SiteLocaleProvider';
import { ErrorBoundary } from '../src/components/common/ErrorBoundary';
import { BetaLandingPage } from '../src/pages/BetaLandingPage';
import './styles.css';

/**
 * Entry point of the standalone website build (vite.site.config.ts), shared by
 * the Italian page (/) and the English one (/en/). The language comes from the
 * page's <html lang>; the switch links between the two real URLs.
 */
const locale: SiteLocale = document.documentElement.lang === 'en' ? 'en' : 'it';
const languageLinks: Record<SiteLocale, string> = locale === 'it' ? { it: './', en: './en/' } : { it: '../', en: './' };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <ErrorBoundary>
        <BetaLandingPage locale={locale} languageLinks={languageLinks} />
      </ErrorBoundary>
    </MotionConfig>
  </StrictMode>,
);
