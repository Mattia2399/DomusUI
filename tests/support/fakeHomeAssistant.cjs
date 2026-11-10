const { accessSelfFor } = require('./accessSelf.cjs');

/*
 * A Home Assistant that knows one account and nothing else: enough for a suite
 * that checks a page, its layout or its navigation, now that Domus shows a page
 * only once it knows the account (docs/access-control-frontend.md). Register it
 * after the suite's own init script, which may clear the browser storage.
 */

const HA = 'http://homeassistant.local:8123';
const OWNER = { id: 'owner', name: 'Owner', is_owner: true, is_admin: true, credentials: [], mfa_modules: [] };

async function connectHomeAssistant(page, { user = OWNER, access = {}, states = {}, handle } = {}) {
  const home = { messages: [] };
  await page.routeWebSocket(`${HA.replace('http', 'ws')}/api/websocket`, (ws) => {
    ws.send(JSON.stringify({ type: 'auth_required', ha_version: '2026.2.3' }));
    ws.onMessage((raw) => {
      for (const message of [JSON.parse(raw)].flat()) {
        home.messages.push(message);
        const reply = (result) => ws.send(JSON.stringify({ id: message.id, type: 'result', success: true, result }));
        const fail = (code, text) =>
          ws.send(JSON.stringify({ id: message.id, type: 'result', success: false, error: { code, message: text } }));
        if (handle && handle(message, { reply, fail, ws })) continue;
        switch (message.type) {
          case 'auth':
            ws.send(JSON.stringify({ type: 'auth_ok', ha_version: '2026.2.3' }));
            break;
          case 'subscribe_entities': {
            reply(null);
            const now = Date.now() / 1000;
            const compressed = Object.fromEntries(
              Object.entries(states).map(([id, { state, attributes = {} }]) => [id, { s: state, a: attributes, c: 'ctx', lc: now, lu: now }]),
            );
            ws.send(JSON.stringify({ id: message.id, type: 'event', event: { a: compressed } }));
            break;
          }
          case 'domusos/access/get_self':
            reply(accessSelfFor(user, access));
            break;
          case 'auth/current_user':
            reply(user);
            break;
          case 'domusos/house/get_topology':
            reply({ schemaVersion: 'domusos.house.v1', topologyRevision: 1, topologyFingerprint: 'empty-house',
              generatedAt: '2026-11-10T00:00:00Z', floors: [], rooms: [], devices: [], entities: [],
              unassigned: { deviceIds: [], entityIds: [] }, issues: [] });
            break;
          case 'domusos/house/get_snapshot':
            reply({ schemaVersion: 'domusos.house.v1', topologyFingerprint: 'empty-house',
              generatedAt: '2026-11-10T00:00:00Z', rooms: [] });
            break;
          case 'config/entity_registry/list_for_display':
            reply({ entity_categories: {}, entities: [] });
            break;
          case 'config/area_registry/list':
          case 'config/entity_registry/list':
          case 'config/device_registry/list':
          case 'config/floor_registry/list':
          case 'config/label_registry/list':
            reply([]);
            break;
          default:
            reply(message.type === 'get_services' ? {} : null);
        }
      }
    });
  });
  await page.addInitScript((hassUrl) => {
    localStorage.setItem('hass_auth_tokens', JSON.stringify({
      hassUrl, clientId: location.origin, expires: Date.now() + 3_600_000, refresh_token: 'refresh', access_token: 'access', expires_in: 3600,
    }));
  }, HA);
  return home;
}

module.exports = { HA, OWNER, connectHomeAssistant };
