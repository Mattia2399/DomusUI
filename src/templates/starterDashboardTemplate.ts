import type { DashboardRuntimeMode } from '../security/dashboardAccess';
import type { MockEntityStateMap } from '../types/ha';
import {
  ROOT_CANVAS_COLS,
  SCENES_SECTION_ROWS,
  WEATHER_SECTION_CARD_ROWS,
  type DashboardSection,
  type GridItem,
  type Widget,
  type WidgetKind,
} from '../types/dashboardModels';
import type {
  DashboardGridBreakpoint,
  DashboardResponsiveLayouts,
} from '../types/widgetTypeLayout';

export const STARTER_DASHBOARD_TEMPLATE_VERSION = 1;

export const STARTER_TEMPLATE_IDS = {
  greeting: 'starter-section-greeting-v1',
  scenes: 'starter-section-scenes-v1',
  climate: 'starter-climate-v1',
  camera: 'starter-camera-v1',
  sensor: 'starter-sensor-v1',
  lock: 'starter-lock-v1',
  alarm: 'starter-alarm-v1',
  media: 'starter-media-v1',
  cover: 'starter-cover-v1',
} as const;

const STARTER_WIDGET_ORDER = [
  'climate',
  'camera',
  'sensor',
  'lock',
  'alarm',
  'media',
  'cover',
] as const satisfies readonly WidgetKind[];

const STARTER_WIDGET_IDS: Record<(typeof STARTER_WIDGET_ORDER)[number], string> = {
  climate: STARTER_TEMPLATE_IDS.climate,
  camera: STARTER_TEMPLATE_IDS.camera,
  sensor: STARTER_TEMPLATE_IDS.sensor,
  lock: STARTER_TEMPLATE_IDS.lock,
  alarm: STARTER_TEMPLATE_IDS.alarm,
  media: STARTER_TEMPLATE_IDS.media,
  cover: STARTER_TEMPLATE_IDS.cover,
};

const ENTITY_DOMAINS: Record<(typeof STARTER_WIDGET_ORDER)[number], string> = {
  climate: 'climate',
  camera: 'camera',
  sensor: 'sensor',
  lock: 'lock',
  alarm: 'alarm_control_panel',
  media: 'media_player',
  cover: 'cover',
};

const DEFAULT_TITLES: Record<(typeof STARTER_WIDGET_ORDER)[number], string> = {
  climate: 'Climate',
  camera: 'Camera',
  sensor: 'Sensor',
  lock: 'Lock',
  alarm: 'Alarm',
  media: 'Media',
  cover: 'Cover',
};

const DEMO_ENTITIES: Record<(typeof STARTER_WIDGET_ORDER)[number], string> = {
  climate: 'climate.air_conditioner',
  camera: 'camera.front_door',
  sensor: 'sensor.living_room_humidity',
  lock: 'lock.front_door',
  alarm: 'alarm_control_panel.home_alarm',
  media: 'media_player.living_room_tv',
  cover: 'cover.living_room_shutter',
};

const XL_LAYOUTS: GridItem[] = [
  { i: STARTER_TEMPLATE_IDS.greeting, x: 0, y: 0, w: 12, h: 2 },
  { i: STARTER_TEMPLATE_IDS.scenes, x: 0, y: 2, w: 12, h: 2 },
  { i: STARTER_TEMPLATE_IDS.climate, x: 0, y: 4, w: 3, h: 3 },
  { i: STARTER_TEMPLATE_IDS.camera, x: 3, y: 4, w: 4, h: 3 },
  { i: STARTER_TEMPLATE_IDS.sensor, x: 7, y: 4, w: 2, h: 3 },
  { i: STARTER_TEMPLATE_IDS.lock, x: 9, y: 4, w: 3, h: 3 },
  { i: STARTER_TEMPLATE_IDS.alarm, x: 0, y: 7, w: 3, h: 3 },
  { i: STARTER_TEMPLATE_IDS.media, x: 3, y: 7, w: 4, h: 3 },
  { i: STARTER_TEMPLATE_IDS.cover, x: 7, y: 7, w: 3, h: 3 },
];

const ROOT_LAYOUTS: Record<DashboardGridBreakpoint, GridItem[]> = {
  '2xl': XL_LAYOUTS,
  xl: XL_LAYOUTS,
  lg: [
    { i: STARTER_TEMPLATE_IDS.greeting, x: 0, y: 0, w: 8, h: 2 },
    { i: STARTER_TEMPLATE_IDS.scenes, x: 0, y: 2, w: 8, h: 2 },
    { i: STARTER_TEMPLATE_IDS.climate, x: 0, y: 4, w: 3, h: 3 },
    { i: STARTER_TEMPLATE_IDS.camera, x: 3, y: 4, w: 5, h: 3 },
    { i: STARTER_TEMPLATE_IDS.sensor, x: 0, y: 7, w: 2, h: 3 },
    { i: STARTER_TEMPLATE_IDS.lock, x: 2, y: 7, w: 3, h: 3 },
    { i: STARTER_TEMPLATE_IDS.alarm, x: 5, y: 7, w: 3, h: 3 },
    { i: STARTER_TEMPLATE_IDS.media, x: 0, y: 10, w: 4, h: 3 },
    { i: STARTER_TEMPLATE_IDS.cover, x: 4, y: 10, w: 4, h: 3 },
  ],
  md: [
    { i: STARTER_TEMPLATE_IDS.greeting, x: 0, y: 0, w: 6, h: 2 },
    { i: STARTER_TEMPLATE_IDS.scenes, x: 0, y: 2, w: 6, h: 2 },
    { i: STARTER_TEMPLATE_IDS.climate, x: 0, y: 4, w: 3, h: 3 },
    { i: STARTER_TEMPLATE_IDS.camera, x: 3, y: 4, w: 3, h: 3 },
    { i: STARTER_TEMPLATE_IDS.sensor, x: 0, y: 7, w: 2, h: 3 },
    { i: STARTER_TEMPLATE_IDS.lock, x: 2, y: 7, w: 2, h: 3 },
    { i: STARTER_TEMPLATE_IDS.alarm, x: 4, y: 7, w: 2, h: 3 },
    { i: STARTER_TEMPLATE_IDS.media, x: 0, y: 10, w: 3, h: 3 },
    { i: STARTER_TEMPLATE_IDS.cover, x: 3, y: 10, w: 3, h: 3 },
  ],
  sm: [
    { i: STARTER_TEMPLATE_IDS.greeting, x: 0, y: 0, w: 4, h: 2 },
    { i: STARTER_TEMPLATE_IDS.scenes, x: 0, y: 2, w: 4, h: 2 },
    { i: STARTER_TEMPLATE_IDS.climate, x: 0, y: 4, w: 4, h: 3 },
    { i: STARTER_TEMPLATE_IDS.camera, x: 0, y: 7, w: 4, h: 3 },
    { i: STARTER_TEMPLATE_IDS.sensor, x: 0, y: 10, w: 2, h: 3 },
    { i: STARTER_TEMPLATE_IDS.lock, x: 2, y: 10, w: 2, h: 3 },
    { i: STARTER_TEMPLATE_IDS.alarm, x: 0, y: 13, w: 4, h: 3 },
    { i: STARTER_TEMPLATE_IDS.media, x: 0, y: 16, w: 4, h: 3 },
    { i: STARTER_TEMPLATE_IDS.cover, x: 0, y: 19, w: 4, h: 3 },
  ],
  xs: [
    { i: STARTER_TEMPLATE_IDS.greeting, x: 0, y: 0, w: 2, h: 2 },
    { i: STARTER_TEMPLATE_IDS.scenes, x: 0, y: 2, w: 2, h: 2 },
    { i: STARTER_TEMPLATE_IDS.climate, x: 0, y: 4, w: 2, h: 3 },
    { i: STARTER_TEMPLATE_IDS.camera, x: 0, y: 7, w: 2, h: 3 },
    { i: STARTER_TEMPLATE_IDS.sensor, x: 0, y: 10, w: 1, h: 3 },
    { i: STARTER_TEMPLATE_IDS.lock, x: 1, y: 10, w: 1, h: 3 },
    { i: STARTER_TEMPLATE_IDS.alarm, x: 0, y: 13, w: 2, h: 3 },
    { i: STARTER_TEMPLATE_IDS.media, x: 0, y: 16, w: 2, h: 3 },
    { i: STARTER_TEMPLATE_IDS.cover, x: 0, y: 19, w: 2, h: 3 },
  ],
};

const LIGHT_INSERT_LAYOUTS: Record<DashboardGridBreakpoint, GridItem> = {
  '2xl': { i: '', x: 10, y: 7, w: 2, h: 2 },
  xl: { i: '', x: 10, y: 7, w: 2, h: 2 },
  lg: { i: '', x: 0, y: 13, w: 2, h: 2 },
  md: { i: '', x: 4, y: 13, w: 2, h: 2 },
  sm: { i: '', x: 0, y: 22, w: 4, h: 2 },
  xs: { i: '', x: 0, y: 22, w: 2, h: 2 },
};

function cloneGridItems(items: readonly GridItem[]) {
  return items.map((item) => ({ ...item }));
}

function createSections(weatherEntityId = ''): DashboardSection[] {
  return [
    {
      id: STARTER_TEMPLATE_IDS.greeting,
      kind: 'greeting',
      layout: { i: STARTER_TEMPLATE_IDS.greeting, x: 0, y: 0, w: ROOT_CANVAS_COLS, h: WEATHER_SECTION_CARD_ROWS },
      showWeather: true,
      weatherLayout: 'auto',
      weatherUnit: 'C',
      weatherShowCondition: true,
      weatherShowPrecipitation: true,
      weatherShowWind: true,
      weatherForecastType: 'daily',
      weatherForecastDays: 4,
      weatherForecastDensity: 'comfortable',
      weatherSecondaryInfo: 'auto',
      ...(weatherEntityId ? { weatherEntityId } : null),
    },
    {
      id: STARTER_TEMPLATE_IDS.scenes,
      kind: 'scenes',
      layout: { i: STARTER_TEMPLATE_IDS.scenes, x: 0, y: 2, w: ROOT_CANVAS_COLS, h: SCENES_SECTION_ROWS },
      scenes: ['music', 'going-out', 'night', 'movie'],
      scenesShowBackground: true,
      scenesShowBorder: true,
    },
  ];
}

function friendlyName(entityId: string, states: MockEntityStateMap) {
  const name = states[entityId]?.rawAttributes?.friendly_name;
  return typeof name === 'string' && name.trim() ? name.trim() : '';
}

function uniqueEntityForDomain(domain: string, states: MockEntityStateMap) {
  const candidates = Object.keys(states).filter((entityId) => {
    if (!entityId.startsWith(`${domain}.`)) return false;
    const state = states[entityId]?.state?.trim().toLowerCase();
    return state !== 'unavailable' && state !== 'unknown';
  });
  return candidates.length === 1 ? candidates[0] : '';
}

function createWidget(
  kind: (typeof STARTER_WIDGET_ORDER)[number],
  runtimeMode: DashboardRuntimeMode,
  states: MockEntityStateMap,
): Widget {
  const demo = runtimeMode === 'demo';
  const entityId = demo ? DEMO_ENTITIES[kind] : uniqueEntityForDomain(ENTITY_DOMAINS[kind], states);
  const baseLayout = XL_LAYOUTS.find((item) => item.i === STARTER_WIDGET_IDS[kind]);
  if (!baseLayout) throw new Error(`Missing starter layout for ${kind}`);

  const common: Widget = {
    id: STARTER_WIDGET_IDS[kind],
    kind,
    title: friendlyName(entityId, states) || DEFAULT_TITLES[kind],
    entityId,
    dataSource: demo ? 'mock' : 'ha',
    placementPolicy: 'manual',
    status: entityId ? 'idle' : 'unavailable',
    isOn: false,
    layout: { ...baseLayout },
  };

  if (!demo) return common;
  if (kind === 'climate') return { ...common, status: 'heating', isOn: true, value: 22, unit: 'C' };
  if (kind === 'camera') return { ...common, status: 'online', isOn: true };
  if (kind === 'sensor') return { ...common, status: 'tracking', isOn: true, value: 48, unit: '%' };
  if (kind === 'lock') return { ...common, status: 'locked', isOn: true };
  if (kind === 'alarm') return { ...common, status: 'disarmed', isOn: false };
  if (kind === 'media') return { ...common, status: 'playing', isOn: true, value: 34, unit: '%' };
  return { ...common, status: 'open', isOn: true, value: 70, unit: '%', coverTiltPosition: 45 };
}

export type StarterDashboardTemplate = {
  version: number;
  sections: DashboardSection[];
  widgets: Widget[];
  responsiveLayouts: DashboardResponsiveLayouts;
};

export function createStarterDashboardTemplate(
  runtimeMode: DashboardRuntimeMode,
  states: MockEntityStateMap = {},
): StarterDashboardTemplate {
  const weatherEntityId = runtimeMode === 'real' ? uniqueEntityForDomain('weather', states) : '';
  return {
    version: STARTER_DASHBOARD_TEMPLATE_VERSION,
    sections: createSections(weatherEntityId),
    widgets: STARTER_WIDGET_ORDER.map((kind) => createWidget(kind, runtimeMode, states)),
    responsiveLayouts: {
      root: Object.fromEntries(
        Object.entries(ROOT_LAYOUTS).map(([breakpoint, items]) => [breakpoint, cloneGridItems(items)]),
      ),
    },
  };
}

export function isStarterDashboardTemplate(
  sections: readonly DashboardSection[],
  widgets: readonly Widget[],
) {
  const ids = new Set([...sections.map((section) => section.id), ...widgets.map((widget) => widget.id)]);
  return ids.has(STARTER_TEMPLATE_IDS.greeting) && ids.has(STARTER_TEMPLATE_IDS.scenes);
}

export function addStarterLightResponsiveLayout(
  layouts: DashboardResponsiveLayouts,
  widgetId: string,
): DashboardResponsiveLayouts {
  const root = { ...(layouts.root ?? {}) };
  (Object.keys(LIGHT_INSERT_LAYOUTS) as DashboardGridBreakpoint[]).forEach((breakpoint) => {
    const existing = root[breakpoint] ?? [];
    if (existing.some((item) => item.i === widgetId)) return;
    root[breakpoint] = [
      ...existing.map((item) => ({ ...item })),
      { ...LIGHT_INSERT_LAYOUTS[breakpoint], i: widgetId },
    ];
  });
  return { ...layouts, root };
}
