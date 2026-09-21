import type { DashboardRuntimeMode } from '../security/dashboardAccess';
import {
  type DashboardSection,
  type Widget,
  type WidgetKind,
} from '../types/dashboardModels';
import { createStarterDashboardTemplate } from '../templates/starterDashboardTemplate';
import type { DashboardResponsiveLayouts } from '../types/widgetTypeLayout';

/**
 * All dashboard fixtures that are allowed to appear without Home Assistant
 * data live here. Real mode must never consume these values.
 */
export const DEMO_ENTITY_OPTIONS: Record<WidgetKind, string[]> = {
  light: ['light.living_room_lamp'],
  switch: ['switch.kitchen_outlet', 'switch.garden_lights', 'input_boolean.guest_mode'],
  fan: ['fan.demo_breeze'],
  humidifier: ['humidifier.demo_bedroom'],
  climate: ['climate.air_conditioner', 'climate.living_room'],
  camera: ['camera.front_door', 'camera.garage'],
  sensor: ['sensor.nest_wifi_download', 'sensor.living_room_humidity'],
  media: [
    'media_player.living_room_tv',
    'media_player.kitchen_speaker',
    'media_player.max_compat_media_player',
    'media_player.max_compat_paused',
    'media_player.max_compat_idle',
    'media_player.max_compat_buffering',
    'media_player.max_compat_on',
    'media_player.max_compat_off',
    'media_player.max_compat_unavailable',
    'media_player.max_compat_standby',
  ],
  alarm: ['alarm_control_panel.home_alarm'],
  vacuum: [
    'vacuum.demo_robot',
    'vacuum.demo_robot_cleaning',
    'vacuum.demo_robot_paused',
    'vacuum.demo_robot_returning',
    'vacuum.demo_robot_idle',
    'vacuum.demo_robot_error',
    'vacuum.demo_robot_unavailable',
    'vacuum.roborock_s8',
    'vacuum.living_room_robot',
  ],
  lock: [
    'lock.front_door',
    'lock.garage_entry',
    'lock.max_compat_locked',
    'lock.max_compat_unlocked',
    'lock.max_compat_locking',
    'lock.max_compat_unlocking',
    'lock.max_compat_open',
    'lock.max_compat_opening',
    'lock.max_compat_jammed',
    'lock.max_compat_unavailable',
    'lock.max_compat_unknown',
  ],
  cover: [
    'cover.living_room_shutter',
    'cover.kitchen_blind',
    'cover.bedroom_curtain',
    'cover.patio_awning',
    'cover.bedroom_shade',
    'cover.air_damper',
    'cover.front_door',
    'cover.garage_door',
    'cover.driveway_gate',
    'cover.office_window',
    'cover.max_compat_cover',
    'cover.max_compat_opening',
    'cover.max_compat_closing',
    'cover.max_compat_closed',
    'cover.max_compat_stopped',
    'cover.max_compat_unavailable',
    'cover.max_compat_unknown',
  ],
  members: ['group.house_members'],
};

export const EMPTY_ENTITY_OPTIONS: Record<WidgetKind, string[]> = {
  light: [],
  switch: [],
  fan: [],
  humidifier: [],
  climate: [],
  camera: [],
  sensor: [],
  media: [],
  alarm: [],
  vacuum: [],
  lock: [],
  cover: [],
  members: [],
};

const DEMO_STARTER_TEMPLATE = createStarterDashboardTemplate('demo');

export const DEMO_INITIAL_WIDGETS: Widget[] = DEMO_STARTER_TEMPLATE.widgets;

export const DEMO_INITIAL_SECTIONS: DashboardSection[] = DEMO_STARTER_TEMPLATE.sections;

export function getEntityOptionsForRuntime(runtimeMode: DashboardRuntimeMode) {
  return runtimeMode === 'demo' ? DEMO_ENTITY_OPTIONS : EMPTY_ENTITY_OPTIONS;
}

export function getInitialDashboardFixtures(runtimeMode: DashboardRuntimeMode): {
  sections: DashboardSection[];
  widgets: Widget[];
  responsiveLayouts: DashboardResponsiveLayouts;
} {
  if (runtimeMode === 'demo') {
    const template = createStarterDashboardTemplate('demo');
    return {
      sections: DEMO_INITIAL_SECTIONS.map((section) => ({ ...section, layout: { ...section.layout } })),
      widgets: DEMO_INITIAL_WIDGETS.map((widget) => ({ ...widget, layout: { ...widget.layout } })),
      responsiveLayouts: template.responsiveLayouts,
    };
  }
  return { sections: [], widgets: [], responsiveLayouts: {} };
}

export function normalizeWidgetsForRuntime(
  widgets: readonly Widget[],
  runtimeMode: DashboardRuntimeMode,
): Widget[] {
  const migratedWidgets = widgets.map((widget) => {
    const entityId = widget.entityId.trim().toLowerCase();
    const kind = widget.kind === 'switch' && entityId.startsWith('fan.')
      ? 'fan' as const
      : widget.kind === 'climate' && entityId.startsWith('humidifier.')
        ? 'humidifier' as const
        : widget.kind;
    return { ...widget, kind };
  });
  if (runtimeMode === 'demo') {
    return migratedWidgets;
  }
  // Old beta layouts could contain cards tagged as mock. Preserve their
  // placement/configuration, but make Home Assistant the only real authority.
  return migratedWidgets.map((widget) => ({ ...widget, dataSource: 'ha' as const }));
}
