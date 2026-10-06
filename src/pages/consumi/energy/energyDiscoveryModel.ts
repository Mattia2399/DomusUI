import type { EnergyDiscovery, EnergyDiscoveryV2, EnergyDiscoveryV2Device } from '../../../services/energyCoreClient';

/*
 * The multi-device discovery result, sorted for the user to review. Nothing
 * here applies a suggestion: `suggested_plant` leaves out the additions and
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
