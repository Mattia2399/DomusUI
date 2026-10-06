import { describe, expect, it } from 'vitest';
import type { EnergyDiscovery, EnergyDiscoveryV2 } from '../../../services/energyCoreClient';
import { discoveryV2, reviewDiscovery } from './energyDiscoveryModel';

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
