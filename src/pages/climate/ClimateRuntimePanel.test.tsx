import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../../i18n/I18nProvider';
import { emptyClimateConfig, type ClimateCallApi } from '../../services/climateConfigClient';
import type { ClimateAutoResolution, ClimateStateResponse, ClimateZoneState } from '../../services/climateStateClient';
import { ClimateRuntimePanel } from './ClimateRuntimePanel';

const config = emptyClimateConfig();
config.zones = [{ id: 'living', name: 'Soggiorno', areaId: null, reference: { primaryEntityId: 'sensor.living', fallbacks: [] }, endpointIds: [] }];

const resolved: ClimateAutoResolution = {
  status: 'resolved', activeProfileId: 'comfort', activeProfileName: 'Comfort',
  activeEvent: { day: 'monday', time: '17:00', profileId: 'comfort' },
  nextEvent: { day: 'monday', time: '23:30', profileId: 'night', profileName: 'Notte', occursAt: '2026-01-05T22:30:00+00:00' },
  zoneTargets: { living: { status: 'resolved', value: 21 } },
};

function state({ control = 'auto', operating = 'heating', resolution = resolved, target = 21, reason = null }: {
  control?: 'auto' | 'manual'; operating?: 'heating' | 'cooling' | 'off'; resolution?: ClimateAutoResolution;
  target?: number | null; reason?: string | null;
} = {}): ClimateStateResponse {
  const zone: ClimateZoneState = {
    zoneId: 'living', intent: { mode: 'follow_house', targetTemperature: 22 },
    observed: { temperature: 19, humidity: null, temperatureSource: 'sensor.living', humiditySource: null, temperatureAvailability: 'available', humidityAvailability: 'unavailable' },
    derived: { effectiveTarget: target, targetSource: target === null ? null : control === 'auto' ? 'schedule' : 'manual', targetReason: reason,
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
});
