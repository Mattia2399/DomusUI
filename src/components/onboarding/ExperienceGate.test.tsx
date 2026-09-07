import { describe, expect, it } from 'vitest';
import { isSetupRoute, shouldForceCompletedConfiguration } from './ExperienceGate';

describe('ExperienceGate setup routing', () => {
  it('keeps a first-time configuration inside the complete wizard', () => {
    expect(isSetupRoute('/setup')).toBe(true);
    expect(shouldForceCompletedConfiguration('/setup', 'detected')).toBe(false);
    expect(shouldForceCompletedConfiguration('/setup', 'server')).toBe(false);
    expect(shouldForceCompletedConfiguration('/setup', 'authorize')).toBe(false);
    expect(shouldForceCompletedConfiguration('/setup', 'scan')).toBe(false);
  });

  it('uses the quick reconnection flow only after onboarding was completed', () => {
    expect(shouldForceCompletedConfiguration('/setup', 'done')).toBe(false);
    expect(shouldForceCompletedConfiguration('/setup', 'done', '?reconnect=1')).toBe(true);
    expect(shouldForceCompletedConfiguration('/setup', 'done', '?panel=1')).toBe(false);
    expect(shouldForceCompletedConfiguration('/home', 'done')).toBe(false);
  });
});
