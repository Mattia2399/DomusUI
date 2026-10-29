// @vitest-environment node

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Where the chart library may be imported (docs/performance-energy-bundle.md).
 * Each of these files loads only on demand; a new importer must be added here
 * on purpose, after checking which surface it lands in.
 */

const root = process.cwd();
const RECHARTS_IMPORTERS = [
  // Water and Gas preview charts, loaded by LazyConsumptionChart.
  'src/pages/consumi/consumptionCharts.tsx',
  // Settings › System processor trend, loaded on demand (PERF.1).
  'src/components/settings/SettingsMiniSparkline.tsx',
  // Entity controls of the context sidebar.
  'src/components/settings/SensorControls.tsx',
  'src/components/settings/SwitchControls.tsx',
  // Micro chart card, loaded on demand.
  'src/components/widgets/micro/MicroSuperChart.tsx',
];

function sources(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) sources(path, found);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) found.push(relative(root, path).replace(/\\/g, '/'));
  }
  return found;
}

const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('chart library boundary', () => {
  // It reads every source file: give it room when the whole suite runs at once.
  it('is imported only by the known on-demand files', () => {
    const importers = sources(resolve(root, 'src')).filter((path) => /from ['"]recharts['"]/.test(read(path)));
    expect(importers.sort()).toEqual([...RECHARTS_IMPORTERS].sort());
  }, 20_000);

  it('reaches Consumption only through the lazy chart', () => {
    const consumption = sources(resolve(root, 'src/pages')).filter((path) => path.startsWith('src/pages/consumi/') || path === 'src/pages/Consumi.tsx');
    for (const path of consumption) {
      if (path === 'src/pages/consumi/consumptionCharts.tsx') continue;
      const code = read(path);
      // Only type imports or a dynamic import of the charts module.
      expect(code, path).not.toMatch(/^import (?!type )[^;]*from '\.\/consumptionCharts'/m);
      expect(code, path).not.toMatch(/from 'recharts'/);
    }
    expect(read('src/pages/consumi/LazyConsumptionChart.tsx')).toContain("import('./consumptionCharts')");
  });

  it('keeps the shared Consumption helpers free of chart code', () => {
    for (const path of ['src/pages/consumi/shared.tsx', 'src/pages/consumi/energy/energyModel.ts', 'src/pages/consumi/energy/energyHistoryModel.ts']) {
      expect(read(path), path).not.toMatch(/recharts|consumptionCharts/);
    }
  });
});
