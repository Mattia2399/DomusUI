import React, { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  LOADING_ACCESS,
  type AccessCapability,
  type AccessSnapshot,
} from './accessControl';

export type AccessControlValue = AccessSnapshot & {
  /** Ask the backend again for this account (after a change of its role, for example). */
  refresh: () => void;
};

const noRefresh = () => undefined;

// Outside a provider nothing is granted: a screen that forgets the provider shows less, never more.
const AccessControlContext = createContext<AccessControlValue>({ ...LOADING_ACCESS, refresh: noRefresh });

export function AccessControlProvider({
  access,
  refresh = noRefresh,
  children,
}: {
  access: AccessSnapshot;
  refresh?: () => void;
  children: ReactNode;
}) {
  // A new value only when the profile or the refresh changes: consumers do not re-render on every parent render.
  const value = useMemo(() => ({ ...access, refresh }), [access, refresh]);
  return <AccessControlContext.Provider value={value}>{children}</AccessControlContext.Provider>;
}

export function useAccessControl(): AccessControlValue {
  return useContext(AccessControlContext);
}

/** Whether the interface offers what needs this capability; false while loading or on any doubt. */
export function useCan(capability: AccessCapability): boolean {
  return useContext(AccessControlContext).can(capability);
}
