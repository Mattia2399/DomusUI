"""Domus Access Control model: registry, roles, stored policy and resolution, without Home Assistant.

The model is plain Python, so it is loaded from its file: these tests run
anywhere the backend runs, and on machines without Home Assistant installed.
"""

from __future__ import annotations

import ast
import importlib.util
from pathlib import Path
import re
import sys

import pytest

_MODELS_PATH = Path(__file__).resolve().parents[1] / "custom_components" / "domusos" / "access" / "models.py"
_spec = importlib.util.spec_from_file_location("domus_access_models", _MODELS_PATH)
models = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = models
_spec.loader.exec_module(models)

RoleId = models.RoleId
StoreState = models.StoreState
NOW = "2026-10-20T10:00:00+00:00"
ADMIN = models.Principal(user_id="a" * 32, is_admin=True, is_owner=True)
MEMBER = models.Principal(user_id="b" * 32, is_admin=False)


def profile(principal, state=StoreState.ABSENT, policy=None):
    return models.resolve_access_profile(principal, state, policy)


def assignment(role="member", grants=()):
    return {"role": role, "grants": list(grants), "assigned_at": NOW, "assigned_by": ADMIN.user_id}


def document(assignments=None, **overrides):
    payload = {
        "schema": models.SCHEMA,
        "version": models.SCHEMA_VERSION,
        "revision": 3,
        "updated_at": NOW,
        "assignments": assignments if assignments is not None else {},
        "audit": [],
    }
    payload.update(overrides)
    return payload


def ready(assignments):
    return StoreState.READY, models.parse_stored_document(document(assignments))


# --- Registry ------------------------------------------------------------------------


def test_every_capability_follows_the_naming_convention_and_has_valid_metadata() -> None:
    registry = models.ACCESS_CAPABILITIES
    assert len(registry) == 34
    for capability_id, entry in registry.items():
        assert capability_id == entry.id
        assert re.fullmatch(r"[a-z][a-z_]*\.[a-z][a-z_]*", capability_id)
        assert entry.domain and entry.action and f"{entry.domain}.{entry.action}" == capability_id
        assert isinstance(entry.risk, models.Risk)
        assert isinstance(entry.enforcement, models.EnforcementKind)
        assert isinstance(entry.requires_ha_admin, bool) and isinstance(entry.user_grantable, bool)
        assert entry.description


def test_only_locks_and_alarm_can_be_granted_and_never_what_home_assistant_keeps_to_administrators() -> None:
    grantable = {entry.id for entry in models.ACCESS_CAPABILITIES.values() if entry.user_grantable}
    assert grantable == {"access.control", "security.control"}
    for entry in models.ACCESS_CAPABILITIES.values():
        if entry.user_grantable:
            assert not entry.requires_ha_admin and entry.risk is not models.Risk.CRITICAL
    for capability_id in (
        "access.manage",
        "system.manage",
        "backup.restore",
        "ha.restart",
        "people.manage",
        "device_power.manage",
        "automations.manage",
    ):
        assert models.ACCESS_CAPABILITIES[capability_id].user_grantable is False
        assert models.ACCESS_CAPABILITIES[capability_id].requires_ha_admin is True


def test_physical_access_and_the_alarm_are_two_capabilities() -> None:
    access = models.ACCESS_CAPABILITIES["access.control"]
    alarm = models.ACCESS_CAPABILITIES["security.control"]
    assert access.id != alarm.id
    assert "gates" in access.description and "locks" in access.description
    assert "alarm" in alarm.description and "gates" not in alarm.description
    assert access.risk is alarm.risk is models.Risk.HIGH


def test_back_to_home_assistant_is_a_ux_capability_only() -> None:
    entry = models.ACCESS_CAPABILITIES["ha_frontend.open"]
    assert entry.enforcement is models.EnforcementKind.LOCAL
    assert entry.requires_ha_admin is False and entry.user_grantable is False


def test_access_management_is_critical_needs_an_administrator_and_is_never_granted() -> None:
    entry = models.ACCESS_CAPABILITIES["access.manage"]
    assert entry.risk is models.Risk.CRITICAL
    assert entry.requires_ha_admin and not entry.user_grantable
    assert entry.enforcement is models.EnforcementKind.DOMUS


def test_access_capabilities_are_not_device_capabilities() -> None:
    assert models.capability("light.brightness") is None
    assert models.capability(42) is None
    assert models.capability("energy.view") is models.ACCESS_CAPABILITIES["energy.view"]


# --- Roles ---------------------------------------------------------------------------

ROLE_MATRIX = {
    # capability: (admin, resident, member, restricted, wall_panel)
    "dashboard.view": (1, 1, 1, 1, 1),
    "dashboard.edit": (1, 0, 0, 0, 0),
    "dashboard.reset": (1, 0, 0, 0, 0),
    "rooms.view": (1, 1, 1, 1, 1),
    "devices.control": (1, 1, 1, 1, 1),
    "access.control": (1, 1, 0, 0, 0),
    "security.view": (1, 1, 1, 0, 1),
    "security.control": (1, 1, 0, 0, 0),
    "security.manage": (1, 0, 0, 0, 0),
    "automations.view": (1, 1, 1, 0, 0),
    "automations.run": (1, 1, 1, 0, 1),
    "automations.manage": (1, 0, 0, 0, 0),
    "energy.view": (1, 1, 1, 0, 1),
    "energy.manage": (1, 0, 0, 0, 0),
    "irrigation.view": (1, 1, 1, 1, 1),
    "irrigation.control": (1, 1, 1, 0, 0),
    "irrigation.manage": (1, 0, 0, 0, 0),
    "waste.view": (1, 1, 1, 1, 1),
    "waste.manage": (1, 0, 0, 0, 0),
    "house.manage": (1, 0, 0, 0, 0),
    "people.view": (1, 1, 1, 0, 0),
    "people.manage": (1, 0, 0, 0, 0),
    "access.manage": (1, 0, 0, 0, 0),
    "system.view": (1, 1, 1, 0, 0),
    "system.manage": (1, 0, 0, 0, 0),
    "backup.export": (1, 0, 0, 0, 0),
    "backup.restore": (1, 0, 0, 0, 0),
    "ha.restart": (1, 0, 0, 0, 0),
    "ha_frontend.open": (1, 0, 0, 0, 0),
    "device.manage": (1, 1, 1, 0, 0),
    "device_power.manage": (1, 0, 0, 0, 0),
    "profile.manage": (1, 1, 1, 1, 0),
    "notifications.recipients": (1, 0, 0, 0, 0),
    "developer.use": (1, 0, 0, 0, 0),
}
ROLES = (RoleId.ADMIN, RoleId.RESIDENT, RoleId.MEMBER, RoleId.RESTRICTED, RoleId.WALL_PANEL)


def test_the_role_matrix_is_exactly_the_approved_one() -> None:
    assert set(ROLE_MATRIX) == set(models.ACCESS_CAPABILITIES)
    for index, role in enumerate(ROLES):
        expected = {capability_id for capability_id, row in ROLE_MATRIX.items() if row[index]}
        assert set(models.SYSTEM_ROLES[role]) == expected, role


def test_only_the_administrator_role_holds_what_home_assistant_keeps_to_administrators() -> None:
    admin_only = {entry.id for entry in models.ACCESS_CAPABILITIES.values() if entry.requires_ha_admin}
    for role in (RoleId.RESIDENT, RoleId.MEMBER, RoleId.RESTRICTED, RoleId.WALL_PANEL, RoleId.LOCKED):
        assert not admin_only & models.SYSTEM_ROLES[role], role


def test_roles_only_name_known_capabilities_and_locked_is_internal() -> None:
    for capabilities in models.SYSTEM_ROLES.values():
        assert capabilities <= set(models.ACCESS_CAPABILITIES)
    assert RoleId.LOCKED not in models.ASSIGNABLE_ROLES
    assert models.SYSTEM_ROLES[RoleId.LOCKED] == {"dashboard.view", "rooms.view", "profile.manage"}
    assert {role.value for role in RoleId} == {"admin", "resident", "member", "restricted", "wall_panel", "locked"}


# --- Resolution: the approved scenarios ----------------------------------------------


def test_a_member_without_assignment_has_no_locks_alarm_or_home_assistant_command() -> None:
    result = profile(MEMBER)
    assert result.role is RoleId.MEMBER and result.source is models.ProfileSource.DEFAULT
    assert not result.has("access.control")
    assert not result.has("security.control")
    assert not result.has("ha_frontend.open")
    assert result.has("energy.view") and result.revision == 0


@pytest.mark.parametrize(
    ("grants", "access", "alarm"),
    [
        (["access.control"], True, False),
        (["security.control"], False, True),
        (["security.control", "access.control"], True, True),
        ([], False, False),
    ],
)
def test_personal_grants_add_locks_and_alarm_one_by_one(grants, access, alarm) -> None:
    state, policy = ready({MEMBER.user_id: assignment("member", grants)})
    result = profile(MEMBER, state, policy)
    assert result.source is models.ProfileSource.ASSIGNMENT
    assert result.has("access.control") is access
    assert result.has("security.control") is alarm
    assert result.grants == tuple(sorted(grants))
    assert result.revision == 3


def test_a_member_granted_access_management_is_refused_and_never_becomes_an_administrator() -> None:
    with pytest.raises(models.InvalidStoredDocumentError):
        models.parse_stored_document(document({MEMBER.user_id: assignment("member", ["access.manage"])}))
    # And if such a document were ever trusted, resolution still would not give it.
    forged = models.PolicyDocument(
        revision=1,
        updated_at=NOW,
        assignments={
            MEMBER.user_id: models.Assignment(
                role=RoleId.MEMBER,
                grants=(models.AccessCapabilityId("access.manage"),),
                assigned_at=NOW,
                assigned_by=None,
            )
        },
    )
    assert not profile(MEMBER, StoreState.READY, forged).has("access.manage")


def test_a_wall_panel_sees_energy_but_manages_nothing_and_opens_nothing() -> None:
    state, policy = ready({MEMBER.user_id: assignment("wall_panel")})
    result = profile(MEMBER, state, policy)
    assert result.role is RoleId.WALL_PANEL
    assert result.has("energy.view")
    for missing in ("energy.manage", "access.control", "security.control", "ha_frontend.open", "profile.manage"):
        assert not result.has(missing), missing


def test_restricted_has_no_energy_locks_alarm_or_home_assistant_command() -> None:
    state, policy = ready({MEMBER.user_id: assignment("restricted")})
    result = profile(MEMBER, state, policy)
    for missing in ("energy.view", "access.control", "security.control", "ha_frontend.open"):
        assert not result.has(missing), missing


def test_an_administrator_without_a_policy_is_an_administrator() -> None:
    result = profile(ADMIN)
    assert result.role is RoleId.ADMIN
    for present in ("access.manage", "access.control", "security.control", "ha_frontend.open"):
        assert result.has(present), present
    assert result.capabilities == set(models.ACCESS_CAPABILITIES)


def test_what_home_assistant_keeps_to_administrators_never_reaches_anyone_else() -> None:
    state, policy = ready({MEMBER.user_id: assignment("admin", ["access.control", "security.control"])})
    result = profile(MEMBER, state, policy)
    admin_only = {entry.id for entry in models.ACCESS_CAPABILITIES.values() if entry.requires_ha_admin}
    assert not admin_only & result.capabilities
    assert result.has("access.control") and result.has("ha_frontend.open")


def test_an_administrator_always_manages_access_but_gets_nothing_else_for_free() -> None:
    state, policy = ready({ADMIN.user_id: assignment("wall_panel")})
    result = profile(ADMIN, state, policy)
    assert result.role is RoleId.WALL_PANEL
    assert result.capabilities == models.SYSTEM_ROLES[RoleId.WALL_PANEL] | {"access.manage"}


def test_a_demotion_in_home_assistant_applies_at_once_without_a_new_revision() -> None:
    state, policy = ready({})
    before = profile(ADMIN, state, policy)
    after = profile(models.Principal(user_id=ADMIN.user_id, is_admin=False), state, policy)
    assert before.has("access.manage") and not after.has("access.manage")
    assert after.role is RoleId.MEMBER
    assert before.revision == after.revision == 3


@pytest.mark.parametrize("state", [StoreState.CORRUPT, StoreState.UNSUPPORTED, StoreState.MIGRATION_FAILED])
def test_an_untrusted_policy_leaves_members_on_the_safe_floor(state) -> None:
    result = profile(MEMBER, state, None)
    assert result.role is RoleId.LOCKED and result.source is models.ProfileSource.FAIL_CLOSED
    assert result.capabilities == {"dashboard.view", "rooms.view", "profile.manage"}
    sensitive = {entry.id for entry in models.ACCESS_CAPABILITIES.values() if entry.risk in (models.Risk.HIGH, models.Risk.CRITICAL)}
    assert not sensitive & result.capabilities


@pytest.mark.parametrize("state", [StoreState.CORRUPT, StoreState.UNSUPPORTED, StoreState.MIGRATION_FAILED])
def test_an_administrator_can_still_recover_an_untrusted_policy_and_nothing_more(state) -> None:
    result = profile(ADMIN, state, None)
    assert result.has("access.manage")
    assert result.capabilities == models.SYSTEM_ROLES[RoleId.LOCKED] | {"access.manage"}


def test_the_principal_is_the_user_id_whoever_the_person_is() -> None:
    state, policy = ready({MEMBER.user_id: assignment("member", ["security.control"])})
    # The same account, whatever person or name the house shows for it.
    renamed = models.Principal(user_id=MEMBER.user_id, is_admin=False, is_owner=False)
    assert profile(renamed, state, policy) == profile(MEMBER, state, policy)
    other = models.Principal(user_id="c" * 32, is_admin=False)
    assert not profile(other, state, policy).has("security.control")


def test_the_model_knows_nothing_of_people_devices_or_the_browser() -> None:
    source = _MODELS_PATH.read_text(encoding="utf-8")
    tree = ast.parse(source)
    fields = {node.target.id for node in ast.walk(tree) if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name)}
    for forbidden in ("person_id", "client_id", "device_id", "email", "name", "avatar"):
        assert forbidden not in fields
    assert "localStorage" not in source and "homeassistant" not in source.split('"""', 2)[2]


# --- Grants --------------------------------------------------------------------------


def test_grants_are_normalized_to_a_stable_order() -> None:
    assert models.normalize_grants(["security.control", "access.control"]) == ("access.control", "security.control")
    assert models.normalize_grants([]) == ()


@pytest.mark.parametrize(
    "grants",
    [
        ["access.control", "access.control"],
        ["energy.vieww"],
        ["energy.view"],
        ["access.manage"],
        "access.control",
        [1],
        None,
    ],
)
def test_a_grant_list_that_is_not_valid_is_refused(grants) -> None:
    with pytest.raises(models.InvalidAssignmentError):
        models.normalize_grants(grants)


def test_only_assignable_roles_are_accepted() -> None:
    assert models.parse_role("wall_panel") is RoleId.WALL_PANEL
    for role in ("locked", "owner", "superadmin", "root", "", None):
        with pytest.raises(models.InvalidAssignmentError):
            models.parse_role(role)


# --- Stored policy -------------------------------------------------------------------


def test_a_valid_document_is_read_with_its_assignments_and_written_back_identically() -> None:
    raw = document({MEMBER.user_id: assignment("member", ["access.control"])})
    policy = models.parse_stored_document(raw)
    assert policy.revision == 3
    assert policy.assignments[MEMBER.user_id].role is RoleId.MEMBER
    assert models.storage_document(policy) == raw


@pytest.mark.parametrize(
    "broken",
    [
        None,
        [],
        document(schema="something-else"),
        document(version="1"),
        document(version=0),
        document(revision=0),
        document(revision=True),
        document(updated_at="yesterday"),
        document(assignments=[]),
        document(audit={}),
        {**document(), "extra": 1},
        document({"": assignment()}),
        document({"someone@example.com": assignment()}),
        document({MEMBER.user_id: assignment("owner")}),
        document({MEMBER.user_id: assignment("locked")}),
        document({MEMBER.user_id: assignment("member", ["unknown.capability"])}),
        document({MEMBER.user_id: assignment("member", ["energy.manage"])}),
        document({MEMBER.user_id: assignment("member", ["access.control", "access.control"])}),
        document({MEMBER.user_id: {**assignment(), "name": "Mario"}}),
        document({MEMBER.user_id: {**assignment(), "assigned_at": "never"}}),
        document({MEMBER.user_id: {**assignment(), "assigned_by": "Mario Rossi"}}),
        document(audit=[{"at": NOW}]),
    ],
)
def test_any_broken_document_is_refused_whole(broken) -> None:
    with pytest.raises(models.InvalidStoredDocumentError):
        models.parse_stored_document(broken)


def test_a_document_from_a_newer_domus_is_unsupported_and_left_alone() -> None:
    with pytest.raises(models.UnsupportedSchemaError):
        models.parse_stored_document(document(version=models.SCHEMA_VERSION + 1))


def test_an_older_document_is_migrated_step_by_step_by_pure_functions() -> None:
    def v1_to_v2(old):
        return {**old, "version": 2}

    raw = document({MEMBER.user_id: assignment("restricted")})
    migrated = models.parse_stored_document(raw, migrations={1: v1_to_v2}, current=2)
    assert migrated.assignments[MEMBER.user_id].role is RoleId.RESTRICTED
    assert raw["version"] == 1  # the original is untouched


@pytest.mark.parametrize(
    "migrations",
    [
        {},
        {1: lambda old: (_ for _ in ()).throw(ValueError("boom"))},
        {1: lambda old: {**old, "version": 3}},
        {1: lambda old: None},
    ],
)
def test_a_migration_that_cannot_finish_fails_without_guessing(migrations) -> None:
    with pytest.raises(models.MigrationFailedError):
        models.parse_stored_document(document(), migrations=migrations, current=2)


def test_an_assignment_change_makes_a_new_revision_and_one_audit_record_with_ids_only() -> None:
    first = models.with_assignment(
        None,
        MEMBER.user_id,
        models.Assignment(RoleId.MEMBER, ("access.control",), NOW, ADMIN.user_id),
        actor=ADMIN.user_id,
        at=NOW,
    )
    assert first.revision == 1
    second = models.with_assignment(first, MEMBER.user_id, None, actor=ADMIN.user_id, at=NOW)
    assert second.revision == 2 and MEMBER.user_id not in second.assignments
    assert [record.event for record in second.audit] == [
        models.AuditEvent.ASSIGNMENT_CHANGED,
        models.AuditEvent.ASSIGNMENT_REMOVED,
    ]
    stored = models.storage_document(second)
    assert models.parse_stored_document(stored) == second
    assert set(stored["audit"][0]) == {"at", "event", "actor", "user_id", "revision", "role", "grants"}


def test_the_audit_keeps_only_the_latest_records() -> None:
    policy = None
    for index in range(models.MAX_AUDIT_RECORDS + 5):
        role = RoleId.MEMBER if index % 2 else RoleId.RESTRICTED
        policy = models.with_assignment(
            policy, MEMBER.user_id, models.Assignment(role, (), NOW, None), actor=None, at=NOW
        )
    assert len(policy.audit) == models.MAX_AUDIT_RECORDS
    assert policy.audit[-1].revision == models.MAX_AUDIT_RECORDS + 5


def test_assignments_of_removed_accounts_are_reported_and_kept() -> None:
    state, policy = ready(
        {MEMBER.user_id: assignment("restricted"), "d" * 32: assignment("wall_panel")}
    )
    assert models.orphaned_assignments(policy, [MEMBER.user_id]) == ["d" * 32]
    assert "d" * 32 in policy.assignments
    # The same id coming back finds its assignment again.
    returning = models.Principal(user_id="d" * 32, is_admin=False)
    assert profile(returning, state, policy).role is RoleId.WALL_PANEL
