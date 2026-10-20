"""Websocket API and recovery service of Domus Access Control.

``domusos/access/get_self`` answers what Domus allows the account of the
connection. It takes no parameter: the account is the one Home Assistant
authenticated, never an id sent by the client. Nothing is enforced yet.
"""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, ServiceCall, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.service import async_register_admin_service

from ..const import DOMAIN
from .manager import AccessPolicyManager, principal_from_user
from .models import AccessError, AccessUnavailableError

WS_PREFIX = f"{DOMAIN}/access"
DATA_ACCESS_MANAGER = "access_manager"
SERVICE_RESET_ACCESS_POLICY = "reset_access_policy"


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


WEBSOCKET_COMMANDS = (websocket_get_self,)


async def async_register_access_api(hass: HomeAssistant) -> None:
    """Register the websocket command and the administrator recovery service once."""
    for command in WEBSOCKET_COMMANDS:
        websocket_api.async_register_command(hass, command)

    async def handle_reset(call: ServiceCall) -> None:
        # Home Assistant refuses this service to anyone but an administrator.
        try:
            await _manager(hass).async_reset(call.context.user_id)
        except AccessError as err:
            raise HomeAssistantError(str(err)) from err

    async_register_admin_service(hass, DOMAIN, SERVICE_RESET_ACCESS_POLICY, handle_reset)
