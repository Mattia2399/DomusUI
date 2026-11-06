import { describe, expect, it } from 'vitest';
import type { RelatedControl } from '../../../../types/relatedControl';
import { relatedHistoryEntityIds } from './relatedHistory';

const control = (id: string, look: string, place: RelatedControl['place'] = 'main') => ({ id, entityId: `sensor.${id}`, look, place, order: 0 }) as RelatedControl;

describe('the history of the related charts', () => {
  it('only the charts that are shown', () => {
    const ids = relatedHistoryEntityIds({
      relatedControls: [control('a', 'chart-line'), control('b', 'value'), control('c', 'sparkline', 'more'), control('d', 'chart-bar', 'hidden'), control('e', 'trend')],
    });
    expect(ids).toEqual(['sensor.a', 'sensor.c', 'sensor.e']);
  });

  it('a card without related controls asks for nothing', () => {
    expect(relatedHistoryEntityIds({})).toEqual([]);
  });
});
