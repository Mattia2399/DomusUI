import type { DashboardLayoutConfiguration } from './dashboardConfigurationRepository';
import {
  createDashboardStructuralFingerprint,
  stripWidgetRuntimeState,
} from './dashboardPersistenceProjection';
import { stripWidgetSecretsFromWidgets } from './widgetSecrets';

export type DashboardStructuralLoadPhase =
  | 'idle'
  | 'loading'
  | 'refreshing'
  | 'complete'
  | 'empty'
  | 'migration-required'
  | 'pending-remote'
  | 'offline'
  | 'error';

export type DashboardStructuralLoadSource = 'home-assistant' | 'local-cache' | 'none';

/**
 * The public type is intentionally compatible with the existing dashboard
 * model. The value itself is recursively frozen by this module; callers never
 * receive a reference owned by the repository or by MainBoard.
 */
export type DashboardStructuralLoadSnapshot = Readonly<{
  phase: DashboardStructuralLoadPhase;
  source: DashboardStructuralLoadSource;
  generation: number;
  revision: number | null;
  storageVersion: number | null;
  fingerprint: string | null;
  coherent: boolean;
  reason?: string;
  dashboard: Readonly<DashboardLayoutConfiguration> | null;
}>;

export type DashboardStructuralCandidateToken = Readonly<{
  generation: number;
  revision: number;
  fingerprint: string;
}>;

export type DashboardStructuralApplicationReceipt = DashboardStructuralCandidateToken & Readonly<{
  expectedAppliedFingerprint: string;
  appliedFingerprint: string;
  coherent: boolean;
}>;

export type DashboardStructuralCandidate = Readonly<{
  snapshot: DashboardStructuralLoadSnapshot;
  token: DashboardStructuralCandidateToken;
  changed: boolean;
}>;

function hashString(value: string) {
  // Two independent 32-bit streams keep the diagnostic fingerprint compact
  // without exposing titles, entity ids or the serialized HA document.
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ (code + index), 0x85ebca6b);
  }
  return `dsl-v1-${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value as Record<string, unknown>).forEach((entry) => deepFreeze(entry));
  return Object.freeze(value);
}

function sanitizeStructuralDashboard(
  dashboard: DashboardLayoutConfiguration,
): DashboardLayoutConfiguration {
  const widgetsWithoutSecrets = stripWidgetSecretsFromWidgets(dashboard.widgets)
    .map((widget) => stripWidgetRuntimeState(widget, false));
  return {
    ...dashboard,
    widgets: widgetsWithoutSecrets,
  };
}

/** Creates an isolated JSON value once per structural generation. */
export function isolateDashboardStructuralConfiguration(
  dashboard: DashboardLayoutConfiguration,
): Readonly<DashboardLayoutConfiguration> {
  return deepFreeze(cloneJson(sanitizeStructuralDashboard(dashboard)));
}

/** Opaque fingerprint: stable for structural data and insensitive to HA runtime fields. */
export function createDashboardStructuralSnapshotFingerprint(
  dashboard: DashboardLayoutConfiguration,
) {
  return hashString(createDashboardStructuralFingerprint(sanitizeStructuralDashboard(dashboard)));
}

export function createEmptyDashboardStructuralLoadSnapshot(): DashboardStructuralLoadSnapshot {
  return Object.freeze({
    phase: 'idle',
    source: 'none',
    generation: 0,
    revision: null,
    storageVersion: null,
    fingerprint: null,
    coherent: false,
    dashboard: null,
  });
}

export function createLocalDashboardStructuralLoadSnapshot(
  dashboard: DashboardLayoutConfiguration,
  phase: Extract<DashboardStructuralLoadPhase, 'idle' | 'loading' | 'offline'> = 'idle',
): DashboardStructuralLoadSnapshot {
  const isolated = isolateDashboardStructuralConfiguration(dashboard);
  return Object.freeze({
    phase,
    source: 'local-cache',
    generation: 0,
    revision: null,
    storageVersion: isolated.storageVersion,
    fingerprint: createDashboardStructuralSnapshotFingerprint(isolated as DashboardLayoutConfiguration),
    coherent: false,
    reason: phase === 'offline' ? 'home-assistant-unavailable' : 'awaiting-home-assistant',
    dashboard: isolated,
  });
}

export function markDashboardStructuralLoadPhase(
  current: DashboardStructuralLoadSnapshot,
  phase: DashboardStructuralLoadPhase,
  reason?: string,
): DashboardStructuralLoadSnapshot {
  if (current.phase === phase && current.reason === reason && current.coherent === false) return current;
  return Object.freeze({
    ...current,
    phase,
    coherent: false,
    ...(reason ? { reason } : { reason: undefined }),
  });
}

export function markDashboardStructuralDocumentMissing(
  current: DashboardStructuralLoadSnapshot,
  phase: Extract<DashboardStructuralLoadPhase, 'empty' | 'migration-required'>,
  reason: string,
): DashboardStructuralLoadSnapshot {
  const alreadyMissing = current.source === 'none' && current.dashboard === null && current.phase === phase;
  return Object.freeze({
    phase,
    source: 'none',
    generation: alreadyMissing ? current.generation : current.generation + 1,
    revision: null,
    storageVersion: null,
    fingerprint: null,
    coherent: false,
    reason,
    dashboard: null,
  });
}

export function createDashboardStructuralCandidate(
  current: DashboardStructuralLoadSnapshot,
  dashboard: DashboardLayoutConfiguration,
  revision: number,
  phase: Extract<DashboardStructuralLoadPhase, 'loading' | 'refreshing'>,
): DashboardStructuralCandidate {
  const fingerprint = createDashboardStructuralSnapshotFingerprint(dashboard);
  const sameAuthority = current.source === 'home-assistant' &&
    current.revision === revision &&
    current.fingerprint === fingerprint;
  const token = Object.freeze({
    generation: sameAuthority ? current.generation : current.generation + 1,
    revision,
    fingerprint,
  });
  if (sameAuthority && current.phase === 'complete' && current.coherent) {
    return Object.freeze({ snapshot: current, token, changed: false });
  }
  const isolated = sameAuthority && current.dashboard
    ? current.dashboard
    : isolateDashboardStructuralConfiguration(dashboard);
  const snapshot = Object.freeze({
    phase,
    source: 'home-assistant' as const,
    generation: token.generation,
    revision,
    storageVersion: dashboard.storageVersion,
    fingerprint,
    coherent: false,
    reason: 'awaiting-react-commit',
    dashboard: isolated,
  });
  return Object.freeze({ snapshot, token, changed: snapshot !== current });
}

export function acknowledgeDashboardStructuralApplication(
  current: DashboardStructuralLoadSnapshot,
  receipt: DashboardStructuralApplicationReceipt,
): DashboardStructuralLoadSnapshot | null {
  if (
    current.source !== 'home-assistant' ||
    current.dashboard === null ||
    current.generation !== receipt.generation ||
    current.revision !== receipt.revision ||
    current.fingerprint !== receipt.fingerprint ||
    !receipt.coherent ||
    receipt.appliedFingerprint !== receipt.expectedAppliedFingerprint
  ) {
    return null;
  }
  if (current.phase === 'complete' && current.coherent) return current;
  return Object.freeze({
    ...current,
    phase: 'complete',
    coherent: true,
    reason: undefined,
  });
}

export function createDashboardStructuralApplicationReceipt(
  snapshot: DashboardStructuralLoadSnapshot,
  expectedAppliedDashboard: DashboardLayoutConfiguration,
  appliedDashboard: DashboardLayoutConfiguration,
): DashboardStructuralApplicationReceipt | null {
  if (
    snapshot.source !== 'home-assistant' ||
    snapshot.dashboard === null ||
    snapshot.revision === null ||
    snapshot.fingerprint === null
  ) {
    return null;
  }
  const expectedAppliedFingerprint = createDashboardStructuralSnapshotFingerprint(
    expectedAppliedDashboard,
  );
  const appliedFingerprint = createDashboardStructuralSnapshotFingerprint(appliedDashboard);
  return Object.freeze({
    generation: snapshot.generation,
    revision: snapshot.revision,
    fingerprint: snapshot.fingerprint,
    expectedAppliedFingerprint,
    appliedFingerprint,
    coherent: expectedAppliedFingerprint === appliedFingerprint,
  });
}

export function isDashboardStructuralSnapshotAuthoritative(
  snapshot: DashboardStructuralLoadSnapshot,
) {
  return snapshot.phase === 'complete' &&
    snapshot.source === 'home-assistant' &&
    snapshot.coherent &&
    snapshot.dashboard !== null &&
    snapshot.revision !== null &&
    snapshot.fingerprint !== null;
}
