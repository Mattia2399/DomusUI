// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MockEntityState } from '../../../types/ha';
import { SensorFamilyCard, toFamilySensorModel } from './SensorFamilyCard';
import { HouseStatesProvider } from './houseStatesContext';

/*
 * The sensor card of the Home by family (docs/design-reference/sensori), in
 * the three sizes and in the state of resolveSensorAlert.
 */

afterEach(cleanup);

const NOW = new Date(2026, 9, 29, 16, 0).getTime();
const entity = (state: string, attributes: Record<string, unknown>, changedAgo?: number) =>
  ({ state, rawAttributes: { ...attributes, ...(changedAgo !== undefined ? { __last_changed: new Date(NOW - changedAgo).toISOString() } : null) } }) as MockEntityState;
const model = (entityId: string, state: string, attributes: Record<string, unknown>, changedAgo?: number) =>
  toFamilySensorModel(entityId, entity(state, attributes, changedAgo))!;
const card = (props: Partial<Parameters<typeof SensorFamilyCard>[0]> & Pick<Parameters<typeof SensorFamilyCard>[0], 'model'>) =>
  render(<SensorFamilyCard format="U×4" now={NOW} onOpen={vi.fn()} {...props} />);

describe('SensorFamilyCard', () => {
  it('draws a temperature on its comfort scale, and colours the Mini when it is too hot', () => {
    const room = model('sensor.living_temperature', '21.4', { friendly_name: 'Temperatura sala', device_class: 'temperature', unit_of_measurement: '°C' });
    const { container, unmount } = card({ model: room });
    expect(container.querySelector('[data-family="temperature"]')).not.toBeNull();
    expect(container.querySelector('.dv-ss-track.is-comfort')).not.toBeNull();
    expect(screen.getByText('Comfort')).toBeTruthy();
    unmount();
    const hot = { ...room, value: 27.8, state: '27.8' };
    const mini = card({ model: hot, format: 'U×2' });
    expect(mini.container.querySelector('.dv-tile.dv-ss-alert')).not.toBeNull();
    expect(screen.getByText('27,8° · fa caldo')).toBeTruthy();
    mini.unmount();
    const standard = card({ model: hot });
    expect(standard.container.querySelector('.dv-ss-alert')).toBeNull();
    expect(standard.container.querySelector('[data-alert="hot"]')).not.toBeNull();
  });

  it('gathers the batteries of the house in the Expanded, lowest first when one is to change', () => {
    const states = {
      'sensor.door_battery': entity('9', { friendly_name: 'Sensore porta', device_class: 'battery', unit_of_measurement: '%' }),
      'sensor.remote_battery': entity('23', { friendly_name: 'Telecomando', device_class: 'battery', unit_of_measurement: '%' }),
      'sensor.thermo_battery': entity('64', { friendly_name: 'Termostato', device_class: 'battery', unit_of_measurement: '%' }),
    };
    const door = toFamilySensorModel('sensor.door_battery', states['sensor.door_battery'])!;
    const { container } = render(
      <HouseStatesProvider value={states}>
        <SensorFamilyCard model={door} format="W×4" now={NOW} onOpen={vi.fn()} />
      </HouseStatesProvider>,
    );
    expect(screen.getByText('Batterie della casa')).toBeTruthy();
    expect(screen.getByText('1 da cambiare subito')).toBeTruthy();
    expect([...container.querySelectorAll('.dv-ss-rows b')].map((row) => row.textContent)).toEqual(['Sensore porta', 'Telecomando', 'Termostato']);
  });

  it('reads the air on its gauge, with the sensors beside it', () => {
    const states = {
      'sensor.living_air_co2': entity('1480', { friendly_name: 'Aria soggiorno', device_class: 'carbon_dioxide', unit_of_measurement: 'ppm' }),
      'sensor.living_air_pm25': entity('22', { friendly_name: 'PM', device_class: 'pm25', unit_of_measurement: 'µg/m³' }),
    };
    const air = toFamilySensorModel('sensor.living_air_co2', states['sensor.living_air_co2'])!;
    render(
      <HouseStatesProvider value={states}>
        <SensorFamilyCard model={air} format="W×4" now={NOW} onOpen={vi.fn()} />
      </HouseStatesProvider>,
    );
    expect(screen.getByText('Aria soggiorno · Scarsa')).toBeTruthy();
    expect(screen.getByText('Apri le finestre per 10 minuti')).toBeTruthy();
    expect(screen.getByText('PM2.5')).toBeTruthy();
  });

  it('reads a power against the meter set on the card', () => {
    const power = model('sensor.house_power', '3100', { friendly_name: 'Consumo casa', device_class: 'power', unit_of_measurement: 'W' });
    const standard = card({ model: power });
    expect(standard.container.querySelector('[data-alert="nearLimit"]')).not.toBeNull();
    expect(screen.getByText('contatore 3,3 kW')).toBeTruthy();
    standard.unmount();
    const larger = card({ model: power, meterKw: 6 });
    expect(larger.container.querySelector('[data-alert]')).toBeNull();
    expect(screen.getByText('contatore 6,0 kW')).toBeTruthy();
    expect((larger.container.querySelector('.dv-ss-meter i') as HTMLElement).style.width).toBe('52%');
  });

  it('says a window is open in orange, and since when', () => {
    const open = model('binary_sensor.kitchen_window', 'on', { friendly_name: 'Finestra cucina', device_class: 'window' }, 5 * 60_000);
    const { container } = card({ model: open, format: 'U×2' });
    expect(screen.getByText('Aperta da 5 min')).toBeTruthy();
    expect(container.querySelector('.dv-ss-alert')).not.toBeNull();
  });

  it('turns a detector that rings red in every size', () => {
    const smoke = model('binary_sensor.kitchen_smoke', 'on', { friendly_name: 'Fumo cucina', device_class: 'smoke' }, 30_000);
    for (const format of ['U×2', 'U×4', 'W×4'] as const) {
      const { container, unmount } = card({ model: smoke, format });
      expect(container.querySelector('.dv-ss-alert.is-loud'), format).not.toBeNull();
      unmount();
    }
    card({ model: smoke, format: 'U×2' });
    expect(screen.getByText('FUMO RILEVATO')).toBeTruthy();
  });

  it('counts down to an end time, then says it is over', () => {
    const attributes = { friendly_name: 'Lavastoviglie', device_class: 'timestamp' };
    const running = model('sensor.dishwasher_end', new Date(NOW + 25 * 60_000).toISOString(), attributes, 65 * 60_000);
    const { unmount } = card({ model: running, format: 'U×2' });
    expect(screen.getByText('Finisce tra 25 min')).toBeTruthy();
    unmount();
    const over = model('sensor.dishwasher_end', new Date(NOW - 12 * 60_000).toISOString(), attributes, 102 * 60_000);
    card({ model: over });
    expect(screen.getByText('Finita da 12 min')).toBeTruthy();
  });

  it('shows the phases of a cycle, and says it is done in the language of the app', () => {
    const options = ['Prelavaggio', 'Lavaggio', 'Risciacquo', 'Centrifuga'];
    const spin = model('sensor.washer', 'Centrifuga', { friendly_name: 'Lavatrice', device_class: 'enum', options });
    const { unmount } = card({ model: spin, format: 'U×2' });
    expect(screen.getByText('Centrifuga · 4 di 4')).toBeTruthy();
    unmount();
    card({ model: { ...spin, state: 'finished' } });
    expect(screen.getByText('Finito')).toBeTruthy();
  });

  it('marks the dear hours of a price from the prices of the day', () => {
    const today = Array.from({ length: 24 }, (_, hour) => (hour >= 13 && hour < 16 ? 0.12 : 0.24));
    const price = model('sensor.price', '0.34', { friendly_name: 'Prezzo energia', device_class: 'monetary', unit_of_measurement: '€/kWh', today });
    const { container } = card({ model: price, format: 'W×4' });
    expect(container.querySelector('[data-alert="priceHigh"]')).not.toBeNull();
    expect(container.querySelectorAll('.dv-ss-bars i')).toHaveLength(24);
  });

  it('says only that a sensor is away when it cannot answer', () => {
    const away = model('sensor.living_temperature', 'unavailable', { friendly_name: 'Temperatura sala', device_class: 'temperature', unit_of_measurement: '°C' });
    const { container } = card({ model: away, format: 'W×4' });
    expect(screen.getByText('Non disponibile')).toBeTruthy();
    expect(container.querySelector('.dv-tile.is-unavailable')).not.toBeNull();
  });
});
