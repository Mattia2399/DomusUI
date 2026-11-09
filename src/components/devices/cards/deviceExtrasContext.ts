import React from 'react';
import type { DeviceTimer } from '../model/deviceTimer';

/*
 * What a device has beyond its entity, for the cards and the panels of a page
 * that does not hand it over one by one: how much it draws, whether it asks
 * before turning off, its switch-off timer. A card has the same functions
 * wherever it appears.
 */
export type DeviceExtras = {
  wattsOf: (entityId: string) => number | null;
  isProtected: (entityId: string) => boolean;
  canProtect: boolean;
  setProtected: (entityId: string, value: boolean) => void;
  /** Runs `turnOff` at once, or after asking when the device is protected. */
  guardTurnOff: (entityId: string, name: string, turnOff: () => void) => void;
  timers: Record<string, DeviceTimer>;
  timerNow: number;
  timersAvailable: boolean;
  /** What the server can switch off: a light has a timer only when it is here. */
  timerDomains: ReadonlySet<string>;
  setTimer: (entityId: string, minutes: number) => void;
};

export const DeviceExtrasContext = React.createContext<DeviceExtras | null>(null);

export const DeviceExtrasProvider = DeviceExtrasContext.Provider;

export function useDeviceExtras() {
  return React.useContext(DeviceExtrasContext);
}
