"""Lifecycle and safety tests for Domus Core Irrigation."""

from copy import deepcopy
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from homeassistant.const import ATTR_ENTITY_ID, STATE_OFF, STATE_ON, STATE_UNAVAILABLE
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er

from custom_components.domusos.irrigation.manager import IrrigationManager
from custom_components.domusos.irrigation.models import (
    IrrigationActiveSessionConflictError,
    IrrigationConflictError,
    IrrigationOperationError,
    IrrigationPermissionError,
    default_document,
)


OWNER = SimpleNamespace(id="owner-1", is_admin=True, permissions=None)
ACTIVE_MANAGERS: list[IrrigationManager] = []


@pytest.fixture(autouse=True)
async def cleanup_irrigation_managers():
    """Cancel every scheduler/listener installed by a manager under test."""
    yield
    for manager in reversed(ACTIVE_MANAGERS):
        manager._clear_runtime_listeners()
        manager._cancel_all_timers()
    ACTIVE_MANAGERS.clear()


def configuration(*, zones: int = 1, concurrent: int = 1, rain_policy: str = "stop_immediately"):
    zone_values = [
        {
            "id": "garden", "name": "Garden", "entityId": "switch.garden",
            "enabled": True, "days": ["mon"], "startTimes": ["06:00"],
            "baseDuration": 10, "manualDurationMin": 10,
        },
        {
            "id": "orchard", "name": "Orchard", "entityId": "valve.orchard",
            "enabled": True, "days": ["mon"], "startTimes": ["06:00"],
            "baseDuration": 8, "manualDurationMin": 8,
        },
    ][:zones]
    return {
        "settings": {
            "maximumManualDurationMin": 30,
            "maxConcurrentZones": concurrent,
            "parallelSafetyAcknowledged": concurrent > 1,
            "rainSensorEnabled": False,
            "rainSensorEntityId": "",
            "blockOnRainSensorUnavailable": True,
            "rainDuringCycle": rain_policy,
        },
        "sources": {},
        "zones": zone_values,
    }


async def manager_for(hass: HomeAssistant, stored=None) -> IrrigationManager:
    hass.auth.async_get_user = AsyncMock(return_value=OWNER)
    manager = IrrigationManager(hass)
    manager.store.async_load = AsyncMock(return_value=stored)
    manager.store.async_save = AsyncMock()
    await manager.async_setup()
    ACTIVE_MANAGERS.append(manager)
    return manager


def register_actuators(hass: HomeAssistant) -> None:
    hass.states.async_set("switch.garden", STATE_OFF)
    hass.states.async_set("valve.orchard", "closed")

    async def turn_switch(call) -> None:
        hass.states.async_set("switch.garden", STATE_ON if call.service == "turn_on" else STATE_OFF)

    async def turn_valve(call) -> None:
        hass.states.async_set("valve.orchard", "open" if call.service == "open_valve" else "closed")

    hass.services.async_register("switch", "turn_on", turn_switch)
    hass.services.async_register("switch", "turn_off", turn_switch)
    hass.services.async_register("valve", "open_valve", turn_valve)
    hass.services.async_register("valve", "close_valve", turn_valve)


async def test_revision_idempotency_and_confirmed_open_close(hass: HomeAssistant) -> None:
    register_actuators(hass)
    manager = await manager_for(hass)
    saved = await manager.async_save_configuration(configuration(), None, OWNER)
    assert saved["revision"] == 1
    with pytest.raises(IrrigationConflictError):
        await manager.async_save_configuration(configuration(), 0, OWNER)

    await manager.async_resume(OWNER)
    first = await manager.async_start_zone("garden", 5, OWNER, request_id="same-request")
    second = await manager.async_start_zone("garden", 5, OWNER, request_id="same-request")
    assert first["id"] == second["id"]
    assert manager.state_for_user(OWNER)["sessions"][0]["state"] == "running"

    await manager.async_stop_zone("garden", OWNER)
    assert hass.states.get("switch.garden").state == STATE_OFF
    assert manager.state_for_user(OWNER)["sessions"] == []
    assert manager.document["history"][-1]["state"] == "completed"


async def test_legacy_automations_remain_off_but_can_be_exposed_for_removal(
    hass: HomeAssistant,
) -> None:
    registry = er.async_get(hass)
    entry = registry.async_get_or_create(
        "automation",
        "automation",
        "irrigation_garden",
        suggested_object_id="irrigazione_smart_giardino",
    )
    hass.states.async_set(
        entry.entity_id,
        STATE_ON,
        {"friendly_name": "Irrigazione Smart: Giardino"},
    )

    async def turn_off(call) -> None:
        target = call.data.get(ATTR_ENTITY_ID, [])
        entity_ids = [target] if isinstance(target, str) else target
        for entity_id in entity_ids:
            hass.states.async_set(
                entity_id,
                STATE_OFF,
                {"friendly_name": "Irrigazione Smart: Giardino"},
            )

    async def reload_automations(_call) -> None:
        hass.states.async_set(
            entry.entity_id,
            STATE_OFF,
            {"friendly_name": "Irrigazione Smart: Giardino"},
        )

    hass.services.async_register("automation", "turn_off", turn_off)
    hass.services.async_register("automation", "reload", reload_automations)
    manager = await manager_for(hass)

    await manager.async_save_configuration(
        configuration(), None, OWNER, migrate_legacy=True
    )
    assert manager.document["legacyAutomations"] == [entry.entity_id]
    assert registry.async_get(entry.entity_id).disabled_by is None
    assert hass.states.get(entry.entity_id).state == STATE_OFF

    # Reproduce the state created by the first Core migration build: the YAML
    # source still exists but its registry entry was hidden by the integration.
    registry.async_update_entity(
        entry.entity_id, disabled_by=er.RegistryEntryDisabler.INTEGRATION
    )
    hass.states.async_remove(entry.entity_id)
    assert manager.state_for_user(OWNER)["legacyAutomationsReadyForRemoval"] is False

    state = await manager.async_prepare_legacy_automation_removal(OWNER)

    assert registry.async_get(entry.entity_id).disabled_by is None
    assert hass.states.get(entry.entity_id).state == STATE_OFF
    assert state["legacyAutomationsReadyForRemoval"] is True
    assert state["legacyAutomationsRequireRestart"] is False


async def test_request_id_remains_idempotent_after_reload(hass: HomeAssistant) -> None:
    register_actuators(hass)
    manager = await manager_for(hass)
    await manager.async_save_configuration(configuration(), None, OWNER)
    await manager.async_resume(OWNER)
    await manager.async_start_zone("garden", 5, OWNER, request_id="persistent-request")
    await manager.async_stop_zone("garden", OWNER)
    stored = deepcopy(manager.document)
    await manager.async_shutdown()

    reloaded = await manager_for(hass, stored)
    with pytest.raises(IrrigationOperationError, match="già elaborata"):
        await reloaded.async_start_zone("garden", 5, OWNER, request_id="persistent-request")


async def test_schedule_occurrence_is_never_started_twice(hass: HomeAssistant) -> None:
    register_actuators(hass)
    manager = await manager_for(hass)
    await manager.async_save_configuration(configuration(), None, OWNER)
    await manager.async_resume(OWNER)

    occurrence_id = "garden:2026-09-14:06:00"
    await manager.async_start_zone(
        "garden", 5, None, source="schedule", occurrence_id=occurrence_id
    )
    await manager.async_stop_zone("garden", OWNER)
    with pytest.raises(IrrigationOperationError, match="Occorrenza"):
        await manager.async_start_zone(
            "garden", 5, None, source="schedule", occurrence_id=occurrence_id
        )

    assert manager.document["sessions"] == []


async def test_schedule_maturing_while_stopped_is_recorded_as_skipped(
    hass: HomeAssistant,
) -> None:
    register_actuators(hass)
    manager = await manager_for(hass)
    await manager.async_save_configuration(configuration(), None, OWNER)

    local_occurrence = datetime(2026, 9, 14, 6, 0, tzinfo=timezone.utc)
    with patch(
        "custom_components.domusos.irrigation.manager.dt_util.as_local",
        return_value=local_occurrence,
    ):
        manager._on_schedule_time(local_occurrence)
    await hass.async_block_till_done()

    assert manager.document["sessions"] == []
    assert manager.document["history"][-1]["state"] == "skipped"
    assert manager.document["history"][-1]["reason"] == "system_stopped"


async def test_fifo_queue_pause_resume_and_stop(hass: HomeAssistant) -> None:
    register_actuators(hass)
    manager = await manager_for(hass)
    await manager.async_save_configuration(configuration(zones=2), None, OWNER)
    await manager.async_resume(OWNER)
    await manager.async_start_zone("garden", 5, OWNER)
    await manager.async_start_zone("orchard", 5, OWNER)
    assert [item["state"] for item in manager.document["sessions"]] == ["running", "queued"]

    await manager.async_stop_zone("garden", OWNER)
    assert manager.document["sessions"][0]["zoneId"] == "orchard"
    assert manager.document["sessions"][0]["state"] == "running"
    await manager.async_pause(OWNER)
    # Flush the state-change event generated by the intentional switch close.
    # It must not be interpreted as an external cancellation of the session.
    await hass.async_block_till_done()
    assert manager.document["mode"] == "paused"
    assert manager.document["sessions"][0]["state"] == "paused"
    paused_remaining = manager.document["sessions"][0]["remainingSeconds"]
    await manager.async_resume(OWNER)
    await hass.async_block_till_done()
    assert manager.document["sessions"][0]["state"] == "running"
    assert manager.document["sessions"][0]["remainingSeconds"] == paused_remaining
    await manager.async_stop_all(OWNER)
    assert manager.document["mode"] == "stopped"
    assert manager.document["sessions"] == []


async def test_safe_zone_addition_is_allowed_during_active_irrigation(
    hass: HomeAssistant,
) -> None:
    register_actuators(hass)
    manager = await manager_for(hass)
    await manager.async_save_configuration(configuration(), None, OWNER)
    await manager.async_resume(OWNER)
    await manager.async_start_zone("garden", 5, OWNER)

    saved = await manager.async_save_configuration(configuration(zones=2), 1, OWNER)

    assert saved["revision"] == 2
    assert [zone["id"] for zone in saved["zones"]] == ["garden", "orchard"]
    assert manager.document["sessions"][0]["zoneId"] == "garden"
    assert manager.document["sessions"][0]["state"] == "running"
    await manager.async_stop_all(OWNER)


async def test_live_zone_and_safety_changes_have_explicit_conflicts(
    hass: HomeAssistant,
) -> None:
    register_actuators(hass)
    manager = await manager_for(hass)
    await manager.async_save_configuration(configuration(zones=2), None, OWNER)
    await manager.async_resume(OWNER)
    await manager.async_start_zone("garden", 5, OWNER)

    without_active_zone = configuration(zones=2)
    without_active_zone["zones"] = [without_active_zone["zones"][1]]
    with pytest.raises(IrrigationActiveSessionConflictError, match="Non puoi rimuovere Garden"):
        await manager.async_save_configuration(without_active_zone, 1, OWNER)

    changed_actuator = configuration(zones=2)
    changed_actuator["zones"][0]["entityId"] = "switch.garden_replacement"
    with pytest.raises(IrrigationActiveSessionConflictError, match="cambiare la valvola o lo switch"):
        await manager.async_save_configuration(changed_actuator, 1, OWNER)

    changed_concurrency = configuration(zones=2, concurrent=2)
    with pytest.raises(IrrigationActiveSessionConflictError, match="zone simultanee"):
        await manager.async_save_configuration(changed_concurrency, 1, OWNER)

    changed_rain_policy = configuration(zones=2, rain_policy="finish_active")
    with pytest.raises(IrrigationActiveSessionConflictError, match="protezioni pioggia"):
        await manager.async_save_configuration(changed_rain_policy, 1, OWNER)

    await manager.async_stop_all(OWNER)


async def test_unavailable_rain_sensor_blocks_start(hass: HomeAssistant) -> None:
    register_actuators(hass)
    value = configuration()
    value["settings"].update({
        "rainSensorEnabled": True,
        "rainSensorEntityId": "binary_sensor.rain",
        "blockOnRainSensorUnavailable": True,
    })
    hass.states.async_set("binary_sensor.rain", STATE_UNAVAILABLE)
    manager = await manager_for(hass)
    await manager.async_save_configuration(value, None, OWNER)
    await manager.async_resume(OWNER)
    with pytest.raises(IrrigationOperationError, match="pioggia"):
        await manager.async_start_zone("garden", 5, OWNER)


@pytest.mark.parametrize(
    ("policy", "active_remains"),
    [("stop_immediately", False), ("finish_active", True)],
)
async def test_rain_policy_controls_active_cycle(
    hass: HomeAssistant, policy: str, active_remains: bool
) -> None:
    register_actuators(hass)
    manager = await manager_for(hass)
    await manager.async_save_configuration(configuration(rain_policy=policy), None, OWNER)
    await manager.async_resume(OWNER)
    await manager.async_start_zone("garden", 5, OWNER)
    manager.document["settings"].update({
        "rainSensorEnabled": True, "rainSensorEntityId": "binary_sensor.rain"
    })
    hass.states.async_set("binary_sensor.rain", STATE_ON)
    await manager._async_interrupt_for_rain(stop_active=policy == "stop_immediately")
    assert bool(manager.document["sessions"]) is active_remains
    await manager.async_stop_all(OWNER)


async def test_unavailable_rain_sensor_always_stops_an_active_cycle(hass: HomeAssistant) -> None:
    register_actuators(hass)
    manager = await manager_for(hass)
    await manager.async_save_configuration(configuration(rain_policy="finish_active"), None, OWNER)
    await manager.async_resume(OWNER)
    await manager.async_start_zone("garden", 5, OWNER)
    manager.document["settings"].update({
        "rainSensorEnabled": True,
        "rainSensorEntityId": "binary_sensor.rain",
        "blockOnRainSensorUnavailable": True,
    })
    hass.states.async_set("binary_sensor.rain", STATE_UNAVAILABLE)
    await manager._async_interrupt_for_rain(stop_active=True)
    assert manager.document["sessions"] == []
    assert manager.document["history"][-1]["reason"] == "rain_sensor_unavailable"


async def test_fault_cannot_resume_until_every_actuator_is_closed(hass: HomeAssistant) -> None:
    register_actuators(hass)
    manager = await manager_for(hass)
    await manager.async_save_configuration(configuration(), None, OWNER)
    manager.document["mode"] = "fault"
    hass.states.async_set("switch.garden", STATE_ON)
    with pytest.raises(IrrigationOperationError, match="chiudi manualmente"):
        await manager.async_resume(OWNER)
    hass.states.async_set("switch.garden", STATE_OFF)
    await manager.async_resume(OWNER)
    assert manager.document["mode"] == "enabled"


async def test_close_watchdog_enters_fault(hass: HomeAssistant) -> None:
    register_actuators(hass)
    manager = await manager_for(hass)
    await manager.async_save_configuration(configuration(), None, OWNER)
    with (
        patch.object(manager, "_async_set_actuator", AsyncMock(return_value=False)),
        patch("custom_components.domusos.irrigation.manager.asyncio.sleep", AsyncMock()),
        patch("custom_components.domusos.irrigation.manager.ir.async_create_issue") as create_issue,
    ):
        assert not await manager._async_close_with_watchdog(manager.document["zones"][0], OWNER, "test")
    assert manager.document["mode"] == "fault"
    assert create_issue.call_args.kwargs["is_persistent"] is True


async def test_unconfirmed_open_is_forced_through_close_watchdog(
    hass: HomeAssistant,
) -> None:
    register_actuators(hass)
    manager = await manager_for(hass)
    await manager.async_save_configuration(configuration(), None, OWNER)
    await manager.async_resume(OWNER)
    with patch.object(
        manager,
        "_async_set_actuator",
        AsyncMock(side_effect=[False, True]),
    ) as set_actuator:
        await manager.async_start_zone("garden", 5, OWNER)
    assert set_actuator.await_count == 2
    assert manager.document["sessions"] == []
    assert manager.document["history"][-1]["reason"] == "open_not_confirmed_safely_closed"


async def test_permissions_are_checked_on_each_actuator(hass: HomeAssistant) -> None:
    register_actuators(hass)
    manager = await manager_for(hass)
    await manager.async_save_configuration(configuration(), None, OWNER)
    await manager.async_resume(OWNER)
    limited = SimpleNamespace(
        id="limited", is_admin=False,
        permissions=SimpleNamespace(check_entity=lambda *_args: False),
    )
    with pytest.raises(IrrigationPermissionError):
        await manager.async_start_zone("garden", 5, limited)


async def test_global_resume_checks_every_enabled_zone_and_protects_migration(
    hass: HomeAssistant,
) -> None:
    register_actuators(hass)
    manager = await manager_for(hass)
    await manager.async_save_configuration(configuration(zones=2), None, OWNER)
    garden_only = SimpleNamespace(
        id="garden-only",
        is_admin=False,
        permissions=SimpleNamespace(
            check_entity=lambda entity_id, _policy: entity_id == "switch.garden"
        ),
    )
    with pytest.raises(IrrigationPermissionError):
        await manager.async_resume(garden_only)

    all_zones = SimpleNamespace(
        id="all-zones",
        is_admin=False,
        permissions=SimpleNamespace(check_entity=lambda *_args: True),
    )
    with pytest.raises(IrrigationPermissionError, match="migrazione"):
        await manager.async_resume(all_zones)


async def test_restart_closes_active_session_and_never_resumes(hass: HomeAssistant) -> None:
    register_actuators(hass)
    hass.states.async_set("switch.garden", STATE_ON)
    stored = default_document() | configuration()
    stored.update({
        "revision": 2,
        "mode": "enabled",
        "sessions": [{
            "id": "old", "zoneId": "garden", "entityId": "switch.garden",
            "state": "running", "source": "schedule", "remainingSeconds": 200,
        }],
    })
    manager = await manager_for(hass, stored)
    assert hass.states.get("switch.garden").state == STATE_OFF
    assert manager.document["mode"] == "stopped"
    assert manager.document["sessions"] == []
    assert manager.document["history"][-1]["state"] == "interrupted"
