"""Two closed WebSocket commands for Domus Climate HOUSE configuration."""

from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from ..access.instrumentation import register_websocket_commands
from ..const import DOMAIN
from .manager import DATA_CLIMATE_MANAGER, ClimateManager
from .models import ClimateError, InvalidFormat, StoreUnavailable

WS_PREFIX = f"{DOMAIN}/climate"


def _manager(hass: HomeAssistant) -> ClimateManager:
    manager = hass.data.get(DOMAIN, {}).get(DATA_CLIMATE_MANAGER)
    if not isinstance(manager, ClimateManager):
        raise StoreUnavailable("Climate configuration is not running")
    return manager


def _error(connection: websocket_api.ActiveConnection, message_id: int, err: ClimateError) -> None:
    connection.send_error(message_id, err.code, str(err))


@websocket_api.websocket_command({vol.Required("type"): f"{WS_PREFIX}/get_config"})
@websocket_api.async_response
async def websocket_get_config(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    try:
        if set(msg) != {"id", "type"}:
            raise InvalidFormat("Unexpected WebSocket fields")
        connection.send_result(msg["id"], _manager(hass).get_config())
    except ClimateError as err:
        _error(connection, msg["id"], err)


@websocket_api.websocket_command({
    vol.Required("type"): f"{WS_PREFIX}/save_config",
    vol.Required("config"): dict,
    vol.Required("expected_revision"): vol.All(int, vol.Range(min=0)),
})
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_save_config(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    try:
        if set(msg) != {"id", "type", "config", "expected_revision"}:
            raise InvalidFormat("Unexpected WebSocket fields")
        connection.send_result(msg["id"], await _manager(hass).async_save_config(msg["config"], msg["expected_revision"], connection.user))
    except ClimateError as err:
        _error(connection, msg["id"], err)


WEBSOCKET_COMMANDS = (websocket_get_config, websocket_save_config)


async def async_register_climate_api(hass: HomeAssistant) -> None:
    register_websocket_commands(hass, WEBSOCKET_COMMANDS)
