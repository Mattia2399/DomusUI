import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import clsx from 'clsx';
import {
  AlertTriangle,
  ArrowRight,
  Blinds,
  Check,
  House,
  Layers,
  Lightbulb,
  LockKeyhole,
  Plug,
  Plus,
  Power,
  RefreshCw,
  ShieldCheck,
  Thermometer,
  Tv,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import type { MockEntityStateMap } from '../../types/ha';
import type { HaArea } from '../../hooks/useHaLiveConnection';
import type { Widget } from '../../types/dashboardModels';
import type { SetupCategoryId, SetupJourney, SetupReadId, SetupScanSummary, SetupStart } from '../../services/setupJourney';
import {
  buildSetupCategoryCounts,
  countRegistryEntries,
  countUnassignedDevices,
  hasUsableSummary,
  listSetupCategories,
} from '../../services/setupWizard';
import {
  HA_SHARED_HOUSE_CONFIGURATION_KEY,
  parseSharedHouseConfiguration,
  type SharedHouseConfiguration,
} from '../../services/dashboardConfigurationRepository';
import { buildSetupEntityGroupCounts, buildSetupEntityGroupCountsFromRegistry } from '../../services/setupEntityGroups';
import { useI18n } from '../../i18n/I18nProvider';
import type { OnboardingTranslationKey } from '../../i18n/onboardingTranslations';
import { Actions, Circle, Head, Note, rich, Row, type Translate } from './setupWizardParts';

/*
 * The steps of setup after the sign-in: reading the home, its summary, what a
 * non-administrator cannot do, the dashboard the home already has and the
 * Home to start with. Loaded apart from the first steps, and fetched ahead
 * while they are on screen.
 */

const SETUP_REQUEST_TIMEOUT_MS = 6000;
const PANEL_CONNECTION_TIMEOUT_MS = 5000;

const loadStarterDashboardPersistence = () =>
  Promise.all([
    import('../../templates/starterDashboardTemplate'),
    import('../../services/dashboardStorage'),
  ]);

const CATEGORY_LOOK: Record<SetupCategoryId, { icon: LucideIcon; color: string }> = {
  lights: { icon: Lightbulb, color: '#FFD60A' },
  thermostats: { icon: Thermometer, color: '#FF7A1A' },
  covers: { icon: Blinds, color: '#FF9F0A' },
  media: { icon: Tv, color: '#BF5AF2' },
  plugs: { icon: Plug, color: '#30D158' },
  security: { icon: ShieldCheck, color: '#64D2FF' },
};

type ScanFailure = 'interrupted' | 'expired' | 'invalidShared' | 'sharedUnavailable';

/** What these steps need of the Home Assistant connection, direct or through the panel. */
export type SetupHomeConnection = {
  status: string;
  error?: string | null;
  haStates: MockEntityStateMap;
  haAreas: HaArea[];
  connect: () => Promise<unknown> | void;
  callApi: <T = unknown>(
    message: Record<string, unknown>,
    options?: { reportError?: boolean; throwOnError?: boolean },
  ) => Promise<T | null>;
};

export type SetupHomeStep = 'scan' | 'summary' | 'limited' | 'existing' | 'compose';

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

function friendlyName(entityId: string, states: MockEntityStateMap) {
  const name = states[entityId]?.rawAttributes?.friendly_name;
  return typeof name === 'string' && name.trim() ? name.trim() : entityId.split('.')[1]?.replace(/_/g, ' ') ?? entityId;
}

/** A card of the recommended Home, as the preview shows it: its name, its state and its look. */
function previewOf(widget: Widget, states: MockEntityStateMap, ot: Translate) {
  const entity = states[widget.entityId];
  const domain = widget.entityId.split('.')[0];
  const state = `${entity?.state ?? ''}`.toLowerCase();
  const attributes = entity?.rawAttributes ?? {};
  const on = state === 'on';
  let value = on ? ot('preview.on') : ot('preview.off');
  let tone: 'warm' | 'heat' | 'cool' | undefined;
  if (domain === 'light' && on) {
    const brightness = Number(attributes.brightness);
    value = Number.isFinite(brightness) ? `${Math.round((brightness / 255) * 100)}%` : ot('preview.on');
    tone = 'warm';
  } else if (domain === 'climate') {
    const current = Number(attributes.current_temperature);
    value = Number.isFinite(current) ? `${current.toLocaleString()}°` : ot('preview.off');
    tone = state === 'cool' ? 'cool' : state === 'off' ? undefined : 'heat';
  } else if (domain === 'lock') {
    value = state === 'locked' ? ot('preview.locked') : ot('preview.unlocked');
  } else if (domain === 'cover') {
    value = state === 'open' ? ot('preview.open') : ot('preview.closed');
  } else if (domain === 'sensor' && entity) {
    value = `${entity.state}${attributes.unit_of_measurement ? ` ${String(attributes.unit_of_measurement)}` : ''}`;
  }
  return { id: widget.id, name: friendlyName(widget.entityId, states), value, tone };
}

export function SetupHomeSteps({
  screen,
  journey,
  persist,
  ot,
  plural,
  connection: activeConnection,
  usesPanelConnection,
  panelReady,
  panelHassUrl,
  hassUrl,
  onReturnToConnection: returnToConnection,
  navigateInsideApp,
}: {
  screen: SetupHomeStep;
  journey: SetupJourney;
  persist: (next: Omit<SetupJourney, 'version' | 'updatedAt'>) => SetupJourney;
  ot: Translate;
  plural: (base: string, count: number) => string;
  connection: SetupHomeConnection;
  usesPanelConnection: boolean;
  panelReady: boolean;
  panelHassUrl?: string;
  hassUrl: string;
  onReturnToConnection: () => void;
  navigateInsideApp: (path: string) => void;
}) {
  const { formatDate } = useI18n();
  const [scanFailure, setScanFailure] = useState<ScanFailure | null>(null);
  const [scanRetryKey, setScanRetryKey] = useState(0);
  const [start, setStart] = useState<Exclude<SetupStart, 'existing'>>(journey.start === 'empty' ? 'empty' : 'recommended');
  const [preview, setPreview] = useState<Array<{ id: string; name: string; value: string; tone?: string }> | null>(null);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState(false);
  const panelReadyRef = useRef(panelReady);
  panelReadyRef.current = panelReady;
  const latestHaStatesRef = useRef(activeConnection.haStates);
  const latestHaAreasRef = useRef(activeConnection.haAreas);
  latestHaStatesRef.current = activeConnection.haStates;
  latestHaAreasRef.current = activeConnection.haAreas;
  const update = (patch: Partial<SetupJourney>) => persist({ ...journey, ...patch });
  const summary = journey.summary;

  /* ---------- the scan ---------- */

  useEffect(() => {
    if (activeConnection.status !== 'disconnected') return;
    const startId = window.setTimeout(() => void activeConnection.connect(), 0);
    return () => window.clearTimeout(startId);
  }, [activeConnection.connect, activeConnection.status]);

  // Inside the panel the session is Home Assistant's; without the panel bridge, sign in instead.
  useEffect(() => {
    if (screen !== 'scan' || !usesPanelConnection) return;
    const fallbackId = window.setTimeout(() => {
      if (panelReadyRef.current) return;
      persist({ phase: 'connect', mode: 'real', connectionMethod: 'direct' });
    }, PANEL_CONNECTION_TIMEOUT_MS);
    return () => window.clearTimeout(fallbackId);
  }, [persist, screen, usesPanelConnection]);

  useEffect(() => {
    if (
      screen !== 'scan' ||
      hasUsableSummary(journey.summary) ||
      activeConnection.status !== 'connected'
    ) return;
    setScanFailure(null);
    let cancelled = false;
    const scan = async () => {
      const sharedConfiguration = await probeSharedHouseConfiguration(activeConnection.callApi);
      if (cancelled) return;
      if (sharedConfiguration.status === 'invalid' || sharedConfiguration.status === 'unavailable') {
        setScanFailure(sharedConfiguration.status === 'invalid' ? 'invalidShared' : 'sharedUnavailable');
        return;
      }
      const ask = (type: string) => settleSetupRequest(activeConnection.callApi<unknown>({ type }, { reportError: false }));
      const [currentUserPayload, entityDisplay, deviceRegistry, areaRegistry, floorRegistry] = await Promise.all([
        ask('auth/current_user'),
        ask('config/entity_registry/list_for_display'),
        ask('config/device_registry/list'),
        ask('config/area_registry/list'),
        ask('config/floor_registry/list'),
      ]);
      if (cancelled) return;
      const [entityRegistry, devices] = await Promise.all([
        countRegistryEntries(entityDisplay, 'entities') > 0 ? Promise.resolve(entityDisplay) : ask('config/entity_registry/list'),
        deviceRegistry ?? ask('config/device_registry/list_for_display'),
      ]);
      if (cancelled) return;
      const currentUser = currentUserPayload && typeof currentUserPayload === 'object'
        ? currentUserPayload as Record<string, unknown>
        : {};
      const entityEntries = Object.entries(latestHaStatesRef.current);
      const domains: Record<string, number> = {};
      entityEntries.forEach(([entityId]) => {
        const domain = entityId.split('.')[0] || 'other';
        domains[domain] = (domains[domain] ?? 0) + 1;
      });
      const registryGroups = buildSetupEntityGroupCountsFromRegistry(entityRegistry);
      const partial: SetupReadId[] = [
        ...(Array.isArray(areaRegistry) ? [] : ['areas' as const]),
        ...(Array.isArray(floorRegistry) ? [] : ['floors' as const]),
        ...(devices ? [] : ['devices' as const]),
      ];
      const summary: SetupScanSummary = {
        entities: countRegistryEntries(entityRegistry, 'entities') || entityEntries.length,
        devices: countRegistryEntries(devices, 'devices'),
        areas: Array.isArray(areaRegistry) ? areaRegistry.length : latestHaAreasRef.current.length,
        floors: Array.isArray(floorRegistry) ? floorRegistry.length : undefined,
        unavailable: entityEntries.filter(([, entity]) => entity.state === 'unavailable').length,
        unassigned: countUnassignedDevices(devices, entityRegistry),
        domains,
        groups: Object.keys(registryGroups).length > 0 ? registryGroups : buildSetupEntityGroupCounts(entityEntries),
        categories: buildSetupCategoryCounts(entityEntries),
        partial: partial.length ? partial : undefined,
        userName: typeof currentUser.name === 'string' ? currentUser.name : undefined,
        canManageHa: currentUser.is_owner === true || currentUser.is_admin === true,
      };
      const document = sharedConfiguration.status === 'found' ? sharedConfiguration.document : null;
      persist({
        phase: 'summary',
        mode: 'real',
        hassUrl: usesPanelConnection ? panelHassUrl : hassUrl,
        connectionMethod: usesPanelConnection ? 'panel' : 'direct',
        summary,
        existingConfiguration: document
          ? {
              revision: document.revision,
              updatedAt: document.updatedAt,
              sections: document.dashboard.sections.length,
              widgets: document.dashboard.widgets.length,
            }
          : undefined,
      });
    };
    const scanId = window.setTimeout(() => void scan(), 0);
    return () => {
      window.clearTimeout(scanId);
      cancelled = true;
    };
  }, [
    activeConnection.callApi,
    activeConnection.status,
    hassUrl,
    journey.summary,
    panelHassUrl,
    persist,
    scanRetryKey,
    screen,
    usesPanelConnection,
  ]);

  /* ---------- the Home to start with ---------- */

  const statesReady = Object.keys(activeConnection.haStates).length > 0;
  useEffect(() => {
    if (screen !== 'compose' || !statesReady) return;
    let cancelled = false;
    void loadStarterDashboardPersistence().then(([{ createStarterDashboardTemplate }]) => {
      if (cancelled) return;
      const states = latestHaStatesRef.current;
      const widgets = createStarterDashboardTemplate('real', states).widgets.filter((widget) => widget.entityId && states[widget.entityId]);
      setPreview(widgets.slice(0, 6).map((widget) => previewOf(widget, states, ot)));
    }).catch(() => setPreview([]));
    return () => {
      cancelled = true;
    };
  }, [ot, screen, statesReady]);

  const openHome = async () => {
    if (opening) return;
    setOpening(true);
    setOpenError(false);
    try {
      const [{ createStarterDashboardTemplate }, { saveDashboardLayout }] = await loadStarterDashboardPersistence();
      const template = start === 'recommended' ? createStarterDashboardTemplate('real', latestHaStatesRef.current) : null;
      const saved = template
        ? saveDashboardLayout(template.sections, template.widgets, {}, template.responsiveLayouts, {}, 'real')
        : saveDashboardLayout([], [], {}, {}, {}, 'real');
      if (!saved.ok) {
        setOpenError(true);
        return;
      }
      persist({ ...journey, phase: 'done', mode: 'real', start });
      navigateInsideApp('/home');
    } catch {
      setOpenError(true);
    } finally {
      setOpening(false);
    }
  };

  let content: ReactNode = null;
  switch (screen) {
    case 'scan': {
      const failed = scanFailure
        ?? (activeConnection.status === 'reauth_required' && !usesPanelConnection
          ? 'expired'
          : activeConnection.status === 'error' || activeConnection.status === 'offline'
            ? 'interrupted'
            : null);
      content = (
        <div className="sw-mid">
          <span className={clsx('sw-big', failed ? 'sw-tint-amber' : 'sw-tint-green')} aria-hidden="true">
            {failed ? <AlertTriangle size={34} strokeWidth={2} /> : <Check size={36} strokeWidth={2.4} />}
          </span>
          {failed ? (
            <>
              <Head title={failed === 'expired' ? ot('scan.expired') : ot('scan.interrupted')}>
                {failed === 'invalidShared'
                  ? ot('scan.error.invalidShared')
                  : failed === 'sharedUnavailable'
                    ? ot('scan.error.sharedUnavailable')
                    : activeConnection.error ?? ot('scan.error.sharedUnavailable')}
              </Head>
              <div className="flex flex-wrap justify-center gap-2.5">
                {failed !== 'expired' ? (
                  <button
                    type="button"
                    className="sw-btn sw-btn-s"
                    onClick={() => {
                      setScanFailure(null);
                      if (activeConnection.status === 'connected') setScanRetryKey((key) => key + 1);
                      else void activeConnection.connect();
                    }}
                  >
                    <RefreshCw size={16} aria-hidden="true" />
                    {ot('common.retry')}
                  </button>
                ) : null}
                <button type="button" className="sw-btn sw-btn-p" onClick={returnToConnection}>
                  {ot('scan.backConnection')}
                </button>
              </div>
            </>
          ) : (
            <>
              <Head title={usesPanelConnection ? ot('scan.titlePanel') : ot('scan.titleDirect')}>{ot('scan.description')}</Head>
              <span className="sw-status" role="status"><span className="sw-spin" aria-hidden="true" />{ot('scan.wait')}</span>
            </>
          )}
        </div>
      );
      break;
    }

    case 'summary': {
      if (!summary) break;
      const rooms = plural('count.rooms', summary.areas);
      const devices = plural('count.devices', summary.devices);
      const line = summary.floors
        ? ot('summary.line', { rooms, floors: plural('count.floors', summary.floors), devices })
        : ot('summary.lineNoFloors', { rooms, devices });
      const partial = summary.partial ?? [];
      content = (
        <>
          <Head title={summary.userName ? ot('summary.title', { name: summary.userName }) : ot('summary.titleNoName')}>{line}</Head>
          {partial.length ? (
            <Note
              warn
              icon={AlertTriangle}
              tint="amber"
              title={partial.length === 1 ? ot(`summary.partial.${partial[0]}` as OnboardingTranslationKey) : ot('summary.partial.many')}
            >
              <span>{ot('summary.partial.description')}</span>
              <button
                type="button"
                className="sw-btn sw-btn-s sw-btn-sm mt-2"
                onClick={() => update({ phase: 'scan', summary: undefined })}
              >
                <RefreshCw size={15} aria-hidden="true" />
                {ot('common.retry')}
              </button>
            </Note>
          ) : null}
          <div className="sw-cats">
            {listSetupCategories(summary).map(({ id, count }) => {
              const { icon: Icon, color } = CATEGORY_LOOK[id];
              return (
                <div key={id} className="sw-cat" style={{ '--sw-cat': color } as CSSProperties}>
                  <i aria-hidden="true"><Icon size={19} strokeWidth={2.2} /></i>
                  <span>{plural(`category.${id}`, count)}</span>
                </div>
              );
            })}
          </div>
          {summary.unavailable > 0 || (summary.unassigned ?? 0) > 0 ? (
            <div className="sw-rows">
              {summary.unavailable > 0 ? (
                <Row icon={Power} tint="amber" title={plural('summary.unavailable', summary.unavailable)}>
                  {ot('summary.unavailable.description')}
                </Row>
              ) : null}
              {(summary.unassigned ?? 0) > 0 ? (
                <Row
                  icon={House}
                  tint="blue"
                  title={plural('summary.unassigned', summary.unassigned ?? 0)}
                  aside={<span className="sw-badge">{ot('summary.later')}</span>}
                >
                  {ot('summary.unassigned.description')}
                </Row>
              ) : null}
            </div>
          ) : null}
          <Actions>
            <button
              type="button"
              className="sw-btn sw-btn-p"
              onClick={() => update({ phase: journey.existingConfiguration ? 'existing' : 'compose' })}
            >
              {ot('common.continue')}
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          </Actions>
        </>
      );
      break;
    }

    case 'limited':
      content = (
        <>
          <Head icon={UserRound} tint="blue" title={ot('limited.title')}>
            {rich(ot('limited.description', { name: summary?.userName ?? ot('limited.thisAccount') }))}
          </Head>
          <div className="sw-rows">
            <Row icon={Check} tint="green" title={ot('limited.works.title')}>{ot('limited.works.description')}</Row>
            <Row icon={LockKeyhole} title={ot('limited.missing.title')}>{ot('limited.missing.description')}</Row>
          </div>
          <Actions
            secondary={usesPanelConnection ? undefined : (
              <button type="button" className="sw-btn sw-btn-g" onClick={returnToConnection}>{ot('limited.other')}</button>
            )}
          >
            <button type="button" className="sw-btn sw-btn-p" onClick={() => update({ limitedAccepted: true })}>
              {ot('limited.continue')}
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          </Actions>
        </>
      );
      break;

    case 'existing': {
      const existing = journey.existingConfiguration;
      if (!existing) break;
      const updated = formatDate(new Date(existing.updatedAt), { dateStyle: 'medium', timeStyle: 'short' });
      content = (
        <>
          <Head title={ot('existing.title')}>{ot('existing.description')}</Head>
          <div className="sw-rows" style={{ padding: 16 }}>
            <div className="flex items-center gap-3.5">
              <Circle icon={Layers} tint="green" />
              <span className="sw-pick-t">
                <b>{ot('existing.card.title')}</b>
                <span>{ot('existing.card.detail', {
                  sections: plural('count.sections', existing.sections),
                  cards: plural('count.cards', existing.widgets),
                  date: updated,
                })}</span>
              </span>
              <span className="sw-badge is-green">{ot('existing.ready')}</span>
            </div>
            <div className="sw-mini" aria-hidden="true" style={{ marginTop: 14 }}>
              <i className="is-warm" /><i /><i className="is-heat" /><i /><i /><i className="is-warm" />
            </div>
          </div>
          <Note icon={RefreshCw} tint="blue" title={ot('existing.sync.title')}>
            <span>{ot('existing.sync.description')}</span>
          </Note>
          <Actions secondary={<button type="button" className="sw-btn sw-btn-g" onClick={() => update({ phase: 'compose' })}>{ot('existing.fresh')}</button>}>
            <button
              type="button"
              className="sw-btn sw-btn-p"
              onClick={() => {
                persist({ ...journey, phase: 'done', mode: 'real', start: 'existing' });
                navigateInsideApp('/home');
              }}
            >
              {ot('existing.use')}
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          </Actions>
        </>
      );
      break;
    }

    case 'compose':
      content = (
        <>
          <Head title={ot('compose.title')}>{ot('compose.description')}</Head>
          <div className="sw-starts" role="radiogroup" aria-label={ot('compose.aria')}>
            <button type="button" role="radio" aria-checked={start === 'recommended'} className="sw-start" onClick={() => setStart('recommended')}>
              {start === 'recommended' ? <span className="sw-check" aria-hidden="true"><Check size={15} strokeWidth={3} /></span> : null}
              <span className="sw-real" aria-hidden="true">
                {preview === null
                  ? <span className="sw-rt"><em>{ot('compose.preparing')}</em></span>
                  : preview.map((item) => (
                    <span key={item.id} className={clsx('sw-rt', item.tone && `is-${item.tone}`)}>
                      <b>{item.name}</b>
                      <em>{item.value}</em>
                    </span>
                  ))}
              </span>
              <span className="sw-start-name">{ot('compose.recommended.title')}<span className="sw-tag">{ot('compose.recommended.tag')}</span></span>
              <span className="sw-start-desc">{ot('compose.recommended.description')}</span>
            </button>
            <button type="button" role="radio" aria-checked={start === 'empty'} className="sw-start" onClick={() => setStart('empty')}>
              {start === 'empty' ? <span className="sw-check" aria-hidden="true"><Check size={15} strokeWidth={3} /></span> : null}
              <span className="sw-blank" aria-hidden="true"><Plus size={28} /></span>
              <span className="sw-start-name">{ot('compose.empty.title')}</span>
              <span className="sw-start-desc">{ot('compose.empty.description')}</span>
            </button>
          </div>
          {openError ? (
            <Note warn icon={AlertTriangle} tint="amber" title={ot('compose.error')}><span>{ot('compose.errorDescription')}</span></Note>
          ) : null}
          <Actions>
            <button
              type="button"
              className="sw-btn sw-btn-p"
              aria-disabled={opening || (start === 'recommended' && !statesReady)}
              aria-busy={opening}
              onClick={() => {
                if (start === 'recommended' && !statesReady) return;
                void openHome();
              }}
            >
              {opening ? <span className="sw-spin" aria-hidden="true" /> : null}
              {ot('compose.open')}
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          </Actions>
        </>
      );
      break;
    default:
      break;
  }
  return <>{content}</>;
}

export default SetupHomeSteps;
