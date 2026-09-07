import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  AlarmClock,
  Bot,
  Box,
  CalendarDays,
  Camera,
  CloudSun,
  Fan,
  Gauge,
  Lightbulb,
  LockKeyhole,
  MapPin,
  Radio,
  Search,
  Shield,
  Sparkles,
  Speaker,
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
import GlassSearchFilterBar, {
  type GlassSearchFilterOption,
} from '../ui/GlassSearchFilterBar';

const PAGE_SIZE = 80;

const DOMAIN_LABEL_KEYS: Record<string, TranslationKey> = Object.fromEntries([
  'alarm_control_panel', 'automation', 'binary_sensor', 'button', 'calendar', 'camera',
  'climate', 'cover', 'device_tracker', 'fan', 'humidifier', 'light', 'lock',
  'media_player', 'person', 'scene', 'script', 'select', 'sensor', 'siren', 'sun',
  'switch', 'update', 'vacuum', 'weather', 'zone',
].map((domain) => [domain, `settings.domains.${domain}` as TranslationKey]));

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
  unavailable: boolean;
  areaId: string;
  areaLabel: string;
};

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveDomain(entityId: string) {
  return entityId.split('.', 1)[0] || 'other';
}

function formatDomain(domain: string, t: ReturnType<typeof useI18n>['t']) {
  const translationKey = DOMAIN_LABEL_KEYS[domain];
  return (
    (translationKey ? t(translationKey) : '') ||
    domain
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
  );
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
    entityId
      .replace(/^[^.]+\./, '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
  );
}

function formatEntityValue(entity: MockEntityState | undefined, registryEntry?: HaEntityRegistryEntry) {
  if (registryEntry?.disabledBy) {
    return 'disabled';
  }
  if (!entity) {
    return 'unavailable';
  }
  const label = normalizeText(entity.stateLabel);
  if (label) {
    return label;
  }
  const state = normalizeText(entity.state) || 'unknown';
  return entity.unit ? `${state} ${entity.unit}` : state;
}

function isEntityUnavailable(entity: MockEntityState | undefined, registryEntry?: HaEntityRegistryEntry) {
  if (!entity || registryEntry?.disabledBy) {
    return true;
  }
  const state = normalizeText(entity.state).toLowerCase();
  return state === 'unavailable' || state === 'unknown' || state.length === 0;
}

function EntityRow({ entry }: { entry: EntityListEntry }) {
  const { t } = useI18n();
  const Icon = DOMAIN_ICONS[entry.domain] ?? Box;
  return (
    <li className="flex min-w-0 items-center gap-3 border-t border-[color:var(--ui-separator)] px-4 py-3 first:border-t-0 sm:px-5">
      <Icon
        size={18}
        aria-hidden="true"
        className="shrink-0 text-[color:var(--ui-text-secondary)]"
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-semibold text-[color:var(--ui-text-primary)]">
            {entry.name}
          </p>
          {entry.unavailable ? (
            <span className="shrink-0 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-500">
              {t('settings.common.unavailable')}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-[11px] font-medium text-[color:var(--ui-text-tertiary)]">
          {entry.id}
        </p>
      </div>
      <div className="min-w-0 max-w-[38%] shrink-0 text-right">
        <p className="truncate text-xs font-semibold text-[color:var(--ui-text-primary)]">
          {entry.value}
        </p>
        <p className="mt-0.5 truncate text-[10px] font-medium text-[color:var(--ui-text-tertiary)]">
          {entry.areaLabel ? `${entry.domainLabel} · ${entry.areaLabel}` : entry.domainLabel}
        </p>
      </div>
    </li>
  );
}

export function SettingsEntitiesList({
  haStates,
  entityRegistry = [],
  deviceRegistry = [],
  areas = [],
}: {
  haStates: MockEntityStateMap;
  entityRegistry?: HaEntityRegistryEntry[];
  deviceRegistry?: HaDeviceRegistryEntry[];
  areas?: HaArea[];
}) {
  const { locale, t } = useI18n();
  const [query, setQuery] = useState('');
  const [domain, setDomain] = useState('all');
  const [availability, setAvailability] = useState<AvailabilityFilter>('all');
  const [area, setArea] = useState('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase(locale));
  const availabilityOptions: GlassSearchFilterOption[] = [
    { id: 'all', name: t('settings.filters.anyStatus') },
    { id: 'available', name: t('settings.filters.available') },
    { id: 'unavailable', name: t('settings.filters.unavailable') },
  ];

  const entities = useMemo<EntityListEntry[]>(
    () => {
      const registryByEntityId = new Map(entityRegistry.map((entry) => [entry.entityId, entry]));
      const deviceAreaById = new Map(deviceRegistry.map((entry) => [entry.id, entry.areaId ?? '']));
      const areaNameById = new Map(areas.map((entry) => [entry.area_id, entry.name]));
      const entityIds = Array.from(
        new Set([...Object.keys(haStates), ...entityRegistry.map((entry) => entry.entityId)]),
      );
      return entityIds
        .map((id) => {
          const entity = haStates[id];
          const registryEntry = registryByEntityId.get(id);
          const entityDomain = resolveDomain(id);
          const areaId =
            registryEntry?.areaId ||
            (registryEntry?.deviceId ? deviceAreaById.get(registryEntry.deviceId) : '') ||
            '';
          return {
            id,
            domain: entityDomain,
            domainLabel: formatDomain(entityDomain, t),
            name: formatEntityName(id, entity, registryEntry),
            value: (() => {
              const value = formatEntityValue(entity, registryEntry);
              if (value === 'disabled') return t('settings.entities.disabled');
              if (value === 'unavailable') return t('settings.entities.stateUnavailable');
              if (value === 'unknown') return t('settings.common.unknown');
              return value;
            })(),
            unavailable: isEntityUnavailable(entity, registryEntry),
            areaId,
            areaLabel: areaId ? areaNameById.get(areaId) ?? areaId : '',
          };
        })
        .sort((left, right) =>
          left.name.localeCompare(right.name, locale, { sensitivity: 'base' }),
        );
    },
    [areas, deviceRegistry, entityRegistry, haStates, locale, t],
  );

  const domainOptions = useMemo<GlassSearchFilterOption[]>(() => {
    const domains = Array.from(new Set(entities.map((entry) => entry.domain))).sort((left, right) =>
      formatDomain(left, t).localeCompare(formatDomain(right, t), locale),
    );
    return [
      { id: 'all', name: t('settings.filters.allTypes') },
      ...domains.map((id) => ({ id, name: formatDomain(id, t) })),
    ];
  }, [entities, locale, t]);

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

  const filteredEntities = useMemo(
    () =>
      entities.filter((entry) => {
        if (domain !== 'all' && entry.domain !== domain) {
          return false;
        }
        if (availability === 'available' && entry.unavailable) {
          return false;
        }
        if (availability === 'unavailable' && !entry.unavailable) {
          return false;
        }
        if (area === 'none' && entry.areaId) {
          return false;
        }
        if (area !== 'all' && area !== 'none' && entry.areaId !== area) {
          return false;
        }
        if (!deferredQuery) {
          return true;
        }
        return `${entry.name} ${entry.id} ${entry.value} ${entry.domainLabel} ${entry.areaLabel}`
          .toLocaleLowerCase(locale)
          .includes(deferredQuery);
      }),
    [area, availability, deferredQuery, domain, entities, locale],
  );

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [area, availability, deferredQuery, domain]);

  const visibleEntities = filteredEntities.slice(0, visibleCount);
  const resetFilters = () => {
    setQuery('');
    setDomain('all');
    setAvailability('all');
    setArea('all');
  };

  return (
    <div>
      <div className="sticky top-0 z-30">
        <GlassSearchFilterBar
          query={query}
          onQueryChange={setQuery}
          placeholder={t('settings.entities.searchPlaceholder')}
          resultCount={filteredEntities.length}
          resultLabel={(count) => t('settings.entities.resultCount', { count })}
          onReset={resetFilters}
          filters={[
            {
              id: 'domain',
              label: t('settings.filters.type'),
              ariaLabel: t('settings.filters.typeAria'),
              options: domainOptions,
              value: domain,
              defaultValue: 'all',
              onChange: setDomain,
            },
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

      <section className="dashboard-content-surface mt-4 overflow-hidden rounded-[1.5rem]">
        {visibleEntities.length > 0 ? (
          <ul aria-label={t('settings.entities.listAria')}>
            {visibleEntities.map((entry) => (
              <EntityRow key={entry.id} entry={entry} />
            ))}
          </ul>
        ) : (
          <div className="flex min-h-48 flex-col items-center justify-center px-6 text-center">
            <Search size={22} className="text-[color:var(--ui-text-tertiary)]" />
            <h3 className="mt-3 text-sm font-semibold">{t('settings.entities.empty')}</h3>
            <p className="mt-1 text-xs text-[color:var(--ui-text-secondary)]">
              {t('settings.filters.tryDifferent')}
            </p>
          </div>
        )}
      </section>

      {visibleCount < filteredEntities.length ? (
        <button
          type="button"
          onClick={() => setVisibleCount((current) => current + PAGE_SIZE)}
          className="liquid-glass-selection mx-auto mt-4 flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold"
        >
          {t('settings.entities.showMore', { count: Math.min(PAGE_SIZE, filteredEntities.length - visibleCount) })}
        </button>
      ) : null}
    </div>
  );
}

export default SettingsEntitiesList;
