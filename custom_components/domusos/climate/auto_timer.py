"""One cancelable timer for the next climate schedule or override boundary."""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any


class BoundaryTimer:
    def __init__(self, clock: Callable[[], datetime], schedule: Callable[[float, Callable[[], None]], Any], recompute: Callable[[], None]) -> None:
        self.clock = clock
        self.schedule = schedule
        self.recompute = recompute
        self.handle: Any = None
        self.scheduled_at: datetime | None = None
        self.scheduled_timezone: str | None = None

    def cancel(self) -> None:
        if self.handle is not None:
            self.handle.cancel()
            self.handle = None
        self.scheduled_at = None
        self.scheduled_timezone = None

    def update(self, resolution: dict[str, Any] | None, zone_name: str | None, override_expiries: list[datetime] | None = None) -> None:
        next_event = resolution.get("nextEvent") if resolution else None
        candidates = list(override_expiries or [])
        if next_event:
            candidates.append(datetime.fromisoformat(next_event["occursAt"]))
        when = min(candidates) if candidates else None
        if when is None:
            self.cancel()
            return
        if self.handle is not None and self.scheduled_at == when and self.scheduled_timezone == zone_name:
            return
        self.cancel()
        self.scheduled_at = when
        self.scheduled_timezone = zone_name
        delay = max(0.001, (when - self.clock().astimezone(UTC)).total_seconds())
        self.handle = self.schedule(delay, self._fire)

    def _fire(self) -> None:
        self.handle = None
        self.scheduled_at = None
        self.scheduled_timezone = None
        self.recompute()
