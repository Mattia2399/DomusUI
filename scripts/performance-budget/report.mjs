import { difference, measureSurfaces, staticCycles, statusOf, worst } from './metrics.mjs';

/*
 * Turns measures into checks against the versioned configuration, then into
 * the table printed by CI. A hard limit fails the check; a warning only
 * reports. Nothing here reads files: metrics and configuration come in.
 */

const SIZES = ['raw', 'gzip'];

function check(label, values, budget, extra = {}) {
  const statuses = SIZES.map((size) => statusOf(values[size], budget?.[size]));
  return { label, values, budget, status: budget ? worst(statuses) : 'INFO', ...extra };
}

/**
 * Evaluate a build: `codeFiles` are every JS and CSS file of the distribution,
 * `config` the budget configuration (surfaces, singleFile, total, unattributed).
 */
export function evaluate(build, sizer, config, codeFiles) {
  const surfaces = measureSurfaces(build, sizer, config.surfaces);
  const surfaceChecks = surfaces.map((surface) => {
    const metric = surface.budget?.metric ?? (surface.requires ? 'incremental' : 'cold');
    return check(surface.label, surface[metric], surface.budget, {
      id: surface.id,
      kind: surface.kind ?? 'critical',
      metric,
      base: surface.requires ?? null,
      cold: surface.cold,
      incremental: surface.incremental,
      onDemand: [...surface.onDemand],
    });
  });

  const all = new Set(codeFiles);
  const totals = sizer.measure(all);
  const files = codeFiles.map((file) => ({ file, ...sizer.sizeOf(file) }));
  const fileChecks = files.map((entry) => {
    const budget = config.singleFile[entry.file.endsWith('.css') ? 'css' : 'js'];
    return { ...entry, status: statusOf(entry.raw, budget), budget };
  });
  const largest = (suffix) => fileChecks.filter((entry) => entry.file.endsWith(suffix)).sort((a, b) => b.raw - a.raw)[0];

  const reached = new Set(surfaces.flatMap((surface) => [...surface.files]));
  const unattributedFiles = difference(all, reached);
  const unattributed = sizer.measure(unattributedFiles);

  const totalCheck = check('Totale JS + CSS', totals, config.total);
  // Always a hard failure: a static cycle between chunks can break module initialisation.
  const cycles = staticCycles(build);
  const unattributedCheck = check('Codice fuori dalle superfici', unattributed, config.unattributed, { files: [...unattributedFiles] });
  const statuses = [
    ...surfaceChecks.map((item) => item.status),
    ...fileChecks.map((item) => item.status),
    totalCheck.status,
    unattributedCheck.status,
    cycles.length ? 'FAIL' : 'OK',
  ];
  return {
    surfaces: surfaceChecks,
    files: fileChecks,
    largest: { js: largest('.js'), css: largest('.css') },
    totals: { ...totals, js: totals.js, css: totals.css },
    total: totalCheck,
    unattributed: unattributedCheck,
    cycles,
    failed: statuses.includes('FAIL'),
    warned: statuses.includes('WARN'),
  };
}

const kb = (bytes) => `${(bytes / 1_000).toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} KB`;
const pct = (value, limit) => (limit ? `${((value / limit) * 100).toFixed(1)}%` : '');
const pad = (text, width, left = false) => (left ? String(text).padStart(width) : String(text).padEnd(width));

function budgetCells(values, budget, size) {
  const limit = budget?.[size]?.limit;
  if (!limit) return ['—', '', ''];
  return [kb(limit), kb(limit - values[size]), pct(values[size], limit)];
}

/** The CI table: value, hard limit, margin and use of the limit, raw and gzip. */
export function render(result) {
  const lines = [];
  const header = `${pad('Superficie', 44)}${pad('Base', 18)}${pad('Raw', 12, true)}${pad('Limite', 12, true)}${pad('Margine', 12, true)}${pad('Uso', 8, true)}${pad('Gzip', 11, true)}${pad('Limite', 11, true)}${pad('Margine', 11, true)}${pad('Uso', 8, true)}  Stato`;
  const row = (item, base) => {
    const [rawLimit, rawMargin, rawUse] = budgetCells(item.values, item.budget, 'raw');
    const [gzLimit, gzMargin, gzUse] = budgetCells(item.values, item.budget, 'gzip');
    return `${pad(item.label, 44)}${pad(base, 18)}${pad(kb(item.values.raw), 12, true)}${pad(rawLimit, 12, true)}${pad(rawMargin, 12, true)}${pad(rawUse, 8, true)}${pad(kb(item.values.gzip), 11, true)}${pad(gzLimit, 11, true)}${pad(gzMargin, 11, true)}${pad(gzUse, 8, true)}  ${item.status}`;
  };
  const section = (title, items) => {
    lines.push('', title, header, '-'.repeat(header.length));
    for (const item of items) lines.push(row(item, item.metric === 'cold' ? 'freddo' : `+${item.base}`));
  };
  lines.push('Performance Budget V2 · dimensioni in KB (1 KB = 1000 byte), gzip a livello zlib predefinito');
  section('Percorso critico (cache vuota)', result.surfaces.filter((item) => item.kind === 'critical'));
  section('Route (costo aggiunto a Home già caricata)', result.surfaces.filter((item) => item.kind === 'route'));
  section('Funzioni su richiesta (costo aggiunto alla superficie di partenza)', result.surfaces.filter((item) => item.kind === 'feature'));

  lines.push('', 'Costo a freddo di ogni superficie (informativo: già coperto dai limiti sopra)');
  for (const item of result.surfaces) {
    lines.push(`  ${pad(item.label, 44)}${pad(kb(item.cold.raw), 12, true)} raw ${pad(kb(item.cold.gzip), 11, true)} gzip  (${item.cold.files} file)${item.onDemand.length ? ` · ${item.onDemand.length} chunk su richiesta` : ''}`);
  }

  const { js, css } = result.largest;
  lines.push('', 'File singoli');
  for (const [name, entry] of [['JS più grande', js], ['CSS più grande', css]]) {
    if (!entry) continue;
    lines.push(`  ${pad(name, 18)}${pad(entry.file, 44)}${pad(kb(entry.raw), 12, true)} / limite ${kb(entry.budget.limit)} · margine ${kb(entry.budget.limit - entry.raw)} (${pct(entry.raw, entry.budget.limit)})  ${entry.status}`);
  }
  for (const entry of result.files.filter((item) => item.status !== 'OK' && item !== js && item !== css)) {
    lines.push(`  ${pad(entry.file, 62)}${pad(kb(entry.raw), 12, true)} / limite ${kb(entry.budget.limit)}  ${entry.status}`);
  }

  lines.push('', 'Distribuzione');
  lines.push(`  JS ${kb(result.totals.js)} · CSS ${kb(result.totals.css)} · ${result.totals.files} file`);
  lines.push(header, '-'.repeat(header.length), row(result.total, 'tutto'));
  const total = result.total;
  lines.push(`  warning ${kb(total.budget.raw.warning)} raw / ${kb(total.budget.gzip.warning)} gzip · limite ${kb(total.budget.raw.limit)} raw / ${kb(total.budget.gzip.limit)} gzip`);
  lines.push(result.cycles.length
    ? `  Cicli tra chunk statici: ${result.cycles.length}  FAIL`
    : '  Cicli tra chunk statici: nessuno  OK');
  for (const cycle of result.cycles) lines.push(`    ${cycle.join(' -> ')}`);
  const loose = result.unattributed;
  lines.push(`  ${loose.label}: ${kb(loose.values.raw)} raw in ${loose.files.length} file (warning oltre ${kb(loose.budget.raw.warning)})  ${loose.status}`);

  lines.push('', result.failed
    ? 'Performance budget superato: la release viene bloccata.'
    : result.warned
      ? 'Performance budget rispettato con warning.'
      : 'Performance budget rispettato.');
  return lines.join('\n');
}
