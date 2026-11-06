"""Real HA WebSocket authorization and closed CLM.2 API contracts."""

from __future__ import annotations

from copy import deepcopy
from unittest.mock import patch

from homeassistant.core import HomeAssistant

from custom_components.domusos.access import DATA_ACCESS_MANAGER, AccessPolicyManager
from custom_components.domusos.access.adapters import authorize_user_action
from custom_components.domusos.climate.api import async_register_climate_api
from custom_components.domusos.climate.manager import (
    DATA_CLIMATE_MANAGER,
    ClimateManager,
)
from custom_components.domusos.climate.models import empty_config
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
    denied = await ask(client, {"type": "domusos/climate/save_config", "config": empty_config(), "expected_revision": 1})
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


async def test_inactive_account_cannot_save(hass: HomeAssistant):
    store, _ = await setup_climate(hass)
    user = await hass.auth.async_create_user("Inactive", group_ids=["system-admin"])
    await hass.auth.async_deactivate_user(user)
    decision = authorize_user_action(hass.data[DOMAIN][DATA_ACCESS_MANAGER], user, "domusos/climate/save_config")
    assert not decision.allowed and store.writes == 0
