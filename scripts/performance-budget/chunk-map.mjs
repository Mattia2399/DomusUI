import { measureSurfaces } from './metrics.mjs';

/*
 * The chunk map of a production build (docs/performance-bundle-audit.md):
 * for every JS and CSS file, its size, how it loads, who imports it, which
 * budget surfaces reach it, and the source area most of its bytes come from.
 * Everything comes from the bundle graph, never from hashed file names.
 */

/** Source areas, most specific first: the owner of a module is the first prefix it matches. */
export const OWNERS = [
  ['POWER', ['src/components/settings/DevicePowerSettings', 'src/services/devicePowerClient', 'src/i18n/devicePowerCopy', 'src/services/domusClientId']],
  ['SCREENSAVER', ['src/components/screensaver/', 'src/components/settings/ScreensaverSettings', 'src/i18n/screensaverCopy']],
  ['KIOSK', ['src/components/kiosk/', 'src/components/settings/KioskSettings', 'src/i18n/kioskCopy']],
  ['ENERGY', ['src/pages/consumi/', 'src/pages/Consumi', 'src/components/energy', 'src/services/energy', 'src/i18n/consumptionCopy']],
  ['IRRIGATION', ['src/components/apps/irrigation', 'src/i18n/irrigation', 'src/services/irrigation']],
  ['I18N', ['virtual:domus-i18n', 'src/i18n/']],
  ['SETTINGS', ['src/components/settings/', 'src/pages/SettingsDashboard', 'src/navigation/settingsRoutes']],
  ['HOME', ['src/components/dashboard/', 'src/components/widgets/', 'src/pages/Home', 'src/components/homeAttention/']],
  ['CORE', ['src/', 'index.html']],
];

export function ownerOf(module) {
  if (module.startsWith('node_modules/')) {
    const parts = module.split('/');
    return `vendor:${parts[1].startsWith('@') ? `${parts[1]}/${parts[2]}` : parts[1]}`;
  }
  for (const [owner, prefixes] of OWNERS) if (prefixes.some((prefix) => module.startsWith(prefix))) return owner;
  return 'OTHER';
}

/** Rendered bytes of a chunk's modules by owner, largest first. */
export function ownersOf(chunk) {
  const byOwner = new Map();
  for (const [module, length] of Object.entries(chunk.modules ?? {})) {
    const owner = ownerOf(module);
    byOwner.set(owner, (byOwner.get(owner) ?? 0) + (length ?? 0));
  }
  return [...byOwner.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** A stable name for a chunk: its source entry, or its Rollup name and largest module. */
export function chunkLabel(chunk) {
  if (chunk.src) return chunk.src;
  const largest = Object.entries(chunk.modules ?? {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return `${chunk.name ?? 'chunk'} (${largest ? largest[0] : 'empty'})`;
}

/**
 * Describe every code file. `surfaces` is the budget configuration; a file is
 * reached by a surface when it is in that surface's cold closure, which is
 * what the budget itself measures.
 */
export function chunkMap(build, sizer, surfaces, codeFiles) {
  const measured = measureSurfaces(build, sizer, surfaces);
  const reachedBy = new Map();
  for (const surface of measured) {
    for (const file of surface.files) reachedBy.set(file, [...(reachedBy.get(file) ?? []), surface.id]);
  }
  const staticImporters = new Map();
  const dynamicImporters = new Map();
  for (const [file, chunk] of build.chunks) {
    for (const target of chunk.imports ?? []) staticImporters.set(target, [...(staticImporters.get(target) ?? []), file]);
    for (const target of chunk.dynamicImports ?? []) dynamicImporters.set(target, [...(dynamicImporters.get(target) ?? []), file]);
  }
  const cssOwner = new Map();
  for (const [file, chunk] of build.chunks) for (const css of chunk.css ?? []) cssOwner.set(css, [...(cssOwner.get(css) ?? []), file]);

  const label = (file) => (build.chunks.has(file) ? chunkLabel(build.chunks.get(file)) : file);
  return codeFiles
    .map((file) => {
      const chunk = build.chunks.get(file);
      const size = sizer.sizeOf(file);
      const surfacesReaching = reachedBy.get(file) ?? [];
      const kind = !chunk
        ? 'css'
        : chunk.isEntry
          ? 'entry'
          : chunk.isDynamicEntry
            ? 'dynamic'
            : 'shared';
      const owners = chunk ? ownersOf(chunk) : [];
      return {
        file,
        label: chunk ? label(file) : `css of ${(cssOwner.get(file) ?? []).map(label).join(', ') || 'nothing'}`,
        kind,
        raw: size.raw,
        gzip: size.gzip,
        importedBy: [...new Set((staticImporters.get(file) ?? []).map(label))].sort(),
        loadedLaterBy: [...new Set((dynamicImporters.get(file) ?? []).map(label))].sort(),
        surfaces: surfacesReaching,
        owner: owners[0]?.[0] ?? (chunk ? 'OTHER' : 'CSS'),
        owners,
      };
    })
    .sort((a, b) => b.raw - a.raw || a.label.localeCompare(b.label));
}
