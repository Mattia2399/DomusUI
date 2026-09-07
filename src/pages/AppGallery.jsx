import React from 'react';
import { motion } from 'framer-motion';
import GlassToggle from '../components/ui/GlassToggle';
import GlassSlider from '../components/ui/GlassSlider';
import GlassModal from '../components/ui/GlassModal';
import AppWorkspaceShell from '../components/apps/AppWorkspaceShell';
import ComingSoonAppDemo from '../components/apps/ComingSoonAppDemo';
import {
  IrrigationHero,
  IrrigationConsumptionSnapshotCard,
  IrrigationMobileOverview,
  IrrigationMoistureCard,
  IrrigationScheduleSnapshotCard,
  IrrigationZoneCard,
  IrrigationZonesSnapshotCard,
} from '../components/apps/irrigation/IrrigationDashboardCards';
import IrrigationConfigurationPage from '../components/apps/irrigation/IrrigationConfigurationPage';
import IrrigationCalendarPage from '../components/apps/irrigation/IrrigationCalendarPage';
import IrrigationConsumptionPage from '../components/apps/irrigation/IrrigationConsumptionPage';
import IrrigationZonesManagementPage from '../components/apps/irrigation/IrrigationZonesManagementPage';
import {
  buildIrrigationConsumptionSeries,
  irrigationConsumptionPeriodDays,
  irrigationConsumptionPeriodStart,
  waterUnitMultiplier,
} from '../components/apps/irrigation/irrigationConsumptionModel';
import {
  IRRIGATION_ABSOLUTE_MAX_DURATION_MIN,
  IRRIGATION_MINIMUM_MAX_DURATION_MIN,
  formatIrrigationEntityStateLabel,
  validateIrrigationConfiguration,
} from '../components/apps/irrigation/irrigationConfigurationModel';
import {
  createHaAppConfigurationsRepository,
  IRRIGATION_CONFIGURATION_CACHE_KEY,
} from '../services/haAppConfigurationsRepository';
import { loadHassAuthTokensFromStorage, normalizeHassUrl } from '../services/haLive';
import { useI18n } from '../i18n/I18nProvider';
import {
  ChevronRight,
  CalendarDays,
  Clock3,
  CloudRain,
  Cpu,
  Droplets,
  Flower2,
  Gauge,
  Leaf,
  LeafyGreen,
  LayoutDashboard,
  MapPinned,
  Minus,
  Play,
  Plus,
  Square,
  Sprout,
  Settings2,
  TreePine,
  Trees,
  Waves,
  X,
} from 'lucide-react';

const svgDataUri = (svg) => `data:image/svg+xml;utf8,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`;

const buildPortalBackdropStyle = (svg, tint) => ({
  backgroundImage: `${tint}, url("${svgDataUri(svg)}")`,
  backgroundPosition: 'center',
  backgroundSize: 'cover',
});

const SYSTEM_PORTALS = [
  {
    id: 'technical-room',
    title: 'Locale Tecnico',
    description: 'Pompe di calore, inverter fotovoltaico, stato rete e UPS.',
    route: '/appgallery/technical',
    icon: Cpu,
    iconWrapClass: 'bg-sky-400/20 text-sky-200',
    glowClass: 'from-sky-400/30 via-blue-400/10 to-transparent',
    borderHoverClass: 'group-hover:border-sky-300/35',
    backdropStyle: buildPortalBackdropStyle(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675">
        <defs>
          <linearGradient id="techPanel" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stop-color="#7dd3fc" stop-opacity=".24"/>
            <stop offset=".58" stop-color="#38bdf8" stop-opacity=".1"/>
            <stop offset="1" stop-color="#0f172a" stop-opacity=".04"/>
          </linearGradient>
        </defs>
        <g fill="none" stroke="#bae6fd" stroke-linecap="round" stroke-linejoin="round">
          <path d="M94 470h270l58-72h165l52 72h438" stroke-opacity=".2" stroke-width="8"/>
          <path d="M142 146h318v178H142z" fill="url(#techPanel)" stroke-opacity=".24" stroke-width="3"/>
          <path d="M180 188h242M180 230h242M180 272h242M224 146v178M304 146v178M384 146v178" stroke-opacity=".15" stroke-width="3"/>
          <path d="M566 126h284v214H566zM616 176h84M616 224h184M616 272h142" stroke-opacity=".22" stroke-width="5"/>
          <circle cx="952" cy="210" r="78" stroke-opacity=".22" stroke-width="6"/>
          <path d="M952 210l42-42M912 250l-48 62H764M952 288v78M1010 270l76 52" stroke-opacity=".18" stroke-width="6"/>
          <path d="M688 438h284M734 392v92M810 392v92M886 392v92M962 392v92" stroke-opacity=".16" stroke-width="5"/>
          <path d="M104 544c154-48 304-48 450 0s302 48 468-2" stroke-opacity=".12" stroke-width="10"/>
        </g>
      </svg>`,
      'radial-gradient(90% 80% at 70% 20%, rgba(125,211,252,0.18), transparent 60%), linear-gradient(135deg, rgba(14,165,233,0.14), rgba(2,6,23,0.04) 68%)',
    ),
  },
  {
    id: 'smart-irrigation',
    title: 'Irrigazione Smart',
    description: 'Gestione valvole, programmazione cicli e previsioni meteo.',
    route: '/appgallery/irrigation',
    icon: Sprout,
    iconWrapClass: 'bg-emerald-400/20 text-emerald-200',
    glowClass: 'from-emerald-400/30 via-cyan-400/10 to-transparent',
    borderHoverClass: 'group-hover:border-emerald-300/35',
    backdropStyle: buildPortalBackdropStyle(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675">
        <g fill="none" stroke-linecap="round" stroke-linejoin="round">
          <path d="M58 514c168-92 342-116 522-70s366 20 562-78" stroke="#bbf7d0" stroke-opacity=".2" stroke-width="9"/>
          <path d="M74 586c162-88 326-108 494-58s346 30 568-86" stroke="#67e8f9" stroke-opacity=".13" stroke-width="8"/>
          <path d="M194 454c54-136 148-204 282-204 98 0 174 34 228 102" stroke="#86efac" stroke-opacity=".18" stroke-width="6"/>
          <path d="M370 380c-46-70-116-114-210-132 10 96 70 158 180 186" fill="#22c55e" fill-opacity=".1" stroke="#bbf7d0" stroke-opacity=".22" stroke-width="5"/>
          <path d="M474 372c26-98 96-174 210-228 20 118-28 202-144 254" fill="#34d399" fill-opacity=".1" stroke="#a7f3d0" stroke-opacity=".23" stroke-width="5"/>
          <path d="M724 476V326h232v150" stroke="#a7f3d0" stroke-opacity=".18" stroke-width="6"/>
          <path d="M770 360h140M770 402h140M770 444h140M816 326v150M864 326v150" stroke="#bbf7d0" stroke-opacity=".13" stroke-width="4"/>
          <path d="M972 252c0 48-34 78-76 78s-76-30-76-78c0-38 48-92 76-130 28 38 76 92 76 130Z" fill="#22d3ee" fill-opacity=".08" stroke="#67e8f9" stroke-opacity=".2" stroke-width="5"/>
          <path d="M1040 392c58 20 92 58 104 112M1078 390c-4 54-36 94-94 120" stroke="#bbf7d0" stroke-opacity=".16" stroke-width="6"/>
        </g>
      </svg>`,
      'radial-gradient(85% 90% at 25% 20%, rgba(74,222,128,0.18), transparent 58%), linear-gradient(135deg, rgba(16,185,129,0.14), rgba(8,145,178,0.06) 58%, rgba(2,6,23,0.05))',
    ),
  },
  {
    id: 'pool-spa',
    title: 'Piscina & Spa',
    description: 'Filtrazione, riscaldamento acqua e illuminazione subacquea.',
    route: '/appgallery/pool',
    icon: Waves,
    iconWrapClass: 'bg-cyan-400/20 text-cyan-200',
    glowClass: 'from-cyan-400/30 via-sky-400/10 to-transparent',
    borderHoverClass: 'group-hover:border-cyan-300/35',
    backdropStyle: buildPortalBackdropStyle(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675">
        <defs>
          <radialGradient id="spaGlow" cx=".7" cy=".35" r=".55">
            <stop offset="0" stop-color="#67e8f9" stop-opacity=".22"/>
            <stop offset=".62" stop-color="#38bdf8" stop-opacity=".07"/>
            <stop offset="1" stop-color="#020617" stop-opacity=".02"/>
          </radialGradient>
        </defs>
        <rect x="608" y="120" width="368" height="368" rx="184" fill="url(#spaGlow)" stroke="#a5f3fc" stroke-opacity=".16" stroke-width="6"/>
        <g fill="none" stroke="#a5f3fc" stroke-linecap="round">
          <path d="M92 210c94 46 188 46 282 0s188-46 282 0 188 46 282 0 188-46 282 0" stroke-opacity=".22" stroke-width="8"/>
          <path d="M60 304c96 42 194 42 292 0s196-42 294 0 196 42 294 0 196-42 294 0" stroke-opacity=".18" stroke-width="7"/>
          <path d="M92 398c94 46 188 46 282 0s188-46 282 0 188 46 282 0 188-46 282 0" stroke-opacity=".16" stroke-width="8"/>
          <path d="M128 520h912M168 570h820M218 476v128M316 476v128M414 476v128M512 476v128M610 476v128M708 476v128M806 476v128M904 476v128" stroke-opacity=".1" stroke-width="4"/>
          <circle cx="792" cy="304" r="92" stroke-opacity=".18" stroke-width="7"/>
          <circle cx="792" cy="304" r="48" stroke-opacity=".14" stroke-width="5"/>
          <path d="M1012 154c32 34 32 76 0 126M1060 138c48 54 48 122 0 204" stroke-opacity=".16" stroke-width="6"/>
        </g>
      </svg>`,
      'radial-gradient(88% 88% at 72% 24%, rgba(103,232,249,0.18), transparent 58%), linear-gradient(135deg, rgba(6,182,212,0.15), rgba(59,130,246,0.06) 58%, rgba(2,6,23,0.05))',
    ),
  },
];

const IRRIGATION_WORKSPACE_NAVIGATION = [
  { id: 'overview', label: 'Panoramica', icon: LayoutDashboard },
  { id: 'zones', label: 'Zone', icon: Sprout },
  { id: 'calendar', label: 'Calendario', icon: CalendarDays },
  { id: 'usage', label: 'Consumi', icon: Gauge },
  { id: 'configuration', label: 'Impostazioni', icon: Settings2, placement: 'footer', mobileHidden: true },
];

const IRRIGATION_SECTION_ROUTES = {
  overview: '/appgallery/irrigation',
  zones: '/appgallery/irrigation/zones',
  zonesManagement: '/appgallery/irrigation/zones/manage',
  calendar: '/appgallery/irrigation/calendar',
  usage: '/appgallery/irrigation/consumption',
  configuration: '/appgallery/irrigation/settings',
};

const IRRIGATION_DEMO_ZONE_NAME_KEYS = {
  'north-lawn': 'irrigation.demoZone.north-lawn',
  'entry-flowerbeds': 'irrigation.demoZone.entry-flowerbeds',
  'smart-garden': 'irrigation.demoZone.smart-garden',
  'perimeter-hedge': 'irrigation.demoZone.perimeter-hedge',
};

const COMING_SOON_WORKSPACE_NAVIGATION = [
  { id: 'overview', label: 'Panoramica', icon: LayoutDashboard },
];

const IRRIGATION_ZONE_ICON_OPTIONS = [
  { key: 'sprout', label: 'Germoglio', icon: Sprout },
  { key: 'leaf', label: 'Foglia', icon: Leaf },
  { key: 'leafy-green', label: 'Fogliame', icon: LeafyGreen },
  { key: 'flower-2', label: 'Fiore', icon: Flower2 },
  { key: 'tree-pine', label: 'Pino', icon: TreePine },
  { key: 'trees', label: 'Alberi', icon: Trees },
];

const IRRIGATION_ZONE_ICON_COMPONENTS = {
  ...Object.fromEntries(IRRIGATION_ZONE_ICON_OPTIONS.map((option) => [option.key, option.icon])),
  droplets: Droplets,
  rain: CloudRain,
  waves: Waves,
};

const IRRIGATION_ZONE_STATUS_VALUES = new Set(['active', 'idle', 'scheduled', 'alert']);
const DEFAULT_NEW_ZONE_ICON_KEY = 'sprout';

const DEFAULT_IRRIGATION_ZONES = [
  {
    id: 'north-lawn',
    name: 'Prato Nord',
    detail: 'In corso (5m / 15m)',
    progress: 33,
    status: 'active',
    enabled: true,
    iconKey: 'tree-pine',
    entityId: 'switch.irrigation_north_lawn',
    manualDurationMin: 15,
    days: ['mon', 'wed', 'fri'],
    startTimes: ['05:30'],
    baseDuration: 15,
  },
  {
    id: 'entry-flowerbeds',
    name: 'Aiuole Ingresso',
    detail: 'Ultima attivazione: 2 ore fa',
    status: 'idle',
    enabled: false,
    iconKey: 'flower-2',
    entityId: 'switch.irrigation_entry_beds',
    manualDurationMin: 10,
    days: ['tue', 'thu', 'sat'],
    startTimes: ['06:00'],
    baseDuration: 10,
  },
  {
    id: 'smart-garden',
    name: 'Orto Smart',
    detail: 'Prossimo ciclo: Domani 05:30',
    status: 'scheduled',
    enabled: false,
    iconKey: 'sprout',
    entityId: 'switch.irrigation_smart_garden',
    manualDurationMin: 12,
    days: ['mon', 'thu', 'sun'],
    startTimes: ['05:45'],
    baseDuration: 12,
  },
  {
    id: 'perimeter-hedge',
    name: 'Siepe Perimetrale',
    detail: 'Anomalia pressione rilevata',
    status: 'alert',
    enabled: false,
    iconKey: 'trees',
    entityId: 'switch.irrigation_perimeter_hedge',
    manualDurationMin: 8,
    days: ['tue', 'fri'],
    startTimes: ['06:15'],
    baseDuration: 8,
  },
];

const WATER_USAGE_BARS = [52, 74, 63, 100, 47, 65, 32];
const IRRIGATION_CONSUMPTION_CACHE_TTL_MS = 5 * 60 * 1000;
const IRRIGATION_WEEKDAY_TOKENS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const IRRIGATION_WEEKDAY_LABELS = {
  mon: 'L',
  tue: 'M',
  wed: 'M',
  thu: 'G',
  fri: 'V',
  sat: 'S',
  sun: 'D',
};
const IRRIGATION_WEEKDAY_SHORT_NAMES = {
  mon: 'Lun',
  tue: 'Mar',
  wed: 'Mer',
  thu: 'Gio',
  fri: 'Ven',
  sat: 'Sab',
  sun: 'Dom',
};
const IRRIGATION_JS_DAY_TO_TOKEN = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const IRRIGATION_JS_DAY_TO_SHORT = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
const DEFAULT_ZONE_DAYS = ['mon', 'wed', 'fri'];
const DEFAULT_ZONE_START_TIMES = ['05:30'];
const DEFAULT_ZONE_BASE_DURATION = 10;

const DEFAULT_IRRIGATION_CONFIG = {
  rainSensorEnabled: true,
  blockOnRainSensorUnavailable: true,
  maximumManualDurationMin: 30,
  rainSensorEntityId: 'binary_sensor.rain_sensor',
  weatherEntityId: '',
  humidityEntityId: 'sensor.outdoor_humidity',
  outdoorTempEntityId: 'sensor.outdoor_temperature',
  soilMoistureEntityId: 'sensor.soil_moisture',
  waterUsageEntityId: 'sensor.irrigation_water_usage_l',
  waterAverageEntityId: 'sensor.irrigation_water_average_l',
  zones: DEFAULT_IRRIGATION_ZONES.map((zone) => ({ ...zone })),
};

async function readHaErrorResponse(response) {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (payload && typeof payload === 'object') {
    if (typeof payload.message === 'string' && payload.message.trim()) {
      return payload.message.trim();
    }
    if (typeof payload.error === 'string' && payload.error.trim()) {
      return payload.error.trim();
    }
  }

  return `HTTP ${response.status}`;
}

function toErrorMessage(error, fallback) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return fallback;
}

async function resolveHaApiContext(haUrl, haToken) {
  const directUrl = normalizeHassUrl(haUrl ?? '');
  const directToken = typeof haToken === 'string' ? haToken.trim() : '';
  const storedTokens = directToken ? undefined : await loadHassAuthTokensFromStorage();
  const oauthUrl = normalizeHassUrl(storedTokens?.hassUrl ?? '');
  const oauthToken =
    typeof storedTokens?.access_token === 'string' ? storedTokens.access_token.trim() : '';
  const baseUrl = directUrl || oauthUrl;
  const token = directToken || oauthToken;

  if (!baseUrl) {
    throw new Error('URL Home Assistant mancante. Apri Impostazioni e completa la configurazione.');
  }
  if (!token) {
    throw new Error('Token Home Assistant mancante. Inserisci token o riconnetti OAuth.');
  }
  return { baseUrl, token };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeEntityId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeZoneName(value, fallback) {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed || fallback;
}

function sanitizeZoneId(value, fallback) {
  const source = typeof value === 'string' ? value.trim().toLowerCase() : '';
  const sanitized = source
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return sanitized || fallback;
}

function buildUniqueZoneId(existingZones, candidateId) {
  const usedIds = new Set(existingZones.map((zone) => zone.id));
  const baseId = sanitizeZoneId(candidateId, `zona-${existingZones.length + 1}`);
  if (!usedIds.has(baseId)) {
    return baseId;
  }

  let suffix = 2;
  while (usedIds.has(`${baseId}-${suffix}`)) {
    suffix += 1;
  }
  return `${baseId}-${suffix}`;
}

function cloneZoneList(zones) {
  return zones.map((zone) => ({ ...zone }));
}

function cloneDefaultIrrigationZones() {
  return cloneZoneList(DEFAULT_IRRIGATION_ZONES);
}

function normalizeIrrigationZone(rawZone, index, fallbackZone = DEFAULT_IRRIGATION_ZONES[index]) {
  const source = rawZone && typeof rawZone === 'object' ? rawZone : {};
  const fallback = fallbackZone ?? {
    id: `zona-${index + 1}`,
    name: `Zona ${index + 1}`,
    detail: 'Nessun ciclo programmato',
    progress: 0,
    status: 'idle',
    enabled: false,
    iconKey: DEFAULT_NEW_ZONE_ICON_KEY,
    entityId: '',
    soilMoistureEntityId: '',
    manualDurationMin: 10,
    days: [...DEFAULT_ZONE_DAYS],
    startTimes: [...DEFAULT_ZONE_START_TIMES],
    baseDuration: DEFAULT_ZONE_BASE_DURATION,
  };

  const statusSource = typeof source.status === 'string' ? source.status.trim().toLowerCase() : '';
  const iconSource = typeof source.iconKey === 'string' ? source.iconKey.trim().toLowerCase() : '';
  const progressSource =
    toNumberOrUndefined(source.progress) ??
    toNumberOrUndefined(source.rawProgress) ??
    toNumberOrUndefined(source.defaultProgress);
  const manualDurationSource =
    toNumberOrUndefined(source.manualDurationMin) ??
    toNumberOrUndefined(source.manual_duration_min) ??
    toNumberOrUndefined(source.manualDuration);
  const baseDurationSource =
    toNumberOrUndefined(source.baseDuration) ??
    toNumberOrUndefined(source.base_duration) ??
    toNumberOrUndefined(source.duration);

  return {
    id: sanitizeZoneId(source.id, fallback.id),
    name: normalizeZoneName(source.name, fallback.name),
    detail: normalizeZoneName(source.detail, fallback.detail),
    progress: clamp(Math.round(progressSource ?? fallback.progress ?? 0), 0, 100),
    status: IRRIGATION_ZONE_STATUS_VALUES.has(statusSource) ? statusSource : fallback.status,
    enabled: typeof source.enabled === 'boolean' ? source.enabled : Boolean(fallback.enabled),
    iconKey: IRRIGATION_ZONE_ICON_COMPONENTS[iconSource] ? iconSource : fallback.iconKey,
    entityId: normalizeEntityId(source.entityId ?? source.entity_id ?? source.zoneEntity ?? fallback.entityId),
    soilMoistureEntityId: normalizeEntityId(
      source.soilMoistureEntityId ?? source.soil_moisture_entity_id ?? fallback.soilMoistureEntityId,
    ),
    manualDurationMin: clamp(
      Math.round(manualDurationSource ?? fallback.manualDurationMin ?? 10),
      1,
      IRRIGATION_ABSOLUTE_MAX_DURATION_MIN,
    ),
    days: normalizeWeekdays(source.days ?? source.selectedDays, fallback.days ?? DEFAULT_ZONE_DAYS),
    startTimes: normalizeStartTimes(
      source.startTimes ?? source.start_times ?? source.scheduleTimes,
      fallback.startTimes ?? DEFAULT_ZONE_START_TIMES,
    ),
    baseDuration: clamp(
      Math.round(baseDurationSource ?? fallback.baseDuration ?? fallback.manualDurationMin ?? DEFAULT_ZONE_BASE_DURATION),
      1,
      IRRIGATION_ABSOLUTE_MAX_DURATION_MIN,
    ),
  };
}

function cloneDefaultIrrigationConfig() {
  return {
    ...DEFAULT_IRRIGATION_CONFIG,
    zones: cloneDefaultIrrigationZones(),
  };
}

function normalizeIrrigationConfig(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const legacyZoneSource = Array.isArray(source.zoneEntityIds) ? source.zoneEntityIds : [];
  const zonesSource = Array.isArray(source.zones) ? source.zones : [];
  const migratedLegacyZones = legacyZoneSource.length
    ? DEFAULT_IRRIGATION_ZONES.map((zone, index) => ({
        ...zone,
        entityId: normalizeEntityId(legacyZoneSource[index] ?? zone.entityId),
      }))
    : [];
  const normalizedZonesSource = zonesSource.length ? zonesSource : migratedLegacyZones;
  const normalizedZones = (normalizedZonesSource.length ? normalizedZonesSource : DEFAULT_IRRIGATION_ZONES).map(
    (zone, index) => normalizeIrrigationZone(zone, index),
  );

  const usedIds = new Set();
  const zones = normalizedZones.map((zone, index) => {
    let nextId = sanitizeZoneId(zone.id, `zona-${index + 1}`);
    let suffix = 2;
    while (usedIds.has(nextId)) {
      nextId = `${sanitizeZoneId(zone.id, 'zona')}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(nextId);
    return {
      ...zone,
      id: nextId,
    };
  });

  return {
    rainSensorEnabled:
      typeof source.rainSensorEnabled === 'boolean'
        ? source.rainSensorEnabled
        : typeof source.rainBypass === 'boolean'
          ? !source.rainBypass
          : DEFAULT_IRRIGATION_CONFIG.rainSensorEnabled,
    blockOnRainSensorUnavailable:
      typeof source.blockOnRainSensorUnavailable === 'boolean'
        ? source.blockOnRainSensorUnavailable
        : DEFAULT_IRRIGATION_CONFIG.blockOnRainSensorUnavailable,
    maximumManualDurationMin: clamp(
      Math.round(
        toNumberOrUndefined(source.maximumManualDurationMin) ??
        toNumberOrUndefined(source.maxManualDurationMin) ??
        DEFAULT_IRRIGATION_CONFIG.maximumManualDurationMin,
      ),
      IRRIGATION_MINIMUM_MAX_DURATION_MIN,
      IRRIGATION_ABSOLUTE_MAX_DURATION_MIN,
    ),
    rainSensorEntityId: normalizeEntityId(
      source.rainSensorEntityId ?? source.globalRainSensor ?? DEFAULT_IRRIGATION_CONFIG.rainSensorEntityId,
    ),
    weatherEntityId: normalizeEntityId(
      source.weatherEntityId ?? source.globalWeatherEntity ?? DEFAULT_IRRIGATION_CONFIG.weatherEntityId,
    ),
    humidityEntityId: normalizeEntityId(
      source.humidityEntityId ?? source.globalHumiditySensor ?? DEFAULT_IRRIGATION_CONFIG.humidityEntityId,
    ),
    outdoorTempEntityId: normalizeEntityId(
      source.outdoorTempEntityId ?? source.globalTempSensor ?? DEFAULT_IRRIGATION_CONFIG.outdoorTempEntityId,
    ),
    soilMoistureEntityId: normalizeEntityId(
      source.soilMoistureEntityId ?? source.soilMoistureSensor ?? DEFAULT_IRRIGATION_CONFIG.soilMoistureEntityId,
    ),
    waterUsageEntityId: normalizeEntityId(
      source.waterUsageEntityId ?? source.waterConsumptionSensor ?? DEFAULT_IRRIGATION_CONFIG.waterUsageEntityId,
    ),
    waterAverageEntityId: normalizeEntityId(source.waterAverageEntityId ?? DEFAULT_IRRIGATION_CONFIG.waterAverageEntityId),
    zones,
  };
}

function readStoredIrrigationConfig() {
  if (typeof window === 'undefined') {
    return cloneDefaultIrrigationConfig();
  }
  const raw = window.localStorage.getItem(IRRIGATION_CONFIGURATION_CACHE_KEY);
  if (!raw) {
    return cloneDefaultIrrigationConfig();
  }
  try {
    return normalizeIrrigationConfig(JSON.parse(raw));
  } catch {
    return cloneDefaultIrrigationConfig();
  }
}

function toNumberOrUndefined(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().replace(',', '.');
    if (!normalized) {
      return undefined;
    }
    const parsed = Number.parseFloat(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function isEntityOnState(state) {
  const normalized = `${state ?? ''}`.trim().toLowerCase();
  return ['on', 'open', 'running', 'active', 'true', 'wet', 'detected'].includes(normalized);
}

function isEntityUnavailableState(state) {
  const normalized = `${state ?? ''}`.trim().toLowerCase();
  return normalized === 'unavailable' || normalized === 'unknown' || normalized === '';
}

function formatEntityName(entityId) {
  const source = (entityId.split('.').pop() ?? entityId).replace(/_/g, ' ').trim();
  if (!source) {
    return 'Entita';
  }
  return source.charAt(0).toUpperCase() + source.slice(1);
}

function resolveEntityDisplayName(entityId, entity, fallback) {
  const friendlyName =
    typeof entity?.rawAttributes?.friendly_name === 'string' ? entity.rawAttributes.friendly_name.trim() : '';
  if (friendlyName) {
    return friendlyName;
  }
  if (entityId) {
    return formatEntityName(entityId);
  }
  return fallback;
}

function resolveNumericEntityValue(states, entityId, fallback) {
  const normalizedId = normalizeEntityId(entityId);
  if (!normalizedId) {
    return fallback;
  }
  const entity = states?.[normalizedId];
  if (!entity) {
    return fallback;
  }
  return (
    toNumberOrUndefined(entity.numericValue) ??
    toNumberOrUndefined(entity.currentValue) ??
    toNumberOrUndefined(entity.targetValue) ??
    toNumberOrUndefined(entity.state) ??
    fallback
  );
}

function resolveBooleanEntityValue(states, entityId, fallback = false) {
  const normalizedId = normalizeEntityId(entityId);
  if (!normalizedId) {
    return fallback;
  }
  const entity = states?.[normalizedId];
  if (!entity) {
    return fallback;
  }
  return isEntityOnState(entity.state);
}

function formatSelectOptionLabel(entityId, states) {
  const entity = states?.[entityId];
  if (!entity) {
    return entityId;
  }
  const friendlyName =
    typeof entity.rawAttributes?.friendly_name === 'string' ? entity.rawAttributes.friendly_name.trim() : '';
  return friendlyName ? `${friendlyName} (${entityId})` : entityId;
}

function buildEntityOptions(options, currentValue) {
  const normalizedCurrent = normalizeEntityId(currentValue);
  if (!normalizedCurrent) {
    return [...options];
  }
  if (options.includes(normalizedCurrent)) {
    return [...options];
  }
  return [normalizedCurrent, ...options];
}

function isValidTimeToken(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):([0-5]\d)$/.test(value.trim());
}

function normalizeWeekdays(days, fallback = DEFAULT_ZONE_DAYS) {
  const source = Array.isArray(days) ? days : [];
  const normalized = source
    .map((day) => `${day ?? ''}`.trim().toLowerCase())
    .filter((day) => IRRIGATION_WEEKDAY_TOKENS.includes(day));
  const unique = Array.from(new Set(normalized));
  if (unique.length > 0) {
    return unique;
  }
  return [...fallback];
}

function normalizeStartTimes(startTimes, fallback = DEFAULT_ZONE_START_TIMES) {
  const source = Array.isArray(startTimes) ? startTimes : [];
  const normalized = source
    .map((time) => `${time ?? ''}`.trim())
    .filter((time) => isValidTimeToken(time));
  const unique = Array.from(new Set(normalized));
  if (unique.length > 0) {
    return unique;
  }
  return [...fallback];
}

function formatForecastDayLabel(datetime, nowDate = new Date()) {
  if (typeof datetime !== 'string' || !datetime.trim()) {
    return 'oggi';
  }
  const candidateDate = new Date(datetime);
  if (Number.isNaN(candidateDate.getTime())) {
    return 'oggi';
  }

  const startOfToday = new Date(nowDate);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfCandidate = new Date(candidateDate);
  startOfCandidate.setHours(0, 0, 0, 0);
  const daysDistance = Math.round((startOfCandidate.getTime() - startOfToday.getTime()) / 86400000);

  if (daysDistance <= 0) {
    return 'oggi';
  }
  if (daysDistance === 1) {
    return 'domani';
  }
  return IRRIGATION_JS_DAY_TO_SHORT[candidateDate.getDay()] ?? 'prossimi giorni';
}

function resolveRainForecastInfo(weatherEntity) {
  if (!weatherEntity || typeof weatherEntity !== 'object') {
    return null;
  }

  const forecastEntries = Array.isArray(weatherEntity.forecast)
    ? weatherEntity.forecast
    : Array.isArray(weatherEntity?.rawAttributes?.forecast)
      ? weatherEntity.rawAttributes.forecast
      : [];
  const entryWithProbability = forecastEntries.find((entry) => {
    const probability = toNumberOrUndefined(entry?.precipitationProbability ?? entry?.precipitation_probability);
    return probability !== undefined;
  });
  const fallbackEntry = forecastEntries.find((entry) => {
    const precipitation = toNumberOrUndefined(entry?.precipitation);
    return precipitation !== undefined;
  });

  const resolvedValue =
    toNumberOrUndefined(entryWithProbability?.precipitationProbability ?? entryWithProbability?.precipitation_probability) ??
    toNumberOrUndefined(weatherEntity?.rawAttributes?.precipitation_probability) ??
    toNumberOrUndefined(fallbackEntry?.precipitation);

  if (resolvedValue === undefined) {
    return null;
  }

  const dayLabel = formatForecastDayLabel(entryWithProbability?.datetime ?? fallbackEntry?.datetime);
  return {
    probability: clamp(Math.round(resolvedValue), 0, 100),
    dayLabel,
  };
}

function findNextIrrigationSlot(days, startTimes, nowDate = new Date()) {
  const normalizedDays = normalizeWeekdays(days, []);
  const normalizedTimes = normalizeStartTimes(startTimes, []);

  if (normalizedDays.length === 0 || normalizedTimes.length === 0) {
    return null;
  }

  const sortedTimes = [...normalizedTimes].sort((first, second) => first.localeCompare(second));

  for (let offset = 0; offset <= 13; offset += 1) {
    const baseDate = new Date(nowDate);
    baseDate.setHours(0, 0, 0, 0);
    baseDate.setDate(baseDate.getDate() + offset);
    const dayToken = IRRIGATION_JS_DAY_TO_TOKEN[baseDate.getDay()];

    if (!normalizedDays.includes(dayToken)) {
      continue;
    }

    for (const timeToken of sortedTimes) {
      if (!isValidTimeToken(timeToken)) {
        continue;
      }
      const [hoursText, minutesText] = timeToken.split(':');
      const hours = Number.parseInt(hoursText, 10);
      const minutes = Number.parseInt(minutesText, 10);
      const candidateDate = new Date(baseDate);
      candidateDate.setHours(hours, minutes, 0, 0);
      if (candidateDate > nowDate) {
        return {
          date: candidateDate,
          dayToken,
          timeToken,
        };
      }
    }
  }

  return null;
}

function formatNextIrrigationLabel(days, startTimes, nowDate = new Date(), locale = 'it') {
  const nextSlot = findNextIrrigationSlot(days, startTimes, nowDate);
  if (!nextSlot) {
    return ({ it: 'non programmata', en: 'not scheduled', fr: 'non programmée' })[locale] ?? 'not scheduled';
  }

  const startOfToday = new Date(nowDate);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfSlotDay = new Date(nextSlot.date);
  startOfSlotDay.setHours(0, 0, 0, 0);
  const daysDistance = Math.round((startOfSlotDay.getTime() - startOfToday.getTime()) / 86400000);

  if (daysDistance === 0) {
    return `${new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(0, 'day')} ${nextSlot.timeToken}`;
  }
  if (daysDistance === 1) {
    return `${new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(1, 'day')} ${nextSlot.timeToken}`;
  }
  return `${new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(nextSlot.date)} ${nextSlot.timeToken}`;
}

function buildZoneConfigFromZone(zone, index) {
  return {
    id: zone?.id ?? `zone_${index + 1}`,
    name: normalizeZoneName(zone?.name, `Zona ${index + 1}`),
    entityId: normalizeEntityId(zone?.entityId),
    enabled: typeof zone?.enabled === 'boolean' ? zone.enabled : true,
    days: normalizeWeekdays(zone?.days, DEFAULT_ZONE_DAYS),
    startTimes: normalizeStartTimes(zone?.startTimes, DEFAULT_ZONE_START_TIMES),
    baseDuration: clamp(
      Math.round(toNumberOrUndefined(zone?.baseDuration) ?? toNumberOrUndefined(zone?.manualDurationMin) ?? DEFAULT_ZONE_BASE_DURATION),
      1,
      IRRIGATION_ABSOLUTE_MAX_DURATION_MIN,
    ),
  };
}

function buildIrrigationState(irrigationConfig) {
  const zones = Array.isArray(irrigationConfig?.zones) ? irrigationConfig.zones : [];
  return {
    rainSensorEnabled: irrigationConfig?.rainSensorEnabled !== false,
    globalRainSensor: normalizeEntityId(irrigationConfig?.rainSensorEntityId),
    globalWeatherEntity: normalizeEntityId(irrigationConfig?.weatherEntityId),
    globalHumiditySensor: normalizeEntityId(irrigationConfig?.humidityEntityId),
    globalTempSensor: normalizeEntityId(irrigationConfig?.outdoorTempEntityId),
    soilMoistureSensor: normalizeEntityId(irrigationConfig?.soilMoistureEntityId),
    waterConsumptionSensor: normalizeEntityId(irrigationConfig?.waterUsageEntityId),
    zones: zones.map((zone) => ({
      id: zone.id,
      zoneEntity: normalizeEntityId(zone.entityId),
    })),
    zoneEntityById: Object.fromEntries(
      zones.map((zone) => [zone.id, normalizeEntityId(zone.entityId)]),
    ),
  };
}

function buildIrrigationConditionTemplate(irrigationState) {
  const conditions = [];

  if (irrigationState.rainSensorEnabled && irrigationState.globalRainSensor) {
    conditions.push(`is_state('${irrigationState.globalRainSensor}', 'off')`);
  }
  if (irrigationState.soilMoistureSensor) {
    conditions.push(`states('${irrigationState.soilMoistureSensor}') | float(0) < 60`);
  }
  if (irrigationState.globalHumiditySensor) {
    conditions.push(`states('${irrigationState.globalHumiditySensor}') | float(0) < 85`);
  }
  if (irrigationState.globalTempSensor) {
    conditions.push(`states('${irrigationState.globalTempSensor}') | float(0) > 3`);
  }

  if (conditions.length === 0) {
    return '{{ true }}';
  }
  return `{{ ${conditions.join(' and ')} }}`;
}

function resolveZoneTurnService(entityId, shouldTurnOn) {
  const domain = normalizeEntityId(entityId).split('.')[0];
  if (domain === 'switch' || domain === 'input_boolean') {
    return `${domain}.${shouldTurnOn ? 'turn_on' : 'turn_off'}`;
  }
  if (domain === 'valve') {
    return `valve.${shouldTurnOn ? 'open_valve' : 'close_valve'}`;
  }
  return `homeassistant.${shouldTurnOn ? 'turn_on' : 'turn_off'}`;
}

const generateZoneAutomation = (zoneConfig, irrigationState) => {
  const zoneEntityId = normalizeEntityId(zoneConfig.entityId) || irrigationState.zoneEntityById[zoneConfig.id] || '';
  const startService = resolveZoneTurnService(zoneEntityId, true);
  const stopService = resolveZoneTurnService(zoneEntityId, false);

  return {
    id: `irrigation_${zoneConfig.id}`,
    alias: `Irrigazione Smart: ${zoneConfig.name}`,
    description: 'Generata da Dashboard Lumina',
    mode: 'single',
    trigger: zoneConfig.startTimes.map((time) => ({ platform: 'time', at: time })),
    condition: [
      { condition: 'time', weekday: zoneConfig.days },
      {
        alias: 'Verifica Pioggia e Umidita',
        condition: 'template',
        value_template: buildIrrigationConditionTemplate(irrigationState),
      },
    ],
    action: [
      { service: startService, target: { entity_id: zoneEntityId } },
      { delay: { minutes: zoneConfig.baseDuration } },
      { service: stopService, target: { entity_id: zoneEntityId } },
    ],
  };
};

function formatCountdownLabel(totalSeconds) {
  const clampedSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clampedSeconds / 60);
  const seconds = clampedSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.08,
    },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 18, scale: 0.985 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
  },
};

function normalizeAppGalleryViewToken(value) {
  const token = `${value ?? ''}`.trim().toLowerCase();
  if (!token || token === 'appgallery' || token === 'appgalley') {
    return 'launcher';
  }
  if (token.startsWith('irrigation')) {
    return 'irrigation';
  }
  if (token.startsWith('technical')) {
    return 'technical';
  }
  if (token.startsWith('pool')) {
    return 'pool';
  }
  return 'launcher';
}

function readViewFromPath(pathLike) {
  const segments = `${pathLike ?? ''}`
    .split('/')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  const index = segments.findIndex((entry) => entry === 'appgallery' || entry === 'appgalley');
  if (index === -1) {
    return null;
  }
  return normalizeAppGalleryViewToken(segments[index + 1] ?? 'launcher');
}

function resolveOptionalNumericEntityValue(states, entityId) {
  return resolveNumericEntityValue(states, entityId, null);
}

function getEntityAttributes(entity) {
  return entity?.rawAttributes ?? entity?.attributes ?? {};
}

function buildDemoConsumptionSeries(period) {
  const source = period === '7d'
    ? WATER_USAGE_BARS
    : period === '30d'
      ? [55, 68, 42, 76, 62, 88, 51, 70, 59, 81, 46, 65, 72, 57, 39]
      : [48, 55, 67, 74, 82, 96, 100, 91, 73, 61, 52, 46];
  const total = period === '7d' ? 1240 : period === '30d' ? 5314 : 64657;
  const weight = source.reduce((sum, value) => sum + value, 0);
  const monthNames = ['Set', 'Ott', 'Nov', 'Dic', 'Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago'];
  return source.map((value, index) => ({
    key: `demo-${period}-${index}`,
    label: period === '7d'
      ? ['Lu', 'Ma', 'Me', 'Gi', 'Ve', 'Sa', 'Do'][index]
      : period === '12m'
        ? monthNames[index]
        : `${index * 2 + 1}`,
    value: Math.round((total * value / Math.max(weight, 1)) * 10) / 10,
  }));
}

function resolveIrrigationSectionFromTarget(pathLike) {
  const fallback = 'overview';
  try {
    const parsed = new URL(pathLike || '/appgallery/irrigation', 'http://dashboard.local');
    const candidates = [parsed.pathname, parsed.hash.replace(/^#/, '')];
    for (const candidate of candidates) {
      const segments = `${candidate ?? ''}`
        .split('/')
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean);
      const irrigationIndex = segments.findIndex((entry) => entry === 'irrigation');
      if (irrigationIndex === -1) continue;
      const token = segments[irrigationIndex + 1] ?? '';
      if (!token || token === 'overview') return 'overview';
      if (token === 'zones' || token === 'zone') {
        const nestedToken = segments[irrigationIndex + 2] ?? '';
        return nestedToken === 'manage' || nestedToken === 'edit' ? 'zonesManagement' : 'zones';
      }
      if (token === 'calendar' || token === 'schedule') return 'calendar';
      if (token === 'consumption' || token === 'usage' || token === 'consumi') return 'usage';
      if (token === 'settings' || token === 'configuration' || token === 'config') return 'configuration';
    }
  } catch {
    return fallback;
  }
  return fallback;
}

function resolveIrrigationSectionFromLocation() {
  if (typeof window === 'undefined') return 'overview';
  return resolveIrrigationSectionFromTarget(window.location.href);
}

function resolveAppGalleryViewFromLocation() {
  if (typeof window === 'undefined') {
    return 'launcher';
  }

  try {
    const parsed = new URL(window.location.href);
    const fromPath = readViewFromPath(parsed.pathname);
    if (fromPath) {
      return fromPath;
    }

    const hashPath = parsed.hash.replace(/^#/, '').replace(/^\//, '');
    const fromHash = readViewFromPath(hashPath);
    if (fromHash) {
      return fromHash;
    }

    return normalizeAppGalleryViewToken(parsed.searchParams.get('view') ?? '');
  } catch {
    return 'launcher';
  }
}

function resolveAppGalleryViewFromTarget(path) {
  try {
    const parsed = new URL(path, 'http://dashboard.local');
    const fromPath = readViewFromPath(parsed.pathname);
    if (fromPath) {
      return fromPath;
    }
    const hashPath = parsed.hash.replace(/^#/, '').replace(/^\//, '');
    return readViewFromPath(hashPath) ?? normalizeAppGalleryViewToken(parsed.searchParams.get('view') ?? '');
  } catch {
    return 'launcher';
  }
}

function navigateTo(path) {
  if (typeof window === 'undefined') {
    return;
  }
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const currentRoute = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (normalized === currentRoute) {
    return;
  }

  window.history.pushState({}, '', normalized);
  window.dispatchEvent(new PopStateEvent('popstate'));
  console.log(`Navigating to ${normalized}`);
}

function PortalCard({ portal, onNavigate = navigateTo }) {
  const { t } = useI18n();
  const Icon = portal.icon;

  return (
    <motion.button
      type="button"
      variants={cardVariants}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onNavigate(portal.route)}
      className={`group relative flex aspect-video w-full flex-col justify-between overflow-hidden rounded-3xl border border-white/10 bg-[#08131f] p-6 text-left shadow-[0_22px_54px_var(--ui-shadow-soft)] backdrop-blur-3xl transition-colors duration-300 ${portal.borderHoverClass}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-35 saturate-125 transition-all duration-500 group-hover:scale-[1.035] group-hover:opacity-50"
        style={portal.backdropStyle}
      />
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br opacity-80 transition-opacity duration-300 group-hover:opacity-100 ${portal.glowClass}`}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.06),rgba(2,6,23,0.34)_78%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/10 blur-3xl opacity-45 transition-opacity duration-300 group-hover:opacity-70"
      />

      <div className="relative z-10 flex items-start justify-between gap-4">
        <span className={`inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-white/15 ${portal.iconWrapClass}`}>
          <Icon className="h-6 w-6" />
        </span>
      </div>

      <div className="relative z-10 max-w-[38ch]">
        <h3 className="text-2xl font-semibold tracking-tight text-white">{portal.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-white/60">{portal.description}</p>
      </div>

      <div className="relative z-10 ml-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/30 px-3 py-1.5 text-xs text-white/70 transition-colors duration-300 group-hover:border-white/25 group-hover:text-white">
        <span>{t('apps.gallery.open')}</span>
        <ChevronRight className="h-3.5 w-3.5" />
      </div>
    </motion.button>
  );
}

function CreateDashboardPlaceholder() {
  const { t } = useI18n();
  return (
    <motion.div
      variants={cardVariants}
      className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-3xl border border-dashed border-[color:var(--ui-border-strong)] bg-[color:var(--ui-fill-tertiary)] p-6 text-center backdrop-blur-3xl"
    >
      <div className="flex flex-col items-center gap-3">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]">
          <Plus className="h-6 w-6" />
        </span>
        <div>
          <p className="text-lg font-semibold text-[color:var(--ui-text-primary)]">{t('apps.gallery.newDashboard')}</p>
          <p className="mt-1 text-sm text-[color:var(--ui-text-tertiary)]">{t('apps.gallery.newDashboardSoon')}</p>
          <span className="mt-3 inline-flex rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-secondary)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ui-text-secondary)]">
            {t('apps.gallery.soon')}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function ZoneConfigModal({
  isOpen,
  zoneConfig,
  onClose,
  onSave,
  onToggleDay,
  onStartTimeChange,
  onAddStartTime,
  onRemoveStartTime,
  onBaseDurationChange,
}) {
  const { t } = useI18n();
  if (!zoneConfig) return null;

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      eyebrow={t('irrigation.program.eyebrow')}
      title={zoneConfig.name}
      description={t('irrigation.program.description')}
      size="lg"
      zIndex={170}
      closeLabel={t('irrigation.program.close')}
      backdropClassName="bg-black/70 backdrop-blur-sm"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/12 bg-white/[0.03] px-4 py-2 text-sm text-white/75 transition-colors hover:bg-white/[0.08] hover:text-white"
          >
            {t('irrigation.program.cancel')}
          </button>
          <button
            type="button"
            onClick={onSave}
            className="rounded-xl border border-cyan-300/40 bg-cyan-500/25 px-5 py-2 text-sm font-semibold text-cyan-50 shadow-[0_0_18px_rgba(34,211,238,0.28)] transition-colors hover:bg-cyan-500/35"
          >
            {t('irrigation.program.save')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-white/55">{t('irrigation.program.activeDays')}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {IRRIGATION_WEEKDAY_TOKENS.map((day) => {
                    const active = zoneConfig.days.includes(day);
                    return (
                      <button
                        key={`day-${zoneConfig.id}-${day}`}
                        type="button"
                        onClick={() => onToggleDay(day)}
                        className={`inline-flex h-9 min-w-[2.2rem] items-center justify-center rounded-lg border px-2 text-sm font-semibold transition-colors ${
                          active
                            ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50'
                            : 'border-white/12 bg-white/[0.03] text-white/65 hover:text-white'
                        }`}
                      >
                        {t(`irrigation.weekday.${day}`)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-white/55">{t('irrigation.program.startTimes')}</p>
                  <button
                    type="button"
                    onClick={onAddStartTime}
                    className="inline-flex items-center gap-1 rounded-lg border border-cyan-300/35 bg-cyan-400/15 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-100 transition-colors hover:bg-cyan-400/25"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>{t('irrigation.program.add')}</span>
                  </button>
                </div>

                <div className="mt-2 space-y-2">
                  {zoneConfig.startTimes.map((time, index) => (
                    <div key={`time-${zoneConfig.id}-${index}`} className="flex items-center gap-2">
                      <input
                        type="time"
                        value={time}
                        onChange={(event) => onStartTimeChange(index, event.target.value)}
                        className="w-full rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-300/40"
                      />
                      <button
                        type="button"
                        onClick={() => onRemoveStartTime(index)}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/12 bg-white/[0.03] text-white/65 transition-colors hover:text-white"
                        aria-label={t('irrigation.program.removeTime', { count: index + 1 })}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <label className="block">
                <span className="text-xs uppercase tracking-[0.16em] text-white/55">{t('irrigation.program.duration')}</span>
                <GlassSlider
                  min={1}
                  max={IRRIGATION_ABSOLUTE_MAX_DURATION_MIN}
                  value={zoneConfig.baseDuration}
                  onChange={(event) => onBaseDurationChange(event.target.value)}
                  className="mt-2"
                  tone="cyan"
                  aria-label={t('irrigation.program.durationA11y')}
                />
                <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-white/12 bg-black/30 px-3 py-1 text-sm font-semibold text-cyan-100">
                  <Clock3 className="h-4 w-4" />
                  <span>{zoneConfig.baseDuration} min</span>
                </div>
              </label>
      </div>
    </GlassModal>
  );
}

function LauncherView({ onNavigate = navigateTo }) {
  const { t } = useI18n();
  const portalKeys = {
    'technical-room': ['apps.portal.technical.title', 'apps.portal.technical.description'],
    'smart-irrigation': ['apps.portal.irrigation.title', 'apps.portal.irrigation.description'],
    'pool-spa': ['apps.portal.pool.title', 'apps.portal.pool.description'],
  };
  return (
    <div className="dashboard-page-content dashboard-page-content-wide gap-10 pb-8">
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="space-y-2"
      >
        <p className="dashboard-page-eyebrow">{t('apps.gallery.eyebrow')}</p>
        <h1 className="dashboard-page-title">{t('apps.gallery.title')}</h1>
        <p className="dashboard-page-subtitle">
          {t('apps.gallery.subtitle')}
        </p>
      </motion.header>

      <section className="space-y-5">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-[color:var(--ui-text-secondary)]">
            {t('apps.gallery.systemTitle')}
          </h2>
          <p className="text-sm text-[color:var(--ui-text-tertiary)]">{t('apps.gallery.systemSubtitle')}</p>
        </div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3"
        >
          {SYSTEM_PORTALS.map((portal) => {
            const [titleKey, descriptionKey] = portalKeys[portal.id];
            return <PortalCard key={portal.id} portal={{ ...portal, title: t(titleKey), description: t(descriptionKey) }} onNavigate={onNavigate} />;
          })}
        </motion.div>
      </section>

      <section className="space-y-5">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-[color:var(--ui-text-secondary)]">{t('apps.gallery.personalTitle')}</h2>
          <p className="text-sm text-[color:var(--ui-text-tertiary)]">{t('apps.gallery.personalSubtitle')}</p>
        </div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3"
        >
          <CreateDashboardPlaceholder />
        </motion.div>
      </section>
    </div>
  );
}

function IrrigationRouteHeader({ eyebrow, title, description, action }) {
  return (
    <header className="xl:col-span-12">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[color:var(--ui-text-tertiary)]">{eyebrow}</p>
          <h1 className="mt-1 text-[1.9rem] font-semibold leading-none tracking-[-0.045em] text-[color:var(--ui-text-primary)] sm:text-[2.35rem]">{title}</h1>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-[color:var(--ui-text-secondary)] sm:text-sm">{description}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </header>
  );
}

function IrrigationDashboardView({
  canConfigureApps = false,
  currentUserId = null,
  runtimeMode = 'real',
  haConnected = false,
  haStates = {},
  haEntityIds = [],
  haUrl = '',
  haToken = '',
  onCallService,
  onCallApi,
  onNotify,
  navigationRoute = '',
  onNavigate = navigateTo,
}) {
  const { locale, t } = useI18n();
  // App settings live in the dedicated house-wide configuration page.
  // Keep the legacy inline editor unreachable until its markup is removed.
  const isEditMode = false;
  const [activeWorkspaceSection, setActiveWorkspaceSection] = React.useState(() => {
    const initialSection = navigationRoute
      ? resolveIrrigationSectionFromTarget(navigationRoute)
      : resolveIrrigationSectionFromLocation();
    return ['configuration', 'zonesManagement'].includes(initialSection) && !canConfigureApps ? 'overview' : initialSection;
  });
  const [masterControlState, setMasterControlState] = React.useState('stopped');
  const [irrigationConfig, setIrrigationConfig] = React.useState(() => readStoredIrrigationConfig());
  const [irrigationConfigurationDraft, setIrrigationConfigurationDraft] = React.useState(
    () => readStoredIrrigationConfig(),
  );
  const [zoneEnabled, setZoneEnabled] = React.useState(() =>
    Object.fromEntries(irrigationConfig.zones.map((zone) => [zone.id, Boolean(zone.enabled)])),
  );
  const [isConfigOpen, setIsConfigOpen] = React.useState(false);
  const [editingZone, setEditingZone] = React.useState(null);
  const [zonesConfig, setZonesConfig] = React.useState(() =>
    irrigationConfig.zones.map((zone, index) => buildZoneConfigFromZone(zone, index)),
  );
  const [manualZoneSessions, setManualZoneSessions] = React.useState({});
  const [manualNowTs, setManualNowTs] = React.useState(() => Date.now());
  const [isRainSensorSyncing, setIsRainSensorSyncing] = React.useState(false);
  const [zoneCommandPending, setZoneCommandPending] = React.useState({});
  const [configurationStatus, setConfigurationStatus] = React.useState(haConnected ? 'loading' : 'offline');
  const [configurationRevision, setConfigurationRevision] = React.useState(null);
  const [persistedConfigurationSignature, setPersistedConfigurationSignature] = React.useState('');
  const [consumptionPeriod, setConsumptionPeriod] = React.useState('7d');
  const [consumptionHistory, setConsumptionHistory] = React.useState({
    status: runtimeMode === 'demo' ? 'available' : 'empty',
    points: runtimeMode === 'demo' ? buildDemoConsumptionSeries('7d') : [],
    isRefreshing: false,
    isStale: false,
    updatedAt: runtimeMode === 'demo' ? Date.now() : null,
  });
  const consumptionHistoryCacheRef = React.useRef(new Map());
  const manualZoneTimeoutsRef = React.useRef({});
  const haStatesRef = React.useRef(haStates);
  const irrigationProgressRootRef = React.useRef(null);
  const configuredConsumptionEntityId = normalizeEntityId(irrigationConfig.waterUsageEntityId);
  const configuredConsumptionEntity = configuredConsumptionEntityId ? haStates[configuredConsumptionEntityId] : null;
  const configuredConsumptionUnit = getEntityAttributes(configuredConsumptionEntity).unit_of_measurement ?? '';
  const resolveConfiguredZoneName = React.useCallback((zone, index) => {
    const demoKey = runtimeMode === 'demo' ? IRRIGATION_DEMO_ZONE_NAME_KEYS[zone?.id] : null;
    return demoKey ? t(demoKey) : zone?.name?.trim() || t('irrigation.summary.zoneNumber', { count: index + 1 });
  }, [runtimeMode, t]);

  React.useEffect(() => {
    if (!navigationRoute) return;
    const nextSection = resolveIrrigationSectionFromTarget(navigationRoute);
    setActiveWorkspaceSection(['configuration', 'zonesManagement'].includes(nextSection) && !canConfigureApps ? 'overview' : nextSection);
  }, [canConfigureApps, navigationRoute]);

  React.useEffect(() => {
    if (navigationRoute) return undefined;
    const syncSection = () => {
      const nextSection = resolveIrrigationSectionFromLocation();
      setActiveWorkspaceSection(['configuration', 'zonesManagement'].includes(nextSection) && !canConfigureApps ? 'overview' : nextSection);
    };
    window.addEventListener('popstate', syncSection);
    window.addEventListener('hashchange', syncSection);
    return () => {
      window.removeEventListener('popstate', syncSection);
      window.removeEventListener('hashchange', syncSection);
    };
  }, [canConfigureApps, navigationRoute]);

  React.useEffect(() => {
    if (activeWorkspaceSection === 'configuration' || activeWorkspaceSection === 'zonesManagement') return undefined;
    const root = irrigationProgressRootRef.current;
    const scrollContainer = root?.closest('main');
    if (!root || !scrollContainer) return undefined;

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    let animationFrame = 0;
    const updateProgress = () => {
      animationFrame = 0;
      const progress = reduceMotion ? 1 : Math.max(0, Math.min(1, scrollContainer.scrollTop / 220));
      root.style.setProperty('--irrigation-scroll-progress', progress.toFixed(4));
    };
    const handleScroll = () => {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(updateProgress);
    };

    updateProgress();
    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, [activeWorkspaceSection]);

  React.useEffect(() => {
    haStatesRef.current = haStates;
  }, [haStates]);

  React.useEffect(() => {
    if (activeWorkspaceSection !== 'usage') return undefined;

    if (runtimeMode === 'demo') {
      setConsumptionHistory({
        status: 'available',
        points: buildDemoConsumptionSeries(consumptionPeriod),
        isRefreshing: false,
        isStale: false,
        updatedAt: Date.now(),
      });
      return undefined;
    }

    const entityId = configuredConsumptionEntityId;
    const cacheKey = `${entityId}|${configuredConsumptionUnit}|${consumptionPeriod}`;
    const cached = consumptionHistoryCacheRef.current.get(cacheKey) ?? null;

    if (!haConnected) {
      setConsumptionHistory(cached
        ? { status: 'available', points: cached.points, isRefreshing: false, isStale: true, updatedAt: cached.updatedAt }
        : { status: 'offline', points: [], isRefreshing: false, isStale: false, updatedAt: null });
      return undefined;
    }

    if (!entityId || !configuredConsumptionEntity) {
      setConsumptionHistory({ status: 'empty', points: [], isRefreshing: false, isStale: false, updatedAt: null });
      return undefined;
    }

    if (typeof onCallApi !== 'function') {
      setConsumptionHistory(cached
        ? { status: 'available', points: cached.points, isRefreshing: false, isStale: true, updatedAt: cached.updatedAt }
        : { status: 'error', points: [], isRefreshing: false, isStale: false, updatedAt: null });
      return undefined;
    }

    const cacheIsFresh = cached && Date.now() - cached.updatedAt < IRRIGATION_CONSUMPTION_CACHE_TTL_MS;
    if (cacheIsFresh) {
      setConsumptionHistory({
        status: 'available',
        points: cached.points,
        isRefreshing: false,
        isStale: false,
        updatedAt: cached.updatedAt,
      });
      return undefined;
    }

    let cancelled = false;
    const endTime = new Date();
    const startTime = irrigationConsumptionPeriodStart(consumptionPeriod, endTime);
    const multiplier = waterUnitMultiplier(configuredConsumptionUnit);
    setConsumptionHistory(cached
      ? { status: 'available', points: cached.points, isRefreshing: true, isStale: false, updatedAt: cached.updatedAt }
      : { status: 'loading', points: [], isRefreshing: false, isStale: false, updatedAt: null });

    const loadConsumptionHistory = async () => {
      let payload = null;
      try {
        payload = await onCallApi({
          type: 'history/history_during_period',
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          entity_ids: [entityId],
          include_start_time_state: true,
          significant_changes_only: false,
          minimal_response: true,
          no_attributes: true,
        }, { reportError: false });
      } catch {
        payload = null;
      }

      if (payload === null) {
        const normalizedUrl = normalizeHassUrl(haUrl);
        const token = haToken.trim();
        if (normalizedUrl && token) {
          try {
            const endpoint = new URL(`${normalizedUrl}/api/history/period/${encodeURIComponent(startTime.toISOString())}`);
            endpoint.searchParams.set('filter_entity_id', entityId);
            endpoint.searchParams.set('end_time', endTime.toISOString());
            endpoint.searchParams.set('minimal_response', '1');
            endpoint.searchParams.set('no_attributes', '1');
            endpoint.searchParams.set('significant_changes_only', '0');
            const response = await fetch(endpoint.toString(), {
              headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
            });
            if (response.ok) payload = await response.json();
          } catch {
            payload = null;
          }
        }
      }

      if (cancelled) return;
      if (payload === null) {
        setConsumptionHistory(cached
          ? { status: 'available', points: cached.points, isRefreshing: false, isStale: true, updatedAt: cached.updatedAt }
          : { status: 'error', points: [], isRefreshing: false, isStale: false, updatedAt: null });
        return;
      }
      const points = buildIrrigationConsumptionSeries(payload, entityId, consumptionPeriod, multiplier);
      if (points.length) {
        const updatedAt = Date.now();
        consumptionHistoryCacheRef.current.set(cacheKey, { points, updatedAt });
        setConsumptionHistory({ status: 'available', points, isRefreshing: false, isStale: false, updatedAt });
      } else if (cached) {
        setConsumptionHistory({ status: 'available', points: cached.points, isRefreshing: false, isStale: true, updatedAt: cached.updatedAt });
      } else {
        setConsumptionHistory({ status: 'insufficient', points: [], isRefreshing: false, isStale: false, updatedAt: null });
      }
    };

    void loadConsumptionHistory();
    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceSection, configuredConsumptionEntityId, Boolean(configuredConsumptionEntity), configuredConsumptionUnit, consumptionPeriod, haConnected, haToken, haUrl, onCallApi, runtimeMode]);
  const appConfigurationsRepository = React.useMemo(
    () => typeof onCallApi === 'function'
      ? createHaAppConfigurationsRepository({
          callApi: onCallApi,
          isConnected: () => haConnected,
          canManage: () => canConfigureApps,
        })
      : null,
    [canConfigureApps, haConnected, onCallApi],
  );
  const irrigationConfigurationSignature = React.useMemo(
    () => JSON.stringify(normalizeIrrigationConfig(irrigationConfigurationDraft)),
    [irrigationConfigurationDraft],
  );
  const hasUnsavedConfigurationChanges = irrigationConfigurationSignature !== persistedConfigurationSignature;

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(IRRIGATION_CONFIGURATION_CACHE_KEY, JSON.stringify(irrigationConfig));
  }, [irrigationConfig]);

  React.useEffect(() => {
    if (!haConnected || !appConfigurationsRepository) {
      setConfigurationStatus('offline');
      return undefined;
    }

    let cancelled = false;
    setConfigurationStatus('loading');
    const loadSharedConfiguration = async () => {
      const result = await appConfigurationsRepository.load();
      if (cancelled) return;
      if (result.status === 'found') {
        const storedIrrigation = result.document.apps.irrigation;
        setConfigurationRevision(result.document.revision);
        if (storedIrrigation && typeof storedIrrigation === 'object') {
          const normalized = normalizeIrrigationConfig(storedIrrigation);
          setIrrigationConfig(normalized);
          setIrrigationConfigurationDraft(normalized);
          setPersistedConfigurationSignature(JSON.stringify(normalized));
        } else {
          setPersistedConfigurationSignature('');
        }
        setConfigurationStatus('ready');
        return;
      }
      if (result.status === 'empty') {
        setConfigurationRevision(null);
        setPersistedConfigurationSignature('');
        setConfigurationStatus('ready');
        return;
      }
      setConfigurationStatus(result.status);
    };
    void loadSharedConfiguration();
    return () => {
      cancelled = true;
    };
  }, [appConfigurationsRepository, haConnected]);

  React.useEffect(() => {
    if (configurationStatus === 'saved' && hasUnsavedConfigurationChanges) {
      setConfigurationStatus('ready');
    }
  }, [configurationStatus, hasUnsavedConfigurationChanges]);

  React.useEffect(() => {
    setZoneEnabled((current) => {
      const next = {};
      irrigationConfig.zones.forEach((zone) => {
        next[zone.id] = Object.prototype.hasOwnProperty.call(current, zone.id)
          ? Boolean(current[zone.id])
          : Boolean(zone.enabled);
      });
      return next;
    });
  }, [irrigationConfig.zones]);

  React.useEffect(() => {
    setZonesConfig((current) => {
      const currentById = new Map(current.map((zoneConfig) => [zoneConfig.id, zoneConfig]));
      return irrigationConfig.zones.map((zone, index) => {
        const normalized = buildZoneConfigFromZone(zone, index);
        const previous = currentById.get(normalized.id);
        if (!previous) {
          return normalized;
        }
        return {
          ...normalized,
          enabled: typeof previous.enabled === 'boolean' ? previous.enabled : normalized.enabled,
          days: normalizeWeekdays(previous.days, normalized.days),
          startTimes: normalizeStartTimes(previous.startTimes, normalized.startTimes),
          baseDuration: clamp(
            Math.round(toNumberOrUndefined(previous.baseDuration) ?? normalized.baseDuration),
            1,
            IRRIGATION_ABSOLUTE_MAX_DURATION_MIN,
          ),
        };
      });
    });

    if (editingZone && !irrigationConfig.zones.some((zone) => zone.id === editingZone)) {
      setEditingZone(null);
      setIsConfigOpen(false);
    }
  }, [editingZone, irrigationConfig.zones]);

  React.useEffect(() => {
    const activeZoneIds = new Set(irrigationConfig.zones.map((zone) => zone.id));
    Object.keys(manualZoneTimeoutsRef.current).forEach((zoneId) => {
      if (activeZoneIds.has(zoneId)) {
        return;
      }
      clearTimeout(manualZoneTimeoutsRef.current[zoneId]);
      delete manualZoneTimeoutsRef.current[zoneId];
    });

    setManualZoneSessions((current) => {
      const next = {};
      Object.entries(current).forEach(([zoneId, session]) => {
        if (activeZoneIds.has(zoneId)) {
          next[zoneId] = session;
        }
      });
      return next;
    });
  }, [irrigationConfig.zones]);

  React.useEffect(
    () => () => {
      Object.values(manualZoneTimeoutsRef.current).forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
      manualZoneTimeoutsRef.current = {};
    },
    [],
  );

  React.useEffect(() => {
    if (Object.keys(manualZoneSessions).length === 0) {
      return;
    }
    const intervalId = window.setInterval(() => {
      setManualNowTs(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [manualZoneSessions]);

  const sortedEntityIds = React.useMemo(
    () => [...haEntityIds].sort((first, second) => first.localeCompare(second)),
    [haEntityIds],
  );
  const binarySensorOptions = React.useMemo(
    () => sortedEntityIds.filter((entityId) => entityId.startsWith('binary_sensor.')),
    [sortedEntityIds],
  );
  const weatherOptions = React.useMemo(
    () => sortedEntityIds.filter((entityId) => entityId.startsWith('weather.')),
    [sortedEntityIds],
  );
  const sensorOptions = React.useMemo(
    () => sortedEntityIds.filter((entityId) => entityId.startsWith('sensor.')),
    [sortedEntityIds],
  );
  const zoneEntityOptions = React.useMemo(
    () =>
      sortedEntityIds.filter(
        (entityId) =>
          entityId.startsWith('switch.') ||
          entityId.startsWith('input_boolean.') ||
          entityId.startsWith('valve.'),
      ),
    [sortedEntityIds],
  );
  const editingZoneConfig = React.useMemo(
    () => zonesConfig.find((zoneConfig) => zoneConfig.id === editingZone) ?? null,
    [editingZone, zonesConfig],
  );
  const irrigationState = React.useMemo(
    () => buildIrrigationState(irrigationConfig),
    [irrigationConfig],
  );

  const rainSensorEntityId = normalizeEntityId(irrigationConfig.rainSensorEntityId);
  const rainSensorEnabled = irrigationConfig.rainSensorEnabled !== false;
  const configuredWeatherEntityId = normalizeEntityId(irrigationConfig.weatherEntityId);
  const weatherEntityId = configuredWeatherEntityId || weatherOptions[0] || '';
  const weatherEntity = weatherEntityId ? haStates[weatherEntityId] : null;
  const rainForecastInfo = resolveRainForecastInfo(weatherEntity);
  const rainForecastProbability = rainForecastInfo?.probability;
  const rainForecastDayLabel = rainForecastInfo?.dayLabel ?? new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(0, 'day');
  const rainSensorEntity = rainSensorEntityId ? haStates[rainSensorEntityId] : null;
  const rainSensorActive = resolveBooleanEntityValue(haStates, rainSensorEntityId, true);
  const rainSensorUnavailable = Boolean(
    rainSensorEntityId && (!rainSensorEntity || isEntityUnavailableState(rainSensorEntity.state)),
  );
  const rainStatusLabel = !rainSensorEnabled
    ? t('irrigation.summary.bypassStatus')
    : !rainSensorEntityId
      ? t('irrigation.summary.sensorMissing')
      : rainSensorUnavailable
        ? t('irrigation.summary.sensorUnavailable')
        : rainSensorActive
          ? t('irrigation.summary.rainDetected')
          : t('irrigation.summary.sensorReady');
  let rainSummaryTitle = '';
  let rainSummaryDescription = '';

  if (!rainSensorEnabled) {
    rainSummaryTitle = t('irrigation.summary.bypass');
    rainSummaryDescription =
      rainForecastProbability !== undefined
        ? t('irrigation.summary.forecast', { probability: rainForecastProbability, day: rainForecastDayLabel })
        : t('irrigation.rain.disabled');
  } else if (rainSensorUnavailable) {
    rainSummaryTitle = t('irrigation.summary.unavailable');
    rainSummaryDescription = rainSensorEntityId
      ? `${t('irrigation.summary.sensorUnavailable')}: ${rainSensorEntityId}`
      : t('irrigation.summary.configureRain');
  } else if (rainSensorActive) {
    rainSummaryTitle = t('irrigation.summary.pausedRain');
    rainSummaryDescription =
      rainForecastProbability !== undefined
        ? t('irrigation.summary.forecast', { probability: rainForecastProbability, day: rainForecastDayLabel })
        : t('irrigation.calendar.rainDescription');
  } else if (rainForecastProbability !== undefined) {
    rainSummaryTitle = t('irrigation.summary.forecast', { probability: rainForecastProbability, day: rainForecastDayLabel });
    if (rainForecastProbability >= 70) {
      rainSummaryDescription = t('irrigation.summary.highRisk');
    } else if (rainForecastProbability >= 35) {
      rainSummaryDescription = t('irrigation.summary.mediumRisk');
    } else {
      rainSummaryDescription = t('irrigation.summary.lowRisk');
    }
  } else if (weatherEntityId) {
    rainSummaryTitle = t('irrigation.summary.forecastUnavailable');
    rainSummaryDescription =
      t('irrigation.consumption.historyUnavailable');
  } else {
    rainSummaryTitle = t('irrigation.summary.noWeather');
    rainSummaryDescription =
      t('irrigation.configure');
  }

  const humidityValue = clamp(
    Math.round(resolveNumericEntityValue(haStates, irrigationConfig.humidityEntityId, 88)),
    0,
    100,
  );
  const outdoorTempValue = resolveNumericEntityValue(haStates, irrigationConfig.outdoorTempEntityId, 18);
  const moisturePct = clamp(
    Math.round(resolveNumericEntityValue(haStates, irrigationConfig.soilMoistureEntityId, 45)),
    0,
    100,
  );
  const moistureText =
    moisturePct < 35
      ? t('irrigation.moisture.dry')
      : moisturePct > 70
        ? t('irrigation.moisture.wet')
        : t('irrigation.moisture.ideal');
  const waterUsageLiters = Math.max(
    0,
    Math.round(resolveNumericEntityValue(haStates, irrigationConfig.waterUsageEntityId, 1240)),
  );
  const waterAverageLiters = Math.max(
    1,
    Math.round(resolveNumericEntityValue(haStates, irrigationConfig.waterAverageEntityId, 1450)),
  );
  const savingsPct = Math.round(((waterAverageLiters - waterUsageLiters) / waterAverageLiters) * 100);
  const isPositiveSavings = savingsPct >= 0;
  const savingsLabel = `${isPositiveSavings ? '-' : '+'}${Math.abs(savingsPct)}% ${
    isPositiveSavings ? t('irrigation.usage.saving') : t('irrigation.usage.consumption')
  }`;
  const configuredZonesCount = irrigationConfig.zones.filter((zone) => normalizeEntityId(zone.entityId)).length;
  const consumptionTotalLiters = consumptionHistory.status === 'available'
    ? Math.round(consumptionHistory.points.reduce((sum, point) => sum + point.value, 0) * 10) / 10
    : null;
  const consumptionDays = irrigationConsumptionPeriodDays(consumptionPeriod);
  const consumptionDailyAverageLiters = consumptionTotalLiters === null
    ? null
    : Math.round((consumptionTotalLiters / consumptionDays) * 10) / 10;
  const configuredAverageRaw = resolveOptionalNumericEntityValue(haStates, irrigationConfig.waterAverageEntityId);
  const configuredAverageEntity = normalizeEntityId(irrigationConfig.waterAverageEntityId)
    ? haStates[normalizeEntityId(irrigationConfig.waterAverageEntityId)]
    : null;
  const configuredAverageMultiplier = waterUnitMultiplier(
    getEntityAttributes(configuredAverageEntity).unit_of_measurement,
  );
  const consumptionReferenceLiters = runtimeMode === 'demo'
    ? consumptionTotalLiters === null ? null : consumptionTotalLiters / 0.86
    : configuredAverageRaw === null
      ? null
      : configuredAverageRaw * configuredAverageMultiplier * (consumptionDays / 7);
  const consumptionComparisonPct = consumptionTotalLiters === null || consumptionReferenceLiters === null || consumptionReferenceLiters <= 0
    ? null
    : Math.round(((consumptionTotalLiters - consumptionReferenceLiters) / consumptionReferenceLiters) * 100);
  const plannedWeeklyMinutes = irrigationConfig.zones.reduce((sum, zone) => {
    const daysCount = Array.isArray(zone.days) ? zone.days.length : 0;
    const startsCount = Array.isArray(zone.startTimes) ? zone.startTimes.length : 0;
    const duration = clamp(Math.round(toNumberOrUndefined(zone.baseDuration) ?? 0), 0, IRRIGATION_ABSOLUTE_MAX_DURATION_MIN);
    return sum + daysCount * startsCount * duration;
  }, 0);
  const consumptionZoneBreakdown = irrigationConfig.zones
    .map((zone, index) => {
      const daysCount = Array.isArray(zone.days) ? zone.days.length : 0;
      const startsCount = Array.isArray(zone.startTimes) ? zone.startTimes.length : 0;
      const duration = clamp(Math.round(toNumberOrUndefined(zone.baseDuration) ?? 0), 0, IRRIGATION_ABSOLUTE_MAX_DURATION_MIN);
      const plannedMinutes = daysCount * startsCount * duration;
      const share = plannedWeeklyMinutes > 0 ? Math.round((plannedMinutes / plannedWeeklyMinutes) * 100) : 0;
      return {
        id: zone.id,
        name: resolveConfiguredZoneName(zone, index),
        plannedMinutes,
        share,
        liters: consumptionTotalLiters === null ? null : Math.round(consumptionTotalLiters * share) / 100,
      };
    })
    .filter((zone) => zone.plannedMinutes > 0)
    .sort((first, second) => second.plannedMinutes - first.plannedMinutes);
  const consumptionDataSourceLabel = runtimeMode === 'demo'
    ? t('irrigation.source.demo')
    : consumptionHistory.isRefreshing
      ? t('irrigation.source.updating')
      : consumptionHistory.isStale
        ? t('irrigation.source.latest')
        : consumptionHistory.status === 'available'
          ? t('irrigation.source.history')
          : t('irrigation.source.unavailable');

  const zones = React.useMemo(
    () =>
      irrigationConfig.zones.map((zone, index) => {
        const entityId = normalizeEntityId(zone.entityId);
        const entity = entityId ? haStates[entityId] : null;
        const hasUnavailableEntity = Boolean(entityId && (!entity || isEntityUnavailableState(entity.state)));
        const liveEnabled = entity ? isEntityOnState(entity.state) : undefined;
        const enabled = liveEnabled ?? zoneEnabled[zone.id] ?? Boolean(zone.enabled);
        let status = zone.status;
        let detail = zone.detail;
        let progress = zone.progress;
        const manualDurationMin = clamp(
          Math.round(toNumberOrUndefined(zone.manualDurationMin) ?? 10),
          1,
          irrigationConfig.maximumManualDurationMin,
        );
        const manualSession = manualZoneSessions[zone.id];
        const manualRemainingSeconds = manualSession
          ? Math.max(0, Math.ceil((manualSession.endAt - manualNowTs) / 1000))
          : 0;
        const nextIrrigationLabel = formatNextIrrigationLabel(zone.days, zone.startTimes, new Date(), locale);

        if (entityId) {
          if (hasUnavailableEntity && haConnected) {
            status = 'alert';
            detail = t('irrigation.summary.entityUnavailable');
            progress = 0;
          } else if (entity) {
            status = enabled ? 'active' : 'idle';
            detail = t('irrigation.summary.state', { state: formatIrrigationEntityStateLabel(entity.stateLabel ?? entity.state ?? 'off', locale) });
            const liveProgress = toNumberOrUndefined(entity.progress);
            if (liveProgress !== undefined) {
              progress = clamp(Math.round(liveProgress), 0, 100);
            }
          }
        }

        if (manualSession) {
          status = 'active';
          detail = t('irrigation.summary.running');
          progress = clamp(Math.round((manualRemainingSeconds / (manualDurationMin * 60)) * 100), 0, 100);
        }

        if (status !== 'alert') {
          detail = enabled ? t('irrigation.summary.running') : t('irrigation.summary.closedNext', { next: nextIrrigationLabel });
        }

        const fallbackName = t('irrigation.summary.zoneNumber', { count: index + 1 });
        const displayName = runtimeMode === 'demo'
          ? resolveConfiguredZoneName(zone, index)
          : zone.name?.trim() || resolveEntityDisplayName(entityId, entity, fallbackName);
        const Icon = IRRIGATION_ZONE_ICON_COMPONENTS[zone.iconKey] ?? Droplets;

        return {
          ...zone,
          name: displayName,
          detail: detail || t('irrigation.summary.closedNext', { next: nextIrrigationLabel }),
          status: status || 'idle',
          progress: clamp(Math.round(progress ?? 0), 0, 100),
          enabled,
          entityId,
          icon: Icon,
          manualDurationMin,
          maximumManualDurationMin: irrigationConfig.maximumManualDurationMin,
          manualRemainingSeconds,
          isManualActive: Boolean(manualSession),
          isCommandPending: Boolean(zoneCommandPending[zone.id]),
        };
      }),
    [haConnected, haStates, irrigationConfig.maximumManualDurationMin, irrigationConfig.zones, locale, manualNowTs, manualZoneSessions, resolveConfiguredZoneName, runtimeMode, zoneCommandPending, zoneEnabled],
  );

  const calendarZones = React.useMemo(
    () => zones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      icon: zone.icon,
      days: normalizeWeekdays(zone.days, []),
      startTimes: normalizeStartTimes(zone.startTimes, []),
      durationMin: clamp(
        Math.round(toNumberOrUndefined(zone.baseDuration) ?? zone.manualDurationMin ?? DEFAULT_ZONE_BASE_DURATION),
        1,
        irrigationConfig.maximumManualDurationMin,
      ),
      scheduleEnabled: irrigationConfig.zones.find((configuredZone) => configuredZone.id === zone.id)?.enabled !== false,
      available: runtimeMode === 'demo' || !haConnected || Boolean(zone.entityId && haStates[zone.entityId] && !isEntityUnavailableState(haStates[zone.entityId].state)),
      running: zone.isManualActive,
    })),
    [haConnected, haStates, irrigationConfig.maximumManualDurationMin, irrigationConfig.zones, runtimeMode, zones],
  );

  const overviewNextCycleLabel = React.useMemo(() => {
    const nextZone = irrigationConfig.zones
      .filter((zone) => zone.enabled !== false)
      .map((zone) => ({
        zone,
        slot: findNextIrrigationSlot(zone.days, zone.startTimes),
      }))
      .filter((entry) => entry.slot)
      .sort((left, right) => left.slot.date.getTime() - right.slot.date.getTime())[0];

    if (!nextZone) return t('irrigation.summary.noCycle');
    const displayName = resolveConfiguredZoneName(nextZone.zone, irrigationConfig.zones.indexOf(nextZone.zone));
    return `${displayName} · ${formatNextIrrigationLabel(nextZone.zone.days, nextZone.zone.startTimes, new Date(), locale)}`;
  }, [irrigationConfig.zones, locale, resolveConfiguredZoneName, t]);

  const overviewScheduleItems = React.useMemo(() => irrigationConfig.zones
    .filter((zone) => zone.enabled !== false)
    .map((zone, index) => ({
      zone,
      index,
      slot: findNextIrrigationSlot(zone.days, zone.startTimes),
    }))
    .filter((entry) => entry.slot)
    .sort((left, right) => left.slot.date.getTime() - right.slot.date.getTime())
    .slice(0, 3)
    .map(({ zone, index }) => ({
      id: zone.id,
      name: resolveConfiguredZoneName(zone, index),
      when: formatNextIrrigationLabel(zone.days, zone.startTimes, new Date(), locale),
      durationMin: clamp(
        Math.round(toNumberOrUndefined(zone.baseDuration) ?? DEFAULT_ZONE_BASE_DURATION),
        1,
        irrigationConfig.maximumManualDurationMin,
      ),
    })), [irrigationConfig.maximumManualDurationMin, irrigationConfig.zones, locale, resolveConfiguredZoneName]);

  const updateConfigField = (field, value) => {
    setIrrigationConfig((current) => ({
      ...current,
      [field]: field === 'rainSensorEnabled' ? Boolean(value) : normalizeEntityId(value),
    }));
  };

  const updateConfigurationDraftField = (field, value) => {
    setIrrigationConfigurationDraft((current) => ({
      ...current,
      [field]: field === 'rainSensorEnabled' || field === 'blockOnRainSensorUnavailable'
        ? Boolean(value)
        : field === 'maximumManualDurationMin'
          ? clamp(
              Math.round(toNumberOrUndefined(value) ?? current.maximumManualDurationMin),
              IRRIGATION_MINIMUM_MAX_DURATION_MIN,
              IRRIGATION_ABSOLUTE_MAX_DURATION_MIN,
            )
          : normalizeEntityId(value),
    }));
  };

  const applySuggestedIrrigationConfiguration = (nextConfig) => {
    setIrrigationConfigurationDraft(normalizeIrrigationConfig(nextConfig));
  };

  const updateZoneConfigurationField = (zoneId, field, value) => {
    if (!['name', 'entityId', 'soilMoistureEntityId', 'iconKey', 'enabled'].includes(field)) return;
    setIrrigationConfigurationDraft((current) => ({
      ...current,
      zones: current.zones.map((zone) => zone.id === zoneId
        ? {
            ...zone,
            [field]: field === 'name'
              ? value
              : field === 'enabled'
                ? Boolean(value)
                : field === 'iconKey'
                  ? IRRIGATION_ZONE_ICON_COMPONENTS[value] ? value : zone.iconKey
                  : normalizeEntityId(value),
          }
        : zone),
    }));
  };

  const moveConfigurationZone = (zoneId, direction) => {
    setIrrigationConfigurationDraft((current) => {
      const currentIndex = current.zones.findIndex((zone) => zone.id === zoneId);
      const nextIndex = currentIndex + direction;
      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= current.zones.length) return current;
      const zones = [...current.zones];
      const [movedZone] = zones.splice(currentIndex, 1);
      zones.splice(nextIndex, 0, movedZone);
      return { ...current, zones };
    });
  };

  const updateZoneEntity = (zoneId, value) => {
    setIrrigationConfig((current) => {
      return {
        ...current,
        zones: current.zones.map((zone) =>
          zone.id === zoneId
            ? {
                ...zone,
                entityId: normalizeEntityId(value),
              }
            : zone,
        ),
      };
    });
  };

  const updateZoneName = (zoneId, value) => {
    setIrrigationConfig((current) => ({
      ...current,
      zones: current.zones.map((zone, index) =>
        zone.id === zoneId
          ? {
              ...zone,
              name: normalizeZoneName(value, `Zona ${index + 1}`),
            }
          : zone,
      ),
    }));
  };

  const updateZoneIcon = (zoneId, iconKey) => {
    const normalizedIconKey = typeof iconKey === 'string' ? iconKey.trim().toLowerCase() : '';
    if (!IRRIGATION_ZONE_ICON_COMPONENTS[normalizedIconKey]) {
      return;
    }

    setIrrigationConfig((current) => ({
      ...current,
      zones: current.zones.map((zone) =>
        zone.id === zoneId
          ? {
              ...zone,
              iconKey: normalizedIconKey,
            }
          : zone,
      ),
    }));
  };

  const updateZoneManualDuration = (zoneId, value) => {
    const parsedValue = toNumberOrUndefined(value);
    const nextDurationMin = clamp(
      Math.round(parsedValue ?? 10),
      1,
      irrigationConfig.maximumManualDurationMin,
    );

    setIrrigationConfig((current) => ({
      ...current,
      zones: current.zones.map((zone) =>
        zone.id === zoneId
          ? {
              ...zone,
              manualDurationMin: nextDurationMin,
            }
          : zone,
      ),
    }));
  };

  const appendNewZone = (current) => {
      const nextZoneNumber = current.zones.length + 1;
      const nextId = buildUniqueZoneId(current.zones, `zona-${nextZoneNumber}`);
      const nextZone = normalizeIrrigationZone(
        {
          id: nextId,
          name: `Zona ${nextZoneNumber}`,
          detail: 'Nessun ciclo programmato',
          progress: 0,
          status: 'idle',
          enabled: false,
          iconKey: DEFAULT_NEW_ZONE_ICON_KEY,
          entityId: '',
          manualDurationMin: 10,
          days: [...DEFAULT_ZONE_DAYS],
          startTimes: [...DEFAULT_ZONE_START_TIMES],
          baseDuration: DEFAULT_ZONE_BASE_DURATION,
        },
        current.zones.length,
      );

      return {
        ...current,
        zones: [...current.zones, nextZone],
      };
  };

  const addZone = () => {
    setIrrigationConfig(appendNewZone);
  };

  const addConfigurationZone = () => {
    setIrrigationConfigurationDraft(appendNewZone);
  };

  const resetIrrigationConfig = () => {
    Object.values(manualZoneTimeoutsRef.current).forEach((timeoutId) => {
      clearTimeout(timeoutId);
    });
    manualZoneTimeoutsRef.current = {};
    setManualZoneSessions({});

    const resetConfig = cloneDefaultIrrigationConfig();
    setIrrigationConfig(resetConfig);
    setZoneEnabled(Object.fromEntries(resetConfig.zones.map((zone) => [zone.id, Boolean(zone.enabled)])));
    setManualNowTs(Date.now());
  };

  const openZoneConfigModal = (zoneId) => {
    if (!zoneId) {
      return;
    }

    const zone = irrigationConfig.zones.find((item) => item.id === zoneId);
    if (!zone) {
      return;
    }

    if (!normalizeEntityId(zone.entityId)) {
      if (typeof onNotify === 'function') {
        onNotify('warning', t('irrigation.notify.incomplete'));
      }
      return;
    }

    setEditingZone(zoneId);
    setIsConfigOpen(true);
  };

  const closeZoneConfigModal = () => {
    setIsConfigOpen(false);
    setEditingZone(null);
  };

  const updateEditingZoneConfig = (updater) => {
    if (!editingZone) {
      return;
    }
    setZonesConfig((current) =>
      current.map((zoneConfig) => (zoneConfig.id === editingZone ? updater(zoneConfig) : zoneConfig)),
    );
  };

  const handleEditingZoneToggleDay = (dayToken) => {
    updateEditingZoneConfig((zoneConfig) => {
      const hasDay = zoneConfig.days.includes(dayToken);
      if (hasDay && zoneConfig.days.length === 1) {
        return zoneConfig;
      }
      return {
        ...zoneConfig,
        days: hasDay
          ? zoneConfig.days.filter((day) => day !== dayToken)
          : [...zoneConfig.days, dayToken].filter((day) => IRRIGATION_WEEKDAY_TOKENS.includes(day)),
      };
    });
  };

  const handleEditingZoneStartTimeChange = (index, value) => {
    updateEditingZoneConfig((zoneConfig) => {
      const nextTimes = [...zoneConfig.startTimes];
      nextTimes[index] = value;
      return {
        ...zoneConfig,
        startTimes: nextTimes,
      };
    });
  };

  const handleEditingZoneAddStartTime = () => {
    updateEditingZoneConfig((zoneConfig) => ({
      ...zoneConfig,
      startTimes: [...zoneConfig.startTimes, zoneConfig.startTimes[zoneConfig.startTimes.length - 1] ?? '06:00'],
    }));
  };

  const handleEditingZoneRemoveStartTime = (index) => {
    updateEditingZoneConfig((zoneConfig) => {
      if (zoneConfig.startTimes.length <= 1) {
        return zoneConfig;
      }
      return {
        ...zoneConfig,
        startTimes: zoneConfig.startTimes.filter((_, timeIndex) => timeIndex !== index),
      };
    });
  };

  const handleEditingZoneBaseDurationChange = (value) => {
    const parsed = toNumberOrUndefined(value);
    updateEditingZoneConfig((zoneConfig) => ({
      ...zoneConfig,
      baseDuration: clamp(
        Math.round(parsed ?? zoneConfig.baseDuration ?? DEFAULT_ZONE_BASE_DURATION),
        1,
        IRRIGATION_ABSOLUTE_MAX_DURATION_MIN,
      ),
    }));
  };

  const saveAutomationToHA = async (automationPayload, options = {}) => {
    const { notifySuccess = true, notifyError = true } = options;
    const automationId = typeof automationPayload?.id === 'string' ? automationPayload.id.trim() : '';
    if (!automationId) {
      if (notifyError && typeof onNotify === 'function') {
        onNotify('alert', t('irrigation.notify.automationMissing'));
      }
      return false;
    }

    try {
      const { baseUrl, token } = await resolveHaApiContext(haUrl, haToken);
      const response = await fetch(
        `${baseUrl}/api/config/automation/config/${encodeURIComponent(automationId)}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(automationPayload),
        },
      );

      if (!response.ok) {
        const errorMessage = await readHaErrorResponse(response);
        throw new Error(`HTTP ${response.status}: ${errorMessage}`);
      }

      console.log('[Irrigation] Automation saved via Home Assistant REST API', {
        automation_id: automationId,
      });
      if (notifySuccess && typeof onNotify === 'function') {
        onNotify('info', t('irrigation.notify.automationSaved', { id: automationId }));
      }
      return true;
    } catch (error) {
      const rawMessage = toErrorMessage(error, 'Errore sconosciuto');
      const networkLikeFailure =
        error instanceof TypeError && /fetch/i.test(rawMessage.toLowerCase());
      const detailMessage = networkLikeFailure
        ? 'Richiesta REST non riuscita (possibile CORS/rete).'
        : rawMessage;

      if (notifyError && typeof onNotify === 'function') {
        onNotify('alert', `${t('irrigation.notify.automationFailed')} ${detailMessage}`);
      }

      console.warn(
        `[Irrigation] ${haConnected ? 'Failed' : 'Offline'} REST save automation config`,
        {
          automation_id: automationId,
          error: rawMessage,
        },
      );
      return false;
    }
  };

  const saveZoneAutomation = async (
    zoneConfig,
    irrigationStateOverride = irrigationState,
    saveOptions = {},
  ) => {
    const automationJson = generateZoneAutomation(zoneConfig, irrigationStateOverride);
    return saveAutomationToHA(automationJson, saveOptions);
  };

  const syncZoneAutomationsForConfig = async (configSnapshot) => {
    const snapshot = normalizeIrrigationConfig(configSnapshot);
    const snapshotIrrigationState = buildIrrigationState(snapshot);
    let saved = 0;
    let skipped = 0;
    let failed = 0;

    for (let index = 0; index < snapshot.zones.length; index += 1) {
      const zone = snapshot.zones[index];
      const normalizedZoneConfig = {
        ...buildZoneConfigFromZone(zone, index),
        name: normalizeZoneName(zone?.name, `Zona ${index + 1}`),
        entityId:
          normalizeEntityId(zone?.entityId) ||
          snapshotIrrigationState.zoneEntityById[zone?.id] ||
          '',
      };

      if (!normalizedZoneConfig.entityId) {
        skipped += 1;
        continue;
      }

      const ok = await saveZoneAutomation(
        normalizedZoneConfig,
        snapshotIrrigationState,
        { notifySuccess: false, notifyError: false },
      );

      if (ok) {
        saved += 1;
      } else {
        failed += 1;
      }
    }

    return { saved, skipped, failed };
  };

  const handleSaveZoneProgramming = async () => {
    if (!editingZoneConfig) {
      return;
    }

    const resolvedZoneEntityId =
      normalizeEntityId(editingZoneConfig.entityId) || irrigationState.zoneEntityById[editingZoneConfig.id] || '';
    if (!resolvedZoneEntityId) {
      if (typeof onNotify === 'function') {
        onNotify('warning', t('irrigation.notify.incomplete'));
      }
      return;
    }

    const normalizedZoneConfig = {
      ...editingZoneConfig,
      name: normalizeZoneName(editingZoneConfig.name, 'Zona'),
      entityId: resolvedZoneEntityId,
      enabled: Boolean(editingZoneConfig.enabled),
      days: normalizeWeekdays(editingZoneConfig.days, DEFAULT_ZONE_DAYS),
      startTimes: normalizeStartTimes(editingZoneConfig.startTimes, DEFAULT_ZONE_START_TIMES),
      baseDuration: clamp(
        Math.round(toNumberOrUndefined(editingZoneConfig.baseDuration) ?? DEFAULT_ZONE_BASE_DURATION),
        1,
        IRRIGATION_ABSOLUTE_MAX_DURATION_MIN,
      ),
    };

    setZonesConfig((current) =>
      current.map((zoneConfig) =>
        zoneConfig.id === normalizedZoneConfig.id ? normalizedZoneConfig : zoneConfig,
      ),
    );

    setIrrigationConfig((current) => ({
      ...current,
      zones: current.zones.map((zone) =>
        zone.id === normalizedZoneConfig.id
          ? {
              ...zone,
              name: normalizedZoneConfig.name,
              entityId: normalizedZoneConfig.entityId,
              enabled: normalizedZoneConfig.enabled,
              days: [...normalizedZoneConfig.days],
              startTimes: [...normalizedZoneConfig.startTimes],
              baseDuration: normalizedZoneConfig.baseDuration,
            }
          : zone,
      ),
    }));

    const isSaved = await saveZoneAutomation(normalizedZoneConfig);
    if (isSaved) {
      closeZoneConfigModal();
    }
  };

  const handleRainSensorToggle = async () => {
    const nextConfig = normalizeIrrigationConfig({
      ...irrigationConfig,
      rainSensorEnabled: !rainSensorEnabled,
    });

    setIrrigationConfig(nextConfig);

    if (!haConnected) {
      if (typeof onNotify === 'function') {
        onNotify('warning', t('irrigation.notify.rainLocal'));
      }
      return;
    }

    setIsRainSensorSyncing(true);
    const result = await syncZoneAutomationsForConfig(nextConfig);
    setIsRainSensorSyncing(false);

    if (typeof onNotify === 'function') {
      if (result.failed > 0) {
        onNotify(
          'alert',
          t('irrigation.notify.rainSyncFailed', { count: result.failed }),
        );
      } else {
        onNotify(
          'info',
          t('irrigation.notify.rainSyncDone', { saved: result.saved, skipped: result.skipped }),
        );
      }
    }
  };

  const waitForZoneStateConfirmation = async (entityId, shouldTurnOn, timeoutMs = 6000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      const entity = haStatesRef.current?.[entityId];
      if (entity && !isEntityUnavailableState(entity.state) && isEntityOnState(entity.state) === shouldTurnOn) {
        return true;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 150));
    }
    return false;
  };

  const setZonePowerState = async (zone, shouldTurnOn) => {
    const entityId = normalizeEntityId(zone.entityId);
    if (!entityId) return false;

    if (runtimeMode === 'demo') {
      setZoneEnabled((current) => ({ ...current, [zone.id]: shouldTurnOn }));
      return true;
    }

    if (!haConnected || typeof onCallService !== 'function') {
      if (typeof onNotify === 'function') {
        onNotify('error', t('irrigation.notify.offline'));
      }
      return false;
    }

    setZoneCommandPending((current) => ({ ...current, [zone.id]: true }));
    try {
      const domain = entityId.split('.')[0];
      let ok = false;

      if (domain === 'switch' || domain === 'input_boolean') {
        ok = await onCallService(domain, shouldTurnOn ? 'turn_on' : 'turn_off', {
          entity_id: entityId,
        });
      } else if (domain === 'valve') {
        ok = await onCallService('valve', shouldTurnOn ? 'open_valve' : 'close_valve', {
          entity_id: entityId,
        });
      } else {
        ok = await onCallService('homeassistant', shouldTurnOn ? 'turn_on' : 'turn_off', {
          entity_id: entityId,
        });
      }

      if (!ok) {
        if (typeof onNotify === 'function') onNotify('error', t('irrigation.notify.commandRejected'));
        return false;
      }

      const confirmed = await waitForZoneStateConfirmation(entityId, shouldTurnOn);
      if (!confirmed) {
        if (typeof onNotify === 'function') onNotify('warning', t('irrigation.notify.unconfirmed'));
        return false;
      }
      setZoneEnabled((current) => ({ ...current, [zone.id]: shouldTurnOn }));
      return true;
    } finally {
      setZoneCommandPending((current) => ({ ...current, [zone.id]: false }));
    }
  };

  const clearManualSession = (zoneId) => {
    const timeoutId = manualZoneTimeoutsRef.current[zoneId];
    if (timeoutId) {
      clearTimeout(timeoutId);
      delete manualZoneTimeoutsRef.current[zoneId];
    }

    setManualZoneSessions((current) => {
      if (!Object.prototype.hasOwnProperty.call(current, zoneId)) {
        return current;
      }
      const next = { ...current };
      delete next[zoneId];
      return next;
    });
  };

  const stopZoneManualMode = async (zone) => {
    clearManualSession(zone.id);
    await setZonePowerState(zone, false);
    setManualNowTs(Date.now());
  };

  const startZoneManualMode = async (zone) => {
    if (zone.status === 'alert') {
      return;
    }
    if (!normalizeEntityId(zone.entityId)) {
      if (typeof onNotify === 'function') {
        onNotify('warning', t('irrigation.notify.incomplete'));
      }
      return;
    }

    if (runtimeMode !== 'demo' && rainSensorEnabled && rainSensorActive) {
      if (typeof onNotify === 'function') onNotify('warning', t('irrigation.notify.raining'));
      return;
    }
    if (runtimeMode !== 'demo' && rainSensorEnabled && rainSensorUnavailable && irrigationConfig.blockOnRainSensorUnavailable) {
      if (typeof onNotify === 'function') onNotify('warning', t('irrigation.notify.rainBlocked'));
      return;
    }

    const durationMin = clamp(
      Math.round(toNumberOrUndefined(zone.manualDurationMin) ?? 10),
      1,
      irrigationConfig.maximumManualDurationMin,
    );
    const durationMs = durationMin * 60 * 1000;
    const startedAt = Date.now();
    const endAt = startedAt + durationMs;

    const started = await setZonePowerState(zone, true);
    if (!started) return;
    clearManualSession(zone.id);

    setManualZoneSessions((current) => ({
      ...current,
      [zone.id]: {
        startedAt,
        endAt,
      },
    }));

    manualZoneTimeoutsRef.current[zone.id] = setTimeout(async () => {
      await setZonePowerState(zone, false);
      setManualZoneSessions((current) => {
        if (!Object.prototype.hasOwnProperty.call(current, zone.id)) {
          return current;
        }
        const next = { ...current };
        delete next[zone.id];
        return next;
      });
      delete manualZoneTimeoutsRef.current[zone.id];
      setManualNowTs(Date.now());
    }, durationMs);

    setManualNowTs(Date.now());
  };

  const masterIsStopped = masterControlState === 'stopped';
  const masterIsRunning = masterControlState === 'running';
  const masterTitle = masterIsRunning
    ? t('irrigation.summary.systemActive')
    : masterIsStopped
      ? t('irrigation.summary.systemStopped')
      : t('irrigation.summary.systemPaused');
  const handleMasterPrimaryAction = () => {
    setMasterControlState((current) => (current === 'running' ? 'paused' : 'running'));
  };

  const handleMasterStop = () => {
    setMasterControlState('stopped');
  };

  const removeZone = (zoneId) => {
    setIrrigationConfigurationDraft((current) => current.zones.length <= 1
      ? current
      : { ...current, zones: current.zones.filter((zone) => zone.id !== zoneId) });
  };

  const saveSharedIrrigationConfiguration = async () => {
    if (!canConfigureApps || !appConfigurationsRepository || !haConnected || !currentUserId) {
      setConfigurationStatus(haConnected ? 'error' : 'offline');
      return;
    }
    const normalized = normalizeIrrigationConfig(irrigationConfigurationDraft);
    const blockingIssues = validateIrrigationConfiguration(normalized, haStates)
      .filter((issue) => issue.severity === 'error');
    if (blockingIssues.length > 0) {
      setConfigurationStatus('ready');
      if (typeof onNotify === 'function') {
        onNotify('warning', t('irrigation.config.errors', { count: blockingIssues.length }));
      }
      return;
    }
    setConfigurationStatus('saving');
    const result = await appConfigurationsRepository.saveAppConfiguration(
      'irrigation',
      normalized,
      configurationRevision,
      currentUserId,
    );
    if (result.status === 'saved') {
      setIrrigationConfig(normalized);
      setIrrigationConfigurationDraft(normalized);
      setConfigurationRevision(result.document.revision);
      setPersistedConfigurationSignature(JSON.stringify(normalized));
      setConfigurationStatus('saved');
      if (typeof onNotify === 'function') onNotify('success', t('irrigation.notify.saved'));
      return;
    }
    if (result.status === 'conflict') {
      setConfigurationRevision(result.current?.revision ?? null);
      setConfigurationStatus('conflict');
      if (typeof onNotify === 'function') onNotify('warning', t('irrigation.notify.conflict'));
      return;
    }
    setConfigurationStatus(result.status);
    if (typeof onNotify === 'function') onNotify('error', t('irrigation.notify.saveFailed'));
  };

  const handleWorkspaceNavigation = (sectionId) => {
    if (!Object.prototype.hasOwnProperty.call(IRRIGATION_SECTION_ROUTES, sectionId)) return;
    if ((sectionId === 'configuration' || sectionId === 'zonesManagement') && !canConfigureApps) return;
    setActiveWorkspaceSection(sectionId);
    onNavigate(IRRIGATION_SECTION_ROUTES[sectionId]);
    window.requestAnimationFrame(() => {
      const root = irrigationProgressRootRef.current;
      const scrollContainer = root?.closest('main') ?? document.querySelector('[data-testid="app-workspace-shell"] main');
      if (typeof scrollContainer?.scrollTo === 'function') {
        scrollContainer.scrollTo({ top: 0, behavior: 'auto' });
      }
    });
  };

  const workspaceNavigationItems = (canConfigureApps
    ? IRRIGATION_WORKSPACE_NAVIGATION
    : IRRIGATION_WORKSPACE_NAVIGATION.filter((item) => item.id !== 'configuration'))
    .map((item) => ({
      ...item,
      label: t(`irrigation.nav.${item.id === 'configuration' ? 'settings' : item.id}`),
    }));

  return (
    <AppWorkspaceShell
      appName={t('irrigation.appName')}
      appSubtitle={t('irrigation.appSubtitle')}
      appIcon={Sprout}
      accentColor="#34d399"
      navigationItems={workspaceNavigationItems}
      activeNavigationId={activeWorkspaceSection === 'zonesManagement' ? 'zones' : activeWorkspaceSection}
      onNavigationChange={handleWorkspaceNavigation}
      onBack={() => onNavigate('/appgallery')}
      statusLabel={haConnected ? t('irrigation.status.connected') : t('irrigation.status.local')}
      mobileHeaderOverlay={!isEditMode && !['configuration', 'zonesManagement'].includes(activeWorkspaceSection)}
      mobileHeaderHidden
      mobileBackInNavigation
      mobileNavigationHidden={activeWorkspaceSection === 'configuration' || activeWorkspaceSection === 'zonesManagement'}
      contentClassName="bg-[color:var(--ui-bg-grouped)] md:bg-transparent"
      backLabel={t('irrigation.backLibrary')}
    >
      {activeWorkspaceSection === 'configuration' ? (
        <IrrigationConfigurationPage
          config={irrigationConfigurationDraft}
          canConfigure={canConfigureApps}
          status={configurationStatus}
          revision={configurationRevision}
          hasUnsavedChanges={hasUnsavedConfigurationChanges}
          binarySensorOptions={binarySensorOptions}
          weatherOptions={weatherOptions}
          sensorOptions={sensorOptions}
          zoneEntityOptions={zoneEntityOptions}
          entityStates={haStates}
          onFieldChange={updateConfigurationDraftField}
          onApplySuggestedConfiguration={applySuggestedIrrigationConfiguration}
          onSave={() => {
            void saveSharedIrrigationConfiguration();
          }}
          onBack={() => handleWorkspaceNavigation('overview')}
        />
      ) : activeWorkspaceSection === 'zonesManagement' ? (
        <IrrigationZonesManagementPage
          config={irrigationConfigurationDraft}
          canConfigure={canConfigureApps}
          status={configurationStatus}
          hasUnsavedChanges={hasUnsavedConfigurationChanges}
          sensorOptions={sensorOptions}
          zoneEntityOptions={zoneEntityOptions}
          entityStates={haStates}
          onZoneChange={updateZoneConfigurationField}
          onAddZone={addConfigurationZone}
          onRemoveZone={removeZone}
          onMoveZone={moveConfigurationZone}
          onSave={() => {
            void saveSharedIrrigationConfiguration();
          }}
          onBack={() => handleWorkspaceNavigation('zones')}
        />
      ) : (
      <>
      <motion.div
        ref={irrigationProgressRootRef}
        data-testid="irrigation-progressive-root"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className={`relative isolate grid min-h-full content-start grid-cols-1 bg-[color:var(--ui-bg-grouped)] pb-6 md:bg-transparent xl:grid-cols-12 ${activeWorkspaceSection === 'overview' ? 'gap-0 md:gap-5 md:px-6 md:pt-6 lg:px-8 xl:px-10' : 'gap-4 px-3 pt-[calc(env(safe-area-inset-top)+1rem)] sm:px-5 md:gap-5 md:px-6 md:pt-6 lg:px-8 xl:px-10'}`}
        style={{ '--irrigation-scroll-progress': 0 }}
      >
        <motion.section
          id="irrigation-overview"
          variants={cardVariants}
          className={`relative scroll-mt-5 overflow-hidden xl:col-span-8 ${activeWorkspaceSection !== 'overview' ? 'hidden' : isEditMode ? 'mx-3 mt-3 rounded-[2rem] border border-white/10 bg-[#071723] p-6 text-white backdrop-blur-3xl md:mx-0 md:mt-0 lg:p-8' : 'sticky top-0 z-0 md:static'}`}
        >
          {isEditMode ? <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-sky-500/15 blur-[90px]" /> : null}

          {isEditMode ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-white/55">Config Panel 1</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Master Control</h2>
                  <p className="mt-1 text-sm text-white/55">
                    Configura sensore pioggia, sorgente meteo, umidita aria e temperatura esterna.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={resetIrrigationConfig}
                  className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs uppercase tracking-[0.14em] text-white/75 transition-colors hover:bg-white/10"
                >
                  Reset Config
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-4">
                {[
                  {
                    key: 'rainSensorEntityId',
                    label: 'Sensore Pioggia',
                    options: buildEntityOptions(binarySensorOptions, irrigationConfig.rainSensorEntityId),
                  },
                  {
                    key: 'weatherEntityId',
                    label: 'Sorgente Meteo',
                    options: buildEntityOptions(weatherOptions, irrigationConfig.weatherEntityId),
                  },
                  {
                    key: 'humidityEntityId',
                    label: 'Sensore Umidita Aria',
                    options: buildEntityOptions(sensorOptions, irrigationConfig.humidityEntityId),
                  },
                  {
                    key: 'outdoorTempEntityId',
                    label: 'Sensore Temperatura Esterna',
                    options: buildEntityOptions(sensorOptions, irrigationConfig.outdoorTempEntityId),
                  },
                ].map((field) => (
                  <label key={field.key} className="block">
                    <span className="text-xs uppercase tracking-[0.16em] text-white/55">{field.label}</span>
                    <input
                      type="text"
                      value={irrigationConfig[field.key]}
                      onChange={(event) => updateConfigField(field.key, event.target.value)}
                      list={`edit-master-${field.key}-options`}
                      placeholder="Scrivi entity_id o scegli dai suggerimenti"
                      autoComplete="off"
                      spellCheck={false}
                      className="mt-2 w-full rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/35 focus:border-cyan-300/40"
                    />
                    <datalist id={`edit-master-${field.key}-options`}>
                      {field.options.map((entityId) => (
                        <option
                          key={`edit-master-${field.key}-${entityId}`}
                          value={entityId}
                          label={formatSelectOptionLabel(entityId, haStates)}
                        />
                      ))}
                    </datalist>
                  </label>
                ))}
              </div>

              {!haConnected ? (
                <p className="rounded-xl border border-amber-300/30 bg-amber-400/12 px-3 py-2 text-xs text-amber-100">
                  Home Assistant non connesso: visualizzi dati demo e configurazione locale.
                </p>
              ) : null}
            </div>
          ) : (
            <IrrigationHero
              masterTitle={masterTitle}
              masterIsRunning={masterIsRunning}
              masterIsStopped={masterIsStopped}
              temperature={outdoorTempValue}
              humidity={humidityValue}
              rainProbability={rainForecastProbability}
              rainStatusLabel={rainStatusLabel}
              rainSummaryTitle={rainSummaryTitle}
              rainSummaryDescription={rainSummaryDescription}
              rainSensorEnabled={rainSensorEnabled}
              rainSensorSyncing={isRainSensorSyncing}
              onRainSensorToggle={() => {
                void handleRainSensorToggle();
              }}
              onPrimaryAction={handleMasterPrimaryAction}
              onStop={handleMasterStop}
            />
          )}
        </motion.section>

        <div
          data-testid="irrigation-progressive-sheet"
          className={activeWorkspaceSection === 'overview'
            ? 'sticky top-[calc(env(safe-area-inset-top)+0.5rem)] z-10 isolate -mt-28 min-h-[calc(100svh-env(safe-area-inset-top)-7.75rem)] rounded-t-[2rem] pb-4 pt-4 shadow-[0_-12px_34px_rgba(2,6,23,0.12)] md:contents md:min-h-0 md:rounded-none md:pb-0 md:pt-0 md:shadow-none'
            : 'contents'}
        >
          {activeWorkspaceSection === 'overview' ? <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-20 overflow-hidden rounded-t-[2rem] md:hidden"
            style={{
              background: 'linear-gradient(180deg, transparent 0%, color-mix(in srgb, var(--ui-bg-grouped) 62%, transparent) 8rem, var(--ui-bg-grouped) 15rem)',
            }}
          /> : null}
          {activeWorkspaceSection === 'overview' ? <div
            data-testid="irrigation-progressive-sheet-backdrop"
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 rounded-t-[2rem] bg-[color:var(--ui-bg-grouped)] motion-reduce:!opacity-100 md:hidden"
            style={{ opacity: 'calc(var(--irrigation-scroll-progress) * 0.96)' }}
          /> : null}

          {activeWorkspaceSection === 'overview' ? <div className="relative z-10 mx-3 mb-3 md:hidden">
            <IrrigationMobileOverview
              masterTitle={masterTitle}
              masterIsRunning={masterIsRunning}
              masterIsStopped={masterIsStopped}
              temperature={outdoorTempValue}
              humidity={humidityValue}
              rainProbability={rainForecastProbability}
              rainStatusLabel={rainStatusLabel}
              rainSummaryTitle={rainSummaryTitle}
              rainSummaryDescription={rainSummaryDescription}
              rainSensorEnabled={rainSensorEnabled}
              rainSensorSyncing={isRainSensorSyncing}
              onRainSensorToggle={() => {
                void handleRainSensorToggle();
              }}
              onPrimaryAction={handleMasterPrimaryAction}
              onStop={handleMasterStop}
              onConfigure={canConfigureApps ? () => handleWorkspaceNavigation('configuration') : undefined}
            />
          </div> : null}

          {activeWorkspaceSection === 'zones' ? (
            <IrrigationRouteHeader
              eyebrow={t('irrigation.route.eyebrow')}
              title={t('irrigation.route.zonesTitle')}
              description={t('irrigation.route.zonesDescription')}
              action={canConfigureApps ? (
                <button type="button" onClick={() => handleWorkspaceNavigation('zonesManagement')} className="liquid-glass-control inline-flex min-h-10 items-center gap-2 rounded-full px-3.5 text-xs font-semibold" aria-label={t('irrigation.action.manageZones')}>
                  <Settings2 className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('irrigation.action.manage')}</span>
                </button>
              ) : null}
            />
          ) : null}

          {activeWorkspaceSection === 'calendar' ? (
            <>
              <IrrigationRouteHeader
                eyebrow={t('irrigation.calendar.programming')}
                title={t('irrigation.route.calendarTitle')}
                description={t('irrigation.route.calendarDescription')}
                action={canConfigureApps ? (
                  <button type="button" onClick={() => handleWorkspaceNavigation('configuration')} className="liquid-glass-control flex h-10 w-10 items-center justify-center rounded-full" aria-label={t('irrigation.configure')}>
                    <Settings2 className="h-4 w-4" />
                  </button>
                ) : null}
              />
              <motion.section variants={cardVariants} className="xl:col-span-12">
                <IrrigationCalendarPage
                  zones={calendarZones}
                  rainProtectionActive={rainSensorEnabled}
                  rainDetected={Boolean(rainSensorEntityId && !rainSensorUnavailable && rainSensorActive)}
                  onOpenProgram={openZoneConfigModal}
                  onOpenSettings={canConfigureApps ? () => handleWorkspaceNavigation('configuration') : undefined}
                />
              </motion.section>
            </>
          ) : null}

          {activeWorkspaceSection === 'usage' ? (
            <IrrigationRouteHeader
              eyebrow={t('irrigation.usage.water')}
              title={t('irrigation.route.usageTitle')}
              description={t('irrigation.route.usageDescription')}
            />
          ) : null}

        <motion.section
          variants={cardVariants}
          className={`${activeWorkspaceSection !== 'overview' ? 'hidden' : ''} xl:col-span-4 ${isEditMode ? 'mx-3 mb-3 rounded-[2rem] border border-white/10 bg-[#071723] p-6 text-center text-white backdrop-blur-3xl md:mx-0 md:mb-0 lg:p-8' : 'mx-3 mb-3 md:mx-0 md:mb-0'}`}
        >
          {isEditMode ? (
            <div className="flex h-full flex-col justify-between text-left">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-white/55">Config Panel 2</p>
                <h3 className="mt-2 text-xl font-semibold text-white">Umidita Terreno</h3>
                <p className="mt-1 text-sm text-white/55">
                  Seleziona il sensore per alimentare il gauge di umidita del terreno.
                </p>
              </div>

              <label className="mt-5 block">
                <span className="text-xs uppercase tracking-[0.16em] text-white/55">Sensore Umidita Terreno</span>
                <input
                  type="text"
                  value={irrigationConfig.soilMoistureEntityId}
                  onChange={(event) => updateConfigField('soilMoistureEntityId', event.target.value)}
                  list="edit-soil-moisture-options"
                  placeholder="sensor.soil_moisture"
                  autoComplete="off"
                  spellCheck={false}
                  className="mt-2 w-full rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/35 focus:border-cyan-300/40"
                />
                <datalist id="edit-soil-moisture-options">
                  {buildEntityOptions(sensorOptions, irrigationConfig.soilMoistureEntityId).map((entityId) => (
                    <option key={`edit-soil-${entityId}`} value={entityId} label={formatSelectOptionLabel(entityId, haStates)} />
                  ))}
                </datalist>
              </label>
            </div>
          ) : (
            <div className="h-full xl:grid xl:grid-rows-2 xl:gap-5">
              <IrrigationMoistureCard value={moisturePct} description={moistureText} />
              <div className="hidden min-h-0 xl:block">
                <IrrigationScheduleSnapshotCard
                  items={overviewScheduleItems}
                  onOpen={() => handleWorkspaceNavigation('calendar')}
                />
              </div>
            </div>
          )}
        </motion.section>

        <motion.section
          variants={cardVariants}
          className={`${activeWorkspaceSection !== 'overview' ? 'hidden' : ''} mx-3 mb-3 md:mx-0 md:mb-0 xl:col-span-8`}
        >
          <IrrigationZonesSnapshotCard
            zones={zones}
            nextCycleLabel={overviewNextCycleLabel}
            onOpen={() => handleWorkspaceNavigation('zones')}
          />
        </motion.section>

        <motion.section
          variants={cardVariants}
          className={`${activeWorkspaceSection !== 'overview' ? 'hidden' : ''} mx-3 mb-3 md:mx-0 md:mb-0 xl:col-span-4`}
        >
          <IrrigationConsumptionSnapshotCard
            usage={waterUsageLiters}
            average={waterAverageLiters}
            savingsLabel={savingsLabel}
            positiveSavings={isPositiveSavings}
            bars={WATER_USAGE_BARS}
            onOpen={() => handleWorkspaceNavigation('usage')}
          />
        </motion.section>

        <motion.section
          id="irrigation-zones"
          variants={cardVariants}
          className={`scroll-mt-5 ${activeWorkspaceSection !== 'zones' ? 'hidden' : ''} xl:col-span-12 ${isEditMode ? 'rounded-[2rem] border border-white/10 bg-[#071723] p-6 text-white backdrop-blur-3xl lg:p-8' : ''}`}
        >
          {isEditMode ? (
            <>
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-white/55">Config Panel 3</p>
                  <h3 className="mt-2 text-2xl font-semibold text-white">Controllo Zone</h3>
                  <p className="mt-1 text-sm text-white/50">{`${configuredZonesCount} settori configurati`}</p>
                </div>
                <button
                  type="button"
                  onClick={addZone}
                  className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/30 bg-cyan-400/12 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100 transition-colors hover:bg-cyan-400/20"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Nuova Zona</span>
                </button>
              </div>

              <div className="space-y-3">
                {irrigationConfig.zones.map((zone, index) => {
                  const fieldKey = `zone-editor-${zone.id}-${index}`;
                  const options = buildEntityOptions(zoneEntityOptions, zone.entityId);

                  return (
                    <div key={fieldKey} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                        <label className="block">
                          <span className="text-xs uppercase tracking-[0.14em] text-white/55">{`Nome Zona ${index + 1}`}</span>
                          <input
                            type="text"
                            value={zone.name ?? ''}
                            onChange={(event) => updateZoneName(zone.id, event.target.value)}
                            placeholder="Es. Prato Sud"
                            autoComplete="off"
                            spellCheck={false}
                            className="mt-2 w-full rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/35 focus:border-cyan-300/40"
                          />
                        </label>

                        <label className="block">
                          <span className="text-xs uppercase tracking-[0.14em] text-white/55">Entity Zona</span>
                          <input
                            type="text"
                            value={zone.entityId ?? ''}
                            onChange={(event) => updateZoneEntity(zone.id, event.target.value)}
                            list={`${fieldKey}-entity-options`}
                            placeholder="switch.irrigation_zona_x"
                            autoComplete="off"
                            spellCheck={false}
                            className="mt-2 w-full rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/35 focus:border-cyan-300/40"
                          />
                          <datalist id={`${fieldKey}-entity-options`}>
                            {options.map((entityId) => (
                              <option
                                key={`${fieldKey}-${entityId}`}
                                value={entityId}
                                label={formatSelectOptionLabel(entityId, haStates)}
                              />
                            ))}
                          </datalist>
                        </label>

                        <div className="xl:col-span-2">
                          <span className="text-xs uppercase tracking-[0.14em] text-white/55">Icona Zona</span>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {IRRIGATION_ZONE_ICON_OPTIONS.map((option) => {
                              const OptionIcon = option.icon;
                              const selected = (zone.iconKey ?? DEFAULT_NEW_ZONE_ICON_KEY) === option.key;
                              return (
                                <button
                                  key={`${fieldKey}-icon-${option.key}`}
                                  type="button"
                                  onClick={() => updateZoneIcon(zone.id, option.key)}
                                  aria-pressed={selected}
                                  title={option.label}
                                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors ${
                                    selected
                                      ? 'border-cyan-300/45 bg-cyan-400/20 text-cyan-100'
                                      : 'border-white/12 bg-white/[0.04] text-white/70 hover:text-white'
                                  }`}
                                >
                                  <OptionIcon className="h-3.5 w-3.5" />
                                  <span>{option.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[color:var(--ui-text-tertiary)]">{t('irrigation.route.sectors')}</p>
                    <h2 className="mt-0.5 text-xl font-semibold tracking-[-0.035em] text-[color:var(--ui-text-primary)]">{t('irrigation.route.yourZones')}</h2>
                  </div>
                  <span className="rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-2.5 py-1 text-[10px] font-semibold text-[color:var(--ui-text-secondary)]">
                    {configuredZonesCount}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3 lg:gap-3 xl:grid-cols-4">
                  {zones.map((zone) => (
                    <IrrigationZoneCard
                      key={`mobile-${zone.id}`}
                      zone={zone}
                      onProgram={() => openZoneConfigModal(zone.id)}
                      onDurationChange={(value) => updateZoneManualDuration(zone.id, value)}
                      onManualToggle={() => {
                        if (zone.isManualActive) {
                          void stopZoneManualMode(zone);
                          return;
                        }
                        void startZoneManualMode(zone);
                      }}
                    />
                  ))}
                </div>
              </div>

              {false ? (
              <div className="hidden">
              <div className="mb-6 flex items-end justify-between gap-4">
                <div>
                  <h3 className="text-2xl font-semibold text-white">Controllo Zone</h3>
                  <p className="text-sm text-white/50">{`${configuredZonesCount} settori configurati`}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => console.log('Open irrigation map')}
                    className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-cyan-200 transition-colors hover:bg-white/10"
                  >
                    <span>Vedi Mappa</span>
                    <MapPinned className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {zones.map((zone) => {
                  const Icon = zone.icon;
                  const isAlert = zone.status === 'alert';
                  const isActive = zone.status === 'active';
                  const isScheduled = zone.status === 'scheduled';

                  const rowClassName = isActive
                    ? 'border-cyan-300/30 bg-cyan-400/10 shadow-[0_0_32px_-14px_rgba(34,211,238,0.55)]'
                    : isAlert
                      ? 'border-rose-300/25 bg-rose-500/10'
                      : isScheduled
                        ? 'border-amber-300/25 bg-amber-500/10'
                        : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]';

                  const detailClassName = isAlert
                    ? 'text-rose-200/90'
                    : isActive
                      ? 'text-cyan-200/95'
                      : isScheduled
                        ? 'text-amber-200/90'
                        : 'text-white/50';
                  const manualButtonActive = zone.isManualActive;
                  const manualButtonLabel = manualButtonActive ? 'Arresta' : 'Avvia';
                  const ManualButtonIcon = manualButtonActive ? Square : Play;
                  const manualProgressPct = manualButtonActive ? zone.progress : 0;
                  const manualCountdownLabel = manualButtonActive
                    ? zone.manualRemainingSeconds > 5999
                      ? `${Math.ceil(zone.manualRemainingSeconds / 60)}m`
                      : formatCountdownLabel(zone.manualRemainingSeconds)
                    : '';
                  const ringRadius = 20;
                  const ringCircumference = 2 * Math.PI * ringRadius;
                  const ringDashOffset = ringCircumference * (1 - clamp(manualProgressPct, 0, 100) / 100);
                  const hasZoneEntityConfigured = Boolean(normalizeEntityId(zone.entityId));
                  const hasIncompleteConfig = !hasZoneEntityConfigured;
                  const manualActionDisabled = isAlert || hasIncompleteConfig;
                  const programButtonDisabled = hasIncompleteConfig;
                  const iconRingTrackColor = isAlert
                    ? 'rgba(251,113,133,0.28)'
                    : isScheduled
                      ? 'rgba(251,191,36,0.26)'
                      : 'rgba(255,255,255,0.16)';
                  const iconRingProgressColor = isAlert
                    ? 'rgba(251,113,133,0.95)'
                    : isScheduled
                      ? 'rgba(251,191,36,0.95)'
                      : 'rgba(34,211,238,0.98)';
                  const iconCoreClassName = isActive
                    ? 'border-cyan-300/30 bg-cyan-400/20 text-cyan-200'
                    : isAlert
                      ? 'border-rose-300/25 bg-rose-400/20 text-rose-200'
                      : isScheduled
                        ? 'border-amber-300/25 bg-amber-400/20 text-amber-200'
                        : 'border-white/10 bg-white/5 text-white/60';

                  return (
                    <div
                      key={zone.id}
                      className={`rounded-2xl border p-4 transition-colors ${rowClassName}`}
                    >
                      <div className="flex items-center gap-3 overflow-x-auto pb-1">
                        <div className="relative h-11 w-11 shrink-0">
                          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 44 44" aria-hidden>
                            <circle
                              cx="22"
                              cy="22"
                              r={ringRadius}
                              fill="none"
                              stroke={iconRingTrackColor}
                              strokeWidth="2.5"
                            />
                            {manualButtonActive ? (
                              <circle
                                cx="22"
                                cy="22"
                                r={ringRadius}
                                fill="none"
                                stroke={iconRingProgressColor}
                                strokeWidth="2.8"
                                strokeLinecap="round"
                                strokeDasharray={ringCircumference}
                                strokeDashoffset={ringDashOffset}
                                style={{ transition: 'stroke-dashoffset 0.9s linear' }}
                              />
                            ) : null}
                          </svg>
                          <span
                            className={`absolute inset-[3px] inline-flex items-center justify-center rounded-full border ${iconCoreClassName}`}
                          >
                            {manualButtonActive ? (
                              <span className="text-[9px] font-semibold leading-none tabular-nums text-cyan-100">
                                {manualCountdownLabel}
                              </span>
                            ) : (
                              <Icon className="h-5 w-5" />
                            )}
                          </span>
                        </div>

                        <div className="flex min-w-max flex-1 items-center gap-2">
                          <div className="min-w-[170px]">
                            <p className="font-semibold text-white whitespace-nowrap">{zone.name}</p>
                            <p className={`text-[11px] whitespace-nowrap ${detailClassName}`}>{zone.detail}</p>
                            {hasIncompleteConfig ? (
                              <p className="mt-1 text-[10px] text-amber-200/95">
                                Configurazione incompleta nell&apos;Edit Mode
                              </p>
                            ) : null}
                          </div>

                          <div className="ml-auto flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openZoneConfigModal(zone.id)}
                              disabled={programButtonDisabled}
                              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors ${
                                programButtonDisabled
                                  ? 'cursor-not-allowed border-white/10 bg-white/5 text-white/40'
                                  : 'border-cyan-300/35 bg-cyan-400/15 text-cyan-100 hover:bg-cyan-400/25'
                              }`}
                              aria-label={`Programma ${zone.name}`}
                            >
                              <Clock3 className="h-3.5 w-3.5" />
                              <span>Programma</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => updateZoneManualDuration(zone.id, zone.manualDurationMin - 1)}
                              disabled={isAlert || zone.manualDurationMin <= 1}
                              className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/15 text-white/75 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                              aria-label={`Riduci timer ${zone.name}`}
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="min-w-[2.2rem] text-center text-xs font-semibold text-white">
                              {zone.manualDurationMin}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateZoneManualDuration(zone.id, zone.manualDurationMin + 1)}
                              disabled={isAlert || zone.manualDurationMin >= irrigationConfig.maximumManualDurationMin}
                              className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/15 text-white/75 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                              aria-label={`Aumenta timer ${zone.name}`}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                if (manualButtonActive) {
                                  void stopZoneManualMode(zone);
                                  return;
                                }
                                void startZoneManualMode(zone);
                              }}
                              disabled={manualActionDisabled}
                              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors ${
                                manualActionDisabled
                                  ? 'cursor-not-allowed border-white/10 bg-white/5 text-white/40'
                                  : manualButtonActive
                                    ? 'border-rose-300/35 bg-rose-500/15 text-rose-100 hover:bg-rose-500/25'
                                    : 'border-cyan-300/35 bg-cyan-400/15 text-cyan-100 hover:bg-cyan-400/25'
                              }`}
                            >
                              <ManualButtonIcon className="h-3.5 w-3.5" />
                              <span>{manualButtonLabel}</span>
                            </button>
                          </div>
                        </div>

                      </div>
                    </div>
                  );
                })}
              </div>
              </div>
              ) : null}
            </>
          )}
        </motion.section>

        <motion.section
          id="irrigation-usage"
          variants={cardVariants}
          className={`scroll-mt-5 ${activeWorkspaceSection !== 'usage' ? 'hidden' : ''} xl:col-span-12`}
        >
          <IrrigationConsumptionPage
            period={consumptionPeriod}
            onPeriodChange={setConsumptionPeriod}
            status={consumptionHistory.status}
            totalLiters={consumptionTotalLiters}
            dailyAverageLiters={consumptionDailyAverageLiters}
            comparisonPct={consumptionComparisonPct}
            points={consumptionHistory.points}
            zones={consumptionZoneBreakdown}
            configuredZones={configuredZonesCount}
            plannedMinutes={plannedWeeklyMinutes}
            dataSourceLabel={consumptionDataSourceLabel}
            isRefreshing={Boolean(consumptionHistory.isRefreshing)}
            isStale={Boolean(consumptionHistory.isStale)}
            updatedAt={consumptionHistory.updatedAt}
            isEstimatedBreakdown={consumptionTotalLiters !== null}
            onOpenSettings={canConfigureApps ? () => handleWorkspaceNavigation('configuration') : undefined}
            onManageZones={canConfigureApps ? () => handleWorkspaceNavigation('zonesManagement') : undefined}
          />
        </motion.section>
        </div>
      </motion.div>

      <ZoneConfigModal
        isOpen={isConfigOpen}
        zoneConfig={editingZoneConfig}
        onClose={closeZoneConfigModal}
        onSave={() => {
          void handleSaveZoneProgramming();
        }}
        onToggleDay={handleEditingZoneToggleDay}
        onStartTimeChange={handleEditingZoneStartTimeChange}
        onAddStartTime={handleEditingZoneAddStartTime}
        onRemoveStartTime={handleEditingZoneRemoveStartTime}
        onBaseDurationChange={handleEditingZoneBaseDurationChange}
      />
      </>
      )}
    </AppWorkspaceShell>
  );
}

function ComingSoonPortalView({ view, onNavigate = navigateTo }) {
  const { t } = useI18n();
  const titleByView = {
    technical: t('apps.portal.technical.title'),
    pool: t('apps.portal.pool.title'),
  };
  const title = titleByView[view] ?? t('apps.gallery.board');
  const description = view === 'pool'
    ? t('apps.portal.pool.description')
    : view === 'technical'
      ? t('apps.portal.technical.description')
      : t('apps.gallery.domusBoard');
  const PortalIcon = view === 'pool' ? Waves : Cpu;

  return (
    <AppWorkspaceShell
      appName={title}
      appSubtitle={description}
      appIcon={PortalIcon}
      accentColor={view === 'pool' ? '#22d3ee' : '#38bdf8'}
      navigationItems={COMING_SOON_WORKSPACE_NAVIGATION.map((item) => ({ ...item, label: t('irrigation.nav.overview') }))}
      activeNavigationId="overview"
      onNavigationChange={() => undefined}
      onBack={() => onNavigate('/appgallery')}
      statusLabel={t('apps.gallery.demoSoon')}
      mobileHeaderHidden
      mobileBackInNavigation
      contentClassName="bg-[color:var(--ui-bg-grouped)]"
      backLabel={t('irrigation.backLibrary')}
    >
      <ComingSoonAppDemo variant={view === 'pool' ? 'pool' : 'technical'} />
    </AppWorkspaceShell>
  );
}

/**
 * @typedef {Object} AppGalleryProps
 * @property {boolean=} canConfigureApps
 * @property {string | null=} currentUserId
 * @property {boolean=} suppressBrowserNavigation
 * @property {string=} navigationRoute
 * @property {boolean=} haConnected
 * @property {'real' | 'demo'=} runtimeMode
 * @property {Record<string, unknown>=} haStates
 * @property {string[]=} haEntityIds
 * @property {string=} haUrl
 * @property {string=} haToken
 * @property {(domain: string, service: string, serviceData?: Record<string, unknown>) => Promise<unknown>} [onCallService]
 * @property {(message: Record<string, unknown>, options?: { reportError?: boolean }) => Promise<unknown>} [onCallApi]
 * @property {(notification: unknown) => void} [onNotify]
 * @property {(path: string) => void} [onNavigate]
 */

/**
 * @param {AppGalleryProps} [props]
 */
export function AppGallery({
  canConfigureApps = false,
  currentUserId = null,
  runtimeMode = 'real',
  suppressBrowserNavigation = false,
  navigationRoute = '',
  haConnected = false,
  haStates = {},
  haEntityIds = [],
  haUrl = '',
  haToken = '',
  onCallService,
  onCallApi,
  onNotify,
  onNavigate: externalOnNavigate,
} = {}) {
  const [activeView, setActiveView] = React.useState(resolveAppGalleryViewFromLocation);
  const handleNavigate = React.useCallback(
    (path) => {
      if (typeof externalOnNavigate === 'function') {
        setActiveView(resolveAppGalleryViewFromTarget(path));
        externalOnNavigate(path);
        return;
      }
      if (suppressBrowserNavigation) {
        setActiveView(resolveAppGalleryViewFromTarget(path));
        return;
      }
      navigateTo(path);
    },
    [externalOnNavigate, suppressBrowserNavigation],
  );

  React.useEffect(() => {
    if (suppressBrowserNavigation) {
      return undefined;
    }
    const syncView = () => {
      setActiveView(resolveAppGalleryViewFromLocation());
    };
    window.addEventListener('popstate', syncView);
    window.addEventListener('hashchange', syncView);
    return () => {
      window.removeEventListener('popstate', syncView);
      window.removeEventListener('hashchange', syncView);
    };
  }, [suppressBrowserNavigation]);

  React.useEffect(() => {
    if (!suppressBrowserNavigation || !navigationRoute) {
      return;
    }
    setActiveView(resolveAppGalleryViewFromTarget(navigationRoute));
  }, [navigationRoute, suppressBrowserNavigation]);

  return (
    <div
      className={activeView === 'launcher'
        ? 'dashboard-page-scroll relative bg-transparent custom-scrollbar'
        : 'relative h-full min-h-0 w-full overflow-hidden bg-transparent'}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--ui-bg-canvas)_22%,transparent),transparent_36%,color-mix(in_srgb,var(--ui-bg-grouped)_28%,transparent)_100%)]"
      />

      {activeView === 'launcher' ? (
        <LauncherView onNavigate={handleNavigate} />
      ) : activeView === 'irrigation' ? (
        <IrrigationDashboardView
          canConfigureApps={canConfigureApps}
          currentUserId={currentUserId}
          runtimeMode={runtimeMode}
          haConnected={haConnected}
          haStates={haStates}
          haEntityIds={haEntityIds}
          haUrl={haUrl}
          haToken={haToken}
          onCallService={onCallService}
          onCallApi={onCallApi}
          onNotify={onNotify}
          navigationRoute={navigationRoute}
          onNavigate={handleNavigate}
        />
      ) : (
        <ComingSoonPortalView
          view={activeView}
          onNavigate={handleNavigate}
        />
      )}
    </div>
  );
}

export default AppGallery;


