import { afterEach, describe, expect, it, vi } from 'vitest';
import { discoverHomeAssistant, probeHomeAssistant } from './haReachability';
import { readRecentSetupUrls, rememberSetupUrl, RECENT_SETUP_URLS_STORAGE_KEY } from './setupAddresses';

afterEach(() => vi.useRealTimers());

const answers = (reachable: string[]) =>
  vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (reachable.some((origin) => url.startsWith(origin))) return new Response(null, { status: 200 });
    throw new TypeError('Failed to fetch');
  });

describe('whether Home Assistant answers', () => {
  it('asks the static manifest without credentials or reading the answer', async () => {
    const fetchImpl = answers(['http://homeassistant.local:8123']);
    await expect(probeHomeAssistant('http://homeassistant.local:8123/lovelace', { fetchImpl, pageProtocol: 'http:' })).resolves.toBe('reachable');
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://homeassistant.local:8123/manifest.json',
      expect.objectContaining({ mode: 'no-cors', credentials: 'omit', cache: 'no-store' }),
    );
  });

  it('says unreachable on a network error and on a timeout', async () => {
    await expect(probeHomeAssistant('http://wrong.local:8123', { fetchImpl: answers([]), pageProtocol: 'http:' })).resolves.toBe('unreachable');
    const hanging = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
    );
    await expect(probeHomeAssistant('http://slow.local:8123', { fetchImpl: hanging, pageProtocol: 'http:', timeoutMs: 20 })).resolves.toBe('unreachable');
  });

  it('cannot tell when the page itself forbids the request', async () => {
    expect(await probeHomeAssistant('http://homeassistant.local:8123', { fetchImpl: answers([]), pageProtocol: 'https:' })).toBe('unknown');
    const target = new EventTarget();
    const fetchImpl = vi.fn(async () => {
      const event = Object.assign(new Event('securitypolicyviolation'), { blockedURI: 'https://ha.example.test/manifest.json' });
      target.dispatchEvent(event);
      throw new TypeError('Refused by CSP');
    });
    expect(await probeHomeAssistant('https://ha.example.test', { fetchImpl, pageProtocol: 'https:', target })).toBe('unknown');
  });

  it('refuses what is not an address', async () => {
    expect(await probeHomeAssistant('not an address', { fetchImpl: answers([]) })).toBe('unreachable');
  });

  it('finds the first candidate that answers, in order, and invents none', async () => {
    const fetchImpl = answers(['http://192.168.1.10:8123', 'https://casa.ui.nabu.casa']);
    const options = { fetchImpl, pageProtocol: 'http:' };
    expect(await discoverHomeAssistant(['http://homeassistant.local:8123', 'https://casa.ui.nabu.casa', 'http://192.168.1.10:8123'], options)).toBe('https://casa.ui.nabu.casa');
    expect(await discoverHomeAssistant(['http://homeassistant.local:8123'], options)).toBeNull();
  });
});

describe('recent setup addresses', () => {
  it('keeps the last three valid addresses, newest first, without repeats', () => {
    const storage = window.localStorage;
    storage.clear();
    ['http://a.local:8123', 'https://b.example.test', 'http://a.local:8123/', 'https://c.example.test', 'https://d.example.test'].forEach((url) => rememberSetupUrl(url, storage));
    expect(readRecentSetupUrls(storage)).toEqual(['https://d.example.test', 'https://c.example.test', 'http://a.local:8123']);
    rememberSetupUrl('http://public.example.test', storage);
    expect(readRecentSetupUrls(storage)).toHaveLength(3);
    storage.setItem(RECENT_SETUP_URLS_STORAGE_KEY, '{"not":"a list"}');
    expect(readRecentSetupUrls(storage)).toEqual([]);
  });
});
