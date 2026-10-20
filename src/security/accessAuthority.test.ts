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
    expect(api).not.toMatch(/msg\[["'](user_id|person_id|role)["']\]/);
  });
});
