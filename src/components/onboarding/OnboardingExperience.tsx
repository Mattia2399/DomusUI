import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import clsx from 'clsx';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Globe,
  House,
  Languages,
  LockKeyhole,
  Network,
  Power,
  RefreshCw,
  Server,
  Sparkles,
  UserRound,
  Wifi,
  WifiOff,
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
  isSetupJourneyMidway,
  resetSetupJourney,
  saveSetupJourney,
  type SetupJourney,
} from '../../services/setupJourney';
import {
  isBlockedMixedContent,
  resolveSetupScreen,
  resumeStage,
  setupProgressStep,
  type SetupConnectionIssue,
  type SetupScreen,
} from '../../services/setupWizard';
import { DEFAULT_HOME_ASSISTANT_URL, discoverHomeAssistant, probeHomeAssistant } from '../../services/haReachability';
import { HASS_TOKENS_KEY, hasSavedHaLiveConfig } from '../../services/haLiveConfig';
import { readRecentSetupUrls, rememberSetupUrl } from '../../services/setupAddresses';
import {
  resolveOAuthReturnPath,
  validateHaOAuthCallbackState,
  type HaOAuthStatePayload,
} from '../../security/oauthState';
import { SUPPORTED_LOCALES, useI18n, type AppLocale } from '../../i18n/I18nProvider';
import {
  translateOnboarding,
  useOnboardingTranslations,
  type OnboardingTranslationKey,
} from '../../i18n/onboardingTranslations';
import { SetupActionButton, SetupBackdrop, SetupSecondaryButton } from './OnboardingGlass';
import { useDeviceAppearance } from './deviceAppearance';
import { Actions, Circle, Head, hostOf, Note, rich, Row, type Translate } from './setupWizardParts';
import '../devices/theme/tokens.css';
import './setupWizard.css';

const HA_OAUTH_CALLBACK_PARAM = 'ha_oauth_callback';
const HA_OAUTH_SESSION_STATE_KEY = 'ha.dashboard.oauth.state';

// Each language named in itself, as a language picker shows it.
const LANGUAGE_NAMES: Record<AppLocale, string> = { it: 'Italiano', en: 'English', fr: 'Français' };

const SetupMosaic = lazy(() => import('./SetupMosaic'));
const loadSetupHomeSteps = () => import('./SetupHomeSteps');
const SetupHomeSteps = lazy(() => loadSetupHomeSteps().then((module) => ({ default: module.SetupHomeSteps })));

type Props = {
  journey: SetupJourney;
  onJourneyChange: (journey: SetupJourney) => void;
  forceConfiguration?: boolean;
  /** False when this visit itself led here (the Demo asked to connect): nothing to resume. */
  offerResume?: boolean;
};

type Discovery = 'idle' | 'busy' | 'found' | 'none';

function createOAuthNonce() {
  if (window.crypto?.getRandomValues) {
    const bytes = new Uint8Array(18);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function hasOAuthCallback() {
  return new URL(window.location.href).searchParams.get(HA_OAUTH_CALLBACK_PARAM) === '1';
}

const URL_ERROR_KEYS: Array<[string, OnboardingTranslationKey]> = [
  ['obbligatorio', 'connection.error.required'],
  ['completo', 'connection.error.complete'],
  ['http o https', 'connection.error.protocol'],
  ['credenziali', 'connection.error.credentials'],
  ['query', 'connection.error.query'],
];

function urlErrorKey(error: string): OnboardingTranslationKey {
  return URL_ERROR_KEYS.find(([fragment]) => error.includes(fragment))?.[1] ?? 'connection.error.https';
}

export function OnboardingExperience({ journey, onJourneyChange, forceConfiguration = false, offerResume = true }: Props) {
  // The words of setup arrive with this screen, in the current language only.
  useOnboardingTranslations();
  const { locale, setLocale, setHomeAssistantLocale } = useI18n();
  const ot = useCallback<Translate>(
    (key, parameters) => translateOnboarding(locale, key, parameters),
    [locale],
  );
  const plural = useCallback(
    (base: string, count: number) => ot(`${base}.${count === 1 ? 'one' : 'other'}` as OnboardingTranslationKey, { count }),
    [ot],
  );
  const appearance = useDeviceAppearance();
  const navigate = useNavigate();
  const isEmbedded = useMemo(() => window.parent !== window, []);
  const navigateInsideApp = useCallback(
    (path: string) => {
      if (!isEmbedded) navigate(path, { replace: true });
    },
    [isEmbedded, navigate],
  );
  // An address this browser really used; the default of an empty configuration is searched for instead.
  const savedUrl = useMemo(() => (hasSavedHaLiveConfig() ? loadHaLiveConfig().url : ''), []);
  const [hassUrl, setHassUrl] = useState(journey.hassUrl || savedUrl);
  const [urlTouched, setUrlTouched] = useState(Boolean(journey.hassUrl || savedUrl));
  const [issue, setIssue] = useState<SetupConnectionIssue | null>(null);
  const [changingAddress, setChangingAddress] = useState(false);
  const [showResume, setShowResume] = useState(
    () => offerResume && isSetupJourneyMidway(journey) && !forceConfiguration && !hasOAuthCallback(),
  );
  const [discovery, setDiscovery] = useState<Discovery>('idle');
  const [discoveredUrl, setDiscoveredUrl] = useState('');
  const [checking, setChecking] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const recentUrls = useMemo(() => readRecentSetupUrls(window.localStorage), []);
  const oauthExchangePromiseRef = useRef<ReturnType<typeof exchangeHaOAuthCode> | null>(null);
  const journeyRef = useRef(journey);
  journeyRef.current = journey;
  const connection = useHaLiveConnection({ url: hassUrl, token: '' });
  const panelConnection = useHaPanelBridgeConnection();
  useEffect(() => {
    setHomeAssistantLocale(panelConnection.isManagedByParent ? panelConnection.locale : null);
  }, [panelConnection.isManagedByParent, panelConnection.locale, setHomeAssistantLocale]);
  const panelReady = panelConnection.isManagedByParent && panelConnection.status === 'connected';
  const usesPanelConnection = journey.connectionMethod === 'panel';
  const activeConnection = usesPanelConnection ? panelConnection : connection;

  const screen: SetupScreen = resolveSetupScreen({
    phase: journey.phase,
    issue,
    forceConfiguration,
    changingAddress,
    summary: journey.summary,
    limitedAccepted: journey.limitedAccepted,
    // Without a session the connection would leave for the Home Assistant login unannounced.
    signedOut: !usesPanelConnection && !window.localStorage.getItem(HASS_TOKENS_KEY),
  });
  const shownScreen: SetupScreen = showResume ? 'intro' : screen;

  const persist = useCallback(
    (next: Omit<SetupJourney, 'version' | 'updatedAt'>) => {
      const saved = saveSetupJourney(next, window.localStorage);
      onJourneyChange(saved);
      return saved;
    },
    [onJourneyChange],
  );
  const update = (patch: Partial<SetupJourney>) => persist({ ...journey, ...patch });

  // Screen readers hear the new step: its title takes the focus.
  useEffect(() => {
    document.getElementById('sw-h')?.focus({ preventScroll: true });
  }, [shownScreen]);

  /* ---------- sign-in on Home Assistant ---------- */

  const startOAuth = (address: string) => {
    const validation = validateHassUrl(address);
    if (validation.ok === false) return;
    const normalizedUrl = validation.url;
    const state: HaOAuthStatePayload = {
      nonce: createOAuthNonce(),
      hassUrl: normalizedUrl,
      returnTo: forceConfiguration ? '/home' : '/setup',
      issuedAt: Date.now(),
    };
    const serializedState = JSON.stringify(state);
    const callbackUrl = new URL(isEmbedded ? window.location.pathname : '/setup', window.location.origin);
    callbackUrl.searchParams.set(HA_OAUTH_CALLBACK_PARAM, '1');
    saveHaLiveConfig({ url: normalizedUrl, token: '', rememberToken: false });
    rememberSetupUrl(normalizedUrl, window.localStorage);
    setIssue(null);
    persist({
      ...journey,
      phase: forceConfiguration ? journey.phase : 'redirect',
      mode: 'real',
      hassUrl: normalizedUrl,
      connectionMethod: 'direct',
    });
    window.sessionStorage.setItem(HA_OAUTH_SESSION_STATE_KEY, serializedState);
    window.location.assign(buildHaOAuthAuthorizeUrl({
      hassUrl: normalizedUrl,
      clientId: window.location.origin,
      redirectUri: callbackUrl.toString(),
      state: serializedState,
    }));
  };

  const validation = hassUrl.trim() ? validateHassUrl(hassUrl) : null;
  const urlMessage = !validation
    ? { tone: '', text: ot('connect.hint') }
    : validation.ok === false
      ? { tone: 'is-err', text: ot(urlErrorKey(validation.error)) }
      : { tone: 'is-ok', text: ot('connect.valid') };

  /** The checks before the sign-in: what the browser would block, and whether anything answers. */
  const checkAndSignIn = async (address = hassUrl) => {
    const checked = validateHassUrl(address);
    if (checked.ok === false || checking) return;
    if (isBlockedMixedContent(checked.url, window.location.protocol)) {
      setIssue('mixed');
      return;
    }
    setChecking(true);
    const reachability = await probeHomeAssistant(checked.url);
    setChecking(false);
    if (reachability === 'unreachable') {
      setHassUrl(checked.url);
      setIssue('unreachable');
      return;
    }
    startOAuth(checked.url);
  };

  const returnToConnection = () => {
    activeConnection.disconnect();
    clearHassAuthTokensStorage();
    window.sessionStorage.removeItem(HA_OAUTH_SESSION_STATE_KEY);
    oauthExchangePromiseRef.current = null;
    setIssue(null);
    persist({ phase: 'connect', mode: 'real', hassUrl, connectionMethod: 'direct' });
    navigateInsideApp('/setup');
  };

  useEffect(() => {
    const callbackUrl = new URL(window.location.href);
    if (callbackUrl.searchParams.get(HA_OAUTH_CALLBACK_PARAM) !== '1') return;
    const code = callbackUrl.searchParams.get('code');
    const receivedState = callbackUrl.searchParams.get('state');
    const expectedState = window.sessionStorage.getItem(HA_OAUTH_SESSION_STATE_KEY);
    const checked = validateHaOAuthCallbackState(receivedState, expectedState);
    const cleanup = (path = '/setup') => {
      window.history.replaceState({}, '', isEmbedded ? window.location.pathname : path);
    };
    const deny = (address?: string) => {
      window.sessionStorage.removeItem(HA_OAUTH_SESSION_STATE_KEY);
      setIssue('denied');
      persist({ phase: 'connect', mode: 'real', hassUrl: address ?? journeyRef.current.hassUrl, connectionMethod: 'direct' });
      cleanup();
    };

    if (!checked.ok || !code || callbackUrl.searchParams.has('error')) {
      deny();
      return;
    }

    let cancelled = false;
    const exchange = async () => {
      try {
        const promise = oauthExchangePromiseRef.current ?? exchangeHaOAuthCode({
          hassUrl: checked.payload.hassUrl,
          clientId: window.location.origin,
          code,
        });
        oauthExchangePromiseRef.current = promise;
        const tokens = await promise;
        if (cancelled) return;
        persistHaOAuthSession({ hassUrl: checked.payload.hassUrl, clientId: window.location.origin, tokens });
        window.sessionStorage.removeItem(HA_OAUTH_SESSION_STATE_KEY);
        setHassUrl(checked.payload.hassUrl);
        setIssue(null);
        const returnPath = resolveOAuthReturnPath(checked.payload.returnTo);
        if (returnPath !== '/setup') {
          persist({ ...journeyRef.current, phase: 'done', mode: 'real', hassUrl: checked.payload.hassUrl, connectionMethod: 'direct' });
          cleanup(returnPath);
          navigateInsideApp(returnPath);
          return;
        }
        persist({ phase: 'scan', mode: 'real', hassUrl: checked.payload.hassUrl, connectionMethod: 'direct' });
        cleanup();
      } catch {
        if (!cancelled) deny(checked.payload.hassUrl);
      }
    };
    void exchange();
    return () => {
      cancelled = true;
    };
  }, [isEmbedded, navigateInsideApp, persist]);

  /* ---------- the address: search the home network once ---------- */

  // Not keyed on its own state: setting it to busy must not cancel the search it starts.
  const discoveryStartedRef = useRef(false);
  useEffect(() => {
    if (shownScreen !== 'connect' || urlTouched || discoveryStartedRef.current) return;
    discoveryStartedRef.current = true;
    setDiscovery('busy');
    let cancelled = false;
    void discoverHomeAssistant([DEFAULT_HOME_ASSISTANT_URL, ...recentUrls]).then((found) => {
      if (cancelled) return;
      setDiscovery(found ? 'found' : 'none');
      if (!found) return;
      setDiscoveredUrl(found);
      setHassUrl((current) => (current.trim() ? current : found));
    });
    return () => {
      // Left before the answer: back on this screen, the search starts again.
      cancelled = true;
      discoveryStartedRef.current = false;
      setDiscovery((current) => (current === 'busy' ? 'idle' : current));
    };
  }, [recentUrls, shownScreen, urlTouched]);

  // The steps after the sign-in arrive apart: fetch them while the first steps are on screen.
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((callback: () => void) => window.setTimeout(callback, 800));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const handle = idle(() => void loadSetupHomeSteps().catch(() => undefined));
    return () => cancel(handle);
  }, []);


  /* ---------- moving along ---------- */

  const back: Partial<Record<SetupScreen, () => void>> = {
    choice: () => update({ phase: 'intro' }),
    connect: forceConfiguration || changingAddress
      ? () => setChangingAddress(false)
      : () => update({ phase: 'choice', mode: null, connectionMethod: undefined }),
    redirect: () => update({ phase: 'connect' }),
    unreachable: () => setIssue(null),
    mixed: () => setIssue(null),
    denied: () => setIssue(null),
    existing: () => update({ phase: 'summary' }),
    compose: () => update({ phase: journey.existingConfiguration ? 'existing' : 'summary' }),
  };
  const progress = setupProgressStep(shownScreen);
  const goBack = back[shownScreen];

  const chooseLanguage = () => {
    const index = SUPPORTED_LOCALES.indexOf(locale);
    setLocale(SUPPORTED_LOCALES[(index + 1) % SUPPORTED_LOCALES.length]);
  };

  const summary = journey.summary;
  const host = hostOf(hassUrl || journey.hassUrl);
  const httpsAlternative = recentUrls.find((url) => url.startsWith('https:'));

  let content: ReactNode = null;
  switch (shownScreen) {
    case 'choice':
      content = (
        <>
          <Head title={ot('choice.title')}>{ot('choice.description')}</Head>
          <div className="sw-picks">
            <button
              type="button"
              className="sw-pick is-primary"
              onClick={() => {
                if (isEmbedded) persist({ phase: 'scan', mode: 'real', connectionMethod: 'panel' });
                else persist({ phase: 'connect', mode: 'real', connectionMethod: 'direct' });
              }}
            >
              <Circle icon={Network} tint="blue" />
              <span className="sw-pick-t"><b>{ot('choice.connect.title')}</b><span>{ot('choice.connect.description')}</span></span>
              <span className="sw-chev" aria-hidden="true"><ChevronRight size={20} /></span>
            </button>
            <button
              type="button"
              className="sw-pick"
              onClick={() => {
                // The Demo comes with its Home: nothing left to choose there.
                persist({ phase: 'done', mode: 'demo', start: 'recommended' });
                navigateInsideApp('/home');
              }}
            >
              <Circle icon={Sparkles} tint="amber" />
              <span className="sw-pick-t"><b>{ot('choice.demo.title')}</b><span>{ot('choice.demo.description')}</span></span>
              <span className="sw-chev" aria-hidden="true"><ChevronRight size={20} /></span>
            </button>
          </div>
          <Note icon={LockKeyhole} tint="green" title={ot('choice.note.title')}>
            <span>{ot('choice.note.description')}</span>
          </Note>
        </>
      );
      break;

    case 'connect': {
      const discoveryNote =
        discovery === 'busy'
          ? <span className="sw-status" role="status"><span className="sw-spin" aria-hidden="true" />{ot('connect.searching')}</span>
          : discovery === 'found'
            ? <span className="sw-status is-ok" role="status"><Wifi size={17} aria-hidden="true" />{ot('connect.found', { host: hostOf(discoveredUrl) })}</span>
            : discovery === 'none'
              ? <span className="sw-status" role="status"><WifiOff size={17} aria-hidden="true" />{ot('connect.notFound')}</span>
              : null;
      content = (
        <>
          <Head title={forceConfiguration ? ot('expired.title') : ot('connect.title')}>{ot('connect.description')}</Head>
          {discoveryNote}
          <label className="flex flex-col gap-2" htmlFor="sw-url">
            <span className="sw-label">{ot('connect.label')}</span>
            <span className={clsx('sw-field', validation && (validation.ok ? 'is-ok' : 'is-err'))}>
              <Globe size={19} className="sw-t2" aria-hidden="true" />
              <input
                id="sw-url"
                type="url"
                inputMode="url"
                autoComplete="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={hassUrl}
                placeholder={DEFAULT_HOME_ASSISTANT_URL}
                aria-invalid={validation ? !validation.ok : undefined}
                aria-describedby="sw-url-msg"
                onChange={(event) => {
                  setHassUrl(event.target.value);
                  setUrlTouched(true);
                  // Typing ends a search still running: its answer would no longer be about this field.
                  if (discovery === 'busy') setDiscovery('idle');
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void checkAndSignIn();
                }}
              />
            </span>
          </label>
          <div id="sw-url-msg" className={clsx('sw-msg', urlMessage.tone)} role="status">
            {validation ? (validation.ok ? <Check size={16} aria-hidden="true" /> : <AlertTriangle size={16} aria-hidden="true" />) : null}
            {urlMessage.text}
          </div>
          {recentUrls.length ? (
            <div className="flex flex-col gap-2">
              <span className="sw-label">{ot('connect.recent')}</span>
              <div className="sw-chips">
                {recentUrls.map((url) => (
                  <button
                    key={url}
                    type="button"
                    className={clsx('sw-chip', url === hassUrl && 'is-on')}
                    aria-pressed={url === hassUrl}
                    onClick={() => {
                      setHassUrl(url);
                      setUrlTouched(true);
                    }}
                  >
                    {hostOf(url)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="sw-help">
            <button type="button" className="sw-help-h" aria-expanded={helpOpen} aria-controls="sw-help-b" onClick={() => setHelpOpen((open) => !open)}>
              <span>{ot('connect.help.title')}</span>
              <ChevronDown size={18} aria-hidden="true" />
            </button>
            {helpOpen ? <div id="sw-help-b" className="sw-help-b">{rich(ot('connect.help.body'))}</div> : null}
          </div>
          <Actions>
            <button
              type="button"
              className="sw-btn sw-btn-p"
              aria-disabled={!validation?.ok || checking}
              aria-busy={checking}
              onClick={() => void checkAndSignIn()}
            >
              {checking ? <span className="sw-spin" aria-hidden="true" /> : null}
              {ot('connect.signIn')}
              <ExternalLink size={17} aria-hidden="true" />
            </button>
          </Actions>
        </>
      );
      break;
    }

    case 'redirect':
      content = (
        <div className="sw-mid">
          <span className="sw-big sw-tint-blue" aria-hidden="true"><span className="sw-spin" style={{ width: 34, height: 34, borderWidth: 3 }} /></span>
          <Head title={ot('redirect.title')}>{rich(ot('redirect.description', { host }))}</Head>
          {hasOAuthCallback() ? null : (
            <button type="button" className="sw-btn sw-btn-s" onClick={() => startOAuth(journey.hassUrl || hassUrl)}>
              <ExternalLink size={17} aria-hidden="true" />
              {ot('redirect.open')}
            </button>
          )}
        </div>
      );
      break;

    case 'scan':
    case 'summary':
    case 'limited':
    case 'existing':
    case 'compose':
      content = (
        <Suspense fallback={<div className="sw-mid"><span className="sw-spin" aria-hidden="true" /></div>}>
          <SetupHomeSteps
            screen={shownScreen}
            journey={journey}
            persist={persist}
            ot={ot}
            plural={plural}
            connection={activeConnection}
            usesPanelConnection={usesPanelConnection}
            panelReady={panelReady}
            panelHassUrl={panelConnection.hassUrl}
            hassUrl={hassUrl}
            onReturnToConnection={returnToConnection}
            navigateInsideApp={navigateInsideApp}
          />
        </Suspense>
      );
      break;
    case 'unreachable':
      content = (
        <>
          <Head icon={WifiOff} tint="amber" title={ot('unreachable.title')}>{rich(ot('unreachable.description', { host }))}</Head>
          <div className="sw-rows">
            <Row icon={House} title={ot('unreachable.away.title')}>{ot('unreachable.away.description')}</Row>
            <Row icon={Server} title={ot('unreachable.port.title')}>{rich(ot('unreachable.port.description'))}</Row>
            <Row icon={Power} title={ot('unreachable.power.title')}>{ot('unreachable.power.description')}</Row>
          </div>
          <Actions secondary={<button type="button" className="sw-btn sw-btn-g" onClick={() => setIssue(null)}>{ot('common.changeAddress')}</button>}>
            <button type="button" className="sw-btn sw-btn-p" aria-busy={checking} onClick={() => { setIssue(null); void checkAndSignIn(); }}>
              {checking ? <span className="sw-spin" aria-hidden="true" /> : <RefreshCw size={17} aria-hidden="true" />}
              {ot('common.retry')}
            </button>
          </Actions>
        </>
      );
      break;

    case 'mixed':
      content = (
        <>
          <Head icon={AlertTriangle} tint="amber" title={ot('mixed.title')}>{rich(ot('mixed.description', { host }))}</Head>
          <div className="sw-rows">
            <Row icon={LockKeyhole} tint="green" title={ot('mixed.https.title')}>{ot('mixed.https.description')}</Row>
            <Row icon={House} tint="blue" title={ot('mixed.panel.title')}>{ot('mixed.panel.description')}</Row>
          </div>
          <Actions>
            {httpsAlternative ? (
              <button
                type="button"
                className="sw-btn sw-btn-p"
                onClick={() => {
                  setHassUrl(httpsAlternative);
                  setIssue(null);
                  void checkAndSignIn(httpsAlternative);
                }}
              >
                {ot('mixed.use', { host: hostOf(httpsAlternative) })}
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            ) : null}
            <button type="button" className={clsx('sw-btn', httpsAlternative ? 'sw-btn-s' : 'sw-btn-p')} onClick={() => setIssue(null)}>
              {ot('common.changeAddress')}
            </button>
          </Actions>
        </>
      );
      break;

    case 'denied':
      content = (
        <>
          <Head icon={LockKeyhole} tint="amber" title={ot('denied.title')}>{ot('denied.description')}</Head>
          <Actions secondary={<button type="button" className="sw-btn sw-btn-g" onClick={() => setIssue(null)}>{ot('common.changeAddress')}</button>}>
            <button type="button" className="sw-btn sw-btn-p" onClick={() => void checkAndSignIn(journey.hassUrl || hassUrl)}>
              <RefreshCw size={17} aria-hidden="true" />
              {ot('denied.retry')}
            </button>
          </Actions>
        </>
      );
      break;

    case 'expired':
      content = (
        <>
          <Head icon={UserRound} tint="blue" title={ot('expired.title')}>{ot('expired.description')}</Head>
          <div className="sw-rows">
            <Row
              icon={House}
              tint="blue"
              title={summary?.userName ? ot('expired.home', { name: summary.userName }) : ot('expired.homeNoName')}
              aside={usesPanelConnection ? undefined : (
                <button type="button" className="sw-btn sw-btn-g sw-btn-sm" onClick={() => setChangingAddress(true)}>{ot('expired.change')}</button>
              )}
            >
              {host}
            </Row>
          </div>
          <Actions>
            <button
              type="button"
              className="sw-btn sw-btn-p"
              onClick={() => (usesPanelConnection ? navigateInsideApp('/home') : void checkAndSignIn(journey.hassUrl || hassUrl))}
            >
              {ot('connect.signIn')}
              <ExternalLink size={17} aria-hidden="true" />
            </button>
          </Actions>
        </>
      );
      break;

    default:
      break;
  }

  const themeClass = appearance === 'light' ? 'dashboard-theme-light' : 'dashboard-theme-dark';

  if (shownScreen === 'intro') {
    const stage = resumeStage(journey.phase);
    return (
      <main className={clsx('sw-root', themeClass)} data-appearance-source="device">
        <span className="sw-orb sw-orb-a" aria-hidden="true" />
        <span className="sw-orb sw-orb-b" aria-hidden="true" />
        <div className="sw-intro">
          <Suspense fallback={null}>
            <SetupMosaic ot={ot} />
          </Suspense>
          <span className="sw-veil" aria-hidden="true" />
          <section className="sw-hello sw-glass" aria-labelledby="sw-h">
            <span className="sw-logo" aria-hidden="true"><House size={26} strokeWidth={2.2} /></span>
            <span className="sw-eyebrow">Domus UI</span>
            <h1 id="sw-h" className="sw-hero sw-title" tabIndex={-1}>{ot('intro.title')}</h1>
            <p className="sw-desc">{ot('intro.description')}</p>
            {showResume ? (
              <>
                <span className="sw-status" style={{ alignSelf: 'center' }}>
                  <RefreshCw size={16} aria-hidden="true" />
                  {journey.hassUrl
                    ? `${ot(`intro.where.${stage}` as OnboardingTranslationKey)} · ${hostOf(journey.hassUrl)}`
                    : ot(`intro.where.${stage}` as OnboardingTranslationKey)}
                </span>
                <button type="button" className="sw-btn sw-btn-p sw-btn-xl" onClick={() => setShowResume(false)}>
                  {ot('intro.resume')}
                  <ArrowRight size={19} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="sw-btn sw-btn-g"
                  style={{ height: 40 }}
                  onClick={() => {
                    onJourneyChange(resetSetupJourney(window.localStorage));
                    setShowResume(false);
                  }}
                >
                  {ot('intro.restart')}
                </button>
              </>
            ) : (
              <button type="button" className="sw-btn sw-btn-p sw-btn-xl" onClick={() => update({ phase: 'choice' })}>
                {ot('intro.start')}
                <ArrowRight size={19} aria-hidden="true" />
              </button>
            )}
            <button type="button" className="sw-lang" onClick={chooseLanguage} aria-label={ot('intro.language', { language: LANGUAGE_NAMES[locale] })}>
              <Languages size={16} aria-hidden="true" />
              {LANGUAGE_NAMES[locale]}
            </button>
          </section>
        </div>
      </main>
    );
  }

  const hasTop = progress > 0 || shownScreen === 'choice';
  return (
    <main className={clsx('sw-root', themeClass)} data-appearance-source="device">
      <span className="sw-orb sw-orb-a" aria-hidden="true" />
      <span className="sw-orb sw-orb-b" aria-hidden="true" />
      <div className="sw-shell">
        <section className="sw-card sw-glass" aria-labelledby="sw-h">
          {hasTop ? (
            <div className="sw-top">
              <div className="sw-top-row">
                {goBack ? (
                  <button type="button" className="sw-back" onClick={goBack}>
                    <ArrowLeft size={18} aria-hidden="true" />
                    {ot('common.back')}
                  </button>
                ) : null}
                {progress ? <span className="sw-count">{ot('wizard.counter', { current: progress, total: 3 })}</span> : null}
              </div>
              {progress ? <div className="sw-bar" aria-hidden="true"><i style={{ width: `${Math.round((progress / 3) * 100)}%` }} /></div> : null}
            </div>
          ) : null}
          {content}
        </section>
      </div>
    </main>
  );
}

// The page names the demo lock screen speaks of, as the menu shows them.
const DEMO_LOCKED_SECTION_KEYS = {
  security: 'navigation.security',
  consumi: 'navigation.consumption',
  automations: 'navigation.automations',
  appgallery: 'navigation.appGallery',
  settings: 'navigation.settings',
  profile: 'profile.title',
} as const;

export function DemoLockedRoute({ pathname, onConnect }: { pathname: string; onConnect: () => void }) {
  useOnboardingTranslations();
  const { locale, t } = useI18n();
  const firstSegment = pathname.split('/').filter(Boolean)[0]?.toLowerCase() ?? '';
  const sectionKey = DEMO_LOCKED_SECTION_KEYS[firstSegment as keyof typeof DEMO_LOCKED_SECTION_KEYS];
  const sectionName = sectionKey
    ? t(sectionKey)
    : firstSegment
      ? `${firstSegment.charAt(0).toUpperCase()}${firstSegment.slice(1)}`
      : 'Home';
  const ot = (key: OnboardingTranslationKey, parameters?: Record<string, string | number>) =>
    translateOnboarding(locale, key, parameters);
  return (
    <SetupBackdrop>
      <section className="onboarding-window w-full max-w-xl !min-h-0 flex-col items-center p-6 text-center sm:p-10">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--ui-warning)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--ui-warning)_13%,transparent)] text-[color:var(--ui-warning)]"><LockKeyhole size={25} /></span>
        <div className="mt-6 text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--ui-warning)]">{ot('demoLocked.label')}</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[color:var(--ui-text-primary)]">{ot('demoLocked.title')}</h1>
        <p className="mt-3 text-sm leading-6 text-[color:var(--ui-text-secondary)]">{ot('demoLocked.description', { section: sectionName })}</p>
        <div className="mt-8 flex w-full flex-col-reverse justify-center gap-2 sm:w-auto sm:flex-row"><SetupSecondaryButton onClick={() => window.location.assign('/home')}>{ot('demoLocked.back')}</SetupSecondaryButton><SetupActionButton onClick={onConnect}>{ot('demoLocked.connect')}</SetupActionButton></div>
      </section>
    </SetupBackdrop>
  );
}
