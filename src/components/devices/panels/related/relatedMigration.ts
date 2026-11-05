import type { MicroWidget } from '../../../../types/dashboardModels';
import type { RelatedControl } from '../../../../types/relatedControl';
import type { RelatedSource } from './relatedContext';

/*
 * The micro widgets saved on a card, read as related controls. Only on reading: what is
 * saved stays as it is until the user changes it.
 */

/** After the related controls of the card, in the order they were saved. */
const MICRO_WIDGET_ORDER = 500;
/** Where a page button with no path has always gone. */
const DEFAULT_PAGE_PATH = '/home';

const CHART_LOOKS = { line: 'chart-line', area: 'chart-area', bar: 'chart-bar' } as const;

function lookOf(widget: MicroWidget): Pick<RelatedControl, 'look' | 'options'> {
  switch (widget.type) {
    case 'value_pill':
      return { look: 'value-pill' };
    case 'status_glow':
      return { look: 'glow' };
    case 'mini_ring':
      return { look: 'mini-ring' };
    case 'micro_button':
      if (widget.buttonMode === 'page') return { look: 'page', options: { path: widget.buttonPagePath?.trim() || DEFAULT_PAGE_PATH } };
      if (widget.buttonMode === 'push') return { look: widget.buttonHoldWhilePressed === true ? 'momentary' : 'push' };
      return { look: 'icon-toggle' };
    case 'micro_slider':
      return { look: 'bar', options: { commit: widget.sliderSendOnRelease === false ? 'live' : 'release' } };
    case 'micro_step':
      return { look: 'stepper' };
    case 'micro_superchart':
      return { look: CHART_LOOKS[widget.superChartType ?? 'line'] ?? 'chart-line' };
    default:
      // Whatever else was saved has always been drawn as a small switch.
      return { look: 'toggle-row' };
  }
}

export function relatedOfMicroWidget(widget: MicroWidget, index: number): RelatedControl {
  return {
    id: `micro-${widget.id}`,
    entityId: widget.entity,
    name: widget.label?.trim() || undefined,
    place: 'more',
    order: MICRO_WIDGET_ORDER + index,
    ...lookOf(widget),
  } as RelatedControl;
}

/** All that a card holds besides its device: nothing saved is left out. */
export function relatedControlsOf(source: RelatedSource): RelatedControl[] {
  return [...(source.relatedControls ?? []), ...(source.widgets ?? []).map(relatedOfMicroWidget)];
}
