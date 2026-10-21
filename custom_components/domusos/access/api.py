"""Websocket API of Domus Access Control.

Both commands take no parameter: the account is the one Home Assistant
authenticated for the connection, never an id, a role or a flag sent by the
client. Nothing is enforced yet.

The recovery is a websocket command on purpose, and never a Home Assistant
service: automations and scripts call services, and a service cannot tell a
script started by an administrator from that administrator acting directly,
while an automation calls with no user at all
(docs/access-control-foundation.md#recupero).
"""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from ..const import DOMAIN
from .manager import AccessPolicyManager, principal_from_user
from .models import AccessError, AccessUnavailableError

WS_PREFIX = f"{DOMAIN}/access"
DATA_ACCESS_MANAGER = "access_manager"


def _manager(hass: HomeAssistant) -> AccessPolicyManager:
    manager = hass.data.get(DOMAIN, {}).get(DATA_ACCESS_MANAGER)
    if not isinstance(manager, AccessPolicyManager):
        raise AccessUnavailableError("Domus access control is not running")
    return manager


@websocket_api.websocket_command({vol.Required("type"): f"{WS_PREFIX}/get_self"})
@callback
def websocket_get_self(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return the role, grants and capabilities Domus gives the account of this connection."""
    try:
        principal = principal_from_user(connection.user)
        profile = _manager(hass).profile_for(connection.user)
    except AccessError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    except Exception:  # noqa: BLE001 - always answer the client, never with a profile
        connection.send_error(msg["id"], "unknown_error", "Domus access control failed")
        return
    connection.send_result(
        msg["id"],
        {
            # The id lets a client check the answer belongs to the account it shows.
            "principal": {
                "user_id": principal.user_id,
                "is_admin": principal.is_admin,
                "is_owner": principal.is_owner,
            },
            "access": {
                "role": profile.role.value,
                "assigned": profile.source.value == "assignment",
                "grants": list(profile.grants),
                "capabilities": sorted(profile.capabilities),
                "state": profile.state.value,
                "revision": profile.revision,
            },
        },
    )


@websocket_api.websocket_command({vol.Required("type"): f"{WS_PREFIX}/reset_policy"})
@websocket_api.async_response
async def websocket_reset_policy(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return every account to its default role; only for an active Home Assistant administrator."""
    try:
        result = await _manager(hass).async_reset(connection.user)
    except AccessError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    except Exception:  # noqa: BLE001 - never answer success for a reset that did not happen
        connection.send_error(msg["id"], "unknown_error", "Domus access control failed")
        return
    connection.send_result(msg["id"], result)


WEBSOCKET_COMMANDS = (websocket_get_self, websocket_reset_policy)


async def async_register_access_api(hass: HomeAssistant) -> None:
    """Register the websocket commands once; Access Control registers no service."""
    for command in WEBSOCKET_COMMANDS:
        websocket_api.async_register_command(hass, command)
