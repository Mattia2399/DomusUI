import React from 'react';
import { GlassButton } from '../ui/GlassButton';
import { GlassSwitch } from '../ui/GlassSwitch';
import type { PanelEntry, PanelKind, PanelLayoutName, PanelSpec } from '../devices/panels/registry';
import type { PanelKit } from './panelKit';
import type { MockEntityStateMap } from '../../types/ha';
import type { Widget } from '../../types/dashboardModels';
import type { DeviceControlInfo } from './controlsModel';

/*
 * The controls of the device, read from its real panel: the same entry draws it, from the
 * states alone and with its commands going nowhere. The entry builds that input itself, so
 * that the edit mode carries no code of the devices. The kinds whose panel needs more than
 * the states have their list.
 */

/** The panel each kind of card opens. */
const PANEL_OF_CARD: Partial<Record<Widget['kind'], PanelKind>> = { light: 'light', climate: 'climate', switch: 'plug', fan: 'fan', humidifier: 'humidifier', cover: 'cover', sensor: 'sensor' };

export const panelKindOfCard = (kind: Widget['kind']) => PANEL_OF_CARD[kind] ?? null;

/** The input of the panel of a card, once its entry is here. */
export function panelInputOf(kind: PanelKind, entry: PanelEntry<unknown>, widget: Widget, states: MockEntityStateMap): unknown {
  if (kind === 'sensor') return { entityId: widget.entityId, name: widget.title, haStates: states, fallbackEntity: states[widget.entityId] };
  return entry.previewOf?.(widget.entityId, states) ?? null;
}

/** The kinds whose list comes from their row of defaults, without their real panel. */
const LISTED: Partial<Record<Widget['kind'], PanelLayoutName>> = { camera: 'camera', vacuum: 'vacuum', calendar: 'calendar', members: 'members' };

export type DeviceControls = { layout?: PanelLayoutName; controls: DeviceControlInfo[]; ready: boolean };

export function listedControlsOf(kit: Pick<PanelKit, 'PANEL_CONTROLS'>, kind: Widget['kind'], nameOf: (id: string) => string): DeviceControls | null {
  const layout = LISTED[kind];
  if (!layout) return null;
  return {
    layout,
    ready: true,
    controls: kit.PANEL_CONTROLS[layout].map((row) => {
      const look = 'look' in row && row.look ? row.look : 'rows';
      return { id: row.id, name: nameOf(row.id), looks: look === 'action' ? [] : [look], action: look === 'action', place: row.place };
    }),
  };
}

/** The control in its group, as PanelView draws it: its own form, a button, or a switch. */
function previewOf(control: PanelSpec['controls'] extends readonly (infer C)[] | undefined ? C : never): React.ReactNode {
  if (!('onPress' in control)) return control.group;
  if (control.group !== undefined) return control.group;
  if (control.actionLabel) return <GlassButton variant="soft">{control.actionLabel}</GlassButton>;
  return <GlassSwitch label={`${control.title ?? control.label}`} size="mini" checked={Boolean(control.on)} onChange={() => undefined} />;
}

export const controlsOfSpec = (spec: PanelSpec): DeviceControls => ({
  layout: spec.layout,
  ready: true,
  controls: (spec.controls ?? []).map((control) => ({
    id: control.id,
    name: `${control.title ?? control.label}`,
    icon: control.icon,
    preview: previewOf(control),
    looks: 'onPress' in control ? [] : control.looks,
    action: 'onPress' in control,
    place: control.place,
  })),
});

/* Reads the spec of the entry and says when its controls change. */
function SpecReader({ kit, entry, input, onRead }: { kit: PanelKit; entry: PanelEntry<unknown>; input: unknown; onRead: (controls: DeviceControls) => void }) {
  const read = controlsOfSpec(entry.useSpec(input));
  const signature = `${read.layout}|${read.controls.map((control) => `${control.id}:${control.name}:${control.looks.join(',')}`).join(';')}`;
  const latest = React.useRef(read);
  latest.current = read;
  React.useEffect(() => onRead(latest.current), [signature, onRead]);
  return null;
}

/** The controls of the device of a card, and its panel to draw; empty while the entry arrives. */
export function useDeviceControls(kit: PanelKit | null, widget: Widget, states: MockEntityStateMap, nameOf: (id: string) => string) {
  const kind = panelKindOfCard(widget.kind);
  const [entry, setEntry] = React.useState<{ kind: PanelKind; entry: PanelEntry<unknown> } | null>(null);
  const [read, setRead] = React.useState<DeviceControls>({ controls: [], ready: false });
  React.useEffect(() => {
    setRead({ controls: [], ready: false });
    if (!kind || !kit) return undefined;
    let live = true;
    void kit
      .loadPanelEntry(kind)
      .then((loaded) => live && setEntry({ kind, entry: loaded }))
      .catch(() => live && setRead({ controls: [], ready: true }));
    return () => {
      live = false;
    };
  }, [kind, kit, widget.id]);
  const current = entry && entry.kind === kind ? entry.entry : null;
  const input = kind && current ? panelInputOf(kind, current, widget, states) : null;
  const panel = kind && input ? { kind, input } : null;
  const listed = kit ? listedControlsOf(kit, widget.kind, nameOf) ?? (kind ? null : { controls: [], ready: true }) : null;
  const reader = kit && panel && current ? <SpecReader key={kind} kit={kit} entry={current} input={panel.input} onRead={setRead} /> : null;
  return { panel, controls: listed ?? read, reader };
}
