"""Validation and data models for Domus Core Irrigation."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
import re
from typing import Any

STORAGE_KEY = "domusos.irrigation.v1"
STORAGE_VERSION = 1
DOCUMENT_SCHEMA = "domusos-irrigation"
DOCUMENT_VERSION = 1

MIN_DURATION_MIN = 1
MIN_MAXIMUM_DURATION_MIN = 5
MAX_DURATION_MIN = 60
MAX_STORED_HISTORY = 200
ALLOWED_ACTUATOR_DOMAINS = {"switch", "valve"}
ALLOWED_DAYS = {"mon", "tue", "wed", "thu", "fri", "sat", "sun"}
ALLOWED_MODES = {"enabled", "paused", "stopped", "fault"}
ALLOWED_RAIN_POLICIES = {"stop_immediately", "finish_active"}
TIME_PATTERN = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")
ENTITY_ID_PATTERN = re.compile(r"^[a-z0-9_]+\.[a-z0-9_]+$")
ZONE_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$", re.IGNORECASE)


class IrrigationError(Exception):
    """Base error surfaced through websocket and service actions."""

    code = "irrigation_error"


class IrrigationValidationError(IrrigationError):
    """Invalid irrigation input."""

    code = "invalid_config"


class IrrigationConflictError(IrrigationError):
    """Optimistic revision conflict."""

    code = "revision_conflict"


class IrrigationActiveSessionConflictError(IrrigationError):
    """A configuration change would affect a live irrigation session."""

    code = "active_session_conflict"


class IrrigationPermissionError(IrrigationError):
    """The authenticated user cannot control the requested zone."""

    code = "unauthorized"


class IrrigationOperationError(IrrigationError):
    """The engine rejected an operational command."""

    code = "operation_rejected"


def utc_now_iso() -> str:
    """Return a stable UTC timestamp."""
    return datetime.now(timezone.utc).isoformat()


def default_document() -> dict[str, Any]:
    """Return an empty, safe and stopped irrigation document."""
    return {
        "schema": DOCUMENT_SCHEMA,
        "version": DOCUMENT_VERSION,
        "revision": 0,
        "updatedAt": utc_now_iso(),
        "updatedByUserId": "",
        "mode": "stopped",
        "settings": {
            "maximumManualDurationMin": 60,
            "maxConcurrentZones": 1,
            "parallelSafetyAcknowledged": False,
            "rainSensorEnabled": False,
            "rainSensorEntityId": "",
            "blockOnRainSensorUnavailable": True,
            "rainDuringCycle": "stop_immediately",
        },
        "sources": {
            "weatherEntityId": "",
            "humidityEntityId": "",
            "outdoorTempEntityId": "",
            "soilMoistureEntityId": "",
            "waterUsageEntityId": "",
            "waterAverageEntityId": "",
        },
        "zones": [],
        "sessions": [],
        "processedOccurrences": [],
        "processedRequests": [],
        "legacyAutomations": [],
        "legacyMigrationCompleted": False,
        "history": [],
    }


def _string(value: Any, *, maximum: int = 255) -> str:
    if not isinstance(value, str):
        return ""
    return value.strip()[:maximum]


def _entity_id(value: Any, *, domains: set[str] | None = None, optional: bool = True) -> str:
    entity_id = _string(value)
    if not entity_id and optional:
        return ""
    if not ENTITY_ID_PATTERN.fullmatch(entity_id):
        raise IrrigationValidationError(f"Entity ID non valido: {entity_id or '(vuoto)'}")
    if domains is not None and entity_id.split(".", 1)[0] not in domains:
        raise IrrigationValidationError(f"Dominio non supportato per {entity_id}.")
    return entity_id


def _integer(value: Any, *, minimum: int, maximum: int, field: str) -> int:
    if isinstance(value, bool):
        raise IrrigationValidationError(f"{field} non valido.")
    try:
        result = int(value)
    except (TypeError, ValueError) as err:
        raise IrrigationValidationError(f"{field} non valido.") from err
    if result < minimum or result > maximum:
        raise IrrigationValidationError(
            f"{field} deve essere compreso tra {minimum} e {maximum}."
        )
    return result


def _normalize_zone(value: Any, index: int, maximum_duration: int) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise IrrigationValidationError("Zona irrigazione non valida.")
    zone_id = _string(value.get("id"), maximum=64)
    if not ZONE_ID_PATTERN.fullmatch(zone_id):
        raise IrrigationValidationError(f"ID zona non valido: {zone_id or index + 1}.")
    name = _string(value.get("name"), maximum=80) or f"Zona {index + 1}"
    entity_id = _entity_id(value.get("entityId"), domains=ALLOWED_ACTUATOR_DOMAINS)
    days_value = value.get("days", [])
    if not isinstance(days_value, list):
        raise IrrigationValidationError(f"Giorni non validi per {name}.")
    days: list[str] = []
    for raw_day in days_value:
        day = _string(raw_day, maximum=3).lower()
        if day not in ALLOWED_DAYS:
            raise IrrigationValidationError(f"Giorno non valido per {name}.")
        if day not in days:
            days.append(day)
    times_value = value.get("startTimes", [])
    if not isinstance(times_value, list):
        raise IrrigationValidationError(f"Orari non validi per {name}.")
    start_times: list[str] = []
    for raw_time in times_value:
        start_time = _string(raw_time, maximum=5)
        if not TIME_PATTERN.fullmatch(start_time):
            raise IrrigationValidationError(f"Orario non valido per {name}.")
        if start_time not in start_times:
            start_times.append(start_time)
    start_times.sort()
    duration = _integer(
        value.get("baseDuration", value.get("durationMin", 10)),
        minimum=MIN_DURATION_MIN,
        maximum=maximum_duration,
        field=f"Durata di {name}",
    )
    return {
        "id": zone_id,
        "name": name,
        "entityId": entity_id,
        "enabled": value.get("enabled") is not False and bool(entity_id),
        "days": days,
        "startTimes": start_times,
        "baseDuration": duration,
        "manualDurationMin": _integer(
            value.get("manualDurationMin", duration),
            minimum=MIN_DURATION_MIN,
            maximum=maximum_duration,
            field=f"Durata manuale di {name}",
        ),
        "iconKey": _string(value.get("iconKey"), maximum=40) or "sprout",
        "detail": _string(value.get("detail"), maximum=160),
        "soilMoistureEntityId": _entity_id(value.get("soilMoistureEntityId")),
    }


def normalize_configuration(value: Any) -> dict[str, Any]:
    """Validate and normalize a frontend or stored irrigation configuration."""
    if not isinstance(value, dict):
        raise IrrigationValidationError("Configurazione irrigazione non valida.")
    raw_settings = value.get("settings") if isinstance(value.get("settings"), dict) else value
    raw_sources = value.get("sources") if isinstance(value.get("sources"), dict) else value
    maximum_duration = _integer(
        raw_settings.get("maximumManualDurationMin", 60),
        minimum=MIN_MAXIMUM_DURATION_MIN,
        maximum=MAX_DURATION_MIN,
        field="Durata massima",
    )
    zones_value = value.get("zones", [])
    if not isinstance(zones_value, list):
        raise IrrigationValidationError("Elenco zone non valido.")
    zones = [_normalize_zone(zone, index, maximum_duration) for index, zone in enumerate(zones_value)]
    zone_ids = [zone["id"] for zone in zones]
    entity_ids = [zone["entityId"] for zone in zones if zone["entityId"]]
    if len(zone_ids) != len(set(zone_ids)):
        raise IrrigationValidationError("Ogni zona deve avere un ID univoco.")
    if len(entity_ids) != len(set(entity_ids)):
        raise IrrigationValidationError("Una valvola o uno switch non può appartenere a più zone.")
    maximum_parallel = max(1, len(entity_ids))
    max_concurrent = _integer(
        raw_settings.get("maxConcurrentZones", 1),
        minimum=1,
        maximum=maximum_parallel,
        field="Zone simultanee",
    )
    parallel_acknowledged = raw_settings.get("parallelSafetyAcknowledged") is True
    if max_concurrent > 1 and not parallel_acknowledged:
        raise IrrigationValidationError(
            "Conferma la portata dell’impianto prima di attivare più zone simultanee."
        )
    rain_policy = _string(raw_settings.get("rainDuringCycle"), maximum=32) or "stop_immediately"
    if rain_policy not in ALLOWED_RAIN_POLICIES:
        raise IrrigationValidationError("Politica pioggia non valida.")
    rain_sensor_id = _entity_id(raw_settings.get("rainSensorEntityId"))
    rain_enabled = raw_settings.get("rainSensorEnabled") is True
    if rain_enabled and not rain_sensor_id:
        raise IrrigationValidationError("La protezione pioggia richiede un sensore.")
    return {
        "settings": {
            "maximumManualDurationMin": maximum_duration,
            "maxConcurrentZones": max_concurrent,
            "parallelSafetyAcknowledged": parallel_acknowledged,
            "rainSensorEnabled": rain_enabled,
            "rainSensorEntityId": rain_sensor_id,
            "blockOnRainSensorUnavailable": raw_settings.get("blockOnRainSensorUnavailable") is not False,
            "rainDuringCycle": rain_policy,
        },
        "sources": {
            "weatherEntityId": _entity_id(raw_sources.get("weatherEntityId")),
            "humidityEntityId": _entity_id(raw_sources.get("humidityEntityId")),
            "outdoorTempEntityId": _entity_id(raw_sources.get("outdoorTempEntityId")),
            "soilMoistureEntityId": _entity_id(raw_sources.get("soilMoistureEntityId")),
            "waterUsageEntityId": _entity_id(raw_sources.get("waterUsageEntityId")),
            "waterAverageEntityId": _entity_id(raw_sources.get("waterAverageEntityId")),
        },
        "zones": zones,
    }


def normalize_stored_document(value: Any) -> dict[str, Any]:
    """Load a stored document without trusting persisted runtime values."""
    if not isinstance(value, dict) or value.get("schema") != DOCUMENT_SCHEMA:
        return default_document()
    if value.get("version") != DOCUMENT_VERSION:
        return default_document()
    normalized = normalize_configuration(value)
    result = default_document()
    result.update(normalized)
    revision = value.get("revision")
    result["revision"] = revision if isinstance(revision, int) and revision >= 0 else 0
    result["updatedAt"] = _string(value.get("updatedAt")) or utc_now_iso()
    result["updatedByUserId"] = _string(value.get("updatedByUserId"), maximum=128)
    mode = _string(value.get("mode"), maximum=16)
    result["mode"] = mode if mode in ALLOWED_MODES else "stopped"
    result["sessions"] = deepcopy(value.get("sessions")) if isinstance(value.get("sessions"), list) else []
    occurrences = value.get("processedOccurrences")
    result["processedOccurrences"] = (
        [_string(item, maximum=160) for item in occurrences if _string(item, maximum=160)][-500:]
        if isinstance(occurrences, list)
        else []
    )
    requests = value.get("processedRequests")
    result["processedRequests"] = (
        [_string(item, maximum=160) for item in requests if _string(item, maximum=160)][-500:]
        if isinstance(requests, list)
        else []
    )
    legacy = value.get("legacyAutomations")
    result["legacyAutomations"] = (
        [_string(item, maximum=255) for item in legacy if _string(item, maximum=255)]
        if isinstance(legacy, list)
        else []
    )
    result["legacyMigrationCompleted"] = value.get("legacyMigrationCompleted") is True
    history = value.get("history")
    result["history"] = (
        [deepcopy(item) for item in history if isinstance(item, dict)][-MAX_STORED_HISTORY:]
        if isinstance(history, list)
        else []
    )
    return result
