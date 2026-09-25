import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

/** Pieces shared by the app build (vite.config.ts) and the website build (vite.site.config.ts). */

export const packageVersion = (
  JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }
).version;

export function productionCspPlugin(policy: string): Plugin {
  return {
    name: 'production-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        /(<meta\s+http-equiv="Content-Security-Policy"\s+content=")[^"]*("\s*\/?>)/i,
        `$1${policy}$2`,
      );
    },
  };
}
