import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createScreenWakeLock,
  enterFullscreen,
  isStandaloneDisplay,
  leaveFullscreen,
  supportsFullscreen,
  supportsWakeLock,
} from './kioskDisplay';

/** A document whose full screen behaves as the browser says. */
function fakeDocument({ enabled = true, refuse = false } = {}) {
  const doc = Object.assign(new EventTarget(), {
    fullscreenEnabled: enabled,
    fullscreenElement: null as Element | null,
    visibilityState: 'visible' as DocumentVisibilityState,
    documentElement: {} as HTMLElement,
    exitFullscreen: vi.fn(async () => {
      doc.fullscreenElement = null;
      doc.dispatchEvent(new Event('fullscreenchange'));
    }),
  });
  doc.documentElement.requestFullscreen = vi.fn(async () => {
    if (refuse) throw new TypeError('Permissions check failed');
    doc.fullscreenElement = doc.documentElement;
    doc.dispatchEvent(new Event('fullscreenchange'));
  });
  return doc;
}

/** A wake lock API that grants, refuses, or lets go when told. */
function fakeWakeLock({ refuse = false } = {}) {
  const sentinels: { released: boolean; release: () => Promise<void>; fire: () => void }[] = [];
  const request = vi.fn(async () => {
    if (refuse) throw new DOMException('Not allowed', 'NotAllowedError');
    const target = new EventTarget();
    const sentinel = {
      released: false,
      release: vi.fn(async () => {
        sentinel.released = true;
        target.dispatchEvent(new Event('release'));
      }),
      addEventListener: (type: string, listener: () => void) => target.addEventListener(type, listener),
      fire: () => {
        sentinel.released = true;
        target.dispatchEvent(new Event('release'));
      },
    };
    sentinels.push(sentinel);
    return sentinel;
  });
  return { nav: { wakeLock: { request } }, request, sentinels };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => vi.restoreAllMocks());

describe('full screen', () => {
  it('is detected from the document, never from the user agent', () => {
    expect(supportsFullscreen(fakeDocument() as unknown as Document)).toBe(true);
    expect(supportsFullscreen(fakeDocument({ enabled: false }) as unknown as Document)).toBe(false);
    expect(supportsFullscreen({ fullscreenEnabled: true, documentElement: {} } as unknown as Document)).toBe(false);
  });

  it('is asked for the whole Domus document', async () => {
    const doc = fakeDocument();
    await expect(enterFullscreen(doc as unknown as Document)).resolves.toBe('active');
    expect(doc.documentElement.requestFullscreen).toHaveBeenCalledWith({ navigationUI: 'hide' });
    expect(doc.fullscreenElement).toBe(doc.documentElement);
  });

  it('reports a refusal or a missing API instead of failing', async () => {
    await expect(enterFullscreen(fakeDocument({ refuse: true }) as unknown as Document)).resolves.toBe('rejected');
    await expect(enterFullscreen(fakeDocument({ enabled: false }) as unknown as Document)).resolves.toBe('unsupported');
  });

  it('leaves full screen only when it is on', async () => {
    const doc = fakeDocument();
    await leaveFullscreen(doc as unknown as Document);
    expect(doc.exitFullscreen).not.toHaveBeenCalled();
    await enterFullscreen(doc as unknown as Document);
    await leaveFullscreen(doc as unknown as Document);
    expect(doc.exitFullscreen).toHaveBeenCalledTimes(1);
  });

  it('knows an installed app already has the whole screen', () => {
    const media = (standalone: boolean) => ({
      matchMedia: (query: string) => ({ matches: standalone && query.includes('standalone') }) as MediaQueryList,
    });
    expect(isStandaloneDisplay(media(true))).toBe(true);
    expect(isStandaloneDisplay(media(false))).toBe(false);
  });
});

describe('screen wake lock', () => {
  it('is detected from the navigator only', () => {
    expect(supportsWakeLock(fakeWakeLock().nav)).toBe(true);
    expect(supportsWakeLock({})).toBe(false);
  });

  it('keeps the screen on while wanted and lets it go when stopped', async () => {
    const api = fakeWakeLock();
    const doc = fakeDocument();
    const statuses: string[] = [];
    const lock = createScreenWakeLock({ nav: api.nav, doc, onStatus: (status) => statuses.push(status) });

    lock.start();
    await flush();
    expect(api.request).toHaveBeenCalledWith('screen');
    expect(statuses).toEqual(['active']);

    lock.stop();
    await flush();
    expect(api.sentinels[0].released).toBe(true);
    expect(statuses.at(-1)).toBe('inactive');
  });

  it('says so when the browser has no wake lock, and Kiosk goes on', async () => {
    const statuses: string[] = [];
    const lock = createScreenWakeLock({ nav: {}, doc: fakeDocument(), onStatus: (status) => statuses.push(status) });
    lock.start();
    await flush();
    lock.stop();
    expect(statuses).toEqual(['unsupported', 'unsupported']);
  });

  it('reports a refusal and does not insist', async () => {
    const api = fakeWakeLock({ refuse: true });
    const statuses: string[] = [];
    const lock = createScreenWakeLock({ nav: api.nav, doc: fakeDocument(), onStatus: (status) => statuses.push(status) });

    lock.start();
    await flush();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(statuses).toEqual(['error']);
    expect(api.request).toHaveBeenCalledTimes(1);
  });

  it('asks again once the page is visible after the browser let go', async () => {
    const api = fakeWakeLock();
    const doc = fakeDocument();
    const statuses: string[] = [];
    const lock = createScreenWakeLock({ nav: api.nav, doc, onStatus: (status) => statuses.push(status) });
    lock.start();
    await flush();

    // Hidden: the browser releases it.
    doc.visibilityState = 'hidden';
    api.sentinels[0].fire();
    doc.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(statuses).toEqual(['active', 'released']);
    expect(api.request).toHaveBeenCalledTimes(1);

    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(api.request).toHaveBeenCalledTimes(2);
    expect(statuses.at(-1)).toBe('active');

    // Visible again while it holds: no second request.
    doc.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(api.request).toHaveBeenCalledTimes(2);
    lock.stop();
  });

  it('stops listening once stopped', async () => {
    const api = fakeWakeLock();
    const doc = fakeDocument();
    const lock = createScreenWakeLock({ nav: api.nav, doc, onStatus: () => undefined });
    lock.start();
    await flush();
    lock.stop();

    doc.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(api.request).toHaveBeenCalledTimes(1);
  });
});
