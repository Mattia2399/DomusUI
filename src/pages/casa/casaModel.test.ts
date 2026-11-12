// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { MockEntityStateMap } from '../../types/ha';
import {
  climateStatus,
  collectAttention,
  collectionDay,
  energyStatus,
  irrigationStatus,
  openOpenings,
  resolveAlarmEntityId,
  securityStatus,
  wasteStatus,
  type Translate,
} from './casaModel';

// The keys and their parameters, to read what the model asks for.
const t: Translate = (key, parameters) => (parameters ? `${key}${JSON.stringify(parameters)}` : key);

const sensor = (state: string, deviceClass: string, name: string) => ({ state, rawAttributes: { device_class: deviceClass, friendly_name: name } });

describe('security', () => {
  const house = (alarm: string, extra: MockEntityStateMap = {}): MockEntityStateMap => ({
    'alarm_control_panel.casa': { state: alarm },
    'binary_sensor.ingresso': sensor('off', 'door', 'Porta ingresso'),
    'binary_sensor.bagno': sensor('off', 'window', 'Finestra bagno'),
    'binary_sensor.movimento': sensor('on', 'motion', 'Movimento'),
    ...extra,
  });

  it('takes the alarm chosen in Sicurezza, or the first one', () => {
    const states = house('disarmed', { 'alarm_control_panel.garage': { state: 'disarmed' } });
    expect(resolveAlarmEntityId(states, 'alarm_control_panel.garage')).toBe('alarm_control_panel.garage');
    expect(resolveAlarmEntityId(states, 'alarm_control_panel.gone')).toBe('alarm_control_panel.casa');
    expect(resolveAlarmEntityId({}, '')).toBeNull();
  });

  it('is not set up without an alarm', () => {
    expect(securityStatus({}, null, t)).toEqual({ kind: 'absent' });
  });

  it('says the state and that all is closed, with nothing to look at', () => {
    expect(securityStatus(house('disarmed'), 'alarm_control_panel.casa', t)).toEqual({
      kind: 'ready',
      text: 'security.state.disarmed · casa.status.allClosed',
      warn: false,
      attention: [],
    });
  });

  it('counts only doors and windows that are open, not motion', () => {
    const states = house('armed_away', { 'binary_sensor.bagno': sensor('on', 'window', 'Finestra bagno') });
    expect(openOpenings(states)).toEqual(['Finestra bagno']);
    const status = securityStatus(states, 'alarm_control_panel.casa', t);
    expect(status).toMatchObject({ kind: 'ready', warn: true, attention: ['casa.attention.open{"name":"Finestra bagno"}'] });
    expect(status.kind === 'ready' && status.text).toBe('security.state.away · casa.status.openOne{"name":"Finestra bagno"}');
  });

  it('asks for a look when the alarm went off or does not respond', () => {
    expect(securityStatus(house('triggered'), 'alarm_control_panel.casa', t)).toMatchObject({ warn: true, attention: ['casa.attention.alarmTriggered'] });
    expect(securityStatus(house('unavailable'), 'alarm_control_panel.casa', t)).toMatchObject({ warn: true, attention: ['casa.attention.alarmUnavailable'] });
  });
});

describe('the functions of Domus Core', () => {
  it('climate: unknown until read, absent without zones, else its zones', () => {
    expect(climateStatus(undefined, t)).toEqual({ kind: 'unknown' });
    expect(climateStatus({ state: 'absent', revision: 0, config: null }, t)).toEqual({ kind: 'absent' });
    const config = { state: 'ready' as const, revision: 1, config: { zones: [{}, {}] } as never };
    expect(climateStatus(config, t)).toMatchObject({ kind: 'ready', text: 'casa.status.climateMany{"count":2}' });
  });

  it('energy: absent when not configured, else the consumption of now', () => {
    expect(energyStatus({ configured: false } as never, t, 'it-IT')).toEqual({ kind: 'absent' });
    const state = { configured: true, home_consumption: { value: 0.6, unit: 'kW' } } as never;
    expect(energyStatus(state, t, 'it-IT')).toMatchObject({ kind: 'ready', text: 'casa.status.energyNow{"value":"0,6 kW"}' });
    expect(energyStatus({ configured: true, home_consumption: null } as never, t, 'it-IT')).toMatchObject({ text: 'casa.status.energyReady' });
  });

  it('irrigation: a fault is a thing to look at; running zones are counted', () => {
    const config = { mode: 'enabled', zones: [{ entityId: 'switch.siepe' }] } as never;
    expect(irrigationStatus({ mode: 'enabled', zones: [{ entityId: ' ' }] } as never, null, t)).toEqual({ kind: 'absent' });
    expect(irrigationStatus(config, { mode: 'fault', sessions: [] } as never, t)).toMatchObject({ warn: true, attention: ['casa.attention.irrigationFault'] });
    expect(irrigationStatus(config, { mode: 'enabled', sessions: [{ state: 'running' }, { state: 'queued' }] } as never, t)).toMatchObject({ text: 'casa.status.irrigationRunningOne' });
    expect(irrigationStatus(config, { mode: 'paused', sessions: [] } as never, t)).toMatchObject({ text: 'casa.status.irrigationPaused' });
  });

  it('waste: the next collection, by day', () => {
    const now = new Date('2026-11-13T10:00:00');
    const config = { mappings: [{}] } as never;
    expect(wasteStatus({ mappings: [] } as never, null, t, 'it-IT', now)).toEqual({ kind: 'absent' });
    const preview = { events: [
      { uid: 'b', summary: 'Carta', start: '2026-11-16', end: '2026-11-17', all_day: true },
      { uid: 'a', summary: 'Plastica', start: '2026-11-13', end: '2026-11-14', all_day: true },
    ], warnings: [], generatedAt: '' };
    expect(wasteStatus(config, preview, t, 'it-IT', now)).toMatchObject({ text: 'casa.status.wasteNext{"when":"casa.when.today","what":"Plastica"}' });
    expect(wasteStatus(config, { events: [], warnings: [], generatedAt: '' }, t, 'it-IT', now)).toMatchObject({ text: 'casa.status.wasteNone' });
  });

  it('names the day of a collection', () => {
    const now = new Date('2026-11-13T10:00:00');
    expect(collectionDay('2026-11-14', now, t, 'it-IT')).toBe('casa.when.tomorrow');
    expect(collectionDay('2026-11-16', now, t, 'it-IT')).toBe('Lunedì');
  });
});

describe('the summary', () => {
  it('gathers the things to look at of the functions in view', () => {
    expect(collectAttention([
      { kind: 'ready', text: '', warn: true, attention: ['Aperto: Finestra bagno'] },
      { kind: 'unknown' },
      { kind: 'ready', text: '', warn: true, attention: ['L’irrigazione segnala un guasto'] },
    ])).toEqual(['Aperto: Finestra bagno', 'L’irrigazione segnala un guasto']);
  });
});
