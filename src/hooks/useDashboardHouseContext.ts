import { useEffect, useState } from 'react';
import { fetchDashboardHouseContext, type DashboardHouseContext } from '../services/dashboardHouseContext';
import type { PanelApiCall } from '../components/devices/panels/panelServicesContext';

/** One Dashboard owner polls the narrow House projection; descendants receive its snapshot. */
export function useDashboardHouseContext(callApi: PanelApiCall | undefined, connected: boolean): DashboardHouseContext | null {
  const [snapshot, setSnapshot] = useState<{ callApi: PanelApiCall; value: DashboardHouseContext } | null>(null);
  useEffect(() => {
    if (!callApi || !connected) {
      setSnapshot(null);
      return undefined;
    }
    setSnapshot(null);
    let active = true;
    let request = 0;
    const refresh = async () => {
      const serial = ++request;
      try {
        const next = await fetchDashboardHouseContext(callApi);
        if (!active || serial !== request) return;
        setSnapshot((current) => current?.callApi === callApi && current.value.topologyRevision === next.topologyRevision &&
          JSON.stringify(current.value) === JSON.stringify(next) ? current : { callApi, value: next });
      } catch {
        if (active && serial === request) setSnapshot(null);
      }
    };
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
  }, [callApi, connected]);
  return connected && snapshot?.callApi === callApi ? snapshot.value : null;
}
