import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GRID_ENGINE_COLS } from '../DashboardGrid';
import {
  calculateGridRowsHeight,
  resolveGridLightRuntimeMetrics,
  resolveGridMetrics,
} from './gridMetrics';

describe('Grid Engine metrics contract', () => {
  it('keeps missing configurations on the legacy 48/16/16 contract', () => {
    expect(resolveGridMetrics()).toEqual({
      version: 'legacy',
      rowHeight: 48,
      horizontalGap: 16,
      verticalGap: 16,
    });
    expect(resolveGridMetrics(null)).toEqual(resolveGridMetrics('legacy'));
  });

  it('exposes the v2 36/16/10 contract without changing legacy', () => {
    expect(resolveGridMetrics('v2')).toEqual({
      version: 'v2',
      rowHeight: 36,
      horizontalGap: 16,
      verticalGap: 10,
    });
    expect(resolveGridMetrics('legacy').rowHeight).toBe(48);
  });

  it.each([
    [2, 82],
    [3, 128],
    [4, 174],
    [6, 266],
  ])('calculates %i v2 rows as %i px', (rows, expectedHeight) => {
    expect(calculateGridRowsHeight(rows, resolveGridMetrics('v2'))).toBe(expectedHeight);
  });

  it('keeps all six responsive column counts unchanged', () => {
    expect(GRID_ENGINE_COLS).toEqual({
      '2xl': 12,
      xl: 12,
      lg: 8,
      md: 6,
      sm: 4,
      xs: 2,
    });
  });

  it('selects Light runtime heights by metrics version', () => {
    expect(resolveGridLightRuntimeMetrics()).toEqual({ hOff: 1, hOn: 2, autoExpand: true });
    expect(resolveGridLightRuntimeMetrics('v2')).toEqual({ hOff: 2, hOn: 3, autoExpand: true });
  });

  it('keeps shared core modules independent from laboratory fixtures', () => {
    const coreFiles = [
      'model.ts',
      'solveLayout.ts',
      'responsiveLayout.ts',
      'useGridGesture.ts',
      'GridGestureCanvas.tsx',
      'gridEngineRootGeometry.ts',
      'GridEngineRootRenderer.tsx',
      'gridEngineRootRuntimeSolver.ts',
      'gridEngineRuntimeOverrides.ts',
      'gridMetrics.ts',
    ];
    coreFiles.forEach((file) => {
      const source = readFileSync(resolve(process.cwd(), 'src/components/dashboard/gridEngine2', file), 'utf8');
      expect(source, file).not.toContain('labFixtures');
    });
  });
});
