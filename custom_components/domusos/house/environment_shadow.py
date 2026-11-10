"""On-demand comparison with the current Rooms environmental display resolver.

This mirrors the *selection* used by RoomsPage/roomsDirectory, without changing
House Snapshot or making its fallback authoritative. Only safe scalar fields
leave this module; HA state attributes are read but never returned.
"""

from __future__ import annotations

import math
import re
from collections.abc import Mapping
from datetime import datetime
from typing import Any

from .models import HouseTopology
from .resolver import build_snapshot, utc_now

METRICS = ("temperature", "humidity")
CATEGORIES = (
    "MATCH", "LEGACY_FALLBACK_ONLY", "HOUSE_PRIMARY_ONLY",
    "DIFFERENT_SOURCE_SAME_VALUE", "DIFFERENT_VALUE", "BOTH_UNAVAILABLE",
    "LEGACY_UNAVAILABLE", "HOUSE_UNAVAILABLE",
)
TOLERANCE = {"temperature": 0.05, "humidity": 0.1}
_FLOAT_PREFIX = re.compile(r"^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?")
_STRICT_NUMBER = re.compile(r"^[+-]?\d+(?:\.\d+)?$")


def _field(value: Any, name: str, default: Any = None) -> Any:
    return value.get(name, default) if isinstance(value, Mapping) else getattr(value, name, default)


def _attributes(state: Any) -> Mapping[str, Any]:
    attrs = _field(state, "attributes", {})
    return attrs if isinstance(attrs, Mapping) else {}


def _legacy_number(raw: Any, *, strict: bool = False) -> float | None:
    """Match mapHassEntitiesToMock (strict) or roomsDirectory.toNumber."""
    if isinstance(raw, bool):
        return None
    if isinstance(raw, (int, float)):
        value = float(raw)
    elif isinstance(raw, str):
        normalized = raw.strip().replace(",", ".")
        match = _STRICT_NUMBER.fullmatch(normalized) if strict else _FLOAT_PREFIX.match(normalized)
        if match is None:
            return None
        value = float(match.group())
    else:
        return None
    return value if math.isfinite(value) else None


def _legacy_value(entity_id: str, state: Any) -> float | None:
    raw = _field(state, "state")
    attrs = _attributes(state)
    numeric = _legacy_number(raw, strict=True)
    if numeric is not None:
        return numeric
    current = _legacy_number(attrs.get("current_temperature"), strict=True)
    if current is not None:
        return current
    if entity_id.startswith("climate."):
        for key in ("temperature", "target_temperature", "target_temp", "setpoint"):
            target = _legacy_number(attrs.get(key), strict=True)
            if target is not None:
                return target
    return _legacy_number(raw)


def _normal_value(metric: str, value: Any, unit: str | None) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        return None
    normalized_unit = (unit or "").strip().lower()
    if metric == "temperature":
        if normalized_unit in ("°f", "f"):
            return (float(value) - 32) * 5 / 9
        if normalized_unit in ("°c", "c", ""):
            return float(value)
        return None
    return float(value) if normalized_unit in ("%", "") else None


def _provenance(room_id: str, metric: str, entity_id: str | None, source: str, state: Any,
                *, value: float | None = None, unit: str | None = None) -> dict[str, Any]:
    if state is not None:
        unit_value = _attributes(state).get("unit_of_measurement")
        unit = unit_value if isinstance(unit_value, str) else None
        value = _legacy_value(entity_id or "", state)
    updated = _field(state, "last_updated") if state is not None else None
    normalized = _normal_value(metric, value, unit)
    safe_unit = unit if unit in ("°C", "°F", "C", "F", "c", "f", "%") else None
    available = value is not None
    raw_state = _field(state, "state") if state is not None else None
    status = ("unconfigured" if entity_id is None else "missing" if state is None else
              "available" if normalized is not None else
              "incompatible_unit" if available else
              raw_state if raw_state in ("unavailable", "unknown") else "invalid")
    return {
        "roomId": room_id, "metric": metric, "entityId": entity_id,
        "resolutionSource": source, "available": available,
        "normalizedValue": normalized, "unit": "°C" if metric == "temperature" and normalized is not None else
        ("%" if metric == "humidity" and normalized is not None else safe_unit),
        "rawValue": value if normalized is None and available else None,
        "updatedAt": updated.isoformat() if isinstance(updated, datetime) else None,
        "status": status,
    }


def _legacy_candidate(entity_id: str, state: Any, metric: str) -> bool:
    # Mirrors isAreaSensorEntityCandidate on the room's sensor bucket. It
    # deliberately accepts class, unit OR entity ID; it does not rank them.
    if not entity_id.startswith("sensor."):
        return False
    device_class = str(_attributes(state).get("device_class") or "").strip().lower()
    unit = str(_attributes(state).get("unit_of_measurement") or "").strip().lower()
    if metric == "temperature":
        return device_class == metric or unit in ("c", "f", "°c", "°f") or "temperature" in entity_id.lower()
    return device_class == metric or unit == "%" or "humidity" in entity_id.lower()


def _legacy_reading(room: Mapping[str, Any], metric: str, entities: Mapping[str, Mapping[str, Any]],
                    states: Mapping[str, Any], candidates: Mapping[tuple[str, str], str]) -> dict[str, Any]:
    room_id = room["id"]
    primary = room["temperatureEntityId" if metric == "temperature" else "humidityEntityId"]
    if primary is not None:
        return _provenance(room_id, metric, primary, "HA_AREA_PRIMARY", states.get(primary))
    entity_id = candidates.get((room_id, metric))
    if entity_id is not None:
        entity = entities[entity_id]
        source = "DEVICE_INHERITED_ENTITY" if entity["explicitAreaId"] is None and entity["deviceId"] is not None else "AUTO_DISCOVERED_ENTITY"
        return _provenance(room_id, metric, entity_id, source, states.get(entity_id))
    return _provenance(room_id, metric, None, "NONE", None)


def compare_readings(metric: str, legacy: Mapping[str, Any], house: Mapping[str, Any]) -> str:
    legacy_available = legacy["available"]
    house_available = house["available"]
    if not legacy_available and not house_available:
        return "BOTH_UNAVAILABLE"
    if legacy_available and not house_available:
        return "LEGACY_FALLBACK_ONLY" if not house["entityId"] else "HOUSE_UNAVAILABLE"
    if house_available and not legacy_available:
        return "HOUSE_PRIMARY_ONLY" if not legacy["entityId"] else "LEGACY_UNAVAILABLE"
    if legacy["normalizedValue"] is None or house["normalizedValue"] is None:
        return "DIFFERENT_VALUE"
    same_value = abs(legacy["normalizedValue"] - house["normalizedValue"]) <= TOLERANCE[metric]
    if not same_value:
        return "DIFFERENT_VALUE"
    return "MATCH" if legacy["entityId"] == house["entityId"] else "DIFFERENT_SOURCE_SAME_VALUE"


def build_environment_shadow(topology: HouseTopology, states: Mapping[str, Any],
                             *, generated_at: str | None = None) -> dict[str, Any]:
    """Compare every HA room once; caller supplies HA state insertion order."""
    snapshot = build_snapshot(topology, states.get, generated_at=generated_at)
    snapshot_rooms = {room["roomId"]: room for room in snapshot["rooms"]}
    entities = {entity["entityId"]: entity for entity in topology["entities"]}
    # One pass in the same state insertion order as Rooms' Object.keys map.
    candidates: dict[tuple[str, str], str] = {}
    for entity_id, state in states.items():
        entity = entities.get(entity_id)
        if entity is None or entity["effectiveAreaId"] is None:
            continue
        for metric in METRICS:
            if _legacy_candidate(entity_id, state, metric):
                candidates.setdefault((entity["effectiveAreaId"], metric), entity_id)
    counts = {metric: {category: 0 for category in CATEGORIES} for metric in METRICS}
    rows = []
    for room in topology["rooms"]:
        for metric in METRICS:
            legacy = _legacy_reading(room, metric, entities, states, candidates)
            house_raw = snapshot_rooms[room["id"]][metric]
            house = _provenance(room["id"], metric, house_raw["sourceEntityId"],
                                "HA_AREA_PRIMARY" if house_raw["configured"] else "NONE", None,
                                value=house_raw["value"], unit=house_raw["unit"])
            house["updatedAt"] = house_raw["updatedAt"]
            if house_raw["status"] != "available":
                house["status"] = house_raw["status"]
            category = compare_readings(metric, legacy, house)
            counts[metric][category] += 1
            rows.append({"roomId": room["id"], "roomName": room["name"], "metric": metric,
                         "legacy": legacy, "house": house, "category": category})
    mismatches = sum(count for metric in METRICS for category, count in counts[metric].items()
                     if category not in ("MATCH", "BOTH_UNAVAILABLE"))
    matches = sum(counts[metric]["MATCH"] for metric in METRICS)
    return {
        "schemaVersion": "domusos.house.environment-shadow.v1",
        "topologyRevision": topology["topologyRevision"],
        "topologyFingerprint": topology["topologyFingerprint"],
        "generatedAt": generated_at or utc_now(), "roomsCompared": len(topology["rooms"]),
        "tolerance": {"temperatureCelsius": TOLERANCE["temperature"], "humidityPercent": TOLERANCE["humidity"]},
        "readiness": "READY" if not mismatches else ("PARTIAL" if matches else "NOT_READY"),
        "counts": counts, "rows": rows,
    }
