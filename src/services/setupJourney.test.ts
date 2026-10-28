import { beforeEach, describe, expect, it } from 'vitest';
import {
  isDemoRouteAllowed,
  isSetupJourneyMidway,
  LEGACY_SETUP_JOURNEY_STORAGE_KEY,
  migrateSetupJourneyV2,
  readSetupJourney,
  readSetupStart,
  saveSetupJourney,
  SETUP_JOURNEY_STORAGE_KEY,
  shouldAskHomeStart,
  type SetupPhase,
} from './setupJourney';

const v2 = (phase: string, extra: Record<string, unknown> = {}) => ({
  version: 2,
  phase,
  mode: 'real',
  hassUrl: 'http://homeassistant.local:8123',
  connectionMethod: 'direct',
  updatedAt: 1_700_000_000_000,
  ...extra,
});

const summary = {
  entities: 86,
  devices: 40,
  areas: 9,
  unavailable: 7,
  domains: { light: 24 },
  userName: 'Mattia',
  canManageHa: true,
};
const existingConfiguration = { revision: 4, updatedAt: '2026-10-27T20:40:00.000Z', sections: 5, widgets: 23 };

describe('setup journey', () => {
  beforeEach(() => window.localStorage.clear());

  it('starts a fresh installation from the intro', () => {
    expect(readSetupJourney(window.localStorage)).toMatchObject({ phase: 'intro', mode: null });
  });

  it('migrates an existing real installation without replaying setup', () => {
    window.localStorage.setItem('hass_auth_tokens', '{}');
    expect(readSetupJourney(window.localStorage)).toMatchObject({ phase: 'done', mode: 'real' });
    expect(window.localStorage.getItem(SETUP_JOURNEY_STORAGE_KEY)).not.toBeNull();
  });

  it('always starts a first embedded installation from the intro even when HA tokens are visible', () => {
    window.localStorage.setItem('hass_auth_tokens', '{}');
    expect(readSetupJourney(window.localStorage, { embedded: true })).toMatchObject({ phase: 'intro', mode: null });
    expect(window.localStorage.getItem(SETUP_JOURNEY_STORAGE_KEY)).toBeNull();
  });

  it('does not replay setup for an embedded installation with an existing real layout', () => {
    window.localStorage.setItem('ha.dashboard.builder.layout.v1', '{"version":13}');
    expect(readSetupJourney(window.localStorage, { embedded: true })).toMatchObject({
      phase: 'done',
      mode: 'real',
      connectionMethod: 'panel',
    });
  });

  it('adds the panel transport to an existing embedded setup without replaying it', () => {
    saveSetupJourney({ phase: 'done', mode: 'real' }, window.localStorage);
    expect(readSetupJourney(window.localStorage, { embedded: true })).toMatchObject({
      phase: 'done',
      connectionMethod: 'panel',
    });
  });

  it('restores the selected setup transport across refreshes', () => {
    saveSetupJourney(
      { phase: 'scan', mode: 'real', hassUrl: 'https://ha.example.test', connectionMethod: 'panel' },
      window.localStorage,
    );
    expect(readSetupJourney(window.localStorage, { embedded: true })).toMatchObject({
      phase: 'scan',
      connectionMethod: 'panel',
      hassUrl: 'https://ha.example.test',
    });
  });

  it('keeps what a resumed step needs, and steps back when it is missing', () => {
    saveSetupJourney({ phase: 'existing', mode: 'real', existingConfiguration, summary }, window.localStorage);
    expect(readSetupJourney(window.localStorage)).toMatchObject({ phase: 'existing', existingConfiguration, summary });
    saveSetupJourney({ phase: 'existing', mode: 'real', summary }, window.localStorage);
    expect(readSetupJourney(window.localStorage).phase).toBe('summary');
    saveSetupJourney({ phase: 'summary', mode: 'real' }, window.localStorage);
    expect(readSetupJourney(window.localStorage).phase).toBe('scan');
  });

  it('remembers how the Home was chosen to start, and whether a limited account went on', () => {
    expect(readSetupStart(window.localStorage)).toBeNull();
    saveSetupJourney({ phase: 'done', mode: 'real', start: 'empty', limitedAccepted: true }, window.localStorage);
    expect(readSetupStart(window.localStorage)).toBe('empty');
    expect(readSetupJourney(window.localStorage)).toMatchObject({ start: 'empty', limitedAccepted: true });
  });

  it('does not ask again how the Home starts once setup asked it, nor in the Demo', () => {
    // A home set up before this setup: the Home still offers to keep its cards or start empty.
    saveSetupJourney({ phase: 'done', mode: 'real' }, window.localStorage);
    expect(shouldAskHomeStart(window.localStorage)).toBe(true);
    for (const start of ['recommended', 'empty', 'existing'] as const) {
      saveSetupJourney({ phase: 'done', mode: 'real', start }, window.localStorage);
      expect(shouldAskHomeStart(window.localStorage)).toBe(false);
    }
    saveSetupJourney({ phase: 'done', mode: 'demo', start: 'recommended' }, window.localStorage);
    expect(shouldAskHomeStart(window.localStorage)).toBe(false);
  });

  it('calls half-way every step but the intro, the choice and the end', () => {
    const midway = (phase: SetupPhase) => isSetupJourneyMidway({ phase });
    expect(['intro', 'choice', 'done'].map((phase) => midway(phase as SetupPhase))).toEqual([false, false, false]);
    expect(['connect', 'redirect', 'scan', 'summary', 'existing', 'compose'].every((phase) => midway(phase as SetupPhase))).toBe(true);
  });

  it('keeps Demo navigation limited to Home and Rooms', () => {
    expect(isDemoRouteAllowed('/home')).toBe(true);
    expect(isDemoRouteAllowed('/rooms/kitchen')).toBe(true);
    expect(isDemoRouteAllowed('/security')).toBe(false);
    expect(isDemoRouteAllowed('/settings')).toBe(false);
  });

  it('persists runtime mode with the journey', () => {
    saveSetupJourney({ phase: 'done', mode: 'demo' }, window.localStorage);
    expect(window.localStorage.getItem('ha.dashboard.runtimeMode.v1')).toBe('demo');
  });
});

describe('migration of a v2 setup', () => {
  beforeEach(() => window.localStorage.clear());

  it.each([
    ['welcome', 'intro'],
    ['choice', 'choice'],
    ['server', 'connect'],
    ['authorize', 'redirect'],
    ['scan', 'scan'],
    ['compose', 'compose'],
    ['organize', 'compose'],
    ['complete', 'done'],
    ['done', 'done'],
  ])('turns %s into %s', (from, to) => {
    expect(migrateSetupJourneyV2(v2(from))).toMatchObject({ version: 3, phase: to });
  });

  it.each(['discover', 'detected'])('turns the panel search %s into the panel scan', (from) => {
    expect(migrateSetupJourneyV2(v2(from, { connectionMethod: 'panel' }))).toMatchObject({
      phase: 'scan',
      mode: 'real',
      connectionMethod: 'panel',
    });
    expect(migrateSetupJourneyV2(v2(from, { connectionMethod: undefined }), { embedded: true })).toMatchObject({
      phase: 'scan',
      connectionMethod: 'panel',
    });
  });

  it.each(['discover', 'detected'])('outside the panel, %s goes to the address, where a scan can start', (from) => {
    expect(migrateSetupJourneyV2(v2(from))).toMatchObject({ phase: 'connect', connectionMethod: 'direct' });
  });

  it('turns existing into existing when the configuration came with it', () => {
    expect(migrateSetupJourneyV2(v2('existing', { existingConfiguration, summary }))).toMatchObject({
      phase: 'existing',
      existingConfiguration,
    });
  });

  it('keeps mode, address, connection, summary and existing configuration', () => {
    const migrated = migrateSetupJourneyV2(v2('compose', { summary, existingConfiguration }));
    expect(migrated).toEqual({
      version: 3,
      phase: 'compose',
      mode: 'real',
      hassUrl: 'http://homeassistant.local:8123',
      connectionMethod: 'direct',
      summary,
      existingConfiguration,
      updatedAt: 1_700_000_000_000,
    });
  });

  it('reads anything else as not a v2 journey', () => {
    expect(migrateSetupJourneyV2(null)).toBeNull();
    expect(migrateSetupJourneyV2({ ...v2('scan'), version: 3 })).toBeNull();
    expect(migrateSetupJourneyV2(v2('somewhere'))).toBeNull();
  });

  it('converts the stored v2 once, writing v3 before the old key goes', () => {
    window.localStorage.setItem(LEGACY_SETUP_JOURNEY_STORAGE_KEY, JSON.stringify(v2('authorize')));
    const first = readSetupJourney(window.localStorage);
    expect(first).toMatchObject({ phase: 'redirect', hassUrl: 'http://homeassistant.local:8123' });
    expect(window.localStorage.getItem(LEGACY_SETUP_JOURNEY_STORAGE_KEY)).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(SETUP_JOURNEY_STORAGE_KEY) ?? '{}')).toEqual(first);
  });

  it('changes nothing when applied twice', () => {
    window.localStorage.setItem(LEGACY_SETUP_JOURNEY_STORAGE_KEY, JSON.stringify(v2('scan', { summary })));
    const first = readSetupJourney(window.localStorage);
    const stored = window.localStorage.getItem(SETUP_JOURNEY_STORAGE_KEY);
    expect(readSetupJourney(window.localStorage)).toEqual(first);
    expect(window.localStorage.getItem(SETUP_JOURNEY_STORAGE_KEY)).toBe(stored);
  });

  it('prefers a v3 journey over a leftover v2 one', () => {
    saveSetupJourney({ phase: 'compose', mode: 'real' }, window.localStorage);
    window.localStorage.setItem(LEGACY_SETUP_JOURNEY_STORAGE_KEY, JSON.stringify(v2('server')));
    expect(readSetupJourney(window.localStorage).phase).toBe('compose');
  });
});
