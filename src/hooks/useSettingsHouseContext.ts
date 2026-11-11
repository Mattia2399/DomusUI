import { useEffect, useRef, useState } from 'react';
import { fetchSettingsHouseContext, type SettingsHouseContext } from '../services/settingsHouseContext';
import type { PanelApiCall } from '../components/devices/panels/panelServicesContext';

/** One Settings shell owns the room projection, shared by Entities and Devices. */
export function useSettingsHouseContext(
  callApi: PanelApiCall | undefined, connected: boolean, enabled: boolean,
  registryRevision?: string,
): SettingsHouseContext | null {
  const [snapshot, setSnapshot] = useState<{ callApi: PanelApiCall; value: SettingsHouseContext } | null>(null);
  const refreshRef = useRef<() => void>(() => undefined);
  const previousRegistryRevision = useRef<string | null>(null);
  useEffect(() => {
    if (!callApi || !connected || !enabled) {
      setSnapshot(null);
      refreshRef.current = () => undefined;
      return undefined;
    }
    setSnapshot(null);
    let active = true;
    let request = 0;
    const refresh = async () => {
      const serial = ++request;
      try {
        const next = await fetchSettingsHouseContext(callApi);
        if (!active || serial !== request) return;
        setSnapshot((current) => current?.callApi === callApi &&
          JSON.stringify(current.value) === JSON.stringify(next) ? current : { callApi, value: next });
      } catch {
        if (active && serial === request) setSnapshot(null);
      }
    };
    refreshRef.current = () => void refresh();
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    const onFocus = () => void refresh();
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      request += 1;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [callApi, connected, enabled]);
  useEffect(() => {
    if (registryRevision === undefined) return;
    if (previousRegistryRevision.current === null) {
      previousRegistryRevision.current = registryRevision;
      return;
    }
    if (previousRegistryRevision.current !== registryRevision) {
      previousRegistryRevision.current = registryRevision;
      if (!connected || !enabled) return;
      setSnapshot(null);
      refreshRef.current();
    }
  // Registry arrays change on HA writes; clear stale membership before confirmation.
  }, [registryRevision, connected, enabled]);
  return connected && enabled && snapshot && snapshot.callApi === callApi ? snapshot.value : null;
}
