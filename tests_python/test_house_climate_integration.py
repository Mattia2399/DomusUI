"""HOUSE.4: canonical room identity is read-only context for Climate."""

from __future__ import annotations

from copy import deepcopy
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

import pytest
from homeassistant.auth.permissions.const import POLICY_READ
from homeassistant.core import HomeAssistant
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers import floor_registry as fr
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.domusos.climate.manager import ClimateManager
from custom_components.domusos.climate.models import AreaMissing, HouseContextUnavailable, storage_document
from custom_components.domusos.const import DOMAIN
from custom_components.domusos.house.manager import DATA_HOUSE_MANAGER, HouseManager


ADMIN = SimpleNamespace(id="admin", is_admin=True, is_active=True)


class MemoryStore:
    path = None

    def __init__(self, data=None):
        self.data = data
        self.writes = 0

    async def async_load(self):
        return deepcopy(self.data)

    async def async_save(self, value):
        self.data = deepcopy(value)
        self.writes += 1


def config(area_id):
    return {
        "version": 1, "zones": [{"id": "day", "name": "Zona Giorno", "areaId": area_id,
                                "reference": {"primaryEntityId": "sensor.control_temperature", "fallbacks": []},
                                "humidityReference": {"primaryEntityId": "sensor.control_humidity", "fallbacks": []},
                                "endpointIds": []}],
        "endpoints": [], "circuits": [], "generators": [], "profiles": [], "schedules": [], "strategy": None,
    }


async def setup(hass):
    floor = fr.async_get(hass).async_create("Piano terra", level=0)
    other_floor = fr.async_get(hass).async_create("Primo piano", level=1)
    area = ar.async_get(hass).async_create("Soggiorno", floor_id=floor.floor_id)
    ar.async_get(hass).async_create("Camera privata")
    entry = MockConfigEntry(domain="test")
    entry.add_to_hass(hass)
    device = dr.async_get(hass).async_get_or_create(
        config_entry_id=entry.entry_id, identifiers={("test", "room-monitor")}, name="Room monitor",
    )
    dr.async_get(hass).async_update_device(device.id, area_id=area.id)
    temperature = er.async_get(hass).async_get_or_create(
        "sensor", "test", "room-temperature", suggested_object_id="room_temperature",
        device_id=device.id, original_device_class="temperature", unit_of_measurement="°C",
    )
    humidity = er.async_get(hass).async_get_or_create(
        "sensor", "test", "room-humidity", suggested_object_id="room_humidity",
        device_id=device.id, original_device_class="humidity", unit_of_measurement="%",
    )
    hass.states.async_set(temperature.entity_id, "20", {"device_class": "temperature", "unit_of_measurement": "°C"})
    hass.states.async_set(humidity.entity_id, "45", {"device_class": "humidity", "unit_of_measurement": "%"})
    hass.states.async_set("sensor.control_temperature", "23", {"device_class": "temperature", "unit_of_measurement": "°C"})
    hass.states.async_set("sensor.control_humidity", "50", {"device_class": "humidity", "unit_of_measurement": "%"})
    house = HouseManager(hass)
    await house.async_setup()
    hass.data.setdefault(DOMAIN, {})[DATA_HOUSE_MANAGER] = house
    store = MemoryStore()
    climate = ClimateManager(hass, store=store, runtime=lambda: None)
    await climate.async_setup()
    return floor, other_floor, area, temperature, humidity, house, climate, store


async def test_linked_room_rename_floor_move_and_environment_are_passive(hass: HomeAssistant):
    floor, other_floor, area, temperature, humidity, house, climate, store = await setup(hass)
    candidate = config(area.id)
    with patch.object(type(hass.services), "async_call", side_effect=AssertionError("physical call")) as calls:
        saved = await climate.async_save_config(candidate, 0, ADMIN)
        assert saved["config"] == candidate
        first = await climate.async_get_config_for_user(ADMIN)
        context = first["houseContext"]["zones"]["day"]
        assert context["status"] == "linked"
        assert context["room"] == {"id": area.id, "name": "Soggiorno", "floorId": floor.floor_id,
                                   "floorName": "Piano terra", "available": True}
        assert context["environment"]["temperature"]["value"] == 20
        assert context["environment"]["humidity"]["value"] == 45
        assert context["environment"]["temperature"]["sourceEntityId"] == temperature.entity_id
        assert context["environment"]["humidity"]["sourceEntityId"] == humidity.entity_id
        assert first["config"]["zones"][0]["reference"]["primaryEntityId"] == "sensor.control_temperature"
        assert first["config"]["zones"][0]["humidityReference"]["primaryEntityId"] == "sensor.control_humidity"
        assert len(first["houseContext"]["zones"]) == 1
        assert "Camera privata" not in str(first["houseContext"])
        revision = first["revision"]
        ar.async_get(hass).async_update(area.id, name="Salotto", floor_id=other_floor.floor_id)
        await hass.async_block_till_done()
        hass.states.async_set(temperature.entity_id, "21", {"device_class": "temperature", "unit_of_measurement": "°C"})
        await hass.async_block_till_done()
        updated = await climate.async_get_config_for_user(ADMIN)
        assert updated["houseContext"]["zones"]["day"]["room"]["name"] == "Salotto"
        assert updated["houseContext"]["zones"]["day"]["room"]["floorName"] == "Primo piano"
        assert updated["houseContext"]["zones"]["day"]["environment"]["temperature"]["value"] == 21
        assert updated["revision"] == revision == 1 and store.writes == 1
        calls.assert_not_called()
    await house.async_shutdown()


async def test_missing_deleted_recreated_and_null_room_links(hass: HomeAssistant):
    _, _, area, _, _, house, climate, store = await setup(hass)
    candidate = config(area.id)
    await climate.async_save_config(candidate, 0, ADMIN)
    unknown = deepcopy(candidate)
    unknown["zones"][0]["areaId"] = "unknown_room"
    with pytest.raises(AreaMissing):
        await climate.async_save_config(unknown, 1, ADMIN)
    assert climate.revision == 1 and store.writes == 1
    ar.async_get(hass).async_delete(area.id)
    await hass.async_block_till_done()
    orphan = await climate.async_get_config_for_user(ADMIN)
    assert orphan["houseContext"]["zones"]["day"] == {
        "status": "room_orphaned", "issues": ["orphaned_house_room_reference"],
    }
    assert orphan["config"]["zones"][0]["areaId"] == area.id
    replacement = ar.async_get(hass).async_create("Soggiorno nuovo")
    ar.async_get(hass).async_update(replacement.id, name="Soggiorno")
    await hass.async_block_till_done()
    assert replacement.id != area.id
    assert (await climate.async_get_house_context(ADMIN))["zones"]["day"]["status"] == "room_orphaned"
    unchanged_orphan = deepcopy(candidate)
    unchanged_orphan["zones"][0]["name"] = "Zona Giorno aggiornata"
    await climate.async_save_config(unchanged_orphan, 1, ADMIN)
    cleared = deepcopy(unchanged_orphan)
    cleared["zones"][0]["areaId"] = None
    await climate.async_save_config(cleared, 2, ADMIN)
    assert (await climate.async_get_house_context(ADMIN))["zones"]["day"]["status"] == "unlinked"
    await house.async_shutdown()


async def test_house_unavailable_and_permissions_do_not_bridge_privileges(hass: HomeAssistant):
    _, _, area, temperature, _, house, climate, store = await setup(hass)
    await climate.async_save_config(config(area.id), 0, ADMIN)
    denied = SimpleNamespace(is_admin=False, permissions=SimpleNamespace(
        check_entity=Mock(return_value=False),
    ))
    scoped = await climate.async_get_config_for_user(denied)
    context = scoped["houseContext"]["zones"]["day"]
    assert context["room"]["name"] == "Soggiorno"
    assert context["environment"]["temperature"]["available"] is False
    assert context["environment"]["temperature"]["sourceEntityId"] is None
    assert "Camera privata" not in str(scoped["houseContext"])
    denied.permissions.check_entity.assert_any_call(temperature.entity_id, POLICY_READ)
    await house.async_shutdown()
    unavailable = await climate.async_get_config_for_user(ADMIN)
    assert unavailable["houseContext"]["zones"]["day"]["status"] == "house_unavailable"
    assert unavailable["revision"] == 1 and store.writes == 1
    candidate = deepcopy(config(area.id))
    candidate["zones"][0]["areaId"] = "another_room"
    with pytest.raises(HouseContextUnavailable):
        await climate.async_save_config(candidate, 1, ADMIN)
    assert climate.revision == 1 and store.writes == 1


async def test_partial_area_registry_is_not_reported_as_an_orphan(hass: HomeAssistant):
    _, _, area, _, _, house, climate, store = await setup(hass)
    await climate.async_save_config(config(area.id), 0, ADMIN)
    house._dirty = True
    with patch("custom_components.domusos.house.manager.ar.async_get", side_effect=RuntimeError("unavailable")):
        context = await climate.async_get_house_context(ADMIN)
        assert context["zones"]["day"]["status"] == "house_unavailable"
        assert (await climate.async_get_room_choices())["status"] == "house_unavailable"
    assert climate.revision == 1 and store.writes == 1
    await house.async_shutdown()


async def test_room_without_environment_sensors_keeps_climate_control_reference(hass: HomeAssistant):
    _, _, _, _, _, house, climate, _ = await setup(hass)
    empty_room = ar.async_get(hass).async_create("Studio")
    candidate = config(empty_room.id)
    await climate.async_save_config(candidate, 0, ADMIN)
    context = (await climate.async_get_house_context(ADMIN))["zones"]["day"]
    assert context["status"] == "linked"
    assert context["environment"]["temperature"]["available"] is False
    assert context["environment"]["humidity"]["available"] is False
    assert climate.config["zones"][0]["reference"] == candidate["zones"][0]["reference"]
    assert climate.config["zones"][0]["humidityReference"] == candidate["zones"][0]["humidityReference"]
    await house.async_shutdown()


async def test_legacy_orphan_loads_without_house(hass: HomeAssistant):
    candidate = config("deleted_room")
    store = MemoryStore(storage_document(7, candidate))
    climate = ClimateManager(hass, store=store, runtime=lambda: None)
    await climate.async_setup()
    response = await climate.async_get_config_for_user(ADMIN)
    assert response["revision"] == 7
    assert response["config"] == candidate
    assert response["houseContext"]["zones"]["day"]["status"] == "house_unavailable"


def test_dependency_and_physical_service_boundary():
    root = Path(__file__).resolve().parents[1] / "custom_components" / "domusos"
    house_sources = "\n".join(path.read_text(encoding="utf-8") for path in (root / "house").glob("*.py"))
    assert "from ..climate" not in house_sources
    assert "from custom_components.domusos.climate" not in house_sources
    climate_calls = [path.name for path in (root / "climate").glob("*.py")
                     if "services.async_call(" in path.read_text(encoding="utf-8")]
    assert climate_calls == ["supervisory_adapter.py"]
