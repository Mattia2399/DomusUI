import { describe, expect, it, vi } from 'vitest';
import { createShadowInspectorFixtureSnapshot } from './shadowInspectorFixtures';
import {
  SHADOW_INSPECTOR_CHANNEL_NAME,
  createShadowInspectorClient,
  createShadowInspectorPublisher,
} from './shadowInspectorTransport';

type Listener = (event: MessageEvent<unknown>) => void;

function createChannelHub() {
  const endpoints = new Set<{ name: string; listeners: Set<Listener>; closed: boolean }>();
  const createChannel = (name: string) => {
    const endpoint = { name, listeners: new Set<Listener>(), closed: false };
    endpoints.add(endpoint);
    return {
      postMessage(message: unknown) {
        for (const peer of endpoints) {
          if (peer === endpoint || peer.closed || peer.name !== name) continue;
          for (const listener of peer.listeners) listener({ data: structuredClone(message) } as MessageEvent<unknown>);
        }
      },
      addEventListener(_type: 'message', listener: Listener) {
        endpoint.listeners.add(listener);
      },
      removeEventListener(_type: 'message', listener: Listener) {
        endpoint.listeners.delete(listener);
      },
      close() {
        endpoint.closed = true;
        endpoint.listeners.clear();
      },
    };
  };
  return { createChannel, endpoints };
}

describe('Shadow Inspector read-only transport', () => {
  it('does not create a channel when the feature is disabled', () => {
    const createChannel = vi.fn();
    const publisher = createShadowInspectorPublisher({ enabled: false, createChannel });
    const client = createShadowInspectorClient({ enabled: false, createChannel });

    expect(publisher.active).toBe(false);
    expect(client.active).toBe(false);
    expect(client.requestLatest()).toBeNull();
    expect(createChannel).not.toHaveBeenCalled();
  });

  it('publishes initial and updated geometry while deduplicating identical snapshots', () => {
    const hub = createChannelHub();
    const report = createShadowInspectorFixtureSnapshot('identical').report;
    const publisher = createShadowInspectorPublisher({
      enabled: true,
      createChannel: hub.createChannel,
      now: () => new Date('2026-10-13T12:00:00.000Z'),
    });

    const initial = publisher.publish({ report, observedBreakpoint: 'xl', analysisMs: 2 });
    const duplicate = publisher.publish({ report, observedBreakpoint: 'xl', analysisMs: 3 });
    const updated = publisher.publish({ report, observedBreakpoint: 'md', analysisMs: 2.5 });

    expect(initial.status).toBe('published');
    expect(initial.snapshot?.lifecycle).toBe('initial');
    expect(duplicate.status).toBe('unchanged');
    expect(duplicate.snapshot?.snapshotId).toBe(initial.snapshot?.snapshotId);
    expect(updated.status).toBe('published');
    expect(updated.snapshot).toMatchObject({ lifecycle: 'updated', sequence: 2, observedBreakpoint: 'md' });
  });

  it('serves the latest snapshot on demand between two tab-like channels', () => {
    const hub = createChannelHub();
    const report = createShadowInspectorFixtureSnapshot('collision').report;
    const publisher = createShadowInspectorPublisher({ enabled: true, createChannel: hub.createChannel });
    const client = createShadowInspectorClient({ enabled: true, createChannel: hub.createChannel });
    const received = vi.fn();
    client.subscribe(received);

    publisher.publish({ report, observedBreakpoint: 'xl', analysisMs: 4.2 });
    expect(received).toHaveBeenCalledTimes(1);
    received.mockClear();
    expect(client.requestLatest()).toBe('request-1');

    // The response contains the same geometry and is intentionally ignored.
    expect(received).not.toHaveBeenCalled();
    expect(client.latest()?.report.signature).toBe(report.signature);
    expect([...hub.endpoints].every((endpoint) => endpoint.name === SHADOW_INSPECTOR_CHANNEL_NAME)).toBe(true);
  });

  it('projects only diagnostic geometry and strips arbitrary future fields and issue messages', () => {
    const hub = createChannelHub();
    const original = createShadowInspectorFixtureSnapshot('collision').report;
    const report = {
      ...original,
      credentials: { token: 'secret-token' },
      breakpoints: {
        ...original.breakpoints,
        xl: {
          ...original.breakpoints.xl,
          issues: [{
            code: 'UNSUPPORTED_LAYOUT_ITEM' as const,
            scope: 'runtime' as const,
            message: 'secret-token raw_attributes latitude longitude',
          }],
        },
      },
    };
    const publisher = createShadowInspectorPublisher({ enabled: true, createChannel: hub.createChannel });
    const published = publisher.publish({ report, observedBreakpoint: 'xl', analysisMs: 1 });
    const serialized = JSON.stringify(published.snapshot);

    expect(serialized).not.toContain('secret-token');
    expect(serialized).not.toContain('raw_attributes');
    expect(serialized).not.toContain('latitude');
    expect(serialized).not.toContain('credentials');
  });

  it('closes both endpoints and removes their listeners on disposal', () => {
    const hub = createChannelHub();
    const publisher = createShadowInspectorPublisher({ enabled: true, createChannel: hub.createChannel });
    const client = createShadowInspectorClient({ enabled: true, createChannel: hub.createChannel });
    publisher.dispose();
    client.dispose();

    expect([...hub.endpoints].every((endpoint) => endpoint.closed && endpoint.listeners.size === 0)).toBe(true);
  });
});
