import type { Widget } from '../../../../types/dashboardModels';
import type { RelatedSource } from './relatedContext';

/** The first card of the Home with this entity: the same entity has the same functions everywhere. */
export function homeSourceOf(widgets: readonly Widget[] | undefined, entityId: string): RelatedSource | undefined {
  return widgets?.find((widget) => widget.entityId === entityId);
}
