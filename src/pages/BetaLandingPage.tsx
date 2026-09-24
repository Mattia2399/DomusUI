import '../components/site/site.css';
import { registerSiteFonts } from '../components/site/fonts';
import { DemoHomeProvider } from '../components/site/demo/DemoHomeProvider';
import { AppsSection } from '../components/site/sections/AppsSection';
import { CardsSection } from '../components/site/sections/CardsSection';
import { FinaleSection } from '../components/site/sections/FinaleSection';
import { HeroSection } from '../components/site/sections/HeroSection';
import { InstallSection } from '../components/site/sections/InstallSection';
import { LayoutsSection } from '../components/site/sections/LayoutsSection';
import { LiveHomeSection } from '../components/site/sections/LiveHomeSection';
import { ManifestoSection } from '../components/site/sections/ManifestoSection';
import { TrustSection } from '../components/site/sections/TrustSection';
import { SiteNav } from '../components/site/SiteNav';

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
export function BetaLandingPage() {
  return (
    <DemoHomeProvider>
      <div className="site dashboard-theme-dark" lang="it">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-black"
        >
          Vai al contenuto
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
        </main>
        <FinaleSection />
      </div>
    </DemoHomeProvider>
  );
}

export default BetaLandingPage;
