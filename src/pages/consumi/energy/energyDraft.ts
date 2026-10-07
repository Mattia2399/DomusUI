import { ENERGY_MODULES, type EnergyModuleId, type EnergyProfileModules } from '../../../services/energyCoreClient';
import { MODULE_META } from './energyModel';

export type DraftModule = {
  present: boolean;
  mode: 'split' | 'net';
  sensors: Record<string, string>;
  signConvention: string;
};

export type EnergyDraft = Record<EnergyModuleId, DraftModule>;

export type DraftIssue = { module: EnergyModuleId; role?: string; message: string };

export const SENSOR_PATTERN = /^sensor\.[a-z0-9_]+$/;

export const emptyDraft = (): EnergyDraft =>
  Object.fromEntries(
    ENERGY_MODULES.map((id) => [id, { present: false, mode: 'split', sensors: {}, signConvention: '' }]),
  ) as EnergyDraft;

/** Roles used by a module in its current wiring mode. */
export function activeRoles(id: EnergyModuleId, mode: DraftModule['mode']) {
  return MODULE_META[id].roles.filter((spec) => !spec.mode || spec.mode === mode).map((spec) => spec.role);
}

export function draftFromProfile(modules: EnergyProfileModules): EnergyDraft {
  const draft = emptyDraft();
  for (const id of ENERGY_MODULES) {
    const module = modules[id];
    if (!module) continue;
    draft[id] = {
      present: true,
      mode: module.sensors.net_power ? 'net' : 'split',
      sensors: { ...module.sensors },
      signConvention: module.sign_convention ?? '',
    };
  }
  return draft;
}

export function draftToModules(draft: EnergyDraft): EnergyProfileModules {
  const modules: EnergyProfileModules = {};
  for (const id of ENERGY_MODULES) {
    const module = draft[id];
    if (!module.present) continue;
    const sensors: Record<string, string> = {};
    for (const role of activeRoles(id, module.mode)) {
      const entityId = module.sensors[role]?.trim();
      if (entityId) sensors[role] = entityId;
    }
    modules[id] = sensors.net_power && module.signConvention
      ? { sensors, sign_convention: module.signConvention }
      : { sensors };
  }
  return modules;
}

/**
 * Issues of one set of power sensors (a v1 module, or one v2 device). `used`
 * maps every sensor already taken to its holder, across the whole plant.
 */
export function powerIssues(
  id: EnergyModuleId,
  module: DraftModule,
  used: Map<string, string>,
  holder: string = MODULE_META[id].label,
): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const configured = activeRoles(id, module.mode).filter((role) => module.sensors[role]?.trim());
  if (configured.length === 0) {
    issues.push({ module: id, message: 'Scegli almeno un sensore per questo modulo.' });
  }
  for (const role of configured) {
    const entityId = module.sensors[role].trim();
    if (!SENSOR_PATTERN.test(entityId)) {
      issues.push({ module: id, role, message: 'Usa un’entità sensor.* esistente.' });
    } else if (used.has(entityId)) {
      issues.push({ module: id, role, message: `Sensore già usato per ${used.get(entityId)}.` });
    } else {
      used.set(entityId, holder);
    }
  }
  if (module.mode === 'net' && module.sensors.net_power?.trim() && !module.signConvention) {
    issues.push({ module: id, role: 'net_power', message: 'Conferma il significato dei valori positivi.' });
  }
  return issues;
}

export function validateDraft(draft: EnergyDraft): DraftIssue[] {
  const used = new Map<string, string>();
  return ENERGY_MODULES.flatMap((id) => (draft[id].present ? powerIssues(id, draft[id], used) : []));
}

export const sameModules = (left: EnergyProfileModules, right: EnergyProfileModules) =>
  JSON.stringify(left) === JSON.stringify(right);
