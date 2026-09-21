import { describe, expect, it } from 'vitest';
import { normalizeWidgetTypeLayoutOverrides, resolveWidgetTypeLayoutSpan } from './dashboardBreakpointConfig';

describe('light layout overrides', () => {
  it('preserves the automatic collapsed and expanded heights', () => {
    const span = resolveWidgetTypeLayoutSpan('light', 'xl', {
      light: { xl: { w: 2, hOff: 1, hOn: 2, autoExpand: true } },
    });

    expect(span).toMatchObject({ w: 2, hOff: 1, hOn: 2, autoExpand: true });
  });

  it('uses one fixed height when automatic expansion is disabled', () => {
    const span = resolveWidgetTypeLayoutSpan('light', 'xl', {
      light: { xl: { w: 2, h: 2, hOff: 1, hOn: 3, autoExpand: false } },
    });

    expect(span).toMatchObject({ w: 2, h: 2, hOff: 2, hOn: 2, autoExpand: false });
    expect(normalizeWidgetTypeLayoutOverrides({ light: { xl: { autoExpand: false } } }))
      .toEqual({ light: { xl: { autoExpand: false } } });
  });

  it('falls back to safe sensor spans for widget kinds saved by newer builds', () => {
    expect(resolveWidgetTypeLayoutSpan('future-widget' as never, 'xl')).toEqual({ w: 2, h: 3 });
  });
});
