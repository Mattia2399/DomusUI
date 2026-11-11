"""Real HA registry, event, permission and WebSocket contract on both CI versions."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers import floor_registry as fr
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.domusos import _async_setup_house, _async_teardown_house
from custom_components.domusos.access import DATA_ACCESS_MANAGER, AccessPolicyManager
from custom_components.domusos.const import DOMAIN
from custom_components.domusos.house.api import async_register_house_api
from custom_components.domusos.house.manager import (
    DATA_HOUSE_MANAGER,
    HouseManager,
    HouseUnavailableError,
)


def fixture_house(hass: HomeAssistant):
    floor = fr.async_get(hass).async_create("Ground", level=0)
    area = ar.async_get(hass).async_create("Living", floor_id=floor.floor_id)
    entry = MockConfigEntry(domain="test")
    entry.add_to_hass(hass)
    device = dr.async_get(hass).async_get_or_create(
        config_entry_id=entry.entry_id, identifiers={("test", "house-device")}, name="House device"
    )
    dr.async_get(hass).async_update_device(device.id, area_id=area.id)
    entity = er.async_get(hass).async_get_or_create(
        "sensor", "test", "house-temp", suggested_object_id="house_temp",
        device_id=device.id, original_device_class="temperature", unit_of_measurement="°C",
    )
    hass.states.async_set(entity.entity_id, "21.5", {"unit_of_measurement": "°C", "device_class": "temperature", "secret": "never-return"})
    return floor, area, device, entity


async def test_registry_contract_and_stable_entity_id_exist_on_both_versions(hass: HomeAssistant):
    floor, area, device, entity = fixture_house(hass)
    assert fr.async_get(hass).async_list_floors()
    assert ar.async_get(hass).async_list_areas()
    assert dr.async_get(hass).devices[device.id].id == device.id
    assert er.async_get(hass).entities[entity.entity_id].id == entity.id
    assert entity.id and entity.id != entity.entity_id
    assert all((fr.EVENT_FLOOR_REGISTRY_UPDATED, ar.EVENT_AREA_REGISTRY_UPDATED,
                dr.EVENT_DEVICE_REGISTRY_UPDATED, er.EVENT_ENTITY_REGISTRY_UPDATED))
    manager = HouseManager(hass)
    await manager.async_setup()
    topology = await manager.async_get_topology(SimpleNamespace(is_admin=True))
    assert topology["schemaVersion"] == "domusos.house.v1"
    assert topology["floors"][0]["id"] == floor.floor_id
    assert topology["rooms"][0]["id"] == area.id
    assert topology["entities"][0]["registryId"] == entity.id
    assert topology["entities"][0]["effectiveAreaId"] == area.id
    assert topology["rooms"][0]["temperatureEntityId"] is None  # HA 2025 omits it; 2026 defaults to null.
    await manager.async_shutdown()


async def test_native_area_environment_ref_matches_when_ha_exposes_it(hass: HomeAssistant):
    _, area, _, entity = fixture_house(hass)
    if not hasattr(area, "temperature_entity_id"):
        pytest.skip("HA 2025.1 Area has no environmental reference fields")
    ar.async_get(hass).async_update(area.id, temperature_entity_id=entity.entity_id)
    manager = HouseManager(hass)
    await manager.async_setup()
    report = await manager.async_get_environment_shadow(SimpleNamespace(is_admin=True))
    temperature = next(item for item in report["rows"] if item["metric"] == "temperature")
    assert temperature["category"] == "MATCH"
    assert temperature["legacy"]["entityId"] == temperature["house"]["entityId"] == entity.entity_id
    assert report["readiness"] == "READY"
    await manager.async_shutdown()


async def test_2025_safe_device_pair_and_2026_primary_precedence(hass: HomeAssistant):
    _, area, device, temperature = fixture_house(hass)
    humidity = er.async_get(hass).async_get_or_create(
        "sensor", "test", "house-humidity", suggested_object_id="house_humidity",
        device_id=device.id, original_device_class="humidity", unit_of_measurement="%",
    )
    hass.states.async_set(humidity.entity_id, "47", {"unit_of_measurement": "%", "device_class": "humidity"})
    manager = HouseManager(hass)
    await manager.async_setup()
    admin = SimpleNamespace(is_admin=True)
    fallback = (await manager.async_get_snapshot(admin))["rooms"][0]
    assert fallback["temperature"]["selectedEntityId"] == temperature.entity_id
    assert fallback["temperature"]["selectionSource"] == "SAFE_ROOM_FALLBACK"
    assert fallback["humidity"]["value"] == 47
    if hasattr(area, "temperature_entity_id"):
        ar.async_get(hass).async_update(area.id, temperature_entity_id=temperature.entity_id)
        await hass.async_block_till_done()
        primary = (await manager.async_get_snapshot(admin))["rooms"][0]["temperature"]
        assert primary["selectionSource"] == "HA_AREA_PRIMARY"
        assert primary["configuredPrimaryEntityId"] == temperature.entity_id
    await manager.async_shutdown()


async def test_candidate_index_respects_permissions_and_registry_metadata(hass: HomeAssistant):
    _, area, device, temperature = fixture_house(hass)
    humidity = er.async_get(hass).async_get_or_create(
        "sensor", "test", "house-humidity", suggested_object_id="house_humidity",
        device_id=device.id, original_device_class="humidity", unit_of_measurement="%",
    )
    manager = HouseManager(hass)
    await manager.async_setup()
    allowed = SimpleNamespace(is_admin=False, permissions=SimpleNamespace(
        check_entity=Mock(side_effect=lambda entity_id, _policy: entity_id == humidity.entity_id),
    ))
    denied_temperature = (await manager.async_get_snapshot(allowed))["rooms"][0]["temperature"]
    assert denied_temperature["selectedEntityId"] is None
    admin = SimpleNamespace(is_admin=True)
    before = (await manager.async_get_snapshot(admin))["rooms"][0]["temperature"]
    assert before["selectedEntityId"] == temperature.entity_id
    first_revision = (await manager.async_get_topology(admin))["topologyRevision"]
    er.async_get(hass).async_update_entity(temperature.entity_id, disabled_by=er.RegistryEntryDisabler.USER)
    await hass.async_block_till_done()
    after = (await manager.async_get_snapshot(admin))["rooms"][0]["temperature"]
    assert after["selectedEntityId"] is None
    assert (await manager.async_get_topology(admin))["topologyRevision"] > first_revision
    await manager.async_shutdown()


async def test_all_four_registry_events_invalidate_but_state_change_only_updates_snapshot(hass: HomeAssistant):
    floor, area, device, entity = fixture_house(hass)
    await hass.async_block_till_done()
    manager = HouseManager(hass)
    await manager.async_setup()
    admin = SimpleNamespace(is_admin=True)
    first = await manager.async_get_topology(admin)
    assert manager.rebuild_count == 1
    hass.states.async_set(entity.entity_id, "22", {"unit_of_measurement": "°C"})
    await hass.async_block_till_done()
    await manager.async_get_snapshot(admin)
    assert manager.rebuild_count == 1

    ar.async_get(hass).async_update(area.id, name="Lounge")
    await hass.async_block_till_done()
    assert (await manager.async_get_topology(admin))["topologyFingerprint"] != first["topologyFingerprint"]
    count = manager.rebuild_count
    fr.async_get(hass).async_update(floor.floor_id, name="Downstairs")
    await hass.async_block_till_done()
    assert (await manager.async_get_topology(admin))["floors"][0]["name"] == "Downstairs"
    assert manager.rebuild_count == count + 1
    dr.async_get(hass).async_update_device(device.id, area_id=None)
    await hass.async_block_till_done()
    assert (await manager.async_get_topology(admin))["entities"][0]["effectiveAreaId"] is None
    er.async_get(hass).async_update_entity(entity.entity_id, area_id=area.id)
    await hass.async_block_till_done()
    assert (await manager.async_get_topology(admin))["entities"][0]["effectiveAreaId"] == area.id
    await manager.async_shutdown()


async def test_entity_rename_preserves_registry_identity(hass: HomeAssistant):
    _, _, _, entity = fixture_house(hass)
    registry = er.async_get(hass)
    renamed = registry.async_update_entity(entity.entity_id, new_entity_id="sensor.renamed_house_temp")
    assert renamed.id == entity.id and renamed.entity_id != entity.entity_id


async def test_projection_filters_ha_unreadable_and_sensitive_entities(hass: HomeAssistant):
    _, _, device, entity = fixture_house(hass)
    camera = er.async_get(hass).async_get_or_create("camera", "test", "private-camera", device_id=device.id)
    person = er.async_get(hass).async_get_or_create("person", "test", "private-person", device_id=device.id)
    manager = HouseManager(hass)
    await manager.async_setup()
    deny = SimpleNamespace(is_admin=False, permissions=SimpleNamespace(check_entity=Mock(return_value=False)))
    denied = await manager.async_get_topology(deny)
    assert denied["entities"] == [] and denied["devices"] == []
    assert deny.permissions.check_entity.called
    allow = SimpleNamespace(is_admin=False, permissions=SimpleNamespace(check_entity=Mock(return_value=True)))
    visible = await manager.async_get_topology(allow)
    assert {item["entityId"] for item in visible["entities"]} == {entity.entity_id, camera.entity_id}
    assert person.entity_id not in str(visible)
    assert all("attributes" not in item for item in visible["entities"])
    admin = await manager.async_get_topology(SimpleNamespace(is_admin=True))
    assert person.entity_id not in str(admin)
    assert "secret" not in str(admin)
    assert visible["topologyFingerprint"] != denied["topologyFingerprint"]
    await manager.async_shutdown()


async def test_lifecycle_unload_and_reload_remove_all_listeners(hass: HomeAssistant):
    entry = SimpleNamespace(house_manager=None)
    await _async_setup_house(hass, entry)
    first = entry.house_manager
    assert first is hass.data[DOMAIN][DATA_HOUSE_MANAGER]
    await first.async_get_topology(SimpleNamespace(is_admin=True))
    assert len(first._unsubscribers) == 4
    await _async_teardown_house(hass, entry)
    assert DATA_HOUSE_MANAGER not in hass.data[DOMAIN]
    assert first._unsubscribers == [] and first._cache is None
    with pytest.raises(HouseUnavailableError):
        await first.async_get_topology(SimpleNamespace(is_admin=True))
    await _async_setup_house(hass, entry)
    assert entry.house_manager is not first
    await _async_teardown_house(hass, entry)


async def test_websocket_requires_rooms_access_and_never_accepts_spoofed_fields(hass: HomeAssistant, hass_ws_client):
    fixture_house(hass)
    access = AccessPolicyManager(hass, runtime=lambda: None)
    await access.async_setup()
    house = HouseManager(hass)
    await house.async_setup()
    hass.data.setdefault(DOMAIN, {})[DATA_ACCESS_MANAGER] = access
    hass.data[DOMAIN][DATA_HOUSE_MANAGER] = house
    await async_register_house_api(hass)
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "domusos/house/get_topology"})
    topology = await client.receive_json()
    assert topology["success"] and topology["result"]["rooms"]
    await client.send_json_auto_id({"type": "domusos/house/get_snapshot"})
    assert (await client.receive_json())["success"]
    await client.send_json_auto_id({"type": "domusos/house/get_environment_shadow"})
    diagnostic = await client.receive_json()
    assert diagnostic["success"]
    assert diagnostic["result"]["rows"][0]["category"] == "LEGACY_UNSAFE_FALLBACK_REJECTED"
    assert diagnostic["result"]["readiness"] == "READY"
    assert "secret" not in str(diagnostic)

    member = await hass.auth.async_create_user("House member", group_ids=["system-users"])
    refresh = await hass.auth.async_create_refresh_token(member, "https://example.com/domus-house")
    member_client = await hass_ws_client(hass, hass.auth.async_create_access_token(refresh))
    for command in ("get_topology", "get_snapshot"):
        await member_client.send_json_auto_id({"type": f"domusos/house/{command}"})
        assert (await member_client.receive_json())["success"]
    await member_client.send_json_auto_id({"type": "domusos/house/get_environment_shadow"})
    assert not (await member_client.receive_json())["success"]
    await member_client.send_json_auto_id({"type": "domusos/house/get_topology", "is_admin": True})
    assert not (await member_client.receive_json())["success"]

    await client.send_json_auto_id({"type": "domusos/house/get_topology", "is_admin": True})
    assert not (await client.receive_json())["success"]
    await client.send_json_auto_id({"type": "domusos/house/get_environment_shadow", "is_admin": True})
    assert not (await client.receive_json())["success"]
    hass.data[DOMAIN].pop(DATA_ACCESS_MANAGER)
    for denied_client in (client, member_client):
        await denied_client.send_json_auto_id({"type": "domusos/house/get_topology"})
        assert (await denied_client.receive_json())["error"]["code"] == "access_denied"
    await client.send_json_auto_id({"type": "domusos/house/get_environment_shadow"})
    assert (await client.receive_json())["error"]["code"] == "access_denied"
    hass.data[DOMAIN][DATA_ACCESS_MANAGER] = access
    await house.async_shutdown()
    await client.send_json_auto_id({"type": "domusos/house/get_topology"})
    assert (await client.receive_json())["error"]["code"] == "house_unavailable"
