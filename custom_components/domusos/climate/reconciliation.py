"""Pure future command correlation contract. No command is created or issued here."""

from __future__ import annotations

import math
from collections.abc import Mapping
from datetime import datetime
from typing import Any, Literal, TypedDict

from .execution_plan import plan_is_current

CorrelationStatus = Literal["pending", "converged", "failed", "partial_failure", "superseded"]
FailureReason = Literal["service_call_failed", "entity_unavailable", "state_not_converged", "plan_stale", "capability_changed"]


class ClimateCommandCorrelation(TypedDict):
    correlationId: str
    planGeneration: str
    entityId: str
    issuedAt: str | None
    expectedState: dict[str, Any]
    status: CorrelationStatus
    reconciliationDeadline: str | None
    failureReason: FailureReason | None


def expected_state(plan: Mapping[str, Any]) -> dict[str, Any]:
    """Only fields changed by the symbolic plan belong to expected state."""
    expected: dict[str, Any] = {}
    for action in plan.get("actions", []):
        expected.update(action["expected"])
    return expected


def observed_matches_expected(expected: Mapping[str, Any], observed: Mapping[str, Any]) -> bool:
    if not expected or observed.get("available") is False:
        return False
    if "hvacMode" in expected and observed.get("hvacMode") != expected["hvacMode"]:
        return False
    if "targetTemperature" in expected:
        target = observed.get("targetTemperature")
        if type(target) not in (int, float) or not math.isfinite(target):
            return False
        if not math.isclose(target, expected["targetTemperature"], rel_tol=0, abs_tol=1e-4):
            return False
    return True


def same_desired_pending(correlation: Mapping[str, Any] | None, plan: Mapping[str, Any]) -> bool:
    """Future adapter must suppress an identical command while it is pending."""
    return bool(correlation and correlation.get("status") == "pending"
                and correlation.get("entityId") == plan.get("entityId")
                and correlation.get("expectedState") == expected_state(plan)
                and expected_state(plan))


def reconcile_command(correlation: Mapping[str, Any], observed: Mapping[str, Any], *,
                      current_plan: Mapping[str, Any] | None, config_revision: int,
                      state_revision: int, now: datetime) -> dict[str, Any]:
    """Classify fake/future command evidence without attributing external changes."""
    result = dict(correlation)
    if correlation.get("status") != "pending":
        return result
    if current_plan is None or correlation.get("planGeneration") != current_plan.get("planId"):
        result.update(status="superseded", failureReason=None)
        return result
    if correlation.get("entityId") != current_plan.get("entityId"):
        result.update(status="failed", failureReason="plan_stale")
        return result
    if not plan_is_current(current_plan, config_revision=config_revision, state_revision=state_revision,
                           current_plan=current_plan, now=now):
        result.update(status="failed", failureReason="plan_stale")
        return result
    if observed.get("available") is False:
        result.update(status="failed", failureReason="entity_unavailable")
        return result
    if observed_matches_expected(correlation["expectedState"], observed):
        result.update(status="converged", failureReason=None)
        return result
    deadline = correlation.get("reconciliationDeadline")
    if deadline is not None:
        try:
            expired = now >= datetime.fromisoformat(deadline)
        except (TypeError, ValueError):
            expired = True
        if expired:
            result.update(status="failed", failureReason="state_not_converged")
            return result
    result.update(status="pending", failureReason=None)
    return result
