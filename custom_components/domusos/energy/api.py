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
from .models import EnergyError, EnergyUnavailableError, EnergyValidationError

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
        # ``profile`` keeps the v1 shape for current clients and is null when v1
        # cannot hold the profile; ``profile_v2`` is always the full v2 document.
        connection.send_result(msg["id"], await _manager(hass).async_profile_result())
    except Exception as err:  # Converted into a stable websocket error contract.
        _send_error(connection, msg["id"], err)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/save_profile",
        # Exactly one of: a v1 client profile (``modules``) or a whole v2 profile (``plant``).
        vol.Optional("profile"): dict,
        vol.Optional("profile_v2"): dict,
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
        if ("profile" in msg) == ("profile_v2" in msg):
            raise EnergyValidationError("Send either profile (v1) or profile_v2")
        manager = _manager(hass)
        if "profile_v2" in msg:
            result = await manager.async_save_profile(
                msg["profile_v2"], msg["expected_revision"], version=2
            )
        else:
            result = await manager.async_save_profile(msg["profile"], msg["expected_revision"])
        connection.send_result(msg["id"], result)
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
        service = EnergyDiscoveryService(hass)
        manager = hass.data.get(DOMAIN, {}).get("energy_manager")
        if isinstance(manager, EnergyProfileManager) and manager.loaded:
            # The profile is read to tell configured devices from new ones.
            result = await service.async_discover(
                manager.profile_v2, manager.meters, load_error=manager.load_error
            )
        else:
            result = await service.async_discover()
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
