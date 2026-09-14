import type { DashboardHaApiCaller } from './haDashboardConfigurationRepository';

export const HA_APP_CONFIGURATIONS_KEY = 'domusos.app-configurations.v1';
export const IRRIGATION_CONFIGURATION_CACHE_KEY = 'ha.dashboard.appgallery.irrigation.config.v1';
export const IRRIGATION_DEMO_CONFIGURATION_CACHE_KEY = 'ha.dashboard.appgallery.irrigation.demo-config.v1';
export const APP_CONFIGURATIONS_SCHEMA = 'domusos-app-configurations';
export const APP_CONFIGURATIONS_VERSION = 1;

export type SharedAppConfigurationsDocument = {
  schema: typeof APP_CONFIGURATIONS_SCHEMA;
  version: typeof APP_CONFIGURATIONS_VERSION;
  revision: number;
  updatedAt: string;
  updatedByUserId: string;
  apps: Record<string, unknown>;
};

export type AppConfigurationsLoadResult =
  | { status: 'found'; document: SharedAppConfigurationsDocument }
  | { status: 'empty' }
  | { status: 'offline' | 'unauthorized' | 'unsupported' }
  | { status: 'error'; reason?: string };

export type AppConfigurationSaveResult =
  | { status: 'saved'; document: SharedAppConfigurationsDocument }
  | { status: 'conflict'; current: SharedAppConfigurationsDocument | null }
  | { status: 'offline' | 'unauthorized' | 'unsupported' }
  | { status: 'error'; reason?: string };

type RepositoryOptions = {
  callApi: DashboardHaApiCaller;
  isConnected: () => boolean;
  canManage: () => boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function failureMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (isRecord(error)) {
    for (const key of ['message', 'error', 'code']) {
      if (typeof error[key] === 'string') return error[key] as string;
    }
  }
  return '';
}

function classifyFailure(error: unknown, connected: boolean) {
  if (!connected) return 'offline' as const;
  const message = failureMessage(error).toLowerCase();
  if (/unauthor|forbidden|permission|\b401\b|\b403\b/.test(message)) return 'unauthorized' as const;
  if (/unknown command|not found|unsupported|not supported|not allowed|non ammesso/.test(message)) {
    return 'unsupported' as const;
  }
  return 'error' as const;
}

export function parseSharedAppConfigurationsDocument(value: unknown): SharedAppConfigurationsDocument | null {
  if (
    !isRecord(value) ||
    value.schema !== APP_CONFIGURATIONS_SCHEMA ||
    value.version !== APP_CONFIGURATIONS_VERSION ||
    !Number.isSafeInteger(value.revision) ||
    Number(value.revision) < 1 ||
    typeof value.updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.updatedAt)) ||
    typeof value.updatedByUserId !== 'string' ||
    !isRecord(value.apps)
  ) {
    return null;
  }

  return {
    schema: APP_CONFIGURATIONS_SCHEMA,
    version: APP_CONFIGURATIONS_VERSION,
    revision: Number(value.revision),
    updatedAt: value.updatedAt,
    updatedByUserId: value.updatedByUserId.trim(),
    apps: { ...value.apps },
  };
}

export class HaAppConfigurationsRepository {
  constructor(private readonly options: RepositoryOptions) {}

  async load(): Promise<AppConfigurationsLoadResult> {
    if (!this.options.isConnected()) return { status: 'offline' };
    try {
      const response = await this.options.callApi(
        { type: 'frontend/get_system_data', key: HA_APP_CONFIGURATIONS_KEY },
        { reportError: false, throwOnError: true },
      );
      if (response === null || response === undefined) return { status: 'unsupported' };
      if (!isRecord(response) || !Object.prototype.hasOwnProperty.call(response, 'value')) {
        return { status: 'error', reason: 'invalid_response' };
      }
      if (response.value === null || response.value === undefined) return { status: 'empty' };
      const document = parseSharedAppConfigurationsDocument(response.value);
      return document ? { status: 'found', document } : { status: 'error', reason: 'invalid_document' };
    } catch (error) {
      const status = classifyFailure(error, this.options.isConnected());
      return status === 'error' ? { status, reason: failureMessage(error) || undefined } : { status };
    }
  }

  async saveAppConfiguration(
    appId: string,
    configuration: unknown,
    expectedRevision: number | null,
    updatedByUserId: string,
  ): Promise<AppConfigurationSaveResult> {
    if (!this.options.isConnected()) return { status: 'offline' };
    if (!this.options.canManage()) return { status: 'unauthorized' };

    const current = await this.load();
    if (current.status === 'found') {
      if (expectedRevision === null || current.document.revision !== expectedRevision) {
        return { status: 'conflict', current: current.document };
      }
    } else if (current.status === 'empty') {
      if (expectedRevision !== null) return { status: 'conflict', current: null };
    } else {
      return current;
    }

    const document: SharedAppConfigurationsDocument = {
      schema: APP_CONFIGURATIONS_SCHEMA,
      version: APP_CONFIGURATIONS_VERSION,
      revision: expectedRevision === null ? 1 : expectedRevision + 1,
      updatedAt: new Date().toISOString(),
      updatedByUserId: updatedByUserId.trim(),
      apps: {
        ...(current.status === 'found' ? current.document.apps : {}),
        [appId]: configuration,
      },
    };

    try {
      await this.options.callApi(
        {
          type: 'frontend/set_system_data',
          key: HA_APP_CONFIGURATIONS_KEY,
          value: document,
        },
        { reportError: false, throwOnError: true },
      );
    } catch (error) {
      const status = classifyFailure(error, this.options.isConnected());
      return status === 'error' ? { status, reason: failureMessage(error) || undefined } : { status };
    }

    for (const delayMs of [0, 150, 400]) {
      if (delayMs > 0) await new Promise((resolve) => globalThis.setTimeout(resolve, delayMs));
      const verification = await this.load();
      if (
        verification.status === 'found' &&
        verification.document.revision === document.revision &&
        JSON.stringify(verification.document.apps[appId]) === JSON.stringify(configuration)
      ) {
        return { status: 'saved', document: verification.document };
      }
      if (verification.status === 'found' && verification.document.revision >= document.revision) {
        return { status: 'conflict', current: verification.document };
      }
      if (
        verification.status === 'offline' ||
        verification.status === 'unauthorized' ||
        verification.status === 'unsupported'
      ) return { status: verification.status };
    }
    return { status: 'error', reason: 'write_not_confirmed' };
  }
}

export function createHaAppConfigurationsRepository(options: RepositoryOptions) {
  return new HaAppConfigurationsRepository(options);
}
