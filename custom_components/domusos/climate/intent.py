"""Pure CLM.3A intent and read-only decision preview. No HA imports or execution."""

from __future__ import annotations

import math
from collections.abc import Mapping
from typing import Any

from .models import InvalidConfig

STATE_SCHEMA = "domusos-climate-state"
STATE_VERSION = 1
STATE_STORAGE_KEY = "domusos.climate_state.v1"
DEADBAND_CELSIUS = 0.2


def default_intent(config: Mapping[str, Any]) -> dict[str, Any]:
    """Absent state is safely off. Legacy config intent seeds only the first state."""
    return {
        "house": {"operatingMode": config.get("operatingMode", "off"), "controlMode": config.get("controlMode", "manual")},
        "zones": {zone["id"]: {"mode": zone.get("mode", "follow_house"), "targetTemperature": None} for zone in config["zones"]},
    }


def _target(value: Any, field: str) -> float | None:
    if value is None:
        return None
    if type(value) not in (int, float) or not math.isfinite(value) or not 5 <= value <= 40:
        raise InvalidConfig(field, "room target must be 5–40 °C or null")
    return float(value)


def parse_intent(value: Any) -> dict[str, Any]:
    if type(value) is not dict or set(value) != {"house", "zones"}:
        raise InvalidConfig("intent", "unexpected or missing fields")
    house = value["house"]
    if type(house) is not dict or set(house) != {"operatingMode", "controlMode"}:
        raise InvalidConfig("intent.house")
    if house["operatingMode"] not in ("heating", "cooling", "off") or house["controlMode"] not in ("manual", "auto"):
        raise InvalidConfig("intent.house", "invalid operating or control mode")
    zones = value["zones"]
    if type(zones) is not dict or len(zones) > 64:
        raise InvalidConfig("intent.zones")
    parsed_zones: dict[str, Any] = {}
    for zone_id, zone in zones.items():
        if type(zone_id) is not str or not zone_id or type(zone) is not dict or set(zone) != {"mode", "targetTemperature"}:
            raise InvalidConfig("intent.zones", "invalid zone intent")
        if zone["mode"] not in ("follow_house", "off"):
            raise InvalidConfig(f"intent.zones.{zone_id}.mode")
        parsed_zones[zone_id] = {"mode": zone["mode"], "targetTemperature": _target(zone["targetTemperature"], f"intent.zones.{zone_id}.targetTemperature")}
    return {"house": dict(house), "zones": parsed_zones}


def parse_state_document(value: Any) -> tuple[int, dict[str, Any]]:
    if type(value) is not dict or set(value) != {"schema", "version", "revision", "intent"} or value["schema"] != STATE_SCHEMA:
        raise InvalidConfig("state_store")
    version = value["version"]
    if type(version) is not int or version < 1:
        raise InvalidConfig("state_store.version")
    if version > STATE_VERSION:
        from .models import UnsupportedSchema

        raise UnsupportedSchema("newer climate state store")
    if type(value["revision"]) is not int or value["revision"] < 1:
        raise InvalidConfig("state_store.revision")
    return value["revision"], parse_intent(value["intent"])


def state_document(revision: int, intent: Mapping[str, Any]) -> dict[str, Any]:
    return {"schema": STATE_SCHEMA, "version": STATE_VERSION, "revision": revision, "intent": parse_intent(intent)}


def _numeric(value: Any) -> float | None:
    if type(value) not in (str, int, float):
        return None
    try:
        result = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return result if math.isfinite(result) else None


def _reading(reference: Mapping[str, Any] | None, states: Mapping[str, Any], attribute: str, stale_ids: frozenset[str]) -> dict[str, Any]:
    if reference is None:
        return {"value": None, "source": None, "availability": "unavailable"}
    statuses: list[str] = []
    for entity_id in [reference["primaryEntityId"], *reference["fallbacks"]]:
        state = states.get(entity_id)
        if state is None or getattr(state, "state", None) in ("unavailable", "unknown"):
            statuses.append("unavailable")
            continue
        if entity_id in stale_ids:
            statuses.append("stale")
            continue
        raw = getattr(state, "attributes", {}).get(attribute) if entity_id.startswith("climate.") else getattr(state, "state", None)
        value = _numeric(raw)
        if value is None or (attribute == "current_humidity" and not 0 <= value <= 100):
            statuses.append("invalid")
            continue
        return {"value": value, "source": entity_id, "availability": "available"}
    return {"value": None, "source": None, "availability": "stale" if "stale" in statuses else "invalid" if "invalid" in statuses else "unavailable"}


def _supports(item: Mapping[str, Any], mode: str, kind: str) -> bool:
    capabilities = item.get("capabilities")
    if capabilities is not None:
        name = "supportsHeating" if mode == "heating" else "supportsCooling"
        if kind == "generator" and mode == "heating":
            name = "supportsSpaceHeating"
        return bool(capabilities.get(name))
    if kind == "terminal":
        return ("room_heater" in item["roles"] or "radiator_trv" in item["roles"]) if mode == "heating" else "room_cooler" in item["roles"]
    if kind == "circuit":
        return mode == "heating"  # CLM.2 radiators had heating-only semantics.
    return ("space_heating" if mode == "heating" else "space_cooling") in item["services"]


def preview(config: Mapping[str, Any], intent: Mapping[str, Any], states: Mapping[str, Any], *, stale_ids: frozenset[str] = frozenset(), auto_targets: Mapping[str, float] | None = None, auto_resolution: Mapping[str, Any] | None = None) -> dict[str, Any]:
    """Compute desired/observed/derived state without choosing or commanding a source."""
    parsed = parse_intent(intent)
    house = parsed["house"]
    mode = house["operatingMode"]
    terminals = {item["id"]: item for item in config["endpoints"]}
    circuits = {item["id"]: item for item in config["circuits"]}
    generators = {item["id"]: item for item in config["generators"]}
    auxiliaries = {item["id"]: item for item in config.get("auxiliaries", [])}
    groups = config.get("equipmentGroups", [])
    result: list[dict[str, Any]] = []
    for zone in config["zones"]:
        zone_id = zone["id"]
        zone_intent = parsed["zones"].get(zone_id, {"mode": "follow_house", "targetTemperature": None})
        temperature = _reading(zone["reference"], states, "current_temperature", stale_ids)
        humidity = _reading(zone.get("humidityReference"), states, "current_humidity", stale_ids)
        if house["controlMode"] == "manual":
            effective_target = zone_intent["targetTemperature"]
            target_source = "manual" if effective_target is not None else None
            target_reason = None if effective_target is not None else "no_manual_target"
        elif auto_resolution is not None:
            zone_auto = auto_resolution.get("zoneTargets", {}).get(zone_id, {}) if auto_resolution.get("status") == "resolved" else {}
            effective_target = zone_auto.get("value") if zone_auto.get("status") == "resolved" else None
            target_source = "schedule" if effective_target is not None else None
            if effective_target is not None:
                target_reason = None
            elif auto_resolution.get("status") == "resolved":
                target_reason = "no_target"
            else:
                target_reason = auto_resolution.get("status")
        else:
            effective_target = _target(auto_targets[zone_id], "auto_targets") if auto_targets is not None and zone_id in auto_targets else None
            target_source = "auto_fixture" if effective_target is not None else None
            target_reason = None if effective_target is not None else "no_schedule"
        if mode == "off" or zone_intent["mode"] == "off":
            status = "off"
            thermal_reason = None
        elif effective_target is None:
            status = "unknown"
            thermal_reason = target_reason
        elif temperature["value"] is None:
            status = "unknown"
            thermal_reason = "sensor_unavailable"
        elif mode == "heating" and temperature["value"] < effective_target - DEADBAND_CELSIUS:
            status = "needs_heating"
            thermal_reason = None
        elif mode == "cooling" and temperature["value"] > effective_target + DEADBAND_CELSIUS:
            status = "needs_cooling"
            thermal_reason = None
        else:
            status = "satisfied"
            thermal_reason = None
        terminal_rows: list[dict[str, Any]] = []
        paths: list[dict[str, Any]] = []
        for terminal_id in zone["endpointIds"]:
            terminal = terminals[terminal_id]
            entity_id = terminal["entity"]["primaryEntityId"]
            state = states.get(entity_id)
            available = state is not None and getattr(state, "state", None) not in ("unavailable", "unknown")
            compatible = mode != "off" and zone_intent["mode"] != "off" and _supports(terminal, mode, "terminal")
            observed_target = _numeric(getattr(state, "attributes", {}).get("temperature")) if entity_id.startswith("climate.") and state is not None else None
            terminal_rows.append({"id": terminal_id, "entityId": entity_id, "available": available, "compatible": compatible, "observedTarget": observed_target,
                                  "targetMismatch": effective_target is not None and observed_target is not None and abs(effective_target - observed_target) > 0.05,
                                  "mismatchCause": "unknown", "equipmentGroupIds": [group["id"] for group in groups if terminal_id in group["memberEndpointIds"]]})
            if not available or not compatible:
                continue
            circuit_id = terminal["circuitId"]
            circuit = circuits.get(circuit_id) if circuit_id else None
            if circuit is not None and not _supports(circuit, mode, "circuit"):
                continue
            generator_rows = []
            constraint = circuit.get("coolingConstraint") if circuit is not None and mode == "cooling" else None
            if circuit is not None:
                preferences = {entry["generatorId"]: entry["role"] for entry in circuit.get("generatorPreferences", [])}
                for generator_id in circuit["generatorIds"]:
                    generator = generators[generator_id]
                    if _supports(generator, mode, "generator"):
                        generator_rows.append({"id": generator_id, "role": preferences.get(generator_id, "available")})
                if circuit["generatorIds"] and not generator_rows:
                    continue
            paths.append({"terminalId": terminal_id, "circuitId": circuit_id, "generatorCandidates": generator_rows,
                          "humidityConstraintPresent": bool(constraint and constraint["requiresHumidityControl"]),
                          "condensationProtectionRequired": bool(constraint and constraint["condensationProtection"] == "required"),
                          "auxiliaryCandidates": [aid for aid in constraint["auxiliaryIds"] if aid in auxiliaries] if constraint else [],
                          "sharedOperatingMode": any(group["sharedOperatingMode"] for group in groups if terminal_id in group["memberEndpointIds"])})
        result.append({"zoneId": zone_id, "intent": zone_intent, "observed": {"temperature": temperature["value"], "humidity": humidity["value"],
                       "temperatureSource": temperature["source"], "humiditySource": humidity["source"], "temperatureAvailability": temperature["availability"], "humidityAvailability": humidity["availability"]},
                       "derived": {"effectiveTarget": effective_target, "targetSource": target_source, "targetReason": target_reason,
                                   "effectiveTargetDetail": {"value": effective_target, "source": target_source,
                                                             "profileId": auto_resolution.get("activeProfileId") if target_source == "schedule" and auto_resolution else None,
                                                             "event": auto_resolution.get("activeEvent") if target_source == "schedule" and auto_resolution else None},
                                   "autoPendingConfiguration": house["controlMode"] == "auto" and effective_target is None,
                                   "thermalStatus": status, "thermalReason": thermal_reason, "terminals": terminal_rows, "compatiblePaths": paths}})
    return {"house": house, "autoResolution": auto_resolution if house["controlMode"] == "auto" else None,
            "zones": result, "deadbandCelsius": DEADBAND_CELSIUS}
