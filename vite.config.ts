import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { buildProductionCsp } from './src/security/contentSecurityPolicy';
import { bundleGraphPlugin } from './scripts/bundle-graph-plugin.mjs';
import { loadLocalHttpsOptions } from './vite.localHttps';
import { packageVersion, productionCspPlugin } from './vite.shared';

function panelBridgeDistributionPlugin(): Plugin {
  return {
    name: 'panel-bridge-distribution',
    apply: 'build',
    buildStart() {
      const documentation = readFileSync(
        new URL('./docs/home-assistant-panel-bridge.md', import.meta.url),
        'utf8',
      );
      const bridgeMatch = documentation.match(/```js\r?\n([\s\S]*?)\r?\n```/);
      if (!bridgeMatch) {
        this.error('Il bridge panel non è presente nella documentazione ufficiale del progetto.');
        return;
      }
      this.emitFile({
        type: 'asset',
        fileName: 'ha-dashboard-builder-panel.js',
        source: `${bridgeMatch[1].trim()}\n`,
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const localHttps = loadLocalHttpsOptions(process.cwd());
  const configuredOrigins = (env.VITE_CSP_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return {
  plugins: [
    productionCspPlugin(buildProductionCsp(configuredOrigins)),
    panelBridgeDistributionPlugin(),
    react(),
    tailwindcss(),
    // build/bundle-graph.json for the performance budget; dist is unchanged.
    bundleGraphPlugin({ root: __dirname }),
  ],
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(packageVersion),
  },
  resolve: {
    preserveSymlinks: true,
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  optimizeDeps: {
    // Pre-bundle the runtime hidden behind the members-map lazy boundary so
    // opening it for the first time never forces a Vite full-page reload.
    // The dedicated worker is a separate Rollup entry in production and must
    // not be optimized as a regular window dependency during development.
    include: ['maplibre-gl'],
  },
  esbuild: {
    // Keep every third-party license notice once per file instead of once per
    // module: each lucide icon otherwise repeats the same ISC header.
    legalComments: 'eof',
  },
  build: {
    rollupOptions: {
      input: [
        path.resolve(__dirname, 'index.html'),
        path.resolve(__dirname, 'node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs'),
      ],
      output: {
        entryFileNames: (chunkInfo) => {
          const moduleId = chunkInfo.facadeModuleId?.replaceAll('\\', '/');
          if (moduleId?.endsWith('/maplibre-gl-worker.mjs')) {
            return 'assets/maplibre-gl-worker.js';
          }
          return 'assets/[name]-[hash].js';
        },
        // No manual chunks: Rollup keeps the dashboard cards in the Home chunk and
        // orders their modules itself. A separate cards chunk (0985b01) imported
        // icons and helpers back from Home, the two chunks formed a cycle and the
        // cards' module-level code read Home bindings before they existed: the
        // production Home failed to load. Splitting it safely would need either
        // the shared icons in the cards chunk, which Rollup then preloads at
        // startup, or a hand-made ownership analysis that barrel re-exports
        // defeat. The performance budget checks the Home critical path instead.
      },
    },
  },
  server: {
    port: 3000,
    strictPort: true,
    ...(localHttps ? { https: localHttps } : {}),
    hmr: process.env.DISABLE_HMR !== 'true',
  },
  preview: {
    port: 4173,
    strictPort: true,
    ...(localHttps ? { https: localHttps } : {}),
  },
  };
});
