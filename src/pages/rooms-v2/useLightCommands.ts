import React from 'react';
import type { MockEntityState } from '../../types/ha';
import {
  applyLightAction,
  lightServiceCall,
  toLightModel,
  type LightAction,
  type LightModel,
} from '../../components/devices/model/light';

/*
 * Light commands of the Rooms page. A command shows at once (optimistic) and
 * reaches Home Assistant through the page's service call; sliders send at
 * most one call per short pause. In the demo the result simply stays.
 */

const OPTIMISTIC_TTL_MS = 5000;
const SLIDER_DEBOUNCE_MS = 150;

type CallService = (domain: string, service: string, serviceData: Record<string, unknown>) => Promise<boolean>;

type Override = { model: LightModel; expiresAt: number };

function confirmed(live: LightModel, wanted: LightModel) {
  if (live.on !== wanted.on) return false;
  if (!wanted.on) return true;
  const brightnessOk =
    wanted.brightnessPct === null || live.brightnessPct === null || Math.abs(live.brightnessPct - wanted.brightnessPct) <= 2;
  return brightnessOk && live.mode === wanted.mode;
}

export function useLightCommands({
  demo,
  states,
  onCallService,
}: {
  demo: boolean;
  states: Record<string, MockEntityState | undefined>;
  onCallService?: CallService;
}) {
  const [overrides, setOverrides] = React.useState<Record<string, Override>>({});
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
          if (override.expiresAt <= now || confirmed(toLightModel(entityId, states[entityId]), override.model)) {
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
  }, [demo, overrides, states]);

  const modelOf = React.useCallback(
    (entityId: string) => overrides[entityId]?.model ?? toLightModel(entityId, states[entityId]),
    [overrides, states],
  );

  const send = React.useCallback(
    (model: LightModel, action: LightAction) => {
      if (demo || !onCallService) return;
      const call = lightServiceCall(model, action);
      void onCallService(call.domain, call.service, call.data);
    },
    [demo, onCallService],
  );

  const act = React.useCallback(
    (entityId: string, action: LightAction) => {
      const current = modelOf(entityId);
      if (!current.available) return;
      const next = applyLightAction(current, action);
      setOverrides((all) => ({
        ...all,
        [entityId]: { model: next, expiresAt: demo ? Number.POSITIVE_INFINITY : Date.now() + OPTIMISTIC_TTL_MS },
      }));
      const existing = timers.current.get(entityId);
      if (existing) window.clearTimeout(existing);
      if (action.type === 'brightness' || action.type === 'hue') {
        timers.current.set(
          entityId,
          window.setTimeout(() => {
            timers.current.delete(entityId);
            send(next, action);
          }, SLIDER_DEBOUNCE_MS),
        );
        return;
      }
      timers.current.delete(entityId);
      send(current, action);
    },
    [demo, modelOf, send],
  );

  /** Turns the given lights off in one call. */
  const turnOffAll = React.useCallback(
    (entityIds: string[]) => {
      const lit = entityIds.filter((entityId) => {
        const model = modelOf(entityId);
        return model.available && model.on;
      });
      if (lit.length === 0) return;
      const expiresAt = demo ? Number.POSITIVE_INFINITY : Date.now() + OPTIMISTIC_TTL_MS;
      setOverrides((all) => {
        const next = { ...all };
        lit.forEach((entityId) => {
          next[entityId] = { model: applyLightAction(modelOf(entityId), { type: 'turn_off' }), expiresAt };
        });
        return next;
      });
      if (!demo && onCallService) void onCallService('light', 'turn_off', { entity_id: lit });
    },
    [demo, modelOf, onCallService],
  );

  return React.useMemo(() => ({ modelOf, act, turnOffAll }), [act, modelOf, turnOffAll]);
}
