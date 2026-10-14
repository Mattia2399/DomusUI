import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createShadowInspectorFixtureSnapshot } from './shadowInspectorFixtures';
import { createShadowInspectorSnapshot, type ShadowInspectorSnapshot } from './shadowInspectorSnapshot';
import type { ShadowInspectorClient } from './shadowInspectorTransport';
import { ShadowInspector } from './ShadowInspector';

afterEach(cleanup);

function createClientHarness() {
  const listeners = new Set<(snapshot: ShadowInspectorSnapshot) => void>();
  let current: ShadowInspectorSnapshot | null = null;
  const client: ShadowInspectorClient = {
    active: true,
    requestLatest: vi.fn(() => 'request-test'),
    subscribe: vi.fn((listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    latest: () => current,
    dispose: vi.fn(),
  };
  return {
    client,
    factory: () => client,
    emit(snapshot: ShadowInspectorSnapshot) {
      current = snapshot;
      for (const listener of listeners) listener(snapshot);
    },
  };
}

describe('ShadowInspector', () => {
  it('is completely inactive when the Shadow feature flag is disabled', () => {
    const factory = vi.fn();
    render(<ShadowInspector enabled={false} clientFactory={factory} />);

    expect(screen.getByTestId('inspector-disabled').textContent).toContain('disabilitato');
    expect(factory).not.toHaveBeenCalled();
  });

  it('shows the fixture source, six breakpoints, coordinates, and highlighted differences', () => {
    const harness = createClientHarness();
    render(<ShadowInspector enabled clientFactory={harness.factory} />);

    expect(screen.getByTestId('inspector-source').textContent).toContain('Collisione controllata');
    expect(screen.getAllByRole('button', { name: /Inspector breakpoint/ })).toHaveLength(6);
    expect(screen.getByTestId('inspector-breakpoint').textContent).toContain('xl');
    expect(screen.getByTestId('inspector-cols').textContent).toContain('12');
    expect(screen.getAllByText(/OVERLAP/).length).toBeGreaterThan(0);
    expect(document.querySelectorAll('[data-inspector-card="legacy"]').length).toBe(4);
    expect(document.querySelectorAll('[data-inspector-card="solver"]').length).toBe(4);
  });

  it('switches breakpoints and reports no false differences for identical geometry', () => {
    const harness = createClientHarness();
    render(<ShadowInspector enabled clientFactory={harness.factory} />);

    fireEvent.click(screen.getByRole('button', { name: 'Geometrie identiche' }));
    fireEvent.click(screen.getByRole('button', { name: 'Inspector breakpoint xs' }));

    expect(screen.getByTestId('inspector-breakpoint').textContent).toContain('xs');
    expect(screen.getByTestId('inspector-cols').textContent).toContain('2');
    expect(screen.getByTestId('inspector-no-differences')).toBeDefined();
  });

  it('shows synthetic Stacks as insufficient data and renders the 30-element fixture', () => {
    const harness = createClientHarness();
    render(<ShadowInspector enabled clientFactory={harness.factory} />);

    fireEvent.click(screen.getByRole('button', { name: 'Stack sintetici' }));
    expect(screen.getByTestId('inspector-stack-list').textContent).toContain('INSUFFICIENT_DATA');
    expect(screen.getByTestId('inspector-stack-list').textContent).toContain('stack-vertical');

    fireEvent.click(screen.getByRole('button', { name: 'Densità 30 elementi' }));
    expect(document.querySelectorAll('[data-inspector-card="legacy"]')).toHaveLength(30);
    expect(document.querySelectorAll('[data-inspector-card="solver"]')).toHaveLength(30);
  });

  it('explains when no real Home snapshot is available and can request it again', () => {
    const harness = createClientHarness();
    render(<ShadowInspector enabled clientFactory={harness.factory} />);
    fireEvent.click(screen.getByRole('button', { name: 'Real Shadow' }));

    expect(screen.getByTestId('inspector-real-empty').textContent).toContain('Nessuno snapshot reale');
    fireEvent.click(screen.getByRole('button', { name: /Richiedi snapshot reale/ }));
    expect(harness.client.requestLatest).toHaveBeenCalled();
  });

  it('accepts an updated real snapshot without exposing a definitive HA state', () => {
    const harness = createClientHarness();
    render(<ShadowInspector enabled clientFactory={harness.factory} />);
    const fixture = createShadowInspectorFixtureSnapshot('identical');
    const real = createShadowInspectorSnapshot({
      report: fixture.report,
      sequence: 2,
      observedBreakpoint: 'md',
      source: { kind: 'real-shadow' },
      capturedAt: '2026-10-13T12:00:00.000Z',
      timings: { analysisMs: 4.5 },
    });

    act(() => harness.emit(real));
    fireEvent.click(screen.getByRole('button', { name: 'Real Shadow' }));

    expect(screen.getByTestId('inspector-source').textContent).toBe('Real Shadow');
    expect(screen.getByTestId('shadow-inspector').getAttribute('data-snapshot-lifecycle')).toBe('updated');
    expect(screen.getByText(/completamento HA non confermabile/)).toBeDefined();
    expect(screen.getByTestId('inspector-connection').textContent).toBe('connected');
  });
});
