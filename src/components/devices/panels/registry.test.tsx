import { cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type React from 'react';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../../i18n/I18nProvider';
import type { DeviceModel } from '../model/device';
import { toDeviceModel } from '../model/device';
import type { LightModel } from '../model/light';
import type { PlugEnergy } from '../model/plugEnergy';
import { lightEntry, type LightPanelInput } from './entries/light';
import { plugEntry, type DevicePanelInput } from './entries/device';
import { PanelView } from './PanelView';
import { loadPanelEntry } from './registry';

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
const labels = (spec: ReturnType<typeof lightEntry.useSpec>) => spec.shortcuts.map((item) => item.label);

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
  });
});

describe('a light', () => {
  it('has its brightness in the middle and the power at the bottom', () => {
    const spec = specOf(lightEntry.useSpec, lightInput());
    expect(spec.heroKind).toBe('slider');
    expect(spec.action?.kind).toBe('power');
  });

  it('offers a shortcut only for what it exposes', () => {
    expect(labels(specOf(lightEntry.useSpec, lightInput({ model: lightModel({ caps: 'dim' }) })))).toEqual([]);
    expect(labels(specOf(lightEntry.useSpec, lightInput({ model: lightModel({ caps: 'ct', mode: 'temp' }) })))).toEqual(['Temperatura']);
    expect(labels(specOf(lightEntry.useSpec, lightInput()))).toEqual(['Colore']);
    expect(
      labels(specOf(lightEntry.useSpec, lightInput({ extras: { supportsWhite: true, supportsEffects: true, supportsFlash: true, effects: ['colorloop'] }, onExtraAction: vi.fn() }))),
    ).toEqual(['Colore', 'LED bianco', 'Effetti', 'Lampeggio']);
  });

  it('takes no effects without a list of them', () => {
    const spec = specOf(lightEntry.useSpec, lightInput({ extras: { supportsEffects: true, effects: [] }, onExtraAction: vi.fn() }));
    expect(labels(spec)).not.toContain('Effetti');
  });

  it('has nothing to drag when it only switches', () => {
    expect(specOf(lightEntry.useSpec, lightInput({ model: lightModel({ caps: 'onoff', brightnessPct: null }) })).heroKind).toBe('value');
  });

  it('opens a shortcut, and Back closes it', () => {
    drawn(lightEntry.useSpec, lightInput({ extras: { supportsEffects: true, effects: ['colorloop'] }, onExtraAction: vi.fn() }));
    expect(screen.queryByRole('button', { name: 'Indietro' })).toBeNull();
    fireEvent.click(within(screen.getByRole('group', { name: 'Regolazioni' })).getByRole('button', { name: 'Effetti' }));
    expect(screen.getByRole('button', { name: 'Indietro' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Regolazioni' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Indietro' }));
    expect(screen.getByRole('group', { name: 'Regolazioni' })).toBeTruthy();
  });

  it('calls its effects by their translated name, and flashes at once', () => {
    const onExtraAction = vi.fn();
    drawn(lightEntry.useSpec, lightInput({ extras: { supportsEffects: true, supportsFlash: true, effects: ['colorloop', 'mio_effetto'] }, onExtraAction }));
    const dialog = screen.getByRole('region', { name: 'Effetti' });
    expect(within(dialog).getByRole('radio', { name: 'Ciclo colori' })).toBeTruthy();
    expect(within(dialog).getByRole('radio', { name: 'Mio effetto' })).toBeTruthy();
    fireEvent.click(within(screen.getByRole('group', { name: 'Regolazioni' })).getByRole('button', { name: 'Lampeggio' }));
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
    expect(container.querySelector('.panel-hero-instead')).toBeNull();
    fireEvent.click(within(screen.getByRole('group', { name: 'Regolazioni' })).getByRole('button', { name: 'Colore' }));
    const disc = container.querySelector('.panel-hero-instead .glass-color-picker');
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
    expect(labels(specOf(plugEntry.useSpec, input({ onToggleProtected: vi.fn(), onSetTimer: vi.fn() })))).toEqual(['Protetta', 'Timer']);
  });

  it('switches its protection at once', () => {
    const onToggleProtected = vi.fn();
    drawn(plugEntry.useSpec, input({ onToggleProtected }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Regolazioni' })).getByRole('button', { name: 'Protetta' }));
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
