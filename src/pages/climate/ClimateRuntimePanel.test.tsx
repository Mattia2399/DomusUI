import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../../i18n/I18nProvider';
import { emptyClimateConfig, type ClimateCallApi } from '../../services/climateConfigClient';
import type { ClimateAutoResolution, ClimateStateResponse, ClimateZoneOverride, ClimateZoneState } from '../../services/climateStateClient';
import { ClimateRuntimePanel } from './ClimateRuntimePanel';

const config = emptyClimateConfig();
config.zones = [{ id: 'living', name: 'Soggiorno', areaId: null, reference: { primaryEntityId: 'sensor.living', fallbacks: [] }, endpointIds: [] }];

const resolved: ClimateAutoResolution = {
  status: 'resolved', activeProfileId: 'comfort', activeProfileName: 'Comfort',
  activeEvent: { day: 'monday', time: '17:00', profileId: 'comfort' },
  nextEvent: { day: 'monday', time: '23:30', profileId: 'night', profileName: 'Notte', occursAt: '2026-01-05T22:30:00+00:00' },
  zoneTargets: { living: { status: 'resolved', value: 21 } },
};

function state({ control = 'auto', operating = 'heating', resolution = resolved, target = 21, reason = null, override = null }: {
  control?: 'auto' | 'manual'; operating?: 'heating' | 'cooling' | 'off'; resolution?: ClimateAutoResolution;
  target?: number | null; reason?: string | null; override?: ClimateZoneOverride | null;
} = {}): ClimateStateResponse {
  const zone: ClimateZoneState = {
    zoneId: 'living', intent: { mode: 'follow_house', targetTemperature: 22 },
    override,
    observed: { temperature: 19, humidity: null, temperatureSource: 'sensor.living', humiditySource: null, temperatureAvailability: 'available', humidityAvailability: 'unavailable' },
    derived: { effectiveTarget: target, targetSource: target === null ? null : override ? 'override' : control === 'auto' ? 'schedule' : 'manual', targetReason: reason, scheduledTarget: resolution.zoneTargets.living?.value ?? null,
      thermalReason: reason, autoPendingConfiguration: control === 'auto' && target === null,
      thermalStatus: operating === 'off' ? 'off' : target === null ? 'unknown' : 'needs_heating',
      terminals: [], compatiblePaths: [] },
  };
  return { state: 'ready', revision: 1, configState: 'ready', configRevision: 1,
    preview: { house: { operatingMode: operating, controlMode: control }, autoResolution: control === 'auto' ? resolution : null, zones: [zone], deadbandCelsius: 0.2 } };
}

function show(response: ClimateStateResponse) {
  const callApi: ClimateCallApi = async <T,>() => response as T;
  render(<I18nProvider forcedLocale="it"><ClimateRuntimePanel config={config} callApi={callApi} states={{}} canControl={false} /></I18nProvider>);
}

afterEach(cleanup);

describe('Climate automatic runtime presentation', () => {
  it('shows active profile, next change and schedule target', async () => {
    show(state());
    await waitFor(() => expect(screen.getByText(/Profilo attivo:/).textContent).toContain('Comfort'));
    expect(screen.getByText(/Prossimo cambio:/).textContent).toContain('23:30 · Notte');
    expect(screen.getByText('Da programma')).toBeTruthy();
    expect(screen.getByText('21.0°')).toBeTruthy();
  });

  it('explains an empty schedule and a missing target without showing a manual fallback', async () => {
    show(state({ resolution: { ...resolved, status: 'no_schedule', activeProfileId: null, activeProfileName: null, activeEvent: null, nextEvent: null, zoneTargets: {} }, target: null, reason: 'no_schedule' }));
    await waitFor(() => expect(screen.getAllByText('Automatico non configurato').length).toBeGreaterThan(0));
    expect(screen.queryByText('22.0°')).toBeNull();
    cleanup();
    show(state({ target: null, reason: 'no_target' }));
    await waitFor(() => expect(screen.getByText(/Nessun target nel profilo Comfort/)).toBeTruthy());
    expect(screen.queryByText('22.0°')).toBeNull();
  });

  it('keeps manual presentation separate and leaves the house off', async () => {
    show(state({ control: 'manual', target: 22 }));
    await waitFor(() => expect(screen.getByText('22.0°')).toBeTruthy());
    expect(screen.queryByText(/Profilo attivo:/)).toBeNull();
    cleanup();
    show(state({ operating: 'off' }));
    const card = await waitFor(() => screen.getByText('Soggiorno').closest('article')!);
    expect(within(card).getByText('Spento')).toBeTruthy();
    expect(screen.getByText(/Profilo attivo:/)).toBeTruthy();
  });

  it('creates and clears a temporary target while showing the scheduled target underneath', async () => {
    let current = state();
    const calls: Record<string, unknown>[] = [];
    const callApi: ClimateCallApi = async <T,>(message) => {
      calls.push(message);
      if (message.type === 'domusos/climate/set_zone_override') current = state({ target: 23, override: { id: 'a'.repeat(32), zoneId: 'living', targetTemperature: 23, createdAt: '2026-01-05T17:00:00+00:00', expiresAt: '2026-01-05T22:30:00+00:00', expiryMode: 'next_schedule_event', expiresAtLocalTime: '23:30', expiresAtLocalDate: '05/01' } });
      if (message.type === 'domusos/climate/clear_zone_override') current = state();
      return current as T;
    };
    render(<I18nProvider forcedLocale="it"><ClimateRuntimePanel config={config} callApi={callApi} states={{}} canControl /></I18nProvider>);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Applica temporaneamente' })).toBeTruthy());
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Target ambiente' }), { target: { value: '23' } });
    fireEvent.click(screen.getByRole('button', { name: 'Applica temporaneamente' }));
    await waitFor(() => expect(screen.getByText('Temporaneo · 23.0°')).toBeTruthy());
    expect(screen.getByText('Programma: Comfort · 21.0°')).toBeTruthy();
    expect(screen.getByText('Fino al prossimo cambio · 23:30 · 05/01')).toBeTruthy();
    expect(calls.find((message) => message.type === 'domusos/climate/set_zone_override')).toMatchObject({ expiry_mode: 'next_schedule_event', target_temperature: 23 });
    fireEvent.click(screen.getByRole('button', { name: 'Annulla modifica temporanea' }));
    await waitFor(() => expect(screen.queryByText('Temporaneo · 23.0°')).toBeNull());
    expect(calls.some((message) => message.type === 'domusos/climate/clear_zone_override')).toBe(true);
  });

  it('offers duration when no schedule exists and hides override controls in manual or view-only mode', async () => {
    const noSchedule = { ...resolved, status: 'no_schedule' as const, activeProfileId: null, activeProfileName: null, activeEvent: null, nextEvent: null, zoneTargets: {} };
    const messages: Record<string, unknown>[] = [];
    const callApi: ClimateCallApi = async <T,>(message) => { messages.push(message); return state({ resolution: noSchedule, target: null, reason: 'no_schedule' }) as T; };
    render(<I18nProvider forcedLocale="it"><ClimateRuntimePanel config={config} callApi={callApi} states={{}} canControl /></I18nProvider>);
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Scadenza' })).toBeTruthy());
    expect((screen.getByRole('combobox', { name: 'Scadenza' }) as HTMLSelectElement).value).toBe('duration_60');
    expect(screen.queryByRole('option', { name: 'Fino al prossimo cambio' })).toBeNull();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Target ambiente' }), { target: { value: '21' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Scadenza' }), { target: { value: 'until_time' } });
    fireEvent.change(screen.getByLabelText('Fino alle…'), { target: { value: '18:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Applica temporaneamente' }));
    await waitFor(() => expect(messages.some((message) => message.type === 'domusos/climate/set_zone_override')).toBe(true));
    expect(messages.find((message) => message.type === 'domusos/climate/set_zone_override')).toMatchObject({ expiry_mode: 'until_time', until_time: '18:30', target_temperature: 21 });
    cleanup();
    show(state({ control: 'manual', target: 22 }));
    await waitFor(() => expect(screen.getByText('22.0°')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Applica temporaneamente' })).toBeNull();
    cleanup();
    show(state({ target: 23, override: { id: 'a'.repeat(32), zoneId: 'living', targetTemperature: 23, createdAt: '2026-01-05T17:00:00+00:00', expiresAt: '2026-01-05T22:30:00+00:00', expiryMode: 'next_schedule_event', expiresAtLocalTime: '23:30' } }));
    await waitFor(() => expect(screen.getByText('Target programmato: 21.0°')).toBeTruthy());
    expect(screen.getByText('Temporaneo · 23.0°')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Applica temporaneamente' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Annulla modifica temporanea' })).toBeNull();
  });
});
