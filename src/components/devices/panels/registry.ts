import type React from 'react';
import type { DeviceModel } from '../model/device';
import type { PanelFooterProps } from './shell/PanelFooter';
import type { PanelAccent } from './shell/PanelShell';

/*
 * The one place that says what a panel of each device is made of: its protagonist,
 * its shortcuts, the groups of the dialog and its main action. PanelView is the only
 * component that draws them. A new device is a new entry, not a new component.
 *
 * The entries load on request: a panel weighs nothing until its device is opened.
 */

/** What stands in the middle of the panel. */
export type PanelHeroKind = 'slider' | 'disc' | 'value' | 'data' | 'cover';

/** Where a control is being drawn: the zone of 148 px on a phone, or a group of the dialog. */
export type PanelPlace = 'zone' | 'group';

type ItemCommon = {
  key: string;
  icon: React.ReactNode;
  /** The name under the shortcut, of one word. */
  label: string;
  /** The longer name, over its controls and in its group. */
  title?: string;
  /** What it is set to now, beside the title. */
  value?: React.ReactNode;
  /** One line under the controls. */
  note?: React.ReactNode;
  /** The icon of its group takes the colour of the device: it is in use. */
  lit?: boolean;
};

/** Opens its controls in place of the row. */
export type PanelOpensItem = ItemCommon & {
  kind: 'opens';
  content: (place: PanelPlace) => React.ReactNode;
  /** Takes the place of the protagonist while it is open, in one column: the colour disc. */
  hero?: React.ReactNode;
  /** The group of the dialog says it differently from the zone. */
  group?: React.ReactNode;
  /** At the end of the title of its group: what the zone keeps among the controls. */
  groupTrailing?: React.ReactNode;
};

/** Switches something at once, and lights up while it is on. */
export type PanelToggleItem = ItemCommon & {
  kind: 'toggle';
  on: boolean;
  onPress: () => void;
};

/** Does something at once. In the dialog it is a button, with its own words. */
export type PanelActionItem = ItemCommon & {
  kind: 'action';
  on?: boolean;
  actionLabel: string;
  onPress: () => void;
};

export type PanelItem = PanelOpensItem | PanelToggleItem | PanelActionItem;

export type PanelSpec = {
  /** What a screen left open belongs to: the column of the Home changes device without closing. */
  owner: string;
  name: string;
  status: React.ReactNode;
  icon: React.ReactNode;
  lit: boolean;
  accent: PanelAccent;
  /** A sheet or a dialog takes the colour of the device. */
  tint: boolean;
  heroKind: PanelHeroKind;
  hero: React.ReactNode;
  shortcuts: readonly PanelItem[];
  /** The controls always in view, in place of the shortcuts: the position of a cover. */
  always?: React.ReactNode;
  /** The groups of the dialog, when they are not the shortcuts. */
  groups?: readonly PanelItem[];
  /** Asks in place of the row, before something that cannot wait for a second thought. */
  confirm?: React.ReactNode;
  /** Power, Stop, Play, or nothing at all. */
  action?: PanelFooterProps['action'];
};

export type PanelEntry<Input> = {
  useSpec: (input: Input) => PanelSpec;
};

export type PanelKind = 'light' | 'plug' | 'fan' | 'humidifier' | 'cover' | 'climate';

/** The panel of a device that is not a light. */
export const panelKindOfDevice = (kind: DeviceModel['kind']): PanelKind => (kind === 'fan' || kind === 'humidifier' || kind === 'cover' ? kind : 'plug');

/* eslint-disable @typescript-eslint/no-explicit-any */
const LOADERS: Record<PanelKind, () => Promise<PanelEntry<any>>> = {
  light: () => import('./entries/light').then((module) => module.lightEntry),
  plug: () => import('./entries/device').then((module) => module.plugEntry),
  fan: () => import('./entries/device').then((module) => module.fanEntry),
  humidifier: () => import('./entries/device').then((module) => module.humidifierEntry),
  cover: () => import('./entries/device').then((module) => module.coverEntry),
  climate: () => import('./entries/climate').then((module) => module.climateEntry),
};

/** The empty protagonist a panel opens with, while its entry is on its way. */
const SKELETON: Record<PanelKind, 'slider' | 'card'> = { light: 'slider', plug: 'card', fan: 'slider', humidifier: 'slider', cover: 'slider', climate: 'slider' };

export const panelSkeletonOf = (kind: PanelKind) => SKELETON[kind];

const arrived = new Map<PanelKind, PanelEntry<any>>();

/** The entry of a kind, when its code is already here. */
export const loadedPanelEntry = (kind: PanelKind) => arrived.get(kind);

export function loadPanelEntry(kind: PanelKind) {
  return LOADERS[kind]().then((entry) => {
    arrived.set(kind, entry);
    return entry;
  });
}
