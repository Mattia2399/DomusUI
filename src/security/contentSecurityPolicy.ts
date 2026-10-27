function normalizeCspOrigin(value: string) {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.origin : null;
  } catch {
    return null;
  }
}

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

// No third-party origin: only the Home Assistant origins a build is configured with.
function buildCsp(configuredOrigins: readonly string[]) {
  const normalizedConfiguredOrigins = normalizeCspOrigins(configuredOrigins);
  const websocketOrigins = normalizedConfiguredOrigins.map((origin) =>
    origin.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:'),
  );
  const imageSources = normalizedConfiguredOrigins;
  const connectSources = [...normalizedConfiguredOrigins, ...websocketOrigins];
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
  return buildCsp(configuredOrigins);
}

/** The presentation site talks to no Home Assistant. */
export function buildPresentationSiteCsp() {
  return buildCsp([]);
}
