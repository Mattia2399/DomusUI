# Home Assistant Panel Bridge (Iframe)

Se installi la dashboard come `panel_custom` in Home Assistant, puoi evitare token/OAuth dentro l'iframe e usare direttamente la sessione HA gia autenticata del parent.

Il messaggio `ha-panel-navigate-home` porta l'utente all'interfaccia nativa usando il router pubblico del contenitore `ha-panel-custom`. La destinazione preferita è `/home/overview` quando il pannello Home è disponibile, altrimenti `/lovelace` o un altro pannello nativo effettivamente registrato. L'azione cambia soltanto la route corrente e non modifica la preferenza personale `default_panel`.
Durante lo sviluppo standalone, dove Domus UI non riceve l'elenco dei pannelli dal parent, l'azione continua ad aprire `/lovelace` sull'URL Home Assistant configurato.

Il valore `name` in `configuration.yaml` deve essere esattamente `ha-dashboard-builder-panel`, perché deve coincidere con il nome registrato tramite `customElements.define`.

## Panel JS aggiornato

```js
const PANEL_BRIDGE_PROTOCOL_VERSION = 6;
const PANEL_BRIDGE_CAPABILITIES = Object.freeze([
  "shared_configuration",
  "app_configurations",
  "revision_history",
  "dashboard_reset_marker",
  "irrigation_core",
  "energy_core",
  "calendar_v1",
  "waste_collection_v1",
  "profile_core_v1",
  "profile_devices_v1",
  "profile_notifications_v1",
  "profile_recipients_v1",
  "device_power_v1",
  "device_timers_v1",
  "statistics_v1",
  "access_v1",
  "access_admin_v1",
  "state_translations_v1",
  "host_navigation",
  "person_links",
  "person_create",
  "person_picture",
]);
const ALLOWED_WS_TYPES = new Set([
  "auth/current_user", "auth/list", "config/auth/list", "get_services",
  "weather/get_forecasts", "call_service", "history/history_during_period",
  "recorder/statistics_during_period",
  "logbook/get_events", "get_panels",
  "frontend/get_translations",
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
  "domusos/waste_collection/get_config", "domusos/waste_collection/save_config",
  "domusos/waste_collection/preview", "domusos/waste_collection/test_notification",
  "domusos/energy/get_state", "domusos/energy/get_history", "domusos/energy/discover",
  "domusos/energy/get_profile", "domusos/energy/save_profile",
  "domusos/profile/get_self", "domusos/profile/save_self",
  "domusos/profile/discover_devices", "domusos/profile/add_device",
  "domusos/profile/remove_device", "domusos/profile/update_device",
  "domusos/profile/test_self", "domusos/profile/list_recipients",
  "domusos/device_power/get_state", "domusos/device_power/save_policy",
  "domusos/device_power/bind_policy", "domusos/device_power/delete_policy",
  "domusos/device_timers/get_state", "domusos/device_timers/subscribe",
  "domusos/device_timers/set_timer", "domusos/device_timers/cancel_timer",
  "domusos/access/get_self",
  "domusos/access/list_accounts", "domusos/access/set_assignment",
  "domusos/access/remove_assignment", "domusos/access/reset_policy",
  "domusos/house/get_topology", "domusos/house/get_snapshot",
  "calendar/event/subscribe", "calendar/event/create",
  "calendar/event/update", "calendar/event/delete",
  "person/list", "person/update", "person/create",
]);
// The only subscriptions: what changes while a page is open.
const SUBSCRIBE_TYPES = new Set(["domusos/irrigation/subscribe", "domusos/device_timers/subscribe", "calendar/event/subscribe"]);
const HA_NAME = /^[a-z0-9_]+$/;
const REQUEST_ID = /^ha-panel-(?:call-(?:service|api)|subscribe-api|upload-image)-\d{10,}-[a-z0-9]+$/;
// Person pictures: Domus uploads a small square image, stored like the HA frontend does.
const IMAGE_UPLOAD_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;
const PERSON_PICTURE_URL = /^\/api\/image\/serve\/[a-f0-9]{32}\/512x512$/;
const isValidImageUpload = (file) =>
  file instanceof Blob && IMAGE_UPLOAD_TYPES.has(file.type) && file.size > 0 && file.size <= MAX_IMAGE_UPLOAD_BYTES;
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
const normalizeNativePanelPath = (value) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/^\/+/, "");
  if (!normalized || normalized === "domusos" || normalized.includes("..") || !/^[a-z0-9][a-z0-9_/-]*$/i.test(normalized)) {
    return null;
  }
  return `/${normalized}`;
};
const resolveNativeHomePath = (hass) => {
  const panels = isRecord(hass?.panels) ? hass.panels : {};
  if (isRecord(panels.home)) return "/home/overview";
  if (isRecord(panels.lovelace)) return "/lovelace";

  const preferredNativePanels = ["energy", "map", "logbook", "history", "calendar", "todo", "media-browser", "config"];
  for (const panelKey of preferredNativePanels) {
    const panel = panels[panelKey];
    if (!isRecord(panel) || ["custom", "ha-panel-custom", "iframe"].includes(panel.component_name)) continue;
    const path = normalizeNativePanelPath(panel.url_path ?? panelKey);
    if (path) return path;
  }

  for (const [panelKey, panel] of Object.entries(panels)) {
    if (!isRecord(panel) || ["custom", "ha-panel-custom", "iframe"].includes(panel.component_name)) continue;
    const path = normalizeNativePanelPath(panel.url_path ?? panelKey);
    if (path) return path;
  }

  // Last-resort route for very old/incomplete frontend payloads.
  return "/lovelace";
};
const navigateToNativeHome = (hostPanel, hass, browserNavigate = (path) => window.location.assign(path)) => {
  const targetPath = resolveNativeHomePath(hass);
  if (typeof hostPanel?.navigate === "function") {
    try {
      hostPanel.navigate(targetPath);
      return targetPath;
    } catch {
      // A real navigation is safer than reproducing the HA router manually.
    }
  }
  browserNavigate(targetPath);
  return targetPath;
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
// person/update may only (un)link a login: every field of the person record is
// required and shape-checked, so a malformed request cannot wipe a person.
const PERSON_UPDATE_KEYS = ["type", "person_id", "name", "user_id", "device_trackers", "picture"];
// person/create sets a name and, optionally, a login and a picture uploaded by Domus: no trackers.
const PERSON_CREATE_KEYS = ["type", "name", "user_id", "device_trackers", "picture"];
const hasExactKeys = (message, keys) =>
  Object.keys(message).every((key) => keys.includes(key)) && keys.every((key) => key in message);
const isValidPersonCreate = (message) =>
  hasExactKeys(message, PERSON_CREATE_KEYS) &&
  typeof message.name === "string" && Boolean(message.name.trim()) && message.name.length <= 255 &&
  (message.user_id === null || (typeof message.user_id === "string" && /^[a-f0-9]{32}$/.test(message.user_id))) &&
  Array.isArray(message.device_trackers) && message.device_trackers.length === 0 &&
  (message.picture === null || (typeof message.picture === "string" && PERSON_PICTURE_URL.test(message.picture)));
const isValidPersonUpdate = (message) => {
  if (!hasExactKeys(message, PERSON_UPDATE_KEYS)) return false;
  if (typeof message.person_id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(message.person_id)) return false;
  if (typeof message.name !== "string" || !message.name.trim() || message.name.length > 255) return false;
  if (message.user_id !== null && (typeof message.user_id !== "string" || !/^[a-f0-9]{32}$/.test(message.user_id))) return false;
  if (!Array.isArray(message.device_trackers) || message.device_trackers.length > 100 ||
      !message.device_trackers.every((entity) => typeof entity === "string" && /^device_tracker\.[a-z0-9_]+$/.test(entity))) return false;
  return message.picture === null || (typeof message.picture === "string" && message.picture.length <= 2048);
};
// Exact save shapes: a v1 profile (modules) or a whole Energy Profile v2 (plant), never both.
const ENERGY_SAVES = { profile: ["modules", 20_000], profile_v2: ["plant", 131_072] };
// History reads take only their own parameters; Home Assistant checks the period.
const ENERGY_HISTORY_KEYS = ["type", "range", "start", "end", "bucket", "include_devices", "compare"];
// Energy commands carry no parameters, except a history read and an exact-shape profile save.
// Home Assistant still enforces administrator rights on discovery and profiles.
const isValidEnergyMessage = (message) => {
  if (message.type === "domusos/energy/get_history") {
    return Object.keys(message).every((key) => ENERGY_HISTORY_KEYS.includes(key)) &&
      ["range", "start", "end", "bucket"].every((key) => !(key in message) || (typeof message[key] === "string" && message[key].length <= 40)) &&
      (!("include_devices" in message) || typeof message.include_devices === "boolean") &&
      (!("compare" in message) || message.compare === "previous");
  }
  if (message.type !== "domusos/energy/save_profile") {
    return Object.keys(message).every((key) => key === "type");
  }
  const field = "profile_v2" in message ? "profile_v2" : "profile";
  const [content, limit] = ENERGY_SAVES[field];
  const document = message[field];
  if (!hasExactKeys(message, ["type", field, "expected_revision"]) || !isRecord(document) || !isRecord(document[content])) return false;
  const revision = message.expected_revision;
  if (revision !== null && (!Number.isInteger(revision) || revision < 0)) return false;
  try {
    return JSON.stringify(document).length <= limit;
  } catch {
    return false;
  }
};
// Profile commands act on the signed-in user only: no user, person or owner id is ever
// accepted. A save carries the revision it read and the self-editable fields only.
const PROFILE_SELF_KEYS = ["notifications", "preferences", "personal_devices"];
const isValidProfileMessage = (message) => {
  // Device commands: the server creates ids and dates; the client names a device, never a record.
  const keys = Object.keys(message);
  const isRevision = (value) => Number.isInteger(value) && value >= 0;
  const isLabel = (value) => value === null || (typeof value === "string" && value.length <= 256);
  const isHaDevice = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value);
  const isPersonalDevice = (value) => typeof value === "string" && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(value);
  // list_recipients is administrative: Home Assistant refuses it to anyone else.
  if (message.type === "domusos/profile/get_self" ||
      message.type === "domusos/profile/discover_devices" ||
      message.type === "domusos/profile/list_recipients") return hasExactKeys(message, ["type"]);
  // The test text is chosen by the server; the client may only name one of its own devices.
  if (message.type === "domusos/profile/test_self") {
    return keys.every((key) => key === "type" || key === "personal_device_id") &&
      (!("personal_device_id" in message) || isPersonalDevice(message.personal_device_id));
  }
  if (message.type === "domusos/profile/add_device") {
    return keys.every((key) => ["type", "expected_revision", "ha_device_id", "label"].includes(key)) &&
      isRevision(message.expected_revision) && isHaDevice(message.ha_device_id) &&
      (!("label" in message) || isLabel(message.label));
  }
  if (message.type === "domusos/profile/remove_device") {
    return hasExactKeys(message, ["type", "expected_revision", "device_id"]) &&
      isRevision(message.expected_revision) && isPersonalDevice(message.device_id);
  }
  if (message.type === "domusos/profile/update_device") {
    return keys.every((key) => ["type", "expected_revision", "device_id", "label", "notifications"].includes(key)) &&
      ("label" in message || "notifications" in message) &&
      isRevision(message.expected_revision) && isPersonalDevice(message.device_id) &&
      (!("label" in message) || isLabel(message.label)) &&
      (!("notifications" in message) || (isRecord(message.notifications) &&
        hasExactKeys(message.notifications, ["enabled"]) && typeof message.notifications.enabled === "boolean"));
  }
  if (message.type !== "domusos/profile/save_self") return false;
  const { profile, expected_revision: revision } = message;
  if (!hasExactKeys(message, ["type", "expected_revision", "profile"]) ||
      !Number.isInteger(revision) || revision < 0 ||
      !isRecord(profile) || !Object.keys(profile).every((key) => PROFILE_SELF_KEYS.includes(key)) ||
      !isRecord(profile.notifications) || !hasExactKeys(profile.notifications, ["enabled"]) ||
      typeof profile.notifications.enabled !== "boolean" ||
      ("preferences" in profile && !isRecord(profile.preferences)) ||
      ("personal_devices" in profile && !Array.isArray(profile.personal_devices))) return false;
  try {
    return JSON.stringify(profile).length <= 20_000;
  } catch {
    return false;
  }
};
// Device power is administrative and never switches anything itself: a client sends a
// policy (a battery sensor, a charger switch and two thresholds), and Home Assistant's
// controllers do the rest. There is no command that turns a switch on or off.
const DEVICE_POWER_POLICY_KEYS = [
  "client_id", "label", "enabled", "battery_entity_id", "switch_entity_id",
  "start_threshold", "stop_threshold",
];
const isValidDevicePowerMessage = (message) => {
  const isPolicyId = (value) => typeof value === "string" && /^[a-f0-9]{32}$/.test(value);
  const isRevision = (value) => Number.isInteger(value) && value >= 1;
  const isClientId = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(value);
  const isEntity = (value, domain) =>
    typeof value === "string" && value.startsWith(`${domain}.`) && /^[a-z0-9_]+\.[a-z0-9_]+$/.test(value);
  const isThreshold = (value) => Number.isInteger(value) && value >= 0 && value <= 100;
  if (message.type === "domusos/device_power/get_state") return hasExactKeys(message, ["type"]);
  if (message.type === "domusos/device_power/delete_policy") {
    return hasExactKeys(message, ["type", "policy_id", "expected_revision"]) &&
      isPolicyId(message.policy_id) && isRevision(message.expected_revision);
  }
  if (message.type === "domusos/device_power/bind_policy") {
    return hasExactKeys(message, ["type", "policy_id", "expected_revision", "client_id"]) &&
      isPolicyId(message.policy_id) && isRevision(message.expected_revision) && isClientId(message.client_id);
  }
  if (message.type !== "domusos/device_power/save_policy") return false;
  const keys = Object.keys(message);
  const { policy } = message;
  // A new policy has no id and no revision; a change carries both.
  const isNew = !("policy_id" in message) && !("expected_revision" in message);
  const isChange = isPolicyId(message.policy_id) && isRevision(message.expected_revision);
  return keys.every((key) => ["type", "policy_id", "expected_revision", "policy"].includes(key)) &&
    (isNew || isChange) &&
    isRecord(policy) && hasExactKeys(policy, DEVICE_POWER_POLICY_KEYS) &&
    (policy.client_id === null || isClientId(policy.client_id)) &&
    (policy.label === null || (typeof policy.label === "string" && policy.label.length <= 64)) &&
    typeof policy.enabled === "boolean" &&
    isEntity(policy.battery_entity_id, "sensor") && isEntity(policy.switch_entity_id, "switch") &&
    isThreshold(policy.start_threshold) && isThreshold(policy.stop_threshold) &&
    policy.start_threshold < policy.stop_threshold;
};
// Device timers: a device that switches itself off after a few minutes. Home Assistant
// checks that the person may control the device, and switches it off itself.
const DEVICE_TIMER_ENTITY = /^(?:switch|fan|humidifier|light)\.[a-z0-9_]+$/;
const isValidDeviceTimerMessage = (message) => {
  const isDevice = (value) => typeof value === "string" && DEVICE_TIMER_ENTITY.test(value);
  if (message.type === "domusos/device_timers/get_state" || message.type === "domusos/device_timers/subscribe") {
    return hasExactKeys(message, ["type"]);
  }
  if (message.type === "domusos/device_timers/cancel_timer") {
    return hasExactKeys(message, ["type", "entity_id"]) && isDevice(message.entity_id);
  }
  return message.type === "domusos/device_timers/set_timer" &&
    hasExactKeys(message, ["type", "entity_id", "minutes"]) && isDevice(message.entity_id) &&
    Number.isInteger(message.minutes) && message.minutes >= 1 && message.minutes <= 1440;
};
// Long-term statistics are read only: a few sensors, the periods and units of a meter.
const STATISTICS_KEYS = ["type", "start_time", "end_time", "statistic_ids", "period", "types", "units"];
const STATISTICS_PERIODS = ["5minute", "hour", "day", "week", "month"];
const STATISTICS_UNITS = { energy: ["Wh", "kWh", "MWh"], power: ["W", "kW"] };
const isValidStatisticsMessage = (message) =>
  hasExactKeys(message, STATISTICS_KEYS) &&
  [message.start_time, message.end_time].every((value) =>
    typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value))) &&
  Array.isArray(message.statistic_ids) && message.statistic_ids.length >= 1 && message.statistic_ids.length <= 10 &&
  message.statistic_ids.every((id) => typeof id === "string" && /^sensor\.[a-z0-9_]+$/.test(id)) &&
  STATISTICS_PERIODS.includes(message.period) &&
  Array.isArray(message.types) && message.types.length >= 1 && message.types.length <= 2 &&
  message.types.every((type) => type === "change" || type === "mean") &&
  isRecord(message.units) && Object.entries(message.units).every(([kind, unit]) =>
    Object.prototype.hasOwnProperty.call(STATISTICS_UNITS, kind) && STATISTICS_UNITS[kind].includes(unit));
// Only the words for entity states, in one language: no integration or config flow text.
const isValidTranslationsMessage = (message) =>
  hasExactKeys(message, ["type", "language", "category"]) &&
  typeof message.language === "string" && /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(message.language) &&
  (message.category === "entity_component" || message.category === "entity");
const isValidWsMessage = (message) => {
  if (!isRecord(message) || typeof message.type !== "string" || !ALLOWED_WS_TYPES.has(message.type)) return false;
  if (message.type === "domusos/house/get_topology" || message.type === "domusos/house/get_snapshot") {
    return hasExactKeys(message, ["type"]);
  }
  if (message.type.startsWith("domusos/energy/")) {
    return isValidEnergyMessage(message);
  }
  if (message.type.startsWith("domusos/profile/")) {
    return isValidProfileMessage(message);
  }
  if (message.type.startsWith("domusos/device_power/")) {
    return isValidDevicePowerMessage(message);
  }
  if (message.type.startsWith("domusos/device_timers/")) {
    return isValidDeviceTimerMessage(message);
  }
  if (message.type === "recorder/statistics_during_period") {
    return isValidStatisticsMessage(message);
  }
  // The account is the connection's: get_self names no user, role or capability.
  if (message.type === "domusos/access/get_self") return hasExactKeys(message, ["type"]);
  // People and access: the panel runs them on the signed-in person's own connection, so Home
  // Assistant and Domus check that person. Only the account to change travels, never who acts.
  if (message.type === "domusos/access/list_accounts" || message.type === "domusos/access/reset_policy") {
    return hasExactKeys(message, ["type"]);
  }
  if (message.type === "domusos/access/set_assignment" || message.type === "domusos/access/remove_assignment") {
    const setting = message.type === "domusos/access/set_assignment";
    const keys = setting ? ["type", "user_id", "role", "grants", "expected_revision"] : ["type", "user_id", "expected_revision"];
    if (!hasExactKeys(message, keys)) return false;
    if (typeof message.user_id !== "string" || !/^[a-f0-9]{32}$/.test(message.user_id)) return false;
    if (!Number.isInteger(message.expected_revision) || message.expected_revision < 0) return false;
    if (!setting) return true;
    return ["admin", "resident", "member", "restricted", "wall_panel"].includes(message.role) &&
      Array.isArray(message.grants) && message.grants.length <= 2 &&
      message.grants.every((grant) => grant === "access.control" || grant === "security.control");
  }
  if (message.type === "get_panels") {
    return Object.keys(message).every((key) => key === "type");
  }
  if (message.type === "frontend/get_translations") {
    return isValidTranslationsMessage(message);
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
  if (message.type === "person/list") {
    return Object.keys(message).every((key) => key === "type");
  }
  if (message.type === "person/update") {
    return isValidPersonUpdate(message);
  }
  if (message.type === "person/create") {
    return isValidPersonCreate(message);
  }
  if (message.type.startsWith("domusos/waste_collection/")) {
    if (message.type === "domusos/waste_collection/get_config" ||
        message.type === "domusos/waste_collection/test_notification") {
      return Object.keys(message).every((key) => key === "type");
    }
    if (message.type === "domusos/waste_collection/preview") {
      return Object.keys(message).every((key) => key === "type" || key === "days") &&
        Number.isInteger(message.days) && message.days >= 1 && message.days <= 31;
    }
    if (message.type === "domusos/waste_collection/save_config") {
      if (!isRecord(message.config) ||
          !(message.expected_revision === null || Number.isInteger(message.expected_revision)) ||
          !Object.keys(message).every((key) => ["type", "config", "expected_revision"].includes(key))) return false;
      try {
        return JSON.stringify(message.config).length <= 100000;
      } catch {
        return false;
      }
    }
  }
  if (message.type.startsWith("calendar/event/")) {
    if (typeof message.entity_id !== "string" || !/^calendar\.[a-z0-9_]+$/.test(message.entity_id)) return false;
    if (message.type === "calendar/event/subscribe") {
      return typeof message.start === "string" && Number.isFinite(Date.parse(message.start)) &&
        typeof message.end === "string" && Number.isFinite(Date.parse(message.end));
    }
    if (message.type === "calendar/event/delete") {
      return typeof message.uid === "string" && message.uid.length > 0 && message.uid.length <= 512;
    }
    if (message.type === "calendar/event/update" &&
        (typeof message.uid !== "string" || message.uid.length === 0 || message.uid.length > 512)) return false;
    if (!isRecord(message.event) || typeof message.event.start !== "string" ||
        typeof message.event.end !== "string" || typeof message.event.summary !== "string" ||
        !message.event.summary.trim() || message.event.summary.length > 512) return false;
    try {
      return JSON.stringify(message.event).length <= 20000;
    } catch {
      return false;
    }
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
    this._isNavigatingHome = false;
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
    // Kiosk mode: Domus may ask for full screen and to keep the screen on, for its own frame only.
    this._iframe.allow = "fullscreen; screen-wake-lock";
    this._iframe.allowFullscreen = true;
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
      if (this._isNavigatingHome) return;
      this._isNavigatingHome = true;
      const hostPanel = this.closest("ha-panel-custom");
      try {
        navigateToNativeHome(hostPanel, this._hass);
      } catch {
        // A failed full navigation is the only case in which retrying is useful.
        this._isNavigatingHome = false;
      }
      return;
    }

    if (payload.type === "ha-panel-subscribe-api") {
      const requestId = typeof payload.requestId === "string" ? payload.requestId : "";
      try {
        const message = payload.message;
        if (!REQUEST_ID.test(requestId) ||
            !SUBSCRIBE_TYPES.has(message?.type) ||
            !isValidWsMessage(message)) {
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

    if (payload.type === "ha-panel-upload-image") {
      const requestId = typeof payload.requestId === "string" ? payload.requestId : "";
      try {
        if (!REQUEST_ID.test(requestId) || !isValidImageUpload(payload.file)) {
          throw new Error("Immagine non ammessa.");
        }
        if (!this._hass?.user?.is_admin) {
          throw new Error("Serve un amministratore Home Assistant.");
        }
        if (typeof this._hass.fetchWithAuth !== "function") {
          throw new Error("Caricamento immagini Home Assistant non disponibile.");
        }
        const body = new FormData();
        body.append("file", payload.file, "domus-person-picture");
        const response = await this._hass.fetchWithAuth("/api/image/upload", { method: "POST", body });
        if (!response.ok) {
          throw new Error(`Caricamento immagine rifiutato da Home Assistant (${response.status}).`);
        }
        const uploaded = await response.json();
        if (!isRecord(uploaded) || typeof uploaded.id !== "string" || !/^[a-f0-9]{32}$/.test(uploaded.id)) {
          throw new Error("Risposta di caricamento immagine non valida.");
        }
        this._postToIframe({ type: "ha-panel-upload-image-result", requestId, ok: true, result: { id: uploaded.id } });
      } catch (error) {
        this._postToIframe({
          type: "ha-panel-upload-image-result",
          requestId,
          ok: false,
          error: toBridgeErrorMessage(error, "Caricamento immagine Home Assistant fallito."),
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
  - `ha-panel-upload-image-result`
- Iframe -> parent:
  - `ha-panel-ready`
  - `ha-panel-request-sync`
  - `ha-panel-navigate-home`
  - `ha-panel-call-service`
  - `ha-panel-call-api`
  - `ha-panel-subscribe-api`
  - `ha-panel-unsubscribe-api`
  - `ha-panel-upload-image`

`ha-panel-upload-image` (capability `person_picture`) carica la foto di una persona con `/api/image/upload`, come il frontend Home Assistant. Il bridge accetta solo immagini JPEG, PNG o WebP fino a 5 MB e solo per un amministratore; restituisce l'id dell'immagine, che Domus salva nella persona come `/api/image/serve/<id>/512x512`.

`domusos/profile/get_self` e `domusos/profile/save_self` (capability `profile_core_v1`) leggono e salvano il Domus Profile dell'utente collegato, ricavato da Home Assistant dalla connessione. Il bridge rifiuta qualsiasi id di utente, persona o proprietario: `get_self` accetta solo `type`, `save_self` solo `expected_revision` (intero, mai `null`) e un `profile` con `notifications: { enabled }` più, invariati, `preferences` e `personal_devices`. Home Assistant e il Profile Core ripetono gli stessi controlli.

L'elenco dei destinatari (capability `profile_recipients_v1`) è `domusos/profile/list_recipients`, solo per amministratori e senza parametri: per ogni persona restituisce id interno, entità, stato di prontezza e se è selezionabile, mai account, dispositivi, preferenze o target. Home Assistant rifiuta la richiesta a chi non è amministratore.

Le traduzioni degli stati (capability `state_translations_v1`) sono `frontend/get_translations` con solo `type`, `language` e `category`, e `category` può essere soltanto `entity_component` o `entity`: Domus legge le stesse parole che il frontend Home Assistant usa per gli stati delle entità ("Acceso", "Aperta", "Fuori casa"). Senza la capability Domus usa un piccolo dizionario proprio.

I timer di spegnimento (capability `device_timers_v1`) usano quattro comandi: `domusos/device_timers/get_state` e `subscribe` (solo `type`), `set_timer` (esattamente `entity_id` di tipo `switch.*`, `fan.*` o `humidifier.*` e `minutes` intero da 1 a 1440) e `cancel_timer` (solo `entity_id`). Home Assistant verifica che la persona possa comandare quel dispositivo, e lo spegnimento lo fa l'integrazione allo scadere del timer. `subscribe` è l'unica sottoscrizione oltre a irrigazione e calendario.

Le statistiche a lungo termine (capability `statistics_v1`) sono `recorder/statistics_during_period` in sola lettura, con esattamente `start_time`, `end_time`, da 1 a 10 `statistic_ids` di tipo `sensor.*`, un `period` tra `5minute`, `hour`, `day`, `week` e `month`, `types` tra `change` e `mean`, e `units` solo per `energy` (Wh, kWh, MWh) e `power` (W, kW). Servono al consumo di una presa nella pagina Stanze.

La gestione dell'alimentazione dei dispositivi (capability `device_power_v1`) usa quattro comandi, tutti riservati agli amministratori: `domusos/device_power/get_state` (solo `type`), `save_policy` (una `policy` con esattamente `client_id`, `label`, `enabled`, `battery_entity_id` di tipo `sensor.*`, `switch_entity_id` di tipo `switch.*`, `start_threshold` e `stop_threshold` interi con inizio minore della fine; senza `policy_id` né `expected_revision` per una nuova policy, con entrambi per modificarne una), `bind_policy` (`policy_id`, `expected_revision`, `client_id`) e `delete_policy` (`policy_id`, `expected_revision`). Non esiste un comando che accenda o spenga uno switch: i controller girano in Home Assistant, che ripete ogni controllo. Vedi [Device Power Management](device-power-management.md).

Il profilo d'accesso (capability `access_v1`) è `domusos/access/get_self`, con solo `type`: Domus lo legge per mostrare all'account ciò che può usare, e il backend ricava l'account dalla connessione.

Persone e accessi (capability `access_admin_v1`) usa `domusos/access/list_accounts` e `reset_policy` (solo `type`), `set_assignment` (`user_id` di 32 caratteri esadecimali, `role` tra `admin`, `resident`, `member`, `restricted`, `wall_panel`, `grants` con al più `access.control` e `security.control`, `expected_revision` intero) e `remove_assignment` (`user_id`, `expected_revision`). Il pannello li esegue sulla connessione della persona che lo ha aperto: Home Assistant e Domus controllano quella persona (admin HA attivo con `access.manage`), mai un'identità del pannello. Chi modifica e quando li scrive il server. La diagnostica shadow resta fuori dal bridge.

La notifica di prova (capability `profile_notifications_v1`) è `domusos/profile/test_self`, che accetta solo `type` e un `personal_device_id` facoltativo: il testo lo decide Home Assistant e non si possono indicare destinatari, persone, utenti, servizi o target. Non esiste un comando generico per inviare notifiche: il Notification Router è solo backend.

I dispositivi personali (capability `profile_devices_v1`) cambiano solo con comandi dedicati: `discover_devices` (solo `type`), `add_device` (`expected_revision`, `ha_device_id`, `label` facoltativa), `remove_device` (`expected_revision`, `device_id`) e `update_device` (`expected_revision`, `device_id` e almeno uno tra `label` e `notifications: { enabled }`). Il client non sceglie mai id né data di un nuovo dispositivo: li genera il Profile Core, che verifica la proprietà con Home Assistant al momento dell'aggiunta.

## Navigazione verso Home Assistant

`ha-panel-navigate-home` è una navigazione temporanea: non legge né scrive `frontend/set_user_data` e quindi non modifica mai `default_panel` o l'opzione “Apri Domus UI all'avvio”. Il bridge individua il contenitore tramite `this.closest("ha-panel-custom")` e chiama il suo metodo pubblico `navigate(targetPath)`, lasciando al router Home Assistant la gestione di history, smontaggio del pannello e Companion WebView.

La destinazione è risolta in questo ordine:

1. `/home/overview` se `hass.panels.home` è registrato;
2. `/lovelace` se `hass.panels.lovelace` è registrato;
3. un pannello nativo presente in `hass.panels`, escludendo Domus e pannelli custom/iframe;
4. `/lovelace` come ultima compatibilità per frontend molto vecchi o payload incompleti.

Se il contenitore o `navigate()` non sono disponibili, oppure il router genera un errore sincrono, il bridge usa `window.location.assign(targetPath)`. Il fallback forza una navigazione reale e non simula mai il router tramite `history.pushState`, `history.replaceState` o eventi `location-changed` manuali. Una guardia locale scarta i doppi tap mentre la navigazione è in corso.

L'iframe di Domus ha `allow="fullscreen; screen-wake-lock"`: la [modalità Kiosk](device-kiosk.md) può chiedere lo schermo intero e lo schermo acceso per Domus stessa, senza toccare il frontend di Home Assistant.

Il bridge accetta messaggi soltanto dal `contentWindow` dell’iframe e dallo stesso origin, valida request ID, domain, service, payload e una allowlist dei tipi WebSocket effettivamente usati. L’identità e i ruoli non vengono accettati dal payload del parent: la dashboard li richiede con `auth/current_user`, lasciando a Home Assistant l’autorità finale. Timeout e correlazione richiesta/risposta restano obbligatori anche se il browser e il parent sono controllati dallo stesso utente.

## Heartbeat e perdita del bridge

La dashboard usa `ha-panel-request-sync` anche come heartbeat same-origin. Se il parent non risponde:

- dopo 20 secondi lo stato passa a `reconnecting`;
- dopo 40 secondi passa a `offline`;
- l'ultimo snapshot resta visibile ma tutti i comandi vengono bloccati;
- il primo nuovo snapshot riporta lo stato a `connected` senza riaprire il setup.

Il bridge non trasforma mai una perdita di collegamento in un errore OAuth: l'autenticazione resta responsabilita della sessione Home Assistant che ospita il pannello.
