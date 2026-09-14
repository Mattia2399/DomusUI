"""Server-side scheduler and watchdog for Domus Core Irrigation."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from copy import deepcopy
from datetime import datetime, timedelta
import logging
from typing import Any
from uuid import uuid4

from homeassistant.auth.models import User
from homeassistant.auth.permissions.const import POLICY_CONTROL, POLICY_READ
from homeassistant.const import ATTR_ENTITY_ID, STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.core import Context, Event, HomeAssistant, State, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.event import (
    async_call_later,
    async_track_state_change_event,
    async_track_time_change,
)
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from ..const import DOMAIN
from .models import (
    IrrigationActiveSessionConflictError,
    IrrigationConflictError,
    IrrigationError,
    IrrigationOperationError,
    IrrigationPermissionError,
    IrrigationValidationError,
    STORAGE_KEY,
    STORAGE_VERSION,
    default_document,
    normalize_configuration,
    normalize_stored_document,
    utc_now_iso,
)

_LOGGER = logging.getLogger(__name__)

ACTIVE_SESSION_STATES = {"opening", "running", "closing"}
VISIBLE_SESSION_STATES = ACTIVE_SESSION_STATES | {"queued", "paused"}
RAIN_ACTIVE_STATES = {"on", "wet", "rain", "raining", "true", "detected"}
ACTUATOR_CONFIRM_TIMEOUT = 10.0
CLOSE_RETRY_DELAYS = (0.0, 2.0, 5.0)
MAX_OCCURRENCES = 500
MAX_HISTORY = 200
SIGNAL_STATE_UPDATED = f"{DOMAIN}_irrigation_state_updated"


class IrrigationManager:
    """Own irrigation configuration, scheduling and actuator safety."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self.store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self.document = default_document()
        self._lock = asyncio.Lock()
        self._listeners: list[Callable[[], None]] = []
        self._session_timers: dict[str, Callable[[], None]] = {}
        self._subscribers: set[Callable[[dict[str, Any]], None]] = set()

    async def async_setup(self) -> None:
        """Load persistent state and install listeners."""
        stored = await self.store.async_load()
        try:
            self.document = normalize_stored_document(stored)
        except IrrigationValidationError:
            _LOGGER.exception("Stored irrigation configuration is invalid; using safe defaults")
            self.document = default_document()
            self.document["mode"] = "fault"
        interrupted = [
            item for item in self.document.get("sessions", [])
            if isinstance(item, dict) and item.get("state") in VISIBLE_SESSION_STATES
        ]
        self.document["sessions"] = []
        self._install_runtime_listeners()
        if interrupted:
            for session in interrupted:
                zone = self._zone(str(session.get("zoneId", "")))
                if zone is not None and session.get("state") in ACTIVE_SESSION_STATES:
                    await self._async_close_with_watchdog(zone, None, "home_assistant_restart")
                self._record_history(session, "interrupted", "home_assistant_restart")
            self.document["mode"] = "stopped"
            await self._async_persist()
        self._notify_subscribers()

    async def async_shutdown(self) -> None:
        """Stop listeners and safely close manager-owned sessions."""
        try:
            await self.async_stop_all(None, reason="integration_unload")
        except Exception:
            _LOGGER.exception("Unable to complete irrigation shutdown cleanly")
        self._clear_runtime_listeners()
        self._cancel_all_timers()

    @property
    def revision(self) -> int:
        return int(self.document.get("revision", 0))

    def _zone(self, zone_id: str) -> dict[str, Any] | None:
        return next((zone for zone in self.document["zones"] if zone["id"] == zone_id), None)

    def _zone_for_entity(self, entity_id: str) -> dict[str, Any] | None:
        return next((zone for zone in self.document["zones"] if zone["entityId"] == entity_id), None)

    def _can_read(self, user: User | None, entity_id: str) -> bool:
        return user is None or user.is_admin or (
            bool(entity_id) and user.permissions.check_entity(entity_id, POLICY_READ)
        )

    def _assert_control(self, user: User | None, entity_id: str) -> None:
        if user is not None and not user.is_admin and not user.permissions.check_entity(entity_id, POLICY_CONTROL):
            raise IrrigationPermissionError("Permesso Home Assistant insufficiente per questa zona.")

    def configuration_for_user(self, user: User | None) -> dict[str, Any]:
        """Return configuration filtered through the authenticated HA identity."""
        result = deepcopy({key: self.document[key] for key in (
            "schema", "version", "revision", "updatedAt", "updatedByUserId", "mode",
            "settings", "sources", "zones", "legacyAutomations",
        )})
        if user is None or user.is_admin:
            return result
        result["zones"] = [zone for zone in result["zones"] if self._can_read(user, zone["entityId"])]
        readable_ids = {
            entity_id for entity_id in result["sources"].values()
            if entity_id and self._can_read(user, entity_id)
        }
        result["sources"] = {
            key: entity_id if entity_id in readable_ids else ""
            for key, entity_id in result["sources"].items()
        }
        rain_id = result["settings"].get("rainSensorEntityId", "")
        if rain_id and not self._can_read(user, rain_id):
            result["settings"]["rainSensorEntityId"] = ""
        result["legacyAutomations"] = []
        return result

    def state_for_user(self, user: User | None) -> dict[str, Any]:
        """Build the push snapshot consumed by Domus UI."""
        visible_zone_ids = {
            zone["id"] for zone in self.document["zones"]
            if self._can_read(user, zone["entityId"])
        }
        sessions = [
            deepcopy(session) for session in self.document.get("sessions", [])
            if isinstance(session, dict)
            and session.get("state") in VISIBLE_SESSION_STATES
            and session.get("zoneId") in visible_zone_ids
        ]
        registry = er.async_get(self.hass)
        legacy_automations = [
            entity_id
            for entity_id in self.document.get("legacyAutomations", [])
            if registry.async_get(entity_id) is not None
        ]
        legacy_entries = [registry.async_get(entity_id) for entity_id in legacy_automations]
        legacy_visible = [
            entry.entity_id
            for entry in legacy_entries
            if entry is not None and entry.disabled_by is None
        ]
        legacy_missing_states = [
            entity_id
            for entity_id in legacy_visible
            if self.hass.states.get(entity_id) is None
        ]
        return {
            "available": True,
            "revision": self.revision,
            "mode": self.document["mode"],
            "rain": self._rain_status(),
            "sessions": sessions,
            "history": [
                deepcopy(item) for item in self.document.get("history", [])[-50:]
                if item.get("zoneId") in visible_zone_ids or item.get("zoneId") is None
            ],
            "serverTime": utc_now_iso(),
            "legacyAutomations": deepcopy(legacy_automations) if user is None or user.is_admin else [],
            "legacyAutomationsReadyForRemoval": (
                bool(legacy_automations)
                and len(legacy_visible) == len(legacy_automations)
                and not legacy_missing_states
            ) if user is None or user.is_admin else False,
            "legacyAutomationsRequireRestart": bool(legacy_missing_states) if user is None or user.is_admin else False,
        }

    def async_subscribe(self, subscriber: Callable[[dict[str, Any]], None]) -> Callable[[], None]:
        self._subscribers.add(subscriber)

        @callback
        def unsubscribe() -> None:
            self._subscribers.discard(subscriber)

        return unsubscribe

    @callback
    def _notify_subscribers(self) -> None:
        for subscriber in tuple(self._subscribers):
            subscriber({"changed": True})

    async def async_save_configuration(
        self,
        configuration: Any,
        expected_revision: int | None,
        user: User,
        *,
        migrate_legacy: bool = False,
    ) -> dict[str, Any]:
        """Validate and persist configuration with optimistic concurrency."""
        if not user.is_admin:
            raise IrrigationPermissionError("Solo Owner e Admin possono configurare l’irrigazione.")
        normalized = normalize_configuration(configuration)
        async with self._lock:
            if expected_revision is None:
                if self.revision != 0:
                    raise IrrigationConflictError("La configurazione è già stata modificata.")
            elif expected_revision != self.revision:
                raise IrrigationConflictError("È disponibile una configurazione più recente.")
            self._assert_configuration_safe_during_sessions(normalized)
            self.document.update(normalized)
            self.document["revision"] = self.revision + 1
            self.document["updatedAt"] = utc_now_iso()
            self.document["updatedByUserId"] = user.id
            self.document["sessions"] = [
                session for session in self.document.get("sessions", [])
                if isinstance(session, dict) and self._zone(str(session.get("zoneId", ""))) is not None
            ]
            if migrate_legacy:
                self.document["legacyAutomations"] = await self._async_disable_legacy_automations()
                self.document["legacyMigrationCompleted"] = True
            self._install_runtime_listeners()
            await self._async_persist()
        self._notify_subscribers()
        return self.configuration_for_user(user)

    def _assert_configuration_safe_during_sessions(
        self, normalized: dict[str, Any]
    ) -> None:
        """Allow harmless edits while protecting every server-owned session."""
        sessions = [
            session
            for session in self.document.get("sessions", [])
            if isinstance(session, dict)
            and session.get("state") in VISIBLE_SESSION_STATES
        ]
        if not sessions:
            return

        current_settings = self.document["settings"]
        next_settings = normalized["settings"]
        concurrency_fields = {"maxConcurrentZones", "parallelSafetyAcknowledged"}
        if any(current_settings.get(field) != next_settings.get(field) for field in concurrency_fields):
            raise IrrigationActiveSessionConflictError(
                "Arresta o completa i cicli in corso prima di modificare il numero di zone simultanee."
            )

        rain_safety_fields = {
            "rainSensorEnabled",
            "rainSensorEntityId",
            "blockOnRainSensorUnavailable",
            "rainDuringCycle",
        }
        if any(current_settings.get(field) != next_settings.get(field) for field in rain_safety_fields):
            raise IrrigationActiveSessionConflictError(
                "Arresta o completa i cicli in corso prima di modificare le protezioni pioggia."
            )

        current_zones = {zone["id"]: zone for zone in self.document["zones"]}
        next_zones = {zone["id"]: zone for zone in normalized["zones"]}
        for session in sessions:
            zone_id = str(session.get("zoneId", ""))
            current_zone = current_zones.get(zone_id)
            next_zone = next_zones.get(zone_id)
            zone_name = str((current_zone or {}).get("name") or zone_id or "Zona")
            if next_zone is None:
                raise IrrigationActiveSessionConflictError(
                    f"Non puoi rimuovere {zone_name} mentre è attiva, in coda o in pausa."
                )
            if current_zone is not None and current_zone.get("entityId") != next_zone.get("entityId"):
                raise IrrigationActiveSessionConflictError(
                    f"Non puoi cambiare la valvola o lo switch di {zone_name} mentre la zona è attiva, in coda o in pausa."
                )

    async def async_set_mode(self, mode: str, user: User | None) -> dict[str, Any]:
        if mode not in {"enabled", "paused", "stopped"}:
            raise IrrigationValidationError("Modalità irrigazione non valida.")
        if mode == "paused":
            await self.async_pause(user)
        elif mode == "stopped":
            await self.async_stop_all(user)
        else:
            await self.async_resume(user)
        return self.state_for_user(user)

    async def async_start_zone(
        self,
        zone_id: str,
        duration_min: int | None,
        user: User | None,
        *,
        source: str = "manual",
        request_id: str | None = None,
        occurrence_id: str | None = None,
    ) -> dict[str, Any]:
        """Start or queue a bounded irrigation session."""
        zone = self._zone(zone_id)
        if zone is None or not zone["enabled"]:
            raise IrrigationOperationError("Zona non configurata o disabilitata.")
        self._assert_control(user, zone["entityId"])
        request_id = (request_id or "")[:160]
        occurrence_id = (occurrence_id or "")[:160]
        if self.document["mode"] != "enabled":
            raise IrrigationOperationError("Il sistema di irrigazione è fermo o in pausa.")
        rain = self._rain_status()
        if rain["blocked"]:
            raise IrrigationOperationError(self._rain_block_message(rain))
        maximum = int(self.document["settings"]["maximumManualDurationMin"])
        requested_duration = zone["baseDuration"] if duration_min is None else duration_min
        if isinstance(requested_duration, bool):
            raise IrrigationValidationError("Durata non valida.")
        try:
            duration = int(requested_duration)
        except (TypeError, ValueError) as err:
            raise IrrigationValidationError("Durata non valida.") from err
        if duration < 1 or duration > maximum:
            raise IrrigationValidationError(f"La durata deve essere compresa tra 1 e {maximum} minuti.")
        session = {
            "id": uuid4().hex,
            "requestId": request_id,
            "occurrenceId": occurrence_id,
            "zoneId": zone_id,
            "entityId": zone["entityId"],
            "source": source if source in {"manual", "schedule", "service", "resume"} else "manual",
            "state": "queued",
            "createdAt": utc_now_iso(),
            "startedAt": None,
            "deadline": None,
            "durationMin": duration,
            "remainingSeconds": duration * 60,
            "reason": None,
            "requestedByUserId": user.id if user is not None else "",
        }
        async with self._lock:
            if self.document["mode"] != "enabled":
                raise IrrigationOperationError("Il sistema di irrigazione è fermo o in pausa.")
            rain = self._rain_status()
            if rain["blocked"]:
                raise IrrigationOperationError(self._rain_block_message(rain))
            if request_id and request_id in self.document["processedRequests"]:
                existing = next(
                    (item for item in self.document["sessions"] if item.get("requestId") == request_id),
                    None,
                )
                if existing is not None:
                    return deepcopy(existing)
                raise IrrigationOperationError("Richiesta già elaborata.")
            existing_zone_session = next(
                (
                    item
                    for item in self.document["sessions"]
                    if item.get("zoneId") == zone_id
                    and item.get("state") in VISIBLE_SESSION_STATES
                ),
                None,
            )
            if existing_zone_session is not None:
                raise IrrigationOperationError("Questa zona ha già un ciclo attivo o in coda.")
            if occurrence_id and occurrence_id in self.document["processedOccurrences"]:
                raise IrrigationOperationError("Occorrenza già elaborata.")
            if occurrence_id:
                self.document["processedOccurrences"] = (
                    [*self.document["processedOccurrences"], occurrence_id][-MAX_OCCURRENCES:]
                )
            self.document["sessions"].append(session)
            if request_id:
                self.document["processedRequests"] = (
                    [*self.document["processedRequests"], request_id][-MAX_OCCURRENCES:]
                )
            await self._async_persist()
        await self._async_fill_capacity()
        self._notify_subscribers()
        return deepcopy(next(
            (item for item in self.document["sessions"] if item["id"] == session["id"]),
            session,
        ))

    async def async_stop_zone(self, zone_id: str, user: User | None, *, reason: str = "user_stop") -> None:
        zone = self._zone(zone_id)
        if zone is None:
            raise IrrigationOperationError("Zona non configurata.")
        self._assert_control(user, zone["entityId"])
        async with self._lock:
            sessions = [item for item in self.document["sessions"] if item.get("zoneId") == zone_id]
            for session in sessions:
                await self._async_finish_session(session, reason, close_actuator=session.get("state") in ACTIVE_SESSION_STATES)
            await self._async_persist()
        await self._async_fill_capacity()
        self._notify_subscribers()

    async def async_pause(self, user: User | None) -> None:
        self._assert_all_active_control(user)
        async with self._lock:
            self.document["mode"] = "paused"
            now = dt_util.utcnow()
            for session in list(self.document["sessions"]):
                state = session.get("state")
                if state in ACTIVE_SESSION_STATES:
                    deadline = dt_util.parse_datetime(str(session.get("deadline") or ""))
                    if deadline is not None:
                        session["remainingSeconds"] = max(1, int((deadline - now).total_seconds()))
                    self._cancel_timer(str(session.get("id")))
                    zone = self._zone(str(session.get("zoneId", "")))
                    # Mark the transition before issuing the close command. The
                    # actuator listener must not mistake this intentional close
                    # for an external cancellation and delete the paused session.
                    session["state"] = "closing"
                    if zone is not None and await self._async_close_with_watchdog(zone, user, "paused"):
                        session["state"] = "paused"
                        session["deadline"] = None
                        session["reason"] = "paused"
                    else:
                        session["state"] = "failed"
                        self._record_history(session, "failed", "close_not_confirmed")
                        self.document["sessions"].remove(session)
                elif state == "queued":
                    self._record_history(session, "skipped", "system_paused")
                    self.document["sessions"].remove(session)
            await self._async_persist()
        self._notify_subscribers()

    async def async_resume(self, user: User | None) -> None:
        self._assert_all_enabled_control(user)
        async with self._lock:
            if self.document["mode"] == "fault":
                unsafe_zones = [
                    zone["name"]
                    for zone in self.document["zones"]
                    if zone["entityId"]
                    and not self._actuator_matches(
                        self.hass.states.get(zone["entityId"]), False
                    )
                ]
                if unsafe_zones:
                    raise IrrigationOperationError(
                        "Impossibile riattivare: verifica e chiudi manualmente "
                        f"{', '.join(unsafe_zones)}."
                    )
                for zone in self.document["zones"]:
                    ir.async_delete_issue(
                        self.hass, DOMAIN, f"irrigation_close_{zone['id']}"
                    )
            if not self.document.get("legacyMigrationCompleted", False):
                if user is not None and not user.is_admin:
                    raise IrrigationPermissionError(
                        "Solo Owner e Admin possono completare la migrazione delle automazioni precedenti."
                    )
                self.document["legacyAutomations"] = (
                    await self._async_disable_legacy_automations()
                )
                self.document["legacyMigrationCompleted"] = True
            self.document["mode"] = "enabled"
            paused = [item for item in self.document["sessions"] if item.get("state") == "paused"]
            for session in paused:
                session["state"] = "queued"
                session["source"] = "resume"
                session["durationMin"] = max(1, int((int(session.get("remainingSeconds", 60)) + 59) / 60))
            await self._async_persist()
        await self._async_fill_capacity()
        self._notify_subscribers()

    async def async_stop_all(self, user: User | None, *, reason: str = "user_stop_all") -> None:
        self._assert_all_active_control(user)
        async with self._lock:
            self.document["mode"] = "stopped"
            for session in list(self.document.get("sessions", [])):
                await self._async_finish_session(
                    session,
                    reason,
                    close_actuator=session.get("state") in ACTIVE_SESSION_STATES,
                )
            self.document["sessions"] = []
            await self._async_persist()
        self._notify_subscribers()

    def _assert_all_active_control(self, user: User | None) -> None:
        for session in self.document.get("sessions", []):
            if session.get("state") in VISIBLE_SESSION_STATES:
                zone = self._zone(str(session.get("zoneId", "")))
                if zone is not None:
                    self._assert_control(user, zone["entityId"])

    def _assert_all_enabled_control(self, user: User | None) -> None:
        """Require control permission for every zone enabled by a global resume."""
        for zone in self.document.get("zones", []):
            if zone.get("enabled") and zone.get("entityId"):
                self._assert_control(user, zone["entityId"])

    async def _async_fill_capacity(self) -> None:
        """Open queued sessions in FIFO order up to the configured capacity."""
        async with self._lock:
            if self.document["mode"] != "enabled" or self._rain_status()["blocked"]:
                return
            capacity = int(self.document["settings"]["maxConcurrentZones"])
            active_count = sum(
                item.get("state") in ACTIVE_SESSION_STATES for item in self.document["sessions"]
            )
            queued = [item for item in self.document["sessions"] if item.get("state") == "queued"]
            for session in queued[:max(0, capacity - active_count)]:
                zone = self._zone(str(session.get("zoneId", "")))
                if zone is None:
                    await self._async_finish_session(session, "zone_removed", close_actuator=False)
                    continue
                requested_user = None
                requested_user_id = str(session.get("requestedByUserId") or "")
                if requested_user_id:
                    requested_user = await self.hass.auth.async_get_user(requested_user_id)
                    if requested_user is None:
                        self._record_history(session, "skipped", "requesting_user_missing")
                        self.document["sessions"].remove(session)
                        continue
                    try:
                        self._assert_control(requested_user, zone["entityId"])
                    except IrrigationPermissionError:
                        self._record_history(session, "skipped", "permission_revoked")
                        self.document["sessions"].remove(session)
                        continue
                session["state"] = "opening"
                await self._async_persist()
                if not await self._async_set_actuator(
                    zone,
                    True,
                    requested_user,
                ):
                    session["state"] = "failed"
                    safely_closed = await self._async_close_with_watchdog(
                        zone, None, "open_not_confirmed"
                    )
                    reason = (
                        "open_not_confirmed_safely_closed"
                        if safely_closed
                        else "open_not_confirmed_close_failed"
                    )
                    session["reason"] = reason
                    self._record_history(session, "failed", reason)
                    self.document["sessions"].remove(session)
                    continue
                now = dt_util.utcnow()
                remaining = max(1, int(session.get("remainingSeconds", int(session["durationMin"]) * 60)))
                session["state"] = "running"
                session["startedAt"] = now.isoformat()
                session["deadline"] = (now + timedelta(seconds=remaining)).isoformat()
                session["reason"] = None
                self._schedule_session_stop(session)
                active_count += 1
            await self._async_persist()
        self._notify_subscribers()

    def _schedule_session_stop(self, session: dict[str, Any]) -> None:
        session_id = str(session["id"])
        self._cancel_timer(session_id)
        seconds = max(1, int(session.get("remainingSeconds", 60)))

        async def stop_after_deadline(_now: datetime) -> None:
            current = next((item for item in self.document["sessions"] if item.get("id") == session_id), None)
            if current is None or current.get("state") != "running":
                return
            await self.async_stop_zone(str(current["zoneId"]), None, reason="deadline_reached")

        self._session_timers[session_id] = async_call_later(self.hass, seconds, stop_after_deadline)

    def _cancel_timer(self, session_id: str) -> None:
        cancel = self._session_timers.pop(session_id, None)
        if cancel is not None:
            cancel()

    def _cancel_all_timers(self) -> None:
        for cancel in self._session_timers.values():
            cancel()
        self._session_timers.clear()

    async def _async_finish_session(self, session: dict[str, Any], reason: str, *, close_actuator: bool) -> None:
        self._cancel_timer(str(session.get("id", "")))
        zone = self._zone(str(session.get("zoneId", "")))
        final_state = "interrupted" if reason in {"integration_unload", "home_assistant_restart"} else "completed"
        if close_actuator and zone is not None:
            # Suppress the external-close path while Domus Core itself is
            # deliberately closing the actuator.
            session["state"] = "closing"
            if not await self._async_close_with_watchdog(zone, None, reason):
                final_state = "failed"
        self._record_history(session, final_state, reason)
        if session in self.document["sessions"]:
            self.document["sessions"].remove(session)

    def _record_history(self, session: dict[str, Any], state: str, reason: str) -> None:
        self.document["history"] = [*self.document.get("history", []), {
            "sessionId": session.get("id"),
            "zoneId": session.get("zoneId"),
            "source": session.get("source"),
            "state": state,
            "reason": reason,
            "at": utc_now_iso(),
        }][-MAX_HISTORY:]

    async def _async_set_actuator(
        self,
        zone: dict[str, Any],
        turn_on: bool,
        user: User | None,
        *,
        context_user_id: str | None = None,
    ) -> bool:
        entity_id = zone["entityId"]
        domain = entity_id.split(".", 1)[0]
        self._assert_control(user, entity_id)
        state = self.hass.states.get(entity_id)
        if state is None or state.state in {STATE_UNAVAILABLE, STATE_UNKNOWN}:
            return False
        service = (
            "open_valve" if turn_on else "close_valve"
        ) if domain == "valve" else ("turn_on" if turn_on else "turn_off")
        audit_user_id = user.id if user is not None else context_user_id
        context = Context(user_id=audit_user_id) if audit_user_id else None
        try:
            await self.hass.services.async_call(
                domain,
                service,
                {ATTR_ENTITY_ID: entity_id},
                blocking=True,
                context=context,
            )
        except Exception:  # Home Assistant integrations expose heterogeneous errors.
            _LOGGER.exception("Irrigation actuator command failed for %s", entity_id)
            return False
        return await self._async_wait_for_actuator(entity_id, turn_on)

    async def _async_wait_for_actuator(self, entity_id: str, turn_on: bool) -> bool:
        if self._actuator_matches(self.hass.states.get(entity_id), turn_on):
            return True
        future: asyncio.Future[bool] = self.hass.loop.create_future()

        @callback
        def state_changed(event: Event) -> None:
            new_state = event.data.get("new_state")
            if self._actuator_matches(new_state, turn_on) and not future.done():
                future.set_result(True)

        unsubscribe = async_track_state_change_event(self.hass, [entity_id], state_changed)
        try:
            async with asyncio.timeout(ACTUATOR_CONFIRM_TIMEOUT):
                return await future
        except TimeoutError:
            return False
        finally:
            unsubscribe()

    @staticmethod
    def _actuator_matches(state: State | None, turn_on: bool) -> bool:
        if state is None:
            return False
        normalized = state.state.lower()
        if turn_on:
            return normalized in {"on", "open"}
        return normalized in {"off", "closed"}

    async def _async_close_with_watchdog(
        self,
        zone: dict[str, Any],
        user: User | None,
        reason: str,
    ) -> bool:
        for delay in CLOSE_RETRY_DELAYS:
            if delay:
                await asyncio.sleep(delay)
            if await self._async_set_actuator(zone, False, user):
                ir.async_delete_issue(self.hass, DOMAIN, f"irrigation_close_{zone['id']}")
                return True
        self.document["mode"] = "fault"
        ir.async_create_issue(
            self.hass,
            DOMAIN,
            f"irrigation_close_{zone['id']}",
            is_fixable=False,
            is_persistent=True,
            severity=ir.IssueSeverity.ERROR,
            translation_key="irrigation_close_failed",
            translation_placeholders={"zone": zone["name"], "reason": reason},
        )
        _LOGGER.error("Unable to confirm closure of irrigation zone %s", zone["id"])
        return False

    def _rain_status(self) -> dict[str, Any]:
        settings = self.document["settings"]
        if not settings["rainSensorEnabled"]:
            return {"enabled": False, "active": False, "available": True, "blocked": False, "reason": None}
        entity_id = settings["rainSensorEntityId"]
        state = self.hass.states.get(entity_id)
        available = state is not None and state.state not in {STATE_UNKNOWN, STATE_UNAVAILABLE}
        active = available and state.state.lower() in RAIN_ACTIVE_STATES
        blocked = active or (not available and settings["blockOnRainSensorUnavailable"])
        reason = "rain_detected" if active else "rain_sensor_unavailable" if blocked else None
        return {"enabled": True, "active": active, "available": available, "blocked": blocked, "reason": reason}

    @staticmethod
    def _rain_block_message(rain: dict[str, Any]) -> str:
        if rain.get("reason") == "rain_sensor_unavailable":
            return "Avvio bloccato: il sensore pioggia non è disponibile."
        if rain.get("reason") == "rain_detected":
            return "Avvio bloccato: è stata rilevata pioggia."
        return "Avvio bloccato dalla protezione pioggia."

    def _clear_runtime_listeners(self) -> None:
        for unsubscribe in self._listeners:
            unsubscribe()
        self._listeners.clear()

    def _install_runtime_listeners(self) -> None:
        self._clear_runtime_listeners()
        entity_ids = [zone["entityId"] for zone in self.document["zones"]]
        rain_id = self.document["settings"].get("rainSensorEntityId", "")
        if entity_ids:
            self._listeners.append(async_track_state_change_event(self.hass, entity_ids, self._on_actuator_change))
        if rain_id:
            self._listeners.append(async_track_state_change_event(self.hass, [rain_id], self._on_rain_change))
        for start_time in sorted({time for zone in self.document["zones"] for time in zone["startTimes"]}):
            hour, minute = (int(part) for part in start_time.split(":"))
            self._listeners.append(async_track_time_change(self.hass, self._on_schedule_time, hour=hour, minute=minute, second=0))

    @callback
    def _on_schedule_time(self, now: datetime) -> None:
        local_now = dt_util.as_local(now)
        day = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")[local_now.weekday()]
        current_time = local_now.strftime("%H:%M")
        if self.document["mode"] != "enabled":
            for zone in self.document["zones"]:
                if zone["enabled"] and day in zone["days"] and current_time in zone["startTimes"]:
                    self._record_history({"zoneId": zone["id"], "source": "schedule"}, "skipped", f"system_{self.document['mode']}")
            self.hass.async_create_task(self._async_persist_and_notify())
            return
        for zone in self.document["zones"]:
            if not zone["enabled"] or day not in zone["days"] or current_time not in zone["startTimes"]:
                continue
            occurrence_id = f"{zone['id']}:{local_now.date().isoformat()}:{current_time}"
            self.hass.async_create_task(self._async_start_scheduled_zone(zone, occurrence_id))

    async def _async_start_scheduled_zone(
        self, zone: dict[str, Any], occurrence_id: str
    ) -> None:
        try:
            await self.async_start_zone(
                zone["id"],
                zone["baseDuration"],
                None,
                source="schedule",
                occurrence_id=occurrence_id,
            )
        except IrrigationError as err:
            if occurrence_id not in self.document["processedOccurrences"]:
                self.document["processedOccurrences"] = (
                    [*self.document["processedOccurrences"], occurrence_id][-MAX_OCCURRENCES:]
                )
            self._record_history(zone | {"zoneId": zone["id"], "source": "schedule"}, "skipped", err.code)
            await self._async_persist_and_notify()

    async def _async_persist_and_notify(self) -> None:
        async with self._lock:
            await self._async_persist()
        self._notify_subscribers()

    @callback
    def _on_rain_change(self, _event: Event) -> None:
        rain = self._rain_status()
        self._notify_subscribers()
        if not rain["blocked"]:
            return
        self.hass.async_create_task(self._async_interrupt_for_rain(
            stop_active=(
                rain["reason"] == "rain_sensor_unavailable"
                or self.document["settings"]["rainDuringCycle"] == "stop_immediately"
            )
        ))

    async def _async_interrupt_for_rain(self, *, stop_active: bool) -> None:
        rain_reason = self._rain_status()["reason"] or "rain_detected"
        async with self._lock:
            for session in list(self.document["sessions"]):
                if stop_active and session.get("state") in ACTIVE_SESSION_STATES:
                    await self._async_finish_session(session, rain_reason, close_actuator=True)
                elif session.get("state") == "queued":
                    self._record_history(session, "skipped", rain_reason)
                    self.document["sessions"].remove(session)
            await self._async_persist()
        self._notify_subscribers()

    @callback
    def _on_actuator_change(self, event: Event) -> None:
        entity_id = str(event.data.get("entity_id", ""))
        zone = self._zone_for_entity(entity_id)
        if zone is None:
            return
        active = next((
            item for item in self.document["sessions"]
            if item.get("zoneId") == zone["id"] and item.get("state") in ACTIVE_SESSION_STATES
        ), None)
        new_state = event.data.get("new_state")
        if active is not None and active.get("state") == "running" and self._actuator_matches(new_state, False):
            self.hass.async_create_task(self.async_stop_zone(zone["id"], None, reason="actuator_closed_externally"))
        elif (
            active is not None
            and active.get("state") == "running"
            and (
                new_state is None
                or new_state.state in {STATE_UNKNOWN, STATE_UNAVAILABLE}
            )
        ):
            self.hass.async_create_task(
                self._async_handle_actuator_unavailable(zone, active)
            )
        self._notify_subscribers()

    async def _async_handle_actuator_unavailable(
        self, zone: dict[str, Any], session: dict[str, Any]
    ) -> None:
        """Fail closed when an actuator disappears during a managed cycle."""
        async with self._lock:
            if session not in self.document["sessions"] or session.get("state") != "running":
                return
            self._cancel_timer(str(session.get("id", "")))
            session["state"] = "failed"
            session["reason"] = "actuator_unavailable"
            self._record_history(session, "failed", "actuator_unavailable")
            self.document["sessions"].remove(session)
            # The state is unknown, so closure cannot be proven. The regular
            # watchdog retries and creates the persistent Repair issue.
            await self._async_close_with_watchdog(
                zone, None, "actuator_unavailable"
            )
            await self._async_persist()
        self._notify_subscribers()

    async def _async_disable_legacy_automations(self) -> list[str]:
        registry = er.async_get(self.hass)
        disabled: list[str] = []
        failed: list[str] = []
        for entry in list(registry.entities.values()):
            unique_id = str(entry.unique_id or "")
            if not entry.entity_id.startswith("automation.") or not unique_id.startswith("irrigation_"):
                continue
            state = self.hass.states.get(entry.entity_id)
            friendly_name = str(state.attributes.get("friendly_name", "")) if state is not None else ""
            if not friendly_name.startswith("Irrigazione Smart:"):
                continue
            try:
                await self.hass.services.async_call(
                    "automation", "turn_off", {ATTR_ENTITY_ID: entry.entity_id, "stop_actions": True}, blocking=True
                )
                disabled.append(entry.entity_id)
            except Exception:
                _LOGGER.exception("Unable to disable legacy irrigation automation %s", entry.entity_id)
                failed.append(entry.entity_id)
        if failed:
            raise IrrigationOperationError(
                "Il nuovo scheduler resta fermo: impossibile disabilitare alcune "
                f"automazioni Domus UI precedenti ({', '.join(failed)})."
            )
        return disabled

    async def async_prepare_legacy_automation_removal(self, user: User) -> dict[str, Any]:
        """Expose disabled legacy automations while keeping their triggers off."""
        if not user.is_admin:
            raise IrrigationPermissionError(
                "Solo Owner e Admin possono preparare la rimozione delle automazioni precedenti."
            )

        registry = er.async_get(self.hass)
        legacy_ids = [
            entity_id
            for entity_id in self.document.get("legacyAutomations", [])
            if registry.async_get(entity_id) is not None
        ]
        if not legacy_ids:
            return self.state_for_user(user)

        # Turn off every currently loaded legacy entity before changing its
        # registry visibility. This also stops actions already in progress.
        for entity_id in legacy_ids:
            if self.hass.states.get(entity_id) is not None:
                await self.hass.services.async_call(
                    "automation",
                    "turn_off",
                    {ATTR_ENTITY_ID: entity_id, "stop_actions": True},
                    blocking=True,
                )

        changed = False
        for entity_id in legacy_ids:
            entry = registry.async_get(entity_id)
            if entry is not None and entry.disabled_by is not None:
                registry.async_update_entity(entity_id, disabled_by=None)
                changed = True

        # YAML automations disabled through the entity registry are not loaded.
        # Reloading makes them visible in the supported Automation editor. Their
        # last state is off; we still turn them off again after the reload.
        if changed and self.hass.services.has_service("automation", "reload"):
            try:
                await self.hass.services.async_call("automation", "reload", {}, blocking=True)
            except Exception:
                _LOGGER.exception(
                    "Unable to reload automations after exposing legacy irrigation entries"
                )

        failed: list[str] = []
        for entity_id in legacy_ids:
            if self.hass.states.get(entity_id) is None:
                continue
            try:
                await self.hass.services.async_call(
                    "automation",
                    "turn_off",
                    {ATTR_ENTITY_ID: entity_id, "stop_actions": True},
                    blocking=True,
                )
                state = self.hass.states.get(entity_id)
                if state is not None and state.state != "off":
                    failed.append(entity_id)
            except Exception:
                _LOGGER.exception(
                    "Unable to keep legacy irrigation automation %s disabled", entity_id
                )
                failed.append(entity_id)

        if failed:
            # Fail closed: hide any automation whose off state could not be
            # confirmed, preventing the legacy and Core schedulers from running
            # together.
            for entity_id in failed:
                if registry.async_get(entity_id) is not None:
                    registry.async_update_entity(
                        entity_id, disabled_by=er.RegistryEntryDisabler.INTEGRATION
                    )
            raise IrrigationOperationError(
                "Impossibile verificare lo spegnimento delle automazioni precedenti. "
                "Sono state nuovamente disabilitate per sicurezza."
            )

        self._notify_subscribers()
        return self.state_for_user(user)

    async def _async_persist(self) -> None:
        await self.store.async_save(deepcopy(self.document))
