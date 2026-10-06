import { describe, expect, it } from 'vitest';
import type { EnergyDiscovery, EnergyDiscoveryV2, EnergyPlant } from '../../../services/energyCoreClient';
import { applyChange, applyNewDevice, applyTotal, discoveryV2, proposalsFromV1, reviewDiscovery } from './energyDiscoveryModel';
import { plantDraftFromProfile, plantFromDraft } from './energyPlantDraft';

const V2: EnergyDiscoveryV2 = {
  profile: { configured: true, revision: 3, load_error: false },
  verification: 'incomplete',
  recorder: 'available',
  devices: [
    { key: 'solar:dev:a', module: 'solar', status: 'update', device_id: 'solar-1', name: 'Inverter 1', confidence: 'high', eligible: false,
      additions: [{ kind: 'energy', role: 'production_energy', ids: ['sensor.inv1_energy'] }], corrections: [] },
    { key: 'solar:dev:b', module: 'solar', status: 'new', device_id: 'solar-2', name: 'Inverter 2', confidence: 'high', eligible: true },
    { key: 'battery:dev:c', module: 'battery', status: 'configured', device_id: 'battery-1', name: 'Batteria', confidence: 'medium', eligible: false },
    { key: 'wallbox:configured:wallbox-1', module: 'wallbox', status: 'configured', device_id: 'wallbox-1', name: null, detected: false },
    { key: 'grid:dev:d', module: 'grid', status: 'conflict', device_id: null, name: 'Contatore' },
  ],
  totals: [
    { module: 'solar', kind: 'power', role: 'production_power', ids: ['sensor.pv_total'], status: 'presumed', covers: [], evidence: ['aggregate_keyword'] },
  ],
  meters: {},
  ambiguous: [{ module: 'solar', role: null, entity_ids: ['sensor.pv_total'], reason: 'presumed_total' }],
  suggested_plant: { solar: { devices: [] } },
  low_confidence: [],
};
const discovery = (v2?: unknown) => ({ suggested_profile: { modules: {} }, proposals: {}, ambiguous: [], requires_input: [], unassigned: [], candidates: {}, energy_dashboard: 'used', v2 }) as unknown as EnergyDiscovery;

describe('Discovery v2 review', () => {
  it('sorts proposals for the user without applying any of them', () => {
    const review = reviewDiscovery(discoveryV2(discovery(V2))!);
    expect(review.newDevices.map((device) => device.device_id)).toEqual(['solar-2']);
    expect(review.changes.map((device) => device.additions)).toEqual([[{ kind: 'energy', role: 'production_energy', ids: ['sensor.inv1_energy'] }]]);
    expect(review.configured.map((device) => device.device_id)).toEqual(['battery-1']);
    expect(review.notDetected.map((device) => device.device_id)).toEqual(['wallbox-1']);
    expect(review.conflicts.map((device) => device.name)).toEqual(['Contatore']);
    expect(review.presumedTotals).toHaveLength(1);
    expect(review.verificationIncomplete).toBe(true);
    // The review never carries a plant to save.
    expect(Object.keys(review)).not.toContain('suggested_plant');
  });

  it('ignores integrations without the v2 result or with a malformed one', () => {
    expect(discoveryV2(discovery())).toBeNull();
    expect(discoveryV2(discovery({ devices: 'x' }))).toBeNull();
    expect(discoveryV2(null)).toBeNull();
  });
});

const STORED: EnergyPlant = {
  solar: { devices: [{ id: 'solar-1', name: 'Tetto', ha_device_id: 'aa', power: { sensors: { production_power: 'sensor.inv1' } }, energy: { production_energy: ['sensor.inv1_kwh'] } }] },
  grid: { devices: [{ id: 'grid-1', name: null, ha_device_id: null, power: { sensors: { net_power: 'sensor.grid' }, sign_convention: 'positive_import' } }] },
};

describe('Applying discovery proposals', () => {
  it('adds a new device with its sensors and meters, never incompatible meters, keeping a reserved id free', () => {
    const { draft, id } = applyNewDevice(plantDraftFromProfile(STORED), {
      key: 'solar:dev:bb', module: 'solar', status: 'new', device_id: 'solar-2', ha_device_id: 'bb', name: 'Pergola',
      power: [{ role: 'production_power', entity_id: 'sensor.inv2', confidence: 'high', evidence: [], sign_convention: null, requires: [] }],
      energy: [{ role: 'production_energy', statistic_ids: ['sensor.inv2_kwh', 'sensor.inv2_w'], confidence: 'high', evidence: [], statuses: ['valid', 'incompatible'] }],
    }, new Set(['solar-1', 'solar-2']), { 'sensor.inv2_w': { status: 'incompatible' } as never });
    expect(id).toBe('solar-3');
    expect(plantFromDraft(draft).solar!.devices[1]).toEqual({
      id: 'solar-3', name: 'Pergola', ha_device_id: 'bb', power: { sensors: { production_power: 'sensor.inv2' } }, energy: { production_energy: ['sensor.inv2_kwh'] },
    });
    expect(plantFromDraft(draft).grid).toEqual(STORED.grid);
  });

  it('preselects only a convention the discovery has evidence for', () => {
    const grid = (sign: string | null) => applyNewDevice({}, {
      key: 'grid:x', module: 'grid', status: 'new', device_id: 'grid-1', name: null,
      power: [{ role: 'net_power', entity_id: 'sensor.grid', confidence: 'high', evidence: [], sign_convention: sign, requires: sign ? [] : ['sign_convention'] }],
    }, new Set(), {}).draft.grid!.devices[0].power;
    expect(grid('positive_export').signConvention).toBe('positive_export');
    expect(grid(null).signConvention).toBe('');
  });

  it('adds meters, replaces only on a correction and touches nothing else', () => {
    const draft = plantDraftFromProfile(STORED);
    const added = applyChange(draft, 'solar', 'solar-1', { kind: 'energy', role: 'production_energy', ids: ['sensor.inv1_kwh', 'sensor.inv1_f2'] });
    expect(plantFromDraft(added).solar!.devices[0].energy).toEqual({ production_energy: ['sensor.inv1_kwh', 'sensor.inv1_f2'] });
    const corrected = applyChange(draft, 'solar', 'solar-1', { kind: 'power', role: 'production_power', configured: ['sensor.inv1'], proposed: ['sensor.inv1_ac'] });
    expect(plantFromDraft(corrected).solar!.devices[0].power).toEqual({ sensors: { production_power: 'sensor.inv1_ac' } });
    const sign = applyChange(draft, 'grid', 'grid-1', { kind: 'sign_convention', role: 'net_power', configured: ['positive_import'], proposed: ['positive_export'] });
    expect(plantFromDraft(sign).grid!.devices[0].power!.sign_convention).toBe('positive_export');
    expect(plantFromDraft(sign).solar).toEqual(STORED.solar);
    expect(applyChange(draft, 'solar', 'solar-9', { kind: 'power', role: 'production_power', ids: ['x'] })).toBe(draft);

    const total = applyTotal(draft, { module: 'solar', kind: 'energy', role: 'production_energy', ids: ['sensor.pv_kwh'], status: 'verified', covers: [], evidence: [] });
    expect(plantFromDraft(total).solar!.total).toEqual({ energy: { production_energy: ['sensor.pv_kwh'] } });
  });

  it('turns the result of an older integration into proposals against the current plant', () => {
    const v1 = {
      ...discovery(),
      suggested_profile: { modules: { solar: { sensors: { production_power: 'sensor.inv1_ac' } }, home: { sensors: { consumption_power: 'sensor.home' } } } },
      requires_input: [{ module: 'grid', role: 'net_power', entity_id: 'sensor.grid', missing: ['sign_convention'] }],
    } as unknown as EnergyDiscovery;
    const proposals = proposalsFromV1(v1, STORED);
    expect(proposals.devices.map((device) => [device.module, device.status, device.eligible])).toEqual([
      ['grid', 'configured', false], ['solar', 'update', false], ['home', 'new', true],
    ]);
    expect(proposals.devices[1].corrections).toEqual([{ kind: 'power', role: 'production_power', configured: ['sensor.inv1'], proposed: ['sensor.inv1_ac'] }]);
    expect(proposals.suggested_plant).toBeNull();
  });
});
