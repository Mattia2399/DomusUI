"""Self-service websocket API for the Domus Profile.

Both commands act on the authenticated user of the connection only: they take
no user, person or owner id, and Home Assistant rejects unknown keys.
"""

from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from ..const import DOMAIN
from .identity import list_persons, require_household_account, resolve_user_person
from .manager import ProfileManager, ProfileView
from .models import ProfileError, ProfileUnavailableError

_LOGGER = logging.getLogger(__name__)

WS_PREFIX = f"{DOMAIN}/profile"
DATA_PROFILE_MANAGER = "profile_manager"


def _manager(hass: HomeAssistant) -> ProfileManager:
    manager = hass.data.get(DOMAIN, {}).get(DATA_PROFILE_MANAGER)
    if not isinstance(manager, ProfileManager):
        raise ProfileUnavailableError("The Domus Profile Core is not running")
    return manager


def _send_error(connection: websocket_api.ActiveConnection, message_id: int, err: Exception) -> None:
    if isinstance(err, ProfileError):
        connection.send_error(message_id, err.code, str(err))
        return
    _LOGGER.exception("Unexpected Domus Profile error", exc_info=err)
    connection.send_error(message_id, "unknown_error", "The profile request could not be completed")


def _revision(value: Any) -> int:
    """Accept a non-negative integer revision; booleans are not revisions."""
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise vol.Invalid("expected_revision must be a non-negative integer")
    return value


def _self_result(hass: HomeAssistant, user_id: str, view: ProfileView) -> dict[str, Any]:
    resolution = resolve_user_person(list_persons(hass), user_id)
    person = resolution.person
    return {
        "owner": {
            "user_id": user_id,
            # Presentation only, read live: never persisted in the profile.
            "person_id": person.person_id if person is not None else None,
            "person_entity_id": person.entity_id if person is not None else None,
            "person_status": resolution.status.value,
        },
        "persisted": view.persisted,
        "profile": view.as_dict(),
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
        view = _manager(hass).get_profile(user_id)
        connection.send_result(msg["id"], _self_result(hass, user_id, view))
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
        view = await _manager(hass).async_save_self(
            user_id, msg["expected_revision"], msg["profile"]
        )
        connection.send_result(msg["id"], _self_result(hass, user_id, view))
    except Exception as err:  # noqa: BLE001 - every failure gets a stable error code
        _send_error(connection, msg["id"], err)


WEBSOCKET_COMMANDS = (websocket_get_self, websocket_save_self)


async def async_register_profile_api(hass: HomeAssistant) -> None:
    """Register the profile commands once during integration setup."""
    for command in WEBSOCKET_COMMANDS:
        websocket_api.async_register_command(hass, command)
