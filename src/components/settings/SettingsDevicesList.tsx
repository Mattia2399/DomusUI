import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  BatteryMedium,
  Blinds,
  Bot,
  Camera,
  CircleAlert,
  CircuitBoard,
  Clock3,
  Cpu,
  DownloadCloud,
  ExternalLink,
  Factory,
  Fan,
  Gauge,
  Home,
  LayoutDashboard,
  Lightbulb,
  LockKeyhole,
  Plug,
  Radio,
  Router,
  Search,
  Signal,
  Smartphone,
  Speaker,
  Tag,
  Thermometer,
  Wifi,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import type { HaArea } from '../../hooks/useHaLiveConnection';
import { useI18n } from '../../i18n/I18nProvider';
import type {
  HaDeviceRegistryEntry,
  HaEntityRegistryEntry,
} from '../../services/haRegistryPresentation';
import type { HaStateTranslations } from '../../services/haStateTranslations';
import { projectSettingsDeviceRooms, type SettingsHouseContext } from '../../services/settingsHouseContext';
import type { MockEntityStateMap } from '../../types/ha';
import type { Widget } from '../../types/dashboardModels';
import GlassSearchFilterBar, {
  type GlassSearchFilterOption,
} from '../ui/GlassSearchFilterBar';
import { SettingsListGroup, SettingsListRow, type SettingsListTone } from './SettingsList';
import {
  EntityDetailSheet,
  buildEntityEntries,
  entityIcon,
  useHaStateTranslations,
  type EntityListEntry,
} from './SettingsEntitiesList';
import { formatRelativeTime } from './entityStateFormat';
import {
  buildDeviceHealthSnapshots,
  type DeviceHealthIssue,
  type DeviceHealthSnapshot,
  type DeviceHealthStatus,
} from './deviceHealthModel';

type Translate = ReturnType<typeof useI18n>['t'];

type DeviceFilter = 'all' | 'attention' | 'offline' | 'battery' | 'updates' | 'unknown';

const PAGE_SIZE = 60;

/** The kind of device, from its integration first and then from what it does. */
const DOMAIN_ICON_ORDER: Array<[string, LucideIcon]> = [
  ['camera', Camera],
  ['lock', LockKeyhole],
  ['climate', Thermometer],
  ['media_player', Speaker],
  ['vacuum', Bot],
  ['light', Lightbulb],
  ['cover', Blinds],
  ['fan', Fan],
  ['switch', Plug],
  ['binary_sensor', Radio],
  ['sensor', Gauge],
];

const STATUS_TONE: Record<DeviceHealthStatus, SettingsListTone> = {
  operational: 'success',
  warning: 'warning',
  offline: 'danger',
  unknown: 'default',
};

export function deviceIcon(device: DeviceHealthSnapshot): LucideIcon {
  if (device.platforms?.includes('mobile_app')) return Smartphone;
  const match = DOMAIN_ICON_ORDER.find(([domain]) => device.entities.some((entity) => entity.domain === domain));
  return match ? match[1] : Router;
}

function translatedStatusLabel(status: DeviceHealthStatus, t: Translate) {
  if (status === 'operational') return t('settings.devices.status.operational');
  if (status === 'warning') return t('settings.devices.status.warning');
  if (status === 'offline') return t('settings.devices.row.unreachable');
  return t('settings.devices.row.noData');
}

function translatedIssue(issue: DeviceHealthIssue, device: DeviceHealthSnapshot, t: Translate) {
  switch (issue.code) {
    case 'connection_unavailable':
      return {
        label: t('settings.devices.issue.connectionUnavailable'),
        detail: t('settings.devices.issue.connectionUnavailableDetail'),
      };
    case 'connectivity_off':
      return {
        label: t('settings.devices.issue.connectivityOff'),
        detail: t('settings.devices.issue.connectivityOffDetail'),
      };
    case 'entities_unavailable':
      return {
        label: t('settings.devices.issue.entitiesUnavailable'),
        detail: t('settings.devices.issue.entitiesUnavailableDetail'),
      };
    case 'entity_unavailable':
      return {
        label: t('settings.devices.issue.entityUnavailable'),
        detail: t('settings.devices.issue.entityUnavailableDetail', { count: device.unavailableEntityCount }),
      };
    case 'battery_low':
      return {
        label: t('settings.devices.issue.batteryLow', { level: device.batteryLevel ?? 0 }),
        detail: t('settings.devices.issue.batteryLowDetail'),
      };
    case 'update_available': {
      const count = device.updateEntityIds.length;
      return {
        label: t('settings.devices.issue.updateAvailable'),
        detail: count === 1
          ? t('settings.devices.issue.updateAvailableOneDetail')
          : t('settings.devices.issue.updateAvailableManyDetail', { count }),
      };
    }
  }
}

/** The one thing a row says on the right: only when something needs a look. */
function deviceRowValue(device: DeviceHealthSnapshot, t: Translate) {
  if (device.status === 'offline') return t('settings.devices.row.unreachable');
  if (device.status === 'unknown') {
    return device.entityCount === 0 ? t('settings.devices.row.noEntities') : t('settings.devices.row.noData');
  }
  if (device.status !== 'warning') return undefined;
  const codes = new Set(device.issues.map((issue) => issue.code));
  if (codes.has('battery_low')) return t('settings.devices.row.battery', { level: device.batteryLevel ?? 0 });
  if (codes.has('entity_unavailable')) {
    return t('settings.devices.row.unavailableEntities', { count: device.unavailableEntityCount });
  }
  if (codes.has('update_available')) return t('settings.devices.row.update');
  return t('settings.devices.row.checkConnection');
}

function deviceSubtitle(device: DeviceHealthSnapshot) {
  return [device.manufacturer, device.model].filter(Boolean).join(' · ') || undefined;
}

function matchesFilter(device: DeviceHealthSnapshot, filter: DeviceFilter) {
  // Like the group on top: everything that needs a look, unreachable devices included.
  if (filter === 'attention') return device.status === 'warning' || device.status === 'offline';
  if (filter === 'offline') return device.status === 'offline';
  if (filter === 'battery') return device.issues.some((issue) => issue.code === 'battery_low');
  if (filter === 'updates') return device.updateAvailable;
  if (filter === 'unknown') return device.status === 'unknown';
  return true;
}

function DeviceRow({ device, onOpen }: { device: DeviceHealthSnapshot; onOpen: () => void }) {
  const { t } = useI18n();
  const value = deviceRowValue(device, t);
  return (
    <SettingsListRow
      icon={deviceIcon(device)}
      tone={device.status === 'operational' ? 'default' : STATUS_TONE[device.status]}
      title={device.name}
      subtitle={deviceSubtitle(device)}
      value={value}
      onClick={onOpen}
    />
  );
}

export function SettingsDevicesList({
  connected,
  haStates,
  entityRegistry = [],
  deviceRegistry = [],
  areas = [],
  houseContext,
  widgets = [],
  batteryWarningThreshold = 20,
  onOpenDevice,
}: {
  connected: boolean;
  haStates: MockEntityStateMap;
  entityRegistry?: HaEntityRegistryEntry[];
  deviceRegistry?: HaDeviceRegistryEntry[];
  areas?: HaArea[];
  houseContext?: SettingsHouseContext | null;
  widgets?: Widget[];
  batteryWarningThreshold?: number;
  onOpenDevice: (deviceId: string) => void;
}) {
  const { locale, t } = useI18n();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<DeviceFilter>('all');
  const [area, setArea] = useState('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase(locale));
  const devices = useMemo(
    () =>
      projectSettingsDeviceRooms(buildDeviceHealthSnapshots({
        locale,
        connected,
        states: haStates,
        entityRegistry,
        deviceRegistry,
        areas,
        widgets,
        batteryWarningThreshold,
      }), houseContext ?? null),
    [areas, batteryWarningThreshold, connected, deviceRegistry, entityRegistry, haStates, houseContext, widgets, locale],
  );

  const areaOptions = useMemo<GlassSearchFilterOption[]>(() => {
    const availableAreas = new Map<string, string>();
    devices.forEach((device) => {
      if (device.areaId) availableAreas.set(device.areaId, device.areaName || device.areaId);
    });
    return [
      { id: 'all', name: t('settings.filters.allRooms') },
      { id: 'none', name: t('settings.filters.noRoom') },
      ...Array.from(availableAreas, ([id, name]) => ({ id, name })).sort((left, right) =>
        left.name.localeCompare(right.name, locale),
      ),
    ];
  }, [devices, locale, t]);

  // Room and search; the status chips count within them.
  const matching = useMemo(
    () =>
      devices.filter((device) => {
        if (area === 'none' && device.areaId) return false;
        if (area !== 'all' && area !== 'none' && device.areaId !== area) return false;
        if (!deferredQuery) return true;
        return [
          device.name,
          device.areaName,
          device.manufacturer,
          device.model,
          ...device.entities.map((entity) => `${entity.name} ${entity.id}`),
        ]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase(locale)
          .includes(deferredQuery);
      }),
    [area, deferredQuery, devices, locale],
  );

  const chips = useMemo(() => {
    const options: Array<{ id: DeviceFilter; label: string }> = [
      { id: 'attention', label: t('settings.devices.needsAttention') },
      { id: 'offline', label: t('settings.devices.chip.offline') },
      { id: 'battery', label: t('settings.devices.lowBattery') },
      { id: 'updates', label: t('settings.devices.updates') },
      { id: 'unknown', label: t('settings.devices.noData') },
    ];
    return options
      .map((option) => ({ ...option, count: matching.filter((device) => matchesFilter(device, option.id)).length }))
      .filter((option) => option.count > 0);
  }, [matching, t]);

  useEffect(() => {
    if (filter !== 'all' && !chips.some((chip) => chip.id === filter)) setFilter('all');
  }, [chips, filter]);
  useEffect(() => setVisibleCount(PAGE_SIZE), [area, deferredQuery, filter]);
  useEffect(() => { if (!houseContext) setArea('all'); }, [houseContext]);

  const filtered = useMemo(
    () => matching.filter((device) => matchesFilter(device, filter)),
    [filter, matching],
  );

  // Devices with a problem first, then one group per room, the room-less last.
  const ordered = useMemo(() => {
    const pinAttention = filter === 'all';
    const attention = pinAttention
      ? filtered.filter((device) => device.status === 'warning' || device.status === 'offline')
      : [];
    const rest = filtered
      .filter((device) => !attention.includes(device))
      .sort((left, right) => {
        if (Boolean(left.areaName) !== Boolean(right.areaName)) return left.areaName ? -1 : 1;
        return (left.areaName ?? '').localeCompare(right.areaName ?? '', locale) ||
          left.name.localeCompare(right.name, locale, { sensitivity: 'base' });
      });
    return [
      ...attention.map((device) => ({ device, group: 'attention' })),
      ...rest.map((device) => ({ device, group: device.areaId ? `area:${device.areaId}` : 'none' })),
    ];
  }, [filter, filtered, locale]);

  const groups = useMemo(() => {
    const totals = new Map<string, number>();
    ordered.forEach(({ group }) => totals.set(group, (totals.get(group) ?? 0) + 1));
    const result: Array<{ id: string; title: string; total: number; devices: DeviceHealthSnapshot[] }> = [];
    ordered.slice(0, visibleCount).forEach(({ device, group }) => {
      const last = result[result.length - 1];
      if (last?.id === group) {
        last.devices.push(device);
        return;
      }
      result.push({
        id: group,
        title: group === 'attention'
          ? t('settings.devices.needsAttention')
          : group === 'none'
            ? (houseContext ? t('settings.filters.noRoom') : t('settings.common.unavailable'))
            : device.areaName || device.areaId || '',
        total: totals.get(group) ?? 0,
        devices: [device],
      });
    });
    return result;
  }, [ordered, t, visibleCount]);

  const resetFilters = () => {
    setQuery('');
    setFilter('all');
    setArea('all');
  };

  const chipClass = (selected: boolean) =>
    `inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition-colors ${
      selected
        ? 'bg-[color:var(--ui-accent)] text-[color:var(--ui-accent-contrast)]'
        : 'border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass-soft)] text-[color:var(--ui-text-primary)] hover:bg-[color:var(--ui-fill-tertiary)]'
    }`;

  return (
    <div className="mx-auto w-full max-w-[48rem]">
      <div className="sticky top-0 z-30">
        <GlassSearchFilterBar
          query={query}
          onQueryChange={setQuery}
          placeholder={t('settings.devices.searchPlaceholder')}
          resultCount={filtered.length}
          resultLabel={(count) => t('settings.devices.resultCount', { count })}
          onReset={resetFilters}
          filters={houseContext ? [
            {
              id: 'area',
              label: t('settings.filters.room'),
              ariaLabel: t('settings.devices.roomAria'),
              options: areaOptions,
              value: area,
              defaultValue: 'all',
              onChange: setArea,
            },
          ] : []}
        />
      </div>

      {chips.length > 0 ? (
        <div
          role="group"
          aria-label={t('settings.devices.chipsAria')}
          className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')} className={chipClass(filter === 'all')}>
            {t('settings.devices.chip.all')}
            <span className="tabular-nums opacity-70">{matching.length}</span>
          </button>
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              aria-pressed={filter === chip.id}
              onClick={() => setFilter((current) => (current === chip.id ? 'all' : chip.id))}
              className={chipClass(filter === chip.id)}
            >
              {chip.label}
              <span className="tabular-nums opacity-70">{chip.count}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-5 space-y-6" aria-label={t('settings.devices.listAria')}>
        {groups.map((group) => (
          <SettingsListGroup
            key={group.id}
            title={group.title}
            action={<span className="text-[11px] font-semibold tabular-nums text-[color:var(--ui-text-tertiary)]">{group.total}</span>}
          >
            {group.devices.map((device) => (
              <DeviceRow key={device.id} device={device} onOpen={() => onOpenDevice(device.id)} />
            ))}
          </SettingsListGroup>
        ))}

        {filtered.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center px-6 text-center">
            <Search size={22} className="text-[color:var(--ui-text-tertiary)]" />
            <h3 className="mt-3 text-sm font-semibold">
              {devices.length === 0 ? t('settings.devices.emptyDetected') : t('settings.devices.emptyFound')}
            </h3>
            <p className="mt-1 max-w-sm text-xs leading-5 text-[color:var(--ui-text-secondary)]">
              {devices.length === 0
                ? t('settings.devices.emptyDetectedDescription')
                : t('settings.filters.tryDifferent')}
            </p>
          </div>
        ) : null}

        {visibleCount < ordered.length ? (
          <button
            type="button"
            onClick={() => setVisibleCount((current) => current + PAGE_SIZE)}
            className="liquid-glass-selection mx-auto flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold"
          >
            {t('settings.devices.showMore', { count: Math.min(PAGE_SIZE, ordered.length - visibleCount) })}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function SettingsDeviceDetail({
  device,
  onOpenUpdates,
  haStates = {},
  entityRegistry = [],
  deviceRegistry = [],
  areas = [],
  houseContext,
  loadStateTranslations,
  developerMode = false,
}: {
  device: DeviceHealthSnapshot;
  onOpenUpdates: () => void;
  haStates?: MockEntityStateMap;
  entityRegistry?: HaEntityRegistryEntry[];
  deviceRegistry?: HaDeviceRegistryEntry[];
  areas?: HaArea[];
  houseContext?: SettingsHouseContext | null;
  loadStateTranslations?: (language: string) => Promise<HaStateTranslations>;
  developerMode?: boolean;
}) {
  const { locale, t } = useI18n();
  const translations = useHaStateTranslations(loadStateTranslations, locale);
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  const [selected, setSelected] = useState<EntityListEntry | null>(null);
  const Icon = deviceIcon(device);
  const tone = STATUS_TONE[device.status];

  const { primary, diagnostic } = useMemo(() => {
    // Firmware entities are already the update row of the status group.
    const diagnosticIds = new Set(
      device.entities.filter((entity) => entity.diagnostic || entity.domain === 'update').map((entity) => entity.id),
    );
    const entries = buildEntityEntries({
      haStates,
      entityRegistry,
      deviceRegistry,
      areas,
      houseContext,
      translations,
      locale,
      t,
      entityIds: device.entities.map((entity) => entity.id),
    });
    return {
      primary: entries.filter((entry) => !diagnosticIds.has(entry.id)),
      diagnostic: entries.filter((entry) => diagnosticIds.has(entry.id)),
    };
  }, [areas, device.entities, deviceRegistry, entityRegistry, haStates, houseContext, locale, t, translations]);

  const issues = device.issues.filter((issue) => issue.code !== 'update_available');
  const statusRows = [
    device.connectionState ? (
      <SettingsListRow
        key="connection"
        icon={device.connectionState === 'online' ? Wifi : WifiOff}
        tone={device.connectionState === 'online' ? 'success' : 'danger'}
        title={t('settings.devices.connection')}
        value={device.connectionState === 'online' ? t('settings.devices.connected') : t('settings.devices.disconnected')}
      />
    ) : null,
    device.batteryLevel !== undefined ? (
      <SettingsListRow
        key="battery"
        icon={BatteryMedium}
        tone={device.batteryLevel <= 10 ? 'danger' : device.batteryLevel <= 20 ? 'warning' : 'success'}
        title={t('settings.devices.battery')}
        value={`${device.batteryLevel}%`}
        meter={{
          percent: device.batteryLevel,
          tone: device.batteryLevel <= 10 ? 'danger' : device.batteryLevel <= 20 ? 'warning' : 'success',
        }}
      />
    ) : null,
    device.signalStrength !== undefined ? (
      <SettingsListRow
        key="signal"
        icon={Signal}
        title={t('settings.devices.signal')}
        value={`${device.signalStrength} ${device.signalUnit || 'dBm'}`}
      />
    ) : null,
    device.lastDataUpdate !== undefined ? (
      <SettingsListRow
        key="last-data"
        icon={Clock3}
        title={t('settings.devices.lastData')}
        value={formatRelativeTime(device.lastDataUpdate, locale)}
      />
    ) : null,
    device.updateAvailable ? (
      <SettingsListRow
        key="update"
        icon={DownloadCloud}
        tone="warning"
        title={t('settings.devices.issue.updateAvailable')}
        subtitle={t('settings.devices.openUpdates')}
        onClick={onOpenUpdates}
      />
    ) : null,
  ].filter(Boolean);

  const configurationUrl = device.configurationUrl && /^https?:\/\//i.test(device.configurationUrl)
    ? device.configurationUrl
    : null;
  const renderEntity = (entry: EntityListEntry) => (
    <SettingsListRow
      key={entry.id}
      icon={entityIcon(entry.domain)}
      tone={entry.tone}
      title={entry.name}
      value={entry.value}
      onClick={() => setSelected(entry)}
    />
  );

  return (
    <div className="mx-auto w-full max-w-[48rem] space-y-6 pb-4">
      <div className="flex flex-col items-center px-4 pt-2 text-center">
        <span
          className={`flex h-16 w-16 items-center justify-center rounded-[1.35rem] border ${
            tone === 'danger'
              ? 'border-rose-400/25 bg-rose-500/10 text-[color:var(--ui-danger)]'
              : tone === 'warning'
                ? 'border-amber-400/25 bg-amber-500/10 text-amber-500'
                : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]'
          }`}
        >
          <Icon size={28} aria-hidden />
        </span>
        {deviceSubtitle(device) ? (
          <p className="mt-3 text-sm text-[color:var(--ui-text-secondary)]">{deviceSubtitle(device)}</p>
        ) : null}
        <p
          className={`mt-1 text-xs font-semibold ${
            tone === 'danger'
              ? 'text-[color:var(--ui-danger)]'
              : tone === 'warning'
                ? 'text-amber-500'
                : tone === 'success'
                  ? 'text-emerald-500'
                  : 'text-[color:var(--ui-text-tertiary)]'
          }`}
        >
          {device.status === 'unknown' && device.entityCount === 0
            ? t('settings.devices.row.noEntities')
            : translatedStatusLabel(device.status, t)}
        </p>
      </div>

      {statusRows.length > 0 ? (
        <SettingsListGroup title={t('settings.devices.detail.status')}>{statusRows}</SettingsListGroup>
      ) : null}

      {issues.length > 0 ? (
        <SettingsListGroup title={t('settings.devices.needsAttention')}>
          {issues.map((issue) => {
            const copy = translatedIssue(issue, device, t);
            return (
              <SettingsListRow
                key={issue.code}
                icon={CircleAlert}
                tone={device.status === 'offline' ? 'danger' : 'warning'}
                title={copy.label}
                subtitle={copy.detail}
              />
            );
          })}
        </SettingsListGroup>
      ) : null}

      <SettingsListGroup
        title={t('settings.devices.detail.entities')}
        action={<span className="text-[11px] font-semibold tabular-nums text-[color:var(--ui-text-tertiary)]">{primary.length}</span>}
      >
        {primary.length > 0 ? (
          primary.map(renderEntity)
        ) : (
          <div className="px-4 py-6 text-center text-sm text-[color:var(--ui-text-secondary)]">
            {t('settings.devices.noLinkedEntities')}
          </div>
        )}
      </SettingsListGroup>

      {diagnostic.length > 0 ? (
        showDiagnostic ? (
          <SettingsListGroup
            title={t('settings.devices.detail.diagnostic')}
            action={
              <button
                type="button"
                onClick={() => setShowDiagnostic(false)}
                className="text-xs font-semibold text-[color:var(--ui-accent)] hover:opacity-80"
              >
                {t('settings.devices.detail.hideDiagnostic')}
              </button>
            }
          >
            {diagnostic.map(renderEntity)}
          </SettingsListGroup>
        ) : (
          <button
            type="button"
            onClick={() => setShowDiagnostic(true)}
            className="mx-auto flex min-h-10 items-center justify-center rounded-full px-4 text-xs font-semibold text-[color:var(--ui-accent)] hover:opacity-80"
          >
            {diagnostic.length === 1
              ? t('settings.devices.detail.showDiagnosticOne')
              : t('settings.devices.detail.showDiagnosticMany', { count: diagnostic.length })}
          </button>
        )
      ) : null}

      <SettingsListGroup title={t('settings.devices.detail.info')}>
        {device.manufacturer ? (
          <SettingsListRow icon={Factory} title={t('settings.devices.detail.manufacturer')} value={device.manufacturer} />
        ) : null}
        {device.model ? <SettingsListRow icon={Tag} title={t('settings.devices.detail.model')} value={device.model} /> : null}
        {device.swVersion ? (
          <SettingsListRow icon={Cpu} title={t('settings.devices.detail.software')} value={device.swVersion} />
        ) : null}
        {device.hwVersion ? (
          <SettingsListRow icon={CircuitBoard} title={t('settings.devices.detail.hardware')} value={device.hwVersion} />
        ) : null}
        <SettingsListRow
          icon={Home}
          title={t('settings.entities.detail.room')}
          value={device.roomContextUnavailable ? t('settings.common.unavailable') : device.areaName || t('settings.filters.noRoom')}
        />
        {device.dashboardWidgetCount > 0 ? (
          <SettingsListRow
            icon={LayoutDashboard}
            title={t('settings.devices.detail.dashboard')}
            value={
              device.dashboardWidgetCount === 1
                ? t('settings.devices.detail.cardsOne')
                : t('settings.devices.detail.cardsMany', { count: device.dashboardWidgetCount })
            }
          />
        ) : null}
        {configurationUrl ? (
          <SettingsListRow
            icon={ExternalLink}
            title={t('settings.devices.detail.openPage')}
            subtitle={t('settings.devices.detail.openPageHint')}
            onClick={() => window.open(configurationUrl, '_blank', 'noopener,noreferrer')}
          />
        ) : null}
      </SettingsListGroup>

      <EntityDetailSheet entry={selected} onClose={() => setSelected(null)} developerMode={developerMode} />
    </div>
  );
}

export default SettingsDevicesList;
