"""CLM.2 HOUSE store lifecycle and optimistic writes in Home Assistant."""

from __future__ import annotations

from copy import deepcopy
from types import SimpleNamespace

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.helpers import area_registry as ar

from custom_components.domusos.climate.manager import ClimateManager
from custom_components.domusos.climate.models import (
    Conflict,
    StoreUnavailable,
    storage_document,
)


class MemoryStore:
    def __init__(self, data=None, *, fail_save=False):
        self.data = data
        self.fail_save = fail_save
        self.writes = 0
        self.path = None

    async def async_load(self):
        return deepcopy(self.data)

    async def async_save(self, value):
        if self.fail_save:
            raise OSError("store unavailable")
        self.data = deepcopy(value)
        self.writes += 1


ADMIN = SimpleNamespace(id="admin-1", is_admin=True, is_active=True)
MEMBER = SimpleNamespace(id="member-1", is_admin=False, is_active=True)


def zone_config(area_id):
    return {
        "version": 1,
        "zones": [{"id": "zone_living", "name": "Living", "areaId": area_id, "reference": {"primaryEntityId": "sensor.living_temp", "fallbacks": []}, "endpointIds": []}],
        "endpoints": [], "circuits": [], "generators": [], "profiles": [], "schedules": [], "strategy": None,
    }


def prepare(hass):
    area = ar.async_get(hass).async_create("Living")
    hass.states.async_set("sensor.living_temp", "21", {"device_class": "temperature", "unit_of_measurement": "°C"})
    return zone_config(area.id)


async def test_absent_store_save_reload_idempotence_and_conflict(hass: HomeAssistant):
    candidate = prepare(hass)
    store = MemoryStore()
    manager = ClimateManager(hass, store=store, runtime=lambda: None)
    await manager.async_setup()
    assert manager.get_config() == {"state": "absent", "revision": 0, "config": None}
    first = await manager.async_save_config(candidate, 0, ADMIN)
    assert first["state"] == "ready" and first["revision"] == 1
    assert store.writes == 1
    await manager.async_save_config(candidate, 1, ADMIN)
    assert store.writes == 1
    with pytest.raises(Conflict):
        await manager.async_save_config(candidate, 0, ADMIN)
    loaded = ClimateManager(hass, store=store, runtime=lambda: None)
    await loaded.async_setup()
    assert loaded.get_config() == first


async def test_corrupt_and_future_store_are_never_overwritten(hass: HomeAssistant):
    candidate = prepare(hass)
    for raw, state in (({"bad": True}, "corrupt"), (storage_document(1, candidate) | {"version": 9}, "unsupported"), (storage_document(1, candidate) | {"version": 0}, "migration_failed")):
        store = MemoryStore(raw)
        manager = ClimateManager(hass, store=store, runtime=lambda: None)
        await manager.async_setup()
        assert manager.get_config()["state"] == state
        with pytest.raises(StoreUnavailable):
            await manager.async_save_config(candidate, 0, ADMIN)
        assert store.writes == 0 and store.data == raw


async def test_failed_save_keeps_previous_revision(hass: HomeAssistant):
    candidate = prepare(hass)
    store = MemoryStore(fail_save=True)
    manager = ClimateManager(hass, store=store, runtime=lambda: None)
    await manager.async_setup()
    with pytest.raises(StoreUnavailable):
        await manager.async_save_config(candidate, 0, ADMIN)
    assert manager.get_config() == {"state": "absent", "revision": 0, "config": None}


async def test_non_admin_cannot_write_even_without_websocket_wrapper(hass: HomeAssistant):
    candidate = prepare(hass)
    store = MemoryStore()
    manager = ClimateManager(hass, store=store, runtime=lambda: None)
    await manager.async_setup()
    from custom_components.domusos.climate.models import ClimatePermissionError

    with pytest.raises(ClimatePermissionError):
        await manager.async_save_config(candidate, 0, MEMBER)
    assert store.writes == 0


async def test_extended_radiant_configuration_round_trip_and_idempotence(hass: HomeAssistant):
    from test_climate_architecture import catalog, scenario_c

    candidate = scenario_c()
    for entity_id, state in catalog(candidate).items():
        hass.states.async_set(entity_id, state.state, state.attributes)
    store = MemoryStore()
    manager = ClimateManager(hass, store=store, runtime=lambda: None)
    await manager.async_setup()
    saved = await manager.async_save_config(candidate, 0, ADMIN)
    assert saved["config"] == candidate and saved["revision"] == 1
    assert store.writes == 1
    assert (await manager.async_save_config(candidate, 1, ADMIN))["revision"] == 1
    assert store.writes == 1
    loaded = ClimateManager(hass, store=store, runtime=lambda: None)
    await loaded.async_setup()
    assert loaded.get_config() == saved


async def test_profiles_and_schedule_round_trip_revision_and_no_service_calls(hass: HomeAssistant):
    candidate = prepare(hass)
    candidate["profiles"] = [
        {"id": "comfort", "name": "Comfort", "zoneTargets": {"zone_living": 21}},
        {"id": "eco", "name": "Eco", "zoneTargets": {}},
    ]
    candidate["schedules"] = [{"day": "monday", "events": [
        {"time": "08:30", "profileId": "eco"},
        {"time": "06:30", "profileId": "comfort"},
    ]}]
    store = MemoryStore()
    manager = ClimateManager(hass, store=store, runtime=lambda: None)
    await manager.async_setup()
    with pytest.MonkeyPatch.context() as patcher:
        calls = []
        patcher.setattr(hass.services, "async_call", lambda *args, **kwargs: calls.append((args, kwargs)))
        saved = await manager.async_save_config(candidate, 0, ADMIN)
        assert saved["revision"] == 1 and store.writes == 1
        expected = deepcopy(candidate)
        expected["schedules"][0]["events"].reverse()
        expected["profiles"][0]["zoneTargets"]["zone_living"] = 21.0
        assert saved["config"] == expected
        assert await manager.async_save_config(candidate, 1, ADMIN) == saved
        assert store.writes == 1
        with pytest.raises(Conflict):
            await manager.async_save_config(candidate, 0, ADMIN)
        loaded = ClimateManager(hass, store=store, runtime=lambda: None)
        await loaded.async_setup()
        assert loaded.get_config() == saved
        assert calls == []
