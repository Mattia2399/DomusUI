"""Websocket API for Energy Profile discovery, confirmation and display.

Discovery and profile commands are reserved to administrators. ``get_state``
returns only the read-only Energy projection to any authenticated user, the
same data every Home Assistant user can already read from sensor states. No
energy control exists and the generic Domus context registry stays internal.
"""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from ..const import DOMAIN
from .context import async_energy_state
from .discovery import EnergyDiscoveryService
from .manager import EnergyProfileManager
from .models import EnergyError, EnergyUnavailableError

WS_PREFIX = f"{DOMAIN}/energy"


def _manager(hass: HomeAssistant) -> EnergyProfileManager:
    manager = hass.data.get(DOMAIN, {}).get("energy_manager")
    if not isinstance(manager, EnergyProfileManager) or not manager.loaded:
        raise EnergyUnavailableError(
            "Domus Energy is not running. Reload the Domus UI integration."
        )
    return manager


def _send_error(
    connection: websocket_api.ActiveConnection, message_id: int, err: Exception
) -> None:
    if isinstance(err, EnergyError):
        connection.send_error(message_id, err.code, str(err))
    else:
        connection.send_error(message_id, "unknown_error", "Domus Energy request failed")


def _profile_result(manager: EnergyProfileManager) -> dict[str, Any]:
    return {
        "profile": manager.profile_document(),
        "module_status": {
            module.value: status.value
            for module, status in manager.module_status.items()
        },
    }


@websocket_api.websocket_command({vol.Required("type"): f"{WS_PREFIX}/get_profile"})
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_get_profile(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return the confirmed profile and the condition of every module."""
    try:
        connection.send_result(msg["id"], _profile_result(_manager(hass)))
    except Exception as err:  # Converted into a stable websocket error contract.
        _send_error(connection, msg["id"], err)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/save_profile",
        vol.Required("profile"): dict,
        vol.Optional("expected_revision", default=None): vol.Any(
            None, vol.Coerce(int)
        ),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_save_profile(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Validate and persist user-confirmed or corrected bindings."""
    try:
        manager = _manager(hass)
        await manager.async_save_profile(msg["profile"], msg["expected_revision"])
        connection.send_result(msg["id"], _profile_result(manager))
    except Exception as err:
        _send_error(connection, msg["id"], err)


@websocket_api.websocket_command({vol.Required("type"): f"{WS_PREFIX}/discover"})
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_discover(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return proposals only; nothing is saved."""
    try:
        result = await EnergyDiscoveryService(hass).async_discover()
        connection.send_result(msg["id"], result)
    except Exception as err:
        _send_error(connection, msg["id"], err)


@websocket_api.websocket_command({vol.Required("type"): f"{WS_PREFIX}/get_state"})
@websocket_api.async_response
async def websocket_get_state(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return normalized values of configured modules; never configuration."""
    try:
        connection.send_result(msg["id"], await async_energy_state(_manager(hass)))
    except Exception as err:
        _send_error(connection, msg["id"], err)


WEBSOCKET_COMMANDS = (
    websocket_get_state,
    websocket_get_profile,
    websocket_save_profile,
    websocket_discover,
)


async def async_register_energy_api(hass: HomeAssistant) -> None:
    """Register the Energy websocket commands once."""
    for command in WEBSOCKET_COMMANDS:
        websocket_api.async_register_command(hass, command)
