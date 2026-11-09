"""CLM.3A state store and live HA event integration; runs in the Linux HA harness."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from homeassistant.const import EVENT_CORE_CONFIG_UPDATE
from homeassistant.core import HomeAssistant
from test_climate_architecture import catalog, scenario_a

from custom_components.domusos.climate.intent import STATE_SCHEMA, state_document
from custom_components.domusos.climate.manager import ClimateManager
from custom_components.domusos.climate.models import (
    Conflict,
    InvalidConfig,
    OverrideUnavailable,
    StoreUnavailable,
    empty_config,
    storage_document,
)
from custom_components.domusos.climate.state_manager import ClimateStateManager


class MemoryStore:
    path = None

    def __init__(self, data=None):
        self.data = deepcopy(data)
        self.writes = 0

    async def async_load(self):
        return deepcopy(self.data)

    async def async_save(self, value):
        self.data = deepcopy(value)
        self.writes += 1


USER = SimpleNamespace(id="member-1", is_active=True, is_admin=False)


async def setup_state(hass, state_data=None, *, config=None, clock=None, schedule=None, execution_schedule=None):
    config = config or scenario_a()
    states = catalog(config)
    for generator in config["generators"]:
        if generator["setpointKind"] == "generator_water_temperature":
            entity_id = generator["entity"]["primaryEntityId"]
            states[entity_id].attributes.update(min_temp=30, max_temp=80, target_temp_step=1)
    for entity_id, state in states.items():
        hass.states.async_set(entity_id, state.state, state.attributes)
    hass.states.async_set("sensor.living_temp", "19.2", {"device_class": "temperature"})
    config_manager = ClimateManager(hass, store=MemoryStore(storage_document(1, config)), runtime=lambda: None)
    await config_manager.async_setup()
    store = MemoryStore(state_data)
    manager = ClimateStateManager(hass, config_manager, store=store, clock=clock, schedule=schedule,
                                  execution_schedule=execution_schedule)
    await manager.async_setup()
    return manager, store


async def test_execution_preview_is_read_only_and_bound_to_current_revisions(hass: HomeAssistant):
    config = scenario_a()
    config["zones"][0]["endpointIds"] = ["ac"]
    config["endpoints"] = [config["endpoints"][0]]
    config["endpoints"][0]["executionOwnership"] = "domus_supervised"
    config["zones"][0]["reference"].update(freshnessPolicy="max_age", maxAgeSeconds=300)
    config["circuits"] = []
    config["generators"] = []
    manager, store = await setup_state(hass, config=config)
    try:
        hass.states.async_set("sensor.living_temp", "27", {"device_class": "temperature", "unit_of_measurement": "°C"})
        hass.states.async_set("climate.ac", "cool", {"hvac_modes": ["heat", "cool", "off"], "supported_features": 1,
                              "temperature_unit": "°C", "temperature": 26, "current_temperature": 27,
                              "min_temp": 16, "max_temp": 30, "target_temp_step": 0.5})
        with patch.object(type(hass.services), "async_call", side_effect=AssertionError("device command")) as service_call:
            await manager.async_set_house_intent("cooling", "manual", 0, USER)
            response = await manager.async_set_zone_intent("living", "follow_house", 24, 1, USER)
            plan = response["executionPreview"]["plans"][0]
            assert plan["status"] == "eligible"
            assert plan["stateRevision"] == response["revision"] == 2
            assert plan["configRevision"] == response["configRevision"] == 1
            assert [action["kind"] for action in plan["actions"]] == ["set_temperature"]
            assert plan["physicalExecutionAllowed"] and plan["physicalBlockers"] == []
            assert (await manager.async_get_state())["executionPreview"]["plans"][0]["status"] == "eligible"
            hass.states.async_set("climate.ac", "cool", {"hvac_modes": ["heat", "cool", "off"], "supported_features": 1,
                                  "temperature_unit": "°C", "temperature": 24, "current_temperature": 27,
                                  "min_temp": 16, "max_temp": 30, "target_temp_step": 0.5})
            await hass.async_block_till_done()
            noop = manager.get_state()["executionPreview"]["plans"][0]
            assert noop["status"] == "noop" and noop["actions"] == []
            assert noop["physicalBlockers"] == ["no_command_required"]
            service_call.assert_not_called()
        assert store.writes == 2
    finally:
        await manager.async_shutdown()


async def test_execution_preview_observe_only_blocks_without_linux_reason(hass: HomeAssistant):
    config = scenario_a()
    config["zones"][0]["endpointIds"] = ["ac"]
    config["endpoints"] = [config["endpoints"][0]]
    config["circuits"] = []
    config["generators"] = []
    config["zones"][0]["reference"].update(freshnessPolicy="max_age", maxAgeSeconds=300)
    manager, _ = await setup_state(hass, config=config)
    try:
        hass.states.async_set("sensor.living_temp", "27", {"device_class": "temperature", "unit_of_measurement": "°C"})
        hass.states.async_set("climate.ac", "cool", {"hvac_modes": ["heat", "cool", "off"], "supported_features": 1,
                              "temperature_unit": "°C", "temperature": 26, "current_temperature": 27,
                              "min_temp": 16, "max_temp": 30, "target_temp_step": 0.5})
        with patch.object(type(hass.services), "async_call", side_effect=AssertionError("device command")) as service_call:
            await manager.async_set_house_intent("cooling", "manual", 0, USER)
            response = await manager.async_set_zone_intent("living", "follow_house", 24, 1, USER)
            plan = response["executionPreview"]["plans"][0]
            assert plan["status"] == "eligible"
            assert plan["physicalBlockers"] == ["endpoint_not_owned"]
            assert not plan["physicalExecutionAllowed"]
            service_call.assert_not_called()
    finally:
        await manager.async_shutdown()


async def test_absent_write_same_write_conflict_reload_and_live_sensor_change(hass: HomeAssistant):
    manager, store = await setup_state(hass)
    try:
        initial = manager.get_state()
        assert initial["state"] == "absent" and initial["revision"] == 0
        assert initial["preview"]["house"] == {"operatingMode": "off", "controlMode": "manual"}
        with patch.object(type(hass.services), "async_call", side_effect=AssertionError("device command")):
            first = await manager.async_set_house_intent("heating", "manual", 0, USER)
            assert first["revision"] == 1 and first["preview"]["zones"][0]["derived"]["thermalStatus"] == "unknown"
            second = await manager.async_set_zone_intent("living", "follow_house", 21, 1, USER)
            assert second["revision"] == 2 and second["preview"]["zones"][0]["derived"]["thermalStatus"] == "needs_heating"
            assert (await manager.async_set_zone_intent("living", "follow_house", 21, 2, USER))["revision"] == 2
            assert store.writes == 2
            with pytest.raises(Conflict):
                await manager.async_set_zone_intent("living", "off", 21, 1, USER)
            hass.states.async_set("sensor.living_temp", "21.1", {"device_class": "temperature"})
            await hass.async_block_till_done()
            assert manager.get_state()["preview"]["zones"][0]["derived"]["thermalStatus"] == "satisfied"
        restored = ClimateStateManager(hass, manager.config_manager, store=store)
        await restored.async_setup()
        try:
            assert restored.get_state()["revision"] == 2
            assert restored.get_state()["preview"]["zones"][0]["intent"]["targetTemperature"] == 21
        finally:
            await restored.async_shutdown()
    finally:
        await manager.async_shutdown()


async def test_corrupt_and_unsupported_state_are_not_overwritten(hass: HomeAssistant):
    base = state_document(1, {"house": {"operatingMode": "off", "controlMode": "manual"}, "zones": {}})
    bad_override = deepcopy(base)
    bad_override["intent"]["overrides"] = {"living": {"id": "invalid"}}
    for data, expected in (({"bad": True}, "corrupt"), (base | {"version": 9}, "unsupported"), (bad_override, "corrupt")):
        manager, store = await setup_state(hass, data)
        try:
            assert manager.get_state()["state"] == expected
            with pytest.raises(StoreUnavailable):
                await manager.async_set_house_intent("heating", "manual", 0, USER)
            assert store.writes == 0 and store.data == data
        finally:
            await manager.async_shutdown()


async def test_corrupt_state_never_resolves_auto_schedule_or_starts_boundary(hass: HomeAssistant):
    config = scenario_a()
    config["controlMode"] = "auto"
    config["operatingMode"] = "heating"
    config["profiles"] = [{"id": "comfort", "name": "Comfort", "zoneTargets": {"living": 21}}]
    config["schedules"] = [{"day": "monday", "events": [{"time": "06:00", "profileId": "comfort"}]}]
    manager, store = await setup_state(hass, {"bad": True}, config=config)
    try:
        response = manager.get_state()
        assert response["state"] == "corrupt"
        assert response["preview"] is None
        assert manager._boundary.handle is None
        assert store.writes == 0
    finally:
        await manager.async_shutdown()


async def test_late_callback_after_unload_cannot_restore_timer_or_listener(hass: HomeAssistant):
    await hass.config.async_set_time_zone("Europe/Rome")
    config = scenario_a()
    config["controlMode"] = "auto"
    config["profiles"] = [{"id": "comfort", "name": "Comfort", "zoneTargets": {"living": 21}}]
    config["schedules"] = [{"day": "monday", "events": [{"time": "06:00", "profileId": "comfort"}]}]
    handles = []

    class Handle:
        cancelled = False

        def cancel(self):
            self.cancelled = True

    def schedule(_delay, _callback):
        handle = Handle()
        handles.append(handle)
        return handle

    manager, _ = await setup_state(
        hass, config=config, clock=lambda: datetime.fromisoformat("2026-01-05T17:00:00+00:00"), schedule=schedule,
    )
    assert manager._boundary.handle is not None
    await manager.async_shutdown()
    manager._on_state_change(None)
    manager._on_core_config_update(None)
    manager._on_boundary()
    manager.refresh_config()
    assert manager._boundary.handle is None
    assert all(handle.cancelled for handle in handles)
    assert manager._unsub_states is None and manager._unsub_config is None


async def test_state_store_document_has_separate_schema(hass: HomeAssistant):
    manager, store = await setup_state(hass)
    try:
        await manager.async_set_house_intent("heating", "auto", 0, USER)
        assert store.data["schema"] == STATE_SCHEMA
        assert store.data["intent"]["house"] == {"operatingMode": "heating", "controlMode": "auto"}
        assert "observed" not in store.data and "derived" not in store.data
    finally:
        await manager.async_shutdown()


async def test_auto_schedule_boundary_config_timezone_and_manual_preservation_without_services(hass: HomeAssistant):
    await hass.config.async_set_time_zone("Europe/Rome")
    config = scenario_a()
    config["profiles"] = [
        {"id": "comfort", "name": "Comfort", "zoneTargets": {"living": 21}},
        {"id": "night", "name": "Night", "zoneTargets": {"living": 18}},
    ]
    config["schedules"] = [{"day": "monday", "events": [
        {"time": "17:00", "profileId": "comfort"}, {"time": "23:30", "profileId": "night"},
    ]}]
    now = [datetime.fromisoformat("2026-01-05T17:00:00+00:00")]
    handles = []

    class Handle:
        cancelled = False

        def __init__(self, delay, callback):
            self.delay = delay
            self.callback = callback

        def cancel(self):
            self.cancelled = True

    def schedule(delay, callback):
        handle = Handle(delay, callback)
        handles.append(handle)
        return handle

    manager, store = await setup_state(hass, config=config, clock=lambda: now[0], schedule=schedule)
    manager.config_manager.on_change = manager.refresh_config
    user = SimpleNamespace(id="admin", is_active=True, is_admin=True)
    try:
        with patch.object(type(hass.services), "async_call", side_effect=AssertionError("device command")):
            await manager.async_set_house_intent("heating", "manual", 0, USER)
            await manager.async_set_zone_intent("living", "follow_house", 22, 1, USER)
            auto = await manager.async_set_house_intent("heating", "auto", 2, USER)
            assert auto["preview"]["autoResolution"]["activeProfileId"] == "comfort"
            assert auto["preview"]["zones"][0]["derived"]["effectiveTarget"] == 21
            assert store.data["intent"]["zones"]["living"]["targetTemperature"] == 22
            assert len(handles) == 1 and handles[0].delay == 19800
            now[0] = datetime.fromisoformat("2026-01-05T22:30:00+00:00")
            handles[0].callback()
            assert manager.get_state()["preview"]["autoResolution"]["activeProfileId"] == "night"
            assert manager.get_state()["preview"]["zones"][0]["derived"]["effectiveTarget"] == 18
            changed = deepcopy(manager.config_manager.config)
            changed["profiles"][1]["zoneTargets"]["living"] = 20
            changed["profiles"][1]["name"] = "Sleep"
            await manager.config_manager.async_save_config(changed, 1, user)
            updated = manager.get_state()["preview"]
            assert updated["autoResolution"]["activeProfileName"] == "Sleep"
            assert updated["zones"][0]["derived"]["effectiveTarget"] == 20
            hass.states.async_set("sensor.living_temp", "21", {"device_class": "temperature"})
            await hass.async_block_till_done()
            assert manager.get_state()["preview"]["zones"][0]["derived"]["thermalStatus"] == "satisfied"
            await hass.config.async_set_time_zone("UTC")
            hass.bus.async_fire(EVENT_CORE_CONFIG_UPDATE, {"time_zone": "UTC"})
            await hass.async_block_till_done()
            assert manager.get_state()["preview"]["autoResolution"]["activeProfileId"] == "comfort"
            manual = await manager.async_set_house_intent("heating", "manual", 3, USER)
            assert manual["preview"]["zones"][0]["derived"]["effectiveTarget"] == 22
            assert manager._boundary.handle is None
    finally:
        await manager.async_shutdown()


async def test_temporary_override_write_replace_clear_conflict_restart_and_expiry_without_services(hass: HomeAssistant):
    now = [datetime.fromisoformat("2026-01-05T17:00:00+00:00")]
    handles = []

    class Handle:
        def __init__(self, delay, callback):
            self.delay = delay
            self.callback = callback
            self.cancelled = False

        def cancel(self):
            self.cancelled = True

    def schedule(delay, callback):
        handle = Handle(delay, callback)
        handles.append(handle)
        return handle

    manager, store = await setup_state(hass, clock=lambda: now[0], schedule=schedule)
    try:
        with patch.object(type(hass.services), "async_call", side_effect=AssertionError("device command")):
            with pytest.raises(OverrideUnavailable):
                await manager.async_set_zone_override("living", 22, "duration", 0, USER, duration_minutes=60)
            assert store.writes == 0
            await manager.async_set_house_intent("heating", "auto", 0, USER)
            first = await manager.async_set_zone_override("living", 22, "duration", 1, USER, duration_minutes=60)
            first_id = first["preview"]["zones"][0]["override"]["id"]
            assert first["preview"]["zones"][0]["derived"]["targetSource"] == "override"
            assert first["preview"]["zones"][0]["derived"]["effectiveTarget"] == 22
            assert store.data["intent"]["overrides"]["living"]["expiresAt"] == "2026-01-05T18:00:00+00:00"
            assert len([handle for handle in handles if not handle.cancelled]) == 1
            with pytest.raises(Conflict):
                await manager.async_clear_zone_override("living", 1, USER)
            with pytest.raises(InvalidConfig):
                await manager.async_set_zone_override("missing", 21, "duration", 2, USER, duration_minutes=60)
            with pytest.raises(InvalidConfig):
                await manager.async_set_zone_override("living", 50, "duration", 2, USER, duration_minutes=60)
            with pytest.raises(InvalidConfig):
                await manager.async_set_zone_override("living", 21, "duration", 2, USER, duration_minutes=0)
            assert store.writes == 2
            replaced = await manager.async_set_zone_override("living", 22, "duration", 2, USER, duration_minutes=60)
            assert replaced["revision"] == 3 and replaced["preview"]["zones"][0]["override"]["id"] != first_id
            restored = ClimateStateManager(hass, manager.config_manager, store=store, clock=lambda: now[0], schedule=schedule)
            await restored.async_setup()
            try:
                assert restored.get_state()["preview"]["zones"][0]["derived"]["targetSource"] == "override"
            finally:
                await restored.async_shutdown()
            cleared = await manager.async_clear_zone_override("living", 3, USER)
            assert cleared["revision"] == 4 and cleared["preview"]["zones"][0]["override"] is None
            assert (await manager.async_clear_zone_override("living", 4, USER))["revision"] == 4
            await manager.async_set_zone_override("living", 23, "duration", 4, USER, duration_minutes=60)
            manual = await manager.async_set_house_intent("heating", "manual", 5, USER)
            assert manual["preview"]["zones"][0]["override"] is None
            assert "overrides" not in store.data["intent"]
            await manager.async_set_house_intent("heating", "auto", 6, USER)
            await manager.async_set_zone_override("living", 24, "duration", 7, USER, duration_minutes=60)
            now[0] = datetime.fromisoformat("2026-01-05T18:00:00+00:00")
            expired = await manager.async_get_state()
            assert expired["preview"]["zones"][0]["derived"]["targetSource"] is None
            assert "overrides" not in store.data["intent"]
            assert expired["revision"] == 9
    finally:
        await manager.async_shutdown()


async def test_expired_override_is_cleaned_on_restart(hass: HomeAssistant):
    now = [datetime.fromisoformat("2026-01-05T17:00:00+00:00")]
    manager, store = await setup_state(hass, clock=lambda: now[0])
    try:
        await manager.async_set_house_intent("heating", "auto", 0, USER)
        await manager.async_set_zone_override("living", 22, "duration", 1, USER, duration_minutes=60)
    finally:
        await manager.async_shutdown()
    now[0] = datetime.fromisoformat("2026-01-05T19:00:00+00:00")
    restored = ClimateStateManager(hass, manager.config_manager, store=store, clock=lambda: now[0])
    await restored.async_setup()
    try:
        assert restored.get_state()["preview"]["zones"][0]["override"] is None
        assert "overrides" not in store.data["intent"]
        assert restored.revision == 3
    finally:
        await restored.async_shutdown()


async def test_orphan_override_is_cleaned_after_zone_config_removal(hass: HomeAssistant):
    now = datetime.fromisoformat("2026-01-05T17:00:00+00:00")
    manager, store = await setup_state(hass, clock=lambda: now)
    try:
        await manager.async_set_house_intent("heating", "auto", 0, USER)
        await manager.async_set_zone_override("living", 22, "duration", 1, USER, duration_minutes=60)
        manager.config_manager.config["zones"] = []
        manager.refresh_config()
        await hass.async_block_till_done()
        assert "overrides" not in store.data["intent"]
        assert manager.get_state()["preview"]["zones"] == []
    finally:
        await manager.async_shutdown()


async def test_orphan_zone_intent_is_removed_without_override(hass: HomeAssistant):
    manager, store = await setup_state(hass)
    try:
        await manager.async_set_zone_intent("living", "follow_house", 21, 0, USER)
        assert "living" in store.data["intent"]["zones"]
        manager.config_manager.on_change = manager.refresh_config
        admin = SimpleNamespace(id="admin", is_active=True, is_admin=True)
        await manager.config_manager.async_save_config(empty_config(), 1, admin)
        await hass.async_block_till_done()
        assert store.data["intent"]["zones"] == {}
        assert manager.revision == 2
        assert manager.config_manager.revision == 2
        assert manager.get_state()["preview"]["zones"] == []
    finally:
        await manager.async_shutdown()
