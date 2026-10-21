"""Shadow authorization counters, without Home Assistant.

What Access Control would decide is compared with what the request did, and
only counted: in memory, bounded, without anyone's identity.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
import json
import random
import time

import pytest

from access_pure import load

models = load("models")
actions = load("actions")
authorization = load("authorization")
shadow = load("shadow")

Reason = authorization.DecisionReason
Outcome = shadow.CurrentOutcome
Comparison = shadow.Comparison
Origin = shadow.Origin
NOW = "2026-10-21T10:00:00+00:00"
MEMBER = models.Principal(user_id="b" * 32, is_admin=False)
ADMIN = models.Principal(user_id="a" * 32, is_admin=True)
CONTRACTS = actions.ACTION_CONTRACTS
GET_STATE = CONTRACTS["domusos/energy/get_state"]
SAVE_PROFILE = CONTRACTS["domusos/energy/save_profile"]
PAUSE = CONTRACTS["domusos.pause_irrigation"]
WASTE = CONTRACTS["domusos/waste_collection/get_config"]


class Clock:
    def __init__(self) -> None:
        self.now = datetime(2026, 10, 21, 10, 0, tzinfo=UTC)

    def __call__(self) -> datetime:
        self.now += timedelta(seconds=1)
        return self.now


def stats() -> shadow.ShadowStats:
    return shadow.ShadowStats(Clock())


def profile(principal, state=models.StoreState.ABSENT):
    return models.resolve_access_profile(principal, state, None)


def decision(principal, contract, state=models.StoreState.ABSENT):
    return authorization.authorize_action(principal, profile(principal, state), contract.id)


def allow(contract=GET_STATE):
    return decision(MEMBER, contract)


def deny(contract=SAVE_PROFILE):
    return decision(MEMBER, contract)


def no_principal(contract=PAUSE):
    return authorization.deny(Reason.NO_PRINCIPAL, action=contract.id)


def feed(counters, contract, made, outcome, origin=Origin.WEBSOCKET, policy=("absent", 0)):
    generation = counters.begin(policy)
    return counters.record(generation, shadow.observe(contract, origin, made, outcome))


def row(snapshot, action):
    return next(entry for entry in snapshot["by_action"] if entry["action"] == action)


def snap(counters):
    return counters.snapshot(policy_state="absent", policy_revision=0)


# --- Comparison -----------------------------------------------------------------------


def test_the_engine_decisions_used_here_are_what_p2_2_decides() -> None:
    assert allow().allowed and allow().reason is Reason.ALLOWED
    assert not deny().allowed and deny().reason is Reason.REQUIRES_HA_ADMIN


@pytest.mark.parametrize(
    ("made", "outcome", "expected"),
    [
        (allow, Outcome.SUCCESS, Comparison.ALIGNED_ALLOW),
        (deny, Outcome.SUCCESS, Comparison.WOULD_BLOCK),
        (allow, Outcome.DENY, Comparison.CURRENT_STRICTER),
        (deny, Outcome.DENY, Comparison.ALIGNED_DENY),
        (allow, Outcome.ERROR, Comparison.CURRENT_ERROR),
        (deny, Outcome.ERROR, Comparison.CURRENT_ERROR),
        (no_principal, Outcome.SUCCESS, Comparison.WOULD_BLOCK),
    ],
)
def test_each_decision_and_outcome_has_its_category(made, outcome, expected) -> None:
    assert shadow.compare(made(), outcome) is expected


@pytest.mark.parametrize("outcome", list(Outcome))
def test_no_decision_or_an_internal_error_is_a_shadow_error_whatever_happened(outcome) -> None:
    assert shadow.compare(None, outcome) is Comparison.SHADOW_ERROR
    assert shadow.compare(authorization.deny(Reason.INTERNAL_ERROR, action="x"), outcome) is Comparison.SHADOW_ERROR
    assert shadow.compare("allowed", outcome) is Comparison.SHADOW_ERROR


def test_the_engine_still_fails_closed_shadow_only_does_not_apply_it() -> None:
    broken = authorization.authorize_action(MEMBER, object(), "domusos/energy/get_state")
    assert not broken.allowed and broken.reason is Reason.INTERNAL_ERROR
    # Counted as a shadow error, never as a request Access Control would legitimately refuse.
    assert shadow.compare(broken, Outcome.SUCCESS) is Comparison.SHADOW_ERROR
    assert authorization.authorize_action(MEMBER, profile(MEMBER), "domusos/energy/nope").reason is Reason.UNKNOWN_ACTION


@pytest.mark.parametrize(
    ("code", "expected"),
    [
        ("unauthorized", Outcome.DENY),
        ("permission_denied", Outcome.DENY),
        ("access_denied", Outcome.DENY),
        ("not_household_account", Outcome.DENY),
        ("account_disabled", Outcome.DENY),
        ("energy_unavailable", Outcome.ERROR),
        ("unknown_error", Outcome.ERROR),
        ("revision_conflict", Outcome.ERROR),
        (None, Outcome.ERROR),
        (403, Outcome.ERROR),
        (["unauthorized"], Outcome.ERROR),
    ],
)
def test_error_codes_are_a_refusal_only_when_they_say_so(code, expected) -> None:
    assert shadow.outcome_for_code(code) is expected


# --- Observations and privacy -------------------------------------------------------------


def test_an_observation_keeps_no_identity() -> None:
    made = allow()
    assert made.principal_id == MEMBER.user_id
    observation = shadow.observe(GET_STATE, Origin.WEBSOCKET, made, Outcome.SUCCESS)
    assert observation.principal_present is True and observation.role == "member"
    fields = set(shadow.ShadowObservation.__slots__)
    assert fields == {
        "action", "surface", "capability", "origin", "principal_present", "allowed", "reason", "role", "outcome", "comparison",
    }
    assert MEMBER.user_id not in repr(observation) and MEMBER.user_id not in repr(observation.key)


def test_nothing_identifying_ever_reaches_the_diagnostics() -> None:
    counters = stats()
    for _ in range(3):
        feed(counters, SAVE_PROFILE, decision(MEMBER, SAVE_PROFILE), Outcome.SUCCESS)
        feed(counters, SAVE_PROFILE, decision(ADMIN, SAVE_PROFILE), Outcome.SUCCESS)
        feed(counters, PAUSE, no_principal(), Outcome.SUCCESS, Origin.SERVICE_NO_USER_WITH_PARENT)
    text = json.dumps(snap(counters))
    for secret in (MEMBER.user_id, ADMIN.user_id, "user_id", "principal_id", "person", "name", "payload", "entity_id"):
        assert secret not in text, secret


def test_without_a_decision_the_observation_is_a_shadow_error_without_reason() -> None:
    observation = shadow.observe(GET_STATE, Origin.WEBSOCKET, None, Outcome.SUCCESS)
    assert observation.comparison is Comparison.SHADOW_ERROR and observation.reason is None
    assert observation.principal_present is False and observation.allowed is False


# --- Counters ---------------------------------------------------------------------------


def test_counters_follow_every_category() -> None:
    counters = stats()
    feed(counters, GET_STATE, allow(), Outcome.SUCCESS)
    feed(counters, GET_STATE, allow(), Outcome.SUCCESS)
    feed(counters, SAVE_PROFILE, deny(), Outcome.SUCCESS)
    feed(counters, GET_STATE, allow(), Outcome.DENY)
    feed(counters, SAVE_PROFILE, deny(), Outcome.DENY)
    feed(counters, GET_STATE, allow(), Outcome.ERROR)
    feed(counters, GET_STATE, None, Outcome.SUCCESS)
    totals = snap(counters)["totals"]
    assert totals == {
        "evaluated": 7,
        "observed": 7,
        "pending": 0,
        "aligned_allow": 2,
        "would_block": 1,
        "current_stricter": 1,
        "aligned_deny": 1,
        "current_error": 1,
        "shadow_error": 1,
        "instrumentation_failures": 0,
        "dropped_stale": 0,
        "dropped_overflow": 0,
    }
    state = row(snap(counters), GET_STATE.id)
    assert state["total"] == 5 and state["shadow_allow"] == 4 and state["shadow_deny"] == 1
    assert state["outcomes"] == {"success": 3, "deny": 1, "error": 1}
    assert state["reasons"] == {"allowed": 4, "none": 1}
    assert state["roles"] == {"member": 4, "none": 1}
    save = row(snap(counters), SAVE_PROFILE.id)
    assert save["comparisons"]["would_block"] == 1 and save["comparisons"]["aligned_deny"] == 1
    assert save["reasons"] == {"requires_ha_admin": 2} and save["capability"] == "energy.manage"


def test_a_request_decided_but_not_answered_is_pending() -> None:
    counters = stats()
    counters.begin(("absent", 0))
    feed(counters, GET_STATE, allow(), Outcome.SUCCESS)
    totals = snap(counters)["totals"]
    assert (totals["evaluated"], totals["observed"], totals["pending"]) == (2, 1, 1)


def test_instrumentation_failures_are_counted_apart() -> None:
    counters = stats()
    counters.instrumentation_failed()
    assert snap(counters)["totals"]["instrumentation_failures"] == 1


def test_by_reason_adds_up_across_actions() -> None:
    counters = stats()
    feed(counters, SAVE_PROFILE, deny(), Outcome.DENY)
    feed(counters, CONTRACTS["domusos/device_power/get_state"], deny(CONTRACTS["domusos/device_power/get_state"]), Outcome.DENY)
    feed(counters, PAUSE, no_principal(), Outcome.SUCCESS, Origin.SERVICE_NO_USER_WITHOUT_PARENT)
    assert snap(counters)["by_reason"] == [
        {"reason": "no_principal", "count": 1},
        {"reason": "requires_ha_admin", "count": 2},
    ]


# --- What Q10 needs -----------------------------------------------------------------------


def test_services_without_a_principal_are_counted_for_q10() -> None:
    counters = stats()
    admin_pause = decision(ADMIN, PAUSE)
    assert admin_pause.allowed
    feed(counters, PAUSE, no_principal(), Outcome.SUCCESS, Origin.SERVICE_NO_USER_WITH_PARENT)
    feed(counters, PAUSE, no_principal(), Outcome.SUCCESS, Origin.SERVICE_NO_USER_WITH_PARENT)
    feed(counters, PAUSE, no_principal(), Outcome.SUCCESS, Origin.SERVICE_NO_USER_WITHOUT_PARENT)
    feed(counters, PAUSE, no_principal(), Outcome.ERROR, Origin.SERVICE_NO_USER_WITHOUT_PARENT)
    feed(counters, PAUSE, admin_pause, Outcome.SUCCESS, Origin.SERVICE_WITH_USER)
    feed(counters, PAUSE, authorization.deny(Reason.INVALID_PRINCIPAL, action=PAUSE.id), Outcome.ERROR, Origin.SERVICE_WITH_USER)
    services = snap(counters)["services"]
    assert [entry["action"] for entry in services] == sorted(contract.id for contract in actions.contracts_for(actions.SurfaceKind.SERVICE))
    pause = next(entry for entry in services if entry["action"] == PAUSE.id)
    assert pause == {
        "action": PAUSE.id,
        "total": 6,
        "with_principal": 1,
        "without_principal": 5,
        "no_user_with_parent": 2,
        "no_user_without_parent": 2,
        "shadow_allow": 1,
        "shadow_deny": 5,
        "no_principal": 4,
        "current_success": 4,
        "current_deny": 0,
        "current_error": 2,
        "would_block": 3,
    }
    untouched = next(entry for entry in services if entry["action"] == "domusos.stop_all_irrigation")
    assert untouched["total"] == 0


# --- Windows: reset and policy changes ------------------------------------------------


def test_a_manual_reset_starts_a_clean_window() -> None:
    counters = stats()
    feed(counters, SAVE_PROFILE, deny(), Outcome.SUCCESS)
    before = snap(counters)
    assert before["window"]["reason"] == "startup" and before["totals"]["would_block"] == 1
    generation = counters.begin(("absent", 0))
    counters.reset()
    after = snap(counters)
    assert after["window"]["reason"] == "manual_reset"
    assert after["window"]["started_at"] > before["window"]["started_at"]
    assert after["session_started_at"] == before["session_started_at"]
    assert all(value == 0 for value in after["totals"].values())
    assert after["recent_mismatches"] == [] and all(entry["total"] == 0 for entry in after["by_action"])
    # A request decided before the reset and answered after it is not counted in the new window.
    assert counters.record(generation, shadow.observe(SAVE_PROFILE, Origin.WEBSOCKET, deny(), Outcome.SUCCESS)) is False
    assert snap(counters)["totals"]["observed"] == 0 and snap(counters)["totals"]["dropped_stale"] == 1


def test_a_policy_change_starts_a_new_window() -> None:
    counters = stats()
    feed(counters, GET_STATE, allow(), Outcome.SUCCESS, policy=("ready", 3))
    feed(counters, GET_STATE, allow(), Outcome.SUCCESS, policy=("ready", 3))
    assert snap(counters)["totals"]["observed"] == 2
    feed(counters, GET_STATE, allow(), Outcome.SUCCESS, policy=("ready", 4))
    window = snap(counters)["window"]
    assert (window["reason"], window["policy_state"], window["policy_revision"]) == ("policy_changed", "ready", 4)
    assert snap(counters)["totals"]["observed"] == 1
    feed(counters, GET_STATE, allow(), Outcome.SUCCESS, policy=("corrupt", 4))
    assert snap(counters)["window"]["policy_state"] == "corrupt" and snap(counters)["totals"]["observed"] == 1


def test_a_policy_that_is_not_running_never_resets_the_window() -> None:
    counters = stats()
    feed(counters, GET_STATE, allow(), Outcome.SUCCESS, policy=None)
    assert snap(counters)["window"]["policy_state"] is None
    # The policy appears (integration loaded): adopted, nothing lost.
    feed(counters, GET_STATE, allow(), Outcome.SUCCESS, policy=("absent", 0))
    # A reload: the policy is gone for a moment, then back as it was.
    feed(counters, GET_STATE, deny(GET_STATE), Outcome.SUCCESS, policy=None)
    feed(counters, GET_STATE, allow(), Outcome.SUCCESS, policy=("absent", 0))
    result = snap(counters)
    assert result["window"]["reason"] == "startup" and result["totals"]["observed"] == 4
    assert (result["window"]["policy_state"], result["window"]["policy_revision"]) == ("absent", 0)


def test_the_snapshot_reports_the_current_policy_apart_from_the_window() -> None:
    result = stats().snapshot(policy_state="corrupt", policy_revision=7)
    assert result["policy"] == {"state": "corrupt", "revision": 7}
    assert result["mode"] == "shadow" and result["enforced"] is False


# --- Bounds ---------------------------------------------------------------------------


def test_recent_samples_are_mismatches_only_and_never_more_than_the_limit() -> None:
    counters = stats()
    for index in range(1000):
        feed(counters, GET_STATE, allow(), Outcome.SUCCESS)
        feed(counters, SAVE_PROFILE, deny(), Outcome.SUCCESS)
        feed(counters, GET_STATE, allow(), Outcome.DENY)
        feed(counters, GET_STATE, None, Outcome.SUCCESS)
        feed(counters, GET_STATE, allow(), Outcome.ERROR)
    result = snap(counters)
    recent = result["recent_mismatches"]
    assert len(recent) == shadow.MAX_RECENT_MISMATCHES == 50
    assert {sample["comparison"] for sample in recent} == {"would_block", "current_stricter", "shadow_error"}
    assert set(recent[0]) == {"at", "action", "capability", "origin", "principal_present", "reason", "role", "outcome", "comparison"}
    assert [sample["at"] for sample in recent] == sorted(sample["at"] for sample in recent)
    assert result["totals"]["aligned_allow"] == 1000 and result["totals"]["would_block"] == 1000
    assert result["totals"]["current_stricter"] == 1000 and result["totals"]["shadow_error"] == 1000
    assert result["totals"]["current_error"] == 1000 and result["totals"]["observed"] == 5000
    assert result["limits"]["counter_keys_used"] == 5


def test_the_counter_keys_have_a_hard_ceiling(monkeypatch) -> None:
    monkeypatch.setattr(shadow, "MAX_COUNTER_KEYS", 2)
    counters = stats()
    feed(counters, GET_STATE, allow(), Outcome.SUCCESS)
    feed(counters, GET_STATE, allow(), Outcome.ERROR)
    feed(counters, GET_STATE, allow(), Outcome.DENY)
    feed(counters, GET_STATE, allow(), Outcome.SUCCESS)
    totals = snap(counters)["totals"]
    assert totals["observed"] == 4 and totals["dropped_overflow"] == 1
    assert snap(counters)["limits"]["counter_keys_used"] == 2


def test_every_dimension_of_a_key_is_a_closed_set() -> None:
    """No user id, timestamp or free text: the number of keys cannot grow with traffic."""
    counters = stats()
    for _ in range(200):
        for contract in actions.shadow_contracts():
            for principal in (MEMBER, ADMIN):
                feed(counters, contract, decision(principal, contract), random.choice(list(Outcome)))
    assert snap(counters)["limits"]["counter_keys_used"] <= len(actions.shadow_contracts()) * 2 * len(Outcome)


# --- Shape --------------------------------------------------------------------------------


def test_every_observed_action_has_a_row_and_no_exempt_one_does() -> None:
    result = snap(stats())
    observed = sorted(contract.id for contract in actions.shadow_contracts())
    assert [entry["action"] for entry in result["by_action"]] == observed
    assert len(observed) == 36
    for exempt in ("domusos/access/get_self", "domusos/access/reset_policy", "domusos/access/get_shadow_diagnostics"):
        assert exempt not in observed


def test_the_snapshot_is_deterministic_and_json() -> None:
    plan = [
        (GET_STATE, allow(), Outcome.SUCCESS),
        (SAVE_PROFILE, deny(), Outcome.DENY),
        (WASTE, decision(MEMBER, WASTE, models.StoreState.CORRUPT), Outcome.SUCCESS),
        (PAUSE, no_principal(), Outcome.SUCCESS),
    ] * 5
    first, second = stats(), stats()
    for contract, made, outcome in plan:
        feed(first, contract, made, outcome)
    for contract, made, outcome in reversed(plan):
        feed(second, contract, made, outcome)
    one, two = snap(first), snap(second)
    one.pop("recent_mismatches"), two.pop("recent_mismatches")
    assert json.dumps(one) == json.dumps(two)
    json.loads(json.dumps(snap(first)))


def test_a_corrupt_policy_is_observed_as_locked_and_absent_as_the_defaults() -> None:
    counters = stats()
    locked = decision(MEMBER, WASTE, models.StoreState.CORRUPT)
    assert not locked.allowed and locked.reason is Reason.LOCKED
    feed(counters, WASTE, locked, Outcome.SUCCESS, policy=("corrupt", 0))
    assert row(snap(counters), WASTE.id)["roles"] == {"locked": 1}
    assert snap(counters)["recent_mismatches"][0]["reason"] == "locked"
    assert decision(MEMBER, WASTE).role is models.RoleId.MEMBER
    assert decision(ADMIN, SAVE_PROFILE).role is models.RoleId.ADMIN and decision(ADMIN, SAVE_PROFILE).allowed


# --- Cost ---------------------------------------------------------------------------------


def test_recording_is_cheap() -> None:
    """Not a benchmark: a guard against an absurd cost on every request."""
    counters = stats()
    made = allow()
    observation = shadow.observe(GET_STATE, Origin.WEBSOCKET, made, Outcome.SUCCESS)
    started = time.perf_counter()
    for _ in range(100_000):
        counters.record(counters.begin(("absent", 0)), observation)
    elapsed = time.perf_counter() - started
    assert snap(counters)["totals"]["observed"] == 100_000
    assert elapsed < 5, elapsed


def test_a_full_shadow_decision_is_cheap() -> None:
    counters = stats()
    started = time.perf_counter()
    for _ in range(10_000):
        made = authorization.authorize_action(MEMBER, profile(MEMBER), GET_STATE.id)
        counters.record(counters.begin(("absent", 0)), shadow.observe(GET_STATE, Origin.WEBSOCKET, made, Outcome.SUCCESS))
    elapsed = time.perf_counter() - started
    assert elapsed < 5, elapsed
