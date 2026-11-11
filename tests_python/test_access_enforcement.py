"""P2.5D.1: the first actions Access Control refuses for real, without Home Assistant.

Device power only, set per action in the registry and nowhere else
(docs/access-control-enforcement.md). The handler is eligible exactly when
the decision is an allow; every other answer, including an error, refuses.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from access_pure import INTEGRATION_DIR, load

models = load("models")
actions = load("actions")
authorization = load("authorization")
shadow = load("shadow")

Reason = authorization.DecisionReason
RoleId = models.RoleId
StoreState = models.StoreState
AuthMode = actions.AuthMode
Surface = actions.SurfaceKind
NOW = "2026-10-23T10:00:00+00:00"

DEVICE_POWER = (
    "domusos/device_power/get_state",
    "domusos/device_power/save_policy",
    "domusos/device_power/bind_policy",
    "domusos/device_power/delete_policy",
)
CLIMATE = ("domusos/climate/get_config", "domusos/climate/save_config", "domusos/climate/get_house_rooms", "domusos/climate/get_state", "domusos/climate/set_house_intent", "domusos/climate/set_zone_intent", "domusos/climate/set_zone_override", "domusos/climate/clear_zone_override", "domusos/climate/execute_plan")
HOUSE = ("domusos/house/get_topology", "domusos/house/get_snapshot", "domusos/house/get_environment_shadow")
ENFORCED = (*DEVICE_POWER, *CLIMATE, *HOUSE, "domusos/dashboard/get_house_context", "domusos/system/get_house_context")
ADMIN = models.Principal(user_id="a" * 32, is_admin=True)
MEMBER = models.Principal(user_id="b" * 32, is_admin=False)


def profile(principal, role=None, state=StoreState.ABSENT):
    if role is None or state is not StoreState.READY:
        return models.resolve_access_profile(principal, state, None)
    policy = models.PolicyDocument(
        revision=4,
        updated_at=NOW,
        assignments={principal.user_id: models.Assignment(RoleId(role), (), NOW, None)},
    )
    return models.resolve_access_profile(principal, StoreState.READY, policy)


def eligible(decision) -> bool:
    """What the instrumentation does with a decision on an enforced action."""
    return isinstance(decision, authorization.AuthorizationDecision) and decision.allowed is True


# --- The registry decides, exactly ----------------------------------------------------


def test_enforcement_defaults_to_off() -> None:
    contract = actions.ActionContract("domusos/example", Surface.WEBSOCKET, AuthMode.CAPABILITY, "energy.view")
    assert contract.enforced is False
    assert all(type(contract.enforced) is bool for contract in actions.ACTION_CONTRACT_LIST)


def test_exactly_device_power_climate_and_house_commands_are_enforced() -> None:
    assert [contract.id for contract in actions.enforced_contracts()] == list(ENFORCED)
    assert [contract.id for contract in actions.ACTION_CONTRACT_LIST if contract.enforced] == list(ENFORCED)


def test_an_enforced_action_is_an_observed_websocket_capability() -> None:
    for contract in actions.enforced_contracts():
        assert contract.surface is Surface.WEBSOCKET, contract.id
        assert contract.auth_mode is AuthMode.CAPABILITY, contract.id
        # Exempt means unwrapped: nothing would refuse it.
        assert contract.shadow_exemption is None, contract.id
        assert contract.capability in {"device_power.manage", "climate.view", "climate.control", "climate.manage", "rooms.view", "dashboard.view", "system.manage"}, contract.id
        assert contract.allow_unattributed_ha_context is False, contract.id


def test_every_other_domain_is_still_observed_only() -> None:
    for contract in actions.ACTION_CONTRACT_LIST:
        if contract.id not in ENFORCED:
            assert contract.enforced is False, contract.id
    for prefix in ("domusos/energy/", "domusos/irrigation/", "domusos.", "domusos/profile/", "domusos/waste_collection/", "domusos/access/"):
        assert not [c.id for c in actions.enforced_contracts() if c.id.startswith(prefix)], prefix


def test_device_power_stays_an_administrator_capability_nobody_can_be_granted() -> None:
    entry = models.capability("device_power.manage")
    assert entry.requires_ha_admin and not entry.user_grantable
    for role in (RoleId.MEMBER, RoleId.RESTRICTED, RoleId.WALL_PANEL, RoleId.LOCKED):
        assert "device_power.manage" not in models.SYSTEM_ROLES[role], role


def test_enforcement_is_never_read_from_anywhere_but_the_registry() -> None:
    """No setting, environment variable, option or command can switch it (Q15)."""
    for path in INTEGRATION_DIR.rglob("*.py"):
        source = path.read_text(encoding="utf-8")
        assert "os.environ" not in source and "getenv(" not in source, path.name
        assert "device_power/" not in source or path.name in {"actions.py", "api.py"}, path.name
    instrumentation = (INTEGRATION_DIR / "access" / "instrumentation.py").read_text(encoding="utf-8")
    assert "contract.enforced" in instrumentation and "startswith(" not in instrumentation


# --- Who may, who may not -------------------------------------------------------------


def test_climate_view_and_manage_have_different_principals() -> None:
    for action in CLIMATE:
        assert eligible(authorization.authorize_action(ADMIN, profile(ADMIN), action))
        assert authorization.authorize_action(None, profile(ADMIN), action).reason is Reason.NO_PRINCIPAL
        assert authorization.authorize_action(ADMIN, None, action).reason is Reason.POLICY_UNAVAILABLE
    assert eligible(authorization.authorize_action(MEMBER, profile(MEMBER), CLIMATE[0]))
    denied = authorization.authorize_action(MEMBER, profile(MEMBER), CLIMATE[1])
    assert not eligible(denied) and denied.reason is Reason.REQUIRES_HA_ADMIN


@pytest.mark.parametrize("action", ("domusos/climate/set_house_intent", "domusos/climate/set_zone_intent"))
def test_climate_control_is_separate_and_fails_closed(action) -> None:
    assert eligible(authorization.authorize_action(ADMIN, profile(ADMIN), action))
    assert eligible(authorization.authorize_action(MEMBER, profile(MEMBER), action))
    for role in ("resident", "wall_panel"):
        assert eligible(authorization.authorize_action(MEMBER, profile(MEMBER, role=role, state=StoreState.READY), action))
    for role in ("restricted",):
        assert not eligible(authorization.authorize_action(MEMBER, profile(MEMBER, role=role, state=StoreState.READY), action))
    for state in (StoreState.CORRUPT, StoreState.UNSUPPORTED, StoreState.MIGRATION_FAILED):
        assert not eligible(authorization.authorize_action(MEMBER, profile(MEMBER, state=state), action))
    assert authorization.authorize_action(None, profile(MEMBER), action).reason is Reason.NO_PRINCIPAL
    assert authorization.authorize_action(MEMBER, None, action).reason is Reason.POLICY_UNAVAILABLE


@pytest.mark.parametrize("action", DEVICE_POWER)
def test_an_administrator_holds_device_power(action) -> None:
    for state in (StoreState.ABSENT,):
        decision = authorization.authorize_action(ADMIN, profile(ADMIN, state=state), action)
        assert eligible(decision) and decision.reason is Reason.ALLOWED
    ready = authorization.authorize_action(ADMIN, profile(ADMIN, role="admin", state=StoreState.READY), action)
    assert eligible(ready) and ready.role is RoleId.ADMIN


@pytest.mark.parametrize("action", DEVICE_POWER)
@pytest.mark.parametrize("role", [None, "member", "restricted", "wall_panel"])
def test_nobody_else_holds_it_whatever_the_role(action, role) -> None:
    resolved = profile(MEMBER, role=role, state=StoreState.READY if role else StoreState.ABSENT)
    decision = authorization.authorize_action(MEMBER, resolved, action)
    assert not eligible(decision) and decision.reason is Reason.REQUIRES_HA_ADMIN


@pytest.mark.parametrize("action", DEVICE_POWER)
@pytest.mark.parametrize("state", [StoreState.CORRUPT, StoreState.UNSUPPORTED, StoreState.MIGRATION_FAILED])
def test_an_untrusted_policy_refuses_device_power_even_to_an_administrator(action, state) -> None:
    decision = authorization.authorize_action(ADMIN, profile(ADMIN, state=state), action)
    assert not eligible(decision) and decision.reason is Reason.LOCKED
    # The recovery stays the administrator's, apart.
    assert eligible(authorization.authorize_action(ADMIN, profile(ADMIN, state=state), "domusos/access/reset_policy"))


@pytest.mark.parametrize("action", DEVICE_POWER)
def test_no_principal_no_policy_and_a_bad_identity_refuse(action) -> None:
    assert authorization.authorize_action(None, profile(ADMIN), action).reason is Reason.NO_PRINCIPAL
    assert authorization.authorize_action(ADMIN, None, action).reason is Reason.POLICY_UNAVAILABLE
    forged = models.Principal(user_id="someone@example.com", is_admin=True)
    assert authorization.authorize_action(forged, profile(ADMIN), action).reason is Reason.INVALID_PRINCIPAL
    assert not eligible(None)


def test_an_unknown_action_or_capability_refuses() -> None:
    assert authorization.authorize_action(ADMIN, profile(ADMIN), "domusos/device_power/turn_on").reason is Reason.UNKNOWN_ACTION
    broken = actions.ActionContract(
        "domusos/device_power/get_state", Surface.WEBSOCKET, AuthMode.CAPABILITY, "device_power.everything", enforced=True
    )
    decision = authorization.authorize_action(ADMIN, profile(ADMIN), broken.id, contracts={broken.id: broken})
    assert not eligible(decision) and decision.reason is Reason.UNKNOWN_CAPABILITY


def test_an_error_while_deciding_refuses() -> None:
    class Broken(dict):
        def get(self, *_args):
            raise RuntimeError("registry down")

    decision = authorization.authorize_action(ADMIN, profile(ADMIN), DEVICE_POWER[0], contracts=Broken())
    assert not eligible(decision) and decision.reason is Reason.INTERNAL_ERROR


def test_the_identities_home_assistant_refuses_have_no_principal() -> None:
    inactive = type("User", (), {"id": "c" * 32, "is_active": False, "system_generated": False, "is_admin": True})()
    system = type("User", (), {"id": "d" * 32, "is_active": True, "system_generated": True, "is_admin": True})()
    assert authorization.identify(inactive) == (None, Reason.INACTIVE_USER)
    assert authorization.identify(system) == (None, Reason.INVALID_PRINCIPAL)
    assert authorization.identify(None) == (None, Reason.NO_PRINCIPAL)


# --- What the diagnostics say ----------------------------------------------------------


def stats():
    return shadow.ShadowStats(lambda: datetime(2026, 10, 23, 10, 0, tzinfo=UTC))


def test_an_applied_denial_is_an_enforced_deny_never_a_mismatch() -> None:
    contract = actions.ACTION_CONTRACTS["domusos/device_power/save_policy"]
    denied = authorization.authorize_action(MEMBER, profile(MEMBER), contract.id)
    observation = shadow.observe(contract, shadow.Origin.WEBSOCKET, denied, shadow.CurrentOutcome.DENY)
    assert observation.comparison is shadow.Comparison.ENFORCED_DENY
    assert shadow.Comparison.ENFORCED_DENY not in shadow.MISMATCHES
    # No decision at all on an enforced action was a refusal too.
    assert shadow.observe(contract, shadow.Origin.WEBSOCKET, None, shadow.CurrentOutcome.DENY).comparison is shadow.Comparison.ENFORCED_DENY
    allowed = authorization.authorize_action(ADMIN, profile(ADMIN), contract.id)
    assert shadow.observe(contract, shadow.Origin.WEBSOCKET, allowed, shadow.CurrentOutcome.SUCCESS).comparison is shadow.Comparison.ALIGNED_ALLOW
    # The same denial on an action that is only observed is still what it was.
    energy = actions.ACTION_CONTRACTS["domusos/energy/save_profile"]
    shadow_deny = authorization.authorize_action(MEMBER, profile(MEMBER), energy.id)
    assert shadow.observe(energy, shadow.Origin.WEBSOCKET, shadow_deny, shadow.CurrentOutcome.SUCCESS).comparison is shadow.Comparison.WOULD_BLOCK


def test_the_diagnostics_say_which_actions_are_enforced_and_count_the_refusals() -> None:
    counters = stats()
    generation = counters.begin(("ready", 4))
    contract = actions.ACTION_CONTRACTS["domusos/device_power/get_state"]
    admin = authorization.authorize_action(ADMIN, profile(ADMIN), contract.id)
    member = authorization.authorize_action(MEMBER, profile(MEMBER), contract.id)
    counters.record(generation, shadow.observe(contract, shadow.Origin.WEBSOCKET, admin, shadow.CurrentOutcome.SUCCESS))
    counters.record(generation, shadow.observe(contract, shadow.Origin.WEBSOCKET, member, shadow.CurrentOutcome.DENY))
    snapshot = counters.snapshot(policy_state="ready", policy_revision=4)
    assert (snapshot["mode"], snapshot["enforced"], snapshot["rules_version"]) == ("partial", True, 3)
    assert snapshot["enforced_actions"] == sorted(ENFORCED)
    assert (snapshot["totals"]["aligned_allow"], snapshot["totals"]["enforced_deny"]) == (1, 1)
    assert snapshot["totals"]["would_block"] == 0 and snapshot["recent_mismatches"] == []
    row = next(row for row in snapshot["by_action"] if row["action"] == contract.id)
    assert row["enforced"] is True and row["comparisons"]["enforced_deny"] == 1
    assert row["reasons"] == {"allowed": 1, "requires_ha_admin": 1}
    assert row["roles"] == {"admin": 1, "member": 1}
    others = [row for row in snapshot["by_action"] if row["action"] not in ENFORCED]
    assert others and not any(row["enforced"] for row in others)
