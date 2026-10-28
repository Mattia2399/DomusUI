import { describe, expect, it } from 'vitest';
import { isGridEngine2QaSaveEnabled } from './saveFeatureFlag';

describe('Grid Engine 2 QA save feature flag', () => {
  it('requires an independent exact-true development flag', () => {
    expect(isGridEngine2QaSaveEnabled({ DEV: true, VITE_GRID_ENGINE_2_QA_SAVE: 'true' })).toBe(true);
    expect(isGridEngine2QaSaveEnabled({ DEV: true, VITE_GRID_ENGINE_2_QA_SAVE: 'false' })).toBe(false);
    expect(isGridEngine2QaSaveEnabled({ DEV: true, VITE_GRID_ENGINE_2_QA_SAVE: true })).toBe(false);
    expect(isGridEngine2QaSaveEnabled({ DEV: false, VITE_GRID_ENGINE_2_QA_SAVE: 'true' })).toBe(false);
  });
});
