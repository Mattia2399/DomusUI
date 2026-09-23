"""Calendar platform for the Domus UI integration."""

from __future__ import annotations

from datetime import datetime, time, timedelta
from typing import Any

from homeassistant.components.calendar import (
    CalendarEntity,
    CalendarEntityFeature,
    CalendarEvent,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.util import dt as dt_util

from .calendar_store import DomusCalendarStore
from .const import DOMAIN
from .irrigation import IrrigationManager

IRRIGATION_UID_PREFIX = "domus-ui-irrigation:"
WEEKDAY_TOKENS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the editable Domus UI calendar."""
    manager = hass.data[DOMAIN]["calendar_manager"]
    irrigation_manager = hass.data[DOMAIN].get("irrigation_manager")
    async_add_entities([DomusCalendarEntity(manager, irrigation_manager)], True)


class DomusCalendarEntity(CalendarEntity):
    """An editable calendar whose source of truth is Home Assistant storage."""

    _attr_name = "Domus UI"
    _attr_unique_id = "domus_ui_calendar"
    _attr_icon = "mdi:calendar-heart"
    _attr_supported_features = (
        CalendarEntityFeature.CREATE_EVENT
        | CalendarEntityFeature.DELETE_EVENT
        | CalendarEntityFeature.UPDATE_EVENT
    )

    def __init__(
        self,
        manager: DomusCalendarStore,
        irrigation_manager: IrrigationManager | None = None,
    ) -> None:
        """Initialize the calendar entity."""
        self._manager = manager
        self._irrigation_manager = irrigation_manager

    @property
    def event(self) -> CalendarEvent | None:
        """Return the active or next event."""
        now = dt_util.now()
        candidates = [self._manager.next_event(now)]
        candidates.extend(self._irrigation_events(now, now + timedelta(days=31)))
        available = [event for event in candidates if event is not None]
        return min(available, key=lambda event: event.start_datetime_local, default=None)

    async def async_added_to_hass(self) -> None:
        """Refresh the entity whenever the persistent store changes."""
        await super().async_added_to_hass()
        self.async_on_remove(self._manager.async_add_listener(self._handle_store_update))
        if self._irrigation_manager is not None:
            self.async_on_remove(
                self._irrigation_manager.async_subscribe(self._handle_store_update)
            )

    @callback
    def _handle_store_update(self, *_args: Any) -> None:
        self.async_write_ha_state()

    async def async_get_events(
        self,
        hass: HomeAssistant,
        start_date: datetime,
        end_date: datetime,
    ) -> list[CalendarEvent]:
        """Return all events overlapping a requested interval."""
        events = self._manager.events_between(start_date, end_date)
        events.extend(self._irrigation_events(start_date, end_date))
        return sorted(events, key=lambda event: event.start_datetime_local)

    async def async_create_event(self, **kwargs: Any) -> None:
        """Create a non-recurring event."""
        await self._manager.async_create_event(kwargs)

    async def async_delete_event(
        self,
        uid: str,
        recurrence_id: str | None = None,
        recurrence_range: str | None = None,
    ) -> None:
        """Delete a non-recurring event."""
        self._reject_recurrence(recurrence_id, recurrence_range)
        self._reject_irrigation_event(uid)
        await self._manager.async_delete_event(uid)

    async def async_update_event(
        self,
        uid: str,
        event: dict[str, Any],
        recurrence_id: str | None = None,
        recurrence_range: str | None = None,
    ) -> None:
        """Replace a non-recurring event."""
        self._reject_recurrence(recurrence_id, recurrence_range)
        self._reject_irrigation_event(uid)
        await self._manager.async_update_event(uid, event)

    def _irrigation_events(
        self, start_date: datetime, end_date: datetime
    ) -> list[CalendarEvent]:
        if self._irrigation_manager is None:
            return []
        timezone = dt_util.get_time_zone(self.hass.config.time_zone)
        if timezone is None:
            return []
        start_local = dt_util.as_local(start_date)
        end_local = dt_util.as_local(end_date)
        day = start_local.date()
        events: list[CalendarEvent] = []
        zones = self._irrigation_manager.document.get("zones", [])
        while day <= end_local.date():
            token = WEEKDAY_TOKENS[day.weekday()]
            for zone in zones:
                if not isinstance(zone, dict) or not zone.get("enabled") or token not in zone.get("days", []):
                    continue
                for start_time in zone.get("startTimes", []):
                    try:
                        hour, minute = (int(part) for part in str(start_time).split(":", 1))
                    except (TypeError, ValueError):
                        continue
                    event_start = datetime.combine(day, time(hour, minute), tzinfo=timezone)
                    try:
                        duration = max(1, int(zone.get("baseDuration", 1)))
                    except (TypeError, ValueError):
                        duration = 1
                    event_end = event_start + timedelta(minutes=duration)
                    if event_end <= start_local or event_start >= end_local:
                        continue
                    zone_id = str(zone.get("id", "zone"))
                    zone_name = str(zone.get("name") or zone_id)
                    events.append(CalendarEvent(
                        start=event_start,
                        end=event_end,
                        summary=f"{zone_name} · Irrigation",
                        description="Domus Core Irrigation · read-only",
                        uid=f"{IRRIGATION_UID_PREFIX}{zone_id}:{day.isoformat()}:{start_time}",
                    ))
            day += timedelta(days=1)
        return events

    @staticmethod
    def _reject_irrigation_event(uid: str) -> None:
        if uid.startswith(IRRIGATION_UID_PREFIX):
            raise HomeAssistantError(
                "Irrigation schedules are read-only in Calendar; edit them in Domus Core Irrigation"
            )

    @staticmethod
    def _reject_recurrence(
        recurrence_id: str | None,
        recurrence_range: str | None,
    ) -> None:
        if recurrence_id is not None or recurrence_range is not None:
            raise HomeAssistantError(
                "Recurring events are not supported by Domus Calendar yet"
            )
