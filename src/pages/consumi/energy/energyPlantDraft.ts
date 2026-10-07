import {
  ENERGY_MODULES,
  type EnergyDeviceDocument,
  type EnergyMeterRole,
  type EnergyModuleDocument,
  type EnergyModuleId,
  type EnergyPlant,
  type EnergyProfileModules,
  type EnergySources,
} from '../../../services/energyCoreClient';
import { SENSOR_PATTERN, activeRoles, powerIssues, type DraftModule } from './energyDraft';
import { MODULE_META } from './energyModel';
import type { SensorKind } from './energySensorCatalog';

/*
 * Editable Energy Profile v2 plant, shared by the settings and the setup
 * wizard. It is derived from the stored profile and turned back into a whole
 * plant: every device not edited is sent unchanged, stored ids are never
 * changed, new ids never take one in use or retired, and fields the interface
 * does not expose are kept.
 */

export const METER_ROLES: Record<EnergyModuleId, Array<{ role: EnergyMeterRole; label: string }>> = {
  grid: [{ role: 'import_energy', label: 'Energia prelevata' }, { role: 'export_energy', label: 'Energia immessa' }],
  solar: [{ role: 'production_energy', label: 'Energia prodotta' }],
  home: [{ role: 'consumption_energy', label: 'Energia consumata' }],
  battery: [{ role: 'charge_energy', label: 'Energia caricata' }, { role: 'discharge_energy', label: 'Energia scaricata' }],
  wallbox: [{ role: 'charging_energy', label: 'Energia di ricarica' }],
};

/** Words for one device of each module, for "Aggiungi …" and default names. */
export const DEVICE_NOUN: Record<EnergyModuleId, string> = {
  grid: 'contatore di rete',
  solar: 'inverter',
  home: 'misuratore della casa',
  battery: 'batteria',
  wallbox: 'wallbox',
};

const EXTERNAL_STATISTIC = /^(?!_)(?!.*__)[a-z0-9_]+(?<!_):(?!_)[a-z0-9_]+(?<!_)$/;
export const MAX_DEVICES_PER_MODULE = 16;
const MAX_METER_PARTS = 8;
const MAX_NAME_LENGTH = 64;
const MAX_CAPACITY_KWH = 1000;

/** Power sensors and meters of a device or of a module total. */
export type PlantDraftSources = {
  /** `present: false` when there is no power sensor (meters only). */
  power: DraftModule;
  /** One statistic id per line; several lines are summed (e.g. tariff bands). */
  meters: Partial<Record<EnergyMeterRole, string>>;
};

export type PlantDraftDevice = PlantDraftSources & {
  /** Stored ids are never changed; new ones never take an id in use or retired. */
  id: string;
  name: string;
  capacity: { nominal: string; usable: string };
  removed: boolean;
  /** Added in this draft: removing it simply drops it. */
  isNew?: boolean;
  /** The stored document, for what the draft does not edit (Home Assistant device). */
  stored: EnergyDeviceDocument;
};

export type PlantDraftModule = { devices: PlantDraftDevice[]; total?: PlantDraftSources };
export type PlantDraft = Partial<Record<EnergyModuleId, PlantDraftModule>>;

export type PlantIssue = { module: EnergyModuleId; deviceId?: string; field?: string; message: string };

const number = (value: number | null | undefined) => (value === null || value === undefined ? '' : String(value));

export const emptyPower = (): DraftModule => ({ present: false, mode: 'split', sensors: {}, signConvention: '' });

function powerDraft(power: EnergyModuleDocument | undefined): DraftModule {
  return {
    present: Boolean(power),
    mode: power?.sensors.net_power ? 'net' : 'split',
    sensors: { ...(power?.sensors ?? {}) },
    signConvention: power?.sign_convention ?? '',
  };
}

function sourcesDraft(sources: EnergySources | undefined): PlantDraftSources {
  return {
    power: powerDraft(sources?.power),
    meters: Object.fromEntries(Object.entries(sources?.energy ?? {}).map(([role, parts]) => [role, (parts ?? []).join('\n')])),
  };
}

function deviceDraft(device: EnergyDeviceDocument): PlantDraftDevice {
  return {
    ...sourcesDraft(device),
    id: device.id,
    name: device.name ?? '',
    capacity: { nominal: number(device.capacity?.nominal_kwh), usable: number(device.capacity?.usable_kwh) },
    removed: false,
    stored: device,
  };
}

export function plantDraftFromProfile(plant: EnergyPlant): PlantDraft {
  const draft: PlantDraft = {};
  for (const id of ENERGY_MODULES) {
    const plan = plant[id];
    if (plan) draft[id] = { devices: plan.devices.map(deviceDraft), ...(plan.total ? { total: sourcesDraft(plan.total) } : {}) };
  }
  return draft;
}

export const meterLines = (text: string | undefined) => (text ?? '').split(/[\n,]/).map((item) => item.trim()).filter(Boolean);

function powerDocument(id: EnergyModuleId, power: DraftModule) {
  if (!power.present) return undefined;
  const sensors: Record<string, string> = {};
  for (const role of activeRoles(id, power.mode)) {
    const entityId = power.sensors[role]?.trim();
    if (entityId) sensors[role] = entityId;
  }
  return sensors.net_power && power.signConvention ? { sensors, sign_convention: power.signConvention } : { sensors };
}

function sourcesDocument(id: EnergyModuleId, sources: PlantDraftSources): EnergySources {
  const document: EnergySources = {};
  const power = powerDocument(id, sources.power);
  if (power) document.power = power;
  const energy = Object.fromEntries(
    METER_ROLES[id].map(({ role }) => [role, meterLines(sources.meters[role])]).filter(([, parts]) => parts.length),
  );
  if (Object.keys(energy).length) document.energy = energy;
  return document;
}

function deviceDocument(id: EnergyModuleId, device: PlantDraftDevice): EnergyDeviceDocument {
  const document: EnergyDeviceDocument = {
    id: device.id,
    name: device.name.trim() || null,
    ha_device_id: device.stored.ha_device_id,
    ...sourcesDocument(id, device),
  };
  if (id === 'battery' && (device.capacity.nominal.trim() || device.capacity.usable.trim())) {
    const parse = (value: string) => (value.trim() ? Number(value.replace(',', '.')) : null);
    document.capacity = { nominal_kwh: parse(device.capacity.nominal), usable_kwh: parse(device.capacity.usable) };
  }
  return document;
}

const hasSources = (sources: EnergySources) => Boolean(sources.power || sources.energy);

/** The whole plant to save: removed devices are left out, every other one is sent. */
export function plantFromDraft(draft: PlantDraft): EnergyPlant {
  const plant: EnergyPlant = {};
  for (const id of ENERGY_MODULES) {
    const module = draft[id];
    const devices = module?.devices.filter((device) => !device.removed) ?? [];
    if (!devices.length) continue;
    const total = module?.total ? sourcesDocument(id, module.total) : null;
    plant[id] = { devices: devices.map((device) => deviceDocument(id, device)), ...(total && hasSources(total) ? { total } : {}) };
  }
  return plant;
}

const canonical = (plant: EnergyPlant) => JSON.stringify(plantFromDraft(plantDraftFromProfile(plant)));

/** Whether the draft would change the stored plant. */
export const plantChanged = (draft: PlantDraft, stored: EnergyPlant) => JSON.stringify(plantFromDraft(draft)) !== canonical(stored);

/** Stored devices a save would remove; their ids are retired for good. */
export const removedDevices = (draft: PlantDraft) =>
  ENERGY_MODULES.flatMap((id) => (draft[id]?.devices ?? []).filter((device) => device.removed && !device.isNew).map((device) => ({ module: id, device })));

export const deviceLabel = (id: EnergyModuleId, device: Pick<PlantDraftDevice, 'name'>, index: number) =>
  device.name.trim() || `${MODULE_META[id].label} ${index + 1}`;

/** Modules with at least one device kept. */
export const presentModules = (draft: PlantDraft) =>
  ENERGY_MODULES.filter((id) => draft[id]?.devices.some((device) => !device.removed));

/** Ids a new device may never take: the stored ones and the retired ones. */
export function reservedIds(plant: EnergyPlant, retired: readonly string[] = []) {
  return new Set([...retired, ...ENERGY_MODULES.flatMap((id) => plant[id]?.devices.map((device) => device.id) ?? [])]);
}

function newDeviceId(draft: PlantDraft, module: EnergyModuleId, reserved: ReadonlySet<string>) {
  const taken = new Set([...reserved, ...ENERGY_MODULES.flatMap((id) => draft[id]?.devices.map((device) => device.id) ?? [])]);
  let index = 1;
  while (taken.has(`${module}-${index}`)) index += 1;
  return `${module}-${index}`;
}

export type NewDevice = { name?: string; haDeviceId?: string | null; power?: DraftModule; meters?: PlantDraftSources['meters']; id?: string };

/** Adds a device; a suggested id is used only when free and never retired. */
export function addDevice(draft: PlantDraft, module: EnergyModuleId, reserved: ReadonlySet<string>, init: NewDevice = {}): { draft: PlantDraft; id: string } {
  const inDraft = new Set(ENERGY_MODULES.flatMap((id) => draft[id]?.devices.map((device) => device.id) ?? []));
  const id = init.id && init.id.startsWith(`${module}-`) && !reserved.has(init.id) && !inDraft.has(init.id) ? init.id : newDeviceId(draft, module, reserved);
  const device: PlantDraftDevice = {
    id,
    name: init.name ?? '',
    power: init.power ?? { ...emptyPower(), present: true },
    meters: init.meters ?? {},
    capacity: { nominal: '', usable: '' },
    removed: false,
    isNew: true,
    stored: { id, name: null, ha_device_id: init.haDeviceId ?? null },
  };
  const current = draft[module];
  return { draft: { ...draft, [module]: { ...current, devices: [...(current?.devices ?? []), device] } }, id };
}

export function updateDevice(draft: PlantDraft, module: EnergyModuleId, device: PlantDraftDevice): PlantDraft {
  const current = draft[module];
  if (!current) return draft;
  return { ...draft, [module]: { ...current, devices: current.devices.map((item) => (item.id === device.id ? device : item)) } };
}

/** Stored devices are marked removed (restorable); new ones are simply dropped. */
export function removeDevice(draft: PlantDraft, module: EnergyModuleId, deviceId: string): PlantDraft {
  const current = draft[module];
  if (!current) return draft;
  const devices = current.devices.flatMap((device) =>
    device.id !== deviceId ? [device] : device.isNew ? [] : [{ ...device, removed: true }]);
  return { ...draft, [module]: { ...current, devices } };
}

export function setTotal(draft: PlantDraft, module: EnergyModuleId, total: PlantDraftSources | null): PlantDraft {
  const current = draft[module] ?? { devices: [] };
  const { total: _previous, ...rest } = current;
  return { ...draft, [module]: total ? { ...rest, total } : rest };
}

/** Plant shape of a v1 profile, for integrations that store v1 only (same rule as the backend). */
export function plantFromModules(modules: EnergyProfileModules): EnergyPlant {
  const plant: EnergyPlant = {};
  for (const id of ENERGY_MODULES) {
    const module = modules[id];
    if (module) plant[id] = { devices: [{ id: `${id}-1`, name: null, ha_device_id: null, power: module }] };
  }
  return plant;
}

/** The v1 modules of a plant v1 can hold, or null when it cannot (older integrations). */
export function modulesFromPlant(plant: EnergyPlant): EnergyProfileModules | null {
  const modules: EnergyProfileModules = {};
  for (const id of ENERGY_MODULES) {
    const plan = plant[id];
    if (!plan) continue;
    const [device] = plan.devices;
    if (plan.devices.length !== 1 || plan.total || !device.power || device.energy || device.name || device.capacity || device.ha_device_id || device.id !== `${id}-1`) {
      return null;
    }
    modules[id] = device.power;
  }
  return modules;
}

const isStatisticId = (value: string) => SENSOR_PATTERN.test(value) || EXTERNAL_STATISTIC.test(value);

export type EntityCheck = (kind: SensorKind, id: string) => string | null;

/** Mirrors the backend rules; the backend still has the final word on save. */
export function validatePlantDraft(draft: PlantDraft, check?: EntityCheck): PlantIssue[] {
  const issues: PlantIssue[] = [];
  const used = new Map<string, string>();
  const claim = (reference: string, holder: string, issue: Omit<PlantIssue, 'message'>) => {
    if (used.has(reference)) issues.push({ ...issue, message: `${reference} è già usato da ${used.get(reference)}.` });
    else used.set(reference, holder);
  };
  const checkPower = (id: EnergyModuleId, sources: PlantDraftSources, scope: Omit<PlantIssue, 'message'>, holder: string) => {
    if (!sources.power.present) return;
    for (const issue of powerIssues(id, sources.power, used, holder)) issues.push({ ...scope, field: issue.role ?? 'power', message: issue.message });
    for (const role of activeRoles(id, sources.power.mode)) {
      const entity = sources.power.sensors[role]?.trim();
      const problem = entity && check?.(role === 'state_of_charge' ? 'soc' : 'power', entity);
      if (problem) issues.push({ ...scope, field: role, message: `${entity}: ${problem}.` });
    }
  };
  const checkMeters = (id: EnergyModuleId, sources: PlantDraftSources, scope: Omit<PlantIssue, 'message'>, holder: string) => {
    let count = 0;
    for (const { role } of METER_ROLES[id]) {
      const parts = meterLines(sources.meters[role]);
      count += parts.length;
      if (parts.length > MAX_METER_PARTS) issues.push({ ...scope, field: role, message: `Al massimo ${MAX_METER_PARTS} contatori per voce.` });
      for (const part of parts) {
        if (!isStatisticId(part)) {
          issues.push({ ...scope, field: role, message: `${part} non è un sensore né una statistica (fonte:nome).` });
          continue;
        }
        claim(part, holder, { ...scope, field: role });
        const problem = check?.('energy', part);
        if (problem) issues.push({ ...scope, field: role, message: `${part}: ${problem}.` });
      }
    }
    return count;
  };
  for (const id of ENERGY_MODULES) {
    const module = draft[id];
    if (!module) continue;
    const kept = module.devices.filter((device) => !device.removed);
    if (module.total) {
      const holder = `${MODULE_META[id].label} · totale`;
      checkPower(id, module.total, { module: id, field: 'total' }, holder);
      const meters = checkMeters(id, module.total, { module: id, field: 'total' }, holder);
      if (!module.total.power.present && !meters) issues.push({ module: id, field: 'total', message: 'Il sensore totale non ha né potenza né contatori.' });
      if (kept.length < 2) issues.push({ module: id, message: 'Con un sensore totale servono almeno due dispositivi.' });
    }
    if (kept.length > MAX_DEVICES_PER_MODULE) issues.push({ module: id, message: `Al massimo ${MAX_DEVICES_PER_MODULE} dispositivi per modulo.` });
    module.devices.forEach((device, index) => {
      if (device.removed) return;
      const holder = deviceLabel(id, device, index);
      const scope = { module: id, deviceId: device.id };
      if (device.name.trim().length > MAX_NAME_LENGTH) issues.push({ ...scope, field: 'name', message: `Usa al massimo ${MAX_NAME_LENGTH} caratteri.` });
      checkPower(id, device, scope, holder);
      const meters = checkMeters(id, device, scope, holder);
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

/** Every sensor and meter id the stored plant uses, devices and totals. */
export function plantReferences(plant: EnergyPlant): Set<string> {
  const references = new Set<string>();
  const add = (sources: EnergySources | undefined) => {
    Object.values(sources?.power?.sensors ?? {}).forEach((id) => references.add(id));
    Object.values(sources?.energy ?? {}).forEach((parts) => parts?.forEach((id) => references.add(id)));
  };
  for (const id of ENERGY_MODULES) {
    plant[id]?.devices.forEach(add);
    add(plant[id]?.total);
  }
  return references;
}

/** Every sensor and meter already used in the draft, by holder, for the pickers. */
export function takenSensors(draft: PlantDraft): Record<string, string> {
  const taken: Record<string, string> = {};
  const add = (sources: PlantDraftSources, id: EnergyModuleId, holder: string) => {
    if (sources.power.present) {
      for (const role of activeRoles(id, sources.power.mode)) {
        const entity = sources.power.sensors[role]?.trim();
        if (entity) taken[entity] = holder;
      }
    }
    for (const parts of Object.values(sources.meters)) for (const part of meterLines(parts)) taken[part] = holder;
  };
  for (const id of ENERGY_MODULES) {
    const module = draft[id];
    if (!module) continue;
    module.devices.forEach((device, index) => { if (!device.removed) add(device, id, deviceLabel(id, device, index)); });
    if (module.total) add(module.total, id, `${MODULE_META[id].label} · totale`);
  }
  return taken;
}

/* ---- Summary before saving -------------------------------------------------------------- */

export type PlantChange = { module: EnergyModuleId; kind: 'added' | 'removed' | 'changed' | 'total'; title: string; details: string[] };

const sensorsOf = (sources: EnergySources | undefined) => Object.entries(sources?.power?.sensors ?? {});
const metersOf = (sources: EnergySources | undefined) => Object.entries(sources?.energy ?? {}) as Array<[EnergyMeterRole, string[]]>;
const roleName = (id: EnergyModuleId, role: string) =>
  MODULE_META[id].roles.find((spec) => spec.role === role)?.label ?? METER_ROLES[id].find((spec) => spec.role === role)?.label ?? role;
const conventionName = (id: EnergyModuleId, value: string | undefined) =>
  value ? MODULE_META[id].conventions?.find(([key]) => key === value)?.[1] ?? value : 'nessuna';

function sourceDetails(id: EnergyModuleId, before: EnergySources | undefined, after: EnergySources | undefined): string[] {
  const details: string[] = [];
  const old = Object.fromEntries(sensorsOf(before));
  const next = Object.fromEntries(sensorsOf(after));
  for (const role of new Set([...Object.keys(old), ...Object.keys(next)])) {
    if (old[role] === next[role]) continue;
    details.push(`${roleName(id, role)}: ${old[role] ?? '—'} → ${next[role] ?? '—'}`);
  }
  if ((before?.power?.sign_convention ?? '') !== (after?.power?.sign_convention ?? '') && (after?.power || before?.power)) {
    details.push(`Segno: ${conventionName(id, after?.power?.sign_convention)}`);
  }
  const oldMeters = Object.fromEntries(metersOf(before));
  const newMeters = Object.fromEntries(metersOf(after));
  for (const { role } of METER_ROLES[id]) {
    const was = oldMeters[role] ?? [];
    const now = newMeters[role] ?? [];
    const added = now.filter((part) => !was.includes(part));
    const gone = was.filter((part) => !now.includes(part));
    if (added.length) details.push(`${roleName(id, role)}: aggiunti ${added.join(', ')}`);
    if (gone.length) details.push(`${roleName(id, role)}: rimossi ${gone.join(', ')}`);
  }
  return details;
}

/** What a save would change, in words, against the stored plant. */
export function plantChanges(stored: EnergyPlant, draft: PlantDraft): PlantChange[] {
  const next = plantFromDraft(draft);
  const changes: PlantChange[] = [];
  for (const id of ENERGY_MODULES) {
    const before = stored[id];
    const after = next[id];
    if (!before && !after) continue;
    const old = new Map((before?.devices ?? []).map((device) => [device.id, device]));
    (after?.devices ?? []).forEach((device, index) => {
      const label = device.name ?? `${MODULE_META[id].label} ${index + 1}`;
      const previous = old.get(device.id);
      if (!previous) {
        changes.push({ module: id, kind: 'added', title: `${MODULE_META[id].label}: aggiunto ${label}`, details: sourceDetails(id, undefined, device) });
        return;
      }
      const details = sourceDetails(id, previous, device);
      if ((previous.name ?? null) !== (device.name ?? null)) details.unshift(`Nome: ${previous.name ?? '—'} → ${device.name ?? '—'}`);
      const capacity = (value: EnergyDeviceDocument['capacity']) => `${value?.nominal_kwh ?? '—'} / ${value?.usable_kwh ?? '—'} kWh`;
      if (capacity(previous.capacity) !== capacity(device.capacity)) details.push(`Capacità nominale / utilizzabile: ${capacity(device.capacity)}`);
      if (details.length) changes.push({ module: id, kind: 'changed', title: `${MODULE_META[id].label}: ${label}`, details });
    });
    const kept = new Set((after?.devices ?? []).map((device) => device.id));
    for (const device of before?.devices ?? []) {
      if (!kept.has(device.id)) {
        changes.push({ module: id, kind: 'removed', title: `${MODULE_META[id].label}: rimosso ${device.name ?? device.id}`, details: [] });
      }
    }
    if (JSON.stringify(before?.total ?? null) !== JSON.stringify(after?.total ?? null)) {
      changes.push({
        module: id,
        kind: 'total',
        title: `${MODULE_META[id].label}: sensore totale ${after?.total ? (before?.total ? 'modificato' : 'aggiunto') : 'rimosso'}`,
        details: after?.total ? sourceDetails(id, before?.total, after.total) : [],
      });
    }
  }
  return changes;
}

/* ---- Confirmations the backend cannot give ---------------------------------------------- */

export type Confirmation = {
  key: string;
  module: EnergyModuleId;
  message: string;
  /** Where it applies, so it can also be given next to the meter: a device id or `<module>:total`. */
  holder?: string;
  role?: EnergyMeterRole;
  /** The meter that could not be verified, for `meter:` confirmations. */
  part?: string;
};

/**
 * What the user must confirm before saving, for new or changed bindings only:
 * meters Home Assistant could not verify, parts that will be summed, removals.
 * `verified(id)` says whether a meter is known to Home Assistant.
 */
export function pendingConfirmations(stored: EnergyPlant, draft: PlantDraft, verified: (id: string) => boolean): Confirmation[] {
  const confirmations: Confirmation[] = [];
  const next = plantFromDraft(draft);
  for (const id of ENERGY_MODULES) {
    const holders: Array<[string, EnergySources, EnergySources | undefined, string]> = [];
    const before = new Map((stored[id]?.devices ?? []).map((device) => [device.id, device]));
    next[id]?.devices.forEach((device, index) => holders.push([device.name ?? `${MODULE_META[id].label} ${index + 1}`, device, before.get(device.id), device.id]));
    if (next[id]?.total) holders.push([`${MODULE_META[id].label} · totale`, next[id]!.total!, stored[id]?.total, `${id}:total`]);
    for (const [label, sources, previous, holder] of holders) {
      for (const [role, parts] of metersOf(sources)) {
        const was = previous?.energy?.[role] ?? [];
        for (const part of parts.filter((item) => !was.includes(item) && !verified(item))) {
          confirmations.push({
            key: `meter:${part}`,
            module: id,
            holder,
            role,
            part,
            message: `${label} · ${roleName(id, role)}: ${part} non è verificato da Home Assistant. I suoi dati potrebbero non essere disponibili.`,
          });
        }
        if (parts.length > 1 && JSON.stringify([...parts].sort()) !== JSON.stringify([...was].sort())) {
          confirmations.push({
            key: `parts:${id}:${label}:${role}`,
            module: id,
            holder,
            role,
            message: `${label} · ${roleName(id, role)}: questi ${parts.length} contatori verranno sommati (${parts.join(', ')}). Verifica che rappresentino fasce differenti e non includano già un totale.`,
          });
        }
      }
    }
  }
  for (const { module, device } of removedDevices(draft)) {
    confirmations.push({
      key: `remove:${device.id}`,
      module,
      message: `${MODULE_META[module].label}: ${device.name.trim() || device.id} verrà rimosso. Il suo identificativo non potrà essere riutilizzato.`,
    });
  }
  return confirmations;
}
