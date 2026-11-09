"""Closed WebSocket APIs for Climate configuration, intent and manual execution."""

from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from ..access.instrumentation import register_websocket_commands
from ..const import DOMAIN
from .manager import DATA_CLIMATE_MANAGER, ClimateManager
from .models import ClimateError, InvalidFormat, StoreUnavailable
from .state_manager import DATA_CLIMATE_STATE_MANAGER, ClimateStateManager

WS_PREFIX = f"{DOMAIN}/climate"


def _manager(hass: HomeAssistant) -> ClimateManager:
    manager = hass.data.get(DOMAIN, {}).get(DATA_CLIMATE_MANAGER)
    if not isinstance(manager, ClimateManager):
        raise StoreUnavailable("Climate configuration is not running")
    return manager


def _state_manager(hass: HomeAssistant) -> ClimateStateManager:
    manager = hass.data.get(DOMAIN, {}).get(DATA_CLIMATE_STATE_MANAGER)
    if not isinstance(manager, ClimateStateManager):
        raise StoreUnavailable("Climate intent is not running")
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


@websocket_api.websocket_command({vol.Required("type"): f"{WS_PREFIX}/get_state"})
@websocket_api.async_response
async def websocket_get_state(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    try:
        if set(msg) != {"id", "type"}:
            raise InvalidFormat("Unexpected WebSocket fields")
        connection.send_result(msg["id"], await _state_manager(hass).async_get_state())
    except ClimateError as err:
        _error(connection, msg["id"], err)


@websocket_api.websocket_command({
    vol.Required("type"): f"{WS_PREFIX}/set_house_intent",
    vol.Required("operating_mode"): str,
    vol.Required("control_mode"): str,
    vol.Required("expected_revision"): vol.All(int, vol.Range(min=0)),
})
@websocket_api.async_response
async def websocket_set_house_intent(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    try:
        if set(msg) != {"id", "type", "operating_mode", "control_mode", "expected_revision"}:
            raise InvalidFormat("Unexpected WebSocket fields")
        result = await _state_manager(hass).async_set_house_intent(msg["operating_mode"], msg["control_mode"], msg["expected_revision"], connection.user)
        connection.send_result(msg["id"], result)
    except ClimateError as err:
        _error(connection, msg["id"], err)


@websocket_api.websocket_command({
    vol.Required("type"): f"{WS_PREFIX}/set_zone_intent",
    vol.Required("zone_id"): str,
    vol.Required("mode"): str,
    vol.Required("target_temperature"): vol.Any(None, int, float),
    vol.Required("expected_revision"): vol.All(int, vol.Range(min=0)),
})
@websocket_api.async_response
async def websocket_set_zone_intent(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    try:
        if set(msg) != {"id", "type", "zone_id", "mode", "target_temperature", "expected_revision"}:
            raise InvalidFormat("Unexpected WebSocket fields")
        result = await _state_manager(hass).async_set_zone_intent(msg["zone_id"], msg["mode"], msg["target_temperature"], msg["expected_revision"], connection.user)
        connection.send_result(msg["id"], result)
    except ClimateError as err:
        _error(connection, msg["id"], err)


@websocket_api.websocket_command({
    vol.Required("type"): f"{WS_PREFIX}/set_zone_override",
    vol.Required("zone_id"): str,
    vol.Required("target_temperature"): vol.Any(int, float),
    vol.Required("expiry_mode"): str,
    vol.Optional("duration_minutes"): int,
    vol.Optional("until_time"): str,
    vol.Required("expected_revision"): vol.All(int, vol.Range(min=0)),
})
@websocket_api.async_response
async def websocket_set_zone_override(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    try:
        if not {"id", "type", "zone_id", "target_temperature", "expiry_mode", "expected_revision"} <= set(msg) or not set(msg) <= {"id", "type", "zone_id", "target_temperature", "expiry_mode", "duration_minutes", "until_time", "expected_revision"}:
            raise InvalidFormat("Unexpected WebSocket fields")
        result = await _state_manager(hass).async_set_zone_override(
            msg["zone_id"], msg["target_temperature"], msg["expiry_mode"], msg["expected_revision"], connection.user,
            duration_minutes=msg.get("duration_minutes"), until_time=msg.get("until_time"))
        connection.send_result(msg["id"], result)
    except ClimateError as err:
        _error(connection, msg["id"], err)


@websocket_api.websocket_command({
    vol.Required("type"): f"{WS_PREFIX}/clear_zone_override",
    vol.Required("zone_id"): str,
    vol.Required("expected_revision"): vol.All(int, vol.Range(min=0)),
})
@websocket_api.async_response
async def websocket_clear_zone_override(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    try:
        if set(msg) != {"id", "type", "zone_id", "expected_revision"}:
            raise InvalidFormat("Unexpected WebSocket fields")
        result = await _state_manager(hass).async_clear_zone_override(msg["zone_id"], msg["expected_revision"], connection.user)
        connection.send_result(msg["id"], result)
    except ClimateError as err:
        _error(connection, msg["id"], err)


@websocket_api.websocket_command({
    vol.Required("type"): f"{WS_PREFIX}/execute_plan",
    vol.Required("zone_id"): str,
    vol.Required("expected_plan_token"): str,
    vol.Required("expected_config_revision"): vol.All(int, vol.Range(min=0)),
    vol.Required("expected_state_revision"): vol.All(int, vol.Range(min=0)),
})
@websocket_api.async_response
async def websocket_execute_plan(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    try:
        if set(msg) != {"id", "type", "zone_id", "expected_plan_token", "expected_config_revision", "expected_state_revision"}:
            raise InvalidFormat("Unexpected WebSocket fields")
        result = await _state_manager(hass).async_execute_plan(
            msg["zone_id"], msg["expected_plan_token"], msg["expected_config_revision"],
            msg["expected_state_revision"], connection.user)
        connection.send_result(msg["id"], result)
    except ClimateError as err:
        _error(connection, msg["id"], err)


WEBSOCKET_COMMANDS = (websocket_get_config, websocket_save_config, websocket_get_state, websocket_set_house_intent, websocket_set_zone_intent,
                      websocket_set_zone_override, websocket_clear_zone_override, websocket_execute_plan)


async def async_register_climate_api(hass: HomeAssistant) -> None:
    register_websocket_commands(hass, WEBSOCKET_COMMANDS)
