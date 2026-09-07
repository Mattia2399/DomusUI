import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  isDemoRouteAllowed,
  readSetupJourney,
  saveSetupJourney,
  type SetupJourney,
} from '../../services/setupJourney';
import GlassLoader from '../ui/GlassLoader';
import { DemoLockedRoute, OnboardingExperience } from './OnboardingExperience';
import { useDeviceAppearance } from './OnboardingGlass';
import { ArrowLeft, Languages } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';

const DashboardPage = React.lazy(() => import('../../pages/Home'));

export function isSetupRoute(pathname: string) {
  const normalized = pathname.toLowerCase().replace(/\/+$/, '') || '/';
  return normalized === '/setup' || normalized.startsWith('/setup/');
}

export function shouldForceCompletedConfiguration(
  pathname: string,
  phase: SetupJourney['phase'],
  search = '',
) {
  if (!isSetupRoute(pathname) || phase !== 'done') return false;
  return new URLSearchParams(search).get('reconnect') === '1';
}

function DashboardLoading() {
  const appearance = useDeviceAppearance();
  const { t } = useI18n();
  return (
    <div
      className={`apple-bg-main flex min-h-[100dvh] items-center justify-center ${
        appearance === 'light' ? 'dashboard-theme-light' : 'dashboard-theme-dark'
      }`}
    >
      <GlassLoader
        size="lg"
        label={t('route.loading.title')}
        description={t('route.loading.description')}
      />
    </div>
  );
}

export function ExperienceGate() {
  const { locale, t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const [journey, setJourney] = useState<SetupJourney>(() => {
    return readSetupJourney(window.localStorage, {
      embedded: window.parent !== window,
    });
  });
  const handleJourneyChange = useCallback((next: SetupJourney) => setJourney(next), []);
  const setupRoute = isSetupRoute(location.pathname);
  const forceConfiguration = shouldForceCompletedConfiguration(
    location.pathname,
    journey.phase,
    location.search,
  );

  useEffect(() => {
    if (journey.phase === 'done' && journey.mode === 'demo' && location.pathname === '/') {
      navigate('/home', { replace: true });
    }
  }, [journey.mode, journey.phase, location.pathname, navigate]);

  if (journey.phase !== 'done' || (setupRoute && forceConfiguration)) {
    return (
      <OnboardingExperience
        journey={journey}
        onJourneyChange={handleJourneyChange}
        forceConfiguration={forceConfiguration}
      />
    );
  }

  if (journey.mode === 'demo' && !isDemoRouteAllowed(location.pathname)) {
    return (
      <DemoLockedRoute
        pathname={location.pathname}
        onConnect={() => {
          const embedded = window.parent !== window;
          const next = saveSetupJourney({
            phase: 'discover',
            mode: 'real',
            connectionMethod: embedded ? 'panel' : 'direct',
          }, window.localStorage);
          setJourney(next);
          navigate('/setup');
        }}
      />
    );
  }

  const localizedRoutes = ['/home', '/rooms', '/settings', '/profile', '/support', '/setup', '/appgallery', '/appgalley'];
  const normalizedPath = location.pathname.toLowerCase().replace(/\/+$/, '') || '/';
  const routeIsLocalized = normalizedPath === '/' || localizedRoutes.some(
    (path) => normalizedPath === path || normalizedPath.startsWith(`${path}/`),
  );
  if (locale !== 'it' && !routeIsLocalized) {
    return (
      <main className="apple-bg-main flex min-h-[100dvh] items-center justify-center px-5 py-10 text-[color:var(--ui-text-primary)]">
        <section className="liquid-glass-panel w-full max-w-lg rounded-[2rem] border border-[color:var(--ui-border)] p-7 text-center shadow-2xl sm:p-10">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[color:var(--ui-fill-secondary)] text-[color:var(--ui-accent)]"><Languages size={22} /></span>
          <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--ui-text-tertiary)]">{t('route.comingSoon.eyebrow')}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t('route.comingSoon.title')}</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[color:var(--ui-text-secondary)]">{t('route.comingSoon.description')}</p>
          <button type="button" onClick={() => navigate('/home')} className="glass-button mx-auto mt-7 inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold">
            <ArrowLeft size={16} /> {t('route.comingSoon.back')}
          </button>
        </section>
      </main>
    );
  }

  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardPage />
    </Suspense>
  );
}

export default ExperienceGate;
