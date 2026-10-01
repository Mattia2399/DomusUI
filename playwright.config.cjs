const { defineConfig, devices } = require('@playwright/test');
const { existsSync } = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT || 3000);
const HAS_LOCAL_HTTPS = [
  path.join(__dirname, '.cert', 'localhost.pem'),
  path.join(__dirname, '.cert', 'localhost-key.pem'),
].every(existsSync);
const BASE_URL = process.env.TEST_BASE_URL
  || `${HAS_LOCAL_HTTPS ? 'https' : 'http'}://127.0.0.1:${PORT}`;
const parsedBaseUrl = new URL(BASE_URL);
const IGNORE_LOCAL_HTTPS_ERRORS = parsedBaseUrl.protocol === 'https:'
  && ['localhost', '127.0.0.1', '::1'].includes(parsedBaseUrl.hostname);

// A few E2E scenarios construct absolute callback/navigation URLs. Keep them
// aligned with the same origin selected by the Playwright web server.
process.env.TEST_BASE_URL = BASE_URL;

module.exports = defineConfig({
  testDir: './tests',
  testMatch: ['**/*.spec.cjs'],
  // Vite transforms the large, lazy Home workspace on first demand. Running
  // multiple cold browser contexts against that transform makes timing tests
  // nondeterministic and does not reflect the production build.
  workers: 1,
  timeout: 120_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: BASE_URL,
    ignoreHTTPSErrors: IGNORE_LOCAL_HTTPS_ERRORS,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], locale: 'it-IT' },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: BASE_URL,
    ignoreHTTPSErrors: IGNORE_LOCAL_HTTPS_ERRORS,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
