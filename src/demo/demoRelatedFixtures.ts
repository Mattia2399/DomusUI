import type { GridItem, MicroWidget, Widget } from '../types/dashboardModels';
import type { MockEntityState, MockEntityStateMap } from '../types/ha';
import type { DashboardGridBreakpoint, DashboardResponsiveLayouts } from '../types/widgetTypeLayout';

/*
 * The demo stove with its related controls, as on the board, and a plug with
 * micro widgets of every kind. Only the demo reads them.
 */

export const DEMO_STOVE_ENTITY_ID = 'climate.demo_stove';

const entity = (name: string, state: string, attributes: Record<string, unknown> = {}): MockEntityState => {
  const number = Number(state);
  const unit = attributes.unit_of_measurement;
  return {
    state,
    ...(Number.isFinite(number) ? { numericValue: number } : { toggleOn: state === 'on' }),
    ...(typeof unit === 'string' ? { unit } : {}),
    rawAttributes: { friendly_name: name, ...attributes },
  };
};

export const DEMO_STOVE_STATE = entity('Termostufa Integrata', 'heat', {
  hvac_modes: ['off', 'heat'],
  hvac_action: 'heating',
  temperature: 69,
  current_temperature: 27,
  min_temp: 20,
  max_temp: 80,
  target_temp_step: 1,
  fan_modes: ['auto', '1', '2', '3', '4', '5'],
  fan_mode: 'auto',
});

/** What the related controls read: the stove has its own place in each page. */
export const DEMO_RELATED_STATES: MockEntityStateMap = {
  'sensor.demo_boiler_acs': entity('Boiler ACS', '56.4', { device_class: 'temperature', unit_of_measurement: '°C', state_class: 'measurement' }),
  'number.demo_stove_power': entity('Potenza fiamma', '3', { min: 1, max: 5, step: 1 }),
  'switch.demo_stove_schedule': entity('Programma orario', 'on'),
  'sensor.demo_pellet_level': entity('Pellet nel serbatoio', '40', { unit_of_measurement: '%', state_class: 'measurement' }),
  'binary_sensor.demo_stove_flame': entity('Fiamma', 'on'),
  'button.demo_stove_clean': entity('Pulizia braciere', 'unknown'),
  'switch.demo_bell': entity('Campanello', 'off'),
  'number.demo_water_setpoint': entity('Setpoint acqua', '65', { min: 50, max: 75, step: 0.5, unit_of_measurement: '°C' }),
  'switch.demo_micro_plug': entity('Presa con micro widget', 'on'),
};

const microWidgets: MicroWidget[] = [
  { id: 'pill', type: 'value_pill', entity: 'sensor.demo_boiler_acs' },
  { id: 'glow', type: 'status_glow', entity: 'binary_sensor.demo_stove_flame' },
  { id: 'toggle', type: 'micro_toggle', entity: 'switch.demo_stove_schedule' },
  { id: 'ring', type: 'mini_ring', entity: 'sensor.demo_pellet_level' },
  { id: 'switch', type: 'micro_button', entity: 'switch.demo_stove_schedule', label: 'Pulsante', buttonMode: 'switch' },
  { id: 'push', type: 'micro_button', entity: 'button.demo_stove_clean', buttonMode: 'push' },
  { id: 'hold', type: 'micro_button', entity: 'switch.demo_bell', buttonMode: 'push', buttonHoldWhilePressed: true },
  { id: 'page', type: 'micro_button', entity: 'switch.demo_bell', label: 'Vai alle Stanze', buttonMode: 'page', buttonPagePath: '/rooms' },
  { id: 'release', type: 'micro_slider', entity: 'number.demo_water_setpoint', sliderSendOnRelease: true },
  { id: 'live', type: 'micro_slider', entity: 'number.demo_water_setpoint', label: 'Setpoint dal vivo', sliderSendOnRelease: false },
  { id: 'step', type: 'micro_step', entity: 'number.demo_stove_power' },
  { id: 'line', type: 'micro_superchart', entity: 'sensor.demo_boiler_acs', label: 'Linea', superChartType: 'line' },
  { id: 'area', type: 'micro_superchart', entity: 'sensor.demo_boiler_acs', label: 'Area', superChartType: 'area' },
  { id: 'bar', type: 'micro_superchart', entity: 'sensor.demo_boiler_acs', label: 'Barre', superChartType: 'bar' },
];

const card = (id: string, x: number): Pick<Widget, 'id' | 'dataSource' | 'placementPolicy' | 'layout'> => ({
  id,
  dataSource: 'mock',
  placementPolicy: 'manual',
  layout: { i: id, x, y: 10, w: 3, h: 3 },
});

export const DEMO_RELATED_WIDGETS: Widget[] = [
  {
    ...card('demo-stove-v1', 0),
    kind: 'climate',
    title: 'Termostufa Integrata',
    entityId: DEMO_STOVE_ENTITY_ID,
    status: 'heating',
    isOn: true,
    value: 69,
    unit: 'C',
    relatedControls: [
      { id: 'boiler', entityId: 'sensor.demo_boiler_acs', look: 'temperature', place: 'more', order: 0 },
      { id: 'power', entityId: 'number.demo_stove_power', look: 'levels', place: 'more', order: 1 },
      { id: 'schedule', entityId: 'switch.demo_stove_schedule', look: 'toggle-row', place: 'more', order: 2 },
      { id: 'pellet', entityId: 'sensor.demo_pellet_level', look: 'level', place: 'more', order: 3 },
    ],
  },
  {
    ...card('demo-micro-widgets-v1', 3),
    kind: 'switch',
    title: 'Presa con micro widget',
    entityId: 'switch.demo_micro_plug',
    status: 'on',
    isOn: true,
    widgets: microWidgets,
  },
];

/** The two cards under everything else, at each width of the grid. */
export function withDemoRelatedLayouts(layouts: DashboardResponsiveLayouts): DashboardResponsiveLayouts {
  const root: Partial<Record<DashboardGridBreakpoint, GridItem[]>> = { ...(layouts.root ?? {}) };
  (Object.keys(root) as DashboardGridBreakpoint[]).forEach((breakpoint) => {
    const items = root[breakpoint] ?? [];
    const bottom = items.reduce((lowest, item) => Math.max(lowest, item.y + item.h), 0);
    const narrow = breakpoint === 'xs' || breakpoint === 'sm';
    const w = breakpoint === 'xs' ? 2 : breakpoint === 'sm' ? 4 : 3;
    root[breakpoint] = [
      ...items,
      ...DEMO_RELATED_WIDGETS.map(({ id }, index) => ({
        i: id,
        x: narrow ? 0 : index * 3,
        y: narrow ? bottom + index * 3 : bottom,
        w,
        h: 3,
      })),
    ];
  });
  return { ...layouts, root };
}
