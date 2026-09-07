import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import GridLayout from 'react-grid-layout/legacy';
import { MoreHorizontal } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import { WidgetCardRenderer } from '../widgets/CardRenderer';
import type { WidgetDisplayMetrics } from '../widgets/widgetDisplayVariant';
import type { DashboardStateShape } from '../../hooks/useDashboardState';
import type { DashboardSection, GridItem, Widget } from '../../types/dashboardModels';
import type { MockEntityStateMap } from '../../types/ha';
import type {
  DashboardBreakpointLayouts,
  WidgetLayoutOverrides,
  WidgetTypeLayoutOverrides,
} from '../../types/widgetTypeLayout';
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
  VACUUM_WIDGET_SPAN_BY_BREAKPOINT,
  type GridEngineBreakpoint,
  resolveWidgetTypeLayoutSpan,
} from './dashboardBreakpointConfig';
import {
  compactLayoutUp,
  clampLayoutToColumns,
  normalizeRuntimeLayout,
  reflowLayoutsToColumns,
  scaleLayoutColumns,
} from './gridEngineGeometry';
import { solveGridStackLayout } from './gridStackLayoutSolver';

type HouseMemberCardItem = {
  id: string;
  name: string;
  avatarUrl?: string;
  roleLabel?: string;
  isCurrent?: boolean;
};

const STACK_WIDGET_MIN_WIDTH_PX: Record<Widget['kind'], number> = {
  light: 168,
  switch: 168,
  climate: 208,
  camera: 208,
  sensor: 156,
  media: 224,
  alarm: 200,
  vacuum: 208,
  lock: 168,
  cover: 168,
  members: 232,
};
const ADAPTIVE_SPAN_ENABLE_COL_WIDTH_PX = 78;
const ADAPTIVE_SPAN_DISABLE_COL_WIDTH_PX = 90;
const ENABLE_STACK_ADAPTIVE_MIN_WIDTH = false;
const XS_CONTEXT_OPEN_LONG_PRESS_MS = 420;
const XS_CONTEXT_OPEN_MOVE_TOLERANCE_PX = 14;
const COMPACT_STACK_DRAG_LONG_PRESS_MS = 650;
const COMPACT_STACK_DRAG_HOLD_MOVE_TOLERANCE_PX = 10;
const STACK_GRID_BREAKPOINT_ORDER: GridEngineBreakpoint[] = ['2xl', 'xl', 'lg', 'md', 'sm', 'xs'];

type CompactStackTouchSnapshot = {
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

type CompactStackDragHoldStart =
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
        touch: CompactStackTouchSnapshot;
      };
    };

function dispatchCompactStackDragStartEvent(hold: CompactStackDragHoldStart) {
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

function resolveMinSpanForWidth(minWidthPx: number, colWidthPx: number, cols: number, gapPx: number) {
  if (!Number.isFinite(minWidthPx) || minWidthPx <= 0) {
    return 1;
  }
  const safeCols = Math.max(1, Math.round(cols));
  const safeColWidth = Math.max(1, colWidthPx);
  for (let span = 1; span <= safeCols; span += 1) {
    const spanWidth = span * safeColWidth + Math.max(0, span - 1) * gapPx;
    if (spanWidth >= minWidthPx) {
      return span;
    }
  }
  return safeCols;
}

function adaptLayoutsToMinWidth(
  layouts: GridItem[],
  cols: number,
  colWidthPx: number,
  gapPx: number,
  minWidthById: Map<string, number>,
): GridItem[] {
  const safeCols = Math.max(1, Math.round(cols));
  return layouts.map((layout) => {
    const baseW = Math.max(1, Math.round(layout.w));
    const minWidthPx = minWidthById.get(layout.i) ?? 0;
    const minSpan = resolveMinSpanForWidth(minWidthPx, colWidthPx, safeCols, gapPx);
    const safeW = Math.min(safeCols, Math.max(baseW, minSpan));
    const center = Math.max(0, Math.round(layout.x)) + baseW / 2;
    let safeX = Math.round(center - safeW / 2);
    safeX = Math.min(Math.max(0, safeX), Math.max(0, safeCols - safeW));
    return {
      i: layout.i,
      x: safeX,
      y: Math.max(0, Math.round(layout.y)),
      w: safeW,
      h: Math.max(1, Math.round(layout.h)),
    };
  });
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

function compactAndResolveLayout(layouts: GridItem[], cols: number): GridItem[] {
  // Keep stack reflow column-preserving like canvas: vertical compact + collision push-down.
  return reflowLayoutsToColumns(compactLayoutUp(layouts, cols), cols);
}

function enforceClimateWidgetSpan(
  layouts: GridItem[],
  breakpoint: GridEngineBreakpoint,
  cols: number,
  climateWidgetIds: ReadonlySet<string>,
  widgetTypeLayoutOverrides: WidgetTypeLayoutOverrides,
): GridItem[] {
  if (climateWidgetIds.size === 0) {
    return normalizeRuntimeLayout(layouts);
  }
  const span = resolveWidgetTypeLayoutSpan('climate', breakpoint, widgetTypeLayoutOverrides);
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
  );
}

function enforceSwitchWidgetSpan(
  layouts: GridItem[],
  breakpoint: GridEngineBreakpoint,
  cols: number,
  switchWidgetIds: ReadonlySet<string>,
  widgetTypeLayoutOverrides: WidgetTypeLayoutOverrides,
): GridItem[] {
  if (switchWidgetIds.size === 0) {
    return normalizeRuntimeLayout(layouts);
  }
  const span = resolveWidgetTypeLayoutSpan('switch', breakpoint, widgetTypeLayoutOverrides);
  const safeCols = Math.max(1, Math.round(cols));
  const forcedW = Math.min(safeCols, Math.max(1, Math.round(span.w)));
  const forcedH = Math.max(1, Math.round(span.h));
  return normalizeRuntimeLayout(
    layouts.map((item) => {
      if (!switchWidgetIds.has(item.i)) {
        return item;
      }
      return {
        ...item,
        w: forcedW,
        h: forcedH,
      };
    }),
  );
}

function enforceCameraWidgetSpan(
  layouts: GridItem[],
  breakpoint: GridEngineBreakpoint,
  cols: number,
  cameraWidgetIds: ReadonlySet<string>,
  widgetTypeLayoutOverrides: WidgetTypeLayoutOverrides,
): GridItem[] {
  if (cameraWidgetIds.size === 0) {
    return normalizeRuntimeLayout(layouts);
  }
  const span = resolveWidgetTypeLayoutSpan('camera', breakpoint, widgetTypeLayoutOverrides);
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
  );
}

function enforceCoverWidgetSpan(
  layouts: GridItem[],
  breakpoint: GridEngineBreakpoint,
  cols: number,
  coverWidgetIds: ReadonlySet<string>,
  widgetTypeLayoutOverrides: WidgetTypeLayoutOverrides,
): GridItem[] {
  if (coverWidgetIds.size === 0) {
    return normalizeRuntimeLayout(layouts);
  }
  const span = resolveWidgetTypeLayoutSpan('cover', breakpoint, widgetTypeLayoutOverrides);
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
  );
}

function enforceMediaWidgetSpan(
  layouts: GridItem[],
  breakpoint: GridEngineBreakpoint,
  cols: number,
  mediaWidgetIds: ReadonlySet<string>,
  widgetTypeLayoutOverrides: WidgetTypeLayoutOverrides,
): GridItem[] {
  if (mediaWidgetIds.size === 0) {
    return normalizeRuntimeLayout(layouts);
  }
  const span = resolveWidgetTypeLayoutSpan('media', breakpoint, widgetTypeLayoutOverrides);
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
  );
}

function enforceVacuumWidgetSpan(
  layouts: GridItem[],
  breakpoint: GridEngineBreakpoint,
  cols: number,
  vacuumWidgetIds: ReadonlySet<string>,
  widgetTypeLayoutOverrides: WidgetTypeLayoutOverrides,
): GridItem[] {
  if (vacuumWidgetIds.size === 0) {
    return normalizeRuntimeLayout(layouts);
  }
  const span = resolveWidgetTypeLayoutSpan('vacuum', breakpoint, widgetTypeLayoutOverrides);
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
  );
}

function enforceLockWidgetSpan(
  layouts: GridItem[],
  breakpoint: GridEngineBreakpoint,
  cols: number,
  lockWidgetIds: ReadonlySet<string>,
  widgetTypeLayoutOverrides: WidgetTypeLayoutOverrides,
): GridItem[] {
  if (lockWidgetIds.size === 0) {
    return normalizeRuntimeLayout(layouts);
  }
  const span = resolveWidgetTypeLayoutSpan('lock', breakpoint, widgetTypeLayoutOverrides);
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
  );
}

function enforceSensorWidgetSpan(
  layouts: GridItem[],
  breakpoint: GridEngineBreakpoint,
  cols: number,
  sensorWidgetIds: ReadonlySet<string>,
  widgetTypeLayoutOverrides: WidgetTypeLayoutOverrides,
): GridItem[] {
  if (sensorWidgetIds.size === 0) {
    return normalizeRuntimeLayout(layouts);
  }
  const span = resolveWidgetTypeLayoutSpan('sensor', breakpoint, widgetTypeLayoutOverrides);
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
  );
}

function enforceMembersWidgetSpan(
  layouts: GridItem[],
  breakpoint: GridEngineBreakpoint,
  cols: number,
  membersWidgetIds: ReadonlySet<string>,
  widgetTypeLayoutOverrides: WidgetTypeLayoutOverrides,
): GridItem[] {
  if (membersWidgetIds.size === 0) {
    return normalizeRuntimeLayout(layouts);
  }
  const span = resolveWidgetTypeLayoutSpan('members', breakpoint, widgetTypeLayoutOverrides);
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
  );
}

function enforceAlarmWidgetSpan(
  layouts: GridItem[],
  breakpoint: GridEngineBreakpoint,
  cols: number,
  alarmWidgetIds: ReadonlySet<string>,
  widgetTypeLayoutOverrides: WidgetTypeLayoutOverrides,
): GridItem[] {
  if (alarmWidgetIds.size === 0) {
    return normalizeRuntimeLayout(layouts);
  }
  const span = resolveWidgetTypeLayoutSpan('alarm', breakpoint, widgetTypeLayoutOverrides);
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
  );
}

function enforceLightWidgetSpan(
  layouts: GridItem[],
  breakpoint: GridEngineBreakpoint,
  cols: number,
  lightWidgetStateById: ReadonlyMap<string, boolean>,
  useExplicitLightSpan: boolean,
  widgetTypeLayoutOverrides: WidgetTypeLayoutOverrides,
): GridItem[] {
  if (lightWidgetStateById.size === 0) {
    return normalizeRuntimeLayout(layouts);
  }
  const span = resolveWidgetTypeLayoutSpan('light', breakpoint, widgetTypeLayoutOverrides);
  const safeCols = Math.max(1, Math.round(cols));
  const forcedW = Math.min(safeCols, Math.max(1, Math.round(span.w)));
  return normalizeRuntimeLayout(
    layouts.map((item) => {
      const lightIsOn = lightWidgetStateById.get(item.i);
      if (lightIsOn === undefined) {
        return item;
      }
      const currentH = Math.max(1, Math.round(item.h));
      const configuredH = Math.max(1, Math.round(lightIsOn ? span.hOn : span.hOff));
      const autoExpand = span.autoExpand ?? true;
      return {
        ...item,
        w: forcedW,
        h: useExplicitLightSpan
          ? autoExpand && lightIsOn && configuredH <= 1
            ? Math.max(2, Math.round(span.hOn))
            : configuredH
          : autoExpand && lightIsOn
          ? currentH <= 1
            ? Math.max(2, Math.round(span.hOn))
            : currentH
          : autoExpand && currentH <= 2
            ? Math.max(1, Math.round(span.hOff))
            : currentH,
      };
    }),
  );
}

function enforceWidgetLayoutOverrides(
  layouts: GridItem[],
  breakpoint: GridEngineBreakpoint,
  cols: number,
  widgetLayoutOverrides: WidgetLayoutOverrides,
  lightWidgetStateById: ReadonlyMap<string, boolean>,
  coverWidgetIds: ReadonlySet<string> = new Set(),
): GridItem[] {
  if (!widgetLayoutOverrides || Object.keys(widgetLayoutOverrides).length === 0) {
    return normalizeRuntimeLayout(layouts);
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
  );
}

function enforceGridStackWidgetSpans(
  layouts: GridItem[],
  breakpoint: GridEngineBreakpoint,
  cols: number,
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
  const withLight = enforceLightWidgetSpan(
    layouts,
    breakpoint,
    cols,
    lightWidgetStateById,
    useExplicitLightSpan,
    widgetTypeLayoutOverrides,
  );
  const withSwitch = enforceSwitchWidgetSpan(
    withLight,
    breakpoint,
    cols,
    switchWidgetIds,
    widgetTypeLayoutOverrides,
  );
  const withClimate = enforceClimateWidgetSpan(
    withSwitch,
    breakpoint,
    cols,
    climateWidgetIds,
    widgetTypeLayoutOverrides,
  );
  const withCamera = enforceCameraWidgetSpan(
    withClimate,
    breakpoint,
    cols,
    cameraWidgetIds,
    widgetTypeLayoutOverrides,
  );
  const withMedia = enforceMediaWidgetSpan(
    withCamera,
    breakpoint,
    cols,
    mediaWidgetIds,
    widgetTypeLayoutOverrides,
  );
  const withSensor = enforceSensorWidgetSpan(
    withMedia,
    breakpoint,
    cols,
    sensorWidgetIds,
    widgetTypeLayoutOverrides,
  );
  const withMembers = enforceMembersWidgetSpan(
    withSensor,
    breakpoint,
    cols,
    membersWidgetIds,
    widgetTypeLayoutOverrides,
  );
  const withAlarm = enforceAlarmWidgetSpan(
    withMembers,
    breakpoint,
    cols,
    alarmWidgetIds,
    widgetTypeLayoutOverrides,
  );
  const withVacuum = enforceVacuumWidgetSpan(
    withAlarm,
    breakpoint,
    cols,
    vacuumWidgetIds,
    widgetTypeLayoutOverrides,
  );
  const withLock = enforceLockWidgetSpan(
    withVacuum,
    breakpoint,
    cols,
    lockWidgetIds,
    widgetTypeLayoutOverrides,
  );
  const withCover = enforceCoverWidgetSpan(
    withLock,
    breakpoint,
    cols,
    coverWidgetIds,
    widgetTypeLayoutOverrides,
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

type StackGridProps = {
  isEditMode: boolean;
  isXsViewport: boolean;
  sectionsMounted: boolean;
  state: DashboardStateShape;
  houseMembers?: HouseMemberCardItem[];
  section: DashboardSection;
  gridBreakpoint: GridEngineBreakpoint;
  widgetTypeLayoutOverrides: WidgetTypeLayoutOverrides;
  widgetLayoutOverrides: WidgetLayoutOverrides;
  responsiveLayouts?: DashboardBreakpointLayouts;
  sectionCanvasCols: number;
  availableCanvasCols: number;
  stackWidgets: Widget[];
  isSelected: boolean;
  stackWidth: number;
  availableStackWidth: number;
  rootRowHeight: number;
  rootMargin: number;
  selectedWidgetId: string | null;
  onSelectWidget: (id: string | null) => void;
  onSelectSection: (id: string | null) => void;
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
  onStackBreakpointLayoutChange: (sectionId: string, breakpoint: GridEngineBreakpoint, next: GridItem[]) => void;
  haConnected: boolean;
  haStates: MockEntityStateMap;
  sensorHistoryByEntity?: Record<string, number[]>;
  onGridStackGeometryChange?: (
    sectionId: string,
    geometry: { usedCols: number; usedRows: number },
  ) => void;
  onCompactDragStart?: (event: Event | null | undefined) => void;
  onCompactDragMove?: (event: Event | null | undefined) => void;
  onCompactDragStop?: () => void;
  onWidgetDisplayMetricsChange?: (metrics: WidgetDisplayMetrics) => void;
};

function StackGridComponent({
  isEditMode,
  isXsViewport,
  sectionsMounted,
  state,
  houseMembers = [],
  section,
  gridBreakpoint,
  widgetTypeLayoutOverrides,
  widgetLayoutOverrides,
  responsiveLayouts,
  sectionCanvasCols,
  availableCanvasCols,
  stackWidgets,
  isSelected,
  stackWidth,
  availableStackWidth,
  rootRowHeight,
  rootMargin,
  selectedWidgetId,
  onSelectWidget,
  onSelectSection,
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
  onStackBreakpointLayoutChange,
  haConnected,
  haStates,
  sensorHistoryByEntity = {},
  onGridStackGeometryChange,
  onCompactDragStart,
  onCompactDragMove,
  onCompactDragStop,
  onWidgetDisplayMetricsChange,
}: StackGridProps) {
  const { t } = useI18n();
  const isStackInteractingRef = useRef(false);
  const xsLongPressTimerRef = useRef<number | null>(null);
  const xsLongPressPointerIdRef = useRef<number | null>(null);
  const xsLongPressStartPointRef = useRef<{ x: number; y: number } | null>(null);
  const xsSuppressNextCardClickRef = useRef(false);
  const stackHostRef = useRef<HTMLDivElement | null>(null);
  const draggingStackItemRef = useRef<GridItem | null>(null);
  const stackDragStartItemRef = useRef<GridItem | null>(null);
  const hasStackDragMovedRef = useRef(false);
  const compactDragHoldTimerRef = useRef<number | null>(null);
  const compactDragHoldStartRef = useRef<CompactStackDragHoldStart | null>(null);
  const compactDragArmedElementRef = useRef<HTMLElement | null>(null);
  const [stackPreviewLayout, setStackPreviewLayout] = useState<GridItem[] | null>(null);
  const [measuredStackWidth, setMeasuredStackWidth] = useState(0);
  const [isAdaptiveSpanEnabled, setIsAdaptiveSpanEnabled] = useState(false);
  const [compactDragArmedItemId, setCompactDragArmedItemId] = useState<string | null>(null);
  const [keyboardLayoutAnnouncement, setKeyboardLayoutAnnouncement] = useState('');
  const stableWidthRef = useRef(0);
  const isHorizontalStack = section.kind === 'stack-horizontal';
  const isGridStack = section.kind === 'stack-grid';
  const gridStackWidthMode = section.stackColumnsMode === 'manual' ? 'manual' : 'auto';
  const isCompactEditCardMenuMode = isEditMode && (gridBreakpoint === 'xs' || gridBreakpoint === 'sm');
  const canvasLinkedCols = section.kind === 'stack-vertical' ? 1 : Math.max(1, Math.round(sectionCanvasCols));
  // Auto width is measured against the whole parent canvas. Measuring only
  // against the current outer span lets a stack shrink, but makes it
  // impossible for it to grow again when its content changes.
  const layoutCols = isGridStack && gridStackWidthMode === 'auto'
    ? Math.max(canvasLinkedCols, Math.round(availableCanvasCols))
    : canvasLinkedCols;
  const canonicalCols = isGridStack
    ? layoutCols
    : section.kind === 'stack-vertical'
      ? 1
      : Math.max(1, Math.round(section.layout.w));
  const overlayCompactType = 'vertical';
  const innerWidth = Math.max(measuredStackWidth || Math.round(stackWidth), 1);
  const measurementWidth = Math.max(
    gridStackWidthMode === 'auto'
      ? Math.round(availableStackWidth)
      : innerWidth,
    1,
  );
  const marginX = rootMargin;
  const marginY = rootMargin;
  const stackInsetX = 0;
  const horizontalContentCols = useMemo(
    () =>
      Math.max(
        1,
        stackWidgets.reduce((sum, widget) => sum + Math.max(1, Math.round(widget.layout.w)), 0),
      ),
    [stackWidgets],
  );
  const measurementCols = isHorizontalStack ? horizontalContentCols : Math.max(1, layoutCols);
  const horizontalCardWidth = Math.max(170, Math.min(320, Math.round(innerWidth / Math.max(1, Math.min(3, stackWidgets.length || 1)))));
  const gridWidth = isHorizontalStack
    ? Math.max(
        innerWidth,
        measurementCols * horizontalCardWidth + Math.max(0, measurementCols - 1) * marginX + stackInsetX * 2,
      )
    : innerWidth;
  const stackColWidth = Math.max(
    1,
    (Math.max(1, measurementWidth - stackInsetX * 2) - Math.max(0, measurementCols - 1) * marginX) / Math.max(1, measurementCols),
  );
  const rowHeight = Math.max(1, Math.round(rootRowHeight));
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
  }, [clearXsLongPressTimer]);
  const isXsLongPressMode = !isEditMode && isXsViewport;
  const clearCompactDragHoldTimer = useCallback(() => {
    if (compactDragHoldTimerRef.current !== null) {
      window.clearTimeout(compactDragHoldTimerRef.current);
      compactDragHoldTimerRef.current = null;
    }
  }, []);
  const disarmCompactDragHandle = useCallback(() => {
    compactDragArmedElementRef.current?.classList.remove('compact-stack-drag-handle');
    compactDragArmedElementRef.current = null;
    setCompactDragArmedItemId(null);
  }, []);
  const resetCompactDragHold = useCallback(() => {
    clearCompactDragHoldTimer();
    compactDragHoldStartRef.current = null;
    disarmCompactDragHandle();
  }, [clearCompactDragHoldTimer, disarmCompactDragHandle]);
  const startCompactDragHold = useCallback(
    (hold: CompactStackDragHoldStart) => {
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

        activeHold.element.classList.add('compact-stack-drag-handle');
        activeHold.element.classList.add('compact-drag-arm-feedback');
        compactDragArmedElementRef.current = activeHold.element;
        setCompactDragArmedItemId(activeHold.itemId);
        compactDragHoldTimerRef.current = null;
        window.setTimeout(() => {
          activeHold.element.classList.remove('compact-drag-arm-feedback');
        }, 260);
        window.requestAnimationFrame(() => {
          if (compactDragHoldStartRef.current === activeHold) {
            dispatchCompactStackDragStartEvent(activeHold);
          }
        });
      }, COMPACT_STACK_DRAG_LONG_PRESS_MS);
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

      if (Math.hypot(clientX - hold.x, clientY - hold.y) > COMPACT_STACK_DRAG_HOLD_MOVE_TOLERANCE_PX) {
        resetCompactDragHold();
      }
    },
    [resetCompactDragHold],
  );
  const handleCompactDragTouchStart = useCallback(
    (event: React.TouchEvent<HTMLButtonElement>, itemId: string) => {
      if (!isCompactEditCardMenuMode || !event.nativeEvent.isTrusted || event.touches.length !== 1) {
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
    [isCompactEditCardMenuMode, startCompactDragHold],
  );
  const handleCompactDragTouchMove = useCallback(
    (event: React.TouchEvent<HTMLButtonElement>) => {
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
    (event: React.MouseEvent<HTMLButtonElement>, itemId: string) => {
      if (!isCompactEditCardMenuMode || !event.nativeEvent.isTrusted || event.button !== 0) {
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
    [isCompactEditCardMenuMode, startCompactDragHold],
  );
  const handleCompactDragMouseMove = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (!isCompactEditCardMenuMode) {
        return;
      }
      cancelCompactDragHoldIfMoved(event.clientX, event.clientY);
    },
    [cancelCompactDragHoldIfMoved, isCompactEditCardMenuMode],
  );
  const handleCompactDragHoldEnd = useCallback(() => {
    if (isStackInteractingRef.current) {
      return;
    }
    resetCompactDragHold();
  }, [resetCompactDragHold]);
  const handleXsLongPressStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, widget: Widget) => {
      if (!isXsLongPressMode) {
        return;
      }
      if (event.pointerType === 'mouse' && event.button !== 0) {
        return;
      }
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
    if (!isXsLongPressMode) {
      resetXsLongPressState();
    }
  }, [isXsLongPressMode, resetXsLongPressState]);
  useEffect(() => {
    if (!isCompactEditCardMenuMode) {
      resetCompactDragHold();
    }
  }, [isCompactEditCardMenuMode, resetCompactDragHold]);
  useEffect(() => {
    return () => {
      resetXsLongPressState();
      resetCompactDragHold();
    };
  }, [resetCompactDragHold, resetXsLongPressState]);
  useEffect(() => {
    const host = stackHostRef.current;
    if (!host || typeof ResizeObserver === 'undefined') {
      return;
    }

    const updateMeasuredWidth = () => {
      const rounded = Math.max(1, Math.round(host.clientWidth));
      const previous = stableWidthRef.current;
      if (previous <= 0) {
        stableWidthRef.current = rounded;
        setMeasuredStackWidth(rounded);
        return;
      }
      const delta = Math.abs(rounded - previous);
      // Ignore tiny jitter from sub-pixel / scrollbar paint churn.
      if (delta < 3) {
        return;
      }
      stableWidthRef.current = rounded;
      setMeasuredStackWidth(rounded);
    };

    let rafId = 0;
    const updateWidth = () => {
      if (rafId) {
        return;
      }
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        updateMeasuredWidth();
      });
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(host);

    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      observer.disconnect();
    };
  }, [sectionsMounted]);
  useEffect(() => {
    if (!ENABLE_STACK_ADAPTIVE_MIN_WIDTH || !isGridStack) {
      setIsAdaptiveSpanEnabled(false);
      return;
    }
    setIsAdaptiveSpanEnabled((current) => {
      if (current) {
        return stackColWidth < ADAPTIVE_SPAN_DISABLE_COL_WIDTH_PX;
      }
      return stackColWidth <= ADAPTIVE_SPAN_ENABLE_COL_WIDTH_PX;
    });
  }, [isGridStack, stackColWidth]);
  const stackWidgetMinWidthById = useMemo(() => {
    const next = new Map<string, number>();
    stackWidgets.forEach((widget) => {
      next.set(widget.id, STACK_WIDGET_MIN_WIDTH_PX[widget.kind] ?? 156);
    });
    return next;
  }, [stackWidgets]);
  const stackLightWidgetStateById = useMemo(
    () =>
      new Map(
        stackWidgets
          .filter((widget) => widget.kind === 'light')
          .map((widget) => [widget.id, widget.isOn] as const),
      ),
    [stackWidgets],
  );
  const stackSwitchWidgetIds = useMemo(
    () =>
      new Set(
        stackWidgets
          .filter((widget) => widget.kind === 'switch')
          .map((widget) => widget.id),
      ),
    [stackWidgets],
  );
  const stackClimateWidgetIds = useMemo(
    () =>
      new Set(
        stackWidgets
          .filter((widget) => widget.kind === 'climate')
          .map((widget) => widget.id),
      ),
    [stackWidgets],
  );
  const stackCameraWidgetIds = useMemo(
    () =>
      new Set(
        stackWidgets
          .filter((widget) => widget.kind === 'camera')
          .map((widget) => widget.id),
      ),
    [stackWidgets],
  );
  const stackCoverWidgetIds = useMemo(
    () =>
      new Set(
        stackWidgets
          .filter((widget) => widget.kind === 'cover')
          .map((widget) => widget.id),
      ),
    [stackWidgets],
  );
  const stackVacuumWidgetIds = useMemo(
    () =>
      new Set(
        stackWidgets
          .filter((widget) => widget.kind === 'vacuum')
          .map((widget) => widget.id),
      ),
    [stackWidgets],
  );
  const stackMediaWidgetIds = useMemo(
    () =>
      new Set(
        stackWidgets
          .filter((widget) => widget.kind === 'media')
          .map((widget) => widget.id),
      ),
    [stackWidgets],
  );
  const stackSensorWidgetIds = useMemo(
    () =>
      new Set(
        stackWidgets
          .filter((widget) => widget.kind === 'sensor')
          .map((widget) => widget.id),
      ),
    [stackWidgets],
  );
  const stackMembersWidgetIds = useMemo(
    () =>
      new Set(
        stackWidgets
          .filter((widget) => widget.kind === 'members')
          .map((widget) => widget.id),
      ),
    [stackWidgets],
  );
  const stackAlarmWidgetIds = useMemo(
    () =>
      new Set(
        stackWidgets
          .filter((widget) => widget.kind === 'alarm')
          .map((widget) => widget.id),
      ),
    [stackWidgets],
  );
  const stackLockWidgetIds = useMemo(
    () =>
      new Set(
        stackWidgets
          .filter((widget) => widget.kind === 'lock')
          .map((widget) => widget.id),
      ),
    [stackWidgets],
  );
  const baseStackLayout = useMemo<GridItem[]>(
    () => {
      const resolveResponsiveSource = () => {
        const current = responsiveLayouts?.[gridBreakpoint];
        if (current && current.length > 0) {
          return { breakpoint: gridBreakpoint, layout: current };
        }
        const currentIndex = STACK_GRID_BREAKPOINT_ORDER.indexOf(gridBreakpoint);
        for (let index = currentIndex - 1; index >= 0; index -= 1) {
          const breakpoint = STACK_GRID_BREAKPOINT_ORDER[index];
          const layout = responsiveLayouts?.[breakpoint];
          if (layout && layout.length > 0) {
            return { breakpoint, layout };
          }
        }
        return null;
      };
      const applyResponsiveLayout = (fallback: GridItem[]) => {
        const responsiveSource = resolveResponsiveSource();
        if (!responsiveSource) {
          return fallback;
        }
        const sourceCols =
          responsiveSource.breakpoint === gridBreakpoint
            ? isGridStack && gridStackWidthMode === 'auto'
              ? Math.max(
                  1,
                  responsiveSource.layout.reduce(
                    (max, item) => Math.max(max, Math.round(item.x) + Math.max(1, Math.round(item.w))),
                    1,
                  ),
                )
              : measurementCols
            : Math.max(
                1,
                responsiveSource.layout.reduce(
                  (maxCols, item) =>
                    Math.max(maxCols, Math.max(0, Math.round(item.x)) + Math.max(1, Math.round(item.w))),
                  1,
                ),
              );
        const scaledSource =
          responsiveSource.breakpoint === gridBreakpoint && sourceCols === measurementCols
            ? responsiveSource.layout
            : responsiveSource.layout.map((item) =>
                scaleLayoutColumns(item, sourceCols, measurementCols, { preserveSingleWidthCell: true }),
              );
        const sourceById = new Map(scaledSource.map((item) => [item.i, clampLayoutToColumns(item, measurementCols)]));
        const merged = fallback.map((fallbackItem) => sourceById.get(fallbackItem.i) ?? fallbackItem);
        if (!isGridStack) {
          if (section.kind === 'stack-vertical') {
            return normalizeRuntimeLayout(
              merged.map((item) => ({
                ...item,
                x: 0,
                w: 1,
              })),
            );
          }
          return normalizeRuntimeLayout(merged);
        }
        return compactAndResolveLayout(
          enforceGridStackWidgetSpans(
            merged,
            gridBreakpoint,
            measurementCols,
            stackLightWidgetStateById,
            Boolean(widgetTypeLayoutOverrides.light?.[gridBreakpoint]),
            widgetTypeLayoutOverrides,
            widgetLayoutOverrides,
            stackSwitchWidgetIds,
            stackClimateWidgetIds,
            stackCameraWidgetIds,
            stackMediaWidgetIds,
            stackSensorWidgetIds,
            stackMembersWidgetIds,
            stackAlarmWidgetIds,
            stackVacuumWidgetIds,
            stackLockWidgetIds,
            stackCoverWidgetIds,
          ),
          measurementCols,
        );
      };
      if (isHorizontalStack) {
        let cursorX = 0;
        const baseLayout = [...stackWidgets]
          .sort((first, second) => {
            const firstY = Math.max(0, Math.round(first.layout.y));
            const secondY = Math.max(0, Math.round(second.layout.y));
            if (firstY !== secondY) {
              return firstY - secondY;
            }
            const firstX = Math.max(0, Math.round(first.layout.x));
            const secondX = Math.max(0, Math.round(second.layout.x));
            if (firstX !== secondX) {
              return firstX - secondX;
            }
            return first.id.localeCompare(second.id, 'it-IT');
          })
          .map((widget) => {
            const safeW = Math.max(1, Math.round(widget.layout.w));
            const safeH = Math.max(1, Math.round(widget.layout.h));
            const next = {
              i: widget.id,
              x: cursorX,
              y: 0,
              w: safeW,
              h: safeH,
            };
            cursorX += safeW;
            return next;
          });
        return applyResponsiveLayout(baseLayout);
      }
      if (isGridStack) {
        const baseLayouts = enforceGridStackWidgetSpans(
          stackWidgets.map((widget) => ({
            i: widget.id,
            x: Math.max(0, Math.round(widget.layout.x)),
            y: Math.max(0, Math.round(widget.layout.y)),
            w: Math.max(1, Math.round(widget.layout.w)),
            h: Math.max(1, Math.round(widget.layout.h)),
          })),
          gridBreakpoint,
          measurementCols,
          stackLightWidgetStateById,
          Boolean(widgetTypeLayoutOverrides.light?.[gridBreakpoint]),
          widgetTypeLayoutOverrides,
          widgetLayoutOverrides,
          stackSwitchWidgetIds,
          stackClimateWidgetIds,
          stackCameraWidgetIds,
          stackMediaWidgetIds,
          stackSensorWidgetIds,
          stackMembersWidgetIds,
          stackAlarmWidgetIds,
          stackVacuumWidgetIds,
          stackLockWidgetIds,
          stackCoverWidgetIds,
        );
        if (!ENABLE_STACK_ADAPTIVE_MIN_WIDTH || !isAdaptiveSpanEnabled) {
          return applyResponsiveLayout(compactAndResolveLayout(baseLayouts, measurementCols));
        }
        const adaptedLayouts = adaptLayoutsToMinWidth(
          baseLayouts,
          measurementCols,
          stackColWidth,
          marginX,
          stackWidgetMinWidthById,
        );
        const enforcedAdaptedLayouts = enforceGridStackWidgetSpans(
          adaptedLayouts,
          gridBreakpoint,
          measurementCols,
          stackLightWidgetStateById,
          Boolean(widgetTypeLayoutOverrides.light?.[gridBreakpoint]),
          widgetTypeLayoutOverrides,
          widgetLayoutOverrides,
          stackSwitchWidgetIds,
          stackClimateWidgetIds,
          stackCameraWidgetIds,
          stackMediaWidgetIds,
          stackSensorWidgetIds,
          stackMembersWidgetIds,
          stackAlarmWidgetIds,
          stackVacuumWidgetIds,
          stackLockWidgetIds,
          stackCoverWidgetIds,
        );
        return applyResponsiveLayout(compactAndResolveLayout(enforcedAdaptedLayouts, measurementCols));
      }
      const baseLayout = stackWidgets.map((widget) => {
        let next: GridItem = {
          i: widget.id,
          x: Math.max(0, Math.round(widget.layout.x)),
          y: Math.max(0, Math.round(widget.layout.y)),
          w: Math.max(1, Math.round(widget.layout.w)),
          h: Math.max(1, Math.round(widget.layout.h)),
        };

        if (section.kind === 'stack-vertical') {
          return {
            ...next,
            x: 0,
            w: 1,
          };
        }

        next = scaleLayoutColumns(next, canonicalCols, measurementCols, { preserveSingleWidthCell: true });

        const safeW = Math.min(next.w, measurementCols);
        const maxX = Math.max(0, measurementCols - safeW);
        return {
          ...next,
          w: safeW,
          x: Math.min(next.x, maxX),
        };
      });
      return applyResponsiveLayout(baseLayout);
    },
    [
      canonicalCols,
      measurementCols,
      gridBreakpoint,
      gridStackWidthMode,
      responsiveLayouts,
      widgetTypeLayoutOverrides,
      widgetLayoutOverrides,
      isGridStack,
      isHorizontalStack,
      isAdaptiveSpanEnabled,
      marginX,
      section.kind,
      stackColWidth,
      stackLightWidgetStateById,
      stackSwitchWidgetIds,
      stackClimateWidgetIds,
      stackCameraWidgetIds,
      stackMediaWidgetIds,
      stackSensorWidgetIds,
      stackMembersWidgetIds,
      stackAlarmWidgetIds,
      stackVacuumWidgetIds,
      stackLockWidgetIds,
      stackCoverWidgetIds,
      stackWidgetMinWidthById,
      stackWidgets,
    ],
  );

  const gridStackSolution = useMemo(
    () => solveGridStackLayout(baseStackLayout, measurementCols, gridStackWidthMode),
    [baseStackLayout, measurementCols, gridStackWidthMode],
  );
  const cols = isGridStack && gridStackWidthMode === 'auto'
    ? gridStackSolution.usedCols
    : measurementCols;
  const stackLayout = isGridStack ? gridStackSolution.layout : baseStackLayout;

  const stackLayoutMap = useMemo(
    () => new Map((stackPreviewLayout ?? stackLayout).map((item) => [item.i, item])),
    [stackLayout, stackPreviewLayout],
  );
  const liveStackLayout = stackPreviewLayout ?? stackLayout;
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
  const updateStackPreviewLayout = useCallback((next: GridItem[]) => {
    const normalized = normalizeRuntimeLayout(next);
    const nextPreviewBase = isGridStack
      ? enforceGridStackWidgetSpans(
          normalized,
          gridBreakpoint,
          cols,
          stackLightWidgetStateById,
          Boolean(widgetTypeLayoutOverrides.light?.[gridBreakpoint]),
          widgetTypeLayoutOverrides,
          widgetLayoutOverrides,
          stackSwitchWidgetIds,
          stackClimateWidgetIds,
          stackCameraWidgetIds,
          stackMediaWidgetIds,
          stackSensorWidgetIds,
          stackMembersWidgetIds,
          stackAlarmWidgetIds,
          stackVacuumWidgetIds,
          stackLockWidgetIds,
          stackCoverWidgetIds,
        )
      : normalized;
    const nextPreview = isGridStack
      ? solveGridStackLayout(nextPreviewBase, cols, gridStackWidthMode).layout
      : nextPreviewBase;
    setStackPreviewLayout((current) => (sameGridLayout(current, nextPreview) ? current : nextPreview));
  }, [
    cols,
    gridStackWidthMode,
    gridBreakpoint,
    widgetTypeLayoutOverrides,
    widgetLayoutOverrides,
    isGridStack,
    stackLightWidgetStateById,
    stackSwitchWidgetIds,
    stackClimateWidgetIds,
    stackCameraWidgetIds,
    stackMediaWidgetIds,
    stackSensorWidgetIds,
    stackMembersWidgetIds,
    stackAlarmWidgetIds,
    stackVacuumWidgetIds,
    stackLockWidgetIds,
    stackCoverWidgetIds,
  ]);
  useEffect(() => {
    if (!stackPreviewLayout || isStackInteractingRef.current) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setStackPreviewLayout(null);
    }, 0);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [stackLayout, stackPreviewLayout]);
  useLayoutEffect(() => {
    if (!isGridStack || !onGridStackGeometryChange) {
      return;
    }
    onGridStackGeometryChange(section.id, {
      usedCols: gridStackSolution.usedCols,
      usedRows: gridStackSolution.usedRows,
    });
  }, [gridStackSolution.usedCols, gridStackSolution.usedRows, isGridStack, onGridStackGeometryChange, section.id]);
  const toCanonicalStackLayout = useCallback(
    (next: GridItem[]) => {
      if (isHorizontalStack) {
        let cursorX = 0;
        return [...next]
          .sort((first, second) => {
            const firstY = Math.max(0, Math.round(first.y));
            const secondY = Math.max(0, Math.round(second.y));
            if (firstY !== secondY) {
              return firstY - secondY;
            }
            const firstX = Math.max(0, Math.round(first.x));
            const secondX = Math.max(0, Math.round(second.x));
            if (firstX !== secondX) {
              return firstX - secondX;
            }
            return first.i.localeCompare(second.i, 'it-IT');
          })
          .map((item) => {
            const safeW = Math.max(1, Math.round(item.w));
            const safeH = Math.max(1, Math.round(item.h));
            const placed = {
              i: item.i,
              x: cursorX,
              y: 0,
              w: safeW,
              h: safeH,
            };
            cursorX += safeW;
            return placed;
          });
      }
      if (isGridStack) {
        return solveGridStackLayout(
          enforceGridStackWidgetSpans(
            next.map((item) => clampLayoutToColumns(item, cols)),
            gridBreakpoint,
            cols,
            stackLightWidgetStateById,
            Boolean(widgetTypeLayoutOverrides.light?.[gridBreakpoint]),
            widgetTypeLayoutOverrides,
            widgetLayoutOverrides,
            stackSwitchWidgetIds,
            stackClimateWidgetIds,
            stackCameraWidgetIds,
            stackMediaWidgetIds,
            stackSensorWidgetIds,
            stackMembersWidgetIds,
            stackAlarmWidgetIds,
            stackVacuumWidgetIds,
            stackLockWidgetIds,
            stackCoverWidgetIds,
          ),
          cols,
          gridStackWidthMode,
        ).layout;
      }
      return next.map((item) => {
        let scaled =
          section.kind === 'stack-vertical'
            ? {
                i: item.i,
                x: 0,
                y: Math.max(0, Math.round(item.y)),
                w: 1,
                h: Math.max(1, Math.round(item.h)),
              }
            : scaleLayoutColumns(
                {
                  i: item.i,
                  x: Math.max(0, Math.round(item.x)),
                  y: Math.max(0, Math.round(item.y)),
                  w: Math.max(1, Math.round(item.w)),
                  h: Math.max(1, Math.round(item.h)),
                },
                cols,
                canonicalCols,
                { preserveSingleWidthCell: true },
              );
        return scaled;
      });
    },
    [
      canonicalCols,
      cols,
      gridBreakpoint,
      gridStackWidthMode,
      widgetTypeLayoutOverrides,
      widgetLayoutOverrides,
      isGridStack,
      isHorizontalStack,
      section.kind,
      stackLightWidgetStateById,
      stackSwitchWidgetIds,
      stackClimateWidgetIds,
      stackCameraWidgetIds,
      stackMediaWidgetIds,
      stackSensorWidgetIds,
      stackMembersWidgetIds,
      stackAlarmWidgetIds,
      stackVacuumWidgetIds,
      stackLockWidgetIds,
      stackCoverWidgetIds,
    ],
  );
  const commitStackLayout = useCallback(
    (next: GridItem[]) => {
      const normalized = toCanonicalStackLayout(next);
      onStackBreakpointLayoutChange(section.id, gridBreakpoint, normalized);
      if (gridBreakpoint === 'xl') {
        onWidgetLayoutChange(section.id, normalized);
      }
    },
    [gridBreakpoint, onStackBreakpointLayoutChange, onWidgetLayoutChange, section.id, toCanonicalStackLayout],
  );
  const handleStackItemKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, itemId: string, itemLabel: string) => {
      if (!isEditMode) {
        return;
      }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        return;
      }

      const current = liveStackLayout.find((item) => item.i === itemId);
      if (!current) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      onSelectWidget(itemId);
      onSelectSection(null);

      const nextItem = { ...current };
      const isResize = event.shiftKey;
      if (isResize) {
        if (event.key === 'ArrowLeft') nextItem.w = Math.max(1, nextItem.w - 1);
        if (event.key === 'ArrowRight') nextItem.w = Math.min(cols - nextItem.x, nextItem.w + 1);
        if (event.key === 'ArrowUp') nextItem.h = Math.max(1, nextItem.h - 1);
        if (event.key === 'ArrowDown') nextItem.h += 1;
      } else {
        if (event.key === 'ArrowLeft') nextItem.x = Math.max(0, nextItem.x - 1);
        if (event.key === 'ArrowRight') nextItem.x = Math.min(cols - nextItem.w, nextItem.x + 1);
        if (event.key === 'ArrowUp') nextItem.y = Math.max(0, nextItem.y - 1);
        if (event.key === 'ArrowDown') nextItem.y += 1;
      }

      if (!hasGridItemMoved(current, nextItem)) {
        setKeyboardLayoutAnnouncement(`${itemLabel}: limite dello stack raggiunto.`);
        return;
      }

      const nextLayout = liveStackLayout.map((item) => (item.i === itemId ? nextItem : item));
      updateStackPreviewLayout(nextLayout);
      commitStackLayout(nextLayout);
      setKeyboardLayoutAnnouncement(
        isResize
          ? `${itemLabel}: dimensione ${nextItem.w} colonne per ${nextItem.h} righe.`
          : `${itemLabel}: posizione colonna ${nextItem.x + 1}, riga ${nextItem.y + 1}.`,
      );
    },
    [
      cols,
      commitStackLayout,
      hasGridItemMoved,
      isEditMode,
      liveStackLayout,
      onSelectSection,
      onSelectWidget,
      updateStackPreviewLayout,
    ],
  );

  return (
    <div
      className={`relative h-full w-full flex-1 min-h-0 min-w-0 rounded-[1.5rem] bg-transparent p-0 ${
        isHorizontalStack ? 'overflow-x-auto overflow-y-hidden hide-scrollbar [scroll-behavior:smooth] [touch-action:pan-x]' : ''
      } ${
        isSelected ? 'selection-corners' : ''
      }`}
      onPointerDown={(event) => {
        if (!isEditMode) {
          return;
        }
        if (event.pointerType === 'mouse' && event.button !== 0) {
          return;
        }
        onSelectWidget(null);
        onSelectSection(section.id);
      }}
      onClick={() => {
        if (isEditMode) {
          onSelectWidget(null);
          onSelectSection(section.id);
        }
      }}
    >
      {isEditMode ? (
        <>
          <div className="pointer-events-none absolute inset-0 rounded-[1.5rem] bg-[radial-gradient(#93c5fd3f_1px,transparent_1px)] bg-[size:16px_16px]" />
          <p id={`stack-grid-keyboard-help-${section.id}`} className="sr-only">
            {t('stack.keyboardHelp')}
          </p>
          <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
            {keyboardLayoutAnnouncement}
          </p>
        </>
      ) : null}
      {isEditMode && isGridStack ? (
        <div className="liquid-glass-card pointer-events-none absolute right-2 top-2 z-20 rounded-md px-2 py-1 text-[10px] font-medium text-cyan-100">
          {`stack cols ${cols} | canvas cols ${canvasLinkedCols}`}
        </div>
      ) : null}
      {sectionsMounted ? (
        <div ref={stackHostRef} className="relative h-full w-full min-h-0">
          {isGridStack && (section.stackUseFavoritesGrid ?? false) && stackWidgets.length === 0 ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-5 text-center">
              <div className="max-w-sm">
                <p className="text-sm font-semibold text-[color:var(--ui-text-primary)]">{t('stack.noFavorites')}</p>
                <p className="mt-1 text-xs leading-relaxed text-[color:var(--ui-text-tertiary)]">
                  {t('stack.noFavoritesDescription')}
                </p>
              </div>
            </div>
          ) : null}
          {!isEditMode ? (
            <div
              className="grid h-full min-h-0 min-w-0"
              style={{
                width: isHorizontalStack ? `${gridWidth}px` : '100%',
                gridTemplateColumns: `repeat(${Math.max(1, cols)}, minmax(0, 1fr))`,
                gridAutoRows: `${rowHeight}px`,
                columnGap: `${marginX}px`,
                rowGap: `${marginY}px`,
                paddingLeft: `${stackInsetX}px`,
                paddingRight: `${stackInsetX}px`,
              }}
            >
              {stackWidgets.map((widget) => {
                const value =
                  widget.kind === 'sensor'
                    ? haConnected
                      ? haStates[widget.entityId]?.numericValue
                      : undefined
                    : widget.value ?? 0;
                const layout =
                  stackLayoutMap.get(widget.id) ?? {
                    i: widget.id,
                    x: 0,
                    y: 0,
                    w: 1,
                    h: 1,
                  };
                const rawW = Math.min(cols, Math.max(1, Math.round(layout.w)));
                const safeX = Math.min(Math.max(0, Math.round(layout.x)), Math.max(0, cols - rawW));
                const safeY = Math.max(0, Math.round(layout.y));
                const safeW = Math.min(rawW, Math.max(1, cols - safeX));
                const safeH = Math.max(1, Math.round(layout.h));
                const runtimeWidget =
                  stackLayoutMap.has(widget.id)
                    ? {
                        ...widget,
                        layout: {
                          ...widget.layout,
                          i: widget.id,
                          x: safeX,
                          y: safeY,
                          w: safeW,
                          h: safeH,
                        },
                      }
                    : widget;
                return (
                  <div
                    key={widget.id}
                    className="relative h-full w-full min-h-0 min-w-0 box-border"
                    style={{
                      gridColumn: `${safeX + 1} / span ${safeW}`,
                      gridRow: `${safeY + 1} / span ${safeH}`,
                    }}
                  >
                    <div
                      className="relative h-full w-full min-h-0 min-w-0 overflow-hidden"
                      style={
                        isXsLongPressMode
                          ? {
                              userSelect: 'none',
                              WebkitUserSelect: 'none',
                            }
                          : undefined
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        if (isEditMode && !isCompactEditCardMenuMode) {
                          onSelectWidget(widget.id);
                          onSelectSection(null);
                        }
                      }}
                      onPointerDown={(event) => {
                        if (!isEditMode) {
                          handleXsLongPressStart(event, widget);
                          return;
                        }
                        if (!isCompactEditCardMenuMode) {
                          event.stopPropagation();
                          onSelectWidget(widget.id);
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
                        gridBreakpoint={gridBreakpoint}
                        value={value}
                        onClick={() => {
                          if (isCompactEditCardMenuMode) {
                            return;
                          }
                          if (isXsLongPressMode) {
                            if (xsSuppressNextCardClickRef.current) {
                              xsSuppressNextCardClickRef.current = false;
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
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
          {isEditMode ? (
            <div className="absolute inset-0 z-30 m-0 h-full w-full p-0">
              <GridLayout
                className={`builder-grid relative h-full w-full m-0 p-0 ${isHorizontalStack ? 'horizontal-stack' : ''} is-editing`}
                width={gridWidth}
                layout={liveStackLayout}
                cols={cols}
                rowHeight={rowHeight}
                margin={[marginX, marginY]}
                containerPadding={[stackInsetX, 0]}
                useCSSTransforms
                isDraggable
                isResizable={false}
                resizeHandles={[]}
                compactType={overlayCompactType}
                draggableHandle={isCompactEditCardMenuMode ? '.compact-stack-drag-handle' : undefined}
                draggableCancel=".widget-action,.react-resizable-handle"
                onDragStart={(_, item, _newItem, _placeholder, event) => {
                  isStackInteractingRef.current = true;
                  const dragged = item as GridItem | undefined;
                  stackDragStartItemRef.current = dragged ? { ...dragged } : null;
                  hasStackDragMovedRef.current = false;
                  draggingStackItemRef.current = dragged ?? null;
                  if (isCompactEditCardMenuMode) {
                    clearCompactDragHoldTimer();
                    compactDragHoldStartRef.current = null;
                    if (item?.i) {
                      setCompactDragArmedItemId(item.i);
                    }
                    onCompactDragStart?.(event);
                  }
                  if (item?.i && !isCompactEditCardMenuMode) {
                    onSelectWidget(item.i);
                    onSelectSection(null);
                  }
                }}
                onDrag={(_next, _oldItem, newItem, _placeholder, event) => {
                  const dragged = newItem as GridItem | undefined;
                  draggingStackItemRef.current = dragged ?? null;
                  if (isCompactEditCardMenuMode) {
                    onCompactDragMove?.(event);
                  }
                  if (!hasGridItemMoved(stackDragStartItemRef.current, dragged)) {
                    return;
                  }
                  hasStackDragMovedRef.current = true;
                }}
                onDragStop={(next, _oldItem, newItem) => {
                  const dragged = newItem as GridItem | undefined;
                  const hasMoved =
                    hasStackDragMovedRef.current ||
                    hasGridItemMoved(stackDragStartItemRef.current, dragged);
                  isStackInteractingRef.current = false;
                  draggingStackItemRef.current = null;
                  stackDragStartItemRef.current = null;
                  hasStackDragMovedRef.current = false;
                  resetCompactDragHold();
                  if (isCompactEditCardMenuMode) {
                    onCompactDragStop?.();
                  }
                  if (!hasMoved) {
                    setStackPreviewLayout(null);
                    return;
                  }
                  commitStackLayout(next as GridItem[]);
                }}
                onLayoutChange={(next) => {
                  if (!isStackInteractingRef.current || !hasStackDragMovedRef.current) {
                    return;
                  }
                  updateStackPreviewLayout(next as GridItem[]);
                }}
              >
                {liveStackLayout.map((item) => {
                  const overlayWidget = stackWidgets.find((widget) => widget.id === item.i);
                  const overlayRuntimeWidget = overlayWidget
                    ? {
                        ...overlayWidget,
                        layout: {
                          ...overlayWidget.layout,
                          i: item.i,
                          x: Math.max(0, Math.round(item.x)),
                          y: Math.max(0, Math.round(item.y)),
                          w: Math.max(1, Math.round(item.w)),
                          h: Math.max(1, Math.round(item.h)),
                        },
                      }
                    : null;
                  const overlayValue =
                    overlayWidget?.kind === 'sensor'
                      ? haConnected
                        ? haStates[overlayWidget.entityId]?.numericValue
                        : undefined
                      : overlayWidget?.value ?? 0;
                  return (
                    <div key={item.i} className="relative h-full w-full m-0 p-0">
                      {overlayRuntimeWidget ? (
                        <div className="pointer-events-none absolute inset-0 m-0 h-full w-full overflow-hidden">
                          <WidgetCardRenderer
                            widget={overlayRuntimeWidget}
                            dashboardState={state}
                            isEditMode={false}
                            isInteractive={false}
                            isSelected={selectedWidgetId === item.i}
                            gridBreakpoint={gridBreakpoint}
                            value={overlayValue}
                            onClick={() => {}}
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
                            liveEntity={haStates[overlayRuntimeWidget.entityId]}
                            switchConsumptionEntity={
                              haConnected &&
                              overlayRuntimeWidget.kind === 'switch' &&
                              overlayRuntimeWidget.switchConsumptionEntityId
                                ? haStates[overlayRuntimeWidget.switchConsumptionEntityId] ??
                                  haStates[overlayRuntimeWidget.switchConsumptionEntityId.toLowerCase()]
                                : undefined
                            }
                            sensorBatteryEntity={
                              haConnected && overlayRuntimeWidget.sensorBatteryEntityId
                                ? haStates[overlayRuntimeWidget.sensorBatteryEntityId]
                                : undefined
                            }
                            sensorHistory={sensorHistoryByEntity[overlayRuntimeWidget.entityId]}
                            houseMembers={houseMembers}
                            onDisplayMetricsChange={
                              selectedWidgetId === item.i ? onWidgetDisplayMetricsChange : undefined
                            }
                          />
                        </div>
                      ) : null}
                      <button
                        type="button"
                        className={`absolute inset-0 m-0 h-full w-full rounded-[2rem] border-0 bg-transparent p-0 outline-none cursor-grab active:cursor-grabbing focus:outline-none focus-visible:outline-none focus-visible:ring-0 ${
                          compactDragArmedItemId === item.i ? 'compact-stack-drag-handle' : ''
                        }`}
                        style={
                          isCompactEditCardMenuMode
                            ? { touchAction: compactDragArmedItemId === item.i ? 'none' : 'pan-y' }
                            : undefined
                        }
                        onTouchStart={(event) => handleCompactDragTouchStart(event, item.i)}
                        onTouchMove={handleCompactDragTouchMove}
                        onTouchEnd={handleCompactDragHoldEnd}
                        onTouchCancel={handleCompactDragHoldEnd}
                        onMouseDown={(event) => handleCompactDragMouseDown(event, item.i)}
                        onMouseMove={handleCompactDragMouseMove}
                        onMouseUp={handleCompactDragHoldEnd}
                        onMouseLeave={handleCompactDragHoldEnd}
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          if (!isCompactEditCardMenuMode) {
                            onSelectWidget(item.i);
                            onSelectSection(null);
                          }
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!isCompactEditCardMenuMode) {
                            onSelectWidget(item.i);
                            onSelectSection(null);
                          }
                        }}
                        onKeyDown={(event) =>
                          handleStackItemKeyDown(
                            event,
                            item.i,
                            overlayWidget?.title?.trim() || item.i,
                          )
                        }
                        aria-describedby={`stack-grid-keyboard-help-${section.id}`}
                        aria-label={`Muovi ${overlayWidget?.title || item.i}`}
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
                            onSelectWidget(item.i);
                            onSelectSection(null);
                          }}
                          aria-label={t('builder.configureNamed', { name: overlayWidget?.title || item.i })}
                          title={t('builder.configureCard')}
                        >
                          <MoreHorizontal size={18} aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </GridLayout>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export const StackGrid = memo(StackGridComponent);
