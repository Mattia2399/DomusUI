"""People and access through the real Home Assistant stack: administrators only, the connection decides."""

from __future__ import annotations

from typing import Any
from unittest.mock import patch

import pytest

from homeassistant.core import HomeAssistant

from custom_components.domusos.access import DATA_ACCESS_MANAGER, AccessPolicyManager
from custom_components.domusos.access.api import async_register_access_api
from custom_components.domusos.access.models import SCHEMA, SCHEMA_VERSION, STORAGE_KEY
from custom_components.domusos.const import DOMAIN

NOW = "2026-10-22T10:00:00+00:00"
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


def policy(assignments: dict[str, Any], revision: int = 2) -> dict[str, Any]:
    return {
        "version": 1,
        "minor_version": 1,
        "key": STORAGE_KEY,
        "data": {
            "schema": SCHEMA,
            "version": SCHEMA_VERSION,
            "revision": revision,
            "updated_at": NOW,
            "assignments": assignments,
            "audit": [],
        },
    }


async def ask(client, message: dict[str, Any]) -> dict[str, Any]:
    await client.send_json_auto_id(message)
    return await client.receive_json()


def by_id(reply: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {account["user_id"]: account for account in reply["result"]["accounts"]}


async def test_an_administrator_lists_household_accounts_with_their_default_roles(
    hass: HomeAssistant, hass_ws_client, hass_admin_user
) -> None:
    await registered(hass)
    member, _ = await member_token(hass, "Mario")
    disabled = await hass.auth.async_create_user("Ex", group_ids=["system-users"])
    await hass.auth.async_deactivate_user(disabled)
    system = await hass.auth.async_create_system_user("Supervisor", group_ids=["system-admin"])
    reply = await ask(await hass_ws_client(hass), {"type": "domusos/access/list_accounts"})
    assert reply["success"]
    assert (reply["result"]["state"], reply["result"]["revision"]) == ("absent", 0)
    accounts = by_id(reply)
    assert system.id not in accounts
    assert accounts[hass_admin_user.id]["role"] == "admin" and accounts[hass_admin_user.id]["assigned"] is False
    assert accounts[member.id] == {
        "user_id": member.id,
        "name": "Mario",
        "is_admin": False,
        "is_owner": False,
        "is_active": True,
        "manageable": True,
        "role": "member",
        "assigned": False,
        "grants": [],
    }
    assert accounts[disabled.id]["manageable"] is False and accounts[disabled.id]["is_active"] is False


async def test_a_member_can_neither_read_nor_change_the_policy(hass: HomeAssistant, hass_ws_client, hass_storage) -> None:
    member, token = await member_token(hass)
    hass_storage[STORAGE_KEY] = policy({member.id: {"role": "restricted", "grants": [], "assigned_at": NOW, "assigned_by": None}})
    manager = await registered(hass)
    stored = dict(hass_storage[STORAGE_KEY]["data"])
    client = await hass_ws_client(hass, token)
    for message in (
        {"type": "domusos/access/list_accounts"},
        {"type": "domusos/access/set_assignment", "user_id": member.id, "role": "admin", "grants": [], "expected_revision": 2},
        {"type": "domusos/access/remove_assignment", "user_id": member.id, "expected_revision": 2},
    ):
        reply = await ask(client, message)
        assert not reply["success"] and reply["error"]["code"] == "unauthorized", message["type"]
    assert manager.revision == 2 and hass_storage[STORAGE_KEY]["data"] == stored


async def test_a_system_account_is_no_administrator_of_domus_access(hass: HomeAssistant, hass_ws_client) -> None:
    await registered(hass)
    system = await hass.auth.async_create_system_user("Supervisor", group_ids=["system-admin"])
    refresh = await hass.auth.async_create_refresh_token(system)
    client = await hass_ws_client(hass, hass.auth.async_create_access_token(refresh))
    reply = await ask(client, {"type": "domusos/access/list_accounts"})
    assert not reply["success"] and reply["error"]["code"] in {"access_denied", "unauthorized"}


async def test_an_administrator_gives_a_member_a_personal_grant_that_reaches_the_member(
    hass: HomeAssistant, hass_ws_client, hass_admin_user, hass_storage
) -> None:
    manager = await registered(hass)
    member, token = await member_token(hass, "Mario")
    admin = await hass_ws_client(hass)
    reply = await ask(
        admin,
        {
            "type": "domusos/access/set_assignment",
            "user_id": member.id,
            "role": "member",
            "grants": ["security.control", "access.control", "access.control"],
            "expected_revision": 0,
        },
    )
    assert reply["success"], reply
    assert (reply["result"]["state"], reply["result"]["revision"]) == ("ready", 1)
    assert reply["result"]["account"]["grants"] == ["access.control", "security.control"]
    assert reply["result"]["account"]["assigned"] is True
    stored = hass_storage[STORAGE_KEY]["data"]["assignments"][member.id]
    # Who and when are the server's.
    assert stored["assigned_by"] == hass_admin_user.id and stored["assigned_at"]
    profile = (await ask(await hass_ws_client(hass, token), {"type": "domusos/access/get_self"}))["result"]["access"]
    assert {"access.control", "security.control"} <= set(profile["capabilities"])
    assert manager.revision == 1


async def test_who_acts_and_what_they_hold_cannot_be_sent(hass: HomeAssistant, hass_ws_client, hass_storage) -> None:
    manager = await registered(hass)
    member, _ = await member_token(hass)
    admin = await hass_ws_client(hass)
    for extra in ({"assigned_by": "x" * 32}, {"assigned_at": NOW}, {"is_admin": True}, {"capabilities": ["access.manage"]}, {"policy_state": "ready"}):
        reply = await ask(
            admin,
            {"type": "domusos/access/set_assignment", "user_id": member.id, "role": "member", "grants": [], "expected_revision": 0, **extra},
        )
        assert not reply["success"] and reply["error"]["code"] == "invalid_format", extra
    assert manager.revision == 0 and STORAGE_KEY not in hass_storage


async def test_a_stale_revision_never_overwrites(hass: HomeAssistant, hass_ws_client, hass_storage) -> None:
    member, _ = await member_token(hass)
    hass_storage[STORAGE_KEY] = policy({}, revision=3)
    manager = await registered(hass)
    admin = await hass_ws_client(hass)
    first = await ask(
        admin,
        {"type": "domusos/access/set_assignment", "user_id": member.id, "role": "restricted", "grants": [], "expected_revision": 3},
    )
    assert first["success"] and first["result"]["revision"] == 4
    stored = dict(hass_storage[STORAGE_KEY]["data"])
    stale = await ask(
        admin,
        {"type": "domusos/access/set_assignment", "user_id": member.id, "role": "member", "grants": ["access.control"], "expected_revision": 3},
    )
    assert not stale["success"] and stale["error"]["code"] == "revision_conflict"
    assert manager.revision == 4 and hass_storage[STORAGE_KEY]["data"] == stored


async def test_refuses_unknown_disabled_and_system_accounts_and_anything_not_grantable(
    hass: HomeAssistant, hass_ws_client
) -> None:
    manager = await registered(hass)
    member, _ = await member_token(hass)
    disabled = await hass.auth.async_create_user("Ex", group_ids=["system-users"])
    await hass.auth.async_deactivate_user(disabled)
    system = await hass.auth.async_create_system_user("Supervisor", group_ids=["system-admin"])
    admin = await hass_ws_client(hass)

    async def set_(user_id: str, role: str = "member", grants: list[str] | None = None) -> dict[str, Any]:
        return await ask(
            admin,
            {"type": "domusos/access/set_assignment", "user_id": user_id, "role": role, "grants": grants or [], "expected_revision": 0},
        )

    assert (await set_("f" * 32))["error"]["code"] == "unknown_account"
    assert (await set_(disabled.id))["error"]["code"] == "account_not_manageable"
    assert (await set_(system.id))["error"]["code"] == "account_not_manageable"
    assert (await set_(member.id, role="locked"))["error"]["code"] == "invalid_assignment"
    assert (await set_(member.id, role="owner"))["error"]["code"] == "invalid_assignment"
    assert (await set_(member.id, grants=["access.manage"]))["error"]["code"] == "invalid_assignment"
    assert (await set_(member.id, grants=["energy.manage"]))["error"]["code"] == "invalid_assignment"
    assert manager.revision == 0


async def test_an_administrator_role_keeps_no_redundant_grant(hass: HomeAssistant, hass_ws_client, hass_storage) -> None:
    await registered(hass)
    # Only a Home Assistant administrator can hold the Administrator role (Q24).
    other = await hass.auth.async_create_user("Second admin", group_ids=["system-admin"])
    reply = await ask(
        await hass_ws_client(hass),
        {"type": "domusos/access/set_assignment", "user_id": other.id, "role": "admin", "grants": ["access.control"], "expected_revision": 0},
    )
    assert reply["success"] and reply["result"]["account"]["grants"] == []
    assert hass_storage[STORAGE_KEY]["data"]["assignments"][other.id]["grants"] == []


async def test_removing_the_assignment_returns_to_the_default_role(hass: HomeAssistant, hass_ws_client, hass_storage) -> None:
    member, _ = await member_token(hass)
    orphan = "e" * 32
    hass_storage[STORAGE_KEY] = policy(
        {
            member.id: {"role": "restricted", "grants": ["access.control"], "assigned_at": NOW, "assigned_by": None},
            orphan: {"role": "member", "grants": [], "assigned_at": NOW, "assigned_by": None},
        }
    )
    manager = await registered(hass)
    admin = await hass_ws_client(hass)
    reply = await ask(admin, {"type": "domusos/access/remove_assignment", "user_id": member.id, "expected_revision": 2})
    assert reply["success"] and reply["result"]["revision"] == 3
    assert (reply["result"]["account"]["role"], reply["result"]["account"]["assigned"]) == ("member", False)
    # An assignment left by an account Home Assistant no longer has can be cleaned up.
    cleaned = await ask(admin, {"type": "domusos/access/remove_assignment", "user_id": orphan, "expected_revision": 3})
    assert cleaned["success"] and cleaned["result"]["account"] is None
    assert hass_storage[STORAGE_KEY]["data"]["assignments"] == {} and manager.revision == 4
    # Removing what does not exist for an unknown account is refused.
    unknown = await ask(admin, {"type": "domusos/access/remove_assignment", "user_id": "f" * 32, "expected_revision": 4})
    assert unknown["error"]["code"] == "unknown_account"


async def test_an_untrusted_policy_lists_the_safe_floor_refuses_changes_and_recovers(
    hass: HomeAssistant, hass_ws_client, hass_storage
) -> None:
    member, _ = await member_token(hass)
    hass_storage[STORAGE_KEY] = policy({"x" * 32: {"role": "owner"}})
    manager = await registered(hass)
    admin = await hass_ws_client(hass)
    listed = await ask(admin, {"type": "domusos/access/list_accounts"})
    assert listed["success"] and listed["result"]["state"] == "corrupt"
    assert all(account["role"] == "locked" and not account["manageable"] for account in listed["result"]["accounts"])
    refused = await ask(
        admin,
        {"type": "domusos/access/set_assignment", "user_id": member.id, "role": "member", "grants": [], "expected_revision": 0},
    )
    assert refused["error"]["code"] == "access_store_untrusted"
    with patch("custom_components.domusos.access.manager.set_aside_policy_files", return_value=["kept"]):
        recovered = await ask(admin, {"type": "domusos/access/reset_policy"})
    assert recovered["success"] and manager.state.value == "absent"
    after = by_id(await ask(admin, {"type": "domusos/access/list_accounts"}))
    assert (after[member.id]["role"], after[member.id]["manageable"]) == ("member", True)


async def test_an_administrator_who_changes_their_own_role_keeps_managing_access(
    hass: HomeAssistant, hass_ws_client, hass_admin_user
) -> None:
    await registered(hass)
    admin = await hass_ws_client(hass)
    reply = await ask(
        admin,
        {"type": "domusos/access/set_assignment", "user_id": hass_admin_user.id, "role": "member", "grants": [], "expected_revision": 0},
    )
    assert reply["success"] and reply["result"]["account"]["role"] == "member"
    profile = (await ask(admin, {"type": "domusos/access/get_self"}))["result"]["access"]
    assert profile["role"] == "member" and "access.manage" in profile["capabilities"]
    assert (await ask(admin, {"type": "domusos/access/list_accounts"}))["success"]


async def test_a_person_lends_its_name_never_its_identity(hass: HomeAssistant, hass_ws_client) -> None:
    await registered(hass)
    member, _ = await member_token(hass, "mario.login")
    hass.states.async_set("person.mario", "home", {"friendly_name": "Mario Rossi", "user_id": member.id})
    accounts = by_id(await ask(await hass_ws_client(hass), {"type": "domusos/access/list_accounts"}))
    assert accounts[member.id]["name"] == "Mario Rossi" and accounts[member.id]["user_id"] == member.id


async def test_every_field_is_required_and_nothing_else_is_accepted(hass: HomeAssistant, hass_ws_client, hass_storage) -> None:
    manager = await registered(hass)
    member, _ = await member_token(hass)
    admin = await hass_ws_client(hass)
    complete = {"type": "domusos/access/set_assignment", "user_id": member.id, "role": "member", "grants": [], "expected_revision": 0}
    for field in ("user_id", "role", "grants", "expected_revision"):
        partial = {key: value for key, value in complete.items() if key != field}
        reply = await ask(admin, partial)
        assert not reply["success"] and reply["error"]["code"] == "invalid_format", field
    for message in (
        {"type": "domusos/access/remove_assignment", "user_id": member.id},
        {"type": "domusos/access/remove_assignment", "expected_revision": 0},
        {"type": "domusos/access/remove_assignment", "user_id": member.id, "expected_revision": 0, "assigned_by": "x" * 32},
        {"type": "domusos/access/list_accounts", "user_id": member.id},
        {**complete, "expected_revision": "0"},
        {**complete, "grants": "access.control"},
    ):
        reply = await ask(admin, message)
        assert not reply["success"] and reply["error"]["code"] == "invalid_format", message
    assert manager.revision == 0 and STORAGE_KEY not in hass_storage


@pytest.mark.parametrize("role", ["restricted", "wall_panel"])
async def test_limited_and_panel_accounts_can_hold_personal_grants(
    hass: HomeAssistant, hass_ws_client, hass_storage, role: str
) -> None:
    await registered(hass)
    member, token = await member_token(hass)
    reply = await ask(
        await hass_ws_client(hass),
        {
            "type": "domusos/access/set_assignment",
            "user_id": member.id,
            "role": role,
            "grants": ["access.control", "security.control"],
            "expected_revision": 0,
        },
    )
    assert reply["success"] and reply["result"]["account"]["grants"] == ["access.control", "security.control"]
    assert hass_storage[STORAGE_KEY]["data"]["assignments"][member.id]["role"] == role
    profile = (await ask(await hass_ws_client(hass, token), {"type": "domusos/access/get_self"}))["result"]["access"]
    assert profile["role"] == role
    assert {"access.control", "security.control"} <= set(profile["capabilities"])
    assert "access.manage" not in profile["capabilities"]


async def test_a_disabled_administrator_cannot_even_reach_people_and_access(hass: HomeAssistant, hass_ws_client) -> None:
    await registered(hass)
    former = await hass.auth.async_create_user("Former admin", group_ids=["system-admin"])
    token = hass.auth.async_create_access_token(await hass.auth.async_create_refresh_token(former, CLIENT_ID))
    await hass.auth.async_deactivate_user(former)
    # Home Assistant drops the account's sessions and refuses its token; Domus never sees it as an actor.
    with pytest.raises(AssertionError):
        await hass_ws_client(hass, token)


# --- Resident and the Administrator role (Q23, Q24) -------------------------------------


async def test_the_administrator_role_is_refused_for_a_non_administrator_and_nothing_changes(
    hass: HomeAssistant, hass_ws_client, hass_storage
) -> None:
    manager = await registered(hass)
    member, _ = await member_token(hass)
    admin = await hass_ws_client(hass)
    reply = await ask(
        admin,
        {"type": "domusos/access/set_assignment", "user_id": member.id, "role": "admin", "grants": [], "expected_revision": 0},
    )
    assert not reply["success"] and reply["error"]["code"] == "role_requires_ha_admin"
    assert manager.revision == 0 and STORAGE_KEY not in hass_storage and manager.assignments == {}


async def test_a_home_assistant_administrator_can_be_given_the_administrator_role(
    hass: HomeAssistant, hass_ws_client, hass_storage
) -> None:
    await registered(hass)
    other = await hass.auth.async_create_user("Second admin", group_ids=["system-admin"])
    admin = await hass_ws_client(hass)
    to_resident = await ask(
        admin,
        {"type": "domusos/access/set_assignment", "user_id": other.id, "role": "resident", "grants": [], "expected_revision": 0},
    )
    assert to_resident["success"] and to_resident["result"]["account"]["role"] == "resident"
    back = await ask(
        admin,
        {"type": "domusos/access/set_assignment", "user_id": other.id, "role": "admin", "grants": [], "expected_revision": 1},
    )
    assert back["success"] and back["result"]["account"]["role"] == "admin"
    assert hass_storage[STORAGE_KEY]["data"]["assignments"][other.id]["role"] == "admin"


async def test_a_resident_has_the_whole_house_and_no_administration(hass: HomeAssistant, hass_ws_client, hass_storage) -> None:
    manager = await registered(hass)
    member, token = await member_token(hass)
    admin = await hass_ws_client(hass)
    reply = await ask(
        admin,
        {
            "type": "domusos/access/set_assignment",
            "user_id": member.id,
            "role": "resident",
            "grants": ["access.control", "security.control"],
            "expected_revision": 0,
        },
    )
    assert reply["success"] and reply["result"]["account"]["role"] == "resident"
    # The role already holds both grants: nothing redundant is stored.
    stored = hass_storage[STORAGE_KEY]["data"]["assignments"][member.id]
    assert (stored["role"], stored["grants"]) == ("resident", [])
    profile = (await ask(await hass_ws_client(hass, token), {"type": "domusos/access/get_self"}))["result"]["access"]
    assert profile["role"] == "resident"
    assert {"access.control", "security.control", "irrigation.control"} <= set(profile["capabilities"])
    assert not {"access.manage", "device_power.manage", "people.manage", "system.manage"} & set(profile["capabilities"])
    assert manager.revision == 1


async def test_roles_change_both_ways_and_the_administrator_role_stays_closed(
    hass: HomeAssistant, hass_ws_client, hass_storage
) -> None:
    manager = await registered(hass)
    member, _ = await member_token(hass)
    admin = await hass_ws_client(hass)
    for role in ("resident", "member", "resident", "restricted", "resident", "wall_panel", "resident"):
        reply = await ask(
            admin,
            {"type": "domusos/access/set_assignment", "user_id": member.id, "role": role, "grants": [], "expected_revision": manager.revision},
        )
        assert reply["success"] and reply["result"]["account"]["role"] == role, role
    revision = manager.revision
    refused = await ask(
        admin,
        {"type": "domusos/access/set_assignment", "user_id": member.id, "role": "admin", "grants": [], "expected_revision": revision},
    )
    assert refused["error"]["code"] == "role_requires_ha_admin" and manager.revision == revision
    assert hass_storage[STORAGE_KEY]["data"]["assignments"][member.id]["role"] == "resident"
    # Removing the assignment returns to the default Member, never Resident.
    removed = await ask(admin, {"type": "domusos/access/remove_assignment", "user_id": member.id, "expected_revision": revision})
    assert removed["result"]["account"]["role"] == "member"


async def test_a_legacy_administrator_role_on_a_non_administrator_is_kept_and_never_more_than_home_assistant_allows(
    hass: HomeAssistant, hass_ws_client, hass_storage
) -> None:
    member, token = await member_token(hass)
    hass_storage[STORAGE_KEY] = policy({member.id: {"role": "admin", "grants": [], "assigned_at": NOW, "assigned_by": None}})
    manager = await registered(hass)
    assert manager.state.value == "ready"
    admin = await hass_ws_client(hass)
    accounts = by_id(await ask(admin, {"type": "domusos/access/list_accounts"}))
    assert (accounts[member.id]["role"], accounts[member.id]["is_admin"], accounts[member.id]["assigned"]) == ("admin", False, True)
    profile = (await ask(await hass_ws_client(hass, token), {"type": "domusos/access/get_self"}))["result"]["access"]
    assert profile["role"] == "admin"
    assert not {"access.manage", "device_power.manage", "system.manage", "people.manage"} & set(profile["capabilities"])
    again = await ask(
        admin,
        {"type": "domusos/access/set_assignment", "user_id": member.id, "role": "admin", "grants": [], "expected_revision": 2},
    )
    assert again["error"]["code"] == "role_requires_ha_admin" and manager.revision == 2
    resident = await ask(
        admin,
        {"type": "domusos/access/set_assignment", "user_id": member.id, "role": "resident", "grants": [], "expected_revision": 2},
    )
    assert resident["success"] and resident["result"]["account"]["role"] == "resident"
