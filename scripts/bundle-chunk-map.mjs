import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import * as config from './performance-budget.config.mjs';
import { chunkMap } from './performance-budget/chunk-map.mjs';
import { GRAPH_FILE, createSizer, isCode, loadGraph } from './performance-budget/metrics.mjs';

/*
 * Prints the chunk map of the last `npm run build` (raw, gzip, how each file
 * loads, who imports it, which budget surfaces reach it, its source owner).
 * Informative: the budget itself is `npm run build:budget`.
 *   node scripts/bundle-chunk-map.mjs           table
 *   node scripts/bundle-chunk-map.mjs --json    full data
 *   node scripts/bundle-chunk-map.mjs --outside only the code no surface reaches
 */
const DIST = path.resolve('dist');
const walk = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(directory, entry.name);
  return entry.isDirectory() ? walk(full) : [full];
});

const build = loadGraph(JSON.parse(readFileSync(path.resolve(GRAPH_FILE), 'utf8')));
const sizer = createSizer((file) => {
  try {
    return readFileSync(path.join(DIST, ...file.split('/')));
  } catch {
    return null;
  }
});
const codeFiles = walk(path.join(DIST, 'assets'))
  .map((file) => path.relative(DIST, file).split(path.sep).join('/'))
  .filter(isCode)
  .sort();
const map = chunkMap(build, sizer, config.surfaces, codeFiles);
const args = new Set(process.argv.slice(2));
const rows = args.has('--outside') ? map.filter((entry) => entry.surfaces.length === 0) : map;

if (args.has('--json')) {
  console.log(JSON.stringify(rows, null, 1));
} else {
  const kb = (bytes) => `${(bytes / 1_000).toFixed(1)} KB`;
  for (const entry of rows) {
    const owners = entry.owners.slice(0, 3).map(([owner, bytes]) => `${owner} ${kb(bytes)}`).join(', ');
    console.log(
      [
        kb(entry.raw).padStart(10),
        kb(entry.gzip).padStart(10),
        entry.kind.padEnd(8),
        entry.label.slice(0, 70).padEnd(70),
        `surfaces: ${entry.surfaces.join(',') || 'none'}`,
        owners ? `owners: ${owners}` : '',
      ].join('  '),
    );
  }
  const sum = (key) => rows.reduce((total, entry) => total + entry[key], 0);
  console.log(`\n${rows.length} files · ${kb(sum('raw'))} raw · ${kb(sum('gzip'))} gzip`);
}
