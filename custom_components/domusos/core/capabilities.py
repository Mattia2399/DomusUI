"""Vendor-neutral capability adapter contracts for Domus Core."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Protocol, runtime_checkable

from ._values import (
    freeze_mapping,
    unique_identifiers,
    validate_dotted_name,
    validate_identifier,
    validate_timestamp,
)


@dataclass(frozen=True, slots=True)
class CapabilityState:
    """Normalized state emitted by a future vendor/entity adapter."""

    capability: str
    source: str
    observed_at: datetime
    available: bool
    values: Mapping[str, Any] = field(default_factory=dict)
    source_entity_ids: tuple[str, ...] = ()
    reason: str | None = None

    def __post_init__(self) -> None:
        validate_dotted_name(self.capability, field="capability")
        validate_dotted_name(self.source, field="capability source")
        validate_timestamp(self.observed_at, field="capability observed_at")
        if self.reason is not None:
            validate_identifier(self.reason, field="capability reason", maximum=255)
        object.__setattr__(self, "values", freeze_mapping(self.values))
        object.__setattr__(
            self,
            "source_entity_ids",
            unique_identifiers(tuple(self.source_entity_ids), field="source entity id"),
        )


@runtime_checkable
class CapabilityAdapter(Protocol):
    """Translate installation-specific HA entities into one Domus capability."""

    capability: str

    async def async_get_capability(self) -> CapabilityState:
        """Return the current normalized capability state."""
