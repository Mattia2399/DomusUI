import type React from 'react';
import { onceLoaded } from '../../common/onceLoaded';
import type { DeviceModel } from '../model/device';
import type { PanelMainAction } from './shell/PanelHeader';
import type { PanelAccent } from './shell/PanelShell';

/*
 * The one place that says what a panel of each device is made of: its protagonist,
 * its shortcuts, the groups of the dialog and its main action. PanelView is the only
 * component that draws them. A new device is a new entry, not a new component.
 *
 * The entries load on request: a panel weighs nothing until its device is opened.
 */

/** What stands in the middle of the panel. */
export type PanelHeroKind = 'slider' | 'disc' | 'value' | 'data' | 'cover' | 'fill' | 'control';

/** A page an entry opens by itself: the details of a person, the form of an event, all the rows. */
export type PanelSpecPage = {
  title: string;
  sub?: React.ReactNode;
  content: React.ReactNode;
  onBack: () => void;
  /** Only where the groups cannot say it: on a phone. */
  phoneOnly?: boolean;
};

/*
 * A control of a device: what it is, and how it draws itself in each look it can take.
 * Where it stands, which look it takes and in what order do not come from here: they
 * come from arrangeControls, the one place that will read what the user chooses.
 */
export type PanelLook = 'action' | 'tiles' | 'list' | 'levels' | 'slider' | 'whites' | 'color' | 'timer' | 'chart' | 'rows' | 'image' | 'pad';
export type PanelPlace = 'main' | 'more' | 'hidden';

type ControlCommon = {
  id: string;
  icon: React.ReactNode;
  /** The name under the shortcut. */
  label: string;
  /** What assistive technology says, when the name alone is too short. */
  ariaLabel?: string;
  /** The longer name, over its group. */
  title?: string;
  /** What it is set to now. */
  value?: React.ReactNode;
  /** One line of explanation in its group. */
  note?: React.ReactNode;
  /** It cannot do this now: a robot already at its base. */
  disabled?: boolean;
  /** It is in use: a timer running. */
  lit?: boolean;
  /** Where it would stand with no one choosing: for a control the registry cannot name, as those of an integration. */
  place?: PanelPlace;
  /** The small word under its name in Altro, when the look does not say it. */
  kindName?: string;
};

/** It acts at once, and has no large version. */
export type PanelActionControl = ControlCommon & {
  onPress: () => void;
  on?: boolean;
  /** The words of its button in a group. Without them it is a switch. */
  actionLabel?: string;
};

/** It takes the place of the protagonist, at full size. */
export type PanelBigControl = ControlCommon & {
  /** The looks it can take, the first one when no other is asked. */
  looks: readonly Exclude<PanelLook, 'action'>[];
  big: (look: PanelLook) => React.ReactNode;
  /** Its version in a group: a segmented control, chips, a bar. */
  group: React.ReactNode;
  groupTrailing?: React.ReactNode;
};

export type PanelControl = PanelActionControl | PanelBigControl;

export const isActionControl = (control: PanelControl): control is PanelActionControl => 'onPress' in control;

export type PanelSpec = {
  /** What a screen left open belongs to: the column of the Home changes device without closing. */
  owner: string;
  name: string;
  status: React.ReactNode;
  accent: PanelAccent;
  /** A sheet or a dialog takes the colour of the device. */
  tint: boolean;
  heroKind: PanelHeroKind;
  hero: React.ReactNode;
  /** The protagonist with its value, on the pill that goes back to it: "Luminosità 72%". */
  heroName?: string;
  /** The name of its row of defaults in PANEL_CONTROLS. */
  layout?: PanelLayoutName;
  /** Its controls, in any order: arrangeControls says which goes where. */
  controls?: readonly PanelControl[];
  /** A device with no row on a phone, as a cover: its controls are only groups elsewhere. */
  noRow?: boolean;
  /** Under the protagonist and always in view: the positions of a cover. */
  below?: React.ReactNode;
  /** A page opened by the entry, not by a shortcut. */
  page?: PanelSpecPage;
  /** Asks in place of the protagonist, before something that cannot wait for a second thought. */
  confirm?: React.ReactNode;
  /** What needs the whole body of the panel for a while, as the form of a new event. */
  free?: React.ReactNode;
  /** At the left of the header: power, Stop, Play, +, or nothing at all. */
  action?: PanelMainAction;
};

/*
 * What each device has, with no one choosing: the place and the look of each control,
 * and their order. A control of a device that is not here goes to Altro.
 */
type LayoutRow = { id: string; place: PanelPlace; look?: PanelLook };

export const PANEL_CONTROLS = {
  light: [
    { id: 'whites', place: 'main', look: 'whites' },
    { id: 'color', place: 'main', look: 'color' },
    { id: 'effects', place: 'main', look: 'list' },
    { id: 'timer', place: 'main', look: 'timer' },
    { id: 'white', place: 'more', look: 'slider' },
    { id: 'flash', place: 'more', look: 'action' },
  ],
  plug: [
    { id: 'timer', place: 'main', look: 'timer' },
    { id: 'protect', place: 'main', look: 'action' },
  ],
  climate: [
    { id: 'modes', place: 'main', look: 'tiles' },
    { id: 'fan', place: 'main', look: 'levels' },
    { id: 'preset', place: 'main', look: 'list' },
    { id: 'align', place: 'main', look: 'action' },
    { id: 'swing', place: 'more', look: 'list' },
    { id: 'humidity', place: 'more', look: 'slider' },
  ],
  stove: [
    { id: 'modes', place: 'main', look: 'tiles' },
    { id: 'fan', place: 'main', look: 'levels' },
    { id: 'align', place: 'main', look: 'action' },
    { id: 'preset', place: 'more', look: 'list' },
    { id: 'swing', place: 'more', look: 'list' },
    { id: 'humidity', place: 'more', look: 'slider' },
  ],
  fan: [
    { id: 'modes', place: 'main', look: 'tiles' },
    { id: 'oscillate', place: 'main', look: 'action' },
    { id: 'direction', place: 'main', look: 'action' },
    { id: 'timer', place: 'main', look: 'timer' },
  ],
  humidifier: [
    { id: 'modes', place: 'main', look: 'tiles' },
    { id: 'timer', place: 'main', look: 'timer' },
  ],
  cover: [
    { id: 'position', place: 'main' },
    { id: 'tilt', place: 'main' },
  ],
  camera: [
    { id: 'events', place: 'main', look: 'rows' },
    { id: 'ptz', place: 'main', look: 'pad' },
    { id: 'info', place: 'more', look: 'rows' },
  ],
  vacuum: [
    { id: 'base', place: 'main', look: 'action' },
    { id: 'suction', place: 'main', look: 'tiles' },
    { id: 'rooms', place: 'main', look: 'list' },
    { id: 'spot', place: 'main', look: 'action' },
    { id: 'map', place: 'main', look: 'image' },
    { id: 'mode', place: 'main', look: 'tiles' },
    { id: 'stop', place: 'more', look: 'action' },
    { id: 'find', place: 'more', look: 'action' },
    { id: 'info', place: 'more', look: 'rows' },
  ],
  calendar: [
    { id: 'week', place: 'main' },
    { id: 'waste', place: 'main' },
  ],
  members: [{ id: 'details', place: 'main' }],
  sensor: [
    { id: 'period', place: 'main', look: 'chart' },
    { id: 'values', place: 'more', look: 'rows' },
    { id: 'block', place: 'more', look: 'rows' },
  ],
} as const satisfies Record<string, readonly LayoutRow[]>;

export type PanelLayoutName = keyof typeof PANEL_CONTROLS;

/** What the user has chosen for a control: nothing yet, until the edit mode writes it. */
export type PanelControlChoice = { place?: PanelPlace; look?: PanelLook; order?: number };

export type ArrangedControl = { control: PanelControl; look: PanelLook };

/** Two rows of four. */
export const MOST_IN_THE_ROW = 8;

/*
 * The one place that says what stands where. In the row at most eight, or seven and
 * Altro. Altro exists when at least two controls are in it, or the row is full: one
 * alone with room left goes up to the row.
 */
export function arrangeControls(
  name: PanelLayoutName | undefined,
  controls: readonly PanelControl[],
  choices: Readonly<Record<string, PanelControlChoice>> = {},
): { main: ArrangedControl[]; more: ArrangedControl[] } {
  const rows: readonly LayoutRow[] = name ? PANEL_CONTROLS[name] : [];
  const orderOf = (control: PanelControl, index: number) => {
    const chosen = choices[control.id]?.order;
    if (chosen !== undefined) return chosen;
    const row = rows.findIndex((entry) => entry.id === control.id);
    return row >= 0 ? row : rows.length + index;
  };
  const placed = controls
    .map((control, index) => ({ control, order: orderOf(control, index) }))
    .sort((first, second) => first.order - second.order)
    .map(({ control }) => {
      const row = rows.find((entry) => entry.id === control.id);
      const wanted = choices[control.id]?.look ?? row?.look;
      const look: PanelLook = isActionControl(control)
        ? 'action'
        : wanted && wanted !== 'action' && control.looks.includes(wanted)
          ? wanted
          : control.looks[0];
      return { control, look, place: choices[control.id]?.place ?? row?.place ?? control.place ?? ('more' as PanelPlace) };
    });
  let main = placed.filter((entry) => entry.place === 'main');
  let more = placed.filter((entry) => entry.place === 'more');
  if (more.length === 1 && main.length < MOST_IN_THE_ROW) {
    main = [...main, ...more];
    more = [];
  }
  if (main.length > MOST_IN_THE_ROW || more.length > 0) {
    more = [...main.slice(MOST_IN_THE_ROW - 1), ...more];
    main = main.slice(0, MOST_IN_THE_ROW - 1);
  }
  const plain = ({ control, look }: ArrangedControl) => ({ control, look });
  return { main: main.map(plain), more: more.map(plain) };
}

export type PanelEntry<Input> = {
  useSpec: (input: Input) => PanelSpec;
};

/** The player has a structure of its own: only its code goes by the rule of the panels. */
export const loadMediaPlayer = onceLoaded(() => import('./MediaPlayer'));

export type PanelKind = 'light' | 'plug' | 'fan' | 'humidifier' | 'cover' | 'climate' | 'camera' | 'vacuum' | 'calendar' | 'members' | 'weather' | 'sensor';

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
  camera: () => import('./entries/camera').then((module) => module.cameraEntry),
  vacuum: () => import('./entries/vacuum').then((module) => module.vacuumEntry),
  calendar: () => import('./entries/calendar').then((module) => module.calendarEntry),
  members: () => import('./entries/members').then((module) => module.membersEntry),
  weather: () => import('./entries/weather').then((module) => module.weatherEntry),
  sensor: () => import('./entries/sensor').then((module) => module.sensorEntry),
};

/** The empty protagonist a panel opens with, while its entry is on its way. */
const SKELETON: Record<PanelKind, 'slider' | 'card'> = { light: 'slider', plug: 'card', fan: 'slider', humidifier: 'slider', cover: 'slider', climate: 'slider', camera: 'card', vacuum: 'card', calendar: 'card', members: 'card', weather: 'card', sensor: 'card' };

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
