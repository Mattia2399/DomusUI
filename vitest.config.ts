import { defineConfig } from 'vitest/config';
import { i18nCatalogPlugin } from './scripts/i18n-catalog-plugin';

export default defineConfig({
  plugins: [i18nCatalogPlugin()],
  resolve: {
    preserveSymlinks: true,
  },
  test: {
    environment: 'jsdom',
    css: false,
    globals: false,
    setupFiles: ['./src/test/vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx,js,jsx}', 'scripts/**/*.test.mjs'],
    exclude: ['node_modules', 'dist', 'tests/**'],
  },
});
