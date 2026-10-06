"""Server-owned waste collection calendar and reminder scheduler."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from copy import deepcopy
from datetime import date, datetime, time, timedelta, timezone
import logging
from typing import Any

from homeassistant.auth.models import User
from homeassistant.components.calendar import CalendarEvent
from homeassistant.const import STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.event import async_track_time_change
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from ..const import DOMAIN
from .models import (
    STORAGE_KEY,
    STORAGE_VERSION,
    WasteCollectionConflictError,
    WasteCollectionOperationError,
    WasteCollectionPermissionError,
    WasteCollectionValidationError,
    default_document,
    normalize_configuration,
    normalize_stored_document,
    public_document,
    utc_now_iso,
)

_LOGGER = logging.getLogger(__name__)

WASTE_UID_PREFIX = "domus-ui-waste:"
WEEKDAY_TOKENS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
MAX_DISPATCH_LEDGER = 500


def _normalized_title(value: Any) -> str:
    return " ".join(str(value or "").strip().casefold().split())


def _boundary_text(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        for key in ("dateTime", "date", "date_time"):
            candidate = value.get(key)
            if isinstance(candidate, str) and candidate.strip():
                return candidate.strip()
    return ""


class WasteCollectionManager:
    """Own waste sources, derived events and scheduled notifications."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self.store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self.document = default_document()
        self._lock = asyncio.Lock()
        self._dispatch_lock = asyncio.Lock()
        self._external_query_lock = asyncio.Lock()
        self._listeners: set[Callable[[], None]] = set()
        self._unsubscribe_schedule: Callable[[], None] | None = None
        self._cached_external_events: list[CalendarEvent] = []

    async def async_setup(self) -> None:
        """Load persistent configuration and install the reminder scheduler."""
        stored = await self.store.async_load()
        try:
            self.document = normalize_stored_document(stored)
            self._reject_domus_calendar_sources(self.document)
        except WasteCollectionValidationError:
            _LOGGER.exception("Stored waste collection configuration is invalid; using safe defaults")
            self.document = default_document()
        self._install_reminder_schedule()

    async def async_shutdown(self) -> None:
        """Release listeners and the daily scheduler."""
        if self._unsubscribe_schedule is not None:
            self._unsubscribe_schedule()
            self._unsubscribe_schedule = None
        self._listeners.clear()
        self._cached_external_events.clear()

    @property
    def revision(self) -> int:
        return int(self.document.get("revision", 0))

    @callback
    def async_add_listener(self, listener: Callable[[], None]) -> Callable[[], None]:
        """Subscribe to configuration or derived-event changes."""
        self._listeners.add(listener)

        @callback
        def unsubscribe() -> None:
            self._listeners.discard(listener)

        return unsubscribe

    @callback
    def _notify(self) -> None:
        for listener in tuple(self._listeners):
            listener()

    def configuration_for_user(self, _user: User | None) -> dict[str, Any]:
        """Return the shared house-level configuration."""
        return public_document(self.document)

    async def async_save_configuration(
        self,
        configuration: Any,
        expected_revision: int | None,
        user: User,
    ) -> dict[str, Any]:
        """Validate and atomically replace the configuration."""
        if not user.is_admin:
            raise WasteCollectionPermissionError(
                "Solo Owner e Admin possono configurare la raccolta rifiuti."
            )
        normalized = normalize_configuration(configuration)
        self._reject_domus_calendar_sources(normalized)
        async with self._lock:
            if expected_revision is not None and expected_revision != self.revision:
                raise WasteCollectionConflictError(
                    "La configurazione \u00e8 stata modificata da un altro dispositivo. Ricarica e riprova."
                )
            next_document = default_document()
            next_document.update(deepcopy(normalized))
            next_document["revision"] = self.revision + 1
            next_document["updatedAt"] = utc_now_iso()
            next_document["updatedByUserId"] = user.id
            next_document["dispatchLedger"] = deepcopy(
                self.document.get("dispatchLedger", [])[-MAX_DISPATCH_LEDGER:]
            )
            self.document = next_document
            await self.store.async_save(deepcopy(self.document))
        self._cached_external_events.clear()
        self._install_reminder_schedule()
        self._notify()
        return self.configuration_for_user(user)

    def _reject_domus_calendar_sources(self, configuration: dict[str, Any]) -> None:
        registry = er.async_get(self.hass)
        for source in configuration["sources"]:
            if source["kind"] != "calendar":
                continue
            for entity_id in source["entityIds"]:
                entry = registry.async_get(entity_id)
                if entry is not None and getattr(entry, "platform", None) == DOMAIN:
                    raise WasteCollectionValidationError(
                        "Un calendario Domus UI non pu\u00f2 essere usato come sorgente della raccolta."
                    )

    def _install_reminder_schedule(self) -> None:
        if self._unsubscribe_schedule is not None:
            self._unsubscribe_schedule()
            self._unsubscribe_schedule = None
        notifications = self.document["notifications"]
        if not notifications["enabled"]:
            return
        hour, minute = (int(part) for part in notifications["time"].split(":", 1))
        self._unsubscribe_schedule = async_track_time_change(
            self.hass,
            self._async_handle_reminder_time,
            hour=hour,
            minute=minute,
            second=0,
        )

    async def _async_handle_reminder_time(self, now: datetime) -> None:
        try:
            await self.async_dispatch_reminder(dt_util.as_local(now).date() + timedelta(days=1))
        except Exception:
            _LOGGER.exception("Unable to dispatch waste collection reminder")

    def _timezone(self):
        return dt_util.get_time_zone(self.hass.config.time_zone) or timezone.utc

    def _date_window(self, start: datetime, end: datetime) -> tuple[date, date]:
        timezone = self._timezone()
        start_local = start.astimezone(timezone) if start.tzinfo else start.replace(tzinfo=timezone)
        end_local = end.astimezone(timezone) if end.tzinfo else end.replace(tzinfo=timezone)
        last_exclusive = end_local.date()
        if end_local.timetz().replace(tzinfo=None) != time.min:
            last_exclusive += timedelta(days=1)
        return start_local.date(), last_exclusive

    def _type_index(self) -> dict[str, dict[str, Any]]:
        return {item["id"]: item for item in self.document["wasteTypes"]}

    def _fixed_occurrences(self, first_day: date, last_exclusive: date) -> set[tuple[date, str]]:
        occurrences: set[tuple[date, str]] = set()
        day = first_day
        while day < last_exclusive:
            weekday = WEEKDAY_TOKENS[day.weekday()]
            for source in self.document["sources"]:
                if not source["enabled"] or source["kind"] != "fixed":
                    continue
                for rule in source["rules"]:
                    if not rule["enabled"] or weekday not in rule["weekdays"]:
                        continue
                    if rule["startDate"] and day < date.fromisoformat(rule["startDate"]):
                        continue
                    if rule["endDate"] and day > date.fromisoformat(rule["endDate"]):
                        continue
                    anchor = date.fromisoformat(rule["anchorDate"])
                    week_start = day - timedelta(days=day.weekday())
                    anchor_week_start = anchor - timedelta(days=anchor.weekday())
                    week_delta = (week_start - anchor_week_start).days // 7
                    if week_delta % rule["intervalWeeks"] == 0:
                        occurrences.add((day, rule["wasteTypeId"]))
            day += timedelta(days=1)
        return occurrences

    def _mapping_for_summary(self, source_id: str, summary: str) -> str | None:
        candidate = _normalized_title(summary)
        if not candidate:
            return None
        for mapping in self.document["mappings"]:
            if mapping["sourceId"] == source_id and _normalized_title(mapping["match"]) == candidate:
                return mapping["wasteTypeId"]
        for waste_type in self.document["wasteTypes"]:
            known_titles = [waste_type["name"], *waste_type["aliases"]]
            if any(_normalized_title(title) == candidate for title in known_titles):
                return waste_type["id"]
        return None

    def _event_date(self, raw_event: dict[str, Any]) -> date | None:
        value = _boundary_text(raw_event.get("start") or raw_event.get("dtstart"))
        if not value:
            return None
        try:
            if "T" not in value and " " not in value:
                return date.fromisoformat(value)
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=self._timezone())
            return parsed.astimezone(self._timezone()).date()
        except ValueError:
            return None

    async def _async_external_occurrences(
        self,
        start: datetime,
        end: datetime,
        first_day: date,
        last_exclusive: date,
    ) -> tuple[set[tuple[date, str]], list[str]]:
        occurrences: set[tuple[date, str]] = set()
        warnings: list[str] = []
        enabled_sources = [
            source
            for source in self.document["sources"]
            if source["enabled"] and source["kind"] == "calendar"
        ]
        if not enabled_sources:
            return occurrences, warnings
        available_by_source: dict[str, list[str]] = {}
        for source in enabled_sources:
            available: list[str] = []
            for entity_id in source["entityIds"]:
                state = self.hass.states.get(entity_id)
                if state is None or state.state in {STATE_UNAVAILABLE, STATE_UNKNOWN}:
                    warnings.append(f"{source['name']}: {entity_id} non disponibile.")
                else:
                    available.append(entity_id)
            if available:
                available_by_source[source["id"]] = available

        entity_ids = sorted({item for values in available_by_source.values() for item in values})
        if not entity_ids:
            return occurrences, warnings
        if not self.hass.services.has_service("calendar", "get_events"):
            warnings.append("Il servizio calendar.get_events non \u00e8 disponibile.")
            return occurrences, warnings

        try:
            async with self._external_query_lock:
                response = await self.hass.services.async_call(
                    "calendar",
                    "get_events",
                    {
                        "start_date_time": start.isoformat(),
                        "end_date_time": end.isoformat(),
                    },
                    target={"entity_id": entity_ids},
                    blocking=True,
                    return_response=True,
                )
        except Exception as err:
            _LOGGER.warning("Unable to read waste calendar sources: %s", err)
            warnings.append("Impossibile leggere le sorgenti calendario configurate.")
            return occurrences, warnings

        if not isinstance(response, dict):
            warnings.append("Home Assistant non ha restituito eventi dalle sorgenti calendario.")
            return occurrences, warnings
        for source in enabled_sources:
            for entity_id in available_by_source.get(source["id"], []):
                payload = response.get(entity_id)
                if not isinstance(payload, dict):
                    warnings.append(f"{source['name']}: nessuna risposta per {entity_id}.")
                    continue
                raw_events = payload.get("events", [])
                if not isinstance(raw_events, list):
                    warnings.append(f"{source['name']}: risposta eventi non valida.")
                    continue
                for raw_event in raw_events:
                    if not isinstance(raw_event, dict):
                        continue
                    event_day = self._event_date(raw_event)
                    if event_day is None or event_day < first_day or event_day >= last_exclusive:
                        continue
                    waste_type_id = self._mapping_for_summary(
                        source["id"], str(raw_event.get("summary") or raw_event.get("message") or "")
                    )
                    if waste_type_id is not None:
                        occurrences.add((event_day, waste_type_id))
        return occurrences, warnings

    def _apply_exceptions(
        self,
        occurrences: set[tuple[date, str]],
        first_day: date,
        last_exclusive: date,
    ) -> None:
        for exception in self.document["exceptions"]:
            exception_day = date.fromisoformat(exception["date"])
            if exception_day < first_day or exception_day >= last_exclusive:
                continue
            key = (exception_day, exception["wasteTypeId"])
            if exception["action"] == "skip":
                occurrences.discard(key)
            else:
                occurrences.add(key)

    def _to_events(self, occurrences: set[tuple[date, str]]) -> list[CalendarEvent]:
        waste_types = self._type_index()
        events: list[CalendarEvent] = []
        for event_day, waste_type_id in sorted(occurrences):
            waste_type = waste_types.get(waste_type_id)
            if waste_type is None:
                continue
            events.append(
                CalendarEvent(
                    start=event_day,
                    end=event_day + timedelta(days=1),
                    summary=waste_type["name"],
                    description="Domus UI Waste Collection \u00b7 read-only",
                    uid=f"{WASTE_UID_PREFIX}{waste_type_id}:{event_day.isoformat()}",
                )
            )
        return events

    async def async_events_between(
        self,
        start: datetime,
        end: datetime,
    ) -> tuple[list[CalendarEvent], list[str]]:
        """Resolve fixed and Home Assistant calendar sources for an interval."""
        first_day, last_exclusive = self._date_window(start, end)
        occurrences = self._fixed_occurrences(first_day, last_exclusive)
        external, warnings = await self._async_external_occurrences(
            start, end, first_day, last_exclusive
        )
        occurrences.update(external)
        self._apply_exceptions(occurrences, first_day, last_exclusive)
        events = self._to_events(occurrences)
        self._cached_external_events = events
        return events, warnings

    def next_event(self, now: datetime | None = None) -> CalendarEvent | None:
        """Return the next fixed or recently resolved waste event."""
        reference = dt_util.as_local(now or dt_util.now())
        timezone = self._timezone()
        first_day = reference.astimezone(timezone).date()
        occurrences = self._fixed_occurrences(first_day, first_day + timedelta(days=366))
        self._apply_exceptions(
            occurrences, first_day, first_day + timedelta(days=366)
        )
        events = self._to_events(occurrences)
        candidates = [
            event
            for event in [*events, *self._cached_external_events]
            if event.end_datetime_local > reference
        ]
        return min(candidates, key=lambda event: event.start_datetime_local, default=None)

    @staticmethod
    def _serialize_event(event: CalendarEvent) -> dict[str, Any]:
        return {
            "uid": event.uid,
            "summary": event.summary,
            "description": event.description,
            "start": event.start.isoformat(),
            "end": event.end.isoformat(),
            "all_day": event.all_day,
        }

    async def async_preview(self, days: int = 7) -> dict[str, Any]:
        """Return upcoming rows and source warnings for the settings preview."""
        timezone = self._timezone()
        today = dt_util.now().astimezone(timezone).date()
        start = datetime.combine(today, time.min, tzinfo=timezone)
        end = start + timedelta(days=max(1, min(days, 31)))
        events, warnings = await self.async_events_between(start, end)
        return {
            "events": [self._serialize_event(event) for event in events],
            "warnings": warnings,
            "generatedAt": utc_now_iso(),
        }

    async def _async_send_to_target(self, target: str, title: str, message: str) -> None:
        state = self.hass.states.get(target)
        if state is not None:
            if not self.hass.services.has_service("notify", "send_message"):
                raise WasteCollectionOperationError("notify.send_message non disponibile.")
            await self.hass.services.async_call(
                "notify",
                "send_message",
                {"title": title, "message": message},
                target={"entity_id": [target]},
                blocking=True,
            )
            return
        service = target.split(".", 1)[1]
        if not self.hass.services.has_service("notify", service):
            raise WasteCollectionOperationError(f"Destinatario {target} non disponibile.")
        await self.hass.services.async_call(
            "notify",
            service,
            {"title": title, "message": message},
            blocking=True,
        )

    async def async_send_test_notification(self, user: User) -> dict[str, Any]:
        """Send a test message to every configured target."""
        if not user.is_admin:
            raise WasteCollectionPermissionError(
                "Solo Owner e Admin possono inviare notifiche di prova."
            )
        targets = self.document["notifications"]["targets"]
        if not targets:
            raise WasteCollectionOperationError("Nessun destinatario configurato.")
        sent: list[str] = []
        failed: list[dict[str, str]] = []
        for target in targets:
            try:
                await self._async_send_to_target(
                    target,
                    "Domus UI \u00b7 Test raccolta rifiuti",
                    "Le notifiche per la raccolta rifiuti sono configurate correttamente.",
                )
                sent.append(target)
            except Exception as err:
                failed.append({"target": target, "error": str(err)})
        return {"sent": sent, "failed": failed}

    async def async_dispatch_reminder(self, collection_day: date) -> dict[str, Any]:
        """Send the aggregated previous-evening reminder exactly once per target."""
        async with self._dispatch_lock:
            return await self._async_dispatch_reminder_locked(collection_day)

    async def _async_dispatch_reminder_locked(self, collection_day: date) -> dict[str, Any]:
        """Resolve and dispatch one reminder while holding the delivery lock."""
        notifications = self.document["notifications"]
        if not notifications["enabled"]:
            return {"sent": [], "failed": [], "skipped": "disabled"}
        timezone = self._timezone()
        start = datetime.combine(collection_day, time.min, tzinfo=timezone)
        events, warnings = await self.async_events_between(start, start + timedelta(days=1))
        if warnings:
            _LOGGER.warning("Waste reminder suppressed because a source is unavailable: %s", warnings)
            return {"sent": [], "failed": [], "skipped": "source_unavailable", "warnings": warnings}
        if not events:
            return {"sent": [], "failed": [], "skipped": "no_collection"}
        names = [event.summary for event in events]
        title = "Raccolta di domani"
        message = " \u00b7 ".join(names)
        sent: list[str] = []
        failed: list[dict[str, str]] = []
        ledger = set(self.document.get("dispatchLedger", []))
        for target in notifications["targets"]:
            ledger_key = f"{collection_day.isoformat()}|{target}"
            if ledger_key in ledger:
                continue
            try:
                await self._async_send_to_target(target, title, message)
            except Exception as err:
                failed.append({"target": target, "error": str(err)})
                continue
            sent.append(target)
            ledger.add(ledger_key)
        if sent:
            async with self._lock:
                self.document["dispatchLedger"] = sorted(ledger)[-MAX_DISPATCH_LEDGER:]
                await self.store.async_save(deepcopy(self.document))
        return {"sent": sent, "failed": failed, "events": names}
