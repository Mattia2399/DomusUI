const { defineConfig, devices } = require('@playwright/test');
const { existsSync } = require('node:fs');
const path = require('node:path');

/*
 * Production smoke test: the files of dist/, as built by `npm run build`,
 * served by `vite preview`, never the dev server. It only checks that the
 * distributed build starts and renders its main surfaces (tests/*.smoke.cjs);
 * the complete E2E suite keeps running on the dev server.
 */

const PORT = Number(process.env.SMOKE_PORT || 4173);
const HAS_LOCAL_HTTPS = [
  path.join(__dirname, '.cert', 'localhost.pem'),
  path.join(__dirname, '.cert', 'localhost-key.pem'),
].every(existsSync);
const BASE_URL = `${HAS_LOCAL_HTTPS ? 'https' : 'http'}://127.0.0.1:${PORT}`;

module.exports = defineConfig({
  testDir: './tests',
  testMatch: ['**/*.smoke.cjs'],
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    ignoreHTTPSErrors: HAS_LOCAL_HTTPS,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], locale: 'it-IT' } }],
  webServer: {
    command: `npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: BASE_URL,
    ignoreHTTPSErrors: HAS_LOCAL_HTTPS,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
