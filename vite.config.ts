import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { buildProductionCsp } from './src/security/contentSecurityPolicy';
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
    include: ['maplibre-gl', 'maplibre-gl/dist/maplibre-gl-worker.mjs'],
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
