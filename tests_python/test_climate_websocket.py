"""Real HA WebSocket authorization and closed CLM.2 API contracts."""

from __future__ import annotations

from copy import deepcopy
from unittest.mock import patch

import pytest
from homeassistant.core import HomeAssistant

from custom_components.domusos.access import DATA_ACCESS_MANAGER, AccessPolicyManager
from custom_components.domusos.access.adapters import authorize_user_action
from custom_components.domusos.climate.api import async_register_climate_api
from custom_components.domusos.climate.manager import (
    DATA_CLIMATE_MANAGER,
    ClimateManager,
)
from custom_components.domusos.climate.models import (
    ClimatePermissionError,
    empty_config,
)
from custom_components.domusos.climate.state_manager import (
    DATA_CLIMATE_STATE_MANAGER,
    ClimateStateManager,
)
from custom_components.domusos.const import DOMAIN


class MemoryStore:
    path = None

    def __init__(self):
        self.data = None
        self.writes = 0

    async def async_load(self):
        return deepcopy(self.data)

    async def async_save(self, value):
        self.data = deepcopy(value)
        self.writes += 1


async def ask(client, message):
    await client.send_json_auto_id(message)
    return await client.receive_json()


async def setup_climate(hass):
    access = AccessPolicyManager(hass, runtime=lambda: None)
    await access.async_setup()
    store = MemoryStore()
    manager = ClimateManager(hass, store=store, runtime=lambda: None)
    await manager.async_setup()
    hass.data.setdefault(DOMAIN, {})[DATA_ACCESS_MANAGER] = access
    hass.data[DOMAIN][DATA_CLIMATE_MANAGER] = manager
    await async_register_climate_api(hass)
    return store, manager


async def test_member_can_read_but_direct_save_is_denied_without_a_write(hass: HomeAssistant, hass_ws_client):
    store, manager = await setup_climate(hass)
    admin = await hass_ws_client(hass)
    saved = await ask(admin, {"type": "domusos/climate/save_config", "config": empty_config(), "expected_revision": 0})
    assert saved["success"] and saved["result"]["revision"] == 1
    member = await hass.auth.async_create_user("Member", group_ids=["system-users"])
    refresh = await hass.auth.async_create_refresh_token(member, "https://example.com/app")
    client = await hass_ws_client(hass, hass.auth.async_create_access_token(refresh))
    read = await ask(client, {"type": "domusos/climate/get_config"})
    assert read["success"] and read["result"]["config"] == empty_config()
    program = empty_config()
    program["profiles"] = [{"id": "comfort", "name": "Comfort", "zoneTargets": {}}]
    program["schedules"] = [{"day": "monday", "events": [{"time": "06:30", "profileId": "comfort"}]}]
    denied = await ask(client, {"type": "domusos/climate/save_config", "config": program, "expected_revision": 1})
    assert denied["error"]["code"] == "access_denied"
    assert store.writes == 1 and manager.revision == 1


async def test_extra_websocket_fields_are_rejected_before_saving(hass: HomeAssistant, hass_ws_client):
    store, _ = await setup_climate(hass)
    admin = await hass_ws_client(hass)
    reply = await ask(admin, {"type": "domusos/climate/save_config", "config": empty_config(), "expected_revision": 0, "surprise": 1})
    assert reply["error"]["code"] == "invalid_format"
    assert store.writes == 0
    reply = await ask(admin, {"type": "domusos/climate/get_config", "surprise": 1})
    assert reply["error"]["code"] == "invalid_format"


async def test_missing_access_policy_refuses_a_direct_write(hass: HomeAssistant, hass_ws_client):
    store, _ = await setup_climate(hass)
    hass.data[DOMAIN].pop(DATA_ACCESS_MANAGER)
    admin = await hass_ws_client(hass)
    reply = await ask(admin, {"type": "domusos/climate/save_config", "config": empty_config(), "expected_revision": 0})
    assert reply["error"]["code"] == "access_denied"
    assert store.writes == 0


async def test_authorization_error_refuses_without_side_effects(hass: HomeAssistant, hass_ws_client):
    store, _ = await setup_climate(hass)
    admin = await hass_ws_client(hass)
    with patch("custom_components.domusos.access.instrumentation.authorize_user_action", side_effect=RuntimeError("down")):
        reply = await ask(admin, {"type": "domusos/climate/save_config", "config": empty_config(), "expected_revision": 0})
    assert reply["error"]["code"] == "access_denied"
    assert store.writes == 0


async def test_inactive_account_cannot_save(hass: HomeAssistant, hass_admin_user):
    store, manager = await setup_climate(hass)
    user = await hass.auth.async_create_user("Inactive", group_ids=["system-admin"])
    assert not user.is_owner
    await hass.auth.async_deactivate_user(user)
    decision = authorize_user_action(hass.data[DOMAIN][DATA_ACCESS_MANAGER], user, "domusos/climate/save_config")
    assert not decision.allowed
    with pytest.raises(ClimatePermissionError):
        await manager.async_save_config(empty_config(), 0, user)
    assert store.writes == 0 and manager.revision == 0


async def setup_intent(hass, admin_user):
    _, config_manager = await setup_climate(hass)
    hass.states.async_set("sensor.living_temp", "19.2", {"device_class": "temperature"})
    config = empty_config()
    config["zones"] = [{"id": "living", "name": "Living", "areaId": None, "reference": {"primaryEntityId": "sensor.living_temp", "fallbacks": []}, "endpointIds": []}]
    await config_manager.async_save_config(config, 0, admin_user)
    state_store = MemoryStore()
    state_manager = ClimateStateManager(hass, config_manager, store=state_store)
    await state_manager.async_setup()
    hass.data[DOMAIN][DATA_CLIMATE_STATE_MANAGER] = state_manager
    return state_store, state_manager


async def test_member_can_control_intent_but_not_manage_and_restricted_direct_ws_is_denied(hass: HomeAssistant, hass_ws_client, hass_admin_user):
    store, manager = await setup_intent(hass, hass_admin_user)
    try:
        member = await hass.auth.async_create_user("Member", group_ids=["system-users"])
        refresh = await hass.auth.async_create_refresh_token(member, "https://example.com/app")
        client = await hass_ws_client(hass, hass.auth.async_create_access_token(refresh))
        initial = await ask(client, {"type": "domusos/climate/get_state"})
        assert initial["success"] and initial["result"]["revision"] == 0
        house = await ask(client, {"type": "domusos/climate/set_house_intent", "operating_mode": "heating", "control_mode": "manual", "expected_revision": 0})
        assert house["success"] and house["result"]["revision"] == 1
        zone = await ask(client, {"type": "domusos/climate/set_zone_intent", "zone_id": "living", "mode": "follow_house", "target_temperature": 21, "expected_revision": 1})
        assert zone["success"] and zone["result"]["preview"]["zones"][0]["derived"]["thermalStatus"] == "needs_heating"
        denied_manage = await ask(client, {"type": "domusos/climate/save_config", "config": empty_config(), "expected_revision": 1})
        assert denied_manage["error"]["code"] == "access_denied"
        access = hass.data[DOMAIN][DATA_ACCESS_MANAGER]
        await access.async_assign(hass_admin_user, member.id, "restricted", [], access.revision)
        before = (manager.revision, store.writes, deepcopy(store.data))
        for message in (
            {"type": "domusos/climate/set_house_intent", "operating_mode": "off", "control_mode": "manual", "expected_revision": 2},
            {"type": "domusos/climate/set_zone_intent", "zone_id": "living", "mode": "off", "target_temperature": 21, "expected_revision": 2},
        ):
            denied = await ask(client, message)
            assert denied["error"]["code"] == "access_denied"
        assert (manager.revision, store.writes, store.data) == before
    finally:
        await manager.async_shutdown()


async def test_intent_direct_ws_fails_closed_without_policy_and_inactive_principal(hass: HomeAssistant, hass_ws_client, hass_admin_user):
    store, manager = await setup_intent(hass, hass_admin_user)
    try:
        admin = await hass_ws_client(hass)
        hass.data[DOMAIN].pop(DATA_ACCESS_MANAGER)
        result = await ask(admin, {"type": "domusos/climate/set_house_intent", "operating_mode": "heating", "control_mode": "manual", "expected_revision": 0})
        assert result["error"]["code"] == "access_denied"
        assert store.writes == 0 and manager.revision == 0
        inactive = await hass.auth.async_create_user("Inactive", group_ids=["system-users"])
        await hass.auth.async_deactivate_user(inactive)
        assert not authorize_user_action(None, inactive, "domusos/climate/set_zone_intent").allowed
        assert not authorize_user_action(None, None, "domusos/climate/set_house_intent").allowed
    finally:
        await manager.async_shutdown()


async def test_override_ws_requires_climate_control_and_enforces_revision_without_side_effects(hass: HomeAssistant, hass_ws_client, hass_admin_user):
    store, manager = await setup_intent(hass, hass_admin_user)
    try:
        member = await hass.auth.async_create_user("Override member", group_ids=["system-users"])
        refresh = await hass.auth.async_create_refresh_token(member, "https://example.com/app")
        client = await hass_ws_client(hass, hass.auth.async_create_access_token(refresh))
        house = await ask(client, {"type": "domusos/climate/set_house_intent", "operating_mode": "heating", "control_mode": "auto", "expected_revision": 0})
        assert house["success"]
        created = await ask(client, {"type": "domusos/climate/set_zone_override", "zone_id": "living", "target_temperature": 22,
                                     "expiry_mode": "duration", "duration_minutes": 60, "expected_revision": 1})
        assert created["success"] and created["result"]["preview"]["zones"][0]["derived"]["targetSource"] == "override"
        conflict = await ask(client, {"type": "domusos/climate/clear_zone_override", "zone_id": "living", "expected_revision": 1})
        assert conflict["error"]["code"] == "conflict"
        invalid = await ask(client, {"type": "domusos/climate/set_zone_override", "zone_id": "living", "target_temperature": 50,
                                     "expiry_mode": "duration", "duration_minutes": 60, "expected_revision": 2})
        assert invalid["error"]["code"] == "invalid_config"
        access = hass.data[DOMAIN][DATA_ACCESS_MANAGER]
        visible = await ask(client, {"type": "domusos/climate/get_state"})
        assert visible["success"] and visible["result"]["preview"]["zones"][0]["override"] is not None
        await access.async_assign(hass_admin_user, member.id, "restricted", [], access.revision)
        before = (manager.revision, store.writes, deepcopy(store.data))
        for message in (
            {"type": "domusos/climate/set_zone_override", "zone_id": "living", "target_temperature": 23,
             "expiry_mode": "duration", "duration_minutes": 60, "expected_revision": 2},
            {"type": "domusos/climate/clear_zone_override", "zone_id": "living", "expected_revision": 2},
        ):
            denied = await ask(client, message)
            assert denied["error"]["code"] == "access_denied"
        assert (manager.revision, store.writes, store.data) == before
    finally:
        await manager.async_shutdown()


async def test_execute_ws_rejects_entity_injection_and_denied_principal_without_service_call(
    hass: HomeAssistant, hass_ws_client, hass_admin_user,
):
    _, manager = await setup_intent(hass, hass_admin_user)
    request = {"type": "domusos/climate/execute_plan", "zone_id": "living",
               "expected_plan_token": "0" * 32, "expected_config_revision": 1,
               "expected_state_revision": 0}
    try:
        admin = await hass_ws_client(hass)
        member = await hass.auth.async_create_user("Execution member", group_ids=["system-users"])
        refresh = await hass.auth.async_create_refresh_token(member, "https://example.com/app")
        client = await hass_ws_client(hass, hass.auth.async_create_access_token(refresh))
        with patch.object(type(hass.services), "async_call", side_effect=AssertionError("physical call")) as calls:
            injected = await ask(admin, {**request, "entity_id": "climate.other"})
            assert injected["error"]["code"] == "invalid_format"
            access = hass.data[DOMAIN][DATA_ACCESS_MANAGER]
            await access.async_assign(hass_admin_user, member.id, "restricted", [], access.revision)
            denied = await ask(client, request)
            assert denied["error"]["code"] == "access_denied"
            calls.assert_not_called()
    finally:
        await manager.async_shutdown()
