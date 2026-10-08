import { createHash } from 'node:crypto';
import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { deflateRawSync, gzipSync } from 'node:zlib';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const distDirectory = path.join(root, 'dist');
const outputDirectory = path.join(root, 'release-artifacts');
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const packageVersion = process.env.DOMUSOS_PACKAGE_VERSION?.trim() || packageJson.version;
const semverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
if (!semverPattern.test(packageVersion)) {
  throw new Error(`Versione pacchetto non valida: ${packageVersion}`);
}
const releaseName = `${packageJson.name}-${packageVersion}`;

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

async function collectFiles(directory, relativeDirectory = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(absolutePath, relativePath));
    } else if (entry.isFile()) {
      files.push({
        path: relativePath,
        content: await readFile(absolutePath),
      });
    }
  }

  return files;
}

function writeString(buffer, offset, length, value) {
  buffer.write(value.slice(0, length), offset, length, 'utf8');
}

function writeOctal(buffer, offset, length, value) {
  const encoded = Math.max(0, value).toString(8).padStart(length - 1, '0');
  writeString(buffer, offset, length, `${encoded}\0`);
}

function splitTarPath(filePath) {
  if (Buffer.byteLength(filePath) <= 100) {
    return { name: filePath, prefix: '' };
  }

  const separators = [...filePath.matchAll(/\//g)].map((match) => match.index ?? 0).reverse();
  for (const separator of separators) {
    const prefix = filePath.slice(0, separator);
    const name = filePath.slice(separator + 1);
    if (Buffer.byteLength(name) <= 100 && Buffer.byteLength(prefix) <= 155) {
      return { name, prefix };
    }
  }

  throw new Error(`Percorso troppo lungo per il pacchetto tar: ${filePath}`);
}

function createTarHeader(filePath, size) {
  const header = Buffer.alloc(512);
  const { name, prefix } = splitTarPath(filePath);

  writeString(header, 0, 100, name);
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  writeString(header, 156, 1, '0');
  writeString(header, 257, 6, 'ustar\0');
  writeString(header, 263, 2, '00');
  writeString(header, 265, 32, 'root');
  writeString(header, 297, 32, 'root');
  writeString(header, 345, 155, prefix);

  const checksum = header.reduce((total, byte) => total + byte, 0);
  const encodedChecksum = checksum.toString(8).padStart(6, '0');
  writeString(header, 148, 8, `${encodedChecksum}\0 `);
  return header;
}

function createTar(files) {
  const chunks = [];
  for (const file of files) {
    chunks.push(createTarHeader(file.path, file.content.length), file.content);
    const remainder = file.content.length % 512;
    if (remainder !== 0) {
      chunks.push(Buffer.alloc(512 - remainder));
    }
  }
  chunks.push(Buffer.alloc(1024));
  return Buffer.concat(chunks);
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(value) {
  let crc = 0xffffffff;
  for (const byte of value) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZip(files) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const file of files) {
    const name = Buffer.from(file.path.replaceAll('\\', '/'), 'utf8');
    const compressed = deflateRawSync(file.content, { level: 9 });
    const checksum = crc32(file.content);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(file.content.length, 22);
    localHeader.writeUInt16LE(name.length, 26);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(0x0314, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(file.content.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    centralHeader.writeUInt32LE(localOffset, 42);

    localParts.push(localHeader, name, compressed);
    centralParts.push(centralHeader, name);
    localOffset += localHeader.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

async function readRequiredFile(filePath) {
  try {
    return await readFile(filePath);
  } catch {
    throw new Error(`File richiesto non trovato: ${path.relative(root, filePath)}`);
  }
}

const distIndex = path.join(distDirectory, 'index.html');
if (!(await stat(distIndex).catch(() => null))?.isFile()) {
  throw new Error('Build non trovata. Esegui npm run build prima di creare il pacchetto.');
}

const bridgeDocumentation = await readFile(
  path.join(root, 'docs', 'home-assistant-panel-bridge.md'),
  'utf8',
);
const bridgeMatch = bridgeDocumentation.match(/```js\r?\n([\s\S]*?)\r?\n```/);
if (!bridgeMatch) {
  throw new Error('Il bridge panel non è presente nella documentazione ufficiale del progetto.');
}

// Vite emits the bridge beside index.html so copying dist directly remains a
// complete panel installation. The release package injects the same canonical
// bridge below, therefore exclude the emitted copy to avoid duplicate tar and
// manifest entries.
const applicationFiles = (await collectFiles(distDirectory, 'app'))
  .filter((file) => file.path !== 'app/ha-dashboard-builder-panel.js');
const supportFiles = [
  {
    path: 'app/ha-dashboard-builder-panel.js',
    content: Buffer.from(`${bridgeMatch[1].trim()}\n`, 'utf8'),
  },
  {
    path: 'INSTALL.md',
    content: await readRequiredFile(path.join(root, 'docs', 'installation-beta.md')),
  },
  {
    path: 'UPDATE-AND-ROLLBACK.md',
    content: await readRequiredFile(path.join(root, 'docs', 'update-and-rollback.md')),
  },
  {
    path: 'SECURITY-AND-PRIVACY.md',
    content: await readRequiredFile(path.join(root, 'docs', 'security-and-privacy.md')),
  },
  {
    path: 'CHANGELOG.md',
    content: await readRequiredFile(path.join(root, 'CHANGELOG.md')),
  },
];

const packagedFiles = [...applicationFiles, ...supportFiles].map((file) => ({
  path: `${releaseName}/${file.path}`,
  content: file.content,
}));

const integrationSourceDirectory = path.join(root, 'custom_components', 'domusos');
const integrationSourceFiles = await collectFiles(
  integrationSourceDirectory,
  '',
);
const integrationFiles = integrationSourceFiles
  .filter((file) =>
    !file.path.startsWith('frontend/') &&
    !file.path.includes('/frontend/') &&
    !file.path.includes('__pycache__/') &&
    !file.path.endsWith('.pyc'),
  )
  .map((file) => {
    if (file.path === 'const.py' || file.path.endsWith('/const.py')) {
      return {
        ...file,
        content: Buffer.from(
          file.content
            .toString('utf8')
            .replace(/^VERSION\s*=\s*"[^"]+"/m, `VERSION = "${packageVersion}"`),
          'utf8',
        ),
      };
    }
    if (file.path === 'manifest.json' || file.path.endsWith('/manifest.json')) {
      const manifestJson = JSON.parse(file.content.toString('utf8'));
      manifestJson.version = packageVersion;
      return {
        ...file,
        content: Buffer.from(`${JSON.stringify(manifestJson, null, 2)}\n`, 'utf8'),
      };
    }
    return file;
  });
const hacsFrontendFiles = (await collectFiles(distDirectory)).map((file) => ({
  path: `frontend/${file.path}`,
  content: file.content,
}));
const hacsFiles = [...integrationFiles, ...hacsFrontendFiles];
const manifest = {
  name: packageJson.name,
  version: packageVersion,
  format: 1,
  appDirectory: 'app',
  panelBridge: 'app/ha-dashboard-builder-panel.js',
  files: packagedFiles.map((file) => ({
    path: file.path.slice(releaseName.length + 1),
    bytes: file.content.length,
    sha256: sha256(file.content),
  })),
};
packagedFiles.push({
  path: `${releaseName}/release-manifest.json`,
  content: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8'),
});

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

const archive = gzipSync(createTar(packagedFiles), { level: 9 });
const archiveName = `${releaseName}.tar.gz`;
const archivePath = path.join(outputDirectory, archiveName);
const checksum = sha256(archive);
await writeFile(archivePath, archive);

const hacsArchiveName = 'domusos.zip';
const hacsArchivePath = path.join(outputDirectory, hacsArchiveName);
const hacsArchive = createZip(hacsFiles);
const hacsChecksum = sha256(hacsArchive);
await writeFile(hacsArchivePath, hacsArchive);
await writeFile(
  path.join(outputDirectory, 'SHA256SUMS'),
  `${checksum}  ${archiveName}\n${hacsChecksum}  ${hacsArchiveName}\n`,
  'utf8',
);

console.log(`Pacchetto creato: ${path.relative(root, archivePath)}`);
console.log(`SHA-256: ${checksum}`);
console.log(`Pacchetto HACS creato: ${path.relative(root, hacsArchivePath)}`);
console.log(`SHA-256 HACS: ${hacsChecksum}`);
