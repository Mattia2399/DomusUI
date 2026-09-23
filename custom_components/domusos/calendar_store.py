"""Persistent event store used by the Domus UI calendar entity."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from copy import deepcopy
from datetime import date, datetime
from typing import Any
from uuid import uuid4

from homeassistant.components.calendar import CalendarEvent
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

CALENDAR_STORAGE_KEY = "domusos.calendar.v1"
CALENDAR_STORAGE_VERSION = 1


class DomusCalendarStore:
    """Own the editable Domus UI calendar and persist it in Home Assistant."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Initialize the calendar store."""
        self.hass = hass
        self.store: Store[dict[str, Any]] = Store(
            hass,
            CALENDAR_STORAGE_VERSION,
            CALENDAR_STORAGE_KEY,
        )
        self._events: list[dict[str, Any]] = []
        self._lock = asyncio.Lock()
        self._listeners: set[Callable[[], None]] = set()

    async def async_setup(self) -> None:
        """Load and normalize the persisted document."""
        document = await self.store.async_load()
        raw_events = document.get("events", []) if isinstance(document, dict) else []
        self._events = []
        if not isinstance(raw_events, list):
            return
        for raw_event in raw_events:
            normalized = self._normalize_stored_event(raw_event)
            if normalized is not None:
                self._events.append(normalized)
        self._events.sort(key=lambda item: item["start"])

    async def async_shutdown(self) -> None:
        """Release in-memory listeners during config entry unload."""
        self._listeners.clear()

    @callback
    def async_add_listener(self, listener: Callable[[], None]) -> Callable[[], None]:
        """Register a listener and return its unsubscribe callback."""
        self._listeners.add(listener)

        @callback
        def unsubscribe() -> None:
            self._listeners.discard(listener)

        return unsubscribe

    def events_between(self, start: datetime, end: datetime) -> list[CalendarEvent]:
        """Return events overlapping a local, timezone-aware interval."""
        return [
            event
            for stored in self._events
            if self._overlaps(stored, start, end)
            for event in [self._to_calendar_event(stored)]
        ]

    def next_event(self, now: datetime | None = None) -> CalendarEvent | None:
        """Return the current or next event."""
        reference = dt_util.as_local(now or dt_util.now())
        for stored in self._events:
            event = self._to_calendar_event(stored)
            if event.end_datetime_local > reference:
                return event
        return None

    async def async_create_event(self, event: dict[str, Any]) -> CalendarEvent:
        """Create and persist an event."""
        normalized = self._normalize_input_event(event, uid=uuid4().hex)
        async with self._lock:
            self._events.append(normalized)
            self._events.sort(key=lambda item: item["start"])
            await self._async_save_locked()
        self._notify()
        return self._to_calendar_event(normalized)

    async def async_update_event(
        self,
        uid: str,
        event: dict[str, Any],
    ) -> CalendarEvent:
        """Replace and persist an existing event."""
        normalized = self._normalize_input_event(event, uid=uid)
        async with self._lock:
            index = self._find_index(uid)
            if index is None:
                raise HomeAssistantError("Calendar event not found")
            self._events[index] = normalized
            self._events.sort(key=lambda item: item["start"])
            await self._async_save_locked()
        self._notify()
        return self._to_calendar_event(normalized)

    async def async_delete_event(self, uid: str) -> None:
        """Delete and persist an event."""
        async with self._lock:
            index = self._find_index(uid)
            if index is None:
                raise HomeAssistantError("Calendar event not found")
            self._events.pop(index)
            await self._async_save_locked()
        self._notify()

    def snapshot(self) -> list[dict[str, Any]]:
        """Return a defensive snapshot for diagnostics and tests."""
        return deepcopy(self._events)

    def _find_index(self, uid: str) -> int | None:
        for index, event in enumerate(self._events):
            if event["uid"] == uid:
                return index
        return None

    async def _async_save_locked(self) -> None:
        await self.store.async_save(
            {
                "version": CALENDAR_STORAGE_VERSION,
                "events": deepcopy(self._events),
            }
        )

    @callback
    def _notify(self) -> None:
        for listener in tuple(self._listeners):
            listener()

    @staticmethod
    def _normalize_stored_event(raw_event: Any) -> dict[str, Any] | None:
        if not isinstance(raw_event, dict):
            return None
        try:
            return DomusCalendarStore._normalize_input_event(
                raw_event,
                uid=str(raw_event.get("uid", "")).strip(),
                serialized=True,
            )
        except HomeAssistantError:
            return None

    @staticmethod
    def _normalize_input_event(
        raw_event: dict[str, Any],
        *,
        uid: str,
        serialized: bool = False,
    ) -> dict[str, Any]:
        if not uid:
            raise HomeAssistantError("Calendar event uid is required")
        if raw_event.get("rrule"):
            raise HomeAssistantError("Recurring events are not supported by Domus Calendar yet")

        start = DomusCalendarStore._parse_boundary(raw_event.get("start"), serialized)
        end = DomusCalendarStore._parse_boundary(raw_event.get("end"), serialized)
        if start is None or end is None:
            raise HomeAssistantError("Calendar event start and end are required")
        if isinstance(start, datetime) != isinstance(end, datetime):
            raise HomeAssistantError("Calendar event start and end must use the same type")
        if isinstance(start, datetime):
            if start.tzinfo is None or end.tzinfo is None:
                raise HomeAssistantError("Calendar event datetimes must include a timezone")
            start = dt_util.as_local(start)
            end = dt_util.as_local(end)
        if end <= start:
            raise HomeAssistantError("Calendar event end must be after its start")

        summary = str(raw_event.get("summary", "")).strip()
        if not summary:
            raise HomeAssistantError("Calendar event title is required")

        def optional_text(key: str) -> str | None:
            value = raw_event.get(key)
            if value is None:
                return None
            normalized = str(value).strip()
            return normalized or None

        return {
            "uid": uid,
            "start": start.isoformat(),
            "end": end.isoformat(),
            "all_day": not isinstance(start, datetime),
            "summary": summary,
            "description": optional_text("description"),
            "location": optional_text("location"),
        }

    @staticmethod
    def _parse_boundary(value: Any, serialized: bool) -> date | datetime | None:
        if isinstance(value, datetime):
            return value
        if isinstance(value, date):
            return value
        if not serialized or not isinstance(value, str):
            return None
        try:
            if "T" in value or " " in value:
                return datetime.fromisoformat(value)
            return date.fromisoformat(value)
        except ValueError:
            return None

    @staticmethod
    def _to_calendar_event(stored: dict[str, Any]) -> CalendarEvent:
        start = DomusCalendarStore._parse_boundary(stored["start"], True)
        end = DomusCalendarStore._parse_boundary(stored["end"], True)
        assert start is not None and end is not None
        return CalendarEvent(
            start=start,
            end=end,
            summary=stored["summary"],
            description=stored.get("description"),
            location=stored.get("location"),
            uid=stored["uid"],
        )

    @staticmethod
    def _overlaps(stored: dict[str, Any], start: datetime, end: datetime) -> bool:
        event = DomusCalendarStore._to_calendar_event(stored)
        return event.end_datetime_local > start and event.start_datetime_local < end
