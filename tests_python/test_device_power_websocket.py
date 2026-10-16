"""Device power websocket contract and its place in the integration lifecycle."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import ExitStack, contextmanager
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, Mock, patch

from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import async_mock_service

from custom_components.domusos import DomusEntryData, async_setup_entry, async_unload_entry
from custom_components.domusos.calendar_store import DomusCalendarStore
from custom_components.domusos.const import DOMAIN
from custom_components.domusos.device_power import DATA_DEVICE_POWER_MANAGER, DevicePowerManager
from custom_components.domusos.device_power.api import async_register_device_power_api
from custom_components.domusos.irrigation import IrrigationManager

BATTERY = "sensor.tablet_battery_level"
SWITCH = "switch.presa_tablet"


def policy_settings(**overrides: Any) -> dict[str, Any]:
    payload = {
        "client_id": "client-0001",
        "label": "Tablet soggiorno",
        "enabled": True,
        "battery_entity_id": BATTERY,
        "switch_entity_id": SWITCH,
        "start_threshold": 30,
        "stop_threshold": 80,
    }
    payload.update(overrides)
    return payload


async def registered_manager(hass: HomeAssistant) -> DevicePowerManager:
    hass.states.async_set(BATTERY, "55", {"device_class": "battery", "unit_of_measurement": "%"})
    hass.states.async_set(SWITCH, "off")
    async_mock_service(hass, "switch", "turn_on")
    async_mock_service(hass, "switch", "turn_off")
    manager = DevicePowerManager(hass, runtime=lambda: None)
    await manager.async_setup()
    hass.data.setdefault(DOMAIN, {})[DATA_DEVICE_POWER_MANAGER] = manager
    await async_register_device_power_api(hass)
    return manager


async def test_an_administrator_saves_links_and_removes_a_policy(hass: HomeAssistant, hass_ws_client) -> None:
    manager = await registered_manager(hass)
    client = await hass_ws_client(hass)

    await client.send_json_auto_id({"type": "domusos/device_power/get_state"})
    empty = await client.receive_json()
    assert empty["success"] and empty["result"] == {"status": "ready", "policies": []}

    await client.send_json_auto_id({"type": "domusos/device_power/save_policy", "policy": policy_settings()})
    saved = await client.receive_json()
    assert saved["success"]
    policy = saved["result"]["policy"]
    assert policy["revision"] == 1 and policy["runtime"]["status"] in {"starting", "waiting"}

    await client.send_json_auto_id(
        {
            "type": "domusos/device_power/bind_policy",
            "policy_id": policy["policy_id"],
            "expected_revision": 1,
            "client_id": "client-0002",
        }
    )
    linked = await client.receive_json()
    assert linked["success"] and linked["result"]["policy"]["client_id"] == "client-0002"

    await client.send_json_auto_id(
        {
            "type": "domusos/device_power/save_policy",
            "policy_id": policy["policy_id"],
            "expected_revision": 1,
            "policy": policy_settings(label="Altro"),
        }
    )
    conflict = await client.receive_json()
    assert not conflict["success"] and conflict["error"]["code"] == "revision_conflict"

    await client.send_json_auto_id(
        {"type": "domusos/device_power/delete_policy", "policy_id": policy["policy_id"], "expected_revision": 2}
    )
    removed = await client.receive_json()
    assert removed["success"] and removed["result"]["policies"] == []
    await manager.async_shutdown()


async def test_invalid_settings_get_a_controlled_error(hass: HomeAssistant, hass_ws_client) -> None:
    manager = await registered_manager(hass)
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "domusos/device_power/save_policy",
            "policy": policy_settings(start_threshold=80, stop_threshold=80),
        }
    )
    response = await client.receive_json()
    assert not response["success"] and response["error"]["code"] == "invalid_policy"
    await manager.async_shutdown()


async def test_non_administrators_are_refused_by_every_command(
    hass: HomeAssistant, hass_ws_client, hass_read_only_access_token: str
) -> None:
    manager = await registered_manager(hass)
    client = await hass_ws_client(hass, hass_read_only_access_token)
    for message in (
        {"type": "domusos/device_power/get_state"},
        {"type": "domusos/device_power/save_policy", "policy": policy_settings()},
        {
            "type": "domusos/device_power/delete_policy",
            "policy_id": "0123456789abcdef0123456789abcdef",
            "expected_revision": 1,
        },
    ):
        await client.send_json_auto_id(message)
        response = await client.receive_json()
        assert not response["success"]
        assert response["error"]["code"] == "unauthorized"
    assert manager.state_for_user(SimpleNamespace(is_admin=True))["policies"] == []
    await manager.async_shutdown()


async def test_there_is_no_command_that_switches_a_charger(hass: HomeAssistant, hass_ws_client) -> None:
    manager = await registered_manager(hass)
    client = await hass_ws_client(hass)
    for name in ("turn_on", "turn_off", "set_switch", "charge"):
        await client.send_json_auto_id({"type": f"domusos/device_power/{name}", "entity_id": SWITCH})
        response = await client.receive_json()
        assert not response["success"] and response["error"]["code"] == "unknown_command"
    await manager.async_shutdown()


# --- Integration lifecycle -------------------------------------------------------------


@contextmanager
def _entry_environment(hass: HomeAssistant) -> Iterator[None]:
    hass.http = SimpleNamespace(async_register_static_paths=AsyncMock())
    with ExitStack() as stack:
        stack.enter_context(patch("custom_components.domusos.Path.is_file", return_value=True))
        stack.enter_context(patch("custom_components.domusos._panel_exists", return_value=False))
        stack.enter_context(
            patch("custom_components.domusos.panel_custom.async_register_panel", new=AsyncMock())
        )
        stack.enter_context(
            patch.object(hass.config_entries, "async_forward_entry_setups", new=AsyncMock())
        )
        stack.enter_context(
            patch.object(hass.config_entries, "async_unload_platforms", new=AsyncMock(return_value=True))
        )
        for manager in (IrrigationManager, DomusCalendarStore):
            stack.enter_context(patch.object(manager, "async_setup", new=AsyncMock()))
            stack.enter_context(patch.object(manager, "async_shutdown", new=AsyncMock()))
        yield


def _entry() -> SimpleNamespace:
    return SimpleNamespace(
        entry_id="domus-entry",
        runtime_data=None,
        async_on_unload=Mock(),
        add_update_listener=Mock(return_value=Mock()),
    )


async def test_the_integration_starts_and_releases_device_power(hass: HomeAssistant) -> None:
    entry = _entry()
    with _entry_environment(hass):
        assert await async_setup_entry(hass, entry)
        data: DomusEntryData = entry.runtime_data
        assert isinstance(data.device_power_manager, DevicePowerManager)
        assert hass.data[DOMAIN][DATA_DEVICE_POWER_MANAGER] is data.device_power_manager
        assert await async_unload_entry(hass, entry)
    assert DATA_DEVICE_POWER_MANAGER not in hass.data.get(DOMAIN, {})


async def test_a_device_power_failure_never_blocks_the_other_modules(hass: HomeAssistant) -> None:
    entry = _entry()
    with _entry_environment(hass), patch.object(
        DevicePowerManager, "async_setup", new=AsyncMock(side_effect=RuntimeError("boom"))
    ):
        assert await async_setup_entry(hass, entry)
        data: DomusEntryData = entry.runtime_data
        assert data.device_power_manager is None
        assert data.waste_collection_manager is not None
        assert await async_unload_entry(hass, entry)
