// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Who an account is and what it may do never come from the browser
 * (docs/access-control-architecture.md). Today the frontend decides only what
 * it shows, from Home Assistant's auth/current_user; the backend and Home
 * Assistant decide the rest. Nothing the browser stores may feed that decision.
 */

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('access authority', () => {
  it('derives what the interface allows from Home Assistant, never from browser storage', () => {
    const access = read('src/security/dashboardAccess.tsx');
    expect(access).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/);
  });

  it('reads the account from Home Assistant, not from a stored identity', () => {
    const revalidation = read('src/hooks/useHaIdentityRevalidation.ts');
    expect(revalidation).toContain("type: 'auth/current_user'");
    expect(revalidation).not.toMatch(/localStorage|sessionStorage|indexedDB/);
  });

  it('asks the backend for the access profile without naming an account', () => {
    const api = read('custom_components/domusos/access/api.py');
    expect(api).toContain('websocket_command({vol.Required("type"): f"{WS_PREFIX}/get_self"})');
    expect(api).toContain('principal_from_user(connection.user)');
    // get_self never names an account; only People and access names the account it changes.
    const getSelf = api.slice(api.indexOf('def websocket_get_self('), api.indexOf('def websocket_reset_policy('));
    expect(getSelf).toContain('connection.user');
    expect(getSelf).not.toMatch(/msg\[["'](user_id|person_id|role)["']\]/);
  });

  it('keeps the shadow diagnostics out of the panel bridge; the reset travels only for Persone e accessi', () => {
    const bridge = read('src/hooks/useHaPanelBridgeConnection.ts');
    expect(bridge).toContain("'domusos/access/get_self'");
    expect(bridge).toContain("'domusos/access/reset_policy'");
    for (const type of ['get_shadow_diagnostics', 'reset_shadow_diagnostics']) {
      expect(bridge).not.toContain(`'domusos/access/${type}'`);
    }
  });

  it('keeps the access profile in memory only, from get_self alone', () => {
    for (const path of ['src/security/accessControl.ts', 'src/security/AccessControlProvider.tsx', 'src/hooks/useAccessProfile.ts', 'src/navigation/routeAccess.ts']) {
      expect(read(path), path).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/);
    }
    const hook = read('src/hooks/useAccessProfile.ts');
    expect(hook).toContain("{ type: 'domusos/access/get_self' }");
    expect(hook).not.toMatch(/setInterval|setTimeout/);
  });

  it('decides with capabilities, not with roles or Home Assistant flags, outside Access Control', () => {
    const files = [
      'src/components/dashboard/MainBoard.tsx',
      'src/pages/SettingsDashboard.tsx',
      'src/pages/AppGallery.jsx',
      'src/pages/SecurityDashboard.jsx',
      'src/components/settings/settingsScopes.ts',
      'src/components/settings/DevicePowerSettings.tsx',
      'src/components/dashboard/LeftSidebar.tsx',
      'src/components/dashboard/MobileSidebarDrawer.tsx',
      'src/components/dashboard/BottomBarNav.tsx',
    ];
    for (const path of files) {
      const source = read(path);
      expect(source, path).not.toMatch(/role\s*===\s*['"](admin|member|restricted|wall_panel)['"]/);
      expect(source, path).not.toContain('administratorsOnly');
    }
    expect(read('src/components/dashboard/MainBoard.tsx')).toContain("access.can('ha_frontend.open')");
  });
});
