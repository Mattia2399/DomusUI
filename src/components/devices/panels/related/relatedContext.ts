import type React from 'react';
import type { MicroWidget, Widget } from '../../../../types/dashboardModels';
import type { MockEntityStateMap } from '../../../../types/ha';

/*
 * What the Home hands a panel about related controls, with the card that holds them. Only the
 * Home does: the Rooms show each device with the controls the registry recommends. Types only,
 * so that a page that opens panels loads nothing of this.
 */

export type RelatedSource = Pick<Widget, 'relatedControls' | 'panelControls'> & { widgets?: readonly MicroWidget[] };

/** The commands of today, those that already go through the rules of access. */
export type RelatedCommands = {
  call?: (domain: string, service: string, data: Record<string, unknown>) => unknown;
  toggle?: (entityId: string, on: boolean) => void;
  setValue?: (entityId: string, value: number) => void;
  navigate?: (path: string) => void;
};

export type RelatedContextValue = {
  states: MockEntityStateMap;
  history?: Readonly<Record<string, readonly number[]>>;
  /** Nothing leaves the page: the commands change only what it shows. */
  demo: boolean;
  /** An icon chosen in the edit mode, by its key: the page that has them draws it. */
  iconOf?: (key: string) => React.ReactNode;
  commands: RelatedCommands;
};

/** A card with something for its panel, and what the Home knows to draw it. */
export type PanelRelated = { source: RelatedSource; context: RelatedContextValue };
