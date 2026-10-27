import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { DashboardStateShape } from '../../../hooks/useDashboardState';
import { I18nProvider } from '../../../i18n/I18nProvider';
import type { DashboardLayoutConfiguration } from '../../../services/dashboardConfigurationRepository';
import type { DashboardSection, Widget, WidgetKind } from '../../../types/dashboardModels';
import type { MockEntityStateMap } from '../../../types/ha';
import { GridEditorRealCard } from './GridEditorRealCard';

afterEach(cleanup);

const dashboardState = {
  userName: 'Ada',
  wifiDownloadMbps: 240,
  weather: {
    available: true,
    source: 'mock',
    location: 'Roma',
    condition: 'sunny',
    temperature: 22,
    feelsLike: 22,
    high: 25,
    low: 17,
    precipitation: 0,
    precipitationAmount: 0,
    pressure: 1015,
    dewPoint: 12,
    cloudCoverage: 10,
    windGustSpeed: 8,
    windBearing: 120,
    humidity: 45,
    windSpeed: 4,
    uvIndex: 3,
    visibility: 10,
    forecast: [],
  },
  lamp: {
    name: 'Luce', isOn: true, brightness: 60, status: 'Accesa', hsColor: [35, 70], colorTemp: 3200,
  },
  climate: {
    name: 'Termostufa', mode: 'heat', isOn: true, status: 'Riscaldamento', currentTemp: 21,
    targetTemp: 23, minTemp: 7, maxTemp: 35,
  },
  speaker: { isPlaying: true, status: 'In riproduzione', progress: 0.4, trackTitle: 'Brano' },
  favorites: [],
  livingRoomMasterOff: false,
} as DashboardStateShape;

const requiredKinds: readonly WidgetKind[] = [
  'climate', 'lock', 'alarm', 'light', 'media', 'sensor', 'calendar', 'members',
];

function widget(kind: WidgetKind, index: number, parentSectionId?: string): Widget {
  const id = parentSectionId ? `stack.${kind}` : `root.${kind}`;
  return {
    id,
    kind,
    title: `${kind} autentica`,
    entityId: `${kind}.preview_${index}`,
    dataSource: 'mock',
    status: kind === 'light' ? 'Accesa' : 'Attivo',
    isOn: true,
    value: 42,
    unit: '%',
    parentSectionId,
    layout: { i: id, x: 0, y: index * 2, w: 3, h: 2 },
  };
}

const sections: DashboardSection[] = [
  { id: 'section.greeting', kind: 'greeting', title: 'Casa di Ada', layout: { i: 'section.greeting', x: 0, y: 20, w: 6, h: 2 } },
  { id: 'section.scenes', kind: 'scenes', title: 'Scenari autentici', layout: { i: 'section.scenes', x: 6, y: 20, w: 6, h: 2 } },
  {
    id: 'section.stack', kind: 'stack-grid', title: 'Stack autentico', stackColumns: 2,
    stackShowHeader: true, stackShowBackground: true, stackShowBorder: true,
    layout: { i: 'section.stack', x: 0, y: 24, w: 6, h: 4 },
  },
];
const rootWidgets = requiredKinds.map((kind, index) => widget(kind, index));
const stackChild = widget('sensor', 20, 'section.stack');
const dashboard: DashboardLayoutConfiguration = {
  storageVersion: 14,
  sections,
  widgets: [...rootWidgets, stackChild],
  widgetTypeLayoutOverrides: {},
  widgetLayoutOverrides: {},
  responsiveLayouts: {
    root: { xl: [...sections.map((section) => section.layout), ...rootWidgets.map((entry) => entry.layout)] },
    stacks: { 'section.stack': { xl: [{ ...stackChild.layout, x: 0, y: 0, w: 2, h: 2 }] } },
  },
};
const haStates: MockEntityStateMap = Object.fromEntries(rootWidgets.map((entry) => [entry.entityId, {
  state: entry.kind === 'lock' ? 'locked' : 'on',
  numericValue: entry.value,
  brightness: 153,
  toggleOn: true,
  rawAttributes: { friendly_name: entry.title },
}]));

function renderCard(id: string) {
  const root = [...rootWidgets, ...sections].find((entry) => entry.id === id);
  if (!root) throw new Error(`Unknown fixture root ${id}`);
  return render(
    <I18nProvider forcedLocale="it">
      <GridEditorRealCard
        dashboard={dashboard}
        visualWidgets={dashboard.widgets}
        dashboardState={dashboardState}
        haStates={haStates}
        sensorHistoryByEntity={{}}
        houseMembers={[{ id: 'ada', name: 'Ada', isCurrent: true }]}
        item={root.layout}
        breakpoint="xl"
        selected={false}
      />
    </I18nProvider>,
  );
}

describe('GridEditorRealCard', () => {
  it.each(requiredKinds)('mounts the authentic %s product renderer with controls disabled', (kind) => {
    const { container } = renderCard(`root.${kind}`);
    const boundary = container.querySelector(`[data-experimental-card-kind="${kind}"]`);
    expect(boundary).not.toBeNull();
    expect(boundary?.getAttribute('data-experimental-renderer')).toBe('WidgetCardRenderer');
    expect(boundary?.getAttribute('data-experimental-operational-controls')).toBe('disabled');
    expect(boundary?.childElementCount).toBeGreaterThan(0);
  });

  it.each(['section.greeting', 'section.scenes'])('mounts authentic special section %s', (id) => {
    const { container } = renderCard(id);
    expect(container.querySelector('[data-experimental-renderer="SectionCardRenderer"]')).not.toBeNull();
  });

  it('keeps a Stack atomic while showing its authentic child card', () => {
    const { container } = renderCard('section.stack');
    const stack = container.querySelector('[data-experimental-renderer="SafeStackProjection"]');
    expect(stack?.getAttribute('data-stack-child-count')).toBe('1');
    expect(container.querySelector('[data-testid="experimental-stack-child-stack.sensor"]')).not.toBeNull();
    expect(container.querySelector('[data-experimental-renderer="WidgetCardRenderer"]')).not.toBeNull();
  });
});
