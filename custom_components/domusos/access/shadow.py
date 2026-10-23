"""Shadow authorization: what Access Control decides, measured on every observed request.

Each observed backend request is decided by the central evaluator. On an
action that is not enforced it then runs exactly as before, whatever the
decision (docs/access-control-shadow.md); on an enforced one a denial was
applied and the request never ran (docs/access-control-enforcement.md). This
module only counts: it compares each decision with what the request actually
did and keeps aggregate counters plus a short list of recent mismatches.

Everything stays in memory and a restart starts from zero. No user id, name,
person, payload or entity state is kept: an observation knows the action, the
decision's reason, the role, where the request came from and whether it had a
principal, never who it was.

Plain Python on purpose: no Home Assistant import.
"""

from __future__ import annotations

from collections import deque
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Any

from .actions import ActionContract, SurfaceKind, shadow_contracts
from .authorization import ALLOW_REASONS, AUTHORIZATION_RULES_VERSION, AuthorizationDecision, DecisionReason

MAX_RECENT_MISMATCHES = 50
# Every dimension is a closed set, so this is never reached in practice; it is the hard ceiling anyway.
MAX_COUNTER_KEYS = 2048

# Error codes by which today's checks refuse a request, as opposed to failing it:
# Home Assistant's ``unauthorized`` (require_admin, Unauthorized) and the
# permission errors of the Domus modules.
PERMISSION_ERROR_CODES = frozenset(
    {
        "unauthorized",
        "permission_denied",
        "access_denied",
        "not_household_account",
        "account_disabled",
    }
)


class CurrentOutcome(StrEnum):
    """What the request actually did, with today's checks."""

    SUCCESS = "success"
    # Refused by an existing check (administrators, entity permissions, own profile...).
    DENY = "deny"
    ERROR = "error"


class Comparison(StrEnum):
    ALIGNED_ALLOW = "aligned_allow"
    # Access Control would deny what runs today: what enforcement would change.
    WOULD_BLOCK = "would_block"
    # Access Control would allow what an existing check refuses today.
    CURRENT_STRICTER = "current_stricter"
    ALIGNED_DENY = "aligned_deny"
    CURRENT_ERROR = "current_error"
    # No decision, or the evaluator answered internal_error.
    SHADOW_ERROR = "shadow_error"
    # An enforced action Access Control refused: the denial was applied, the handler never ran.
    ENFORCED_DENY = "enforced_deny"


MISMATCHES = frozenset({Comparison.WOULD_BLOCK, Comparison.CURRENT_STRICTER, Comparison.SHADOW_ERROR})


class Origin(StrEnum):
    """Where a request came from, as Home Assistant attached it. Never an identity, never an authority."""

    WEBSOCKET = "websocket"
    SERVICE_WITH_USER = "service_with_user"
    # No user, but a parent context: typically an automation. Only makes the call
    # eligible for a service that opts in (Q10); it proves nothing about who.
    SERVICE_NO_USER_WITH_PARENT = "service_no_user_with_parent"
    SERVICE_NO_USER_WITHOUT_PARENT = "service_no_user_without_parent"


class WindowReason(StrEnum):
    STARTUP = "startup"
    POLICY_CHANGED = "policy_changed"
    MANUAL_RESET = "manual_reset"


def outcome_for_code(code: Any) -> CurrentOutcome:
    """A websocket error code or an exception's ``code``: a refusal, or a failure."""
    return CurrentOutcome.DENY if isinstance(code, str) and code in PERMISSION_ERROR_CODES else CurrentOutcome.ERROR


def compare(decision: AuthorizationDecision | None, outcome: CurrentOutcome, *, enforced: bool = False) -> Comparison:
    if enforced and not (isinstance(decision, AuthorizationDecision) and decision.allowed is True):
        # Enforced: any decision that is not an allow (including none at all) was a refusal.
        return Comparison.ENFORCED_DENY
    if not isinstance(decision, AuthorizationDecision) or decision.reason is DecisionReason.INTERNAL_ERROR:
        return Comparison.SHADOW_ERROR
    if outcome is CurrentOutcome.ERROR:
        return Comparison.CURRENT_ERROR
    if decision.allowed is True:
        return Comparison.ALIGNED_ALLOW if outcome is CurrentOutcome.SUCCESS else Comparison.CURRENT_STRICTER
    return Comparison.WOULD_BLOCK if outcome is CurrentOutcome.SUCCESS else Comparison.ALIGNED_DENY


@dataclass(frozen=True, slots=True)
class ShadowObservation:
    """One observed request, without anything that tells who made it."""

    action: str
    surface: SurfaceKind
    capability: str | None
    origin: Origin
    principal_present: bool
    allowed: bool
    # ``None`` when no decision could be taken at all.
    reason: DecisionReason | None
    role: str | None
    outcome: CurrentOutcome
    comparison: Comparison

    @property
    def key(self) -> tuple[Any, ...]:
        return (
            self.action,
            self.origin.value,
            self.principal_present,
            self.role,
            self.reason.value if self.reason is not None else None,
            self.outcome.value,
            self.comparison.value,
        )


def observe(
    contract: ActionContract,
    origin: Origin,
    decision: AuthorizationDecision | None,
    outcome: CurrentOutcome,
) -> ShadowObservation:
    """The observation of a decision and of what the request did; the decision's ids are dropped here."""
    valid = isinstance(decision, AuthorizationDecision)
    return ShadowObservation(
        action=contract.id,
        surface=contract.surface,
        capability=contract.capability,
        origin=origin,
        principal_present=valid and decision.principal_id is not None,
        allowed=valid and decision.allowed is True,
        reason=decision.reason if valid else None,
        role=decision.role.value if valid and decision.role is not None else None,
        outcome=outcome,
        comparison=compare(decision, outcome, enforced=contract.enforced),
    )


def _iso(moment: datetime) -> str:
    return moment.isoformat()


def _label(value: Any) -> str:
    return "none" if value is None else str(value)


def _sorted_counts(counts: dict[Any, int]) -> dict[str, int]:
    return {_label(key): counts[key] for key in sorted(counts, key=lambda key: (key is None, str(key)))}


class ShadowStats:
    """Aggregate counters of one observation window; bounded, in memory, synchronous.

    A window starts at startup, on a manual reset, and whenever the policy
    (its state or revision) changes, so the numbers always belong to one
    policy. A request decided in a window and answered in the next one is
    dropped, never counted against a policy it was not decided with.
    """

    def __init__(self, clock: Callable[[], datetime], contracts: Iterable[ActionContract] | None = None) -> None:
        self._clock = clock
        self._contracts = tuple(shadow_contracts() if contracts is None else contracts)
        self.session_started_at = clock()
        self._policy_key: tuple[str, int] | None = None
        self._generation = 0
        self._start_window(WindowReason.STARTUP)

    def _start_window(self, reason: WindowReason) -> None:
        self._generation += 1
        self._window_reason = reason
        self._started_at = self._clock()
        self._evaluated = 0
        self._observed = 0
        self._counters: dict[tuple[Any, ...], int] = {}
        self._recent: deque[dict[str, Any]] = deque(maxlen=MAX_RECENT_MISMATCHES)
        self._dropped_stale = 0
        self._dropped_overflow = 0
        self._instrumentation_failures = 0

    @property
    def generation(self) -> int:
        return self._generation

    def begin(self, policy_key: tuple[str, int] | None) -> int:
        """A request is about to be decided; returns the window it belongs to.

        ``policy_key`` is the policy's (state, revision), or None while the
        policy is not running: that alone never starts a new window, so a
        reload of the integration keeps the numbers.
        """
        if policy_key is not None:
            if self._policy_key is None:
                self._policy_key = policy_key
            elif policy_key != self._policy_key:
                self._policy_key = policy_key
                self._start_window(WindowReason.POLICY_CHANGED)
        self._evaluated += 1
        return self._generation

    def record(self, generation: int, observation: ShadowObservation) -> bool:
        if generation != self._generation:
            self._dropped_stale += 1
            return False
        self._observed += 1
        key = observation.key
        if key in self._counters:
            self._counters[key] += 1
        elif len(self._counters) < MAX_COUNTER_KEYS:
            self._counters[key] = 1
        else:
            self._dropped_overflow += 1
        if observation.comparison in MISMATCHES:
            self._recent.append(
                {
                    "at": _iso(self._clock()),
                    "action": observation.action,
                    "capability": observation.capability,
                    "origin": observation.origin.value,
                    "principal_present": observation.principal_present,
                    "reason": observation.reason.value if observation.reason is not None else None,
                    "role": observation.role,
                    "outcome": observation.outcome.value,
                    "comparison": observation.comparison.value,
                }
            )
        return True

    def instrumentation_failed(self) -> None:
        """The observation itself failed; the request ran anyway."""
        self._instrumentation_failures += 1

    def reset(self) -> None:
        self._start_window(WindowReason.MANUAL_RESET)

    def snapshot(self, *, policy_state: str | None, policy_revision: int | None) -> dict[str, Any]:
        """Everything counted in this window, in a stable order; built only when asked for."""
        comparisons = dict.fromkeys(Comparison, 0)
        reasons: dict[Any, int] = {}
        rows: dict[str, dict[str, Any]] = {}
        for contract in self._contracts:
            rows[contract.id] = {
                "action": contract.id,
                "surface": contract.surface.value,
                "capability": contract.capability,
                "enforced": contract.enforced,
                "total": 0,
                "shadow_allow": 0,
                "shadow_deny": 0,
                "outcomes": dict.fromkeys((outcome.value for outcome in CurrentOutcome), 0),
                "comparisons": dict.fromkeys((comparison.value for comparison in Comparison), 0),
                "reasons": {},
                "roles": {},
            }
        services = {
            contract.id: {
                "action": contract.id,
                "total": 0,
                "with_principal": 0,
                "without_principal": 0,
                "no_user_with_parent": 0,
                "no_user_without_parent": 0,
                "shadow_allow": 0,
                "shadow_deny": 0,
                "no_principal": 0,
                "current_success": 0,
                "current_deny": 0,
                "current_error": 0,
                "would_block": 0,
            }
            for contract in self._contracts
            if contract.surface is SurfaceKind.SERVICE
        }
        allow_reasons = {reason.value for reason in ALLOW_REASONS}
        for (action, origin, principal_present, role, reason, outcome, comparison), count in self._counters.items():
            comparisons[Comparison(comparison)] += count
            reasons[reason] = reasons.get(reason, 0) + count
            allowed = reason in allow_reasons
            row = rows.get(action)
            if row is not None:
                row["total"] += count
                row["shadow_allow" if allowed else "shadow_deny"] += count
                row["outcomes"][outcome] += count
                row["comparisons"][comparison] += count
                row["reasons"][reason] = row["reasons"].get(reason, 0) + count
                row["roles"][role] = row["roles"].get(role, 0) + count
            service = services.get(action)
            if service is not None:
                service["total"] += count
                service["with_principal" if principal_present else "without_principal"] += count
                if origin == Origin.SERVICE_NO_USER_WITH_PARENT.value:
                    service["no_user_with_parent"] += count
                elif origin == Origin.SERVICE_NO_USER_WITHOUT_PARENT.value:
                    service["no_user_without_parent"] += count
                service["shadow_allow" if allowed else "shadow_deny"] += count
                if reason == DecisionReason.NO_PRINCIPAL.value:
                    service["no_principal"] += count
                service[f"current_{outcome}"] += count
                if comparison == Comparison.WOULD_BLOCK.value:
                    service["would_block"] += count
        for row in rows.values():
            row["reasons"] = _sorted_counts(row["reasons"])
            row["roles"] = _sorted_counts(row["roles"])
        enforced_actions = sorted(contract.id for contract in self._contracts if contract.enforced)
        if not enforced_actions:
            mode = "shadow"
        elif len(enforced_actions) == len(self._contracts):
            mode = "enforced"
        else:
            # Some actions are refused for real, the others are only observed.
            mode = "partial"
        return {
            "mode": mode,
            # Whether any request can be refused for real; which ones, in enforced_actions.
            "enforced": bool(enforced_actions),
            "enforced_actions": enforced_actions,
            # The rules the decisions follow: numbers taken under different rules are not compared.
            "rules_version": AUTHORIZATION_RULES_VERSION,
            "session_started_at": _iso(self.session_started_at),
            "window": {
                "started_at": _iso(self._started_at),
                "reason": self._window_reason.value,
                "policy_state": self._policy_key[0] if self._policy_key is not None else None,
                "policy_revision": self._policy_key[1] if self._policy_key is not None else None,
            },
            "policy": {"state": policy_state, "revision": policy_revision},
            "totals": {
                "evaluated": self._evaluated,
                "observed": self._observed,
                # Decided but not answered yet (running, or a connection that went away).
                "pending": max(self._evaluated - self._observed, 0),
                **{comparison.value: comparisons[comparison] for comparison in Comparison},
                "instrumentation_failures": self._instrumentation_failures,
                "dropped_stale": self._dropped_stale,
                "dropped_overflow": self._dropped_overflow,
            },
            "by_action": [rows[action] for action in sorted(rows)],
            "by_reason": [
                {"reason": _label(reason), "count": count}
                for reason, count in sorted(reasons.items(), key=lambda item: (item[0] is None, str(item[0])))
            ],
            "services": [services[action] for action in sorted(services)],
            "recent_mismatches": list(self._recent),
            "limits": {
                "recent_mismatches": MAX_RECENT_MISMATCHES,
                "counter_keys": MAX_COUNTER_KEYS,
                "counter_keys_used": len(self._counters),
            },
        }
