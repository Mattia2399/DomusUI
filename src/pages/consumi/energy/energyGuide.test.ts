import { describe, expect, it } from 'vitest';
import type { EnergyDiscovery, EnergyDiscoveryV2 } from '../../../services/energyCoreClient';
import type { MockEntityStateMap } from '../../../types/ha';
import { reviewDiscovery } from './energyDiscoveryModel';
import { deviceReading, guidedRole, liveReading, meterState, moduleFindings, plantCounts, recommendedSensor, sensorName } from './energyGuide';
import { addDevice, pendingConfirmations, plantDraftFromProfile } from './energyPlantDraft';

const STATES = {
  'sensor.pv': { state: '3800', unit: 'W', rawAttributes: { unit_of_measurement: 'W', device_class: 'power', friendly_name: 'Inverter tetto' } },
  'sensor.pv_kw': { state: '1.25', rawAttributes: { unit_of_measurement: 'kW', device_class: 'power' } },
  'sensor.soc': { state: '79.6', rawAttributes: { unit_of_measurement: '%', device_class: 'battery' } },
  'sensor.bat': { state: '-1200', rawAttributes: { unit_of_measurement: 'W', device_class: 'power' } },
  'sensor.off': { state: 'unavailable', rawAttributes: { unit_of_measurement: 'W' } },
  'sensor.kwh': { state: '12', rawAttributes: { unit_of_measurement: 'kWh', device_class: 'energy', state_class: 'total_increasing' } },
} as unknown as MockEntityStateMap;

const V2: EnergyDiscoveryV2 = {
  profile: { configured: true, revision: 2 }, verification: 'complete', recorder: 'available',
  devices: [
    { key: 's1', module: 'solar', status: 'new', device_id: 'solar-2', name: 'Pergola', confidence: 'high', eligible: true,
      power: [{ role: 'production_power', entity_id: 'sensor.pv_kw', confidence: 'high', evidence: [], sign_convention: null, requires: [] }] },
    { key: 's2', module: 'solar', status: 'new', device_id: 'solar-3', name: null, confidence: 'medium', eligible: false },
    { key: 'b1', module: 'battery', status: 'new', device_id: 'battery-1', name: 'Box', confidence: 'high', eligible: true,
      energy: [{ role: 'charge_energy', statistic_ids: ['sensor.kwh'], confidence: 'high', evidence: [], statuses: ['pending'] }] },
    { key: 'g', module: 'grid', status: 'update', device_id: 'grid-1', name: null, confidence: 'high', eligible: false, additions: [{ kind: 'energy', role: 'import_energy', ids: ['sensor.kwh'] }] },
    { key: 'w', module: 'wallbox', status: 'conflict', device_id: null, name: 'Doppia', confidence: 'medium', eligible: false },
  ],
  totals: [], meters: {}, ambiguous: [], suggested_plant: null, low_confidence: [],
};

describe('Guided setup words', () => {
  it('reads live values as a person would, never inventing one', () => {
    expect(liveReading(STATES, 'sensor.pv')).toBe('3,8 kW');
    expect(liveReading(STATES, 'sensor.pv_kw')).toBe('1,25 kW');
    expect(liveReading(STATES, 'sensor.soc')).toBe('80%');
    expect(liveReading(STATES, 'sensor.bat')).toBe('-1,2 kW');
    expect(liveReading(STATES, 'sensor.off')).toBeNull();
    expect(liveReading(STATES, 'sensor.missing')).toBeNull();
    expect(liveReading(STATES, undefined)).toBeNull();
    expect(sensorName(STATES, null, 'sensor.pv')).toBe('Inverter tetto');
    expect(sensorName(STATES, { candidates: { 'sensor.x': { name: 'Dal rilevamento' } } } as unknown as EnergyDiscovery, 'sensor.x')).toBe('Dal rilevamento');
    expect(guidedRole('solar', 'production_power')).toBe('Potenza fotovoltaico');
    expect(guidedRole('grid', 'net_power')).toBe('Potenza scambiata con la rete');
  });

  it('describes a device by what it measures now', () => {
    const draft = plantDraftFromProfile({ battery: { devices: [{ id: 'battery-1', name: null, ha_device_id: null, power: { sensors: { state_of_charge: 'sensor.soc', net_power: 'sensor.bat' } } }] } });
    expect(deviceReading('battery', draft.battery!.devices[0], STATES)).toBe('Carica 80% · -1,2 kW ora');
    const split = plantDraftFromProfile({ grid: { devices: [{ id: 'grid-1', name: null, ha_device_id: null, power: { sensors: { import_power: 'sensor.pv', export_power: 'sensor.off' } } }] } });
    expect(deviceReading('grid', split.grid!.devices[0], STATES)).toBe('Prelievo 3,8 kW');
    const meterOnly = plantDraftFromProfile({ solar: { devices: [{ id: 'solar-1', name: null, ha_device_id: null, energy: { production_energy: ['sensor.kwh'] } }] } });
    expect(deviceReading('solar', meterOnly.solar!.devices[0], STATES)).toBeNull();
  });

  it('maps Recorder statuses to plain states without changing them', () => {
    expect(meterState({ status: 'valid' } as never, false)).toEqual({ status: 'ready', text: 'Pronto' });
    expect(meterState({ status: 'pending' } as never, false)).toEqual({ status: 'waiting', text: 'In attesa di Home Assistant' });
    expect(meterState({ status: 'recorder_unavailable' } as never, false)).toEqual({ status: 'waiting', text: 'Verifica temporaneamente non disponibile' });
    expect(meterState({ status: 'unknown' } as never, true)).toEqual({ status: 'check', text: 'Non siamo riusciti a verificarlo' });
    expect(meterState({ status: 'incompatible' } as never, true)).toEqual({ status: 'problem', text: 'Non compatibile' });
    expect(meterState(undefined, true)).toEqual({ status: 'ready', text: 'Contatore trovato' });
    expect(meterState(undefined, false)).toEqual({ status: 'check', text: 'Non siamo riusciti a verificarlo' });
  });

  it('recommends only a compatible, free sensor the discovery is confident about', () => {
    const discovery = { proposals: { solar: { production_power: [
      { entity_id: 'sensor.kwh', confidence: 'high' },
      { entity_id: 'sensor.pv', confidence: 'medium' },
    ] } } } as unknown as EnergyDiscovery;
    expect(recommendedSensor('solar', 'production_power', discovery, V2, STATES, {})).toBe('sensor.pv_kw');
    // An energy meter is never recommended for a power role, a taken sensor never twice.
    expect(recommendedSensor('solar', 'production_power', discovery, null, STATES, {})).toBe('sensor.pv');
    expect(recommendedSensor('solar', 'production_power', discovery, null, STATES, { 'sensor.pv': 'Tetto' })).toBeNull();
    const low = { proposals: { solar: { production_power: [{ entity_id: 'sensor.pv', confidence: 'low' }] } } } as unknown as EnergyDiscovery;
    expect(recommendedSensor('solar', 'production_power', low, null, STATES, {})).toBeNull();
  });

  it('summarises the detection per component in user states', () => {
    const findings = moduleFindings(reviewDiscovery(V2), { grid: 1 }, ['grid', 'solar', 'battery', 'wallbox', 'home']);
    expect(findings.map(({ module, status, headline }) => [module, status, headline])).toEqual([
      ['grid', 'ready', '1 contatore già configurato · Domus ha qualche suggerimento'],
      ['solar', 'check', '2 inverter trovati, 1 da verificare'],
      ['battery', 'waiting', '1 accumulo trovato'],
      ['wallbox', 'check', 'Trovato qualcosa da verificare: lo vedrai nel suo passaggio'],
      ['home', 'missing', 'Nessun dispositivo trovato: lo configurerai tu'],
    ]);
    expect(findings[1].details).toEqual(['Pergola · Rilevato automaticamente · sensor.pv_kw', 'Fotovoltaico · Da verificare']);
  });

  it('counts what a save would keep, and ties confirmations to their device and role', () => {
    let draft = plantDraftFromProfile({
      grid: { devices: [{ id: 'grid-1', name: null, ha_device_id: null, power: { sensors: { net_power: 'sensor.bat' }, sign_convention: 'positive_import' }, energy: { import_energy: ['sensor.f1', 'sensor.f2'] } }] },
    });
    draft = addDevice(draft, 'solar', new Set(), { meters: { production_energy: 'opower:pv' } }).draft;
    expect(plantCounts(draft)).toEqual({ devices: 2, sensors: 1, meters: 3 });
    const confirmations = pendingConfirmations({}, draft, () => false);
    expect(confirmations.map(({ key, holder, role, part }) => [key, holder, role, part])).toEqual([
      ['meter:sensor.f1', 'grid-1', 'import_energy', 'sensor.f1'],
      ['meter:sensor.f2', 'grid-1', 'import_energy', 'sensor.f2'],
      ['parts:grid:Rete 1:import_energy', 'grid-1', 'import_energy', undefined],
      ['meter:opower:pv', 'solar-1', 'production_energy', 'opower:pv'],
    ]);
  });
});
