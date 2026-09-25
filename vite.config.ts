import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { buildProductionCsp } from './src/security/contentSecurityPolicy';
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
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
  },
  };
});
