"""Websocket API for waste collection settings, preview and reminders."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from ..const import DOMAIN
from .manager import WasteCollectionManager
from .models import WasteCollectionError, WasteCollectionOperationError

WS_PREFIX = f"{DOMAIN}/waste_collection"


def _manager(hass: HomeAssistant) -> WasteCollectionManager:
    manager = hass.data.get(DOMAIN, {}).get("waste_collection_manager")
    if not isinstance(manager, WasteCollectionManager):
        raise WasteCollectionOperationError(
            "La raccolta rifiuti Domus UI non \u00e8 disponibile. Ricarica l'integrazione."
        )
    return manager


def _send_error(
    connection: websocket_api.ActiveConnection,
    message_id: int,
    err: Exception,
) -> None:
    code = err.code if isinstance(err, WasteCollectionError) else "unknown_error"
    connection.send_error(message_id, code, str(err))


@websocket_api.websocket_command({vol.Required("type"): f"{WS_PREFIX}/get_config"})
@websocket_api.async_response
async def websocket_get_config(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return the shared waste collection configuration."""
    try:
        connection.send_result(
            msg["id"], _manager(hass).configuration_for_user(connection.user)
        )
    except Exception as err:
        _send_error(connection, msg["id"], err)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/save_config",
        vol.Required("config"): dict,
        vol.Optional("expected_revision", default=None): vol.Any(None, vol.Coerce(int)),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_save_config(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Validate and atomically save waste collection configuration."""
    try:
        result = await _manager(hass).async_save_configuration(
            msg["config"], msg["expected_revision"], connection.user
        )
        connection.send_result(msg["id"], result)
    except Exception as err:
        _send_error(connection, msg["id"], err)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/preview",
        vol.Optional("days", default=7): vol.All(vol.Coerce(int), vol.Range(min=1, max=31)),
    }
)
@websocket_api.async_response
async def websocket_preview(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Resolve the next collection rows without persisting event instances."""
    try:
        connection.send_result(
            msg["id"], await _manager(hass).async_preview(msg["days"])
        )
    except Exception as err:
        _send_error(connection, msg["id"], err)


@websocket_api.websocket_command(
    {vol.Required("type"): f"{WS_PREFIX}/test_notification"}
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_test_notification(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Send a test reminder to configured notification targets."""
    try:
        connection.send_result(
            msg["id"],
            await _manager(hass).async_send_test_notification(connection.user),
        )
    except Exception as err:
        _send_error(connection, msg["id"], err)


WEBSOCKET_COMMANDS = (
    websocket_get_config,
    websocket_save_config,
    websocket_preview,
    websocket_test_notification,
)


async def async_register_waste_collection_api(hass: HomeAssistant) -> None:
    """Register websocket commands once during integration setup."""
    for command in WEBSOCKET_COMMANDS:
        websocket_api.async_register_command(hass, command)
