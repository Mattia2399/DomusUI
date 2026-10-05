import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { EnergyHistory, EnergyState } from '../../../services/energyCoreClient';
import { EnergyDashboard } from './EnergyDashboard';
import { EnergyHistoryChart } from './EnergyHistoryChart';
import { historyBalance } from './energyHistoryModel';

afterEach(cleanup);

const points = (...values: Array<number | null>) =>
  values.map((value, index) => ({ start: `2026-10-05T${String(index + 8).padStart(2, '0')}:00:00Z`, value }));

const HISTORY: EnergyHistory = {
  period: '24h',
  bucket: 'hour',
  unit: 'kWh',
  series: {
    production: points(2, 4, null, 2),
    consumption: points(1, 1, 2, 2),
    import: points(0, 0, 2, 1),
    export: points(1, 3, null, 1),
  },
  derived: ['consumption'],
  cost: { currency: 'EUR', energy: 0.9, fixed: 0.32, vat: 0.12, export_credit: 0.45, net: 0.89, savings: 0.6 },
  previous: { consumption: 7.5, net_cost: 1.1 },
};

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

describe('Energy history', () => {
  it('sums only buckets with data and derives the period balance', () => {
    const balance = historyBalance(HISTORY);

    expect(balance.production).toBe(8);
    expect(balance.consumption).toBe(6);
    expect(balance.selfConsumption).toBeCloseTo(3 / 8);
    expect(balance.selfSufficiency).toBeCloseTo(0.5);
    expect(balance.change).toBeCloseTo(6 / 7.5 - 1);
    expect(historyBalance({ ...HISTORY, series: {} }).selfConsumption).toBeNull();
  });

  it('keeps a missing bucket as missing, toggles series and reads values with the keyboard', () => {
    render(<EnergyHistoryChart history={HISTORY} />);

    const table = screen.getByRole('table');
    expect(within(table).getAllByText('Nessun dato')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /Consumo della casa · derivato/ }).getAttribute('aria-pressed')).toBe('true');
    const exported = screen.getByRole('button', { name: /Immissione in rete/ });
    expect(exported.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(exported);
    expect(exported.getAttribute('aria-pressed')).toBe('true');

    const chart = screen.getByRole('img', { name: /Grafico dell’energia per ora/ });
    fireEvent.keyDown(chart, { key: 'ArrowRight' });
    fireEvent.keyDown(chart, { key: 'ArrowRight' });
    const tooltip = screen.getByRole('status');
    expect(within(tooltip).getByText('4 kWh')).not.toBeNull();
    expect(within(tooltip).getByText('Immissione in rete')).not.toBeNull();
    fireEvent.blur(chart);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('fills the analysis from history and keeps the empty state without it', () => {
    const { unmount } = render(<EnergyDashboard state={STATE} actions={null} history={{ '24h': HISTORY }} />);
    const analysis = screen.getByRole('heading', { name: 'Bilancio e costi' }).closest('section') as HTMLElement;

    expect(within(analysis).getByText('Ultime 24 ore')).not.toBeNull();
    expect(within(analysis).getByText('38%')).not.toBeNull();
    expect(within(analysis).getByText('50%')).not.toBeNull();
    expect(within(analysis).getByText(/0,89\s€/)).not.toBeNull();
    expect(within(analysis).getByText('-20% di consumo')).not.toBeNull();
    expect(screen.getByText('Prodotta in 24 ore')).not.toBeNull();
    unmount();

    render(<EnergyDashboard state={STATE} actions={null} />);
    expect(screen.getByText('Storico non ancora disponibile')).not.toBeNull();
    expect(screen.getAllByText('Richiede lo storico energetico').length).toBeGreaterThan(0);
  });
});
