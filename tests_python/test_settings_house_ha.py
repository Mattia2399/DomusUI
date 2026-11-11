"""Settings reads House membership without narrowing the HA admin inventory."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import EntityCategory
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.domusos.access import DATA_ACCESS_MANAGER, AccessPolicyManager
from custom_components.domusos.access import instrumentation
from custom_components.domusos.access.authorization import AuthorizationDecision, DecisionReason
from custom_components.domusos.const import DOMAIN
from custom_components.domusos.house.api import async_register_house_api
from custom_components.domusos.house.manager import DATA_HOUSE_MANAGER, HouseManager, HouseUnavailableError
from custom_components.domusos.system.api import async_register_system_api


def fixtures(hass: HomeAssistant):
    first = ar.async_get(hass).async_create("Camera")
    second = ar.async_get(hass).async_create("Studio")
    entry = MockConfigEntry(domain="test")
    entry.add_to_hass(hass)
    registry = dr.async_get(hass)
    device = registry.async_get_or_create(config_entry_id=entry.entry_id, identifiers={("test", "lamp")})
    registry.async_update_device(device.id, area_id=first.id)
    empty = registry.async_get_or_create(config_entry_id=entry.entry_id, identifiers={("test", "empty")})
    entities = er.async_get(hass)
    light = entities.async_get_or_create("light", "test", "lamp", suggested_object_id="lamp", device_id=device.id)
    disabled = entities.async_get_or_create("sensor", "test", "disabled", suggested_object_id="disabled", device_id=device.id)
    entities.async_update_entity(disabled.entity_id, disabled_by=er.RegistryEntryDisabler.USER)
    hidden = entities.async_get_or_create("sensor", "test", "hidden", suggested_object_id="hidden", device_id=device.id)
    entities.async_update_entity(hidden.entity_id, hidden_by=er.RegistryEntryHider.USER)
    diagnostic = entities.async_get_or_create("sensor", "test", "diagnostic", suggested_object_id="diagnostic", device_id=device.id)
    entities.async_update_entity(diagnostic.entity_id, entity_category=EntityCategory.DIAGNOSTIC)
    camera = entities.async_get_or_create("camera", "test", "camera", suggested_object_id="camera", device_id=device.id)
    return first, second, device, empty, light, disabled, hidden, diagnostic, camera


async def test_unfiltered_minimal_context_tracks_canonical_membership(hass: HomeAssistant):
    first, second, device, empty, light, disabled, hidden, diagnostic, camera = fixtures(hass)
    manager = HouseManager(hass)
    await manager.async_setup()
    initial = await manager.async_get_settings_room_context()
    assert set(initial) == {"schemaVersion", "topologyRevision", "rooms", "devices", "entities"}
    assert initial["schemaVersion"] == "domusos.system.house.v1"
    assert {item["entityId"] for item in initial["entities"]} == {
        light.entity_id, disabled.entity_id, hidden.entity_id, diagnostic.entity_id, camera.entity_id,
    }
    assert {item["id"] for item in initial["devices"]} == {device.id, empty.id}
    assert all(set(item) == {"registryId", "entityId", "effectiveRoomId"} for item in initial["entities"])
    assert {item["roomId"] for item in initial["devices"] if item["id"] == empty.id} == {None}
    by_id = {item["registryId"]: item for item in initial["entities"]}
    assert by_id[light.id]["effectiveRoomId"] == first.id

    er.async_get(hass).async_update_entity(light.entity_id, area_id=second.id)
    await hass.async_block_till_done()
    assert next(item for item in (await manager.async_get_settings_room_context())["entities"]
                if item["registryId"] == light.id)["effectiveRoomId"] == second.id
    er.async_get(hass).async_update_entity(light.entity_id, area_id=None)
    dr.async_get(hass).async_update_device(device.id, area_id=second.id)
    await hass.async_block_till_done()
    moved = await manager.async_get_settings_room_context()
    assert next(item for item in moved["entities"] if item["registryId"] == light.id)["effectiveRoomId"] == second.id
    assert next(item for item in moved["devices"] if item["id"] == device.id)["roomId"] == second.id
    ar.async_get(hass).async_update(second.id, name="Nuova camera")
    await hass.async_block_till_done()
    assert next(room for room in (await manager.async_get_settings_room_context())["rooms"]
                if room["id"] == second.id)["name"] == "Nuova camera"
    ar.async_get(hass).async_delete(second.id)
    await hass.async_block_till_done()
    deleted = await manager.async_get_settings_room_context()
    assert next(item for item in deleted["devices"] if item["id"] == device.id)["roomId"] is None
    assert next(item for item in deleted["entities"] if item["registryId"] == light.id)["effectiveRoomId"] is None
    await manager.async_shutdown()


async def test_unavailable_registry_fails_closed(hass: HomeAssistant):
    manager = HouseManager(hass)
    await manager.async_setup()
    with patch.object(manager, "_read_registries", return_value=([], [], [], [], ["entity"], {})):
        with pytest.raises(HouseUnavailableError):
            await manager.async_get_settings_room_context()
    await manager.async_shutdown()


async def test_settings_permission_is_independent_of_dashboard_and_rooms(hass: HomeAssistant, hass_ws_client):
    fixtures(hass)
    access = AccessPolicyManager(hass, runtime=lambda: None)
    await access.async_setup()
    manager = HouseManager(hass)
    await manager.async_setup()
    hass.data.setdefault(DOMAIN, {})[DATA_ACCESS_MANAGER] = access
    hass.data[DOMAIN][DATA_HOUSE_MANAGER] = manager
    await async_register_system_api(hass)
    await async_register_house_api(hass)
    admin = await hass_ws_client(hass)
    member_user = await hass.auth.async_create_user("Member", group_ids=["system-users"])
    refresh = await hass.auth.async_create_refresh_token(member_user, "https://example.com/settings")
    member = await hass_ws_client(hass, hass.auth.async_create_access_token(refresh))

    def authorization(_manager, _user, action):
        allowed = action == "domusos/system/get_house_context"
        return AuthorizationDecision(allowed, DecisionReason.ALLOWED if allowed else DecisionReason.MISSING_CAPABILITY,
                                     "system.manage" if allowed else "rooms.view", action=action)

    with patch.object(instrumentation, "authorize_user_action", side_effect=authorization):
        await admin.send_json_auto_id({"type": "domusos/system/get_house_context"})
        result = await admin.receive_json()
        assert result["success"] and result["result"]["schemaVersion"] == "domusos.system.house.v1"
        await admin.send_json_auto_id({"type": "domusos/house/get_topology"})
        assert (await admin.receive_json())["error"]["code"] == "access_denied"
        await member.send_json_auto_id({"type": "domusos/system/get_house_context"})
        assert not (await member.receive_json())["success"]
        await admin.send_json_auto_id({"type": "domusos/system/get_house_context", "unexpected": True})
        assert (await admin.receive_json())["error"]["code"] == "invalid_format"
    with patch.object(instrumentation, "authorize_user_action", return_value=AuthorizationDecision(
        False, DecisionReason.MISSING_CAPABILITY, "system.manage", action="domusos/system/get_house_context"
    )):
        await admin.send_json_auto_id({"type": "domusos/system/get_house_context"})
        assert (await admin.receive_json())["error"]["code"] == "access_denied"
    await manager.async_shutdown()
