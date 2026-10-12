import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  AlarmClock,
  Bot,
  Box,
  CalendarDays,
  Camera,
  Check,
  Clock,
  CloudSun,
  Copy,
  Fan,
  Gauge,
  Home,
  Lightbulb,
  LockKeyhole,
  MapPin,
  Puzzle,
  Radio,
  Router,
  Search,
  Shield,
  Sparkles,
  Speaker,
  Tag,
  Thermometer,
  ToggleRight,
  UserRound,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import type { MockEntityState, MockEntityStateMap } from '../../types/ha';
import type { HaArea } from '../../hooks/useHaLiveConnection';
import { useI18n } from '../../i18n/I18nProvider';
import type { TranslationKey } from '../../i18n/translations';
import type {
  HaDeviceRegistryEntry,
  HaEntityRegistryEntry,
} from '../../services/haRegistryPresentation';
import type { HaStateTranslations } from '../../services/haStateTranslations';
import GlassBottomSheet from '../ui/GlassBottomSheet';
import GlassSearchFilterBar, {
  type GlassSearchFilterOption,
} from '../ui/GlassSearchFilterBar';
import { SettingsListGroup, SettingsListRow, type SettingsListTone } from './SettingsList';
import { formatEntityState, formatRelativeTime } from './entityStateFormat';

const PAGE_SIZE = 80;

const DOMAIN_LABEL_KEYS: Record<string, TranslationKey> = Object.fromEntries([
  'alarm_control_panel', 'automation', 'binary_sensor', 'button', 'calendar', 'camera',
  'climate', 'cover', 'device_tracker', 'fan', 'humidifier', 'light', 'lock',
  'media_player', 'person', 'scene', 'script', 'select', 'sensor', 'siren', 'sun',
  'switch', 'update', 'vacuum', 'weather', 'zone',
].map((domain) => [domain, `settings.domains.${domain}` as TranslationKey]));

/** Groups follow how a home is used: controls first, then people, sensors and the rest. */
const DOMAIN_ORDER = [
  'light', 'switch', 'fan', 'cover', 'climate', 'humidifier', 'lock', 'alarm_control_panel',
  'media_player', 'camera', 'vacuum', 'siren', 'person', 'device_tracker', 'binary_sensor',
  'sensor', 'weather', 'sun', 'calendar', 'automation', 'script', 'scene', 'button', 'select',
  'update', 'zone',
];

const DOMAIN_ICONS: Record<string, LucideIcon> = {
  alarm_control_panel: Shield,
  automation: Workflow,
  binary_sensor: Radio,
  calendar: CalendarDays,
  camera: Camera,
  climate: Thermometer,
  cover: Box,
  device_tracker: MapPin,
  fan: Fan,
  light: Lightbulb,
  lock: LockKeyhole,
  media_player: Speaker,
  person: UserRound,
  scene: Sparkles,
  sensor: Gauge,
  siren: AlarmClock,
  switch: ToggleRight,
  vacuum: Bot,
  weather: CloudSun,
};

type AvailabilityFilter = 'all' | 'available' | 'unavailable';

type EntityListEntry = {
  id: string;
  domain: string;
  domainLabel: string;
  name: string;
  value: string;
  tone: SettingsListTone;
  unavailable: boolean;
  disabled: boolean;
  areaId: string;
  areaLabel: string;
  deviceId: string;
  deviceName: string;
  platform: string;
  entity: MockEntityState | undefined;
};

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveDomain(entityId: string) {
  return entityId.split('.', 1)[0] || 'other';
}

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function domainRank(domain: string) {
  const index = DOMAIN_ORDER.indexOf(domain);
  return index === -1 ? DOMAIN_ORDER.length : index;
}

function formatDomain(domain: string, t: ReturnType<typeof useI18n>['t']) {
  const translationKey = DOMAIN_LABEL_KEYS[domain];
  return (translationKey ? t(translationKey) : '') || humanize(domain);
}

function formatEntityName(
  entityId: string,
  entity: MockEntityState | undefined,
  registryEntry?: HaEntityRegistryEntry,
) {
  return (
    normalizeText(entity?.rawAttributes?.friendly_name) ||
    normalizeText(registryEntry?.name) ||
    normalizeText(registryEntry?.originalName) ||
    humanize(entityId.replace(/^[^.]+\./, ''))
  );
}

function formatAttribute(value: unknown) {
  if (typeof value === 'string') return value;
  try {
    const text = JSON.stringify(value);
    return text.length > 240 ? `${text.slice(0, 240)}…` : text;
  } catch {
    return String(value);
  }
}

function EntityDetail({
  entry,
  developerMode,
  onOpenDevice,
}: {
  entry: EntityListEntry;
  developerMode: boolean;
  onOpenDevice?: (deviceId: string) => void;
}) {
  const { locale, t } = useI18n();
  const [copied, setCopied] = useState(false);
  const Icon = DOMAIN_ICONS[entry.domain] ?? Box;
  const lastChanged = Date.parse(normalizeText(entry.entity?.rawAttributes?.__last_changed));
  const attributes = Object.entries(entry.entity?.rawAttributes ?? {}).filter(([key]) => !key.startsWith('__'));

  const copyId = () => {
    void navigator.clipboard?.writeText(entry.id).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };

  return (
    <div className="space-y-5">
      <SettingsListGroup title={t('settings.entities.detail.info')}>
        <SettingsListRow icon={Icon} tone={entry.tone} title={t('settings.entities.detail.state')} value={entry.value} />
        {Number.isFinite(lastChanged) ? (
          <SettingsListRow
            icon={Clock}
            title={t('settings.entities.detail.lastChanged')}
            value={formatRelativeTime(lastChanged, locale)}
          />
        ) : null}
        <SettingsListRow
          icon={Home}
          title={t('settings.entities.detail.room')}
          value={entry.areaLabel || t('settings.filters.noRoom')}
        />
        {entry.deviceId ? (
          <SettingsListRow
            icon={Router}
            title={t('settings.entities.detail.device')}
            value={entry.deviceName || entry.deviceId}
            onClick={onOpenDevice ? () => onOpenDevice(entry.deviceId) : undefined}
          />
        ) : null}
        {entry.platform ? (
          <SettingsListRow icon={Puzzle} title={t('settings.entities.detail.integration')} value={humanize(entry.platform)} />
        ) : null}
        <SettingsListRow icon={Tag} title={t('settings.entities.detail.type')} value={entry.domainLabel} />
        <div className="flex min-h-[4.4rem] items-center gap-3 px-4 py-3">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-[color:var(--ui-text-primary)]">
              {t('settings.entities.detail.entityId')}
            </span>
            <span className="mt-0.5 block break-all font-mono text-xs text-[color:var(--ui-text-secondary)]">{entry.id}</span>
          </span>
          <button
            type="button"
            onClick={copyId}
            className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-3 text-xs font-semibold text-[color:var(--ui-text-primary)] hover:opacity-80"
          >
            {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
            {copied ? t('settings.entities.detail.copied') : t('settings.entities.detail.copy')}
          </button>
        </div>
      </SettingsListGroup>

      {developerMode ? (
        <SettingsListGroup title={t('settings.entities.detail.developer')}>
          <div className="px-4 py-3">
            <p className="text-sm font-semibold text-[color:var(--ui-text-primary)]">{t('settings.entities.detail.attributes')}</p>
            {attributes.length > 0 ? (
              <dl className="mt-2 space-y-1.5">
                {attributes.map(([key, value]) => (
                  <div key={key} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 text-xs">
                    <dt className="truncate font-mono text-[color:var(--ui-text-tertiary)]">{key}</dt>
                    <dd className="break-words font-mono text-[color:var(--ui-text-secondary)]">{formatAttribute(value)}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-1 text-xs text-[color:var(--ui-text-secondary)]">{t('settings.entities.detail.noAttributes')}</p>
            )}
          </div>
        </SettingsListGroup>
      ) : null}
    </div>
  );
}

export function SettingsEntitiesList({
  haStates,
  entityRegistry = [],
  deviceRegistry = [],
  areas = [],
  loadStateTranslations,
  developerMode = false,
  onOpenDevice,
}: {
  haStates: MockEntityStateMap;
  entityRegistry?: HaEntityRegistryEntry[];
  deviceRegistry?: HaDeviceRegistryEntry[];
  areas?: HaArea[];
  /** Home Assistant's own state words for a language; absent when they cannot be asked for. */
  loadStateTranslations?: (language: string) => Promise<HaStateTranslations>;
  developerMode?: boolean;
  onOpenDevice?: (deviceId: string) => void;
}) {
  const { locale, t } = useI18n();
  const [translations, setTranslations] = useState<HaStateTranslations>({});
  const [query, setQuery] = useState('');
  const [domain, setDomain] = useState('all');
  const [availability, setAvailability] = useState<AvailabilityFilter>('all');
  const [area, setArea] = useState('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [showDisabled, setShowDisabled] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase(locale));

  useEffect(() => {
    if (!loadStateTranslations) return undefined;
    let live = true;
    void loadStateTranslations(locale).then((loaded) => {
      if (live) setTranslations(loaded);
    });
    return () => {
      live = false;
    };
  }, [loadStateTranslations, locale]);

  const availabilityOptions: GlassSearchFilterOption[] = [
    { id: 'all', name: t('settings.filters.anyStatus') },
    { id: 'available', name: t('settings.filters.available') },
    { id: 'unavailable', name: t('settings.filters.unavailable') },
  ];

  const entities = useMemo<EntityListEntry[]>(() => {
    const registryByEntityId = new Map(entityRegistry.map((entry) => [entry.entityId, entry]));
    const deviceById = new Map(deviceRegistry.map((entry) => [entry.id, entry]));
    const areaNameById = new Map(areas.map((entry) => [entry.area_id, entry.name]));
    const labels = {
      disabled: t('settings.entities.disabled'),
      unavailable: t('settings.common.unavailable'),
      unknown: t('settings.common.unknown'),
    };
    const entityIds = Array.from(
      new Set([...Object.keys(haStates), ...entityRegistry.map((entry) => entry.entityId)]),
    );
    return entityIds
      .map((id) => {
        const entity = haStates[id];
        const registryEntry = registryByEntityId.get(id);
        const device = registryEntry?.deviceId ? deviceById.get(registryEntry.deviceId) : undefined;
        const entityDomain = resolveDomain(id);
        const areaId = registryEntry?.areaId || device?.areaId || '';
        const formatted = formatEntityState({ entityId: id, entity, registry: registryEntry, translations, locale, labels });
        return {
          id,
          domain: entityDomain,
          domainLabel: formatDomain(entityDomain, t),
          name: formatEntityName(id, entity, registryEntry),
          value: formatted.text,
          tone: formatted.tone,
          unavailable: formatted.unavailable,
          disabled: Boolean(registryEntry?.disabledBy),
          areaId,
          areaLabel: areaId ? areaNameById.get(areaId) ?? areaId : '',
          deviceId: registryEntry?.deviceId ?? '',
          deviceName: normalizeText(device?.nameByUser) || normalizeText(device?.name),
          platform: registryEntry?.platform ?? '',
          entity,
        };
      })
      .sort(
        (left, right) =>
          domainRank(left.domain) - domainRank(right.domain) ||
          left.domainLabel.localeCompare(right.domainLabel, locale) ||
          left.name.localeCompare(right.name, locale, { sensitivity: 'base' }),
      );
  }, [areas, deviceRegistry, entityRegistry, haStates, locale, t, translations]);

  const areaOptions = useMemo<GlassSearchFilterOption[]>(() => {
    const availableAreas = new Map<string, string>();
    entities.forEach((entry) => {
      if (entry.areaId) {
        availableAreas.set(entry.areaId, entry.areaLabel || entry.areaId);
      }
    });
    return [
      { id: 'all', name: t('settings.filters.allRooms') },
      { id: 'none', name: t('settings.filters.noRoom') },
      ...Array.from(availableAreas, ([id, name]) => ({ id, name })).sort((left, right) =>
        left.name.localeCompare(right.name, locale),
      ),
    ];
  }, [entities, locale, t]);

  // Every filter except the type: the type chips count within it.
  const matching = useMemo(
    () =>
      entities.filter((entry) => {
        if (availability === 'available' && entry.unavailable) return false;
        if (availability === 'unavailable' && !entry.unavailable) return false;
        if (area === 'none' && entry.areaId) return false;
        if (area !== 'all' && area !== 'none' && entry.areaId !== area) return false;
        if (!deferredQuery) return true;
        return `${entry.name} ${entry.id} ${entry.value} ${entry.domainLabel} ${entry.areaLabel}`
          .toLocaleLowerCase(locale)
          .includes(deferredQuery);
      }),
    [area, availability, deferredQuery, entities, locale],
  );

  const typeChips = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>();
    matching.forEach((entry) => {
      const current = counts.get(entry.domain);
      counts.set(entry.domain, { label: entry.domainLabel, count: (current?.count ?? 0) + 1 });
    });
    return Array.from(counts, ([id, value]) => ({ id, ...value }));
  }, [matching]);

  const filtered = useMemo(
    () => (domain === 'all' ? matching : matching.filter((entry) => entry.domain === domain)),
    [domain, matching],
  );
  const active = filtered.filter((entry) => !entry.disabled);
  const disabled = filtered.filter((entry) => entry.disabled);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [area, availability, deferredQuery, domain]);

  // The selected type may disappear when another filter changes.
  useEffect(() => {
    if (domain !== 'all' && !typeChips.some((chip) => chip.id === domain)) setDomain('all');
  }, [domain, typeChips]);

  const groups = useMemo(() => {
    const totals = new Map<string, number>();
    active.forEach((entry) => totals.set(entry.domain, (totals.get(entry.domain) ?? 0) + 1));
    const result: Array<{ domain: string; label: string; total: number; entries: EntityListEntry[] }> = [];
    active.slice(0, visibleCount).forEach((entry) => {
      const last = result[result.length - 1];
      if (last?.domain === entry.domain) {
        last.entries.push(entry);
      } else {
        result.push({ domain: entry.domain, label: entry.domainLabel, total: totals.get(entry.domain) ?? 0, entries: [entry] });
      }
    });
    return result;
  }, [active, visibleCount]);

  const selected = selectedId ? entities.find((entry) => entry.id === selectedId) ?? null : null;
  const resetFilters = () => {
    setQuery('');
    setDomain('all');
    setAvailability('all');
    setArea('all');
  };

  const renderRow = (entry: EntityListEntry) => (
    <SettingsListRow
      key={entry.id}
      icon={DOMAIN_ICONS[entry.domain] ?? Box}
      tone={entry.tone}
      title={entry.name}
      subtitle={entry.areaLabel || undefined}
      value={entry.value}
      onClick={() => setSelectedId(entry.id)}
    />
  );

  const chipClass = (selectedChip: boolean) =>
    `inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition-colors ${
      selectedChip
        ? 'bg-[color:var(--ui-accent)] text-[color:var(--ui-accent-contrast)]'
        : 'border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass-soft)] text-[color:var(--ui-text-primary)] hover:bg-[color:var(--ui-fill-tertiary)]'
    }`;

  return (
    <div className="mx-auto w-full max-w-[48rem]">
      <div className="sticky top-0 z-30">
        <GlassSearchFilterBar
          query={query}
          onQueryChange={setQuery}
          placeholder={t('settings.entities.searchPlaceholder')}
          resultCount={filtered.length}
          resultLabel={(count) => t('settings.entities.resultCount', { count })}
          onReset={resetFilters}
          filters={[
            {
              id: 'availability',
              label: t('settings.filters.availability'),
              ariaLabel: t('settings.filters.availabilityAria'),
              options: availabilityOptions,
              value: availability,
              defaultValue: 'all',
              onChange: (value) => setAvailability(value as AvailabilityFilter),
            },
            {
              id: 'area',
              label: t('settings.filters.room'),
              ariaLabel: t('settings.filters.roomAria'),
              options: areaOptions,
              value: area,
              defaultValue: 'all',
              onChange: setArea,
            },
          ]}
        />
      </div>

      {typeChips.length > 1 ? (
        <div
          role="group"
          aria-label={t('settings.entities.typesAria')}
          className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <button type="button" aria-pressed={domain === 'all'} onClick={() => setDomain('all')} className={chipClass(domain === 'all')}>
            {t('settings.entities.allTypes')}
            <span className="tabular-nums opacity-70">{matching.length}</span>
          </button>
          {typeChips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              aria-pressed={domain === chip.id}
              onClick={() => setDomain((current) => (current === chip.id ? 'all' : chip.id))}
              className={chipClass(domain === chip.id)}
            >
              {chip.label}
              <span className="tabular-nums opacity-70">{chip.count}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-5 space-y-6" aria-label={t('settings.entities.listAria')}>
        {groups.map((group) => (
          <SettingsListGroup
            key={group.domain}
            title={group.label}
            action={<span className="text-[11px] font-semibold tabular-nums text-[color:var(--ui-text-tertiary)]">{group.total}</span>}
          >
            {group.entries.map(renderRow)}
          </SettingsListGroup>
        ))}

        {active.length === 0 && disabled.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center px-6 text-center">
            <Search size={22} className="text-[color:var(--ui-text-tertiary)]" />
            <h3 className="mt-3 text-sm font-semibold">{t('settings.entities.empty')}</h3>
            <p className="mt-1 text-xs text-[color:var(--ui-text-secondary)]">
              {t('settings.filters.tryDifferent')}
            </p>
          </div>
        ) : null}

        {visibleCount < active.length ? (
          <button
            type="button"
            onClick={() => setVisibleCount((current) => current + PAGE_SIZE)}
            className="liquid-glass-selection mx-auto flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold"
          >
            {t('settings.entities.showMore', { count: Math.min(PAGE_SIZE, active.length - visibleCount) })}
          </button>
        ) : null}

        {disabled.length > 0 && visibleCount >= active.length ? (
          showDisabled ? (
            <SettingsListGroup
              title={t('settings.entities.disabledGroup')}
              action={
                <button
                  type="button"
                  onClick={() => setShowDisabled(false)}
                  className="text-xs font-semibold text-[color:var(--ui-accent)] hover:opacity-80"
                >
                  {t('settings.entities.hideDisabled')}
                </button>
              }
            >
              {disabled.map(renderRow)}
            </SettingsListGroup>
          ) : (
            <button
              type="button"
              onClick={() => setShowDisabled(true)}
              className="mx-auto flex min-h-10 items-center justify-center rounded-full px-4 text-xs font-semibold text-[color:var(--ui-accent)] hover:opacity-80"
            >
              {disabled.length === 1
                ? t('settings.entities.showDisabledOne')
                : t('settings.entities.showDisabled', { count: disabled.length })}
            </button>
          )
        ) : null}
      </div>

      <GlassBottomSheet
        isOpen={selected !== null}
        onClose={() => setSelectedId(null)}
        title={selected?.name ?? ''}
        description={selected ? selected.domainLabel : undefined}
      >
        {selected ? (
          <EntityDetail
            key={selected.id}
            entry={selected}
            developerMode={developerMode}
            onOpenDevice={
              onOpenDevice
                ? (deviceId) => {
                    setSelectedId(null);
                    onOpenDevice(deviceId);
                  }
                : undefined
            }
          />
        ) : null}
      </GlassBottomSheet>
    </div>
  );
}

export default SettingsEntitiesList;
