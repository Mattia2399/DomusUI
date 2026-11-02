import { describe, expect, it } from 'vitest';
import type { Widget } from '../../../types/dashboardModels';
import { snapGridV2ResizeDestination } from './gridV2ResizeAdapter';

const widget = (kind: Widget['kind']): Widget => ({
  id: `${kind}.test`,
  kind,
  title: kind,
  entityId: `${kind}.test`,
  status: 'off',
  isOn: false,
  layout: { i: `${kind}.test`, x: 0, y: 0, w: 2, h: 2 },
});

describe('Grid v2 resize adapter', () => {
  it('snaps before the solver and returns the exact preview/commit destination', () => {
    const destination = snapGridV2ResizeDestination({
      widget: widget('climate'),
      breakpoint: 'xl',
      itemX: 3,
      cols: 12,
      destination: { x: 3, y: 5, w: 3, h: 4 },
    });

    expect(destination).toEqual({ x: 4, y: 5, w: 4, h: 4 });
    expect(snapGridV2ResizeDestination({
      widget: widget('climate'),
      breakpoint: 'xl',
      itemX: 3,
      cols: 12,
      destination,
    })).toEqual(destination);
  });

  it('snaps to the formats allowed by the card and entity capability', () => {
    expect(snapGridV2ResizeDestination({
      widget: widget('light'),
      breakpoint: 'xl',
      itemX: 2,
      cols: 12,
      entityCapability: 'light-on-off',
      destination: { x: 2, y: 0, w: 8, h: 4 },
    })).toEqual({ x: 2, y: 0, w: 4, h: 2 });

    expect(snapGridV2ResizeDestination({
      widget: widget('camera'),
      breakpoint: 'md',
      itemX: 2,
      cols: 6,
      destination: { x: 2, y: 0, w: 6, h: 4 },
    })).toEqual({ x: 0, y: 0, w: 6, h: 4 });
  });
});
