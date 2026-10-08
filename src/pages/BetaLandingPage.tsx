import { useEffect, useMemo, useState } from 'react';
import '../components/site/site.css';
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
import { EnergySection } from '../components/site/sections/EnergySection';
import { UpdatesSection } from '../components/site/sections/UpdatesSection';
import { SiteNav } from '../components/site/SiteNav';

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
  const [previewLocale, setPreviewLocale] = useState<SiteLocale>('it');
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
      <DemoHomeProvider>
        <SitePage locale={locale} />
      </DemoHomeProvider>
    </SiteLocaleProvider>
  );
}

function SitePage({ locale }: { locale: SiteLocale }) {
  const { meta } = useSiteCopy();
  useEffect(() => {
    // On a direct /#energy visit the target does not exist until React mounts.
    if (!window.location.hash) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, []);
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
        <EnergySection />
        <UpdatesSection />
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
