import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    preserveSymlinks: true,
  },
  test: {
    environment: 'jsdom',
    css: false,
    globals: false,
    include: ['src/**/*.test.{ts,tsx,js,jsx}', 'scripts/**/*.test.mjs'],
    exclude: ['node_modules', 'dist', 'tests/**'],
  },
});
