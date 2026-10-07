import { describe, expect, it } from 'vitest';
import type { EnergyQuantity, EnergyState } from '../../../services/energyCoreClient';
import { freshnessDelay } from './useEnergyCore';

const quantity = (extra: Partial<EnergyQuantity>): EnergyQuantity => ({
  status: 'ok',
  value: 500,
  unit: 'W',
  source: 'measured',
  entity_ids: ['sensor.x'],
  reason: null,
  ...extra,
});

const state = (modules: EnergyState['modules']): EnergyState => ({
  configured: true,
  load_error: false,
  available: true,
  profile_revision: 1,
  observed_at: '2026-10-02T12:00:00Z',
  modules,
  absent_modules: [],
  offline_modules: [],
  home_consumption: null,
});

describe('Freshness refresh', () => {
  it('reads again just after the first fresh value would turn stale, on the server clock', () => {
    const value = state({
      grid: { status: 'online', complete: true, freshness: 'fresh', sign_convention: null, quantities: {
        net_power: quantity({ freshness: 'fresh', reported_at: '2026-10-02T11:50:00Z', stale_after: 1800 }),
      } },
      solar: { status: 'online', complete: true, freshness: 'fresh', sign_convention: null, quantities: {
        production_power: quantity({ freshness: 'fresh', reported_at: '2026-10-02T11:45:00Z', stale_after: 1800 }),
      } },
    });

    // The solar value turns stale at 12:15, 15 minutes after the projection.
    expect(freshnessDelay(value)).toBe(15 * 60_000 + 1000);
  });

  it('rechecks stale values every minute and never schedules below five seconds', () => {
    const stale = state({
      solar: { status: 'online', complete: true, freshness: 'stale', sign_convention: null, quantities: {
        production_power: quantity({ freshness: 'stale', reported_at: '2026-10-02T11:00:00Z', stale_after: 1800 }),
      } },
    });
    const due = state({
      solar: { status: 'online', complete: true, freshness: 'fresh', sign_convention: null, quantities: {
        production_power: quantity({ freshness: 'fresh', reported_at: '2026-10-02T11:30:00Z', stale_after: 1800 }),
      } },
    });

    expect(freshnessDelay(stale)).toBe(60_000);
    expect(freshnessDelay(due)).toBe(5_000);
  });

  it('schedules nothing without freshness data or a profile', () => {
    const legacy = state({ grid: { status: 'online', complete: true, sign_convention: null, quantities: { net_power: quantity({}) } } });

    expect(freshnessDelay(legacy)).toBeNull();
    expect(freshnessDelay({ ...legacy, configured: false })).toBeNull();
    expect(freshnessDelay(null)).toBeNull();
  });
});
