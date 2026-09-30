"""Data contracts for proposed and future executed Domus actions."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import uuid4

from ._values import (
    freeze_mapping,
    validate_contract_type,
    validate_identifier,
    validate_timestamp,
)


class ActionStatus(StrEnum):
    """Lifecycle states represented by the action contract only."""

    PROPOSED = "proposed"
    AWAITING_CONFIRMATION = "awaiting_confirmation"
    AUTHORIZED = "authorized"
    EXECUTING = "executing"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


TERMINAL_ACTION_STATUSES = frozenset(
    {ActionStatus.SUCCEEDED, ActionStatus.FAILED, ActionStatus.CANCELLED}
)


@dataclass(frozen=True, slots=True)
class ActionResult:
    """Immutable terminal result associated with an action."""

    status: ActionStatus
    completed_at: datetime
    message: str | None = None
    data: Mapping[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        status = ActionStatus(self.status)
        if status not in TERMINAL_ACTION_STATUSES:
            raise ValueError("action results require a terminal status")
        object.__setattr__(self, "status", status)
        validate_timestamp(self.completed_at, field="action completed_at")
        if self.message is not None:
            validate_identifier(
                self.message, field="action result message", maximum=1024
            )
        object.__setattr__(self, "data", freeze_mapping(self.data))


@dataclass(frozen=True, slots=True)
class DomusAction:
    """Represent an action without granting permission to execute HA services."""

    action_id: str
    type: str
    target: str | None
    parameters: Mapping[str, Any] = field(default_factory=dict)
    requesting_decision_id: str | None = None
    safety_policy: str | None = None
    status: ActionStatus = ActionStatus.PROPOSED
    result: ActionResult | None = None
    correlation_id: str | None = None

    def __post_init__(self) -> None:
        validate_identifier(self.action_id, field="action_id")
        validate_contract_type(self.type, field="action type")
        if self.target is not None:
            validate_identifier(self.target, field="action target")
        if self.requesting_decision_id is not None:
            validate_identifier(
                self.requesting_decision_id, field="requesting_decision_id"
            )
        if self.safety_policy is not None:
            validate_identifier(self.safety_policy, field="safety_policy", maximum=128)
        if self.correlation_id is not None:
            validate_identifier(self.correlation_id, field="correlation_id")
        status = ActionStatus(self.status)
        object.__setattr__(self, "status", status)
        object.__setattr__(self, "parameters", freeze_mapping(self.parameters))
        if self.result is not None and self.result.status is not status:
            raise ValueError("action status must match its result status")
        if status in TERMINAL_ACTION_STATUSES and self.result is None:
            raise ValueError("terminal actions require a result")
        if status not in TERMINAL_ACTION_STATUSES and self.result is not None:
            raise ValueError("non-terminal actions cannot have a result")

    @classmethod
    def create(
        cls,
        action_type: str,
        *,
        target: str | None = None,
        parameters: Mapping[str, Any] | None = None,
        requesting_decision_id: str | None = None,
        safety_policy: str | None = None,
        status: ActionStatus = ActionStatus.PROPOSED,
        correlation_id: str | None = None,
        action_id: str | None = None,
    ) -> DomusAction:
        """Create a non-executing action representation."""
        return cls(
            action_id=action_id or uuid4().hex,
            type=action_type,
            target=target,
            parameters=parameters or {},
            requesting_decision_id=requesting_decision_id,
            safety_policy=safety_policy,
            status=status,
            correlation_id=correlation_id,
        )
