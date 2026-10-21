import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEMO_ACCESS,
  LOADING_ACCESS,
  accessSnapshot,
  parseAccessSelf,
  snapshotForProfile,
  toAccessProfileError,
  type AccessSnapshot,
} from '../security/accessControl';
import type { HaAuthUser } from '../services/haIdentityPresentation';

type AccessCallApi = (
  message: Record<string, unknown>,
  options?: { reportError?: boolean; throwOnError?: boolean },
) => Promise<unknown>;

type AccessProfileOptions = {
  runtimeMode: 'real' | 'demo';
  /**
   * The account Home Assistant authenticated, as `useHaIdentityRevalidation`
   * returns it: the same object while nothing changes, null while
   * disconnected, a new object for another account or a new connection.
   */
  identity: HaAuthUser | null;
  callApi: AccessCallApi;
};

type Loaded = { identity: HaAuthUser; snapshot: AccessSnapshot };

/**
 * The Domus access profile of the current account, read once per account and
 * connection with `domusos/access/get_self`.
 *
 * The profile belongs to the identity object it was read for: when the
 * identity changes (another account, a reconnection, an administrator flag
 * changed in Home Assistant) the old profile stops counting in that same
 * render, and the new one is asked. Nothing is polled and nothing is stored.
 */
export function useAccessProfile({ runtimeMode, identity, callApi }: AccessProfileOptions) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);
  const callApiRef = useRef(callApi);
  callApiRef.current = callApi;

  useEffect(() => {
    if (runtimeMode !== 'real' || !identity) return undefined;
    let cancelled = false;
    const settle = (snapshot: AccessSnapshot) => {
      if (!cancelled) setLoaded({ identity, snapshot });
    };
    // The command takes nothing but its type: the backend reads the account from the connection.
    callApiRef
      .current({ type: 'domusos/access/get_self' }, { reportError: false, throwOnError: true })
      .then((value) => settle(snapshotForProfile(parseAccessSelf(value, identity.id))))
      .catch((error: unknown) => {
        const failure = toAccessProfileError(error);
        settle(accessSnapshot(failure.kind === 'unavailable' ? 'unavailable' : 'error'));
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, identity, runtimeMode]);

  /** Ask again for the same account; the current profile stays until the new one replaces it. */
  const refresh = useCallback(() => setAttempt((value) => value + 1), []);

  if (runtimeMode === 'demo') return { access: DEMO_ACCESS, refresh };
  const access = identity && loaded?.identity === identity ? loaded.snapshot : LOADING_ACCESS;
  return { access, refresh };
}

export default useAccessProfile;
