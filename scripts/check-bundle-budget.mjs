import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST_DIR = path.resolve('dist/assets');

const budgets = {
  '.js': { warning: 2_500_000, blocking: 2_900_000 },
  '.css': { warning: 550_000, blocking: 700_000 },
};

// The total includes every lazy route and the complete IT/EN/FR catalog. Keep
// per-chunk limits strict; allow the deliberate multilingual payload globally.
// The blocking limit includes ~50 KB for the lazily loaded /beta presentation
// site, which the dashboard never downloads, and ~50 KB (1.3.0) for managing
// Home Assistant people: link, create, pictures and their IT/EN/FR copy.
const totalBudget = { warning: 4_800_000, blocking: 5_500_000 };

// Protect the user-visible startup path separately from the broad per-file
// ceiling. The old 2.9 MB ceiling allowed the entry bundle to regress above
// 1 MB without failing the release gate.
const criticalChunkBudgets = [
  {
    label: 'Startup entry',
    pattern: /^index-[A-Za-z0-9_-]+\.js$/,
    warning: 800_000,
    blocking: 900_000,
  },
  {
    label: 'Primary dashboard',
    pattern: /^Home-[A-Za-z0-9_-]+\.js$/,
    warning: 650_000,
    blocking: 750_000,
  },
  {
    label: 'Onboarding shell',
    pattern: /^OnboardingExperience-[A-Za-z0-9_-]+\.js$/,
    warning: 45_000,
    blocking: 60_000,
  },
];

// A smaller Home file is not necessarily a faster Home: Rollup can move the
// same code into mandatory shared chunks. Measure the de-duplicated static
// import closure rooted at the entry and Home chunks as a separate release
// gate. The warning values round up the measured pre-optimization baseline
// (1.98 MB raw / 0.56 MB gzip); the blocking values leave a narrow margin for
// deliberate changes without weakening any existing budget.
const homeCriticalPathBudget = {
  raw: { warning: 2_000_000, blocking: 2_100_000 },
  gzip: { warning: 570_000, blocking: 600_000 },
};

const formatBytes = (bytes) => `${(bytes / 1_000_000).toFixed(2)} MB`;

const collectFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(filePath);
    const metadata = await stat(filePath);
    return [{
      name: path.relative(DIST_DIR, filePath).split(path.sep).join('/'),
      size: metadata.size,
    }];
  }));
  return files.flat();
};

const extractStaticJavaScriptImports = (source) => {
  const imports = new Set();
  const patterns = [
    /\bfrom\s*["']\.\/([^"']+\.js)["']/g,
    /\bimport\s*["']\.\/([^"']+\.js)["']/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) imports.add(match[1]);
  }

  return imports;
};

const collectStaticJavaScriptClosure = async (roots, availableFiles) => {
  const closure = new Set();
  const pending = [...roots];

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || closure.has(current)) continue;
    closure.add(current);

    const source = await readFile(path.join(DIST_DIR, ...current.split('/')), 'utf8');
    for (const importedFile of extractStaticJavaScriptImports(source)) {
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(current), importedFile));
      if (availableFiles.has(resolved) && !closure.has(resolved)) pending.push(resolved);
    }
  }

  return closure;
};

let files;
try {
  files = await collectFiles(DIST_DIR);
} catch (error) {
  console.error(`Bundle budget: impossibile leggere ${DIST_DIR}. Esegui prima \`npm run build\`.`);
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const measuredFiles = files
  .filter((file) => budgets[path.extname(file.name)])
  .sort((left, right) => right.size - left.size);

if (measuredFiles.length === 0) {
  console.error('Bundle budget: nessun asset JavaScript o CSS trovato nella build.');
  process.exit(1);
}

let hasBlockingFailure = false;
let hasWarning = false;

console.log('Bundle budget (dimensioni raw):');
for (const file of measuredFiles) {
  const extension = path.extname(file.name);
  const budget = budgets[extension];
  let status = 'OK';

  if (file.size > budget.blocking) {
    status = 'FAIL';
    hasBlockingFailure = true;
  } else if (file.size > budget.warning) {
    status = 'WARN';
    hasWarning = true;
  }

  console.log(`- [${status}] ${file.name}: ${formatBytes(file.size)} (warning ${formatBytes(budget.warning)}, limite ${formatBytes(budget.blocking)})`);
}

console.log('Budget chunk critici (dimensioni raw):');
for (const criticalBudget of criticalChunkBudgets) {
  const file = measuredFiles.find((candidate) => criticalBudget.pattern.test(candidate.name));
  if (!file) {
    console.error(`- [FAIL] ${criticalBudget.label}: chunk non trovato`);
    hasBlockingFailure = true;
    continue;
  }

  let status = 'OK';
  if (file.size > criticalBudget.blocking) {
    status = 'FAIL';
    hasBlockingFailure = true;
  } else if (file.size > criticalBudget.warning) {
    status = 'WARN';
    hasWarning = true;
  }

  console.log(
    `- [${status}] ${criticalBudget.label} (${file.name}): ${formatBytes(file.size)} `
      + `(warning ${formatBytes(criticalBudget.warning)}, limite ${formatBytes(criticalBudget.blocking)})`,
  );
}

const javascriptFiles = measuredFiles.filter((file) => path.extname(file.name) === '.js');
const availableJavaScriptFiles = new Map(javascriptFiles.map((file) => [file.name, file]));
const startupEntry = javascriptFiles.find((file) => criticalChunkBudgets[0].pattern.test(file.name));
const primaryDashboard = javascriptFiles.find((file) => criticalChunkBudgets[1].pattern.test(file.name));

if (!startupEntry || !primaryDashboard) {
  console.error('- [FAIL] Percorso critico Home: entry o chunk Home non trovato');
  hasBlockingFailure = true;
} else {
  const criticalPathFiles = await collectStaticJavaScriptClosure(
    [startupEntry.name, primaryDashboard.name],
    availableJavaScriptFiles,
  );
  let criticalPathRawSize = 0;
  let criticalPathGzipSize = 0;

  for (const fileName of criticalPathFiles) {
    const contents = await readFile(path.join(DIST_DIR, ...fileName.split('/')));
    criticalPathRawSize += contents.byteLength;
    criticalPathGzipSize += gzipSync(contents).byteLength;
  }

  let criticalPathStatus = 'OK';
  if (
    criticalPathRawSize > homeCriticalPathBudget.raw.blocking
    || criticalPathGzipSize > homeCriticalPathBudget.gzip.blocking
  ) {
    criticalPathStatus = 'FAIL';
    hasBlockingFailure = true;
  } else if (
    criticalPathRawSize > homeCriticalPathBudget.raw.warning
    || criticalPathGzipSize > homeCriticalPathBudget.gzip.warning
  ) {
    criticalPathStatus = 'WARN';
    hasWarning = true;
  }

  console.log(
    `- [${criticalPathStatus}] Percorso critico Home (${criticalPathFiles.size} chunk statici): `
      + `${formatBytes(criticalPathRawSize)} raw / ${formatBytes(criticalPathGzipSize)} gzip `
      + `(warning ${formatBytes(homeCriticalPathBudget.raw.warning)} / ${formatBytes(homeCriticalPathBudget.gzip.warning)}, `
      + `limite ${formatBytes(homeCriticalPathBudget.raw.blocking)} / ${formatBytes(homeCriticalPathBudget.gzip.blocking)})`,
  );
}

const totalSize = measuredFiles.reduce((sum, file) => sum + file.size, 0);
let totalStatus = 'OK';
if (totalSize > totalBudget.blocking) {
  totalStatus = 'FAIL';
  hasBlockingFailure = true;
} else if (totalSize > totalBudget.warning) {
  totalStatus = 'WARN';
  hasWarning = true;
}

console.log(`- [${totalStatus}] Totale JS + CSS: ${formatBytes(totalSize)} (warning ${formatBytes(totalBudget.warning)}, limite ${formatBytes(totalBudget.blocking)})`);

if (hasBlockingFailure) {
  console.error('Bundle budget superato: la release viene bloccata.');
  process.exit(1);
}

console.log(hasWarning
  ? 'Bundle budget rispettato con warning: pianificare la riduzione nel punto P6.'
  : 'Bundle budget rispettato.');
