"""Pure normalization and relationship resolution for HA house registries."""

from __future__ import annotations

import hashlib
import json
import math
from collections.abc import Iterable, Mapping
from datetime import UTC, datetime
from typing import Any

from .models import SCHEMA, HouseIssue, HouseTopology


def _field(entry: Any, name: str, default: Any = None) -> Any:
    return entry.get(name, default) if isinstance(entry, Mapping) else getattr(entry, name, default)


def _text(value: Any) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def _aliases(value: Any) -> list[str]:
    if not isinstance(value, (list, set, tuple)):
        return []
    return sorted({_text(alias) for alias in value} - {None})


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


def normalize_floors(entries: Iterable[Any]) -> list[dict[str, Any]]:
    """Preserve HA registry order; the index is not a separately stored ID."""
    result = []
    for entry in entries:
        floor_id = _text(_field(entry, "floor_id"))
        if floor_id is None:
            continue
        level = _field(entry, "level")
        result.append({
            "id": floor_id,
            "name": _text(_field(entry, "name")) or floor_id,
            "level": level if isinstance(level, int) and not isinstance(level, bool) else None,
            "aliases": _aliases(_field(entry, "aliases")),
            "order": len(result),
        })
    return result


def normalize_rooms(entries: Iterable[Any]) -> list[dict[str, Any]]:
    result = []
    for entry in entries:
        area_id = _text(_field(entry, "id")) or _text(_field(entry, "area_id"))
        if area_id is None:
            continue
        result.append({
            "id": area_id,
            "name": _text(_field(entry, "name")) or area_id,
            "floorId": _text(_field(entry, "floor_id")),
            "aliases": _aliases(_field(entry, "aliases")),
            "icon": _text(_field(entry, "icon")),
            "picture": _text(_field(entry, "picture")),
            # These HA Area fields do not exist in HA 2025.1.0. No fallback is
            # invented: that version produces null references.
            "temperatureEntityId": _text(_field(entry, "temperature_entity_id")),
            "humidityEntityId": _text(_field(entry, "humidity_entity_id")),
        })
    return sorted(result, key=lambda room: room["id"])


def normalize_devices(entries: Iterable[Any]) -> list[dict[str, Any]]:
    result = []
    for entry in entries:
        device_id = _text(_field(entry, "id"))
        if device_id is None:
            continue
        result.append({
            "id": device_id,
            "name": _text(_field(entry, "name_by_user")) or _text(_field(entry, "name")) or device_id,
            "areaId": _text(_field(entry, "area_id")),
        })
    return sorted(result, key=lambda device: device["id"])


def normalize_entities(entries: Iterable[Any]) -> list[dict[str, Any]]:
    result = []
    for entry in entries:
        entity_id = _text(_field(entry, "entity_id"))
        if entity_id is None or "." not in entity_id:
            continue
        result.append({
            "entityId": entity_id,
            # RegistryEntry.id is present in HA 2025.1.0 and 2026.2.3.
            "registryId": _text(_field(entry, "id")),
            "domain": entity_id.split(".", 1)[0],
            "deviceId": _text(_field(entry, "device_id")),
            "explicitAreaId": _text(_field(entry, "area_id")),
            "deviceClass": _text(_field(entry, "device_class")) or _text(_field(entry, "original_device_class")),
        })
    return sorted(result, key=lambda entity: entity["entityId"])


def effective_area(explicit_area_id: str | None, device_area_id: str | None) -> str | None:
    """The one canonical area rule: entity override, then device, then none."""
    return explicit_area_id if explicit_area_id is not None else device_area_id


def _issue(code: str, subject_id: str, reference_id: str | None) -> HouseIssue:
    return {"code": code, "subjectId": subject_id, "referenceId": reference_id}  # type: ignore[typeddict-item]


_DOMAIN_CAPABILITY = {
    "light": "lighting",
    "climate": "climate",
    "media_player": "media",
    "cover": "shading",
}
_ENVIRONMENT_CLASSES = {"temperature", "humidity", "carbon_dioxide", "illuminance", "aqi", "pm25", "pm10"}
_PRESENCE_CLASSES = {"occupancy", "presence"}
_ENERGY_CLASSES = {"energy", "power"}


def capability_for_entity(entity: Mapping[str, Any]) -> str | None:
    domain = entity["domain"]
    device_class = entity.get("deviceClass")
    if domain in _DOMAIN_CAPABILITY:
        return _DOMAIN_CAPABILITY[domain]
    if domain == "sensor":
        if device_class in _ENVIRONMENT_CLASSES:
            return "environment"
        if device_class in _ENERGY_CLASSES:
            return "energy"
    if domain == "binary_sensor" and device_class in _PRESENCE_CLASSES:
        return "presence"
    return None


def build_topology(
    floors: list[dict[str, Any]],
    rooms: list[dict[str, Any]],
    devices: list[dict[str, Any]],
    entities: list[dict[str, Any]],
    *,
    revision: int = 0,
    unavailable_registries: Iterable[str] = (),
    generated_at: str | None = None,
) -> HouseTopology:
    """Build a deterministic topology from normalized registry entries."""
    floors = [dict(item) for item in sorted(floors, key=lambda item: item["order"])]
    rooms = [dict(item) for item in sorted(rooms, key=lambda item: item["id"])]
    devices = [dict(item) for item in sorted(devices, key=lambda item: item["id"])]
    entities = [dict(item) for item in sorted(entities, key=lambda item: item["entityId"])]
    floor_ids = {item["id"] for item in floors}
    room_ids = {item["id"] for item in rooms}
    device_by_id = {item["id"]: item for item in devices}
    entity_ids = {item["entityId"] for item in entities}
    issues: list[HouseIssue] = []
    for name in sorted(set(unavailable_registries)):
        issues.append(_issue("registry_unavailable", name, None))

    for room in rooms:
        if room["floorId"] is not None and room["floorId"] not in floor_ids:
            issues.append(_issue("missing_floor_reference", room["id"], room["floorId"]))
        for field, kind in (("temperatureEntityId", "missing_temperature_entity"), ("humidityEntityId", "missing_humidity_entity")):
            entity_id = room[field]
            if entity_id is not None and entity_id not in entity_ids:
                issues.append(_issue(kind, room["id"], entity_id))

    for device in devices:
        if device["areaId"] is not None and device["areaId"] not in room_ids:
            issues.append(_issue("missing_area_reference", device["id"], device["areaId"]))

    unassigned_entities = []
    capabilities: dict[str, set[str]] = {room_id: set() for room_id in room_ids}
    for entity in entities:
        device_id = entity["deviceId"]
        device = device_by_id.get(device_id) if device_id else None
        if device_id is not None and device is None:
            issues.append(_issue("missing_device_reference", entity["entityId"], device_id))
        explicit = entity["explicitAreaId"]
        area_id = effective_area(explicit, device["areaId"] if device else None)
        entity["effectiveAreaId"] = area_id
        if area_id is None:
            unassigned_entities.append(entity["entityId"])
        elif area_id not in room_ids:
            issues.append(_issue("missing_area_reference", entity["entityId"], area_id))
        else:
            capability = capability_for_entity(entity)
            if capability is not None:
                capabilities[area_id].add(capability)

    for room in rooms:
        room["capabilities"] = [
            {"name": name, "present": True, "available": None, "permitted": True}
            for name in sorted(capabilities[room["id"]])
        ]

    issues.sort(key=lambda issue: (issue["code"], issue["subjectId"], issue["referenceId"] or ""))
    body = {
        "schemaVersion": SCHEMA,
        "floors": floors,
        "rooms": rooms,
        "devices": devices,
        "entities": entities,
        "unassigned": {
            "deviceIds": [device["id"] for device in devices if device["areaId"] is None],
            "entityIds": unassigned_entities,
        },
        "issues": issues,
    }
    digest = hashlib.sha256(json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
    return {
        **body,
        "topologyRevision": revision,
        "topologyFingerprint": digest,
        "generatedAt": generated_at or utc_now(),
    }


def environmental_reading(entity_id: str | None, state: Any) -> dict[str, Any]:
    """Read one configured HA Area source; never serialize raw attributes."""
    result: dict[str, Any] = {
        "configured": entity_id is not None,
        "available": False,
        "value": None,
        "unit": None,
        "sourceEntityId": entity_id,
        "updatedAt": None,
        "status": "unconfigured" if entity_id is None else "missing",
    }
    if entity_id is None or state is None:
        return result
    raw = _field(state, "state")
    attributes = _field(state, "attributes", {})
    unit = attributes.get("unit_of_measurement") if isinstance(attributes, Mapping) else None
    result["unit"] = unit if isinstance(unit, str) else None
    updated = _field(state, "last_updated")
    result["updatedAt"] = updated.isoformat() if isinstance(updated, datetime) else None
    if raw in ("unavailable", "unknown"):
        result["status"] = raw
        return result
    try:
        value = float(raw)
    except (TypeError, ValueError):
        result["status"] = "invalid"
        return result
    if not math.isfinite(value):
        result["status"] = "invalid"
        return result
    result.update(available=True, value=value, status="available")
    return result


def build_snapshot(topology: HouseTopology, state_getter: Any, *, generated_at: str | None = None) -> dict[str, Any]:
    """Read current states on demand, without rebuilding topology or caching state."""
    rooms = []
    for room in topology["rooms"]:
        readings = {}
        for name, field in (("temperature", "temperatureEntityId"), ("humidity", "humidityEntityId")):
            entity_id = room[field]
            readings[name] = environmental_reading(entity_id, state_getter(entity_id) if entity_id else None)
        rooms.append({"roomId": room["id"], **readings})
    return {"schemaVersion": SCHEMA, "topologyFingerprint": topology["topologyFingerprint"], "generatedAt": generated_at or utc_now(), "rooms": rooms}
