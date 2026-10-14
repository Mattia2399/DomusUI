import React from 'react';
import {
  Bell,
  Check,
  ChevronRight,
  ExternalLink,
  Lightbulb,
  LogOut,
  PencilLine,
  Plus,
  Recycle,
  Settings,
  Shield,
  X,
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
import GlassBottomSheet from '../ui/GlassBottomSheet';
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

type Tone = 'accent' | 'danger' | 'success' | 'warning' | 'neutral';

const TONE_CLASSES: Record<Tone, string> = {
  accent: 'bg-[color:rgb(var(--ui-accent-rgb)/0.14)] text-[color:var(--ui-accent)]',
  danger: 'bg-[color:color-mix(in_srgb,var(--ui-danger)_14%,transparent)] text-[color:var(--ui-danger)]',
  success: 'bg-[color:color-mix(in_srgb,var(--ui-success)_15%,transparent)] text-[color:var(--ui-success)]',
  warning: 'bg-[color:color-mix(in_srgb,var(--ui-warning)_16%,transparent)] text-[color:var(--ui-warning)]',
  neutral: 'bg-[color:var(--ui-fill-secondary)] text-[color:var(--ui-text-secondary)]',
};

/* The surfaces inside the glass panel: soft and translucent, never glass on glass. */
const GROUP_SURFACE = 'border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass-soft)]';

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
    tourTarget?: string;
  }
>(function DrawerAction({ icon: Icon, label, active = false, toggle = false, disabled = false, title, badge, onClick, onPrefetch, tourTarget }, ref) {
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
  const homeEntries = resolveDashboardNavigationEntries(quickPaths, PRIMARY_DASHBOARD_ROUTE_IDS, t);
  const toolEntries = resolveDashboardNavigationEntries(quickPaths, TOOL_DASHBOARD_ROUTE_IDS, t);
  const displayUserName = userAvatarAlt?.trim() || t('profile.fallback.name');
  const accountLine = [
    userRole ? t(ROLE_LABEL_KEYS[userRole]) : userEmail?.trim(),
    `HA ${haStatusLabel(haStatus, t).toLocaleLowerCase()}`,
  ]
    .filter(Boolean)
    .join(' · ');
  // Edit mode only where a page can be edited (or while it is on, or the tour shows it).
  const showEditMode = canToggleEditMode || isEditMode || isEditTourActive;
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

  const renderQuickCard = () => {
    if (quickKind === 'none') {
      return (
        <button
          type="button"
          onClick={() => setIsQuickChooserOpen(true)}
          className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-[1.4rem] border-[1.5px] border-dashed border-[color:var(--ui-border-strong)] text-[0.95rem] font-semibold text-[color:var(--ui-accent)] transition-colors hover:bg-[color:var(--ui-fill-tertiary)]"
        >
          <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
          {t('navigation.quick.add')}
        </button>
      );
    }

    let title: string;
    let detail: string;
    let tone: Tone = 'neutral';
    let action: { label: string; onClick: () => void } | null = null;
    if (quickKind === 'attention') {
      const count = attentionItems.length;
      title = count === 0
        ? t('navigation.quick.attentionClear')
        : count === 1
          ? t('navigation.quick.attentionOne')
          : t('navigation.quick.attentionMany', { count });
      detail = count === 0 ? t('navigation.quick.attentionClearHint') : attentionItems[0].title;
      tone = count === 0 ? 'success' : 'danger';
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
        tone = state === 'triggered' ? 'danger' : state.startsWith('armed') ? 'accent' : 'neutral';
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
      tone = count === 0 ? 'neutral' : 'warning';
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
        tone = 'success';
      }
    }
    const KindIcon = QUICK_KIND_ICONS[quickKind];

    return (
      <section aria-label={t(QUICK_KIND_LABELS[quickKind])} className={`rounded-[1.5rem] px-3.5 pb-3.5 pt-3 ${GROUP_SURFACE}`}>
        <div className="flex min-h-6 items-center justify-between gap-2">
          <span className="min-w-0 truncate text-[13px] font-semibold text-[color:var(--ui-text-secondary)]">
            {t(QUICK_KIND_LABELS[quickKind])}
          </span>
          <button
            type="button"
            onClick={() => setIsQuickChooserOpen(true)}
            aria-label={t('navigation.quick.changeAria')}
            className="-my-2.5 -mr-2.5 inline-flex min-h-11 shrink-0 items-center rounded-full px-2.5 text-[13px] font-semibold text-[color:var(--ui-accent)] transition-colors hover:bg-[color:var(--ui-fill-tertiary)]"
          >
            {t('navigation.quick.change')}
          </button>
        </div>
        <div className="mt-2.5 flex items-center gap-3">
          <span className={`flex h-[2.625rem] w-[2.625rem] shrink-0 items-center justify-center rounded-full ${TONE_CLASSES[tone]}`}>
            <KindIcon size={19} strokeWidth={1.9} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 text-[0.95rem] font-semibold leading-tight tracking-[-0.01em] text-[color:var(--ui-text-primary)]">{title}</span>
            <span className="mt-0.5 line-clamp-2 text-[13px] leading-[1.35] text-[color:var(--ui-text-secondary)]">{detail}</span>
          </span>
          {action ? (
            <button
              type="button"
              onClick={action.onClick}
              className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-full bg-[color:rgb(var(--ui-accent-rgb)/0.14)] px-4 text-sm font-semibold text-[color:var(--ui-accent)] transition-colors hover:bg-[color:rgb(var(--ui-accent-rgb)/0.2)]"
            >
              {action.label}
            </button>
          ) : null}
        </div>
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
        className={`fixed inset-0 z-[176] bg-[rgb(8_10_16/0.3)] transition-opacity duration-[420ms] ease-out motion-reduce:transition-none md:hidden ${
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

          {renderQuickCard()}
        </nav>

        <div className="flex items-center gap-2.5 px-4 pb-4 pt-2">
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
                ref={editButtonRef}
                tourTarget="edit-mode"
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
