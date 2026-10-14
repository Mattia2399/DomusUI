import { describe, expect, it } from 'vitest';
import { settingsPathDepth, settingsTransitionDirection } from './useSettingsPageTransition';

describe('Settings page transition', () => {
  it('reads the hub, its pages and their details as three levels', () => {
    expect(settingsPathDepth('/settings')).toBe(1);
    expect(settingsPathDepth('/settings/home')).toBe(1);
    expect(settingsPathDepth('/settings/devices')).toBe(2);
    expect(settingsPathDepth('/settings/devices/abc')).toBe(3);
  });

  it('pushes forward into deeper or sibling pages and back towards the hub', () => {
    expect(settingsTransitionDirection('/settings', '/settings/system')).toBe('forward');
    expect(settingsTransitionDirection('/settings/dashboard', '/settings/data/history')).toBe('forward');
    expect(settingsTransitionDirection('/settings/system', '/settings/devices')).toBe('forward');
    expect(settingsTransitionDirection('/settings/devices/abc', '/settings/devices')).toBe('back');
    expect(settingsTransitionDirection('/settings/system', '/settings')).toBe('back');
  });
});
