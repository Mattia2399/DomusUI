"""Read-only context providers backed by existing authoritative managers."""

from __future__ import annotations

from collections.abc import Callable, Iterable, Mapping
from datetime import date, datetime
from typing import Any

from homeassistant.components.calendar import CalendarEvent
from homeassistant.core import HomeAssistant, callback

from .calendar_store import DomusCalendarStore
from .core import DomusEvent, DomusRuntime
from .irrigation import IrrigationManager

ACTIVE_IRRIGATION_STATES = frozenset({"opening", "running", "closing"})


class CalendarContextProvider:
    """Project the next stored calendar event into Domus context."""

    capability = "calendar"

    def __init__(self, store: DomusCalendarStore) -> None:
        self._store = store

    async def async_get_context(self) -> Mapping[str, Any]:
        """Return the current read-only Calendar context."""
        event = self._store.next_event()
        return {
            "available": True,
            "next_event": self._normalize_event(event) if event is not None else None,
        }

    @staticmethod
    def _normalize_event(event: CalendarEvent) -> dict[str, Any]:
        return {
            "uid": event.uid,
            "summary": event.summary,
            "start": _serialize_boundary(event.start),
            "end": _serialize_boundary(event.end),
            "all_day": event.all_day,
            "location": event.location,
        }


class IrrigationContextProvider:
    """Project the public IrrigationManager snapshot into Domus context."""

    capability = "irrigation"

    def __init__(self, manager: IrrigationManager) -> None:
        self._manager = manager

    async def async_get_context(self) -> Mapping[str, Any] | None:
        """Return normalized state without duplicating irrigation ownership."""
        state = self._manager.state_for_user(None)
        if not isinstance(state, Mapping) or state.get("available") is not True:
            return None

        sessions = tuple(
            normalized
            for item in state.get("sessions", ())
            if isinstance(item, Mapping)
            for normalized in (self._normalize_session(item),)
            if normalized is not None
        )
        active_zone_ids = _unique_zone_ids(
            session
            for session in sessions
            if session["state"] in ACTIVE_IRRIGATION_STATES
        )
        queued_zone_ids = _unique_zone_ids(
            session for session in sessions if session["state"] == "queued"
        )
        mode = str(state.get("mode") or "stopped")
        revision = state.get("revision", 0)
        rain = state.get("rain")

        return {
            "available": True,
            "revision": revision
            if isinstance(revision, int) and not isinstance(revision, bool)
            else 0,
            "mode": mode,
            "running": bool(active_zone_ids),
            "paused": mode == "paused",
            "fault": mode == "fault",
            "active_zone_ids": active_zone_ids,
            "queued_zone_ids": queued_zone_ids,
            "sessions": sessions,
            "rain": self._normalize_rain(rain),
            "observed_at": _optional_string(state.get("serverTime")),
        }

    @staticmethod
    def _normalize_session(session: Mapping[str, Any]) -> dict[str, Any] | None:
        zone_id = _optional_string(session.get("zoneId"))
        state = _optional_string(session.get("state"))
        if zone_id is None or state is None:
            return None
        duration = session.get("durationMin")
        remaining = session.get("remainingSeconds")
        return {
            "session_id": _optional_string(session.get("id")),
            "zone_id": zone_id,
            "state": state,
            "source": _optional_string(session.get("source")),
            "started_at": _optional_string(session.get("startedAt")),
            "deadline": _optional_string(session.get("deadline")),
            "duration_min": duration
            if isinstance(duration, int) and not isinstance(duration, bool)
            else None,
            "remaining_seconds": remaining
            if isinstance(remaining, int) and not isinstance(remaining, bool)
            else None,
            "reason": _optional_string(session.get("reason")),
        }

    @staticmethod
    def _normalize_rain(value: Any) -> dict[str, Any]:
        rain = value if isinstance(value, Mapping) else {}
        return {
            "enabled": rain.get("enabled") is True,
            "active": rain.get("active") is True,
            "available": rain.get("available") is True,
            "blocked": rain.get("blocked") is True,
            "reason": _optional_string(rain.get("reason")),
        }


def register_core_bindings(
    hass: HomeAssistant,
    runtime: DomusRuntime,
    calendar_store: DomusCalendarStore,
    irrigation_manager: IrrigationManager,
) -> Callable[[], None]:
    """Register real providers and transition notifications as one lifecycle unit."""
    unsubscribers: list[Callable[[], None]] = []

    @callback
    def publish_calendar_changed() -> None:
        _publish_event(
            hass,
            runtime,
            DomusEvent.create("calendar.changed", "calendar.store"),
        )

    @callback
    def publish_irrigation_changed(_update: dict[str, Any]) -> None:
        _publish_event(
            hass,
            runtime,
            DomusEvent.create("irrigation.state_changed", "irrigation.manager"),
        )

    try:
        unsubscribers.append(
            runtime.context.register(CalendarContextProvider(calendar_store))
        )
        unsubscribers.append(
            runtime.context.register(IrrigationContextProvider(irrigation_manager))
        )
        unsubscribers.append(
            calendar_store.async_add_listener(publish_calendar_changed)
        )
        unsubscribers.append(
            irrigation_manager.async_subscribe(publish_irrigation_changed)
        )
    except Exception:
        while unsubscribers:
            unsubscribers.pop()()
        raise

    @callback
    def unregister() -> None:
        while unsubscribers:
            unsubscribers.pop()()

    return unregister


def _serialize_boundary(value: date | datetime) -> str:
    return value.isoformat()


def _optional_string(value: Any) -> str | None:
    return value if isinstance(value, str) and value else None


def _unique_zone_ids(
    sessions: Iterable[Mapping[str, Any]],
) -> tuple[str, ...]:
    return tuple(dict.fromkeys(session["zone_id"] for session in sessions))


def _publish_event(
    hass: HomeAssistant, runtime: DomusRuntime, event: DomusEvent
) -> None:
    hass.async_create_task(_async_publish_if_running(runtime, event))


async def _async_publish_if_running(runtime: DomusRuntime, event: DomusEvent) -> None:
    if runtime.events.running:
        await runtime.events.async_publish(event)
