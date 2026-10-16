"""Device power policies inside Home Assistant: controllers, store and safety rules."""

from __future__ import annotations

from datetime import timedelta
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, patch

from freezegun.api import FrozenDateTimeFactory
import pytest

from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import HomeAssistantError
from pytest_homeassistant_custom_component.common import async_fire_time_changed, async_mock_service

from custom_components.domusos.device_power import DevicePowerManager, DevicePowerStoreStatus
from custom_components.domusos.device_power.models import (
    STORAGE_KEY,
    InvalidPolicyError,
    PermissionDeniedError,
    RevisionConflictError,
    SaveFailedError,
    StoreCorruptError,
    SwitchInUseError,
)

ADMIN = SimpleNamespace(id="admin-1", is_admin=True)
MEMBER = SimpleNamespace(id="member-1", is_admin=False)
BATTERY = "sensor.tablet_battery_level"
SWITCH = "switch.presa_tablet"


def settings(**overrides: Any) -> dict[str, Any]:
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


@pytest.fixture
def switch_calls(hass: HomeAssistant) -> dict[str, list[ServiceCall]]:
    return {
        "turn_on": async_mock_service(hass, "switch", "turn_on"),
        "turn_off": async_mock_service(hass, "switch", "turn_off"),
    }


def set_states(hass: HomeAssistant, battery: str, switch: str, *, battery_id: str = BATTERY, switch_id: str = SWITCH) -> None:
    hass.states.async_set(battery_id, battery, {"device_class": "battery", "unit_of_measurement": "%"})
    hass.states.async_set(switch_id, switch)


async def started_manager(hass: HomeAssistant) -> DevicePowerManager:
    manager = DevicePowerManager(hass, runtime=lambda: None)
    await manager.async_setup()
    await hass.async_block_till_done()
    return manager


def commands(calls: dict[str, list[ServiceCall]]) -> list[tuple[str, str]]:
    return [(service, call.data["entity_id"]) for service in ("turn_on", "turn_off") for call in calls[service]]


# --- Thresholds and hysteresis -------------------------------------------------------


async def test_low_battery_turns_the_charger_on(hass: HomeAssistant, switch_calls) -> None:
    set_states(hass, "30", "off")
    manager = await started_manager(hass)
    await manager.async_save_policy(ADMIN, settings())
    await hass.async_block_till_done()
    assert commands(switch_calls) == [("turn_on", SWITCH)]
    await manager.async_shutdown()


async def test_full_battery_turns_the_charger_off(hass: HomeAssistant, switch_calls) -> None:
    set_states(hass, "80", "on")
    manager = await started_manager(hass)
    await manager.async_save_policy(ADMIN, settings())
    await hass.async_block_till_done()
    assert commands(switch_calls) == [("turn_off", SWITCH)]
    await manager.async_shutdown()


async def test_between_the_thresholds_nothing_changes(hass: HomeAssistant, switch_calls) -> None:
    set_states(hass, "50", "off")
    manager = await started_manager(hass)
    await manager.async_save_policy(ADMIN, settings())
    await hass.async_block_till_done()
    set_states(hass, "55", "off")
    await hass.async_block_till_done()
    assert commands(switch_calls) == []
    await manager.async_shutdown()


async def test_the_controller_follows_battery_changes(
    hass: HomeAssistant, switch_calls, freezer: FrozenDateTimeFactory
) -> None:
    set_states(hass, "50", "off")
    manager = await started_manager(hass)
    await manager.async_save_policy(ADMIN, settings())
    await hass.async_block_till_done()
    set_states(hass, "25", "off")
    await hass.async_block_till_done()
    assert commands(switch_calls) == [("turn_on", SWITCH)]
    freezer.tick(timedelta(seconds=61))
    set_states(hass, "85", "on")
    await hass.async_block_till_done()
    assert commands(switch_calls) == [("turn_on", SWITCH), ("turn_off", SWITCH)]
    await manager.async_shutdown()


async def test_no_command_when_the_switch_is_already_right(hass: HomeAssistant, switch_calls) -> None:
    set_states(hass, "20", "on")
    manager = await started_manager(hass)
    await manager.async_save_policy(ADMIN, settings())
    await hass.async_block_till_done()
    assert commands(switch_calls) == []
    policy = manager.state_for_user(ADMIN)["policies"][0]
    assert policy["runtime"]["status"] == "charging"
    await manager.async_shutdown()


@pytest.mark.parametrize("battery", ["unknown", "unavailable", "abc", "-5", "120"])
async def test_untrustworthy_battery_data_never_drives_the_switch(
    hass: HomeAssistant, switch_calls, battery: str
) -> None:
    set_states(hass, battery, "off")
    manager = await started_manager(hass)
    await manager.async_save_policy(ADMIN, settings())
    await hass.async_block_till_done()
    assert commands(switch_calls) == []
    assert manager.state_for_user(ADMIN)["policies"][0]["runtime"]["status"] == "battery_unavailable"
    await manager.async_shutdown()


@pytest.mark.parametrize("switch", ["unknown", "unavailable"])
async def test_an_unavailable_switch_is_never_commanded(hass: HomeAssistant, switch_calls, switch: str) -> None:
    set_states(hass, "10", switch)
    manager = await started_manager(hass)
    await manager.async_save_policy(ADMIN, settings())
    await hass.async_block_till_done()
    assert commands(switch_calls) == []
    assert manager.state_for_user(ADMIN)["policies"][0]["runtime"]["status"] == "switch_unavailable"
    await manager.async_shutdown()


async def test_a_returning_sensor_resumes_control(hass: HomeAssistant, switch_calls) -> None:
    set_states(hass, "unavailable", "off")
    manager = await started_manager(hass)
    await manager.async_save_policy(ADMIN, settings())
    await hass.async_block_till_done()
    set_states(hass, "15", "off")
    await hass.async_block_till_done()
    assert commands(switch_calls) == [("turn_on", SWITCH)]
    await manager.async_shutdown()


# --- Failures, cooldown, concurrency ---------------------------------------------------


async def test_a_failed_call_is_reported_and_retried_later(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    attempts: list[ServiceCall] = []

    async def failing(call: ServiceCall) -> None:
        attempts.append(call)
        raise HomeAssistantError("plug offline")

    hass.services.async_register("switch", "turn_on", failing)
    hass.services.async_register("switch", "turn_off", failing)
    set_states(hass, "20", "off")
    manager = await started_manager(hass)
    await manager.async_save_policy(ADMIN, settings())
    await hass.async_block_till_done()
    runtime = manager.state_for_user(ADMIN)["policies"][0]["runtime"]
    assert runtime["status"] == "error"
    assert runtime["last_error"]["code"] == "service_call_failed"
    assert len(attempts) == 1

    # Too soon: the cooldown holds the retry, then lets it through.
    set_states(hass, "19", "off")
    await hass.async_block_till_done()
    assert len(attempts) == 1
    freezer.tick(timedelta(seconds=61))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert len(attempts) == 2
    await manager.async_shutdown()


async def test_concurrent_triggers_send_one_command(hass: HomeAssistant, switch_calls) -> None:
    set_states(hass, "50", "off")
    manager = await started_manager(hass)
    await manager.async_save_policy(ADMIN, settings())
    await hass.async_block_till_done()
    for level in ("25", "24", "23"):
        hass.states.async_set(BATTERY, level)
    await hass.async_block_till_done()
    assert commands(switch_calls) == [("turn_on", SWITCH)]
    await manager.async_shutdown()


async def test_one_failing_policy_does_not_stop_another(hass: HomeAssistant) -> None:
    calls: list[str] = []

    async def turn_on(call: ServiceCall) -> None:
        if call.data["entity_id"] == "switch.presa_cucina":
            raise HomeAssistantError("plug offline")
        calls.append(call.data["entity_id"])

    hass.services.async_register("switch", "turn_on", turn_on)
    hass.services.async_register("switch", "turn_off", AsyncMock())
    set_states(hass, "20", "off")
    set_states(hass, "20", "off", battery_id="sensor.tablet_cucina_battery", switch_id="switch.presa_cucina")
    manager = await started_manager(hass)
    await manager.async_save_policy(
        ADMIN,
        settings(
            client_id="client-0002",
            battery_entity_id="sensor.tablet_cucina_battery",
            switch_entity_id="switch.presa_cucina",
        ),
    )
    await manager.async_save_policy(ADMIN, settings())
    await hass.async_block_till_done()
    assert calls == [SWITCH]
    statuses = {policy["switch_entity_id"]: policy["runtime"]["status"] for policy in manager.state_for_user(ADMIN)["policies"]}
    assert statuses == {"switch.presa_cucina": "error", SWITCH: "charging"}
    await manager.async_shutdown()


# --- Disable, delete, conflicts --------------------------------------------------------


async def test_disabling_stops_control_and_leaves_the_switch_alone(hass: HomeAssistant, switch_calls) -> None:
    set_states(hass, "50", "on")
    manager = await started_manager(hass)
    created = await manager.async_save_policy(ADMIN, settings())
    await manager.async_save_policy(
        ADMIN, settings(enabled=False), policy_id=created["policy_id"], expected_revision=1
    )
    set_states(hass, "95", "on")
    await hass.async_block_till_done()
    assert commands(switch_calls) == []
    assert manager.state_for_user(ADMIN)["policies"][0]["runtime"]["status"] == "disabled"
    await manager.async_shutdown()


async def test_deleting_a_policy_leaves_the_switch_alone(hass: HomeAssistant, switch_calls) -> None:
    set_states(hass, "50", "on")
    manager = await started_manager(hass)
    created = await manager.async_save_policy(ADMIN, settings())
    await manager.async_delete_policy(ADMIN, created["policy_id"], 1)
    set_states(hass, "95", "on")
    await hass.async_block_till_done()
    assert commands(switch_calls) == []
    assert manager.state_for_user(ADMIN)["policies"] == []
    await manager.async_shutdown()


async def test_two_active_policies_cannot_drive_one_switch(hass: HomeAssistant, switch_calls) -> None:
    set_states(hass, "50", "off")
    set_states(hass, "50", "off", battery_id="sensor.altro_tablet_battery", switch_id=SWITCH)
    manager = await started_manager(hass)
    await manager.async_save_policy(ADMIN, settings())
    with pytest.raises(SwitchInUseError):
        await manager.async_save_policy(
            ADMIN, settings(client_id="client-0002", battery_entity_id="sensor.altro_tablet_battery")
        )
    assert len(manager.state_for_user(ADMIN)["policies"]) == 1
    await manager.async_shutdown()


async def test_a_stale_revision_is_a_conflict_and_a_no_op_writes_nothing(hass: HomeAssistant, switch_calls) -> None:
    set_states(hass, "50", "off")
    manager = await started_manager(hass)
    created = await manager.async_save_policy(ADMIN, settings())
    with pytest.raises(RevisionConflictError):
        await manager.async_save_policy(
            ADMIN, settings(label="Altro"), policy_id=created["policy_id"], expected_revision=7
        )
    with patch.object(manager.store, "async_save", new=AsyncMock()) as save:
        same = await manager.async_save_policy(
            ADMIN, settings(), policy_id=created["policy_id"], expected_revision=1
        )
    save.assert_not_called()
    assert same["revision"] == 1 and same["updated_at"] == created["updated_at"]
    await manager.async_shutdown()


async def test_invalid_entities_and_thresholds_are_refused(hass: HomeAssistant, switch_calls) -> None:
    set_states(hass, "50", "off")
    manager = await started_manager(hass)
    with pytest.raises(InvalidPolicyError):
        await manager.async_save_policy(ADMIN, settings(start_threshold=80, stop_threshold=30))
    with pytest.raises(InvalidPolicyError):
        await manager.async_save_policy(ADMIN, settings(switch_entity_id="switch.missing"))
    assert manager.state_for_user(ADMIN)["policies"] == []
    await manager.async_shutdown()


async def test_only_administrators_manage_policies(hass: HomeAssistant, switch_calls) -> None:
    set_states(hass, "50", "off")
    manager = await started_manager(hass)
    with pytest.raises(PermissionDeniedError):
        await manager.async_save_policy(MEMBER, settings())
    with pytest.raises(PermissionDeniedError):
        manager.state_for_user(MEMBER)
    await manager.async_shutdown()


async def test_a_policy_is_linked_again_after_its_device_lost_its_reference(hass: HomeAssistant, switch_calls) -> None:
    set_states(hass, "50", "off")
    manager = await started_manager(hass)
    created = await manager.async_save_policy(ADMIN, settings(client_id="old-client-1"))
    linked = await manager.async_bind_policy(ADMIN, created["policy_id"], 1, "new-client-2")
    assert linked["client_id"] == "new-client-2"
    assert linked["revision"] == 2
    await manager.async_shutdown()


# --- Store and restart -----------------------------------------------------------------


def stored_policy(**overrides: Any) -> dict[str, Any]:
    policy = {
        **settings(),
        "policy_id": "0123456789abcdef0123456789abcdef",
        "revision": 3,
        "created_at": "2026-10-16T10:00:00+00:00",
        "updated_at": "2026-10-16T10:00:00+00:00",
    }
    policy.update(overrides)
    return policy


async def test_policies_resume_from_the_store_after_a_restart(
    hass: HomeAssistant, hass_storage: dict[str, Any], switch_calls
) -> None:
    hass_storage[STORAGE_KEY] = {"version": 1, "minor_version": 1, "key": STORAGE_KEY, "data": {"policies": [stored_policy()]}}
    set_states(hass, "12", "off")
    manager = await started_manager(hass)
    assert manager.status is DevicePowerStoreStatus.READY
    assert commands(switch_calls) == [("turn_on", SWITCH)]
    await manager.async_shutdown()


async def test_a_corrupt_store_runs_nothing_and_is_never_overwritten(
    hass: HomeAssistant, hass_storage: dict[str, Any], switch_calls
) -> None:
    corrupt = {"policies": [stored_policy(start_threshold=90, stop_threshold=10)]}
    hass_storage[STORAGE_KEY] = {"version": 1, "minor_version": 1, "key": STORAGE_KEY, "data": corrupt}
    set_states(hass, "5", "off")
    manager = await started_manager(hass)
    assert manager.status is DevicePowerStoreStatus.CORRUPT
    assert manager.state_for_user(ADMIN) == {"status": "corrupt", "policies": []}
    with pytest.raises(StoreCorruptError):
        await manager.async_save_policy(ADMIN, settings())
    await hass.async_block_till_done()
    assert commands(switch_calls) == []
    assert hass_storage[STORAGE_KEY]["data"] == corrupt
    await manager.async_shutdown()


async def test_a_failed_write_keeps_the_previous_policy_in_force(hass: HomeAssistant, switch_calls) -> None:
    set_states(hass, "50", "off")
    manager = await started_manager(hass)
    created = await manager.async_save_policy(ADMIN, settings())
    with patch.object(manager.store, "async_save", new=AsyncMock(side_effect=OSError("disk full"))):
        with pytest.raises(SaveFailedError):
            await manager.async_save_policy(
                ADMIN, settings(start_threshold=60), policy_id=created["policy_id"], expected_revision=1
            )
    policy = manager.state_for_user(ADMIN)["policies"][0]
    assert policy["start_threshold"] == 30 and policy["revision"] == 1
    # The previous settings still control the switch: 25 % is below their 30 %.
    set_states(hass, "25", "off")
    await hass.async_block_till_done()
    assert commands(switch_calls) == [("turn_on", SWITCH)]
    await manager.async_shutdown()


async def test_shutdown_releases_every_listener(hass: HomeAssistant, switch_calls) -> None:
    set_states(hass, "50", "off")
    manager = await started_manager(hass)
    await manager.async_save_policy(ADMIN, settings())
    await manager.async_shutdown()
    set_states(hass, "10", "off")
    await hass.async_block_till_done()
    assert commands(switch_calls) == []
