"""Q10: a Home Assistant service call with no user, without Home Assistant (docs/access-control-enforcement.md).

No principal is ever made up. Only the five Irrigation services opt in, only
for a context derived from another one, only under a policy that can be
trusted. A call with a user is decided for that user alone, elsewhere.
"""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime

import pytest

from access_pure import INTEGRATION_DIR, load

models = load("models")
actions = load("actions")
authorization = load("authorization")
shadow = load("shadow")

Reason = authorization.DecisionReason
StoreState = models.StoreState
AuthMode = actions.AuthMode
Surface = actions.SurfaceKind

IRRIGATION_SERVICES = (
    "domusos.start_irrigation_zone",
    "domusos.stop_irrigation_zone",
    "domusos.pause_irrigation",
    "domusos.resume_irrigation",
    "domusos.stop_all_irrigation",
)
UNTRUSTED = (StoreState.CORRUPT, StoreState.UNSUPPORTED, StoreState.MIGRATION_FAILED)
# Access Control itself: who acts there must always be a person.
MANAGEMENT = {
    "domusos/access/get_self",
    "domusos/access/reset_policy",
    "domusos/access/get_shadow_diagnostics",
    "domusos/access/reset_shadow_diagnostics",
    "domusos/access/list_accounts",
    "domusos/access/set_assignment",
    "domusos/access/remove_assignment",
}


def unattributed(action, *, has_parent=True, state=StoreState.READY, revision=7, contracts=None):
    return authorization.authorize_unattributed_action(
        action, has_parent=has_parent, policy_state=state, policy_revision=revision, contracts=contracts
    )


# --- The opt-in is deliberate ----------------------------------------------------------


def test_the_opt_in_defaults_to_false() -> None:
    contract = actions.ActionContract("domusos.example", Surface.SERVICE, AuthMode.CAPABILITY, "irrigation.control")
    assert contract.allow_unattributed_ha_context is False


def test_exactly_the_five_irrigation_services_opt_in() -> None:
    opted = [contract.id for contract in actions.ACTION_CONTRACT_LIST if contract.allow_unattributed_ha_context]
    assert opted == list(IRRIGATION_SERVICES)
    assert [contract.id for contract in actions.unattributed_contracts()] == list(IRRIGATION_SERVICES)
    # The flag is a real boolean on every contract, never something truthy.
    assert all(type(contract.allow_unattributed_ha_context) is bool for contract in actions.ACTION_CONTRACT_LIST)


def test_only_plain_domus_services_can_opt_in() -> None:
    for contract in actions.unattributed_contracts():
        entry = models.capability(contract.capability)
        assert contract.surface is Surface.SERVICE, contract.id
        assert contract.auth_mode is AuthMode.CAPABILITY, contract.id
        assert entry is not None and entry.enforcement is models.EnforcementKind.DOMUS, contract.id
        assert not entry.requires_ha_admin and entry.risk is not models.Risk.CRITICAL, contract.id
        assert not contract.capability.startswith("access."), contract.id


def test_no_websocket_command_opts_in() -> None:
    websocket = actions.contracts_for(Surface.WEBSOCKET)
    assert len(websocket) == 38
    assert not any(contract.allow_unattributed_ha_context for contract in websocket)


def test_no_management_recovery_bootstrap_or_diagnostics_opts_in() -> None:
    declared = {contract.id: contract for contract in actions.ACTION_CONTRACT_LIST}
    assert MANAGEMENT <= set(declared)
    for contract in actions.ACTION_CONTRACT_LIST:
        sensitive = (
            contract.id in MANAGEMENT
            or contract.auth_mode is not AuthMode.CAPABILITY
            or (contract.capability or "").startswith("access.")
        )
        if sensitive:
            assert contract.allow_unattributed_ha_context is False, contract.id


def test_the_registry_keeps_its_surfaces() -> None:
    assert len(actions.ACTION_CONTRACTS) == 43
    assert len(actions.contracts_for(Surface.SERVICE)) == 5


def test_only_the_service_adapter_reads_the_parent_context() -> None:
    """No handler may decide on ``parent_id`` itself: the rule lives in one place."""
    readers = sorted(
        path.relative_to(INTEGRATION_DIR).as_posix()
        for path in INTEGRATION_DIR.rglob("*.py")
        if "parent_id" in path.read_text(encoding="utf-8")
    )
    assert readers == ["access/adapters.py"]


# --- The decision tree ------------------------------------------------------------------


@pytest.mark.parametrize("action", IRRIGATION_SERVICES)
@pytest.mark.parametrize("state", [StoreState.READY, StoreState.ABSENT])
def test_no_user_with_a_parent_runs_an_opted_in_service_under_a_trusted_policy(action, state) -> None:
    decision = unattributed(action, state=state)
    assert decision.allowed is True
    assert decision.reason is Reason.ALLOWED_UNATTRIBUTED_HA_CONTEXT
    assert decision.action == action and decision.capability == "irrigation.control"
    # Nobody is made up: no account, no role.
    assert decision.principal_id is None and decision.role is None
    assert (decision.policy_state, decision.policy_revision) == (state, 7)
    assert decision.enforcement is models.EnforcementKind.DOMUS and decision.requires_ha_admin is False


@pytest.mark.parametrize("action", IRRIGATION_SERVICES)
def test_no_user_and_no_parent_is_denied(action) -> None:
    decision = unattributed(action, has_parent=False)
    assert not decision.allowed and decision.reason is Reason.NO_PRINCIPAL
    assert decision.principal_id is None and decision.role is None


@pytest.mark.parametrize("action", IRRIGATION_SERVICES)
@pytest.mark.parametrize("state", UNTRUSTED)
def test_an_untrusted_policy_stops_even_the_house_automations_q14(action, state) -> None:
    decision = unattributed(action, state=state)
    assert not decision.allowed and decision.reason is Reason.LOCKED
    assert decision.policy_state is state


@pytest.mark.parametrize("action", IRRIGATION_SERVICES)
def test_without_a_running_policy_nothing_is_allowed(action) -> None:
    decision = unattributed(action, state=None, revision=None)
    assert not decision.allowed and decision.reason is Reason.POLICY_UNAVAILABLE


@pytest.mark.parametrize("has_parent", [None, "", "0" * 26, 1])
def test_only_a_real_parent_flag_counts(has_parent) -> None:
    # The adapter passes a bool; anything else is no parent at all.
    decision = unattributed("domusos.start_irrigation_zone", has_parent=has_parent)
    assert not decision.allowed and decision.reason is Reason.NO_PRINCIPAL


def test_a_service_that_does_not_opt_in_is_denied() -> None:
    contract = actions.ActionContract("domusos.example", Surface.SERVICE, AuthMode.CAPABILITY, "irrigation.control")
    decision = unattributed("domusos.example", contracts={contract.id: contract})
    assert not decision.allowed and decision.reason is Reason.NO_PRINCIPAL


@pytest.mark.parametrize(
    "action",
    ["domusos/irrigation/start_zone", "domusos/energy/get_state", *sorted(MANAGEMENT)],
)
def test_a_websocket_command_never_runs_without_a_user(action) -> None:
    assert not unattributed(action).allowed
    # Even a websocket contract wrongly marked by hand stays closed.
    marked = replace(actions.ACTION_CONTRACTS[action], allow_unattributed_ha_context=True)
    decision = unattributed(action, contracts={action: marked})
    assert not decision.allowed and decision.reason is Reason.NO_PRINCIPAL


def test_a_wrongly_marked_management_or_admin_service_stays_closed() -> None:
    for capability, reason in (("access.manage", Reason.REQUIRES_HA_ADMIN), ("irrigation.manage", Reason.REQUIRES_HA_ADMIN)):
        contract = actions.ActionContract(
            "domusos.example", Surface.SERVICE, AuthMode.CAPABILITY, capability, allow_unattributed_ha_context=True
        )
        decision = unattributed("domusos.example", contracts={contract.id: contract})
        assert not decision.allowed and decision.reason is reason, capability
    recovery = actions.ActionContract(
        "domusos.example", Surface.SERVICE, AuthMode.RECOVERY, "access.manage", allow_unattributed_ha_context=True
    )
    assert unattributed("domusos.example", contracts={recovery.id: recovery}).reason is Reason.NO_PRINCIPAL


def test_an_unknown_capability_is_denied() -> None:
    contract = actions.ActionContract(
        "domusos.example", Surface.SERVICE, AuthMode.CAPABILITY, "irrigation.everything", allow_unattributed_ha_context=True
    )
    decision = unattributed("domusos.example", contracts={contract.id: contract})
    assert not decision.allowed and decision.reason is Reason.UNKNOWN_CAPABILITY


@pytest.mark.parametrize("action", ["domusos.water_everything", "", None, 3])
def test_an_unknown_action_is_denied(action) -> None:
    decision = unattributed(action)
    assert not decision.allowed and decision.reason is Reason.UNKNOWN_ACTION


def test_an_error_is_a_deny() -> None:
    class Broken(dict):
        def get(self, *_args):
            raise RuntimeError("registry down")

    decision = unattributed("domusos.start_irrigation_zone", contracts=Broken())
    assert not decision.allowed and decision.reason is Reason.INTERNAL_ERROR


def test_the_allow_reasons_are_exactly_two() -> None:
    assert authorization.ALLOW_REASONS == {Reason.ALLOWED, Reason.ALLOWED_UNATTRIBUTED_HA_CONTEXT}
    assert Reason.ALLOWED_UNATTRIBUTED_HA_CONTEXT.value == "allowed_unattributed_ha_context"
    assert authorization.AUTHORIZATION_RULES_VERSION == 3


def test_a_user_is_always_decided_for_that_user() -> None:
    """The user path never looks at the opt-in: a restricted account stays refused (no fallback)."""
    restricted = models.Principal(user_id="b" * 32, is_admin=False)
    policy = models.PolicyDocument(
        revision=4,
        updated_at="2026-10-22T10:00:00+00:00",
        assignments={restricted.user_id: models.Assignment(models.RoleId.RESTRICTED, (), "2026-10-22T10:00:00+00:00", None)},
    )
    profile = models.resolve_access_profile(restricted, StoreState.READY, policy)
    for action in IRRIGATION_SERVICES:
        decision = authorization.authorize_action(restricted, profile, action)
        assert not decision.allowed and decision.reason is Reason.MISSING_CAPABILITY, action


# --- Shadow --------------------------------------------------------------------------


def stats() -> shadow.ShadowStats:
    return shadow.ShadowStats(lambda: datetime(2026, 10, 22, 10, 0, tzinfo=UTC))


def snapshot_after(observations) -> dict:
    counters = stats()
    generation = counters.begin(("ready", 7))
    for observation in observations:
        counters.record(generation, observation)
    return counters.snapshot(policy_state="ready", policy_revision=7)


def test_real_home_2026_10_22_start_zone_without_a_user_is_no_longer_would_block() -> None:
    """Regression for the case that closed Q10.

    On 2026-10-22, at home, ``domusos.start_irrigation_zone`` ran from
    ``service_no_user_with_parent`` and succeeded; the P2.3 rules denied it
    with ``no_principal`` and counted ``would_block``. Under the Q10 rules the
    same call is a shadow allow, aligned with what it did.
    """
    contract = actions.ACTION_CONTRACTS["domusos.start_irrigation_zone"]
    decision = unattributed(contract.id, state=StoreState.READY)
    success = shadow.observe(contract, shadow.Origin.SERVICE_NO_USER_WITH_PARENT, decision, shadow.CurrentOutcome.SUCCESS)
    assert (success.allowed, success.principal_present, success.role) == (True, False, None)
    assert success.reason is Reason.ALLOWED_UNATTRIBUTED_HA_CONTEXT
    assert success.comparison is shadow.Comparison.ALIGNED_ALLOW
    # A failure of the zone itself stays a current error, never an authorization mismatch.
    failure = shadow.observe(contract, shadow.Origin.SERVICE_NO_USER_WITH_PARENT, decision, shadow.CurrentOutcome.ERROR)
    assert failure.comparison is shadow.Comparison.CURRENT_ERROR

    snapshot = snapshot_after([success, failure, failure])
    service = next(row for row in snapshot["services"] if row["action"] == contract.id)
    assert service == {
        "action": contract.id,
        "total": 3,
        "with_principal": 0,
        "without_principal": 3,
        "no_user_with_parent": 3,
        "no_user_without_parent": 0,
        "shadow_allow": 3,
        "shadow_deny": 0,
        "no_principal": 0,
        "current_success": 1,
        "current_deny": 0,
        "current_error": 2,
        "would_block": 0,
    }
    row = next(row for row in snapshot["by_action"] if row["action"] == contract.id)
    assert (row["shadow_allow"], row["shadow_deny"]) == (3, 0)
    assert row["reasons"] == {"allowed_unattributed_ha_context": 3}
    # No role is made up for the house: the existing "none".
    assert row["roles"] == {"none": 3}
    assert {"reason": "allowed_unattributed_ha_context", "count": 3} in snapshot["by_reason"]
    totals = snapshot["totals"]
    assert (totals["aligned_allow"], totals["current_error"], totals["would_block"]) == (1, 2, 0)
    # Only an aligned allow and a current error: nothing to report as a mismatch.
    assert snapshot["recent_mismatches"] == []


def test_a_call_without_a_parent_still_counts_as_a_would_block() -> None:
    contract = actions.ACTION_CONTRACTS["domusos.pause_irrigation"]
    decision = unattributed(contract.id, has_parent=False)
    observation = shadow.observe(contract, shadow.Origin.SERVICE_NO_USER_WITHOUT_PARENT, decision, shadow.CurrentOutcome.SUCCESS)
    service = next(row for row in snapshot_after([observation])["services"] if row["action"] == contract.id)
    assert (service["shadow_deny"], service["no_principal"], service["would_block"]) == (1, 1, 1)


def test_the_irrigation_services_stay_observed_only_and_the_rules_are_said() -> None:
    snapshot = snapshot_after([])
    assert (snapshot["mode"], snapshot["rules_version"]) == ("partial", 3)
    for action in IRRIGATION_SERVICES:
        assert actions.ACTION_CONTRACTS[action].enforced is False
        assert action not in snapshot["enforced_actions"]
        assert next(row for row in snapshot["by_action"] if row["action"] == action)["enforced"] is False
