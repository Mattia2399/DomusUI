"""Pure, closed CLM.2 HOUSE configuration contract. No HA imports or runtime state."""

from __future__ import annotations

import json
import math
import re
from collections.abc import Callable, Mapping
from copy import deepcopy
from typing import Any

STORAGE_KEY = "domusos.climate.v1"
STORAGE_VERSION = 1
SCHEMA = "domusos-climate"
VERSION = 1
_ID = re.compile(r"^[a-z][a-z0-9_-]{0,63}$")
_ENTITY = re.compile(r"^[a-z_]+\.[a-z0-9_]+$")
_DOMAIN = frozenset({"select", "number", "input_number", "switch", "input_boolean", "sensor", "binary_sensor", "valve"})
_ROLES = frozenset({"room_heater", "room_cooler", "radiator_trv", "zone_actuator", "fan", "dehumidifier"})
_SERVICES = frozenset({"space_heating", "space_cooling", "domestic_hot_water"})
_CAPABILITIES = frozenset({"supportsHeating", "supportsCooling", "supportsFan", "supportsDehumidification"})
WEEKDAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
_LOCAL_TIME = re.compile(r"^(?:[01][0-9]|2[0-3]):[0-5][0-9]$")
MAX_CONFIG_BYTES = 200_000


class ClimateError(Exception):
    code = "climate_error"


class InvalidConfig(ClimateError):
    code = "invalid_config"

    def __init__(self, field: str, message: str = "invalid configuration") -> None:
        super().__init__(f"{field}: {message}")
        self.field = field


class InvalidFormat(ClimateError):
    code = "invalid_format"


class OverrideUnavailable(ClimateError):
    code = "override_not_available_in_manual"


class NextScheduleEventUnavailable(ClimateError):
    code = "next_schedule_event_unavailable"


class HouseTimezoneUnavailable(ClimateError):
    code = "timezone_unavailable"


class ProfileInUse(InvalidConfig):
    code = "profile_in_use"


class DuplicateScheduleTime(InvalidConfig):
    code = "duplicate_schedule_time"


class EntityMissing(InvalidConfig):
    code = "entity_missing"


class EntityIncompatible(InvalidConfig):
    code = "entity_incompatible"


class AreaMissing(InvalidConfig):
    code = "area_missing"


class Conflict(ClimateError):
    code = "conflict"


class StoreUnavailable(ClimateError):
    code = "store_unavailable"


class ClimatePermissionError(ClimateError):
    code = "access_denied"


class UnsupportedSchema(ClimateError):
    code = "unsupported"


class MigrationFailed(ClimateError):
    code = "migration_failed"


Migration = Callable[[Mapping[str, Any]], Mapping[str, Any]]
MIGRATIONS: Mapping[int, Migration] = {}


def _object(value: Any, keys: set[str], field: str) -> dict[str, Any]:
    if type(value) is not dict or set(value) != keys:
        raise InvalidConfig(field, "unexpected or missing fields")
    return value


def _extended(value: Any, required: set[str], optional: set[str], field: str) -> dict[str, Any]:
    if type(value) is not dict or not required <= set(value) or not set(value) <= required | optional:
        raise InvalidConfig(field, "unexpected or missing fields")
    return value


def _bool(value: Any, field: str) -> bool:
    if type(value) is not bool:
        raise InvalidConfig(field, "expected boolean")
    return value


def _capabilities(value: Any, field: str, names: set[str]) -> dict[str, bool]:
    item = _object(value, names, field)
    return {name: _bool(item[name], field + "." + name) for name in sorted(names)}


def _reference(value: Any, field: str) -> dict[str, Any]:
    item = _object(value, {"primaryEntityId", "fallbacks"}, field)
    primary = _entity(item["primaryEntityId"], field + ".primaryEntityId")
    fallbacks = [_entity(entity_id, field + ".fallbacks") for entity_id in _list(item["fallbacks"], field + ".fallbacks", 8)]
    if len(set(fallbacks)) != len(fallbacks) or primary in fallbacks:
        raise InvalidConfig(field, "duplicate sensor source")
    return {"primaryEntityId": primary, "fallbacks": fallbacks}


def _text(value: Any, field: str, limit: int = 100) -> str:
    if type(value) is not str or not value.strip() or len(value) > limit:
        raise InvalidConfig(field)
    return value.strip()


def _id(value: Any, field: str) -> str:
    if type(value) is not str or not _ID.fullmatch(value):
        raise InvalidConfig(field, "invalid stable id")
    return value


def _entity(value: Any, field: str) -> str:
    if type(value) is not str or not _ENTITY.fullmatch(value):
        raise InvalidConfig(field, "invalid entity id")
    return value


def _optional_entity(value: Any, field: str) -> str | None:
    return None if value is None else _entity(value, field)


def _list(value: Any, field: str, limit: int) -> list[Any]:
    if type(value) is not list or len(value) > limit:
        raise InvalidConfig(field, "invalid collection")
    return value


def _ids(value: Any, field: str, limit: int = 128) -> list[str]:
    items = [_id(item, field) for item in _list(value, field, limit)]
    if len(set(items)) != len(items):
        raise InvalidConfig(field, "duplicate id")
    return items


def _entity_binding(value: Any, field: str, *, optional_primary: bool = False) -> dict[str, Any]:
    item = _object(value, {"primaryEntityId", "relatedControls"}, field)
    primary = _optional_entity(item["primaryEntityId"], field + ".primaryEntityId") if optional_primary else _entity(item["primaryEntityId"], field + ".primaryEntityId")
    related: list[dict[str, str]] = []
    for index, raw in enumerate(_list(item["relatedControls"], field + ".relatedControls", 16)):
        control = _object(raw, {"entityId", "type", "role"}, f"{field}.relatedControls[{index}]")
        entity_id = _entity(control["entityId"], field + ".relatedControls.entityId")
        domain = _text(control["type"], field + ".relatedControls.type", 20)
        if domain not in _DOMAIN or entity_id.split(".", 1)[0] != domain:
            raise InvalidConfig(field + ".relatedControls.type", "type does not match entity domain")
        role = _id(control["role"], field + ".relatedControls.role")
        related.append({"entityId": entity_id, "type": domain, "role": role})
    entities = [control["entityId"] for control in related]
    if len(set(entities)) != len(entities) or primary in entities:
        raise InvalidConfig(field, "duplicate entity binding")
    return {"primaryEntityId": primary, "relatedControls": related}


def _unique_items(items: list[dict[str, Any]], field: str) -> None:
    ids = [item["id"] for item in items]
    if len(ids) != len(set(ids)):
        raise InvalidConfig(field, "duplicate id")


def _parse_programs(data: Mapping[str, Any], zone_ids: set[str]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Normalize one house week; local wall times have no active-time semantics here."""
    profiles: list[dict[str, Any]] = []
    for index, raw in enumerate(_list(data["profiles"], "profiles", 32)):
        field = f"profiles[{index}]"
        item = _object(raw, {"id", "name", "zoneTargets"}, field)
        targets = item["zoneTargets"]
        if type(targets) is not dict or len(targets) > 64:
            raise InvalidConfig(field + ".zoneTargets")
        parsed_targets: dict[str, float] = {}
        for zone_id, target in targets.items():
            if _id(zone_id, field + ".zoneTargets") not in zone_ids:
                raise InvalidConfig(field + ".zoneTargets", "unknown zone")
            if type(target) not in (int, float) or not 5 <= target <= 40 or not math.isfinite(target):
                raise InvalidConfig(field + ".zoneTargets", "room target must be 5–40 °C")
            parsed_targets[zone_id] = float(target)
        profiles.append({"id": _id(item["id"], field + ".id"), "name": _text(item["name"], field + ".name"),
                         "zoneTargets": dict(sorted(parsed_targets.items()))})
    _unique_items(profiles, "profiles")
    profile_ids = {item["id"] for item in profiles}
    days: dict[str, dict[str, Any]] = {}
    for index, raw in enumerate(_list(data["schedules"], "schedules", 7)):
        field = f"schedules[{index}]"
        item = _object(raw, {"day", "events"}, field)
        day = item["day"]
        if day not in WEEKDAYS or day in days:
            raise InvalidConfig(field + ".day", "unknown or duplicate day")
        events: list[dict[str, str]] = []
        times: set[str] = set()
        for event_index, raw_event in enumerate(_list(item["events"], field + ".events", 64)):
            event_field = f"{field}.events[{event_index}]"
            event = _object(raw_event, {"time", "profileId"}, event_field)
            time = event["time"]
            if type(time) is not str or _LOCAL_TIME.fullmatch(time) is None:
                raise InvalidConfig(event_field + ".time", "expected HH:MM local wall time")
            if time in times:
                raise DuplicateScheduleTime(event_field + ".time", "duplicate time on one day")
            times.add(time)
            profile_id = _id(event["profileId"], event_field + ".profileId")
            if profile_id not in profile_ids:
                raise ProfileInUse(event_field + ".profileId", "profile is missing or still in use")
            events.append({"time": time, "profileId": profile_id})
        if events:
            days[day] = {"day": day, "events": sorted(events, key=lambda entry: entry["time"])}
    return profiles, [days[day] for day in WEEKDAYS if day in days]


def parse_config(value: Any) -> dict[str, Any]:
    """Validate the whole client payload, including references, before any write."""
    try:
        if len(json.dumps(value, ensure_ascii=False).encode("utf-8")) > MAX_CONFIG_BYTES:
            raise InvalidConfig("config", "too large")
    except (TypeError, ValueError, OverflowError) as err:
        raise InvalidConfig("config", "not JSON") from err
    data = _extended(value, {"version", "zones", "endpoints", "circuits", "generators", "profiles", "schedules", "strategy"}, {"operatingMode", "controlMode", "auxiliaries", "equipmentGroups"}, "config")
    if type(data["version"]) is not int or data["version"] != VERSION:
        raise InvalidConfig("version")
    if data["strategy"] is not None:
        raise InvalidConfig("strategy", "source strategy is reserved for later phases")
    if "operatingMode" in data and data["operatingMode"] not in ("heating", "cooling", "off"):
        raise InvalidConfig("operatingMode")
    if "controlMode" in data and data["controlMode"] not in ("manual", "auto"):
        raise InvalidConfig("controlMode")
    zones: list[dict[str, Any]] = []
    for index, raw in enumerate(_list(data["zones"], "zones", 64)):
        field = f"zones[{index}]"
        zone = _extended(raw, {"id", "name", "areaId", "reference", "endpointIds"}, {"humidityReference", "mode"}, field)
        reference = _reference(zone["reference"], field + ".reference")
        area = zone["areaId"]
        if area is not None:
            _text(area, field + ".areaId", 128)
        parsed = {"id": _id(zone["id"], field + ".id"), "name": _text(zone["name"], field + ".name"), "areaId": area, "reference": reference, "endpointIds": _ids(zone["endpointIds"], field + ".endpointIds")}
        if "humidityReference" in zone:
            parsed["humidityReference"] = _reference(zone["humidityReference"], field + ".humidityReference")
        if "mode" in zone:
            if zone["mode"] not in ("follow_house", "off"):
                raise InvalidConfig(field + ".mode")
            parsed["mode"] = zone["mode"]
        zones.append(parsed)
    _unique_items(zones, "zones")
    endpoints: list[dict[str, Any]] = []
    for index, raw in enumerate(_list(data["endpoints"], "endpoints", 128)):
        field = f"endpoints[{index}]"
        item = _extended(raw, {"id", "name", "kind", "zoneId", "circuitId", "roles", "entity", "setpointKind"}, {"capabilities", "controlTopology"}, field)
        kind = item["kind"]
        roles = _list(item["roles"], field + ".roles", 6)
        if kind not in ("air_conditioner", "thermostatic_radiator_valve", "manifold_actuator", "fan_coil", "ducted_unit", "other") or not roles or any(role not in _ROLES for role in roles) or len(roles) != len(set(roles)):
            raise InvalidConfig(field, "invalid endpoint kind or roles")
        if kind == "thermostatic_radiator_valve" and ("radiator_trv" not in roles or "room_cooler" in roles):
            raise InvalidConfig(field, "a TRV needs its radiator role")
        if kind == "air_conditioner" and "radiator_trv" in roles:
            raise InvalidConfig(field, "an AC cannot be a TRV")
        if item["setpointKind"] not in ("room_temperature", "none"):
            raise InvalidConfig(field + ".setpointKind")
        circuit_id = item["circuitId"]
        parsed = {"id": _id(item["id"], field + ".id"), "name": _text(item["name"], field + ".name"), "kind": kind, "zoneId": _id(item["zoneId"], field + ".zoneId"), "circuitId": None if circuit_id is None else _id(circuit_id, field + ".circuitId"), "roles": list(roles), "entity": _entity_binding(item["entity"], field + ".entity"), "setpointKind": item["setpointKind"]}
        if "controlTopology" in item:
            if (item["controlTopology"] != "direct_supervisory" or kind not in ("air_conditioner", "other")
                    or item["setpointKind"] != "room_temperature" or circuit_id is not None
                    or not parsed["entity"]["primaryEntityId"].startswith("climate.")
                    or parsed["entity"]["relatedControls"]):
                raise InvalidConfig(field + ".controlTopology", "direct supervisory control requires one standalone climate entity")
            parsed["controlTopology"] = "direct_supervisory"
        if "capabilities" in item:
            parsed["capabilities"] = _capabilities(item["capabilities"], field + ".capabilities", set(_CAPABILITIES))
            if ("room_heater" in roles or "radiator_trv" in roles) and not parsed["capabilities"]["supportsHeating"]:
                raise InvalidConfig(field, "heating role requires heating capability")
            if "room_cooler" in roles and not parsed["capabilities"]["supportsCooling"]:
                raise InvalidConfig(field, "cooling role requires cooling capability")
        endpoints.append(parsed)
    _unique_items(endpoints, "endpoints")
    circuits: list[dict[str, Any]] = []
    for index, raw in enumerate(_list(data["circuits"], "circuits", 16)):
        field = f"circuits[{index}]"
        item = _extended(raw, {"id", "name", "kind", "zoneIds", "endpointIds", "controller", "generatorIds"}, {"capabilities", "supplySetpoint", "components", "coolingConstraint", "generatorPreferences"}, field)
        if item["kind"] not in ("radiators", "radiant_floor", "radiant_ceiling", "fan_coil", "hydronic_generic"):
            raise InvalidConfig(field + ".kind", "unsupported circuit kind")
        parsed = {"id": _id(item["id"], field + ".id"), "name": _text(item["name"], field + ".name"), "kind": item["kind"], "zoneIds": _ids(item["zoneIds"], field + ".zoneIds", 64), "endpointIds": _ids(item["endpointIds"], field + ".endpointIds"), "controller": None if item["controller"] is None else _entity_binding(item["controller"], field + ".controller"), "generatorIds": _ids(item["generatorIds"], field + ".generatorIds", 32)}
        if "capabilities" in item:
            parsed["capabilities"] = _capabilities(item["capabilities"], field + ".capabilities", {"supportsHeating", "supportsCooling"})
        if "supplySetpoint" in item:
            supply = _object(item["supplySetpoint"], {"setpointKind", "entity"}, field + ".supplySetpoint")
            if supply["setpointKind"] != "circuit_supply_temperature":
                raise InvalidConfig(field + ".supplySetpoint.setpointKind")
            parsed["supplySetpoint"] = {"setpointKind": supply["setpointKind"], "entity": _entity_binding(supply["entity"], field + ".supplySetpoint.entity")}
        if "components" in item:
            parsed["components"] = _entity_binding(item["components"], field + ".components", optional_primary=True)
        if "coolingConstraint" in item:
            constraint = _object(item["coolingConstraint"], {"requiresHumidityControl", "condensationProtection", "auxiliaryIds"}, field + ".coolingConstraint")
            if constraint["condensationProtection"] not in ("unspecified", "required"):
                raise InvalidConfig(field + ".coolingConstraint.condensationProtection")
            parsed["coolingConstraint"] = {"requiresHumidityControl": _bool(constraint["requiresHumidityControl"], field + ".coolingConstraint.requiresHumidityControl"), "condensationProtection": constraint["condensationProtection"], "auxiliaryIds": _ids(constraint["auxiliaryIds"], field + ".coolingConstraint.auxiliaryIds")}
            if (parsed["coolingConstraint"]["requiresHumidityControl"] or parsed["coolingConstraint"]["condensationProtection"] == "required") and not parsed.get("capabilities", {}).get("supportsCooling", False):
                raise InvalidConfig(field, "cooling constraint requires cooling capability")
        if "generatorPreferences" in item:
            preferences = []
            for raw_preference in _list(item["generatorPreferences"], field + ".generatorPreferences", 32):
                preference = _object(raw_preference, {"generatorId", "role"}, field + ".generatorPreferences")
                if preference["role"] not in ("preferred", "fallback", "required"):
                    raise InvalidConfig(field + ".generatorPreferences.role")
                preferences.append({"generatorId": _id(preference["generatorId"], field + ".generatorPreferences.generatorId"), "role": preference["role"]})
            if len({entry["generatorId"] for entry in preferences}) != len(preferences) or any(entry["generatorId"] not in parsed["generatorIds"] for entry in preferences):
                raise InvalidConfig(field + ".generatorPreferences", "unknown or duplicate generator")
            parsed["generatorPreferences"] = preferences
        circuits.append(parsed)
    _unique_items(circuits, "circuits")
    generators: list[dict[str, Any]] = []
    for index, raw in enumerate(_list(data["generators"], "generators", 32)):
        field = f"generators[{index}]"
        item = _extended(raw, {"id", "name", "kind", "circuitIds", "services", "entity", "setpointKind"}, {"capabilities"}, field)
        kind = item["kind"]
        services = _list(item["services"], field + ".services", 3)
        if kind not in ("boiler", "thermostove", "heat_pump", "other") or not services or any(service not in _SERVICES for service in services) or len(services) != len(set(services)):
            raise InvalidConfig(field, "invalid generator kind or services")
        setpoint = item["setpointKind"]
        if setpoint not in ("none", "generator_water_temperature"):
            raise InvalidConfig(field + ".setpointKind")
        entity = _entity_binding(item["entity"], field + ".entity", optional_primary=True)
        if kind == "thermostove" and (setpoint != "generator_water_temperature" or entity["primaryEntityId"] is None):
            raise InvalidConfig(field, "a thermostove needs a water setpoint climate entity")
        if setpoint != "none" and entity["primaryEntityId"] is None:
            raise InvalidConfig(field, "a water setpoint needs a primary entity")
        parsed = {"id": _id(item["id"], field + ".id"), "name": _text(item["name"], field + ".name"), "kind": kind, "circuitIds": _ids(item["circuitIds"], field + ".circuitIds", 16), "services": list(services), "entity": entity, "setpointKind": setpoint}
        if "capabilities" in item:
            parsed["capabilities"] = _capabilities(item["capabilities"], field + ".capabilities", {"supportsSpaceHeating", "supportsCooling", "supportsDhw"})
            if set(services) != {service for service, enabled in (("space_heating", parsed["capabilities"]["supportsSpaceHeating"]), ("space_cooling", parsed["capabilities"]["supportsCooling"]), ("domestic_hot_water", parsed["capabilities"]["supportsDhw"])) if enabled}:
                raise InvalidConfig(field, "services and capabilities disagree")
        generators.append(parsed)
    _unique_items(generators, "generators")

    auxiliaries: list[dict[str, Any]] = []
    for index, raw in enumerate(_list(data.get("auxiliaries", []), "auxiliaries", 64)):
        field = f"auxiliaries[{index}]"
        item = _object(raw, {"id", "name", "kind", "zoneIds", "circuitIds", "entity"}, field)
        if item["kind"] not in ("dehumidifier", "ventilation"):
            raise InvalidConfig(field + ".kind")
        zone_ids = _ids(item["zoneIds"], field + ".zoneIds", 64)
        circuit_ids = _ids(item["circuitIds"], field + ".circuitIds", 16)
        if not zone_ids and not circuit_ids:
            raise InvalidConfig(field, "auxiliary needs a scope")
        auxiliaries.append({"id": _id(item["id"], field + ".id"), "name": _text(item["name"], field + ".name"), "kind": item["kind"], "zoneIds": zone_ids, "circuitIds": circuit_ids, "entity": _entity_binding(item["entity"], field + ".entity")})
    _unique_items(auxiliaries, "auxiliaries")
    groups: list[dict[str, Any]] = []
    for index, raw in enumerate(_list(data.get("equipmentGroups", []), "equipmentGroups", 32)):
        field = f"equipmentGroups[{index}]"
        item = _object(raw, {"id", "name", "memberEndpointIds", "generatorIds", "sharedOperatingMode"}, field)
        members = _ids(item["memberEndpointIds"], field + ".memberEndpointIds", 128)
        if len(members) < 2:
            raise InvalidConfig(field, "equipment group needs at least two terminals")
        groups.append({"id": _id(item["id"], field + ".id"), "name": _text(item["name"], field + ".name"), "memberEndpointIds": members, "generatorIds": _ids(item["generatorIds"], field + ".generatorIds", 32), "sharedOperatingMode": _bool(item["sharedOperatingMode"], field + ".sharedOperatingMode")})
    _unique_items(groups, "equipmentGroups")

    zone_by_id = {item["id"]: item for item in zones}
    profiles, schedules = _parse_programs(data, set(zone_by_id))
    endpoint_by_id = {item["id"]: item for item in endpoints}
    circuit_by_id = {item["id"]: item for item in circuits}
    generator_by_id = {item["id"]: item for item in generators}
    for endpoint in endpoints:
        zone = zone_by_id.get(endpoint["zoneId"])
        if zone is None or endpoint["id"] not in zone["endpointIds"]:
            raise InvalidConfig("endpoints", "zone link is not reciprocal")
        circuit_id = endpoint["circuitId"]
        if circuit_id is not None:
            circuit = circuit_by_id.get(circuit_id)
            if circuit is None or endpoint["id"] not in circuit["endpointIds"] or endpoint["zoneId"] not in circuit["zoneIds"]:
                raise InvalidConfig("endpoints", "invalid circuit link")
    for zone in zones:
        if any(endpoint_by_id.get(endpoint_id, {}).get("zoneId") != zone["id"] for endpoint_id in zone["endpointIds"]):
            raise InvalidConfig("zones", "endpoint link is not reciprocal")
    for circuit in circuits:
        if any(zone_id not in zone_by_id for zone_id in circuit["zoneIds"]):
            raise InvalidConfig("circuits", "unknown zone")
        if any(endpoint_by_id.get(endpoint_id, {}).get("circuitId") != circuit["id"] for endpoint_id in circuit["endpointIds"]):
            raise InvalidConfig("circuits", "endpoint link is not reciprocal")
        if any(generator_by_id.get(generator_id) is None or circuit["id"] not in generator_by_id[generator_id]["circuitIds"] for generator_id in circuit["generatorIds"]):
            raise InvalidConfig("circuits", "generator link is not reciprocal")
        capabilities = circuit.get("capabilities")
        if capabilities and circuit["generatorIds"]:
            for circuit_capability, generator_capability, service in (("supportsHeating", "supportsSpaceHeating", "space_heating"), ("supportsCooling", "supportsCooling", "space_cooling")):
                if capabilities[circuit_capability] and not any(generator_by_id[generator_id].get("capabilities", {}).get(generator_capability, service in generator_by_id[generator_id]["services"]) for generator_id in circuit["generatorIds"]):
                    raise InvalidConfig("circuits", f"no generator supports {service}")
    for generator in generators:
        if any(circuit_by_id.get(circuit_id) is None or generator["id"] not in circuit_by_id[circuit_id]["generatorIds"] for circuit_id in generator["circuitIds"]):
            raise InvalidConfig("generators", "circuit link is not reciprocal")
    auxiliary_by_id = {item["id"]: item for item in auxiliaries}
    for auxiliary in auxiliaries:
        if any(zone_id not in zone_by_id for zone_id in auxiliary["zoneIds"]) or any(circuit_id not in circuit_by_id for circuit_id in auxiliary["circuitIds"]):
            raise InvalidConfig("auxiliaries", "unknown zone or circuit")
    for circuit in circuits:
        constraint = circuit.get("coolingConstraint")
        if constraint:
            for auxiliary_id in constraint["auxiliaryIds"]:
                auxiliary = auxiliary_by_id.get(auxiliary_id)
                if auxiliary is None or (circuit["id"] not in auxiliary["circuitIds"] and not set(circuit["zoneIds"]).intersection(auxiliary["zoneIds"])):
                    raise InvalidConfig("circuits", "cooling auxiliary is missing or out of scope")
    for group in groups:
        if any(member_id not in endpoint_by_id for member_id in group["memberEndpointIds"]) or any(generator_id not in generator_by_id for generator_id in group["generatorIds"]):
            raise InvalidConfig("equipmentGroups", "unknown terminal or generator")
    bindings = [item["entity"] for item in endpoints + generators + auxiliaries]
    bindings += [item["controller"] for item in circuits if item["controller"]]
    bindings += [item["supplySetpoint"]["entity"] for item in circuits if "supplySetpoint" in item]
    bindings += [item["components"] for item in circuits if "components" in item]
    bound_entities = [entity_id for binding in bindings for entity_id in ([binding["primaryEntityId"]] if binding["primaryEntityId"] else []) + [control["entityId"] for control in binding["relatedControls"]]]
    if len(bound_entities) != len(set(bound_entities)):
        raise InvalidConfig("config", "an entity has conflicting device roles")
    result = {"version": VERSION, "zones": zones, "endpoints": endpoints, "circuits": circuits, "generators": generators, "profiles": profiles, "schedules": schedules, "strategy": None}
    for key in ("operatingMode", "controlMode"):
        if key in data:
            result[key] = data[key]
    if "auxiliaries" in data:
        result["auxiliaries"] = auxiliaries
    if "equipmentGroups" in data:
        result["equipmentGroups"] = groups
    return result


def parse_stored(value: Any, migrations: Mapping[int, Migration] = MIGRATIONS) -> tuple[int, dict[str, Any]]:
    data = _object(value, {"schema", "version", "revision", "config"}, "store")
    if data["schema"] != SCHEMA or type(data["version"]) is not int or data["version"] < 0:
        raise InvalidConfig("store")
    if data["version"] > VERSION:
        raise UnsupportedSchema("newer climate store")
    while data["version"] < VERSION:
        migrate = migrations.get(data["version"])
        if migrate is None:
            raise MigrationFailed("missing climate migration")
        try:
            data = dict(migrate(data))
        except Exception as err:
            raise MigrationFailed("climate migration failed") from err
        if data.get("version") != VERSION:
            raise MigrationFailed("climate migration produced an invalid version")
    if type(data["revision"]) is not int or data["revision"] < 1:
        raise InvalidConfig("store.revision")
    return data["revision"], parse_config(data["config"])


def storage_document(revision: int, config: dict[str, Any]) -> dict[str, Any]:
    return {"schema": SCHEMA, "version": VERSION, "revision": revision, "config": deepcopy(config)}


def empty_config() -> dict[str, Any]:
    return {"version": VERSION, "zones": [], "endpoints": [], "circuits": [], "generators": [], "profiles": [], "schedules": [], "strategy": None}


def resolve_temperature_source(zone: Mapping[str, Any], states: Mapping[str, Any]) -> str | None:
    """Choose the first numerically readable source; no climate decision or unit conversion."""
    return _resolve_source(zone["reference"], states, "current_temperature")


def resolve_humidity_source(zone: Mapping[str, Any], states: Mapping[str, Any]) -> str | None:
    """Choose the first readable humidity source, if this zone has one."""
    reference = zone.get("humidityReference")
    return None if reference is None else _resolve_source(reference, states, "current_humidity")


def _resolve_source(reference: Mapping[str, Any], states: Mapping[str, Any], climate_attribute: str) -> str | None:
    for entity_id in [reference["primaryEntityId"], *reference["fallbacks"]]:
        state = states.get(entity_id)
        if state is None:
            continue
        attrs = getattr(state, "attributes", {})
        value = attrs.get(climate_attribute) if entity_id.startswith("climate.") else getattr(state, "state", None)
        try:
            if value is not None and value not in ("unknown", "unavailable") and math.isfinite(float(value)):
                return entity_id
        except (TypeError, ValueError, OverflowError):
            pass
    return None


def zone_mode_allowed(house_mode: str, zone_mode: str) -> bool:
    """V1 intent invariant, without applying a mode to Home Assistant entities."""
    return house_mode in ("heating", "cooling", "off") and zone_mode in ("follow_house", "off")
