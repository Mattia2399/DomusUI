import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
  Transition,
} from '@headlessui/react';
import clsx from 'clsx';
import {
  BatteryLow,
  ChevronRight,
  CircleAlert,
  Clock3,
  DoorOpen,
  Droplets,
  EyeOff,
  LockOpen,
  ShieldAlert,
  TriangleAlert,
  WifiOff,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import DashboardSidePanel from '../ui/DashboardSidePanel';
import { useHomeAttentionPreferences } from './homeAttentionPreferences';
import GlassButton from '../ui/GlassButton';
import type { HaDeviceRegistryEntry, HaEntityRegistryEntry } from '../../services/haRegistryPresentation';
import type { MockEntityStateMap } from '../../types/ha';
import type { Widget } from '../../types/dashboardModels';
import {
  buildHomeAttentionItems,
  formatHomeAttentionDuration,
  type HomeAttentionArea,
  type HomeAttentionCategory,
  type HomeAttentionItem,
  type HomeAttentionSeverity,
} from './homeAttentionEngine';
import {
  isHomeAttentionItemSuppressed,
  resolveHomeAttentionSnoozeUntil,
  useHomeAttentionSuppressions,
  type HomeAttentionSnoozePreset,
} from './homeAttentionSuppressions';
import { useI18n } from '../../i18n/I18nProvider';

type HomeAttentionCenterProps = {
  runtimeMode: 'real' | 'demo';
  connected: boolean;
  states: MockEntityStateMap;
  entityRegistry?: HaEntityRegistryEntry[];
  deviceRegistry?: HaDeviceRegistryEntry[];
  areas?: HomeAttentionArea[];
  widgets?: Widget[];
  onOpenItem?: (item: HomeAttentionItem) => void;
};

const SEVERITY_META: Record<
  HomeAttentionSeverity,
  {
    Icon: LucideIcon;
    orbClassName: string;
    iconClassName: string;
    accentClassName: string;
  }
> = {
  critical: {
    Icon: ShieldAlert,
    orbClassName: 'border-[color:var(--ui-danger)]/35 bg-[color:var(--ui-danger)]/14',
    iconClassName: 'text-[color:var(--ui-danger)]',
    accentClassName: 'bg-[color:var(--ui-danger)]',
  },
  warning: {
    Icon: TriangleAlert,
    orbClassName: 'border-[color:var(--ui-warning)]/35 bg-[color:var(--ui-warning)]/14',
    iconClassName: 'text-[color:var(--ui-warning)]',
    accentClassName: 'bg-[color:var(--ui-warning)]',
  },
  info: {
    Icon: CircleAlert,
    orbClassName: 'border-[color:var(--ui-accent)]/30 bg-[color:var(--ui-accent)]/12',
    iconClassName: 'text-[color:var(--ui-accent)]',
    accentClassName: 'bg-[color:var(--ui-accent)]',
  },
};

const CATEGORY_ICON: Record<HomeAttentionCategory, LucideIcon> = {
  safety: Droplets,
  security: LockOpen,
  opening: DoorOpen,
  availability: WifiOff,
  battery: BatteryLow,
  configuration: Wrench,
};

const SEVERITY_ORDER: HomeAttentionSeverity[] = ['critical', 'warning', 'info'];
const SNOOZE_OPTIONS: HomeAttentionSnoozePreset[] = ['hour', 'evening', 'tomorrow'];

function resolveContextLabel(item: HomeAttentionItem) {
  return item.areaName || item.deviceName || item.entityId;
}

function AttentionSnoozeMenu({
  item,
  onSelect,
}: {
  item: HomeAttentionItem;
  onSelect: (preset: HomeAttentionSnoozePreset) => void;
}) {
  const { t } = useI18n();
  const optionLabels = {
    hour: t('attention.snooze.hour'),
    evening: t('attention.snooze.evening'),
    tomorrow: t('attention.snooze.tomorrow'),
  };
  return (
    <Menu>
      <MenuButton
        className="glass-icon-button h-9 w-9 shrink-0"
        aria-label={t('attention.snooze.aria', { title: item.title })}
        title={t('attention.snooze.title')}
      >
        <Clock3 size={14} aria-hidden />
      </MenuButton>
      <Transition
        as={Fragment}
        enter="transition ease-out duration-180"
        enterFrom="opacity-0 translate-y-1 scale-[0.97]"
        enterTo="opacity-100 translate-y-0 scale-100"
        leave="transition ease-in duration-120"
        leaveFrom="opacity-100 translate-y-0 scale-100"
        leaveTo="opacity-0 translate-y-1 scale-[0.97]"
      >
        <MenuItems
          anchor={{ to: 'bottom end', gap: 8, padding: 12 }}
          portal
          className="liquid-glass-navigation z-[400] w-44 origin-top-right rounded-2xl p-1.5 text-sm text-[color:var(--ui-text-primary)] outline-none"
        >
          {SNOOZE_OPTIONS.map((option) => (
            <MenuItem key={option}>
              {({ focus }) => (
                <button
                  type="button"
                  onClick={() => onSelect(option)}
                  className={clsx(
                    'flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-medium text-[color:var(--ui-text-secondary)] transition-colors',
                    focus && 'bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-primary)]',
                  )}
                >
                  <Clock3 size={14} aria-hidden />
                  {optionLabels[option]}
                </button>
              )}
            </MenuItem>
          ))}
        </MenuItems>
      </Transition>
    </Menu>
  );
}

function AttentionItemRow({
  item,
  now,
  onOpen,
  onSnooze,
  onIgnore,
}: {
  item: HomeAttentionItem;
  now: number;
  onOpen?: (item: HomeAttentionItem) => void;
  onSnooze?: (item: HomeAttentionItem, preset: HomeAttentionSnoozePreset) => void;
  onIgnore?: (item: HomeAttentionItem) => void;
}) {
  const { t } = useI18n();
  const meta = SEVERITY_META[item.severity];
  const Icon = CATEGORY_ICON[item.category] ?? meta.Icon;
  const duration = formatHomeAttentionDuration(item.activeSince, now);
  const contextLabel = resolveContextLabel(item);
  const canSuppress = item.severity !== 'critical';

  return (
    <article className="dashboard-content-surface relative overflow-hidden rounded-[1.15rem] px-3 py-2.5 sm:px-3.5 sm:py-3">
      <span aria-hidden className={`absolute inset-y-2.5 left-0 w-0.5 rounded-r-full ${meta.accentClassName}`} />
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${meta.orbClassName}`}
          aria-hidden
        >
          <Icon size={16} strokeWidth={2} className={meta.iconClassName} />
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-[13px] font-semibold text-[color:var(--ui-text-primary)]">
            {item.title}
          </h4>
          <p className="mt-0.5 truncate text-[11px] leading-4 text-[color:var(--ui-text-secondary)]">
            {item.description}
          </p>
        </div>
        {duration ? (
          <span className="shrink-0 rounded-full bg-[color:var(--ui-fill-tertiary)] px-2 py-1 text-[9px] font-semibold text-[color:var(--ui-text-secondary)]">
            {duration}
          </span>
        ) : null}
      </div>

      <div className="mt-2 flex min-w-0 items-center gap-1.5 border-t border-[color:var(--ui-separator)] pt-2">
        <p className="min-w-0 flex-1 truncate text-[10px] font-medium text-[color:var(--ui-text-tertiary)]">
          {contextLabel}
        </p>
        {!canSuppress ? (
          <span className="shrink-0 px-1.5 text-[9px] font-semibold text-[color:var(--ui-danger)]">
            {t('attention.alwaysVisible')}
          </span>
        ) : null}
        {canSuppress && onSnooze ? (
          <AttentionSnoozeMenu
            item={item}
            onSelect={(preset) => onSnooze(item, preset)}
          />
        ) : null}
        {canSuppress && onIgnore ? (
          <GlassButton
            size="icon"
            variant="ghost"
            onClick={() => onIgnore(item)}
            className="!h-9 !w-9 shrink-0"
            aria-label={t('attention.ignore.aria', { title: item.title })}
            title={t('attention.ignore.title')}
          >
            <EyeOff size={14} aria-hidden />
          </GlassButton>
        ) : null}
        {onOpen && item.entityId ? (
          <GlassButton
            size="sm"
            variant="ghost"
            onClick={() => onOpen(item)}
            className="shrink-0 !min-h-9 !rounded-full !px-2.5"
            aria-label={t('attention.check.aria', { title: item.title })}
          >
            {t('attention.check')}
            <ChevronRight size={13} aria-hidden />
          </GlassButton>
        ) : null}
      </div>
    </article>
  );
}

export function HomeAttentionCenter({
  runtimeMode,
  connected,
  states,
  entityRegistry = [],
  deviceRegistry = [],
  areas = [],
  widgets = [],
  onOpenItem,
}: HomeAttentionCenterProps) {
  const { locale, t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const { preferences } = useHomeAttentionPreferences(runtimeMode);
  const {
    suppressions,
    suppressItem,
    pruneSuppressions,
  } = useHomeAttentionSuppressions(runtimeMode);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const candidateItems = useMemo(
    () =>
      preferences.enabled
        ? buildHomeAttentionItems({
            runtimeMode,
            connected,
            states,
            entityRegistry,
            deviceRegistry,
            areas,
            widgets,
            now,
            batteryWarningThreshold: preferences.batteryWarningThreshold,
            openingWarningMinutes: preferences.openingWarningMinutes,
            locale,
          }).filter((item) => preferences.categories[item.category])
        : [],
    [
      areas,
      connected,
      deviceRegistry,
      entityRegistry,
      locale,
      now,
      preferences,
      runtimeMode,
      states,
      widgets,
    ],
  );

  useEffect(() => {
    pruneSuppressions(candidateItems, now);
  }, [candidateItems, now, pruneSuppressions]);

  const items = useMemo(
    () =>
      candidateItems.filter(
        (item) => !isHomeAttentionItemSuppressed(item, suppressions, now),
      ),
    [candidateItems, now, suppressions],
  );

  useEffect(() => {
    if (items.length === 0) {
      setIsOpen(false);
    }
  }, [items.length]);

  if (items.length === 0) {
    return null;
  }

  const primaryItem = items[0];
  const primaryMeta = SEVERITY_META[primaryItem.severity];
  const PrimaryIcon = CATEGORY_ICON[primaryItem.category] ?? primaryMeta.Icon;
  const groupedItems = SEVERITY_ORDER
    .map((severity) => ({
      severity,
      items: items.filter((item) => item.severity === severity),
    }))
    .filter((group) => group.items.length > 0);
  const attentionLabel = items.length === 1
    ? t('attention.count.one')
    : t('attention.count.many', { count: items.length });
  const severityLabels: Record<HomeAttentionSeverity, string> = {
    critical: t('attention.severity.critical'),
    warning: t('attention.severity.warning'),
    info: t('attention.severity.info'),
  };

  const handleOpenItem = (item: HomeAttentionItem) => {
    setIsOpen(false);
    onOpenItem?.(item);
  };
  const handleSnoozeItem = (
    item: HomeAttentionItem,
    preset: HomeAttentionSnoozePreset,
  ) => {
    suppressItem(
      item,
      'snooze',
      resolveHomeAttentionSnoozeUntil(preset, now),
    );
  };
  const handleIgnoreItem = (item: HomeAttentionItem) => {
    suppressItem(item, 'until_change');
  };

  return (
    <div className="mx-1 shrink-0 sm:mx-0">
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="liquid-glass-control group flex min-h-[4.25rem] w-full items-center gap-3 rounded-[1.45rem] px-3.5 py-2.5 text-left shadow-[0_14px_34px_var(--ui-shadow-soft)] transition-transform hover:brightness-105 active:scale-[0.99] sm:px-4"
        aria-label={t('attention.open.aria', { count: attentionLabel })}
        aria-expanded={isOpen}
      >
        <span
          className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border ${primaryMeta.orbClassName}`}
          aria-hidden
        >
          <span className={`absolute inset-1 animate-pulse rounded-full opacity-20 ${primaryMeta.accentClassName}`} />
          <PrimaryIcon size={19} strokeWidth={2.1} className={`relative ${primaryMeta.iconClassName}`} />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold text-[color:var(--ui-text-primary)]">
              {t('attention.requiresAttention')}
            </span>
            {runtimeMode === 'demo' ? (
              <span className="shrink-0 rounded-full bg-[color:var(--ui-warning)]/12 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[color:var(--ui-warning)]">
                Demo
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block truncate text-xs text-[color:var(--ui-text-secondary)]">
            {primaryItem.title}
            {items.length > 1 ? ` · +${items.length - 1}` : ''}
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-2">
          <span className="hidden rounded-full bg-[color:var(--ui-fill-secondary)] px-2.5 py-1 text-[11px] font-semibold text-[color:var(--ui-text-secondary)] sm:inline">
            {attentionLabel}
          </span>
          <ChevronRight
            size={18}
            aria-hidden
            className="text-[color:var(--ui-text-tertiary)] transition-transform group-hover:translate-x-0.5"
          />
        </span>
      </button>

      <DashboardSidePanel
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={t('attention.center')}
        description={
          runtimeMode === 'demo'
            ? t('attention.demoDescription')
            : t('attention.description')
        }
        closeLabel={t('attention.close')}
        bodyClassName="space-y-5"
      >
        {runtimeMode === 'demo' ? (
          <div className="rounded-[1.15rem] border border-[color:var(--ui-warning)]/25 bg-[color:var(--ui-warning)]/10 px-3.5 py-3 text-xs leading-relaxed text-[color:var(--ui-text-secondary)]">
            {t('attention.demoNotice')}
          </div>
        ) : null}

        {groupedItems.map((group) => {
          const meta = SEVERITY_META[group.severity];
          return (
            <section key={group.severity} aria-labelledby={`attention-group-${group.severity}`}>
              <div className="mb-2.5 flex items-center justify-between gap-3 px-1">
                <h3
                  id={`attention-group-${group.severity}`}
                  className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ui-text-secondary)]"
                >
                  {severityLabels[group.severity]}
                </h3>
                <span className="text-[11px] font-semibold text-[color:var(--ui-text-tertiary)]">
                  {group.items.length}
                </span>
              </div>
              <div className="space-y-2.5">
                {group.items.map((item) => (
                  <AttentionItemRow
                    key={item.id}
                    item={item}
                    now={now}
                    onOpen={onOpenItem ? handleOpenItem : undefined}
                    onSnooze={handleSnoozeItem}
                    onIgnore={handleIgnoreItem}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </DashboardSidePanel>
    </div>
  );
}

export default HomeAttentionCenter;
