"""Closed, read-only WebSocket commands for House Core."""

from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from ..access.instrumentation import register_websocket_commands
from ..const import DOMAIN
from .manager import DATA_HOUSE_MANAGER, HouseManager, HouseUnavailableError

_LOGGER = logging.getLogger(__name__)
WS_PREFIX = f"{DOMAIN}/house"


def _manager(hass: HomeAssistant) -> HouseManager:
    manager = hass.data.get(DOMAIN, {}).get(DATA_HOUSE_MANAGER)
    if not isinstance(manager, HouseManager):
        raise HouseUnavailableError("Domus House is not running")
    return manager


async def _send_house_result(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    *,
    snapshot: bool,
) -> None:
    if set(msg) != {"id", "type"}:
        connection.send_error(msg["id"], "invalid_format", "Unexpected WebSocket fields")
        return
    try:
        manager = _manager(hass)
        result = await (manager.async_get_snapshot(connection.user) if snapshot else manager.async_get_topology(connection.user))
    except HouseUnavailableError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    except Exception:  # Never send registry internals to a client.
        _LOGGER.exception("Domus House read failed")
        connection.send_error(msg["id"], "house_unavailable", "Domus House could not read the registries")
        return
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command({vol.Required("type"): f"{WS_PREFIX}/get_topology"})
@websocket_api.async_response
async def websocket_get_topology(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    await _send_house_result(hass, connection, msg, snapshot=False)


@websocket_api.websocket_command({vol.Required("type"): f"{WS_PREFIX}/get_snapshot"})
@websocket_api.async_response
async def websocket_get_snapshot(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    await _send_house_result(hass, connection, msg, snapshot=True)


@websocket_api.websocket_command({vol.Required("type"): f"{WS_PREFIX}/get_environment_shadow"})
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_get_environment_shadow(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    if set(msg) != {"id", "type"}:
        connection.send_error(msg["id"], "invalid_format", "Unexpected WebSocket fields")
        return
    try:
        connection.send_result(msg["id"], await _manager(hass).async_get_environment_shadow(connection.user))
    except HouseUnavailableError as err:
        connection.send_error(msg["id"], err.code, str(err))
    except Exception:
        _LOGGER.exception("Domus House environment shadow failed")
        connection.send_error(msg["id"], "house_unavailable", "Domus House diagnostics are unavailable")


WEBSOCKET_COMMANDS = (websocket_get_topology, websocket_get_snapshot, websocket_get_environment_shadow)


async def async_register_house_api(hass: HomeAssistant) -> None:
    register_websocket_commands(hass, WEBSOCKET_COMMANDS)
