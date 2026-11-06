"""CLM.3A state store and live HA event integration; runs in the Linux HA harness."""

from __future__ import annotations

from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from homeassistant.core import HomeAssistant
from test_climate_architecture import catalog, scenario_a

from custom_components.domusos.climate.intent import STATE_SCHEMA, state_document
from custom_components.domusos.climate.manager import ClimateManager
from custom_components.domusos.climate.models import (
    Conflict,
    StoreUnavailable,
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


async def setup_state(hass, state_data=None):
    config = scenario_a()
    for entity_id, state in catalog(config).items():
        hass.states.async_set(entity_id, state.state, state.attributes)
    hass.states.async_set("sensor.living_temp", "19.2", {"device_class": "temperature"})
    config_manager = ClimateManager(hass, store=MemoryStore(storage_document(1, config)), runtime=lambda: None)
    await config_manager.async_setup()
    store = MemoryStore(state_data)
    manager = ClimateStateManager(hass, config_manager, store=store)
    await manager.async_setup()
    return manager, store


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
    for data, expected in (({"bad": True}, "corrupt"), (state_document(1, {"house": {"operatingMode": "off", "controlMode": "manual"}, "zones": {}}) | {"version": 9}, "unsupported")):
        manager, store = await setup_state(hass, data)
        try:
            assert manager.get_state()["state"] == expected
            with pytest.raises(StoreUnavailable):
                await manager.async_set_house_intent("heating", "manual", 0, USER)
            assert store.writes == 0 and store.data == data
        finally:
            await manager.async_shutdown()


async def test_state_store_document_has_separate_schema(hass: HomeAssistant):
    manager, store = await setup_state(hass)
    try:
        await manager.async_set_house_intent("heating", "auto", 0, USER)
        assert store.data["schema"] == STATE_SCHEMA
        assert store.data["intent"]["house"] == {"operatingMode": "heating", "controlMode": "auto"}
        assert "observed" not in store.data and "derived" not in store.data
    finally:
        await manager.async_shutdown()
