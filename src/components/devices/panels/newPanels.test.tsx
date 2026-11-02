// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MockEntityState, MockEntityStateMap } from '../../../types/ha';
import { ALARM_FEATURE_ARM_AWAY, ALARM_FEATURE_ARM_HOME, ALARM_FEATURE_ARM_VACATION, ALARM_FEATURE_TRIGGER } from '../../../utils/alarmUtils';
import { CALENDAR_FEATURE_CREATE_EVENT } from '../../../services/calendarClient';
import type { CalendarAgendaController } from '../../../hooks/useCalendarAgenda';
import type { MembersPresenceEntry } from '../../settings/types';
import { toDeviceModel } from '../model/device';
import { alarmExitDelay, alarmHouseOf, alarmModesOf, alarmTriggerZone, memberBattery, secondsLeft, vacuumModeControl } from '../model/panelRules';
import { AlarmPanel, type AlarmPanelCommands } from './AlarmPanel';
import { CalendarPanel } from './CalendarPanel';
import { DevicePanel } from './DevicePanel';
import { MembersPanel } from './MembersPanel';
import { PanelServicesProvider } from './panelServicesContext';
import { VacuumPanel, type VacuumPanelCommands } from './VacuumPanel';

const access = vi.hoisted(() => ({ canControl: true }));
vi.mock('../../../security/AccessControlProvider', () => ({ useCan: () => access.canControl }));

afterEach(() => {
  cleanup();
  access.canControl = true;
});

const entity = (state: string, rawAttributes: Record<string, unknown> = {}) => ({ state, rawAttributes }) as unknown as MockEntityState;

const alarmCommands = (): AlarmPanelCommands => ({
  disarm: vi.fn(), home: vi.fn(), away: vi.fn(), night: vi.fn(), vacation: vi.fn(), custom_bypass: vi.fn(), trigger: vi.fn(),
});

function renderAlarm(alarm: Partial<React.ComponentProps<typeof AlarmPanel>['alarm']>, haStates: MockEntityStateMap = {}, commands = alarmCommands()) {
  render(<AlarmPanel alarm={{ name: 'Allarme casa', state: 'disarmed', ...alarm }} haStates={haStates} commands={commands} onClose={vi.fn()} />);
  return commands;
}

describe('the alarm panel', () => {
  it('shows only the modes the entity declares', () => {
    renderAlarm({ supportedFeatures: ALARM_FEATURE_ARM_HOME | ALARM_FEATURE_ARM_VACATION });
    expect(screen.getByRole('button', { name: 'In casa' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Vacanza' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Fuori casa' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Notte' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Personalizzata' })).toBeNull();
    expect(screen.queryByText(/SOS/)).toBeNull();
  });

  it('keeps the three common modes when the entity declares nothing, and the emergency when it can', () => {
    expect(alarmModesOf(undefined)).toEqual(['home', 'away', 'night']);
    expect(alarmModesOf(0)).toEqual([]);
    renderAlarm({ supportedFeatures: ALARM_FEATURE_ARM_AWAY | ALARM_FEATURE_TRIGGER });
    expect(screen.getByRole('button', { name: /SOS/ })).toBeTruthy();
  });

  it('asks before arming with something open, and arms only when told to', () => {
    const states = { 'binary_sensor.bagno': entity('on', { device_class: 'window', friendly_name: 'Finestra bagno' }) };
    const commands = renderAlarm({ supportedFeatures: ALARM_FEATURE_ARM_AWAY }, states);
    fireEvent.click(screen.getByRole('button', { name: 'Fuori casa' }));
    expect(screen.getByText('Inserisco lo stesso?')).toBeTruthy();
    expect(screen.getByText('Finestra bagno aperta.')).toBeTruthy();
    expect(commands.away).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Annulla' }));
    expect(screen.queryByText('Inserisco lo stesso?')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Fuori casa' }));
    fireEvent.click(screen.getByRole('button', { name: 'Inserisci lo stesso' }));
    expect(commands.away).toHaveBeenCalledTimes(1);
  });

  it('arms at once with everything closed and no code', () => {
    const states = { 'binary_sensor.bagno': entity('off', { device_class: 'window' }) };
    const commands = renderAlarm({ supportedFeatures: ALARM_FEATURE_ARM_AWAY }, states);
    fireEvent.click(screen.getByRole('button', { name: 'Fuori casa' }));
    expect(commands.away).toHaveBeenCalledTimes(1);
  });

  it('does not send the command when the entity asks for a code', () => {
    const commands = renderAlarm({ state: 'armed_away', supportedFeatures: ALARM_FEATURE_ARM_AWAY, codeArmRequired: true, rawAttributes: { code_format: 'number' } });
    fireEvent.click(screen.getByRole('button', { name: 'Disinserito' }));
    expect(commands.disarm).not.toHaveBeenCalled();
  });

  it('counts the time to leave only when the integration gives it', () => {
    expect(alarmExitDelay({ exit_delay: 30 })).toBe(30);
    expect(alarmExitDelay({})).toBeNull();
    expect(secondsLeft(30, 1000, 11000)).toBe(20);
    expect(secondsLeft(30, 1000, 60000)).toBe(0);
    renderAlarm({ state: 'arming', rawAttributes: { exit_delay: 30 } });
    expect(screen.getByText('Uscita in corso')).toBeTruthy();
    expect(screen.getByText(/Hai \d+ secondi per uscire/)).toBeTruthy();
    cleanup();
    renderAlarm({ state: 'arming', rawAttributes: {} });
    expect(screen.getByText('Uscita in corso')).toBeTruthy();
    expect(screen.queryByText(/secondi per uscire/)).toBeNull();
  });

  it('when it goes off, offers only what exists around it', async () => {
    renderAlarm({ state: 'triggered' });
    expect(screen.getByText('Allarme in corso')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Chiama il 112' }).getAttribute('href')).toBe('tel:112');
    expect(screen.queryByRole('button', { name: 'Silenzia la sirena' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Vedi telecamera' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Ferma l’allarme' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Modalità dell’allarme' })).toBeNull();
    cleanup();

    const callService = vi.fn().mockResolvedValue(true);
    render(
      <PanelServicesProvider value={{ callApi: vi.fn().mockResolvedValue(null) as never, callService }}>
        <AlarmPanel alarm={{ name: 'Allarme', state: 'triggered' }} haStates={{ 'siren.a': entity('on') }} commands={alarmCommands()} onClose={vi.fn()} />
      </PanelServicesProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Silenzia la sirena' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sirena silenziata' })).toBeTruthy());
    expect(callService).toHaveBeenCalledWith('siren', 'turn_off', { entity_id: ['siren.a'] });
  });

  it('names what set it off only when the integration does', () => {
    const states = { 'binary_sensor.ingresso': entity('on', { friendly_name: 'Porta d’ingresso' }) };
    expect(alarmTriggerZone({ open_sensors: { 'binary_sensor.ingresso': 'on' } }, states)?.name).toBe('Porta d’ingresso');
    expect(alarmTriggerZone({}, states)).toBeNull();
  });

  it('shows only the state to who may not command it', () => {
    access.canControl = false;
    renderAlarm({ state: 'triggered', supportedFeatures: ALARM_FEATURE_ARM_AWAY }, { 'siren.a': entity('on') });
    expect(screen.queryByRole('button', { name: 'Ferma l’allarme' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Silenzia la sirena' })).toBeNull();
    cleanup();
    renderAlarm({ supportedFeatures: ALARM_FEATURE_ARM_AWAY });
    expect(screen.queryByRole('button', { name: 'Fuori casa' })).toBeNull();
  });

  it('looks at the area of the alarm, or at the whole house when it has none', () => {
    const states = {
      'binary_sensor.a': entity('on', { device_class: 'window' }),
      'binary_sensor.b': entity('on', { device_class: 'door' }),
      'binary_sensor.c': entity('unavailable', { device_class: 'door' }),
      'sensor.d': entity('20', { device_class: 'temperature' }),
    };
    const whole = alarmHouseOf(states, null, null);
    expect(whole.windows.map((item) => item.entityId)).toEqual(['binary_sensor.a']);
    expect(whole.doors.map((item) => item.entityId)).toEqual(['binary_sensor.b']);
    const near = alarmHouseOf(states, { 'binary_sensor.a': 'casa', 'binary_sensor.b': 'garage' }, 'casa');
    expect(near.windows).toHaveLength(1);
    expect(near.doors).toHaveLength(0);
  });
});

const vacuumCommands = (): VacuumPanelCommands => ({
  start: vi.fn(), pause: vi.fn(), stop: vi.fn(), returnToBase: vi.fn(), locate: vi.fn(), cleanSpot: vi.fn(), cleanArea: vi.fn(), setFanSpeed: vi.fn(),
});

function renderVacuum(vacuum: Partial<React.ComponentProps<typeof VacuumPanel>['vacuum']>, commands = vacuumCommands()) {
  render(<VacuumPanel vacuum={{ name: 'Robot', state: 'docked', ...vacuum }} commands={commands} onClose={vi.fn()} />);
  return commands;
}

describe('the robot panel', () => {
  it('shows nothing the robot does not declare', () => {
    renderVacuum({});
    for (const name of ['Avvia', 'Alla base', 'Trova', 'Ferma', 'Solo qui intorno']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
    expect(screen.queryByText('Aspirazione')).toBeNull();
    expect(screen.queryByText('Modalità')).toBeNull();
    expect(screen.queryByText('Manutenzione')).toBeNull();
    expect(screen.queryByText('batteria')).toBeNull();
  });

  it('shows what it declares, and runs it', () => {
    const commands = renderVacuum({ batteryLevel: 80, supportsStart: true, supportsReturnToBase: true, supportsLocate: true, supportsFanSpeed: true, fanSpeedList: ['quiet', 'max'], fanSpeed: 'quiet' });
    expect(screen.getByText('80%')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Avvia' }));
    fireEvent.click(screen.getByRole('button', { name: 'Trova' }));
    expect(commands.start).toHaveBeenCalledTimes(1);
    expect(commands.locate).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Aspirazione')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Alla base' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('pauses while it cleans, and stops when it cannot pause', () => {
    const commands = renderVacuum({ state: 'cleaning', supportsPause: true, supportsStart: true });
    fireEvent.click(screen.getByRole('button', { name: 'Pausa' }));
    expect(commands.pause).toHaveBeenCalledTimes(1);
    cleanup();
    renderVacuum({ state: 'cleaning', supportsStop: true, supportsStart: true });
    expect(screen.queryByRole('button', { name: 'Pausa' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Ferma' })).toBeTruthy();
  });

  it('in error says what the integration says and offers to resume', () => {
    renderVacuum({ state: 'error', supportsStart: true, rawAttributes: { error: 'La spazzola laterale è incastrata' } });
    expect(screen.getByText('Robot bloccato.')).toBeTruthy();
    expect(screen.getByText('La spazzola laterale è incastrata')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Riprendi' })).toBeTruthy();
  });

  it('offers rooms and the way of cleaning only when they exist', () => {
    const select = { domain: 'select', entityId: 'select.robot_mop_mode', name: 'Lavaggio', state: 'vacuum', options: ['vacuum', 'mop', 'both'] };
    expect(vacuumModeControl([select])).toBe(select);
    expect(vacuumModeControl([{ ...select, entityId: 'select.robot_language', name: 'Lingua' }])).toBeNull();
    render(<VacuumPanel vacuum={{ name: 'Robot', state: 'docked', supportsCleanArea: true }} areas={[{ id: 'a', name: 'Cucina' }] as never} commands={vacuumCommands()} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Cucina' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cucina' }));
    expect(screen.getByRole('button', { name: 'Pulisci 1 stanza' })).toBeTruthy();
  });

  it('shows only the parts it has sensors for', () => {
    renderVacuum({ relatedEntities: [{ entityId: 'sensor.filtro', domain: 'sensor', name: 'Filtro', state: '40', unit: '%' }] as never });
    expect(screen.getByText('Manutenzione')).toBeTruthy();
    expect(screen.getByText('Filtro')).toBeTruthy();
    expect(screen.queryByText('Altri controlli')).toBeNull();
  });
});

const agenda = (events: CalendarAgendaController['events'] = []): CalendarAgendaController => ({
  entityId: 'calendar.a', status: 'ready', events, error: null, busy: false, createEvent: vi.fn(), updateEvent: vi.fn(), deleteEvent: vi.fn(),
}) as unknown as CalendarAgendaController;

describe('the calendar panel', () => {
  it('offers a new event only when the entity can take one', () => {
    render(<CalendarPanel name="Famiglia" supportedFeatures={0} agenda={agenda()} onClose={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Nuovo evento' })).toBeNull();
    cleanup();
    render(<CalendarPanel name="Famiglia" supportedFeatures={CALENDAR_FEATURE_CREATE_EVENT} agenda={agenda()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Nuovo evento' }));
    expect(screen.getByText('Oggi · nessun evento')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Nuovo evento' })).toBeNull();
  });

  it('tells the events of today, and when there is nothing', () => {
    const now = new Date();
    now.setHours(23, 0, 0, 0);
    const later = new Date(now.getTime() + 30 * 60_000);
    render(<CalendarPanel name="Famiglia" supportedFeatures={0} agenda={agenda([{ uid: 'a', summary: 'Dentista', location: 'Studio', start: now.toISOString(), end: later.toISOString(), allDay: false }] as never)} onClose={vi.fn()} />);
    expect(screen.getByText('Oggi · 1 evento')).toBeTruthy();
    expect(screen.getByText('Dentista')).toBeTruthy();
    expect(screen.queryByText(/^Rifiuti/)).toBeNull();
  });
});

const member = (over: Partial<MembersPresenceEntry>): MembersPresenceEntry => ({
  id: 'a', personEntityId: 'person.a', name: 'Anna', trackerEntityIds: [], devices: { smartwatch: 0, tablet: 0, smartphone: 0, tracker: 0 }, ...over,
});

describe('the members panel', () => {
  it('counts who is in and out, and has no alert nor map while they are off', () => {
    render(<MembersPanel name="Membri" members={[member({ state: 'home' }), member({ personEntityId: 'person.b', name: 'Bruno', state: 'not_home', latitude: 1, longitude: 1 })]} haStates={{}} onClose={vi.fn()} />);
    expect(screen.getByText('1 a casa · 1 fuori')).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'Mappa dei membri' })).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByText(/Avvisami/)).toBeNull();
  });

  it('shows the map only when the option is on', () => {
    render(<MembersPanel name="Membri" mapEnabled members={[member({ state: 'home', latitude: 41.9, longitude: 12.5 })]} haStates={{}} onClose={vi.fn()} />);
    expect(screen.getByRole('img', { name: 'Mappa dei membri' })).toBeTruthy();
  });

  it('finds the battery of a phone on its tracker or on its device, and otherwise shows none', () => {
    const states = {
      'device_tracker.a': entity('home', { battery_level: 64 }),
      'device_tracker.b': entity('home'),
      'sensor.b_battery': entity('23', { device_class: 'battery' }),
      'device_tracker.c': entity('home'),
    };
    const registry = [{ entityId: 'device_tracker.b', deviceId: 'd' }, { entityId: 'sensor.b_battery', deviceId: 'd' }];
    expect(memberBattery(['device_tracker.a'], states, null)).toBe(64);
    expect(memberBattery(['device_tracker.b'], states, registry)).toBe(23);
    expect(memberBattery(['device_tracker.c'], states, registry)).toBeNull();
    expect(memberBattery([], states, registry)).toBeNull();
  });
});

describe('the fan and the cover declare their controls', () => {
  const panel = (entityId: string, state: MockEntityState) => {
    const model = toDeviceModel(entityId, state);
    if (!model) throw new Error('no model');
    render(<DevicePanel model={model} protectedPlug={false} onAction={vi.fn()} onClose={vi.fn()} />);
  };

  it('shows the speed, the presets and the oscillation of a fan only when declared', () => {
    panel('fan.a', entity('on', { friendly_name: 'Ventola', supported_features: 0 }));
    expect(screen.queryByRole('slider')).toBeNull();
    cleanup();
    panel('fan.a', entity('on', { friendly_name: 'Ventola', supported_features: 1, percentage: 50 }));
    expect(screen.getAllByRole('slider').length).toBeGreaterThan(0);
  });

  it('offers to open or close a cover only as far as it can', () => {
    panel('cover.a', entity('open', { friendly_name: 'Tenda', supported_features: 1 }));
    expect(screen.getByRole('button', { name: 'Aperta' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Chiusa' })).toBeNull();
  });
});
