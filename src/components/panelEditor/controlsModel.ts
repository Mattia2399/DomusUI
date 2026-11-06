import type React from 'react';
import type { PanelControl, PanelLayoutName, PanelPlace } from '../devices/panels/registry';
import type { PanelKit } from './panelKit';
import { relatedChoiceOf } from '../devices/panels/related/relatedControlRegistry';
import { relatedControlsOf } from '../devices/panels/related/relatedMigration';
import { relatedModelOf } from '../devices/panels/related/relatedModel';
import type { MockEntityStateMap } from '../../types/ha';
import type { Widget } from '../../types/dashboardModels';
import type { RelatedControl, SavedControlChoice } from '../../types/relatedControl';

/*
 * The controls of a card as the edit mode sees them: those of the device and the related ones,
 * in one list and one order, as the panel draws them. The panel reads the same fields.
 */

/** As in relatedPanelControls: the ids of the related controls in the panel. */
export const RELATED_PREFIX = 'rel:';
/** As in relatedPanelControls: until the user chooses, the related controls stand after those of the device. */
const RELATED_AFTER_DEVICE = 1000;

/** The cards whose panel has its own fixed block, without Altro: their controls are not chosen here. */
export const FIXED_PANEL_KINDS: ReadonlySet<string> = new Set(['alarm', 'lock', 'weather', 'media']);

/** A control of the device, as its panel gives it. */
export type DeviceControlInfo = {
  id: string;
  name: string;
  icon?: React.ReactNode;
  /** Empty for a control that acts at once. */
  looks: readonly string[];
  action: boolean;
  place?: PanelPlace;
};

export type ControlRow = {
  /** Its id in the panel: that of the device, or rel: and that of the related control. */
  id: string;
  source: 'device' | 'related';
  name: string;
  icon?: React.ReactNode;
  looks: readonly string[];
  look: string;
  place: PanelPlace;
  related?: RelatedControl;
};

export type RelatedLooks = (control: { entityId: string; look?: string }) => readonly string[];

/** The looks an entity can take, the recommended first; a look saved that no longer fits stays offered. */
export const relatedLooksOf =
  (states: MockEntityStateMap): RelatedLooks =>
  ({ entityId, look }) => {
    if (look === 'page') return ['page'];
    const { looks } = relatedChoiceOf(entityId, relatedModelOf(entityId, states[entityId]));
    return !look || looks.includes(look as never) ? looks : [look, ...looks];
  };

/** The name the panel gives an entity without one chosen. */
export const entityNameOf = (states: MockEntityStateMap) => (entityId: string) => relatedModelOf(entityId, states[entityId]).name;

/** The rows in the order of the panel, hidden ones included. */
export function controlRows(
  kit: Pick<PanelKit, 'PANEL_CONTROLS'>,
  widget: Widget,
  layout: PanelLayoutName | undefined,
  device: readonly DeviceControlInfo[],
  looksOf: RelatedLooks,
  entityName: (entityId: string) => string = (entityId) => entityId,
): ControlRow[] {
  const rows = layout ? kit.PANEL_CONTROLS[layout] : [];
  const choices: Readonly<Record<string, SavedControlChoice>> = widget.panelControls ?? {};
  const after = widget.panelControls ? 0 : RELATED_AFTER_DEVICE;
  const ofDevice = device.map((control, index) => {
    const row = rows.find((entry) => entry.id === control.id);
    const chosen = choices[control.id];
    const wanted = chosen?.look ?? row?.look;
    const look = control.action ? 'action' : wanted && control.looks.includes(wanted) ? wanted : control.looks[0] ?? 'rows';
    const position = rows.findIndex((entry) => entry.id === control.id);
    return {
      order: chosen?.order ?? (position >= 0 ? position : rows.length + index),
      row: { id: control.id, source: 'device' as const, name: control.name, icon: control.icon, looks: control.looks, look, place: chosen?.place ?? row?.place ?? control.place ?? 'more' },
    };
  });
  const ofRelated = relatedControlsOf(widget).map((control) => ({
    order: after + control.order,
    row: { id: `${RELATED_PREFIX}${control.id}`, source: 'related' as const, name: control.name || entityName(control.entityId), looks: looksOf(control), look: control.look, place: control.place, related: control },
  }));
  return [...ofDevice, ...ofRelated]
    .map((entry, index) => ({ ...entry, index }))
    .sort((first, second) => first.order - second.order || first.index - second.index)
    .map(({ row }) => row);
}

/** Where each row stands in the panel: the same arrangeControls the panel uses, with its limits. */
export function controlSections(kit: Pick<PanelKit, 'arrangeControls'>, rows: readonly ControlRow[]) {
  const shown = rows.filter((row) => row.place !== 'hidden');
  const stubs = shown.map((row) =>
    row.look === 'action'
      ? ({ id: row.id, icon: null, label: row.name, onPress: () => undefined } as PanelControl)
      : ({ id: row.id, icon: null, label: row.name, looks: ['rows'], big: () => null, group: null } as PanelControl),
  );
  const choices = Object.fromEntries(shown.map((row, order) => [row.id, { place: row.place, order }]));
  const { main, more } = kit.arrangeControls(undefined, stubs, choices);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const pick = (entries: readonly { control: PanelControl }[]) => entries.map(({ control }) => byId.get(control.id)).filter((row): row is ControlRow => Boolean(row));
  return { main: pick(main), more: pick(more), hidden: rows.filter((row) => row.place === 'hidden') };
}

/** The rows written back: the choices of the device, the related controls, and the micro widgets no more. */
export function writeRows(rows: readonly ControlRow[]): Pick<Widget, 'panelControls' | 'relatedControls' | 'widgets'> {
  const panelControls: Record<string, SavedControlChoice> = {};
  const relatedControls: RelatedControl[] = [];
  rows.forEach((row, order) => {
    if (row.source === 'device') {
      panelControls[row.id] = row.look === 'action' ? { place: row.place, order } : { place: row.place, look: row.look, order };
    } else if (row.related) {
      relatedControls.push({ ...row.related, place: row.place, order } as RelatedControl);
    }
  });
  // The micro widgets were read as related controls: from now on they are saved as such.
  return { panelControls, relatedControls, widgets: undefined };
}

/** The rows again in the order of the sections, each with the place of its section. */
export function rowsFromSections(main: readonly ControlRow[], more: readonly ControlRow[], hidden: readonly ControlRow[]): ControlRow[] {
  return [...main.map((row) => ({ ...row, place: 'main' as const })), ...more.map((row) => ({ ...row, place: 'more' as const })), ...hidden.map((row) => ({ ...row, place: 'hidden' as const }))];
}

/** A related control in another look: a slider keeps how it sends, a page its path. */
export function relatedWithLook(control: RelatedControl, look: string): RelatedControl {
  if (look === control.look) return control;
  const { options: _options, ...rest } = control;
  if (look === 'bar' || look === 'bar-value') {
    return { ...rest, look, options: control.look === 'bar' || control.look === 'bar-value' ? control.options : { commit: 'release' } } as RelatedControl;
  }
  if (look === 'page') return { ...rest, look, options: control.look === 'page' ? control.options : { path: '/home' } } as RelatedControl;
  return { ...rest, look } as RelatedControl;
}

/** A new related control, at the end of its place. */
export function newRelatedControl(entityId: string, look: string, extra: { name?: string; icon?: string; place: PanelPlace }, id = `c${Date.now().toString(36)}`): RelatedControl {
  return relatedWithLook({ id, entityId, look: 'value', place: extra.place, order: 0, ...(extra.name ? { name: extra.name } : {}), ...(extra.icon ? { icon: extra.icon } : {}) } as RelatedControl, look);
}
