// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadPanelEntry } from '../devices/panels/registry';
import type { MockEntityState } from '../../types/ha';
import { HomePanel } from './HomePanel';
import {
  homeClimateToModel,
  homeCoverToModel,
  lampToLightModel,
  runHomeClimateExtra,
  runHomeLightExtra,
  runClimateAction,
  runDeviceAction,
  runLightAction,
  runLockAction,
  runMediaAction,
} from './homePanelModels';
import { homePanelOf, type HomeClimate, type HomePanelActions, type HomePanelProps } from './homePanelRoute';
import type { ActiveDevice } from './types';

// Compiling a panel on its first import can take longer than a test is given.
beforeAll(async () => {
  await Promise.all((['light', 'plug', 'fan', 'humidifier', 'cover', 'climate', 'camera', 'vacuum', 'calendar', 'members', 'weather'] as const).map(loadPanelEntry));
}, 120_000);

afterEach(cleanup);

const entity = (state: string, rawAttributes: Record<string, unknown> = {}) => ({ state, rawAttributes }) as unknown as MockEntityState;

const actionsMock = (): HomePanelActions => ({
  toggleLamp: vi.fn(),
  setLampBrightness: vi.fn(),
  setLampColorTemp: vi.fn(),
  setLampHsColor: vi.fn(),
  setLampWhite: vi.fn(),
  setLampEffect: vi.fn(),
  flashLamp: vi.fn(),
  toggleClimatePower: vi.fn(),
  setClimateMode: vi.fn(),
  setClimateTargetTemp: vi.fn(),
  setClimateTargetRange: vi.fn(),
  setClimateFanMode: vi.fn(),
  setClimatePresetMode: vi.fn(),
  setClimateSwingMode: vi.fn(),
  setClimateTargetHumidity: vi.fn(),
  setClimateSwingHorizontalMode: vi.fn(),
  autoAdjustClimate: vi.fn(),
  toggleSwitch: vi.fn(),
  toggleFan: vi.fn(),
  setFanPercentage: vi.fn(),
  setFanPreset: vi.fn(),
  setFanOscillation: vi.fn(),
  setFanDirection: vi.fn(),
  toggleHumidifier: vi.fn(),
  setHumidifierTargetHumidity: vi.fn(),
  setHumidifierMode: vi.fn(),
  openCover: vi.fn(),
  closeCover: vi.fn(),
  stopCover: vi.fn(),
  setCoverPosition: vi.fn(),
  setCoverTiltPosition: vi.fn(),
  lockDoor: vi.fn(),
  unlockDoor: vi.fn(),
  openDoor: vi.fn(),
  toggleSpeakerPlayback: vi.fn(),
  toggleSpeakerPower: vi.fn(),
  previousSpeakerTrack: vi.fn(),
  nextSpeakerTrack: vi.fn(),
  seekSpeakerPosition: vi.fn(),
  setSpeakerVolume: vi.fn(),
  toggleSpeakerMute: vi.fn(),
  toggleSpeakerShuffle: vi.fn(),
  cycleSpeakerRepeatMode: vi.fn(),
  selectSpeakerSoundMode: vi.fn(),
  selectSpeakerOutputDevice: vi.fn(),
  toggleSpeakerGroupMember: vi.fn(),
  moveCameraPtz: vi.fn(),
  stopCameraPtz: vi.fn(),
  runCameraRelatedEntityAction: vi.fn(),
});

const climate: HomeClimate = {
  mode: 'heat',
  currentTemp: 20.5,
  targetTemp: 22,
  minTemp: 7,
  maxTemp: 35,
  targetTempStep: 0.5,
  hvacModes: ['off', 'heat', 'cool'],
  hvacAction: 'heating',
  fanModes: ['low', 'high'],
  fanMode: 'low',
};

const propsFor = (activeDevice: Partial<ActiveDevice> & Pick<ActiveDevice, 'type'>, extra: Partial<HomePanelProps> = {}): HomePanelProps => ({
  activeDevice: { id: 'card', name: 'Card', ...activeDevice } as ActiveDevice,
  lamp: { name: 'Card', isOn: true, brightness: 72, colorTemp: 3000, supportsBrightness: true, supportsColorTemp: true },
  climate,
  cover: { state: 'open', position: 60, supportedFeatures: 15 },
  camera: { name: 'Camera' },
  speaker: { status: 'idle' },
  lock: { name: 'Serratura', state: 'locked' },
  coverIsReadOnly: false,
  weather: { available: false, source: 'offline' } as unknown as HomePanelProps['weather'],
  haStates: {},
  actions: actionsMock(),
  alarm: { name: 'Allarme', state: 'disarmed' },
  alarmCommands: { disarm: vi.fn(), home: vi.fn(), away: vi.fn(), night: vi.fn(), vacation: vi.fn(), custom_bypass: vi.fn(), trigger: vi.fn() },
  vacuum: { name: 'Robot', state: 'docked' },
  vacuumCommands: { start: vi.fn(), pause: vi.fn(), stop: vi.fn(), returnToBase: vi.fn(), locate: vi.fn(), cleanSpot: vi.fn(), cleanArea: vi.fn(), setFanSpeed: vi.fn() },
  calendarAgenda: { entityId: 'calendar.a', status: 'ready', events: [], error: null, busy: false, createEvent: vi.fn(), updateEvent: vi.fn(), deleteEvent: vi.fn() } as unknown as HomePanelProps['calendarAgenda'],
  panelCommandsEnabled: true,
  embedded: false,
  onClose: vi.fn(),
  ...extra,
});

describe('the light of the Home', () => {
  it('reads what the Home knows of the light', () => {
    const lamp = { name: 'x', isOn: true, brightness: 72, colorTemp: 3000, supportsColor: true, hsColor: [200, 80], minColorTempKelvin: 2200, maxColorTempKelvin: 6000 };
    expect(lampToLightModel('light.a', 'Faretti', lamp)).toMatchObject({
      entityId: 'light.a', name: 'Faretti', on: true, available: true, caps: 'color', mode: 'temp', brightnessPct: 72, kelvin: 3000, hue: 200, saturation: 80, minKelvin: 2200, maxKelvin: 6000,
    });
    expect(lampToLightModel('light.a', 'x', { ...lamp, colorTemp: undefined }).mode).toBe('color');
    expect(lampToLightModel('light.a', 'x', { name: 'x', isOn: false, brightness: 0 })).toMatchObject({ caps: 'onoff', brightnessPct: null });
    expect(lampToLightModel('light.a', 'x', { ...lamp, status: 'unavailable' }).available).toBe(false);
  });

  it('runs the commands of the panel through those of the Home', () => {
    const actions = actionsMock();
    const model = lampToLightModel('light.a', 'x', { name: 'x', isOn: true, brightness: 50, colorTemp: 3000, supportsColor: true, hsColor: [120, 100] });
    runLightAction({ type: 'turn_off' }, model, actions);
    runLightAction({ type: 'brightness', pct: 40 }, model, actions);
    runLightAction({ type: 'kelvin', kelvin: 4000 }, model, actions);
    runLightAction({ type: 'hue', hue: 30 }, model, actions);
    runLightAction({ type: 'mode', mode: 'color' }, model, actions);
    runLightAction({ type: 'mode', mode: 'temp' }, model, actions);
    expect(actions.toggleLamp).toHaveBeenCalledTimes(1);
    expect(actions.setLampBrightness).toHaveBeenCalledWith(40);
    expect(actions.setLampColorTemp).toHaveBeenNthCalledWith(1, 4000);
    expect(actions.setLampHsColor).toHaveBeenNthCalledWith(1, [30, 100]);
    expect(actions.setLampHsColor).toHaveBeenNthCalledWith(2, [120, 100]);
    expect(actions.setLampColorTemp).toHaveBeenNthCalledWith(2, 3000);
    runHomeLightExtra({ type: 'white', value: 65 }, actions);
    runHomeLightExtra({ type: 'effect', effect: 'rainbow' }, actions);
    runHomeLightExtra({ type: 'flash', mode: 'short' }, actions);
    expect(actions.setLampWhite).toHaveBeenCalledWith(65);
    expect(actions.setLampEffect).toHaveBeenCalledWith('rainbow');
    expect(actions.flashLamp).toHaveBeenCalledWith('short');
  });
});

describe('the climate of the Home', () => {
  it('goes through the builder of Rooms, and says when there is no entity', () => {
    const model = homeClimateToModel('climate.a', 'Sala', climate);
    expect(model).toMatchObject({ name: 'Sala', available: true, mode: 'heat', current: 20.5, target: 22, step: 0.5, activity: 'heating', fanModes: ['low', 'high'] });
    expect(homeClimateToModel('climate.a', 'Sala', { ...climate, targetTemp: Number.NaN, maxTemp: Number.NaN }).available).toBe(false);
  });

  it('runs a step as the target it reaches', () => {
    const actions = actionsMock();
    const model = homeClimateToModel('climate.a', 'Sala', climate);
    runClimateAction({ type: 'step', delta: 1 }, model, actions);
    runClimateAction({ type: 'mode', mode: 'cool' }, model, actions);
    runClimateAction({ type: 'fan', fanMode: 'high' }, model, actions);
    expect(actions.setClimateTargetTemp).toHaveBeenCalledWith(22.5);
    expect(actions.setClimateMode).toHaveBeenCalledWith('cool');
    expect(actions.setClimateFanMode).toHaveBeenCalledWith('high');
    runHomeClimateExtra({ type: 'humidity', value: 48 }, actions);
    runHomeClimateExtra({ type: 'horizontal_swing', mode: 'left' }, actions);
    runHomeClimateExtra({ type: 'auto_adjust' }, actions);
    expect(actions.setClimateTargetHumidity).toHaveBeenCalledWith(48);
    expect(actions.setClimateSwingHorizontalMode).toHaveBeenCalledWith('left');
    expect(actions.autoAdjustClimate).toHaveBeenCalledTimes(1);
  });
});

describe('the devices of the Home', () => {
  it('reads a cover through the builder of Rooms', () => {
    expect(homeCoverToModel('Tapparella', { state: 'open', position: 60, supportedFeatures: 15 })).toMatchObject({ kind: 'cover', name: 'Tapparella', on: true });
  });

  it('toggles the device the card is', () => {
    const actions = actionsMock();
    runDeviceAction({ type: 'turn_on' }, 'fan', actions);
    runDeviceAction({ type: 'turn_off' }, 'humidifier', actions);
    runDeviceAction({ type: 'turn_on' }, 'switch', actions);
    expect(actions.toggleFan).toHaveBeenCalledTimes(1);
    expect(actions.toggleHumidifier).toHaveBeenCalledTimes(1);
    expect(actions.toggleSwitch).toHaveBeenCalledTimes(1);
  });

  it('runs the commands of fans, covers and humidifiers', () => {
    const actions = actionsMock();
    runDeviceAction({ type: 'fan_pct', pct: 40 }, 'fan', actions);
    runDeviceAction({ type: 'fan_preset', preset: 'auto' }, 'fan', actions);
    runDeviceAction({ type: 'fan_preset', preset: null }, 'fan', actions);
    runDeviceAction({ type: 'cover_position', position: 30 }, 'cover', actions);
    runDeviceAction({ type: 'cover_stop' }, 'cover', actions);
    runDeviceAction({ type: 'humidity', target: 50 }, 'humidifier', actions);
    expect(actions.setFanPercentage).toHaveBeenCalledWith(40);
    expect(actions.setFanPreset).toHaveBeenCalledTimes(1);
    expect(actions.setCoverPosition).toHaveBeenCalledWith(30);
    expect(actions.stopCover).toHaveBeenCalledTimes(1);
    expect(actions.setHumidifierTargetHumidity).toHaveBeenCalledWith(50);
  });

  it('keeps the existing lock authorization result when the shared panel asks to unlock', () => {
    const actions = actionsMock();
    actions.unlockDoor = vi.fn(() => false);
    expect(runLockAction('unlock', actions)).toBe(false);
    expect(actions.unlockDoor).toHaveBeenCalledTimes(1);
    expect(runLockAction('lock', actions)).toBeUndefined();
    expect(actions.lockDoor).toHaveBeenCalledTimes(1);
  });

  it('routes media commands through the existing Home actions', () => {
    const actions = actionsMock();
    runMediaAction({ type: 'play_pause' }, actions);
    runMediaAction({ type: 'volume', level: 0.35 }, actions);
    runMediaAction({ type: 'source', source: 'TV' }, actions);
    runMediaAction({ type: 'group', member: 'media_player.cucina', joined: true }, actions);
    expect(actions.toggleSpeakerPlayback).toHaveBeenCalledTimes(1);
    expect(actions.setSpeakerVolume).toHaveBeenCalledWith(0.35);
    expect(actions.selectSpeakerOutputDevice).toHaveBeenCalledWith('TV');
    expect(actions.toggleSpeakerGroupMember).toHaveBeenCalledWith('media_player.cucina', true);
  });
});

describe('what the Home opens', () => {
  const fan = { state: 'on', rawAttributes: { friendly_name: 'Ventola', supported_features: 1, percentage: 50 } } as unknown as MockEntityState;

  it('opens a shared panel for the cards it can read', () => {
    expect(homePanelOf(propsFor({ type: 'light' }))).toBe('light');
    expect(homePanelOf(propsFor({ type: 'climate' }))).toBe('climate');
    expect(homePanelOf(propsFor({ type: 'cover' }))).toBe('device');
    expect(homePanelOf(propsFor({ type: 'sensor', sensorEntityId: 'sensor.a' }, { haStates: { 'sensor.a': fan } }))).toBe('sensor');
    for (const type of ['alarm', 'vacuum', 'calendar', 'members'] as const) {
      expect(homePanelOf(propsFor({ type })), type).toBe(type);
    }
    expect(homePanelOf(propsFor({ type: 'fan', fanEntityId: 'fan.a' }, { haStates: { 'fan.a': fan } }))).toBe('device');
  });

  it('keeps the old content only for a card without a live entity', () => {
    expect(homePanelOf(propsFor({ type: 'fan', fanEntityId: 'fan.a' }))).toBeNull();
    expect(homePanelOf(propsFor({ type: 'switch' }))).toBeNull();
    expect(homePanelOf(propsFor({ type: 'sensor', sensorEntityId: 'sensor.a' }))).toBe('sensor');
    expect(homePanelOf(propsFor({ type: 'weather' }))).toBe('weather');
    for (const type of ['lock', 'camera', 'media', 'sensor'] as const) {
      expect(homePanelOf(propsFor({ type })), type).toBeNull();
    }
  });

  it('opens the shared security, camera and media panels only for their real HA entity', () => {
    const lock = entity('locked', { friendly_name: 'Porta', supported_features: 1 });
    const camera = entity('streaming', { friendly_name: 'Ingresso' });
    const media = entity('playing', { friendly_name: 'Cassa' });
    expect(homePanelOf(propsFor({ type: 'lock', id: 'lock.porta', name: 'Porta' }, { haStates: { 'lock.porta': lock } }))).toBe('security');
    expect(homePanelOf(propsFor({ type: 'camera', name: 'Ingresso' }, { camera: { name: 'Ingresso', entityId: 'camera.ingresso' }, haStates: { 'camera.ingresso': camera } }))).toBe('camera');
    expect(homePanelOf(propsFor({ type: 'media', name: 'Cassa' }, { haStates: { 'media_player.cassa': media } }))).toBe('media');
    expect(homePanelOf(propsFor({ type: 'camera', name: 'Ingresso' }, { camera: { name: 'Ingresso', entityId: 'camera.ingresso' } }))).toBeNull();
  });

  it('shows the same header in the column and in the sheet of a phone', async () => {
    const onClose = vi.fn();
    const { rerender } = render(<HomePanel {...propsFor({ type: 'light', name: 'Faretti' }, { onClose })} />);
    expect(await screen.findByRole('heading', { name: 'Faretti' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(<HomePanel {...propsFor({ type: 'light', name: 'Faretti' }, { embedded: true, onClose })} />);
    expect(screen.getByRole('heading', { name: 'Faretti' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Chiudi.*dispositivo/i }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: /Faretti/ }).getAttribute('aria-pressed')).toBe('true');
  });

  it('opens a protected cover read only: its state stays, its commands do not', () => {
    const props = propsFor({ type: 'cover', name: 'Garage' }, { coverIsReadOnly: true });
    const { container } = render(<HomePanel {...props} />);
    expect(screen.getByRole('heading', { name: 'Garage' })).toBeTruthy();
    expect(screen.getByText(/Solo lettura/)).toBeTruthy();
    expect(container.querySelector('.panel-shell.is-off .panel-shell-main[inert]')).toBeTruthy();
    // A browser does not let a click reach what is inert; jsdom does, so they are left out.
    for (const button of [...screen.queryAllByRole('button'), ...screen.queryAllByRole('radio')]) {
      if (button.getAttribute('aria-label') !== 'Chiudi' && !button.closest('[inert]')) fireEvent.click(button);
    }
    expect(props.actions.openCover).not.toHaveBeenCalled();
    expect(props.actions.closeCover).not.toHaveBeenCalled();
  });

  it('toggles from the power of the panel', async () => {
    const props = propsFor({ type: 'light', name: 'Faretti' });
    render(<HomePanel {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: /Faretti/ }));
    expect(props.actions.toggleLamp).toHaveBeenCalledTimes(1);
  });
});
