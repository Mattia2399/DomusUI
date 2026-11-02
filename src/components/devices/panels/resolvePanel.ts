import type { DeviceKind } from '../model/entityKind';
import type { SensorFamily } from '../model/sensorFamily';

/*
 * The one place that says which panel a card opens: the kind of the card and,
 * for a sensor, its family. A kind without a card has no panel.
 */

export type PanelId =
  | 'light'
  | 'climate'
  | 'device'
  | 'security'
  | 'camera'
  | 'media'
  | 'sensor'
  | 'alarm'
  | 'vacuum'
  | 'calendar'
  | 'members'
  | 'none';

export type ResolvedPanel = { panel: PanelId; family: SensorFamily | null };

const PANEL_BY_KIND: Partial<Record<DeviceKind, PanelId>> = {
  light: 'light',
  climate: 'climate',
  switch: 'device',
  fan: 'device',
  humidifier: 'device',
  cover: 'device',
  lock: 'security',
  camera: 'camera',
  media: 'media',
  sensor: 'sensor',
  binary: 'sensor',
  alarm: 'alarm',
  vacuum: 'vacuum',
  calendar: 'calendar',
  members: 'members',
};

// A sensor that says nothing of itself is an "other measure"; a yes/no, a device state.
const DEFAULT_FAMILY: Partial<Record<DeviceKind, SensorFamily>> = { sensor: 'measure', binary: 'device' };

export function resolvePanel(kind: DeviceKind, family?: SensorFamily | null): ResolvedPanel {
  const panel = PANEL_BY_KIND[kind] ?? 'none';
  return { panel, family: panel === 'sensor' ? family ?? DEFAULT_FAMILY[kind] ?? null : null };
}
