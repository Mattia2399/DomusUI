"""CLM.3A pure intent, sensor, topology and no-execution contract."""

from __future__ import annotations

from copy import deepcopy
from pathlib import Path
from types import SimpleNamespace

import pytest
from climate_pure import load
from test_climate_architecture import catalog, scenario_a, scenario_c, scenario_e

intent = load("intent")
models = load("models")


def state_for(config, operating="heating", control="manual", target=21.0):
    value = intent.default_intent(config)
    value["house"] = {"operatingMode": operating, "controlMode": control}
    for zone in config["zones"]:
        value["zones"][zone["id"]]["targetTemperature"] = target
    return value


def read(config, value, *, current=19.2, states=None, **kwargs):
    if states is None:
        states = catalog(config)
        for zone in config["zones"]:
            states[zone["reference"]["primaryEntityId"]].state = str(current)
    return intent.preview(config, value, states, **kwargs)["zones"]


def test_a_radiator_heat_preview_lists_two_generators_without_selection():
    config = scenario_a()
    zones = read(config, state_for(config))
    assert zones[0]["derived"]["thermalStatus"] == "needs_heating"
    paths = zones[0]["derived"]["compatiblePaths"]
    radiator = next(path for path in paths if path["terminalId"] == "trv")
    assert radiator["circuitId"] == "radiators"
    assert radiator["generatorCandidates"] == [{"id": "boiler", "role": "fallback"}, {"id": "stove", "role": "preferred"}]
    assert {path["terminalId"] for path in paths} == {"ac", "trv"}


def test_b_satisfied_inside_deadband():
    config = scenario_a()
    zone = read(config, state_for(config), current=20.9)[0]
    assert intent.DEADBAND_CELSIUS == 0.2
    assert zone["derived"]["thermalStatus"] == "satisfied"


def test_c_zone_off_and_d_house_off_override_readings():
    config = scenario_a()
    value = state_for(config)
    value["zones"]["living"]["mode"] = "off"
    zone = read(config, value)[0]
    assert zone["derived"]["thermalStatus"] == "off"
    assert zone["derived"]["compatiblePaths"] == []
    value["zones"]["living"]["mode"] = "follow_house"
    value["house"]["operatingMode"] = "off"
    zone = read(config, value)[0]
    assert zone["derived"]["thermalStatus"] == "off"
    assert zone["derived"]["compatiblePaths"] == []


def test_e_split_cooling_preview():
    config = scenario_e()
    zone = read(config, state_for(config, operating="cooling", target=24), current=27)[0]
    assert zone["derived"]["thermalStatus"] == "needs_cooling"
    assert zone["derived"]["compatiblePaths"][0]["terminalId"] == "ac_bedroom"
    assert zone["derived"]["compatiblePaths"][0]["circuitId"] is None


def test_f_radiant_cooling_constraint_is_not_claimed_safe():
    config = scenario_c()
    zone = read(config, state_for(config, operating="cooling", target=24), current=27)[0]
    path = zone["derived"]["compatiblePaths"][0]
    assert zone["derived"]["thermalStatus"] == "needs_cooling"
    assert path["circuitId"] == "floor"
    assert path["humidityConstraintPresent"]
    assert path["condensationProtectionRequired"]
    assert path["auxiliaryCandidates"] == ["dehum"]
    assert "safeToCool" not in path


def test_g_primary_unavailable_fallback_selected():
    config = scenario_a()
    config["zones"][0]["reference"]["fallbacks"] = ["sensor.backup_temp"]
    states = catalog(config)
    states["sensor.living_temp"].state = "unavailable"
    states["sensor.backup_temp"] = SimpleNamespace(state="19.2", attributes={})
    zone = read(config, state_for(config), states=states)[0]
    assert zone["observed"]["temperatureSource"] == "sensor.backup_temp"
    assert zone["derived"]["thermalStatus"] == "needs_heating"


def test_h_no_valid_sensor_yields_unknown_without_demand():
    config = scenario_a()
    states = catalog(config)
    states["sensor.living_temp"].state = "unavailable"
    states["climate.corridor"].state = "unavailable"
    zone = intent.preview(config, state_for(config), states)["zones"][0]
    assert zone["observed"]["temperatureAvailability"] == "unavailable"
    assert zone["derived"]["thermalStatus"] == "unknown"


def test_i_heating_with_cooling_only_terminal_has_no_compatible_path():
    config = scenario_e()
    for terminal in config["endpoints"]:
        terminal["roles"] = ["room_cooler"]
        terminal["capabilities"]["supportsHeating"] = False
    zone = read(config, state_for(config), current=19.2)[0]
    assert zone["derived"]["thermalStatus"] == "needs_heating"
    assert zone["derived"]["compatiblePaths"] == []


def test_j_multisplit_members_share_house_cooling_mode_only():
    config = scenario_e()
    zones = read(config, state_for(config, operating="cooling", target=24), current=27)
    assert all(zone["derived"]["compatiblePaths"][0]["sharedOperatingMode"] for zone in zones)
    assert all(zone["derived"]["thermalStatus"] == "needs_cooling" for zone in zones)


def test_humidity_fallback_invalid_and_stale_are_runtime_only():
    config = scenario_c()
    states = catalog(config)
    states["sensor.bedroom_humidity"].state = "unavailable"
    zone = intent.preview(config, state_for(config), states)["zones"][0]
    assert zone["observed"]["humiditySource"] == "sensor.backup_humidity"
    states["sensor.backup_humidity"].state = "bad"
    zone = intent.preview(config, state_for(config), states)["zones"][0]
    assert zone["observed"]["humidityAvailability"] == "invalid"
    states["sensor.backup_humidity"].state = "50"
    zone = intent.preview(config, state_for(config), states, stale_ids=frozenset({"sensor.backup_humidity"}))["zones"][0]
    assert zone["observed"]["humidityAvailability"] == "stale"


def test_auto_has_no_invented_target_but_can_accept_future_fixture():
    config = scenario_a()
    value = state_for(config, control="auto")
    zone = read(config, value)[0]
    assert zone["derived"]["effectiveTarget"] is None
    assert zone["derived"]["autoPendingConfiguration"]
    zone = read(config, value, auto_targets={"living": 21})[0]
    assert zone["derived"]["effectiveTarget"] == 21
    assert zone["derived"]["targetSource"] == "auto_fixture"


def test_desired_observed_mismatch_has_unknown_cause():
    config = scenario_a()
    states = catalog(config)
    states["climate.ac"].attributes["temperature"] = 22
    zone = intent.preview(config, state_for(config), states)["zones"][0]
    terminal = next(item for item in zone["derived"]["terminals"] if item["id"] == "ac")
    assert terminal["targetMismatch"] and terminal["mismatchCause"] == "unknown"


def test_state_store_round_trip_and_closed_payload():
    config = scenario_a()
    value = state_for(config)
    revision, restored = intent.parse_state_document(intent.state_document(3, value))
    assert revision == 3 and restored == value
    bad = deepcopy(value)
    bad["zones"]["living"]["targetTemperature"] = 72
    with pytest.raises(models.InvalidConfig):
        intent.parse_intent(bad)
    bad = deepcopy(value)
    bad["observed"] = {"temperature": 19.2}
    with pytest.raises(models.InvalidConfig):
        intent.parse_intent(bad)


def test_runtime_module_has_no_physical_execution_contract():
    climate_dir = Path(__file__).resolve().parents[1] / "custom_components" / "domusos" / "climate"
    for name in ("intent.py", "auto_resolver.py", "auto_timer.py", "state_manager.py", "api.py"):
        source = (climate_dir / name).read_text(encoding="utf-8")
        assert "async_call(" not in source
        assert "call_service(" not in source
        assert "set_temperature" not in source
        assert "set_hvac_mode" not in source
        assert "turn_on" not in source
        assert "turn_off" not in source
        assert "valve.open" not in source
        assert "valve.close" not in source
