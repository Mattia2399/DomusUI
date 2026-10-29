import { describe, expect, it } from 'vitest';
import { buildPresentationSiteCsp, buildProductionCsp } from './contentSecurityPolicy';

function directiveSources(policy: string, directive: string) {
  const entry = policy
    .split('; ')
    .find((candidate) => candidate.startsWith(`${directive} `));
  return entry?.split(' ').slice(1) ?? [];
}

describe('generated production CSP', () => {
  it('allows no third-party origin by default', () => {
    const policy = buildProductionCsp([]);

    expect(directiveSources(policy, 'img-src')).toEqual(["'self'", 'data:', 'blob:']);
    expect(directiveSources(policy, 'connect-src')).toEqual(["'self'"]);
    expect(policy).not.toMatch(/https?:\/\/|wss?:\/\//);
    expect(policy).not.toContain('*');
  });

  it('keeps configured HA origins and their websocket equivalents', () => {
    const policy = buildProductionCsp(['https://ha.example.test', 'javascript:alert(1)']);

    expect(directiveSources(policy, 'connect-src')).toEqual([
      "'self'",
      'https://ha.example.test',
      'wss://ha.example.test',
    ]);
    expect(directiveSources(policy, 'img-src')).toContain('https://ha.example.test');
    expect(directiveSources(policy, 'media-src')).toContain('https://ha.example.test');
    expect(policy).not.toContain('javascript:');
    expect(policy).not.toContain('unsafe-eval');
    expect(policy).not.toContain('https:;');
  });

  it('keeps the presentation site free from any external origin', () => {
    expect(buildPresentationSiteCsp()).not.toMatch(/https?:\/\/|wss?:\/\//);
  });
});
