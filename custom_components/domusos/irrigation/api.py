"""Home Assistant API surface for Domus Core Irrigation."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, ServiceCall, callback

from ..const import DOMAIN
from .manager import IrrigationManager
from .models import IrrigationError, IrrigationOperationError

WS_PREFIX = f"{DOMAIN}/irrigation"


def _manager(hass: HomeAssistant) -> IrrigationManager:
    manager = hass.data.get(DOMAIN, {}).get("irrigation_manager")
    if not isinstance(manager, IrrigationManager):
        raise IrrigationOperationError(
            "Domus Core Irrigation non è disponibile. Ricarica l'integrazione Domus UI."
        )
    return manager


def _send_error(connection: websocket_api.ActiveConnection, message_id: int, err: Exception) -> None:
    code = err.code if isinstance(err, IrrigationError) else "unknown_error"
    connection.send_error(message_id, code, str(err))


@websocket_api.websocket_command({vol.Required("type"): f"{WS_PREFIX}/get_config"})
@websocket_api.async_response
async def websocket_get_config(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return the irrigation configuration visible to the current user."""
    try:
        connection.send_result(msg["id"], _manager(hass).configuration_for_user(connection.user))
    except Exception as err:  # Converted into a stable websocket error contract.
        _send_error(connection, msg["id"], err)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/save_config",
        vol.Required("config"): dict,
        vol.Optional("expected_revision", default=None): vol.Any(None, vol.Coerce(int)),
        vol.Optional("migrate_legacy", default=False): bool,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_save_config(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Validate and atomically save irrigation configuration."""
    try:
        result = await _manager(hass).async_save_configuration(
            msg["config"],
            msg["expected_revision"],
            connection.user,
            migrate_legacy=msg["migrate_legacy"],
        )
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
    """Return the current server-owned irrigation state."""
    try:
        connection.send_result(msg["id"], _manager(hass).state_for_user(connection.user))
    except Exception as err:
        _send_error(connection, msg["id"], err)


@websocket_api.websocket_command({vol.Required("type"): f"{WS_PREFIX}/subscribe"})
@websocket_api.async_response
async def websocket_subscribe(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Push state, countdown anchors and faults to every connected client."""
    try:
        manager = _manager(hass)

        @callback
        def forward_update(_event: dict[str, Any]) -> None:
            connection.send_event(msg["id"], manager.state_for_user(connection.user))

        connection.subscriptions[msg["id"]] = manager.async_subscribe(forward_update)
        connection.send_result(msg["id"])
        forward_update({"initial": True})
    except Exception as err:
        _send_error(connection, msg["id"], err)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/start_zone",
        vol.Required("zone_id"): str,
        vol.Optional("duration_min"): vol.Any(None, vol.Coerce(int)),
        vol.Optional("request_id"): str,
    }
)
@websocket_api.async_response
async def websocket_start_zone(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Start or queue one zone."""
    try:
        result = await _manager(hass).async_start_zone(
            msg["zone_id"],
            msg.get("duration_min"),
            connection.user,
            request_id=msg.get("request_id"),
        )
        connection.send_result(msg["id"], result)
    except Exception as err:
        _send_error(connection, msg["id"], err)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/stop_zone",
        vol.Required("zone_id"): str,
    }
)
@websocket_api.async_response
async def websocket_stop_zone(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Stop one active or queued zone."""
    try:
        await _manager(hass).async_stop_zone(msg["zone_id"], connection.user)
        connection.send_result(msg["id"], _manager(hass).state_for_user(connection.user))
    except Exception as err:
        _send_error(connection, msg["id"], err)


def _simple_command(command: str):
    """Build a websocket handler for global irrigation commands."""
    schema = {vol.Required("type"): f"{WS_PREFIX}/{command}"}

    @websocket_api.websocket_command(schema)
    @websocket_api.async_response
    async def handler(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict[str, Any],
    ) -> None:
        try:
            manager = _manager(hass)
            if command == "pause":
                await manager.async_pause(connection.user)
            elif command == "resume":
                await manager.async_resume(connection.user)
            else:
                await manager.async_stop_all(connection.user)
            connection.send_result(msg["id"], manager.state_for_user(connection.user))
        except Exception as err:
            _send_error(connection, msg["id"], err)

    return handler


websocket_pause = _simple_command("pause")
websocket_resume = _simple_command("resume")
websocket_stop_all = _simple_command("stop_all")


@websocket_api.websocket_command(
    {vol.Required("type"): f"{WS_PREFIX}/prepare_legacy_removal"}
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_prepare_legacy_removal(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Make legacy automations visible in HA while keeping them disabled."""
    try:
        result = await _manager(hass).async_prepare_legacy_automation_removal(
            connection.user
        )
        connection.send_result(msg["id"], result)
    except Exception as err:
        _send_error(connection, msg["id"], err)


WEBSOCKET_COMMANDS = (
    websocket_get_config,
    websocket_save_config,
    websocket_get_state,
    websocket_subscribe,
    websocket_start_zone,
    websocket_stop_zone,
    websocket_pause,
    websocket_resume,
    websocket_stop_all,
    websocket_prepare_legacy_removal,
)


async def _service_user(hass: HomeAssistant, call: ServiceCall):
    if call.context.user_id is None:
        return None
    user = await hass.auth.async_get_user(call.context.user_id)
    if user is None:
        raise IrrigationOperationError("Utente Home Assistant non più disponibile.")
    return user


async def async_register_irrigation_api(hass: HomeAssistant) -> None:
    """Register websocket commands and Home Assistant actions once."""
    for command in WEBSOCKET_COMMANDS:
        websocket_api.async_register_command(hass, command)

    async def handle_start(call: ServiceCall) -> None:
        await _manager(hass).async_start_zone(
            call.data["zone_id"],
            call.data.get("duration_min"),
            await _service_user(hass, call),
            source="service",
            request_id=call.data.get("request_id"),
        )

    async def handle_stop(call: ServiceCall) -> None:
        await _manager(hass).async_stop_zone(
            call.data["zone_id"], await _service_user(hass, call), reason="service_stop"
        )

    async def handle_pause(call: ServiceCall) -> None:
        await _manager(hass).async_pause(await _service_user(hass, call))

    async def handle_resume(call: ServiceCall) -> None:
        await _manager(hass).async_resume(await _service_user(hass, call))

    async def handle_stop_all(call: ServiceCall) -> None:
        await _manager(hass).async_stop_all(
            await _service_user(hass, call), reason="service_stop_all"
        )

    hass.services.async_register(
        DOMAIN,
        "start_irrigation_zone",
        handle_start,
        schema=vol.Schema(
            {
                vol.Required("zone_id"): str,
                vol.Optional("duration_min"): vol.All(vol.Coerce(int), vol.Range(min=1, max=60)),
                vol.Optional("request_id"): str,
            }
        ),
    )
    hass.services.async_register(
        DOMAIN, "stop_irrigation_zone", handle_stop, schema=vol.Schema({vol.Required("zone_id"): str})
    )
    hass.services.async_register(DOMAIN, "pause_irrigation", handle_pause)
    hass.services.async_register(DOMAIN, "resume_irrigation", handle_resume)
    hass.services.async_register(DOMAIN, "stop_all_irrigation", handle_stop_all)
