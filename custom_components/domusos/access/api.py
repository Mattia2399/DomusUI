"""Websocket API of Domus Access Control.

Both commands take no parameter: the account is the one Home Assistant
authenticated for the connection, never an id, a role or a flag sent by the
client. Nothing is enforced yet, except the recovery.

The recovery is a websocket command on purpose, and never a Home Assistant
service: automations and scripts call services, and a service cannot tell a
script started by an administrator from that administrator acting directly,
while an automation calls with no user at all
(docs/access-control-foundation.md#recupero).

The shadow diagnostics tell an administrator what Access Control would have
decided on the requests observed so far; they are counters in memory, read
and cleared here, never stored (docs/access-control-shadow.md).
"""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from ..const import DOMAIN
from .authorization import identify
from .instrumentation import register_websocket_commands, shadow_stats
from .manager import DATA_ACCESS_MANAGER, AccessPolicyManager, principal_from_user
from .models import AccessDeniedError, AccessError, AccessUnavailableError

WS_PREFIX = f"{DOMAIN}/access"


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


def _manages_access(user: Any) -> bool:
    """An active Home Assistant administrator, who always holds access.manage."""
    principal, _reason = identify(user)
    return principal is not None and principal.is_admin


def _shadow_diagnostics(hass: HomeAssistant) -> dict[str, Any]:
    manager = hass.data.get(DOMAIN, {}).get(DATA_ACCESS_MANAGER)
    running = isinstance(manager, AccessPolicyManager)
    return shadow_stats(hass).snapshot(
        policy_state=manager.state.value if running else None,
        policy_revision=manager.revision if running else None,
    )


@websocket_api.websocket_command({vol.Required("type"): f"{WS_PREFIX}/get_shadow_diagnostics"})
@websocket_api.require_admin
@callback
def websocket_get_shadow_diagnostics(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """What Access Control would have decided in the current window; read only, administrators only."""
    if not _manages_access(connection.user):
        connection.send_error(msg["id"], AccessDeniedError.code, "This account cannot read the access diagnostics")
        return
    try:
        result = _shadow_diagnostics(hass)
    except Exception:  # noqa: BLE001 - always answer the client
        connection.send_error(msg["id"], "unknown_error", "Domus access control failed")
        return
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command({vol.Required("type"): f"{WS_PREFIX}/reset_shadow_diagnostics"})
@websocket_api.require_admin
@callback
def websocket_reset_shadow_diagnostics(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Start a new observation window; only the in-memory counters change, never the policy."""
    if not _manages_access(connection.user):
        connection.send_error(msg["id"], AccessDeniedError.code, "This account cannot reset the access diagnostics")
        return
    try:
        shadow_stats(hass).reset()
        result = _shadow_diagnostics(hass)
    except Exception:  # noqa: BLE001 - always answer the client
        connection.send_error(msg["id"], "unknown_error", "Domus access control failed")
        return
    connection.send_result(msg["id"], result)


WEBSOCKET_COMMANDS = (
    websocket_get_self,
    websocket_reset_policy,
    websocket_get_shadow_diagnostics,
    websocket_reset_shadow_diagnostics,
)


async def async_register_access_api(hass: HomeAssistant) -> None:
    """Register the websocket commands once; Access Control registers no service.

    The shadow counters start here, with the integration.
    """
    shadow_stats(hass)
    register_websocket_commands(hass, WEBSOCKET_COMMANDS)
