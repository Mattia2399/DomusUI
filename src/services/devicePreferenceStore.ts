import { useSyncExternalStore } from 'react';

/**
 * One preference of this device (Settings › This device), kept in this
 * browser under its own versioned key. Every reader shares one copy: a save
 * applies at once on the page, and another tab's change arrives through the
 * `storage` event. Anything unreadable gives the defaults.
 */
type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

export type DevicePreferenceStore<T> = {
  read: (storage?: PreferenceStorage | null) => T;
  /** Saves and applies; false when this browser keeps nothing (it still applies for this visit). */
  save: (next: T, storage?: PreferenceStorage | null) => boolean;
  use: () => T;
  /** The current value, outside React. */
  get: () => T;
  subscribe: (listener: () => void) => () => void;
  /** Forget the shared copy (tests). */
  reset: () => void;
};

function browserStorage(): PreferenceStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function createDevicePreferenceStore<T>({
  key,
  defaults,
  parse,
  serialize,
}: {
  key: string;
  defaults: T;
  /** Turns any stored value into a valid one, falling back to `defaults`. */
  parse: (value: unknown) => T;
  serialize: (value: T) => string;
}): DevicePreferenceStore<T> {
  let current: T | null = null;
  const listeners = new Set<() => void>();

  const read = (storage: PreferenceStorage | null = browserStorage()): T => {
    try {
      const raw = storage?.getItem(key);
      return raw ? parse(JSON.parse(raw)) : defaults;
    } catch {
      return defaults;
    }
  };

  const publish = (next: T) => {
    current = next;
    listeners.forEach((listener) => listener());
  };

  const get = () => {
    if (current === null) current = read();
    return current;
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key === key || event.key === null) publish(read());
  };

  const subscribe = (listener: () => void) => {
    if (listeners.size === 0) {
      // Nobody was listening: another tab may have changed it meanwhile.
      current = read();
      if (typeof window !== 'undefined') window.addEventListener('storage', handleStorage);
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0 && typeof window !== 'undefined') window.removeEventListener('storage', handleStorage);
    };
  };

  const save = (next: T, storage: PreferenceStorage | null = browserStorage()) => {
    const serialized = serialize(next);
    const normalized = parse(JSON.parse(serialized));
    let saved = false;
    try {
      storage?.setItem(key, serialized);
      saved = Boolean(storage);
    } catch {
      saved = false;
    }
    publish(normalized);
    return saved;
  };

  return {
    read,
    save,
    get,
    subscribe,
    use: () => useSyncExternalStore(subscribe, get, () => defaults),
    reset: () => {
      current = null;
    },
  };
}
