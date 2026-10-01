function normalizeCspOrigin(value: string) {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.origin : null;
  } catch {
    return null;
  }
}

export const CARTO_MAP_ORIGIN = 'https://tiles.basemaps.cartocdn.com';

function normalizeCspOrigins(values: readonly string[]) {
  return [...new Set(
    values
      .map(normalizeCspOrigin)
      .filter((value): value is string => Boolean(value)),
  )];
}

function appendSources(sources: readonly string[]) {
  return sources.length > 0 ? ` ${sources.join(' ')}` : '';
}

function buildCsp(
  configuredOrigins: readonly string[],
  mapAssetOrigins: readonly string[],
) {
  const normalizedMapOrigins = normalizeCspOrigins(mapAssetOrigins);
  const mapOriginSet = new Set(normalizedMapOrigins);
  const normalizedConfiguredOrigins = normalizeCspOrigins(configuredOrigins)
    .filter((origin) => !mapOriginSet.has(origin));
  const websocketOrigins = normalizedConfiguredOrigins.map((origin) =>
    origin.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:'),
  );
  const imageSources = [...normalizedMapOrigins, ...normalizedConfiguredOrigins];
  const connectSources = [
    ...normalizedMapOrigins,
    ...normalizedConfiguredOrigins,
    ...websocketOrigins,
  ];
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${appendSources(imageSources)}`,
    `media-src 'self' blob:${appendSources(normalizedConfiguredOrigins)}`,
    `connect-src 'self'${appendSources(connectSources)}`,
    "worker-src 'self' blob:",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-src 'self'",
    "manifest-src 'self'",
  ].join('; ');
}

/** CSP for the dashboard distributed standalone and through HACS. */
export function buildProductionCsp(configuredOrigins: readonly string[]) {
  return buildCsp(configuredOrigins, [CARTO_MAP_ORIGIN]);
}

/** The presentation site does not load the dashboard map or CARTO assets. */
export function buildPresentationSiteCsp() {
  return buildCsp([], []);
}
