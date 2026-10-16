/**
 * A stable, random reference for this browser, for settings that belong to
 * this device (its power policy). It is chosen once and kept here.
 *
 * It is not an identity and never a permission: Home Assistant decides who
 * may do what. It carries nothing about the device (no user agent, address,
 * name or fingerprint), and losing it never loses a policy: an administrator
 * links the policy to the device again.
 */
export const DOMUS_CLIENT_ID_STORAGE_KEY = 'domusui.client_id.v1';

const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

type ClientIdStorage = Pick<Storage, 'getItem' | 'setItem'>;

function randomClientId(): string {
  // getRandomValues also works over plain HTTP on a local network, unlike randomUUID.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The reference of this browser, created on first use; null when storage is unavailable. */
export function getOrCreateDomusClientId(storage: ClientIdStorage | null = safeLocalStorage()): string | null {
  if (!storage) return null;
  try {
    const stored = storage.getItem(DOMUS_CLIENT_ID_STORAGE_KEY);
    if (stored && CLIENT_ID_PATTERN.test(stored)) return stored;
    const created = randomClientId();
    storage.setItem(DOMUS_CLIENT_ID_STORAGE_KEY, created);
    return created;
  } catch {
    return null;
  }
}

function safeLocalStorage(): ClientIdStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}
