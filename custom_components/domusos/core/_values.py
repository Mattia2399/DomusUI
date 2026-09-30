"""Shared validation and immutable-value helpers for Domus Core contracts."""

from __future__ import annotations

import re
from collections.abc import Mapping
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from enum import Enum
from types import MappingProxyType
from typing import Any
from uuid import UUID

_CONTRACT_TYPE_PATTERN = re.compile(r"^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$")
_DOTTED_NAME_PATTERN = re.compile(r"^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$")


def utc_now() -> datetime:
    """Return an aware UTC timestamp."""
    return datetime.now(timezone.utc)


def validate_contract_type(value: str, *, field: str) -> str:
    """Validate the stable ``<domain>.<event-or-action>`` convention."""
    if not isinstance(value, str) or not _CONTRACT_TYPE_PATTERN.fullmatch(value):
        raise ValueError(f"{field} must use the <domain>.<name> convention")
    return value


def validate_dotted_name(value: str, *, field: str) -> str:
    """Validate a lower-case dotted capability or source name."""
    if not isinstance(value, str) or not _DOTTED_NAME_PATTERN.fullmatch(value):
        raise ValueError(f"{field} must be a lower-case dotted name")
    return value


def validate_identifier(value: str, *, field: str, maximum: int = 160) -> str:
    """Validate a non-empty bounded identifier without assigning semantics."""
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        raise ValueError(
            f"{field} must be a non-empty string up to {maximum} characters"
        )
    return value


def validate_timestamp(value: datetime, *, field: str) -> datetime:
    """Require timezone-aware timestamps in every cross-service contract."""
    if not isinstance(value, datetime) or value.tzinfo is None:
        raise ValueError(f"{field} must be a timezone-aware datetime")
    return value


def freeze_value(value: Any) -> Any:
    """Defensively freeze ordinary nested contract data.

    Domus contracts intentionally carry data rather than behavior. Mappings,
    sequences and sets are recursively converted to immutable equivalents;
    only known immutable scalar values are accepted.
    """
    if isinstance(value, Mapping):
        frozen: dict[str, Any] = {}
        for key, item in value.items():
            if not isinstance(key, str):
                raise TypeError("Domus contract mapping keys must be strings")
            frozen[key] = freeze_value(item)
        return MappingProxyType(frozen)
    if isinstance(value, (list, tuple)):
        return tuple(freeze_value(item) for item in value)
    if isinstance(value, (set, frozenset)):
        return frozenset(freeze_value(item) for item in value)
    if value is None or isinstance(
        value,
        (
            str,
            int,
            float,
            bool,
            bytes,
            date,
            datetime,
            time,
            timedelta,
            Decimal,
            UUID,
            Enum,
        ),
    ):
        return value
    raise TypeError(f"Unsupported mutable Domus contract value: {type(value).__name__}")


def freeze_mapping(value: Mapping[str, Any] | None) -> Mapping[str, Any]:
    """Return an immutable defensive copy of a string-keyed mapping."""
    return freeze_value(value or {})


def unique_identifiers(values: tuple[str, ...], *, field: str) -> tuple[str, ...]:
    """Validate, de-duplicate and preserve the order of identifiers."""
    result: list[str] = []
    for value in values:
        validated = validate_identifier(value, field=field)
        if validated not in result:
            result.append(validated)
    return tuple(result)
