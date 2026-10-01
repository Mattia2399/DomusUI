import { describe, expect, it } from 'vitest';
import {
  buildPresentationSiteCsp,
  buildProductionCsp,
  CARTO_MAP_ORIGIN,
} from './contentSecurityPolicy';

function directiveSources(policy: string, directive: string) {
  const entry = policy
    .split('; ')
    .find((candidate) => candidate.startsWith(`${directive} `));
  return entry?.split(' ').slice(1) ?? [];
}

describe('generated production CSP', () => {
  it('allows CARTO map assets by default only where the map needs them', () => {
    const policy = buildProductionCsp([]);

    expect(directiveSources(policy, 'img-src')).toContain(CARTO_MAP_ORIGIN);
    expect(directiveSources(policy, 'connect-src')).toContain(CARTO_MAP_ORIGIN);
    expect(directiveSources(policy, 'media-src')).not.toContain(CARTO_MAP_ORIGIN);
    expect(policy).not.toContain('wss://tiles.basemaps.cartocdn.com');
    expect(policy).not.toContain('ws://tiles.basemaps.cartocdn.com');
    expect(policy).not.toContain('*');
  });

  it('keeps configured HA origins and their websocket equivalents', () => {
    const policy = buildProductionCsp(['https://ha.example.test', 'javascript:alert(1)']);

    expect(directiveSources(policy, 'connect-src')).toEqual([
      "'self'",
      CARTO_MAP_ORIGIN,
      'https://ha.example.test',
      'wss://ha.example.test',
    ]);
    expect(directiveSources(policy, 'img-src')).toContain('https://ha.example.test');
    expect(directiveSources(policy, 'media-src')).toContain('https://ha.example.test');
    expect(policy).not.toContain('javascript:');
    expect(policy).not.toContain('unsafe-eval');
    expect(policy).not.toContain('https:;');
  });

  it('does not widen CARTO permissions when a legacy local override lists it again', () => {
    const policy = buildProductionCsp([CARTO_MAP_ORIGIN]);

    expect(directiveSources(policy, 'img-src').filter((source) => source === CARTO_MAP_ORIGIN)).toHaveLength(1);
    expect(directiveSources(policy, 'connect-src').filter((source) => source === CARTO_MAP_ORIGIN)).toHaveLength(1);
    expect(directiveSources(policy, 'media-src')).not.toContain(CARTO_MAP_ORIGIN);
    expect(policy).not.toContain('wss://tiles.basemaps.cartocdn.com');
  });

  it('keeps the presentation site free from dashboard-only map permissions', () => {
    const policy = buildPresentationSiteCsp();

    expect(policy).not.toContain(CARTO_MAP_ORIGIN);
  });
});
