"""Validation and persistent document models for waste collection."""

from __future__ import annotations

from copy import deepcopy
from datetime import date, datetime, timezone
import re
from typing import Any

STORAGE_KEY = "domusos.waste_collection.v1"
STORAGE_VERSION = 1
DOCUMENT_SCHEMA = "domusos-waste-collection"
DOCUMENT_VERSION = 1

ALLOWED_DAYS = {"mon", "tue", "wed", "thu", "fri", "sat", "sun"}
ALLOWED_SOURCE_KINDS = {"fixed", "calendar"}
ALLOWED_EXCEPTION_ACTIONS = {"add", "skip"}
TIME_PATTERN = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")
ENTITY_ID_PATTERN = re.compile(r"^calendar\.[a-z0-9_]+$")
NOTIFY_TARGET_PATTERN = re.compile(r"^notify\.[a-z0-9_]+$")
ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$", re.IGNORECASE)
COLOR_PATTERN = re.compile(r"^#[0-9a-f]{6}$", re.IGNORECASE)


class WasteCollectionError(Exception):
    """Base error surfaced through the websocket API."""

    code = "waste_collection_error"


class WasteCollectionValidationError(WasteCollectionError):
    """Invalid waste collection configuration."""

    code = "invalid_config"


class WasteCollectionConflictError(WasteCollectionError):
    """The stored revision changed before saving."""

    code = "revision_conflict"


class WasteCollectionPermissionError(WasteCollectionError):
    """The current user cannot perform the operation."""

    code = "unauthorized"


class WasteCollectionOperationError(WasteCollectionError):
    """A runtime operation could not be completed."""

    code = "operation_rejected"


def utc_now_iso() -> str:
    """Return a stable UTC timestamp."""
    return datetime.now(timezone.utc).isoformat()


def default_document() -> dict[str, Any]:
    """Return an inert document with common waste types but no schedule."""
    return {
        "schema": DOCUMENT_SCHEMA,
        "version": DOCUMENT_VERSION,
        "revision": 0,
        "updatedAt": utc_now_iso(),
        "updatedByUserId": "",
        "wasteTypes": [
            {"id": "organic", "name": "Organico", "icon": "mdi:leaf", "color": "#22c55e", "aliases": []},
            {"id": "paper", "name": "Carta e cartone", "icon": "mdi:package-variant", "color": "#3b82f6", "aliases": []},
            {"id": "plastic", "name": "Plastica e metalli", "icon": "mdi:recycle", "color": "#eab308", "aliases": []},
            {"id": "glass", "name": "Vetro", "icon": "mdi:bottle-soda", "color": "#14b8a6", "aliases": []},
            {"id": "residual", "name": "Indifferenziato", "icon": "mdi:trash-can", "color": "#64748b", "aliases": []},
        ],
        "sources": [],
        "mappings": [],
        "exceptions": [],
        "notifications": {
            "enabled": False,
            "time": "20:00",
            "targets": [],
        },
        "dispatchLedger": [],
    }


def _string(value: Any, *, maximum: int = 255) -> str:
    if not isinstance(value, str):
        return ""
    return value.strip()[:maximum]


def _identifier(value: Any, *, field: str) -> str:
    candidate = _string(value, maximum=64)
    if not ID_PATTERN.fullmatch(candidate):
        raise WasteCollectionValidationError(f"{field} non valido.")
    return candidate.lower()


def _iso_date(value: Any, *, field: str, optional: bool = False) -> str:
    candidate = _string(value, maximum=10)
    if not candidate and optional:
        return ""
    try:
        return date.fromisoformat(candidate).isoformat()
    except ValueError as err:
        raise WasteCollectionValidationError(f"{field} non valida.") from err


def _normalize_waste_type(value: Any, index: int) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise WasteCollectionValidationError("Tipologia di rifiuto non valida.")
    waste_type_id = _identifier(value.get("id"), field="ID tipologia")
    name = _string(value.get("name"), maximum=80)
    if not name:
        raise WasteCollectionValidationError(f"Nome mancante per la tipologia {index + 1}.")
    color = _string(value.get("color"), maximum=7) or "#64748b"
    if not COLOR_PATTERN.fullmatch(color):
        raise WasteCollectionValidationError(f"Colore non valido per {name}.")
    aliases_value = value.get("aliases", [])
    if not isinstance(aliases_value, list):
        raise WasteCollectionValidationError(f"Alias non validi per {name}.")
    aliases: list[str] = []
    for raw_alias in aliases_value:
        alias = _string(raw_alias, maximum=120)
        if alias and alias.casefold() not in {item.casefold() for item in aliases}:
            aliases.append(alias)
    return {
        "id": waste_type_id,
        "name": name,
        "icon": _string(value.get("icon"), maximum=80) or "mdi:trash-can-outline",
        "color": color.lower(),
        "aliases": aliases,
    }


def _normalize_rule(value: Any, index: int, waste_type_ids: set[str]) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise WasteCollectionValidationError("Regola del calendario fisso non valida.")
    rule_id = _identifier(value.get("id"), field="ID regola")
    waste_type_id = _identifier(value.get("wasteTypeId"), field="Tipologia della regola")
    if waste_type_id not in waste_type_ids:
        raise WasteCollectionValidationError(f"Tipologia sconosciuta nella regola {index + 1}.")
    raw_days = value.get("weekdays", [])
    if not isinstance(raw_days, list):
        raise WasteCollectionValidationError("Giorni della regola non validi.")
    weekdays: list[str] = []
    for raw_day in raw_days:
        day = _string(raw_day, maximum=3).lower()
        if day not in ALLOWED_DAYS:
            raise WasteCollectionValidationError("Giorno della regola non valido.")
        if day not in weekdays:
            weekdays.append(day)
    if not weekdays:
        raise WasteCollectionValidationError("Seleziona almeno un giorno per ogni regola fissa.")
    try:
        interval_weeks = int(value.get("intervalWeeks", 1))
    except (TypeError, ValueError) as err:
        raise WasteCollectionValidationError("Intervallo della regola non valido.") from err
    if interval_weeks < 1 or interval_weeks > 52:
        raise WasteCollectionValidationError("L'intervallo deve essere compreso tra 1 e 52 settimane.")
    anchor_date = _iso_date(
        value.get("anchorDate") or date.today().isoformat(),
        field="Data di riferimento",
    )
    return {
        "id": rule_id,
        "wasteTypeId": waste_type_id,
        "enabled": value.get("enabled") is not False,
        "weekdays": weekdays,
        "intervalWeeks": interval_weeks,
        "anchorDate": anchor_date,
        "startDate": _iso_date(value.get("startDate"), field="Data iniziale", optional=True),
        "endDate": _iso_date(value.get("endDate"), field="Data finale", optional=True),
    }


def _normalize_source(value: Any, index: int, waste_type_ids: set[str]) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise WasteCollectionValidationError("Sorgente raccolta non valida.")
    source_id = _identifier(value.get("id"), field="ID sorgente")
    kind = _string(value.get("kind"), maximum=16).lower()
    if kind not in ALLOWED_SOURCE_KINDS:
        raise WasteCollectionValidationError(f"Tipo sorgente non valido per la sorgente {index + 1}.")
    name = _string(value.get("name"), maximum=80) or f"Sorgente {index + 1}"
    normalized: dict[str, Any] = {
        "id": source_id,
        "kind": kind,
        "name": name,
        "enabled": value.get("enabled") is not False,
    }
    if kind == "fixed":
        raw_rules = value.get("rules", [])
        if not isinstance(raw_rules, list):
            raise WasteCollectionValidationError(f"Regole non valide per {name}.")
        rules = [_normalize_rule(rule, rule_index, waste_type_ids) for rule_index, rule in enumerate(raw_rules)]
        rule_ids = [rule["id"] for rule in rules]
        if len(rule_ids) != len(set(rule_ids)):
            raise WasteCollectionValidationError(f"Le regole di {name} devono avere ID univoci.")
        normalized["rules"] = rules
        normalized["entityIds"] = []
    else:
        raw_entity_ids = value.get("entityIds", [])
        if not isinstance(raw_entity_ids, list):
            raise WasteCollectionValidationError(f"Calendari non validi per {name}.")
        entity_ids: list[str] = []
        for raw_entity_id in raw_entity_ids:
            entity_id = _string(raw_entity_id, maximum=255).lower()
            if not ENTITY_ID_PATTERN.fullmatch(entity_id):
                raise WasteCollectionValidationError(f"Entit\u00e0 calendario non valida: {entity_id or '(vuota)' }.")
            if entity_id == "calendar.domus_ui":
                raise WasteCollectionValidationError("Il calendario Domus UI non pu\u00f2 essere usato come propria sorgente.")
            if entity_id not in entity_ids:
                entity_ids.append(entity_id)
        if not entity_ids:
            raise WasteCollectionValidationError(f"Seleziona almeno un calendario per {name}.")
        normalized["entityIds"] = entity_ids
        normalized["rules"] = []
    return normalized


def _normalize_mapping(
    value: Any,
    index: int,
    source_ids: set[str],
    waste_type_ids: set[str],
) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise WasteCollectionValidationError("Mappatura calendario non valida.")
    mapping_id = _identifier(value.get("id"), field="ID mappatura")
    source_id = _identifier(value.get("sourceId"), field="Sorgente mappatura")
    waste_type_id = _identifier(value.get("wasteTypeId"), field="Tipologia mappatura")
    match = _string(value.get("match"), maximum=120)
    if source_id not in source_ids:
        raise WasteCollectionValidationError(f"Sorgente sconosciuta nella mappatura {index + 1}.")
    if waste_type_id not in waste_type_ids:
        raise WasteCollectionValidationError(f"Tipologia sconosciuta nella mappatura {index + 1}.")
    if not match:
        raise WasteCollectionValidationError("Ogni mappatura richiede un titolo esterno.")
    return {
        "id": mapping_id,
        "sourceId": source_id,
        "match": match,
        "wasteTypeId": waste_type_id,
    }


def _normalize_exception(value: Any, index: int, waste_type_ids: set[str]) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise WasteCollectionValidationError("Eccezione calendario non valida.")
    exception_id = _identifier(value.get("id"), field="ID eccezione")
    waste_type_id = _identifier(value.get("wasteTypeId"), field="Tipologia eccezione")
    if waste_type_id not in waste_type_ids:
        raise WasteCollectionValidationError(f"Tipologia sconosciuta nell'eccezione {index + 1}.")
    action = _string(value.get("action"), maximum=8).lower()
    if action not in ALLOWED_EXCEPTION_ACTIONS:
        raise WasteCollectionValidationError("Azione eccezione non valida.")
    return {
        "id": exception_id,
        "date": _iso_date(value.get("date"), field="Data eccezione"),
        "wasteTypeId": waste_type_id,
        "action": action,
    }


def normalize_configuration(value: Any) -> dict[str, Any]:
    """Validate and normalize configuration coming from the frontend."""
    if not isinstance(value, dict):
        raise WasteCollectionValidationError("Configurazione raccolta rifiuti non valida.")
    raw_types = value.get("wasteTypes", [])
    if not isinstance(raw_types, list):
        raise WasteCollectionValidationError("Elenco tipologie non valido.")
    waste_types = [_normalize_waste_type(item, index) for index, item in enumerate(raw_types)]
    waste_type_ids = [item["id"] for item in waste_types]
    if not waste_types:
        raise WasteCollectionValidationError("Configura almeno una tipologia di rifiuto.")
    if len(waste_type_ids) != len(set(waste_type_ids)):
        raise WasteCollectionValidationError("Ogni tipologia deve avere un ID univoco.")
    type_ids = set(waste_type_ids)

    raw_sources = value.get("sources", [])
    if not isinstance(raw_sources, list):
        raise WasteCollectionValidationError("Elenco sorgenti non valido.")
    sources = [_normalize_source(item, index, type_ids) for index, item in enumerate(raw_sources)]
    source_ids = [item["id"] for item in sources]
    if len(source_ids) != len(set(source_ids)):
        raise WasteCollectionValidationError("Ogni sorgente deve avere un ID univoco.")

    raw_mappings = value.get("mappings", [])
    if not isinstance(raw_mappings, list):
        raise WasteCollectionValidationError("Elenco mappature non valido.")
    calendar_source_ids = {
        item["id"] for item in sources if item["kind"] == "calendar"
    }
    mappings = [
        _normalize_mapping(item, index, calendar_source_ids, type_ids)
        for index, item in enumerate(raw_mappings)
    ]
    mapping_ids = [item["id"] for item in mappings]
    if len(mapping_ids) != len(set(mapping_ids)):
        raise WasteCollectionValidationError("Ogni mappatura deve avere un ID univoco.")
    mapping_keys = [
        (item["sourceId"], " ".join(item["match"].casefold().split()))
        for item in mappings
    ]
    if len(mapping_keys) != len(set(mapping_keys)):
        raise WasteCollectionValidationError(
            "Ogni titolo esterno pu\u00f2 essere mappato una sola volta per sorgente."
        )

    raw_exceptions = value.get("exceptions", [])
    if not isinstance(raw_exceptions, list):
        raise WasteCollectionValidationError("Elenco eccezioni non valido.")
    exceptions = [
        _normalize_exception(item, index, type_ids)
        for index, item in enumerate(raw_exceptions)
    ]
    exception_ids = [item["id"] for item in exceptions]
    if len(exception_ids) != len(set(exception_ids)):
        raise WasteCollectionValidationError("Ogni eccezione deve avere un ID univoco.")

    raw_notifications = value.get("notifications", {})
    if not isinstance(raw_notifications, dict):
        raise WasteCollectionValidationError("Impostazioni di notifica non valide.")
    reminder_time = _string(raw_notifications.get("time"), maximum=5) or "20:00"
    if not TIME_PATTERN.fullmatch(reminder_time):
        raise WasteCollectionValidationError("Orario del promemoria non valido.")
    raw_targets = raw_notifications.get("targets", [])
    if not isinstance(raw_targets, list):
        raise WasteCollectionValidationError("Destinatari delle notifiche non validi.")
    targets: list[str] = []
    for raw_target in raw_targets:
        target = _string(raw_target, maximum=255).lower()
        if not NOTIFY_TARGET_PATTERN.fullmatch(target):
            raise WasteCollectionValidationError(f"Destinatario notifica non valido: {target or '(vuoto)'}.")
        if target not in targets:
            targets.append(target)
    enabled = raw_notifications.get("enabled") is True
    if enabled and not targets:
        raise WasteCollectionValidationError("Abilita almeno un destinatario per i promemoria.")

    return {
        "wasteTypes": waste_types,
        "sources": sources,
        "mappings": mappings,
        "exceptions": exceptions,
        "notifications": {
            "enabled": enabled,
            "time": reminder_time,
            "targets": targets,
        },
    }


def normalize_stored_document(value: Any) -> dict[str, Any]:
    """Load a stored document without trusting runtime metadata."""
    if not isinstance(value, dict) or value.get("schema") != DOCUMENT_SCHEMA:
        return default_document()
    normalized = normalize_configuration(value)
    result = default_document()
    result.update(normalized)
    try:
        result["revision"] = max(0, int(value.get("revision", 0)))
    except (TypeError, ValueError):
        result["revision"] = 0
    result["updatedAt"] = _string(value.get("updatedAt"), maximum=64) or utc_now_iso()
    result["updatedByUserId"] = _string(value.get("updatedByUserId"), maximum=160)
    ledger = value.get("dispatchLedger", [])
    if isinstance(ledger, list):
        result["dispatchLedger"] = [
            entry for entry in (_string(item, maximum=520) for item in ledger) if entry
        ][-500:]
    return result


def public_document(document: dict[str, Any]) -> dict[str, Any]:
    """Return the configuration without the internal delivery ledger."""
    return deepcopy({
        key: document[key]
        for key in (
            "schema",
            "version",
            "revision",
            "updatedAt",
            "updatedByUserId",
            "wasteTypes",
            "sources",
            "mappings",
            "exceptions",
            "notifications",
        )
    })
