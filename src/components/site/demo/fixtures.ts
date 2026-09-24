import type { Widget } from '../../../types/dashboardModels';
import type { MockEntityState } from '../../../types/ha';
import { createVacuumStateMocks, VACUUM_MAX_COMPAT_MOCK_ENTITY_ID } from '../../widgets/vacuumMock';

/**
 * Card fixtures for the presentation site.
 *
 * Every card is a real Domus UI widget definition rendered by the production
 * WidgetCardRenderer. All of them are explicitly `dataSource: 'mock'`, so they
 * can never reach a Home Assistant API.
 */

export type DemoCardId =
  'climate' | 'alarm' | 'light' | 'switch' | 'sensor' | 'lock' | 'camera' | 'media' | 'cover' | 'vacuum';

export const DEMO_WIDGETS: Record<DemoCardId, Widget> = {
  climate: {
    id: 'site.climate',
    kind: 'climate',
    title: 'Clima soggiorno',
    entityId: 'climate.air_conditioner',
    dataSource: 'mock',
    status: 'heat',
    isOn: true,
    value: 22.5,
    unit: 'C',
    layout: { i: 'site.climate', x: 0, y: 0, w: 3, h: 3 },
  },
  alarm: {
    id: 'site.alarm',
    kind: 'alarm',
    title: 'Allarme casa',
    entityId: 'alarm_control_panel.home_alarm',
    dataSource: 'mock',
    status: 'armed_home',
    isOn: true,
    alarmRequireAuthToDisarm: true,
    layout: { i: 'site.alarm', x: 3, y: 0, w: 3, h: 3 },
  },
  light: {
    id: 'site.light',
    kind: 'light',
    title: 'Luce salotto',
    entityId: 'light.living_room_lamp',
    dataSource: 'mock',
    status: 'on',
    isOn: true,
    value: 72,
    unit: '%',
    layout: { i: 'site.light', x: 6, y: 0, w: 2, h: 2 },
  },
  switch: {
    id: 'site.switch',
    kind: 'switch',
    title: 'Presa cucina',
    entityId: 'switch.kitchen_outlet',
    dataSource: 'mock',
    status: 'on',
    isOn: true,
    switchConsumptionEntityId: 'sensor.kitchen_outlet_power',
    layout: { i: 'site.switch', x: 6, y: 2, w: 2, h: 1 },
  },
  sensor: {
    id: 'site.energy',
    kind: 'sensor',
    title: 'Energia casa',
    entityId: 'sensor.home_power',
    dataSource: 'mock',
    status: 'tracking',
    isOn: true,
    value: 420,
    unit: 'W',
    sensorDisplayPrecision: 0,
    layout: { i: 'site.energy', x: 8, y: 0, w: 2, h: 3 },
  },
  lock: {
    id: 'site.lock',
    kind: 'lock',
    title: 'Porta ingresso',
    entityId: 'lock.front_door',
    dataSource: 'mock',
    status: 'locked',
    isOn: true,
    lockRequireAuthToUnlock: true,
    layout: { i: 'site.lock', x: 10, y: 0, w: 2, h: 3 },
  },
  camera: {
    id: 'site.camera',
    kind: 'camera',
    title: 'Giardino',
    entityId: 'camera.garden',
    dataSource: 'mock',
    status: 'streaming',
    isOn: true,
    layout: { i: 'site.camera', x: 0, y: 3, w: 4, h: 3 },
  },
  media: {
    id: 'site.media',
    kind: 'media',
    title: 'Soggiorno',
    entityId: 'media_player.living_room',
    dataSource: 'mock',
    status: 'playing',
    isOn: true,
    layout: { i: 'site.media', x: 4, y: 3, w: 2, h: 3 },
  },
  cover: {
    id: 'site.cover',
    kind: 'cover',
    title: 'Tenda soggiorno',
    entityId: 'cover.living_room',
    dataSource: 'mock',
    status: 'open',
    isOn: true,
    layout: { i: 'site.cover', x: 6, y: 3, w: 2, h: 3 },
  },
  vacuum: {
    id: 'site.vacuum',
    kind: 'vacuum',
    title: 'Robot aspirapolvere',
    entityId: VACUUM_MAX_COMPAT_MOCK_ENTITY_ID,
    dataSource: 'mock',
    status: 'docked',
    isOn: false,
    layout: { i: 'site.vacuum', x: 8, y: 3, w: 4, h: 3 },
  },
};

/** Abstract album artwork (inline SVG: no external request, CSP-safe). */
export const MEDIA_ARTWORK = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs><radialGradient id="a" cx="30%" cy="25%" r="80%"><stop offset="0" stop-color="#9fd0ff"/><stop offset=".45" stop-color="#1768d5"/><stop offset="1" stop-color="#050b1c"/></radialGradient><radialGradient id="b" cx="80%" cy="85%" r="55%"><stop offset="0" stop-color="#ff9a4d" stop-opacity=".85"/><stop offset="1" stop-color="#ff9a4d" stop-opacity="0"/></radialGradient></defs><rect width="400" height="400" fill="url(#a)"/><rect width="400" height="400" fill="url(#b)"/><circle cx="200" cy="200" r="118" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="2"/><circle cx="200" cy="200" r="64" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="2"/></svg>`,
)}`;

export const MEDIA_DURATION_SECONDS = 252;

export const SENSOR_HISTORY = [300, 336, 318, 372, 410, 388, 402, 420];

export const STATIC_ENTITIES = {
  sensor: {
    state: '420',
    numericValue: 420,
    unit: 'W',
    rawAttributes: { device_class: 'power', friendly_name: 'Energia casa', min: 0, max: 900 },
  },
  vacuum: createVacuumStateMocks()[VACUUM_MAX_COMPAT_MOCK_ENTITY_ID],
} satisfies Record<string, MockEntityState>;
