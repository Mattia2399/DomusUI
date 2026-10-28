import { describe, expect, it } from 'vitest';
import {
  buildSetupCategoryCounts,
  countUnassignedDevices,
  isBlockedMixedContent,
  listSetupCategories,
  resolveSetupScreen,
  resumeStage,
  setupProgressStep,
} from './setupWizard';
import type { SetupScanSummary } from './setupJourney';

const summary = (overrides: Partial<SetupScanSummary> = {}): SetupScanSummary => ({
  entities: 120,
  devices: 40,
  areas: 9,
  unavailable: 0,
  domains: {},
  canManageHa: true,
  ...overrides,
});

describe('the screen setup shows', () => {
  it('shows the step itself when nothing interrupts it', () => {
    expect(resolveSetupScreen({ phase: 'connect' })).toBe('connect');
    expect(resolveSetupScreen({ phase: 'compose' })).toBe('compose');
  });

  it.each(['unreachable', 'mixed', 'denied'] as const)('shows %s in place of the step it interrupts', (issue) => {
    expect(resolveSetupScreen({ phase: 'connect', issue })).toBe(issue);
    expect(resolveSetupScreen({ phase: 'redirect', issue })).toBe(issue);
  });

  it('tells a non-administrator what is limited before the summary, until they go on', () => {
    const limited = summary({ canManageHa: false });
    expect(resolveSetupScreen({ phase: 'summary', summary: limited })).toBe('limited');
    expect(resolveSetupScreen({ phase: 'summary', summary: limited, limitedAccepted: true })).toBe('summary');
    expect(resolveSetupScreen({ phase: 'summary', summary: summary() })).toBe('summary');
  });

  it('asks an expired session only to sign in again, or to change the address', () => {
    expect(resolveSetupScreen({ phase: 'done', forceConfiguration: true })).toBe('expired');
    expect(resolveSetupScreen({ phase: 'done', forceConfiguration: true, changingAddress: true })).toBe('connect');
    expect(resolveSetupScreen({ phase: 'done', forceConfiguration: true, issue: 'unreachable' })).toBe('unreachable');
  });

  it('asks to sign in again when a step after the sign-in has no session left', () => {
    for (const phase of ['scan', 'summary', 'existing', 'compose'] as const) {
      expect(resolveSetupScreen({ phase, summary: summary(), signedOut: true })).toBe('expired');
      expect(resolveSetupScreen({ phase, summary: summary(), signedOut: true, changingAddress: true })).toBe('connect');
    }
    // Before the sign-in there is no session to miss.
    expect(resolveSetupScreen({ phase: 'connect', signedOut: true })).toBe('connect');
    expect(resolveSetupScreen({ phase: 'redirect', signedOut: true })).toBe('redirect');
  });

  it('counts the three stages of the bar', () => {
    expect(['intro', 'choice', 'expired'].map((screen) => setupProgressStep(screen as never))).toEqual([0, 0, 0]);
    expect(['connect', 'redirect', 'unreachable', 'mixed', 'denied'].map((screen) => setupProgressStep(screen as never))).toEqual([1, 1, 1, 1, 1]);
    expect(['scan', 'summary', 'limited'].map((screen) => setupProgressStep(screen as never))).toEqual([2, 2, 2]);
    expect(['existing', 'compose'].map((screen) => setupProgressStep(screen as never))).toEqual([3, 3]);
  });

  it('says where a half-way setup stopped', () => {
    expect([resumeStage('connect'), resumeStage('redirect')]).toEqual(['connect', 'connect']);
    expect([resumeStage('scan'), resumeStage('summary')]).toEqual(['analysis', 'analysis']);
    expect([resumeStage('existing'), resumeStage('compose')]).toEqual(['start', 'start']);
  });

  it('knows when the browser would block http from an https page', () => {
    expect(isBlockedMixedContent('http://homeassistant.local:8123', 'https:')).toBe(true);
    expect(isBlockedMixedContent('http://localhost:8123', 'https:')).toBe(false);
    expect(isBlockedMixedContent('https://casa.ui.nabu.casa', 'https:')).toBe(false);
    expect(isBlockedMixedContent('http://homeassistant.local:8123', 'http:')).toBe(false);
  });
});

describe('the summary in words', () => {
  it('counts lights, thermostats, covers, TV and speakers, plugs and security', () => {
    const counts = buildSetupCategoryCounts([
      ['light.a', { state: 'on' }],
      ['light.b', { state: 'off' }],
      ['climate.living', { state: 'heat' }],
      ['cover.blind', { state: 'open' }],
      ['media_player.tv', { state: 'off' }],
      ['switch.tv', { state: 'on', rawAttributes: { device_class: 'outlet' } }],
      ['switch.boiler', { state: 'on' }],
      ['lock.door', { state: 'locked' }],
      ['camera.door', { state: 'idle' }],
      ['binary_sensor.window', { state: 'off', rawAttributes: { device_class: 'window' } }],
      ['binary_sensor.update', { state: 'off', rawAttributes: { device_class: 'update' } }],
      ['sensor.temperature', { state: '21' }],
    ]);
    expect(counts).toEqual({ lights: 2, thermostats: 1, covers: 1, media: 1, plugs: 1, security: 3 });
  });

  it('shows only the categories that have something, in their order', () => {
    expect(listSetupCategories(summary({ categories: { security: 11, lights: 24, plugs: 0 } }))).toEqual([
      { id: 'lights', count: 24 },
      { id: 'security', count: 11 },
    ]);
  });

  it('reads an older summary from its domains and groups, without plugs', () => {
    expect(
      listSetupCategories(summary({
        domains: { light: 24, climate: 6, cover: 8, media_player: 5, switch: 14 },
        groups: { security: 6, locks: 2, cameras: 3 },
      })),
    ).toEqual([
      { id: 'lights', count: 24 },
      { id: 'thermostats', count: 6 },
      { id: 'covers', count: 8 },
      { id: 'media', count: 5 },
      { id: 'security', count: 11 },
    ]);
  });

  it('counts the devices in no room, leaving out services, disabled devices and those placed by an entity', () => {
    const devices = {
      devices: [
        { id: 'placed', area_id: 'living' },
        { id: 'loose', area_id: null },
        { id: 'loose-too' },
        { id: 'by-entity', area_id: null },
        { id: 'weather', area_id: null, entry_type: 'service' },
        { id: 'off', area_id: null, disabled_by: 'user' },
      ],
    };
    const entities = [{ entity_id: 'light.lamp', device_id: 'by-entity', area_id: 'kitchen' }];
    expect(countUnassignedDevices(devices, entities)).toBe(2);
  });

  it('does not guess when the registry does not say where devices are', () => {
    expect(countUnassignedDevices({ devices: [{ id: 'a' }, { id: 'b' }] }, [])).toBeUndefined();
    expect(countUnassignedDevices(null, null)).toBeUndefined();
  });
});
