"""Dashboard's narrow House projection on the real HA registries."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

from homeassistant.core import HomeAssistant
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.domusos.access import DATA_ACCESS_MANAGER, AccessPolicyManager
from custom_components.domusos.access import instrumentation
from custom_components.domusos.access.authorization import AuthorizationDecision, DecisionReason
from custom_components.domusos.const import DOMAIN
from custom_components.domusos.dashboard.api import async_register_dashboard_api
from custom_components.domusos.dashboard.house_context import dashboard_house_context
from custom_components.domusos.house.api import async_register_house_api
from custom_components.domusos.house.manager import DATA_HOUSE_MANAGER, HouseManager


def fixtures(hass: HomeAssistant):
    areas = ar.async_get(hass)
    first = areas.async_create("Sala")
    second = areas.async_create("Studio")
    entry = MockConfigEntry(domain="test")
    entry.add_to_hass(hass)
    devices = dr.async_get(hass)
    device = devices.async_get_or_create(config_entry_id=entry.entry_id, identifiers={("test", "panel")})
    devices.async_update_device(device.id, area_id=first.id)
    entities = er.async_get(hass)
    sensor = entities.async_get_or_create("sensor", "test", "temperature", suggested_object_id="panel_temperature", device_id=device.id)
    light = entities.async_get_or_create("light", "test", "light", suggested_object_id="panel_light", device_id=device.id)
    hidden = entities.async_get_or_create("sensor", "test", "private", suggested_object_id="private_sensor", device_id=device.id)
    camera = entities.async_get_or_create("camera", "test", "camera", suggested_object_id="private_camera", device_id=device.id)
    vacuum = entities.async_get_or_create("vacuum", "test", "vacuum", suggested_object_id="panel_vacuum", device_id=device.id)
    calendar = entities.async_get_or_create("calendar", "test", "calendar", suggested_object_id="panel_calendar", device_id=device.id)
    return first, second, device, sensor, light, hidden, camera, vacuum, calendar


async def test_membership_moves_overrides_rename_delete_and_privacy(hass: HomeAssistant):
    first, second, device, sensor, light, hidden, camera, vacuum, calendar = fixtures(hass)
    allowed = {sensor.entity_id, light.entity_id, camera.entity_id, vacuum.entity_id, calendar.entity_id}
    user = SimpleNamespace(is_admin=False, permissions=SimpleNamespace(check_entity=lambda entity_id, _policy: entity_id in allowed))
    manager = HouseManager(hass)
    await manager.async_setup()

    async def context():
        return await dashboard_house_context(manager, user)

    initial = await context()
    assert {room["id"] for room in initial["rooms"]} == {first.id}
    assert {entity["entityId"] for entity in initial["entities"]} == {sensor.entity_id, light.entity_id, vacuum.entity_id, calendar.entity_id}
    assert hidden.entity_id not in str(initial) and camera.entity_id not in str(initial)
    assert "floors" not in initial and "environment" not in initial and "issues" not in initial
    assert next(entity for entity in initial["entities"] if entity["entityId"] == sensor.entity_id)["registryId"] == sensor.id
    assert all(entity["effectiveRoomId"] == first.id for entity in initial["entities"])
    admin = SimpleNamespace(is_admin=True)
    admin_initial = await dashboard_house_context(manager, admin)
    assert hidden.entity_id in {entity["entityId"] for entity in admin_initial["entities"]}
    assert camera.entity_id not in str(admin_initial)
    assert vacuum.entity_id not in {entity["entityId"] for entity in (await manager.async_get_topology(admin))["entities"]}

    dr.async_get(hass).async_update_device(device.id, area_id=second.id)
    await hass.async_block_till_done()
    moved = await context()
    assert moved["topologyRevision"] > initial["topologyRevision"]
    assert moved["devices"] == [{"id": device.id, "effectiveRoomId": second.id}]
    assert all(entity["effectiveRoomId"] == second.id for entity in moved["entities"])
    assert {room["id"] for room in moved["rooms"]} == {second.id}
    assert all(entity["effectiveRoomId"] == second.id for entity in (await dashboard_house_context(manager, admin))["entities"])

    er.async_get(hass).async_update_entity(sensor.entity_id, area_id=first.id)
    await hass.async_block_till_done()
    overridden = await context()
    by_id = {entity["entityId"]: entity for entity in overridden["entities"]}
    assert by_id[sensor.entity_id]["effectiveRoomId"] == first.id
    assert by_id[light.entity_id]["effectiveRoomId"] == second.id
    assert len(overridden["rooms"]) == 2

    er.async_get(hass).async_update_entity(sensor.entity_id, area_id=None)
    await hass.async_block_till_done()
    assert all(entity["effectiveRoomId"] == second.id for entity in (await context())["entities"])
    ar.async_get(hass).async_update(second.id, name="Nuova sala")
    await hass.async_block_till_done()
    renamed = await context()
    assert renamed["rooms"] == [{"id": second.id, "name": "Nuova sala"}]
    ar.async_get(hass).async_delete(second.id)
    await hass.async_block_till_done()
    deleted = await context()
    assert deleted["rooms"] == []
    assert all(entity["effectiveRoomId"] is None for entity in deleted["entities"])
    await manager.async_shutdown()


async def test_dashboard_capability_does_not_grant_rooms_view(hass: HomeAssistant, hass_ws_client):
    fixtures(hass)
    access = AccessPolicyManager(hass, runtime=lambda: None)
    await access.async_setup()
    manager = HouseManager(hass)
    await manager.async_setup()
    hass.data.setdefault(DOMAIN, {})[DATA_ACCESS_MANAGER] = access
    hass.data[DOMAIN][DATA_HOUSE_MANAGER] = manager
    await async_register_dashboard_api(hass)
    await async_register_house_api(hass)
    user = await hass.auth.async_create_user("Dashboard reader", group_ids=["system-users"])
    refresh = await hass.auth.async_create_refresh_token(user, "https://example.com/panels")
    client = await hass_ws_client(hass, hass.auth.async_create_access_token(refresh))

    # Synthetic capability split: current stock roles include both, but the two
    # endpoint contracts must remain independent when future policies diverge.
    def authorization(_manager, _user, action):
        allowed = action == "domusos/dashboard/get_house_context"
        return AuthorizationDecision(allowed, DecisionReason.ALLOWED if allowed else DecisionReason.MISSING_CAPABILITY,
                                     "dashboard.view" if allowed else "rooms.view", action=action)

    with patch.object(instrumentation, "authorize_user_action", side_effect=authorization):
        await client.send_json_auto_id({"type": "domusos/dashboard/get_house_context"})
        dashboard = await client.receive_json()
        assert dashboard["success"] and dashboard["result"]["schemaVersion"] == "domusos.dashboard.house.v1"
        await client.send_json_auto_id({"type": "domusos/house/get_topology"})
        assert (await client.receive_json())["error"]["code"] == "access_denied"
        await client.send_json_auto_id({"type": "domusos/dashboard/get_house_context", "is_admin": True})
        assert not (await client.receive_json())["success"]
    await manager.async_shutdown()
