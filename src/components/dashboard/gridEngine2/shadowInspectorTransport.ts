import type { DashboardGridBreakpoint } from '../../../types/widgetTypeLayout';
import type { ShadowDiagnosticsReport } from './shadowLayoutDiagnostics';
import {
  SHADOW_INSPECTOR_PROTOCOL_VERSION,
  createShadowInspectorSnapshot,
  isShadowInspectorSnapshot,
  type ShadowInspectorSnapshot,
} from './shadowInspectorSnapshot';

export const SHADOW_INSPECTOR_CHANNEL_NAME = 'domusui:grid-engine2:shadow-inspector:v1';

type InspectorRequestMessage = {
  readonly protocolVersion: typeof SHADOW_INSPECTOR_PROTOCOL_VERSION;
  readonly type: 'request-latest';
  readonly requestId: string;
};

type InspectorSnapshotMessage = {
  readonly protocolVersion: typeof SHADOW_INSPECTOR_PROTOCOL_VERSION;
  readonly type: 'snapshot';
  readonly requestId?: string;
  readonly snapshot: ShadowInspectorSnapshot;
};

type InspectorChannel = {
  postMessage: (message: InspectorRequestMessage | InspectorSnapshotMessage) => void;
  addEventListener: (type: 'message', listener: (event: MessageEvent<unknown>) => void) => void;
  removeEventListener: (type: 'message', listener: (event: MessageEvent<unknown>) => void) => void;
  close: () => void;
};

type ChannelFactory = (name: string) => InspectorChannel;

function defaultChannelFactory(name: string): InspectorChannel {
  return new BroadcastChannel(name);
}

function canCreateDefaultChannel() {
  return typeof BroadcastChannel !== 'undefined';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isRequest(value: unknown): value is InspectorRequestMessage {
  return isRecord(value) &&
    value.protocolVersion === SHADOW_INSPECTOR_PROTOCOL_VERSION &&
    value.type === 'request-latest' &&
    typeof value.requestId === 'string';
}

function isSnapshotMessage(value: unknown): value is InspectorSnapshotMessage {
  return isRecord(value) &&
    value.protocolVersion === SHADOW_INSPECTOR_PROTOCOL_VERSION &&
    value.type === 'snapshot' &&
    (value.requestId === undefined || typeof value.requestId === 'string') &&
    isShadowInspectorSnapshot(value.snapshot);
}

export type ShadowInspectorPublisher = {
  readonly active: boolean;
  publish: (input: {
    readonly report: ShadowDiagnosticsReport;
    readonly observedBreakpoint: DashboardGridBreakpoint;
    readonly analysisMs: number;
  }) => { readonly status: 'published' | 'unchanged' | 'inactive'; readonly snapshot: ShadowInspectorSnapshot | null };
  latest: () => ShadowInspectorSnapshot | null;
  dispose: () => void;
};

export function createShadowInspectorPublisher(options: {
  readonly enabled: boolean;
  readonly createChannel?: ChannelFactory;
  readonly now?: () => Date;
}): ShadowInspectorPublisher {
  const supported = Boolean(options.createChannel) || canCreateDefaultChannel();
  if (!options.enabled || !supported) {
    return {
      active: false,
      publish: () => ({ status: 'inactive', snapshot: null }),
      latest: () => null,
      dispose: () => undefined,
    };
  }

  const channel = (options.createChannel ?? defaultChannelFactory)(SHADOW_INSPECTOR_CHANNEL_NAME);
  const now = options.now ?? (() => new Date());
  let sequence = 0;
  let lastInputSignature: string | null = null;
  let lastSnapshot: ShadowInspectorSnapshot | null = null;
  let disposed = false;

  const handleMessage = (event: MessageEvent<unknown>) => {
    if (disposed || !isRequest(event.data) || !lastSnapshot) return;
    channel.postMessage({
      protocolVersion: SHADOW_INSPECTOR_PROTOCOL_VERSION,
      type: 'snapshot',
      requestId: event.data.requestId,
      snapshot: lastSnapshot,
    });
  };
  channel.addEventListener('message', handleMessage);

  return {
    active: true,
    publish: ({ report, observedBreakpoint, analysisMs }) => {
      if (disposed) return { status: 'inactive', snapshot: null };
      const inputSignature = `${report.signature}|observed=${observedBreakpoint}`;
      if (inputSignature === lastInputSignature) {
        return { status: 'unchanged', snapshot: lastSnapshot };
      }
      sequence += 1;
      lastInputSignature = inputSignature;
      lastSnapshot = createShadowInspectorSnapshot({
        report,
        observedBreakpoint,
        sequence,
        source: { kind: 'real-shadow' },
        capturedAt: now().toISOString(),
        timings: { analysisMs },
      });
      channel.postMessage({
        protocolVersion: SHADOW_INSPECTOR_PROTOCOL_VERSION,
        type: 'snapshot',
        snapshot: lastSnapshot,
      });
      return { status: 'published', snapshot: lastSnapshot };
    },
    latest: () => lastSnapshot,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      channel.removeEventListener('message', handleMessage);
      channel.close();
      lastSnapshot = null;
    },
  };
}

export type ShadowInspectorClient = {
  readonly active: boolean;
  requestLatest: () => string | null;
  subscribe: (listener: (snapshot: ShadowInspectorSnapshot) => void) => () => void;
  latest: () => ShadowInspectorSnapshot | null;
  dispose: () => void;
};

export function createShadowInspectorClient(options: {
  readonly enabled: boolean;
  readonly createChannel?: ChannelFactory;
}): ShadowInspectorClient {
  const supported = Boolean(options.createChannel) || canCreateDefaultChannel();
  if (!options.enabled || !supported) {
    return {
      active: false,
      requestLatest: () => null,
      subscribe: () => () => undefined,
      latest: () => null,
      dispose: () => undefined,
    };
  }

  const channel = (options.createChannel ?? defaultChannelFactory)(SHADOW_INSPECTOR_CHANNEL_NAME);
  const listeners = new Set<(snapshot: ShadowInspectorSnapshot) => void>();
  let latestSnapshot: ShadowInspectorSnapshot | null = null;
  let lastInputSignature: string | null = null;
  let requestSequence = 0;
  let disposed = false;

  const handleMessage = (event: MessageEvent<unknown>) => {
    if (disposed || !isSnapshotMessage(event.data)) return;
    const snapshot = event.data.snapshot;
    const inputSignature = `${snapshot.report.signature}|observed=${snapshot.observedBreakpoint ?? 'none'}`;
    if (inputSignature === lastInputSignature) return;
    lastInputSignature = inputSignature;
    latestSnapshot = snapshot;
    for (const listener of listeners) listener(snapshot);
  };
  channel.addEventListener('message', handleMessage);

  return {
    active: true,
    requestLatest: () => {
      if (disposed) return null;
      requestSequence += 1;
      const requestId = `request-${requestSequence}`;
      channel.postMessage({
        protocolVersion: SHADOW_INSPECTOR_PROTOCOL_VERSION,
        type: 'request-latest',
        requestId,
      });
      return requestId;
    },
    subscribe: (listener) => {
      if (disposed) return () => undefined;
      listeners.add(listener);
      if (latestSnapshot) listener(latestSnapshot);
      return () => listeners.delete(listener);
    },
    latest: () => latestSnapshot,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      listeners.clear();
      channel.removeEventListener('message', handleMessage);
      channel.close();
      latestSnapshot = null;
    },
  };
}
