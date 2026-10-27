"""Websocket API for device timers.

Any account may set a timer on a device it can control in Home Assistant
(``POLICY_CONTROL``) and see the timers of the devices it can read: the
switch-off itself is the one the account could make now. Access Control
observes every command (``devices.timers``); it enforces none of them yet.
"""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from ..access.instrumentation import register_websocket_commands
from ..const import DOMAIN
from .manager import DeviceTimerManager
from .models import DeviceTimerError, DeviceTimersUnavailableError, InvalidTimerError

WS_PREFIX = f"{DOMAIN}/device_timers"
DATA_DEVICE_TIMER_MANAGER = "device_timer_manager"


def _manager(hass: HomeAssistant) -> DeviceTimerManager:
    manager = hass.data.get(DOMAIN, {}).get(DATA_DEVICE_TIMER_MANAGER)
    if not isinstance(manager, DeviceTimerManager):
        raise DeviceTimersUnavailableError("Device timers are not running")
    return manager


def _send_error(connection: websocket_api.ActiveConnection, message_id: int, err: Exception) -> None:
    if isinstance(err, DeviceTimerError):
        message = str(err)
        if isinstance(err, InvalidTimerError) and err.field:
            message = f"{message} ({err.field})"
        connection.send_error(message_id, err.code, message)
        return
    connection.send_error(message_id, "unknown_error", "Device timers failed")


@websocket_api.websocket_command({vol.Required("type"): f"{WS_PREFIX}/get_state"})
@websocket_api.async_response
async def websocket_get_state(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return the timers of the devices this account can see."""
    try:
        connection.send_result(msg["id"], _manager(hass).state_for_user(connection.user))
    except Exception as err:  # noqa: BLE001 - always answer the client
        _send_error(connection, msg["id"], err)


@websocket_api.websocket_command({vol.Required("type"): f"{WS_PREFIX}/subscribe"})
@websocket_api.async_response
async def websocket_subscribe(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Push the timers to the client whenever one starts, ends or is cancelled."""
    try:
        manager = _manager(hass)

        @callback
        def forward_update() -> None:
            connection.send_event(msg["id"], manager.state_for_user(connection.user))

        connection.subscriptions[msg["id"]] = manager.async_subscribe(forward_update)
        connection.send_result(msg["id"])
        forward_update()
    except Exception as err:  # noqa: BLE001 - always answer the client
        _send_error(connection, msg["id"], err)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/set_timer",
        vol.Required("entity_id"): str,
        vol.Required("minutes"): int,
    }
)
@websocket_api.async_response
async def websocket_set_timer(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Switch a device off in a few minutes, switching it on first when it is off."""
    try:
        result = await _manager(hass).async_set_timer(connection.user, msg["entity_id"], msg["minutes"])
        connection.send_result(msg["id"], result)
    except Exception as err:  # noqa: BLE001 - always answer the client
        _send_error(connection, msg["id"], err)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/cancel_timer",
        vol.Required("entity_id"): str,
    }
)
@websocket_api.async_response
async def websocket_cancel_timer(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Forget a device's timer; the device stays as it is."""
    try:
        result = await _manager(hass).async_cancel_timer(connection.user, msg["entity_id"])
        connection.send_result(msg["id"], result)
    except Exception as err:  # noqa: BLE001 - always answer the client
        _send_error(connection, msg["id"], err)


WEBSOCKET_COMMANDS = (
    websocket_get_state,
    websocket_subscribe,
    websocket_set_timer,
    websocket_cancel_timer,
)


async def async_register_device_timers_api(hass: HomeAssistant) -> None:
    """Register websocket commands once during integration setup."""
    register_websocket_commands(hass, WEBSOCKET_COMMANDS)
