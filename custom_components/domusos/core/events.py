"""Stable internal event envelope for Domus Core."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from uuid import uuid4

from ._values import (
    freeze_mapping,
    utc_now,
    validate_contract_type,
    validate_dotted_name,
    validate_identifier,
    validate_timestamp,
)


@dataclass(frozen=True, slots=True)
class DomusEvent:
    """Immutable event value object shared by future Domus modules."""

    event_id: str
    type: str
    source: str
    timestamp: datetime
    payload: Mapping[str, Any] = field(default_factory=dict)
    correlation_id: str | None = None

    def __post_init__(self) -> None:
        validate_identifier(self.event_id, field="event_id")
        validate_contract_type(self.type, field="event type")
        validate_dotted_name(self.source, field="event source")
        validate_timestamp(self.timestamp, field="event timestamp")
        if self.correlation_id is not None:
            validate_identifier(self.correlation_id, field="correlation_id")
        object.__setattr__(self, "payload", freeze_mapping(self.payload))

    @classmethod
    def create(
        cls,
        event_type: str,
        source: str,
        payload: Mapping[str, Any] | None = None,
        *,
        correlation_id: str | None = None,
        event_id: str | None = None,
        timestamp: datetime | None = None,
    ) -> DomusEvent:
        """Create an event with server-generated identity and time defaults."""
        return cls(
            event_id=event_id or uuid4().hex,
            type=event_type,
            source=source,
            timestamp=timestamp or utc_now(),
            payload=payload or {},
            correlation_id=correlation_id,
        )
