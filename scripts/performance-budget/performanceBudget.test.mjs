// @vitest-environment node
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  BudgetInputError,
  chunkFor,
  closureOf,
  createSizer,
  difference,
  dynamicImportsOf,
  loadGraph,
  measureSurfaces,
  statusOf,
} from './metrics.mjs';
import { evaluate, render } from './report.mjs';

/*
 * A small build: boot (entry + global CSS) -> Home (dynamic) sharing a vendor
 * chunk with Energy (dynamic from Home), which loads a wizard on demand.
 */
function fixture(hash = 'a1') {
  const file = (name) => `assets/${name}-${hash}.js`;
  const graph = {
    version: 1,
    chunks: {
      [file('index')]: { src: 'index.html', isEntry: true, imports: [], dynamicImports: [file('Home')], css: [`assets/index-${hash}.css`], modules: { 'src/main.tsx': 10 } },
      [file('Home')]: { src: null, isDynamicEntry: true, imports: [file('index'), file('vendor')], dynamicImports: [file('Energy')], css: [`assets/home-${hash}.css`], modules: { 'src/pages/Home.tsx': 10 } },
      [file('vendor')]: { src: null, imports: [file('index')], dynamicImports: [], css: [], modules: { 'node_modules/chart/index.js': 10 } },
      [file('Energy')]: { src: 'src/pages/Energy.tsx', isDynamicEntry: true, imports: [file('index'), file('vendor'), file('icons')], dynamicImports: [file('Wizard')], css: [], modules: { 'src/pages/Energy.tsx': 10 } },
      [file('icons')]: { src: null, imports: [], dynamicImports: [], css: [], modules: { 'node_modules/icons/sun.js': 10 } },
      [file('Wizard')]: { src: 'src/pages/Wizard.tsx', isDynamicEntry: true, imports: [file('Energy'), file('icons')], dynamicImports: [], css: [], modules: { 'src/pages/Wizard.tsx': 10 } },
      'assets/worker.js': { src: 'node_modules/map/worker.mjs', isEntry: true, imports: [], dynamicImports: [], css: [], modules: { 'node_modules/map/worker.mjs': 10 } },
    },
    assets: {},
  };
  const bytes = {
    [file('index')]: 1000, [`assets/index-${hash}.css`]: 400, [file('Home')]: 2000, [`assets/home-${hash}.css`]: 100,
    [file('vendor')]: 3000, [file('Energy')]: 500, [file('icons')]: 50, [file('Wizard')]: 700, 'assets/worker.js': 900,
  };
  // Repetitive contents compress well; distinct seeds keep each file different.
  const contents = Object.fromEntries(Object.entries(bytes).map(([name, size]) => [name, Buffer.from(name.repeat(Math.ceil(size / name.length)).slice(0, size))]));
  return { graph, contents, file };
}

const surfaces = [
  { id: 'boot', label: 'Boot', sources: ['index.html'], budget: { metric: 'cold', raw: { warning: 1500, limit: 1600 }, gzip: { warning: 1000, limit: 1100 } } },
  { id: 'home', label: 'Home', sources: ['src/pages/Home.tsx'], requires: 'boot', budget: { metric: 'cold', raw: { warning: 6500, limit: 7000 }, gzip: { limit: 5000 } } },
  { id: 'energy', label: 'Energy', sources: ['src/pages/Energy.tsx'], requires: 'home', kind: 'route', budget: { metric: 'incremental', raw: { warning: 500, limit: 600 }, gzip: { limit: 1000 } } },
  { id: 'wizard', label: 'Wizard', sources: ['src/pages/Wizard.tsx'], requires: 'energy', kind: 'feature', budget: { metric: 'incremental', raw: { warning: 600, limit: 800 }, gzip: { limit: 1000 } } },
];
const config = {
  surfaces,
  singleFile: { js: { warning: 2500, limit: 3500 }, css: { warning: 300, limit: 500 } },
  total: { raw: { warning: 8000, limit: 9000 }, gzip: { limit: 9000 } },
  unattributed: { raw: { warning: 800 } },
};

function setup(hash) {
  const { graph, contents, file } = fixture(hash);
  const build = loadGraph(graph);
  const sizer = createSizer((name) => contents[name] ?? null);
  return { build, sizer, contents, file, codeFiles: Object.keys(contents) };
}

describe('performance budget metrics', () => {
  it('follows static imports only and adds the CSS of every chunk', () => {
    const { build, file } = setup();
    const home = closureOf(build, ['src/pages/Home.tsx']);
    expect([...home].sort()).toEqual([file('Home'), file('index'), file('vendor'), 'assets/home-a1.css', 'assets/index-a1.css'].sort());
    // Energy and the wizard are dynamic imports: never on the Home critical path.
    expect(home.has(file('Energy'))).toBe(false);
    expect([...dynamicImportsOf(build, home)]).toEqual([file('Energy')]);
  });

  it('finds a dynamic entry without a facade by the module it contains', () => {
    const { build, file } = setup();
    expect(chunkFor(build, 'src/pages/Home.tsx')).toBe(file('Home'));
    expect(() => chunkFor(build, 'src/pages/Missing.tsx')).toThrow(BudgetInputError);
  });

  it('counts a shared chunk once and measures what a route adds to Home', () => {
    const { build, sizer, file } = setup();
    const [boot, home, energy, wizard] = measureSurfaces(build, sizer, surfaces);
    expect(boot.cold.raw).toBe(1400);
    // index (1000) and its CSS (400) are shared by Home: counted once.
    expect(home.cold.raw).toBe(1000 + 400 + 2000 + 100 + 3000);
    expect(home.incremental.raw).toBe(2000 + 100 + 3000);
    // Energy reuses vendor from Home: only Energy and the icons are added.
    expect([...energy.added].sort()).toEqual([file('Energy'), file('icons')].sort());
    expect(energy.incremental.raw).toBe(550);
    expect([...energy.onDemand]).toEqual([file('Wizard')]);
    expect(wizard.incremental.raw).toBe(700);
    expect(difference(energy.files, home.files).size).toBe(2);
  });

  it('measures gzip with zlib and CSS as part of the size', () => {
    const { sizer, contents, file } = setup();
    const files = new Set([file('index'), 'assets/index-a1.css']);
    const measured = sizer.measure(files);
    expect(measured.gzip).toBe(gzipSync(contents[file('index')]).byteLength + gzipSync(contents['assets/index-a1.css']).byteLength);
    expect([measured.js, measured.css, measured.raw]).toEqual([1000, 400, 1400]);
  });

  it('does not depend on hashed file names', () => {
    const one = setup('a1');
    const other = setup('zz9');
    const sizes = (current) => measureSurfaces(current.build, current.sizer, surfaces).map((surface) => [surface.id, surface.cold.raw, surface.incremental.raw]);
    expect(sizes(other)).toEqual(sizes(one));
  });

  it('passes, warns or fails against warning and hard limits', () => {
    expect(statusOf(100, { warning: 200, limit: 300 })).toBe('OK');
    expect(statusOf(250, { warning: 200, limit: 300 })).toBe('WARN');
    expect(statusOf(301, { warning: 200, limit: 300 })).toBe('FAIL');
    expect(statusOf(300, { limit: 300 })).toBe('OK');
    expect(statusOf(1, undefined)).toBe('INFO');

    const { build, sizer, codeFiles } = setup();
    const ok = evaluate(build, sizer, config, codeFiles);
    expect(ok.failed).toBe(false);
    // The vendor chunk (3000) is over the single-file warning (2500), the worker is unattributed (900 > 800).
    expect(ok.warned).toBe(true);
    expect(ok.files.find((entry) => entry.file.includes('vendor')).status).toBe('WARN');
    expect(ok.unattributed.files).toEqual(['assets/worker.js']);
    expect(ok.surfaces.map((surface) => [surface.id, surface.status])).toEqual([['boot', 'OK'], ['home', 'OK'], ['energy', 'WARN'], ['wizard', 'WARN']]);

    const tight = { ...config, surfaces: surfaces.map((surface) => (surface.id === 'wizard' ? { ...surface, budget: { ...surface.budget, raw: { limit: 650 } } } : surface)) };
    const failed = evaluate(build, sizer, tight, codeFiles);
    expect(failed.failed).toBe(true);
    expect(render(failed)).toContain('Performance budget superato: la release viene bloccata.');
  });

  it('lets a lazy feature grow without touching Home, within its own and the total budget', () => {
    const { graph, contents, file } = fixture();
    // A new heavy feature behind Energy: Home and Energy are unchanged.
    graph.chunks[file('Wizard')].imports.push('assets/viewer3d.js');
    graph.chunks['assets/viewer3d.js'] = { src: null, imports: [], dynamicImports: [], css: [], modules: { 'node_modules/three/index.js': 10 } };
    contents['assets/viewer3d.js'] = Buffer.alloc(5000, 1);
    const result = evaluate(loadGraph(graph), createSizer((name) => contents[name]), config, Object.keys(contents));
    const status = Object.fromEntries(result.surfaces.map((surface) => [surface.id, surface.status]));
    expect([status.boot, status.home, status.energy]).toEqual(['OK', 'OK', 'WARN']);
    expect(status.wizard).toBe('FAIL');
    expect(result.total.status).toBe('FAIL');
  });

  it('fails on a static cycle between chunks, whatever the sizes', () => {
    const { graph, contents, file } = fixture();
    expect(evaluate(loadGraph(graph), createSizer((name) => contents[name]), config, Object.keys(contents)).cycles).toEqual([]);
    // Like the 0985b01 cards chunk: Home imports it, and it imports Home back.
    graph.chunks[file('vendor')].imports.push(file('Home'));
    const result = evaluate(loadGraph(graph), createSizer((name) => contents[name]), config, Object.keys(contents));
    expect(result.cycles).toEqual([[file('vendor'), file('Home'), file('vendor')]]);
    expect(result.failed).toBe(true);
    expect(render(result)).toContain('Cicli tra chunk statici: 1  FAIL');
  });

  it('rejects an incomplete or stale graph instead of measuring it', () => {
    expect(() => loadGraph({})).toThrow(BudgetInputError);
    const { graph, contents, file } = fixture();
    graph.chunks[file('Home')].imports.push('assets/gone.js');
    const build = loadGraph(graph);
    expect(() => closureOf(build, ['src/pages/Home.tsx'])).toThrow(/missing chunk: assets\/gone.js/);
    const sizer = createSizer((name) => (name.includes('vendor') ? null : contents[name]));
    expect(() => sizer.measure(new Set([file('vendor')]))).toThrow(/Missing build file/);
    expect(() => measureSurfaces(loadGraph(fixture().graph), createSizer((name) => contents[name]), [{ id: 'x', sources: ['index.html'], requires: 'nowhere' }])).toThrow(/Unknown surface nowhere/);
  });
});
