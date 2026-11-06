"""Explicit room reference freshness policy. HA timestamps are only an opted-in proxy."""

from __future__ import annotations

from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any


def assess_freshness(state: Any, reference: Mapping[str, Any], now: datetime | None) -> str:
    """Return verified, stale or unknown; never claim a physical sample timestamp."""
    if reference.get("freshnessPolicy", "none") != "max_age":
        return "unknown"
    stamp = getattr(state, "last_updated", None)
    if not isinstance(stamp, datetime) or stamp.tzinfo is None or now is None or now.tzinfo is None:
        return "unknown"
    age = (now.astimezone(UTC) - stamp.astimezone(UTC)).total_seconds()
    if age < 0:
        return "unknown"
    return "verified" if age <= reference["maxAgeSeconds"] else "stale"
