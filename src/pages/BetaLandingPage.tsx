import { useMemo, useState } from 'react';
import '../components/site/site.css';
import { registerSiteFonts } from '../components/site/fonts';
import { DemoHomeProvider } from '../components/site/demo/DemoHomeProvider';
import { SiteLocaleProvider, useSiteCopy, type SiteLocale } from '../components/site/i18n/SiteLocaleProvider';
import { AppsSection } from '../components/site/sections/AppsSection';
import { CardsSection } from '../components/site/sections/CardsSection';
import { FinaleSection } from '../components/site/sections/FinaleSection';
import { HeroSection } from '../components/site/sections/HeroSection';
import { InstallSection } from '../components/site/sections/InstallSection';
import { LayoutsSection } from '../components/site/sections/LayoutsSection';
import { LiveHomeSection } from '../components/site/sections/LiveHomeSection';
import { ManifestoSection } from '../components/site/sections/ManifestoSection';
import { SupportSection } from '../components/site/sections/SupportSection';
import { TrustSection } from '../components/site/sections/TrustSection';
import { SiteNav } from '../components/site/SiteNav';
import { I18nProvider, useI18n } from '../i18n/I18nProvider';

registerSiteFonts();

/**
 * /beta — the Domus UI presentation site.
 *
 * One continuous, scroll-driven story built from the product's own cards:
 * the home assembles (hero), gets a voice (manifesto), reflows across
 * screens (layouts), comes apart card by card (cards), reacts to touch
 * (live), grows beyond the dashboard (apps), shows who is in charge (trust)
 * and ends where it began (install, finale). The shared demo home keeps every
 * card in sync across scenes.
 */
export function BetaLandingPage({
  locale: pageLocale,
  languageLinks,
}: {
  /** Fixed language of a standalone page (`/` or `/en/`). */
  locale?: SiteLocale;
  /** Real URLs of each language version; without them the switch changes language in place. */
  languageLinks?: Record<SiteLocale, string>;
}) {
  const appLocale = useI18n().locale;
  // Inside the app (/beta) follow the app language; French falls back to English.
  const [previewLocale, setPreviewLocale] = useState<SiteLocale>(appLocale === 'it' ? 'it' : 'en');
  const locale = pageLocale ?? previewLocale;

  const switchTo = useMemo(
    () =>
      languageLinks
        ? { it: { href: languageLinks.it }, en: { href: languageLinks.en } }
        : { it: { onSelect: () => setPreviewLocale('it') }, en: { onSelect: () => setPreviewLocale('en') } },
    [languageLinks],
  );

  return (
    <SiteLocaleProvider locale={locale} switchTo={switchTo}>
      {/* The real cards speak the page's language, independently of the app setting. */}
      <I18nProvider forcedLocale={locale}>
        <DemoHomeProvider>
          <SitePage locale={locale} />
        </DemoHomeProvider>
      </I18nProvider>
    </SiteLocaleProvider>
  );
}

function SitePage({ locale }: { locale: SiteLocale }) {
  const { meta } = useSiteCopy();
  return (
    <div className="site dashboard-theme-dark" lang={locale}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-black"
      >
        {meta.skipToContent}
      </a>
      <SiteNav />
      <main id="main">
        <HeroSection />
        <ManifestoSection />
        <LayoutsSection />
        <CardsSection />
        <LiveHomeSection />
        <AppsSection />
        <TrustSection />
        <InstallSection />
        <SupportSection />
      </main>
      <FinaleSection />
    </div>
  );
}

export default BetaLandingPage;
