"""Minimal Settings room context, separately authorized from House and Dashboard."""

from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from ..access.instrumentation import register_websocket_commands
from ..const import DOMAIN
from ..house.manager import DATA_HOUSE_MANAGER, HouseManager, HouseUnavailableError

_LOGGER = logging.getLogger(__name__)
WS_PREFIX = f"{DOMAIN}/system"


@websocket_api.websocket_command({vol.Required("type"): f"{WS_PREFIX}/get_house_context"})
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_get_house_context(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    if set(msg) != {"id", "type"}:
        connection.send_error(msg["id"], "invalid_format", "Unexpected WebSocket fields")
        return
    manager = hass.data.get(DOMAIN, {}).get(DATA_HOUSE_MANAGER)
    if not isinstance(manager, HouseManager):
        connection.send_error(msg["id"], "house_unavailable", "Domus House is not running")
        return
    try:
        result = await manager.async_get_settings_room_context()
    except HouseUnavailableError:
        connection.send_error(msg["id"], "house_unavailable", "Domus House room context unavailable")
        return
    except Exception:
        _LOGGER.exception("Settings House projection failed")
        connection.send_error(msg["id"], "house_unavailable", "Settings room context unavailable")
        return
    connection.send_result(msg["id"], result)


WEBSOCKET_COMMANDS = (websocket_get_house_context,)


async def async_register_system_api(hass: HomeAssistant) -> None:
    register_websocket_commands(hass, WEBSOCKET_COMMANDS)
