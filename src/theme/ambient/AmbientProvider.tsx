import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { BASE_AMBIENT, type AmbientRequest, type ResolvedAmbient } from './ambientModel';

type AmbientRegistry = {
  mount: () => number;
  update: (id: number, request: AmbientRequest | null) => void;
  unmount: (id: number) => void;
  resolveAssetUrl: (value: string) => string | undefined;
};

type AmbientState = { enabled: boolean; ambient: ResolvedAmbient };

// Two contexts: pages only register (stable, never re-rendered by a colour
// change); the background alone reads the colours.
const RegistryContext = createContext<AmbientRegistry | null>(null);
const StateContext = createContext<AmbientState>({ enabled: false, ambient: BASE_AMBIENT });

const identity = (value: string) => value;

type AmbientProviderProps = {
  /** Only the Dynamic background shows the glows; otherwise requests are kept but nothing is drawn. */
  enabled: boolean;
  /** Turns a Home Assistant path (an area picture) into a URL the browser can load. */
  resolveAssetUrl?: (value: string) => string | undefined;
  children: React.ReactNode;
};

export function AmbientProvider({ enabled, resolveAssetUrl = identity, children }: AmbientProviderProps) {
  // Mount order decides: the page mounted last wins; when it leaves, the previous one or the base returns.
  const [requests, setRequests] = useState<ReadonlyMap<number, AmbientRequest | null>>(() => new Map());
  const nextId = useRef(0);
  const resolveRef = useRef(resolveAssetUrl);
  resolveRef.current = resolveAssetUrl;

  const update = useCallback((id: number, request: AmbientRequest | null) => {
    setRequests((current) => {
      if (!current.has(id) || current.get(id) === request) return current;
      return new Map(current).set(id, request);
    });
  }, []);

  const registry = useMemo<AmbientRegistry>(
    () => ({
      mount: () => {
        nextId.current += 1;
        const id = nextId.current;
        setRequests((current) => new Map(current).set(id, null));
        return id;
      },
      update,
      unmount: (id) =>
        setRequests((current) => {
          if (!current.has(id)) return current;
          const next = new Map(current);
          next.delete(id);
          return next;
        }),
      resolveAssetUrl: (value) => resolveRef.current(value),
    }),
    [update],
  );

  const ambient = useMemo<ResolvedAmbient>(() => {
    let winner: AmbientRequest | null = null;
    for (const request of requests.values()) if (request) winner = request;
    return winner
      ? { a: winner.a, b: winner.b, intensity: winner.intensity ?? 'base', pulse: winner.pulse === true }
      : BASE_AMBIENT;
  }, [requests]);

  const state = useMemo(() => ({ enabled, ambient }), [enabled, ambient]);

  return (
    <RegistryContext.Provider value={registry}>
      <StateContext.Provider value={state}>{children}</StateContext.Provider>
    </RegistryContext.Provider>
  );
}

/** A page asks for its glows while it is mounted; null asks for the base colours. Outside a provider, nothing happens. */
export function useAmbient(request: AmbientRequest | null) {
  const registry = useContext(RegistryContext);
  const idRef = useRef<number | null>(null);
  const key = request ? `${request.a}|${request.b}|${request.intensity ?? 'base'}|${request.pulse === true}` : '';

  useEffect(() => {
    if (!registry) return undefined;
    const id = registry.mount();
    idRef.current = id;
    return () => {
      idRef.current = null;
      registry.unmount(id);
    };
  }, [registry]);

  useEffect(() => {
    if (registry && idRef.current !== null) registry.update(idRef.current, request);
    // The key carries every field of the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registry, key]);
}

/** How a page loads a Home Assistant asset for the glows (the provider knows the instance). */
export function useAmbientAssetUrl() {
  const registry = useContext(RegistryContext);
  return registry ? registry.resolveAssetUrl : identity;
}

/** The two glows, inside the background layer; nothing unless the Dynamic background is on. */
export function AmbientBackground() {
  const { enabled, ambient } = useContext(StateContext);
  if (!enabled) return null;
  return (
    <div className="ambient-background" data-pulse={ambient.pulse ? 'true' : undefined} data-testid="ambient-background">
      <div
        className="ambient-glow"
        data-intensity={ambient.intensity}
        style={{ '--ambient-a': ambient.a, '--ambient-b': ambient.b } as React.CSSProperties}
      />
    </div>
  );
}
