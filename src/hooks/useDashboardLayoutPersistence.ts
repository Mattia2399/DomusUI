import { useCallback, useEffect, useRef, useState } from 'react';
import type { DashboardSection, Widget } from '../types/dashboardModels';
import type {
  DashboardResponsiveLayouts,
  WidgetLayoutOverrides,
  WidgetTypeLayoutOverrides,
} from '../types/widgetTypeLayout';
import type { DashboardRuntimeMode } from '../security/dashboardAccess';
import type { DashboardLayoutEngine } from '../services/dashboardConfigurationRepository';
import {
  saveDashboardLayout,
  type DashboardLayoutSaveErrorCode,
  type DashboardLayoutSaveResult,
} from '../services/dashboardStorage';

export type DashboardLayoutSaveStatus =
  | { phase: 'idle' }
  | { phase: 'dirty' }
  | { phase: 'saving' }
  | { phase: 'saved'; savedAt: number }
  | { phase: 'error'; attemptedAt: number; code: DashboardLayoutSaveErrorCode };

type DashboardLayoutPersistenceInput = {
  enabled: boolean;
  runtimeMode: DashboardRuntimeMode | null;
  sections: DashboardSection[];
  widgets: Widget[];
  widgetTypeLayoutOverrides: WidgetTypeLayoutOverrides;
  responsiveLayouts: DashboardResponsiveLayouts;
  widgetLayoutOverrides: WidgetLayoutOverrides;
  layoutEngine?: DashboardLayoutEngine;
  debounceMs?: number;
};

function statusFromSaveResult(result: DashboardLayoutSaveResult): DashboardLayoutSaveStatus {
  if (result.ok === true) {
    return { phase: 'saved', savedAt: result.savedAt };
  }
  return { phase: 'error', attemptedAt: result.attemptedAt, code: result.code };
}

export function useDashboardLayoutPersistence({
  enabled,
  runtimeMode,
  sections,
  widgets,
  widgetTypeLayoutOverrides,
  responsiveLayouts,
  widgetLayoutOverrides,
  layoutEngine,
  debounceMs = 220,
}: DashboardLayoutPersistenceInput) {
  const [status, setStatus] = useState<DashboardLayoutSaveStatus>({ phase: 'idle' });
  const saveSequenceRef = useRef(0);
  const pendingSaveTimeoutRef = useRef<number | null>(null);

  const saveNow = useCallback((): DashboardLayoutSaveResult => {
    if (pendingSaveTimeoutRef.current !== null) {
      window.clearTimeout(pendingSaveTimeoutRef.current);
      pendingSaveTimeoutRef.current = null;
    }
    const sequence = ++saveSequenceRef.current;
    setStatus({ phase: 'saving' });

    if (runtimeMode === null) {
      const result: DashboardLayoutSaveResult = {
        ok: false,
        attemptedAt: Date.now(),
        code: 'storage_unavailable',
      };
      setStatus(statusFromSaveResult(result));
      return result;
    }

    const result = saveDashboardLayout(
      sections,
      widgets,
      widgetTypeLayoutOverrides,
      responsiveLayouts,
      widgetLayoutOverrides,
      runtimeMode,
      layoutEngine,
    );

    if (sequence === saveSequenceRef.current) {
      setStatus(statusFromSaveResult(result));
    }
    return result;
  }, [layoutEngine, responsiveLayouts, runtimeMode, sections, widgetLayoutOverrides, widgetTypeLayoutOverrides, widgets]);

  useEffect(() => {
    if (!enabled || runtimeMode === null) {
      return;
    }

    const sequence = ++saveSequenceRef.current;
    setStatus({ phase: 'saving' });
    const timeoutId = window.setTimeout(() => {
      pendingSaveTimeoutRef.current = null;
      const result = saveDashboardLayout(
        sections,
        widgets,
        widgetTypeLayoutOverrides,
        responsiveLayouts,
        widgetLayoutOverrides,
        runtimeMode,
        layoutEngine,
      );
      if (sequence !== saveSequenceRef.current) {
        return;
      }
      setStatus(statusFromSaveResult(result));
    }, debounceMs);
    pendingSaveTimeoutRef.current = timeoutId;

    return () => {
      window.clearTimeout(timeoutId);
      if (pendingSaveTimeoutRef.current === timeoutId) {
        pendingSaveTimeoutRef.current = null;
      }
    };
  }, [
    debounceMs,
    enabled,
    layoutEngine,
    responsiveLayouts,
    runtimeMode,
    sections,
    widgetLayoutOverrides,
    widgetTypeLayoutOverrides,
    widgets,
  ]);

  return { status, saveNow };
}
