import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const changelog = await readFile(path.join(root, 'CHANGELOG.md'), 'utf8');
const version = packageJson.version;
const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const heading = new RegExp(`^## ${escapedVersion}(?:\\s+-[^\\n]*)?$`, 'm');
const match = heading.exec(changelog);

if (!match) {
  console.error(`CHANGELOG.md has no release section for ${version}.`);
  process.exit(1);
}

const sectionStart = match.index + match[0].length;
const nextSectionOffset = changelog.slice(sectionStart).search(/^## /m);
const sectionEnd = nextSectionOffset < 0 ? changelog.length : sectionStart + nextSectionOffset;
const previousHeading = nextSectionOffset < 0
  ? null
  : changelog.slice(sectionEnd).match(/^## ([^\s]+)(?:\s+-[^\n]*)?$/m);
const previousVersion = previousHeading?.[1] ?? null;
const releaseChanges = changelog
  .slice(sectionStart, sectionEnd)
  .trim()
  .replace(/^### /gm, '## ');

if (!releaseChanges) {
  console.error(`The ${version} release section in CHANGELOG.md is empty.`);
  process.exit(1);
}

const releaseNotes = [
  `# v${version} - Domus UI v${version}`,
  '',
  '> Domus UI is currently in public beta. Back up important Home Assistant',
  '> configuration before installing an update.',
  '',
  releaseChanges,
  '',
  ...(previousVersion
    ? [`**Full Changelog**: https://github.com/Mattia2399/DomusUI/compare/v${previousVersion}...v${version}`, '']
    : []),
].join('\n');

if (process.argv.includes('--check')) {
  console.log(`Release notes are ready for v${version}.`);
  process.exit(0);
}

const outputPath = path.join(root, 'release-artifacts', 'RELEASE_NOTES.md');
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, releaseNotes, 'utf8');
console.log(`Release notes written to ${path.relative(root, outputPath)}.`);
