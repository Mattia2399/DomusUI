import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Responsive, type ResponsiveLayouts } from 'react-grid-layout/legacy';
import {
  Activity,
  Blinds,
  Bot,
  Camera,
  Check,
  CloudSun,
  LayoutGrid,
  Lightbulb,
  LockKeyhole,
  MoreHorizontal,
  Music2,
  Plus,
  Rows3,
  Shield,
  Sparkles,
  Thermometer,
  ToggleRight,
  Type,
  Users,
  type LucideIcon,
} from 'lucide-react';
import GlassModal from '../ui/GlassModal';
import GlassDropdown from '../ui/GlassDropdown';
import GlassSegmentSelect from '../ui/GlassSegmentSelect';
import GlassSearchFilterBar from '../ui/GlassSearchFilterBar';
import { SectionCardRenderer, WidgetCardRenderer } from '../widgets/CardRenderer';
import type { WidgetDisplayMetrics } from '../widgets/widgetDisplayVariant';
import { SCENES_CATALOG } from '../widgets/ScenesCard';
import {
  GRID_ENGINE_BREAKPOINTS,
  GRID_ENGINE_COLS,
  GRID_ENGINE_GAP_PX,
  GRID_ENGINE_ROW_UNIT_PX,
} from './DashboardGrid';
import { StackGrid } from './StackGrid';
import type { DashboardStateShape } from '../../hooks/useDashboardState';
import type { MockEntityStateMap } from '../../types/ha';
import { useI18n } from '../../i18n/I18nProvider';
import type { TranslationKey } from '../../i18n/translations';
import type {
  DashboardSection,
  GridItem,
  SceneRunState,
  SectionKind,
  Widget,
  WidgetCatalogDestination,
  WidgetKind,
  SceneKey,
} from '../../types/dashboardModels';
import type {
  DashboardResponsiveLayouts,
  WidgetLayoutOverrides,
  WidgetTypeLayoutOverrides,
} from '../../types/widgetTypeLayout';
import {
  FAVORITES_GRID_TITLE,
  ROOT_CANVAS_COLS,
  ROOT_CANVAS_ROW_UNITS,
  SECTION_CATALOG,
  WIDGET_CATALOG,
} from '../../types/dashboardModels';
import {
  ALARM_WIDGET_SPAN_BY_BREAKPOINT,
  CAMERA_WIDGET_SPAN_BY_BREAKPOINT,
  CLIMATE_WIDGET_SPAN_BY_BREAKPOINT,
  COVER_WIDGET_SPAN_BY_BREAKPOINT,
  LIGHT_WIDGET_SPAN_BY_BREAKPOINT,
  LOCK_WIDGET_SPAN_BY_BREAKPOINT,
  MEMBERS_WIDGET_SPAN_BY_BREAKPOINT,
  MEDIA_WIDGET_SPAN_BY_BREAKPOINT,
  SENSOR_WIDGET_SPAN_BY_BREAKPOINT,
  SWITCH_WIDGET_SPAN_BY_BREAKPOINT,
  SCENES_SECTION_SPAN_BY_BREAKPOINT,
  VACUUM_WIDGET_SPAN_BY_BREAKPOINT,
  resolveWidgetTypeLayoutSpan,
} from './dashboardBreakpointConfig';
import {
  adaptToMobileColumns,
  compactLayoutUp,
  intersects,
  normalizeRuntimeLayout,
  packLayoutDense,
  resolveClosestParentBreakpointWithLayout,
  scaleLayoutColumns,
} from './gridEngineGeometry';
import { resolveGridStackContainerSpan } from './gridStackLayoutSolver';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const ResponsiveGridLayout = Responsive;
type GridBreakpoint = keyof typeof GRID_ENGINE_BREAKPOINTS;
type GridLayouts = Partial<Record<GridBreakpoint, GridItem[]>>;
type HouseMemberCardItem = {
  id: string;
  name: string;
  avatarUrl?: string;
  roleLabel?: string;
  isCurrent?: boolean;
};

type GridCanvasProps = {
  isEditMode: boolean;
  layoutRevision?: number;
  previewGridWidth?: number;
  developerMode: boolean;
  isXsViewport: boolean;
  onActiveBreakpointChange?: (breakpoint: GridBreakpoint) => void;
  topRightOverlay?: React.ReactNode;
  state: DashboardStateShape;
  sections: DashboardSection[];
  widgets: Widget[];
  runningSceneBySectionId: Partial<Record<string, SceneRunState>>;
  selectedWidgetId: string | null;
  selectedSectionId: string | null;
  isCatalogOpen: boolean;
  widgetTypeLayoutOverrides: WidgetTypeLayoutOverrides;
  widgetLayoutOverrides: WidgetLayoutOverrides;
  responsiveLayouts: DashboardResponsiveLayouts;
  onCloseCatalog: () => void;
  onSelectWidget: (id: string | null) => void;
  onSelectSection: (id: string | null) => void;
  onWeatherClick: () => void;
  onSceneTrigger: (section: DashboardSection, sceneId: SceneKey) => void | Promise<void>;
  onWidgetClick: (widget: Widget) => void;
  onWidgetLightToggle: (widget: Widget) => void;
  onWidgetSwitchToggle: (widget: Widget) => void;
  onWidgetBrightnessChange: (widget: Widget, value: number) => void;
  onWidgetLightColorChange: (widget: Widget, hs: [number, number]) => void;
  onWidgetClimateTargetTempChange: (widget: Widget, value: number) => void;
  onWidgetClimateTargetRangeChange: (widget: Widget, low: number, high: number) => void;
  onWidgetClimateTargetHumidityChange: (widget: Widget, value: number) => void;
  onWidgetClimatePowerToggle: (widget: Widget) => void;
  onWidgetClimateModeChange: (widget: Widget, mode: string) => void;
  onWidgetClimateFanModeChange: (widget: Widget, mode: string) => void;
  onWidgetClimatePresetModeChange: (widget: Widget, mode: string) => void;
  onWidgetClimateSwingModeChange: (widget: Widget, mode: string) => void;
  onWidgetClimateSwingHorizontalModeChange: (widget: Widget, mode: string) => void;
  onWidgetMediaToggle: (widget: Widget) => void;
  onWidgetMediaPrevious: (widget: Widget) => void;
  onWidgetMediaNext: (widget: Widget) => void;
  onWidgetMediaSeek: (widget: Widget, position: number) => void;
  onWidgetMediaShuffle: (widget: Widget) => void;
  onWidgetMediaRepeat: (widget: Widget) => void;
  onWidgetMediaSelectSource: (widget: Widget, source: string) => void;
  onWidgetAlarmDisarm: (widget: Widget) => void;
  onWidgetAlarmArm: (widget: Widget, mode: 'home' | 'away' | 'night' | 'vacation' | 'custom_bypass') => void;
  onWidgetVacuumStartPause: (widget: Widget) => void;
  onWidgetVacuumStop: (widget: Widget) => void;
  onWidgetVacuumReturnToBase: (widget: Widget) => void;
  onWidgetLockToggle: (widget: Widget) => boolean | void;
  onWidgetLockOpen: (widget: Widget) => void;
  onWidgetCoverPositionChange: (widget: Widget, position: number) => void;
  onWidgetCoverTiltPositionChange: (widget: Widget, position: number) => void;
  onWidgetCoverOpen: (widget: Widget) => void;
  onWidgetCoverStop: (widget: Widget) => void;
  onWidgetCoverClose: (widget: Widget) => void;
  onOpenMembersPanel: () => void;
  onWidgetLayoutChange: (sectionId: string, next: GridItem[]) => void;
  onSectionsLayoutChange: (next: GridItem[]) => void;
  onRootBreakpointLayoutChange: (breakpoint: GridBreakpoint, next: GridItem[]) => void;
  onStackBreakpointLayoutChange: (sectionId: string, breakpoint: GridBreakpoint, next: GridItem[]) => void;
  onAddWidget: (kind: WidgetKind, destination: WidgetCatalogDestination) => string;
  onAddSection: (kind: SectionKind) => string;
  onRemoveSection: (id: string) => void;
  onUpdateSection: (id: string, updater: (section: DashboardSection) => DashboardSection) => void;
  haConnected: boolean;
  haStates: MockEntityStateMap;
  sensorHistoryByEntity?: Record<string, number[]>;
  houseMembers?: HouseMemberCardItem[];
  onWidgetDisplayMetricsChange?: (metrics: WidgetDisplayMetrics) => void;
};

const SECTION_LABEL_KEYS: Record<SectionKind, TranslationKey> = {
  greeting: 'home.catalog.section.greeting',
  weather: 'home.catalog.section.weather',
  scenes: 'home.catalog.section.scenes',
  'stack-vertical': 'home.catalog.section.verticalStack',
  'stack-horizontal': 'home.catalog.section.horizontalStack',
  'stack-grid': 'home.catalog.section.gridStack',
};
type CatalogTab = 'cards' | 'sections';
type CatalogWidgetFamily = 'controls' | 'comfort' | 'security' | 'entertainment' | 'services';

const CATALOG_WIDGET_FAMILIES: CatalogWidgetFamily[] = [
  'controls', 'comfort', 'security', 'entertainment', 'services',
];

const CATALOG_FAMILY_KEYS: Record<CatalogWidgetFamily, TranslationKey> = {
  controls: 'home.catalog.family.controls', comfort: 'home.catalog.family.comfort', security: 'home.catalog.family.security', entertainment: 'home.catalog.family.entertainment', services: 'home.catalog.family.services',
};

const WIDGET_LABEL_KEYS: Record<WidgetKind, TranslationKey> = {
  light: 'home.catalog.widget.light', switch: 'home.catalog.widget.switch', climate: 'home.catalog.widget.climate', camera: 'home.catalog.widget.camera', sensor: 'home.catalog.widget.sensor', media: 'home.catalog.widget.media', alarm: 'home.catalog.widget.alarm', vacuum: 'home.catalog.widget.vacuum', lock: 'home.catalog.widget.lock', cover: 'home.catalog.widget.cover', members: 'home.catalog.widget.members',
};

const WIDGET_CATALOG_META: Record<
  WidgetKind,
  { descriptionKey: TranslationKey; family: CatalogWidgetFamily; icon: LucideIcon }
> = {
  light: { descriptionKey: 'home.catalog.description.light', family: 'controls', icon: Lightbulb }, switch: { descriptionKey: 'home.catalog.description.switch', family: 'controls', icon: ToggleRight }, cover: { descriptionKey: 'home.catalog.description.cover', family: 'controls', icon: Blinds }, lock: { descriptionKey: 'home.catalog.description.lock', family: 'controls', icon: LockKeyhole }, climate: { descriptionKey: 'home.catalog.description.climate', family: 'comfort', icon: Thermometer }, sensor: { descriptionKey: 'home.catalog.description.sensor', family: 'comfort', icon: Activity }, alarm: { descriptionKey: 'home.catalog.description.alarm', family: 'security', icon: Shield }, camera: { descriptionKey: 'home.catalog.description.camera', family: 'security', icon: Camera }, media: { descriptionKey: 'home.catalog.description.media', family: 'entertainment', icon: Music2 }, vacuum: { descriptionKey: 'home.catalog.description.vacuum', family: 'services', icon: Bot }, members: { descriptionKey: 'home.catalog.description.members', family: 'services', icon: Users },
};

const SECTION_CATALOG_META: Record<SectionKind, { descriptionKey: TranslationKey; icon: LucideIcon }> = {
  greeting: { descriptionKey: 'home.catalog.description.greeting', icon: Type }, weather: { descriptionKey: 'home.catalog.description.weather', icon: CloudSun }, scenes: { descriptionKey: 'home.catalog.description.scenes', icon: Sparkles }, 'stack-vertical': { descriptionKey: 'home.catalog.description.verticalStack', icon: Rows3 }, 'stack-horizontal': { descriptionKey: 'home.catalog.description.horizontalStack', icon: MoreHorizontal }, 'stack-grid': { descriptionKey: 'home.catalog.description.gridStack', icon: LayoutGrid },
};

const isStackSection = (section: DashboardSection) =>
  section.kind === 'stack-vertical' || section.kind === 'stack-horizontal' || section.kind === 'stack-grid';
const GRID_ENGINE_2XL_COLS = GRID_ENGINE_COLS['2xl'];
const GRID_ENGINE_XL_COLS = GRID_ENGINE_COLS.xl;
const GRID_ENGINE_XS_COLS = GRID_ENGINE_COLS.xs;
const GRID_ENGINE_SM_COLS = GRID_ENGINE_COLS.sm;
const GRID_ENGINE_MD_COLS = GRID_ENGINE_COLS.md;
const GRID_ENGINE_LG_COLS = GRID_ENGINE_COLS.lg;
const GRID_ENGINE_CANONICAL_BREAKPOINT: GridBreakpoint = 'xl';
const GRID_ENGINE_CANONICAL_COLS = GRID_ENGINE_XL_COLS;
const GRID_ENGINE_ROW_UNIT = GRID_ENGINE_ROW_UNIT_PX;
const GRID_ENGINE_BREAKPOINT_ORDER: GridBreakpoint[] = ['2xl', 'xl', 'lg', 'md', 'sm', 'xs'];
const RUNTIME_GRID_WIDTH_JITTER_PX = 2;
const GRID_ENGINE_CONTAINER_PADDING: Record<GridBreakpoint, [number, number]> = {
  '2xl': [0, 14],
  xl: [0, 14],
  lg: [0, 12],
  md: [0, 10],
  sm: [0, 4],
  xs: [2, 4],
};
const XS_CONTEXT_OPEN_LONG_PRESS_MS = 420;
const XS_CONTEXT_OPEN_MOVE_TOLERANCE_PX = 14;
const COMPACT_DRAG_AUTOSCROLL_EDGE_PX = 192;
const COMPACT_DRAG_AUTOSCROLL_MAX_PX = 7;
const COMPACT_DRAG_LONG_PRESS_MS = 650;
const COMPACT_DRAG_HOLD_MOVE_TOLERANCE_PX = 10;

type CompactTouchSnapshot = {
  identifier: number;
  clientX: number;
  clientY: number;
  screenX: number;
  screenY: number;
  pageX: number;
  pageY: number;
  radiusX?: number;
  radiusY?: number;
  rotationAngle?: number;
  force?: number;
};

type CompactDragHoldStart =
  | {
      itemId: string;
      element: HTMLElement;
      x: number;
      y: number;
      input: {
        kind: 'mouse';
        clientX: number;
        clientY: number;
        screenX: number;
        screenY: number;
      };
    }
  | {
      itemId: string;
      element: HTMLElement;
      x: number;
      y: number;
      input: {
        kind: 'touch';
        touch: CompactTouchSnapshot;
      };
    };

function getViewportWidth() {
  if (typeof window === 'undefined') {
    return GRID_ENGINE_BREAKPOINTS.xl;
  }
  return Math.max(0, Math.round(window.innerWidth));
}

function resolveActiveBreakpoint(viewportWidth: number): GridBreakpoint {
  if (viewportWidth >= GRID_ENGINE_BREAKPOINTS['2xl']) {
    return '2xl';
  }
  if (viewportWidth >= GRID_ENGINE_BREAKPOINTS.xl) {
    return 'xl';
  }
  if (viewportWidth >= GRID_ENGINE_BREAKPOINTS.lg) {
    return 'lg';
  }
  if (viewportWidth >= GRID_ENGINE_BREAKPOINTS.md) {
    return 'md';
  }
  return viewportWidth >= GRID_ENGINE_BREAKPOINTS.sm ? 'sm' : 'xs';
}

function getDragEventClientY(event: Event | null | undefined) {
  if (!event) {
    return null;
  }
  if ('touches' in event) {
    const touches = (event as TouchEvent).touches;
    if (touches.length > 0) {
      return touches[0]?.clientY ?? null;
    }
  }
  if ('changedTouches' in event) {
    const changedTouches = (event as TouchEvent).changedTouches;
    if (changedTouches.length > 0) {
      return changedTouches[0]?.clientY ?? null;
    }
  }
  if ('clientY' in event && typeof event.clientY === 'number') {
    return event.clientY;
  }
  return null;
}

function dispatchCompactDragStartEvent(hold: CompactDragHoldStart) {
  const view = hold.element.ownerDocument.defaultView ?? window;
  if (hold.input.kind === 'mouse') {
    hold.element.dispatchEvent(
      new view.MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX: hold.input.clientX,
        clientY: hold.input.clientY,
        screenX: hold.input.screenX,
        screenY: hold.input.screenY,
      }),
    );
    return;
  }

  if (typeof view.Touch !== 'function' || typeof view.TouchEvent !== 'function') {
    return;
  }

  const sourceTouch = hold.input.touch;
  const syntheticTouch = new view.Touch({
    identifier: sourceTouch.identifier,
    target: hold.element,
    clientX: sourceTouch.clientX,
    clientY: sourceTouch.clientY,
    screenX: sourceTouch.screenX,
    screenY: sourceTouch.screenY,
    pageX: sourceTouch.pageX,
    pageY: sourceTouch.pageY,
    radiusX: sourceTouch.radiusX ?? 1,
    radiusY: sourceTouch.radiusY ?? 1,
    rotationAngle: sourceTouch.rotationAngle ?? 0,
    force: sourceTouch.force ?? 0.5,
  });

  hold.element.dispatchEvent(
    new view.TouchEvent('touchstart', {
      bubbles: true,
      cancelable: true,
      touches: [syntheticTouch],
      targetTouches: [syntheticTouch],
      changedTouches: [syntheticTouch],
    }),
  );
}

function toGridLayouts(layouts: ResponsiveLayouts<GridBreakpoint>): GridLayouts {
  const next: GridLayouts = {};
  GRID_ENGINE_BREAKPOINT_ORDER.forEach((breakpoint) => {
    const source = layouts[breakpoint] ?? [];
    next[breakpoint] = normalizeRuntimeLayout(source as GridItem[], GRID_ENGINE_COLS[breakpoint]);
  });
  return next;
}

function sameGridLayout(a: readonly GridItem[] | undefined, b: readonly GridItem[] | undefined) {
  const first = a ?? [];
  const second = b ?? [];
  if (first === second) {
    return true;
  }
  if (first.length !== second.length) {
    return false;
  }
  const secondById = new Map(second.map((item) => [item.i, item]));
  return first.every((item) => {
    const match = secondById.get(item.i);
    if (!match) {
      return false;
    }
    return (
      item.x === match.x &&
      item.y === match.y &&
      item.w === match.w &&
      item.h === match.h
    );
  });
}

function sameGridLayouts(a: GridLayouts, b: GridLayouts) {
  return GRID_ENGINE_BREAKPOINT_ORDER.every((breakpoint) => sameGridLayout(a[breakpoint], b[breakpoint]));
}

function normalizeGridItems(next: readonly GridItem[]): GridItem[] {
  return next.map((item) => ({
    i: item.i,
    x: Math.max(0, Math.round(item.x)),
    y: Math.max(0, Math.round(item.y)),
    w: Math.max(1, Math.round(item.w)),
    h: Math.max(1, Math.round(item.h)),
  }));
}

function enforceLightWidgetSpan(
  layouts: GridItem[],
  breakpoint: GridBreakpoint,
  cols: number,
  lightWidgetStateById: ReadonlyMap<string, boolean>,
  useExplicitLightSpan: boolean,
  widgetTypeLayoutOverrides: WidgetTypeLayoutOverrides,
): GridItem[] {
  if (lightWidgetStateById.size === 0) {
    return normalizeRuntimeLayout(layouts, cols);
  }
  const span = resolveWidgetTypeLayoutSpan('light', breakpoint, widgetTypeLayoutOverrides);
  const safeCols = Math.max(1, Math.round(cols));
  return normalizeRuntimeLayout(
    layouts.map((item) => {
      const lightIsOn = lightWidgetStateById.get(item.i);
      if (lightIsOn === undefined) {
        return item;
      }
      const currentW = Math.max(1, Math.round(item.w));
      const nextW = useExplicitLightSpan
        ? Math.min(safeCols, Math.max(1, Math.round(span.w)))
        : Math.min(safeCols, currentW);
      const currentH = Math.max(1, Math.round(item.h));
      const configuredH = Math.max(1, Math.round(lightIsOn ? span.hOn : span.hOff));
      const autoExpand = span.autoExpand ?? true;
      const forcedH = useExplicitLightSpan
        ? autoExpand && lightIsOn && configuredH <= 1
          ? Math.max(2, Math.round(span.hOn))
          : configuredH
        : autoExpand && lightIsOn
        ? currentH <= 1
          ? Math.max(2, Math.round(span.hOn))
          : currentH
        : autoExpand && currentH <= 2
          ? Math.max(1, Math.round(span.hOff))
          : currentH;
      return {
        ...item,
        w: nextW,
        h: forcedH,
      };
    }),
    safeCols,
  );
}

function enforceClimateWidgetSpan(
  layouts: GridItem[],
  breakpoint: GridBreakpoint,
  cols: number,
  climateWidgetIds: ReadonlySet<string>,
): GridItem[] {
  if (climateWidgetIds.size === 0) {
    return normalizeRuntimeLayout(layouts, cols);
  }
  const span = CLIMATE_WIDGET_SPAN_BY_BREAKPOINT[breakpoint];
  const safeCols = Math.max(1, Math.round(cols));
  const forcedW = Math.min(safeCols, Math.max(1, Math.round(span.w)));
  const forcedH = Math.max(1, Math.round(span.h));
  return normalizeRuntimeLayout(
    layouts.map((item) => {
      if (!climateWidgetIds.has(item.i)) {
        return item;
      }
      return {
        ...item,
        w: forcedW,
        h: forcedH,
      };
    }),
    safeCols,
  );
}

function enforceCameraWidgetSpan(
  layouts: GridItem[],
  breakpoint: GridBreakpoint,
  cols: number,
  cameraWidgetIds: ReadonlySet<string>,
): GridItem[] {
  if (cameraWidgetIds.size === 0) {
    return normalizeRuntimeLayout(layouts, cols);
  }
  const span = CAMERA_WIDGET_SPAN_BY_BREAKPOINT[breakpoint];
  const safeCols = Math.max(1, Math.round(cols));
  const forcedW = Math.min(safeCols, Math.max(1, Math.round(span.w)));
  const forcedH = Math.max(1, Math.round(span.h));
  return normalizeRuntimeLayout(
    layouts.map((item) => {
      if (!cameraWidgetIds.has(item.i)) {
        return item;
      }
      return {
        ...item,
        w: forcedW,
        h: forcedH,
      };
    }),
    safeCols,
  );
}

function enforceMediaWidgetSpan(
  layouts: GridItem[],
  breakpoint: GridBreakpoint,
  cols: number,
  mediaWidgetIds: ReadonlySet<string>,
): GridItem[] {
  if (mediaWidgetIds.size === 0) {
    return normalizeRuntimeLayout(layouts, cols);
  }
  const span = MEDIA_WIDGET_SPAN_BY_BREAKPOINT[breakpoint];
  const safeCols = Math.max(1, Math.round(cols));
  const forcedW = Math.min(safeCols, Math.max(1, Math.round(span.w)));
  const forcedH = Math.max(1, Math.round(span.h));
  return normalizeRuntimeLayout(
    layouts.map((item) => {
      if (!mediaWidgetIds.has(item.i)) {
        return item;
      }
      return {
        ...item,
        w: forcedW,
        h: forcedH,
      };
    }),
    safeCols,
  );
}

function enforceSensorWidgetSpan(
  layouts: GridItem[],
  breakpoint: GridBreakpoint,
  cols: number,
  sensorWidgetIds: ReadonlySet<string>,
): GridItem[] {
  if (sensorWidgetIds.size === 0) {
    return normalizeRuntimeLayout(layouts, cols);
  }
  const span = SENSOR_WIDGET_SPAN_BY_BREAKPOINT[breakpoint];
  const safeCols = Math.max(1, Math.round(cols));
  const forcedW = Math.min(safeCols, Math.max(1, Math.round(span.w)));
  const forcedH = Math.max(1, Math.round(span.h));
  return normalizeRuntimeLayout(
    layouts.map((item) => {
      if (!sensorWidgetIds.has(item.i)) {
        return item;
      }
      return {
        ...item,
        w: forcedW,
        h: forcedH,
      };
    }),
    safeCols,
  );
}

function enforceMembersWidgetSpan(
  layouts: GridItem[],
  breakpoint: GridBreakpoint,
  cols: number,
  membersWidgetIds: ReadonlySet<string>,
): GridItem[] {
  if (membersWidgetIds.size === 0) {
    return normalizeRuntimeLayout(layouts, cols);
  }
  const span = MEMBERS_WIDGET_SPAN_BY_BREAKPOINT[breakpoint];
  const safeCols = Math.max(1, Math.round(cols));
  const forcedW = Math.min(safeCols, Math.max(1, Math.round(span.w)));
  const forcedH = Math.max(1, Math.round(span.h));
  return normalizeRuntimeLayout(
    layouts.map((item) => {
      if (!membersWidgetIds.has(item.i)) {
        return item;
      }
      return {
        ...item,
        w: forcedW,
        h: forcedH,
      };
    }),
    safeCols,
  );
}

function enforceAlarmWidgetSpan(
  layouts: GridItem[],
  breakpoint: GridBreakpoint,
  cols: number,
  alarmWidgetIds: ReadonlySet<string>,
): GridItem[] {
  if (alarmWidgetIds.size === 0) {
    return normalizeRuntimeLayout(layouts, cols);
  }
  const span = ALARM_WIDGET_SPAN_BY_BREAKPOINT[breakpoint];
  const safeCols = Math.max(1, Math.round(cols));
  const forcedW = Math.min(safeCols, Math.max(1, Math.round(span.w)));
  const forcedH = Math.max(1, Math.round(span.h));
  return normalizeRuntimeLayout(
    layouts.map((item) => {
      if (!alarmWidgetIds.has(item.i)) {
        return item;
      }
      return {
        ...item,
        w: forcedW,
        h: forcedH,
      };
    }),
    safeCols,
  );
}

function enforceVacuumWidgetSpan(
  layouts: GridItem[],
  breakpoint: GridBreakpoint,
  cols: number,
  vacuumWidgetIds: ReadonlySet<string>,
): GridItem[] {
  if (vacuumWidgetIds.size === 0) {
    return normalizeRuntimeLayout(layouts, cols);
  }
  const span = VACUUM_WIDGET_SPAN_BY_BREAKPOINT[breakpoint];
  const safeCols = Math.max(1, Math.round(cols));
  const forcedW = Math.min(safeCols, Math.max(1, Math.round(span.w)));
  const forcedH = Math.max(1, Math.round(span.h));
  return normalizeRuntimeLayout(
    layouts.map((item) => {
      if (!vacuumWidgetIds.has(item.i)) {
        return item;
      }
      return {
        ...item,
        w: forcedW,
        h: forcedH,
      };
    }),
    safeCols,
  );
}

function enforceCoverWidgetSpan(
  layouts: GridItem[],
  breakpoint: GridBreakpoint,
  cols: number,
  coverWidgetIds: ReadonlySet<string>,
): GridItem[] {
  if (coverWidgetIds.size === 0) {
    return normalizeRuntimeLayout(layouts, cols);
  }
  const span = COVER_WIDGET_SPAN_BY_BREAKPOINT[breakpoint];
  const safeCols = Math.max(1, Math.round(cols));
  const forcedW = Math.min(safeCols, Math.max(1, Math.round(span.w)));
  const forcedH = Math.max(1, Math.round(span.h));
  return normalizeRuntimeLayout(
    layouts.map((item) => {
      if (!coverWidgetIds.has(item.i)) {
        return item;
      }
      return {
        ...item,
        w: forcedW,
        h: forcedH,
      };
    }),
    safeCols,
  );
}

function enforceSimpleWidgetKindSpan(
  layouts: GridItem[],
  kind: Exclude<WidgetKind, 'light'>,
  breakpoint: GridBreakpoint,
  cols: number,
  widgetIds: ReadonlySet<string>,
  widgetTypeLayoutOverrides: WidgetTypeLayoutOverrides,
  enforceSpan: boolean,
): GridItem[] {
  if (widgetIds.size === 0 || !enforceSpan) {
    return normalizeRuntimeLayout(layouts, cols);
  }
  const span = resolveWidgetTypeLayoutSpan(kind, breakpoint, widgetTypeLayoutOverrides);
  const safeCols = Math.max(1, Math.round(cols));
  const forcedW = Math.min(safeCols, Math.max(1, Math.round(span.w)));
  const forcedH = Math.max(1, Math.round(span.h));
  return normalizeRuntimeLayout(
    layouts.map((item) => {
      if (!widgetIds.has(item.i)) {
        return item;
      }
      return {
        ...item,
        w: forcedW,
        h: forcedH,
      };
    }),
    safeCols,
  );
}

function enforceLockWidgetSpan(
  layouts: GridItem[],
  breakpoint: GridBreakpoint,
  cols: number,
  lockWidgetIds: ReadonlySet<string>,
): GridItem[] {
  if (lockWidgetIds.size === 0) {
    return normalizeRuntimeLayout(layouts, cols);
  }
  const span = LOCK_WIDGET_SPAN_BY_BREAKPOINT[breakpoint];
  const safeCols = Math.max(1, Math.round(cols));
  const forcedW = Math.min(safeCols, Math.max(1, Math.round(span.w)));
  const forcedH = Math.max(1, Math.round(span.h));
  return normalizeRuntimeLayout(
    layouts.map((item) => {
      if (!lockWidgetIds.has(item.i)) {
        return item;
      }
      return {
        ...item,
        w: forcedW,
        h: forcedH,
      };
    }),
    safeCols,
  );
}

function enforceWidgetLayoutOverrides(
  layouts: GridItem[],
  breakpoint: GridBreakpoint,
  cols: number,
  widgetLayoutOverrides: WidgetLayoutOverrides,
  lightWidgetStateById: ReadonlyMap<string, boolean>,
  coverWidgetIds: ReadonlySet<string> = new Set(),
): GridItem[] {
  if (!widgetLayoutOverrides || Object.keys(widgetLayoutOverrides).length === 0) {
    return normalizeRuntimeLayout(layouts, cols);
  }
  const safeCols = Math.max(1, Math.round(cols));
  return normalizeRuntimeLayout(
    layouts.map((item) => {
      const override = widgetLayoutOverrides[item.i]?.[breakpoint];
      if (!override) {
        return item;
      }
      const lightIsOn = lightWidgetStateById.get(item.i);
      const autoExpand = override.autoExpand ?? true;
      const rawH =
        lightIsOn === undefined
          ? override.h ?? override.hOn ?? override.hOff
          : !autoExpand
            ? override.h ?? override.hOff ?? override.hOn
            : lightIsOn
            ? override.hOn ?? override.h
            : override.hOff ?? override.h;
      const minimumW = coverWidgetIds.has(item.i) && breakpoint !== 'xs' && breakpoint !== 'sm'
        ? Math.min(safeCols, 2)
        : 1;
      const nextW = override.w
        ? Math.min(safeCols, Math.max(minimumW, Math.round(override.w)))
        : Math.min(safeCols, Math.max(minimumW, Math.round(item.w)));
      const nextH = rawH
        ? autoExpand && lightIsOn && rawH <= 1
          ? Math.max(2, Math.round(rawH))
          : Math.max(1, Math.round(rawH))
        : Math.max(1, Math.round(item.h));
      return {
        ...item,
        w: nextW,
        h: nextH,
      };
    }),
    safeCols,
  );
}

function enforceRootWidgetSpans(
  layouts: GridItem[],
  breakpoint: GridBreakpoint,
  cols: number,
  scenesSectionIds: ReadonlySet<string>,
  lightWidgetStateById: ReadonlyMap<string, boolean>,
  useExplicitLightSpan: boolean,
  widgetTypeLayoutOverrides: WidgetTypeLayoutOverrides,
  widgetLayoutOverrides: WidgetLayoutOverrides,
  switchWidgetIds: ReadonlySet<string>,
  climateWidgetIds: ReadonlySet<string>,
  cameraWidgetIds: ReadonlySet<string>,
  mediaWidgetIds: ReadonlySet<string>,
  sensorWidgetIds: ReadonlySet<string>,
  membersWidgetIds: ReadonlySet<string>,
  alarmWidgetIds: ReadonlySet<string>,
  vacuumWidgetIds: ReadonlySet<string>,
  lockWidgetIds: ReadonlySet<string>,
  coverWidgetIds: ReadonlySet<string>,
): GridItem[] {
  const scenesSpan = SCENES_SECTION_SPAN_BY_BREAKPOINT[breakpoint];
  const safeScenesW = Math.min(Math.max(1, Math.round(cols)), Math.max(1, Math.round(scenesSpan.w)));
  const safeScenesH = Math.max(1, Math.round(scenesSpan.h));
  const withScenes = normalizeRuntimeLayout(
    layouts.map((item) => {
      if (!scenesSectionIds.has(item.i)) {
        return item;
      }
      return {
        ...item,
        x: 0,
        w: safeScenesW,
        h: safeScenesH,
      };
    }),
    cols,
  );
  const withLight = enforceLightWidgetSpan(
    withScenes,
    breakpoint,
    cols,
    lightWidgetStateById,
    useExplicitLightSpan,
    widgetTypeLayoutOverrides,
  );
  const withSwitch = enforceSimpleWidgetKindSpan(
    withLight,
    'switch',
    breakpoint,
    cols,
    switchWidgetIds,
    widgetTypeLayoutOverrides,
    Boolean(widgetTypeLayoutOverrides.switch?.[breakpoint]),
  );
  const withClimate = enforceSimpleWidgetKindSpan(
    withSwitch,
    'climate',
    breakpoint,
    cols,
    climateWidgetIds,
    widgetTypeLayoutOverrides,
    Boolean(widgetTypeLayoutOverrides.climate?.[breakpoint]),
  );
  const withCamera = enforceSimpleWidgetKindSpan(
    withClimate,
    'camera',
    breakpoint,
    cols,
    cameraWidgetIds,
    widgetTypeLayoutOverrides,
    Boolean(widgetTypeLayoutOverrides.camera?.[breakpoint]),
  );
  const withMedia = enforceSimpleWidgetKindSpan(
    withCamera,
    'media',
    breakpoint,
    cols,
    mediaWidgetIds,
    widgetTypeLayoutOverrides,
    Boolean(widgetTypeLayoutOverrides.media?.[breakpoint]),
  );
  const withSensor = enforceSimpleWidgetKindSpan(
    withMedia,
    'sensor',
    breakpoint,
    cols,
    sensorWidgetIds,
    widgetTypeLayoutOverrides,
    Boolean(widgetTypeLayoutOverrides.sensor?.[breakpoint]),
  );
  const withMembers = enforceSimpleWidgetKindSpan(
    withSensor,
    'members',
    breakpoint,
    cols,
    membersWidgetIds,
    widgetTypeLayoutOverrides,
    Boolean(widgetTypeLayoutOverrides.members?.[breakpoint]),
  );
  const withAlarm = enforceSimpleWidgetKindSpan(
    withMembers,
    'alarm',
    breakpoint,
    cols,
    alarmWidgetIds,
    widgetTypeLayoutOverrides,
    Boolean(widgetTypeLayoutOverrides.alarm?.[breakpoint]),
  );
  const withVacuum = enforceSimpleWidgetKindSpan(
    withAlarm,
    'vacuum',
    breakpoint,
    cols,
    vacuumWidgetIds,
    widgetTypeLayoutOverrides,
    Boolean(widgetTypeLayoutOverrides.vacuum?.[breakpoint]),
  );
  const withLock = enforceSimpleWidgetKindSpan(
    withVacuum,
    'lock',
    breakpoint,
    cols,
    lockWidgetIds,
    widgetTypeLayoutOverrides,
    Boolean(widgetTypeLayoutOverrides.lock?.[breakpoint]),
  );
  const withCover = enforceSimpleWidgetKindSpan(
    withLock,
    'cover',
    breakpoint,
    cols,
    coverWidgetIds,
    widgetTypeLayoutOverrides,
    Boolean(widgetTypeLayoutOverrides.cover?.[breakpoint]),
  );
  return enforceWidgetLayoutOverrides(
    withCover,
    breakpoint,
    cols,
    widgetLayoutOverrides,
    lightWidgetStateById,
    coverWidgetIds,
  );
}

function resolveRootMobileCompactIds(
  breakpoint: GridBreakpoint,
  cols: number,
  lightWidgetStateById: ReadonlyMap<string, boolean>,
  switchWidgetIds: ReadonlySet<string>,
  climateWidgetIds: ReadonlySet<string>,
  cameraWidgetIds: ReadonlySet<string>,
  mediaWidgetIds: ReadonlySet<string>,
  sensorWidgetIds: ReadonlySet<string>,
  membersWidgetIds: ReadonlySet<string>,
  alarmWidgetIds: ReadonlySet<string>,
  vacuumWidgetIds: ReadonlySet<string>,
  lockWidgetIds: ReadonlySet<string>,
  coverWidgetIds: ReadonlySet<string>,
) {
  const compactIds = new Set<string>();
  const safeCols = Math.max(1, Math.round(cols));
  const addIfNarrowerThanGrid = (ids: Iterable<string>, spanWidth: number) => {
    if (Math.max(1, Math.round(spanWidth)) >= safeCols) {
      return;
    }
    for (const id of ids) {
      compactIds.add(id);
    }
  };

  addIfNarrowerThanGrid(lightWidgetStateById.keys(), LIGHT_WIDGET_SPAN_BY_BREAKPOINT[breakpoint].w);
  addIfNarrowerThanGrid(switchWidgetIds, SWITCH_WIDGET_SPAN_BY_BREAKPOINT[breakpoint].w);
  addIfNarrowerThanGrid(climateWidgetIds, CLIMATE_WIDGET_SPAN_BY_BREAKPOINT[breakpoint].w);
  addIfNarrowerThanGrid(cameraWidgetIds, CAMERA_WIDGET_SPAN_BY_BREAKPOINT[breakpoint].w);
  addIfNarrowerThanGrid(mediaWidgetIds, MEDIA_WIDGET_SPAN_BY_BREAKPOINT[breakpoint].w);
  addIfNarrowerThanGrid(sensorWidgetIds, SENSOR_WIDGET_SPAN_BY_BREAKPOINT[breakpoint].w);
  addIfNarrowerThanGrid(membersWidgetIds, MEMBERS_WIDGET_SPAN_BY_BREAKPOINT[breakpoint].w);
  addIfNarrowerThanGrid(alarmWidgetIds, ALARM_WIDGET_SPAN_BY_BREAKPOINT[breakpoint].w);
  addIfNarrowerThanGrid(vacuumWidgetIds, VACUUM_WIDGET_SPAN_BY_BREAKPOINT[breakpoint].w);
  addIfNarrowerThanGrid(lockWidgetIds, LOCK_WIDGET_SPAN_BY_BREAKPOINT[breakpoint].w);
  addIfNarrowerThanGrid(coverWidgetIds, COVER_WIDGET_SPAN_BY_BREAKPOINT[breakpoint].w);

  return compactIds;
}

function buildResponsiveLayoutsFromDesktop(
  desktopLayout: GridItem[],
  scenesSectionIds: ReadonlySet<string>,
  widgetTypeLayoutOverrides: WidgetTypeLayoutOverrides,
  widgetLayoutOverrides: WidgetLayoutOverrides,
  explicitRootLayouts: GridLayouts | undefined,
  lightWidgetStateById: ReadonlyMap<string, boolean>,
  switchWidgetIds: ReadonlySet<string>,
  climateWidgetIds: ReadonlySet<string>,
  cameraWidgetIds: ReadonlySet<string>,
  mediaWidgetIds: ReadonlySet<string>,
  sensorWidgetIds: ReadonlySet<string>,
  membersWidgetIds: ReadonlySet<string>,
  alarmWidgetIds: ReadonlySet<string>,
  vacuumWidgetIds: ReadonlySet<string>,
  lockWidgetIds: ReadonlySet<string>,
  coverWidgetIds: ReadonlySet<string>,
): GridLayouts {
  const normalizeForBreakpoint = (layouts: GridItem[], breakpoint: GridBreakpoint, cols: number) => {
    const enforced = enforceRootWidgetSpans(
      normalizeRuntimeLayout(layouts, cols),
      breakpoint,
      cols,
      scenesSectionIds,
      lightWidgetStateById,
      Boolean(widgetTypeLayoutOverrides.light?.[breakpoint]),
      widgetTypeLayoutOverrides,
      widgetLayoutOverrides,
      switchWidgetIds,
      climateWidgetIds,
      cameraWidgetIds,
      mediaWidgetIds,
      sensorWidgetIds,
      membersWidgetIds,
      alarmWidgetIds,
      vacuumWidgetIds,
      lockWidgetIds,
      coverWidgetIds,
    );
    const hasCollisions = enforced.some((item, itemIndex) =>
      enforced.slice(0, itemIndex).some((previous) => intersects(item, previous)),
    );
    // A stored breakpoint layout is an explicit user composition. Preserve
    // its horizontal positions when it is valid; only repack when a span
    // change creates a real collision. This matches the live layout path and
    // prevents route/remount from moving cards into different columns.
    return hasCollisions ? packLayoutDense(enforced, cols) : compactLayoutUp(enforced, cols);
  };
  const mergeExplicitWithFallback = (explicit: GridItem[] | undefined, fallback: GridItem[]) => {
    if (!explicit || explicit.length === 0) {
      return fallback;
    }
    const explicitById = new Map(explicit.map((item) => [item.i, item]));
    return fallback.map((fallbackItem) => explicitById.get(fallbackItem.i) ?? fallbackItem);
  };
  const deriveFrom = (
    source: GridItem[],
    sourceBreakpoint: GridBreakpoint,
    targetBreakpoint: GridBreakpoint,
  ) => {
    const sourceCols = GRID_ENGINE_COLS[sourceBreakpoint];
    const targetCols = GRID_ENGINE_COLS[targetBreakpoint];
    const isMobile = targetBreakpoint === 'sm' || targetBreakpoint === 'xs';
    if (isMobile) {
      const compactMobileIds = resolveRootMobileCompactIds(
        targetBreakpoint,
        targetCols,
        lightWidgetStateById,
        switchWidgetIds,
        climateWidgetIds,
        cameraWidgetIds,
        mediaWidgetIds,
        sensorWidgetIds,
        membersWidgetIds,
        alarmWidgetIds,
        vacuumWidgetIds,
        lockWidgetIds,
        coverWidgetIds,
      );
      return adaptToMobileColumns(source, sourceCols, targetCols, compactMobileIds);
    }
    return packLayoutDense(
      source.map((item) => scaleLayoutColumns(item, sourceCols, targetCols)),
      targetCols,
    );
  };

  const xlFallback = normalizeForBreakpoint(desktopLayout, 'xl', GRID_ENGINE_XL_COLS);
  const xl = normalizeForBreakpoint(
    mergeExplicitWithFallback(explicitRootLayouts?.xl, xlFallback),
    'xl',
    GRID_ENGINE_XL_COLS,
  );
  const twoXlFallback = deriveFrom(xl, 'xl', '2xl');
  const twoXl = normalizeForBreakpoint(
    mergeExplicitWithFallback(explicitRootLayouts?.['2xl'], twoXlFallback),
    '2xl',
    GRID_ENGINE_2XL_COLS,
  );
  const lgFallback = deriveFrom(xl, 'xl', 'lg');
  const lg = normalizeForBreakpoint(
    mergeExplicitWithFallback(explicitRootLayouts?.lg, lgFallback),
    'lg',
    GRID_ENGINE_LG_COLS,
  );
  const mdFallback = deriveFrom(lg, 'lg', 'md');
  const md = normalizeForBreakpoint(
    mergeExplicitWithFallback(explicitRootLayouts?.md, mdFallback),
    'md',
    GRID_ENGINE_MD_COLS,
  );
  const smFallback = deriveFrom(md, 'md', 'sm');
  const sm = normalizeForBreakpoint(
    mergeExplicitWithFallback(explicitRootLayouts?.sm, smFallback),
    'sm',
    GRID_ENGINE_SM_COLS,
  );
  const xsFallback = deriveFrom(sm, 'sm', 'xs');
  const xs = normalizeForBreakpoint(
    mergeExplicitWithFallback(explicitRootLayouts?.xs, xsFallback),
    'xs',
    GRID_ENGINE_XS_COLS,
  );
  return { '2xl': twoXl, xl, lg, md, sm, xs };
}

export function GridCanvas({
  isEditMode,
  layoutRevision = 0,
  previewGridWidth,
  developerMode,
  isXsViewport,
  onActiveBreakpointChange,
  topRightOverlay,
  state,
  sections,
  widgets,
  runningSceneBySectionId,
  selectedWidgetId,
  selectedSectionId,
  isCatalogOpen,
  widgetTypeLayoutOverrides,
  widgetLayoutOverrides,
  responsiveLayouts,
  onCloseCatalog,
  onSelectWidget,
  onSelectSection,
  onWeatherClick,
  onSceneTrigger,
  onWidgetClick,
  onWidgetLightToggle,
  onWidgetSwitchToggle,
  onWidgetBrightnessChange,
  onWidgetLightColorChange,
  onWidgetClimateTargetTempChange,
  onWidgetClimateTargetRangeChange,
  onWidgetClimateTargetHumidityChange,
  onWidgetClimatePowerToggle,
  onWidgetClimateModeChange,
  onWidgetClimateFanModeChange,
  onWidgetClimatePresetModeChange,
  onWidgetClimateSwingModeChange,
  onWidgetClimateSwingHorizontalModeChange,
  onWidgetMediaToggle,
  onWidgetMediaPrevious,
  onWidgetMediaNext,
  onWidgetMediaSeek,
  onWidgetMediaShuffle,
  onWidgetMediaRepeat,
  onWidgetMediaSelectSource,
  onWidgetAlarmDisarm,
  onWidgetAlarmArm,
  onWidgetVacuumStartPause,
  onWidgetVacuumStop,
  onWidgetVacuumReturnToBase,
  onWidgetLockToggle,
  onWidgetLockOpen,
  onWidgetCoverPositionChange,
  onWidgetCoverTiltPositionChange,
  onWidgetCoverOpen,
  onWidgetCoverStop,
  onWidgetCoverClose,
  onOpenMembersPanel,
  onWidgetLayoutChange,
  onSectionsLayoutChange,
  onRootBreakpointLayoutChange,
  onStackBreakpointLayoutChange,
  onAddWidget,
  onAddSection,
  onUpdateSection,
  haConnected,
  haStates,
  sensorHistoryByEntity = {},
  houseMembers = [],
  onWidgetDisplayMetricsChange,
}: GridCanvasProps) {
  const { t } = useI18n();
  const sectionLabel = useCallback((kind: SectionKind) => t(SECTION_LABEL_KEYS[kind]), [t]);
  const widgetLabel = useCallback((kind: WidgetKind) => t(WIDGET_LABEL_KEYS[kind]), [t]);
  const isCanvasInteractingRef = useRef(false);
  const xsLongPressTimerRef = useRef<number | null>(null);
  const xsLongPressPointerIdRef = useRef<number | null>(null);
  const xsLongPressStartPointRef = useRef<{ x: number; y: number } | null>(null);
  const xsLongPressTriggeredRef = useRef(false);
  const xsSuppressNextCardClickRef = useRef(false);
  const runtimeGridHostRef = useRef<HTMLDivElement | null>(null);
  const canvasScrollRef = useRef<HTMLDivElement | null>(null);
  const canvasDragStartItemRef = useRef<GridItem | null>(null);
  const canvasAutoScrollFrameRef = useRef<number | null>(null);
  const canvasAutoScrollVelocityRef = useRef(0);
  const catalogWasOpenRef = useRef(false);
  const compactDragHoldTimerRef = useRef<number | null>(null);
  const compactDragHoldStartRef = useRef<CompactDragHoldStart | null>(null);
  const compactDragArmedElementRef = useRef<HTMLElement | null>(null);
  const hasCanvasDragMovedRef = useRef(false);
  const stableRuntimeGridWidthRef = useRef(0);
  const resolvedRuntimeStackWidthsRef = useRef<Set<string>>(new Set());
  const runtimeStackWidthSettleTimersRef = useRef<Map<string, number>>(new Map());
  const lastLiveGridEngineLayoutsRef = useRef<GridLayouts>({});
  const [isMounted, setIsMounted] = useState(false);
  const [runtimeGridWidth, setRuntimeGridWidth] = useState(0);
  const [isCanvasTouchLocked, setIsCanvasTouchLocked] = useState(false);
  const [compactDragArmedItemId, setCompactDragArmedItemId] = useState<string | null>(null);
  const [catalogTab, setCatalogTab] = useState<CatalogTab>('cards');
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogDestination, setCatalogDestination] = useState<WidgetCatalogDestination>({ type: 'canvas' });
  const [selectedCatalogWidgetKind, setSelectedCatalogWidgetKind] = useState<WidgetKind | null>(null);
  const [selectedCatalogSectionKind, setSelectedCatalogSectionKind] = useState<SectionKind | null>(null);
  const [catalogFeedback, setCatalogFeedback] = useState<string | null>(null);
  const [keyboardLayoutAnnouncement, setKeyboardLayoutAnnouncement] = useState('');
  useEffect(
    () => () => {
      runtimeStackWidthSettleTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      runtimeStackWidthSettleTimersRef.current.clear();
    },
    [],
  );
  // The canvas content box is the single source of truth for responsive
  // geometry. Using window.innerWidth here disagrees with RGL whenever a
  // sidebar, Builder or an embedded shell narrows the actual canvas and can
  // make the layout bounce between (for example) 2xl and xl on every live
  // entity update.
  const gridEngineActiveBreakpoint = useMemo<GridBreakpoint>(
    () => resolveActiveBreakpoint(runtimeGridWidth > 0 ? runtimeGridWidth : getViewportWidth()),
    [runtimeGridWidth],
  );
  useEffect(() => {
    if (isCatalogOpen && !catalogWasOpenRef.current) {
      const selectedStack = selectedSectionId
        ? sections.find((section) => section.id === selectedSectionId && isStackSection(section))
        : undefined;
      setCatalogTab('cards');
      setCatalogQuery('');
      setCatalogDestination(selectedStack ? { type: 'stack', sectionId: selectedStack.id } : { type: 'canvas' });
      setSelectedCatalogWidgetKind(null);
      setSelectedCatalogSectionKind(null);
      setCatalogFeedback(null);
    }

    if (!isCatalogOpen && catalogWasOpenRef.current) {
      setCatalogFeedback(null);
    }

    catalogWasOpenRef.current = isCatalogOpen;
  }, [isCatalogOpen, sections, selectedSectionId]);

  useEffect(() => {
    if (
      catalogDestination.type === 'stack' &&
      !sections.some((section) => section.id === catalogDestination.sectionId && isStackSection(section))
    ) {
      setCatalogDestination({ type: 'canvas' });
    }
  }, [catalogDestination, sections]);

  useEffect(() => {
    if (!onActiveBreakpointChange || runtimeGridWidth <= 0) {
      return;
    }
    onActiveBreakpointChange(gridEngineActiveBreakpoint);
  }, [gridEngineActiveBreakpoint, onActiveBreakpointChange, runtimeGridWidth]);
  const [gridEngineLayouts, setGridEngineLayouts] = useState<GridLayouts>({});
  const [synchronizedLayoutRevision, setSynchronizedLayoutRevision] = useState(layoutRevision);
  const clearXsLongPressTimer = useCallback(() => {
    if (xsLongPressTimerRef.current !== null) {
      window.clearTimeout(xsLongPressTimerRef.current);
      xsLongPressTimerRef.current = null;
    }
  }, []);
  const resetXsLongPressState = useCallback(() => {
    clearXsLongPressTimer();
    xsLongPressPointerIdRef.current = null;
    xsLongPressStartPointRef.current = null;
    xsLongPressTriggeredRef.current = false;
  }, [clearXsLongPressTimer]);
  const isXsLongPressMode = !isEditMode && isXsViewport;
  const isCompactEditCardMenuMode =
    isEditMode && (gridEngineActiveBreakpoint === 'xs' || gridEngineActiveBreakpoint === 'sm');
  const clearCompactDragHoldTimer = useCallback(() => {
    if (compactDragHoldTimerRef.current !== null) {
      window.clearTimeout(compactDragHoldTimerRef.current);
      compactDragHoldTimerRef.current = null;
    }
  }, []);
  const disarmCompactDragHandle = useCallback(() => {
    compactDragArmedElementRef.current?.classList.remove('compact-edit-drag-handle');
    compactDragArmedElementRef.current = null;
    setCompactDragArmedItemId(null);
  }, []);
  const resetCompactDragHold = useCallback(
    (options?: { keepArmed?: boolean }) => {
      clearCompactDragHoldTimer();
      compactDragHoldStartRef.current = null;
      if (!options?.keepArmed) {
        disarmCompactDragHandle();
      }
    },
    [clearCompactDragHoldTimer, disarmCompactDragHandle],
  );
  const startCompactDragHold = useCallback(
    (hold: CompactDragHoldStart) => {
      if (!isCompactEditCardMenuMode) {
        return;
      }

      resetCompactDragHold();
      compactDragHoldStartRef.current = hold;
      compactDragHoldTimerRef.current = window.setTimeout(() => {
        const activeHold = compactDragHoldStartRef.current;
        if (!activeHold || activeHold !== hold) {
          return;
        }

        activeHold.element.classList.add('compact-edit-drag-handle');
        activeHold.element.classList.add('compact-drag-arm-feedback');
        compactDragArmedElementRef.current = activeHold.element;
        setCompactDragArmedItemId(activeHold.itemId);
        compactDragHoldTimerRef.current = null;
        window.setTimeout(() => {
          activeHold.element.classList.remove('compact-drag-arm-feedback');
        }, 260);
        window.requestAnimationFrame(() => {
          if (compactDragHoldStartRef.current === activeHold) {
            dispatchCompactDragStartEvent(activeHold);
          }
        });
      }, COMPACT_DRAG_LONG_PRESS_MS);
    },
    [isCompactEditCardMenuMode, resetCompactDragHold],
  );
  const cancelCompactDragHoldIfMoved = useCallback(
    (clientX: number, clientY: number) => {
      if (compactDragArmedElementRef.current) {
        return;
      }

      const hold = compactDragHoldStartRef.current;
      if (!hold) {
        return;
      }

      const distance = Math.hypot(clientX - hold.x, clientY - hold.y);
      if (distance > COMPACT_DRAG_HOLD_MOVE_TOLERANCE_PX) {
        resetCompactDragHold();
      }
    },
    [resetCompactDragHold],
  );
  const isCompactDragHoldBlockedTarget = useCallback((target: EventTarget | null) => {
    const targetNode = target as Element | null;
    return Boolean(
      targetNode?.closest(
        'button,input,select,textarea,a,[contenteditable="true"],.widget-action,.section-action,.builder-grid,.react-resizable-handle',
      ),
    );
  }, []);
  const handleCompactDragTouchStart = useCallback(
    (event: React.TouchEvent<HTMLDivElement>, itemId: string) => {
      if (!isCompactEditCardMenuMode || !event.nativeEvent.isTrusted || event.touches.length !== 1) {
        return;
      }
      if (isCompactDragHoldBlockedTarget(event.target)) {
        return;
      }

      const touch = event.touches[0];
      if (!touch) {
        return;
      }

      startCompactDragHold({
        itemId,
        element: event.currentTarget,
        x: touch.clientX,
        y: touch.clientY,
        input: {
          kind: 'touch',
          touch: {
            identifier: touch.identifier,
            clientX: touch.clientX,
            clientY: touch.clientY,
            screenX: touch.screenX,
            screenY: touch.screenY,
            pageX: touch.pageX,
            pageY: touch.pageY,
          },
        },
      });
    },
    [isCompactDragHoldBlockedTarget, isCompactEditCardMenuMode, startCompactDragHold],
  );
  const handleCompactDragTouchMove = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (!isCompactEditCardMenuMode || event.touches.length !== 1) {
        return;
      }

      const touch = event.touches[0];
      if (touch) {
        cancelCompactDragHoldIfMoved(touch.clientX, touch.clientY);
      }
    },
    [cancelCompactDragHoldIfMoved, isCompactEditCardMenuMode],
  );
  const handleCompactDragMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>, itemId: string) => {
      if (!isCompactEditCardMenuMode || !event.nativeEvent.isTrusted || event.button !== 0) {
        return;
      }
      if (isCompactDragHoldBlockedTarget(event.target)) {
        return;
      }

      startCompactDragHold({
        itemId,
        element: event.currentTarget,
        x: event.clientX,
        y: event.clientY,
        input: {
          kind: 'mouse',
          clientX: event.clientX,
          clientY: event.clientY,
          screenX: event.screenX,
          screenY: event.screenY,
        },
      });
    },
    [isCompactDragHoldBlockedTarget, isCompactEditCardMenuMode, startCompactDragHold],
  );
  const handleCompactDragMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!isCompactEditCardMenuMode) {
        return;
      }
      cancelCompactDragHoldIfMoved(event.clientX, event.clientY);
    },
    [cancelCompactDragHoldIfMoved, isCompactEditCardMenuMode],
  );
  const handleCompactDragHoldEnd = useCallback(() => {
    if (isCanvasInteractingRef.current) {
      return;
    }
    resetCompactDragHold();
  }, [resetCompactDragHold]);
  const stopCanvasAutoScroll = useCallback(() => {
    canvasAutoScrollVelocityRef.current = 0;
    if (canvasAutoScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(canvasAutoScrollFrameRef.current);
      canvasAutoScrollFrameRef.current = null;
    }
  }, []);
  const runCanvasAutoScroll = useCallback(() => {
    const scrollNode = canvasScrollRef.current;
    const velocity = canvasAutoScrollVelocityRef.current;
    if (!scrollNode || velocity === 0) {
      canvasAutoScrollFrameRef.current = null;
      return;
    }

    const maxScrollTop = Math.max(0, scrollNode.scrollHeight - scrollNode.clientHeight);
    const nextScrollTop = Math.min(maxScrollTop, Math.max(0, scrollNode.scrollTop + velocity));
    if (nextScrollTop === scrollNode.scrollTop) {
      stopCanvasAutoScroll();
      return;
    }

    scrollNode.scrollTop = nextScrollTop;
    canvasAutoScrollFrameRef.current = window.requestAnimationFrame(runCanvasAutoScroll);
  }, [stopCanvasAutoScroll]);
  const updateCanvasAutoScroll = useCallback(
    (clientY: number | null) => {
      if (!isCompactEditCardMenuMode || clientY === null) {
        stopCanvasAutoScroll();
        return;
      }

      const scrollNode = canvasScrollRef.current;
      if (!scrollNode) {
        stopCanvasAutoScroll();
        return;
      }

      const rect = scrollNode.getBoundingClientRect();
      const topDistance = clientY - rect.top;
      const bottomDistance = rect.bottom - clientY;
      let nextVelocity = 0;

      if (topDistance < COMPACT_DRAG_AUTOSCROLL_EDGE_PX) {
        const intensity = Math.max(0, 1 - topDistance / COMPACT_DRAG_AUTOSCROLL_EDGE_PX);
        nextVelocity = -Math.max(0.75, intensity * COMPACT_DRAG_AUTOSCROLL_MAX_PX);
      } else if (bottomDistance < COMPACT_DRAG_AUTOSCROLL_EDGE_PX) {
        const intensity = Math.max(0, 1 - bottomDistance / COMPACT_DRAG_AUTOSCROLL_EDGE_PX);
        nextVelocity = Math.max(0.75, intensity * COMPACT_DRAG_AUTOSCROLL_MAX_PX);
      }

      if (nextVelocity === 0) {
        stopCanvasAutoScroll();
        return;
      }

      canvasAutoScrollVelocityRef.current = nextVelocity;
      if (canvasAutoScrollFrameRef.current === null) {
        canvasAutoScrollFrameRef.current = window.requestAnimationFrame(runCanvasAutoScroll);
      }
    },
    [isCompactEditCardMenuMode, runCanvasAutoScroll, stopCanvasAutoScroll],
  );
  useEffect(() => {
    if (isCompactEditCardMenuMode) {
      return;
    }
    resetCompactDragHold();
    setIsCanvasTouchLocked(false);
    stopCanvasAutoScroll();
  }, [isCompactEditCardMenuMode, resetCompactDragHold, stopCanvasAutoScroll]);
  const handleXsLongPressStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, widget: Widget) => {
      if (!isXsLongPressMode) {
        return;
      }
      if (event.pointerType === 'mouse' && event.button !== 0) {
        return;
      }
      xsLongPressTriggeredRef.current = false;
      xsSuppressNextCardClickRef.current = false;
      const targetNode = event.target as Element | null;
      if (targetNode?.closest('button,input,select,textarea,a,[contenteditable="true"]')) {
        return;
      }
      if (event.pointerType !== 'mouse') {
        event.preventDefault();
      }
      resetXsLongPressState();
      xsLongPressPointerIdRef.current = event.pointerId;
      xsLongPressStartPointRef.current = { x: event.clientX, y: event.clientY };
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // no-op: pointer capture may fail on some browsers
      }
      xsLongPressTimerRef.current = window.setTimeout(() => {
        xsLongPressTriggeredRef.current = true;
        xsSuppressNextCardClickRef.current = true;
        onWidgetClick(widget);
      }, XS_CONTEXT_OPEN_LONG_PRESS_MS);
    },
    [isXsLongPressMode, onWidgetClick, resetXsLongPressState],
  );
  const handleXsLongPressMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (xsLongPressPointerIdRef.current !== event.pointerId) {
      return;
    }
    const start = xsLongPressStartPointRef.current;
    if (!start) {
      return;
    }
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    const distance = Math.hypot(deltaX, deltaY);
    if (distance > XS_CONTEXT_OPEN_MOVE_TOLERANCE_PX) {
      resetXsLongPressState();
    }
  }, [resetXsLongPressState]);
  const handleXsLongPressEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (xsLongPressPointerIdRef.current !== event.pointerId) {
      return;
    }
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // no-op: capture may already be released
    }
    resetXsLongPressState();
  }, [resetXsLongPressState]);
  useEffect(() => {
    setIsMounted(true);
  }, []);
  useEffect(() => {
    return () => {
      resetXsLongPressState();
      resetCompactDragHold();
      stopCanvasAutoScroll();
    };
  }, [resetCompactDragHold, resetXsLongPressState, stopCanvasAutoScroll]);
  useEffect(() => {
    if (!isXsLongPressMode) {
      resetXsLongPressState();
    }
  }, [isXsLongPressMode, resetXsLongPressState]);
  useEffect(() => {
    const host = runtimeGridHostRef.current;
    if (!host) {
      return;
    }

    const applyWidth = () => {
      // RGL lives in the host content box. clientWidth still includes the
      // responsive horizontal padding, so remove it before calculating both
      // the root columns and every nested stack width.
      const hostStyle = window.getComputedStyle(host);
      const paddingLeft = Number.parseFloat(hostStyle.paddingLeft) || 0;
      const paddingRight = Number.parseFloat(hostStyle.paddingRight) || 0;
      const next = Math.max(0, Math.round(host.clientWidth - paddingLeft - paddingRight));
      const previous = stableRuntimeGridWidthRef.current;
      if (previous > 0 && Math.abs(next - previous) < RUNTIME_GRID_WIDTH_JITTER_PX) {
        return;
      }
      stableRuntimeGridWidthRef.current = next;
      setRuntimeGridWidth((current) => (current === next ? current : next));
    };

    let rafId = 0;
    const updateWidth = () => {
      if (rafId) {
        return;
      }
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        applyWidth();
      });
    };

    updateWidth();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateWidth);
      return () => {
        if (rafId) {
          window.cancelAnimationFrame(rafId);
        }
        window.removeEventListener('resize', updateWidth);
      };
    }

    const observer = new ResizeObserver(() => {
      updateWidth();
    });
    observer.observe(host);

    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      observer.disconnect();
    };
  }, []);
  const rootWidgets = useMemo(() => widgets.filter((widget) => !widget.parentSectionId), [widgets]);
  const rootLightWidgetStateById = useMemo(
    () =>
      new Map(
        rootWidgets
          .filter((widget) => widget.kind === 'light')
          .map((widget) => [widget.id, widget.isOn] as const),
      ),
    [rootWidgets],
  );
  const rootSwitchWidgetIds = useMemo(
    () =>
      new Set(
        rootWidgets
          .filter((widget) => widget.kind === 'switch')
          .map((widget) => widget.id),
      ),
    [rootWidgets],
  );
  const rootClimateWidgetIds = useMemo(
    () =>
      new Set(
        rootWidgets
          .filter((widget) => widget.kind === 'climate')
          .map((widget) => widget.id),
      ),
    [rootWidgets],
  );
  const rootCameraWidgetIds = useMemo(
    () =>
      new Set(
        rootWidgets
          .filter((widget) => widget.kind === 'camera')
          .map((widget) => widget.id),
      ),
    [rootWidgets],
  );
  const rootMediaWidgetIds = useMemo(
    () =>
      new Set(
        rootWidgets
          .filter((widget) => widget.kind === 'media')
          .map((widget) => widget.id),
      ),
    [rootWidgets],
  );
  const rootSensorWidgetIds = useMemo(
    () =>
      new Set(
        rootWidgets
          .filter((widget) => widget.kind === 'sensor')
          .map((widget) => widget.id),
      ),
    [rootWidgets],
  );
  const rootMembersWidgetIds = useMemo(
    () =>
      new Set(
        rootWidgets
          .filter((widget) => widget.kind === 'members')
          .map((widget) => widget.id),
      ),
    [rootWidgets],
  );
  const rootAlarmWidgetIds = useMemo(
    () =>
      new Set(
        rootWidgets
          .filter((widget) => widget.kind === 'alarm')
          .map((widget) => widget.id),
      ),
    [rootWidgets],
  );
  const rootVacuumWidgetIds = useMemo(
    () =>
      new Set(
        rootWidgets
          .filter((widget) => widget.kind === 'vacuum')
          .map((widget) => widget.id),
      ),
    [rootWidgets],
  );
  const rootLockWidgetIds = useMemo(
    () =>
      new Set(
        rootWidgets
          .filter((widget) => widget.kind === 'lock')
          .map((widget) => widget.id),
      ),
    [rootWidgets],
  );
  const rootCoverWidgetIds = useMemo(
    () =>
      new Set(
        rootWidgets
          .filter((widget) => widget.kind === 'cover')
          .map((widget) => widget.id),
      ),
    [rootWidgets],
  );
  const rootScenesSectionIds = useMemo(
    () => new Set(sections.filter((section) => section.kind === 'scenes').map((section) => section.id)),
    [sections],
  );
  const stackSectionsById = useMemo(
    () => new Map(
      sections
        .filter((section) =>
          section.kind === 'stack-vertical' ||
          section.kind === 'stack-horizontal' ||
          section.kind === 'stack-grid'
        )
        .map((section) => [section.id, section] as const),
    ),
    [sections],
  );
  const desktopLayout = useMemo<GridItem[]>(
    () =>
      normalizeGridItems([
        ...sections.map((section) => ({
          i: section.id,
          x: section.layout.x,
          y: section.layout.y,
          w: section.layout.w,
          h: section.layout.h,
        })),
        ...rootWidgets.map((widget) => ({
          i: widget.id,
          x: widget.layout.x,
          y: widget.layout.y,
          w: widget.layout.w,
          h: widget.layout.h,
        })),
      ]),
    [rootWidgets, sections],
  );
  const derivedGridEngineLayouts = useMemo(
    () =>
      buildResponsiveLayoutsFromDesktop(
        desktopLayout,
        rootScenesSectionIds,
        widgetTypeLayoutOverrides,
        widgetLayoutOverrides,
        responsiveLayouts.root,
        rootLightWidgetStateById,
        rootSwitchWidgetIds,
        rootClimateWidgetIds,
        rootCameraWidgetIds,
        rootMediaWidgetIds,
        rootSensorWidgetIds,
        rootMembersWidgetIds,
        rootAlarmWidgetIds,
        rootVacuumWidgetIds,
        rootLockWidgetIds,
        rootCoverWidgetIds,
      ),
    [
      desktopLayout,
      widgetTypeLayoutOverrides,
      widgetLayoutOverrides,
      responsiveLayouts.root,
      rootScenesSectionIds,
      rootLightWidgetStateById,
      rootSwitchWidgetIds,
      rootClimateWidgetIds,
      rootCameraWidgetIds,
      rootMediaWidgetIds,
      rootSensorWidgetIds,
      rootMembersWidgetIds,
      rootAlarmWidgetIds,
      rootVacuumWidgetIds,
      rootCoverWidgetIds,
    ],
  );
  const gridEngineActiveCols = GRID_ENGINE_COLS[gridEngineActiveBreakpoint];
  const isTabletCanvas =
    gridEngineActiveBreakpoint === 'md' ||
    gridEngineActiveBreakpoint === 'sm' ||
    gridEngineActiveBreakpoint === 'xs';
  const runtimeGridEffectiveWidth = useMemo(
    () => Math.max(0, runtimeGridWidth),
    [runtimeGridWidth],
  );
  const hasPendingAuthoritativeLayout = synchronizedLayoutRevision !== layoutRevision;
  useLayoutEffect(() => {
    if (!hasPendingAuthoritativeLayout) {
      return;
    }
    isCanvasInteractingRef.current = false;
    setGridEngineLayouts(derivedGridEngineLayouts);
    lastLiveGridEngineLayoutsRef.current = derivedGridEngineLayouts;
    setSynchronizedLayoutRevision(layoutRevision);
  }, [derivedGridEngineLayouts, hasPendingAuthoritativeLayout, layoutRevision]);
  const isRuntimeGridReady = isMounted && runtimeGridEffectiveWidth > 0;
  const gridEngineColumnWidth = useMemo(() => {
    const activePadding = GRID_ENGINE_CONTAINER_PADDING[gridEngineActiveBreakpoint] ?? [0, 0];
    const horizontalPadding = activePadding[0] * 2;
    const safeWidth = Math.max(runtimeGridEffectiveWidth - horizontalPadding, 1);
    const totalGap = GRID_ENGINE_GAP_PX * Math.max(0, gridEngineActiveCols - 1);
    return Math.max(1, (safeWidth - totalGap) / Math.max(1, gridEngineActiveCols));
  }, [gridEngineActiveBreakpoint, gridEngineActiveCols, runtimeGridEffectiveWidth]);
  const normalizeRootLayoutForBreakpoint = useCallback(
    (layouts: GridItem[], breakpoint: GridBreakpoint, cols: number) =>
      compactLayoutUp(
        enforceRootWidgetSpans(
          normalizeRuntimeLayout(layouts, cols),
          breakpoint,
          cols,
          rootScenesSectionIds,
          rootLightWidgetStateById,
          Boolean(widgetTypeLayoutOverrides.light?.[breakpoint]),
          widgetTypeLayoutOverrides,
          widgetLayoutOverrides,
          rootSwitchWidgetIds,
          rootClimateWidgetIds,
          rootCameraWidgetIds,
          rootMediaWidgetIds,
          rootSensorWidgetIds,
          rootMembersWidgetIds,
          rootAlarmWidgetIds,
          rootVacuumWidgetIds,
          rootLockWidgetIds,
          rootCoverWidgetIds,
        ),
        cols,
      ),
    [
      rootLightWidgetStateById,
      rootSwitchWidgetIds,
      widgetTypeLayoutOverrides,
      widgetLayoutOverrides,
      rootScenesSectionIds,
      rootClimateWidgetIds,
      rootCameraWidgetIds,
      rootMediaWidgetIds,
      rootSensorWidgetIds,
      rootMembersWidgetIds,
      rootAlarmWidgetIds,
      rootVacuumWidgetIds,
      rootLockWidgetIds,
      rootCoverWidgetIds,
    ],
  );
  useEffect(() => {
    if (isCanvasInteractingRef.current) {
      return;
    }
    setGridEngineLayouts((current) => {
      let changed = false;
      const next: GridLayouts = { ...current };

      GRID_ENGINE_BREAKPOINT_ORDER.forEach((breakpoint) => {
        const cols = GRID_ENGINE_COLS[breakpoint];
        const derived = derivedGridEngineLayouts[breakpoint] ?? [];
        const currentLayout = current[breakpoint] ?? [];
        const currentById = new Map(currentLayout.map((item) => [item.i, item]));
        const merged: GridItem[] = derived.map((derivedItem) => {
          const currentItem = currentById.get(derivedItem.i);
          if (!currentItem) {
            return derivedItem;
          }
          const stackSection = stackSectionsById.get(derivedItem.i);
          const preserveRuntimeStackSpan = stackSection?.kind === 'stack-grid' && stackSection.stackColumnsMode !== 'manual';
          const configuredStackWidth = stackSection && !preserveRuntimeStackSpan
            ? Math.max(
                1,
                Math.min(
                  cols,
                  stackSection.kind === 'stack-vertical'
                    ? 1
                    : Math.round(stackSection.stackColumns ?? stackSection.layout.w),
                ),
              )
            : null;
          const mergedItem: GridItem = {
            ...currentItem,
            // Keep user positioning for this breakpoint, but always consume the
            // latest span generated by the layout engine (type overrides/panel).
            // Grid stacks are the exception: their live span is calculated from
            // the inner grid. Replacing it here with the derived XL span creates
            // a resize loop and can collapse a 2xl stack before it is persisted.
            w: configuredStackWidth ?? (preserveRuntimeStackSpan ? currentItem.w : derivedItem.w),
            h: preserveRuntimeStackSpan ? currentItem.h : derivedItem.h,
          };
          if (rootScenesSectionIds.has(derivedItem.i)) {
            mergedItem.x = derivedItem.x;
          }
          return mergedItem;
        });

        const normalized = normalizeRootLayoutForBreakpoint(merged, breakpoint, cols);
        if (!sameGridLayout(currentLayout, normalized)) {
          next[breakpoint] = normalized;
          changed = true;
        }
      });

      return changed ? next : current;
    });
  }, [derivedGridEngineLayouts, normalizeRootLayoutForBreakpoint, stackSectionsById]);
  const liveGridEngineLayouts = useMemo<GridLayouts>(() => {
    const merged: GridLayouts = {};
    GRID_ENGINE_BREAKPOINT_ORDER.forEach((breakpoint) => {
      const runtimeSource = hasPendingAuthoritativeLayout ? undefined : gridEngineLayouts[breakpoint];
      const source = runtimeSource && runtimeSource.length > 0
        ? runtimeSource
        : derivedGridEngineLayouts[breakpoint] ?? [];
      merged[breakpoint] = normalizeRootLayoutForBreakpoint(source, breakpoint, GRID_ENGINE_COLS[breakpoint]);
    });
    const previous = lastLiveGridEngineLayoutsRef.current;
    if (sameGridLayouts(previous, merged)) {
      return previous;
    }
    lastLiveGridEngineLayoutsRef.current = merged;
    return merged;
  }, [
    derivedGridEngineLayouts,
    gridEngineLayouts,
    hasPendingAuthoritativeLayout,
    normalizeRootLayoutForBreakpoint,
    widgetTypeLayoutOverrides,
  ]);
  const liveGridEngineLayout = liveGridEngineLayouts[gridEngineActiveBreakpoint] ?? [];
  const liveGridUsedRows = useMemo(
    () =>
      liveGridEngineLayout.reduce(
        (maxRows, item) => Math.max(maxRows, Math.max(0, Math.round(item.y)) + Math.max(1, Math.round(item.h))),
        0,
      ),
    [liveGridEngineLayout],
  );
  const liveGridEngineLayoutMap = useMemo(
    () => new Map(liveGridEngineLayout.map((item) => [item.i, item])),
    [liveGridEngineLayout],
  );
  const hasGridItemMoved = useCallback((start: GridItem | null, next: GridItem | undefined | null) => {
    if (!start || !next) {
      return false;
    }
    return (
      Math.round(start.x) !== Math.round(next.x) ||
      Math.round(start.y) !== Math.round(next.y) ||
      Math.round(start.w) !== Math.round(next.w) ||
      Math.round(start.h) !== Math.round(next.h)
    );
  }, []);
  const stackSections = useMemo(() => sections.filter(isStackSection), [sections]);
  const catalogDestinationOptions = useMemo(
    () => [
      { id: 'canvas', name: 'Dashboard principale' },
      ...stackSections.map((section) => {
        const cardsCount = widgets.filter((widget) => widget.parentSectionId === section.id).length;
        const sectionName = section.title?.trim() || sectionLabel(section.kind);
        return {
          id: section.id,
          name: `${sectionName} · ${cardsCount} card`,
        };
      }),
    ],
    [stackSections, widgets],
  );
  const selectedCatalogDestinationOption = useMemo(() => {
    const destinationId = catalogDestination.type === 'stack' ? catalogDestination.sectionId : 'canvas';
    return catalogDestinationOptions.find((option) => option.id === destinationId) ?? catalogDestinationOptions[0] ?? null;
  }, [catalogDestination, catalogDestinationOptions]);
  const normalizedCatalogQuery = catalogQuery.trim().toLocaleLowerCase('it');
  const filteredWidgetCatalog = useMemo(
    () =>
      WIDGET_CATALOG.filter((item) => {
        if (!normalizedCatalogQuery) return true;
        const meta = WIDGET_CATALOG_META[item.kind];
        return `${widgetLabel(item.kind)} ${t(meta.descriptionKey)} ${t(CATALOG_FAMILY_KEYS[meta.family])}`.toLocaleLowerCase().includes(normalizedCatalogQuery);
      }),
    [normalizedCatalogQuery],
  );
  const filteredSectionCatalog = useMemo(
    () =>
      SECTION_CATALOG.filter((item) => {
        if (!normalizedCatalogQuery) return true;
        const meta = SECTION_CATALOG_META[item.kind];
        return `${sectionLabel(item.kind)} ${t(meta.descriptionKey)}`.toLocaleLowerCase().includes(normalizedCatalogQuery);
      }),
    [normalizedCatalogQuery],
  );
  const selectedCatalogDestinationName = selectedCatalogDestinationOption?.name ?? t('home.catalog.mainDashboard');
  const selectedCatalogItemLabel =
    catalogTab === 'cards'
      ? (selectedCatalogWidgetKind ? widgetLabel(selectedCatalogWidgetKind) : undefined)
      : (selectedCatalogSectionKind ? sectionLabel(selectedCatalogSectionKind) : undefined);
  const canConfirmCatalogSelection = catalogTab === 'cards' ? Boolean(selectedCatalogWidgetKind) : Boolean(selectedCatalogSectionKind);
  const catalogConfirmLabel = catalogTab === 'sections'
    ? t('home.catalog.createSection')
    : catalogDestination.type === 'stack'
      ? t('home.catalog.addTo', { destination: selectedCatalogDestinationOption?.name.split(' · ')[0] ?? 'stack' })
      : t('home.catalog.addToCanvas');
  const confirmCatalogSelection = useCallback(() => {
    if (catalogTab === 'cards') {
      if (!selectedCatalogWidgetKind) return;
      onAddWidget(selectedCatalogWidgetKind, catalogDestination);
      setCatalogFeedback(t('home.catalog.cardAdded', { item: widgetLabel(selectedCatalogWidgetKind) || t('home.catalog.fallbackCard'), destination: selectedCatalogDestinationName }));
      setSelectedCatalogWidgetKind(null);
      return;
    }

    if (!selectedCatalogSectionKind) return;
    onAddSection(selectedCatalogSectionKind);
    setCatalogFeedback(t('home.catalog.sectionCreated', { item: sectionLabel(selectedCatalogSectionKind) || t('home.catalog.fallbackSection') }));
    setSelectedCatalogSectionKind(null);
  }, [
    catalogDestination,
    catalogTab,
    onAddSection,
    onAddWidget,
    selectedCatalogDestinationName,
    selectedCatalogSectionKind,
    selectedCatalogWidgetKind,
  ]);
  const sectionIdSet = useMemo(() => new Set(sections.map((section) => section.id)), [sections]);
  const sectionById = useMemo(
    () => new Map(sections.map((section) => [section.id, section] as const)),
    [sections],
  );
  const sectionKindById = useMemo(
    () => new Map(sections.map((section) => [section.id, section.kind] as const)),
    [sections],
  );
  const rootWidgetIdSet = useMemo(() => new Set(rootWidgets.map((widget) => widget.id)), [rootWidgets]);
  const commitGridEngineLayouts = useCallback(
    (layouts: GridLayouts, activeLayout?: GridItem[]) => {
      const activeCols = GRID_ENGINE_COLS[gridEngineActiveBreakpoint];
      const activeSource =
        activeLayout && activeLayout.length > 0
          ? activeLayout
          : layouts[gridEngineActiveBreakpoint] ?? [];
      const normalizedActive = normalizeRootLayoutForBreakpoint(
        activeSource,
        gridEngineActiveBreakpoint,
        activeCols,
      );
      onRootBreakpointLayoutChange(gridEngineActiveBreakpoint, normalizedActive);
      if (gridEngineActiveBreakpoint !== GRID_ENGINE_CANONICAL_BREAKPOINT) {
        return;
      }
      onSectionsLayoutChange(
        normalizedActive.map((item) =>
          scaleLayoutColumns(
            {
              i: item.i,
              x: Math.max(0, Math.round(item.x)),
              y: Math.max(0, Math.round(item.y)),
              w: Math.max(1, Math.round(item.w)),
              h: Math.max(1, Math.round(item.h)),
            },
            activeCols,
            ROOT_CANVAS_COLS,
          ),
        ),
      );
    },
    [
      gridEngineActiveBreakpoint,
      normalizeRootLayoutForBreakpoint,
      onRootBreakpointLayoutChange,
      onSectionsLayoutChange,
    ],
  );
  const updateGridEngineLayouts = useCallback(
    (nextLayouts: ResponsiveLayouts<GridBreakpoint>) => {
      const parsed = toGridLayouts(nextLayouts);
      const next: GridLayouts = { ...gridEngineLayouts };
      const currentCols = GRID_ENGINE_COLS[gridEngineActiveBreakpoint];
      const incomingActive = parsed[gridEngineActiveBreakpoint] ?? [];
      const hasIncomingActive = incomingActive.length > 0;

      if (hasIncomingActive) {
        next[gridEngineActiveBreakpoint] = normalizeRootLayoutForBreakpoint(
          incomingActive,
          gridEngineActiveBreakpoint,
          currentCols,
        );
      } else {
        const existingLayout = next[gridEngineActiveBreakpoint];
        if (existingLayout && existingLayout.length > 0) {
          next[gridEngineActiveBreakpoint] = normalizeRootLayoutForBreakpoint(
            existingLayout,
            gridEngineActiveBreakpoint,
            currentCols,
          );
        } else {
          const parentBreakpoint =
            resolveClosestParentBreakpointWithLayout(next, gridEngineActiveBreakpoint, GRID_ENGINE_BREAKPOINT_ORDER) ??
            resolveClosestParentBreakpointWithLayout(
              derivedGridEngineLayouts,
              gridEngineActiveBreakpoint,
              GRID_ENGINE_BREAKPOINT_ORDER,
            );
          const parentLayout =
            (parentBreakpoint
              ? next[parentBreakpoint]?.length
                ? next[parentBreakpoint]
                : derivedGridEngineLayouts[parentBreakpoint]
              : undefined) ?? derivedGridEngineLayouts.xl ?? derivedGridEngineLayouts['2xl'] ?? [];
          const parentCols = parentBreakpoint ? GRID_ENGINE_COLS[parentBreakpoint] : GRID_ENGINE_XL_COLS;
          const isMobile = gridEngineActiveBreakpoint === 'sm' || gridEngineActiveBreakpoint === 'xs';
          const compactMobileIds = resolveRootMobileCompactIds(
            gridEngineActiveBreakpoint,
            currentCols,
            rootLightWidgetStateById,
            rootSwitchWidgetIds,
            rootClimateWidgetIds,
            rootCameraWidgetIds,
            rootMediaWidgetIds,
            rootSensorWidgetIds,
            rootMembersWidgetIds,
            rootAlarmWidgetIds,
            rootVacuumWidgetIds,
            rootLockWidgetIds,
            rootCoverWidgetIds,
          );
          const generated = isMobile
            ? adaptToMobileColumns(parentLayout, parentCols, currentCols, compactMobileIds)
            : packLayoutDense(
                parentLayout.map((item) => scaleLayoutColumns(item, parentCols, currentCols)),
                currentCols,
              );
          next[gridEngineActiveBreakpoint] = packLayoutDense(
            enforceRootWidgetSpans(
              normalizeRuntimeLayout(generated, currentCols),
              gridEngineActiveBreakpoint,
              currentCols,
              rootScenesSectionIds,
              rootLightWidgetStateById,
              Boolean(widgetTypeLayoutOverrides.light?.[gridEngineActiveBreakpoint]),
              widgetTypeLayoutOverrides,
              widgetLayoutOverrides,
              rootSwitchWidgetIds,
              rootClimateWidgetIds,
              rootCameraWidgetIds,
              rootMediaWidgetIds,
              rootSensorWidgetIds,
              rootMembersWidgetIds,
              rootAlarmWidgetIds,
              rootVacuumWidgetIds,
              rootLockWidgetIds,
              rootCoverWidgetIds,
            ),
            currentCols,
          );
        }
      }

      setGridEngineLayouts((current) => (sameGridLayouts(current, next) ? current : next));
      return next;
    },
    [
      derivedGridEngineLayouts,
      gridEngineActiveBreakpoint,
      gridEngineLayouts,
      normalizeRootLayoutForBreakpoint,
      rootScenesSectionIds,
      rootAlarmWidgetIds,
      rootCameraWidgetIds,
      rootClimateWidgetIds,
      rootCoverWidgetIds,
      rootLockWidgetIds,
      rootLightWidgetStateById,
      rootMediaWidgetIds,
      rootMembersWidgetIds,
      rootSensorWidgetIds,
      rootSwitchWidgetIds,
      rootVacuumWidgetIds,
      widgetTypeLayoutOverrides,
      widgetLayoutOverrides,
    ],
  );
  const handleGridStackGeometryChange = useCallback(
    (sectionId: string, geometry: { usedCols: number; usedRows: number }) => {
      if (sectionKindById.get(sectionId) !== 'stack-grid') {
        return;
      }
      const section = sectionById.get(sectionId);
      const sectionTitle =
        section?.kind === 'stack-grid' && (section.stackUseFavoritesGrid ?? false)
          ? FAVORITES_GRID_TITLE
          : section?.title;
      const headerVisible =
        Boolean(section) &&
        section.stackShowHeader !== false &&
        typeof sectionTitle === 'string' &&
        sectionTitle.trim().length > 0;
      // Stack header is rendered outside StackGrid (in GridCanvas), so
      // add one root row unit when visible to prevent bottom clipping.
      const activeLayout = liveGridEngineLayouts[gridEngineActiveBreakpoint] ?? [];
      const derivedActiveLayout = derivedGridEngineLayouts[gridEngineActiveBreakpoint] ?? [];
      const layoutSource = activeLayout.length > 0 ? activeLayout : derivedActiveLayout;
      const currentItem = layoutSource.find((item) => item.i === sectionId);
      if (!currentItem) {
        return;
      }
      const runtimeStackWidthKey = `${gridEngineActiveBreakpoint}:${sectionId}`;
      const hasResolvedRuntimeWidth = resolvedRuntimeStackWidthsRef.current.has(runtimeStackWidthKey);
      const canAutoFitWidth =
        section?.stackColumnsMode !== 'manual' &&
        (isEditMode || !hasResolvedRuntimeWidth);
      const nextSpan = resolveGridStackContainerSpan({
        geometry,
        availableCols: gridEngineActiveCols,
        currentCols: currentItem.w,
        // Runtime state changes (for example a Light auto-expanding when it is
        // switched on) may change the rows used by a stack, but must never
        // recalculate its saved width. Otherwise neighbouring sections appear
        // to shrink or grow whenever an entity changes state.
        widthMode: canAutoFitWidth ? 'auto' : 'manual',
        headerVisible,
      });
      if (!isEditMode && !hasResolvedRuntimeWidth) {
        const currentTimer = runtimeStackWidthSettleTimersRef.current.get(runtimeStackWidthKey);
        if (currentTimer !== undefined) {
          window.clearTimeout(currentTimer);
        }
        runtimeStackWidthSettleTimersRef.current.set(
          runtimeStackWidthKey,
          window.setTimeout(() => {
            resolvedRuntimeStackWidthsRef.current.add(runtimeStackWidthKey);
            runtimeStackWidthSettleTimersRef.current.delete(runtimeStackWidthKey);
          }, 250),
        );
      }
      const safeRows = nextSpan.h;
      const safeCols = nextSpan.w;
      const currentRows = Math.max(1, Math.round(currentItem.h));
      const currentCols = Math.max(1, Math.round(currentItem.w));
      if (currentRows === safeRows && currentCols === safeCols) {
        return;
      }

      const nextActiveLayout = layoutSource.map((item) =>
        item.i === sectionId
          ? {
              ...item,
              x: Math.min(Math.max(0, Math.round(item.x)), Math.max(0, gridEngineActiveCols - safeCols)),
              w: safeCols,
              h: safeRows,
            }
          : item,
      );
      const committed = updateGridEngineLayouts({
        ...liveGridEngineLayouts,
        [gridEngineActiveBreakpoint]: nextActiveLayout,
      } as ResponsiveLayouts<GridBreakpoint>);
      // Geometry produced by live entity state is presentation state. Persist
      // it only while editing the dashboard; normal controls must not mutate
      // the configured layout.
      if (isEditMode) {
        commitGridEngineLayouts(committed, nextActiveLayout);
      }
    },
    [
      sectionById,
      sectionKindById,
      derivedGridEngineLayouts,
      liveGridEngineLayouts,
      gridEngineActiveBreakpoint,
      gridEngineActiveCols,
      isEditMode,
      updateGridEngineLayouts,
      commitGridEngineLayouts,
    ],
  );
  const focusCanvasOverlayItem = useCallback(
    (itemId: string) => {
      if (isCompactEditCardMenuMode) {
        return;
      }
      if (sectionIdSet.has(itemId)) {
        onSelectSection(itemId);
        onSelectWidget(null);
        return;
      }
      if (rootWidgetIdSet.has(itemId)) {
        onSelectWidget(itemId);
        onSelectSection(null);
      }
    },
    [isCompactEditCardMenuMode, onSelectSection, onSelectWidget, rootWidgetIdSet, sectionIdSet],
  );
  const handleCanvasItemKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>, itemId: string, itemLabel: string) => {
      if (!isEditMode || event.currentTarget !== event.target) {
        return;
      }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        return;
      }

      const source = liveGridEngineLayouts[gridEngineActiveBreakpoint] ?? [];
      const current = source.find((item) => item.i === itemId);
      if (!current) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      focusCanvasOverlayItem(itemId);

      const nextItem = { ...current };
      const isResize = event.shiftKey;
      if (isResize) {
        if (event.key === 'ArrowLeft') nextItem.w = Math.max(1, nextItem.w - 1);
        if (event.key === 'ArrowRight') {
          nextItem.w = Math.min(gridEngineActiveCols - nextItem.x, nextItem.w + 1);
        }
        if (event.key === 'ArrowUp') nextItem.h = Math.max(1, nextItem.h - 1);
        if (event.key === 'ArrowDown') nextItem.h += 1;
      } else {
        if (event.key === 'ArrowLeft') nextItem.x = Math.max(0, nextItem.x - 1);
        if (event.key === 'ArrowRight') {
          nextItem.x = Math.min(gridEngineActiveCols - nextItem.w, nextItem.x + 1);
        }
        if (event.key === 'ArrowUp') nextItem.y = Math.max(0, nextItem.y - 1);
        if (event.key === 'ArrowDown') nextItem.y += 1;
      }

      if (hasGridItemMoved(current, nextItem)) {
        const nextActiveLayout = source.map((item) => (item.i === itemId ? nextItem : item));
        const committed = updateGridEngineLayouts({
          ...liveGridEngineLayouts,
          [gridEngineActiveBreakpoint]: nextActiveLayout,
        } as ResponsiveLayouts<GridBreakpoint>);
        const committedActiveLayout = committed[gridEngineActiveBreakpoint] ?? nextActiveLayout;
        commitGridEngineLayouts(committed, committedActiveLayout);
        const resolved = committedActiveLayout.find((item) => item.i === itemId) ?? nextItem;
        setKeyboardLayoutAnnouncement(
          isResize
            ? `${itemLabel}: dimensione ${resolved.w} colonne per ${resolved.h} righe.`
            : `${itemLabel}: posizione colonna ${resolved.x + 1}, riga ${resolved.y + 1}.`,
        );
        return;
      }

      setKeyboardLayoutAnnouncement(`${itemLabel}: limite della griglia raggiunto.`);
    },
    [
      commitGridEngineLayouts,
      focusCanvasOverlayItem,
      gridEngineActiveBreakpoint,
      gridEngineActiveCols,
      hasGridItemMoved,
      isEditMode,
      liveGridEngineLayouts,
      updateGridEngineLayouts,
    ],
  );
  const handleStackCompactDragStart = useCallback(
    (event: Event | null | undefined) => {
      if (!isCompactEditCardMenuMode) {
        return;
      }
      setIsCanvasTouchLocked(true);
      updateCanvasAutoScroll(getDragEventClientY(event));
    },
    [isCompactEditCardMenuMode, updateCanvasAutoScroll],
  );
  const handleStackCompactDragMove = useCallback(
    (event: Event | null | undefined) => {
      if (!isCompactEditCardMenuMode) {
        return;
      }
      updateCanvasAutoScroll(getDragEventClientY(event));
    },
    [isCompactEditCardMenuMode, updateCanvasAutoScroll],
  );
  const handleStackCompactDragStop = useCallback(() => {
    setIsCanvasTouchLocked(false);
    stopCanvasAutoScroll();
  }, [stopCanvasAutoScroll]);
  const renderSectionCard = useCallback(
    (
      section: DashboardSection,
      sectionSpanW: number,
      sectionSpanH: number,
      sectionCanvasCols: number,
      stackWidth: number,
      stackRowHeight: number,
      stackMargin: number,
      stackMounted: boolean,
    ) => {
      const isTransparentSection = section.kind === 'greeting' || section.kind === 'weather';
      const isStack = isStackSection(section);
      const isGreetingSection = section.kind === 'greeting';
      const isWeatherSection = section.kind === 'weather';
      const isScenesSection = section.kind === 'scenes';
      const sectionTitle =
        section.kind === 'stack-grid' && (section.stackUseFavoritesGrid ?? false)
          ? FAVORITES_GRID_TITLE
          : section.title;
      const showBackground =
        section.kind === 'scenes'
          ? section.scenesShowBackground ?? true
          : isStack
            ? section.stackShowBackground ?? true
            : !isTransparentSection;
      const showBorder =
        section.kind === 'scenes'
          ? section.scenesShowBorder ?? true
          : isStack
            ? section.stackShowBorder ?? true
            : !isTransparentSection;
      const backgroundClass = showBackground
        ? isStack
          ? 'bg-white/[0.04] shadow-lg backdrop-blur-xl'
          : 'bg-white/5'
        : 'bg-transparent';
      const borderClass = isStack
        ? showBorder
          ? 'ring-1 ring-inset ring-white/[0.06]'
          : ''
        : showBorder
          ? 'border border-white/10'
          : 'border border-transparent';
      const isWeatherClickable = !isEditMode && section.kind === 'weather';
      const isCompactWeatherSection = isWeatherSection && sectionSpanH <= ROOT_CANVAS_ROW_UNITS;
      const stackHeaderVisible =
        isStack &&
        section.stackShowHeader !== false &&
        typeof sectionTitle === 'string' &&
        sectionTitle.trim().length > 0;
      const showCompactSectionMenu = isCompactEditCardMenuMode && (isScenesSection || isStack);
      const compactSectionMenuLabel = sectionTitle || sectionLabel(section.kind) || t('home.catalog.fallbackSection');
      const hideEditModeBadges =
        section.kind === 'greeting' || section.kind === 'weather' || section.kind === 'scenes' || isStack;
      const sectionPaddingClass = isStack
        ? 'p-0'
        : isGreetingSection
          ? 'px-0 pt-0 pb-1 md:py-2.5'
        : isCompactWeatherSection
          ? isTabletCanvas
            ? 'px-3 py-2 sm:px-4 sm:py-2.5'
            : 'px-4 py-2 sm:px-5 sm:py-2.5'
          : isScenesSection
            ? 'p-0'
            : isTabletCanvas
              ? 'p-3'
              : 'p-4';
      const sectionOverflowClass = isStack ? 'overflow-visible' : 'overflow-hidden';
      const sectionRadiusClass = isGreetingSection ? 'rounded-none' : 'rounded-[2rem]';
      const stackWidgets = widgets.filter((widget) => widget.parentSectionId === section.id);
      const sectionCompactPreview =
        sectionSpanH <= ROOT_CANVAS_ROW_UNITS ||
        isTabletCanvas ||
        sectionSpanW <= 3 ||
        (isScenesSection && (sectionSpanH <= 3 || sectionSpanW <= 4));

      return (
        <div
          className={`relative h-full w-full min-h-0 min-w-0 ${sectionRadiusClass} ${sectionPaddingClass} ${sectionOverflowClass} transition-colors ${backgroundClass} ${borderClass} ${
            isEditMode && selectedSectionId === section.id ? 'selection-corners' : ''
          } ${isWeatherClickable ? 'cursor-pointer hover:opacity-90' : ''}`}
          onPointerDown={(event) => {
            if (!isEditMode) {
              return;
            }
            if (showCompactSectionMenu) {
              return;
            }
            const targetNode = event.target as Element | null;
            if (targetNode?.closest('.builder-grid,.widget-action')) {
              return;
            }
            if (event.pointerType === 'mouse' && event.button !== 0) {
              return;
            }
            onSelectSection(section.id);
          }}
          onClick={(event) => {
            if (isEditMode) {
              if (showCompactSectionMenu) {
                return;
              }
              if (!isStack) {
                event.stopPropagation();
                onSelectSection(section.id);
              }
              return;
            }
            if (section.kind === 'weather') {
              event.stopPropagation();
              onWeatherClick();
            }
          }}
        >
          {isEditMode && !hideEditModeBadges ? (
            <div className={`flex items-center justify-between ${isGreetingSection ? 'mb-1.5' : 'mb-3'}`}>
              <button
                type="button"
                className="section-action inline-flex items-center rounded-full border border-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-white/55 hover:bg-white/10"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  onSelectSection(section.id);
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectSection(section.id);
                }}
              >
                {sectionLabel(section.kind)}
              </button>
            </div>
          ) : null}
          {!isStack ? (
            <SectionCardRenderer
              section={section}
              state={state}
              compact={sectionCompactPreview}
              isEditMode={isScenesSection && isEditMode}
              onWeatherClick={onWeatherClick}
              runningSceneId={runningSceneBySectionId[section.id]?.sceneId ?? null}
              runningSceneStartedAt={runningSceneBySectionId[section.id]?.startedAt ?? null}
              onAddScene={(sceneId: SceneKey) => {
                if (section.kind !== 'scenes') {
                  return;
                }
                onUpdateSection(section.id, (current) => {
                  const currentScenes =
                    current.scenes ?? SCENES_CATALOG.slice(0, 4).map((sceneEntry) => sceneEntry.id);
                  if (currentScenes.includes(sceneId)) {
                    return current;
                  }
                  return {
                    ...current,
                    scenes: [...currentScenes, sceneId],
                  };
                });
              }}
              onSceneTrigger={(sceneId) => {
                if (section.kind !== 'scenes') {
                  return;
                }
                void onSceneTrigger(section, sceneId);
              }}
            />
          ) : (
            <div className="flex h-full w-full min-h-0 min-w-0 flex-col">
              {stackHeaderVisible ? (
                <div className="flex h-16 shrink-0 items-center justify-between px-3 sm:px-4">
                  <p className="min-w-0 truncate text-base font-semibold tracking-tight text-white/70">
                    {sectionTitle}
                  </p>
                  <div className="flex shrink-0 items-center gap-2">
                    {isEditMode && selectedSectionId === section.id && !showCompactSectionMenu ? (
                      <span className="text-[10px] uppercase tracking-[0.2em] text-blue-200/80 border border-blue-300/30 bg-blue-500/15 px-2 py-1 rounded-full">
                        {t('home.catalog.activeStack')}
                      </span>
                    ) : null}
                    {showCompactSectionMenu ? (
                      <button
                        type="button"
                        className="widget-action inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/35 text-white/85 shadow-[0_10px_24px_rgba(0,0,0,0.28)] backdrop-blur-xl transition hover:bg-white/15 hover:text-white active:scale-95"
                        onPointerDown={(event) => {
                          event.stopPropagation();
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelectSection(section.id);
                          onSelectWidget(null);
                        }}
                        aria-label={t('builder.configureNamed', { name: compactSectionMenuLabel })}
                        title={t('builder.configureSection')}
                      >
                        <MoreHorizontal size={18} aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <StackGrid
                key={`${section.id}:${layoutRevision}`}
                isEditMode={isEditMode}
                isXsViewport={isXsViewport}
                sectionsMounted={stackMounted}
                state={state}
                houseMembers={houseMembers}
                section={section}
                gridBreakpoint={gridEngineActiveBreakpoint}
                widgetTypeLayoutOverrides={widgetTypeLayoutOverrides}
                widgetLayoutOverrides={widgetLayoutOverrides}
                responsiveLayouts={responsiveLayouts.stacks?.[section.id]}
                sectionCanvasCols={sectionCanvasCols}
                availableCanvasCols={gridEngineActiveCols}
                stackWidgets={stackWidgets}
                isSelected={isEditMode && selectedSectionId === section.id}
                stackWidth={Math.max(stackWidth, 1)}
                availableStackWidth={Math.max(
                  1,
                  Math.round(
                    gridEngineColumnWidth * gridEngineActiveCols +
                      GRID_ENGINE_GAP_PX * Math.max(0, gridEngineActiveCols - 1),
                  ),
                )}
                rootRowHeight={stackRowHeight}
                rootMargin={stackMargin}
                selectedWidgetId={selectedWidgetId}
                onWidgetDisplayMetricsChange={onWidgetDisplayMetricsChange}
                onSelectWidget={onSelectWidget}
                onSelectSection={onSelectSection}
                onWidgetClick={onWidgetClick}
                onWidgetLightToggle={onWidgetLightToggle}
                onWidgetSwitchToggle={onWidgetSwitchToggle}
                onWidgetBrightnessChange={onWidgetBrightnessChange}
                onWidgetLightColorChange={onWidgetLightColorChange}
                onWidgetClimateTargetTempChange={onWidgetClimateTargetTempChange}
                onWidgetClimateTargetRangeChange={onWidgetClimateTargetRangeChange}
                onWidgetClimateTargetHumidityChange={onWidgetClimateTargetHumidityChange}
                onWidgetClimatePowerToggle={onWidgetClimatePowerToggle}
                onWidgetClimateModeChange={onWidgetClimateModeChange}
                onWidgetClimateFanModeChange={onWidgetClimateFanModeChange}
                onWidgetClimatePresetModeChange={onWidgetClimatePresetModeChange}
                onWidgetClimateSwingModeChange={onWidgetClimateSwingModeChange}
                onWidgetClimateSwingHorizontalModeChange={onWidgetClimateSwingHorizontalModeChange}
                onWidgetMediaToggle={onWidgetMediaToggle}
                onWidgetMediaPrevious={onWidgetMediaPrevious}
                onWidgetMediaNext={onWidgetMediaNext}
                onWidgetMediaSeek={onWidgetMediaSeek}
                onWidgetMediaShuffle={onWidgetMediaShuffle}
                onWidgetMediaRepeat={onWidgetMediaRepeat}
                onWidgetMediaSelectSource={onWidgetMediaSelectSource}
                onWidgetAlarmDisarm={onWidgetAlarmDisarm}
                onWidgetAlarmArm={onWidgetAlarmArm}
                onWidgetVacuumStartPause={onWidgetVacuumStartPause}
                onWidgetVacuumStop={onWidgetVacuumStop}
                onWidgetVacuumReturnToBase={onWidgetVacuumReturnToBase}
                onWidgetLockToggle={onWidgetLockToggle}
                onWidgetLockOpen={onWidgetLockOpen}
                onWidgetCoverPositionChange={onWidgetCoverPositionChange}
                onWidgetCoverTiltPositionChange={onWidgetCoverTiltPositionChange}
                onWidgetCoverOpen={onWidgetCoverOpen}
                onWidgetCoverStop={onWidgetCoverStop}
                onWidgetCoverClose={onWidgetCoverClose}
                onOpenMembersPanel={onOpenMembersPanel}
                onWidgetLayoutChange={onWidgetLayoutChange}
                onStackBreakpointLayoutChange={onStackBreakpointLayoutChange}
                haConnected={haConnected}
                haStates={haStates}
                sensorHistoryByEntity={sensorHistoryByEntity}
                onGridStackGeometryChange={handleGridStackGeometryChange}
                onCompactDragStart={handleStackCompactDragStart}
                onCompactDragMove={handleStackCompactDragMove}
                onCompactDragStop={handleStackCompactDragStop}
              />
            </div>
          )}
          {showCompactSectionMenu && (!isStack || !stackHeaderVisible) ? (
            <button
              type="button"
              className="widget-action absolute right-2 top-2 z-40 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/35 text-white/85 shadow-[0_10px_24px_rgba(0,0,0,0.28)] backdrop-blur-xl transition hover:bg-white/15 hover:text-white active:scale-95"
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
                onSelectSection(section.id);
                onSelectWidget(null);
              }}
              aria-label={t('builder.configureNamed', { name: compactSectionMenuLabel })}
              title={t('builder.configureSection')}
            >
              <MoreHorizontal size={18} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      );
    },
    [
      haConnected,
      haStates,
      sensorHistoryByEntity,
      gridEngineActiveCols,
      gridEngineActiveBreakpoint,
      gridEngineColumnWidth,
      houseMembers,
      isCompactEditCardMenuMode,
      isEditMode,
      isStackSection,
      isTabletCanvas,
      onSelectSection,
      onSceneTrigger,
      onUpdateSection,
      onWeatherClick,
      onWidgetAlarmArm,
      onWidgetAlarmDisarm,
      onWidgetBrightnessChange,
      onWidgetLightColorChange,
      onWidgetClick,
      onWidgetLightToggle,
      onWidgetSwitchToggle,
      onWidgetClimateFanModeChange,
      onWidgetClimateModeChange,
      onWidgetClimatePresetModeChange,
      onWidgetClimatePowerToggle,
      onWidgetClimateSwingHorizontalModeChange,
      onWidgetClimateSwingModeChange,
      onWidgetClimateTargetHumidityChange,
      onWidgetClimateTargetRangeChange,
      onWidgetClimateTargetTempChange,
      onWidgetCoverPositionChange,
      onWidgetCoverTiltPositionChange,
      onWidgetLayoutChange,
      onStackBreakpointLayoutChange,
      onWidgetLockOpen,
      onWidgetLockToggle,
      onOpenMembersPanel,
      onWidgetMediaPrevious,
      onWidgetMediaNext,
      onWidgetMediaRepeat,
      onWidgetMediaSeek,
      onWidgetMediaShuffle,
      onWidgetMediaSelectSource,
      onWidgetMediaToggle,
      onWidgetVacuumReturnToBase,
      onWidgetVacuumStop,
      onWidgetVacuumStartPause,
      handleGridStackGeometryChange,
      onSelectWidget,
      isXsViewport,
      runningSceneBySectionId,
      selectedSectionId,
      selectedWidgetId,
      state,
      responsiveLayouts.stacks,
      widgetLayoutOverrides,
      widgetTypeLayoutOverrides,
      handleStackCompactDragMove,
      handleStackCompactDragStart,
      handleStackCompactDragStop,
      widgets,
    ],
  );

  return (
    <div className="relative flex-1 min-w-0 h-full min-h-0">
      <div
        ref={canvasScrollRef}
        className={`h-full pb-[calc(env(safe-area-inset-bottom)+8.25rem)] sm:pb-10 [scroll-padding-bottom:calc(env(safe-area-inset-bottom)+8.25rem)] sm:[scroll-padding-bottom:2.5rem] glass-scrollbar ${
          isCompactEditCardMenuMode && isCanvasTouchLocked ? 'overflow-hidden [touch-action:none]' : 'overflow-y-scroll'
        }`}
      >
        <div
          ref={runtimeGridHostRef}
          data-preview-width={previewGridWidth ?? 'auto'}
          className={`relative behance-canvas-shell rounded-[2rem] pt-0.5 pb-4 md:pt-2 min-h-[48rem] ${
            isEditMode ? 'bg-white/5 border border-white/10' : 'bg-transparent border border-transparent'
          }`}
          style={
            previewGridWidth
              ? {
                  // The preset targets the RGL content box. Add the shell
                  // padding while still clipping to the real available width.
                  // Include the edit border as well, otherwise a preset that
                  // lands exactly on MD/XL measures two pixels below the
                  // breakpoint because the project uses border-box sizing.
                  width: `min(100%, calc(${previewGridWidth}px + 2 * clamp(0.55rem, 1.9vw, 2rem) + 2px))`,
                }
              : undefined
          }
        >
          {isEditMode ? (
            <>
              <p id="dashboard-grid-keyboard-help" className="sr-only">
                {t('home.catalog.keyboardHelp')}
              </p>
              <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                {keyboardLayoutAnnouncement}
              </p>
            </>
          ) : null}
          {topRightOverlay ? (
            <div className="absolute right-2 top-2 z-40 sm:right-3 sm:top-3">
              {topRightOverlay}
            </div>
          ) : null}
          {isEditMode ? (
            <div className="pointer-events-none absolute inset-0 rounded-[2rem] dashboard-edit-overlay" />
          ) : null}
          {developerMode ? (
            <div className="liquid-glass-card pointer-events-none absolute left-4 top-4 z-30 rounded-xl px-3 py-2 text-[10px] font-medium uppercase tracking-[0.18em] text-cyan-100">
              {`dev ${gridEngineActiveBreakpoint} | cols ${gridEngineActiveCols} | rows ${Math.max(1, liveGridUsedRows)}`}
            </div>
          ) : null}

          <div className={`transition-opacity duration-300 ${isRuntimeGridReady ? 'opacity-100' : 'opacity-0'}`}>
            {isRuntimeGridReady ? (
            <ResponsiveGridLayout
              key={`dashboard-grid:${layoutRevision}`}
              className={`sections-grid behance-grid relative ${isEditMode ? 'is-editing' : ''} ${
                isCompactEditCardMenuMode ? 'is-compact-editing' : ''
              }`}
              width={Math.max(runtimeGridEffectiveWidth, 1)}
              breakpoint={gridEngineActiveBreakpoint}
              breakpoints={GRID_ENGINE_BREAKPOINTS}
              cols={GRID_ENGINE_COLS}
              layouts={liveGridEngineLayouts as ResponsiveLayouts<GridBreakpoint>}
              rowHeight={GRID_ENGINE_ROW_UNIT}
              margin={[GRID_ENGINE_GAP_PX, GRID_ENGINE_GAP_PX]}
              containerPadding={GRID_ENGINE_CONTAINER_PADDING}
              useCSSTransforms
              compactType="vertical"
              preventCollision={false}
              isDraggable={isEditMode}
              isResizable={false}
              resizeHandles={[]}
              draggableHandle={isCompactEditCardMenuMode ? '.compact-edit-drag-handle' : undefined}
              draggableCancel=".builder-grid,.widget-action,.section-action,.react-resizable-handle"
              // Breakpoint selection is derived from the observed canvas
              // width above. RGL receives that same width, so it will select
              // the matching layout without maintaining a second authority.
              onDragStart={(_, __, newItem, ___, event) => {
                if (!isEditMode) {
                  return;
                }
                isCanvasInteractingRef.current = true;
                if (isCompactEditCardMenuMode) {
                  clearCompactDragHoldTimer();
                  compactDragHoldStartRef.current = null;
                  if (newItem?.i) {
                    setCompactDragArmedItemId(newItem.i);
                  }
                  setIsCanvasTouchLocked(true);
                  updateCanvasAutoScroll(getDragEventClientY(event));
                }
                canvasDragStartItemRef.current = newItem ? ({ ...(newItem as GridItem) }) : null;
                hasCanvasDragMovedRef.current = false;
                if (newItem?.i) {
                  focusCanvasOverlayItem(newItem.i);
                }
              }}
              onDrag={(_, __, newItem, ___, event) => {
                if (!isEditMode) {
                  return;
                }
                updateCanvasAutoScroll(getDragEventClientY(event));
                if (hasGridItemMoved(canvasDragStartItemRef.current, newItem as GridItem | undefined)) {
                  hasCanvasDragMovedRef.current = true;
                }
              }}
              onDragStop={(layout, _oldItem, newItem) => {
                if (!isEditMode) {
                  return;
                }
                const hasMoved =
                  hasCanvasDragMovedRef.current ||
                  hasGridItemMoved(canvasDragStartItemRef.current, newItem as GridItem | undefined);
                isCanvasInteractingRef.current = false;
                setIsCanvasTouchLocked(false);
                stopCanvasAutoScroll();
                resetCompactDragHold();
                canvasDragStartItemRef.current = null;
                hasCanvasDragMovedRef.current = false;
                if (!hasMoved) {
                  return;
                }
                const committed = updateGridEngineLayouts({
                  ...liveGridEngineLayouts,
                  [gridEngineActiveBreakpoint]: layout as GridItem[],
                });
                commitGridEngineLayouts(committed, layout as GridItem[]);
              }}
              onLayoutChange={(layout, layouts) => {
                if (!isEditMode || !isCanvasInteractingRef.current || !hasCanvasDragMovedRef.current) {
                  return;
                }
                updateGridEngineLayouts(layouts as ResponsiveLayouts<GridBreakpoint>);
              }}
            >
              {sections.map((section) => {
                const sectionLayoutItem = liveGridEngineLayoutMap.get(section.id);
                const sectionSpanW = Math.max(1, Math.round(sectionLayoutItem?.w ?? section.layout.w));
                const sectionSpanH = Math.max(1, Math.round(sectionLayoutItem?.h ?? section.layout.h));
                const sectionCanvasCols = sectionSpanW;
                const stackWidth = Math.max(
                  1,
                  Math.round(
                    gridEngineColumnWidth * sectionSpanW + GRID_ENGINE_GAP_PX * Math.max(0, sectionSpanW - 1),
                  ),
                );
                return (
                  <div
                    key={section.id}
                    tabIndex={isEditMode ? 0 : undefined}
                    role={isEditMode ? 'group' : undefined}
                    aria-label={
                      isEditMode
                        ? `${t('home.catalog.fallbackSection')} ${section.title?.trim() || sectionLabel(section.kind)}`
                        : undefined
                    }
                    aria-describedby={isEditMode ? 'dashboard-grid-keyboard-help' : undefined}
                    className={`relative h-full w-full min-h-0 min-w-0 ${
                      isStackSection(section) ? 'overflow-visible' : 'overflow-hidden'
                    } ${
                      isCompactEditCardMenuMode ? 'compact-edit-hold-target' : ''
                    } ${compactDragArmedItemId === section.id ? 'compact-edit-drag-handle' : ''}`}
                    onTouchStart={(event) => handleCompactDragTouchStart(event, section.id)}
                    onTouchMove={handleCompactDragTouchMove}
                    onTouchEnd={handleCompactDragHoldEnd}
                    onTouchCancel={handleCompactDragHoldEnd}
                    onMouseDown={(event) => handleCompactDragMouseDown(event, section.id)}
                    onMouseMove={handleCompactDragMouseMove}
                    onMouseUp={handleCompactDragHoldEnd}
                    onMouseLeave={handleCompactDragHoldEnd}
                    onFocus={() => focusCanvasOverlayItem(section.id)}
                    onKeyDown={(event) =>
                      handleCanvasItemKeyDown(
                        event,
                        section.id,
                        section.title?.trim() || sectionLabel(section.kind),
                      )
                    }
                  >
                    {renderSectionCard(
                      section,
                      sectionSpanW,
                      sectionSpanH,
                      sectionCanvasCols,
                      stackWidth,
                      GRID_ENGINE_ROW_UNIT,
                      GRID_ENGINE_GAP_PX,
                      runtimeGridEffectiveWidth > 0,
                    )}
                  </div>
                );
              })}
              {rootWidgets.map((widget) => {
                const value =
                  widget.kind === 'sensor'
                    ? haConnected
                      ? haStates[widget.entityId]?.numericValue
                      : undefined
                    : widget.value ?? 0;
                const runtimeLayoutItem = liveGridEngineLayoutMap.get(widget.id);
                const runtimeWidget = runtimeLayoutItem
                  ? {
                      ...widget,
                      layout: {
                        ...widget.layout,
                        i: widget.id,
                        x: runtimeLayoutItem.x,
                        y: runtimeLayoutItem.y,
                        w: runtimeLayoutItem.w,
                        h: runtimeLayoutItem.h,
                      },
                    }
                  : widget;
                return (
                  <div
                    key={widget.id}
                    tabIndex={isEditMode ? 0 : undefined}
                    role={isEditMode ? 'group' : undefined}
                    aria-label={isEditMode ? t('home.catalog.editCardAria', { name: widget.title?.trim() || widget.id }) : undefined}
                    aria-describedby={isEditMode ? 'dashboard-grid-keyboard-help' : undefined}
                    className={`relative h-full w-full min-h-0 min-w-0 overflow-hidden ${
                      isCompactEditCardMenuMode ? 'compact-edit-hold-target' : ''
                    } ${compactDragArmedItemId === widget.id ? 'compact-edit-drag-handle' : ''}`}
                    style={
                      isXsLongPressMode
                        ? {
                            userSelect: 'none',
                            WebkitUserSelect: 'none',
                          }
                        : undefined
                    }
                    onTouchStart={(event) => handleCompactDragTouchStart(event, widget.id)}
                    onTouchMove={handleCompactDragTouchMove}
                    onTouchEnd={handleCompactDragHoldEnd}
                    onTouchCancel={handleCompactDragHoldEnd}
                    onMouseDown={(event) => handleCompactDragMouseDown(event, widget.id)}
                    onMouseMove={handleCompactDragMouseMove}
                    onMouseUp={handleCompactDragHoldEnd}
                    onMouseLeave={handleCompactDragHoldEnd}
                    onFocus={() => focusCanvasOverlayItem(widget.id)}
                    onKeyDown={(event) =>
                      handleCanvasItemKeyDown(event, widget.id, widget.title?.trim() || widget.id)
                    }
                    onClick={(event) => {
                      event.stopPropagation();
                      if (isEditMode && !isCompactEditCardMenuMode) {
                        onSelectWidget(widget.id);
                      }
                    }}
                    onPointerDown={(event) => {
                      if (!isEditMode) {
                        handleXsLongPressStart(event, widget);
                        return;
                      }
                      // In edit mode, let RGL own pointerdown for drag-start.
                      // Selection still happens via click (non-drag) or onDragStart.
                      if (isCompactEditCardMenuMode) {
                        return;
                      }
                    }}
                    onPointerMove={(event) => {
                      if (isEditMode) {
                        return;
                      }
                      handleXsLongPressMove(event);
                    }}
                    onPointerUp={(event) => {
                      if (isEditMode) {
                        return;
                      }
                      handleXsLongPressEnd(event);
                    }}
                    onPointerCancel={(event) => {
                      if (isEditMode) {
                        return;
                      }
                      handleXsLongPressEnd(event);
                    }}
                    onPointerLeave={() => {
                      if (isEditMode) {
                        return;
                      }
                      clearXsLongPressTimer();
                    }}
                  >
                    <WidgetCardRenderer
                      widget={runtimeWidget}
                      dashboardState={state}
                      isEditMode={isEditMode}
                      isInteractive={haConnected || runtimeWidget.dataSource === 'mock'}
                      isSelected={selectedWidgetId === widget.id}
                      gridBreakpoint={gridEngineActiveBreakpoint}
                      value={value}
                      onClick={() => {
                        if (isCompactEditCardMenuMode) {
                          return;
                        }
                        if (isXsLongPressMode) {
                          if (xsSuppressNextCardClickRef.current) {
                            xsSuppressNextCardClickRef.current = false;
                            xsLongPressTriggeredRef.current = false;
                            return;
                          }
                          if (widget.kind === 'light') {
                            onWidgetLightToggle(widget);
                          }
                          if (widget.kind === 'switch') {
                            onWidgetSwitchToggle(widget);
                          }
                          return;
                        }
                        onWidgetClick(widget);
                      }}
                      onLightBrightnessChange={onWidgetBrightnessChange}
                      onLightColorChange={onWidgetLightColorChange}
                      onSwitchToggle={onWidgetSwitchToggle}
                      onClimateTargetTempChange={onWidgetClimateTargetTempChange}
                      onClimateTargetRangeChange={onWidgetClimateTargetRangeChange}
                      onClimateTargetHumidityChange={onWidgetClimateTargetHumidityChange}
                      onClimatePowerToggle={onWidgetClimatePowerToggle}
                      onClimateModeChange={onWidgetClimateModeChange}
                      onClimateFanModeChange={onWidgetClimateFanModeChange}
                      onClimatePresetModeChange={onWidgetClimatePresetModeChange}
                      onClimateSwingModeChange={onWidgetClimateSwingModeChange}
                      onClimateSwingHorizontalModeChange={onWidgetClimateSwingHorizontalModeChange}
                      onMediaToggle={onWidgetMediaToggle}
                      onMediaPrevious={onWidgetMediaPrevious}
                      onMediaNext={onWidgetMediaNext}
                      onMediaSeek={onWidgetMediaSeek}
                      onMediaShuffle={onWidgetMediaShuffle}
                      onMediaRepeat={onWidgetMediaRepeat}
                      onMediaSelectSource={onWidgetMediaSelectSource}
                      onAlarmDisarm={onWidgetAlarmDisarm}
                      onAlarmArm={onWidgetAlarmArm}
                      onVacuumStartPause={onWidgetVacuumStartPause}
                      onVacuumStop={onWidgetVacuumStop}
                      onVacuumReturnToBase={onWidgetVacuumReturnToBase}
                      onLockToggle={onWidgetLockToggle}
                      onLockOpen={onWidgetLockOpen}
                      onCoverPositionChange={onWidgetCoverPositionChange}
                      onCoverTiltPositionChange={onWidgetCoverTiltPositionChange}
                      onCoverOpen={onWidgetCoverOpen}
                      onCoverStop={onWidgetCoverStop}
                      onCoverClose={onWidgetCoverClose}
                      onMembersOpenPanel={() => onOpenMembersPanel()}
                      liveEntity={haStates[widget.entityId]}
                      switchConsumptionEntity={
                        haConnected && widget.kind === 'switch' && widget.switchConsumptionEntityId
                          ? haStates[widget.switchConsumptionEntityId] ??
                            haStates[widget.switchConsumptionEntityId.toLowerCase()]
                          : undefined
                      }
                      sensorBatteryEntity={
                        haConnected && widget.sensorBatteryEntityId ? haStates[widget.sensorBatteryEntityId] : undefined
                      }
                      sensorHistory={sensorHistoryByEntity[widget.entityId]}
                      houseMembers={houseMembers}
                      onDisplayMetricsChange={
                        selectedWidgetId === widget.id ? onWidgetDisplayMetricsChange : undefined
                      }
                    />
                    {isCompactEditCardMenuMode ? (
                      <button
                        type="button"
                        className="widget-action absolute right-2 top-2 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/35 text-white/85 shadow-[0_10px_24px_rgba(0,0,0,0.28)] backdrop-blur-xl transition hover:bg-white/15 hover:text-white active:scale-95"
                        onPointerDown={(event) => {
                          event.stopPropagation();
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelectWidget(widget.id);
                          onSelectSection(null);
                        }}
                        aria-label={t('builder.configureNamed', { name: widget.title || widget.id })}
                        title={t('builder.configureCard')}
                      >
                        <MoreHorizontal size={18} aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </ResponsiveGridLayout>
            ) : null}
          </div>
        </div>
      </div>

      {isEditMode ? (
        <GlassModal
          isOpen={isCatalogOpen}
          onClose={onCloseCatalog}
          eyebrow={t('home.catalog.eyebrow')}
          title={t('home.catalog.title')}
          description={t('home.catalog.description')}
          variant="responsive"
          size="xl"
          zIndex={120}
          closeLabel={t('home.catalog.closeAria')}
          backdropClassName="!bg-[color:var(--ui-scrim)] !backdrop-blur-3xl"
          bodyClassName="space-y-5 pb-1"
          footerClassName="border-t border-[color:var(--ui-separator)]"
          footer={
            <>
              <div className="mr-auto hidden min-w-0 sm:block">
                <p className="truncate text-xs font-medium text-[color:var(--ui-text-secondary)]">
                  {selectedCatalogItemLabel ? t('home.catalog.selected', { item: selectedCatalogItemLabel }) : t('home.catalog.selectItem')}
                </p>
              </div>
              <button
                type="button"
                onClick={onCloseCatalog}
                data-tour-target="catalog-finish"
                className="liquid-glass-control h-11 rounded-2xl px-5 text-sm font-semibold text-[color:var(--ui-text-secondary)] transition hover:brightness-110 hover:text-[color:var(--ui-text-primary)]"
              >
                {t('home.catalog.done')}
              </button>
              <button
                type="button"
                onClick={confirmCatalogSelection}
                disabled={!canConfirmCatalogSelection}
                data-tour-target="catalog-confirm"
                className="liquid-glass-selection h-11 min-w-0 flex-1 rounded-2xl px-5 text-sm font-semibold shadow-[0_8px_24px_var(--ui-shadow-soft)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-35 sm:flex-none"
              >
                <span className="block max-w-[15rem] truncate">{catalogConfirmLabel}</span>
              </button>
            </>
          }
        >
          <section className="liquid-glass-card rounded-[1.5rem] p-4 sm:p-5" aria-labelledby="catalog-destination-title">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p id="catalog-destination-title" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--ui-text-tertiary)]">
                  {t('home.catalog.destination')}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-[color:var(--ui-text-secondary)]">
                  {catalogTab === 'cards'
                    ? t('home.catalog.destinationCardDescription')
                    : t('home.catalog.destinationSectionDescription')}
                </p>
              </div>
            </div>
            <GlassDropdown
              options={catalogDestinationOptions}
              selected={catalogTab === 'sections' ? catalogDestinationOptions[0] ?? null : selectedCatalogDestinationOption}
              onChange={(option) => {
                setCatalogDestination(option.id === 'canvas' ? { type: 'canvas' } : { type: 'stack', sectionId: option.id });
                setCatalogFeedback(null);
              }}
              ariaLabel={t('home.catalog.destinationAria')}
              disabled={catalogTab === 'sections'}
            />
          </section>

          <div className="space-y-3">
            <GlassSegmentSelect<CatalogTab>
              value={catalogTab}
              onChange={(nextTab) => {
                setCatalogTab(nextTab);
                setCatalogFeedback(null);
              }}
              options={[
                { value: 'cards', label: t('home.catalog.cards') },
                { value: 'sections', label: t('home.catalog.sections') },
              ]}
              ariaLabel={t('home.catalog.componentTypeAria')}
              className="w-full"
            />

            <GlassSearchFilterBar
              query={catalogQuery}
              onQueryChange={setCatalogQuery}
              filters={[]}
              resultCount={catalogTab === 'cards' ? filteredWidgetCatalog.length : filteredSectionCatalog.length}
              onReset={() => setCatalogQuery('')}
              placeholder={catalogTab === 'cards' ? t('home.catalog.searchCard') : t('home.catalog.searchSection')}
              resultLabel={(count) => t(count === 1 ? 'home.catalog.resultOne' : 'home.catalog.resultMany', { count })}
            />
          </div>

          <div className="space-y-5" aria-live="polite">
            {catalogTab === 'cards' ? (
              CATALOG_WIDGET_FAMILIES.map((family) => {
                const familyItems = filteredWidgetCatalog.filter((item) => WIDGET_CATALOG_META[item.kind].family === family);
                if (familyItems.length === 0) return null;
                return (
                  <section key={family} aria-labelledby={`catalog-family-${family}`}>
                    <h3 id={`catalog-family-${family}`} className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--ui-text-tertiary)]">
                      {t(CATALOG_FAMILY_KEYS[family])}
                    </h3>
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      {familyItems.map((item) => {
                        const meta = WIDGET_CATALOG_META[item.kind];
                        const Icon = meta.icon;
                        const isSelected = selectedCatalogWidgetKind === item.kind;
                        return (
                          <button
                            key={item.kind}
                            type="button"
                            data-tour-target={item.kind === 'light' ? 'catalog-light' : undefined}
                            aria-pressed={isSelected}
                            onClick={() => {
                              setSelectedCatalogWidgetKind(item.kind);
                              setCatalogFeedback(null);
                            }}
                            className={`btn-premium flex min-h-[4.5rem] min-w-0 items-center gap-3 rounded-2xl border p-3 text-left transition ${
                              isSelected
                                ? 'border-[color:rgb(var(--ui-accent-rgb)/0.42)] bg-[color:rgb(var(--ui-accent-rgb)/0.14)] shadow-[inset_0_1px_0_var(--ui-border),0_8px_22px_var(--ui-shadow-soft)]'
                                : 'liquid-glass-card hover:bg-[color:var(--ui-surface-glass-strong)]'
                            }`}
                          >
                            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${
                              isSelected ? 'border-[color:rgb(var(--ui-accent-rgb)/0.36)] bg-[color:rgb(var(--ui-accent-rgb)/0.12)] text-[color:var(--ui-accent)]' : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]'
                            }`}>
                              <Icon size={18} aria-hidden="true" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-[color:var(--ui-text-primary)]">{widgetLabel(item.kind)}</span>
                              <span className="mt-0.5 block truncate text-xs text-[color:var(--ui-text-secondary)]">{t(meta.descriptionKey)}</span>
                            </span>
                            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                              isSelected ? 'border-[color:rgb(var(--ui-accent-rgb)/0.36)] bg-[color:rgb(var(--ui-accent-rgb)/0.14)] text-[color:var(--ui-accent)]' : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-tertiary)]'
                            }`}>
                              {isSelected ? <Check size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })
            ) : (
              <section aria-labelledby="catalog-sections-title">
                <h3 id="catalog-sections-title" className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--ui-text-tertiary)]">
                  {t('home.catalog.structure')}
                </h3>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {filteredSectionCatalog.map((item) => {
                    const meta = SECTION_CATALOG_META[item.kind];
                    const Icon = meta.icon;
                    const isSelected = selectedCatalogSectionKind === item.kind;
                    return (
                      <button
                        key={item.kind}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => {
                          setSelectedCatalogSectionKind(item.kind);
                          setCatalogFeedback(null);
                        }}
                        className={`btn-premium flex min-h-[4.5rem] min-w-0 items-center gap-3 rounded-2xl border p-3 text-left transition ${
                          isSelected
                            ? 'border-[color:rgb(var(--ui-accent-rgb)/0.42)] bg-[color:rgb(var(--ui-accent-rgb)/0.14)] shadow-[inset_0_1px_0_var(--ui-border),0_8px_22px_var(--ui-shadow-soft)]'
                            : 'liquid-glass-card hover:bg-[color:var(--ui-surface-glass-strong)]'
                        }`}
                      >
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${
                          isSelected ? 'border-[color:rgb(var(--ui-accent-rgb)/0.36)] bg-[color:rgb(var(--ui-accent-rgb)/0.12)] text-[color:var(--ui-accent)]' : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]'
                        }`}>
                          <Icon size={18} aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-[color:var(--ui-text-primary)]">{sectionLabel(item.kind)}</span>
                          <span className="mt-0.5 block truncate text-xs text-[color:var(--ui-text-secondary)]">{t(meta.descriptionKey)}</span>
                        </span>
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                          isSelected ? 'border-[color:rgb(var(--ui-accent-rgb)/0.36)] bg-[color:rgb(var(--ui-accent-rgb)/0.14)] text-[color:var(--ui-accent)]' : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-tertiary)]'
                        }`}>
                          {isSelected ? <Check size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {(catalogTab === 'cards' ? filteredWidgetCatalog.length : filteredSectionCatalog.length) === 0 ? (
              <div className="liquid-glass-card rounded-2xl px-4 py-8 text-center">
                <p className="text-sm font-medium text-[color:var(--ui-text-primary)]">{t('home.catalog.noResults')}</p>
                <p className="mt-1 text-xs text-[color:var(--ui-text-secondary)]">{t('home.catalog.noResultsDescription')}</p>
              </div>
            ) : null}

            {catalogFeedback ? (
              <div role="status" className="flex items-center gap-2 rounded-2xl border border-[color:color-mix(in_srgb,var(--ui-success)_28%,transparent)] bg-[color:color-mix(in_srgb,var(--ui-success)_12%,transparent)] px-3.5 py-3 text-xs font-medium text-[color:var(--ui-success)]">
                <Check size={15} aria-hidden="true" />
                <span className="min-w-0 truncate">{catalogFeedback}</span>
              </div>
            ) : null}
          </div>
        </GlassModal>
      ) : null}

      <style
        dangerouslySetInnerHTML={{
          __html: `
            .dashboard-edit-overlay {
              background-image: radial-gradient(#93c5fd2c 1px, transparent 1px);
              background-size: 18px 18px;
            }

            .builder-grid .react-resizable-handle::after,
            .sections-grid .react-resizable-handle::after { display: none; }

            .builder-grid .react-resizable-handle,
            .sections-grid .react-resizable-handle {
              padding: 0 !important;
              background-origin: border-box !important;
              box-sizing: border-box !important;
            }

            .builder-grid .react-resizable-handle-se,
            .sections-grid .react-resizable-handle-se {
              right: 10px !important;
              bottom: 10px !important;
              width: 20px !important;
              height: 20px !important;
              border-radius: 999px;
              border: 1px solid rgba(147,197,253,0.45);
              background: radial-gradient(circle at 35% 30%, rgba(255,255,255,0.65), rgba(96,165,250,0.28) 48%, rgba(15,23,42,0.9));
              transform: none !important;
              opacity: 0;
              pointer-events: none;
              transition: opacity 180ms ease;
            }

            .builder-grid .react-resizable-handle-se {
              z-index: 80 !important;
            }

            .sections-grid .react-resizable-handle-se {
              z-index: 140 !important;
            }

            .builder-grid.is-editing .react-resizable-handle-se,
            .sections-grid.is-editing .react-resizable-handle-se {
              opacity: 1;
              pointer-events: auto;
            }

            .sections-grid .react-grid-item:not(.react-draggable-dragging):not(.react-resizable-resizing) {
              transition-property: transform, width, height;
              transition-duration: 260ms;
              transition-timing-function: cubic-bezier(0.22, 0.9, 0.25, 1);
            }

            @media (hover: none) and (pointer: coarse) {
              .sections-grid.is-compact-editing .react-grid-item,
              .sections-grid.is-compact-editing .react-grid-item > div {
                touch-action: pan-y;
              }

              .sections-grid.is-compact-editing .compact-edit-drag-handle {
                touch-action: none;
              }

              .sections-grid.is-compact-editing .react-resizable-handle {
                touch-action: none;
              }
            }

            .builder-grid.horizontal-stack {
              height: 100% !important;
            }

            .builder-grid.horizontal-stack .react-grid-item {
              height: 100% !important;
            }

            .sections-grid.grid-engine-overlay,
            .sections-grid.grid-engine-overlay .react-grid-item,
            .sections-grid.grid-engine-overlay .react-grid-item > div,
            .sections-grid.grid-engine-overlay .react-grid-item > button,
            .sections-grid.grid-engine-overlay .react-grid-item > div > button,
            .builder-grid,
            .builder-grid .react-grid-item,
            .builder-grid .react-grid-item > div,
            .builder-grid .react-grid-item > button,
            .builder-grid .react-grid-item > div > button {
              margin: 0 !important;
              padding: 0 !important;
              box-sizing: border-box;
            }

            .sections-grid.grid-engine-overlay .react-grid-item.grid-engine-overlay-item {
              pointer-events: auto !important;
            }

          `,
        }}
      />
    </div>
  );
}
