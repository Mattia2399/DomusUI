// @vitest-environment node

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadLocalHttpsOptions } from '../../vite.localHttps';

const temporaryDirectories: string[] = [];

function createTemporaryProject(): string {
  const projectRoot = mkdtempSync(path.join(tmpdir(), 'domus-ui-vite-https-'));
  temporaryDirectories.push(projectRoot);
  mkdirSync(path.join(projectRoot, '.cert'));
  return projectRoot;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('loadLocalHttpsOptions', () => {
  it('keeps HTTP when the local certificate pair is missing', () => {
    const projectRoot = createTemporaryProject();

    expect(loadLocalHttpsOptions(projectRoot)).toBeUndefined();
  });

  it('keeps HTTP when only one certificate file exists', () => {
    const projectRoot = createTemporaryProject();
    writeFileSync(path.join(projectRoot, '.cert', 'localhost.pem'), 'certificate');

    expect(loadLocalHttpsOptions(projectRoot)).toBeUndefined();
  });

  it('loads the certificate pair when both files exist', () => {
    const projectRoot = createTemporaryProject();
    writeFileSync(path.join(projectRoot, '.cert', 'localhost.pem'), 'certificate');
    writeFileSync(path.join(projectRoot, '.cert', 'localhost-key.pem'), 'private-key');

    const https = loadLocalHttpsOptions(projectRoot);

    expect(https?.cert).toEqual(Buffer.from('certificate'));
    expect(https?.key).toEqual(Buffer.from('private-key'));
  });
});
