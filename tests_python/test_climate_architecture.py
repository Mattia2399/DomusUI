"""CLM.2A installation topology scenarios; pure Python, no HA runtime."""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from climate_pure import load

models = load("models")
validation = load("validation")


def binding(entity_id, controls=None):
    return {"primaryEntityId": entity_id, "relatedControls": controls or []}


def zone(name, terminal_ids):
    return {"id": name, "name": name, "areaId": None, "reference": {"primaryEntityId": f"sensor.{name}_temp", "fallbacks": []}, "endpointIds": terminal_ids}


def terminal(name, zone_id, circuit_id=None, *, kind="air_conditioner", primary=None, heat=True, cool=True, fan=False, setpoint="room_temperature", controls=None):
    roles = [role for role, enabled in (("room_heater", heat), ("room_cooler", cool)) if enabled]
    if kind == "thermostatic_radiator_valve":
        roles.append("radiator_trv")
    if not roles:
        roles = ["zone_actuator"]
    return {"id": name, "name": name, "kind": kind, "zoneId": zone_id, "circuitId": circuit_id, "roles": roles,
            "entity": binding(primary or f"climate.{name}", controls), "setpointKind": setpoint,
            "capabilities": {"supportsHeating": heat, "supportsCooling": cool, "supportsFan": fan, "supportsDehumidification": False}}


def circuit(name, zones, terminals, generators, *, kind="radiators", heat=True, cool=False):
    return {"id": name, "name": name, "kind": kind, "zoneIds": zones, "endpointIds": terminals, "controller": None,
            "generatorIds": generators, "capabilities": {"supportsHeating": heat, "supportsCooling": cool}}


def generator(name, circuits, *, kind="boiler", heat=True, cool=False, dhw=False):
    services = [service for service, enabled in (("space_heating", heat), ("space_cooling", cool), ("domestic_hot_water", dhw)) if enabled]
    return {"id": name, "name": name, "kind": kind, "circuitIds": circuits, "services": services,
            "capabilities": {"supportsSpaceHeating": heat, "supportsCooling": cool, "supportsDhw": dhw},
            "entity": binding(f"switch.{name}"), "setpointKind": "none"}


def catalog(config):
    states = {}
    for item in config["zones"]:
        states[item["reference"]["primaryEntityId"]] = SimpleNamespace(state="21", attributes={"device_class": "temperature"})
        humidity = item.get("humidityReference")
        if humidity:
            for entity_id in [humidity["primaryEntityId"], *humidity["fallbacks"]]:
                states[entity_id] = SimpleNamespace(state="50", attributes={"device_class": "humidity"})
    for item in config["endpoints"] + config["generators"] + config.get("auxiliaries", []):
        for entity_id in [item["entity"]["primaryEntityId"], *[control["entityId"] for control in item["entity"]["relatedControls"]]]:
            if entity_id.startswith("climate."):
                states[entity_id] = SimpleNamespace(state="off", attributes={"hvac_modes": ["heat", "cool", "off"], "supported_features": 1})
            else:
                states[entity_id] = SimpleNamespace(state="off", attributes={})
    for item in config["circuits"]:
        for key in ("controller", "components"):
            if item.get(key):
                for entity_id in [item[key]["primaryEntityId"], *[control["entityId"] for control in item[key]["relatedControls"]]]:
                    if entity_id:
                        states[entity_id] = SimpleNamespace(state="off", attributes={"hvac_modes": ["heat", "cool", "off"], "supported_features": 1} if entity_id.startswith("climate.") else {})
        if item.get("supplySetpoint"):
            entity_id = item["supplySetpoint"]["entity"]["primaryEntityId"]
            states[entity_id] = SimpleNamespace(state="32", attributes={})
    return states


def scenario_a():
    config = models.empty_config()
    config["zones"] = [zone("living", ["ac", "trv"])]
    config["endpoints"] = [terminal("ac", "living"), terminal("trv", "living", "radiators", kind="thermostatic_radiator_valve", heat=True, cool=False)]
    config["circuits"] = [circuit("radiators", ["living"], ["trv"], ["boiler", "stove"])]
    config["circuits"][0]["controller"] = binding("climate.corridor")
    config["circuits"][0]["generatorPreferences"] = [{"generatorId": "stove", "role": "preferred"}, {"generatorId": "boiler", "role": "fallback"}]
    config["generators"] = [generator("boiler", ["radiators"]), generator("stove", ["radiators"], kind="thermostove", dhw=True)]
    config["generators"][1]["entity"] = binding("climate.stove")
    config["generators"][1]["setpointKind"] = "generator_water_temperature"
    return config


def scenario_b():
    config = models.empty_config()
    config["zones"] = [zone("bedroom", ["head"])]
    config["endpoints"] = [terminal("head", "bedroom", "floor", kind="manifold_actuator", primary="switch.head", heat=True, cool=False, setpoint="none")]
    config["circuits"] = [circuit("floor", ["bedroom"], ["head"], ["pump"], kind="radiant_floor")]
    config["generators"] = [generator("pump", ["floor"], kind="heat_pump")]
    return config


def scenario_c():
    config = scenario_b()
    config["operatingMode"] = "cooling"
    config["controlMode"] = "auto"
    config["zones"][0]["humidityReference"] = {"primaryEntityId": "sensor.bedroom_humidity", "fallbacks": ["sensor.backup_humidity"]}
    config["zones"].append(zone("living", ["living_head"]))
    config["zones"][1]["humidityReference"] = {"primaryEntityId": "sensor.living_humidity", "fallbacks": []}
    config["endpoints"].append(terminal("living_head", "living", "floor", kind="manifold_actuator", primary="valve.living_head", setpoint="none"))
    config["endpoints"][0]["roles"].append("room_cooler")
    config["endpoints"][0]["capabilities"]["supportsCooling"] = True
    config["circuits"][0]["zoneIds"].append("living")
    config["circuits"][0]["endpointIds"].append("living_head")
    config["circuits"][0]["capabilities"]["supportsCooling"] = True
    config["circuits"][0]["coolingConstraint"] = {"requiresHumidityControl": True, "condensationProtection": "required", "auxiliaryIds": ["dehum"]}
    config["circuits"][0]["supplySetpoint"] = {"setpointKind": "circuit_supply_temperature", "entity": binding("number.floor_supply")}
    config["circuits"][0]["components"] = binding(None, [{"entityId": "switch.circulator", "type": "switch", "role": "circulator"}, {"entityId": "sensor.floor_return", "type": "sensor", "role": "return_temperature"}])
    config["generators"][0]["services"].append("space_cooling")
    config["generators"][0]["capabilities"]["supportsCooling"] = True
    config["auxiliaries"] = [{"id": "dehum", "name": "Shared dehumidifier", "kind": "dehumidifier", "zoneIds": ["bedroom", "living"], "circuitIds": ["floor"], "entity": binding("switch.dehum")}]
    return config


def scenario_d():
    config = models.empty_config()
    config["zones"] = [zone("bedroom", ["coil"])]
    config["endpoints"] = [terminal("coil", "bedroom", "water", kind="fan_coil", fan=True,
                                   controls=[{"entityId": "select.fan_speed", "type": "select", "role": "fan_speed"}, {"entityId": "switch.coil_valve", "type": "switch", "role": "valve"}])]
    config["circuits"] = [circuit("water", ["bedroom"], ["coil"], ["pump"], kind="fan_coil", cool=True)]
    config["generators"] = [generator("pump", ["water"], kind="heat_pump", cool=True, dhw=True)]
    return config


def scenario_e():
    config = models.empty_config()
    for name in ("bedroom", "living", "studio"):
        config["zones"].append(zone(name, [f"ac_{name}"]))
        config["endpoints"].append(terminal(f"ac_{name}", name))
    config["equipmentGroups"] = [{"id": "outdoor", "name": "Outdoor unit", "memberEndpointIds": [item["id"] for item in config["endpoints"]], "generatorIds": [], "sharedOperatingMode": True}]
    return config


def scenario_f():
    config = scenario_c()
    config["zones"].append(zone("bath", ["towel", "ac_bath"]))
    config["endpoints"].extend([terminal("towel", "bath", "radiators", kind="thermostatic_radiator_valve", heat=True, cool=False), terminal("ac_bath", "bath")])
    config["circuits"].append(circuit("radiators", ["bath"], ["towel"], ["pump"]))
    config["generators"][0]["circuitIds"].append("radiators")
    config["zones"].append(zone("studio", ["coil"]))
    config["endpoints"].append(terminal("coil", "studio", "water", kind="fan_coil", fan=True))
    config["circuits"].append(circuit("water", ["studio"], ["coil"], ["pump"], kind="hydronic_generic", cool=True))
    config["generators"][0]["circuitIds"].append("water")
    return config


@pytest.mark.parametrize("factory", [scenario_a, scenario_b, scenario_c, scenario_d, scenario_e, scenario_f])
def test_scenario_round_trip_and_catalog(factory):
    config = factory()
    parsed = models.parse_config(config)
    assert parsed == config
    revision, restored = models.parse_stored(models.storage_document(4, parsed))
    assert revision == 4 and restored == parsed
    states = catalog(config)
    if factory is scenario_a:
        states["climate.stove"].attributes.update(min_temp=30, max_temp=80, target_temp_step=1)
    validation.validate_catalog(parsed, area_exists=lambda _: False, get_state=states.get)


def test_old_radiator_document_remains_valid():
    from test_climate_config import config

    old = config()
    assert models.parse_config(old) == old
    assert models.parse_stored(models.storage_document(1, old))[1] == old


@pytest.mark.parametrize("mutate", [
    lambda value: value["auxiliaries"][0]["zoneIds"].append("missing"),
    lambda value: value["circuits"][0]["coolingConstraint"]["auxiliaryIds"].append("missing"),
    lambda value: value["endpoints"][0].update(circuitId="missing"),
    lambda value: value["circuits"][0]["generatorPreferences"].append({"generatorId": "missing", "role": "required"}),
    lambda value: value["zones"][0]["humidityReference"]["fallbacks"].append("sensor.bedroom_humidity"),
    lambda value: value["equipmentGroups"][0]["memberEndpointIds"].append("missing"),
])
def test_invalid_cross_references_and_duplicate_sensors(mutate):
    config = scenario_c()
    config["circuits"][0]["generatorPreferences"] = []
    config["equipmentGroups"] = scenario_e()["equipmentGroups"]
    # Keep the group structurally valid before mutation.
    config["equipmentGroups"][0]["memberEndpointIds"] = ["head", "living_head"]
    mutate(config)
    with pytest.raises(models.InvalidConfig):
        models.parse_config(config)


def test_capabilities_are_explicit_and_mode_intent_is_separate():
    config = scenario_c()
    assert models.zone_mode_allowed("cooling", "follow_house")
    assert not models.zone_mode_allowed("cooling", "heating")
    config["zones"][0]["mode"] = "heating"
    with pytest.raises(models.InvalidConfig):
        models.parse_config(config)
    config["zones"][0]["mode"] = "off"
    config["endpoints"][0]["capabilities"]["supportsCooling"] = False
    with pytest.raises(models.InvalidConfig):
        models.parse_config(config)


def test_one_entity_cannot_be_bound_to_two_logical_devices():
    config = scenario_d()
    config["endpoints"][0]["entity"]["relatedControls"].append({"entityId": "switch.pump", "type": "switch", "role": "power"})
    with pytest.raises(models.InvalidConfig):
        models.parse_config(config)


def test_humidity_catalog_is_checked_and_malformed_fields_rejected():
    config = scenario_c()
    states = catalog(config)
    assert models.resolve_humidity_source(config["zones"][0], states) == "sensor.bedroom_humidity"
    states["sensor.bedroom_humidity"].state = "unavailable"
    assert models.resolve_humidity_source(config["zones"][0], states) == "sensor.backup_humidity"
    states["sensor.bedroom_humidity"].state = "50"
    states["sensor.bedroom_humidity"].attributes = {"device_class": "temperature"}
    with pytest.raises(models.EntityIncompatible):
        validation.validate_catalog(models.parse_config(config), area_exists=lambda _: False, get_state=states.get)
    config = scenario_c()
    config["equipmentGroups"] = [{"id": "bad", "name": "Bad", "memberEndpointIds": ["head", "living_head"], "generatorIds": ["unknown"], "sharedOperatingMode": True}]
    with pytest.raises(models.InvalidConfig):
        models.parse_config(config)
    config = scenario_c()
    config["runtimeState"] = {"dewPoint": 12}
    with pytest.raises(models.InvalidConfig):
        models.parse_config(config)
