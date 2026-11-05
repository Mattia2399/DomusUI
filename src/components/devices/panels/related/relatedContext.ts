import React from 'react';
import type { MicroWidget, Widget } from '../../../../types/dashboardModels';
import type { MockEntityStateMap } from '../../../../types/ha';

/*
 * What a page tells the panels about related controls. The Home says what its open card
 * holds; the Rooms say what the first card of the Home with that entity holds.
 */

export type RelatedSource = Pick<Widget, 'relatedControls'> & { widgets?: readonly MicroWidget[] };

/** The commands of today, those that already go through the rules of access. */
export type RelatedCommands = {
  call?: (domain: string, service: string, data: Record<string, unknown>) => unknown;
  toggle?: (entityId: string, on: boolean) => void;
  setValue?: (entityId: string, value: number) => void;
  navigate?: (path: string) => void;
};

export type RelatedContextValue = {
  /** By the owner of the panel, which for the devices of a room is its entity. */
  sourceOf: (owner: string) => RelatedSource | undefined;
  states: MockEntityStateMap;
  history?: Readonly<Record<string, readonly number[]>>;
  /** Nothing leaves the page: the commands change only what it shows. */
  demo: boolean;
  commands: RelatedCommands;
};

export const RelatedContext = React.createContext<RelatedContextValue | null>(null);
