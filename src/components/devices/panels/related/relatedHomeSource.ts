import type { Widget } from '../../../../types/dashboardModels';
import type { RelatedSource } from './relatedContext';

/** A card with something for its panel: related controls, micro widgets, or choices on the controls of its device. */
export const holdsPanelChoices = <T extends RelatedSource>(source: T | undefined): source is T =>
  Boolean(source && (source.relatedControls?.length || source.widgets?.length || source.panelControls));

/** The first card of the Home with this entity: the same entity has the same functions everywhere. */
export function homeSourceOf(widgets: readonly Widget[] | undefined, entityId: string): RelatedSource | undefined {
  const card = widgets?.find((widget) => widget.entityId === entityId);
  return holdsPanelChoices(card) ? card : undefined;
}
