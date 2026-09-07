const { defineConfig, devices } = require('@playwright/test');

const PORT = Number(process.env.PORT || 3000);
const BASE_URL = process.env.TEST_BASE_URL || `http://127.0.0.1:${PORT}`;

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
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
