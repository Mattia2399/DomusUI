import React from 'react';

/*
 * How a panel reaches Home Assistant. The Home provides it; what is built on it
 * (history, statistics, logbook, calendars) loads with the panels, so that the
 * Home carries only this.
 */

export type PanelApiCall = <TResponse = unknown>(
  message: Record<string, unknown>,
  options?: { reportError?: boolean; throwOnError?: boolean },
) => Promise<TResponse | null>;

export type PanelServices = {
  callApi: PanelApiCall;
  callService: (domain: string, service: string, serviceData: Record<string, unknown>) => Promise<boolean>;
  /** Real HA session only; no structural requests in demo or offline mode. */
  houseConnected?: boolean;
};

const PanelServicesContext = React.createContext<PanelServices | null>(null);

export const PanelServicesProvider = PanelServicesContext.Provider;

export function usePanelServices() {
  return React.useContext(PanelServicesContext);
}
