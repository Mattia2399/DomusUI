"""Bounded audit contracts and service for Domus Core."""

from __future__ import annotations

from collections import deque
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from uuid import uuid4

from ._values import (
    freeze_mapping,
    utc_now,
    validate_dotted_name,
    validate_identifier,
    validate_timestamp,
)

DEFAULT_MAX_AUDIT_ENTRIES = 500


@dataclass(frozen=True, slots=True)
class AuditEntry:
    """Explain why a Domus decision or action occurred and what resulted."""

    audit_id: str
    timestamp: datetime
    source: str
    reason: str
    decision_id: str | None = None
    action_id: str | None = None
    result: str | None = None
    correlation_id: str | None = None
    metadata: Mapping[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        validate_identifier(self.audit_id, field="audit_id")
        validate_timestamp(self.timestamp, field="audit timestamp")
        validate_dotted_name(self.source, field="audit source")
        validate_identifier(self.reason, field="audit reason", maximum=2048)
        for field_name in ("decision_id", "action_id", "correlation_id"):
            value = getattr(self, field_name)
            if value is not None:
                validate_identifier(value, field=field_name)
        if self.result is not None:
            validate_identifier(self.result, field="audit result", maximum=1024)
        object.__setattr__(self, "metadata", freeze_mapping(self.metadata))

    @classmethod
    def create(
        cls,
        source: str,
        reason: str,
        *,
        decision_id: str | None = None,
        action_id: str | None = None,
        result: str | None = None,
        correlation_id: str | None = None,
        metadata: Mapping[str, Any] | None = None,
        audit_id: str | None = None,
        timestamp: datetime | None = None,
    ) -> AuditEntry:
        """Create an audit entry with server-generated identity and time."""
        return cls(
            audit_id=audit_id or uuid4().hex,
            timestamp=timestamp or utc_now(),
            source=source,
            reason=reason,
            decision_id=decision_id,
            action_id=action_id,
            result=result,
            correlation_id=correlation_id,
            metadata=metadata or {},
        )


class DomusAuditService:
    """Keep a bounded in-memory audit until durable policy is defined."""

    def __init__(self, *, max_entries: int = DEFAULT_MAX_AUDIT_ENTRIES) -> None:
        if max_entries <= 0:
            raise ValueError("max_entries must be positive")
        self._entries: deque[AuditEntry] = deque(maxlen=max_entries)
        self._running = False

    @property
    def running(self) -> bool:
        """Return whether entries can be recorded."""
        return self._running

    @property
    def max_entries(self) -> int:
        """Return the hard in-memory retention bound."""
        return self._entries.maxlen or 0

    async def async_setup(self) -> None:
        """Start the audit service."""
        self._running = True

    async def async_shutdown(self) -> None:
        """Stop and discard this runtime's in-memory audit entries."""
        self._running = False
        self._entries.clear()

    def record(self, entry: AuditEntry) -> None:
        """Append an entry, pruning the oldest entry at the configured bound."""
        if not self._running:
            raise RuntimeError("Domus audit service is not running")
        self._entries.append(entry)

    def snapshot(
        self, *, correlation_id: str | None = None, limit: int | None = None
    ) -> tuple[AuditEntry, ...]:
        """Return an immutable newest-last audit snapshot."""
        if limit is not None and limit < 0:
            raise ValueError("limit cannot be negative")
        entries = tuple(
            entry
            for entry in self._entries
            if correlation_id is None or entry.correlation_id == correlation_id
        )
        if limit is None:
            return entries
        if limit == 0:
            return ()
        return entries[-limit:]
