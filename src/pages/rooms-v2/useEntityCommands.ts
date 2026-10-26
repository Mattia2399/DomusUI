import React from 'react';
import type { MockEntityState } from '../../types/ha';

/*
 * Commands of the Rooms page for any kind of device. A command shows at once
 * (optimistic) and reaches Home Assistant through the page's service call;
 * sliders send at most one call per short pause. In the demo the result
 * simply stays.
 */

const OPTIMISTIC_TTL_MS = 5000;
const SLIDER_DEBOUNCE_MS = 150;

export type CallService = (domain: string, service: string, serviceData: Record<string, unknown>) => Promise<boolean>;
export type ServiceCall = { domain: string; service: string; data: Record<string, unknown> };

export type EntityAdapter<M, A> = {
  toModel: (entityId: string, entity: MockEntityState | undefined) => M;
  isAvailable: (model: M) => boolean;
  apply: (model: M, action: A) => M;
  call: (model: M, action: A) => ServiceCall;
  confirmed: (live: M, wanted: M) => boolean;
  /** Actions coming from a slider, paced before they are sent. */
  isSlider: (action: A) => boolean;
};

type Override<M> = { model: M; expiresAt: number };

export function useEntityCommands<M, A>({
  demo,
  states,
  onCallService,
  adapter,
}: {
  demo: boolean;
  states: Record<string, MockEntityState | undefined>;
  onCallService?: CallService;
  adapter: EntityAdapter<M, A>;
}) {
  const [overrides, setOverrides] = React.useState<Record<string, Override<M>>>({});
  const timers = React.useRef(new Map<string, number>());

  React.useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => window.clearTimeout(timer));
  }, []);

  // Live states replace the optimistic ones once they agree, or after a while.
  React.useEffect(() => {
    if (demo) return undefined;
    const entries = Object.entries(overrides);
    if (entries.length === 0) return undefined;
    const sweep = () => {
      const now = Date.now();
      setOverrides((current) => {
        let changed = false;
        const next = { ...current };
        Object.entries(current).forEach(([entityId, override]) => {
          if (override.expiresAt <= now || adapter.confirmed(adapter.toModel(entityId, states[entityId]), override.model)) {
            delete next[entityId];
            changed = true;
          }
        });
        return changed ? next : current;
      });
    };
    sweep();
    const soonest = Math.min(...entries.map(([, override]) => override.expiresAt));
    const timer = window.setTimeout(sweep, Math.max(250, soonest - Date.now()));
    return () => window.clearTimeout(timer);
  }, [adapter, demo, overrides, states]);

  const modelOf = React.useCallback(
    (entityId: string) => overrides[entityId]?.model ?? adapter.toModel(entityId, states[entityId]),
    [adapter, overrides, states],
  );

  const send = React.useCallback(
    (call: ServiceCall) => {
      if (demo || !onCallService) return;
      void onCallService(call.domain, call.service, call.data);
    },
    [demo, onCallService],
  );

  const remember = React.useCallback(
    (entries: Array<[string, M]>) => {
      const expiresAt = demo ? Number.POSITIVE_INFINITY : Date.now() + OPTIMISTIC_TTL_MS;
      setOverrides((all) => {
        const next = { ...all };
        entries.forEach(([entityId, model]) => {
          next[entityId] = { model, expiresAt };
        });
        return next;
      });
    },
    [demo],
  );

  const act = React.useCallback(
    (entityId: string, action: A) => {
      const current = modelOf(entityId);
      if (!adapter.isAvailable(current)) return;
      const next = adapter.apply(current, action);
      remember([[entityId, next]]);
      const existing = timers.current.get(entityId);
      if (existing) window.clearTimeout(existing);
      timers.current.delete(entityId);
      if (adapter.isSlider(action)) {
        timers.current.set(
          entityId,
          window.setTimeout(() => {
            timers.current.delete(entityId);
            send(adapter.call(current, action));
          }, SLIDER_DEBOUNCE_MS),
        );
        return;
      }
      send(adapter.call(current, action));
    },
    [adapter, modelOf, remember, send],
  );

  /** One action on several devices, sent as one call when the caller gives it. */
  const actMany = React.useCallback(
    (entityIds: string[], action: A, call?: ServiceCall) => {
      const ready = entityIds.filter((entityId) => adapter.isAvailable(modelOf(entityId)));
      if (ready.length === 0) return;
      remember(ready.map((entityId) => [entityId, adapter.apply(modelOf(entityId), action)]));
      if (call) send(call);
      else ready.forEach((entityId) => send(adapter.call(modelOf(entityId), action)));
    },
    [adapter, modelOf, remember, send],
  );

  return React.useMemo(() => ({ modelOf, act, actMany }), [act, actMany, modelOf]);
}
