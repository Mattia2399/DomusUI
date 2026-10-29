"""Self-service websocket API for the Domus Profile.

Every command acts on the authenticated user of the connection only: none
takes a user, person or owner id, and Home Assistant rejects unknown keys.

Devices change through dedicated commands rather than ``save_self``: the
server generates the id and the date of every new record, and verifies each
claim on its own inside the document lock.

``test_self`` sends a fixed test notification to the user's own devices. It is
not a send endpoint: it takes no text, recipient or target.

``list_recipients`` is the only administrator command: it lists people as
possible notification recipients with a readiness status, and never says
where (devices, targets, preferences) a person would be notified.
"""

from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from ..access.instrumentation import register_websocket_commands
from ..const import DOMAIN
from ..notifications import DATA_NOTIFICATION_ROUTER, NotificationError, NotificationRouter
from ..notifications.models import NotificationRouterUnavailableError
from ..notifications.recipients import async_list_readiness
from .devices import DeviceInspector
from .identity import list_persons, require_household_account, resolve_user_person
from .manager import ProfileManager, ProfileView
from .models import HA_ID_PATTERN, DEVICE_ID_PATTERN, ProfileError, ProfileUnavailableError

_LOGGER = logging.getLogger(__name__)

WS_PREFIX = f"{DOMAIN}/profile"
DATA_PROFILE_MANAGER = "profile_manager"


def _manager(hass: HomeAssistant) -> ProfileManager:
    manager = hass.data.get(DOMAIN, {}).get(DATA_PROFILE_MANAGER)
    if not isinstance(manager, ProfileManager):
        raise ProfileUnavailableError("The Domus Profile Core is not running")
    return manager


def _router(hass: HomeAssistant) -> NotificationRouter:
    router = hass.data.get(DOMAIN, {}).get(DATA_NOTIFICATION_ROUTER)
    if not isinstance(router, NotificationRouter):
        raise NotificationRouterUnavailableError("Domus notifications are not running")
    return router


def _send_error(connection: websocket_api.ActiveConnection, message_id: int, err: Exception) -> None:
    if isinstance(err, (ProfileError, NotificationError)):
        connection.send_error(message_id, err.code, str(err))
        return
    _LOGGER.exception("Unexpected Domus Profile error", exc_info=err)
    connection.send_error(message_id, "unknown_error", "The profile request could not be completed")


def _revision(value: Any) -> int:
    """Accept a non-negative integer revision; booleans are not revisions."""
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise vol.Invalid("expected_revision must be a non-negative integer")
    return value


def _pattern(pattern: Any, name: str) -> Any:
    def validate(value: Any) -> str:
        if not isinstance(value, str) or not pattern.fullmatch(value):
            raise vol.Invalid(f"invalid {name}")
        return value

    return validate


_HA_DEVICE_ID = _pattern(HA_ID_PATTERN, "Home Assistant device id")
_DEVICE_ID = _pattern(DEVICE_ID_PATTERN, "personal device id")
# The label is canonicalized and length-checked by the manager; this only bounds the input.
_LABEL = vol.Any(None, vol.All(str, vol.Length(max=256)))


def _self_result(
    hass: HomeAssistant, manager: ProfileManager, user_id: str, view: ProfileView
) -> dict[str, Any]:
    resolution = resolve_user_person(list_persons(hass), user_id)
    person = resolution.person
    devices = view.profile.personal_devices if view.profile is not None else ()
    inspector = DeviceInspector(hass, user_id) if devices else None
    return {
        "owner": {
            "user_id": user_id,
            # Presentation only, read live: never persisted in the profile.
            "person_id": person.person_id if person is not None else None,
            "person_entity_id": person.entity_id if person is not None else None,
            "person_status": resolution.status.value,
        },
        "persisted": view.persisted,
        # Stored data, exactly as saved.
        "profile": view.as_dict(),
        # Derived live from Home Assistant on every request; never stored.
        "live_devices": [inspector.live_device(device) for device in devices] if inspector else [],
        "revision": view.revision,
    }


@websocket_api.websocket_command({vol.Required("type"): f"{WS_PREFIX}/get_self"})
@websocket_api.async_response
async def websocket_get_self(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return the authenticated user's own profile."""
    try:
        user_id = require_household_account(connection.user)
        manager = _manager(hass)
        view = manager.get_profile(user_id)
        connection.send_result(msg["id"], _self_result(hass, manager, user_id, view))
    except Exception as err:  # noqa: BLE001 - every failure gets a stable error code
        _send_error(connection, msg["id"], err)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/save_self",
        vol.Required("expected_revision"): _revision,
        vol.Required("profile"): dict,
    }
)
@websocket_api.async_response
async def websocket_save_self(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Save the authenticated user's own profile when the revision matches."""
    try:
        user_id = require_household_account(connection.user)
        manager = _manager(hass)
        view = await manager.async_save_self(user_id, msg["expected_revision"], msg["profile"])
        connection.send_result(msg["id"], _self_result(hass, manager, user_id, view))
    except Exception as err:  # noqa: BLE001 - every failure gets a stable error code
        _send_error(connection, msg["id"], err)


@websocket_api.websocket_command({vol.Required("type"): f"{WS_PREFIX}/discover_devices"})
@websocket_api.async_response
async def websocket_discover_devices(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """List the devices Home Assistant ties to the user; nothing is written or granted."""
    try:
        user_id = require_household_account(connection.user)
        manager = _manager(hass)
        view = manager.get_profile(user_id)
        own = view.profile.personal_devices if view.profile is not None else ()
        devices = DeviceInspector(hass, user_id).discover(own)
        connection.send_result(msg["id"], {"devices": devices, "revision": view.revision})
    except Exception as err:  # noqa: BLE001 - every failure gets a stable error code
        _send_error(connection, msg["id"], err)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/add_device",
        vol.Required("expected_revision"): _revision,
        vol.Required("ha_device_id"): _HA_DEVICE_ID,
        vol.Optional("label"): _LABEL,
    }
)
@websocket_api.async_response
async def websocket_add_device(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Add a verified device to the user's profile."""
    try:
        user_id = require_household_account(connection.user)
        manager = _manager(hass)
        view = await manager.async_add_device(
            user_id, msg["expected_revision"], msg["ha_device_id"], msg.get("label")
        )
        connection.send_result(msg["id"], _self_result(hass, manager, user_id, view))
    except Exception as err:  # noqa: BLE001 - every failure gets a stable error code
        _send_error(connection, msg["id"], err)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/remove_device",
        vol.Required("expected_revision"): _revision,
        vol.Required("device_id"): _DEVICE_ID,
    }
)
@websocket_api.async_response
async def websocket_remove_device(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Remove one of the user's devices."""
    try:
        user_id = require_household_account(connection.user)
        manager = _manager(hass)
        view = await manager.async_remove_device(user_id, msg["expected_revision"], msg["device_id"])
        connection.send_result(msg["id"], _self_result(hass, manager, user_id, view))
    except Exception as err:  # noqa: BLE001 - every failure gets a stable error code
        _send_error(connection, msg["id"], err)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/update_device",
        vol.Required("expected_revision"): _revision,
        vol.Required("device_id"): _DEVICE_ID,
        vol.Optional("label"): _LABEL,
        vol.Optional("notifications"): {vol.Required("enabled"): bool},
    }
)
@websocket_api.async_response
async def websocket_update_device(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Change the label or the notification switch of one of the user's devices."""
    try:
        user_id = require_household_account(connection.user)
        changes: dict[str, Any] = {}
        if "label" in msg:
            changes["label"] = msg["label"]
        if "notifications" in msg:
            changes["notifications_enabled"] = msg["notifications"]["enabled"]
        manager = _manager(hass)
        view = await manager.async_update_device(
            user_id, msg["expected_revision"], msg["device_id"], changes
        )
        connection.send_result(msg["id"], _self_result(hass, manager, user_id, view))
    except Exception as err:  # noqa: BLE001 - every failure gets a stable error code
        _send_error(connection, msg["id"], err)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/test_self",
        vol.Optional("personal_device_id"): _DEVICE_ID,
    }
)
@websocket_api.async_response
async def websocket_test_self(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Send the fixed test notification to the user's own enabled devices, or to one of them."""
    try:
        user_id = require_household_account(connection.user)
        result = await _router(hass).async_send_self_test(user_id, msg.get("personal_device_id"))
        payload = result.as_dict()
        # The test is about the user's own devices, not a person.
        payload.pop("person_id", None)
        connection.send_result(msg["id"], payload)
    except Exception as err:  # noqa: BLE001 - every failure gets a stable error code
        _send_error(connection, msg["id"], err)


@websocket_api.websocket_command({vol.Required("type"): f"{WS_PREFIX}/list_recipients"})
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_list_recipients(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """List every person as a possible recipient with its readiness; read only, administrators only."""
    try:
        recipients = await async_list_readiness(hass, _manager(hass))
        connection.send_result(msg["id"], {"recipients": recipients})
    except Exception as err:  # noqa: BLE001 - every failure gets a stable error code
        _send_error(connection, msg["id"], err)


WEBSOCKET_COMMANDS = (
    websocket_get_self,
    websocket_save_self,
    websocket_discover_devices,
    websocket_add_device,
    websocket_remove_device,
    websocket_update_device,
    websocket_test_self,
    websocket_list_recipients,
)


async def async_register_profile_api(hass: HomeAssistant) -> None:
    """Register the profile commands once during integration setup."""
    register_websocket_commands(hass, WEBSOCKET_COMMANDS)
