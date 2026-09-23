export type WidgetKind =
  | 'light'
  | 'switch'
  | 'fan'
  | 'humidifier'
  | 'climate'
  | 'camera'
  | 'sensor'
  | 'media'
  | 'alarm'
  | 'vacuum'
  | 'lock'
  | 'cover'
  | 'calendar'
  | 'members';
export type SectionKind = 'greeting' | 'weather' | 'scenes' | 'stack-vertical' | 'stack-horizontal' | 'stack-grid';
export type WidgetCatalogDestination =
  | { type: 'canvas' }
  | { type: 'stack'; sectionId: string };
export type WeatherLayoutMode = 'auto' | 'card' | 'chip';
export type WeatherUnit = 'C' | 'F';
export type ForecastDensity = 'comfortable' | 'compact';
export type WeatherForecastType = 'daily' | 'hourly' | 'twice_daily';
export type WeatherSecondaryInfo =
  | 'auto'
  | 'precipitation'
  | 'wind'
  | 'humidity'
  | 'pressure'
  | 'visibility'
  | 'uv_index'
  | 'cloud_coverage'
  | 'dew_point'
  | 'condition'
  | 'range';
export type SceneKey = 'music' | 'going-out' | 'night' | 'movie' | 'sleep' | 'arrive' | 'morning';
export type SceneIconKey =
  | 'music'
  | 'person'
  | 'moon'
  | 'film'
  | 'car'
  | 'sun'
  | 'home'
  | 'sparkles'
  | 'bed'
  | 'coffee'
  | 'tv'
  | 'leaf';
export type SceneActionType = 'script' | 'service';

export type SceneActionConfig = {
  type?: SceneActionType;
  scriptEntityId?: string;
  service?: string;
  entityId?: string;
  payloadJson?: string;
};

export type SceneRunState = {
  sceneId: SceneKey;
  startedAt: number;
  actionType: SceneActionType;
  scriptEntityId?: string;
  observedRunning?: boolean;
};

export const ROOT_CANVAS_COLS = 12;
export const ROOT_CANVAS_LEGACY_COLS = 6;
export const ROOT_CANVAS_ROW_UNITS = 2;
export const ROOT_CANVAS_LEGACY_ROW_UNITS = 1;
export const GREETING_SECTION_ROWS = 1;
export const WEATHER_SECTION_BASE_ROWS = 1;
export const WEATHER_SECTION_CHIP_COLS = 2;
export const WEATHER_SECTION_CHIP_ROWS = WEATHER_SECTION_BASE_ROWS;
export const WEATHER_SECTION_CARD_COLS = 4;
export const WEATHER_SECTION_CARD_ROWS = 2;
export const SCENES_SECTION_ROWS = 2;

export type GridItem = {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export interface MicroWidget {
  id: string;
  type:
    | 'value_pill'
    | 'status_glow'
    | 'micro_toggle'
    | 'mini_ring'
    | 'micro_button'
    | 'micro_slider'
    | 'micro_step'
    | 'micro_superchart';
  entity: string;
  label?: string;
  buttonMode?: 'push' | 'switch' | 'page';
  buttonHoldWhilePressed?: boolean;
  buttonPagePath?: string;
  sliderSendOnRelease?: boolean;
  superChartType?: 'line' | 'area' | 'bar';
}

export type Widget = {
  id: string;
  kind: WidgetKind;
  title: string;
  entityId: string;
  /** Explicit authority for this card. Mock sources must never reach Home Assistant APIs. */
  dataSource?: 'ha' | 'mock';
  widgets?: MicroWidget[];
  isFavorite?: boolean;
  placementPolicy?: 'manual' | 'favorites-auto';
  alarmRequireAuthToDisarm?: boolean;
  lockRequireAuthToUnlock?: boolean;
  activityLogLimit?: number;
  activityLogHours?: number;
  sensorBatteryEntityId?: string;
  sensorStatusEntityId?: string;
  sensorConnectionEntityId?: string;
  sensorDisplayPrecision?: number;
  lockBatteryEntityId?: string;
  lockConnectionEntityId?: string;
  switchConsumptionEntityId?: string;
  vacuumFanSpeed?: string;
  vacuumMapUrl?: string;
  vacuumCleanedArea?: number;
  vacuumCleaningMinutes?: number;
  coverTiltPosition?: number;
  status: string;
  isOn: boolean;
  value?: number;
  unit?: string;
  parentSectionId?: string;
  layout: GridItem;
};

export type DashboardSection = {
  id: string;
  kind: SectionKind;
  layout: GridItem;
  title?: string;
  subtitle?: string;
  titleAuto?: boolean;
  subtitleAuto?: boolean;
  showWeather?: boolean;
  weatherLayout?: WeatherLayoutMode;
  weatherUnit?: WeatherUnit;
  weatherShowCondition?: boolean;
  weatherShowPrecipitation?: boolean;
  weatherShowWind?: boolean;
  weatherForecastType?: WeatherForecastType;
  weatherForecastDays?: number;
  weatherForecastDensity?: ForecastDensity;
  weatherSecondaryInfo?: WeatherSecondaryInfo;
  weatherCondition?: string;
  weatherEntityId?: string;
  scenes?: SceneKey[];
  sceneLabels?: Partial<Record<SceneKey, string>>;
  sceneIcons?: Partial<Record<SceneKey, SceneIconKey>>;
  sceneActions?: Partial<Record<SceneKey, SceneActionConfig>>;
  sceneScripts?: Partial<Record<SceneKey, string>>;
  scenesShowBackground?: boolean;
  scenesShowBorder?: boolean;
  stackColumns?: number;
  stackColumnsMode?: 'auto' | 'manual';
  stackShowBackground?: boolean;
  stackShowBorder?: boolean;
  stackShowHeader?: boolean;
  stackUseFavoritesGrid?: boolean;
};

export const WIDGET_CATALOG: Array<{ kind: WidgetKind; label: string }> = [
  { kind: 'light', label: 'Luce' },
  { kind: 'switch', label: 'Switch' },
  { kind: 'fan', label: 'Ventilatore' },
  { kind: 'humidifier', label: 'Umidificatore' },
  { kind: 'climate', label: 'Clima' },
  { kind: 'camera', label: 'Camera' },
  { kind: 'sensor', label: 'Sensore' },
  { kind: 'media', label: 'Media Player' },
  { kind: 'alarm', label: 'Allarme' },
  { kind: 'vacuum', label: 'Vacuum' },
  { kind: 'lock', label: 'Lock' },
  { kind: 'cover', label: 'Tapparella' },
  { kind: 'calendar', label: 'Calendario' },
  { kind: 'members', label: 'Membri' },
];

export const SECTION_CATALOG: Array<{ kind: SectionKind; label: string }> = [
  { kind: 'greeting', label: 'Titolo' },
  { kind: 'scenes', label: 'Scenari' },
  { kind: 'stack-vertical', label: 'Vertical Stack' },
  { kind: 'stack-horizontal', label: 'Horizontal Stack' },
  { kind: 'stack-grid', label: 'Grid Stack' },
];

export const FAVORITES_GRID_TITLE = 'Preferiti';

export function createDefaultSectionLayout(kind: SectionKind, i: string, y: number): GridItem {
  if (kind === 'greeting') {
    return { i, x: 0, y, w: ROOT_CANVAS_COLS, h: WEATHER_SECTION_CARD_ROWS };
  }
  if (kind === 'weather') {
    return { i, x: 0, y, w: WEATHER_SECTION_CARD_COLS, h: WEATHER_SECTION_BASE_ROWS };
  }
  if (kind === 'scenes') {
    return { i, x: 0, y, w: 6, h: SCENES_SECTION_ROWS };
  }
  if (kind === 'stack-vertical') {
    return { i, x: 0, y, w: ROOT_CANVAS_COLS, h: 14 };
  }
  if (kind === 'stack-horizontal') {
    return { i, x: 0, y, w: ROOT_CANVAS_COLS, h: 6 };
  }
  if (kind === 'stack-grid') {
    return { i, x: 0, y, w: ROOT_CANVAS_COLS, h: 10 };
  }
  return { i, x: 0, y, w: 6, h: ROOT_CANVAS_ROW_UNITS * 2 };
}
