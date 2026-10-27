import { describe, expect, it } from 'vitest';
import { isGridEngine2EditorEnabled } from './editorFeatureFlag';

describe('Grid Engine 2 editor feature flag', () => {
  it('is exact-true and development-only', () => {
    expect(isGridEngine2EditorEnabled({ DEV: true, VITE_GRID_ENGINE_2_EDITOR: 'true' })).toBe(true);
    expect(isGridEngine2EditorEnabled({ DEV: true, VITE_GRID_ENGINE_2_EDITOR: 'false' })).toBe(false);
    expect(isGridEngine2EditorEnabled({ DEV: true, VITE_GRID_ENGINE_2_EDITOR: true })).toBe(false);
    expect(isGridEngine2EditorEnabled({ DEV: false, VITE_GRID_ENGINE_2_EDITOR: 'true' })).toBe(false);
  });
});
