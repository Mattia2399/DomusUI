"""Domus access get_self and its recovery service through the real Home Assistant stack."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import ExitStack, contextmanager
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, Mock, patch

import pytest

from homeassistant.core import Context, HomeAssistant
from homeassistant.exceptions import Unauthorized

from custom_components.domusos import DomusEntryData, async_setup_entry, async_unload_entry
from custom_components.domusos.access import DATA_ACCESS_MANAGER, AccessPolicyManager
from custom_components.domusos.access.api import SERVICE_RESET_ACCESS_POLICY, async_register_access_api
from custom_components.domusos.access.models import SCHEMA, SCHEMA_VERSION, STORAGE_KEY
from custom_components.domusos.calendar_store import DomusCalendarStore
from custom_components.domusos.const import DOMAIN
from custom_components.domusos.irrigation import IrrigationManager

NOW = "2026-10-20T10:00:00+00:00"
CLIENT_ID = "https://example.com/app"


async def registered(hass: HomeAssistant) -> AccessPolicyManager:
    manager = AccessPolicyManager(hass, runtime=lambda: None)
    await manager.async_setup()
    hass.data.setdefault(DOMAIN, {})[DATA_ACCESS_MANAGER] = manager
    await async_register_access_api(hass)
    return manager


async def member_token(hass: HomeAssistant, name: str = "Member") -> tuple[Any, str]:
    user = await hass.auth.async_create_user(name, group_ids=["system-users"])
    refresh = await hass.auth.async_create_refresh_token(user, CLIENT_ID)
    return user, hass.auth.async_create_access_token(refresh)


def policy(assignments: dict[str, Any], **overrides: Any) -> dict[str, Any]:
    data = {
        "schema": SCHEMA,
        "version": SCHEMA_VERSION,
        "revision": 2,
        "updated_at": NOW,
        "assignments": assignments,
        "audit": [],
    }
    data.update(overrides)
    return {"version": 1, "minor_version": 1, "key": STORAGE_KEY, "data": data}


async def get_self(client, **extra: Any) -> dict[str, Any]:
    await client.send_json_auto_id({"type": "domusos/access/get_self", **extra})
    return await client.receive_json()


async def test_an_administrator_without_a_policy_is_an_administrator(
    hass: HomeAssistant, hass_ws_client, hass_admin_user
) -> None:
    await registered(hass)
    client = await hass_ws_client(hass)
    reply = await get_self(client)
    assert reply["success"]
    result = reply["result"]
    assert result["principal"] == {"user_id": hass_admin_user.id, "is_admin": True, "is_owner": False}
    access = result["access"]
    assert access["role"] == "admin" and access["assigned"] is False
    assert access["state"] == "absent" and access["revision"] == 0 and access["grants"] == []
    for capability in ("access.manage", "access.control", "security.control", "ha_frontend.open"):
        assert capability in access["capabilities"]
    assert access["capabilities"] == sorted(access["capabilities"])


async def test_a_member_without_assignment_gets_the_member_role(hass: HomeAssistant, hass_ws_client) -> None:
    await registered(hass)
    _, token = await member_token(hass)
    reply = await get_self(await hass_ws_client(hass, token))
    access = reply["result"]["access"]
    assert reply["result"]["principal"]["is_admin"] is False
    assert access["role"] == "member"
    for missing in ("access.control", "security.control", "ha_frontend.open", "access.manage"):
        assert missing not in access["capabilities"]


async def test_the_account_is_the_connection_never_an_id_in_the_message(
    hass: HomeAssistant, hass_ws_client, hass_admin_user, hass_storage
) -> None:
    member, token = await member_token(hass)
    hass_storage[STORAGE_KEY] = policy(
        {member.id: {"role": "restricted", "grants": [], "assigned_at": NOW, "assigned_by": None}}
    )
    await registered(hass)
    client = await hass_ws_client(hass, token)
    for forged in ({"user_id": hass_admin_user.id}, {"role": "admin"}, {"person_id": "mario"}):
        refused = await get_self(client, **forged)
        assert not refused["success"] and refused["error"]["code"] == "invalid_format"
    reply = await get_self(client)
    assert reply["result"]["principal"]["user_id"] == member.id
    assert reply["result"]["access"]["role"] == "restricted"


async def test_linking_another_person_does_not_change_the_profile(
    hass: HomeAssistant, hass_ws_client, hass_storage
) -> None:
    member, token = await member_token(hass)
    hass_storage[STORAGE_KEY] = policy(
        {member.id: {"role": "member", "grants": ["access.control"], "assigned_at": NOW, "assigned_by": None}}
    )
    await registered(hass)
    client = await hass_ws_client(hass, token)
    before = (await get_self(client))["result"]
    hass.states.async_set("person.anna", "home", {"id": "anna", "user_id": member.id})
    hass.states.async_set("person.mario", "home", {"id": "mario", "user_id": None})
    after = (await get_self(client))["result"]
    assert after == before
    assert after["access"]["grants"] == ["access.control"]


async def test_a_corrupt_policy_gives_members_the_safe_floor_and_administrators_recovery(
    hass: HomeAssistant, hass_ws_client, hass_storage
) -> None:
    hass_storage[STORAGE_KEY] = policy({"x" * 32: {"role": "owner"}})
    await registered(hass)
    _, token = await member_token(hass)
    member = (await get_self(await hass_ws_client(hass, token)))["result"]["access"]
    assert member["state"] == "corrupt" and member["role"] == "locked"
    assert member["capabilities"] == ["dashboard.view", "profile.manage", "rooms.view"]
    admin = (await get_self(await hass_ws_client(hass)))["result"]["access"]
    assert admin["role"] == "locked"
    assert admin["capabilities"] == ["access.manage", "dashboard.view", "profile.manage", "rooms.view"]


async def test_without_the_manager_nothing_is_answered_as_allowed(hass: HomeAssistant, hass_ws_client) -> None:
    await async_register_access_api(hass)
    reply = await get_self(await hass_ws_client(hass))
    assert not reply["success"] and reply["error"]["code"] == "access_unavailable"


async def test_only_an_administrator_can_reset_the_policy(
    hass: HomeAssistant, hass_ws_client, hass_admin_user, hass_storage
) -> None:
    hass_storage[STORAGE_KEY] = policy({"x" * 32: {"role": "owner"}})
    manager = await registered(hass)
    member, _ = await member_token(hass)

    with pytest.raises(Unauthorized):
        await hass.services.async_call(
            DOMAIN, SERVICE_RESET_ACCESS_POLICY, {}, blocking=True, context=Context(user_id=member.id)
        )
    assert manager.state.value == "corrupt"

    await hass.services.async_call(
        DOMAIN, SERVICE_RESET_ACCESS_POLICY, {}, blocking=True, context=Context(user_id=hass_admin_user.id)
    )
    assert manager.state.value == "absent"
    reply = await get_self(await hass_ws_client(hass))
    assert reply["result"]["access"]["role"] == "admin"


# --- Integration lifecycle -------------------------------------------------------------


@contextmanager
def _entry_environment(hass: HomeAssistant) -> Iterator[None]:
    hass.http = SimpleNamespace(async_register_static_paths=AsyncMock())
    with ExitStack() as stack:
        stack.enter_context(patch("custom_components.domusos.Path.is_file", return_value=True))
        stack.enter_context(patch("custom_components.domusos._panel_exists", return_value=False))
        stack.enter_context(
            patch("custom_components.domusos.panel_custom.async_register_panel", new=AsyncMock())
        )
        stack.enter_context(patch.object(hass.config_entries, "async_forward_entry_setups", new=AsyncMock()))
        stack.enter_context(
            patch.object(hass.config_entries, "async_unload_platforms", new=AsyncMock(return_value=True))
        )
        for manager in (IrrigationManager, DomusCalendarStore):
            stack.enter_context(patch.object(manager, "async_setup", new=AsyncMock()))
            stack.enter_context(patch.object(manager, "async_shutdown", new=AsyncMock()))
        yield


def _entry() -> SimpleNamespace:
    return SimpleNamespace(
        entry_id="domus-entry",
        runtime_data=None,
        async_on_unload=Mock(),
        add_update_listener=Mock(return_value=Mock()),
    )


async def test_the_integration_starts_and_releases_access_control(hass: HomeAssistant, hass_storage) -> None:
    entry = _entry()
    with _entry_environment(hass):
        assert await async_setup_entry(hass, entry)
        data: DomusEntryData = entry.runtime_data
        assert isinstance(data.access_manager, AccessPolicyManager)
        assert data.access_manager.state.value == "absent"
        assert hass.data[DOMAIN][DATA_ACCESS_MANAGER] is data.access_manager
        assert await async_unload_entry(hass, entry)
    assert DATA_ACCESS_MANAGER not in hass.data.get(DOMAIN, {})
    assert STORAGE_KEY not in hass_storage


async def test_an_access_control_failure_never_blocks_the_other_modules(hass: HomeAssistant) -> None:
    entry = _entry()
    with _entry_environment(hass), patch.object(
        AccessPolicyManager, "async_setup", new=AsyncMock(side_effect=RuntimeError("boom"))
    ):
        assert await async_setup_entry(hass, entry)
        data: DomusEntryData = entry.runtime_data
        assert data.access_manager is None
        assert data.waste_collection_manager is not None
        assert await async_unload_entry(hass, entry)
