import { describe, expect, it } from 'vitest';
import { DOMUS_CLIENT_ID_STORAGE_KEY, getOrCreateDomusClientId } from './domusClientId';

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

describe('domus client id', () => {
  it('creates a random reference once and keeps it', () => {
    const storage = memoryStorage();
    const first = getOrCreateDomusClientId(storage);

    expect(first).toMatch(/^[a-f0-9]{32}$/);
    expect(storage.values.get(DOMUS_CLIENT_ID_STORAGE_KEY)).toBe(first);
    expect(getOrCreateDomusClientId(storage)).toBe(first);
  });

  it('gives every browser its own reference', () => {
    expect(getOrCreateDomusClientId(memoryStorage())).not.toBe(getOrCreateDomusClientId(memoryStorage()));
  });

  it('replaces a malformed stored value rather than sending it', () => {
    const storage = memoryStorage({ [DOMUS_CLIENT_ID_STORAGE_KEY]: 'bad id!' });
    const id = getOrCreateDomusClientId(storage);

    expect(id).toMatch(/^[a-f0-9]{32}$/);
    expect(storage.values.get(DOMUS_CLIENT_ID_STORAGE_KEY)).toBe(id);
  });

  it('has no reference when the browser keeps nothing', () => {
    expect(getOrCreateDomusClientId(null)).toBeNull();
    expect(
      getOrCreateDomusClientId({
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => undefined,
      }),
    ).toBeNull();
  });

  it('carries nothing about the device', () => {
    const id = getOrCreateDomusClientId(memoryStorage())!;
    expect(id).not.toContain(navigator.userAgent.slice(0, 8));
    expect(id).not.toMatch(/mozilla|chrome|safari|windows|android|linux/i);
  });
});
