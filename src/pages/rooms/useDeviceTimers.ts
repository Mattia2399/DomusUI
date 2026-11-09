import React from 'react';
import { parseDeviceTimers, parseTimerDomains, type DeviceTimer } from '../../components/devices/model/deviceTimer';
import type { RoomsApiCall } from '../../components/rooms/roomsDirectory';

/*
 * The switch-off timers, followed live from the integration: every tablet sees
 * a timer as soon as one is set, ended or cancelled. Without the integration
 * (or an older one) there are no timers and the panel shows none. The demo
 * keeps its own, and switches its devices off itself.
 */

export type RoomsSubscribeApi = <T = unknown>(message: Record<string, unknown>, callback: (event: T) => void) => Promise<() => void>;

const POLL_MS = 60_000;
const TICK_MS = 15_000;

export function useDeviceTimers({
  demo,
  isOn,
  onCallApi,
  onSubscribeApi,
  onDemoSwitch,
}: {
  demo: boolean;
  /** Whether a device is on now, as the page shows it. */
  isOn: (entityId: string) => boolean;
  onCallApi?: RoomsApiCall;
  onSubscribeApi?: RoomsSubscribeApi;
  /** In the demo: switch a device on or off, as the integration would. */
  onDemoSwitch?: (entityId: string, on: boolean) => void;
}) {
  const [timers, setTimers] = React.useState<Record<string, DeviceTimer>>({});
  const [available, setAvailable] = React.useState(demo);
  // What the server can switch off: the demo can do all this interface knows.
  const [domains, setDomains] = React.useState<ReadonlySet<string>>(() => parseTimerDomains(demo ? undefined : null));
  const [now, setNow] = React.useState(() => Date.now());

  const readState = React.useCallback(async () => {
    if (!onCallApi) return false;
    const payload = await onCallApi({ type: 'domusos/device_timers/get_state' }, { reportError: false }).catch(() => null);
    const parsed = parseDeviceTimers(payload);
    if (parsed) {
      setTimers(parsed);
      setDomains(parseTimerDomains(payload));
    }
    return parsed !== null;
  }, [onCallApi]);

  React.useEffect(() => {
    if (demo) {
      setAvailable(true);
      setDomains(parseTimerDomains());
      return undefined;
    }
    setTimers({});
    setAvailable(false);
    setDomains(parseTimerDomains(null));
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    let poll: number | null = null;
    const start = async () => {
      if (onSubscribeApi) {
        try {
          const stop = await onSubscribeApi({ type: 'domusos/device_timers/subscribe' }, (event) => {
            const parsed = parseDeviceTimers(event);
            if (parsed && !cancelled) {
              setTimers(parsed);
              setDomains(parseTimerDomains(event));
            }
          });
          if (cancelled) stop();
          else {
            unsubscribe = stop;
            setAvailable(true);
          }
          return;
        } catch {
          // An integration without timers, or a bridge without the subscription: ask instead.
        }
      }
      const ok = await readState();
      if (cancelled) return;
      setAvailable(ok);
      if (ok) poll = window.setInterval(() => void readState(), POLL_MS);
    };
    void start();
    return () => {
      cancelled = true;
      unsubscribe?.();
      if (poll !== null) window.clearInterval(poll);
    };
  }, [demo, onSubscribeApi, readState]);

  const hasTimers = Object.keys(timers).length > 0;
  React.useEffect(() => {
    if (!hasTimers) return undefined;
    setNow(Date.now());
    const tick = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(tick);
  }, [hasTimers]);

  // The demo: a device switched off another way ends its timer; an ended timer switches it off.
  React.useEffect(() => {
    if (!demo) return;
    setTimers((current) => {
      const kept = Object.fromEntries(Object.entries(current).filter(([entityId]) => isOn(entityId)));
      return Object.keys(kept).length === Object.keys(current).length ? current : kept;
    });
  }, [demo, isOn]);
  React.useEffect(() => {
    if (!demo) return undefined;
    const handles = Object.values(timers).map((timer) =>
      window.setTimeout(() => {
        setTimers((current) => Object.fromEntries(Object.entries(current).filter(([entityId]) => entityId !== timer.entityId)));
        onDemoSwitch?.(timer.entityId, false);
      }, Math.max(0, timer.endsAt - Date.now())),
    );
    return () => handles.forEach((handle) => window.clearTimeout(handle));
  }, [demo, onDemoSwitch, timers]);

  /** Switch the device off in `minutes`, or forget its timer with 0. */
  const setTimer = React.useCallback(
    async (entityId: string, minutes: number) => {
      const previous = timers;
      const next = { ...timers };
      if (minutes > 0) next[entityId] = { entityId, minutes, endsAt: Date.now() + minutes * 60_000 };
      else delete next[entityId];
      setTimers(next);
      setNow(Date.now());
      if (demo) {
        if (minutes > 0 && !isOn(entityId)) onDemoSwitch?.(entityId, true);
        return true;
      }
      const message =
        minutes > 0
          ? { type: 'domusos/device_timers/set_timer', entity_id: entityId, minutes }
          : { type: 'domusos/device_timers/cancel_timer', entity_id: entityId };
      const payload = onCallApi ? await onCallApi(message, { reportError: false }).catch(() => null) : null;
      const parsed = parseDeviceTimers(payload);
      if (parsed) {
        setTimers(parsed);
        setDomains(parseTimerDomains(payload));
        return true;
      }
      setTimers(previous);
      void readState();
      return false;
    },
    [demo, isOn, onCallApi, onDemoSwitch, readState, timers],
  );

  return { available, domains, timers, now, setTimer };
}
