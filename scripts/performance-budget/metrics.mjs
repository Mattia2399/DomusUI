import path from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';

/*
 * Metrics of a production build, from the graph written by the bundle-graph
 * plugin (build/bundle-graph.json): the chunks Rollup emitted with their
 * source entry, static and dynamic imports and the CSS Vite attaches to them.
 * Surfaces are found by source module id, never by hashed file name.
 *
 * - The static closure of a surface is every chunk its roots import, followed
 *   transitively through static imports only, plus the CSS of those chunks:
 *   what the browser must fetch before the surface can render.
 * - Dynamic imports are never followed: they load later, when the code asks.
 * - A file shared by several surfaces counts once in each closure, and once in
 *   any union of closures.
 * - Sizes are the bytes on disk (raw) and gzip at the default zlib level, the
 *   compression a web server typically applies; Brotli is informational only.
 */

export const GRAPH_FILE = 'build/bundle-graph.json';

export class BudgetInputError extends Error {}

/** Index the graph: chunks by file name, and the chunk each source entry produced. */
export function loadGraph(graph) {
  if (!graph || typeof graph !== 'object' || !graph.chunks || typeof graph.chunks !== 'object') {
    throw new BudgetInputError('The bundle graph has no chunks: run `npm run build` first.');
  }
  const chunks = new Map(Object.entries(graph.chunks));
  const bySource = new Map();
  const byModule = new Map();
  for (const [file, chunk] of chunks) {
    if (chunk.src) bySource.set(chunk.src, file);
    for (const module of Object.keys(chunk.modules ?? {})) {
      byModule.set(module, [...(byModule.get(module) ?? []), file]);
    }
  }
  const assets = new Map(Object.entries(graph.assets ?? {}));
  return { chunks, bySource, byModule, assets };
}

/**
 * The chunk that loads a source module (`src/pages/Home.tsx`, `index.html`…):
 * the chunk it is the facade of, or else the only chunk containing it (Rollup
 * leaves the facade empty when a dynamic entry shares its chunk).
 */
export function chunkFor(build, source) {
  const facade = build.bySource.get(source);
  if (facade) return facade;
  const holders = build.byModule.get(source) ?? [];
  if (holders.length === 1) return holders[0];
  throw new BudgetInputError(
    holders.length
      ? `${source} is in several chunks (${holders.join(', ')}): name the surface by an entry`
      : `No chunk for ${source}: the surface configuration no longer matches the build.`,
  );
}

/** JavaScript chunks reached from ``roots`` through static imports. */
export function staticChunks(build, roots) {
  const closure = new Set();
  const pending = [...roots];
  while (pending.length) {
    const file = pending.pop();
    if (closure.has(file)) continue;
    const chunk = build.chunks.get(file);
    if (!chunk) throw new BudgetInputError(`The graph references a missing chunk: ${file}`);
    closure.add(file);
    pending.push(...chunk.imports);
  }
  return closure;
}

/** Every file a set of chunks needs: the chunks and their CSS. */
export function withCss(build, chunkFiles) {
  const files = new Set(chunkFiles);
  for (const file of chunkFiles) for (const css of build.chunks.get(file).css ?? []) files.add(css);
  return files;
}

/** The files of the static closure of source entries (plus explicit files, e.g. a worker). */
export function closureOf(build, sources, extraFiles = []) {
  return withCss(build, staticChunks(build, [...sources.map((source) => chunkFor(build, source)), ...extraFiles]));
}

/** Files loaded only later from a set: the dynamic imports of its chunks that it does not already contain. */
export function dynamicImportsOf(build, files) {
  const later = new Set();
  for (const file of files) {
    for (const target of build.chunks.get(file)?.dynamicImports ?? []) if (!files.has(target)) later.add(target);
  }
  return later;
}

export const difference = (files, already) => new Set([...files].filter((file) => !already.has(file)));

/** Raw and gzip bytes of each file, read once. */
export function createSizer(readFile, { brotli = false } = {}) {
  const cache = new Map();
  const sizeOf = (file) => {
    if (!cache.has(file)) {
      const contents = readFile(file);
      if (!contents) throw new BudgetInputError(`Missing build file: ${file}`);
      cache.set(file, {
        raw: contents.byteLength,
        gzip: gzipSync(contents).byteLength,
        ...(brotli ? { brotli: brotliCompressSync(contents).byteLength } : {}),
      });
    }
    return cache.get(file);
  };
  const measure = (files) => {
    const total = { raw: 0, gzip: 0, files: files.size, js: 0, css: 0 };
    for (const file of files) {
      const size = sizeOf(file);
      total.raw += size.raw;
      total.gzip += size.gzip;
      if (size.brotli !== undefined) total.brotli = (total.brotli ?? 0) + size.brotli;
      if (file.endsWith('.css')) total.css += size.raw;
      else total.js += size.raw;
    }
    return total;
  };
  return { sizeOf, measure };
}

export const isCode = (file) => file.endsWith('.js') || file.endsWith('.css');

/**
 * Resolve every surface of the configuration: its cold closure (with the
 * surfaces it requires), what it adds to its parent, and what it can load
 * later on demand.
 */
export function measureSurfaces(build, sizer, surfaces) {
  const byId = new Map(surfaces.map((surface) => [surface.id, surface]));
  const cold = new Map();
  const coldOf = (id, trail = []) => {
    if (cold.has(id)) return cold.get(id);
    const surface = byId.get(id);
    if (!surface) throw new BudgetInputError(`Unknown surface ${id}${trail.length ? ` (required by ${trail.at(-1)})` : ''}`);
    if (trail.includes(id)) throw new BudgetInputError(`Surface ${id} requires itself`);
    const parent = surface.requires ? coldOf(surface.requires, [...trail, id]) : new Set();
    const own = closureOf(build, surface.sources, (surface.files ?? []).map((name) => findEntryFile(build, name)));
    const files = new Set([...parent, ...own]);
    cold.set(id, files);
    return files;
  };
  return surfaces.map((surface) => {
    const files = coldOf(surface.id);
    const parentFiles = surface.requires ? coldOf(surface.requires) : new Set();
    const added = difference(files, parentFiles);
    return {
      ...surface,
      files,
      added,
      cold: sizer.measure(files),
      incremental: sizer.measure(added),
      onDemand: dynamicImportsOf(build, added),
    };
  });
}

/** An entry chunk by its exact output name (the MapLibre worker has a stable name). */
export function findEntryFile(build, fileName) {
  const file = [...build.chunks.keys()].find((name) => path.posix.basename(name) === fileName);
  if (!file) throw new BudgetInputError(`No output file named ${fileName}`);
  return file;
}

/** Status of one value against `{ warning, limit }`: hard limits fail, warnings only report. */
export function statusOf(value, budget) {
  if (!budget) return 'INFO';
  if (budget.limit !== undefined && value > budget.limit) return 'FAIL';
  if (budget.warning !== undefined && value > budget.warning) return 'WARN';
  return 'OK';
}

export const worst = (statuses) =>
  ['FAIL', 'WARN', 'OK', 'INFO'].find((status) => statuses.includes(status)) ?? 'OK';
