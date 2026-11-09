"""Validate configured references against the live HA catalog at save time."""

from __future__ import annotations

import math
from collections.abc import Callable, Mapping
from typing import Any

from .models import AreaMissing, EntityIncompatible, EntityMissing, InvalidConfig

TARGET_TEMPERATURE_FEATURE = 1  # Home Assistant ClimateEntityFeature.TARGET_TEMPERATURE


def _number(value: Any) -> float | None:
    try:
        result = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return result if math.isfinite(result) else None


def _state(entity_id: str, field: str, get_state: Callable[[str], Any]) -> Any:
    state = get_state(entity_id)
    if state is None:
        raise EntityMissing(field, entity_id)
    return state


def _temperature(entity_id: str, field: str, get_state: Callable[[str], Any]) -> None:
    state = _state(entity_id, field, get_state)
    attributes = getattr(state, "attributes", {})
    domain = entity_id.split(".", 1)[0]
    if domain == "climate":
        if _number(attributes.get("current_temperature")) is None:
            raise EntityIncompatible(field, "climate has no current_temperature reading")
    elif domain == "sensor":
        if attributes.get("device_class") != "temperature" and attributes.get("unit_of_measurement") not in ("°C", "°F", "K"):
            raise EntityIncompatible(field, "sensor is not a temperature sensor")
    else:
        raise EntityIncompatible(field, "temperature needs a sensor or climate entity")


def _humidity(entity_id: str, field: str, get_state: Callable[[str], Any]) -> None:
    state = _state(entity_id, field, get_state)
    attributes = getattr(state, "attributes", {})
    domain = entity_id.split(".", 1)[0]
    if domain == "climate":
        if _number(attributes.get("current_humidity")) is None:
            raise EntityIncompatible(field, "climate has no current_humidity reading")
    elif domain == "sensor":
        if attributes.get("device_class") != "humidity" and attributes.get("unit_of_measurement") != "%":
            raise EntityIncompatible(field, "sensor is not a humidity sensor")
    else:
        raise EntityIncompatible(field, "humidity needs a sensor or climate entity")


def _climate(entity_id: str, field: str, get_state: Callable[[str], Any]) -> Mapping[str, Any]:
    if not entity_id.startswith("climate."):
        raise EntityIncompatible(field, "expected a climate entity")
    state = _state(entity_id, field, get_state)
    attributes = getattr(state, "attributes", {})
    if not isinstance(attributes, Mapping):
        raise EntityIncompatible(field, "climate attributes unavailable")
    modes = attributes.get("hvac_modes")
    features = attributes.get("supported_features")
    if not isinstance(modes, list) or not all(isinstance(mode, str) for mode in modes) or type(features) is not int or features < 0:
        raise EntityIncompatible(field, "climate capabilities unavailable")
    for name in ("fan_modes", "swing_modes", "preset_modes"):
        values = attributes.get(name)
        if values is not None and (not isinstance(values, list) or not all(isinstance(value, str) for value in values)):
            raise EntityIncompatible(field, f"invalid {name}")
    return attributes


def validate_catalog(
    config: Mapping[str, Any],
    *,
    area_exists: Callable[[str], bool],
    get_state: Callable[[str], Any],
) -> None:
    """Inspect only referenced areas/entities, never iterate the whole HA registry."""
    for zone in config["zones"]:
        if zone["areaId"] is not None and not area_exists(zone["areaId"]):
            raise AreaMissing(f"zones.{zone['id']}.areaId", zone["areaId"])
        reference = zone["reference"]
        for index, entity_id in enumerate([reference["primaryEntityId"], *reference["fallbacks"]]):
            _temperature(entity_id, f"zones.{zone['id']}.reference[{index}]", get_state)
        humidity = zone.get("humidityReference")
        if humidity is not None:
            for index, entity_id in enumerate([humidity["primaryEntityId"], *humidity["fallbacks"]]):
                _humidity(entity_id, f"zones.{zone['id']}.humidityReference[{index}]", get_state)

    used_related: set[str] = set()

    def binding(value: Mapping[str, Any], field: str) -> str | None:
        primary = value["primaryEntityId"]
        if primary is not None:
            _state(primary, field + ".primaryEntityId", get_state)
        for control in value["relatedControls"]:
            entity_id = control["entityId"]
            if entity_id in used_related:
                raise InvalidConfig(field, "related control belongs to more than one device")
            used_related.add(entity_id)
            _state(entity_id, field + ".relatedControls", get_state)
        return primary

    for endpoint in config["endpoints"]:
        field = f"endpoints.{endpoint['id']}"
        primary = binding(endpoint["entity"], field)
        assert primary is not None
        domain = primary.split(".", 1)[0]
        if domain == "climate":
            attributes = _climate(primary, field, get_state)
            if endpoint["setpointKind"] == "room_temperature" and not attributes["supported_features"] & TARGET_TEMPERATURE_FEATURE:
                raise EntityIncompatible(field, "entity has no room temperature setpoint")
            modes = set(attributes["hvac_modes"])
            roles = set(endpoint["roles"])
            capabilities = endpoint.get("capabilities", {})
            if ("room_heater" in roles or "radiator_trv" in roles or capabilities.get("supportsHeating")) and not modes.intersection({"heat", "heat_cool"}):
                raise EntityIncompatible(field, "entity cannot heat")
            if ("room_cooler" in roles or capabilities.get("supportsCooling")) and not modes.intersection({"cool", "heat_cool"}):
                raise EntityIncompatible(field, "entity cannot cool")
        elif domain not in ("switch", "valve", "input_boolean") or endpoint["setpointKind"] != "none":
            raise EntityIncompatible(field, "actuator needs a climate setpoint or switch/valve binding")

    for circuit in config["circuits"]:
        if circuit["controller"] is not None:
            primary = binding(circuit["controller"], f"circuits.{circuit['id']}.controller")
            assert primary is not None
            attributes = _climate(primary, f"circuits.{circuit['id']}.controller", get_state)
            modes = set(attributes["hvac_modes"])
            capabilities = circuit.get("capabilities", {"supportsHeating": True, "supportsCooling": False})
            if capabilities["supportsHeating"] and not modes.intersection({"heat", "heat_cool"}):
                raise EntityIncompatible(f"circuits.{circuit['id']}.controller", "controller cannot heat")
            if capabilities["supportsCooling"] and not modes.intersection({"cool", "heat_cool"}):
                raise EntityIncompatible(f"circuits.{circuit['id']}.controller", "controller cannot cool")
        if "components" in circuit:
            binding(circuit["components"], f"circuits.{circuit['id']}.components")
        if "supplySetpoint" in circuit:
            primary = binding(circuit["supplySetpoint"]["entity"], f"circuits.{circuit['id']}.supplySetpoint")
            assert primary is not None
            if not primary.startswith(("climate.", "number.", "input_number.")):
                raise EntityIncompatible(f"circuits.{circuit['id']}.supplySetpoint", "invalid supply setpoint domain")

    for generator in config["generators"]:
        field = f"generators.{generator['id']}"
        primary = binding(generator["entity"], field)
        if generator["setpointKind"] == "generator_water_temperature":
            assert primary is not None
            attributes = _climate(primary, field, get_state)
            if not attributes["supported_features"] & TARGET_TEMPERATURE_FEATURE:
                raise EntityIncompatible(field, "entity has no water temperature setpoint")
            minimum = _number(attributes.get("min_temp"))
            maximum = _number(attributes.get("max_temp"))
            step = _number(attributes.get("target_temp_step"))
            if minimum is None or maximum is None or step is None or minimum >= maximum or step <= 0:
                raise EntityIncompatible(field, "water setpoint range or step unavailable")
        elif primary is not None and not primary.startswith(("climate.", "switch.", "input_boolean.")):
            raise EntityIncompatible(field, "generator primary entity has an incompatible domain")

    for auxiliary in config.get("auxiliaries", []):
        field = f"auxiliaries.{auxiliary['id']}"
        primary = binding(auxiliary["entity"], field)
        if primary is None or not primary.startswith(("climate.", "switch.", "input_boolean.", "valve.")):
            raise EntityIncompatible(field, "auxiliary primary entity has an incompatible domain")
