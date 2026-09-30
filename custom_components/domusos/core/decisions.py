"""Data contracts for future Domus Intelligence decisions."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import uuid4

from ._values import (
    freeze_mapping,
    unique_identifiers,
    utc_now,
    validate_contract_type,
    validate_identifier,
    validate_timestamp,
)
from .actions import DomusAction


class DecisionMode(StrEnum):
    """How a future engine may surface or act on a decision."""

    AUTOMATIC = "automatic"
    ASSISTED = "assisted"
    INFORMATIVE = "informative"


@dataclass(frozen=True, slots=True)
class DomusDecision:
    """Explainable decision value object; no decision engine is implemented."""

    decision_id: str
    type: str
    mode: DecisionMode
    reason: str
    created_at: datetime
    expires_at: datetime | None = None
    context_references: tuple[str, ...] = ()
    proposed_actions: tuple[DomusAction, ...] = ()
    metadata: Mapping[str, Any] = field(default_factory=dict)
    correlation_id: str | None = None

    def __post_init__(self) -> None:
        validate_identifier(self.decision_id, field="decision_id")
        validate_contract_type(self.type, field="decision type")
        object.__setattr__(self, "mode", DecisionMode(self.mode))
        validate_identifier(self.reason, field="decision reason", maximum=2048)
        validate_timestamp(self.created_at, field="decision created_at")
        if self.expires_at is not None:
            validate_timestamp(self.expires_at, field="decision expires_at")
            if self.expires_at <= self.created_at:
                raise ValueError("decision expires_at must be after created_at")
        if self.correlation_id is not None:
            validate_identifier(self.correlation_id, field="correlation_id")
        object.__setattr__(
            self,
            "context_references",
            unique_identifiers(
                tuple(self.context_references), field="context reference"
            ),
        )
        actions = tuple(self.proposed_actions)
        if self.mode is DecisionMode.INFORMATIVE and actions:
            raise ValueError("informative decisions cannot propose actions")
        for action in actions:
            if not isinstance(action, DomusAction):
                raise TypeError("proposed_actions must contain DomusAction values")
            if (
                action.requesting_decision_id is not None
                and action.requesting_decision_id != self.decision_id
            ):
                raise ValueError("proposed action references a different decision")
        object.__setattr__(self, "proposed_actions", actions)
        object.__setattr__(self, "metadata", freeze_mapping(self.metadata))

    @classmethod
    def create(
        cls,
        decision_type: str,
        mode: DecisionMode,
        reason: str,
        *,
        expires_at: datetime | None = None,
        context_references: Sequence[str] = (),
        proposed_actions: Sequence[DomusAction] = (),
        metadata: Mapping[str, Any] | None = None,
        correlation_id: str | None = None,
        decision_id: str | None = None,
        created_at: datetime | None = None,
    ) -> DomusDecision:
        """Create a decision contract with server-generated defaults."""
        return cls(
            decision_id=decision_id or uuid4().hex,
            type=decision_type,
            mode=mode,
            reason=reason,
            created_at=created_at or utc_now(),
            expires_at=expires_at,
            context_references=tuple(context_references),
            proposed_actions=tuple(proposed_actions),
            metadata=metadata or {},
            correlation_id=correlation_id,
        )
