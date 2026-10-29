import React from 'react';
import { useAccessControl } from '../../security/AccessControlProvider';
import {
  ChevronRight,
  ExternalLink,
  LogOut,
  PencilLine,
  Plus,
  Settings,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { SidebarQuickPath } from '../../hooks/useProfileSettings';
import type { HaArea, HaConnectionStatus } from '../../hooks/useHaLiveConnection';
import { fallbackStateWord } from '../../i18n/entityStateFallback';
import { useI18n } from '../../i18n/I18nProvider';
import type { EnergyCallApi } from '../../services/energyCoreClient';
import type { HaDeviceRegistryEntry, HaEntityRegistryEntry } from '../../services/haRegistryPresentation';
import { readSecurityCenterAlarm, securityAlarmCandidates } from '../../services/securityCenterSelection';
import type { Widget } from '../../types/dashboardModels';
import type { MockEntityStateMap } from '../../types/ha';
import { useHomeAttentionItems } from '../homeAttention/useHomeAttentionItems';
import { haStatusLabel } from '../settings/haStatusLabel';
import GlassModal from '../ui/GlassModal';
import {
  getDashboardNavigationIcon,
  isDashboardNavigationEntryActive,
  PRIMARY_DASHBOARD_ROUTE_IDS,
  resolveDashboardNavigationEntries,
  TOOL_DASHBOARD_ROUTE_IDS,
} from './dashboardNavigation';
import { DashboardProfileAvatar } from './DashboardProfileAvatar';
import {
  QUICK_GROUP_SURFACE,
  SidebarQuickCard,
  SidebarQuickCardGallery,
  type SidebarQuickCardData,
  type SidebarQuickTone,
  type SidebarScene,
} from './SidebarQuickCardView';
import {
  availableUpdateCount,
  lightsOn,
  nextWasteCollection,
  readEnergyNow,
  readSidebarQuickCard,
  roomsOfLights,
  securityAttentionCount,
  writeSidebarQuickCard,
  type SidebarQuickCardKind,
} from './sidebarQuickCard';

export type MobileSidebarUserRole = 'creator' | 'admin' | 'member';

const ROLE_LABEL_KEYS = {
  creator: 'settings.access.role.creator',
  admin: 'settings.access.role.admin',
  member: 'settings.access.role.member',
} as const;

const GROUP_SURFACE = QUICK_GROUP_SURFACE;

/** How often the energy card reads the energy core again while the menu is open. */
const ENERGY_REFRESH_MS = 15_000;

type MobileSidebarDrawerProps = {
  isOpen: boolean;
  isEditMode: boolean;
  canToggleEditMode: boolean;
  quickPaths: SidebarQuickPath[];
  selectedPathId?: string | null;
  activeRoute?: string;
  isSettingsActive?: boolean;
  userAvatarUrl?: string;
  userAvatarAlt?: string;
  userEmail?: string;
  userRole?: MobileSidebarUserRole;
  haStatus: HaConnectionStatus;
  runtimeMode?: 'real' | 'demo';
  states?: MockEntityStateMap;
  entityRegistry?: HaEntityRegistryEntry[];
  deviceRegistry?: HaDeviceRegistryEntry[];
  areas?: HaArea[];
  widgets?: Widget[];
  onCallService?: (domain: string, service: string, serviceData: Record<string, unknown>) => Promise<boolean>;
  /** Reads the energy core for the "Energy now" card. */
  energyCallApi?: EnergyCallApi;
  /** The scenes of the Home scenes card, for the "Scenes" card. */
  scenes?: SidebarScene[];
  runningSceneId?: string | null;
  onRunScene?: (sceneId: string) => void;
  onNavigate?: (path: string) => void;
  onPathClick: (entry: SidebarQuickPath) => void;
  onToggleEditMode: () => void;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
  showHomeAssistantReturn?: boolean;
  canReturnToHomeAssistant?: boolean;
  onReturnToHomeAssistant?: () => void;
  onDisconnectHomeAssistant: () => void | Promise<void>;
  onClose: () => void;
  onPrefetchRoute?: (path: string) => void;
  onPrefetchEditMode?: () => void;
};

function useEnergyNow(callApi: EnergyCallApi | undefined, enabled: boolean): SidebarQuickCardData['energy'] {
  const [energy, setEnergy] = React.useState<SidebarQuickCardData['energy']>({ status: 'loading' });
  React.useEffect(() => {
    if (!enabled || !callApi) return undefined;
    let cancelled = false;
    const load = () => {
      readEnergyNow(callApi).then(
        (now) => {
          if (!cancelled) setEnergy(now ? { status: 'ok', now } : { status: 'unavailable' });
        },
        () => {
          // A failed refresh keeps the last value.
          if (!cancelled) setEnergy((current) => (current.status === 'ok' ? current : { status: 'unavailable' }));
        },
      );
    };
    load();
    const timer = window.setInterval(load, ENERGY_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [callApi, enabled]);
  return callApi ? energy : { status: 'unavailable' };
}

/** A section of the menu: a small title over its content. */
function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  const titleId = React.useId();
  return (
    <section aria-labelledby={titleId}>
      <h2 id={titleId} className="mb-2 px-1.5 text-[13px] font-semibold text-[color:var(--ui-text-secondary)]">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** A home section as a glass tile, as in Control Center; the current page is tinted, not filled. */
function DrawerTile({
  icon: Icon,
  label,
  detail,
  detailTone = 'neutral',
  badgeCount = 0,
  active = false,
  onClick,
  onPrefetch,
}: {
  icon: LucideIcon;
  label: string;
  detail?: string;
  detailTone?: 'neutral' | 'danger';
  badgeCount?: number;
  active?: boolean;
  onClick: () => void;
  onPrefetch?: () => void;
}) {
  return (
    <button
      type="button"
      onPointerEnter={onPrefetch}
      onPointerDown={onPrefetch}
      onFocus={onPrefetch}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`relative flex h-[6.5rem] min-w-0 flex-col items-start justify-between rounded-[1.5rem] px-3.5 pb-3 pt-3 text-left transition-[background-color,border-color,box-shadow,transform] duration-200 active:scale-[0.97] motion-reduce:transition-none ${
        active
          ? 'border border-[color:rgb(var(--ui-accent-rgb)/0.34)] bg-[color:rgb(var(--ui-accent-rgb)/0.14)] shadow-[0_10px_28px_-12px_rgb(var(--ui-accent-rgb)/0.6)]'
          : `${GROUP_SURFACE} hover:bg-[color:var(--ui-fill-tertiary)]`
      }`}
    >
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
          active
            ? 'bg-[color:var(--ui-accent)] text-[color:var(--ui-accent-contrast)]'
            : 'bg-[color:var(--ui-fill-secondary)] text-[color:var(--ui-text-primary)]'
        }`}
      >
        <Icon size={19} strokeWidth={1.9} aria-hidden="true" />
      </span>
      {badgeCount > 0 ? (
        <span
          aria-hidden="true"
          className="absolute right-3 top-3 inline-flex h-[1.375rem] min-w-[1.375rem] items-center justify-center rounded-full bg-[color:var(--ui-danger)] px-1.5 text-xs font-bold tabular-nums text-[color:var(--ui-danger-contrast)] shadow-[0_2px_8px_color-mix(in_srgb,var(--ui-danger)_40%,transparent)]"
        >
          {badgeCount}
        </span>
      ) : null}
      <span className="flex min-w-0 max-w-full flex-col">
        <span
          className={`truncate text-[0.95rem] font-semibold tracking-[-0.01em] ${
            active ? 'text-[color:var(--ui-accent)]' : 'text-[color:var(--ui-text-primary)]'
          }`}
        >
          {label}
        </span>
        {detail ? (
          <span
            className={`truncate text-xs ${
              detailTone === 'danger' ? 'font-medium text-[color:var(--ui-danger)]' : 'text-[color:var(--ui-text-secondary)]'
            }`}
          >
            {detail}
          </span>
        ) : null}
      </span>
    </button>
  );
}

/** A row of the tools group, as in Settings: a small icon, the name and a chevron. */
function DrawerToolRow({
  icon: Icon,
  label,
  active = false,
  onClick,
  onPrefetch,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  onClick: () => void;
  onPrefetch?: () => void;
}) {
  return (
    <button
      type="button"
      onPointerEnter={onPrefetch}
      onPointerDown={onPrefetch}
      onFocus={onPrefetch}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex min-h-[3.25rem] w-full min-w-0 items-center gap-3 pl-2.5 pr-3 text-left transition-colors ${
        active
          ? 'bg-[color:rgb(var(--ui-accent-rgb)/0.12)]'
          : 'hover:bg-[color:var(--ui-fill-tertiary)] active:bg-[color:var(--ui-fill-secondary)]'
      }`}
    >
      <span
        className={`flex h-[1.875rem] w-[1.875rem] shrink-0 items-center justify-center rounded-[0.6rem] ${
          active
            ? 'bg-[color:var(--ui-accent)] text-[color:var(--ui-accent-contrast)]'
            : 'bg-[color:var(--ui-fill-secondary)] text-[color:var(--ui-text-primary)]'
        }`}
      >
        <Icon size={17} strokeWidth={1.9} aria-hidden="true" />
      </span>
      <span
        className={`min-w-0 flex-1 truncate text-[0.95rem] font-medium ${
          active ? 'text-[color:var(--ui-accent)]' : 'text-[color:var(--ui-text-primary)]'
        }`}
      >
        {label}
      </span>
      <ChevronRight size={16} strokeWidth={2.2} className="shrink-0 text-[color:var(--ui-text-tertiary)]" aria-hidden="true" />
    </button>
  );
}

/** A round action of the bottom capsule; its name is read, not shown. */
const DrawerAction = React.forwardRef<
  HTMLButtonElement,
  {
    icon: LucideIcon;
    label: string;
    active?: boolean;
    /** A toggle (edit mode) reads as pressed; a page reads as current. */
    toggle?: boolean;
    disabled?: boolean;
    title?: string;
    badge?: { count: number; label: string };
    onClick: () => void;
    onPrefetch?: () => void;
  }
>(function DrawerAction({ icon: Icon, label, active = false, toggle = false, disabled = false, title, badge, onClick, onPrefetch }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      onPointerEnter={onPrefetch}
      onPointerDown={onPrefetch}
      onFocus={onPrefetch}
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      aria-pressed={toggle ? active : undefined}
      aria-current={!toggle && active ? 'page' : undefined}
      className={`relative inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? 'bg-[color:var(--ui-accent)] text-[color:var(--ui-accent-contrast)]'
          : 'text-[color:var(--ui-text-primary)] hover:bg-[color:var(--ui-fill-tertiary)] active:bg-[color:var(--ui-fill-secondary)]'
      }`}
    >
      <Icon size={21} strokeWidth={1.8} aria-hidden="true" />
      <span className="sr-only">{label}</span>
      {badge && badge.count > 0 ? (
        <span className="absolute right-0.5 top-1 inline-flex h-[1.15rem] min-w-[1.15rem] items-center justify-center rounded-full bg-[color:var(--ui-danger)] px-1 text-[10px] font-bold tabular-nums text-[color:var(--ui-danger-contrast)] ring-2 ring-[color:var(--ui-bg-elevated)]">
          <span aria-hidden="true">{badge.count}</span>
          <span className="sr-only">{badge.label}</span>
        </span>
      ) : null}
    </button>
  );
});

export function MobileSidebarDrawer({
  isOpen,
  isEditMode,
  canToggleEditMode,
  quickPaths,
  selectedPathId = null,
  activeRoute,
  isSettingsActive = false,
  userAvatarUrl,
  userAvatarAlt,
  userEmail,
  userRole,
  haStatus,
  runtimeMode = 'real',
  states = {},
  entityRegistry = [],
  deviceRegistry = [],
  areas = [],
  widgets = [],
  onCallService,
  energyCallApi,
  scenes = [],
  runningSceneId = null,
  onRunScene,
  onNavigate,
  onPathClick,
  onToggleEditMode,
  onOpenProfile,
  onOpenSettings,
  showHomeAssistantReturn = false,
  canReturnToHomeAssistant = true,
  onReturnToHomeAssistant,
  onDisconnectHomeAssistant,
  onClose,
  onPrefetchRoute,
  onPrefetchEditMode,
}: MobileSidebarDrawerProps) {
  const { locale, t } = useI18n();
  const drawerRef = React.useRef<HTMLElement | null>(null);
  const previousFocusRef = React.useRef<HTMLElement | null>(null);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = React.useState(false);
  const [isQuickChooserOpen, setIsQuickChooserOpen] = React.useState(false);
  const [quickKind, setQuickKind] = React.useState<SidebarQuickCardKind>(() => readSidebarQuickCard());
  const connected = haStatus === 'connected';
  const { items: attentionItems } = useHomeAttentionItems({
    runtimeMode,
    connected,
    states,
    entityRegistry,
    deviceRegistry,
    areas,
    widgets,
    enabled: isOpen,
  });
  const { can } = useAccessControl();
  const homeEntries = resolveDashboardNavigationEntries(quickPaths, PRIMARY_DASHBOARD_ROUTE_IDS, t, can);
  const toolEntries = resolveDashboardNavigationEntries(quickPaths, TOOL_DASHBOARD_ROUTE_IDS, t, can);
  const displayUserName = userAvatarAlt?.trim() || t('profile.fallback.name');
  const accountLine = [
    userRole ? t(ROLE_LABEL_KEYS[userRole]) : userEmail?.trim(),
    `HA ${haStatusLabel(haStatus, t).toLocaleLowerCase()}`,
  ]
    .filter(Boolean)
    .join(' · ');
  // Edit mode only where a page can be edited (or while it is on).
  const showEditMode = canToggleEditMode || isEditMode;
  const updateCount = isOpen ? availableUpdateCount(states) : 0;
  const securityCount = securityAttentionCount(attentionItems);
  const litLights = isOpen ? lightsOn(states) : [];

  const tileDetails: Record<(typeof PRIMARY_DASHBOARD_ROUTE_IDS)[number], { detail: string; tone?: 'danger'; badge?: number }> = {
    home: { detail: t('navigation.tile.dashboard') },
    rooms: {
      detail: areas.length === 0
        ? t('navigation.tile.roomsNone')
        : areas.length === 1
          ? t('navigation.tile.roomsOne')
          : t('navigation.tile.roomsMany', { count: areas.length }),
    },
    security: securityCount === 0
      ? { detail: t('navigation.tile.securityClear') }
      : {
          detail: securityCount === 1 ? t('navigation.tile.securityOne') : t('navigation.tile.securityMany', { count: securityCount }),
          tone: 'danger',
          badge: securityCount,
        },
    consumi: { detail: t('navigation.tile.consumption') },
  };

  const navigate = (path: string) => {
    onNavigate?.(path);
    onClose();
  };
  const handlePathClick = (entry: SidebarQuickPath) => {
    onPathClick(entry);
    onClose();
  };
  const handleLogoutConfirm = () => {
    void onDisconnectHomeAssistant();
    setIsLogoutConfirmOpen(false);
    onClose();
  };
  const handleOpenSettings = () => {
    onOpenSettings();
    onClose();
  };
  const handleOpenProfile = () => {
    onOpenProfile();
    onClose();
  };
  const handleReturnToHomeAssistant = () => {
    if (!canReturnToHomeAssistant) return;
    onReturnToHomeAssistant?.();
    onClose();
  };
  const handleToggleEditMode = () => {
    if (!canToggleEditMode) {
      return;
    }
    onToggleEditMode();
    onClose();
  };
  const chooseQuickKind = (kind: SidebarQuickCardKind) => {
    setQuickKind(kind);
    writeSidebarQuickCard(kind);
    setIsQuickChooserOpen(false);
  };
  const turnOffLights = () => {
    if (litLights.length > 0) void onCallService?.('light', 'turn_off', { entity_id: litLights });
  };

  React.useEffect(() => {
    if (!isOpen) {
      setIsLogoutConfirmOpen(false);
      setIsQuickChooserOpen(false);
    }
  }, [isOpen]);

  const overlayOpen = isLogoutConfirmOpen || isQuickChooserOpen;
  React.useEffect(() => {
    if (!isOpen) {
      return;
    }
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // The current page takes the focus, else the first control.
    const focusTimer = window.setTimeout(() => {
      const drawer = drawerRef.current;
      (
        drawer?.querySelector<HTMLElement>('nav [aria-current="page"]') ??
        drawer?.querySelector<HTMLElement>('button:not([disabled]), a[href]')
      )?.focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      // Dialogs and sheets on top handle their own keys.
      if (overlayOpen) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') {
        return;
      }
      const drawer = drawerRef.current;
      if (!drawer) {
        return;
      }
      const focusable = Array.from(
        drawer.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        drawer.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [isOpen, onClose, overlayOpen]);

  const energy = useEnergyNow(
    runtimeMode === 'real' && connected ? energyCallApi : undefined,
    isOpen && (quickKind === 'energy' || isQuickChooserOpen),
  );
  const alarm = (() => {
    const alarms = securityAlarmCandidates(states, locale);
    const stored = readSecurityCenterAlarm();
    const alarmId = stored && alarms.includes(stored) ? stored : alarms[0];
    const entity = alarmId ? states[alarmId] : undefined;
    if (!alarmId || !entity) return null;
    const state = `${entity.state ?? ''}`;
    const name = entity.rawAttributes?.friendly_name;
    const tone: SidebarQuickTone = state === 'triggered'
      ? 'danger'
      : state === 'pending' || state === 'arming'
        ? 'warning'
        : state.startsWith('armed')
          ? 'accent'
          : state === 'disarmed'
            ? 'success'
            : 'neutral';
    return {
      word: fallbackStateWord(locale, 'alarm_control_panel', state) ?? state.replace(/_/g, ' '),
      name: typeof name === 'string' && name.trim() ? name.trim() : alarmId,
      tone,
    };
  })();
  const quickCardData: SidebarQuickCardData = {
    attentionItems,
    alarm,
    lights: {
      ids: litLights,
      names: litLights.map((id) => {
        const name = states[id]?.rawAttributes?.friendly_name;
        return typeof name === 'string' && name.trim() ? name.trim() : id;
      }),
      rooms: roomsOfLights(litLights, entityRegistry, deviceRegistry, areas),
    },
    canTurnOffLights: Boolean(onCallService),
    waste: isOpen ? nextWasteCollection(states) : undefined,
    energy,
    scenes,
    runningSceneId,
  };

  return (
    <>
      <button
        type="button"
        onClick={onClose}
        tabIndex={isOpen ? 0 : -1}
        aria-hidden={!isOpen}
        aria-label={t('navigation.menu.close')}
        className={`fixed inset-0 z-[176] bg-[rgb(8_10_16/0.3)] transition-[opacity,backdrop-filter] duration-[420ms] ease-out motion-reduce:transition-none md:hidden ${
          isOpen ? 'opacity-100 backdrop-blur-[6px]' : 'pointer-events-none opacity-0 backdrop-blur-0'
        }`}
      />

      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('navigation.menu.main')}
        tabIndex={-1}
        inert={!isOpen}
        className={`liquid-glass-panel fixed bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] left-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[181] flex w-[min(calc(100vw-4.5rem),20rem)] flex-col overflow-hidden text-[color:var(--ui-text-primary)] transition-transform duration-[560ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none md:hidden ${
          isOpen ? 'translate-x-0' : 'translate-x-[calc(-100%-1.5rem)]'
        }`}
        aria-hidden={!isOpen}
      >
        <div className="flex items-center gap-2 px-4 pb-1 pt-4">
          <button
            type="button"
            onPointerEnter={() => onPrefetchRoute?.('/profile')}
            onPointerDown={() => onPrefetchRoute?.('/profile')}
            onFocus={() => onPrefetchRoute?.('/profile')}
            onClick={handleOpenProfile}
            aria-label={t('navigation.profile.open')}
            className="-m-1.5 flex min-w-0 flex-1 items-center gap-3 rounded-[1.4rem] p-1.5 text-left transition-colors hover:bg-[color:var(--ui-fill-tertiary)]"
          >
            <span className="relative flex h-11 w-11 shrink-0">
              <DashboardProfileAvatar userAvatarUrl={userAvatarUrl} userName={displayUserName} haStatus={haStatus} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[1.0625rem] font-semibold tracking-[-0.015em] text-[color:var(--ui-text-primary)]">{displayUserName}</span>
              <span className="block truncate text-[13px] text-[color:var(--ui-text-secondary)]">{accountLine}</span>
            </span>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('navigation.menu.close')}
            className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[color:var(--ui-text-secondary)] transition-colors hover:text-[color:var(--ui-text-primary)] ${GROUP_SURFACE}`}
          >
            <X size={17} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>

        <nav
          aria-label={t('navigation.menu.main')}
          className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 pb-4 pt-4 glass-scrollbar"
        >
          <DrawerSection title={t('navigation.section.home')}>
            <div className="grid grid-cols-2 gap-2.5">
              {homeEntries.map((entry, index) => {
                const routeDetail = tileDetails[PRIMARY_DASHBOARD_ROUTE_IDS[index]];
                return (
                  <DrawerTile
                    key={entry.id}
                    icon={getDashboardNavigationIcon(entry.icon)}
                    label={entry.label}
                    detail={routeDetail?.detail}
                    detailTone={routeDetail?.tone}
                    badgeCount={routeDetail?.badge}
                    active={isDashboardNavigationEntryActive({ entry, isEditMode, selectedPathId, activeRoute })}
                    onPrefetch={() => onPrefetchRoute?.(entry.path)}
                    onClick={() => handlePathClick(entry)}
                  />
                );
              })}
            </div>
          </DrawerSection>

          <DrawerSection title={t('navigation.section.tools')}>
            <div className={`divide-y divide-[color:var(--ui-separator)] overflow-hidden rounded-[1.25rem] ${GROUP_SURFACE}`}>
              {toolEntries.map((entry) => (
                <DrawerToolRow
                  key={entry.id}
                  icon={getDashboardNavigationIcon(entry.icon)}
                  label={entry.label}
                  active={isDashboardNavigationEntryActive({ entry, isEditMode, selectedPathId, activeRoute })}
                  onPrefetch={() => onPrefetchRoute?.(entry.path)}
                  onClick={() => handlePathClick(entry)}
                />
              ))}
            </div>
          </DrawerSection>
        </nav>

        <div className="space-y-2.5 border-t border-[color:var(--ui-separator)] px-4 pb-4 pt-3">
          {quickKind === 'none' ? (
            <button
              type="button"
              onClick={() => setIsQuickChooserOpen(true)}
              className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-[1.4rem] border-[1.5px] border-dashed border-[color:var(--ui-border-strong)] text-[0.95rem] font-semibold text-[color:var(--ui-accent)] transition-colors hover:bg-[color:var(--ui-fill-tertiary)]"
            >
              <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
              {t('navigation.quick.add')}
            </button>
          ) : (
            <SidebarQuickCard
              kind={quickKind}
              data={quickCardData}
              onChange={() => setIsQuickChooserOpen(true)}
              onOpen={navigate}
              onTurnOffLights={turnOffLights}
              onRunScene={onRunScene}
            />
          )}

        <div className="flex items-center gap-2.5">
          <div className={`flex h-[3.75rem] min-w-0 flex-1 items-center justify-around rounded-full px-1.5 ${GROUP_SURFACE}`}>
            <DrawerAction
              icon={Settings}
              label={t('navigation.settings')}
              active={isSettingsActive}
              badge={{ count: updateCount, label: t('navigation.badge.updates', { count: updateCount }) }}
              onPrefetch={() => onPrefetchRoute?.('/settings')}
              onClick={handleOpenSettings}
            />
            {showEditMode ? (
              <DrawerAction
                icon={PencilLine}
                label={isEditMode ? t('navigation.edit.exit') : t('navigation.edit.enter')}
                active={isEditMode}
                toggle
                disabled={!canToggleEditMode}
                onPrefetch={onPrefetchEditMode}
                onClick={handleToggleEditMode}
              />
            ) : null}
            {showHomeAssistantReturn ? (
              <DrawerAction
                icon={ExternalLink}
                label={t('navigation.homeAssistant.return')}
                disabled={!canReturnToHomeAssistant}
                title={canReturnToHomeAssistant ? t('navigation.homeAssistant.return') : t('navigation.homeAssistant.finishEditing')}
                onClick={handleReturnToHomeAssistant}
              />
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setIsLogoutConfirmOpen(true)}
            title={t('navigation.logout.confirm')}
            className={`inline-flex h-[3.75rem] w-[3.75rem] shrink-0 items-center justify-center rounded-full border border-[color:var(--ui-border)] text-[color:var(--ui-danger)] transition-colors bg-[color:color-mix(in_srgb,var(--ui-danger)_12%,transparent)] hover:bg-[color:color-mix(in_srgb,var(--ui-danger)_20%,transparent)]`}
          >
            <LogOut size={21} strokeWidth={1.9} aria-hidden="true" />
            <span className="sr-only">{t('navigation.logout.confirm')}</span>
          </button>
        </div>
        </div>
      </aside>

      <SidebarQuickCardGallery
        isOpen={isOpen && isQuickChooserOpen}
        kind={quickKind}
        data={quickCardData}
        onPick={chooseQuickKind}
        onClose={() => setIsQuickChooserOpen(false)}
      />

      <GlassModal
        isOpen={isOpen && isLogoutConfirmOpen}
        onClose={() => setIsLogoutConfirmOpen(false)}
        title={t('navigation.logout.title')}
        description={t('navigation.logout.description')}
        variant="dialog"
        size="sm"
        zIndex={330}
        footer={(
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="liquid-glass-control inline-flex min-h-10 items-center justify-center rounded-full px-4 text-sm font-semibold"
              onClick={() => setIsLogoutConfirmOpen(false)}
            >
              {t('navigation.logout.cancel')}
            </button>
            <button
              type="button"
              className="inline-flex min-h-10 items-center justify-center rounded-full bg-[color:var(--ui-danger)] px-4 text-sm font-semibold text-[color:var(--ui-danger-contrast)]"
              onClick={handleLogoutConfirm}
            >
              {t('navigation.logout.confirm')}
            </button>
          </div>
        )}
      />
    </>
  );
}
