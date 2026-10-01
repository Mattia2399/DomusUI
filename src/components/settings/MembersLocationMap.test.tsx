// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';
import { MembersLocationMap } from './MembersLocationMap';

type MapListener = (event: unknown) => void;

const mapRuntime = vi.hoisted(() => {
  class FakeMap {
    listeners = new globalThis.Map<string, Set<MapListener>>();
    resizeCalls = 0;

    constructor(options: { container: HTMLElement }) {
      options.container.classList.add('maplibregl-map');
      mapRuntime.instances.push(this);
    }

    on(type: string, listener: MapListener) {
      const listeners = this.listeners.get(type) ?? new Set<MapListener>();
      listeners.add(listener);
      this.listeners.set(type, listeners);
      return this;
    }

    emit(type: string, event: unknown = {}) {
      this.listeners.get(type)?.forEach((listener) => listener(event));
    }

    resize() {
      this.resizeCalls += 1;
    }

    getZoom() {
      return 12;
    }

    flyTo() {}
    remove() {}
  }

  class FakeMarker {
    setLngLat() {
      return this;
    }

    addTo() {
      return this;
    }

    remove() {}
  }

  return {
    FakeMap,
    FakeMarker,
    instances: [] as FakeMap[],
  };
});

vi.mock('./maplibreRuntime', () => ({
  default: {
    Map: mapRuntime.FakeMap,
    Marker: mapRuntime.FakeMarker,
  },
}));

function renderMap() {
  return render(
    <I18nProvider>
      <div className="relative h-56 w-80">
        <MembersLocationMap points={[]} theme="light" />
      </div>
    </I18nProvider>,
  );
}

describe('MembersLocationMap readiness', () => {
  beforeEach(() => {
    mapRuntime.instances.length = 0;
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it');
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it('becomes usable after style.load and the first render without waiting for load or idle', async () => {
    renderMap();
    await waitFor(() => expect(mapRuntime.instances).toHaveLength(1));

    const map = mapRuntime.instances[0];
    act(() => map.emit('render'));
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();

    act(() => map.emit('style.load'));
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();

    act(() => {
      map.emit('render');
    });

    expect(screen.queryByText('Apertura sezione…')).toBeNull();
    expect(map.resizeCalls).toBeGreaterThan(0);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('keeps a usable map visible during recoverable resource errors and clears the warning on idle', async () => {
    renderMap();
    await waitFor(() => expect(mapRuntime.instances).toHaveLength(1));

    const map = mapRuntime.instances[0];
    act(() => {
      map.emit('error', { error: new Error('Vector tile unavailable') });
      map.emit('style.load');
      map.emit('render');
    });

    expect(screen.queryByText('Apertura sezione…')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Sfondo cartografico parzialmente disponibile');

    act(() => map.emit('idle'));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
