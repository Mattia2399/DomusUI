import { cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type React from 'react';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../../i18n/I18nProvider';
import type { DeviceModel } from '../model/device';
import { toDeviceModel } from '../model/device';
import { toClimateModel } from '../model/climate';
import type { LightModel } from '../model/light';
import type { PlugEnergy } from '../model/plugEnergy';
import { lightEntry, type LightPanelInput } from './entries/light';
import { calendarEntry } from './entries/calendar';
import { cameraEntry } from './entries/camera';
import { climateEntry, type ClimatePanelInput } from './entries/climate';
import { membersEntry } from './entries/members';
import { vacuumEntry, type VacuumPanelCommands } from './entries/vacuum';
import { coverEntry, fanEntry, humidifierEntry, plugEntry, type DevicePanelInput } from './entries/device';
import { PanelView } from './PanelView';
import { arrangeControls, loadPanelEntry } from './registry';

const wrapper = ({ children }: { children: React.ReactNode }) => <I18nProvider>{children}</I18nProvider>;

beforeEach(() => {
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it');
});

afterEach(() => {
  cleanup();
  window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
});

const lightModel = (over: Partial<LightModel> = {}) =>
  ({ entityId: 'light.sala', name: 'Faretti', on: true, available: true, caps: 'color', mode: 'color', brightnessPct: 60, hue: 30, saturation: 100, kelvin: 3000, minKelvin: 2000, maxKelvin: 6500, ...over }) as LightModel;

const lightInput = (over: Partial<LightPanelInput> = {}): LightPanelInput => ({ model: lightModel(), onAction: vi.fn(), ...over });

const specOf = <I,>(useSpec: (input: I) => ReturnType<typeof lightEntry.useSpec>, input: I) => renderHook(() => useSpec(input), { wrapper }).result.current;
const labels = (spec: ReturnType<typeof lightEntry.useSpec>) => {
  if (!spec.controls) return (spec.shortcuts ?? []).map((item) => item.label);
  const { main, more } = arrangeControls(spec.layout, spec.controls ?? []);
  return [...main, ...more].map((entry) => entry.control.label);
};

function drawn(useSpec: (input: never) => ReturnType<typeof lightEntry.useSpec>, input: unknown) {
  function View() {
    return <PanelView spec={useSpec(input as never)} onClose={vi.fn()} />;
  }
  return render(<View />, { wrapper });
}

describe('the registry', () => {
  it('loads each entry on request', async () => {
    expect(await loadPanelEntry('light')).toBe(lightEntry);
    expect(await loadPanelEntry('plug')).toBe(plugEntry);
    expect(await loadPanelEntry('fan')).toBe(fanEntry);
    expect(await loadPanelEntry('humidifier')).toBe(humidifierEntry);
    expect(await loadPanelEntry('cover')).toBe(coverEntry);
    expect(await loadPanelEntry('climate')).toBe(climateEntry);
    expect(await loadPanelEntry('camera')).toBe(cameraEntry);
    expect(await loadPanelEntry('vacuum')).toBe(vacuumEntry);
    expect(await loadPanelEntry('calendar')).toBe(calendarEntry);
    expect(await loadPanelEntry('members')).toBe(membersEntry);
    expect((await loadPanelEntry('sensor')).useSpec).toBeTypeOf('function');
    expect((await loadPanelEntry('weather')).useSpec).toBeTypeOf('function');
  });
});

describe('a light', () => {
  it('has its brightness in the middle and the power at the left of the header', () => {
    const spec = specOf(lightEntry.useSpec, lightInput());
    expect(spec.heroKind).toBe('slider');
    expect(spec.action?.kind).toBe('power');
  });

  it('offers a shortcut only for what it exposes', () => {
    expect(labels(specOf(lightEntry.useSpec, lightInput({ model: lightModel({ caps: 'dim' }) })))).toEqual([]);
    expect(labels(specOf(lightEntry.useSpec, lightInput({ model: lightModel({ caps: 'ct', mode: 'temp' }) })))).toEqual(['Bianchi']);
    expect(labels(specOf(lightEntry.useSpec, lightInput()))).toEqual(['Bianchi', 'Colore']);
    expect(labels(specOf(lightEntry.useSpec, lightInput({ model: lightModel({ hasWhites: false }) })))).toEqual(['Colore']);
    expect(
      labels(specOf(lightEntry.useSpec, lightInput({ extras: { supportsWhite: true, supportsEffects: true, supportsFlash: true, effects: ['colorloop'] }, onExtraAction: vi.fn() }))),
    ).toEqual(['Bianchi', 'Colore', 'Effetti', 'LED bianco', 'Lampeggio']);
  });

  it('takes no effects without a list of them', () => {
    const spec = specOf(lightEntry.useSpec, lightInput({ extras: { supportsEffects: true, effects: [] }, onExtraAction: vi.fn() }));
    expect(labels(spec)).not.toContain('Effetti');
  });

  it('has nothing to drag when it only switches', () => {
    expect(specOf(lightEntry.useSpec, lightInput({ model: lightModel({ caps: 'onoff', brightnessPct: null }) })).heroKind).toBe('value');
  });

  it('opens a shortcut, keeps the row, and touching it again goes back', () => {
    const { container } = drawn(lightEntry.useSpec, lightInput({ extras: { supportsEffects: true, effects: ['colorloop'] }, onExtraAction: vi.fn() }));
    const row = () => within(screen.getByRole('navigation', { name: 'Regolazioni' }));
    expect(container.querySelector('.panel-hero-back')).toBeNull();
    fireEvent.click(row().getByRole('button', { name: 'Effetti' }));
    expect(row().getByRole('button', { name: 'Effetti' })).toBeTruthy();
    fireEvent.click(row().getByRole('button', { name: 'Effetti' }));
    expect(container.querySelector('.panel-hero-back')).toBeNull();
  });

  it('calls its effects by their translated name, and flashes at once', () => {
    const onExtraAction = vi.fn();
    drawn(lightEntry.useSpec, lightInput({ extras: { supportsEffects: true, supportsFlash: true, effects: ['colorloop', 'mio_effetto'] }, onExtraAction }));
    const dialog = screen.getByRole('region', { name: 'Effetti' });
    expect(within(dialog).getByRole('radio', { name: 'Ciclo colori' })).toBeTruthy();
    expect(within(dialog).getByRole('radio', { name: 'Mio effetto' })).toBeTruthy();
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Regolazioni' })).getByRole('button', { name: 'Lampeggio' }));
    expect(onExtraAction).toHaveBeenCalledWith({ type: 'flash', mode: 'short' });
  });

  it('turns on and off from its power', () => {
    const onAction = vi.fn();
    drawn(lightEntry.useSpec, lightInput({ onAction }));
    fireEvent.click(screen.getByRole('button', { name: 'Spegni Faretti' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'turn_off' });
  });

  it('keeps the colour disc on a white handle, in the place of the slider while the colours are open', () => {
    const { container } = drawn(lightEntry.useSpec, lightInput());
    expect(container.querySelector('.panel-hero-main .glass-color-picker')).toBeNull();
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Regolazioni' })).getByRole('button', { name: 'Colore' }));
    const disc = container.querySelector('.panel-hero-main .glass-color-picker');
    expect(disc).toBeTruthy();
    expect(disc?.querySelector<HTMLElement>('.glass-color-picker-handle')?.style.background).toBe('');
  });
});

describe('a plug', () => {
  const plug = (entity: Record<string, unknown> = {}, watts: number | null = null) =>
    toDeviceModel('switch.tv', { state: 'on', rawAttributes: { friendly_name: 'TV' }, ...entity } as never, { watts }) as DeviceModel;
  const input = (over: Partial<DevicePanelInput> = {}): DevicePanelInput => ({ model: plug(), onAction: vi.fn(), ...over });

  it('shows what it draws, or else its state, large', () => {
    expect(specOf(plugEntry.useSpec, input({ model: plug({}, 86) })).heroKind).toBe('data');
    expect(specOf(plugEntry.useSpec, input()).heroKind).toBe('value');
  });

  it('offers protection and timer only where they exist', () => {
    expect(labels(specOf(plugEntry.useSpec, input()))).toEqual([]);
    expect(labels(specOf(plugEntry.useSpec, input({ onToggleProtected: vi.fn(), onSetTimer: vi.fn() })))).toEqual(['Timer', 'Protetta']);
  });

  it('switches its protection at once', () => {
    const onToggleProtected = vi.fn();
    drawn(plugEntry.useSpec, input({ onToggleProtected }));
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Regolazioni' })).getByRole('button', { name: 'Protetta' }));
    expect(onToggleProtected).toHaveBeenCalledWith(true);
  });

  it('turns off at once, unless it is protected: then it asks first', () => {
    const onAction = vi.fn();
    const { unmount } = drawn(plugEntry.useSpec, input({ onAction }));
    fireEvent.click(screen.getByRole('button', { name: 'Spegni TV' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'turn_off' });
    unmount();
    onAction.mockClear();
    drawn(plugEntry.useSpec, input({ onAction, protectedPlug: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Spegni TV' }));
    expect(onAction).not.toHaveBeenCalled();
    const asked = screen.getAllByRole('button', { name: 'Spegni' });
    fireEvent.click(asked[0]);
    expect(onAction).toHaveBeenCalledWith({ type: 'turn_off' });
    expect(screen.queryAllByRole('button', { name: 'Annulla' })).toHaveLength(0);
  });

  it('offers five times for the timer', () => {
    drawn(plugEntry.useSpec, input({ onSetTimer: vi.fn() }));
    const dialog = screen.getByRole('region', { name: 'Spegnimento automatico' });
    expect(within(dialog).getAllByRole('radio')).toHaveLength(5);
  });

  const day = (cost: number | null, month: number | null = 38.6): PlugEnergy => ({
    hours: Array.from({ length: 24 }, (_, hour) => (hour <= 10 ? 0.05 : null)),
    hourNow: 10,
    today: 0.55,
    month,
    cost,
  });

  it('says what it used today and this month, and what today cost', () => {
    drawn(plugEntry.useSpec, input({ model: plug({}, 96), energy: day(0.2) }));
    expect(screen.getByText('Oggi')).toBeTruthy();
    expect(screen.getByText('0,55 kWh')).toBeTruthy();
    expect(screen.getByText('38,60 kWh')).toBeTruthy();
    expect(screen.getByText(/≈ 0,20\s€/)).toBeTruthy();
  });

  it('offers to set a tariff when there is none, and leaves the cost out when it cannot', () => {
    const onSetTariff = vi.fn();
    const { unmount } = drawn(plugEntry.useSpec, input({ model: plug({}, 96), energy: day(null), onSetTariff }));
    fireEvent.click(screen.getByRole('button', { name: 'Imposta tariffa' }));
    expect(onSetTariff).toHaveBeenCalledTimes(1);
    unmount();
    drawn(plugEntry.useSpec, input({ model: plug({}, 96), energy: day(null, null) }));
    expect(screen.queryByText('Costo oggi')).toBeNull();
    expect(screen.queryByText('Questo mese')).toBeNull();
  });

  it('shows only the power now without statistics', () => {
    drawn(plugEntry.useSpec, input({ model: plug({}, 96), energy: null }));
    expect(screen.getByText('96')).toBeTruthy();
    expect(screen.queryByText('Oggi')).toBeNull();
  });

  it('sets, shows and cancels the switch-off timer', () => {
    const onSetTimer = vi.fn();
    const first = drawn(plugEntry.useSpec, input({ timer: null, timerNow: 0, onSetTimer }));
    expect(screen.getByText(/Nessun timer attivo/)).toBeTruthy();
    const none = screen.getByRole('region', { name: 'Spegnimento automatico' });
    expect(within(none).getByRole('radio', { name: 'Off' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(within(none).getByRole('radio', { name: /^30\smin$/ }));
    expect(onSetTimer).toHaveBeenCalledWith(30);
    first.unmount();

    const second = drawn(plugEntry.useSpec, input({ timer: { entityId: 'switch.tv', minutes: 60, endsAt: 47 * 60_000 }, timerNow: 0, onSetTimer }));
    expect(screen.getByText(/tra 47\smin/)).toBeTruthy();
    const running = screen.getByRole('region', { name: 'Spegnimento automatico' });
    expect(within(running).getByRole('radio', { name: /^1\sh$/ }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(within(running).getByRole('radio', { name: 'Off' }));
    expect(onSetTimer).toHaveBeenLastCalledWith(0);
    second.unmount();

    drawn(plugEntry.useSpec, input());
    expect(screen.queryByRole('region', { name: 'Spegnimento automatico' })).toBeNull();
  });
});

const device = (entityId: string, state: string, attributes: Record<string, unknown>) =>
  toDeviceModel(entityId, { state, rawAttributes: { friendly_name: 'Dispositivo', ...attributes } } as never) as DeviceModel;

describe('a fan', () => {
  const full = () => device('fan.a', 'on', { supported_features: 7, percentage: 50, percentage_step: 25, preset_modes: ['Auto'], preset_mode: 'Auto', oscillating: true, direction: 'forward' });

  it('has its speed in the middle, and the power at the left of the header', () => {
    const spec = specOf(fanEntry.useSpec, { model: full(), onAction: vi.fn() });
    expect(spec.heroKind).toBe('slider');
    expect(spec.action?.kind).toBe('power');
  });

  it('offers a shortcut only for what it exposes', () => {
    expect(labels(specOf(fanEntry.useSpec, { model: full(), onAction: vi.fn(), onSetTimer: vi.fn() }))).toEqual(['Modalità', 'Oscillazione', 'Direzione', 'Timer']);
    const bare = specOf(fanEntry.useSpec, { model: device('fan.a', 'on', { supported_features: 0 }), onAction: vi.fn() });
    expect(labels(bare)).toEqual([]);
    expect(bare.heroKind).toBe('value');
  });

  it('switches its oscillation at once', () => {
    const onAction = vi.fn();
    drawn(fanEntry.useSpec, { model: full(), onAction });
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Regolazioni' })).getByRole('button', { name: 'Oscillazione' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'fan_oscillate', oscillating: false });
  });
});

describe('a humidifier', () => {
  it('has its target in the middle, with the humidity now marked on it', () => {
    const { container } = drawn(humidifierEntry.useSpec, { model: device('humidifier.a', 'on', { humidity: 50, current_humidity: 45, available_modes: ['Eco'] }), onAction: vi.fn() });
    expect(container.querySelector('.glass-vslider-now')?.textContent).toBe('ora 45%');
  });

  it('offers a shortcut only for what it exposes', () => {
    const input = (attributes: Record<string, unknown>): DevicePanelInput => ({ model: device('humidifier.a', 'on', attributes), onAction: vi.fn() });
    expect(labels(specOf(humidifierEntry.useSpec, input({ humidity: 50, current_humidity: 45, available_modes: ['Eco'] })))).toEqual(['Modalità']);
    expect(labels(specOf(humidifierEntry.useSpec, input({ humidity: 50 })))).toEqual([]);
  });
});

describe('a cover', () => {
  const full = (state = 'open') => device('cover.a', state, { supported_features: 143, current_position: 76, current_tilt_position: 45 });

  it('has no row: the positions and the slats are always in view, and groups elsewhere', () => {
    const spec = specOf(coverEntry.useSpec, { model: full(), onAction: vi.fn() });
    expect(spec.heroKind).toBe('cover');
    expect(spec.noRow).toBe(true);
    expect(spec.below).toBeTruthy();
    expect(labels(spec)).toEqual(['Posizione', 'Inclinazione lamelle']);
  });

  it('leaves the slats out when it has none', () => {
    const spec = specOf(coverEntry.useSpec, { model: device('cover.a', 'open', { supported_features: 15, current_position: 76 }), onAction: vi.fn() });
    expect(labels(spec)).toEqual(['Posizione']);
  });

  it('has nothing at the left of the header at rest, and Stop only while it moves', () => {
    const onAction = vi.fn();
    expect(specOf(coverEntry.useSpec, { model: full(), onAction }).action).toBeUndefined();
    const moving = specOf(coverEntry.useSpec, { model: full('closing'), onAction }).action;
    expect(moving?.kind).toBe('stop');
    moving?.onPress();
    expect(onAction).toHaveBeenCalledWith({ type: 'cover_stop' });
  });

  it('has a large Stop in place of the positions while it moves', () => {
    const onAction = vi.fn();
    const { unmount } = drawn(coverEntry.useSpec, { model: full(), onAction });
    const pills = () => within(document.querySelector<HTMLElement>('.panel-hero-below')!);
    expect(pills().getByRole('radio', { name: 'Aperta' })).toBeTruthy();
    expect(pills().queryByRole('button', { name: 'Ferma' })).toBeNull();
    unmount();
    drawn(coverEntry.useSpec, { model: full('closing'), onAction });
    expect(pills().queryByRole('radio', { name: 'Aperta' })).toBeNull();
    fireEvent.click(pills().getByRole('button', { name: 'Ferma' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'cover_stop' });
  });
});

describe('a climate device', () => {
  const climate = (state: string, attributes: Record<string, unknown> = {}) =>
    toClimateModel('climate.a', { state, rawAttributes: { friendly_name: 'Clima', hvac_modes: ['off', 'heat', 'cool', 'heat_cool', 'dry'], target_temp_step: 0.5, ...attributes } } as never);
  const heating = (attributes: Record<string, unknown> = {}) => climate('heat', { temperature: 22, current_temperature: 20.4, ...attributes });
  const input = (over: Partial<ClimatePanelInput> = {}): ClimatePanelInput => ({ model: heating(), onAction: vi.fn(), ...over });

  it('has its target in the middle, with the room marked on it', () => {
    const { container } = drawn(climateEntry.useSpec, input());
    expect(specOf(climateEntry.useSpec, input()).heroKind).toBe('slider');
    expect(container.querySelector('.glass-vslider-now')?.textContent).toBe('ora 20,4°');
  });

  it('offers a control only for what it exposes, in the order of the registry', () => {
    expect(labels(specOf(climateEntry.useSpec, input()))).toEqual(['Modalità', 'Allinea']);
    const full = input({
      model: heating({ fan_modes: ['auto', '1'], preset_modes: ['eco'], swing_modes: ['off', 'vertical'] }),
      extras: { supportsTargetHumidity: true, targetHumidity: 50, supportsHorizontalSwing: true, horizontalSwingModes: ['center'] },
      onExtraAction: vi.fn(),
    });
    expect(labels(specOf(climateEntry.useSpec, full))).toEqual(['Modalità', 'Ventola', 'Profilo', 'Allinea', 'Alette', 'Umidità']);
  });

  it('keeps its row while it is off, and only Align goes without a target', () => {
    const spec = specOf(climateEntry.useSpec, input({ model: climate('off', { temperature: 22, current_temperature: 20, fan_modes: ['auto'] }) }));
    expect(labels(spec)).toEqual(['Modalità', 'Ventola', 'Allinea']);
    expect(spec.heroKind).toBe('value');
    const noTarget = specOf(climateEntry.useSpec, input({ model: climate('off', { current_temperature: 20, fan_modes: ['auto'] }) }));
    expect(labels(noTarget)).toEqual(['Modalità', 'Ventola']);
  });

  it('with two modes is a stove: Mode, Fan and Align in the row, the rest in Altro', () => {
    const stove = toClimateModel('climate.s', { state: 'heat', rawAttributes: { friendly_name: 'Termostufa', hvac_modes: ['off', 'heat'], temperature: 69, current_temperature: 27, fan_modes: ['auto', '1', '2', '3'], preset_modes: ['eco'], swing_modes: ['off', 'on'] } } as never);
    const spec = specOf(climateEntry.useSpec, input({ model: stove }));
    expect(spec.layout).toBe('stove');
    const { main, more } = arrangeControls(spec.layout, spec.controls ?? []);
    expect(main.map((entry) => entry.control.label)).toEqual(['Modalità', 'Ventola', 'Allinea']);
    expect(main[1].look).toBe('levels');
    expect(more.map((entry) => entry.control.label)).toEqual(['Profilo', 'Alette']);
  });

  it('shows the levels of its fan as a slider, with Automatic under it', () => {
    const onAction = vi.fn();
    drawn(climateEntry.useSpec, input({ onAction, model: heating({ fan_modes: ['auto', 'low', 'medium', 'high'], fan_mode: 'low' }) }));
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Regolazioni' })).getByRole('button', { name: 'Ventola' }));
    expect(screen.getByRole('slider', { name: 'Ventola' })).toBeTruthy();
    expect(document.querySelectorAll('.glass-vslider-tick')).toHaveLength(2);
    fireEvent.click(within(document.querySelector<HTMLElement>('.panel-hero')!).getByRole('radio', { name: 'Automatica' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'fan', fanMode: 'auto' });
  });

  it('shows a fan with names of its own as a list', () => {
    drawn(climateEntry.useSpec, input({ model: heating({ fan_modes: ['Brezza', 'Tempesta'], fan_mode: 'Brezza' }) }));
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Regolazioni' })).getByRole('button', { name: 'Ventola' }));
    expect(document.querySelector('.panel-hero .is-big-list')).toBeTruthy();
  });

  it('aligns the target to the temperature now, on the step it can take', () => {
    const onAction = vi.fn();
    drawn(climateEntry.useSpec, input({ onAction }));
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Regolazioni' })).getByRole('button', { name: 'Allinea' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'target', target: 20.5 });
    expect(screen.getByRole('button', { name: 'Porta l’obiettivo a 20,5°' })).toBeTruthy();
  });

  it('has nothing to align without one target, or without a temperature now', () => {
    const noTarget = specOf(climateEntry.useSpec, input({ model: climate('dry', { current_temperature: 20.4 }) }));
    expect(labels(noTarget)).not.toContain('Allinea');
    expect(noTarget.heroKind).toBe('value');
    const range = specOf(climateEntry.useSpec, input({ model: climate('heat_cool', { target_temp_low: 20, target_temp_high: 24, current_temperature: 20.4 }) }));
    expect(labels(range)).not.toContain('Allinea');
    expect(range.heroKind).toBe('data');
    expect(labels(specOf(climateEntry.useSpec, input({ model: climate('heat', { temperature: 22 }) })))).not.toContain('Allinea');
  });

  it('keeps both ends of a range within reach, one step apart', () => {
    const onAction = vi.fn();
    drawn(climateEntry.useSpec, input({ onAction, model: climate('heat_cool', { target_temp_low: 20, target_temp_high: 24, current_temperature: 20.4 }) }));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Alza massima' }));
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Alza massima' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'range', low: 20, high: 24.5 });
  });
});

describe('the panels with a card of data', () => {
  const commands: VacuumPanelCommands = { start: vi.fn(), pause: vi.fn(), stop: vi.fn(), returnToBase: vi.fn(), locate: vi.fn(), cleanSpot: vi.fn(), cleanArea: vi.fn(), setFanSpeed: vi.fn() };
  const agenda = { entityId: 'calendar.a', status: 'ready', events: [], error: null } as never;

  it('a camera has no main action, and only the controls it exposes', () => {
    const spec = specOf(cameraEntry.useSpec, { camera: { name: 'Ingresso' } });
    expect(spec.heroKind).toBe('data');
    expect(spec.action).toBeUndefined();
    expect(labels(spec)).toEqual([]);
  });

  it('a robot starts, pauses or stops as it can, and has a map only when it is given one', () => {
    const robot = (over: object) => specOf(vacuumEntry.useSpec, { vacuum: { name: 'Robot', state: 'docked', ...over }, commands });
    expect(robot({ supportsStart: true }).action?.kind).toBe('play');
    expect(robot({ state: 'cleaning', supportsPause: true }).action?.kind).toBe('pause');
    expect(robot({ state: 'cleaning', supportsStop: true }).action?.kind).toBe('stop');
    expect(robot({}).action).toBeUndefined();
    expect(labels(robot({}))).toEqual([]);
    expect(labels(robot({ mapUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' }))).toEqual(['Mappa']);
  });

  it('a robot in error takes the red, and says so', () => {
    const spec = specOf(vacuumEntry.useSpec, { vacuum: { name: 'Robot', state: 'error' }, commands });
    expect(spec.accent.rgb).toBe('255 69 58');
    expect(spec.tint).toBe(true);
  });

  it('a calendar has + only if it can take an event, in place of the power', () => {
    expect(specOf(calendarEntry.useSpec, { name: 'Famiglia', supportedFeatures: 0, agenda }).action).toBeUndefined();
    expect(specOf(calendarEntry.useSpec, { name: 'Famiglia', supportedFeatures: 1, agenda }).action?.kind).toBe('add');
  });

  it('the members have no main action, and no battery without a sensor', () => {
    const anna = { id: 'a', personEntityId: 'person.a', name: 'Anna', state: 'home', trackerEntityIds: [], devices: { smartwatch: 0, tablet: 0, smartphone: 0, tracker: 0 } };
    const spec = specOf(membersEntry.useSpec, { name: 'Membri', members: [anna] as never, haStates: {} });
    expect(spec.action).toBeUndefined();
    expect(spec.always).toBeUndefined();
    drawn(membersEntry.useSpec, { name: 'Membri', members: [anna] as never, haStates: {} });
    expect(screen.queryByText('Telefono')).toBeNull();
  });
});
