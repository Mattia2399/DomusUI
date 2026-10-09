"""Domus Profile commands through the real Home Assistant websocket stack."""

from unittest.mock import AsyncMock

from homeassistant.core import HomeAssistant

from custom_components.domusos.const import DOMAIN
from custom_components.domusos.profile.api import DATA_PROFILE_MANAGER, async_register_profile_api
from custom_components.domusos.profile.manager import ProfileManager


async def _setup(hass: HomeAssistant) -> ProfileManager:
    manager = ProfileManager(hass)
    manager.store.async_load = AsyncMock(return_value=None)
    manager.store.async_save = AsyncMock()
    await manager.async_setup()
    hass.data.setdefault(DOMAIN, {})[DATA_PROFILE_MANAGER] = manager
    await async_register_profile_api(hass)
    return manager


async def test_identity_keys_are_refused_by_home_assistant(hass: HomeAssistant, hass_ws_client) -> None:
    manager = await _setup(hass)
    client = await hass_ws_client(hass)

    await client.send_json_auto_id({"type": "domusos/profile/get_self", "user_id": "someone"})
    refused_get = await client.receive_json()
    await client.send_json_auto_id({
        "type": "domusos/profile/save_self",
        "expected_revision": 0,
        "profile": {"notifications": {"enabled": False}},
        "person_id": "erika",
    })
    refused_save = await client.receive_json()

    assert not refused_get["success"]
    assert refused_get["error"]["code"] == "invalid_format"
    assert not refused_save["success"]
    assert refused_save["error"]["code"] == "invalid_format"
    manager.store.async_save.assert_not_called()
    await manager.async_shutdown()


async def test_a_regular_user_reads_and_saves_their_own_profile(
    hass: HomeAssistant, hass_ws_client, hass_read_only_access_token: str, hass_read_only_user
) -> None:
    manager = await _setup(hass)
    client = await hass_ws_client(hass, hass_read_only_access_token)

    await client.send_json_auto_id({"type": "domusos/profile/get_self"})
    first = await client.receive_json()
    await client.send_json_auto_id({
        "type": "domusos/profile/save_self",
        "expected_revision": 0,
        "profile": {"notifications": {"enabled": False}},
    })
    saved = await client.receive_json()
    await client.send_json_auto_id({
        "type": "domusos/profile/save_self",
        "expected_revision": 0,
        "profile": {"notifications": {"enabled": True}},
    })
    stale = await client.receive_json()

    assert first["success"]
    assert first["result"]["owner"]["user_id"] == hass_read_only_user.id
    assert first["result"]["persisted"] is False
    assert saved["success"]
    assert saved["result"]["revision"] == 1
    assert manager.get_profile(hass_read_only_user.id).profile.notifications_enabled is False
    assert not stale["success"]
    assert stale["error"]["code"] == "revision_conflict"
    await manager.async_shutdown()


async def test_device_commands_through_the_websocket_stack(
    hass: HomeAssistant, hass_ws_client, hass_admin_user
) -> None:
    from uuid import uuid4

    from homeassistant.helpers import device_registry as dr
    from pytest_homeassistant_custom_component.common import MockConfigEntry

    app_device_id = uuid4().hex
    entry = MockConfigEntry(
        domain="mobile_app",
        data={"user_id": hass_admin_user.id, "device_id": app_device_id, "device_name": "Pixel 8"},
    )
    entry.add_to_hass(hass)
    device = dr.async_get(hass).async_get_or_create(
        config_entry_id=entry.entry_id, identifiers={("mobile_app", app_device_id)}, name="Pixel 8"
    )
    manager = await _setup(hass)
    client = await hass_ws_client(hass)

    await client.send_json_auto_id({"type": "domusos/profile/discover_devices", "user_id": "someone"})
    refused = await client.receive_json()
    await client.send_json_auto_id({"type": "domusos/profile/discover_devices"})
    discovered = await client.receive_json()
    await client.send_json_auto_id({
        "type": "domusos/profile/add_device", "expected_revision": 0,
        "ha_device_id": device.id, "device_id": "chosen-by-client",
    })
    refused_id = await client.receive_json()
    await client.send_json_auto_id({
        "type": "domusos/profile/add_device", "expected_revision": 0, "ha_device_id": device.id,
    })
    added = await client.receive_json()

    assert refused["error"]["code"] == "invalid_format"
    assert discovered["result"]["devices"][0]["claimable"] is True
    assert refused_id["error"]["code"] == "invalid_format"
    assert added["success"]
    assert added["result"]["revision"] == 1
    assert added["result"]["profile"]["personal_devices"][0]["id"] != "chosen-by-client"
    assert added["result"]["live_devices"][0]["status"] == "active"
    await manager.async_shutdown()


async def test_the_self_test_through_the_websocket_stack(
    hass: HomeAssistant, hass_ws_client, hass_admin_user
) -> None:
    from custom_components.domusos.notifications import DATA_NOTIFICATION_ROUTER, NotificationRouter

    from notification_support import claim, register_phone

    manager = await _setup(hass)
    hass.data[DOMAIN][DATA_NOTIFICATION_ROUTER] = NotificationRouter(hass, manager, None)
    phone = register_phone(hass, hass_admin_user.id, "Pixel 8")
    await claim(manager, hass_admin_user.id, phone)
    client = await hass_ws_client(hass)

    await client.send_json_auto_id({"type": "domusos/profile/test_self", "message": "spam"})
    refused = await client.receive_json()
    await client.send_json_auto_id({"type": "domusos/profile/test_self"})
    sent = await client.receive_json()
    await client.send_json_auto_id({"type": "domusos/profile/test_self"})
    limited = await client.receive_json()

    assert not refused["success"] and refused["error"]["code"] == "invalid_format"
    assert sent["success"] and sent["result"]["status"] == "delivered"
    assert not limited["success"] and limited["error"]["code"] == "rate_limited"
    assert len(phone.calls) == 1 and "spam" not in str(phone.calls)
    await manager.async_shutdown()


async def test_list_recipients_through_the_websocket_stack(
    hass: HomeAssistant, hass_ws_client, hass_admin_user, hass_read_only_access_token: str
) -> None:
    from notification_support import set_person

    manager = await _setup(hass)
    set_person(hass, "person.mattia", "p-mattia", hass_admin_user.id)
    admin = await hass_ws_client(hass)
    regular = await hass_ws_client(hass, hass_read_only_access_token)

    await admin.send_json_auto_id({"type": "domusos/profile/list_recipients"})
    listed = await admin.receive_json()
    await admin.send_json_auto_id({"type": "domusos/profile/list_recipients", "include_devices": True})
    extra = await admin.receive_json()
    # A non-administrator who builds the message by hand.
    await regular.send_json_auto_id({"type": "domusos/profile/list_recipients"})
    refused = await regular.receive_json()

    assert listed["success"]
    assert listed["result"] == {"recipients": [{
        "person_id": "p-mattia", "person_entity_id": "person.mattia", "status": "no_profile", "selectable": True,
    }]}
    assert not extra["success"] and extra["error"]["code"] == "invalid_format"
    assert not refused["success"] and refused["error"]["code"] == "unauthorized"
    manager.store.async_save.assert_not_called()
    await manager.async_shutdown()
