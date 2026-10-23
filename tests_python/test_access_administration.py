"""People and access without Home Assistant: which accounts, which roles and grants, nothing more."""

from __future__ import annotations

import pytest

from access_pure import load

models = load("models")
administration = load("administration")

Facts = administration.AccountFacts
RoleId = models.RoleId
StoreState = models.StoreState
NOW = "2026-10-22T10:00:00+00:00"


def facts(user_id: str, name: str, *, admin=False, owner=False, active=True, system=False):
    return Facts(user_id=user_id, name=name, is_admin=admin, is_owner=owner, is_active=active, system_generated=system)


OWNER = facts("a" * 32, "Mattia", admin=True, owner=True)
MARIO = facts("b" * 32, "Mario")
EX = facts("c" * 32, "Ex", active=False)
SUPERVISOR = facts("d" * 32, "Supervisor", admin=True, system=True)


def assignment(role, grants=()):
    return models.Assignment(RoleId(role), tuple(sorted(grants)), NOW, OWNER.user_id)


# --- The list -----------------------------------------------------------------------------


def test_lists_household_accounts_only_active_first_and_never_a_system_account() -> None:
    view = administration.accounts_view([SUPERVISOR, EX, MARIO, OWNER], StoreState.ABSENT, {})
    assert [account["name"] for account in view] == ["Mario", "Mattia", "Ex"]
    assert SUPERVISOR.user_id not in [account["user_id"] for account in view]


def test_shows_the_default_role_without_an_assignment_and_marks_it_as_default() -> None:
    view = {account["name"]: account for account in administration.accounts_view([OWNER, MARIO], StoreState.ABSENT, {})}
    assert view["Mattia"] == {
        "user_id": OWNER.user_id,
        "name": "Mattia",
        "is_admin": True,
        "is_owner": True,
        "is_active": True,
        "manageable": True,
        "role": "admin",
        "assigned": False,
        "grants": [],
    }
    assert (view["Mario"]["role"], view["Mario"]["assigned"]) == ("member", False)


def test_shows_an_assignment_as_it_is_stored() -> None:
    view = administration.account_view(MARIO, StoreState.READY, assignment("member", ["access.control"]))
    assert (view["role"], view["assigned"], view["grants"]) == ("member", True, ["access.control"])


def test_a_disabled_account_is_listed_but_not_manageable() -> None:
    view = administration.account_view(EX, StoreState.READY, assignment("restricted"))
    assert view["manageable"] is False and view["is_active"] is False and view["role"] == "restricted"


@pytest.mark.parametrize("state", [StoreState.CORRUPT, StoreState.UNSUPPORTED, StoreState.MIGRATION_FAILED])
def test_an_untrusted_policy_shows_the_safe_floor_and_nothing_can_be_edited(state) -> None:
    for account in administration.accounts_view([OWNER, MARIO], state, {MARIO.user_id: assignment("admin")}):
        assert (account["role"], account["assigned"], account["grants"], account["manageable"]) == ("locked", False, [], False)


def test_tells_nothing_but_what_the_page_needs() -> None:
    view = administration.account_view(MARIO, StoreState.ABSENT, None)
    assert set(view) == {"user_id", "name", "is_admin", "is_owner", "is_active", "manageable", "role", "assigned", "grants"}


# --- Targets ------------------------------------------------------------------------------


def test_only_an_active_household_account_can_be_changed() -> None:
    administration.require_manageable(MARIO)
    with pytest.raises(models.AccountNotManageableError):
        administration.require_manageable(EX)
    with pytest.raises(models.AccountNotManageableError):
        administration.require_manageable(SUPERVISOR)


# --- Requests -----------------------------------------------------------------------------


@pytest.mark.parametrize("role", ["admin", "resident", "member", "restricted", "wall_panel"])
def test_accepts_the_five_assignable_roles(role) -> None:
    assert administration.assignment_request(role, [])[0] is RoleId(role)


@pytest.mark.parametrize("role", ["locked", "owner", "guest", "", None, 3, "Admin"])
def test_refuses_any_other_role(role) -> None:
    with pytest.raises(models.InvalidAssignmentError):
        administration.assignment_request(role, [])


def test_grants_only_the_two_personal_permissions_each_once_in_order() -> None:
    role, grants = administration.assignment_request("member", ["security.control", "access.control", "access.control"])
    assert (role, grants) == (RoleId.MEMBER, ("access.control", "security.control"))
    assert administration.assignment_request("restricted", [])[1] == ()


@pytest.mark.parametrize(
    "grant",
    ["access.manage", "system.manage", "energy.manage", "ha_frontend.open", "devices.control", "unknown.capability", ""],
)
def test_refuses_every_capability_that_is_not_personally_grantable(grant) -> None:
    with pytest.raises(models.InvalidAssignmentError):
        administration.assignment_request("member", [grant])


@pytest.mark.parametrize("grants", ["access.control", None, [1], [None], {"access.control": True}])
def test_refuses_grants_that_are_not_a_list_of_names(grants) -> None:
    with pytest.raises(models.InvalidAssignmentError):
        administration.assignment_request("member", grants)


@pytest.mark.parametrize("role", ["restricted", "wall_panel"])
def test_the_personal_grants_go_with_any_role_that_lacks_them(role) -> None:
    assert administration.assignment_request(role, ["access.control", "security.control"])[1] == (
        "access.control",
        "security.control",
    )


def test_an_administrator_role_never_stores_the_grants_it_already_has() -> None:
    assert administration.assignment_request("admin", ["access.control", "security.control"]) == (RoleId.ADMIN, ())
    # Something that could never be granted is still refused.
    with pytest.raises(models.InvalidAssignmentError):
        administration.assignment_request("admin", ["access.manage"])


def test_a_resident_never_stores_the_grants_it_already_has() -> None:
    assert administration.assignment_request("resident", ["security.control", "access.control"]) == (RoleId.RESIDENT, ())
    with pytest.raises(models.InvalidAssignmentError):
        administration.assignment_request("resident", ["device_power.manage"])


# --- The Administrator role needs a Home Assistant administrator (Q24) -------------------


def test_only_a_home_assistant_administrator_can_be_made_administrator() -> None:
    administration.require_role_eligible(OWNER, RoleId.ADMIN)
    with pytest.raises(models.RoleRequiresHaAdminError) as refused:
        administration.require_role_eligible(MARIO, RoleId.ADMIN)
    assert refused.value.code == "role_requires_ha_admin"
    # Every other role stays open to anyone, administrators included.
    for role in (RoleId.RESIDENT, RoleId.MEMBER, RoleId.RESTRICTED, RoleId.WALL_PANEL):
        administration.require_role_eligible(MARIO, role)
        administration.require_role_eligible(OWNER, role)


def test_a_stored_administrator_role_for_a_non_administrator_is_shown_as_it_is() -> None:
    """A legacy assignment stays readable: shown, not migrated, never more than Home Assistant allows."""
    view = administration.account_view(MARIO, StoreState.READY, assignment("admin"))
    assert (view["role"], view["is_admin"], view["assigned"], view["manageable"]) == ("admin", False, True, True)


# --- Resident: full house access, no administration (Q23) --------------------------------


def test_a_resident_is_a_member_with_locks_and_the_alarm() -> None:
    member = models.SYSTEM_ROLES[RoleId.MEMBER]
    grantable = {entry.id for entry in models.ACCESS_CAPABILITIES.values() if entry.user_grantable}
    assert models.SYSTEM_ROLES[RoleId.RESIDENT] == member | grantable


def test_a_resident_holds_nothing_home_assistant_keeps_to_administrators() -> None:
    admin_only = {entry.id for entry in models.ACCESS_CAPABILITIES.values() if entry.requires_ha_admin}
    assert not admin_only & models.SYSTEM_ROLES[RoleId.RESIDENT]
    assert {"access.manage", "device_power.manage"} & models.SYSTEM_ROLES[RoleId.RESIDENT] == set()
    principal = models.Principal(user_id="b" * 32, is_admin=False)
    policy = models.PolicyDocument(revision=1, updated_at=NOW, assignments={principal.user_id: assignment("resident")})
    profile = models.resolve_access_profile(principal, StoreState.READY, policy)
    assert profile.role is RoleId.RESIDENT
    assert {"access.control", "security.control"} <= profile.capabilities
    assert not admin_only & profile.capabilities


def test_a_non_administrator_with_a_legacy_administrator_role_still_gets_nothing_reserved() -> None:
    principal = models.Principal(user_id="b" * 32, is_admin=False)
    policy = models.PolicyDocument(revision=1, updated_at=NOW, assignments={principal.user_id: assignment("admin")})
    profile = models.resolve_access_profile(principal, StoreState.READY, policy)
    admin_only = {entry.id for entry in models.ACCESS_CAPABILITIES.values() if entry.requires_ha_admin}
    assert profile.role is RoleId.ADMIN and not admin_only & profile.capabilities


def test_the_default_roles_do_not_change() -> None:
    assert models.default_role(True) is RoleId.ADMIN
    assert models.default_role(False) is RoleId.MEMBER


def test_exactly_two_capabilities_are_personally_grantable() -> None:
    grantable = sorted(entry.id for entry in models.ACCESS_CAPABILITIES.values() if entry.user_grantable)
    assert grantable == ["access.control", "security.control"]
