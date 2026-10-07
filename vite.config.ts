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

type ModuleInfoLookup = (id: string) => { isEntry: boolean; importers: readonly string[]; dynamicImporters: readonly string[] } | null;

const normalizeId = (id: string) => id.replaceAll('\\', '/');

/** Whether a module is only reached, statically, through the Home page and never from startup. */
function onlyThroughHome(id: string, getModuleInfo: ModuleInfoLookup) {
  let reachesHome = false;
  const seen = new Set<string>();
  const pending = [id];
  while (pending.length > 0) {
    const current = pending.pop() as string;
    if (seen.has(current)) continue;
    seen.add(current);
    if (normalizeId(current).endsWith('/src/pages/Home.tsx')) {
      reachesHome = true;
      continue;
    }
    const info = getModuleInfo(current);
    // Unknown or root modules (the HTML entry and its script) belong to startup.
    if (!info || info.isEntry || (info.importers.length === 0 && info.dynamicImporters.length === 0)) return false;
    pending.push(...info.importers);
  }
  return reachesHome;
}

const cardLayerCache = new WeakMap<ModuleInfoLookup, Map<string, boolean>>();

/**
 * The dashboard card layer Home loads eagerly: cards under src/components/widgets,
 * plus helpers imported only by those cards. Startup modules never qualify.
 */
function isEagerHomeCard(id: string, getModuleInfo: ModuleInfoLookup): boolean {
  let cache = cardLayerCache.get(getModuleInfo);
  if (!cache) {
    cache = new Map();
    cardLayerCache.set(getModuleInfo, cache);
  }
  const cached = cache.get(id);
  if (cached !== undefined) return cached;
  cache.set(id, false); // Import cycles resolve to "not in the layer".
  const info = getModuleInfo(id);
  let result = false;
  if (info && onlyThroughHome(id, getModuleInfo)) {
    result = normalizeId(id).includes('/src/components/widgets/')
      || (info.dynamicImporters.length === 0 && info.importers.length > 0
        && info.importers.every((importer) => isEagerHomeCard(importer, getModuleInfo)));
  }
  cache.set(id, result);
  return result;
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
        // Dashboard cards keep their own file. They used to be split out because the
        // /beta site shared them; without it Rollup folds them into the Home chunk
        // and breaks its per-file budget. Only cards Home already loads eagerly
        // move, so startup and the critical path are unchanged.
        manualChunks: (id, { getModuleInfo }) => (isEagerHomeCard(id, getModuleInfo) ? 'dashboard-widgets' : undefined),
        // Shared dependencies (React, motion, icons) stay where Rollup puts them
        // instead of being pulled into the cards chunk and preloaded at startup.
        onlyExplicitManualChunks: true,
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
