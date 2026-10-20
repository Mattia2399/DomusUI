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
import { chunkLabel, chunkMap, ownerOf } from './chunk-map.mjs';
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

describe('performance budget accounting (PERF.1)', () => {
  /** The fixture plus a lazy feature behind Energy: its page and a runtime sharing a helper chunk. */
  function withFeature(hash = 'a1') {
    const { graph, contents, file } = fixture(hash);
    graph.chunks[file('Energy')].dynamicImports.push(file('FeaturePage'), file('FeatureRuntime'));
    graph.chunks[file('FeaturePage')] = { src: 'src/components/settings/FeaturePage.tsx', isDynamicEntry: true, imports: [file('index'), file('featureHelper')], dynamicImports: [], css: [], modules: { 'src/components/settings/FeaturePage.tsx': 10 } };
    graph.chunks[file('FeatureRuntime')] = { src: 'src/components/kiosk/FeatureRuntime.tsx', isDynamicEntry: true, imports: [file('index'), file('featureHelper')], dynamicImports: [], css: [], modules: { 'src/components/kiosk/FeatureRuntime.tsx': 10 } };
    graph.chunks[file('featureHelper')] = { src: null, name: 'featureHelper', imports: [], dynamicImports: [], css: [], modules: { 'src/components/kiosk/helper.ts': 30, 'src/components/kiosk/other.ts': 5 } };
    for (const [name, size] of [['FeaturePage', 300], ['FeatureRuntime', 200], ['featureHelper', 100]]) {
      contents[file(name)] = Buffer.from(name.repeat(size).slice(0, size));
    }
    return { build: loadGraph(graph), sizer: createSizer((name) => contents[name] ?? null), codeFiles: Object.keys(contents), file };
  }
  const feature = { id: 'feature', label: 'Feature', sources: ['src/components/settings/FeaturePage.tsx', 'src/components/kiosk/FeatureRuntime.tsx'], requires: 'energy', kind: 'feature', budget: { metric: 'incremental', raw: { warning: 700, limit: 800 }, gzip: { limit: 2000 } } };
  const sum = (files, sizer) => [...files].reduce((total, name) => total + sizer.sizeOf(name).raw, 0);

  it('measures a feature from several entries, counting the chunk they share once', () => {
    const { build, sizer, file } = withFeature();
    const measured = measureSurfaces(build, sizer, [...surfaces, feature]).find((surface) => surface.id === 'feature');
    expect([...measured.added].sort()).toEqual([file('FeaturePage'), file('FeatureRuntime'), file('featureHelper')].sort());
    expect(measured.incremental.raw).toBe(300 + 200 + 100);
  });

  it('never loses or adds bytes: the total is every file, whatever the surfaces', () => {
    const { build, sizer, codeFiles } = withFeature();
    const without = evaluate(build, sizer, config, codeFiles);
    const withSurface = evaluate(build, sizer, { ...config, surfaces: [...surfaces, feature] }, codeFiles);
    const all = sum(codeFiles, sizer);

    expect(without.total.values.raw).toBe(all);
    expect(withSurface.total.values.raw).toBe(all);
    // Giving the feature a surface moves its files out of the unattributed code, nothing else.
    expect(without.unattributed.values.raw - withSurface.unattributed.values.raw).toBe(600);
    const reached = new Set(measureSurfaces(build, sizer, [...surfaces, feature]).flatMap((surface) => [...surface.files]));
    expect(sum(reached, sizer) + withSurface.unattributed.values.raw).toBe(all);
  });

  it('names the unattributed files by source, largest first, never by hash', () => {
    const names = (hash) => {
      const { build, sizer, codeFiles } = withFeature(hash);
      return evaluate(build, sizer, config, codeFiles).unattributed.details.map((entry) => [entry.label, entry.raw]);
    };
    expect(names('a1')).toEqual([
      ['node_modules/map/worker.mjs', 900],
      ['src/components/settings/FeaturePage.tsx', 300],
      ['src/components/kiosk/FeatureRuntime.tsx', 200],
      ['featureHelper (src/components/kiosk/helper.ts)', 100],
    ]);
    expect(names('zz9')).toEqual(names('a1'));
    const { build, sizer, codeFiles } = withFeature();
    expect(render(evaluate(build, sizer, config, codeFiles))).toContain('src/components/settings/FeaturePage.tsx');
  });

  it('maps every file to its kind, importers, surfaces and owner, the same way on every build', () => {
    const map = (hash) => {
      const { build, sizer, codeFiles } = withFeature(hash);
      // The fixture's bytes include the file name, so only gzip may differ between hashes.
      return chunkMap(build, sizer, [...surfaces, feature], codeFiles).map(({ file, gzip, ...entry }) => entry);
    };
    const first = map('a1');
    expect(map('zz9')).toEqual(first);
    const helper = first.find((entry) => entry.label.startsWith('featureHelper'));
    expect(helper).toMatchObject({ kind: 'shared', owner: 'KIOSK', surfaces: ['feature'] });
    expect(helper.importedBy).toEqual(['src/components/kiosk/FeatureRuntime.tsx', 'src/components/settings/FeaturePage.tsx']);
    const page = first.find((entry) => entry.label === 'src/components/settings/FeaturePage.tsx');
    expect(page).toMatchObject({ kind: 'dynamic', owner: 'SETTINGS', loadedLaterBy: ['src/pages/Energy.tsx'] });
    expect(first.find((entry) => entry.label === 'index.html')).toMatchObject({ kind: 'entry' });
  });

  it('attributes owners from module paths, vendors by package', () => {
    expect(ownerOf('src/components/kiosk/DomusKiosk.tsx')).toBe('KIOSK');
    expect(ownerOf('src/components/settings/KioskSettings.tsx')).toBe('KIOSK');
    expect(ownerOf('src/components/settings/DevicePowerSettings.tsx')).toBe('POWER');
    expect(ownerOf('src/components/screensaver/idleController.ts')).toBe('SCREENSAVER');
    expect(ownerOf('src/components/settings/SettingsList.tsx')).toBe('SETTINGS');
    expect(ownerOf('node_modules/@headlessui/react/dist/index.js')).toBe('vendor:@headlessui/react');
    expect(ownerOf('node_modules/recharts/es6/index.js')).toBe('vendor:recharts');
    expect(chunkLabel({ src: null, name: 'icons', modules: {} })).toBe('icons (empty)');
  });
});

describe('performance budget accounting (PERF.2)', () => {
  /*
   * The fixture plus first-run setup: the entry loads one language catalog and
   * the setup words of that language (one chunk per language), and setup
   * itself is a dynamic entry that needs both.
   */
  function withSetup(hash = 'a1') {
    const { graph, contents, file } = fixture(hash);
    const entry = graph.chunks[file('index')];
    entry.dynamicImports.push(file('catalog-fr'), file('catalog-it'), file('setup-fr'), file('setup-it'), file('Setup'));
    graph.chunks[file('catalog-fr')] = { src: 'virtual:domus-i18n/fr', isDynamicEntry: true, imports: [], dynamicImports: [], css: [], modules: { 'virtual:domus-i18n/fr': 10 } };
    graph.chunks[file('catalog-it')] = { src: 'virtual:domus-i18n/it', isDynamicEntry: true, imports: [], dynamicImports: [], css: [], modules: { 'virtual:domus-i18n/it': 10 } };
    graph.chunks[file('setup-fr')] = { src: 'src/i18n/onboarding/fr.ts', isDynamicEntry: true, imports: [], dynamicImports: [], css: [], modules: { 'src/i18n/onboarding/fr.ts': 10 } };
    graph.chunks[file('setup-it')] = { src: 'src/i18n/onboarding/it.ts', isDynamicEntry: true, imports: [], dynamicImports: [], css: [], modules: { 'src/i18n/onboarding/it.ts': 10 } };
    graph.chunks[file('Setup')] = { src: 'src/components/onboarding/OnboardingExperience.tsx', isDynamicEntry: true, imports: [file('index'), file('vendor')], dynamicImports: [], css: [], modules: { 'src/components/onboarding/OnboardingExperience.tsx': 10 } };
    for (const [name, size] of [['catalog-fr', 800], ['catalog-it', 700], ['setup-fr', 120], ['setup-it', 110], ['Setup', 400]]) {
      contents[file(name)] = Buffer.from(name.repeat(size).slice(0, size));
    }
    return { build: loadGraph(graph), sizer: createSizer((name) => contents[name] ?? null), codeFiles: Object.keys(contents), file };
  }
  const bootWith = (...sources) => ({ ...surfaces[0], sources: ['index.html', ...sources], budget: { metric: 'cold', raw: { limit: 5000 }, gzip: { limit: 5000 } } });
  const setup = (...sources) => ({ id: 'onboarding', label: 'Onboarding', sources: ['src/components/onboarding/OnboardingExperience.tsx', ...sources], requires: 'boot', kind: 'route', budget: { metric: 'incremental', raw: { limit: 5000 }, gzip: { limit: 5000 } } });
  const localeIt = { id: 'locale-it', label: 'Lingua · Italiano', sources: ['virtual:domus-i18n/it', 'src/i18n/onboarding/it.ts'], requires: 'boot', kind: 'feature' };
  const measure = (current, list) => Object.fromEntries(measureSurfaces(current.build, current.sizer, list).map((surface) => [surface.id, surface]));

  it('counts the setup words of the starting language in Boot when they load at startup', () => {
    const current = withSetup();
    const { boot, onboarding, 'locale-it': it } = measure(current, [bootWith('virtual:domus-i18n/fr', 'src/i18n/onboarding/fr.ts'), surfaces[1], setup(), localeIt]);
    const { file } = current;
    expect(boot.cold.raw).toBe(1000 + 400 + 800 + 120);
    // Setup adds only its own code: the words it needs are already there.
    expect([...onboarding.added].sort()).toEqual([file('Setup'), file('vendor')].sort());
    // Another language costs its catalog and its setup words together.
    expect(it.incremental.raw).toBe(700 + 110);
  });

  it('moves the words between Boot and Onboarding without losing or adding a byte', () => {
    const current = withSetup();
    const startup = measure(current, [bootWith('virtual:domus-i18n/fr', 'src/i18n/onboarding/fr.ts'), setup()]);
    const lazy = measure(current, [bootWith('virtual:domus-i18n/fr'), setup('src/i18n/onboarding/fr.ts')]);
    expect(startup.boot.cold.raw - lazy.boot.cold.raw).toBe(120);
    expect(lazy.onboarding.incremental.raw - startup.onboarding.incremental.raw).toBe(120);
    const totals = [[bootWith('virtual:domus-i18n/fr', 'src/i18n/onboarding/fr.ts'), setup()], [bootWith('virtual:domus-i18n/fr'), setup('src/i18n/onboarding/fr.ts')]]
      .map((list) => evaluate(current.build, current.sizer, { ...config, surfaces: list }, current.codeFiles).total.values.raw);
    expect(totals[0]).toBe(totals[1]);
  });

  it('reports words no surface claims as unattributed, never as free', () => {
    const current = withSetup();
    const result = evaluate(current.build, current.sizer, { ...config, surfaces: [bootWith('virtual:domus-i18n/fr'), setup()] }, current.codeFiles);
    const labels = result.unattributed.details.map((entry) => entry.label);
    expect(labels).toEqual(expect.arrayContaining(['src/i18n/onboarding/fr.ts', 'src/i18n/onboarding/it.ts', 'virtual:domus-i18n/it']));
    expect(ownerOf('src/i18n/onboarding/fr.ts')).toBe('I18N');
  });
});

describe('performance budget accounting (PERF.E1)', () => {
  /*
   * The fixture's Energy route with a chart library chunk, imported either
   * statically by the route or by a charts module the route loads on demand.
   */
  function withCharts(lazyCharts, hash = 'a1') {
    const { graph, contents, file } = fixture(hash);
    const energy = graph.chunks[file('Energy')];
    graph.chunks[file('chartLib')] = { src: null, name: 'CartesianChart', imports: [], dynamicImports: [], css: [], modules: { 'node_modules/recharts/es6/index.js': 10 } };
    contents[file('chartLib')] = Buffer.from('chartLib'.repeat(400).slice(0, 3000));
    if (lazyCharts) {
      energy.dynamicImports.push(file('charts'));
      graph.chunks[file('charts')] = { src: 'src/pages/consumi/consumptionCharts.tsx', isDynamicEntry: true, imports: [file('chartLib')], dynamicImports: [], css: [], modules: { 'src/pages/consumi/consumptionCharts.tsx': 10 } };
      contents[file('charts')] = Buffer.from('charts'.repeat(60).slice(0, 300));
    } else {
      energy.imports.push(file('chartLib'));
      contents[file('Energy')] = Buffer.from('Energy'.repeat(200).slice(0, 800));
    }
    return { build: loadGraph(graph), sizer: createSizer((name) => contents[name] ?? null), codeFiles: Object.keys(contents), file };
  }
  const charts = { id: 'consumption-charts', label: 'Grafici', sources: ['src/pages/consumi/consumptionCharts.tsx'], requires: 'energy', kind: 'feature' };
  const byId = (current, list) => Object.fromEntries(measureSurfaces(current.build, current.sizer, list).map((surface) => [surface.id, surface]));

  it('takes the chart library off the route when the charts load on demand', () => {
    const eager = withCharts(false);
    const lazy = withCharts(true);
    const before = byId(eager, surfaces);
    const after = byId(lazy, [...surfaces, charts]);
    expect(before.energy.added.has(eager.file('chartLib'))).toBe(true);
    expect(after.energy.added.has(lazy.file('chartLib'))).toBe(false);
    expect([...after.energy.onDemand]).toContain(lazy.file('charts'));
    // The library and the charts now count in their own surface, over the route.
    expect([...after['consumption-charts'].added].sort()).toEqual([lazy.file('charts'), lazy.file('chartLib')].sort());
    // Never in Boot or Home.
    for (const id of ['boot', 'home']) expect(after[id].files.has(lazy.file('chartLib'))).toBe(false);
  });

  it('keeps every byte: the route and its charts add up, the total counts each file once', () => {
    const lazy = withCharts(true);
    const measured = byId(lazy, [...surfaces, charts]);
    const sum = (files) => [...files].reduce((total, name) => total + lazy.sizer.sizeOf(name).raw, 0);
    expect(measured.energy.incremental.raw + measured['consumption-charts'].incremental.raw)
      .toBe(sum(new Set([...measured.energy.added, ...measured['consumption-charts'].added])));
    const total = (list) => evaluate(lazy.build, lazy.sizer, { ...config, surfaces: list }, lazy.codeFiles).total.values.raw;
    expect(total([...surfaces, charts])).toBe(total(surfaces));
  });

  it('reports lazy charts without a surface as unattributed, never as free', () => {
    const lazy = withCharts(true);
    const result = evaluate(lazy.build, lazy.sizer, config, lazy.codeFiles);
    expect(result.unattributed.details.map((entry) => entry.label)).toEqual(expect.arrayContaining(['src/pages/consumi/consumptionCharts.tsx']));
    expect(ownerOf('src/pages/consumi/consumptionCharts.tsx')).toBe('ENERGY');
    expect(ownerOf('node_modules/recharts/es6/index.js')).toBe('vendor:recharts');
  });
});
