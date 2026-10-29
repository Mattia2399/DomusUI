import React, { type ReactNode } from 'react';
import { AccessControlProvider } from '../security/AccessControlProvider';
import { DashboardSecurityProvider, type DashboardSecurityValue } from '../security/dashboardAccess';

/** Both contexts a screen reads, from one security value, as MainBoard provides them. */
export function AccessTestProviders({ security, children }: { security: DashboardSecurityValue; children: ReactNode }) {
  return (
    <AccessControlProvider access={security.access}>
      <DashboardSecurityProvider value={security}>{children}</DashboardSecurityProvider>
    </AccessControlProvider>
  );
}
