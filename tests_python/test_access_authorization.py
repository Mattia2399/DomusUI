"""The central authorization evaluator, without Home Assistant.

Decisions follow the resolved profile of P2.1; nothing is wired to a command
yet. Every unexpected situation must end in a deny.
"""

from __future__ import annotations

from dataclasses import replace
from types import SimpleNamespace

import pytest

from access_pure import load

models = load("models")
authorization = load("authorization")

Reason = authorization.DecisionReason
RoleId = models.RoleId
StoreState = models.StoreState
NOW = "2026-10-21T10:00:00+00:00"
ADMIN = models.Principal(user_id="a" * 32, is_admin=True)
MEMBER = models.Principal(user_id="b" * 32, is_admin=False)


def profile(principal, role=None, grants=(), state=StoreState.ABSENT):
    """The profile P2.1 resolves, from a stored assignment when a role is given."""
    if state is not StoreState.READY and role is None:
        return models.resolve_access_profile(principal, state, None)
    policy = models.PolicyDocument(
        revision=4,
        updated_at=NOW,
        assignments={principal.user_id: models.Assignment(RoleId(role), tuple(sorted(grants)), NOW, None)},
    )
    return models.resolve_access_profile(principal, StoreState.READY, policy)


def decide(principal, capability, **kwargs):
    return authorization.authorize(principal, profile(principal, **kwargs), capability)


# --- can / authorize -----------------------------------------------------------------


@pytest.mark.parametrize("capability", sorted(models.ACCESS_CAPABILITIES))
def test_an_administrator_without_a_policy_can_do_everything_in_domus(capability) -> None:
    assert authorization.can(ADMIN, profile(ADMIN), capability)
    assert decide(ADMIN, capability).reason is Reason.ALLOWED


@pytest.mark.parametrize("role", ["member", "restricted", "wall_panel"])
def test_every_role_gets_exactly_its_capabilities(role) -> None:
    resolved = profile(MEMBER, role=role)
    for capability in models.ACCESS_CAPABILITIES:
        expected = capability in models.SYSTEM_ROLES[RoleId(role)]
        assert authorization.can(MEMBER, resolved, capability) is expected, (role, capability)


def test_a_member_lacking_a_capability_gets_a_structured_deny() -> None:
    decision = decide(MEMBER, "energy.manage")
    assert not decision.allowed and decision.reason is Reason.REQUIRES_HA_ADMIN
    decision = decide(MEMBER, "access.control")
    assert not decision.allowed and decision.reason is Reason.MISSING_CAPABILITY
    assert decision.capability == "access.control" and decision.role is RoleId.MEMBER
    assert decision.policy_state is StoreState.ABSENT and decision.principal_id == MEMBER.user_id
    assert decision.requires_ha_admin is False and decision.enforcement is models.EnforcementKind.HA_NATIVE


@pytest.mark.parametrize("grant", ["access.control", "security.control"])
def test_personal_grants_allow_one_capability_each(grant) -> None:
    other = "security.control" if grant == "access.control" else "access.control"
    granted = profile(MEMBER, role="member", grants=[grant])
    assert authorization.can(MEMBER, granted, grant)
    assert not authorization.can(MEMBER, granted, other)
    assert not authorization.can(MEMBER, profile(MEMBER, role="member"), grant)


def test_restricted_and_wall_panel_follow_the_registry() -> None:
    restricted = profile(MEMBER, role="restricted")
    panel = profile(MEMBER, role="wall_panel")
    assert not authorization.can(MEMBER, restricted, "energy.view")
    assert authorization.can(MEMBER, panel, "energy.view")
    assert not authorization.can(MEMBER, panel, "energy.manage")
    assert not authorization.can(MEMBER, panel, "ha_frontend.open")
    assert authorization.can(MEMBER, restricted, "waste.view") and authorization.can(MEMBER, panel, "waste.view")


@pytest.mark.parametrize("state", [StoreState.CORRUPT, StoreState.UNSUPPORTED, StoreState.MIGRATION_FAILED])
def test_a_locked_member_has_only_the_safe_floor(state) -> None:
    locked = profile(MEMBER, state=state)
    assert authorization.can(MEMBER, locked, "dashboard.view")
    decision = authorization.authorize(MEMBER, locked, "energy.view")
    assert not decision.allowed and decision.reason is Reason.LOCKED and decision.role is RoleId.LOCKED


@pytest.mark.parametrize("state", [StoreState.CORRUPT, StoreState.UNSUPPORTED, StoreState.MIGRATION_FAILED])
def test_a_locked_administrator_can_recover_and_nothing_else(state) -> None:
    locked = profile(ADMIN, state=state)
    assert authorization.authorize(ADMIN, locked, "access.manage").allowed
    for capability in ("energy.manage", "system.manage", "access.control", "security.control", "ha_frontend.open"):
        decision = authorization.authorize(ADMIN, locked, capability)
        assert not decision.allowed and decision.reason is Reason.LOCKED, capability


def test_an_administrator_is_no_bypass_for_what_the_role_lacks() -> None:
    panel = profile(ADMIN, role="wall_panel")
    assert authorization.can(ADMIN, panel, "access.manage")
    decision = authorization.authorize(ADMIN, panel, "energy.manage")
    assert not decision.allowed and decision.reason is Reason.MISSING_CAPABILITY


def test_a_profile_built_wrongly_never_gives_what_home_assistant_keeps_to_administrators() -> None:
    forged = replace(profile(MEMBER, role="member"), capabilities=frozenset(models.ACCESS_CAPABILITIES))
    for entry in models.ACCESS_CAPABILITIES.values():
        decision = authorization.authorize(MEMBER, forged, entry.id)
        if entry.requires_ha_admin:
            assert not decision.allowed and decision.reason is Reason.REQUIRES_HA_ADMIN, entry.id
    assert not authorization.can(MEMBER, forged, "access.manage")


@pytest.mark.parametrize("capability", ["foo.bar.baz", "light.brightness", "", "energy", None, 42])
def test_an_unknown_capability_is_denied(capability) -> None:
    decision = authorization.authorize(ADMIN, profile(ADMIN), capability)
    assert not decision.allowed
    assert decision.reason in {Reason.UNKNOWN_CAPABILITY, Reason.INTERNAL_ERROR}
    assert not authorization.can(ADMIN, profile(ADMIN), capability)


def test_no_principal_or_no_profile_is_denied() -> None:
    assert authorization.authorize(None, profile(ADMIN), "energy.view").reason is Reason.NO_PRINCIPAL
    assert authorization.authorize(ADMIN, None, "energy.view").reason is Reason.POLICY_UNAVAILABLE
    bogus = models.Principal(user_id="someone@example.com", is_admin=True)
    assert authorization.authorize(bogus, profile(ADMIN), "energy.view").reason is Reason.INVALID_PRINCIPAL


def test_an_exception_inside_is_a_deny_never_an_allow(monkeypatch) -> None:
    def explode(_capability):
        raise RuntimeError("registry broken")

    monkeypatch.setattr(authorization, "capability_entry", explode)
    decision = authorization.authorize(ADMIN, profile(ADMIN), "energy.view")
    assert not decision.allowed and decision.reason is Reason.INTERNAL_ERROR
    assert not authorization.can(ADMIN, profile(ADMIN), "energy.view")
    with pytest.raises(authorization.AuthorizationDeniedError) as raised:
        authorization.require_capability(ADMIN, profile(ADMIN), "energy.view")
    assert raised.value.reason is Reason.INTERNAL_ERROR


def test_a_profile_that_breaks_when_read_is_a_deny() -> None:
    class Hostile(models.AccessProfile):
        @property
        def capabilities(self):  # type: ignore[override]
            raise RuntimeError("boom")

    hostile = object.__new__(Hostile)
    assert not authorization.can(ADMIN, hostile, "energy.view")


# --- require_capability ----------------------------------------------------------------


def test_require_returns_on_allow_and_raises_a_structured_denial() -> None:
    allowed = authorization.require_capability(ADMIN, profile(ADMIN), "energy.manage", action="domusos/energy/save_profile")
    assert allowed.allowed and allowed.action == "domusos/energy/save_profile"
    with pytest.raises(authorization.AuthorizationDeniedError) as raised:
        authorization.require_capability(MEMBER, profile(MEMBER), "access.control", action="x")
    error = raised.value
    assert isinstance(error, models.AccessDeniedError) and error.code == "access_denied"
    assert error.reason is Reason.MISSING_CAPABILITY and error.decision.capability == "access.control"
    assert str(error) == "missing_capability: access.control"


# --- Decisions -------------------------------------------------------------------------


def test_a_decision_carries_ids_and_codes_only() -> None:
    granted = profile(MEMBER, role="member", grants=["access.control"])
    decision = authorization.authorize(MEMBER, granted, "access.control", action="domusos/test")
    data = decision.as_dict()
    assert set(data) == {
        "allowed", "reason", "capability", "action", "principal_id", "role",
        "policy_state", "policy_revision", "requires_ha_admin", "enforcement",
    }
    assert data == {
        "allowed": True,
        "reason": "allowed",
        "capability": "access.control",
        "action": "domusos/test",
        "principal_id": MEMBER.user_id,
        "role": "member",
        "policy_state": "ready",
        "policy_revision": 4,
        "requires_ha_admin": False,
        "enforcement": "ha_native",
    }
    # Never the grants or the policy of anyone, never a name.
    assert "grants" not in data and "capabilities" not in data


def test_the_same_inputs_give_the_same_decision() -> None:
    resolved = profile(MEMBER, role="restricted")
    decisions = {authorization.authorize(MEMBER, resolved, "irrigation.control") for _ in range(20)}
    assert len(decisions) == 1


def test_deny_can_never_carry_an_allowed_reason() -> None:
    assert authorization.deny(Reason.ALLOWED, "energy.view").reason is Reason.INTERNAL_ERROR
    assert not authorization.deny(Reason.ALLOWED, "energy.view").allowed


# --- Identity --------------------------------------------------------------------------


def user(**overrides):
    attributes = {"id": "c" * 32, "is_active": True, "system_generated": False, "is_admin": False, "is_owner": False}
    attributes.update(overrides)
    return SimpleNamespace(**attributes)


def test_identify_reads_only_household_accounts() -> None:
    principal, reason = authorization.identify(user(is_admin=True, is_owner=True))
    assert reason is None and principal == models.Principal("c" * 32, True, True)
    assert authorization.identify(None) == (None, Reason.NO_PRINCIPAL)
    assert authorization.identify(user(system_generated=True))[1] is Reason.INVALID_PRINCIPAL
    assert authorization.identify(user(is_active=False))[1] is Reason.INACTIVE_USER
    assert authorization.identify(user(id="Mario Rossi"))[1] is Reason.INVALID_PRINCIPAL
    # Only a real True counts as administrator.
    assert authorization.identify(user(is_admin="yes"))[0].is_admin is False


def test_an_identity_that_cannot_be_read_is_no_identity() -> None:
    class Broken:
        system_generated = False
        is_active = True

        @property
        def id(self):
            raise RuntimeError("boom")

    assert authorization.identify(Broken()) == (None, Reason.INVALID_PRINCIPAL)


# --- Actions ---------------------------------------------------------------------------


def test_actions_are_decided_by_their_contract() -> None:
    member = profile(MEMBER)
    assert authorization.authorize_action(MEMBER, member, "domusos/energy/get_state").allowed
    denied = authorization.authorize_action(MEMBER, member, "domusos/energy/save_profile")
    assert not denied.allowed and denied.capability == "energy.manage" and denied.action == "domusos/energy/save_profile"
    assert authorization.authorize_action(MEMBER, member, "domusos/irrigation/start_zone").allowed
    assert authorization.authorize_action(MEMBER, member, "domusos.start_irrigation_zone").allowed


def test_get_self_needs_only_a_valid_account_and_a_policy() -> None:
    locked = profile(MEMBER, state=StoreState.CORRUPT)
    assert authorization.authorize_action(MEMBER, locked, "domusos/access/get_self").allowed
    assert authorization.authorize_action(None, locked, "domusos/access/get_self").reason is Reason.NO_PRINCIPAL
    assert authorization.authorize_action(MEMBER, None, "domusos/access/get_self").reason is Reason.POLICY_UNAVAILABLE


def test_reset_policy_is_for_administrators_even_when_locked() -> None:
    assert authorization.authorize_action(ADMIN, profile(ADMIN, state=StoreState.CORRUPT), "domusos/access/reset_policy").allowed
    denied = authorization.authorize_action(MEMBER, profile(MEMBER), "domusos/access/reset_policy")
    assert not denied.allowed and denied.reason is Reason.REQUIRES_HA_ADMIN


def test_an_undeclared_action_is_denied() -> None:
    decision = authorization.authorize_action(ADMIN, profile(ADMIN), "domusos/energy/delete_everything")
    assert not decision.allowed and decision.reason is Reason.UNKNOWN_ACTION
    with pytest.raises(authorization.AuthorizationDeniedError):
        authorization.require_action(ADMIN, profile(ADMIN), "domusos/energy/delete_everything")
