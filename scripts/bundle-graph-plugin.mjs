import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/*
 * Writes the module graph of a production build to build/bundle-graph.json,
 * outside dist so nothing is added to the distributed files. It holds what
 * Vite's manifest holds (source entry, static and dynamic imports, CSS and
 * assets of each chunk) plus the rendered size of every module, and is read
 * by scripts/check-bundle-budget.mjs. Output files are unchanged.
 */
/**
 * @param {{ root: string, output?: string }} options
 * @returns {import('vite').Plugin}
 */
export function bundleGraphPlugin({ root, output = 'build/bundle-graph.json' }) {
  const relative = (id) => (id ? path.relative(root, id.replace(/^\0/, '')).split(path.sep).join('/') : null);
  return {
    name: 'domus-bundle-graph',
    apply: 'build',
    writeBundle(_options, bundle) {
      const chunks = {};
      const assets = {};
      for (const [fileName, item] of Object.entries(bundle)) {
        if (item.type === 'chunk') {
          chunks[fileName] = {
            name: item.name,
            src: relative(item.facadeModuleId),
            isEntry: item.isEntry,
            isDynamicEntry: item.isDynamicEntry,
            imports: item.imports,
            dynamicImports: item.dynamicImports,
            css: [...(item.viteMetadata?.importedCss ?? [])],
            assets: [...(item.viteMetadata?.importedAssets ?? [])],
            modules: Object.fromEntries(
              Object.entries(item.modules).map(([id, info]) => [relative(id), info.renderedLength]),
            ),
          };
        } else {
          assets[fileName] = { names: item.names ?? (item.name ? [item.name] : []) };
        }
      }
      const target = path.resolve(root, output);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, `${JSON.stringify({ version: 1, chunks, assets }, null, 1)}\n`);
    },
  };
}
