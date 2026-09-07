import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Bot,
  Camera,
  Check,
  ChevronRight,
  CloudSun,
  DoorClosed,
  Gauge,
  Lightbulb,
  Layers3,
  LockKeyhole,
  Network,
  PanelsTopLeft,
  Play,
  RefreshCw,
  Server,
  Shapes,
  ShieldCheck,
  Thermometer,
  ToggleLeft,
  Users,
  Sparkles,
  WandSparkles,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useHaLiveConnection } from '../../hooks/useHaLiveConnection';
import { useHaPanelBridgeConnection } from '../../hooks/useHaPanelBridgeConnection';
import {
  buildHaOAuthAuthorizeUrl,
  clearHassAuthTokensStorage,
  exchangeHaOAuthCode,
  loadHaLiveConfig,
  persistHaOAuthSession,
  saveHaLiveConfig,
  validateHassUrl,
} from '../../services/haLive';
import {
  saveSetupJourney,
  type SetupJourney,
  type SetupScanSummary,
} from '../../services/setupJourney';
import {
  HA_SHARED_HOUSE_CONFIGURATION_KEY,
  parseSharedHouseConfiguration,
  type SharedHouseConfiguration,
} from '../../services/dashboardConfigurationRepository';
import {
  resolveOAuthReturnPath,
  validateHaOAuthCallbackState,
  type HaOAuthStatePayload,
} from '../../security/oauthState';
import {
  buildSetupEntityGroupCounts,
  buildSetupEntityGroupCountsFromRegistry,
  groupLegacySetupDomains,
  listSetupEntityGroups,
  type SetupEntityGroupId,
} from '../../services/setupEntityGroups';
import { GlassLoader } from '../ui/GlassLoader';
import {
  SetupActionButton,
  SetupBackdrop,
  SetupBackButton,
  SetupNotice,
  SetupSecondaryButton,
  ReconnectShell,
  WizardActions,
  WizardShell,
} from './OnboardingGlass';
import { OnboardingOrganizer } from './OnboardingOrganizer';
import { useI18n } from '../../i18n/I18nProvider';
import { translateOnboarding, type OnboardingTranslationKey } from '../../i18n/onboardingTranslations';

const HA_OAUTH_CALLBACK_PARAM = 'ha_oauth_callback';
const HA_OAUTH_SESSION_STATE_KEY = 'ha.dashboard.oauth.state';
const SETUP_REQUEST_TIMEOUT_MS = 6000;
const DISCOVERY_MINIMUM_VISIBLE_MS = 900;
const PANEL_DISCOVERY_TIMEOUT_MS = 5000;
const DIRECT_DISCOVERY_TIMEOUT_MS = 1400;

const SETUP_GROUP_ICONS: Record<SetupEntityGroupId, LucideIcon> = {
  lights: Lightbulb,
  locks: LockKeyhole,
  covers: PanelsTopLeft,
  climate: Thermometer,
  security: ShieldCheck,
  cameras: Camera,
  energy: Zap,
  sensors: Gauge,
  controls: ToggleLeft,
  media: Play,
  cleaning: Bot,
  presence: Users,
  scenes: WandSparkles,
  weather: CloudSun,
  updates: RefreshCw,
  other: Shapes,
};

type Props = {
  journey: SetupJourney;
  onJourneyChange: (journey: SetupJourney) => void;
  forceConfiguration?: boolean;
};

function createOAuthNonce() {
  if (window.crypto?.getRandomValues) {
    const bytes = new Uint8Array(18);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function persistJourney(
  journey: Omit<SetupJourney, 'version' | 'updatedAt'>,
  onJourneyChange: (journey: SetupJourney) => void,
) {
  const next = saveSetupJourney(journey, window.localStorage);
  onJourneyChange(next);
  return next;
}

function settleSetupRequest<T>(request: Promise<T | null>, timeoutMs = SETUP_REQUEST_TIMEOUT_MS) {
  return new Promise<T | null>((resolve) => {
    let settled = false;
    const finish = (value: T | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      resolve(value);
    };
    const timeoutId = window.setTimeout(() => finish(null), timeoutMs);
    void request.then(finish).catch(() => finish(null));
  });
}

type SharedConfigurationProbeResult =
  | { status: 'found'; document: SharedHouseConfiguration }
  | { status: 'empty' }
  | { status: 'unavailable' }
  | { status: 'invalid' };

async function probeSharedHouseConfiguration(
  callApi: <T = unknown>(
    message: Record<string, unknown>,
    options?: { reportError?: boolean; throwOnError?: boolean },
  ) => Promise<T | null>,
): Promise<SharedConfigurationProbeResult> {
  const response = await settleSetupRequest(callApi<unknown>({
    type: 'frontend/get_system_data',
    key: HA_SHARED_HOUSE_CONFIGURATION_KEY,
  }, { reportError: false, throwOnError: true }));

  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    return { status: 'unavailable' };
  }
  if (!Object.prototype.hasOwnProperty.call(response, 'value')) {
    return { status: 'unavailable' };
  }
  const value = (response as { value?: unknown }).value;
  if (value === null || value === undefined) {
    return { status: 'empty' };
  }
  const document = parseSharedHouseConfiguration(value);
  return document ? { status: 'found', document } : { status: 'invalid' };
}

function WelcomeStep({ onContinue }: { onContinue: () => void }) {
  const { locale } = useI18n();
  const ot = (key: OnboardingTranslationKey) => translateOnboarding(locale, key);
  return (
    <SetupBackdrop>
      <section className="onboarding-window grid w-full max-w-6xl !min-h-0 gap-0 lg:grid-cols-[0.88fr_1.12fr]">
        <div className="flex flex-col justify-center p-6 sm:p-9 lg:p-12">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:rgb(var(--ui-accent-rgb))]">
            {ot('welcome.eyebrow')}
          </p>
          <h1 className="mt-4 text-[clamp(2.45rem,7vw,4.5rem)] font-semibold leading-[0.94] tracking-[-0.06em] text-[color:var(--ui-text-primary)]">
            {ot('welcome.title').split('\n').map((line, index) => <span key={line}>{index > 0 ? <br /> : null}{line}</span>)}
          </h1>
          <p className="mt-5 max-w-lg text-sm leading-6 text-[color:var(--ui-text-secondary)] sm:text-base sm:leading-7">
            {ot('welcome.description')}
          </p>
          <div className="mt-8 max-w-xs sm:max-w-none">
            <SetupActionButton onClick={onContinue}>{ot('welcome.start')}</SetupActionButton>
          </div>
        </div>

        <div className="border-t border-[color:var(--ui-border)] p-3 sm:p-6 lg:border-l lg:border-t-0 lg:p-8">
          <div className="onboarding-card relative h-full min-h-[310px] overflow-hidden p-4 sm:min-h-[420px] sm:p-5">
            <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_70%_12%,rgb(var(--ui-accent-rgb)/0.16),transparent_35%),radial-gradient(circle_at_16%_90%,rgb(var(--ui-accent-secondary-rgb)/0.12),transparent_38%)]" />
            <div className="relative flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[11px] font-medium text-[color:var(--ui-text-secondary)]">{ot('welcome.preview.greeting')}</div>
                <div className="mt-0.5 truncate text-xl font-semibold tracking-[-0.035em] text-[color:var(--ui-text-primary)] sm:text-2xl">{ot('welcome.preview.ready')}</div>
              </div>
              <div className="onboarding-pill shrink-0 gap-2 px-3 py-2 text-xs font-semibold text-[color:var(--ui-text-primary)]"><CloudSun size={15} /> 22°</div>
            </div>

            <div className="relative mt-6 flex gap-2 overflow-hidden">
              {[ot('welcome.preview.arrival'), ot('welcome.preview.relax'), ot('welcome.preview.night')].map((scene, index) => (
                <div key={scene} className="onboarding-pill min-w-0 flex-1 gap-1.5 px-2.5 py-2 text-[11px] font-medium text-[color:var(--ui-text-primary)]">
                  <Sparkles size={12} style={{ color: `rgb(var(--ui-accent-rgb${index === 2 ? '-2' : ''}))` }} />
                  <span className="truncate">{scene}</span>
                </div>
              ))}
            </div>

            <div className="relative mt-4 grid grid-cols-2 gap-2.5 sm:gap-3">
              {[
                { title: ot('welcome.preview.lights'), value: ot('welcome.preview.lightsValue'), icon: Lightbulb, tone: 'rgb(61 90 254 / 0.3)' },
                { title: ot('welcome.preview.door'), value: ot('welcome.preview.closed'), icon: DoorClosed, tone: 'rgb(45 212 191 / 0.22)' },
                { title: ot('welcome.preview.temperature'), value: '21.5°', icon: CloudSun, tone: 'rgb(251 146 60 / 0.28)' },
                { title: ot('welcome.preview.security'), value: ot('welcome.preview.protected'), icon: ShieldCheck, tone: 'rgb(52 211 153 / 0.22)' },
              ].map(({ title, value, icon: Icon, tone }) => (
                <div key={title} className="onboarding-card min-h-[92px] p-3 sm:min-h-[118px] sm:p-4" style={{ background: `linear-gradient(145deg, ${tone}, var(--ui-surface-glass-soft))` }}>
                  <span className="onboarding-choice-icon !h-8 !w-8 !rounded-full"><Icon size={15} /></span>
                  <div className="mt-3 truncate text-xs font-semibold text-[color:var(--ui-text-primary)] sm:mt-5 sm:text-sm">{title}</div>
                  <div className="mt-0.5 truncate text-[10px] text-[color:var(--ui-text-secondary)] sm:text-xs">{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </SetupBackdrop>
  );
}

function ChoiceStep({ onDemo, onConfigure, onBack }: { onDemo: () => void; onConfigure: () => void; onBack: () => void }) {
  const { locale } = useI18n();
  const ot = (key: OnboardingTranslationKey) => translateOnboarding(locale, key);
  return (
    <SetupBackdrop>
      <section className="onboarding-window w-full max-w-4xl !min-h-0 flex-col p-5 sm:p-8 lg:p-10">
        <div className="flex items-center justify-start">
          <SetupBackButton onClick={onBack} />
        </div>
        <div className="mt-8 max-w-2xl">
          <h1 className="text-[clamp(2rem,6vw,3.15rem)] font-semibold leading-none tracking-[-0.05em] text-[color:var(--ui-text-primary)]">{ot('choice.title')}</h1>
          <p className="mt-3 text-sm leading-6 text-[color:var(--ui-text-secondary)] sm:text-base">{ot('choice.description')}</p>
        </div>
        <div className="mt-7 grid gap-3 md:grid-cols-2">
          <button type="button" onClick={onDemo} className="onboarding-choice-card group">
            <span className="onboarding-choice-icon"><Sparkles size={20} /></span>
            <h2 className="mt-6 text-xl font-semibold tracking-[-0.025em] text-[color:var(--ui-text-primary)]">{ot('choice.demo.title')}</h2>
            <p className="mt-2 text-sm leading-6 text-[color:var(--ui-text-secondary)]">{ot('choice.demo.description')}</p>
            <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-[color:rgb(var(--ui-accent-rgb))]">{ot('choice.demo.action')} <ChevronRight size={15} /></span>
          </button>
          <button type="button" onClick={onConfigure} className="onboarding-choice-card onboarding-choice-card-active group">
            <span className="onboarding-choice-icon"><Network size={20} /></span>
            <h2 className="mt-6 text-xl font-semibold tracking-[-0.025em] text-[color:var(--ui-text-primary)]">{ot('choice.connect.title')}</h2>
            <p className="mt-2 text-sm leading-6 text-[color:var(--ui-text-secondary)]">{ot('choice.connect.description')}</p>
            <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-[color:rgb(var(--ui-accent-rgb))]">{ot('choice.connect.action')} <ChevronRight size={15} /></span>
          </button>
        </div>
      </section>
    </SetupBackdrop>
  );
}

function countRegistryEntries(payload: unknown, key: 'entities' | 'devices') {
  if (Array.isArray(payload)) return payload.length;
  if (!payload || typeof payload !== 'object') return 0;
  const list = (payload as Record<string, unknown>)[key];
  return Array.isArray(list) ? list.length : 0;
}

function hasCategorizedSetupSummary(summary: SetupScanSummary | undefined) {
  if (!summary) return false;
  if (summary.entities === 0) return true;
  const groupCount = Object.values(summary.groups ?? {}).reduce((total, count) => total + count, 0);
  const domainCount = Object.values(summary.domains ?? {}).reduce((total, count) => total + count, 0);
  return groupCount > 0 || domainCount > 0;
}

export function OnboardingExperience({ journey, onJourneyChange, forceConfiguration = false }: Props) {
  const { locale, setHomeAssistantLocale, formatDate } = useI18n();
  const ot = useCallback(
    (key: OnboardingTranslationKey, parameters?: Record<string, string | number>) =>
      translateOnboarding(locale, key, parameters),
    [locale],
  );
  const navigate = useNavigate();
  const isEmbedded = useMemo(() => window.parent !== window, []);
  const navigateInsideApp = useCallback(
    (path: string) => {
      if (!isEmbedded) {
        navigate(path, { replace: true });
      }
    },
    [isEmbedded, navigate],
  );
  const initialConfig = useMemo(loadHaLiveConfig, []);
  const [hassUrl, setHassUrl] = useState(journey.hassUrl || initialConfig.url);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [flowError, setFlowError] = useState<string | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanProgress, setScanProgress] = useState(8);
  const [scanStage, setScanStage] = useState(() => ot('scan.stage.secure'));
  const [scanProbeError, setScanProbeError] = useState<string | null>(null);
  const [scanRetryKey, setScanRetryKey] = useState(0);
  const oauthExchangePromiseRef = useRef<ReturnType<typeof exchangeHaOAuthCode> | null>(null);
  const connection = useHaLiveConnection({ url: hassUrl, token: '' });
  const panelConnection = useHaPanelBridgeConnection();
  useEffect(() => {
    setHomeAssistantLocale(panelConnection.isManagedByParent ? panelConnection.locale : null);
  }, [panelConnection.isManagedByParent, panelConnection.locale, setHomeAssistantLocale]);
  const panelReady =
    panelConnection.isManagedByParent && panelConnection.status === 'connected';
  const panelReadyRef = useRef(panelReady);
  const panelConnectRef = useRef(panelConnection.connect);
  panelReadyRef.current = panelReady;
  panelConnectRef.current = panelConnection.connect;
  const [discoveryMinimumElapsed, setDiscoveryMinimumElapsed] = useState(false);
  const usesPanelConnection = journey.connectionMethod === 'panel';
  const activeConnection = usesPanelConnection ? panelConnection : connection;
  const latestHaStatesRef = useRef(activeConnection.haStates);
  const latestHaAreasRef = useRef(activeConnection.haAreas);
  latestHaStatesRef.current = activeConnection.haStates;
  latestHaAreasRef.current = activeConnection.haAreas;
  const effectivePhase =
    forceConfiguration && journey.phase === 'done'
      ? usesPanelConnection
        ? 'discover'
        : 'server'
      : journey.phase;
  const isDiscoveryPhase = effectivePhase === 'discover' || effectivePhase === 'detected';

  const updateJourney = (patch: Partial<SetupJourney>) => {
    persistJourney(
      {
        ...journey,
        ...patch,
        phase: patch.phase ?? journey.phase,
        mode: patch.mode === undefined ? journey.mode : patch.mode,
      },
      onJourneyChange,
    );
  };

  const returnToConnection = () => {
    activeConnection.disconnect();
    if (usesPanelConnection) {
      setFlowError(null);
      setUrlError(null);
      setScanBusy(false);
      persistJourney(
        {
          phase: 'discover',
          mode: 'real',
          hassUrl: panelConnection.hassUrl,
          connectionMethod: 'panel',
        },
        onJourneyChange,
      );
      navigateInsideApp('/setup?panel=1');
      return;
    }
    clearHassAuthTokensStorage();
    window.sessionStorage.removeItem(HA_OAUTH_SESSION_STATE_KEY);
    oauthExchangePromiseRef.current = null;
    setFlowError(null);
    setUrlError(null);
    setScanBusy(false);
    persistJourney({ phase: 'server', mode: 'real', hassUrl, connectionMethod: 'direct' }, onJourneyChange);
    navigateInsideApp('/setup?reconnect=1');
  };

  useEffect(() => {
    if (!isDiscoveryPhase) {
      setDiscoveryMinimumElapsed(false);
      return;
    }

    setDiscoveryMinimumElapsed(false);
    void panelConnectRef.current();
    const minimumId = window.setTimeout(
      () => setDiscoveryMinimumElapsed(true),
      DISCOVERY_MINIMUM_VISIBLE_MS,
    );
    const fallbackId = window.setTimeout(() => {
      if (panelReadyRef.current) {
        return;
      }
      persistJourney(
        {
          phase: 'server',
          mode: 'real',
          connectionMethod: 'direct',
        },
        onJourneyChange,
      );
      navigateInsideApp('/setup?manual=1');
    }, isEmbedded ? PANEL_DISCOVERY_TIMEOUT_MS : DIRECT_DISCOVERY_TIMEOUT_MS);

    return () => {
      window.clearTimeout(minimumId);
      window.clearTimeout(fallbackId);
    };
  }, [isDiscoveryPhase, isEmbedded, navigateInsideApp, onJourneyChange]);

  useEffect(() => {
    const callbackUrl = new URL(window.location.href);
    if (callbackUrl.searchParams.get(HA_OAUTH_CALLBACK_PARAM) !== '1') return;
    const code = callbackUrl.searchParams.get('code');
    const receivedState = callbackUrl.searchParams.get('state');
    const expectedState = window.sessionStorage.getItem(HA_OAUTH_SESSION_STATE_KEY);
    const validation = validateHaOAuthCallbackState(receivedState, expectedState);
    const cleanup = (path = '/setup') => {
      window.history.replaceState({}, '', isEmbedded ? window.location.pathname : path);
    };

    if (!validation.ok || !code) {
      window.sessionStorage.removeItem(HA_OAUTH_SESSION_STATE_KEY);
      setFlowError(ot('connection.error.oauthState'));
      cleanup();
      return;
    }

    let cancelled = false;
    const exchange = async () => {
      try {
        const promise = oauthExchangePromiseRef.current ?? exchangeHaOAuthCode({
          hassUrl: validation.payload.hassUrl,
          clientId: window.location.origin,
          code,
        });
        oauthExchangePromiseRef.current = promise;
        const tokens = await promise;
        if (cancelled) return;
        persistHaOAuthSession({ hassUrl: validation.payload.hassUrl, clientId: window.location.origin, tokens });
        window.sessionStorage.removeItem(HA_OAUTH_SESSION_STATE_KEY);
        setHassUrl(validation.payload.hassUrl);
        setFlowError(null);
        const returnPath = resolveOAuthReturnPath(validation.payload.returnTo);
        if (returnPath !== '/setup') {
          persistJourney({
            phase: 'done',
            mode: 'real',
            hassUrl: validation.payload.hassUrl,
            connectionMethod: 'direct',
          }, onJourneyChange);
          cleanup(returnPath);
          navigateInsideApp(returnPath);
          return;
        }
        persistJourney({
          phase: 'scan',
          mode: 'real',
          hassUrl: validation.payload.hassUrl,
          connectionMethod: 'direct',
        }, onJourneyChange);
        cleanup();
      } catch (error) {
        if (!cancelled) {
          window.sessionStorage.removeItem(HA_OAUTH_SESSION_STATE_KEY);
          setFlowError(ot('connection.error.oauth'));
          persistJourney({
            phase: 'server',
            mode: 'real',
            hassUrl: validation.payload.hassUrl,
            connectionMethod: 'direct',
          }, onJourneyChange);
          cleanup();
        }
      }
    };
    void exchange();
    return () => { cancelled = true; };
  }, [isEmbedded, navigateInsideApp, onJourneyChange, ot]);

  useEffect(() => {
    if (!scanBusy) return;
    const progressId = window.setInterval(() => {
      setScanProgress((current) => (current < 88 ? Math.min(88, current + 2) : current));
    }, 450);
    return () => window.clearInterval(progressId);
  }, [scanBusy]);

  useEffect(() => {
    if (
      effectivePhase !== 'scan' ||
      hasCategorizedSetupSummary(journey.summary) ||
      activeConnection.status !== 'disconnected'
    ) return;
    const startId = window.setTimeout(() => {
      void activeConnection.connect();
    }, 0);
    return () => {
      window.clearTimeout(startId);
    };
  }, [activeConnection.connect, activeConnection.status, effectivePhase, journey.summary]);

  useEffect(() => {
    if (
      effectivePhase !== 'scan' ||
      hasCategorizedSetupSummary(journey.summary) ||
      activeConnection.status !== 'connected'
    ) return;
    setScanBusy(true);
    setScanProbeError(null);
    setScanProgress(12);
    setScanStage(ot('scan.stage.sharedSearch'));
    let cancelled = false;
    const scan = async () => {
      const sharedConfiguration = await probeSharedHouseConfiguration(activeConnection.callApi);
      if (cancelled) return;
      if (sharedConfiguration.status === 'found') {
        const { document } = sharedConfiguration;
        setScanProgress(100);
        setScanStage(ot('scan.stage.sharedFound'));
        persistJourney({
          phase: 'existing',
          mode: 'real',
          hassUrl: usesPanelConnection ? panelConnection.hassUrl : hassUrl,
          connectionMethod: usesPanelConnection ? 'panel' : 'direct',
          existingConfiguration: {
            revision: document.revision,
            updatedAt: document.updatedAt,
            sections: document.dashboard.sections.length,
            widgets: document.dashboard.widgets.length,
          },
        }, onJourneyChange);
        setScanBusy(false);
        return;
      }
      if (sharedConfiguration.status === 'invalid' || sharedConfiguration.status === 'unavailable') {
        setScanProbeError(
          sharedConfiguration.status === 'invalid'
            ? ot('scan.error.invalidShared')
            : ot('scan.error.sharedUnavailable'),
        );
        setScanBusy(false);
        return;
      }

      setScanProgress((current) => Math.max(current, 18));
      setScanStage(ot('scan.stage.registries'));
      const [currentUserPayload, entityRegistryDisplay, deviceRegistryDisplay, areaRegistry] = await Promise.all([
        settleSetupRequest(activeConnection.callApi<unknown>({ type: 'auth/current_user' }, { reportError: false })),
        settleSetupRequest(activeConnection.callApi<unknown>({ type: 'config/entity_registry/list_for_display' }, { reportError: false })),
        settleSetupRequest(activeConnection.callApi<unknown>({ type: 'config/device_registry/list_for_display' }, { reportError: false })),
        settleSetupRequest(activeConnection.callApi<unknown>({ type: 'config/area_registry/list' }, { reportError: false })),
      ]);
      if (cancelled) return;
      setScanProgress((current) => Math.max(current, 58));
      setScanStage(ot('scan.stage.verification'));
      const [entityRegistry, deviceRegistry] = await Promise.all([
        countRegistryEntries(entityRegistryDisplay, 'entities') > 0
          ? Promise.resolve(entityRegistryDisplay)
          : settleSetupRequest(activeConnection.callApi<unknown>({ type: 'config/entity_registry/list' }, { reportError: false })),
        countRegistryEntries(deviceRegistryDisplay, 'devices') > 0
          ? Promise.resolve(deviceRegistryDisplay)
          : settleSetupRequest(activeConnection.callApi<unknown>({ type: 'config/device_registry/list' }, { reportError: false })),
      ]);
      if (cancelled) return;
      setScanProgress((current) => Math.max(current, 82));
      setScanStage(ot('scan.stage.classification'));
      const currentUser = currentUserPayload && typeof currentUserPayload === 'object'
        ? currentUserPayload as Record<string, unknown>
        : {};
      const entityEntries = Object.entries(latestHaStatesRef.current);
      const domains: Record<string, number> = {};
      entityEntries.forEach(([entityId]) => {
        const domain = entityId.split('.')[0] || 'other';
        domains[domain] = (domains[domain] ?? 0) + 1;
      });
      const areas = Array.isArray(areaRegistry) ? areaRegistry.length : latestHaAreasRef.current.length;
      const registryGroups = buildSetupEntityGroupCountsFromRegistry(entityRegistry);
      const liveGroups = buildSetupEntityGroupCounts(entityEntries);
      const summary: SetupScanSummary = {
        entities: countRegistryEntries(entityRegistry, 'entities') || entityEntries.length,
        devices: countRegistryEntries(deviceRegistry, 'devices'),
        areas,
        unavailable: entityEntries.filter(([, entity]) => entity.state === 'unavailable').length,
        domains,
        groups: Object.keys(registryGroups).length > 0 ? registryGroups : liveGroups,
        userName: typeof currentUser.name === 'string' ? currentUser.name : undefined,
        canManageHa: currentUser.is_owner === true || currentUser.is_admin === true,
      };
      setScanProgress(100);
      setScanStage(ot('scan.stage.complete'));
      persistJourney({
        phase: 'scan',
        mode: 'real',
        hassUrl: usesPanelConnection ? panelConnection.hassUrl : hassUrl,
        connectionMethod: usesPanelConnection ? 'panel' : 'direct',
        summary,
      }, onJourneyChange);
      setScanBusy(false);
    };
    const scanId = window.setTimeout(() => void scan(), 0);
    return () => {
      window.clearTimeout(scanId);
      cancelled = true;
    };
  }, [
    activeConnection.callApi,
    activeConnection.status,
    effectivePhase,
    hassUrl,
    journey.summary,
    onJourneyChange,
    ot,
    panelConnection.hassUrl,
    scanRetryKey,
    usesPanelConnection,
  ]);

  if (effectivePhase === 'welcome') {
    return <WelcomeStep onContinue={() => updateJourney({ phase: 'choice' })} />;
  }

  if (effectivePhase === 'choice') {
    return (
      <ChoiceStep
        onBack={() => updateJourney({ phase: 'welcome' })}
        onDemo={() => {
          persistJourney({ phase: 'done', mode: 'demo' }, onJourneyChange);
          navigateInsideApp('/home');
        }}
        onConfigure={() => {
          persistJourney({
            phase: 'discover',
            mode: 'real',
            connectionMethod: isEmbedded ? 'panel' : 'direct',
          }, onJourneyChange);
          navigateInsideApp('/setup');
        }}
      />
    );
  }

  if (isDiscoveryPhase) {
    const showDetectedHome = panelReady && discoveryMinimumElapsed;
    const detectedEntityCount = Object.keys(panelConnection.haStates).length;
    const detectedAreaCount = panelConnection.haAreas.length;
    const chooseManualConnection = () => {
      panelConnection.disconnect();
      persistJourney(
        {
          phase: 'server',
          mode: 'real',
          connectionMethod: 'direct',
        },
        onJourneyChange,
      );
      navigateInsideApp('/setup?manual=1');
    };
    const confirmDetectedHome = () => {
      const detectedUrl = panelConnection.hassUrl || window.location.origin;
      setHassUrl(detectedUrl);
      persistJourney(
        {
          phase: 'scan',
          mode: 'real',
          hassUrl: detectedUrl,
          connectionMethod: 'panel',
        },
        onJourneyChange,
      );
      navigateInsideApp('/setup');
    };

    return (
      <WizardShell
        stepIndex={0}
        title={showDetectedHome ? ot('discovery.found.title') : ot('discovery.search.title')}
        description={
          showDetectedHome
            ? ot('discovery.found.description')
            : ot('discovery.search.description')
        }
        onBack={() => updateJourney({
          phase: 'choice',
          mode: null,
          connectionMethod: undefined,
        })}
      >
        <div className="onboarding-card p-5 sm:p-6">
          {showDetectedHome ? (
            <>
              <div className="flex items-start gap-4">
                <span className="onboarding-choice-icon !h-12 !w-12 !rounded-full">
                  <Server size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-[color:var(--ui-text-primary)]">
                    {ot('discovery.connected')}
                  </div>
                  <div className="mt-1 truncate text-xs text-[color:var(--ui-text-secondary)]">
                    {panelConnection.hassUrl || window.location.origin}
                  </div>
                </div>
                <span className="onboarding-pill shrink-0 gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-[color:var(--ui-text-primary)]">
                  <Check size={13} />
                  {ot('discovery.verified')}
                </span>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="onboarding-card p-3.5">
                  <div className="text-xl font-semibold text-[color:var(--ui-text-primary)]">{detectedEntityCount}</div>
                  <div className="mt-1 text-[11px] text-[color:var(--ui-text-secondary)]">{ot('discovery.entities')}</div>
                </div>
                <div className="onboarding-card p-3.5">
                  <div className="text-xl font-semibold text-[color:var(--ui-text-primary)]">{detectedAreaCount}</div>
                  <div className="mt-1 text-[11px] text-[color:var(--ui-text-secondary)]">{ot('discovery.rooms')}</div>
                </div>
              </div>
              <div className="mt-4">
                <SetupNotice icon={<ShieldCheck size={16} />} title={ot('discovery.session.title')}>
                  {ot('discovery.session.description')}
                </SetupNotice>
              </div>
            </>
          ) : (
            <div className="flex min-h-56 flex-col items-center justify-center text-center">
              <GlassLoader
                size="md"
                label={ot('discovery.loading.label')}
                description={ot('discovery.loading.description')}
              />
            </div>
          )}
        </div>
        <WizardActions>
          <SetupSecondaryButton onClick={chooseManualConnection}>
            {ot('discovery.manual')}
          </SetupSecondaryButton>
          {showDetectedHome ? (
            <SetupActionButton onClick={confirmDetectedHome}>{ot('discovery.use')}</SetupActionButton>
          ) : null}
        </WizardActions>
      </WizardShell>
    );
  }

  if (effectivePhase === 'server' || effectivePhase === 'authorize') {
    const startOAuth = () => {
      const validation = validateHassUrl(hassUrl);
      if (validation.ok === false) {
        const errorKey = validation.error.includes('obbligatorio')
          ? 'connection.error.required'
          : validation.error.includes('completo')
            ? 'connection.error.complete'
            : validation.error.includes('http o https')
              ? 'connection.error.protocol'
              : validation.error.includes('credenziali')
                ? 'connection.error.credentials'
                : validation.error.includes('query')
                  ? 'connection.error.query'
                  : 'connection.error.https';
        setUrlError(ot(errorKey));
        return;
      }
      const normalizedUrl = validation.url;
      const state: HaOAuthStatePayload = {
        nonce: createOAuthNonce(),
        hassUrl: normalizedUrl,
        returnTo: forceConfiguration ? '/home' : '/setup',
        issuedAt: Date.now(),
      };
      const serializedState = JSON.stringify(state);
      const callbackUrl = new URL(
        isEmbedded ? window.location.pathname : '/setup',
        window.location.origin,
      );
      callbackUrl.searchParams.set(HA_OAUTH_CALLBACK_PARAM, '1');
      saveHaLiveConfig({ url: normalizedUrl, token: '', rememberToken: false });
      persistJourney({
        phase: 'authorize',
        mode: 'real',
        hassUrl: normalizedUrl,
        connectionMethod: 'direct',
      }, onJourneyChange);
      window.sessionStorage.setItem(HA_OAUTH_SESSION_STATE_KEY, serializedState);
      window.location.assign(buildHaOAuthAuthorizeUrl({
        hassUrl: normalizedUrl,
        clientId: window.location.origin,
        redirectUri: callbackUrl.toString(),
        state: serializedState,
      }));
    };
    const handleConnectionBack = () => {
      if (forceConfiguration) {
        navigateInsideApp('/home');
        return;
      }
      updateJourney({ phase: 'choice', mode: null });
    };
    const connectionContent = (
      <>
        <label htmlFor="onboarding-ha-url" className="block text-xs font-semibold text-[color:var(--ui-text-secondary)]">{ot('connection.serverAddress')}</label>
        <div className="onboarding-input-shell mt-2">
          <Server size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[color:var(--ui-text-secondary)]" />
          <input
            id="onboarding-ha-url"
            value={hassUrl}
            onChange={(event) => { setHassUrl(event.target.value); setUrlError(null); setFlowError(null); }}
            className="onboarding-input pl-11 pr-4 text-sm"
            placeholder="http://homeassistant.local:8123"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
        {urlError || flowError ? (
          <div className="mt-3">
            <SetupNotice icon={<LockKeyhole size={15} />} tone="danger">{urlError || flowError}</SetupNotice>
          </div>
        ) : null}
        <div className="mt-4">
          <SetupNotice icon={<ShieldCheck size={16} />} title={ot('connection.secure.title')}>
            {ot('connection.secure.description')}
          </SetupNotice>
        </div>
        <WizardActions>
          <SetupActionButton onClick={startOAuth}>{forceConfiguration ? ot('connection.signInAgain') : ot('connection.continueHa')}</SetupActionButton>
        </WizardActions>
      </>
    );
    if (forceConfiguration) {
      return (
        <ReconnectShell
          title={ot('connection.reconnect.title')}
          description={ot('connection.reconnect.description')}
          onBack={handleConnectionBack}
        >
          {connectionContent}
        </ReconnectShell>
      );
    }
    return (
      <WizardShell
        stepIndex={0}
        title={ot('connection.connect.title')}
        description={ot('connection.connect.description')}
        onBack={handleConnectionBack}
      >
        {connectionContent}
      </WizardShell>
    );
  }

  if (effectivePhase === 'scan') {
    const summary = hasCategorizedSetupSummary(journey.summary) ? journey.summary : undefined;
    const connectionHasFailed =
      activeConnection.status === 'error' ||
      activeConnection.status === 'offline' ||
      activeConnection.status === 'reauth_required' ||
      Boolean(scanProbeError);
    const requiresNewAccess =
      !usesPanelConnection && activeConnection.status === 'reauth_required';
    const entityGroups = summary
      ? listSetupEntityGroups(summary.groups ?? groupLegacySetupDomains(summary.domains))
      : [];
    return (
      <WizardShell stepIndex={1} title={summary ? ot('scan.found', { name: summary.userName ? `, ${summary.userName}` : '' }) : ot('scan.preparing')} description={summary ? ot('scan.summaryDescription') : ot('scan.preparingDescription')}>
        {!summary ? (
          <div className="onboarding-card flex min-h-60 flex-col items-center justify-center p-6 text-center">
            {connectionHasFailed ? (
              <span className="onboarding-choice-icon !h-14 !w-14 !rounded-full"><LockKeyhole size={23} /></span>
            ) : (
              <GlassLoader size="md" ariaLabel={ot('scan.preparation')} />
            )}
            <div className="mt-5 text-sm font-semibold text-[color:var(--ui-text-primary)]">{requiresNewAccess ? ot('scan.expired') : connectionHasFailed ? ot('scan.interrupted') : ot('scan.preparation')}</div>
            <div className="mt-2 max-w-sm text-xs leading-5 text-[color:var(--ui-text-secondary)]">{activeConnection.error || scanProbeError || scanStage}</div>
            {!connectionHasFailed ? (
              <div className="mt-6 w-full max-w-md">
                <div
                  role="progressbar"
                  aria-label={ot('scan.progressAria')}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(scanProgress)}
                  className="h-2 overflow-hidden rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass-soft)] p-px shadow-[inset_0_1px_3px_rgb(0_0_0/0.16)]"
                >
                  <span
                    className="block h-full rounded-full bg-[linear-gradient(90deg,rgb(var(--ui-accent-rgb)),rgb(var(--ui-accent-secondary-rgb)))] shadow-[0_0_16px_rgb(var(--ui-accent-rgb)/0.38)] transition-[width] duration-500 ease-out"
                    style={{ width: `${scanProgress}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ui-text-secondary)]">
                  <span>{ot('scan.inProgress')}</span>
                  <span className="text-[color:var(--ui-text-primary)]">{Math.round(scanProgress)}%</span>
                </div>
              </div>
            ) : null}
            {connectionHasFailed ? (
              <div className="mt-5 flex w-full max-w-sm flex-col gap-2 sm:flex-row sm:justify-center">
                {!requiresNewAccess ? <SetupSecondaryButton onClick={() => {
                  if (scanProbeError && activeConnection.status === 'connected') {
                    setScanProbeError(null);
                    setScanRetryKey((current) => current + 1);
                    return;
                  }
                  void activeConnection.connect();
                }} className="w-full sm:w-auto"><RefreshCw size={14} /> {ot('common.retry')}</SetupSecondaryButton> : null}
                <SetupActionButton onClick={returnToConnection} trailingArrow={false} className="w-full sm:w-auto"><LockKeyhole size={14} /> {ot('scan.backConnection')}</SetupActionButton>
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                [ot('common.entities'), summary.entities],
                [ot('common.devices'), summary.devices],
                [ot('common.rooms'), summary.areas],
                [ot('scan.unavailable'), summary.unavailable],
              ].map(([label, value]) => <div key={label} className="onboarding-card min-w-0 p-3.5 sm:p-4"><div className="truncate text-2xl font-semibold tracking-[-0.035em] text-[color:var(--ui-text-primary)]">{value}</div><div className="mt-1 truncate text-[11px] text-[color:var(--ui-text-secondary)] sm:text-xs">{label}</div></div>)}
            </div>
            {entityGroups.length ? (
              <div className="mt-6">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-[color:var(--ui-text-primary)]">{ot('scan.groups')}</h2>
                  <span className="text-[11px] text-[color:var(--ui-text-secondary)]">{ot('scan.categories', { count: entityGroups.length })}</span>
                </div>
                <div className="onboarding-summary-groups glass-scrollbar grid gap-2 pr-1 sm:grid-cols-2 lg:grid-cols-3">
                  {entityGroups.map((group) => {
                    const GroupIcon = SETUP_GROUP_ICONS[group.id];
                    return (
                      <div key={group.id} className="onboarding-card flex min-w-0 items-center gap-3 px-3.5 py-3">
                        <span className="onboarding-choice-icon !h-8 !w-8 !rounded-[0.7rem]">
                          <GroupIcon size={15} strokeWidth={2} />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-[color:var(--ui-text-primary)]">{ot(`group.${group.id}` as OnboardingTranslationKey)}</span>
                        <span className="onboarding-pill min-w-8 shrink-0 px-2 py-1 text-[11px] font-semibold text-[color:var(--ui-text-primary)]">{group.count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <WizardActions><SetupActionButton onClick={() => updateJourney({ phase: 'compose' })}>{ot('common.continue')}</SetupActionButton></WizardActions>
          </>
        )}
      </WizardShell>
    );
  }

  if (effectivePhase === 'existing' && journey.existingConfiguration) {
    const existing = journey.existingConfiguration;
    const updatedLabel = formatDate(new Date(existing.updatedAt), {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    return (
      <WizardShell
        stepIndex={1}
        title={ot('existing.title')}
        description={ot('existing.description')}
        onBack={returnToConnection}
      >
        <div className="onboarding-card overflow-hidden p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <span className="onboarding-choice-icon !h-12 !w-12 !rounded-full">
              <Layers3 size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-[color:var(--ui-text-primary)]">{ot('existing.found')}</div>
              <div className="mt-1 text-xs leading-5 text-[color:var(--ui-text-secondary)]">
                {ot('existing.version', { revision: existing.revision, date: updatedLabel })}
              </div>
            </div>
            <span className="onboarding-pill shrink-0 gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-[color:var(--ui-text-primary)]">
              <Check size={13} /> {ot('common.ready')}
            </span>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="onboarding-card p-3.5">
              <div className="text-xl font-semibold text-[color:var(--ui-text-primary)]">{existing.sections}</div>
              <div className="mt-1 text-[11px] text-[color:var(--ui-text-secondary)]">{ot('existing.sections')}</div>
            </div>
            <div className="onboarding-card p-3.5">
              <div className="text-xl font-semibold text-[color:var(--ui-text-primary)]">{existing.widgets}</div>
              <div className="mt-1 text-[11px] text-[color:var(--ui-text-secondary)]">Card</div>
            </div>
          </div>

          <div className="mt-4">
            <SetupNotice icon={<ShieldCheck size={16} />} title={ot('existing.sync.title')}>
              {ot('existing.sync.description')}
            </SetupNotice>
          </div>
        </div>
        <WizardActions>
          <SetupActionButton onClick={() => {
            persistJourney({
              ...journey,
              phase: 'done',
              mode: 'real',
            }, onJourneyChange);
            navigateInsideApp('/home');
          }}>
            {ot('existing.use')}
          </SetupActionButton>
        </WizardActions>
      </WizardShell>
    );
  }

  if (effectivePhase === 'compose') {
    return (
      <WizardShell stepIndex={2} title={ot('compose.title')} description={ot('compose.description')} onBack={() => updateJourney({ phase: 'scan' })}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="onboarding-choice-card onboarding-choice-card-active"><span className="onboarding-choice-icon"><Layers3 size={18} /></span><div className="mt-5 font-semibold text-[color:var(--ui-text-primary)]">{ot('compose.initial')}</div><div className="mt-1 text-sm leading-6 text-[color:var(--ui-text-secondary)]">{ot('compose.initialDescription')}</div><div className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-[color:rgb(var(--ui-accent-rgb))]"><Check size={14} /> {ot('compose.selected')}</div></div>
          <div aria-disabled="true" className="onboarding-choice-card opacity-60"><span className="onboarding-step-chip absolute right-4 top-4">{ot('compose.soon')}</span><span className="onboarding-choice-icon"><WandSparkles size={18} /></span><div className="mt-5 font-semibold text-[color:var(--ui-text-primary)]">{ot('compose.auto')}</div><div className="mt-1 text-sm leading-6 text-[color:var(--ui-text-secondary)]">{ot('compose.autoDescription')}</div></div>
        </div>
        <WizardActions><SetupActionButton onClick={() => updateJourney({ phase: journey.summary?.canManageHa ? 'organize' : 'complete' })}>{ot('common.continue')}</SetupActionButton></WizardActions>
      </WizardShell>
    );
  }

  if (effectivePhase === 'organize') {
    return (
      <WizardShell stepIndex={3} title={ot('organize.title')} description={ot('organize.description')} onBack={() => updateJourney({ phase: 'compose' })}>
        <OnboardingOrganizer
          callApi={activeConnection.callApi}
          canManage={journey.summary?.canManageHa === true}
          onBack={() => updateJourney({ phase: 'compose' })}
          onComplete={() => updateJourney({ phase: 'complete' })}
          onReconnect={returnToConnection}
        />
      </WizardShell>
    );
  }

  return (
    <WizardShell stepIndex={4} stepLabel={ot('complete.label')} title={ot('complete.title')} description={ot('complete.description')} compact>
      <div className="onboarding-card flex flex-col items-center px-5 py-8 text-center"><span className="flex h-20 w-20 items-center justify-center rounded-full border border-emerald-200/24 bg-emerald-400/14 text-emerald-100 shadow-[0_20px_70px_rgba(16,185,129,0.18)]"><Check size={34} /></span><div className="mt-6 text-lg font-semibold text-[color:var(--ui-text-primary)]">{ot('complete.connected')}</div><div className="mt-2 max-w-sm text-sm leading-6 text-[color:var(--ui-text-secondary)]">{ot('complete.builder')}</div></div>
      <WizardActions><SetupActionButton onClick={() => { persistJourney({ ...journey, phase: 'done', mode: 'real' }, onJourneyChange); navigateInsideApp('/home'); }}>{ot('complete.open')}</SetupActionButton></WizardActions>
    </WizardShell>
  );
}

export function DemoLockedRoute({ pathname, onConnect }: { pathname: string; onConnect: () => void }) {
  const { locale } = useI18n();
  const ot = (key: OnboardingTranslationKey, parameters?: Record<string, string | number>) =>
    translateOnboarding(locale, key, parameters);
  return (
    <SetupBackdrop>
      <section className="onboarding-window w-full max-w-xl !min-h-0 flex-col items-center p-6 text-center sm:p-10">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-amber-200/22 bg-amber-400/12 text-amber-100"><LockKeyhole size={25} /></span>
        <div className="mt-6 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-100/72">{ot('demoLocked.label')}</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[color:var(--ui-text-primary)]">{ot('demoLocked.title')}</h1>
        <p className="mt-3 text-sm leading-6 text-[color:var(--ui-text-secondary)]">{ot('demoLocked.description', { section: pathname.replace('/', '') || 'Home' })}</p>
        <div className="mt-8 flex w-full flex-col-reverse justify-center gap-2 sm:w-auto sm:flex-row"><SetupSecondaryButton onClick={() => window.location.assign('/home')}>{ot('demoLocked.back')}</SetupSecondaryButton><SetupActionButton onClick={onConnect}>{ot('demoLocked.connect')}</SetupActionButton></div>
      </section>
    </SetupBackdrop>
  );
}
