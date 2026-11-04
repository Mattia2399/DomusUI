import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onceLoaded } from './onceLoaded';

afterEach(cleanup);

const Part = () => <p>Arrivato</p>;

describe('a loader that remembers what has arrived', () => {
  it('does not suspend a first render when the code is already here', async () => {
    const load = onceLoaded(() => Promise.resolve({ default: Part }));
    await load();
    const Lazy = React.lazy(load);
    render(
      <React.Suspense fallback={<p>In attesa</p>}>
        <Lazy />
      </React.Suspense>,
    );
    expect(screen.getByText('Arrivato')).toBeTruthy();
    expect(screen.queryByText('In attesa')).toBeNull();
  });

  it('stays at once through a then, as the pages pick what they need', async () => {
    const load = onceLoaded(() => Promise.resolve({ Part }));
    await load();
    const Lazy = React.lazy(() => load().then((module) => ({ default: module.Part })));
    render(
      <React.Suspense fallback={<p>In attesa</p>}>
        <Lazy />
      </React.Suspense>,
    );
    expect(screen.getByText('Arrivato')).toBeTruthy();
  });

  it('suspends while the code is on its way, and fetches it once', async () => {
    const fetch = vi.fn(() => Promise.resolve({ default: Part }));
    const load = onceLoaded(fetch);
    const Lazy = React.lazy(load);
    render(
      <React.Suspense fallback={<p>In attesa</p>}>
        <Lazy />
      </React.Suspense>,
    );
    expect(screen.getByText('In attesa')).toBeTruthy();
    expect(await screen.findByText('Arrivato')).toBeTruthy();
    await load();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('tries again after a fetch that failed', async () => {
    const fetch = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new Error('offline')).mockResolvedValue('ok');
    const load = onceLoaded(fetch);
    await expect(load()).rejects.toThrow('offline');
    await expect(load()).resolves.toBe('ok');
  });
});
