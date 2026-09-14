import { describe, expect, it } from 'vitest';
import type { GridItem } from '../types/dashboardModels';
import {
  STARTER_DASHBOARD_TEMPLATE_VERSION,
  addStarterLightResponsiveLayout,
  createStarterDashboardTemplate,
} from './starterDashboardTemplate';

function overlaps(first: GridItem, second: GridItem) {
  return first.x < second.x + second.w
    && first.x + first.w > second.x
    && first.y < second.y + second.h
    && first.y + first.h > second.y;
}

describe('starterDashboardTemplate', () => {
  it('builds a complete Demo template without pre-adding the guided Light card', () => {
    const template = createStarterDashboardTemplate('demo');

    expect(template.version).toBe(STARTER_DASHBOARD_TEMPLATE_VERSION);
    expect(template.sections.map((section) => section.kind)).toEqual(['greeting', 'scenes']);
    expect(template.widgets.map((widget) => widget.kind)).toEqual([
      'climate', 'camera', 'sensor', 'lock', 'alarm', 'media', 'cover',
    ]);
    expect(template.widgets.every((widget) => widget.dataSource === 'mock')).toBe(true);
    expect(template.widgets.some((widget) => widget.kind === 'light')).toBe(false);
  });

  it('provides collision-free layouts for every supported breakpoint', () => {
    const template = createStarterDashboardTemplate('demo');
    const root = template.responsiveLayouts.root ?? {};

    expect(Object.keys(root).sort()).toEqual(['2xl', 'lg', 'md', 'sm', 'xl', 'xs']);
    Object.values(root).forEach((items) => {
      const layouts = items ?? [];
      layouts.forEach((layout, index) => {
        layouts.slice(index + 1).forEach((other) => expect(overlaps(layout, other)).toBe(false));
      });
    });
  });

  it('binds real cards only to a unique, available entity of the expected domain', () => {
    const template = createStarterDashboardTemplate('real', {
      'climate.living_room': { state: 'heat', rawAttributes: { friendly_name: 'Living Room' } },
      'camera.front': { state: 'streaming' },
      'camera.garage': { state: 'idle' },
      'lock.front': { state: 'unavailable' },
    });

    expect(template.widgets.find((widget) => widget.kind === 'climate')).toMatchObject({
      entityId: 'climate.living_room',
      title: 'Living Room',
      dataSource: 'ha',
    });
    expect(template.widgets.find((widget) => widget.kind === 'camera')?.entityId).toBe('');
    expect(template.widgets.find((widget) => widget.kind === 'lock')?.entityId).toBe('');
    expect(template.widgets.every((widget) => widget.dataSource === 'ha')).toBe(true);
  });

  it('reserves a deterministic Light position at every breakpoint', () => {
    const template = createStarterDashboardTemplate('demo');
    const withLight = addStarterLightResponsiveLayout(template.responsiveLayouts, 'light.guided');

    Object.values(withLight.root ?? {}).forEach((items) => {
      const light = items?.find((item) => item.i === 'light.guided');
      expect(light).toBeTruthy();
      items?.filter((item) => item.i !== 'light.guided').forEach((item) => {
        expect(overlaps(light!, item)).toBe(false);
      });
    });
  });
});
