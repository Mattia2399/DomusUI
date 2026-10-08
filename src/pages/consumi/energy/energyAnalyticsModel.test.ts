import { describe, expect, it } from 'vitest';
import { KPIS, PERIOD_TEXT, periodKpis, periodTotals, readChange, readKpi, readTotal } from './energyAnalyticsModel';
import { change, historyResult, kpi, previousBlock, total } from './energyHistory.fixtures';

const AFTER_7D = PERIOD_TEXT['7d'].previous;
const meta = (id: (typeof KPIS)[number]['id']) => KPIS.find((item) => item.id === id) as (typeof KPIS)[number];

describe('Energy period totals', () => {
  it('shows the total the backend gives and says when the period is not over', () => {
    expect(readTotal(total(42.8))).toEqual({ value: '42,8 kWh', soFar: false, incomplete: false, note: null });
    // value is the energy so far, never replaced by the closed buckets alone.
    expect(readTotal(total(42.8, { closed_value: 39.4, in_progress: true, in_progress_included: true }))).toMatchObject({ value: '42,8 kWh', soFar: true });
    expect(readTotal(total(0)).value).toBe('0 kWh');
  });

  it('never shows a partial value as the total', () => {
    expect(readTotal(total(null, { partial_value: 31.4 }))).toEqual({ value: '—', soFar: false, incomplete: true, note: 'Dato parziale: 31,4 kWh misurati' });
    expect(readTotal(total(null)).note).toBeNull();
  });

  it('lists consumption and production first and only the series with data', () => {
    const result = historyResult({
      summary: {
        wallbox_consumption: total(7.2),
        battery_discharge: total(3.1),
        battery_charge: total(3.6),
        grid_export: total(9),
        grid_import: total(12),
        production: total(31.6),
        consumption: total(42.8),
      },
    });
    expect(periodTotals(result, '7d').map((item) => item.label)).toEqual([
      'Consumi', 'Produzione', 'Prelievo', 'Immissione', 'Carica batteria', 'Scarica batteria', 'Ricarica auto',
    ]);
    const gridOnly = historyResult({
      summary: { consumption: total(10, { source: 'derived' }), grid_import: total(10), production: total(null, { status: 'unavailable', complete: false, reason: 'no_energy_meter' }) },
    });
    // An installed meter without any data is named in the chart notes, not as an empty tile.
    expect(periodTotals(gridOnly, '24h').map((item) => item.id)).toEqual(['consumption', 'grid_import']);
  });
});

describe('Energy period comparison', () => {
  it.each([
    [change(42.8, 46.5, -8), '↓ 8%', `Consumi in calo ${AFTER_7D}: meno 8%`],
    [change(35.4, 31.6, 12), '↑ 12%', `Consumi in aumento ${AFTER_7D}: più 12%`],
    [change(10, 10, 0), 'Nessuna variazione', `Consumi senza variazioni ${AFTER_7D}`],
    [change(0, 0, 0), 'Nessuna variazione', `Consumi senza variazioni ${AFTER_7D}`],
    [change(0, 4, -100), '↓ 100%', `Consumi in calo ${AFTER_7D}: meno 100%`],
    [change(12.3, 10, 23.4), '↑ 23,4%', `Consumi in aumento ${AFTER_7D}: più 23,4%`],
  ])('reads the backend percentage with a neutral arrow (%#)', (value, main, sentence) => {
    expect(readChange(value, 'Consumi', AFTER_7D)).toEqual({ main, suffix: AFTER_7D, sentence });
  });

  it('says new instead of a percentage when the previous period had nothing', () => {
    const reading = readChange(change(3, 0, null, { reason: 'no_percentage_baseline' }), 'Ricarica auto', AFTER_7D);
    expect(reading?.main).toBe('Nuovo');
    expect(reading?.suffix).toBe(AFTER_7D);
    expect(JSON.stringify(reading)).not.toMatch(/∞|Infinity|NaN|999/);
  });

  it('gives no percentage with incomplete or missing data', () => {
    expect(readChange(change(null, 10, null), 'Prelievo', AFTER_7D)).toMatchObject({ main: 'Confronto non disponibile · dati incompleti', suffix: null });
    expect(readChange(change(10, null, null), 'Prelievo', AFTER_7D)?.main).toBe('Confronto non disponibile · dati incompleti');
    expect(readChange(change(null, null, null, { status: 'unavailable', reason: 'missing_data' }), 'Prelievo', AFTER_7D)?.main).toBe('Confronto non disponibile');
    expect(readChange(undefined, 'Prelievo', AFTER_7D)).toBeNull();
  });

  it('names the previous period of each preset', () => {
    expect(Object.values(PERIOD_TEXT).map((text) => text.previous)).toEqual([
      'rispetto alle 24 ore precedenti', 'rispetto ai 7 giorni precedenti', 'rispetto ai 30 giorni precedenti', 'rispetto ai 12 mesi precedenti',
    ]);
    const result = historyResult({ summary: { production: total(31.6) }, previous: previousBlock({ series: { production: change(31.6, 28.2, 12.1) } }) });
    expect(periodTotals(result, '30d')[0].change?.suffix).toBe('rispetto ai 30 giorni precedenti');
  });
});

describe('Energy KPIs', () => {
  it('reads self-consumption and self-sufficiency as 0–100 with a bar', () => {
    expect(readKpi(meta('self_consumption'), kpi(70))).toEqual({ value: '70%', percent: 70, soFar: false, note: null });
    expect(readKpi(meta('self_sufficiency'), kpi(60, { in_progress: true, source: 'mixed' }))).toEqual({ value: '60%', percent: 60, soFar: true, note: null });
  });

  it('shows a solar coverage over 100% as it is, without a bar', () => {
    expect(readKpi(meta('solar_offset'), kpi(80))).toEqual({ value: '80%', percent: null, soFar: false, note: null });
    const over = readKpi(meta('solar_offset'), kpi(120));
    expect([over.value, over.percent]).toEqual(['120%', null]);
    expect(over.note).toBe('Nel periodo hai prodotto più energia solare di quanta ne hai consumata.');
  });

  it.each([
    [kpi(null, { reason: 'no_solar_production' }), 'Non disponibile', 'Nessuna produzione solare nel periodo.'],
    [kpi(null, { reason: 'no_consumption' }), 'Non disponibile', 'Nessun consumo nel periodo.'],
    [kpi(null, { reason: 'missing_data', needs: ['grid_export'] }), 'Non disponibile', 'Mancano i contatori necessari.'],
    [kpi(null, { status: 'partial_data', complete: false, reason: 'partial_data' }), '—', 'Dati incompleti nel periodo.'],
    [kpi(null, { status: 'incoherent', reason: 'incoherent_balance' }), '—', 'I contatori non sono coerenti in questo periodo.'],
  ])('explains a KPI without a value (%#) and never reads it as 0%', (value, text, note) => {
    expect(readKpi(meta('self_consumption'), value)).toEqual({ value: text, percent: null, soFar: false, note });
  });

  it('shows only the KPIs the backend returned', () => {
    const noSolar = historyResult({ kpis: { self_sufficiency: kpi(35) } });
    expect(periodKpis(noSolar).map((item) => item.label)).toEqual(['Autosufficienza']);
    const solar = historyResult({ kpis: { solar_offset: kpi(120), self_sufficiency: kpi(60), self_consumption: kpi(70) } });
    expect(periodKpis(solar).map((item) => item.label)).toEqual(['Autoconsumo', 'Autosufficienza', 'Copertura solare']);
  });
});
