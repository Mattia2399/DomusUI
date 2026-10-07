import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EnergyCoreError, type EnergyHistoryResult, type EnergyState } from '../../../services/energyCoreClient';
import { EnergyDashboard } from './EnergyDashboard';
import { EnergyHistoryChart, tickEvery } from './EnergyHistoryChart';
import { dayStarts, historyResult, hourStarts, series } from './energyHistory.fixtures';
import type { EnergyHistoryView } from './useEnergyHistory';

afterEach(cleanup);

const STATE: EnergyState = {
  configured: true,
  load_error: false,
  available: true,
  profile_revision: 1,
  observed_at: '2026-10-05T12:00:00Z',
  modules: {
    grid: { status: 'online', complete: true, sign_convention: null, quantities: {} },
    solar: { status: 'online', complete: true, sign_convention: null, quantities: {} },
  },
  absent_modules: ['home', 'battery', 'wallbox'],
  offline_modules: [],
  home_consumption: null,
  tariff: { scheme: 'three_band', band: 'F1', band_label: 'F1', price: 0.31, export_price: 0.09, currency: 'EUR' },
};

const STARTS = hourStarts(4);
const FULL = historyResult({
  starts: STARTS,
  series: {
    consumption: series(STARTS, [1, 1.5, 2, 2], { source: 'derived', terms: { grid_import: 1, production: 1, grid_export: -1 } }),
    production: series(STARTS, [2, 4, 3, 2]),
    grid_import: series(STARTS, [0, 0.5, 0, 1]),
    grid_export: series(STARTS, [1, 3, 1, 1]),
  },
});

const view = (overrides: Partial<EnergyHistoryView> = {}): EnergyHistoryView => ({
  period: '24h',
  onPeriod: vi.fn(),
  result: FULL,
  current: true,
  loading: false,
  error: null,
  retry: vi.fn(),
  ...overrides,
});

const chart = () => screen.getByRole('img', { name: /Grafico dell’energia/ });
const pathOf = (container: HTMLElement, id: string) => container.querySelector(`[data-series="${id}"] path`)?.getAttribute('d') ?? '';
const readAt = (index: number) => {
  fireEvent.keyDown(chart(), { key: 'Home' });
  for (let step = 0; step < index; step += 1) fireEvent.keyDown(chart(), { key: 'ArrowRight' });
  return screen.getByRole('status');
};

describe('Energy history chart', () => {
  it('breaks the line on a missing bucket and draws a real zero on the axis', () => {
    const result = historyResult({ starts: STARTS, series: { grid_import: series(STARTS, [0, null, 0.5, 1]) } });
    const { container } = render(<EnergyHistoryChart result={result} />);

    const d = pathOf(container, 'grid_import');
    // Two separate pieces: the zero before the gap is a dot on the axis, the line restarts after it.
    expect(d.match(/M/g)).toHaveLength(2);
    expect(d).not.toContain(' 190.0L');
    const dot = container.querySelector('[data-series="grid_import"] circle');
    expect(dot?.getAttribute('cy')).toBe('190');
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(within(rows[1]).getByText('0 kWh')).not.toBeNull();
    expect(within(rows[2]).getByText('Non disponibile (Dati incompleti)')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid="history-incomplete"]')).toHaveLength(1);
  });

  it('shows a partial value only as partial and marks incomplete buckets', () => {
    const result = historyResult({
      starts: STARTS,
      series: { grid_import: series(STARTS, [1, { value: null, missing: ['sensor.f2'], partial_value: 0.4 }, 1, 1]) },
    });
    render(<EnergyHistoryChart result={result} />);

    const tooltip = readAt(1);
    expect(within(tooltip).getByText('Dati incompleti')).not.toBeNull();
    expect(within(tooltip).getByText('Non disponibile')).not.toBeNull();
    expect(within(tooltip).getByText('Dati incompleti · parziale 0,4 kWh')).not.toBeNull();
    expect(screen.queryByText('0,4 kWh')).toBeNull();
    expect(screen.getByRole('table').textContent).not.toMatch(/NaN|undefined|null kWh/);
  });

  it('marks the bucket in progress', () => {
    const starts = dayStarts(7);
    const result = historyResult({ bucket: 'day', starts, series: { grid_import: series(starts, [1, 2, 3, 4, 5, 6, null], { in_progress_last: true }) } });
    const { container } = render(<EnergyHistoryChart result={result} />);

    expect(container.querySelector('[data-testid="history-in-progress"]')).not.toBeNull();
    // Today has no hour compiled yet: not a gap in the data.
    expect(container.querySelectorAll('[data-testid="history-incomplete"]')).toHaveLength(0);
    fireEvent.keyDown(chart(), { key: 'End' });
    expect(within(screen.getByRole('status')).getByText('Oggi · in corso')).not.toBeNull();
    expect(screen.getByRole('img', { name: 'Grafico dell’energia per giorno. Usa le frecce per leggere i valori.' })).not.toBeNull();
  });

  it('says where a derived consumption comes from and never recomputes it', () => {
    render(<EnergyHistoryChart result={FULL} />);

    expect(screen.getByRole('button', { name: /Consumi · calcolato/ })).not.toBeNull();
    const tooltip = readAt(1);
    // The backend value, even where production minus export plus import would say otherwise.
    expect(within(tooltip).getByText('1,5 kWh')).not.toBeNull();
    expect(within(tooltip).getByText('Calcolato dal bilancio dei contatori')).not.toBeNull();
  });

  it('shows a measured consumption without the derived note', () => {
    const result = historyResult({ starts: STARTS, series: { consumption: series(STARTS, [1, 2, 3, 4]) } });
    render(<EnergyHistoryChart result={result} />);

    expect(screen.getByRole('button', { name: 'Consumi' })).not.toBeNull();
    expect(screen.queryByText(/calcolato/i)).toBeNull();
  });

  it('keeps battery charge and discharge apart and shows the car charge as it is', () => {
    const result = historyResult({
      starts: STARTS,
      series: {
        consumption: series(STARTS, [3, 3, 3, 3]),
        battery_charge: series(STARTS, [1, 0, 0, 0]),
        battery_discharge: series(STARTS, [0, 1, 1, 0]),
        wallbox_consumption: series(STARTS, [0, 0, 2, 2]),
      },
    });
    render(<EnergyHistoryChart result={result} />);

    const legend = screen.getByRole('group', { name: 'Serie da mostrare' });
    expect(within(legend).getAllByRole('button').map((button) => button.textContent)).toEqual(['Consumi', 'Carica batteria', 'Scarica batteria', 'Ricarica auto']);
    // The car charge is shown on its own and never taken out of the consumption.
    fireEvent.click(within(legend).getByRole('button', { name: 'Ricarica auto' }));
    const tooltip = readAt(2);
    expect(within(tooltip).getByText('3 kWh')).not.toBeNull();
    expect(within(tooltip).getByText('2 kWh')).not.toBeNull();
  });

  it('hides series only visually and reads the values with the keyboard', () => {
    const { container } = render(<EnergyHistoryChart result={FULL} />);

    const exported = screen.getByRole('button', { name: 'Immissione' });
    expect(exported.getAttribute('aria-pressed')).toBe('false');
    expect(container.querySelector('[data-series="grid_export"]')).toBeNull();
    // The accessible table keeps every series.
    expect(within(screen.getByRole('table')).getByRole('columnheader', { name: 'Immissione' })).not.toBeNull();
    fireEvent.click(exported);
    expect(exported.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('[data-series="grid_export"]')).not.toBeNull();

    fireEvent.keyDown(chart(), { key: 'End' });
    expect(within(screen.getByRole('status')).getByText('lun 5 ott · 03:00')).not.toBeNull();
    fireEvent.blur(chart());
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('thins the axis labels on narrow screens, never the buckets', () => {
    expect(tickEvery('hour', 24, 260)).toBe(4);
    expect(tickEvery('hour', 24, 1200)).toBe(1);
    expect(tickEvery('day', 30, 260)).toBe(5);
    expect(tickEvery('month', 12, 260)).toBe(3);
    expect(tickEvery('day', 7, 260)).toBe(2);
  });
});

describe('Energy history section', () => {
  const show = (history: EnergyHistoryView, onOpenSettings?: () => void) =>
    render(<EnergyDashboard state={STATE} history={history} onOpenSettings={onOpenSettings} />);
  const section = () => screen.getByRole('heading', { name: 'Energia nel tempo' }).closest('section') as HTMLElement;
  const noMeter: EnergyHistoryResult = historyResult({ unavailable: { grid_import: { reason: 'no_energy_meter', statistic_ids: [] } } });

  it('offers the four backend periods', () => {
    const onPeriod = vi.fn();
    show(view({ onPeriod }));

    const periods = within(section()).getByRole('radiogroup', { name: 'Periodo del grafico' });
    expect(within(periods).getAllByRole('radio').map((radio) => radio.textContent)).toEqual(['24 ore', '7 giorni', '30 giorni', '12 mesi']);
    fireEvent.click(within(periods).getByRole('radio', { name: '12 mesi' }));
    expect(onPeriod).toHaveBeenCalledWith('12m');
    expect(within(section()).getByText('Energia per ora, in kWh', { selector: 'p' })).not.toBeNull();
  });

  it('shows the loading state, then keeps the previous chart while another period loads', () => {
    const { rerender } = show(view({ result: null, loading: true }));
    expect(within(section()).getByText('Caricamento dello storico…')).not.toBeNull();

    rerender(<EnergyDashboard state={STATE} history={view({ period: '7d', loading: true, current: false })} />);
    expect(within(section()).getByText('Aggiornamento…')).not.toBeNull();
    expect(section().querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('explains missing meters and offers the settings to administrators only', () => {
    const onOpenSettings = vi.fn();
    const { unmount } = show(view({ result: noMeter }), onOpenSettings);

    expect(within(section()).getByText('Lo storico non è ancora configurato')).not.toBeNull();
    expect(within(section()).getByText('Domus Energy continua comunque a funzionare in tempo reale.')).not.toBeNull();
    fireEvent.click(within(section()).getByRole('button', { name: 'Apri le impostazioni' }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    unmount();

    show(view({ result: noMeter }));
    expect(within(section()).queryByRole('button', { name: 'Apri le impostazioni' })).toBeNull();
    expect(within(section()).getByText(/Un amministratore di Home Assistant può collegare/)).not.toBeNull();
  });

  it('tells valid meters without statistics apart from a configuration problem', () => {
    show(view({ result: historyResult({ unavailable: { grid_import: { reason: 'no_data', statistic_ids: ['sensor.grid'] } } }) }));

    expect(within(section()).getByText('Non ci sono ancora dati sufficienti per questo periodo.')).not.toBeNull();
    expect(within(section()).queryByText(/non è ancora configurato/)).toBeNull();
  });

  it('keeps the realtime page when the Recorder is unavailable and retries on demand', () => {
    const retry = vi.fn();
    show(view({ result: null, error: new EnergyCoreError('recorder_unavailable', 'x'), retry }));

    expect(within(section()).getByText('Lo storico di Home Assistant non è temporaneamente disponibile.')).not.toBeNull();
    expect(screen.getByTestId('energy-hero')).not.toBeNull();
    expect(screen.getByRole('list', { name: 'Componenti dell’impianto' })).not.toBeNull();
    fireEvent.click(within(section()).getByRole('button', { name: /Riprova/ }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('reports a Recorder without readable meters the same way', () => {
    show(view({ result: historyResult({ unavailable: { grid_import: { reason: 'recorder_unavailable', statistic_ids: ['sensor.grid'] } } }) }));

    expect(within(section()).getByText('Lo storico di Home Assistant non è temporaneamente disponibile.')).not.toBeNull();
  });

  it('gives a failed request, an old integration and an empty profile their own words', () => {
    const { unmount } = show(view({ result: null, error: new EnergyCoreError('network', 'Home Assistant non risponde. Riprova tra poco.') }));
    expect(within(section()).getByText('Storico non caricato')).not.toBeNull();
    expect(within(section()).getByText('Home Assistant non risponde. Riprova tra poco.')).not.toBeNull();
    unmount();

    const old = show(view({ result: null, error: new EnergyCoreError('unsupported', 'x') }));
    expect(within(section()).getByText('Storico non disponibile con questa versione')).not.toBeNull();
    expect(within(section()).queryByRole('button', { name: /Riprova/ })).toBeNull();
    old.unmount();

    show(view({ result: historyResult({ configured: false }) }));
    expect(within(section()).getByText('Nessuno storico per questo impianto')).not.toBeNull();
  });

  it('draws the available data with notes on incomplete buckets, the bucket in progress and series without history', () => {
    const result = historyResult({
      starts: STARTS,
      series: { grid_import: series(STARTS, [1, null, 1, 2], { in_progress_last: true }) },
      unavailable: { production: { reason: 'no_energy_meter', statistic_ids: [] } },
    });
    show(view({ result }));

    expect(within(section()).getByText(/Dati incompleti in alcuni intervalli/)).not.toBeNull();
    expect(within(section()).getByText('L’ultimo intervallo è ancora in corso.')).not.toBeNull();
    expect(within(section()).getByText('Senza storico: Fotovoltaico (nessun contatore di energia).')).not.toBeNull();
    // Absent hardware has no curve and no legend entry.
    expect(within(section()).queryByRole('button', { name: /Scarica batteria|Ricarica auto|Fotovoltaico/ })).toBeNull();
  });

  it('computes no period figure from the history', () => {
    show(view());

    const analysis = screen.getByRole('heading', { name: 'Bilancio e costi' }).closest('section') as HTMLElement;
    expect(within(analysis).getAllByText('In arrivo').length).toBeGreaterThan(0);
    expect(within(analysis).queryByText(/%/)).toBeNull();
    expect(screen.queryByText(/Prodotta in/)).toBeNull();
  });

  it('has no history section without a history source', () => {
    render(<EnergyDashboard state={STATE} />);

    expect(screen.queryByRole('heading', { name: 'Energia nel tempo' })).toBeNull();
  });
});
