import { describe, expect, it } from 'vitest';
import type { EnergyPlant } from '../../../services/energyCoreClient';
import {
  plantChanged,
  plantDraftFromProfile,
  plantFromDraft,
  removedDevices,
  validatePlantDraft,
  type PlantDraft,
} from './energyPlantDraft';

const PLANT: EnergyPlant = {
  solar: {
    devices: [
      {
        id: 'solar-1', name: 'Tetto', ha_device_id: 'a1b2c3',
        power: { sensors: { production_power: 'sensor.inv1' } },
        energy: { production_energy: ['sensor.inv1_energy'] },
      },
      { id: 'solar-3', name: null, ha_device_id: null, power: { sensors: { production_power: 'sensor.inv3' } } },
    ],
    total: { power: { sensors: { production_power: 'sensor.pv_total' } } },
  },
  battery: {
    devices: [{
      id: 'battery-1', name: 'Garage', ha_device_id: 'ffee',
      capacity: { nominal_kwh: 10, usable_kwh: 9.5 },
      power: { sensors: { state_of_charge: 'sensor.soc', net_power: 'sensor.bat' }, sign_convention: 'positive_charge' },
      energy: { charge_energy: ['sensor.bat_in'], discharge_energy: ['sensor.bat_out'] },
    }],
  },
  grid: {
    devices: [{ id: 'grid-1', name: null, ha_device_id: null, energy: { import_energy: ['sensor.f1', 'sensor.f2', 'sensor.f3', 'opower:grid'] } }],
  },
};

const edit = (draft: PlantDraft, module: 'solar' | 'battery' | 'grid', index: number, change: (device: PlantDraft['solar'] extends infer M ? M extends { devices: Array<infer D> } ? D : never : never) => void) => {
  const next = structuredClone(draft);
  change(next[module]!.devices[index]);
  return next;
};

describe('Energy Profile v2 draft', () => {
  it('turns the stored plant back into itself, untouched fields included', () => {
    const draft = plantDraftFromProfile(PLANT);
    expect(plantFromDraft(draft)).toEqual(PLANT);
    expect(plantChanged(draft, PLANT)).toBe(false);
    expect(validatePlantDraft(draft)).toEqual([]);
  });

  it('renames a device without changing its id or anything else', () => {
    const renamed = edit(plantDraftFromProfile(PLANT), 'solar', 1, (device) => { device.name = '  Pergola  '; });
    const plant = plantFromDraft(renamed);
    expect(plant.solar?.devices[1]).toEqual({ ...PLANT.solar!.devices[1], name: 'Pergola' });
    expect(plant.solar?.total).toEqual(PLANT.solar!.total);
    expect(plant.battery).toEqual(PLANT.battery);
    expect(plantChanged(renamed, PLANT)).toBe(true);
  });

  it('edits capacity, meters and power of one device and sends every other device', () => {
    let draft = edit(plantDraftFromProfile(PLANT), 'battery', 0, (device) => { device.capacity = { nominal: '12,5', usable: '' }; });
    draft = edit(draft, 'grid', 0, (device) => { device.meters.export_energy = 'sensor.out\n'; });
    const plant = plantFromDraft(draft);
    expect(plant.battery?.devices[0].capacity).toEqual({ nominal_kwh: 12.5, usable_kwh: null });
    expect(plant.battery?.devices[0].ha_device_id).toBe('ffee');
    expect(plant.grid?.devices[0].energy).toEqual({ import_energy: ['sensor.f1', 'sensor.f2', 'sensor.f3', 'opower:grid'], export_energy: ['sensor.out'] });
    expect(plant.solar).toEqual(PLANT.solar);
  });

  it('removes devices only on purpose and lists them for confirmation', () => {
    const draft = edit(plantDraftFromProfile(PLANT), 'grid', 0, (device) => { device.removed = true; });
    expect(removedDevices(draft).map(({ module, device }) => [module, device.id])).toEqual([['grid', 'grid-1']]);
    expect(plantFromDraft(draft).grid).toBeUndefined();
    // A total needs two devices: removing one of them is blocked, not silently fixed.
    const tooFew = edit(plantDraftFromProfile(PLANT), 'solar', 0, (device) => { device.removed = true; });
    expect(validatePlantDraft(tooFew)).toEqual([{ module: 'solar', message: 'Con un sensore totale servono almeno due dispositivi.' }]);
  });

  it('checks the rules the backend enforces', () => {
    let draft = edit(plantDraftFromProfile(PLANT), 'grid', 0, (device) => { device.meters.export_energy = 'sensor.inv1\nnot a meter'; });
    draft = edit(draft, 'battery', 0, (device) => { device.capacity = { nominal: '5', usable: '6' }; device.name = 'x'.repeat(65); });
    draft = edit(draft, 'solar', 1, (device) => { device.power.sensors.production_power = 'sensor.pv_total'; });
    const messages = validatePlantDraft(draft).map((issue) => [issue.deviceId ?? issue.module, issue.field, issue.message]);
    // Modules are checked in their usual order (grid first): a sensor taken twice is flagged on the second holder.
    expect(messages).toEqual([
      ['grid-1', 'export_energy', 'not a meter non è un sensore né una statistica (fonte:nome).'],
      ['solar-1', 'production_power', 'Sensore già usato per Rete 1.'],
      ['solar-3', 'production_power', 'Sensore già usato per Fotovoltaico · totale.'],
      ['battery-1', 'name', 'Usa al massimo 64 caratteri.'],
      ['battery-1', 'usable', 'La capacità utilizzabile non può superare quella nominale.'],
    ]);
  });

  it('needs a sign convention for signed power and something to read on every device', () => {
    let draft = edit(plantDraftFromProfile(PLANT), 'battery', 0, (device) => { device.power.signConvention = ''; });
    draft = edit(draft, 'grid', 0, (device) => { device.meters = {}; });
    expect(validatePlantDraft(draft).map((issue) => issue.message)).toEqual([
      'Serve almeno un sensore di potenza o un contatore di energia.',
      'Conferma il significato dei valori positivi.',
    ]);
  });
});
