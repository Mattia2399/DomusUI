# Home Assistant Panel Bridge (Iframe)

Se installi la dashboard come `panel_custom` in Home Assistant, puoi evitare token/OAuth dentro l'iframe e usare direttamente la sessione HA gia autenticata del parent.

Il messaggio `ha-panel-navigate-home` porta l'utente alla panoramica nativa `/lovelace`: cambia soltanto la route corrente e non modifica la preferenza personale `default_panel`.
Durante lo sviluppo standalone, Domus UI offre la stessa azione quando è collegata in modalità reale e apre `/lovelace` sull'URL Home Assistant configurato.

Il valore `name` in `configuration.yaml` deve essere esattamente `ha-dashboard-builder-panel`, perché deve coincidere con il nome registrato tramite `customElements.define`.

## Panel JS aggiornato

```js
const PANEL_BRIDGE_PROTOCOL_VERSION = 4;
const PANEL_BRIDGE_CAPABILITIES = Object.freeze([
  "shared_configuration",
  "app_configurations",
  "revision_history",
  "dashboard_reset_marker",
  "irrigation_core",
  "host_navigation",
]);
const ALLOWED_WS_TYPES = new Set([
  "auth/current_user", "auth/list", "config/auth/list", "get_services",
  "weather/get_forecasts", "call_service", "history/history_during_period",
  "logbook/get_events", "get_panels",
  "frontend/get_user_data", "frontend/set_user_data",
  "frontend/get_system_data", "frontend/set_system_data",
  "config/entity_registry/list",
  "config/entity_registry/list_for_display", "config/entity_registry/update",
  "config/device_registry/list", "config/device_registry/list_for_display",
  "config/device_registry/update", "config/label_registry/list",
  "config/label_registry/list_for_display", "config/area_registry/list",
  "config/area_registry/create",
  "config/area_registry/update", "config/area_registry/delete",
  "config/floor_registry/list", "config/floor_registry/create",
  "config/floor_registry/update", "config/floor_registry/reorder",
  "config/floor_registry/delete",
  "domusos/irrigation/get_config", "domusos/irrigation/save_config",
  "domusos/irrigation/get_state", "domusos/irrigation/subscribe",
  "domusos/irrigation/start_zone", "domusos/irrigation/stop_zone",
  "domusos/irrigation/pause", "domusos/irrigation/resume",
  "domusos/irrigation/stop_all", "domusos/irrigation/prepare_legacy_removal",
]);
const HA_NAME = /^[a-z0-9_]+$/;
const REQUEST_ID = /^ha-panel-(?:call-(?:service|api)|subscribe-api)-\d{10,}-[a-z0-9]+$/;
const SHARED_HOUSE_KEY = "premium-home.shared-house.v1";
const DASHBOARD_REVISIONS_KEY = "premium-home.dashboard-revisions.v1";
const DASHBOARD_RESET_MARKER_KEY = "premium-home.dashboard-reset.v1";
const APP_CONFIGURATIONS_KEY = "domusos.app-configurations.v1";
const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const toBridgeErrorMessage = (error, fallback) => {
  const candidate = isRecord(error) && isRecord(error.error) ? error.error : error;
  const message = typeof candidate === "string"
    ? candidate.trim()
    : isRecord(candidate) && typeof candidate.message === "string"
      ? candidate.message.trim()
      : "";
  const code = isRecord(candidate) && typeof candidate.code === "string"
    ? candidate.code.trim()
    : "";
  if (message && code && !message.includes(code)) return `${message} [${code}]`;
  return message || code || fallback;
};
const isValidService = (domain, service, data) =>
  typeof domain === "string" && HA_NAME.test(domain) &&
  typeof service === "string" && HA_NAME.test(service) && isRecord(data);
const isValidSharedHouseDocument = (value) =>
  isRecord(value) &&
  value.schema === "premium-home-house-configuration" &&
  value.version === 1 &&
  Number.isSafeInteger(value.revision) && value.revision > 0 &&
  typeof value.updatedAt === "string" && Number.isFinite(Date.parse(value.updatedAt)) &&
  typeof value.updatedByUserId === "string" &&
  isRecord(value.dashboard) && Array.isArray(value.dashboard.sections) && Array.isArray(value.dashboard.widgets) &&
  isRecord(value.security) && isRecord(value.rooms);
const isValidDashboardRevisionHistory = (value) =>
  isRecord(value) &&
  value.schema === "premium-home-dashboard-revision-history" &&
  value.version === 1 &&
  typeof value.updatedAt === "string" && Number.isFinite(Date.parse(value.updatedAt)) &&
  Array.isArray(value.entries) && value.entries.length <= 4 &&
  value.entries.every((entry) =>
    isRecord(entry) && Number.isSafeInteger(entry.revision) && entry.revision > 0 &&
    typeof entry.createdAt === "string" && Number.isFinite(Date.parse(entry.createdAt)) &&
    typeof entry.createdByUserId === "string" &&
    isRecord(entry.dashboard) && Array.isArray(entry.dashboard.sections) &&
    Array.isArray(entry.dashboard.widgets)
  );
const isValidDashboardResetMarker = (value) =>
  isRecord(value) &&
  value.schema === "domusos-dashboard-reset" &&
  value.version === 1 &&
  (value.status === "pending" || value.status === "complete") &&
  typeof value.resetId === "string" && /^[a-z0-9-]{8,160}$/i.test(value.resetId) &&
  typeof value.requestedAt === "string" && Number.isFinite(Date.parse(value.requestedAt)) &&
  typeof value.requestedByUserId === "string" && value.requestedByUserId.trim().length > 0 &&
  value.requestedByUserId.length <= 160 &&
  (value.completedAt === undefined ||
    (typeof value.completedAt === "string" && Number.isFinite(Date.parse(value.completedAt)))) &&
  (value.status !== "complete" ||
    (typeof value.completedAt === "string" && Number.isFinite(Date.parse(value.completedAt))));
const isValidAppConfigurations = (value) =>
  isRecord(value) &&
  value.schema === "domusos-app-configurations" &&
  value.version === 1 &&
  Number.isSafeInteger(value.revision) && value.revision > 0 &&
  typeof value.updatedAt === "string" && Number.isFinite(Date.parse(value.updatedAt)) &&
  typeof value.updatedByUserId === "string" &&
  isRecord(value.apps);
const isValidFrontendCoreUserData = (value) => {
  if (!isRecord(value) || Object.keys(value).length > 128) return false;
  if (value.default_panel !== undefined &&
      (typeof value.default_panel !== "string" ||
       !/^[a-z0-9][a-z0-9_-]{0,127}$/i.test(value.default_panel.trim()))) return false;
  try {
    return JSON.stringify(value).length <= 100000;
  } catch {
    return false;
  }
};
const isValidWsMessage = (message) => {
  if (!isRecord(message) || typeof message.type !== "string" || !ALLOWED_WS_TYPES.has(message.type)) return false;
  if (message.type === "get_panels") {
    return Object.keys(message).every((key) => key === "type");
  }
  if (message.type === "frontend/get_user_data") {
    return message.key === "core" &&
      Object.keys(message).every((key) => key === "type" || key === "key");
  }
  if (message.type === "frontend/set_user_data") {
    return message.key === "core" && isValidFrontendCoreUserData(message.value);
  }
  if (message.type === "frontend/get_system_data") {
    return message.key === SHARED_HOUSE_KEY || message.key === DASHBOARD_REVISIONS_KEY ||
      message.key === DASHBOARD_RESET_MARKER_KEY || message.key === APP_CONFIGURATIONS_KEY;
  }
  if (message.type === "frontend/set_system_data") {
    if (message.value === null) {
      return message.key === SHARED_HOUSE_KEY || message.key === DASHBOARD_REVISIONS_KEY ||
        message.key === DASHBOARD_RESET_MARKER_KEY || message.key === APP_CONFIGURATIONS_KEY;
    }
    if (message.key === SHARED_HOUSE_KEY) return isValidSharedHouseDocument(message.value);
    if (message.key === DASHBOARD_REVISIONS_KEY) return isValidDashboardRevisionHistory(message.value);
    if (message.key === DASHBOARD_RESET_MARKER_KEY) return isValidDashboardResetMarker(message.value);
    if (message.key === APP_CONFIGURATIONS_KEY) return isValidAppConfigurations(message.value);
    return false;
  }
  return message.type !== "call_service" ||
    isValidService(message.domain, message.service, message.service_data ?? {});
};

class HaDashboardBuilderPanel extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._panel = null;
    this._iframe = null;
    this._lastStates = {};
    this._areas = null;
    this._apiSubscriptions = new Map();
    this._onMessage = this._onMessage.bind(this);
  }

  set hass(hass) {
    this._hass = hass;
    this._syncToIframe();
  }

  set panel(panel) {
    this._panel = panel;
    this._render();
  }

  connectedCallback() {
    this.style.display = "block";
    this.style.width = "100%";
    this.style.height = "100vh";
    window.addEventListener("message", this._onMessage);
    this._render();
  }

  disconnectedCallback() {
    window.removeEventListener("message", this._onMessage);
    for (const unsubscribe of this._apiSubscriptions.values()) unsubscribe();
    this._apiSubscriptions.clear();
  }

  _render() {
    if (this._iframe) return;

    const appUrl = new URL(this._panel?.config?.app_url || "/local/dashboard/index.html", window.location.origin);
    if (appUrl.origin !== window.location.origin) throw new Error("Il panel deve essere same-origin.");
    this._iframe = document.createElement("iframe");
    this._iframe.id = "ha-dashboard-frame";
    this._iframe.src = appUrl.toString();
    this._iframe.style.cssText = "width:100%;height:100%;border:none;display:block";
    this.replaceChildren(this._iframe);
    this._iframe.addEventListener("load", () => {
      this._postContext();
      void this._postSnapshot();
    });
  }

  _postToIframe(payload) {
    if (!this._iframe?.contentWindow) return;
    this._iframe.contentWindow.postMessage(payload, window.location.origin);
  }

  _postContext() {
    if (!this._hass) return;
    this._postToIframe({
      type: "ha-panel-context",
      hassUrl: window.location.origin,
      locale: this._hass.locale ?? null,
      bridgeProtocolVersion: PANEL_BRIDGE_PROTOCOL_VERSION,
      capabilities: PANEL_BRIDGE_CAPABILITIES,
    });
  }

  async _loadAreas() {
    if (!this._hass) return [];
    if (Array.isArray(this._areas)) return this._areas;
    try {
      if (typeof this._hass.callWS === "function") {
        this._areas = await this._hass.callWS({ type: "config/area_registry/list" });
      } else if (this._hass.connection?.sendMessagePromise) {
        this._areas = await this._hass.connection.sendMessagePromise({
          type: "config/area_registry/list",
        });
      } else {
        this._areas = [];
      }
    } catch {
      this._areas = [];
    }
    return this._areas;
  }

  async _postSnapshot() {
    if (!this._hass) return;
    const areas = await this._loadAreas();
    this._postToIframe({
      type: "ha-panel-snapshot",
      hassUrl: window.location.origin,
      locale: this._hass.locale ?? null,
      bridgeProtocolVersion: PANEL_BRIDGE_PROTOCOL_VERSION,
      capabilities: PANEL_BRIDGE_CAPABILITIES,
      states: this._hass.states ?? {},
      areas,
    });
    this._lastStates = this._hass.states ?? {};
  }

  _postStateChanged(entityId, state) {
    this._postToIframe({
      type: "ha-panel-state-changed",
      entityId,
      state: state ?? null,
    });
  }

  _syncToIframe() {
    if (!this._hass || !this._iframe?.contentWindow) return;

    this._postContext();

    const currentStates = this._hass.states ?? {};
    const previousStates = this._lastStates ?? {};
    const currentIds = new Set(Object.keys(currentStates));
    const previousIds = Object.keys(previousStates);

    const changedIds = [];
    for (const entityId of currentIds) {
      if (previousStates[entityId] !== currentStates[entityId]) {
        changedIds.push(entityId);
      }
    }
    for (const entityId of previousIds) {
      if (!currentIds.has(entityId)) {
        changedIds.push(entityId);
      }
    }

    if (changedIds.length === 0) return;

    if (changedIds.length > 120) {
      void this._postSnapshot();
      return;
    }

    for (const entityId of changedIds) {
      this._postStateChanged(entityId, currentStates[entityId] ?? null);
    }
    this._lastStates = currentStates;
  }

  async _onMessage(event) {
    if (event.origin !== window.location.origin) return;
    if (event.source !== this._iframe?.contentWindow) return;
    const payload = event.data;
    if (!payload || typeof payload !== "object") return;

    if (payload.type === "ha-panel-ready" || payload.type === "ha-panel-request-sync") {
      this._postContext();
      await this._postSnapshot();
      return;
    }

    if (payload.type === "ha-panel-call-service") {
      const requestId = typeof payload.requestId === "string" ? payload.requestId : "";
      try {
        if (!REQUEST_ID.test(requestId) || !isValidService(payload.domain, payload.service, payload.serviceData ?? {})) {
          throw new Error("Richiesta servizio non ammessa.");
        }
        if (!this._hass?.callService) {
          throw new Error("Home Assistant callService non disponibile.");
        }
        await this._hass.callService(payload.domain, payload.service, payload.serviceData ?? {});
        this._postToIframe({ type: "ha-panel-call-service-result", requestId, ok: true });
      } catch (error) {
        this._postToIframe({
          type: "ha-panel-call-service-result",
          requestId,
          ok: false,
          error: toBridgeErrorMessage(error, "Servizio Home Assistant fallito."),
        });
      }
      return;
    }

    if (payload.type === "ha-panel-unsubscribe-api") {
      const requestId = typeof payload.requestId === "string" ? payload.requestId : "";
      const unsubscribe = this._apiSubscriptions.get(requestId);
      if (unsubscribe) unsubscribe();
      this._apiSubscriptions.delete(requestId);
      return;
    }

    if (payload.type === "ha-panel-navigate-home") {
      const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.history.pushState({ from: currentPath }, "", "/lovelace");
      window.dispatchEvent(new CustomEvent("location-changed", {
        detail: { replace: false },
      }));
      return;
    }

    if (payload.type === "ha-panel-subscribe-api") {
      const requestId = typeof payload.requestId === "string" ? payload.requestId : "";
      try {
        const message = payload.message;
        if (!REQUEST_ID.test(requestId) || message?.type !== "domusos/irrigation/subscribe" || !isValidWsMessage(message)) {
          throw new Error("Sottoscrizione API non ammessa.");
        }
        if (!this._hass?.connection?.subscribeMessage) {
          throw new Error("Canale sottoscrizioni Home Assistant non disponibile.");
        }
        const previous = this._apiSubscriptions.get(requestId);
        if (previous) previous();
        const unsubscribe = await this._hass.connection.subscribeMessage((subscriptionEvent) => {
          this._postToIframe({
            type: "ha-panel-subscribe-api-event",
            requestId,
            event: subscriptionEvent,
          });
        }, message);
        this._apiSubscriptions.set(requestId, unsubscribe);
        this._postToIframe({ type: "ha-panel-subscribe-api-result", requestId, ok: true });
      } catch (error) {
        this._postToIframe({
          type: "ha-panel-subscribe-api-result",
          requestId,
          ok: false,
          error: toBridgeErrorMessage(error, "Sottoscrizione Home Assistant fallita."),
        });
      }
      return;
    }

    if (payload.type === "ha-panel-call-api") {
      const requestId = typeof payload.requestId === "string" ? payload.requestId : "";
      try {
        const message = payload.message;
        if (!REQUEST_ID.test(requestId) || !isValidWsMessage(message)) {
          throw new Error("Messaggio call-api non ammesso.");
        }
        let result;
        if (this._hass?.connection?.sendMessagePromise) {
          result = await this._hass.connection.sendMessagePromise(message);
        } else if (typeof this._hass?.callWS === "function") {
          result = await this._hass.callWS(message);
        } else {
          throw new Error("Canale API websocket Home Assistant non disponibile.");
        }
        this._postToIframe({
          type: "ha-panel-call-api-result",
          requestId,
          ok: true,
          result,
        });
      } catch (error) {
        this._postToIframe({
          type: "ha-panel-call-api-result",
          requestId,
          ok: false,
          error: toBridgeErrorMessage(error, "Richiesta API Home Assistant fallita."),
        });
      }
    }
  }
}

customElements.define("ha-dashboard-builder-panel", HaDashboardBuilderPanel);
```

## Protocollo messaggi

- Parent -> iframe:
  - `ha-panel-context`
  - `ha-panel-snapshot`
  - `ha-panel-state-changed`
  - `ha-panel-call-service-result`
  - `ha-panel-call-api-result`
  - `ha-panel-subscribe-api-result`
  - `ha-panel-subscribe-api-event`
- Iframe -> parent:
  - `ha-panel-ready`
  - `ha-panel-request-sync`
  - `ha-panel-navigate-home`
  - `ha-panel-call-service`
  - `ha-panel-call-api`
  - `ha-panel-subscribe-api`
  - `ha-panel-unsubscribe-api`

Il bridge accetta messaggi soltanto dal `contentWindow` dell’iframe e dallo stesso origin, valida request ID, domain, service, payload e una allowlist dei tipi WebSocket effettivamente usati. L’identità e i ruoli non vengono accettati dal payload del parent: la dashboard li richiede con `auth/current_user`, lasciando a Home Assistant l’autorità finale. Timeout e correlazione richiesta/risposta restano obbligatori anche se il browser e il parent sono controllati dallo stesso utente.

## Heartbeat e perdita del bridge

La dashboard usa `ha-panel-request-sync` anche come heartbeat same-origin. Se il parent non risponde:

- dopo 20 secondi lo stato passa a `reconnecting`;
- dopo 40 secondi passa a `offline`;
- l'ultimo snapshot resta visibile ma tutti i comandi vengono bloccati;
- il primo nuovo snapshot riporta lo stato a `connected` senza riaprire il setup.

Il bridge non trasforma mai una perdita di collegamento in un errore OAuth: l'autenticazione resta responsabilita della sessione Home Assistant che ospita il pannello.
