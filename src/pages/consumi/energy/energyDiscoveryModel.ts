import {
  ENERGY_MODULES,
  type EnergyDiscovery,
  type EnergyDiscoveryV2,
  type EnergyDiscoveryV2Device,
  type EnergyMeterInfo,
  type EnergyMeterRole,
  type EnergyModuleId,
  type EnergyPlant,
} from '../../../services/energyCoreClient';
import type { DraftModule } from './energyDraft';
import { MODULE_META } from './energyModel';
import { addDevice, emptyPower, meterLines, setTotal, updateDevice, type PlantDraft } from './energyPlantDraft';

/*
 * The multi-device discovery result, sorted for the user to review, and the
 * explicit application of one proposal at a time to the draft. Nothing is
 * applied on its own: `suggested_plant` leaves out the additions and
 * corrections of configured devices, and a high confidence is not consent.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** The v2 proposal, when the integration provides a well-formed one. */
export function discoveryV2(discovery: EnergyDiscovery | null | undefined): EnergyDiscoveryV2 | null {
  const v2: unknown = discovery?.v2;
  if (!isRecord(v2) || !Array.isArray(v2.devices) || !Array.isArray(v2.totals) || !Array.isArray(v2.ambiguous) || !isRecord(v2.meters)) {
    return null;
  }
  return discovery?.v2 ?? null;
}

/**
 * Proposals of an integration without multi-device discovery, from its v1
 * result: one device per suggested module, compared with the current plant.
 */
export function proposalsFromV1(discovery: EnergyDiscovery, current: EnergyPlant): EnergyDiscoveryV2 {
  const devices: EnergyDiscoveryV2Device[] = [];
  for (const id of ENERGY_MODULES) {
    const suggested = discovery.suggested_profile.modules[id];
    const pending = discovery.requires_input.filter((item) => item.module === id);
    if (!suggested && !pending.length) continue;
    const power = [
      ...Object.entries(suggested?.sensors ?? {}).map(([role, entityId]) => ({
        role,
        entity_id: entityId,
        confidence: discovery.proposals[id]?.[role]?.find((item) => item.entity_id === entityId)?.confidence ?? 'medium',
        evidence: discovery.proposals[id]?.[role]?.find((item) => item.entity_id === entityId)?.evidence ?? [],
        sign_convention: role === 'net_power' ? suggested?.sign_convention ?? null : null,
        requires: [] as string[],
      })),
      ...pending.map((item) => ({ role: item.role, entity_id: item.entity_id, confidence: 'medium' as const, evidence: [], sign_convention: null, requires: item.missing })),
    ];
    const configured = current[id]?.devices[0];
    const sensors = configured?.power?.sensors ?? {};
    const additions = power.filter((item) => !sensors[item.role]).map((item) => ({ kind: 'power' as const, role: item.role, ids: [item.entity_id] }));
    const corrections = power
      .filter((item) => sensors[item.role] && sensors[item.role] !== item.entity_id)
      .map((item) => ({ kind: 'power' as const, role: item.role, configured: [sensors[item.role]], proposed: [item.entity_id] }));
    devices.push({
      key: `${id}:v1`,
      module: id,
      status: !configured ? 'new' : additions.length || corrections.length ? 'update' : 'configured',
      device_id: configured?.id ?? null,
      name: null,
      confidence: power.some((item) => item.confidence === 'high') ? 'high' : 'medium',
      eligible: !configured && power.some((item) => !item.requires.length),
      power,
      energy: [],
      additions,
      corrections,
      warnings: pending.map((item) => ({ code: 'requires_sign_convention', role: item.role, ids: [item.entity_id] })),
    });
  }
  return {
    profile: { configured: Object.keys(current).length > 0, revision: 0 },
    verification: 'complete',
    recorder: 'available',
    devices,
    totals: [],
    meters: {},
    ambiguous: discovery.ambiguous,
    suggested_plant: null,
    low_confidence: [],
  };
}

export type DiscoveryReview = {
  /** Detected, not configured; `eligible` ones need no choice, but still a confirmation. */
  newDevices: EnergyDiscoveryV2Device[];
  /** Configured devices with additions or corrections, each to confirm on its own. */
  changes: EnergyDiscoveryV2Device[];
  configured: EnergyDiscoveryV2Device[];
  /** Configured, not found by this detection: kept as they are. */
  notDetected: EnergyDiscoveryV2Device[];
  /** Matching several configured devices: the user decides. */
  conflicts: EnergyDiscoveryV2Device[];
  ambiguous: EnergyDiscoveryV2['ambiguous'];
  presumedTotals: EnergyDiscoveryV2['totals'];
  verifiedTotals: EnergyDiscoveryV2['totals'];
  /** Meters could not all be checked (Home Assistant or the Recorder starting). */
  verificationIncomplete: boolean;
};

export function reviewDiscovery(v2: EnergyDiscoveryV2): DiscoveryReview {
  const detected = v2.devices.filter((device) => device.detected !== false);
  return {
    newDevices: detected.filter((device) => device.status === 'new'),
    changes: detected.filter((device) => device.status === 'update'),
    configured: detected.filter((device) => device.status === 'configured'),
    notDetected: v2.devices.filter((device) => device.detected === false),
    conflicts: detected.filter((device) => device.status === 'conflict'),
    ambiguous: v2.ambiguous,
    presumedTotals: v2.totals.filter((total) => total.status === 'presumed'),
    verifiedTotals: v2.totals.filter((total) => total.status === 'verified'),
    verificationIncomplete: v2.verification === 'incomplete' || v2.recorder === 'unavailable',
  };
}

/* ---- Plain words for the evidence -------------------------------------------------------- */

export const EVIDENCE_LABEL: Record<string, string> = {
  energy_dashboard: 'Configurato nella Dashboard Energia',
  energy_dashboard_device: 'Stesso dispositivo di un contatore della Dashboard Energia',
  energy_dashboard_consumer: 'Consumatore della Dashboard Energia',
  energy_hardware_device: 'Su un dispositivo energetico',
  same_device: 'Stesso dispositivo Home Assistant',
  single_device_module: 'Unico dispositivo del modulo',
  module_keyword: 'Nome del sensore',
  role_keyword: 'Nome del sensore',
  device_class: 'Tipo di sensore compatibile',
  measurement_state_class: 'Misura istantanea',
  group_sum: 'Somma calcolata da Home Assistant',
  aggregate_keyword: 'Il nome indica un totale',
  group_of_unknown_type: 'Gruppo di Home Assistant di tipo sconosciuto',
};

export const WARNING_LABEL: Record<string, string> = {
  requires_sign_convention: 'Serve confermare il significato dei valori positivi',
  meter_not_verified_yet: 'Contatore non ancora verificabile',
  meter_unknown: 'Contatore non trovato',
  meter_incompatible: 'Contatore non compatibile: escluso',
  parts_summed_by_energy_dashboard: 'Parti sommate dalla Dashboard Energia',
  parts_disjointness_unconfirmed: 'Contatori da sommare: verifica che non si sovrappongano',
  possible_overlap: 'Un altro contatore potrebbe sovrapporsi',
  alternative_meters: 'Scelto il contatore totale, non quello giornaliero',
  alternative_sensors: 'Altri sensori possibili',
  several_ha_devices: 'Sensori di più dispositivi Home Assistant',
  used_by_configured: 'Sensore già usato da un dispositivo configurato',
  name_too_long: 'Nome troppo lungo: lasciato vuoto',
};

export const AMBIGUITY_LABEL: Record<string, string> = {
  multiple_candidates: 'Più sensori possibili: scegli tu quale usare',
  total_or_bands: 'Contatore complessivo o contatori per fascia: scegline uno solo',
  presumed_total: 'Potrebbe essere il totale degli altri dispositivi',
  partial_aggregate: 'Somma di solo alcuni dispositivi',
  membership_undetermined: 'Non è chiaro se sia un dispositivo o il totale',
  net_and_directional_conflict: 'Sensore con segno e sensori separati in conflitto',
  entity_matches_multiple_roles: 'Lo stesso sensore va bene per più ruoli',
  module_unresolved: 'Contatore di cui non è chiaro il modulo',
  role_unresolved: 'Contatore di cui non è chiara la direzione',
  matches_several_configured_devices: 'Corrisponde a più dispositivi configurati',
  total_coverage_unknown: 'Il sensore totale configurato potrebbe non coprirlo',
  invalid_combination: 'Combinazione non valida',
  too_many_devices: 'Troppi dispositivi per questo modulo',
};

export const describeEvidence = (codes: string[] = []) => [...new Set(codes.map((code) => EVIDENCE_LABEL[code]).filter(Boolean))];

/* ---- Applying one proposal ------------------------------------------------------------------ */

function proposedPower(proposal: EnergyDiscoveryV2Device): DraftModule {
  const power = proposal.power ?? [];
  if (!power.length) return emptyPower();
  const net = power.find((item) => item.role === 'net_power');
  return {
    present: true,
    mode: net ? 'net' : 'split',
    sensors: Object.fromEntries(power.map((item) => [item.role, item.entity_id])),
    // A convention from the Energy dashboard is preselected, still shown to the user.
    signConvention: net?.sign_convention ?? '',
  };
}

/** Adds a proposed device: its sensors, and its meters unless verifiably incompatible. */
export function applyNewDevice(
  draft: PlantDraft,
  proposal: EnergyDiscoveryV2Device,
  reserved: ReadonlySet<string>,
  meters: Record<string, EnergyMeterInfo>,
) {
  const energy = Object.fromEntries((proposal.energy ?? []).map((item) => [
    item.role,
    item.statistic_ids.filter((id) => meters[id]?.status !== 'incompatible').join('\n'),
  ]).filter(([, text]) => text));
  return addDevice(draft, proposal.module, reserved, {
    id: proposal.status === 'new' ? proposal.device_id ?? undefined : undefined,
    name: proposal.name ?? '',
    haDeviceId: proposal.ha_device_id ?? null,
    power: proposedPower(proposal),
    meters: energy,
  });
}

type Change =
  | NonNullable<EnergyDiscoveryV2Device['additions']>[number]
  | NonNullable<EnergyDiscoveryV2Device['corrections']>[number];

/** Applies one addition or correction to a configured device; nothing else changes. */
export function applyChange(draft: PlantDraft, module: EnergyModuleId, deviceId: string, change: Change): PlantDraft {
  const device = draft[module]?.devices.find((item) => item.id === deviceId);
  if (!device) return draft;
  const proposed = 'proposed' in change ? change.proposed : change.ids;
  if (change.kind === 'sign_convention') {
    return updateDevice(draft, module, { ...device, power: { ...device.power, signConvention: proposed[0] ?? '' } });
  }
  if (change.kind === 'power') {
    const mode = change.role === 'net_power' ? 'net' : MODULE_META[module].roles.find((spec) => spec.role === change.role)?.mode ?? device.power.mode;
    return updateDevice(draft, module, {
      ...device,
      power: { ...device.power, present: true, mode, sensors: { ...device.power.sensors, [change.role]: proposed[0] } },
    });
  }
  const role = change.role as EnergyMeterRole;
  const parts = 'proposed' in change ? proposed : [...new Set([...meterLines(device.meters[role]), ...proposed])];
  return updateDevice(draft, module, { ...device, meters: { ...device.meters, [role]: parts.join('\n') } });
}

/** Uses a detected total as the module total, explicitly chosen by the user. */
export function applyTotal(draft: PlantDraft, total: EnergyDiscoveryV2['totals'][number]): PlantDraft {
  const module = total.module;
  const current = draft[module]?.total ?? { power: emptyPower(), meters: {} };
  if (total.kind === 'power') {
    return setTotal(draft, module, {
      ...current,
      power: { ...current.power, present: true, mode: total.role === 'net_power' ? 'net' : current.power.mode, sensors: { ...current.power.sensors, [total.role]: total.ids[0] } },
    });
  }
  return setTotal(draft, module, { ...current, meters: { ...current.meters, [total.role]: total.ids.join('\n') } });
}
