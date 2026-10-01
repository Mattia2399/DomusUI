import { readFile } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const CARTO_MAP_ORIGIN = 'https://tiles.basemaps.cartocdn.com';

function extractCsp(html, sourceLabel) {
  const metaTag = html.match(
    /<meta\s+[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/i,
  )?.[0];
  const policy = metaTag?.match(/\bcontent=(["'])([\s\S]*?)\1/i)?.[2];
  if (!policy) {
    throw new Error(`CSP non trovata in ${sourceLabel}.`);
  }
  return policy;
}

function parseDirectives(policy) {
  return new Map(policy.split(';').map((entry) => {
    const [directive, ...sources] = entry.trim().split(/\s+/);
    return [directive, sources];
  }));
}

function assertDefaultDistributionPolicy(policy, sourceLabel) {
  const directives = parseDirectives(policy);
  const imageSources = directives.get('img-src') ?? [];
  const connectSources = directives.get('connect-src') ?? [];

  if (imageSources.filter((source) => source === CARTO_MAP_ORIGIN).length !== 1) {
    throw new Error(`${sourceLabel}: CARTO deve comparire una volta in img-src.`);
  }
  if (connectSources.filter((source) => source === CARTO_MAP_ORIGIN).length !== 1) {
    throw new Error(`${sourceLabel}: CARTO deve comparire una volta in connect-src.`);
  }

  const broadSources = new Set(['*', 'http:', 'https:', 'ws:', 'wss:']);
  const externalOrigins = new Set();
  for (const [directive, sources] of directives) {
    for (const source of sources) {
      if (broadSources.has(source)) {
        throw new Error(`${sourceLabel}: sorgente CSP troppo ampia in ${directive}: ${source}`);
      }
      if (/^(?:https?|wss?):\/\//.test(source)) {
        externalOrigins.add(source);
      }
      if (source === CARTO_MAP_ORIGIN && directive !== 'img-src' && directive !== 'connect-src') {
        throw new Error(`${sourceLabel}: CARTO non deve essere autorizzato in ${directive}.`);
      }
    }
  }

  if (
    externalOrigins.size !== 1
    || !externalOrigins.has(CARTO_MAP_ORIGIN)
  ) {
    throw new Error(
      `${sourceLabel}: la build distribuibile contiene origin esterni inattesi: ${[...externalOrigins].join(', ')}`,
    );
  }
}

function readZipEntry(archive, expectedName) {
  let offset = 0;
  while (offset + 30 <= archive.length && archive.readUInt32LE(offset) === 0x04034b50) {
    const compressionMethod = archive.readUInt16LE(offset + 8);
    const compressedSize = archive.readUInt32LE(offset + 18);
    const fileNameLength = archive.readUInt16LE(offset + 26);
    const extraFieldLength = archive.readUInt16LE(offset + 28);
    const fileNameStart = offset + 30;
    const fileNameEnd = fileNameStart + fileNameLength;
    const dataStart = fileNameEnd + extraFieldLength;
    const dataEnd = dataStart + compressedSize;
    const fileName = archive.subarray(fileNameStart, fileNameEnd).toString('utf8');

    if (fileName === expectedName) {
      const compressed = archive.subarray(dataStart, dataEnd);
      if (compressionMethod === 0) return compressed;
      if (compressionMethod === 8) return inflateRawSync(compressed);
      throw new Error(`Metodo ZIP non supportato per ${expectedName}: ${compressionMethod}`);
    }
    offset = dataEnd;
  }
  throw new Error(`File non trovato nel pacchetto HACS: ${expectedName}`);
}

const distIndexPath = path.join(root, 'dist', 'index.html');
const hacsArchivePath = path.join(root, 'release-artifacts', 'domusos.zip');
const distIndex = await readFile(distIndexPath, 'utf8');
const hacsArchive = await readFile(hacsArchivePath);
const hacsIndex = readZipEntry(hacsArchive, 'frontend/index.html').toString('utf8');
const distPolicy = extractCsp(distIndex, 'dist/index.html');
const hacsPolicy = extractCsp(hacsIndex, 'frontend/index.html nello ZIP HACS');

assertDefaultDistributionPolicy(distPolicy, 'dist/index.html');
assertDefaultDistributionPolicy(hacsPolicy, 'ZIP HACS');
if (distPolicy !== hacsPolicy) {
  throw new Error('La CSP del pacchetto HACS differisce dalla build standalone.');
}

console.log('CSP standalone e HACS verificate: CARTO limitato a img-src e connect-src; nessun origin personale.');
