import { describe, expect, it } from 'vitest';
import { isGridEngine2StandardEditorEnabled } from './editorFeatureFlag';

describe('Grid Engine 2 standard editor cutover', () => {
  it('is enabled by default in every build', () => {
    expect(isGridEngine2StandardEditorEnabled({})).toBe(true);
    expect(isGridEngine2StandardEditorEnabled({ VITE_GRID_ENGINE_LEGACY_EDITOR_ROLLBACK: 'false' })).toBe(true);
    expect(isGridEngine2StandardEditorEnabled({ VITE_GRID_ENGINE_LEGACY_EDITOR_ROLLBACK: true })).toBe(true);
  });

  it('keeps an exact-true technical rollback to the legacy editor', () => {
    expect(isGridEngine2StandardEditorEnabled({ VITE_GRID_ENGINE_LEGACY_EDITOR_ROLLBACK: 'true' })).toBe(false);
  });
});
