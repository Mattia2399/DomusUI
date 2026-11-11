"""Dashboard WebSocket reads backed by the authorized House projection."""

from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from ..access.instrumentation import register_websocket_commands
from ..const import DOMAIN
from ..house.manager import DATA_HOUSE_MANAGER, HouseManager, HouseUnavailableError
from .house_context import dashboard_house_context

_LOGGER = logging.getLogger(__name__)
WS_PREFIX = f"{DOMAIN}/dashboard"


@websocket_api.websocket_command({vol.Required("type"): f"{WS_PREFIX}/get_house_context"})
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
        result = await dashboard_house_context(manager, connection.user)
    except HouseUnavailableError:
        connection.send_error(msg["id"], "house_unavailable", "Domus House is not running")
        return
    except Exception:
        _LOGGER.exception("Dashboard House projection failed")
        connection.send_error(msg["id"], "house_unavailable", "Dashboard room context unavailable")
        return
    connection.send_result(msg["id"], result)


WEBSOCKET_COMMANDS = (websocket_get_house_context,)


async def async_register_dashboard_api(hass: HomeAssistant) -> None:
    register_websocket_commands(hass, WEBSOCKET_COMMANDS)
