"""Conservative, deterministic room temperature and humidity source selection.

The registry supplies semantic identity. HA state is consulted only after a
source is selected, so an unavailable sensor cannot reorder the candidates.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Mapping
from typing import Any

from .models import HouseTopology

METRICS = ("temperature", "humidity")
_CONTROL_DOMAINS = frozenset({"climate", "switch", "number", "select", "button", "water_heater", "fan", "humidifier"})


def build_environment_candidate_index(
    topology: HouseTopology, metadata: Mapping[str, Mapping[str, Any]] | None = None,
) -> dict[tuple[str, str], list[str]]:
    """Index only credible ambient sensors, without state or name heuristics.

    A user-assigned entity without a device is an explicit room placement.
    Device-backed sensors require a temperature/humidity pair on a device with
    no controls. This intentionally rejects isolated equipment thermometers.
    """
    metadata = metadata or {}
    by_device: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for entity in topology["entities"]:
        if entity["deviceId"]:
            by_device[entity["deviceId"]].append(entity)
    ranked: dict[tuple[str, str], list[tuple[tuple[int, str, str], str]]] = defaultdict(list)
    for entity in topology["entities"]:
        metric = entity["deviceClass"]
        room_id = entity["effectiveAreaId"]
        if entity["domain"] != "sensor" or metric not in METRICS or room_id is None:
            continue
        flags = metadata.get(entity["entityId"], {})
        if flags.get("disabledBy") is not None or flags.get("hiddenBy") is not None or flags.get("entityCategory") is not None:
            continue
        device_id = entity["deviceId"]
        if device_id:
            siblings = by_device[device_id]
            sibling_classes = {sibling["deviceClass"] for sibling in siblings
                               if sibling["effectiveAreaId"] == room_id and sibling["domain"] == "sensor"
                               and metadata.get(sibling["entityId"], {}).get("entityCategory") is None}
            if not set(METRICS).issubset(sibling_classes) or any(
                sibling["domain"] in _CONTROL_DOMAINS for sibling in siblings
            ):
                continue
        elif entity["explicitAreaId"] != room_id:
            continue
        # Explicit area beats inherited area; stable registry ID breaks ties.
        rank = (0 if entity["explicitAreaId"] == room_id else 1,
                entity["registryId"] or entity["entityId"], entity["entityId"])
        ranked[(room_id, metric)].append((rank, entity["entityId"]))
    return {key: [entity_id for _, entity_id in sorted(values)] for key, values in ranked.items()}


def visible_environment_candidates(
    index: Mapping[tuple[str, str], list[str]], visible_ids: set[str],
) -> dict[tuple[str, str], list[str]]:
    """Apply the already authorized House projection before runtime reads."""
    return {key: filtered for key, values in index.items()
            if (filtered := [entity_id for entity_id in values if entity_id in visible_ids])}


def resolve_environment(
    _room_id: str, metric: str, primary: str | None,
    entities: Mapping[str, Mapping[str, Any]], safe_candidates: list[str], state_getter: Any,
) -> dict[str, Any]:
    """Area primary is authoritative, including during temporary unavailability."""
    from .resolver import environmental_reading

    entity_id = primary or (safe_candidates[0] if safe_candidates else None)
    entity = entities.get(primary) if primary else None
    invalid_primary = primary is not None and entity is not None and (
        entity["domain"] != "sensor" or entity["deviceClass"] not in (None, metric)
    )
    state = state_getter(entity_id) if entity_id else None
    attributes = getattr(state, "attributes", None)
    if isinstance(state, Mapping):
        attributes = state.get("attributes")
    attributes = attributes if isinstance(attributes, Mapping) else {}
    state_class = attributes.get("device_class")
    unit = attributes.get("unit_of_measurement")
    compatible_unit = unit is None or (
        unit in ("°C", "°F", "C", "F", "c", "f") if metric == "temperature" else unit == "%"
    )
    mismatch = invalid_primary or (state_class is not None and state_class != metric)
    reading = environmental_reading(entity_id, state if not mismatch and compatible_unit else None)
    if mismatch:
        reading["status"] = "metric_mismatch"
    elif not compatible_unit:
        reading["status"] = "incompatible_unit"
    source = "HA_AREA_PRIMARY" if primary else "SAFE_ROOM_FALLBACK" if entity_id else "NONE"
    reading.update({
        "metric": metric,
        "configuredPrimaryEntityId": primary,
        "selectedEntityId": entity_id,
        "selectionSource": source,
        "selectionReason": "AREA_PRIMARY" if primary else "NO_AREA_PRIMARY" if entity_id else "NO_SAFE_SOURCE",
        "fallbackUsed": primary is None and entity_id is not None,
    })
    return reading
