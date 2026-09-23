import type { DashboardSection, GridItem, SectionKind, Widget, WidgetKind } from '../types/dashboardModels';
import type {
  DashboardResponsiveLayouts,
  DashboardGridBreakpoint,
  WidgetLayoutOverrides,
  WidgetTypeBreakpointLayoutOverride,
  WidgetTypeLayoutOverrides,
} from '../types/widgetTypeLayout';
import {
  GREETING_SECTION_ROWS,
  ROOT_CANVAS_COLS,
  ROOT_CANVAS_LEGACY_COLS,
  ROOT_CANVAS_LEGACY_ROW_UNITS,
  ROOT_CANVAS_ROW_UNITS,
  SCENES_SECTION_ROWS,
  WEATHER_SECTION_BASE_ROWS,
  WEATHER_SECTION_CARD_COLS,
  WEATHER_SECTION_CARD_ROWS,
  WEATHER_SECTION_CHIP_COLS,
  WEATHER_SECTION_CHIP_ROWS,
  createDefaultSectionLayout,
} from '../types/dashboardModels';
import { getInitialDashboardFixtures, normalizeWidgetsForRuntime } from '../demo/dashboardDemoFixtures';
import { normalizeSensorDisplayPrecision } from '../utils/sensorValue';
import {
  mergeWidgetSecretsIntoWidgets,
  migrateLegacyWidgetSecretsFromWidgets,
  persistWidgetSecretsFromWidgets,
  stripWidgetSecretsFromWidgets,
} from './widgetSecrets';
import type { DashboardRuntimeMode } from '../security/dashboardAccess';
import { getDashboardLayoutStorageKey } from './dashboardRuntime';
import {
  hydrateWidgetRuntimeDefaults,
  stripWidgetRuntimeState,
} from './dashboardPersistenceProjection';

export const DASHBOARD_LAYOUT_STORAGE_VERSION = 14;
const STORAGE_VERSION = DASHBOARD_LAYOUT_STORAGE_VERSION;

const VALID_SECTION_KINDS: SectionKind[] = [
  'greeting',
  'weather',
  'scenes',
  'stack-vertical',
  'stack-horizontal',
  'stack-grid',
];

const VALID_WIDGET_KINDS: WidgetKind[] = ['light', 'switch', 'fan', 'humidifier', 'climate', 'camera', 'sensor', 'media', 'alarm', 'vacuum', 'lock', 'cover', 'calendar', 'members'];
const VALID_GRID_BREAKPOINTS: DashboardGridBreakpoint[] = ['2xl', 'xl', 'lg', 'md', 'sm', 'xs'];
const GRID_COLS_BY_BREAKPOINT: Record<DashboardGridBreakpoint, number> = {
  '2xl': 12,
  xl: 12,
  lg: 8,
  md: 6,
  sm: 4,
  xs: 2,
};

type StoredLayout = {
  version: number;
  sections: DashboardSection[];
  widgets: Widget[];
  /** Distinguishes an intentionally empty canvas from missing/corrupt storage. */
  emptyIntentional?: boolean;
  widgetTypeLayoutOverrides?: WidgetTypeLayoutOverrides;
  widgetLayoutOverrides?: WidgetLayoutOverrides;
  responsiveLayouts?: DashboardResponsiveLayouts;
};

export type DashboardLayoutSaveErrorCode =
  | 'storage_unavailable'
  | 'server_unavailable'
  | 'server_unauthorized'
  | 'server_unsupported'
  | 'server_conflict'
  | 'migration_required'
  | 'quota_exceeded'
  | 'security_error'
  | 'serialization_error'
  | 'unknown';

export type DashboardLayoutSaveResult =
  | {
      ok: true;
      savedAt: number;
      storageKey: string;
      bytes: number;
    }
  | {
      ok: false;
      attemptedAt: number;
      code: DashboardLayoutSaveErrorCode;
    };

export function classifyDashboardStorageError(error: unknown): DashboardLayoutSaveErrorCode {
  if (error instanceof DOMException) {
    if (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      return 'quota_exceeded';
    }
    if (error.name === 'SecurityError') {
      return 'security_error';
    }
  }
  if (error instanceof TypeError) {
    return 'serialization_error';
  }
  return 'unknown';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function toPositiveInt(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(1, Math.round(value));
}

function normalizeBreakpointLayoutOverride(
  raw: unknown,
): WidgetTypeBreakpointLayoutOverride | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const source = raw as WidgetTypeBreakpointLayoutOverride;
  const w = toPositiveInt(source.w);
  const h = toPositiveInt(source.h);
  const hOn = toPositiveInt(source.hOn);
  const hOff = toPositiveInt(source.hOff);
  const autoExpand = typeof source.autoExpand === 'boolean' ? source.autoExpand : undefined;
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

function normalizeWidgetTypeLayoutOverrides(raw: unknown): WidgetTypeLayoutOverrides {
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  const source = raw as WidgetTypeLayoutOverrides;
  const normalized: WidgetTypeLayoutOverrides = {};
  VALID_WIDGET_KINDS.forEach((kind) => {
    const byBreakpointRaw = source[kind];
    if (!byBreakpointRaw || typeof byBreakpointRaw !== 'object') {
      return;
    }
    const nextByBreakpoint: Partial<Record<DashboardGridBreakpoint, WidgetTypeBreakpointLayoutOverride>> = {};
    VALID_GRID_BREAKPOINTS.forEach((breakpoint) => {
      const nextOverride = normalizeBreakpointLayoutOverride(byBreakpointRaw[breakpoint]);
      if (nextOverride) {
        nextByBreakpoint[breakpoint] = nextOverride;
      }
    });
    if (Object.keys(nextByBreakpoint).length > 0) {
      normalized[kind] = nextByBreakpoint;
    }
  });
  return normalized;
}

function normalizeWidgetLayoutOverrides(raw: unknown): WidgetLayoutOverrides {
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  const source = raw as WidgetLayoutOverrides;
  const normalized: WidgetLayoutOverrides = {};
  Object.entries(source).forEach(([widgetId, byBreakpointRaw]) => {
    if (!widgetId || !byBreakpointRaw || typeof byBreakpointRaw !== 'object') {
      return;
    }
    const nextByBreakpoint: Partial<Record<DashboardGridBreakpoint, WidgetTypeBreakpointLayoutOverride>> = {};
    VALID_GRID_BREAKPOINTS.forEach((breakpoint) => {
      const nextOverride = normalizeBreakpointLayoutOverride(byBreakpointRaw[breakpoint]);
      if (nextOverride) {
        nextByBreakpoint[breakpoint] = nextOverride;
      }
    });
    if (Object.keys(nextByBreakpoint).length > 0) {
      normalized[widgetId] = nextByBreakpoint;
    }
  });
  return normalized;
}

function normalizeStoredGridItems(raw: unknown, maxCols?: number): GridItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set<string>();
  const normalized: GridItem[] = [];
  raw.forEach((item) => {
    if (!item || typeof item !== 'object') {
      return;
    }
    const source = item as Partial<GridItem>;
    if (typeof source.i !== 'string' || source.i.trim().length === 0 || seen.has(source.i)) {
      return;
    }
    const fallback: GridItem = { i: source.i, x: 0, y: normalized.length, w: 1, h: 1 };
    normalized.push(normalizeLayout(source.i, source as GridItem, fallback, maxCols));
    seen.add(source.i);
  });
  return normalized;
}

function normalizeResponsiveLayouts(raw: unknown): DashboardResponsiveLayouts {
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  const source = raw as DashboardResponsiveLayouts;
  const root: DashboardResponsiveLayouts['root'] = {};
  VALID_GRID_BREAKPOINTS.forEach((breakpoint) => {
    const normalized = normalizeStoredGridItems(source.root?.[breakpoint], GRID_COLS_BY_BREAKPOINT[breakpoint]);
    if (normalized.length > 0) {
      root[breakpoint] = normalized;
    }
  });

  const stacks: NonNullable<DashboardResponsiveLayouts['stacks']> = {};
  if (source.stacks && typeof source.stacks === 'object') {
    Object.entries(source.stacks).forEach(([sectionId, byBreakpoint]) => {
      if (!sectionId || !byBreakpoint || typeof byBreakpoint !== 'object') {
        return;
      }
      const nextByBreakpoint: NonNullable<DashboardResponsiveLayouts['root']> = {};
      VALID_GRID_BREAKPOINTS.forEach((breakpoint) => {
        const normalized = normalizeStoredGridItems(byBreakpoint[breakpoint]);
        if (normalized.length > 0) {
          nextByBreakpoint[breakpoint] = normalized;
        }
      });
      if (Object.keys(nextByBreakpoint).length > 0) {
        stacks[sectionId] = nextByBreakpoint;
      }
    });
  }

  return {
    ...(Object.keys(root).length > 0 ? { root } : null),
    ...(Object.keys(stacks).length > 0 ? { stacks } : null),
  };
}

function createInitialResponsiveLayouts(
  sections: DashboardSection[],
  widgets: Widget[],
): DashboardResponsiveLayouts {
  const rootWidgets = widgets.filter((widget) => !widget.parentSectionId);
  const root = normalizeStoredGridItems(
    [
      ...sections.map((section) => section.layout),
      ...rootWidgets.map((widget) => widget.layout),
    ],
    GRID_COLS_BY_BREAKPOINT.xl,
  );
  const stacks: NonNullable<DashboardResponsiveLayouts['stacks']> = {};
  sections.forEach((section) => {
    const stackWidgets = widgets.filter((widget) => widget.parentSectionId === section.id);
    if (stackWidgets.length === 0) {
      return;
    }
    const stackLayout = normalizeStoredGridItems(stackWidgets.map((widget) => widget.layout));
    if (stackLayout.length > 0) {
      stacks[section.id] = { xl: stackLayout };
    }
  });
  return {
    ...(root.length > 0 ? { root: { xl: root } } : null),
    ...(Object.keys(stacks).length > 0 ? { stacks } : null),
  };
}

function normalizeLayout(
  id: string,
  layout: GridItem | undefined,
  fallback: GridItem,
  maxCols?: number,
) {
  const source = layout && isNumber(layout.x) && isNumber(layout.y) && isNumber(layout.w) && isNumber(layout.h) ? layout : fallback;
  const safeW = maxCols === undefined ? Math.max(1, Math.round(source.w)) : Math.min(maxCols, Math.max(1, Math.round(source.w)));
  const maxX = maxCols === undefined ? Number.POSITIVE_INFINITY : Math.max(0, maxCols - safeW);
  return {
    i: id,
    x: Math.min(Math.max(0, Math.round(source.x)), maxX),
    y: Math.max(0, Math.round(source.y)),
    w: safeW,
    h: Math.max(1, Math.round(source.h)),
  };
}

function intersects(
  first: Pick<GridItem, 'x' | 'y' | 'w' | 'h'>,
  second: Pick<GridItem, 'x' | 'y' | 'w' | 'h'>,
) {
  return (
    first.x < second.x + second.w &&
    first.x + first.w > second.x &&
    first.y < second.y + second.h &&
    first.y + first.h > second.y
  );
}

function compactLayoutsUp(layouts: GridItem[], cols: number): GridItem[] {
  const safeCols = Math.max(1, Math.round(cols));
  const placed: GridItem[] = [];
  const ordered = [...layouts].sort((first, second) => {
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
  });

  ordered.forEach((item) => {
    const safeW = Math.min(safeCols, Math.max(1, Math.round(item.w)));
    const safeH = Math.max(1, Math.round(item.h));
    const safeX = Math.min(Math.max(0, Math.round(item.x)), Math.max(0, safeCols - safeW));
    let safeY = Math.max(0, Math.round(item.y));

    while (safeY > 0) {
      const candidate = { x: safeX, y: safeY - 1, w: safeW, h: safeH };
      if (placed.some((existing) => intersects(candidate, existing))) {
        break;
      }
      safeY -= 1;
    }

    placed.push({
      i: item.i,
      x: safeX,
      y: safeY,
      w: safeW,
      h: safeH,
    });
  });

  return placed;
}

function scaleRootLayoutCols(layout: GridItem | undefined, id: string): GridItem | undefined {
  if (!layout || !isNumber(layout.x) || !isNumber(layout.y) || !isNumber(layout.w) || !isNumber(layout.h)) {
    return layout;
  }
  const ratio = ROOT_CANVAS_COLS / ROOT_CANVAS_LEGACY_COLS;
  const safeW = Math.min(ROOT_CANVAS_COLS, Math.max(1, Math.round(layout.w * ratio)));
  const maxX = Math.max(0, ROOT_CANVAS_COLS - safeW);
  return {
    i: id,
    x: Math.min(Math.max(0, Math.round(layout.x * ratio)), maxX),
    y: Math.max(0, Math.round(layout.y)),
    w: safeW,
    h: Math.max(1, Math.round(layout.h)),
  };
}

function scaleRootLayoutRows(layout: GridItem | undefined, id: string): GridItem | undefined {
  if (!layout || !isNumber(layout.x) || !isNumber(layout.y) || !isNumber(layout.w) || !isNumber(layout.h)) {
    return layout;
  }
  const ratio = ROOT_CANVAS_ROW_UNITS / ROOT_CANVAS_LEGACY_ROW_UNITS;
  return {
    i: id,
    x: Math.max(0, Math.round(layout.x)),
    y: Math.max(0, Math.round(layout.y * ratio)),
    w: Math.max(1, Math.round(layout.w)),
    h: Math.max(1, Math.round(layout.h * ratio)),
  };
}

function migrateStoredLayoutV1ToV2(layout: StoredLayout): StoredLayout {
  if (layout.version !== 1) {
    return layout;
  }

  const sections = Array.isArray(layout.sections)
    ? layout.sections.map((section) => ({
        ...section,
        layout: scaleRootLayoutCols(section.layout, section.id) ?? section.layout,
      }))
    : [];
  const sectionIds = new Set(sections.map((section) => section.id));
  const widgets = Array.isArray(layout.widgets)
    ? layout.widgets.map((widget) => {
        const belongsToStack = typeof widget.parentSectionId === 'string' && sectionIds.has(widget.parentSectionId);
        if (belongsToStack) {
          return widget;
        }
        return {
          ...widget,
          layout: scaleRootLayoutCols(widget.layout, widget.id) ?? widget.layout,
        };
      })
    : [];

  return {
    version: 2,
    sections,
    widgets,
  };
}

function migrateStoredLayoutV2ToV3(layout: StoredLayout): StoredLayout {
  if (layout.version !== 2) {
    return layout;
  }

  const sections = Array.isArray(layout.sections)
    ? layout.sections.map((section) => ({
        ...section,
        layout: scaleRootLayoutRows(section.layout, section.id) ?? section.layout,
      }))
    : [];
  const sectionIds = new Set(sections.map((section) => section.id));
  const widgets = Array.isArray(layout.widgets)
    ? layout.widgets.map((widget) => {
        const belongsToStack = typeof widget.parentSectionId === 'string' && sectionIds.has(widget.parentSectionId);
        if (belongsToStack) {
          return widget;
        }
        return {
          ...widget,
          layout: scaleRootLayoutRows(widget.layout, widget.id) ?? widget.layout,
        };
      })
    : [];

  return {
    version: 3,
    sections,
    widgets,
  };
}

function migrateStoredLayoutV3ToV4(layout: StoredLayout): StoredLayout {
  if (layout.version !== 3) {
    return layout;
  }

  const sections = Array.isArray(layout.sections) ? layout.sections : [];
  const sectionIds = new Set(sections.map((section) => section.id));
  const widgets = Array.isArray(layout.widgets)
    ? layout.widgets.map((widget) => {
        const isRootLight =
          widget.kind === 'light' &&
          (!widget.parentSectionId || !sectionIds.has(widget.parentSectionId)) &&
          isNumber(widget.layout?.h);
        if (!isRootLight) {
          return widget;
        }

        const currentHeight = Math.max(1, Math.round(widget.layout.h));
        const nextHeight = currentHeight === 2 ? 1 : currentHeight === 4 ? 3 : currentHeight;
        if (nextHeight === currentHeight) {
          return widget;
        }

        return {
          ...widget,
          layout: {
            ...widget.layout,
            i: widget.id,
            h: nextHeight,
          },
        };
      })
    : [];

  return {
    version: 4,
    sections,
    widgets,
  };
}

function migrateStoredLayoutV4ToV5(layout: StoredLayout): StoredLayout {
  if (layout.version !== 4) {
    return layout;
  }

  const sections = Array.isArray(layout.sections) ? layout.sections : [];
  const widgets = Array.isArray(layout.widgets)
    ? layout.widgets.map((widget) => {
        if (widget.kind !== 'light' || !isNumber(widget.layout?.h)) {
          return widget;
        }

        const currentHeight = Math.max(1, Math.round(widget.layout.h));
        const targetHeight = widget.isOn ? 3 : 2;
        const isLegacyLightHeight = currentHeight >= 1 && currentHeight <= 4;
        if (!isLegacyLightHeight || currentHeight === targetHeight) {
          return widget;
        }

        return {
          ...widget,
          layout: {
            ...widget.layout,
            i: widget.id,
            h: targetHeight,
          },
        };
      })
    : [];

  return {
    version: 5,
    sections,
    widgets,
  };
}

function migrateStoredLayoutV5ToV6(layout: StoredLayout): StoredLayout {
  if (layout.version !== 5) {
    return layout;
  }

  const sections = Array.isArray(layout.sections) ? layout.sections : [];
  const sectionById = new Map(sections.map((section) => [section.id, section]));
  const widgets = Array.isArray(layout.widgets)
    ? layout.widgets.map((widget) => {
        if (widget.kind !== 'climate' || !isNumber(widget.layout?.w) || !isNumber(widget.layout?.h)) {
          return widget;
        }
        const currentWidth = Math.max(1, Math.round(widget.layout.w));
        const parentSection =
          typeof widget.parentSectionId === 'string' ? sectionById.get(widget.parentSectionId) : undefined;
        const targetWidth =
          parentSection?.kind === 'stack-vertical'
            ? 1
            : Math.max(1, currentWidth);
        const currentHeight = Math.max(1, Math.round(widget.layout.h));
        const targetHeight = Math.max(3, currentHeight);
        if (currentWidth === targetWidth && currentHeight === targetHeight) {
          return widget;
        }
        return {
          ...widget,
          layout: {
            ...widget.layout,
            i: widget.id,
            w: targetWidth,
            h: targetHeight,
          },
        };
      })
    : [];

  return {
    version: 6,
    sections,
    widgets,
  };
}

function migrateStoredLayoutV6ToV7(layout: StoredLayout): StoredLayout {
  if (layout.version !== 6) {
    return layout;
  }

  const sections = Array.isArray(layout.sections) ? layout.sections : [];
  const sectionById = new Map(sections.map((section) => [section.id, section]));
  const widgets = Array.isArray(layout.widgets)
    ? layout.widgets.map((widget) => {
        if (widget.kind !== 'climate' || !isNumber(widget.layout?.w) || !isNumber(widget.layout?.h)) {
          return widget;
        }
        const currentWidth = Math.max(1, Math.round(widget.layout.w));
        const parentSection =
          typeof widget.parentSectionId === 'string' ? sectionById.get(widget.parentSectionId) : undefined;
        const targetWidth =
          parentSection?.kind === 'stack-vertical'
            ? 1
            : Math.max(1, currentWidth);
        const currentHeight = Math.max(1, Math.round(widget.layout.h));
        const targetHeight = Math.max(3, currentHeight);
        if (currentWidth === targetWidth && currentHeight === targetHeight) {
          return widget;
        }
        return {
          ...widget,
          layout: {
            ...widget.layout,
            i: widget.id,
            w: targetWidth,
            h: targetHeight,
          },
        };
      })
    : [];

  return {
    version: 7,
    sections,
    widgets,
  };
}

function migrateStoredLayoutV7ToV8(layout: StoredLayout): StoredLayout {
  if (layout.version !== 7) {
    return layout;
  }

  const sections = Array.isArray(layout.sections) ? layout.sections : [];
  const widgets = Array.isArray(layout.widgets)
    ? layout.widgets.map((widget) => {
        if (widget.kind !== 'light' || !isNumber(widget.layout?.h)) {
          return widget;
        }
        const targetHeight = widget.isOn ? 3 : 1;
        const currentHeight = Math.max(1, Math.round(widget.layout.h));
        if (currentHeight === targetHeight) {
          return widget;
        }
        return {
          ...widget,
          layout: {
            ...widget.layout,
            i: widget.id,
            h: targetHeight,
          },
        };
      })
    : [];

  return {
    version: 8,
    sections,
    widgets,
  };
}

function migrateStoredLayoutV8ToV9(layout: StoredLayout): StoredLayout {
  if (layout.version !== 8) {
    return layout;
  }

  const sections = Array.isArray(layout.sections) ? layout.sections : [];
  const widgets = Array.isArray(layout.widgets)
    ? layout.widgets.map((widget) => {
        if (widget.kind !== 'light' || !isNumber(widget.layout?.h)) {
          return widget;
        }
        const currentHeight = Math.max(1, Math.round(widget.layout.h));
        const targetMinHeight = widget.isOn ? 3 : 2;
        const nextHeight = Math.max(targetMinHeight, currentHeight);
        if (currentHeight === nextHeight) {
          return widget;
        }
        return {
          ...widget,
          layout: {
            ...widget.layout,
            i: widget.id,
            h: nextHeight,
          },
        };
      })
    : [];

  return {
    version: 9,
    sections,
    widgets,
  };
}

function migrateStoredLayoutV9ToV10(layout: StoredLayout): StoredLayout {
  if (layout.version !== 9) {
    return layout;
  }

  const legacyGreetingRows = ROOT_CANVAS_ROW_UNITS;
  const legacyWeatherChipRows = ROOT_CANVAS_ROW_UNITS;
  const legacyWeatherCardRows = ROOT_CANVAS_ROW_UNITS * 2;
  const legacySceneRows = new Set([3, ROOT_CANVAS_ROW_UNITS * 2, ROOT_CANVAS_ROW_UNITS * 3]);
  const sections = Array.isArray(layout.sections)
    ? layout.sections.map((section) => {
        if (!section.layout || !isNumber(section.layout.h)) {
          return section;
        }

        const currentHeight = Math.max(1, Math.round(section.layout.h));
        let nextHeight = currentHeight;

        if (section.kind === 'greeting' && currentHeight === legacyGreetingRows) {
          nextHeight = GREETING_SECTION_ROWS;
        } else if (section.kind === 'weather') {
          const layoutMode = section.weatherLayout ?? 'auto';
          if (layoutMode === 'card' && currentHeight === legacyWeatherCardRows) {
            nextHeight = WEATHER_SECTION_CARD_ROWS;
          } else if (currentHeight === legacyWeatherCardRows || currentHeight === legacyWeatherChipRows) {
            nextHeight = WEATHER_SECTION_BASE_ROWS;
          }
        } else if (section.kind === 'scenes' && legacySceneRows.has(currentHeight)) {
          nextHeight = SCENES_SECTION_ROWS;
        }

        if (nextHeight === currentHeight) {
          return section;
        }

        return {
          ...section,
          layout: {
            ...section.layout,
            i: section.id,
            h: nextHeight,
          },
        };
      })
    : [];

  return {
    version: 10,
    sections,
    widgets: Array.isArray(layout.widgets) ? layout.widgets : [],
  };
}

function migrateStoredLayoutV10ToV11(layout: StoredLayout): StoredLayout {
  if (layout.version !== 10) {
    return layout;
  }

  const rawSections = Array.isArray(layout.sections) ? layout.sections : [];
  const rawWidgets = Array.isArray(layout.widgets) ? layout.widgets : [];
  const normalizedSections = rawSections.map((section, index) => {
    const fallback = createDefaultSectionLayout(section.kind, section.id, index * 2);
    return {
      ...section,
      layout: normalizeLayout(section.id, section.layout, fallback, ROOT_CANVAS_COLS),
    };
  });
  const sectionIdSet = new Set(normalizedSections.map((section) => section.id));
  const rootWidgetIds = new Set<string>();
  const normalizedWidgets = rawWidgets.map((widget, index) => {
    const isRootWidget =
      !widget.parentSectionId ||
      typeof widget.parentSectionId !== 'string' ||
      !sectionIdSet.has(widget.parentSectionId);
    const fallback: GridItem = {
      i: widget.id,
      x: 0,
      y: index,
      w: 1,
      h: 1,
    };
    const nextLayout = isRootWidget
      ? normalizeLayout(widget.id, widget.layout, fallback, ROOT_CANVAS_COLS)
      : normalizeLayout(widget.id, widget.layout, fallback);
    if (isRootWidget) {
      rootWidgetIds.add(widget.id);
    }
    return {
      ...widget,
      parentSectionId: isRootWidget ? undefined : widget.parentSectionId,
      layout: nextLayout,
    };
  });

  const rootLayouts = [
    ...normalizedSections.map((section) => section.layout),
    ...normalizedWidgets
      .filter((widget) => rootWidgetIds.has(widget.id))
      .map((widget) => widget.layout),
  ];
  const compactedLayoutById = new Map(
    compactLayoutsUp(rootLayouts, ROOT_CANVAS_COLS).map((layoutItem) => [layoutItem.i, layoutItem]),
  );

  const sections = normalizedSections.map((section) => {
    const compacted = compactedLayoutById.get(section.id);
    return compacted
      ? {
          ...section,
          layout: {
            ...section.layout,
            i: section.id,
            x: compacted.x,
            y: compacted.y,
            w: compacted.w,
            h: compacted.h,
          },
        }
      : section;
  });
  const widgets = normalizedWidgets.map((widget) => {
    if (!rootWidgetIds.has(widget.id)) {
      return widget;
    }
    const compacted = compactedLayoutById.get(widget.id);
    if (!compacted) {
      return widget;
    }
    return {
      ...widget,
      layout: {
        ...widget.layout,
        i: widget.id,
        x: compacted.x,
        y: compacted.y,
        w: compacted.w,
        h: compacted.h,
      },
    };
  });

  return {
    version: 11,
    sections,
    widgets,
  };
}

function mergeGreetingAndWeatherSections(sections: DashboardSection[]) {
  const greetingsNormalized = sections.map((section) =>
    section.kind === 'greeting' && section.showWeather === undefined
      ? { ...section, showWeather: false }
      : section,
  );
  const greetingIndex = greetingsNormalized.findIndex((section) => section.kind === 'greeting');
  const weatherSections = greetingsNormalized.filter((section) => section.kind === 'weather');
  if (weatherSections.length === 0) {
    return greetingsNormalized;
  }

  const firstWeather = weatherSections[0];
  if (greetingIndex >= 0) {
    const greeting = greetingsNormalized[greetingIndex];
    const left = Math.min(greeting.layout.x, firstWeather.layout.x);
    const top = Math.min(greeting.layout.y, firstWeather.layout.y);
    const right = Math.max(
      greeting.layout.x + greeting.layout.w,
      firstWeather.layout.x + firstWeather.layout.w,
    );
    const bottom = Math.max(
      greeting.layout.y + greeting.layout.h,
      firstWeather.layout.y + firstWeather.layout.h,
    );

    const mergedGreeting: DashboardSection = {
      ...greeting,
      layout: {
        ...greeting.layout,
        i: greeting.id,
        x: left,
        y: top,
        w: Math.max(1, right - left),
        h: Math.max(1, bottom - top),
      },
      showWeather: true,
      weatherLayout: firstWeather.weatherLayout ?? greeting.weatherLayout ?? 'auto',
      weatherUnit: firstWeather.weatherUnit ?? greeting.weatherUnit ?? 'C',
      weatherShowCondition:
        firstWeather.weatherShowCondition ?? greeting.weatherShowCondition ?? true,
      weatherShowPrecipitation:
        firstWeather.weatherShowPrecipitation ?? greeting.weatherShowPrecipitation ?? true,
      weatherShowWind: firstWeather.weatherShowWind ?? greeting.weatherShowWind ?? true,
      weatherForecastType:
        firstWeather.weatherForecastType ?? greeting.weatherForecastType ?? 'daily',
      weatherForecastDays: firstWeather.weatherForecastDays ?? greeting.weatherForecastDays ?? 4,
      weatherForecastDensity:
        firstWeather.weatherForecastDensity ?? greeting.weatherForecastDensity ?? 'comfortable',
      weatherSecondaryInfo:
        firstWeather.weatherSecondaryInfo ?? greeting.weatherSecondaryInfo ?? 'auto',
      weatherCondition: firstWeather.weatherCondition ?? greeting.weatherCondition,
      weatherEntityId: firstWeather.weatherEntityId ?? greeting.weatherEntityId,
    };

    let mergedInserted = false;
    return greetingsNormalized.reduce<DashboardSection[]>((acc, section) => {
      if (section.kind === 'weather') {
        return acc;
      }
      if (section.id === greeting.id && !mergedInserted) {
        acc.push(mergedGreeting);
        mergedInserted = true;
        return acc;
      }
      if (section.id !== greeting.id) {
        acc.push(section);
      }
      return acc;
    }, []);
  }

  const convertedGreeting: DashboardSection = {
    ...firstWeather,
    kind: 'greeting',
    showWeather: true,
    titleAuto: true,
    subtitleAuto: true,
    weatherLayout: firstWeather.weatherLayout ?? 'auto',
    weatherUnit: firstWeather.weatherUnit ?? 'C',
    weatherShowCondition: firstWeather.weatherShowCondition ?? true,
    weatherShowPrecipitation: firstWeather.weatherShowPrecipitation ?? true,
    weatherShowWind: firstWeather.weatherShowWind ?? true,
    weatherForecastType: firstWeather.weatherForecastType ?? 'daily',
    weatherForecastDays: firstWeather.weatherForecastDays ?? 4,
    weatherForecastDensity: firstWeather.weatherForecastDensity ?? 'comfortable',
    weatherSecondaryInfo: firstWeather.weatherSecondaryInfo ?? 'auto',
  };

  let convertedInserted = false;
  return greetingsNormalized.reduce<DashboardSection[]>((acc, section) => {
    if (section.kind === 'weather') {
      if (!convertedInserted && section.id === firstWeather.id) {
        acc.push(convertedGreeting);
        convertedInserted = true;
      }
      return acc;
    }
    acc.push(section);
    return acc;
  }, []);
}

function migrateStoredLayoutV11ToV12(layout: StoredLayout): StoredLayout {
  if (layout.version !== 11) {
    return layout;
  }
  const rawSections = Array.isArray(layout.sections) ? layout.sections : [];
  const mergedSections = mergeGreetingAndWeatherSections(rawSections);
  return {
    version: 12,
    sections: mergedSections,
    widgets: Array.isArray(layout.widgets) ? layout.widgets : [],
    widgetTypeLayoutOverrides: normalizeWidgetTypeLayoutOverrides(layout.widgetTypeLayoutOverrides),
  };
}

function migrateStoredLayoutV12ToV13(layout: StoredLayout): StoredLayout {
  if (layout.version !== 12) {
    return layout;
  }
  return {
    version: 13,
    sections: Array.isArray(layout.sections) ? layout.sections : [],
    widgets: Array.isArray(layout.widgets) ? layout.widgets : [],
    widgetTypeLayoutOverrides: normalizeWidgetTypeLayoutOverrides(layout.widgetTypeLayoutOverrides),
  };
}

function migrateStoredLayoutV13ToV14(layout: StoredLayout): StoredLayout {
  if (layout.version !== 13) {
    return layout;
  }
  const sections = Array.isArray(layout.sections) ? layout.sections : [];
  const widgets = Array.isArray(layout.widgets) ? layout.widgets : [];
  const responsiveLayouts = normalizeResponsiveLayouts(layout.responsiveLayouts);
  return {
    version: 14,
    sections,
    widgets,
    widgetTypeLayoutOverrides: normalizeWidgetTypeLayoutOverrides(layout.widgetTypeLayoutOverrides),
    widgetLayoutOverrides: normalizeWidgetLayoutOverrides(layout.widgetLayoutOverrides),
    responsiveLayouts:
      responsiveLayouts.root || responsiveLayouts.stacks
        ? responsiveLayouts
        : createInitialResponsiveLayouts(sections, widgets),
  };
}

function normalizeSection(section: DashboardSection, index: number): DashboardSection {
  const fallback = createDefaultSectionLayout(section.kind, section.id, index * 2);
  const layout = normalizeLayout(section.id, section.layout, fallback, ROOT_CANVAS_COLS);
  if (section.kind === 'greeting' && (section.showWeather ?? false)) {
    return {
      ...section,
      weatherLayout: 'auto',
      layout: {
        ...layout,
        x: 0,
        w: ROOT_CANVAS_COLS,
        h: WEATHER_SECTION_CARD_ROWS,
      },
    };
  }
  const fixedWeatherSpan =
    section.kind !== 'weather'
      ? null
      : (section.weatherLayout ?? 'auto') === 'chip'
        ? { w: WEATHER_SECTION_CHIP_COLS, h: WEATHER_SECTION_CHIP_ROWS }
        : (section.weatherLayout ?? 'auto') === 'card'
          ? { w: WEATHER_SECTION_CARD_COLS, h: WEATHER_SECTION_CARD_ROWS }
          : null;
  if (fixedWeatherSpan) {
    const safeW = Math.min(ROOT_CANVAS_COLS, fixedWeatherSpan.w);
    const maxX = Math.max(0, ROOT_CANVAS_COLS - safeW);
    return {
      ...section,
      layout: {
        ...layout,
        x: Math.min(layout.x, maxX),
        w: safeW,
        h: fixedWeatherSpan.h,
      },
    };
  }
  const minWidth =
    section.kind === 'greeting' && (section.showWeather ?? false)
      ? ROOT_CANVAS_COLS
      : section.kind === 'weather'
        ? WEATHER_SECTION_CHIP_COLS
        : section.kind === 'stack-grid' && section.stackColumnsMode !== 'manual'
          ? 1
          : 2;
  const minHeight =
    section.kind === 'greeting'
      ? (section.showWeather ?? false)
        ? WEATHER_SECTION_CARD_ROWS
        : GREETING_SECTION_ROWS
      : section.kind === 'weather'
        ? WEATHER_SECTION_BASE_ROWS
        : section.kind === 'scenes'
          ? SCENES_SECTION_ROWS
          : section.kind === 'stack-grid'
            ? 1
            : ROOT_CANVAS_ROW_UNITS * 2;
  const normalizedHeight = Math.max(minHeight, layout.h);
  const safeW = Math.min(ROOT_CANVAS_COLS, Math.max(minWidth, layout.w));
  const maxX = Math.max(0, ROOT_CANVAS_COLS - safeW);
  return {
    ...section,
    layout: {
      ...layout,
      x: Math.min(layout.x, maxX),
      w: safeW,
      h: normalizedHeight,
    },
  };
}

function normalizeWidget(widget: Widget, index: number, isRootWidget: boolean, parentSection?: DashboardSection): Widget {
  const minWidth =
    widget.kind === 'light'
      ? parentSection?.kind === 'stack-vertical'
        ? 1
        : 2
      : widget.kind === 'climate'
      ? parentSection?.kind === 'stack-vertical'
        ? 1
        : 2
      : widget.kind === 'switch'
        ? 2
      : widget.kind === 'vacuum'
        ? 2
      : widget.kind === 'media'
        ? 3
      : widget.kind === 'members'
        ? 2
        : 1;
  const minHeight =
    widget.kind === 'light'
      ? widget.isOn
        ? 2
        : 1
      : widget.kind === 'climate'
        ? 3
        : widget.kind === 'camera'
          ? 3
          : widget.kind === 'media'
            ? 3
            : widget.kind === 'vacuum'
              ? 3
              : widget.kind === 'cover'
                ? 1
                : widget.kind === 'members'
                  ? 2
              : 1;
  const fallback = {
    i: widget.id,
    x: 0,
    y: index,
    w: minWidth,
    h: minHeight,
  };
  const normalizedLayout = normalizeLayout(widget.id, widget.layout, fallback, isRootWidget ? ROOT_CANVAS_COLS : undefined);
  const targetWidth = isRootWidget
    ? Math.min(ROOT_CANVAS_COLS, Math.max(minWidth, Math.round(normalizedLayout.w)))
    : Math.max(minWidth, Math.round(normalizedLayout.w));
  const targetHeight =
    widget.kind === 'light'
      ? minHeight
      : Math.max(minHeight, Math.round(normalizedLayout.h));
  const maxX = isRootWidget ? Math.max(0, ROOT_CANVAS_COLS - targetWidth) : Number.POSITIVE_INFINITY;
  const { sensorDisplayPrecision: _storedSensorDisplayPrecision, ...widgetWithoutSensorDisplayPrecision } = widget;
  const sensorDisplayPrecision =
    widget.kind === 'sensor'
      ? normalizeSensorDisplayPrecision(widget.sensorDisplayPrecision)
      : undefined;

  return {
    ...widgetWithoutSensorDisplayPrecision,
    dataSource: widget.dataSource === 'mock' ? 'mock' : 'ha',
    ...(sensorDisplayPrecision !== undefined ? { sensorDisplayPrecision } : null),
    layout: {
      ...normalizedLayout,
      x: Math.min(normalizedLayout.x, maxX),
      w: targetWidth,
      h: targetHeight,
    },
  };
}

function safeParse(raw: string | null): StoredLayout | null {
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as StoredLayout;
  } catch {
    return null;
  }
}

export function loadDashboardLayout(runtimeMode: DashboardRuntimeMode = 'real'): {
  sections: DashboardSection[];
  widgets: Widget[];
  widgetTypeLayoutOverrides: WidgetTypeLayoutOverrides;
  widgetLayoutOverrides: WidgetLayoutOverrides;
  responsiveLayouts: DashboardResponsiveLayouts;
} {
  const initial = getInitialDashboardFixtures(runtimeMode);
  if (typeof window === 'undefined') {
    return {
      sections: initial.sections,
      widgets: initial.widgets,
      widgetTypeLayoutOverrides: {},
      widgetLayoutOverrides: {},
      responsiveLayouts: initial.responsiveLayouts,
    };
  }

  const parsed = safeParse(window.localStorage.getItem(getDashboardLayoutStorageKey(runtimeMode)));
  if (!parsed) {
    return {
      sections: initial.sections,
      widgets: initial.widgets,
      widgetTypeLayoutOverrides: {},
      widgetLayoutOverrides: {},
      responsiveLayouts: initial.responsiveLayouts,
    };
  }
  const migratedV2 = parsed.version === 1 ? migrateStoredLayoutV1ToV2(parsed) : parsed;
  const migratedV3 = migratedV2.version === 2 ? migrateStoredLayoutV2ToV3(migratedV2) : migratedV2;
  const migratedV4 = migratedV3.version === 3 ? migrateStoredLayoutV3ToV4(migratedV3) : migratedV3;
  const migratedV5 = migratedV4.version === 4 ? migrateStoredLayoutV4ToV5(migratedV4) : migratedV4;
  const migratedV6 = migratedV5.version === 5 ? migrateStoredLayoutV5ToV6(migratedV5) : migratedV5;
  const migratedV7 = migratedV6.version === 6 ? migrateStoredLayoutV6ToV7(migratedV6) : migratedV6;
  const migratedV8 = migratedV7.version === 7 ? migrateStoredLayoutV7ToV8(migratedV7) : migratedV7;
  const migratedV9 = migratedV8.version === 8 ? migrateStoredLayoutV8ToV9(migratedV8) : migratedV8;
  const migratedV10 = migratedV9.version === 9 ? migrateStoredLayoutV9ToV10(migratedV9) : migratedV9;
  const migratedV11 = migratedV10.version === 10 ? migrateStoredLayoutV10ToV11(migratedV10) : migratedV10;
  const migratedV12 = migratedV11.version === 11 ? migrateStoredLayoutV11ToV12(migratedV11) : migratedV11;
  const migratedV13 = migratedV12.version === 12 ? migrateStoredLayoutV12ToV13(migratedV12) : migratedV12;
  const hydrated = migratedV13.version === 13 ? migrateStoredLayoutV13ToV14(migratedV13) : migratedV13;
  if (hydrated.version !== STORAGE_VERSION) {
    return {
      sections: initial.sections,
      widgets: initial.widgets,
      widgetTypeLayoutOverrides: {},
      widgetLayoutOverrides: {},
      responsiveLayouts: initial.responsiveLayouts,
    };
  }

  const rawSections = Array.isArray(hydrated.sections) ? hydrated.sections : [];
  const rawWidgets = Array.isArray(hydrated.widgets) ? hydrated.widgets : [];

  const sections = rawSections
    .filter((section) => section && VALID_SECTION_KINDS.includes(section.kind))
    .map((section, index) => normalizeSection(section, index));

  const sectionById = new Map(sections.map((section) => [section.id, section]));
  const normalizedWidgets = rawWidgets
    .filter((widget) => widget && VALID_WIDGET_KINDS.includes(widget.kind))
    .map((widget, index) => {
      const parentSection =
        typeof widget.parentSectionId === 'string' ? sectionById.get(widget.parentSectionId) : undefined;
      const isRootWidget = !parentSection;
      const next = normalizeWidget(hydrateWidgetRuntimeDefaults(widget), index, isRootWidget, parentSection);
      return {
        ...next,
        parentSectionId: isRootWidget ? undefined : parentSection?.id,
      };
    });
  if (runtimeMode === 'real') {
    migrateLegacyWidgetSecretsFromWidgets(normalizedWidgets, window.localStorage);
  }
  const widgetsWithSecrets =
    runtimeMode === 'real'
      ? mergeWidgetSecretsIntoWidgets(normalizedWidgets, window.localStorage)
      : stripWidgetSecretsFromWidgets(normalizedWidgets);
  const widgets = normalizeWidgetsForRuntime(widgetsWithSecrets, runtimeMode);

  if (!sections.length && !widgets.length && hydrated.emptyIntentional !== true) {
    return {
      sections: initial.sections,
      widgets: initial.widgets,
      widgetTypeLayoutOverrides: {},
      widgetLayoutOverrides: {},
      responsiveLayouts: initial.responsiveLayouts,
    };
  }

  const responsiveLayouts = normalizeResponsiveLayouts(hydrated.responsiveLayouts);
  return {
    sections,
    widgets,
    widgetTypeLayoutOverrides: normalizeWidgetTypeLayoutOverrides(hydrated.widgetTypeLayoutOverrides),
    widgetLayoutOverrides: normalizeWidgetLayoutOverrides(hydrated.widgetLayoutOverrides),
    responsiveLayouts:
      responsiveLayouts.root || responsiveLayouts.stacks
        ? responsiveLayouts
        : createInitialResponsiveLayouts(sections, widgets),
  };
}

export function saveDashboardLayout(
  sections: DashboardSection[],
  widgets: Widget[],
  widgetTypeLayoutOverrides: WidgetTypeLayoutOverrides = {},
  responsiveLayouts: DashboardResponsiveLayouts = {},
  widgetLayoutOverrides: WidgetLayoutOverrides = {},
  runtimeMode: DashboardRuntimeMode = 'real',
): DashboardLayoutSaveResult {
  const attemptedAt = Date.now();
  if (typeof window === 'undefined') {
    return {
      ok: false,
      attemptedAt,
      code: 'storage_unavailable',
    };
  }

  const payload: StoredLayout = {
    version: STORAGE_VERSION,
    sections,
    widgets: stripWidgetSecretsFromWidgets(
      widgets.map((widget) => stripWidgetRuntimeState(widget, true)),
    ),
    emptyIntentional: sections.length === 0 && widgets.length === 0,
    widgetTypeLayoutOverrides: normalizeWidgetTypeLayoutOverrides(widgetTypeLayoutOverrides),
    widgetLayoutOverrides: normalizeWidgetLayoutOverrides(widgetLayoutOverrides),
    responsiveLayouts: normalizeResponsiveLayouts(responsiveLayouts),
  };

  const storageKey = getDashboardLayoutStorageKey(runtimeMode);

  try {
    if (runtimeMode === 'real') {
      persistWidgetSecretsFromWidgets(widgets, window.localStorage);
    }
    const serializedPayload = JSON.stringify(payload);
    window.localStorage.setItem(storageKey, serializedPayload);
    return {
      ok: true,
      savedAt: Date.now(),
      storageKey,
      bytes: new Blob([serializedPayload]).size,
    };
  } catch (error) {
    return {
      ok: false,
      attemptedAt,
      code: classifyDashboardStorageError(error),
    };
  }
}

export function clearDashboardLayout(runtimeMode: DashboardRuntimeMode = 'real') {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.removeItem(getDashboardLayoutStorageKey(runtimeMode));
}
