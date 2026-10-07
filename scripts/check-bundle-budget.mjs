import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import * as config from './performance-budget.config.mjs';
import { BudgetInputError, GRAPH_FILE, createSizer, isCode, loadGraph } from './performance-budget/metrics.mjs';
import { evaluate, render } from './performance-budget/report.mjs';

/*
 * Performance Budget V2 (docs/performance-budget.md): startup, Home, routes
 * and on-demand features are measured on the real build graph, raw and gzip,
 * against the versioned limits of performance-budget.config.mjs. Run after
 * `npm run build`, which writes dist/ and build/bundle-graph.json.
 */

const DIST = path.resolve('dist');
const read = (file) => {
  try {
    return readFileSync(path.join(DIST, ...file.split('/')));
  } catch {
    return null;
  }
};

const walk = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(directory, entry.name);
  return entry.isDirectory() ? walk(full) : [full];
});

try {
  let graph;
  try {
    graph = JSON.parse(readFileSync(path.resolve(GRAPH_FILE), 'utf8'));
  } catch (error) {
    throw new BudgetInputError(`Cannot read ${GRAPH_FILE} (${error.message}): run \`npm run build\` first.`);
  }
  const build = loadGraph(graph);
  const codeFiles = walk(path.join(DIST, 'assets'))
    .map((file) => path.relative(DIST, file).split(path.sep).join('/'))
    .filter(isCode)
    .sort();
  // The graph must describe this very build: same JS files, nothing missing either way.
  const graphJs = [...build.chunks.keys()].sort();
  const distJs = codeFiles.filter((file) => file.endsWith('.js'));
  if (graphJs.join('\n') !== distJs.join('\n')) {
    throw new BudgetInputError(`${GRAPH_FILE} does not match dist/: rebuild with \`npm run build\`.`);
  }

  const result = evaluate(build, createSizer(read), config, codeFiles);
  console.log(render(result));

  // Static files are reported, never budgeted: only one Energy house variant loads at runtime.
  const statics = walk(DIST).filter((file) => !(isCode(file) && file.includes(`${path.sep}assets${path.sep}`)));
  const staticBytes = statics.reduce((sum, file) => sum + statSync(file).size, 0);
  const large = statics.filter((file) => statSync(file).size > config.largeStaticFile);
  console.log(`\nAsset statici (informativo, fuori dal budget JS + CSS): ${(staticBytes / 1_000).toFixed(1)} KB in ${statics.length} file`);
  for (const file of large) {
    console.log(`  oltre ${config.largeStaticFile / 1_000} KB: ${path.relative(DIST, file).split(path.sep).join('/')} ${(statSync(file).size / 1_000).toFixed(1)} KB`);
  }

  if (result.failed) process.exit(1);
} catch (error) {
  if (error instanceof BudgetInputError) {
    console.error(`Performance budget: ${error.message}`);
    process.exit(1);
  }
  throw error;
}
