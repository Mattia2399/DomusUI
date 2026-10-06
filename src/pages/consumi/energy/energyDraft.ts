import {
  ENERGY_MODULES,
  type EnergyConfidence,
  type EnergyDiscovery,
  type EnergyModuleId,
  type EnergyProfileModules,
} from '../../../services/energyCoreClient';
import { MODULE_META } from './energyModel';

export type DraftModule = {
  present: boolean;
  mode: 'split' | 'net';
  sensors: Record<string, string>;
  signConvention: string;
};

export type EnergyDraft = Record<EnergyModuleId, DraftModule>;

export type DraftIssue = { module: EnergyModuleId; role?: string; message: string };

export type DraftSuggestion = {
  module: EnergyModuleId;
  role: string;
  entityId: string;
  confidence: EnergyConfidence;
  signConvention: string | null;
};

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

/**
 * First-run draft: only unique, reliable discovery matches are preselected.
 * Signed sensors are preselected without a convention, which stays required.
 */
export function draftFromDiscovery(discovery: EnergyDiscovery): EnergyDraft {
  const draft = draftFromProfile(discovery.suggested_profile.modules);
  for (const item of discovery.requires_input) {
    const module = draft[item.module];
    if (module.present && module.mode === 'split' && Object.keys(module.sensors).some((role) => role !== 'state_of_charge')) {
      continue;
    }
    draft[item.module] = {
      present: true,
      mode: 'net',
      sensors: { ...module.sensors, [item.role]: item.entity_id },
      signConvention: '',
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

/** Discovery matches that differ from the draft; never applied automatically. */
export function pendingSuggestions(draft: EnergyDraft, discovery: EnergyDiscovery): DraftSuggestion[] {
  const suggestions: DraftSuggestion[] = [];
  const add = (module: EnergyModuleId, role: string, entityId: string, signConvention: string | null) => {
    const current = draft[module];
    if (current.present && current.sensors[role] === entityId) return;
    const best = discovery.proposals[module]?.[role]?.find((item) => item.entity_id === entityId);
    suggestions.push({ module, role, entityId, confidence: best?.confidence ?? 'medium', signConvention });
  };
  for (const id of ENERGY_MODULES) {
    const module = discovery.suggested_profile.modules[id];
    for (const [role, entityId] of Object.entries(module?.sensors ?? {})) {
      add(id, role, entityId, role === 'net_power' ? module?.sign_convention ?? null : null);
    }
  }
  for (const item of discovery.requires_input) add(item.module, item.role, item.entity_id, null);
  return suggestions;
}

export function applySuggestion(draft: EnergyDraft, suggestion: DraftSuggestion): EnergyDraft {
  const current = draft[suggestion.module];
  const mode = suggestion.role === 'net_power'
    ? 'net'
    : MODULE_META[suggestion.module].roles.find((spec) => spec.role === suggestion.role)?.mode ?? current.mode;
  return {
    ...draft,
    [suggestion.module]: {
      present: true,
      mode,
      sensors: { ...current.sensors, [suggestion.role]: suggestion.entityId },
      signConvention: suggestion.role === 'net_power' ? suggestion.signConvention ?? '' : current.signConvention,
    },
  };
}

export const sameModules = (left: EnergyProfileModules, right: EnergyProfileModules) =>
  JSON.stringify(left) === JSON.stringify(right);
