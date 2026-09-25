import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { buildProductionCsp } from './src/security/contentSecurityPolicy';
import { packageVersion, productionCspPlugin } from './vite.shared';

/**
 * Standalone build of the public presentation website (`npm run build:site`).
 *
 * It renders only the /beta experience, in Italian at / and English at /en/,
 * and outputs a static folder (dist-site/) ready for any static host. It
 * deliberately omits the Home Assistant panel bridge and every dashboard route.
 */
export default defineConfig({
  root: path.resolve(__dirname, 'site'),
  // Relative asset URLs: works on a custom domain root and on sub-paths alike.
  base: './',
  // Host files copied verbatim to dist-site/ (_headers, robots.txt).
  publicDir: path.resolve(__dirname, 'site/public'),
  plugins: [productionCspPlugin(buildProductionCsp([])), react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(packageVersion),
  },
  resolve: {
    preserveSymlinks: true,
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist-site'),
    emptyOutDir: true,
    // One HTML page per language: / (Italian) and /en/ (English).
    rollupOptions: {
      input: {
        it: path.resolve(__dirname, 'site/index.html'),
        en: path.resolve(__dirname, 'site/en/index.html'),
      },
    },
  },
});
