import type { Widget } from '../../../../types/dashboardModels';

/** The looks that draw the history of their entity. */
export const HISTORY_LOOKS: ReadonlySet<string> = new Set(['sparkline', 'chart-line', 'chart-area', 'chart-bar', 'chart-stats', 'trend']);

/** The entities whose history the related charts of a card need: the hidden ones need none. */
export function relatedHistoryEntityIds(widget: Pick<Widget, 'relatedControls'>): string[] {
  return (widget.relatedControls ?? [])
    .filter((control) => control.place !== 'hidden' && HISTORY_LOOKS.has(control.look))
    .map((control) => control.entityId.trim())
    .filter((entityId) => entityId.length > 0);
}
