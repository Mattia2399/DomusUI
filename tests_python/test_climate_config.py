"""CLM.2 configuration contract and HA catalog decisions, without HA imports."""

from __future__ import annotations

from copy import deepcopy
from types import SimpleNamespace

import pytest
from climate_pure import load

models = load("models")
validation = load("validation")


def config():
    result = models.empty_config()
    result["zones"] = [{"id": "zone_living", "name": "Living", "areaId": "1234567890abcdef", "reference": {"primaryEntityId": "sensor.living_temp", "fallbacks": ["climate.living"]}, "endpointIds": ["endpoint_ac"]}]
    result["endpoints"] = [{"id": "endpoint_ac", "name": "AC", "kind": "air_conditioner", "zoneId": "zone_living", "circuitId": None, "roles": ["room_heater", "room_cooler"], "entity": {"primaryEntityId": "climate.living", "relatedControls": [{"entityId": "switch.ac_power", "type": "switch", "role": "power"}]}, "setpointKind": "room_temperature"}]
    result["circuits"] = [{"id": "circuit_main", "name": "Radiators", "kind": "radiators", "zoneIds": [], "endpointIds": [], "controller": {"primaryEntityId": "climate.main", "relatedControls": []}, "generatorIds": ["generator_boiler"]}]
    result["generators"] = [{"id": "generator_boiler", "name": "Boiler", "kind": "boiler", "circuitIds": ["circuit_main"], "services": ["space_heating"], "entity": {"primaryEntityId": "switch.boiler", "relatedControls": []}, "setpointKind": "none"}]
    return result


def states():
    return {
        "sensor.living_temp": SimpleNamespace(state="21.5", attributes={"device_class": "temperature", "unit_of_measurement": "°C"}),
        "climate.living": SimpleNamespace(state="heat", attributes={"current_temperature": 21.2, "hvac_modes": ["heat", "cool", "off"], "supported_features": 1}),
        "climate.main": SimpleNamespace(state="heat", attributes={"current_temperature": 20, "hvac_modes": ["heat", "off"], "supported_features": 1}),
        "switch.ac_power": SimpleNamespace(state="on", attributes={}),
        "switch.boiler": SimpleNamespace(state="on", attributes={}),
    }


def validate(candidate, catalog=None):
    catalog = states() if catalog is None else catalog
    return validation.validate_catalog(models.parse_config(candidate), area_exists=lambda area: area == "1234567890abcdef", get_state=catalog.get)


def test_closed_document_and_reciprocal_links():
    candidate = config()
    assert models.parse_config(candidate) == candidate
    for mutation in (lambda item: item.update(extra=True), lambda item: item["zones"][0].update(runtime=22), lambda item: item["zones"][0]["endpointIds"].clear()):
        invalid = deepcopy(candidate)
        mutation(invalid)
        with pytest.raises(models.InvalidConfig):
            models.parse_config(invalid)


def test_temperature_fallback_and_no_reading():
    candidate = config()
    catalog = states()
    assert models.resolve_temperature_source(candidate["zones"][0], catalog) == "sensor.living_temp"
    catalog["sensor.living_temp"].state = "unavailable"
    assert models.resolve_temperature_source(candidate["zones"][0], catalog) == "climate.living"
    catalog["climate.living"].attributes["current_temperature"] = None
    assert models.resolve_temperature_source(candidate["zones"][0], catalog) is None


def test_store_version_migration_and_future_version():
    raw = models.storage_document(1, config())
    assert models.parse_stored(raw) == (1, config())
    raw["version"] = 0
    with pytest.raises(models.MigrationFailed):
        models.parse_stored(raw)
    raw["version"] = 2
    with pytest.raises(models.UnsupportedSchema):
        models.parse_stored(raw)


def test_catalog_checks_references_and_capabilities():
    candidate = config()
    validate(candidate)
    invalid = deepcopy(candidate)
    invalid["zones"][0]["areaId"] = "missing"
    with pytest.raises(models.AreaMissing):
        validate(invalid)
    invalid = deepcopy(candidate)
    invalid["endpoints"][0]["roles"] = ["room_cooler"]
    catalog = states()
    catalog["climate.living"].attributes["hvac_modes"] = ["heat"]
    with pytest.raises(models.EntityIncompatible):
        validate(invalid, catalog)
    catalog = states()
    catalog.pop("switch.ac_power")
    with pytest.raises(models.EntityMissing):
        validate(candidate, catalog)
    catalog = states()
    catalog["climate.living"].attributes["supported_features"] = 0
    with pytest.raises(models.EntityIncompatible):
        validate(candidate, catalog)
    catalog = states()
    catalog["sensor.living_temp"].attributes = {"device_class": "humidity", "unit_of_measurement": "%"}
    with pytest.raises(models.EntityIncompatible):
        validate(candidate, catalog)


def test_duplicate_ids_and_related_control_types_are_rejected():
    candidate = config()
    candidate["zones"].append(deepcopy(candidate["zones"][0]))
    with pytest.raises(models.InvalidConfig):
        models.parse_config(candidate)
    candidate = config()
    candidate["endpoints"][0]["entity"]["relatedControls"][0]["type"] = "sensor"
    with pytest.raises(models.InvalidConfig):
        models.parse_config(candidate)


def test_room_and_water_setpoint_kinds_cannot_be_interchanged():
    candidate = config()
    candidate["endpoints"][0]["setpointKind"] = "generator_water_temperature"
    with pytest.raises(models.InvalidConfig):
        models.parse_config(candidate)
    candidate = config()
    candidate["generators"][0]["setpointKind"] = "room_temperature"
    with pytest.raises(models.InvalidConfig):
        models.parse_config(candidate)


def test_water_setpoint_requires_range_and_step():
    candidate = config()
    boiler = candidate["generators"][0]
    boiler["entity"]["primaryEntityId"] = "climate.boiler"
    boiler["setpointKind"] = "generator_water_temperature"
    catalog = states()
    catalog["climate.boiler"] = SimpleNamespace(state="heat", attributes={"hvac_modes": ["heat"], "supported_features": 1, "min_temp": 30, "max_temp": 70, "target_temp_step": 1})
    validate(candidate, catalog)
    catalog["climate.boiler"].attributes.pop("target_temp_step")
    with pytest.raises(models.EntityIncompatible):
        validate(candidate, catalog)
