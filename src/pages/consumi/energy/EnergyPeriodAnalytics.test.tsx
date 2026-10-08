import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EnergyHistoryResult, EnergyState } from '../../../services/energyCoreClient';
import { EnergyDashboard } from './EnergyDashboard';
import { change, dayStarts, historyResult, kpi, previousBlock, series, total } from './energyHistory.fixtures';
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
  tariff: null,
};

const DAYS = dayStarts(7);
const open = { in_progress: true, in_progress_included: true };

/** A 7-day answer of a plant with photovoltaics, today still in progress, with the comparison. */
const WEEK = historyResult({
  bucket: 'day',
  starts: DAYS,
  series: {
    consumption: series(DAYS, [6, 6, 6, 6, 6, 6, 6.8], { source: 'derived', in_progress_last: true }),
    production: series(DAYS, [4, 5, 4, 5, 4, 5, 4.6], { in_progress_last: true }),
    grid_import: series(DAYS, [3, 2, 3, 2, 3, 2, 2.8], { in_progress_last: true }),
    grid_export: series(DAYS, [1, 1, 1, 1, 1, 1, 0.6], { in_progress_last: true }),
  },
  summary: {
    production: total(31.6, { ...open, closed_value: 27 }),
    consumption: total(42.8, { ...open, closed_value: 36, source: 'derived' }),
    grid_import: total(17.8, { ...open, closed_value: 15 }),
    grid_export: total(6.6, { ...open, closed_value: 6 }),
  },
  kpis: {
    self_consumption: kpi(79.1, { in_progress: true }),
    self_sufficiency: kpi(58.4, { in_progress: true, source: 'mixed' }),
    solar_offset: kpi(73.8, { in_progress: true, source: 'mixed' }),
  },
  previous: previousBlock({
    buckets: 6,
    series: {
      production: change(27, 24.1, 12),
      consumption: change(36, 39.1, -8),
      grid_import: change(15, 15, 0),
      grid_export: change(6, 0, null, { reason: 'no_percentage_baseline' }),
    },
  }),
});

const view = (result: EnergyHistoryResult, overrides: Partial<EnergyHistoryView> = {}): EnergyHistoryView => ({
  period: '7d',
  onPeriod: vi.fn(),
  result,
  resultPeriod: '7d',
  current: true,
  loading: false,
  error: null,
  retry: vi.fn(),
  ...overrides,
});

const show = (result: EnergyHistoryResult, overrides: Partial<EnergyHistoryView> = {}) =>
  render(<EnergyDashboard state={STATE} history={view(result, overrides)} />);
const totals = () => screen.getByRole('heading', { name: 'Energia nel periodo' }).closest('section') as HTMLElement;
const tile = (id: string) => totals().querySelector(`[data-total="${id}"]`) as HTMLElement;
const card = (id: string) => screen.getByRole('heading', { name: 'Come usi la tua energia' }).closest('section')?.querySelector(`[data-kpi="${id}"]`) as HTMLElement;

describe('Energy period analytics', () => {
  it('shows the totals so far with the comparison over the closed days', () => {
    show(WEEK);

    expect(within(totals()).getByText('Ultimi 7 giorni · periodo in corso')).not.toBeNull();
    expect(within(tile('consumption')).getByText('42,8 kWh')).not.toBeNull();
    expect(within(tile('consumption')).getByText('finora')).not.toBeNull();
    // value is the energy so far: the closed buckets alone are not the headline.
    expect(within(totals()).queryByText('36 kWh')).toBeNull();
    expect(within(tile('consumption')).getByText('↓ 8%')).not.toBeNull();
    expect(within(tile('consumption')).getByText('Consumi in calo rispetto ai 7 giorni precedenti: meno 8%')).not.toBeNull();
    expect(within(tile('production')).getByText('Produzione in aumento rispetto ai 7 giorni precedenti: più 12%')).not.toBeNull();
    expect(within(tile('grid_import')).getByText('Nessuna variazione')).not.toBeNull();
    expect(within(tile('grid_export')).getByText('Nuovo')).not.toBeNull();
    expect(within(totals()).getByText('Il confronto esclude il periodo ancora in corso.')).not.toBeNull();
    expect(totals().textContent).not.toMatch(/∞|NaN|undefined|null|999/);
  });

  it('keeps the arrows neutral', () => {
    show(WEEK);

    const arrows = [tile('consumption'), tile('production')].map((item) => within(item).getByText(/[↑↓]/));
    expect(new Set(arrows.map((arrow) => arrow.className)).size).toBe(1);
    expect(arrows[0].className).toContain('--ui-accent');
    expect(arrows[0].className).not.toMatch(/green|red|success|danger|warning/);
  });

  it('shows the three KPIs with their meaning, a bar only where 0–100 applies', () => {
    show(WEEK);

    expect(card('self_consumption').getAttribute('aria-label')).toBe('Autoconsumo: 79,1%, finora. Quanta energia solare hai utilizzato direttamente in casa.');
    expect(within(card('self_sufficiency')).getByText('Quanta parte dei tuoi consumi è stata coperta senza prelevare energia dalla rete.')).not.toBeNull();
    expect(within(card('solar_offset')).getByText('Copertura solare')).not.toBeNull();
    expect(card('self_consumption').querySelector('[aria-hidden="true"] > span')?.getAttribute('style')).toContain('width: 79.1%');
    expect(card('solar_offset').querySelector('[aria-hidden="true"] > span')).toBeNull();
  });

  it('shows a solar coverage over 100% without clipping it', () => {
    show({ ...WEEK, kpis: { ...WEEK.kpis, solar_offset: kpi(120) } });

    expect(within(card('solar_offset')).getByText('120%')).not.toBeNull();
    expect(within(card('solar_offset')).getByText('Nel periodo hai prodotto più energia solare di quanta ne hai consumata.')).not.toBeNull();
  });

  it('never shows a partial total or a precise comparison with missing data', () => {
    show({
      ...WEEK,
      summary: { ...WEEK.summary, grid_import: total(null, { partial_value: 31.4, in_progress: true }) },
      kpis: { ...WEEK.kpis, self_sufficiency: kpi(null, { status: 'partial_data', complete: false, reason: 'partial_data' }) },
      previous: previousBlock({ buckets: 6, series: { ...WEEK.previous?.comparison.series, grid_import: change(null, 15, null) } }),
    });

    expect(within(tile('grid_import')).getByText('—')).not.toBeNull();
    expect(within(tile('grid_import')).getByText('Dati incompleti')).not.toBeNull();
    expect(within(tile('grid_import')).getByText('Dato parziale: 31,4 kWh misurati')).not.toBeNull();
    expect(within(tile('grid_import')).queryByText('31,4 kWh')).toBeNull();
    expect(within(tile('grid_import')).getByText('Confronto non disponibile · dati incompleti')).not.toBeNull();
    expect(within(card('self_sufficiency')).getByText('Dati incompleti nel periodo.')).not.toBeNull();
    expect(within(card('self_sufficiency')).queryByText(/%/)).toBeNull();
  });

  it('explains a KPI the backend cannot compute and keeps the others', () => {
    show({ ...WEEK, kpis: { ...WEEK.kpis, self_consumption: kpi(null, { reason: 'no_solar_production' }), self_sufficiency: kpi(null, { status: 'incoherent', reason: 'incoherent_balance' }) } });

    expect(within(card('self_consumption')).getByText('Non disponibile')).not.toBeNull();
    expect(within(card('self_consumption')).getByText('Nessuna produzione solare nel periodo.')).not.toBeNull();
    expect(within(card('self_sufficiency')).getByText('I contatori non sono coerenti in questo periodo.')).not.toBeNull();
    expect(within(card('solar_offset')).getByText('73,8%')).not.toBeNull();
  });

  it('shows battery and car totals without any battery or car KPI', () => {
    show({
      ...WEEK,
      summary: { ...WEEK.summary, battery_charge: total(5.2), battery_discharge: total(4.6), wallbox_consumption: total(12.4) },
    });

    expect(within(tile('battery_charge')).getByText('5,2 kWh')).not.toBeNull();
    expect(within(tile('battery_discharge')).getByText('4,6 kWh')).not.toBeNull();
    expect(within(tile('wallbox_consumption')).getByText('12,4 kWh')).not.toBeNull();
    expect(document.querySelectorAll('[data-kpi]')).toHaveLength(3);
  });

  it('shows no solar KPI for a plant without photovoltaics and no 0% placeholder', () => {
    const DAY = dayStarts(1);
    show(historyResult({
      bucket: 'day',
      starts: DAY,
      series: { consumption: series(DAY, [8]), grid_import: series(DAY, [8]) },
      summary: { consumption: total(8, { source: 'derived' }), grid_import: total(8) },
      kpis: { self_sufficiency: kpi(0, { source: 'mixed' }) },
      previous: previousBlock(),
    }), { period: '24h', resultPeriod: '24h' });

    expect(document.querySelectorAll('[data-kpi]')).toHaveLength(1);
    expect(within(card('self_sufficiency')).getByText('0%')).not.toBeNull();
    expect(screen.queryByText('Autoconsumo')).toBeNull();
    expect(screen.queryByText('Copertura solare')).toBeNull();
    expect(screen.queryByText('Produzione')).toBeNull();
  });

  it('explains the method and the closed buckets of the comparison on request', () => {
    show(WEEK);

    const details = screen.getByText('Come viene calcolato?').closest('details') as HTMLElement;
    expect(details.hasAttribute('open')).toBe(false);
    fireEvent.click(screen.getByText('Come viene calcolato?'));
    expect(within(details).getByText(/usa solo gli intervalli conclusi: 6 giorni per ciascun periodo/)).not.toBeNull();
    const row = within(details).getByRole('rowheader', { name: 'Consumi' }).closest('tr') as HTMLElement;
    expect(within(row).getByText('36 kWh')).not.toBeNull();
    expect(within(row).getByText('39,1 kWh')).not.toBeNull();
    expect(within(row).getByText('−8%')).not.toBeNull();
    expect(within(details).getByText(/Solar Offset/)).not.toBeNull();
  });

  it('follows the period of the answer shown while another one loads', () => {
    show(WEEK, { period: '30d', resultPeriod: '7d', current: false, loading: true });

    expect(within(totals()).getByText('Ultimi 7 giorni · periodo in corso')).not.toBeNull();
    expect(within(tile('consumption')).getByText('Consumi in calo rispetto ai 7 giorni precedenti: meno 8%')).not.toBeNull();
    expect(totals().closest('[aria-busy="true"]')).not.toBeNull();
  });

  it('shows no totals or KPIs when the history itself is unavailable', () => {
    show(historyResult({ unavailable: { grid_import: { reason: 'no_energy_meter', statistic_ids: [] } }, previous: previousBlock() }));

    expect(screen.getByText('Lo storico non è ancora configurato')).not.toBeNull();
    expect(screen.queryByRole('heading', { name: 'Energia nel periodo' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Come usi la tua energia' })).toBeNull();
  });
});
