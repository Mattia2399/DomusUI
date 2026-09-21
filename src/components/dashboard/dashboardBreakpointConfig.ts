import { GRID_ENGINE_BREAKPOINTS } from './DashboardGrid';
import type { WidgetKind } from '../../types/dashboardModels';
import {
  DASHBOARD_GRID_BREAKPOINT_ORDER,
  type WidgetTypeBreakpointLayoutOverride,
  type WidgetTypeLayoutOverrides,
} from '../../types/widgetTypeLayout';
import {
  ALARM_CARD_CAPABILITY,
  CAMERA_CARD_CAPABILITY,
  CLIMATE_CARD_CAPABILITY,
  COVER_CARD_CAPABILITY,
  FAN_CARD_CAPABILITY,
  HUMIDIFIER_CARD_CAPABILITY,
  LIGHT_CARD_CAPABILITY,
  LOCK_CARD_CAPABILITY,
  MEMBERS_CARD_CAPABILITY,
  MEDIA_CARD_CAPABILITY,
  SENSOR_CARD_CAPABILITY,
  SWITCH_CARD_CAPABILITY,
  VACUUM_CARD_CAPABILITY,
} from '../widgets/cardCapabilityRegistry';

export type GridEngineBreakpoint = keyof typeof GRID_ENGINE_BREAKPOINTS;
export type BreakpointCardDensity = 'tiny' | 'compact' | 'regular';

type WidgetSpan = { w: number; h: number };
type LightWidgetSpan = { w: number; hOff: number; hOn: number; autoExpand?: boolean };
type SectionSpan = { w: number; h: number };

const WIDGET_KIND_ORDER: WidgetKind[] = [
  'light',
  'switch',
  'fan',
  'humidifier',
  'climate',
  'camera',
  'sensor',
  'media',
  'alarm',
  'vacuum',
  'lock',
  'cover',
  'members',
];
const GRID_BREAKPOINTS: readonly GridEngineBreakpoint[] = DASHBOARD_GRID_BREAKPOINT_ORDER;

let activeWidgetTypeLayoutOverrides: WidgetTypeLayoutOverrides = {};

function toPositiveInt(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(1, Math.round(value));
}

function resolveLockMinimumHeight(breakpoint: GridEngineBreakpoint) {
  void breakpoint;
  return 1;
}

function isMobileGridBreakpoint(breakpoint: GridEngineBreakpoint) {
  return breakpoint === 'xs' || breakpoint === 'sm';
}

function resolveMinimumWidth(kind: WidgetKind | string, breakpoint: GridEngineBreakpoint) {
  return kind === 'cover' && !isMobileGridBreakpoint(breakpoint) ? 2 : 1;
}

function clampLockHeight(height: number | undefined, breakpoint: GridEngineBreakpoint) {
  if (height === undefined) {
    return undefined;
  }
  return Math.max(resolveLockMinimumHeight(breakpoint), height);
}

function normalizeBreakpointOverride(raw: WidgetTypeBreakpointLayoutOverride | undefined) {
  if (!raw) {
    return undefined;
  }
  const w = toPositiveInt(raw.w);
  const h = toPositiveInt(raw.h);
  const hOn = toPositiveInt(raw.hOn);
  const hOff = toPositiveInt(raw.hOff);
  const autoExpand = typeof raw.autoExpand === 'boolean' ? raw.autoExpand : undefined;
  if (!w && !h && !hOn && !hOff && autoExpand === undefined) {
    return undefined;
  }
  return {
    ...(w ? { w } : null),
    ...(h ? { h } : null),
    ...(hOn ? { hOn } : null),
    ...(hOff ? { hOff } : null),
    ...(autoExpand !== undefined ? { autoExpand } : null),
  };
}

export function normalizeWidgetTypeLayoutOverrides(overrides: WidgetTypeLayoutOverrides | undefined): WidgetTypeLayoutOverrides {
  if (!overrides) {
    return {};
  }
  const normalized: WidgetTypeLayoutOverrides = {};
  WIDGET_KIND_ORDER.forEach((kind) => {
    const sourceByBreakpoint = overrides[kind];
    if (!sourceByBreakpoint) {
      return;
    }
    const nextByBreakpoint: Partial<Record<GridEngineBreakpoint, WidgetTypeBreakpointLayoutOverride>> = {};
    GRID_BREAKPOINTS.forEach((breakpoint) => {
      const next = normalizeBreakpointOverride(sourceByBreakpoint[breakpoint]);
      if (!next) {
        return;
      }
      if (kind === 'lock') {
        nextByBreakpoint[breakpoint] = {
          ...next,
          ...(next.h ? { h: clampLockHeight(next.h, breakpoint) } : null),
          ...(next.hOn ? { hOn: clampLockHeight(next.hOn, breakpoint) } : null),
          ...(next.hOff ? { hOff: clampLockHeight(next.hOff, breakpoint) } : null),
        };
        return;
      }
      const minimumWidth = resolveMinimumWidth(kind, breakpoint);
      nextByBreakpoint[breakpoint] = {
        ...next,
        ...(next.w ? { w: Math.max(minimumWidth, next.w) } : null),
      };
    });
    if (Object.keys(nextByBreakpoint).length > 0) {
      normalized[kind] = nextByBreakpoint;
    }
  });
  return normalized;
}

export function setActiveWidgetTypeLayoutOverrides(overrides: WidgetTypeLayoutOverrides | undefined) {
  activeWidgetTypeLayoutOverrides = normalizeWidgetTypeLayoutOverrides(overrides);
}

export function getActiveWidgetTypeLayoutOverrides() {
  return activeWidgetTypeLayoutOverrides;
}

export const CARD_DENSITY_BY_BREAKPOINT: Record<GridEngineBreakpoint, BreakpointCardDensity> = {
  '2xl': 'regular',
  xl: 'regular',
  lg: 'regular',
  md: 'regular',
  sm: 'compact',
  xs: 'tiny',
};

export const STACK_GRID_COLS_BY_BREAKPOINT: Record<GridEngineBreakpoint, number> = {
  '2xl': 6,
  xl: 6,
  lg: 5,
  md: 4,
  sm: 3,
  xs: 2,
};

export const SCENES_SECTION_SPAN_BY_BREAKPOINT: Record<GridEngineBreakpoint, SectionSpan> = {
  '2xl': { w: 8, h: 2 },
  xl: { w: 8, h: 2 },
  lg: { w: 8, h: 2 },
  md: { w: 6, h: 2 },
  sm: { w: 4, h: 2 },
  xs: { w: 2, h: 2 },
};

export function resolveCardDensityByBreakpoint(
  breakpoint: GridEngineBreakpoint | undefined,
  fallback: BreakpointCardDensity = 'regular',
): BreakpointCardDensity {
  if (!breakpoint) {
    return fallback;
  }
  return CARD_DENSITY_BY_BREAKPOINT[breakpoint] ?? fallback;
}

// ─── DEFINIZIONI LAYOUT DEFAULT ─────────────────────────────────────────────

const DEFAULT_LIGHT_WIDGET_SPAN_BY_BREAKPOINT: Record<GridEngineBreakpoint, LightWidgetSpan> =
  { ...LIGHT_CARD_CAPABILITY.defaultSpans };

const DEFAULT_SWITCH_WIDGET_SPAN_BY_BREAKPOINT: Record<GridEngineBreakpoint, WidgetSpan> =
  { ...SWITCH_CARD_CAPABILITY.defaultSpans };

const DEFAULT_CLIMATE_WIDGET_SPAN_BY_BREAKPOINT: Record<GridEngineBreakpoint, WidgetSpan> =
  { ...CLIMATE_CARD_CAPABILITY.defaultSpans };

const DEFAULT_MEDIA_WIDGET_SPAN_BY_BREAKPOINT: Record<GridEngineBreakpoint, WidgetSpan> =
  { ...MEDIA_CARD_CAPABILITY.defaultSpans };

const DEFAULT_VACUUM_WIDGET_SPAN_BY_BREAKPOINT: Record<GridEngineBreakpoint, WidgetSpan> =
  { ...VACUUM_CARD_CAPABILITY.defaultSpans };

const DEFAULT_COVER_WIDGET_SPAN_BY_BREAKPOINT: Record<GridEngineBreakpoint, WidgetSpan> =
  { ...COVER_CARD_CAPABILITY.defaultSpans };

const DEFAULT_CAMERA_WIDGET_SPAN_BY_BREAKPOINT: Record<GridEngineBreakpoint, WidgetSpan> =
  { ...CAMERA_CARD_CAPABILITY.defaultSpans };

const DEFAULT_SENSOR_WIDGET_SPAN_BY_BREAKPOINT: Record<GridEngineBreakpoint, WidgetSpan> =
  { ...SENSOR_CARD_CAPABILITY.defaultSpans };

const DEFAULT_MEMBERS_WIDGET_SPAN_BY_BREAKPOINT: Record<GridEngineBreakpoint, WidgetSpan> =
  { ...MEMBERS_CARD_CAPABILITY.defaultSpans };

const DEFAULT_LOCK_WIDGET_SPAN_BY_BREAKPOINT: Record<GridEngineBreakpoint, WidgetSpan> =
  { ...LOCK_CARD_CAPABILITY.defaultSpans };

const DEFAULT_ALARM_WIDGET_SPAN_BY_BREAKPOINT: Record<GridEngineBreakpoint, WidgetSpan> =
  { ...ALARM_CARD_CAPABILITY.defaultSpans };

// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_WIDGET_SPANS_BY_KIND: Record<Exclude<WidgetKind, 'light'>, Record<GridEngineBreakpoint, WidgetSpan>> = {
  switch: DEFAULT_SWITCH_WIDGET_SPAN_BY_BREAKPOINT,
  fan: FAN_CARD_CAPABILITY.defaultSpans,
  humidifier: HUMIDIFIER_CARD_CAPABILITY.defaultSpans,
  climate: DEFAULT_CLIMATE_WIDGET_SPAN_BY_BREAKPOINT,
  camera: DEFAULT_CAMERA_WIDGET_SPAN_BY_BREAKPOINT,
  sensor: DEFAULT_SENSOR_WIDGET_SPAN_BY_BREAKPOINT,
  media: DEFAULT_MEDIA_WIDGET_SPAN_BY_BREAKPOINT,
  alarm: DEFAULT_ALARM_WIDGET_SPAN_BY_BREAKPOINT,
  vacuum: DEFAULT_VACUUM_WIDGET_SPAN_BY_BREAKPOINT,
  lock: DEFAULT_LOCK_WIDGET_SPAN_BY_BREAKPOINT,
  cover: DEFAULT_COVER_WIDGET_SPAN_BY_BREAKPOINT,
  members: DEFAULT_MEMBERS_WIDGET_SPAN_BY_BREAKPOINT,
};

function resolveDefaultWidgetSpans(kind: Exclude<WidgetKind, 'light'> | string) {
  return DEFAULT_WIDGET_SPANS_BY_KIND[kind as Exclude<WidgetKind, 'light'>] ??
    DEFAULT_SENSOR_WIDGET_SPAN_BY_BREAKPOINT;
}

function resolveSimpleWidgetSpanWithOverrides(
  kind: Exclude<WidgetKind, 'light'> | string,
  breakpoint: GridEngineBreakpoint,
) {
  const normalizedKind = kind as Exclude<WidgetKind, 'light'>;
  const base = resolveDefaultWidgetSpans(kind)[breakpoint];
  const override = activeWidgetTypeLayoutOverrides[normalizedKind]?.[breakpoint];
  const minimumWidth = resolveMinimumWidth(kind, breakpoint);
  const minimumHeight = kind === 'lock' ? resolveLockMinimumHeight(breakpoint) : 1;
  if (!override) {
    return {
      ...base,
      w: Math.max(minimumWidth, base.w),
      h: Math.max(minimumHeight, base.h),
    };
  }
  return {
    w: Math.max(minimumWidth, toPositiveInt(override.w) ?? base.w),
    h: Math.max(minimumHeight, toPositiveInt(override.h ?? override.hOn ?? override.hOff) ?? base.h),
  };
}

function resolveLightWidgetSpanWithOverrides(breakpoint: GridEngineBreakpoint) {
  const base = DEFAULT_LIGHT_WIDGET_SPAN_BY_BREAKPOINT[breakpoint];
  const override = activeWidgetTypeLayoutOverrides.light?.[breakpoint];
  if (!override) {
    return base;
  }
  const fallbackHeight = toPositiveInt(override.h);
  const autoExpand = override.autoExpand ?? true;
  const fixedHeight = fallbackHeight ?? toPositiveInt(override.hOff) ?? toPositiveInt(override.hOn) ?? base.hOff;
  return {
    w: toPositiveInt(override.w) ?? base.w,
    hOn: autoExpand ? toPositiveInt(override.hOn) ?? fallbackHeight ?? base.hOn : fixedHeight,
    hOff: autoExpand ? toPositiveInt(override.hOff) ?? fallbackHeight ?? base.hOff : fixedHeight,
    autoExpand,
  };
}

function createSimpleWidgetSpanProxy(kind: Exclude<WidgetKind, 'light'> | string) {
  const base = resolveDefaultWidgetSpans(kind);
  return new Proxy(base, {
    get(target, property, receiver) {
      if (typeof property === 'string' && GRID_BREAKPOINTS.includes(property as GridEngineBreakpoint)) {
        return resolveSimpleWidgetSpanWithOverrides(kind, property as GridEngineBreakpoint);
      }
      return Reflect.get(target, property, receiver);
    },
  }) as Record<GridEngineBreakpoint, WidgetSpan>;
}

function createLightWidgetSpanProxy() {
  return new Proxy(DEFAULT_LIGHT_WIDGET_SPAN_BY_BREAKPOINT, {
    get(target, property, receiver) {
      if (typeof property === 'string' && GRID_BREAKPOINTS.includes(property as GridEngineBreakpoint)) {
        return resolveLightWidgetSpanWithOverrides(property as GridEngineBreakpoint);
      }
      return Reflect.get(target, property, receiver);
    },
  }) as Record<GridEngineBreakpoint, LightWidgetSpan>;
}

export function resolveWidgetTypeLayoutSpan(
  kind: WidgetKind | string,
  breakpoint: GridEngineBreakpoint,
  overrides: WidgetTypeLayoutOverrides | undefined = activeWidgetTypeLayoutOverrides,
): { w: number; h: number; hOn?: number; hOff?: number; autoExpand?: boolean } {
  if (kind === 'light') {
    const base = DEFAULT_LIGHT_WIDGET_SPAN_BY_BREAKPOINT[breakpoint];
    const override = overrides?.light?.[breakpoint];
    const fallbackHeight = toPositiveInt(override?.h);
    const autoExpand = override?.autoExpand ?? true;
    const fixedHeight = fallbackHeight ?? toPositiveInt(override?.hOff) ?? toPositiveInt(override?.hOn) ?? base.hOff;
    const hOn = autoExpand ? toPositiveInt(override?.hOn) ?? fallbackHeight ?? base.hOn : fixedHeight;
    const hOff = autoExpand ? toPositiveInt(override?.hOff) ?? fallbackHeight ?? base.hOff : fixedHeight;
    return {
      w: toPositiveInt(override?.w) ?? base.w,
      h: Math.max(hOn, hOff),
      hOn,
      hOff,
      autoExpand,
    };
  }
  const normalizedKind = kind as Exclude<WidgetKind, 'light'>;
  const base = resolveDefaultWidgetSpans(kind)[breakpoint];
  const override = overrides?.[normalizedKind]?.[breakpoint];
  const minimumWidth = resolveMinimumWidth(kind, breakpoint);
  const minimumHeight = kind === 'lock' ? resolveLockMinimumHeight(breakpoint) : 1;
  return {
    w: Math.max(minimumWidth, toPositiveInt(override?.w) ?? base.w),
    h: Math.max(minimumHeight, toPositiveInt(override?.h ?? override?.hOn ?? override?.hOff) ?? base.h),
  };
}

export const LIGHT_WIDGET_SPAN_BY_BREAKPOINT = createLightWidgetSpanProxy();
export const SWITCH_WIDGET_SPAN_BY_BREAKPOINT = createSimpleWidgetSpanProxy('switch');
export const CLIMATE_WIDGET_SPAN_BY_BREAKPOINT = createSimpleWidgetSpanProxy('climate');
export const MEDIA_WIDGET_SPAN_BY_BREAKPOINT = createSimpleWidgetSpanProxy('media');
export const VACUUM_WIDGET_SPAN_BY_BREAKPOINT = createSimpleWidgetSpanProxy('vacuum');
export const COVER_WIDGET_SPAN_BY_BREAKPOINT = createSimpleWidgetSpanProxy('cover');
export const CAMERA_WIDGET_SPAN_BY_BREAKPOINT = createSimpleWidgetSpanProxy('camera');
export const SENSOR_WIDGET_SPAN_BY_BREAKPOINT = createSimpleWidgetSpanProxy('sensor');
export const MEMBERS_WIDGET_SPAN_BY_BREAKPOINT = createSimpleWidgetSpanProxy('members');
export const LOCK_WIDGET_SPAN_BY_BREAKPOINT = createSimpleWidgetSpanProxy('lock');
export const ALARM_WIDGET_SPAN_BY_BREAKPOINT = createSimpleWidgetSpanProxy('alarm');
