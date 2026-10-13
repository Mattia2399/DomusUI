import React from 'react';
import {
  Bell,
  Check,
  ChevronRight,
  ExternalLink,
  Lightbulb,
  PencilLine,
  Recycle,
  Settings,
  Shield,
  type LucideIcon,
} from 'lucide-react';
import type { SidebarQuickPath } from '../../hooks/useProfileSettings';
import type { HaArea, HaConnectionStatus } from '../../hooks/useHaLiveConnection';
import { fallbackStateWord } from '../../i18n/entityStateFallback';
import { useI18n } from '../../i18n/I18nProvider';
import type { HaDeviceRegistryEntry, HaEntityRegistryEntry } from '../../services/haRegistryPresentation';
import { readSecurityCenterAlarm, securityAlarmCandidates } from '../../services/securityCenterSelection';
import type { Widget } from '../../types/dashboardModels';
import type { MockEntityStateMap } from '../../types/ha';
import { useHomeAttentionItems } from '../homeAttention/useHomeAttentionItems';
import { haStatusLabel } from '../settings/haStatusLabel';
import { DomusMark } from '../site/ui/Logo';
import GlassBottomSheet from '../ui/GlassBottomSheet';
import GlassModal from '../ui/GlassModal';
import {
  getDashboardNavigationIcon,
  isDashboardNavigationEntryActive,
  normalizeDashboardNavigationPath,
  PRIMARY_DASHBOARD_ROUTE_IDS,
  resolveDashboardNavigationEntries,
  TOOL_DASHBOARD_ROUTE_IDS,
} from './dashboardNavigation';
import { DashboardProfileAvatar } from './DashboardProfileAvatar';
import {
  SIDEBAR_QUICK_CARD_KINDS,
  availableUpdateCount,
  formatCollectionDay,
  lightsOn,
  nextWasteCollection,
  readSidebarQuickCard,
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

const QUICK_KIND_LABELS = {
  attention: 'navigation.quick.kind.attention',
  alarm: 'navigation.quick.kind.alarm',
  lights: 'navigation.quick.kind.lights',
  waste: 'navigation.quick.kind.waste',
  none: 'navigation.quick.kind.none',
} as const;

const QUICK_KIND_ICONS: Record<Exclude<SidebarQuickCardKind, 'none'>, LucideIcon> = {
  attention: Bell,
  alarm: Shield,
  lights: Lightbulb,
  waste: Recycle,
};

type MobileSidebarDrawerProps = {
  isOpen: boolean;
  isEditMode: boolean;
  isEditTourActive?: boolean;
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

/** A section of the sidebar, as on iPad: a plain title and its rows, no frame. */
function DrawerGroup({ title, children }: { title?: string; children: React.ReactNode }) {
  const titleId = React.useId();
  return (
    <section aria-labelledby={title ? titleId : undefined}>
      {title ? (
        <h2 id={titleId} className="mb-1 px-3 text-[13px] font-semibold text-[color:var(--ui-text-secondary)]">
          {title}
        </h2>
      ) : null}
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

/** A sidebar row: a thin accent icon, its name and a count; the current page is a filled pill. */
const DrawerRow = React.forwardRef<
  HTMLButtonElement,
  {
    icon: LucideIcon;
    label: string;
    active?: boolean;
    disabled?: boolean;
    title?: string;
    badge?: { count: number; label: string; tone: 'accent' | 'danger' };
    onClick: () => void;
    onPrefetch?: () => void;
    tourTarget?: string;
  }
>(function DrawerRow({ icon: Icon, label, active = false, disabled = false, title, badge, onClick, onPrefetch, tourTarget }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      data-tour-target={tourTarget}
      onPointerEnter={onPrefetch}
      onPointerDown={onPrefetch}
      onFocus={onPrefetch}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-current={active ? 'page' : undefined}
      className={`flex min-h-11 w-full min-w-0 items-center gap-3 rounded-full px-3.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
        active
          ? 'bg-[color:var(--ui-accent)] text-[color:var(--ui-accent-contrast)] shadow-[0_8px_22px_-10px_rgb(var(--ui-accent-rgb)/0.7)]'
          : 'text-[color:var(--ui-text-primary)] hover:bg-[color:var(--ui-fill-tertiary)] active:bg-[color:var(--ui-fill-secondary)]'
      }`}
    >
      <Icon
        size={20}
        strokeWidth={1.8}
        className={`shrink-0 ${active ? 'text-[color:var(--ui-accent-contrast)]' : 'text-[color:var(--ui-text-secondary)]'}`}
        aria-hidden="true"
      />
      <span className={`min-w-0 flex-1 truncate text-[0.95rem] ${active ? 'font-semibold' : 'font-medium'}`}>{label}</span>
      {badge && badge.count > 0 ? (
        <span
          className={`inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${
            active
              ? 'bg-white/25 text-[color:var(--ui-accent-contrast)]'
              : badge.tone === 'danger'
                ? 'bg-[color:var(--ui-danger)] text-[color:var(--ui-danger-contrast)]'
                : 'bg-[color:rgb(var(--ui-accent-rgb)/0.16)] text-[color:var(--ui-accent)]'
          }`}
        >
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
  isEditTourActive = false,
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
  const editButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = React.useRef<HTMLElement | null>(null);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = React.useState(false);
  const [isLightsConfirmOpen, setIsLightsConfirmOpen] = React.useState(false);
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
  const routeGroups = [
    { id: 'home', label: t('navigation.section.home'), entries: resolveDashboardNavigationEntries(quickPaths, PRIMARY_DASHBOARD_ROUTE_IDS, t) },
    { id: 'tools', label: t('navigation.section.tools'), entries: resolveDashboardNavigationEntries(quickPaths, TOOL_DASHBOARD_ROUTE_IDS, t) },
  ];
  const displayUserName = userAvatarAlt?.trim() || t('profile.fallback.name');
  const accountLine = [
    userRole ? t(ROLE_LABEL_KEYS[userRole]) : userEmail?.trim(),
    `Home Assistant ${haStatusLabel(haStatus, t).toLocaleLowerCase()}`,
  ]
    .filter(Boolean)
    .join(' · ');
  // Edit mode only where a page can be edited (or while it is on, or the tour shows it).
  const showEditMode = canToggleEditMode || isEditMode || isEditTourActive;
  const updateCount = isOpen ? availableUpdateCount(states) : 0;
  const securityCount = securityAttentionCount(attentionItems);
  const litLights = isOpen ? lightsOn(states) : [];

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
    setIsLightsConfirmOpen(false);
    if (litLights.length > 0) void onCallService?.('light', 'turn_off', { entity_id: litLights });
  };

  React.useEffect(() => {
    if (!isOpen) {
      setIsLogoutConfirmOpen(false);
      setIsLightsConfirmOpen(false);
      setIsQuickChooserOpen(false);
    }
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen || !isEditTourActive) return undefined;
    const timer = window.setTimeout(() => {
      editButtonRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
    }, 220);
    return () => window.clearTimeout(timer);
  }, [isEditTourActive, isOpen]);

  const overlayOpen = isLogoutConfirmOpen || isLightsConfirmOpen || isQuickChooserOpen;
  React.useEffect(() => {
    if (!isOpen) {
      return;
    }
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.setTimeout(() => {
      drawerRef.current?.querySelector<HTMLElement>('button:not([disabled]), a[href]')?.focus();
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

  const renderQuickCard = () => {
    if (quickKind === 'none') {
      return (
        <button
          type="button"
          onClick={() => setIsQuickChooserOpen(true)}
          className="inline-flex min-h-10 w-full items-center justify-center rounded-full text-xs font-semibold text-[color:var(--ui-accent)] hover:bg-[color:var(--ui-fill-tertiary)]"
        >
          {t('navigation.quick.add')}
        </button>
      );
    }

    let title: string;
    let detail: string;
    let action: { label: string; onClick: () => void } | null = null;
    if (quickKind === 'attention') {
      const count = attentionItems.length;
      title = count === 0
        ? t('navigation.quick.attentionClear')
        : count === 1
          ? t('navigation.quick.attentionOne')
          : t('navigation.quick.attentionMany', { count });
      detail = count === 0 ? t('navigation.quick.attentionClearHint') : attentionItems[0].title;
      if (count > 0) action = { label: t('navigation.quick.open'), onClick: () => navigate('/home') };
    } else if (quickKind === 'alarm') {
      const alarms = securityAlarmCandidates(states, locale);
      const stored = readSecurityCenterAlarm();
      const alarmId = stored && alarms.includes(stored) ? stored : alarms[0];
      const alarm = alarmId ? states[alarmId] : undefined;
      if (!alarmId || !alarm) {
        title = t('navigation.quick.alarmNone');
        detail = t('navigation.quick.alarmNoneHint');
      } else {
        const state = `${alarm.state ?? ''}`;
        title = fallbackStateWord(locale, 'alarm_control_panel', state) ?? state.replace(/_/g, ' ');
        const name = alarm.rawAttributes?.friendly_name;
        detail = typeof name === 'string' && name.trim() ? name.trim() : alarmId;
        action = { label: t('navigation.quick.open'), onClick: () => navigate('/security') };
      }
    } else if (quickKind === 'lights') {
      const count = litLights.length;
      title = count === 0
        ? t('navigation.quick.lightsOff')
        : count === 1
          ? t('navigation.quick.lightsOne')
          : t('navigation.quick.lightsMany', { count });
      detail = count === 0
        ? t('navigation.quick.lightsOffHint')
        : litLights
            .slice(0, 2)
            .map((id) => {
              const name = states[id]?.rawAttributes?.friendly_name;
              return typeof name === 'string' && name.trim() ? name.trim() : id;
            })
            .join(', ') + (count > 2 ? '…' : '');
      if (count > 0 && onCallService) {
        action = { label: t('navigation.quick.lightsTurnOff'), onClick: () => setIsLightsConfirmOpen(true) };
      }
    } else {
      const next = nextWasteCollection(states);
      if (next === undefined) {
        title = t('navigation.quick.kind.waste');
        detail = t('navigation.quick.wasteNotConfigured');
        action = { label: t('navigation.quick.open'), onClick: () => navigate('/settings/home/waste-collection') };
      } else if (next === null) {
        title = t('navigation.quick.wasteNone');
        detail = t('navigation.quick.kind.waste');
      } else {
        title = next.summary;
        const day = formatCollectionDay(next.start, locale);
        detail = `${t('navigation.quick.wasteNext')} · ${day.charAt(0).toUpperCase()}${day.slice(1)}`;
      }
    }
    const KindIcon = QUICK_KIND_ICONS[quickKind];

    return (
      <section
        aria-label={t(QUICK_KIND_LABELS[quickKind])}
        className="rounded-[1.4rem] border border-[color:rgb(var(--ui-accent-rgb)/0.22)] bg-[color:rgb(var(--ui-accent-rgb)/0.1)] p-3.5"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ui-accent)]">
            <KindIcon size={13} aria-hidden="true" />
            <span className="truncate">{t(QUICK_KIND_LABELS[quickKind])}</span>
          </span>
          <button
            type="button"
            onClick={() => setIsQuickChooserOpen(true)}
            aria-label={t('navigation.quick.changeAria')}
            className="shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold text-[color:var(--ui-text-secondary)] hover:bg-[color:var(--ui-fill-tertiary)]"
          >
            {t('navigation.quick.change')}
          </button>
        </div>
        <p className="mt-2 text-base font-semibold leading-tight tracking-[-0.01em] text-[color:var(--ui-text-primary)]">{title}</p>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-[color:var(--ui-text-secondary)]">{detail}</p>
        {action ? (
          <button
            type="button"
            onClick={action.onClick}
            className="mt-3 inline-flex min-h-9 items-center justify-center rounded-full bg-[color:var(--ui-accent)] px-4 text-xs font-semibold text-[color:var(--ui-accent-contrast)] hover:opacity-90"
          >
            {action.label}
          </button>
        ) : null}
      </section>
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={onClose}
        tabIndex={isOpen ? 0 : -1}
        aria-hidden={!isOpen}
        aria-label={t('navigation.menu.close')}
        className={`fixed inset-0 z-[176] bg-[color:var(--ui-scrim)] backdrop-blur-md transition-opacity duration-200 md:hidden ${
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('navigation.menu.main')}
        tabIndex={-1}
        inert={!isOpen}
        className={`liquid-glass-panel fixed left-0 top-0 z-[181] flex h-[100dvh] w-[min(86vw,22rem)] max-w-[22rem] flex-col overflow-hidden rounded-none border-y-0 border-l-0 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-[calc(env(safe-area-inset-top)+1.1rem)] text-[color:var(--ui-text-primary)] shadow-[24px_0_70px_var(--ui-glass-shadow)] transition-transform duration-250 ease-out motion-reduce:transition-none md:hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-[105%]'
        }`}
        aria-hidden={!isOpen}
      >
        <div className="flex items-center gap-2.5 px-2">
          <DomusMark className="h-9 w-9 shrink-0" />
          <span className="text-lg font-semibold tracking-[-0.02em] text-[color:var(--ui-text-primary)]">Domus</span>
        </div>

        <nav
          aria-label={t('navigation.menu.main')}
          className="mt-5 min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain pb-3 glass-scrollbar"
        >
          {routeGroups.map((group) => (
            <DrawerGroup key={group.id} title={group.label}>
              {group.entries.map((entry) => {
                const isSecurity = normalizeDashboardNavigationPath(entry.path) === '/security';
                return (
                  <DrawerRow
                    key={entry.id}
                    icon={getDashboardNavigationIcon(entry.icon)}
                    label={entry.label}
                    active={isDashboardNavigationEntryActive({ entry, isEditMode, selectedPathId, activeRoute })}
                    badge={isSecurity ? { count: securityCount, label: t('navigation.badge.security', { count: securityCount }), tone: 'danger' } : undefined}
                    onPrefetch={() => onPrefetchRoute?.(entry.path)}
                    onClick={() => handlePathClick(entry)}
                  />
                );
              })}
            </DrawerGroup>
          ))}

          <DrawerGroup>
            <DrawerRow
              icon={Settings}
              label={t('navigation.settings')}
              active={isSettingsActive}
              badge={{ count: updateCount, label: t('navigation.badge.updates', { count: updateCount }), tone: 'accent' }}
              onPrefetch={() => onPrefetchRoute?.('/settings')}
              onClick={handleOpenSettings}
            />
            {showEditMode ? (
              <DrawerRow
                ref={editButtonRef}
                tourTarget="edit-mode"
                icon={PencilLine}
                label={isEditMode ? t('navigation.edit.exit') : t('navigation.edit.enter')}
                active={isEditMode}
                disabled={!canToggleEditMode}
                onPrefetch={onPrefetchEditMode}
                onClick={handleToggleEditMode}
              />
            ) : null}
            {showHomeAssistantReturn ? (
              <DrawerRow
                icon={ExternalLink}
                label={t('navigation.homeAssistant.return')}
                disabled={!canReturnToHomeAssistant}
                title={canReturnToHomeAssistant ? t('navigation.homeAssistant.return') : t('navigation.homeAssistant.finishEditing')}
                onClick={handleReturnToHomeAssistant}
              />
            ) : null}
          </DrawerGroup>
        </nav>

        <div className="space-y-2 border-t border-[color:var(--ui-separator)] pt-3">
          {renderQuickCard()}

          <div className="flex items-center gap-1">
            <button
              type="button"
              onPointerEnter={() => onPrefetchRoute?.('/profile')}
              onPointerDown={() => onPrefetchRoute?.('/profile')}
              onFocus={() => onPrefetchRoute?.('/profile')}
              onClick={handleOpenProfile}
              aria-label={t('navigation.profile.open')}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-full py-1.5 pl-1.5 pr-2 text-left transition-colors hover:bg-[color:var(--ui-fill-tertiary)]"
            >
              <span className="relative flex h-10 w-10 shrink-0">
                <DashboardProfileAvatar userAvatarUrl={userAvatarUrl} userName={displayUserName} haStatus={haStatus} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-[color:var(--ui-text-primary)]">{displayUserName}</span>
                <span className="block truncate text-[11px] text-[color:var(--ui-text-secondary)]">{accountLine}</span>
              </span>
              <ChevronRight size={16} className="shrink-0 text-[color:var(--ui-text-tertiary)]" aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsLogoutConfirmOpen(true)}
            className="inline-flex min-h-10 w-full items-center justify-center rounded-full text-sm font-semibold text-[color:var(--ui-danger)] transition-colors hover:bg-[color:var(--ui-fill-tertiary)]"
          >
            {t('navigation.logout.confirm')}
          </button>
        </div>
      </aside>

      <GlassBottomSheet
        isOpen={isOpen && isQuickChooserOpen}
        onClose={() => setIsQuickChooserOpen(false)}
        title={t('navigation.quick.chooseTitle')}
        description={t('navigation.quick.chooseHint')}
        zIndex={330}
      >
        <div className="divide-y divide-[color:var(--ui-separator)] overflow-hidden rounded-[1.2rem] border border-[color:var(--ui-border)]">
          {SIDEBAR_QUICK_CARD_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => chooseQuickKind(kind)}
              aria-pressed={kind === quickKind}
              className="flex min-h-[3.25rem] w-full items-center gap-3 px-4 text-left text-sm font-semibold text-[color:var(--ui-text-primary)] hover:bg-[color:var(--ui-fill-tertiary)]"
            >
              <span className="min-w-0 flex-1 truncate">{t(QUICK_KIND_LABELS[kind])}</span>
              {kind === quickKind ? <Check size={17} className="shrink-0 text-[color:var(--ui-accent)]" aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      </GlassBottomSheet>

      <GlassModal
        isOpen={isOpen && isLightsConfirmOpen}
        onClose={() => setIsLightsConfirmOpen(false)}
        title={t('navigation.quick.lightsConfirmTitle')}
        description={t('navigation.quick.lightsConfirmBody')}
        variant="dialog"
        size="sm"
        zIndex={330}
        footer={(
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="liquid-glass-control inline-flex min-h-10 items-center justify-center rounded-full px-4 text-sm font-semibold"
              onClick={() => setIsLightsConfirmOpen(false)}
            >
              {t('navigation.logout.cancel')}
            </button>
            <button
              type="button"
              className="inline-flex min-h-10 items-center justify-center rounded-full bg-[color:var(--ui-accent)] px-4 text-sm font-semibold text-[color:var(--ui-accent-contrast)]"
              onClick={turnOffLights}
            >
              {t('navigation.quick.lightsConfirm')}
            </button>
          </div>
        )}
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
