import { describe, expect, it } from 'vitest';
import { resolveApplicationRoutePath } from './applicationRoutes';

describe('application route registry', () => {
  it('allows only registered destinations at the navigation boundary', () => {
    expect(resolveApplicationRoutePath('bottom-home', '/home')).toBe('/home');
    expect(resolveApplicationRoutePath('home', '/rooms')).toBe('/rooms');
    expect(resolveApplicationRoutePath('home', 'https://example.com')).toBe('/home');
    expect(resolveApplicationRoutePath('custom', '/admin')).toBeNull();
    expect(resolveApplicationRoutePath('custom', 'https://example.com')).toBeNull();
    expect(resolveApplicationRoutePath('custom', 'javascript:alert(1)')).toBeNull();
  });
});
