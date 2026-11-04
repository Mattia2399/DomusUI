// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('lock command security contract', () => {
  it('never appends a stored lock code inside the low-level service caller', () => {
    const mainBoard = readSource('src/components/dashboard/MainBoard.tsx');

    expect(mainBoard).toContain("const actionCode = code?.trim();");
    expect(mainBoard).not.toContain("const actionCode = code?.trim() || defaultCode");
  });

  it('requires authorization when either device confirmation or a lock code is configured', () => {
    const mainBoard = readSource('src/components/dashboard/MainBoard.tsx');

    expect(mainBoard).toContain('targetWidget.lockRequireAuthToUnlock || configuredCode');
    expect(mainBoard).toContain('if (!targetWidget.lockRequireAuthToUnlock)');
    expect(mainBoard).toMatch(/if \(!targetWidget\.lockRequireAuthToUnlock\) \{\s+return showCodeFallback\(\);/);
    expect(mainBoard).toContain("requestAuthenticatedLockAction(targetWidget, 'unlock'");
    expect(mainBoard).toContain("requestAuthenticatedLockAction(targetWidget, 'open'");
  });

  it('does not pass the stored code directly from the panel to sensitive actions', () => {
    const models = readSource('src/components/settings/homePanelModels.ts');
    const runLock = models.slice(models.indexOf('export function runLockAction'), models.indexOf('export function mediaModelOf'));

    expect(runLock).toContain('actions.unlockDoor()');
    expect(runLock).toContain('actions.openDoor()');
    expect(runLock).not.toMatch(/actions\.(?:unlockDoor|openDoor)\([^)]/);
    expect(readSource('src/components/devices/panels/SecurityPanel.tsx')).not.toContain('lockCode');
  });

  it('asks for the access grant before the panel commands a lock', () => {
    expect(readSource('src/components/devices/panels/SecurityPanel.tsx')).toContain("useCan('access.control')");
  });
});
