// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockEntityState } from '../../../types/ha';
import { SENSOR_FAMILY_CLASSES, type SensorFamily } from '../model/sensorFamily';
import {
  chartKindOf,
  dailyBars,
  idealBandOf,
  parseStatistics,
  periodsOf,
  readStoredThresholds,
  scaleOf,
  statisticsQuery,
  stepThreshold,
  storeThreshold,
  thresholdCrossed,
  thresholdRuleOf,
} from '../model/sensorPanel';
import { PanelServicesProvider } from './panelServicesContext';
import { SensorFamilyPanel } from './SensorFamilyPanel';

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

const entity = (state: string, rawAttributes: Record<string, unknown> = {}) => ({ state, rawAttributes }) as unknown as MockEntityState;

const panel = (entityId: string, states: Record<string, MockEntityState>, props: Partial<React.ComponentProps<typeof SensorFamilyPanel>> = {}) =>
  render(<SensorFamilyPanel entityId={entityId} name="Sensore" haStates={states} onClose={vi.fn()} {...props} />);

const FAMILIES = Object.keys(SENSOR_FAMILY_CLASSES) as SensorFamily[];

describe('the chart of each family', () => {
  it('draws a line, bars or a strip as the board says', () => {
    expect(FAMILIES).toHaveLength(17);
    const by = (kind: string) => FAMILIES.filter((family) => chartKindOf(family) === kind).sort();
    expect(by('line')).toEqual(['air', 'battery', 'humidity', 'light', 'measure', 'signal', 'temperature', 'weather']);
    expect(by('bars')).toEqual(['energy', 'motion', 'price', 'water']);
    expect(by('strip')).toEqual(['device', 'opening', 'safety', 'state', 'time']);
  });

  it('offers recorder periods and the explicit door, device and battery windows', () => {
    expect(periodsOf('temperature', { state_class: 'measurement' }, false)).toEqual(['24h', '7d', '30d']);
    expect(periodsOf('temperature', {}, false)).toEqual(['24h']);
    expect(periodsOf('temperature', { state_class: 'measurement' }, true)).toEqual(['24h']);
    expect(periodsOf('opening', {}, false)).toEqual(['24h', '7d']);
    expect(periodsOf('motion', {}, false)).toEqual(['24h', '7d']);
    expect(periodsOf('device', {}, false)).toEqual(['24h', '7d']);
    expect(periodsOf('battery', { state_class: 'measurement' }, false)).toEqual(['6mo', '1y']);
    expect(periodsOf('battery', {}, false)).toEqual(['24h']);
  });

  it('asks the recorder by the hour over a week and by the day over a month', () => {
    expect(statisticsQuery('sensor.a', '7d', 1000)).toMatchObject({ type: 'recorder/statistics_during_period', statistic_ids: ['sensor.a'], period: 'hour' });
    expect(statisticsQuery('sensor.a', '30d', 1000)).toMatchObject({ period: 'day' });
    expect(statisticsQuery('sensor.a', '6mo', 1000)).toMatchObject({ period: 'day' });
    expect(statisticsQuery('sensor.a', '1y', 1000)).toMatchObject({ period: 'day' });
  });

  it('reads the rows of the recorder and groups them by day', () => {
    const noon = new Date(2026, 10, 2, 12).getTime();
    const rows = parseStatistics({ 'sensor.a': [{ start: noon, mean: 2, change: 1 }, { start: noon + 3_600_000, mean: 4, change: 2 }, { start: 'x' }] }, 'sensor.a');
    expect(rows).toHaveLength(2);
    expect(dailyBars(rows, (row) => row.change, 'sum')).toEqual([3]);
    expect(dailyBars(rows, (row) => row.mean, 'mean')).toEqual([3]);
    expect(parseStatistics(null, 'sensor.a')).toEqual([]);
  });

  it('has an ideal band and a scale only where they mean something', () => {
    expect(idealBandOf('temperature', 'temperature', '°C')).toEqual([20, 23]);
    expect(idealBandOf('light', 'illuminance', 'lx')).toBeNull();
    expect(scaleOf('temperature', 'temperature', '°C', 21, 3.3)?.zones).toHaveLength(3);
    expect(scaleOf('temperature', 'temperature', '°C', null, 3.3)).toBeNull();
    expect(scaleOf('opening', 'door', '', 1, 3.3)).toBeNull();
    const widths = scaleOf('humidity', 'humidity', '%', 50, 3.3)?.zones.reduce((sum, zone) => sum + zone.width, 0);
    expect(widths).toBeCloseTo(100);
  });
});

describe('the threshold', () => {
  it('moves with the steps of the board', () => {
    const steps: Array<[SensorFamily, string, string, number, number]> = [
      ['temperature', 'temperature', '°C', 26, 0.5],
      ['humidity', 'humidity', '%', 70, 5],
      ['air', 'carbon_dioxide', 'ppm', 1000, 100],
      ['energy', 'power', 'W', 3, 0.5],
      ['water', 'water', 'L', 1, 0.5],
      ['battery', 'battery', '%', 20, 5],
      ['weather', 'wind_speed', 'km/h', 50, 5],
      ['signal', 'data_rate', 'Mbit/s', 50, 10],
      ['measure', 'sound_pressure', 'dB', 55, 5],
      ['price', 'monetary', '€/kWh', 0.3, 0.02],
      ['opening', 'door', '', 15, 5],
      ['light', 'illuminance', 'lx', 10, 5],
    ];
    for (const [family, deviceClass, unit, start, step] of steps) {
      const rule = thresholdRuleOf(family, deviceClass, unit);
      expect(rule?.start, family).toBe(start);
      expect(rule?.step, family).toBe(step);
      if (rule) {
        expect(stepThreshold(rule, start, 1), family).toBeCloseTo(start + step);
        expect(stepThreshold(rule, start + step, -1), family).toBeCloseTo(start);
      }
    }
  });

  it('never goes below one step', () => {
    const rule = thresholdRuleOf('battery', 'battery', '%')!;
    expect(stepThreshold(rule, 5, -1)).toBe(5);
  });

  it('has none for a yes/no or a word', () => {
    for (const family of ['motion', 'safety', 'device', 'state', 'time'] as SensorFamily[]) {
      expect(thresholdRuleOf(family, '', ''), family).toBeNull();
    }
  });

  it('says when a value is past it', () => {
    const rule = thresholdRuleOf('temperature', 'temperature', '°C')!;
    expect(thresholdCrossed(rule, 26, 27, '°C')).toBe(true);
    expect(thresholdCrossed(rule, 26, 25, '°C')).toBe(false);
    expect(thresholdCrossed(rule, 26, null, '°C')).toBe(false);
    expect(thresholdCrossed(thresholdRuleOf('energy', 'power', 'W')!, 3, 3500, 'W')).toBe(true);
    expect(thresholdCrossed(thresholdRuleOf('battery', 'battery', '%')!, 20, 10, '%')).toBe(true);
  });

  it('is saved, and the panel moves it with − and + and offers no notification switch', () => {
    storeThreshold('sensor.other', 1);
    panel('sensor.t', { 'sensor.t': entity('21', { device_class: 'temperature', unit_of_measurement: '°C' }) });
    expect(screen.getByText(/Soglia · sopra 26,0°/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Alza la soglia' }));
    expect(screen.getByText(/Soglia · sopra 26,5°/)).toBeTruthy();
    expect(readStoredThresholds()).toEqual({ 'sensor.other': 1, 'sensor.t': 26.5 });
    fireEvent.click(screen.getByRole('button', { name: 'Abbassa la soglia' }));
    expect(readStoredThresholds()['sensor.t']).toBe(26);
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByText(/Avvisami/)).toBeNull();
  });

  it('warns when the value is past a threshold moved by the household', () => {
    storeThreshold('sensor.t', 20);
    panel('sensor.t', { 'sensor.t': entity('21', { device_class: 'temperature', unit_of_measurement: '°C' }) });
    expect(screen.getByText(/Oltre la tua soglia di 20,0°/)).toBeTruthy();
  });

  it('survives a browser that refuses to store', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => storeThreshold('sensor.t', 1)).not.toThrow();
    spy.mockRestore();
  });
});

describe('the panel of a family', () => {
  it('shows the value and its word, with no block without data', () => {
    panel('sensor.t', { 'sensor.t': entity('21.4', { device_class: 'temperature', unit_of_measurement: '°C' }) });
    expect(screen.getByText('21,4')).toBeTruthy();
    expect(screen.getAllByText('Comfort').length).toBeGreaterThan(0);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('Nella stessa stanza')).toBeNull();
  });

  it('draws the history it was given', () => {
    panel('sensor.t', { 'sensor.t': entity('21', { device_class: 'temperature', unit_of_measurement: '°C' }) }, { history: [20, 21, 22, 21] });
    expect(screen.getByTestId('sensor-panel-line')).toBeTruthy();
    expect(screen.getByText('Minimo')).toBeTruthy();
    expect(screen.getByText('Massimo')).toBeTruthy();
    expect(screen.getByText('Media')).toBeTruthy();
  });

  it('colours the alert and offers only the actions whose device exists', async () => {
    const states = { 'sensor.t': entity('29', { device_class: 'temperature', unit_of_measurement: '°C' }) };
    panel('sensor.t', states);
    expect(screen.getAllByText('Fa caldo').length).toBeGreaterThan(0);
    expect(screen.getByRole('alert').textContent).toMatch(/chiudi le tapparelle/);
    expect(screen.queryByRole('button', { name: 'Accendi il clima' })).toBeNull();
    cleanup();

    const callApi = vi.fn(async (message: { type: string }) => {
      if (message.type === 'config/entity_registry/list') return [
        { entity_id: 'sensor.t', area_id: 'sala' },
        { entity_id: 'climate.c', area_id: 'sala' },
        { entity_id: 'cover.finestra', area_id: 'sala' },
        { entity_id: 'cover.garage', area_id: 'sala' },
      ];
      return null;
    });
    const callService = vi.fn().mockResolvedValue(true);
    render(
      <PanelServicesProvider value={{ callApi: callApi as never, callService }}>
        <SensorFamilyPanel
          entityId="sensor.t"
          name="Sensore"
          onClose={vi.fn()}
          haStates={{
            ...states,
            'climate.c': entity('off'),
            'cover.finestra': entity('open', { device_class: 'blind' }),
            'cover.garage': entity('open', { device_class: 'garage' }),
          }}
        />
      </PanelServicesProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Accendi il clima' }));
    expect(callService).toHaveBeenCalledWith('climate', 'turn_on', { entity_id: ['climate.c'] });
    fireEvent.click(screen.getByRole('button', { name: 'Chiudi le tapparelle' }));
    // A garage is a way into the house: an alert on the heat does not move it.
    expect(callService).toHaveBeenCalledWith('cover', 'close_cover', { entity_id: ['cover.finestra'] });
  });

  it('reads 7 days from the recorder, and falls back to 24 hours without statistics', async () => {
    const callApi = vi.fn(async (message: { type: string }) => {
      if (message.type === 'recorder/statistics_during_period') return {};
      return null;
    });
    render(
      <PanelServicesProvider value={{ callApi: callApi as never, callService: vi.fn() }}>
        <SensorFamilyPanel entityId="sensor.t" name="Sensore" onClose={vi.fn()} haStates={{ 'sensor.t': entity('21', { device_class: 'temperature', unit_of_measurement: '°C', state_class: 'measurement' }) }} />
      </PanelServicesProvider>,
    );
    fireEvent.click(await screen.findByRole('radio', { name: '7 giorni' }).catch(() => screen.getByRole('button', { name: '7 giorni' })));
    await waitFor(() => expect(callApi).toHaveBeenCalledWith(expect.objectContaining({ type: 'recorder/statistics_during_period' }), expect.anything()));
    await waitFor(() => expect(screen.queryByText('7 giorni')).toBeNull());
  });

  it('reads seven-day door history from HA instead of treating it as statistics', async () => {
    const callApi = vi.fn(async (message: { type: string }) => {
      if (message.type === 'history/history_during_period') return { 'binary_sensor.porta': [] };
      return null;
    });
    render(
      <PanelServicesProvider value={{ callApi: callApi as never, callService: vi.fn() }}>
        <SensorFamilyPanel entityId="binary_sensor.porta" name="Porta" onClose={vi.fn()} haStates={{ 'binary_sensor.porta': entity('off', { device_class: 'door' }) }} />
      </PanelServicesProvider>,
    );
    fireEvent.click(await screen.findByRole('radio', { name: '7 giorni' }).catch(() => screen.getByRole('button', { name: '7 giorni' })));
    await waitFor(() => {
      const request = callApi.mock.calls.map(([message]) => message as { type: string; start_time?: string }).find((message) =>
        message.type === 'history/history_during_period' && Date.parse(message.start_time ?? '') < Date.now() - 6 * 86_400_000,
      );
      expect(request).toBeTruthy();
    });
    expect(callApi.mock.calls.some(([message]) => (message as { type: string }).type === 'recorder/statistics_during_period')).toBe(false);
  });

  it('starts a long-term battery at six months and offers one year', async () => {
    const now = Date.now();
    const callApi = vi.fn(async (message: { type: string }) => {
      if (message.type === 'recorder/statistics_during_period') return { 'sensor.battery': [{ start: now - 86_400_000, mean: 82 }] };
      return null;
    });
    render(
      <PanelServicesProvider value={{ callApi: callApi as never, callService: vi.fn() }}>
        <SensorFamilyPanel entityId="sensor.battery" name="Batteria" onClose={vi.fn()} haStates={{ 'sensor.battery': entity('82', { device_class: 'battery', unit_of_measurement: '%', state_class: 'measurement' }) }} />
      </PanelServicesProvider>,
    );
    expect(await screen.findByRole('radio', { name: '6 mesi' }).catch(() => screen.getByRole('button', { name: '6 mesi' }))).toBeTruthy();
    expect(screen.getByRole('radio', { name: '1 anno' })).toBeTruthy();
    await waitFor(() => expect(callApi).toHaveBeenCalledWith(expect.objectContaining({ type: 'recorder/statistics_during_period' }), expect.anything()));
    const first = callApi.mock.calls.map(([message]) => message as { type: string; start_time?: string }).find((message) => message.type === 'recorder/statistics_during_period');
    expect(Date.parse(first?.start_time ?? '')).toBeLessThan(now - 180 * 86_400_000);
  });

  it('shows actual automations using light and price sensors, never placeholder relations', () => {
    panel('sensor.lux', {
      'sensor.lux': entity('320', { device_class: 'illuminance', unit_of_measurement: 'lx' }),
      'automation.luce': entity('on', { friendly_name: 'Accensione ingresso', target: { entity_id: 'sensor.lux' } }),
    });
    expect(screen.getByText('Usata da')).toBeTruthy();
    expect(screen.getByText('Accensione ingresso')).toBeTruthy();
    cleanup();
    panel('sensor.prezzo', {
      'sensor.prezzo': entity('0.22', { device_class: 'monetary', unit_of_measurement: 'â‚¬/kWh' }),
      'automation.ricarica': entity('on', { friendly_name: 'Ricarica economica', watched: ['sensor.prezzo'] }),
    });
    expect(screen.getByText('Dispositivi che seguono il prezzo')).toBeTruthy();
    expect(screen.getByText('Ricarica economica')).toBeTruthy();
  });

  it('shows reminders and linked devices only when the registry proves the relation', async () => {
    const callApi = vi.fn(async (message: { type: string }) => {
      if (message.type === 'config/entity_registry/list') return [
        { entity_id: 'sensor.prossimo', device_id: 'dev-1' },
        { entity_id: 'calendar.famiglia', device_id: 'dev-1', name: 'Calendario famiglia' },
        { entity_id: 'binary_sensor.movimento', device_id: 'dev-2' },
        { entity_id: 'light.corridoio', device_id: 'dev-2', name: 'Luce corridoio' },
      ];
      if (message.type === 'config/device_registry/list' || message.type === 'config/area_registry/list') return [];
      if (message.type === 'history/history_during_period') return {};
      return null;
    });
    const services = { callApi: callApi as never, callService: vi.fn() };
    render(
      <PanelServicesProvider value={services}>
        <SensorFamilyPanel
          entityId="sensor.prossimo"
          name="Prossimo evento"
          onClose={vi.fn()}
          haStates={{
            'sensor.prossimo': entity(new Date(Date.now() + 3_600_000).toISOString(), { device_class: 'timestamp' }),
            'calendar.famiglia': entity('on', { friendly_name: 'Calendario famiglia' }),
          }}
        />
      </PanelServicesProvider>,
    );
    expect(await screen.findByText('Promemoria')).toBeTruthy();
    expect(screen.getByText('Calendario famiglia')).toBeTruthy();
    cleanup();
    render(
      <PanelServicesProvider value={services}>
        <SensorFamilyPanel
          entityId="binary_sensor.movimento"
          name="Movimento"
          onClose={vi.fn()}
          haStates={{
            'binary_sensor.movimento': entity('off', { device_class: 'motion' }),
            'light.corridoio': entity('off', { friendly_name: 'Luce corridoio' }),
          }}
        />
      </PanelServicesProvider>,
    );
    expect(await screen.findByText('Collegato a')).toBeTruthy();
    expect(screen.getByText('Luce corridoio')).toBeTruthy();
  });

  it('shows every phase of a word, and the batteries of the house', () => {
    panel('sensor.w', { 'sensor.w': entity('wash', { device_class: 'enum', options: ['wash', 'rinse', 'spin'] }) });
    expect(screen.getByText('Fasi')).toBeTruthy();
    expect(screen.getByText('Rinse')).toBeTruthy();
    cleanup();
    panel('sensor.b_battery', {
      'sensor.b_battery': entity('82', { device_class: 'battery', unit_of_measurement: '%' }),
      'sensor.c_battery': entity('9', { device_class: 'battery', unit_of_measurement: '%', friendly_name: 'Porta' }),
    });
    expect(screen.getByText('Tutte le batterie della casa')).toBeTruthy();
    expect(screen.getByText('Porta')).toBeTruthy();
  });

  it('keeps two decimals on a price and shows the word of a state as its value', () => {
    panel('sensor.p', { 'sensor.p': entity('0.22', { device_class: 'monetary', unit_of_measurement: '€/kWh' }) });
    expect(screen.getByText('0,22')).toBeTruthy();
    cleanup();
    panel('binary_sensor.c', { 'binary_sensor.c': entity('on', { device_class: 'connectivity' }) });
    expect(screen.getAllByText('Online').length).toBeGreaterThan(0);
  });

  it('shows the state of a yes/no as a word, and the battery of its device', () => {
    panel('binary_sensor.door', {
      'binary_sensor.door': entity('on', { device_class: 'door' }),
      'sensor.door_battery': entity('12', { device_class: 'battery', unit_of_measurement: '%' }),
    });
    expect(screen.getByText(/Aperta/)).toBeTruthy();
    expect(screen.getByText('Batteria 12%')).toBeTruthy();
  });

  it('folds what follows the chart behind a button that the phone shows', () => {
    panel('sensor.t', { 'sensor.t': entity('21', { device_class: 'temperature', unit_of_measurement: '°C' }) });
    const more = screen.getByRole('button', { name: /Mostra di più/ });
    expect(document.querySelector('.dv-pn-more-body')?.className).toMatch(/is-closed/);
    fireEvent.click(more);
    expect(screen.getByRole('button', { name: /Mostra meno/ })).toBeTruthy();
    expect(document.querySelector('.dv-pn-more-body')?.className).not.toMatch(/is-closed/);
  });

  it('opens for a sensor of every family without breaking', () => {
    const samples: Record<SensorFamily, [string, string, Record<string, unknown>]> = {
      temperature: ['sensor.a', '21', { device_class: 'temperature', unit_of_measurement: '°C' }],
      humidity: ['sensor.a', '48', { device_class: 'humidity', unit_of_measurement: '%' }],
      air: ['sensor.a', '620', { device_class: 'carbon_dioxide', unit_of_measurement: 'ppm' }],
      energy: ['sensor.a', '900', { device_class: 'power', unit_of_measurement: 'W' }],
      water: ['sensor.a', '410', { device_class: 'water', unit_of_measurement: 'L' }],
      battery: ['sensor.a', '82', { device_class: 'battery', unit_of_measurement: '%' }],
      light: ['sensor.a', '320', { device_class: 'illuminance', unit_of_measurement: 'lx' }],
      weather: ['sensor.a', '14', { device_class: 'wind_speed', unit_of_measurement: 'km/h' }],
      signal: ['sensor.a', '-60', { device_class: 'signal_strength', unit_of_measurement: 'dBm' }],
      time: ['sensor.a', new Date(Date.now() + 3_600_000).toISOString(), { device_class: 'timestamp' }],
      state: ['sensor.a', 'wash', { device_class: 'enum', options: ['wash'] }],
      price: ['sensor.a', '0.22', { device_class: 'monetary', unit_of_measurement: '€/kWh' }],
      measure: ['sensor.a', '32', { device_class: 'sound_pressure', unit_of_measurement: 'dB' }],
      opening: ['binary_sensor.a', 'off', { device_class: 'window' }],
      motion: ['binary_sensor.a', 'off', { device_class: 'motion' }],
      safety: ['binary_sensor.a', 'off', { device_class: 'smoke' }],
      device: ['binary_sensor.a', 'on', { device_class: 'connectivity' }],
    };
    for (const family of FAMILIES) {
      const [id, state, attributes] = samples[family];
      const { container } = panel(id, { [id]: entity(state, attributes) });
      expect(container.querySelector('.dv-panel'), family).toBeTruthy();
      cleanup();
    }
  });
});
