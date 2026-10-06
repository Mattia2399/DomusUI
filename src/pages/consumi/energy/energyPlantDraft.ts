import {
  ENERGY_MODULES,
  type EnergyDeviceDocument,
  type EnergyMeterRole,
  type EnergyModuleId,
  type EnergyPlant,
  type EnergySources,
} from '../../../services/energyCoreClient';
import { SENSOR_PATTERN, activeRoles, powerIssues, type DraftModule } from './energyDraft';
import { MODULE_META } from './energyModel';

/*
 * Editable Energy Profile v2 plant (settings now, the multi-device wizard
 * next). It is derived from the stored profile and turned back into a whole
 * plant: every device not edited is sent unchanged, ids are never created or
 * changed here, and fields the interface does not expose are kept.
 */

export const METER_ROLES: Record<EnergyModuleId, Array<{ role: EnergyMeterRole; label: string }>> = {
  grid: [{ role: 'import_energy', label: 'Energia prelevata' }, { role: 'export_energy', label: 'Energia immessa' }],
  solar: [{ role: 'production_energy', label: 'Energia prodotta' }],
  home: [{ role: 'consumption_energy', label: 'Energia consumata' }],
  battery: [{ role: 'charge_energy', label: 'Energia caricata' }, { role: 'discharge_energy', label: 'Energia scaricata' }],
  wallbox: [{ role: 'charging_energy', label: 'Energia di ricarica' }],
};

const EXTERNAL_STATISTIC = /^(?!_)(?!.*__)[a-z0-9_]+(?<!_):(?!_)[a-z0-9_]+(?<!_)$/;
const MAX_METER_PARTS = 8;
const MAX_NAME_LENGTH = 64;
const MAX_CAPACITY_KWH = 1000;

export type PlantDraftDevice = {
  /** The stored id: never changed, never reused by the backend once removed. */
  id: string;
  name: string;
  /** `present: false` for a device with energy meters only. */
  power: DraftModule;
  /** One statistic id per line; several lines are summed (e.g. tariff bands). */
  meters: Partial<Record<EnergyMeterRole, string>>;
  capacity: { nominal: string; usable: string };
  removed: boolean;
  /** The stored document, for what the draft does not edit (Home Assistant device). */
  stored: EnergyDeviceDocument;
};

export type PlantDraftModule = { devices: PlantDraftDevice[]; total?: EnergySources };
export type PlantDraft = Partial<Record<EnergyModuleId, PlantDraftModule>>;

export type PlantIssue = { module: EnergyModuleId; deviceId?: string; field?: string; message: string };

const number = (value: number | null | undefined) => (value === null || value === undefined ? '' : String(value));

function deviceDraft(device: EnergyDeviceDocument): PlantDraftDevice {
  const power = device.power;
  return {
    id: device.id,
    name: device.name ?? '',
    power: {
      present: Boolean(power),
      mode: power?.sensors.net_power ? 'net' : 'split',
      sensors: { ...(power?.sensors ?? {}) },
      signConvention: power?.sign_convention ?? '',
    },
    meters: Object.fromEntries(Object.entries(device.energy ?? {}).map(([role, parts]) => [role, (parts ?? []).join('\n')])),
    capacity: { nominal: number(device.capacity?.nominal_kwh), usable: number(device.capacity?.usable_kwh) },
    removed: false,
    stored: device,
  };
}

export function plantDraftFromProfile(plant: EnergyPlant): PlantDraft {
  const draft: PlantDraft = {};
  for (const id of ENERGY_MODULES) {
    const plan = plant[id];
    if (plan) draft[id] = { devices: plan.devices.map(deviceDraft), ...(plan.total ? { total: plan.total } : {}) };
  }
  return draft;
}

const lines = (text: string | undefined) => (text ?? '').split(/[\n,]/).map((item) => item.trim()).filter(Boolean);

function powerDocument(id: EnergyModuleId, power: DraftModule) {
  if (!power.present) return undefined;
  const sensors: Record<string, string> = {};
  for (const role of activeRoles(id, power.mode)) {
    const entityId = power.sensors[role]?.trim();
    if (entityId) sensors[role] = entityId;
  }
  return sensors.net_power && power.signConvention ? { sensors, sign_convention: power.signConvention } : { sensors };
}

function deviceDocument(id: EnergyModuleId, device: PlantDraftDevice): EnergyDeviceDocument {
  const document: EnergyDeviceDocument = {
    id: device.id,
    name: device.name.trim() || null,
    ha_device_id: device.stored.ha_device_id,
  };
  const power = powerDocument(id, device.power);
  if (power) document.power = power;
  const energy = Object.fromEntries(
    METER_ROLES[id].map(({ role }) => [role, lines(device.meters[role])]).filter(([, parts]) => parts.length),
  );
  if (Object.keys(energy).length) document.energy = energy;
  if (id === 'battery' && (device.capacity.nominal.trim() || device.capacity.usable.trim())) {
    const parse = (value: string) => (value.trim() ? Number(value.replace(',', '.')) : null);
    document.capacity = { nominal_kwh: parse(device.capacity.nominal), usable_kwh: parse(device.capacity.usable) };
  }
  return document;
}

/** The whole plant to save: removed devices are left out, every other one is sent. */
export function plantFromDraft(draft: PlantDraft): EnergyPlant {
  const plant: EnergyPlant = {};
  for (const id of ENERGY_MODULES) {
    const module = draft[id];
    const devices = module?.devices.filter((device) => !device.removed) ?? [];
    if (!devices.length) continue;
    plant[id] = { devices: devices.map((device) => deviceDocument(id, device)), ...(module?.total ? { total: module.total } : {}) };
  }
  return plant;
}

const canonical = (plant: EnergyPlant) => JSON.stringify(plantFromDraft(plantDraftFromProfile(plant)));

/** Whether the draft would change the stored plant. */
export const plantChanged = (draft: PlantDraft, stored: EnergyPlant) => JSON.stringify(plantFromDraft(draft)) !== canonical(stored);

/** Devices a save would remove; their ids are retired for good. */
export const removedDevices = (draft: PlantDraft) =>
  ENERGY_MODULES.flatMap((id) => (draft[id]?.devices ?? []).filter((device) => device.removed).map((device) => ({ module: id, device })));

export const deviceLabel = (id: EnergyModuleId, device: Pick<PlantDraftDevice, 'name'>, index: number) =>
  device.name.trim() || `${MODULE_META[id].label} ${index + 1}`;

const isStatisticId = (value: string) => SENSOR_PATTERN.test(value) || EXTERNAL_STATISTIC.test(value);

/** Mirrors the backend rules; the backend still has the final word on save. */
export function validatePlantDraft(draft: PlantDraft): PlantIssue[] {
  const issues: PlantIssue[] = [];
  const used = new Map<string, string>();
  const claim = (reference: string, holder: string, issue: Omit<PlantIssue, 'message'>) => {
    if (used.has(reference)) issues.push({ ...issue, message: `${reference} è già usato da ${used.get(reference)}.` });
    else used.set(reference, holder);
  };
  for (const id of ENERGY_MODULES) {
    const module = draft[id];
    if (!module) continue;
    for (const [, reference] of Object.entries(module.total?.power?.sensors ?? {})) claim(reference, `${MODULE_META[id].label} · totale`, { module: id });
    for (const parts of Object.values(module.total?.energy ?? {})) for (const part of parts ?? []) claim(part, `${MODULE_META[id].label} · totale`, { module: id });
    const kept = module.devices.filter((device) => !device.removed);
    if (module.total && kept.length < 2) {
      issues.push({ module: id, message: 'Con un sensore totale servono almeno due dispositivi.' });
    }
    module.devices.forEach((device, index) => {
      if (device.removed) return;
      const holder = deviceLabel(id, device, index);
      const scope = { module: id, deviceId: device.id };
      if (device.name.trim().length > MAX_NAME_LENGTH) issues.push({ ...scope, field: 'name', message: `Usa al massimo ${MAX_NAME_LENGTH} caratteri.` });
      if (device.power.present) {
        for (const issue of powerIssues(id, device.power, used, holder)) issues.push({ ...scope, field: issue.role ?? 'power', message: issue.message });
      }
      let meters = 0;
      for (const { role } of METER_ROLES[id]) {
        const parts = lines(device.meters[role]);
        meters += parts.length;
        if (parts.length > MAX_METER_PARTS) issues.push({ ...scope, field: role, message: `Al massimo ${MAX_METER_PARTS} contatori per voce.` });
        for (const part of parts) {
          if (!isStatisticId(part)) issues.push({ ...scope, field: role, message: `${part} non è un sensore né una statistica (fonte:nome).` });
          else claim(part, holder, { ...scope, field: role });
        }
      }
      if (!device.power.present && meters === 0) {
        issues.push({ ...scope, message: 'Serve almeno un sensore di potenza o un contatore di energia.' });
      }
      if (id === 'battery') {
        const parse = (value: string) => (value.trim() ? Number(value.replace(',', '.')) : null);
        const nominal = parse(device.capacity.nominal);
        const usable = parse(device.capacity.usable);
        for (const [field, value] of [['nominal', nominal], ['usable', usable]] as const) {
          if (value !== null && !(Number.isFinite(value) && value > 0 && value <= MAX_CAPACITY_KWH)) {
            issues.push({ ...scope, field, message: `Indica un valore tra 0 e ${MAX_CAPACITY_KWH} kWh.` });
          }
        }
        if (nominal !== null && usable !== null && usable > nominal) {
          issues.push({ ...scope, field: 'usable', message: 'La capacità utilizzabile non può superare quella nominale.' });
        }
      }
    });
  }
  return issues;
}
