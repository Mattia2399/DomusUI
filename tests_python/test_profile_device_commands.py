"""Personal device commands, called directly with a recorded connection.

Like ``test_profile_websocket.py`` this runs on every supported release; the
real websocket stack is covered by ``test_profile_websocket_stack.py``.
"""

import json
from typing import Any
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
import voluptuous as vol
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.domusos.const import DOMAIN
from custom_components.domusos.profile.api import (
    DATA_PROFILE_MANAGER,
    websocket_add_device,
    websocket_discover_devices,
    websocket_get_self,
    websocket_remove_device,
    websocket_update_device,
)
from custom_components.domusos.profile.manager import ProfileManager

SECRET = "webhook-secret-do-not-leak"


class RecordedConnection:
    """The parts of ``ActiveConnection`` the profile handlers use."""

    def __init__(self, user: Any) -> None:
        self.user = user
        self.results: dict[int, Any] = {}
        self.errors: dict[int, str] = {}

    def send_result(self, msg_id: int, result: Any = None) -> None:
        self.results[msg_id] = result

    def send_error(self, msg_id: int, code: str, message: str, *_: Any, **__: Any) -> None:
        self.errors[msg_id] = code

    def async_handle_exception(self, msg: dict[str, Any], err: Exception) -> None:
        self.errors[msg["id"]] = type(err).__name__


def register_app(hass: HomeAssistant, user_id: str, name: str) -> dr.DeviceEntry:
    app_device_id = uuid4().hex
    entry = MockConfigEntry(
        domain="mobile_app",
        data={"user_id": user_id, "device_id": app_device_id, "device_name": name, "webhook_id": SECRET},
    )
    entry.add_to_hass(hass)
    hass.services.async_register("notify", f"mobile_app_{name.lower().replace(' ', '_')}", AsyncMock())
    return dr.async_get(hass).async_get_or_create(
        config_entry_id=entry.entry_id, identifiers={("mobile_app", app_device_id)}, name=name, model="Pixel 8"
    )


async def _manager(hass: HomeAssistant) -> ProfileManager:
    manager = ProfileManager(hass)
    manager.store.async_load = AsyncMock(return_value=None)
    manager.store.async_save = AsyncMock()
    await manager.async_setup()
    hass.data.setdefault(DOMAIN, {})[DATA_PROFILE_MANAGER] = manager
    return manager


async def _call(hass: HomeAssistant, handler: Any, connection: RecordedConnection, msg: dict) -> None:
    handler(hass, connection, msg)
    await hass.async_block_till_done(wait_background_tasks=True)


async def test_discover_add_update_remove_through_the_commands(hass: HomeAssistant) -> None:
    await hass.auth.async_create_user("Owner")
    mattia = await hass.auth.async_create_user("Mattia")
    device = register_app(hass, mattia.id, "Pixel 8")
    manager = await _manager(hass)
    connection = RecordedConnection(mattia)

    await _call(hass, websocket_discover_devices, connection, {"id": 1, "type": "domusos/profile/discover_devices"})
    discovered = connection.results[1]
    await _call(hass, websocket_add_device, connection, {
        "id": 2, "type": "domusos/profile/add_device", "expected_revision": 0,
        "ha_device_id": device.id, "label": "  Telefono  ",
    })
    added = connection.results[2]
    device_id = added["profile"]["personal_devices"][0]["id"]
    await _call(hass, websocket_update_device, connection, {
        "id": 3, "type": "domusos/profile/update_device", "expected_revision": 1,
        "device_id": device_id, "notifications": {"enabled": False},
    })
    await _call(hass, websocket_get_self, connection, {"id": 4, "type": "domusos/profile/get_self"})
    await _call(hass, websocket_remove_device, connection, {
        "id": 5, "type": "domusos/profile/remove_device", "expected_revision": 2, "device_id": device_id,
    })

    assert discovered["revision"] == 0
    assert discovered["devices"][0]["ha_device_id"] == device.id
    assert discovered["devices"][0]["status"] == "available"
    assert added["revision"] == 1
    assert added["profile"]["personal_devices"][0]["label"] == "Telefono"
    assert connection.results[3]["profile"]["personal_devices"][0]["notifications"] == {"enabled": False}
    live = connection.results[4]["live_devices"]
    assert live[0]["device_id"] == device_id
    assert live[0]["status"] == "active"
    assert live[0]["notification_target_status"] == "ready"
    assert live[0]["capabilities"]["notifications"] is True
    # Live data stays out of the stored profile.
    assert "status" not in connection.results[4]["profile"]["personal_devices"][0]
    assert connection.results[5]["profile"]["personal_devices"] == []
    for result in connection.results.values():
        assert SECRET not in json.dumps(result)
        assert "mobile_app_pixel_8" not in json.dumps(result)
    assert connection.errors == {}


async def test_device_command_errors_never_reveal_the_owner(hass: HomeAssistant) -> None:
    await hass.auth.async_create_user("Owner")
    mattia = await hass.auth.async_create_user("Mattia")
    erika = await hass.auth.async_create_user("Erika")
    erika_phone = register_app(hass, erika.id, "Telefono Mattia")
    await _manager(hass)
    connection = RecordedConnection(mattia)

    await _call(hass, websocket_add_device, connection, {
        "id": 1, "type": "domusos/profile/add_device", "expected_revision": 0, "ha_device_id": erika_phone.id,
    })
    await _call(hass, websocket_remove_device, connection, {
        "id": 2, "type": "domusos/profile/remove_device", "expected_revision": 0, "device_id": "dev-x",
    })
    await _call(hass, websocket_discover_devices, connection, {"id": 3, "type": "domusos/profile/discover_devices"})

    assert connection.errors == {1: "device_not_claimable", 2: "device_not_in_profile"}
    assert connection.results[3]["devices"] == []


async def test_system_and_disabled_accounts_cannot_use_device_commands(hass: HomeAssistant) -> None:
    await hass.auth.async_create_user("Owner")
    system = await hass.auth.async_create_system_user("Home Assistant Cloud")
    disabled = await hass.auth.async_create_user("Ex")
    await hass.auth.async_deactivate_user(disabled)
    await _manager(hass)

    for user, code in ((system, "not_household_account"), (disabled, "account_disabled")):
        connection = RecordedConnection(user)
        await _call(hass, websocket_discover_devices, connection, {"id": 1, "type": "domusos/profile/discover_devices"})
        await _call(hass, websocket_add_device, connection, {
            "id": 2, "type": "domusos/profile/add_device", "expected_revision": 0, "ha_device_id": "a" * 32,
        })
        assert connection.errors == {1: code, 2: code}


@pytest.mark.parametrize("identity", [{"user_id": "x"}, {"person_id": "x"}, {"owner_user_id": "x"}])
def test_device_command_schemas_refuse_identity_and_record_fields(identity: dict) -> None:
    add = websocket_add_device._ws_schema  # noqa: SLF001
    remove = websocket_remove_device._ws_schema  # noqa: SLF001
    update = websocket_update_device._ws_schema  # noqa: SLF001
    base_add = {"id": 1, "type": "domusos/profile/add_device", "expected_revision": 0, "ha_device_id": "a" * 32}
    base_remove = {"id": 1, "type": "domusos/profile/remove_device", "expected_revision": 0, "device_id": "dev-1"}
    base_update = {"id": 1, "type": "domusos/profile/update_device", "expected_revision": 0, "device_id": "dev-1", "label": "x"}

    assert websocket_discover_devices._ws_schema is False  # noqa: SLF001
    assert add(base_add) and remove(base_remove) and update(base_update)
    for schema, base in ((add, base_add), (remove, base_remove), (update, base_update)):
        with pytest.raises(vol.Invalid):
            schema({**base, **identity})
    # A new record never takes a client-chosen id or date.
    for extra in ({"device_id": "dev-1"}, {"added_at": "2026-10-09T09:00:00+00:00"}, {"notifications": {"enabled": True}}):
        with pytest.raises(vol.Invalid):
            add({**base_add, **extra})
    for extra in ({"ha_device_id": "b" * 32}, {"added_at": "2026-10-09T09:00:00+00:00"}, {"source": {}}):
        with pytest.raises(vol.Invalid):
            update({**base_update, **extra})
    for bad in ({"expected_revision": None}, {"ha_device_id": "../x"}, {"label": "x" * 257}, {"label": 3}):
        with pytest.raises(vol.Invalid):
            add({**base_add, **bad})
    with pytest.raises(vol.Invalid):
        update({**base_update, "notifications": {"enabled": "no"}})
