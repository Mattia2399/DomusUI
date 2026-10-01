import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const viteCli = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));

// Release artifacts must be reproducible and must never inherit a developer's
// personal Home Assistant origins from .env.local. An explicit process value
// has precedence over Vite env files without modifying those files.
const buildResult = spawnSync(process.execPath, [viteCli, 'build'], {
  cwd: root,
  env: {
    ...process.env,
    VITE_CSP_ALLOWED_ORIGINS: '',
  },
  stdio: 'inherit',
});

if (buildResult.error) {
  throw buildResult.error;
}
if (buildResult.status !== 0) {
  process.exit(buildResult.status ?? 1);
}

await import('./package-release.mjs');
await import('./verify-packaged-csp.mjs');
