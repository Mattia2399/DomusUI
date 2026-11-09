"""CLM.3B: pure supervisory plans; zero HA imports and zero service calls."""

from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime, timedelta
from itertools import product
from types import SimpleNamespace

import pytest
from climate_pure import load
from test_climate_architecture import catalog, circuit, models, terminal, zone

intent = load("intent")
execution = load("execution_plan")
NOW = datetime(2026, 1, 5, 12, tzinfo=UTC)


def fixture(*, mode="cooling", target=24, room=27, endpoint_mode="cool", endpoint_target=26):
    config = models.empty_config()
    config["zones"] = [zone("camera", ["ac"])]
    config["endpoints"] = [terminal("ac", "camera")]
    states = catalog(config)
    states["sensor.camera_temp"] = SimpleNamespace(state=str(room), attributes={"unit_of_measurement": "°C"}, last_updated=NOW)
    states["climate.ac"] = SimpleNamespace(state=endpoint_mode, attributes={
        "hvac_modes": ["heat", "cool", "off"], "supported_features": 1, "temperature_unit": "°C",
        "temperature": endpoint_target, "current_temperature": room, "min_temp": 16, "max_temp": 30,
        "target_temp_step": 0.5,
    }, last_updated=NOW)
    desired = intent.default_intent(config)
    desired["house"] = {"operatingMode": mode, "controlMode": "manual"}
    desired["zones"]["camera"] = {"mode": "follow_house", "targetTemperature": target}
    return config, desired, states


def plan(config, desired, states, *, config_revision=4, state_revision=7, now=NOW, **preview_kwargs):
    preview = intent.preview(config, desired, states, **preview_kwargs)
    return execution.build_execution_preview(config, preview, states, config_revision=config_revision,
                                             state_revision=state_revision, evaluated_at=now)["plans"][0]


def test_single_split_cooling_is_symbolic_and_revision_bound():
    config, desired, states = fixture()
    result = plan(config, desired, states)
    assert result["status"] == "eligible"
    assert result["endpointId"] == "ac" and result["entityId"] == "climate.ac"
    assert result["desired"]["hvacMode"] == "cool" and result["desired"]["targetTemperature"] == 24
    assert result["observed"]["targetTemperature"] == 26
    assert result["diff"] == {"hvacModeChanged": False, "targetChanged": True}
    assert [action["kind"] for action in result["actions"]] == ["set_temperature"]
    assert result["sensor"]["valueCelsius"] == 27
    assert result["planSafe"] and not result["physicalExecutionAllowed"]
    assert result["physicalBlockers"] == ["endpoint_not_owned", "sensor_freshness_unknown"]
    assert plan(config, desired, states) == result
    assert execution.plan_is_current(result, config_revision=4, state_revision=7, now=NOW, current_plan=result)
    assert not execution.plan_is_current(result, config_revision=5, state_revision=7, now=NOW, current_plan=result)
    assert not execution.plan_is_current(result, config_revision=4, state_revision=8, now=NOW, current_plan=result)
    assert not execution.plan_is_current(result, config_revision=4, state_revision=7, now=NOW)
    states["sensor.camera_temp"].state = "26"
    changed = plan(config, desired, states)
    assert changed["inputFingerprint"] != result["inputFingerprint"]
    assert not execution.plan_is_current(result, config_revision=4, state_revision=7, now=NOW, current_plan=changed)


def test_mode_only_does_not_reassert_unchanged_target():
    config, desired, states = fixture(endpoint_mode="heat", endpoint_target=24)
    result = plan(config, desired, states)
    assert [action["kind"] for action in result["actions"]] == ["set_hvac_mode"]
    assert result["diff"] == {"hvacModeChanged": True, "targetChanged": False}
    assert result["actions"][0]["expected"] == {"hvacMode": "cool"}


def test_mode_and_target_have_stable_order():
    config, desired, states = fixture(endpoint_mode="heat", endpoint_target=26)
    result = plan(config, desired, states)
    assert [action["kind"] for action in result["actions"]] == ["set_hvac_mode", "set_temperature"]
    assert result["actions"][1]["expected"] == {"targetTemperature": 24}


def test_noop_uses_numerical_tolerance_and_never_commands():
    config, desired, states = fixture(endpoint_target=23.999999)
    result = plan(config, desired, states)
    assert result["status"] == "noop" and result["actions"] == []


@pytest.mark.parametrize(("house", "zone_mode", "target", "reason"), [
    ("off", "follow_house", 24, "house_off"),
    ("cooling", "off", 24, "zone_off"),
    ("cooling", "follow_house", None, "no_target"),
])
def test_off_and_missing_target_never_make_actions(house, zone_mode, target, reason):
    config, desired, states = fixture(mode=house, target=target)
    desired["zones"]["camera"]["mode"] = zone_mode
    result = plan(config, desired, states)
    assert result["reasons"] == [reason] and result["actions"] == []


@pytest.mark.parametrize(("raw", "unit", "reason"), [
    ("80.6", "°F", None), ("27", "K", "sensor_unit_unknown"),
    ("nan", "°C", "sensor_invalid"), ("inf", "°C", "sensor_invalid"),
    ("unavailable", "°C", "sensor_invalid"), ("99", "°C", "sensor_outside_plausible_range"),
])
def test_sensor_units_and_validity(raw, unit, reason):
    config, desired, states = fixture()
    states["sensor.camera_temp"].state = raw
    states["sensor.camera_temp"].attributes["unit_of_measurement"] = unit
    result = plan(config, desired, states)
    if reason:
        assert result["reasons"] == [reason] and result["actions"] == []
    else:
        assert result["status"] == "eligible"
        assert result["sensor"]["valueCelsius"] == pytest.approx(27)
        assert result["sensor"]["freshness"] == "unknown"
        assert intent.preview(config, desired, states)["zones"][0]["observed"]["temperature"] == pytest.approx(27)


def test_fahrenheit_endpoint_conversion_and_visible_step_normalization():
    config, desired, states = fixture(target=20.3)
    attrs = states["climate.ac"].attributes
    attrs.update({"temperature_unit": "°F", "temperature": 68, "min_temp": 60, "max_temp": 86, "target_temp_step": 0.5})
    result = plan(config, desired, states)
    assert result["desired"]["requestedTargetCelsius"] == 20.3
    assert result["desired"]["requestedTarget"] == pytest.approx(68.54)
    assert result["desired"]["targetTemperature"] == 68.5
    assert result["desired"]["normalization"] == "endpoint_step"
    assert result["actions"][0]["temperatureUnit"] == "°F"


def test_target_outside_range_is_never_clamped():
    config, desired, states = fixture(target=28)
    states["climate.ac"].attributes["max_temp"] = 25
    assert plan(config, desired, states)["reasons"] == ["target_outside_endpoint_range"]


def test_multiple_terminals_never_select_first():
    config, desired, states = fixture()
    config["zones"][0]["endpointIds"].append("ac2")
    config["endpoints"].append(terminal("ac2", "camera"))
    states["climate.ac2"] = deepcopy(states["climate.ac"])
    result = plan(config, desired, states)
    assert result["reasons"] == ["delivery_strategy_required"]
    assert result["endpointId"] is None and result["actions"] == []
    assert "delivery_strategy_required" in result["physicalBlockers"]
    assert "linux_ha_validation_required" not in result["physicalBlockers"]


@pytest.mark.parametrize(("change", "reason"), [
    ("unavailable", "endpoint_unavailable"), ("mode", "unsupported_hvac_mode"),
    ("feature", "target_temperature_unsupported"), ("unit", "endpoint_temperature_unit_unknown"),
    ("group", "shared_equipment_coordination_required"),
])
def test_runtime_capability_and_availability_changes(change, reason):
    config, desired, states = fixture()
    if change == "unavailable":
        states["climate.ac"].state = "unavailable"
    elif change == "mode":
        states["climate.ac"].attributes["hvac_modes"] = ["heat_cool", "off"]
    elif change == "feature":
        states["climate.ac"].attributes["supported_features"] = 0
    elif change == "unit":
        states["climate.ac"].attributes.pop("temperature_unit")
    else:
        config["equipmentGroups"] = [{"id": "outdoor", "memberEndpointIds": ["ac"], "generatorIds": [], "sharedOperatingMode": True}]
    assert plan(config, desired, states)["reasons"] == [reason]


def test_trv_direct_actuator_radiant_and_composite_are_blocked():
    config, desired, states = fixture(mode="heating", room=18, target=21)
    endpoint = config["endpoints"][0]
    endpoint["kind"] = "thermostatic_radiator_valve"
    endpoint["roles"] = ["room_heater", "radiator_trv"]
    endpoint["circuitId"] = "radiators"
    config["circuits"] = [circuit("radiators", ["camera"], ["ac"], [])]
    assert plan(config, desired, states)["reasons"] == ["hydronic_dependency_unmanaged"]
    endpoint["kind"] = "manifold_actuator"
    endpoint["entity"]["primaryEntityId"] = "switch.head"
    states["switch.head"] = SimpleNamespace(state="off", attributes={})
    assert plan(config, desired, states)["reasons"] == ["unsupported_direct_actuator"]
    endpoint["circuitId"] = None
    assert plan(config, desired, states)["reasons"] == ["unsupported_direct_actuator"]
    endpoint["kind"] = "fan_coil"
    endpoint["entity"]["primaryEntityId"] = "climate.ac"
    endpoint["entity"]["relatedControls"] = [{"entityId": "select.fan", "type": "select", "role": "fan"}]
    endpoint["circuitId"] = "water"
    config["circuits"] = [circuit("water", ["camera"], ["ac"], [], kind="fan_coil", cool=True)]
    assert plan(config, desired, states)["reasons"] == ["composite_execution_not_supported"]
    endpoint["entity"]["relatedControls"] = []
    endpoint["kind"] = "air_conditioner"
    endpoint["circuitId"] = "floor"
    config["circuits"] = [circuit("floor", ["camera"], ["ac"], [], kind="radiant_floor", cool=True)]
    desired["house"]["operatingMode"] = "cooling"
    states["sensor.camera_temp"].state = "27"
    assert plan(config, desired, states)["reasons"] == ["condensation_safety_not_implemented"]


def test_schedule_override_and_time_boundary_change_plan_without_persistence():
    config, desired, states = fixture()
    desired["house"]["controlMode"] = "auto"
    resolution = {"status": "resolved", "activeProfileId": "comfort", "activeEvent": None,
                  "nextEvent": {"occursAt": "2026-01-05T13:00:00+00:00"},
                  "zoneTargets": {"camera": {"status": "resolved", "value": 24}}}
    first = plan(config, desired, states, auto_resolution=resolution)
    assert first["desired"]["targetTemperature"] == 24
    assert first["validUntil"] == "2026-01-05T13:00:00+00:00"
    assert not execution.plan_is_current(first, config_revision=4, state_revision=7, now=NOW + timedelta(hours=1), current_plan=first)
    override = {"camera": {"targetTemperature": 22, "expiresAt": "2026-01-05T12:30:00+00:00", "expiryMode": "duration"}}
    second = plan(config, desired, states, auto_resolution=resolution, active_overrides=override)
    assert second["desired"]["targetTemperature"] == 22
    assert second["validUntil"] == "2026-01-05T12:30:00+00:00"
    assert second["planId"] != first["planId"]


def test_explicit_autonomous_thermostat_topology_only():
    config, desired, states = fixture(mode="heating", room=18, target=21, endpoint_mode="heat", endpoint_target=19)
    config["endpoints"][0]["kind"] = "other"
    assert plan(config, desired, states)["reasons"] == ["autonomous_control_not_confirmed"]
    config["endpoints"][0]["controlTopology"] = "direct_supervisory"
    assert plan(config, desired, states)["status"] == "eligible"
    assert models.parse_config(config)["endpoints"][0]["controlTopology"] == "direct_supervisory"
    config["endpoints"][0]["circuitId"] = "shared"
    with pytest.raises(models.InvalidConfig):
        models.parse_config(config)


@pytest.mark.parametrize(("house", "zone_mode", "has_target", "sensor_ok", "terminal_count"),
                         list(product(("heating", "cooling", "off"), ("follow_house", "off"),
                                      (True, False), (True, False), (0, 1, 2))))
def test_plan_gate_matrix(house, zone_mode, has_target, sensor_ok, terminal_count):
    room = 18 if house == "heating" else 27
    config, desired, states = fixture(mode=house, target=21 if has_target else None,
                                      room=room, endpoint_mode="heat" if house == "heating" else "cool")
    desired["zones"]["camera"]["mode"] = zone_mode
    if not sensor_ok:
        states["sensor.camera_temp"].state = "unavailable"
    if terminal_count == 0:
        config["zones"][0]["endpointIds"] = []
    elif terminal_count == 2:
        config["zones"][0]["endpointIds"].append("ac2")
        config["endpoints"].append(terminal("ac2", "camera"))
        states["climate.ac2"] = deepcopy(states["climate.ac"])
    result = plan(config, desired, states)
    assert not result["physicalExecutionAllowed"]
    if house == "off" or zone_mode == "off" or not has_target or not sensor_ok or terminal_count != 1:
        assert result["actions"] == [] and result["status"] in ("blocked", "unresolved")
    else:
        assert result["status"] == "eligible"
        assert result["desired"]["hvacMode"] == ("heat" if house == "heating" else "cool")


def test_final_snapshot_is_independent_of_sensor_and_intent_update_order():
    config, desired, states = fixture()
    first_states = deepcopy(states)
    first_intent = deepcopy(desired)
    first_states["sensor.camera_temp"].state = "25"
    first_intent["zones"]["camera"]["targetTemperature"] = 23
    second_intent = deepcopy(desired)
    second_states = deepcopy(states)
    second_intent["zones"]["camera"]["targetTemperature"] = 23
    second_states["sensor.camera_temp"].state = "25"
    assert plan(config, first_intent, first_states) == plan(config, second_intent, second_states)
