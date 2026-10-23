const { test, expect } = require('@playwright/test');
const { accessSelfFor } = require('./support/accessSelf.cjs');
const { connectHomeAssistant } = require('./support/fakeHomeAssistant.cjs');

/*
 * People and access end to end: an administrator changes Mario's role and
 * personal permissions; Mario, in his own session on the same simulated Home
 * Assistant, sees the interface follow after a reload. The simulated backend
 * keeps one policy for both and applies the rules of the real one.
 */

const ADMIN = { id: 'a'.repeat(32), name: 'Mattia', is_owner: true, is_admin: true, is_active: true, credentials: [], mfa_modules: [] };
const MARIO = { id: 'b'.repeat(32), name: 'Mario', is_owner: false, is_admin: false, is_active: true, credentials: [], mfa_modules: [] };
const ALARM = {
  'alarm_control_panel.casa': {
    state: 'disarmed',
    attributes: { friendly_name: 'Allarme casa', supported_features: 63, code_arm_required: false },
  },
};

function sharedPolicy() {
  return { state: 'absent', revision: 0, assignments: {} };
}

function accessBackend(policy, user) {
  const view = (account) => {
    const assignment = policy.assignments[account.id];
    return {
      user_id: account.id,
      name: account.name,
      is_admin: account.is_admin,
      is_owner: account.is_owner,
      is_active: true,
      manageable: true,
      role: assignment?.role ?? (account.is_admin ? 'admin' : 'member'),
      assigned: Boolean(assignment),
      grants: assignment?.grants ?? [],
    };
  };
  return (message, { reply, fail }) => {
    const target = [ADMIN, MARIO].find((account) => account.id === message.user_id);
    switch (message.type) {
      case 'domusos/access/get_self': {
        const assignment = policy.assignments[user.id];
        reply(accessSelfFor(user, assignment ? { role: assignment.role, grants: assignment.grants, state: 'ready' } : {}));
        return true;
      }
      case 'domusos/access/list_accounts':
        if (!user.is_admin) fail('unauthorized', 'Unauthorized');
        else reply({ state: policy.state, revision: policy.revision, accounts: [ADMIN, MARIO].map(view) });
        return true;
      case 'domusos/access/set_assignment':
      case 'domusos/access/remove_assignment':
        if (!user.is_admin) fail('unauthorized', 'Unauthorized');
        else if (message.expected_revision !== policy.revision) fail('revision_conflict', 'changed elsewhere');
        else if (!target) fail('unknown_account', 'no account');
        // As the backend: the Administrator role only for a Home Assistant administrator (Q24).
        else if (message.type === 'domusos/access/set_assignment' && message.role === 'admin' && !target.is_admin) {
          fail('role_requires_ha_admin', 'needs a Home Assistant administrator');
        } else {
          if (message.type === 'domusos/access/set_assignment') {
            const redundant = message.role === 'admin' || message.role === 'resident';
            policy.assignments[target.id] = { role: message.role, grants: redundant ? [] : message.grants };
          } else {
            delete policy.assignments[target.id];
          }
          policy.revision += 1;
          policy.state = 'ready';
          reply({ state: policy.state, revision: policy.revision, account: view(target) });
        }
        return true;
      default:
        return false;
    }
  };
}

async function openAs(browser, user, policy, viewport = { width: 1440, height: 960 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.addInitScript(() => {
    if (sessionStorage.getItem('people-access.e2e')) return;
    sessionStorage.setItem('people-access.e2e', '1');
    localStorage.clear();
    localStorage.setItem('ha.dashboard.setupJourney.v2', JSON.stringify({ version: 2, phase: 'done', mode: 'real', updatedAt: Date.now() }));
    localStorage.setItem('ha.dashboard.runtimeMode.v1', 'real');
    localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
    localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
    localStorage.setItem('domusui.language.v1', 'it');
  });
  const home = await connectHomeAssistant(page, { user, states: ALARM, handle: accessBackend(policy, user) });
  return { context, page, home };
}

const alarmModes = (page) => page.getByRole('radio', { name: 'Casa' });

async function editMario(admin) {
  await admin.goto('/settings/access/roles');
  await admin.getByRole('button', { name: /Mario/ }).click();
  return admin.getByRole('dialog');
}

test('an administrator gives Mario alarm control, Mario sees it after a reload, and loses it again', async ({ browser }) => {
  const policy = sharedPolicy();
  const mario = await openAs(browser, MARIO, policy);
  await mario.page.goto('/security');
  await expect(mario.page.getByRole('heading', { name: 'Sicurezza', exact: true })).toBeVisible();
  await expect(alarmModes(mario.page)).toHaveCount(0);

  const admin = await openAs(browser, ADMIN, policy);
  let editor = await editMario(admin.page);
  await editor.getByRole('switch', { name: 'Controllo allarme' }).click();
  await expect(editor.getByText('Modifiche non salvate')).toBeVisible();
  await editor.getByRole('button', { name: 'Salva' }).click();
  await expect(editor.getByText('Salvato.')).toBeVisible();
  expect(policy.assignments[MARIO.id]).toEqual({ role: 'member', grants: ['security.control'] });
  // Who acts never travels with the request.
  const save = admin.home.messages.find((message) => message.type === 'domusos/access/set_assignment');
  expect(Object.keys(save).sort()).toEqual(['expected_revision', 'grants', 'id', 'role', 'type', 'user_id']);

  await mario.page.reload();
  await expect(alarmModes(mario.page)).toBeVisible();

  await editor.getByRole('switch', { name: 'Controllo allarme' }).click();
  await editor.getByRole('button', { name: 'Salva' }).click();
  await expect(editor.getByText('Salvato.')).toBeVisible();
  await mario.page.reload();
  await expect(mario.page.getByRole('heading', { name: 'Sicurezza', exact: true })).toBeVisible();
  await expect(alarmModes(mario.page)).toHaveCount(0);

  await admin.context.close();
  await mario.context.close();
});

test('a role change reaches Mario: restricted loses Security, wall panel keeps it without Kiosk', async ({ browser }) => {
  const policy = sharedPolicy();
  const admin = await openAs(browser, ADMIN, policy);
  const mario = await openAs(browser, MARIO, policy);

  let editor = await editMario(admin.page);
  await editor.getByRole('radio', { name: /Accesso limitato/ }).check();
  await editor.getByRole('button', { name: 'Salva' }).click();
  await expect(editor.getByText('Salvato.')).toBeVisible();
  await mario.page.goto('/security');
  await expect(mario.page.getByRole('heading', { name: 'Non disponibile per il tuo account' })).toBeVisible();

  await editor.getByRole('radio', { name: /Pannello/ }).check();
  await editor.getByRole('button', { name: 'Salva' }).click();
  await expect(editor.getByText('Salvato.')).toBeVisible();
  await mario.page.reload();
  await expect(mario.page.getByRole('heading', { name: 'Sicurezza', exact: true })).toBeVisible();
  // A panel account is a role, not Kiosk mode: the navigation is still there.
  await expect(mario.page.getByRole('button', { name: 'Apri Sicurezza', exact: true })).toBeVisible();

  await editor.getByRole('button', { name: /Ripristina ruolo predefinito/ }).click();
  await expect(editor.getByText('Salvato.')).toBeVisible();
  expect(policy.assignments[MARIO.id]).toBeUndefined();

  await admin.context.close();
  await mario.context.close();
});

test('Mario becomes a Resident: the whole house, never the Administrator role, and back to Member', async ({ browser }) => {
  const policy = sharedPolicy();
  const admin = await openAs(browser, ADMIN, policy);
  const mario = await openAs(browser, MARIO, policy);
  await mario.page.goto('/security');
  await expect(mario.page.getByRole('heading', { name: 'Sicurezza', exact: true })).toBeVisible();
  await expect(alarmModes(mario.page)).toHaveCount(0);

  let editor = await editMario(admin.page);
  await expect(editor.getByRole('radio', { name: /Amministratore/ })).toHaveCount(0);
  await expect(editor.getByText('Amministratore è disponibile solo per gli amministratori di Home Assistant.')).toBeVisible();
  await editor.getByRole('radio', { name: /Residente/ }).check();
  await expect(editor.getByText('Un residente ha già questi permessi.')).toBeVisible();
  await expect(editor.getByRole('switch', { name: 'Controllo allarme' })).toBeDisabled();
  await editor.getByRole('button', { name: 'Salva' }).click();
  await expect(editor.getByText('Salvato.')).toBeVisible();
  expect(policy.assignments[MARIO.id]).toEqual({ role: 'resident', grants: [] });
  // The role alone opens the alarm: no grant was needed.
  await mario.page.reload();
  await expect(alarmModes(mario.page)).toBeVisible();

  await editor.getByRole('radio', { name: /Membro/ }).check();
  await editor.getByRole('button', { name: 'Salva' }).click();
  await expect(editor.getByText('Salvato.')).toBeVisible();
  expect(policy.assignments[MARIO.id].role).toBe('member');
  await mario.page.reload();
  await expect(mario.page.getByRole('heading', { name: 'Sicurezza', exact: true })).toBeVisible();
  await expect(alarmModes(mario.page)).toHaveCount(0);

  await admin.context.close();
  await mario.context.close();
});

test('an old Administrator role on Mario is flagged, kept until changed, and can become Resident', async ({ browser }) => {
  const policy = { state: 'ready', revision: 4, assignments: { [MARIO.id]: { role: 'admin', grants: [] } } };
  const admin = await openAs(browser, ADMIN, policy);
  await admin.page.goto('/settings/access/roles');
  const mario = admin.page.getByRole('button', { name: /Mario/ });
  await expect(mario).toContainText('Da rivedere');
  await mario.click();
  const editor = admin.page.getByRole('dialog');
  await expect(editor.getByRole('status').filter({ hasText: 'Scegli Residente' })).toBeVisible();
  expect(policy.assignments[MARIO.id].role).toBe('admin');
  await editor.getByRole('radio', { name: /Residente/ }).check();
  await editor.getByRole('button', { name: 'Salva' }).click();
  await expect(editor.getByText('Salvato.')).toBeVisible();
  expect(policy.assignments[MARIO.id]).toEqual({ role: 'resident', grants: [] });
  await admin.context.close();
});

test('a change made in another session is never overwritten', async ({ browser }) => {
  const policy = sharedPolicy();
  const admin = await openAs(browser, ADMIN, policy);
  const editor = await editMario(admin.page);
  policy.assignments[MARIO.id] = { role: 'wall_panel', grants: [] };
  policy.revision = 1;
  await editor.getByRole('switch', { name: 'Controllo accessi' }).click();
  await editor.getByRole('button', { name: 'Salva' }).click();
  await expect(editor.getByRole('alert')).toContainText('Le autorizzazioni sono state aggiornate da un’altra sessione.');
  expect(policy.assignments[MARIO.id]).toEqual({ role: 'wall_panel', grants: [] });
  await editor.getByRole('button', { name: 'Ricarica' }).click();
  await expect(editor.getByRole('radio', { name: /Pannello/ })).toBeChecked();
  await admin.context.close();
});

test('Roles and permissions are not offered to Mario, and its address says so', async ({ browser }) => {
  const policy = sharedPolicy();
  const mario = await openAs(browser, MARIO, policy);
  await mario.page.goto('/settings/access');
  await expect(mario.page.getByRole('heading', { name: 'Persone e accessi' })).toBeVisible();
  await expect(mario.page.getByRole('button', { name: /Ruoli e permessi/ })).toHaveCount(0);
  await mario.page.goto('/settings/access/roles');
  await expect(mario.page.getByRole('heading', { name: 'Non disponibile per il tuo account' })).toBeVisible();
  expect(mario.home.messages.some((message) => message.type === 'domusos/access/list_accounts')).toBe(false);
  await mario.context.close();
});

for (const viewport of [{ width: 390, height: 844 }, { width: 820, height: 1180 }, { width: 1440, height: 960 }]) {
  test(`Roles and permissions fit ${viewport.width}px`, async ({ browser }) => {
    const admin = await openAs(browser, ADMIN, sharedPolicy(), viewport);
    await admin.page.goto('/settings/access/roles');
    await expect(admin.page.getByRole('button', { name: /Mario/ })).toBeVisible();
    await admin.page.getByRole('button', { name: /Mario/ }).click();
    await expect(admin.page.getByRole('dialog').getByRole('button', { name: 'Salva' })).toBeVisible();
    const overflow = await admin.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await admin.context.close();
  });
}

test('every account can sign out, even without its own pages and even offline', async ({ browser }) => {
  const mario = await openAs(browser, MARIO, { state: 'absent', revision: 0, assignments: { [MARIO.id]: { role: 'wall_panel', grants: [] } } });
  await mario.page.goto('/settings');
  await mario.page.getByRole('button', { name: /^Esci/ }).click();
  await mario.page.getByRole('dialog').getByRole('button', { name: 'Esci' }).click();
  await expect(mario.page).toHaveURL(/\/setup\?reconnect=1$/);
  await mario.context.close();

  // Without Home Assistant: pages stay closed, signing out does not.
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('ha.dashboard.setupJourney.v2', JSON.stringify({ version: 2, phase: 'done', mode: 'real', updatedAt: Date.now() }));
    localStorage.setItem('ha.dashboard.runtimeMode.v1', 'real');
    localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
    localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
  });
  await page.goto('/home');
  await expect(page.getByRole('heading', { name: 'Home Assistant non collegato' })).toBeVisible();
  await page.goto('/settings');
  await expect(page.getByRole('button', { name: /^Esci/ })).toBeVisible();
  await context.close();
});
