import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelKind } from './registry';

vi.unmock('./panelPreload');

const load = vi.fn((_kind: PanelKind) => Promise.resolve({}));
vi.mock('./registry', () => ({ loadPanelEntry: (kind: PanelKind) => load(kind) }));

type Watcher = { callback: IntersectionObserverCallback; targets: Set<Element> };
let watcher: Watcher;

function showCards() {
  const entries = [...watcher.targets].map((target) => ({ target, isIntersecting: true }) as unknown as IntersectionObserverEntry);
  watcher.callback(entries, {} as IntersectionObserver);
}

/** Every test starts with nothing asked: the module remembers what it has fetched. */
async function card(kind: PanelKind | null) {
  const { usePanelPreload } = await import('./panelPreload');
  function Card() {
    return <div data-testid="card" {...usePanelPreload(kind)} />;
  }
  return render(<Card />);
}

beforeEach(() => {
  vi.resetModules();
  load.mockClear();
  load.mockImplementation(() => Promise.resolve({}));
  watcher = { callback: () => undefined, targets: new Set() };
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        watcher.callback = callback;
      }
      observe(target: Element) {
        watcher.targets.add(target);
      }
      unobserve(target: Element) {
        watcher.targets.delete(target);
      }
    },
  );
  // Idle never comes unless a test says so.
  vi.stubGlobal('requestIdleCallback', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the code of a panel, before the tap', () => {
  it('is fetched when the card enters the screen, and once', async () => {
    await card('light');
    expect(load).not.toHaveBeenCalled();
    showCards();
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith('light');
    expect(watcher.targets.size).toBe(0);
  });

  it('is fetched when a finger or a mouse reaches the card', async () => {
    const { getByTestId } = await card('plug');
    fireEvent.pointerEnter(getByTestId('card'));
    expect(load).toHaveBeenCalledWith('plug');
    fireEvent.pointerDown(getByTestId('card'));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('is fetched for every kind on the page when the browser is free', async () => {
    await card('light');
    await card('plug');
    await card('light');
    const idle = vi.mocked(window.requestIdleCallback);
    expect(idle).toHaveBeenCalledTimes(1);
    idle.mock.calls[0][0]({} as IdleDeadline);
    expect(load.mock.calls.map(([kind]) => kind)).toEqual(['light', 'plug']);
  });

  it('is asked again after a fetch that failed', async () => {
    load.mockImplementationOnce(() => Promise.reject(new Error('offline')));
    const { getByTestId } = await card('light');
    fireEvent.pointerDown(getByTestId('card'));
    await Promise.resolve();
    await Promise.resolve();
    fireEvent.pointerDown(getByTestId('card'));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('is not asked by a card that opens no panel', async () => {
    const { getByTestId } = await card(null);
    fireEvent.pointerDown(getByTestId('card'));
    expect(load).not.toHaveBeenCalled();
    expect(window.requestIdleCallback).not.toHaveBeenCalled();
  });
});
