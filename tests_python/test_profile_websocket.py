"""Domus Profile self-service commands, called directly with a recorded connection.

The real websocket stack is covered by ``test_profile_websocket_stack.py``; as
for Energy, its Home Assistant 2025.1 fixture leaves an aiohttp shutdown thread
behind, so the command contract runs here on every supported release.
"""

from typing import Any
from unittest.mock import AsyncMock

import pytest
import voluptuous as vol
from homeassistant.core import HomeAssistant

from custom_components.domusos.const import DOMAIN
from custom_components.domusos.profile.api import (
    DATA_PROFILE_MANAGER,
    websocket_get_self,
    websocket_save_self,
)
from custom_components.domusos.profile.manager import ProfileManager

NOW = "2026-10-08T09:00:00+00:00"


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


async def _manager(hass: HomeAssistant, stored: Any = None) -> ProfileManager:
    manager = ProfileManager(hass)
    manager.store.async_load = AsyncMock(return_value=stored)
    manager.store.async_save = AsyncMock()
    await manager.async_setup()
    hass.data.setdefault(DOMAIN, {})[DATA_PROFILE_MANAGER] = manager
    return manager


async def _call(hass: HomeAssistant, handler: Any, connection: RecordedConnection, msg: dict) -> None:
    handler(hass, connection, msg)
    await hass.async_block_till_done(wait_background_tasks=True)


def _stored(owner: str, revision: int, devices: list[dict] | None = None) -> dict[str, Any]:
    return {
        "schema": "domusos-profiles",
        "version": 1,
        "profiles": {
            owner: {
                "owner_user_id": owner,
                "revision": revision,
                "created_at": NOW,
                "updated_at": NOW,
                "state": "active",
                "personal_devices": devices or [],
                "notifications": {"enabled": True},
                "preferences": {},
            }
        },
    }


async def test_get_self_serves_the_connection_user_without_writing(hass: HomeAssistant) -> None:
    user = await hass.auth.async_create_user("Mattia")
    hass.states.async_set("person.mattia", "home", {"id": "mattia", "user_id": user.id})
    manager = await _manager(hass)
    connection = RecordedConnection(user)

    await _call(hass, websocket_get_self, connection, {"id": 1, "type": "domusos/profile/get_self"})

    result = connection.results[1]
    assert result["owner"] == {
        "user_id": user.id,
        "person_id": "mattia",
        "person_entity_id": "person.mattia",
        "person_status": "resolved",
    }
    assert result["persisted"] is False
    assert result["revision"] == 0
    assert result["profile"]["notifications"] == {"enabled": True}
    assert "owner_user_id" not in result["profile"]
    manager.store.async_save.assert_not_called()


async def test_get_self_works_for_a_user_without_person(hass: HomeAssistant) -> None:
    user = await hass.auth.async_create_user("Solo")
    hass.states.async_set("person.solo", "home", {"id": "solo", "friendly_name": "Solo"})
    await _manager(hass)
    connection = RecordedConnection(user)

    await _call(hass, websocket_get_self, connection, {"id": 1, "type": "domusos/profile/get_self"})

    assert connection.results[1]["owner"]["person_id"] is None
    assert connection.results[1]["owner"]["person_status"] == "unknown"


async def test_get_self_reports_an_ambiguous_person_without_choosing(hass: HomeAssistant) -> None:
    user = await hass.auth.async_create_user("Mattia")
    hass.states.async_set("person.a", "home", {"id": "a", "user_id": user.id})
    hass.states.async_set("person.b", "home", {"id": "b", "user_id": user.id})
    await _manager(hass)
    connection = RecordedConnection(user)

    await _call(hass, websocket_get_self, connection, {"id": 1, "type": "domusos/profile/get_self"})

    assert connection.results[1]["owner"]["person_status"] == "ambiguous"
    assert connection.results[1]["owner"]["person_id"] is None


async def test_save_self_saves_notifications_for_the_connection_user_only(hass: HomeAssistant) -> None:
    mattia = await hass.auth.async_create_user("Mattia")
    erika = await hass.auth.async_create_user("Erika")
    manager = await _manager(hass, _stored(erika.id, 7))
    connection = RecordedConnection(mattia)

    await _call(
        hass,
        websocket_save_self,
        connection,
        {"id": 2, "type": "domusos/profile/save_self", "expected_revision": 0, "profile": {"notifications": {"enabled": False}}},
    )

    result = connection.results[2]
    assert result["owner"]["user_id"] == mattia.id
    assert result["persisted"] is True
    assert result["revision"] == 1
    assert result["profile"]["notifications"] == {"enabled": False}
    assert result["profile"]["updated_at"]
    assert manager.get_profile(erika.id).revision == 7


async def test_save_self_errors_have_specific_codes(hass: HomeAssistant) -> None:
    user = await hass.auth.async_create_user("Mattia")
    devices = [{
        "id": "dev-1",
        "source": {"kind": "ha_device", "ha_device_id": "f" * 32},
        "added_at": NOW,
        "notifications": {"enabled": True},
    }]
    await _manager(hass, _stored(user.id, 3, devices))
    connection = RecordedConnection(user)
    base = {"type": "domusos/profile/save_self", "profile": {"notifications": {"enabled": False}}}

    await _call(hass, websocket_save_self, connection, {**base, "id": 1, "expected_revision": 2})
    await _call(hass, websocket_save_self, connection, {
        **base, "id": 2, "expected_revision": 3,
        "profile": {"notifications": {"enabled": False}, "personal_devices": []},
    })
    await _call(hass, websocket_save_self, connection, {
        **base, "id": 3, "expected_revision": 3,
        "profile": {"notifications": {"enabled": False}, "owner_user_id": "x"},
    })

    assert connection.errors == {
        1: "revision_conflict",
        2: "device_management_not_available",
        3: "invalid_profile",
    }


async def test_system_and_disabled_accounts_get_no_profile(hass: HomeAssistant) -> None:
    await hass.auth.async_create_user("Owner")
    system = await hass.auth.async_create_system_user("Home Assistant Cloud")
    disabled = await hass.auth.async_create_user("Ex")
    await hass.auth.async_deactivate_user(disabled)
    manager = await _manager(hass, _stored(disabled.id, 2))
    save = {"type": "domusos/profile/save_self", "expected_revision": 2, "profile": {"notifications": {"enabled": False}}}

    for user in (system, disabled):
        connection = RecordedConnection(user)
        await _call(hass, websocket_get_self, connection, {"id": 1, "type": "domusos/profile/get_self"})
        await _call(hass, websocket_save_self, connection, {**save, "id": 2})
        expected = "not_household_account" if user is system else "account_disabled"
        assert connection.errors == {1: expected, 2: expected}

    # The disabled account's profile stays intact and active.
    assert manager.get_profile(disabled.id).profile.state == "active"
    manager.store.async_save.assert_not_called()


async def test_unavailable_and_corrupt_profile_core(hass: HomeAssistant) -> None:
    user = await hass.auth.async_create_user("Mattia")
    connection = RecordedConnection(user)

    await _call(hass, websocket_get_self, connection, {"id": 1, "type": "domusos/profile/get_self"})
    await _manager(hass, {"schema": "domusos-profiles", "version": 1, "profiles": []})
    await _call(hass, websocket_get_self, connection, {"id": 2, "type": "domusos/profile/get_self"})

    assert connection.errors == {1: "profile_unavailable", 2: "store_corrupt"}


@pytest.mark.parametrize(
    "message",
    [
        {"user_id": "other"},
        {"person_id": "erika"},
        {"owner_user_id": "other"},
    ],
)
def test_identity_keys_are_rejected_by_the_command_schemas(message: dict) -> None:
    # A type-only command has no schema: Home Assistant then refuses any key
    # besides "id" and "type" (``len(msg) > 2``) in every supported release.
    assert websocket_get_self._ws_schema is False  # noqa: SLF001
    save_schema = websocket_save_self._ws_schema  # noqa: SLF001
    save = {"id": 1, "type": "domusos/profile/save_self", "expected_revision": 0, "profile": {}}

    assert save_schema(save)
    with pytest.raises(vol.Invalid):
        save_schema({**save, **message})


@pytest.mark.parametrize("revision", [None, -1, True, "1", 1.5])
def test_expected_revision_is_a_required_non_negative_integer(revision: Any) -> None:
    save_schema = websocket_save_self._ws_schema  # noqa: SLF001
    save = {"id": 1, "type": "domusos/profile/save_self", "profile": {}}

    with pytest.raises(vol.Invalid):
        save_schema(save)
    with pytest.raises(vol.Invalid):
        save_schema({**save, "expected_revision": revision})
