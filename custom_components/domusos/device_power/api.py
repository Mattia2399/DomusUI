"""Websocket API for device power policies; administrators only.

There is no command that turns a switch on or off: clients only read, save,
link and remove policies, and the server's controllers do the rest.

Every command is enforced by Access Control (``device_power.manage``,
P2.5D.1): a refused request never reaches these handlers. ``require_admin``
stays behind it: Home Assistant AND Domus.
"""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from ..access.instrumentation import register_websocket_commands
from ..const import DOMAIN
from .manager import DevicePowerManager
from .models import DevicePowerError, DevicePowerUnavailableError, InvalidPolicyError

WS_PREFIX = f"{DOMAIN}/device_power"
DATA_DEVICE_POWER_MANAGER = "device_power_manager"

_POLICY_ID = vol.All(str, vol.Match(r"^[a-f0-9]{32}$"))
_REVISION = vol.All(vol.Coerce(int), vol.Range(min=1))


def _manager(hass: HomeAssistant) -> DevicePowerManager:
    manager = hass.data.get(DOMAIN, {}).get(DATA_DEVICE_POWER_MANAGER)
    if not isinstance(manager, DevicePowerManager):
        raise DevicePowerUnavailableError("Device power management is not running")
    return manager


def _send_error(connection: websocket_api.ActiveConnection, message_id: int, err: Exception) -> None:
    if isinstance(err, DevicePowerError):
        message = str(err)
        if isinstance(err, InvalidPolicyError) and err.field:
            message = f"{message} ({err.field})"
        connection.send_error(message_id, err.code, message)
        return
    connection.send_error(message_id, "unknown_error", "Device power management failed")


@websocket_api.websocket_command({vol.Required("type"): f"{WS_PREFIX}/get_state"})
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_get_state(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return every policy with what it is doing now."""
    try:
        connection.send_result(msg["id"], _manager(hass).state_for_user(connection.user))
    except Exception as err:  # noqa: BLE001 - always answer the client
        _send_error(connection, msg["id"], err)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/save_policy",
        vol.Optional("policy_id"): _POLICY_ID,
        vol.Optional("expected_revision"): _REVISION,
        vol.Required("policy"): dict,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_save_policy(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Create a policy, or change one whose revision still matches."""
    try:
        manager = _manager(hass)
        policy = await manager.async_save_policy(
            connection.user,
            msg["policy"],
            policy_id=msg.get("policy_id"),
            expected_revision=msg.get("expected_revision"),
        )
        connection.send_result(msg["id"], {"policy": policy, **manager.state_for_user(connection.user)})
    except Exception as err:  # noqa: BLE001 - always answer the client
        _send_error(connection, msg["id"], err)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/bind_policy",
        vol.Required("policy_id"): _POLICY_ID,
        vol.Required("expected_revision"): _REVISION,
        vol.Required("client_id"): str,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_bind_policy(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Link a policy to the device that sends the request."""
    try:
        manager = _manager(hass)
        policy = await manager.async_bind_policy(
            connection.user, msg["policy_id"], msg["expected_revision"], msg["client_id"]
        )
        connection.send_result(msg["id"], {"policy": policy, **manager.state_for_user(connection.user)})
    except Exception as err:  # noqa: BLE001 - always answer the client
        _send_error(connection, msg["id"], err)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/delete_policy",
        vol.Required("policy_id"): _POLICY_ID,
        vol.Required("expected_revision"): _REVISION,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_delete_policy(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Remove a policy; its switch keeps its current state."""
    try:
        manager = _manager(hass)
        await manager.async_delete_policy(connection.user, msg["policy_id"], msg["expected_revision"])
        connection.send_result(msg["id"], manager.state_for_user(connection.user))
    except Exception as err:  # noqa: BLE001 - always answer the client
        _send_error(connection, msg["id"], err)


WEBSOCKET_COMMANDS = (
    websocket_get_state,
    websocket_save_policy,
    websocket_bind_policy,
    websocket_delete_policy,
)


async def async_register_device_power_api(hass: HomeAssistant) -> None:
    """Register websocket commands once during integration setup."""
    register_websocket_commands(hass, WEBSOCKET_COMMANDS)
