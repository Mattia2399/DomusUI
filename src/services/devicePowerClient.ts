/**
 * Device power client: the policies that keep a wall tablet's charger between
 * two battery levels. Administrators only.
 *
 * The controllers run in Home Assistant; this client only reads and saves
 * policies. There is no call that turns a switch on or off.
 */

export type DevicePowerCallApi = <T = unknown>(
  message: Record<string, unknown>,
  options?: { reportError?: boolean; throwOnError?: boolean },
) => Promise<T | null>;

export type DevicePowerStoreStatus = 'ready' | 'corrupt' | 'not_loaded';
export type PolicyRuntimeStatus =
  | 'disabled'
  | 'starting'
  | 'charging'
  | 'waiting'
  | 'battery_unavailable'
  | 'switch_unavailable'
  | 'error';

export type PolicySettings = {
  clientId: string | null;
  label: string | null;
  enabled: boolean;
  batteryEntityId: string;
  switchEntityId: string;
  startThreshold: number;
  stopThreshold: number;
};

export type PolicyRuntime = {
  status: PolicyRuntimeStatus;
  batteryLevel: number | null;
  switchOn: boolean | null;
  lastAction: { action: 'turn_on' | 'turn_off'; at: string } | null;
  lastError: { code: string; at: string } | null;
};

export type PowerPolicy = PolicySettings & {
  policyId: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  runtime: PolicyRuntime;
};

export type DevicePowerState = {
  status: DevicePowerStoreStatus;
  policies: PowerPolicy[];
};

export const DEFAULT_START_THRESHOLD = 30;
export const DEFAULT_STOP_THRESHOLD = 80;
export const MAX_LABEL_LENGTH = 64;

export const DEVICE_POWER_ERROR_CODES = [
  'revision_conflict',
  'policy_not_found',
  'invalid_policy',
  'switch_in_use',
  'client_already_bound',
  'too_many_policies',
  'store_corrupt',
  'device_power_unavailable',
  'permission_denied',
  'save_failed',
  'unauthorized',
  'unsupported',
  'invalid_response',
  'network',
] as const;

export type DevicePowerErrorCode = (typeof DEVICE_POWER_ERROR_CODES)[number];

export class DevicePowerClientError extends Error {
  constructor(public readonly code: DevicePowerErrorCode) {
    super(code);
    this.name = 'DevicePowerClientError';
  }
}

const RUNTIME_STATUSES: readonly PolicyRuntimeStatus[] = [
  'disabled',
  'starting',
  'charging',
  'waiting',
  'battery_unavailable',
  'switch_unavailable',
  'error',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function invalid(): never {
  throw new DevicePowerClientError('invalid_response');
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : invalid();
}

function optionalText(value: unknown): string | null {
  return value === null ? null : text(value);
}

function integer(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) ? value : invalid();
}

function optionalNumber(value: unknown): number | null {
  return value === null ? null : typeof value === 'number' && Number.isFinite(value) ? value : invalid();
}

function optionalBoolean(value: unknown): boolean | null {
  return value === null ? null : typeof value === 'boolean' ? value : invalid();
}

function parseRuntime(value: unknown): PolicyRuntime {
  if (!isRecord(value)) invalid();
  const status = value.status;
  if (typeof status !== 'string' || !(RUNTIME_STATUSES as readonly string[]).includes(status)) invalid();
  const action = value.last_action;
  const error = value.last_error;
  return {
    status: status as PolicyRuntimeStatus,
    batteryLevel: optionalNumber(value.battery_level),
    switchOn: optionalBoolean(value.switch_on),
    lastAction:
      action === null
        ? null
        : isRecord(action) && (action.action === 'turn_on' || action.action === 'turn_off')
          ? { action: action.action, at: text(action.at) }
          : invalid(),
    lastError: error === null ? null : isRecord(error) ? { code: text(error.code), at: text(error.at) } : invalid(),
  };
}

function parsePolicy(value: unknown): PowerPolicy {
  if (!isRecord(value) || typeof value.enabled !== 'boolean') invalid();
  return {
    policyId: text(value.policy_id),
    clientId: optionalText(value.client_id),
    label: optionalText(value.label),
    enabled: value.enabled,
    batteryEntityId: text(value.battery_entity_id),
    switchEntityId: text(value.switch_entity_id),
    startThreshold: integer(value.start_threshold),
    stopThreshold: integer(value.stop_threshold),
    revision: integer(value.revision),
    createdAt: text(value.created_at),
    updatedAt: text(value.updated_at),
    runtime: parseRuntime(value.runtime),
  };
}

export function parseDevicePowerState(value: unknown): DevicePowerState {
  if (!isRecord(value) || !Array.isArray(value.policies)) invalid();
  const status = value.status;
  if (status !== 'ready' && status !== 'corrupt' && status !== 'not_loaded') invalid();
  return { status, policies: value.policies.map(parsePolicy) };
}

/** Normalize websocket and panel-bridge failures into stable codes. */
export function toDevicePowerClientError(error: unknown): DevicePowerClientError {
  if (error instanceof DevicePowerClientError) return error;
  const message = isRecord(error) && typeof error.message === 'string' ? error.message : String(error ?? '');
  const rawCode = isRecord(error) && typeof error.code === 'string'
    ? error.code
    : message.match(/\[([a-z_]+)\]\s*$/)?.[1] ?? '';
  if ((DEVICE_POWER_ERROR_CODES as readonly string[]).includes(rawCode)) {
    return new DevicePowerClientError(rawCode as DevicePowerErrorCode);
  }
  // Access Control refuses device power before Home Assistant does (P2.5D.1): the same refusal.
  if (rawCode === 'access_denied') return new DevicePowerClientError('unauthorized');
  if (rawCode === 'unknown_command' || rawCode === 'invalid_format' || /non ammess[oa]/i.test(message)) {
    return new DevicePowerClientError('unsupported');
  }
  return new DevicePowerClientError('network');
}

async function call<T>(callApi: DevicePowerCallApi, message: Record<string, unknown>, parse: (value: unknown) => T) {
  let result: unknown;
  try {
    result = await callApi<unknown>(message, { reportError: false, throwOnError: true });
  } catch (error) {
    throw toDevicePowerClientError(error);
  }
  return parse(result);
}

export function getDevicePowerState(callApi: DevicePowerCallApi) {
  return call(callApi, { type: 'domusos/device_power/get_state' }, parseDevicePowerState);
}

function toWirePolicy(settings: PolicySettings) {
  return {
    client_id: settings.clientId,
    label: settings.label,
    enabled: settings.enabled,
    battery_entity_id: settings.batteryEntityId,
    switch_entity_id: settings.switchEntityId,
    start_threshold: settings.startThreshold,
    stop_threshold: settings.stopThreshold,
  };
}

/** Create a policy, or change `existing` when its revision still matches on the server. */
export function saveDevicePowerPolicy(
  callApi: DevicePowerCallApi,
  settings: PolicySettings,
  existing?: { policyId: string; revision: number },
) {
  const message: Record<string, unknown> = { type: 'domusos/device_power/save_policy', policy: toWirePolicy(settings) };
  if (existing) {
    message.policy_id = existing.policyId;
    message.expected_revision = existing.revision;
  }
  return call(callApi, message, (value) => (isRecord(value) ? parseDevicePowerState(value) : invalid()));
}

export function bindDevicePowerPolicy(callApi: DevicePowerCallApi, policy: PowerPolicy, clientId: string) {
  return call(
    callApi,
    {
      type: 'domusos/device_power/bind_policy',
      policy_id: policy.policyId,
      expected_revision: policy.revision,
      client_id: clientId,
    },
    (value) => (isRecord(value) ? parseDevicePowerState(value) : invalid()),
  );
}

/** Remove a policy; its switch keeps its current state. */
export function deleteDevicePowerPolicy(callApi: DevicePowerCallApi, policy: PowerPolicy) {
  return call(
    callApi,
    { type: 'domusos/device_power/delete_policy', policy_id: policy.policyId, expected_revision: policy.revision },
    parseDevicePowerState,
  );
}

export type PolicyDraft = {
  label: string;
  enabled: boolean;
  batteryEntityId: string;
  switchEntityId: string;
  startThreshold: string;
  stopThreshold: string;
};

export type PolicyDraftErrors = Partial<Record<'label' | 'batteryEntityId' | 'switchEntityId' | 'startThreshold' | 'stopThreshold', 'required' | 'range' | 'order' | 'length' | 'domain'>>;

function wholePercentage(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d{1,3}$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return parsed >= 0 && parsed <= 100 ? parsed : null;
}

/**
 * The same rules as the server: a sensor.* battery, a switch.* charger and
 * 0 <= start < stop <= 100. Invalid values are reported, never corrected.
 */
export function validatePolicyDraft(draft: PolicyDraft): { errors: PolicyDraftErrors; settings: Omit<PolicySettings, 'clientId'> | null } {
  const errors: PolicyDraftErrors = {};
  const label = draft.label.trim();
  if (label.length > MAX_LABEL_LENGTH) errors.label = 'length';
  if (!draft.batteryEntityId) errors.batteryEntityId = 'required';
  else if (!draft.batteryEntityId.startsWith('sensor.')) errors.batteryEntityId = 'domain';
  if (!draft.switchEntityId) errors.switchEntityId = 'required';
  else if (!draft.switchEntityId.startsWith('switch.')) errors.switchEntityId = 'domain';
  const start = wholePercentage(draft.startThreshold);
  const stop = wholePercentage(draft.stopThreshold);
  if (start === null) errors.startThreshold = draft.startThreshold.trim() ? 'range' : 'required';
  if (stop === null) errors.stopThreshold = draft.stopThreshold.trim() ? 'range' : 'required';
  if (start !== null && stop !== null && start >= stop) errors.stopThreshold = 'order';
  if (Object.keys(errors).length > 0 || start === null || stop === null) return { errors, settings: null };
  return {
    errors,
    settings: {
      label: label || null,
      enabled: draft.enabled,
      batteryEntityId: draft.batteryEntityId,
      switchEntityId: draft.switchEntityId,
      startThreshold: start,
      stopThreshold: stop,
    },
  };
}

export function draftFromPolicy(policy: PowerPolicy | null): PolicyDraft {
  return {
    label: policy?.label ?? '',
    enabled: policy?.enabled ?? true,
    batteryEntityId: policy?.batteryEntityId ?? '',
    switchEntityId: policy?.switchEntityId ?? '',
    startThreshold: String(policy?.startThreshold ?? DEFAULT_START_THRESHOLD),
    stopThreshold: String(policy?.stopThreshold ?? DEFAULT_STOP_THRESHOLD),
  };
}
