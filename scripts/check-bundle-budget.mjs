import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const DIST_DIR = path.resolve('dist/assets');

const budgets = {
  '.js': { warning: 2_500_000, blocking: 2_900_000 },
  '.css': { warning: 550_000, blocking: 700_000 },
};

// The total includes every lazy route and the complete IT/EN/FR catalog. Keep
// per-chunk limits strict; allow the deliberate multilingual payload globally.
const totalBudget = { warning: 4_800_000, blocking: 5_400_000 };

const formatBytes = (bytes) => `${(bytes / 1_000_000).toFixed(2)} MB`;

const collectFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(filePath);
    const metadata = await stat(filePath);
    return [{ name: path.relative(DIST_DIR, filePath), size: metadata.size }];
  }));
  return files.flat();
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
