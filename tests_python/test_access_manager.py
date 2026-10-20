"""Domus access policy store: states, quarantine, revisions, writes and recovery."""

from __future__ import annotations

from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

from homeassistant.core import HomeAssistant
from homeassistant.helpers import issue_registry as ir

from custom_components.domusos.access.manager import (
    ISSUE_POLICY_UNTRUSTED,
    AccessPolicyManager,
    principal_from_user,
    set_aside_policy_files,
)
from custom_components.domusos.access.models import (
    SCHEMA,
    SCHEMA_VERSION,
    STORAGE_KEY,
    AccessDeniedError,
    InvalidAssignmentError,
    MigrationFailedError,
    RevisionConflictError,
    RoleId,
    SaveFailedError,
    StoreState,
    StoreUntrustedError,
)
from custom_components.domusos.const import DOMAIN

NOW = "2026-10-20T10:00:00+00:00"


def stored(assignments: dict[str, Any] | None = None, **overrides: Any) -> dict[str, Any]:
    data = {
        "schema": SCHEMA,
        "version": SCHEMA_VERSION,
        "revision": 5,
        "updated_at": NOW,
        "assignments": assignments or {},
        "audit": [],
    }
    data.update(overrides)
    return {"version": 1, "minor_version": 1, "key": STORAGE_KEY, "data": data}


def member_assignment(role: str = "member", grants: list[str] | None = None) -> dict[str, Any]:
    return {"role": role, "grants": grants or [], "assigned_at": NOW, "assigned_by": None}


async def loaded(hass: HomeAssistant) -> AccessPolicyManager:
    manager = AccessPolicyManager(hass, runtime=lambda: None)
    await manager.async_setup()
    return manager


async def users(hass: HomeAssistant):
    admin = await hass.auth.async_create_user("Admin", group_ids=["system-admin"])
    member = await hass.auth.async_create_user("Member", group_ids=["system-users"])
    return admin, member


def untrusted_issue(hass: HomeAssistant):
    return ir.async_get(hass).async_get_issue(DOMAIN, ISSUE_POLICY_UNTRUSTED)


# --- Loading -------------------------------------------------------------------------


async def test_no_store_means_defaults_and_nothing_is_written(hass: HomeAssistant, hass_storage) -> None:
    manager = await loaded(hass)
    admin, member = await users(hass)
    assert manager.state is StoreState.ABSENT and manager.revision == 0
    assert manager.profile_for(admin).role is RoleId.ADMIN
    assert manager.profile_for(member).role is RoleId.MEMBER
    assert STORAGE_KEY not in hass_storage
    assert untrusted_issue(hass) is None


async def test_a_valid_store_applies_assignments_and_grants(hass: HomeAssistant, hass_storage) -> None:
    admin, member = await users(hass)
    hass_storage[STORAGE_KEY] = stored({member.id: member_assignment("member", ["security.control"])})
    manager = await loaded(hass)
    assert manager.state is StoreState.READY and manager.revision == 5
    profile = manager.profile_for(member)
    assert profile.has("security.control") and not profile.has("access.control")
    assert manager.profile_for(admin).role is RoleId.ADMIN


@pytest.mark.parametrize(
    "data",
    [
        {"schema": SCHEMA, "version": 1},
        {"policies": []},
        "not a policy",
    ],
)
async def test_an_invalid_store_is_corrupt_kept_and_reported(hass: HomeAssistant, hass_storage, data) -> None:
    hass_storage[STORAGE_KEY] = {"version": 1, "minor_version": 1, "key": STORAGE_KEY, "data": data}
    manager = await loaded(hass)
    _, member = await users(hass)
    assert manager.state is StoreState.CORRUPT
    assert manager.profile_for(member).role is RoleId.LOCKED
    assert hass_storage[STORAGE_KEY]["data"] == data
    assert untrusted_issue(hass) is not None


async def test_a_store_granting_access_management_is_corrupt_and_nobody_gains_it(hass: HomeAssistant, hass_storage) -> None:
    _, member = await users(hass)
    hass_storage[STORAGE_KEY] = stored({member.id: member_assignment("member", ["access.manage"])})
    manager = await loaded(hass)
    assert manager.state is StoreState.CORRUPT
    assert not manager.profile_for(member).has("access.manage")


async def test_an_unknown_role_or_capability_is_corrupt_never_member(hass: HomeAssistant, hass_storage) -> None:
    _, member = await users(hass)
    for broken in (member_assignment("owner"), member_assignment("member", ["doors.open"])):
        hass_storage[STORAGE_KEY] = stored({member.id: broken})
        manager = await loaded(hass)
        assert manager.state is StoreState.CORRUPT
        assert manager.profile_for(member).role is RoleId.LOCKED


async def test_a_newer_schema_is_unsupported_and_left_untouched(hass: HomeAssistant, hass_storage) -> None:
    hass_storage[STORAGE_KEY] = stored(version=SCHEMA_VERSION + 1)
    manager = await loaded(hass)
    assert manager.state is StoreState.UNSUPPORTED
    assert hass_storage[STORAGE_KEY]["data"]["version"] == SCHEMA_VERSION + 1


async def test_a_newer_home_assistant_envelope_is_unsupported(hass: HomeAssistant) -> None:
    manager = AccessPolicyManager(hass, runtime=lambda: None)
    manager.store.async_load = AsyncMock(side_effect=NotImplementedError)
    await manager.async_setup()
    assert manager.state is StoreState.UNSUPPORTED


async def test_a_failed_migration_keeps_the_original(hass: HomeAssistant, hass_storage) -> None:
    hass_storage[STORAGE_KEY] = stored()
    original = dict(hass_storage[STORAGE_KEY]["data"])
    with patch(
        "custom_components.domusos.access.manager.parse_stored_document",
        side_effect=MigrationFailedError("boom"),
    ):
        manager = await loaded(hass)
    assert manager.state is StoreState.MIGRATION_FAILED
    assert hass_storage[STORAGE_KEY]["data"] == original


async def test_a_store_home_assistant_set_aside_is_corrupt(hass: HomeAssistant, hass_storage) -> None:
    manager = AccessPolicyManager(hass, runtime=lambda: None)
    with patch.object(manager, "_async_quarantined_files", AsyncMock(return_value=True)):
        await manager.async_setup()
    assert manager.state is StoreState.CORRUPT


async def test_a_store_that_cannot_be_read_is_corrupt(hass: HomeAssistant) -> None:
    manager = AccessPolicyManager(hass, runtime=lambda: None)
    manager.store.async_load = AsyncMock(side_effect=OSError("disk"))
    await manager.async_setup()
    assert manager.state is StoreState.CORRUPT


# --- Changing ------------------------------------------------------------------------


async def test_the_first_assignment_creates_the_store_at_revision_one(hass: HomeAssistant, hass_storage) -> None:
    manager = await loaded(hass)
    admin, member = await users(hass)
    revision = await manager.async_assign(admin, member.id, "member", ["security.control", "access.control"], 0)
    assert revision == 1 and manager.state is StoreState.READY
    data = hass_storage[STORAGE_KEY]["data"]
    assert data["assignments"][member.id]["grants"] == ["access.control", "security.control"]
    assert data["assignments"][member.id]["assigned_by"] == admin.id
    assert "Member" not in str(data) and "Admin" not in str(data)
    assert [record["event"] for record in data["audit"]] == ["assignment_changed"]


async def test_concurrent_writers_never_overwrite_each_other(hass: HomeAssistant, hass_storage) -> None:
    admin, member = await users(hass)
    hass_storage[STORAGE_KEY] = stored()
    manager = await loaded(hass)
    assert await manager.async_assign(admin, member.id, "restricted", [], 5) == 6
    with pytest.raises(RevisionConflictError):
        await manager.async_assign(admin, member.id, "wall_panel", [], 5)
    assert manager.profile_for(member).role is RoleId.RESTRICTED
    assert hass_storage[STORAGE_KEY]["data"]["revision"] == 6


async def test_the_same_assignment_again_is_not_a_new_revision(hass: HomeAssistant, hass_storage) -> None:
    manager = await loaded(hass)
    admin, member = await users(hass)
    await manager.async_assign(admin, member.id, "member", ["access.control"], 0)
    assert await manager.async_assign(admin, member.id, "member", ["access.control"], 1) == 1


async def test_removing_an_assignment_returns_the_account_to_its_default(hass: HomeAssistant, hass_storage) -> None:
    manager = await loaded(hass)
    admin, member = await users(hass)
    await manager.async_assign(admin, member.id, "restricted", [], 0)
    assert await manager.async_unassign(admin, member.id, 1) == 2
    assert manager.profile_for(member).role is RoleId.MEMBER


@pytest.mark.parametrize(
    ("role", "grants"),
    [("locked", []), ("owner", []), ("member", ["access.manage"]), ("member", ["energy.view"]), ("member", ["x.y", "x.y"])],
)
async def test_an_assignment_the_policy_cannot_hold_is_refused(hass: HomeAssistant, hass_storage, role, grants) -> None:
    manager = await loaded(hass)
    admin, member = await users(hass)
    with pytest.raises(InvalidAssignmentError):
        await manager.async_assign(admin, member.id, role, grants, 0)
    assert STORAGE_KEY not in hass_storage


async def test_only_home_assistant_administrators_change_the_policy(hass: HomeAssistant, hass_storage) -> None:
    manager = await loaded(hass)
    _, member = await users(hass)
    with pytest.raises(AccessDeniedError):
        await manager.async_assign(member, member.id, "admin", [], 0)
    with pytest.raises(AccessDeniedError):
        await manager.async_assign(None, member.id, "member", [], 0)


async def test_an_untrusted_policy_is_never_changed(hass: HomeAssistant, hass_storage) -> None:
    hass_storage[STORAGE_KEY] = stored(version=SCHEMA_VERSION + 1)
    manager = await loaded(hass)
    admin, member = await users(hass)
    with pytest.raises(StoreUntrustedError):
        await manager.async_assign(admin, member.id, "member", [], 0)
    assert hass_storage[STORAGE_KEY]["data"]["version"] == SCHEMA_VERSION + 1


async def test_a_failed_write_changes_nothing(hass: HomeAssistant, hass_storage) -> None:
    manager = await loaded(hass)
    admin, member = await users(hass)
    manager.store.async_save = AsyncMock(side_effect=OSError("disk full"))
    with pytest.raises(SaveFailedError):
        await manager.async_assign(admin, member.id, "restricted", [], 0)
    assert manager.state is StoreState.ABSENT and manager.revision == 0
    assert manager.profile_for(member).role is RoleId.MEMBER


async def test_a_demotion_in_home_assistant_applies_at_the_next_request(hass: HomeAssistant, hass_storage) -> None:
    manager = await loaded(hass)
    admin, _ = await users(hass)
    assert manager.profile_for(admin).has("access.manage")
    await hass.auth.async_update_user(admin, group_ids=["system-users"])
    demoted = manager.profile_for(admin)
    assert demoted.role is RoleId.MEMBER and not demoted.has("access.manage")
    assert manager.revision == 0


async def test_system_and_disabled_accounts_have_no_profile(hass: HomeAssistant, hass_storage) -> None:
    manager = await loaded(hass)
    system = await hass.auth.async_create_system_user("Supervisor", group_ids=["system-admin"])
    disabled = await hass.auth.async_create_user("Ex", group_ids=["system-users"])
    await hass.auth.async_deactivate_user(disabled)
    for user in (system, disabled, None):
        with pytest.raises(AccessDeniedError):
            manager.profile_for(user)
        with pytest.raises(AccessDeniedError):
            principal_from_user(user)


async def test_orphaned_assignments_are_reported_and_kept(hass: HomeAssistant, hass_storage) -> None:
    _, member = await users(hass)
    hass_storage[STORAGE_KEY] = stored({member.id: member_assignment(), "f" * 32: member_assignment("restricted")})
    manager = await loaded(hass)
    assert manager.orphaned_assignments([member.id]) == ["f" * 32]
    assert manager.state is StoreState.READY


# --- Recovery ------------------------------------------------------------------------


async def test_a_reset_returns_everyone_to_defaults_and_keeps_the_old_policy_aside(
    hass: HomeAssistant, hass_storage
) -> None:
    admin, member = await users(hass)
    hass_storage[STORAGE_KEY] = stored({"x"[0] * 32: member_assignment("owner")})
    manager = await loaded(hass)
    assert manager.state is StoreState.CORRUPT and untrusted_issue(hass) is not None
    with patch(
        "custom_components.domusos.access.manager.set_aside_policy_files",
        return_value=["domusos.access.v1.reset.stamp"],
    ) as set_aside:
        result = await manager.async_reset(admin.id)
    set_aside.assert_called_once()
    assert result == {
        "state": "absent",
        "previous_state": "corrupt",
        "previous_revision": None,
        "kept": ["domusos.access.v1.reset.stamp"],
    }
    assert manager.state is StoreState.ABSENT and manager.revision == 0
    assert manager.profile_for(admin).role is RoleId.ADMIN
    assert manager.profile_for(member).role is RoleId.MEMBER
    assert STORAGE_KEY not in hass_storage
    assert untrusted_issue(hass) is None


def test_setting_aside_moves_the_store_and_quarantined_copies_and_deletes_nothing(tmp_path: Path) -> None:
    store = tmp_path / "domusos.access.v1"
    store.write_text('{"policy": 1}', encoding="utf-8")
    # Home Assistant names it with a timestamp; any suffix is moved the same way.
    quarantined = tmp_path / "domusos.access.v1.corrupt.2026-10-20T10-00-00"
    quarantined.write_text("{broken", encoding="utf-8")
    other = tmp_path / "domusos.device_power.v1"
    other.write_text("{}", encoding="utf-8")

    moved = set_aside_policy_files(str(store), "STAMP")

    assert moved == [
        "domusos.access.v1.reset.STAMP",
        "domusos.access.v1.reset.STAMP.corrupt-2026-10-20T10-00-00",
    ]
    assert not store.exists() and not quarantined.exists() and other.exists()
    assert (tmp_path / moved[0]).read_text(encoding="utf-8") == '{"policy": 1}'
    assert (tmp_path / moved[1]).read_text(encoding="utf-8") == "{broken"
    assert set_aside_policy_files(str(store), "AGAIN") == []
