import { describe, expect, it } from 'vitest';
import type { EnergyPlant } from '../../../services/energyCoreClient';
import {
  MAX_DEVICES_PER_MODULE,
  addDevice,
  modulesFromPlant,
  pendingConfirmations,
  plantChanged,
  plantChanges,
  plantDraftFromProfile,
  plantFromDraft,
  plantFromModules,
  removeDevice,
  removedDevices,
  reservedIds,
  takenSensors,
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

describe('Editing a plant draft', () => {
  it('gives new devices free ids, never a retired one, and drops them without a trace', () => {
    const reserved = reservedIds(PLANT, ['solar-2']);
    let { draft, id } = addDevice(plantDraftFromProfile(PLANT), 'solar', reserved, { id: 'solar-2', name: 'Pergola' });
    expect(id).toBe('solar-4');
    ({ draft, id } = addDevice(draft, 'wallbox', reserved, { id: 'wallbox-7' }));
    expect(id).toBe('wallbox-7');
    // A suggestion for another module is not taken.
    expect(addDevice(draft, 'home', reserved, { id: 'solar-9' }).id).toBe('home-1');

    const dropped = removeDevice(draft, 'solar', 'solar-4');
    expect(dropped.solar!.devices.map((device) => device.id)).toEqual(['solar-1', 'solar-3']);
    const marked = removeDevice(dropped, 'solar', 'solar-1');
    expect(marked.solar!.devices[0].removed).toBe(true);
    expect(removedDevices(marked).map((item) => item.device.id)).toEqual(['solar-1']);
  });

  it('allows up to sixteen devices per module', () => {
    let draft: PlantDraft = {};
    for (let index = 0; index <= MAX_DEVICES_PER_MODULE; index += 1) {
      draft = addDevice(draft, 'wallbox', new Set(), { power: { present: true, mode: 'split', sensors: { charging_power: `sensor.wb${index}` }, signConvention: '' } }).draft;
    }
    expect(validatePlantDraft(draft).map((issue) => issue.message)).toEqual([expect.stringMatching(/16/)]);
    expect(validatePlantDraft({ wallbox: { devices: draft.wallbox!.devices.slice(1) } })).toEqual([]);
  });

  it('moves between v1 modules and a plant only without loss', () => {
    const modules = { grid: { sensors: { net_power: 'sensor.grid' }, sign_convention: 'positive_import' } };
    const plant = plantFromModules(modules);
    expect(plant).toEqual({ grid: { devices: [{ id: 'grid-1', name: null, ha_device_id: null, power: modules.grid }] } });
    expect(modulesFromPlant(plant)).toEqual(modules);
    expect(modulesFromPlant(PLANT)).toBeNull();
    expect(modulesFromPlant({ grid: { devices: [{ ...plant.grid!.devices[0], name: 'Contatore' }] } })).toBeNull();
  });

  it('describes the changes and lists what needs a confirmation', () => {
    let draft = edit(plantDraftFromProfile(PLANT), 'grid', 0, (device) => { device.meters.export_energy = 'opower:export'; });
    draft = edit(draft, 'battery', 0, (device) => { device.removed = true; });
    draft = addDevice(draft, 'wallbox', reservedIds(PLANT), { name: 'Box', meters: { charging_energy: 'sensor.wb_a\nsensor.wb_b' } }).draft;

    expect(plantChanges(PLANT, draft).map((change) => change.title)).toEqual([
      'Rete: Rete 1', 'Batteria: rimosso Garage', 'Wallbox: aggiunto Box',
    ]);
    expect(plantChanges(PLANT, draft)[0].details).toEqual(['Energia immessa: aggiunti opower:export']);
    const confirmations = pendingConfirmations(PLANT, draft, (id) => id === 'sensor.wb_a' || id === 'sensor.wb_b');
    expect(confirmations.map((item) => item.key)).toEqual(['meter:opower:export', 'parts:wallbox:Box:charging_energy', 'remove:battery-1']);
    // The F1/F2/F3 parts already stored, unchanged, are not asked again.
    expect(pendingConfirmations(PLANT, plantDraftFromProfile(PLANT), () => false)).toEqual([]);
  });

  it('knows which sensors are already used, and by whom', () => {
    const taken = takenSensors(edit(plantDraftFromProfile(PLANT), 'solar', 1, (device) => { device.removed = true; }));
    expect(taken['sensor.inv1']).toBe('Tetto');
    expect(taken['sensor.f2']).toBe('Rete 1');
    expect(taken['sensor.pv_total']).toBe('Fotovoltaico · totale');
    expect(taken['sensor.inv3']).toBeUndefined();
  });
});
