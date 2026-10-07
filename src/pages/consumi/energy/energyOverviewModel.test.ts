import { describe, expect, it } from 'vitest';
import type { EnergyModuleState, EnergyQuantity, EnergyState } from '../../../services/energyCoreClient';
import { buildEnergyOverview } from './energyOverviewModel';

const quantity = (value: number | null, overrides: Partial<EnergyQuantity> = {}): EnergyQuantity => ({
  status: value === null ? 'unavailable' : 'ok',
  value,
  unit: 'W',
  source: 'measured',
  entity_ids: [],
  reason: value === null ? 'state_unavailable' : null,
  ...overrides,
});

const moduleState = (overrides: Partial<EnergyModuleState> = {}): EnergyModuleState => ({
  status: 'online',
  complete: true,
  sign_convention: null,
  quantities: {},
  ...overrides,
});

const state = (overrides: Partial<EnergyState> = {}): EnergyState => ({
  configured: true,
  load_error: false,
  available: true,
  profile_revision: 1,
  observed_at: '2026-10-02T08:00:00Z',
  modules: {},
  absent_modules: [],
  offline_modules: [],
  home_consumption: null,
  tariff: null,
  ...overrides,
});

const overview = (energyState: EnergyState | null) => buildEnergyOverview({
  state: energyState,
  error: null,
  loading: false,
  live: true,
});

describe('Energy overview model', () => {
  it('shows an informative setup state for an absent profile without fallback values', () => {
    const view = overview(state({
      configured: false,
      available: false,
      profile_revision: 0,
      absent_modules: ['grid', 'solar', 'home', 'battery', 'wallbox'],
    }));

    expect(view.notice).toMatchObject({ label: 'Da configurare', tone: 'info' });
    expect(view.metrics.map((metric) => metric.value)).toEqual(['—', '—', '—', '—']);
  });

  it('keeps a configured offline installation visible without inventing power', () => {
    const view = overview(state({
      available: false,
      modules: {
        grid: moduleState({ status: 'offline', complete: false, quantities: { net_power: quantity(null) } }),
        battery: moduleState({ status: 'offline', complete: false, quantities: { state_of_charge: quantity(null, { unit: '%' }) } }),
      },
      offline_modules: ['grid', 'battery'],
      home_consumption: quantity(null, { status: 'unavailable', reason: 'source_unavailable' }),
    }));

    expect(view.notice).toMatchObject({ label: 'Sensori offline', tone: 'warning' });
    expect(view.metrics.find((metric) => metric.key === 'grid')).toMatchObject({ value: '—', label: 'Rete offline' });
    expect(view.metrics.find((metric) => metric.key === 'battery')).toMatchObject({ value: '—', label: 'Batteria offline' });
  });

  it('shows battery SoC while declaring unavailable battery power', () => {
    const view = overview(state({
      modules: {
        battery: moduleState({
          quantities: {
            state_of_charge: quantity(64, { unit: '%' }),
            net_power: quantity(null, { status: 'not_measured', source: null, reason: 'not_configured' }),
          },
        }),
      },
    }));

    expect(view.metrics.find((metric) => metric.key === 'battery')).toEqual({
      key: 'battery',
      value: '64%',
      label: 'Batteria · Potenza non disponibile',
    });
  });

  it('treats real zero readings as measurements and never formats negative zero', () => {
    const view = overview(state({
      modules: {
        grid: moduleState({ quantities: { net_power: quantity(-0) } }),
        solar: moduleState({ quantities: { production_power: quantity(0) } }),
        battery: moduleState({ quantities: { state_of_charge: quantity(0, { unit: '%' }), net_power: quantity(0) } }),
      },
      home_consumption: quantity(0),
    }));

    expect(view.metrics.map((metric) => metric.value)).toEqual(['0 W', '0 W', '0 W', '0%']);
    expect(view.metrics.some((metric) => metric.value.includes('-0'))).toBe(false);
  });

  it('declares missing history and tariff instead of deriving daily energy or cost', () => {
    const view = overview(state({ home_consumption: quantity(3200) }));

    expect(view.cardMetrics).toContainEqual({ value: '—', label: 'Energia odierna · Storico non disponibile' });
    expect(view.cardMetrics).toContainEqual({ value: '—', label: 'Costo odierno · Tariffa non configurata' });
  });

  it('separates a configured tariff and an integration without tariff support', () => {
    const tariff = { scheme: 'three_band' as const, band: 'F1' as const, band_label: 'F1', price: 0.31, export_price: null, currency: 'EUR' as const };
    expect(overview(state({ tariff })).cardMetrics).toContainEqual({ value: '—', label: 'Costo odierno · Storico non disponibile' });

    const legacy = state();
    delete legacy.tariff;
    expect(overview(legacy).cardMetrics).toContainEqual({ value: '—', label: 'Costo odierno · Aggiorna l’integrazione' });
  });

  it('does not turn a high instantaneous value into an unconfigured critical alert', () => {
    const view = overview(state({
      modules: { grid: moduleState({ quantities: { net_power: quantity(12_000) } }) },
      home_consumption: quantity(12_000),
    }));

    expect(view.notice.tone).toBe('success');
    expect(`${view.notice.label} ${view.notice.text}`).not.toMatch(/critic|distacco|rischio/i);
  });
});
