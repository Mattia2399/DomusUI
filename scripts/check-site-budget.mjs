import { readFile, readdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const root = new URL('../dist-site/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('.vite/manifest.json', root), 'utf8'));
const byFile = new Map(Object.values(manifest).map((entry) => [entry.file, entry]));
const initial = new Set();
function visit(file) {
  if (initial.has(file)) return;
  initial.add(file);
  const entry = byFile.get(file);
  for (const css of entry?.css ?? []) initial.add(css);
  for (const key of entry?.imports ?? []) visit(manifest[key].file);
}
for (const path of ['index.html', 'en/index.html']) {
  const html = await readFile(new URL(path, root), 'utf8');
  for (const match of html.matchAll(/(?:src|href)="(?:\.\.\/|\.\/)?(assets\/[^"?#]+\.(?:js|css))"/g)) visit(match[1]);
}
if (![...initial].some((file) => file.endsWith('.js'))) throw new Error('No site entry found');
const all = (await readdir(new URL('assets/', root))).map((name) => `assets/${name}`);
async function size(files) {
  const buffers = await Promise.all(files.map((file) => readFile(new URL(file, root))));
  return { raw: buffers.reduce((sum, b) => sum + b.length, 0), gzip: buffers.reduce((sum, b) => sum + gzipSync(b).length, 0) };
}
const groups = [
  ['Initial JS', [...initial].filter((f) => f.endsWith('.js')), 500_000, 160_000],
  ['Initial CSS', [...initial].filter((f) => f.endsWith('.css')), 190_000, 33_000],
  ['All JS, including demos', all.filter((f) => f.endsWith('.js')), 1_200_000, 330_000],
  ['All CSS, including demos', all.filter((f) => f.endsWith('.css')), 320_000, 53_000],
];
for (const [label, files, rawLimit, gzipLimit] of groups) {
  const bytes = await size(files);
  console.log(`${label}: ${(bytes.raw / 1000).toFixed(1)} KB raw / ${(bytes.gzip / 1000).toFixed(1)} KB gzip`);
  if (bytes.raw > rawLimit || bytes.gzip > gzipLimit) {
    console.error(`Budget exceeded: ${rawLimit} bytes raw / ${gzipLimit} bytes gzip`);
    process.exitCode = 1;
  }
}
