"""Energy websocket handlers called directly, without an aiohttp client.

``test_energy_websocket.py`` drives the real websocket stack, whose Home
Assistant 2025.1 fixture leaves an aiohttp shutdown thread behind on CI
runners. These tests exercise the same handlers through a recorded connection,
so the command contract also runs on the oldest supported Home Assistant.
"""

from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import Unauthorized

from custom_components.domusos.const import DOMAIN
from custom_components.domusos.energy.api import (
    websocket_discover,
    websocket_get_profile,
    websocket_get_state,
    websocket_save_profile,
)
from custom_components.domusos.energy.manager import EnergyProfileManager

POWER = {"device_class": "power", "state_class": "measurement", "unit_of_measurement": "W"}


class RecordedConnection:
    """The parts of ``ActiveConnection`` the Energy handlers use."""

    def __init__(self, *, admin: bool) -> None:
        self.user = MagicMock(is_admin=admin)
        self.results: dict[int, Any] = {}
        self.errors: dict[int, str] = {}

    def send_result(self, msg_id: int, result: Any = None) -> None:
        self.results[msg_id] = result

    def send_error(self, msg_id: int, code: str, message: str, *_: Any, **__: Any) -> None:
        self.errors[msg_id] = code

    def async_handle_exception(self, msg: dict[str, Any], err: Exception) -> None:
        self.errors[msg["id"]] = type(err).__name__


async def _manager(hass: HomeAssistant, *, loaded: bool = True) -> EnergyProfileManager:
    manager = EnergyProfileManager(hass)
    manager.store.async_load = AsyncMock(return_value=None)
    manager.store.async_save = AsyncMock()
    if loaded:
        await manager.async_setup()
    hass.data.setdefault(DOMAIN, {})["energy_manager"] = manager
    return manager


async def _call(hass: HomeAssistant, handler: Any, connection: RecordedConnection, msg: dict) -> None:
    handler(hass, connection, msg)
    await hass.async_block_till_done(wait_background_tasks=True)


async def test_state_is_readable_by_any_user_with_freshness(hass: HomeAssistant) -> None:
    manager = await _manager(hass)
    hass.states.async_set("sensor.pv", "1500", POWER)
    hass.states.async_set("sensor.grid", "-300", POWER)
    await manager.async_save_profile(
        {
            "modules": {
                "solar": {"sensors": {"production_power": "sensor.pv"}},
                "grid": {
                    "sensors": {"net_power": "sensor.grid"},
                    "sign_convention": "positive_import",
                },
            },
            "tariff": {"scheme": "single", "prices": {"single": 0.25}, "vat_percent": 10},
        },
        0,
    )
    user = RecordedConnection(admin=False)

    await _call(hass, websocket_get_state, user, {"id": 1, "type": "domusos/energy/get_state"})

    state = user.results[1]
    assert state["configured"] is True
    assert state["modules"]["solar"]["freshness"] == "fresh"
    assert state["modules"]["solar"]["quantities"]["production_power"]["stale_after"] == 1800.0
    assert state["home_consumption"]["value"] == 1200.0
    assert state["home_consumption"]["freshness"] == "fresh"
    assert state["tariff"]["vat_percent"] == 10
    await manager.async_shutdown()


@pytest.mark.parametrize("handler", [websocket_discover, websocket_get_profile, websocket_save_profile])
async def test_profile_commands_require_an_administrator(hass: HomeAssistant, handler: Any) -> None:
    await _manager(hass)
    msg = {"id": 1, "type": "x", "profile": {"modules": {}}, "expected_revision": 0}

    with pytest.raises(Unauthorized):
        handler(hass, RecordedConnection(admin=False), msg)


async def test_admin_saves_with_revision_conflicts_reported(hass: HomeAssistant) -> None:
    manager = await _manager(hass)
    hass.states.async_set("sensor.pv", "900", POWER)
    admin = RecordedConnection(admin=True)
    profile = {"modules": {"solar": {"sensors": {"production_power": "sensor.pv"}}}}

    await _call(hass, websocket_save_profile, admin, {"id": 1, "profile": profile, "expected_revision": 0})
    await _call(hass, websocket_save_profile, admin, {"id": 2, "profile": profile, "expected_revision": 0})
    await _call(hass, websocket_get_profile, admin, {"id": 3})

    assert admin.results[1]["profile"]["revision"] == 1
    assert admin.errors[2] == "revision_conflict"
    assert admin.results[3]["module_status"]["solar"] == "online"
    await manager.async_shutdown()


async def test_commands_report_an_unavailable_energy_core(hass: HomeAssistant) -> None:
    await _manager(hass, loaded=False)
    admin = RecordedConnection(admin=True)

    await _call(hass, websocket_get_state, admin, {"id": 1})
    await _call(hass, websocket_get_profile, admin, {"id": 2})

    assert admin.errors == {1: "energy_unavailable", 2: "energy_unavailable"}
