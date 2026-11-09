"""CLM.3C safety gates and future reconciliation contract; no HA service calls."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from climate_pure import load
from test_climate_execution_plan import NOW, fixture

models = load("models")
intent = load("intent")
execution = load("execution_plan")
validation = load("execution_validation")
reconciliation = load("reconciliation")


def snapshot(config, desired, states, *, now=NOW, auto_targets=None,
             capabilities=validation.CURRENT_EXECUTION_VALIDATION):
    preview = intent.preview(config, desired, states, now=now, auto_targets=auto_targets)
    return execution.build_execution_preview(config, preview, states, config_revision=4,
                                             state_revision=7, evaluated_at=now, validation=capabilities)["plans"][0]


def ready_config():
    config, desired, states = fixture()
    config["endpoints"][0]["executionOwnership"] = "domus_supervised"
    config["zones"][0]["reference"].update(freshnessPolicy="max_age", maxAgeSeconds=300)
    return config, desired, states


def test_house_arm_defaults_false_and_survives_store_roundtrip():
    config, _, _ = fixture()
    assert models.parse_config(config).get("physicalExecutionEnabled", False) is False
    config["physicalExecutionEnabled"] = True
    assert models.parse_stored(models.storage_document(3, config)) == (3, config)
    config["physicalExecutionEnabled"] = "true"
    with pytest.raises(models.InvalidConfig):
        models.parse_config(config)


def test_plan_token_is_stable_across_evaluations_and_changes_with_inputs():
    config, desired, states = ready_config()
    first = snapshot(config, desired, states)
    second = snapshot(config, desired, states, now=NOW + timedelta(seconds=1))
    assert first["planToken"] == second["planToken"]
    assert first["planId"] != second["planId"]
    desired["zones"]["camera"]["targetTemperature"] = 23
    assert snapshot(config, desired, states)["planToken"] != first["planToken"]


def assert_blocked_without_linux(config, desired, states, reason):
    result = snapshot(config, desired, states)
    assert not result["physicalExecutionAllowed"]
    assert reason in result["physicalBlockers"]
    assert "linux_ha_validation_required" not in result["physicalBlockers"]


def test_golden_auto_cooling_direct_ac_is_ready_after_linux_validation():
    config, desired, states = ready_config()
    desired["house"]["controlMode"] = "auto"
    desired["zones"]["camera"]["targetTemperature"] = None
    result = snapshot(config, desired, states, auto_targets={"camera": 24})
    assert result["status"] == "eligible"
    assert result["desired"]["hvacMode"] == "cool"
    assert result["desired"]["targetTemperature"] == 24
    assert result["sensor"]["valueCelsius"] == 27
    assert result["observed"]["targetTemperature"] == 26
    assert result["physicalBlockers"] == []
    assert result["physicalExecutionAllowed"]


def test_unvalidated_capability_preserves_linux_blocker():
    config, desired, states = ready_config()
    unvalidated = validation.ExecutionValidationCapabilities(linux_home_assistant=False)
    result = snapshot(config, desired, states, capabilities=unvalidated)
    assert result["status"] == "eligible"
    assert result["physicalBlockers"] == ["linux_ha_validation_required"]
    assert not result["physicalExecutionAllowed"]


def test_validated_noop_has_no_actions_or_linux_blocker():
    config, desired, states = ready_config()
    states["climate.ac"].attributes["temperature"] = 24
    result = snapshot(config, desired, states)
    assert result["status"] == "noop"
    assert result["actions"] == []
    assert result["physicalBlockers"] == ["no_command_required"]
    assert not result["physicalExecutionAllowed"]


def test_ownership_default_roundtrip_invalid_and_revision_bound():
    config, desired, states = fixture()
    assert "executionOwnership" not in models.parse_config(config)["endpoints"][0]
    assert snapshot(config, desired, states)["physicalBlockers"] == [
        "endpoint_not_owned", "sensor_freshness_unknown"]
    config["endpoints"][0]["executionOwnership"] = "observe_only"
    assert models.parse_stored(models.storage_document(3, config)) == (3, config)
    assert "endpoint_not_owned" in snapshot(config, desired, states)["physicalBlockers"]
    config["endpoints"][0]["executionOwnership"] = "domus_supervised"
    assert models.parse_stored(models.storage_document(4, config)) == (4, config)
    assert "endpoint_not_owned" not in snapshot(config, desired, states)["physicalBlockers"]
    config["endpoints"][0]["executionOwnership"] = "shared"
    with pytest.raises(models.InvalidConfig):
        models.parse_config(config)


def test_explicit_max_age_and_fallback_are_evaluated_on_selected_source():
    config, desired, states = ready_config()
    golden = snapshot(config, desired, states)
    assert golden["status"] == "eligible" and golden["sensor"]["freshness"] == "verified"
    assert golden["physicalBlockers"] == []
    assert golden["physicalExecutionAllowed"]
    old = NOW - timedelta(seconds=301)
    states["sensor.camera_temp"].last_updated = old
    stale = snapshot(config, desired, states)
    assert stale["sensor"]["freshness"] == "stale"
    assert_blocked_without_linux(config, desired, states, "sensor_stale")
    config["zones"][0]["reference"]["fallbacks"] = ["sensor.backup"]
    states["sensor.backup"] = SimpleNamespace(state="27", attributes={"unit_of_measurement": "°C"}, last_updated=NOW)
    selected = snapshot(config, desired, states)
    assert selected["sensor"]["source"] == "sensor.backup"
    assert selected["sensor"]["freshness"] == "verified"
    assert selected["physicalBlockers"] == []
    assert selected["physicalExecutionAllowed"]
    states["sensor.camera_temp"].state = "unavailable"
    assert snapshot(config, desired, states)["sensor"]["source"] == "sensor.backup"


@pytest.mark.parametrize("timestamp", [None, NOW + timedelta(seconds=1), datetime(2026, 1, 5)])
def test_unknown_and_future_timestamp_fail_closed(timestamp):
    config, desired, states = ready_config()
    states["sensor.camera_temp"].last_updated = timestamp
    result = snapshot(config, desired, states)
    assert result["sensor"]["freshness"] == "unknown"
    assert_blocked_without_linux(config, desired, states, "sensor_freshness_unknown")


@pytest.mark.parametrize("policy,age", [("none", None), ("max_age", 0), ("max_age", 86401), ("max_age", True), ("bad", 300)])
def test_invalid_or_absent_freshness_policy(policy, age):
    config, desired, states = fixture()
    reference = config["zones"][0]["reference"]
    if policy == "none" and age is None:
        assert snapshot(config, desired, states)["sensor"]["freshness"] == "unknown"
        return
    reference["freshnessPolicy"] = policy
    if age is not None:
        reference["maxAgeSeconds"] = age
    with pytest.raises(models.InvalidConfig):
        models.parse_config(config)


def test_multi_blocker_and_stale_generation():
    config, desired, states = fixture()
    plan = snapshot(config, desired, states)
    assert plan["physicalBlockers"] == ["endpoint_not_owned", "sensor_freshness_unknown"]
    config, desired, states = ready_config()
    plan = snapshot(config, desired, states)
    changed = deepcopy(plan)
    changed["inputFingerprint"] = "new"
    readiness = execution.evaluate_physical_execution_readiness(
        plan, config, config["zones"][0], config_trusted=True, state_trusted=True,
        current_plan=changed, config_revision=4, state_revision=7, now=NOW, linux_ha_validated=True)
    assert readiness == {"allowed": False, "blockers": ["plan_stale"]}
    allowed = execution.evaluate_physical_execution_readiness(
        plan, config, config["zones"][0], config_trusted=True, state_trusted=True,
        current_plan=plan, config_revision=4, state_revision=7, now=NOW, linux_ha_validated=True)
    assert allowed == {"allowed": True, "blockers": []}


def test_autonomous_thermostat_and_excluded_topologies():
    from test_climate_architecture import circuit

    config, desired, states = ready_config()
    config["endpoints"][0]["kind"] = "other"
    config["endpoints"][0]["controlTopology"] = "direct_supervisory"
    assert snapshot(config, desired, states)["physicalBlockers"] == []
    assert snapshot(config, desired, states)["physicalExecutionAllowed"]
    endpoint = config["endpoints"][0]
    endpoint["kind"] = "thermostatic_radiator_valve"
    endpoint["roles"] = ["room_heater", "radiator_trv"]
    endpoint["circuitId"] = "radiators"
    config["circuits"] = [circuit("radiators", ["camera"], ["ac"], [])]
    desired["house"]["operatingMode"] = "heating"
    assert_blocked_without_linux(config, desired, states, "hydronic_dependency_unmanaged")
    endpoint["kind"] = "manifold_actuator"
    endpoint["entity"]["primaryEntityId"] = "switch.head"
    states["switch.head"] = SimpleNamespace(state="off", attributes={})
    assert_blocked_without_linux(config, desired, states, "unsupported_direct_actuator")
    endpoint["kind"] = "fan_coil"
    endpoint["entity"]["primaryEntityId"] = "climate.ac"
    endpoint["entity"]["relatedControls"] = [{"entityId": "select.fan", "type": "select", "role": "fan"}]
    assert_blocked_without_linux(config, desired, states, "composite_execution_not_supported")
    endpoint["entity"]["relatedControls"] = []
    endpoint["kind"] = "air_conditioner"
    endpoint["circuitId"] = None
    config["circuits"] = []
    config["equipmentGroups"] = [{"id": "outdoor", "memberEndpointIds": ["ac"],
                                  "generatorIds": [], "sharedOperatingMode": True}]
    assert_blocked_without_linux(config, desired, states, "shared_equipment_coordination_required")
    config.pop("equipmentGroups")
    endpoint["circuitId"] = "floor"
    config["circuits"] = [circuit("floor", ["camera"], ["ac"], [], kind="radiant_floor", cool=True)]
    desired["house"]["operatingMode"] = "cooling"
    assert_blocked_without_linux(config, desired, states, "condensation_safety_not_implemented")


def test_reconciliation_convergence_pending_superseded_failure_and_duplicate():
    config, desired, states = ready_config()
    plan = snapshot(config, desired, states)
    expected = reconciliation.expected_state(plan)
    assert expected == {"targetTemperature": 24}
    fake = {"correlationId": "fake-1", "planGeneration": plan["planId"], "entityId": "climate.ac",
            "issuedAt": None, "expectedState": expected, "status": "pending",
            "reconciliationDeadline": None, "failureReason": None}
    assert reconciliation.same_desired_pending(fake, plan)
    assert reconciliation.reconcile_command(fake, {"available": True, "hvacMode": "cool", "targetTemperature": 26},
                                            current_plan=plan, config_revision=4, state_revision=7, now=NOW)["status"] == "pending"
    assert reconciliation.reconcile_command(fake, {"available": True, "hvacMode": "cool", "targetTemperature": 24.00001},
                                            current_plan=plan, config_revision=4, state_revision=7, now=NOW)["status"] == "converged"
    unavailable = reconciliation.reconcile_command(fake, {"available": False}, current_plan=plan,
                                                   config_revision=4, state_revision=7, now=NOW)
    assert unavailable["status"] == "failed" and unavailable["failureReason"] == "entity_unavailable"
    new_plan = deepcopy(plan)
    new_plan["planId"] = "new-generation"
    assert reconciliation.reconcile_command(fake, {}, current_plan=new_plan,
                                            config_revision=4, state_revision=7, now=NOW)["status"] == "superseded"
    assert reconciliation.reconcile_command(fake, {}, current_plan=plan,
                                            config_revision=5, state_revision=7, now=NOW)["failureReason"] == "plan_stale"
    assert not reconciliation.same_desired_pending({**fake, "status": "converged"}, plan)
    assert reconciliation.reconcile_command({**fake, "entityId": "climate.other"}, {}, current_plan=plan,
                                            config_revision=4, state_revision=7, now=NOW)["failureReason"] == "plan_stale"
    assert reconciliation.reconcile_command({**fake, "status": "superseded"}, {}, current_plan=plan,
                                            config_revision=4, state_revision=7, now=NOW)["status"] == "superseded"


def test_reconciliation_mode_target_and_deadline_are_explicit():
    config, desired, states = ready_config()
    states["climate.ac"].state = "heat"
    plan = snapshot(config, desired, states)
    expected = reconciliation.expected_state(plan)
    assert expected == {"hvacMode": "cool", "targetTemperature": 24}
    assert not reconciliation.observed_matches_expected(expected, {"hvacMode": "heat", "targetTemperature": 24})
    assert not reconciliation.observed_matches_expected(expected, {"hvacMode": "cool", "targetTemperature": 26})
    assert reconciliation.observed_matches_expected(expected, {"hvacMode": "cool", "targetTemperature": 24})
    fake = {"correlationId": "fake-2", "planGeneration": plan["planId"], "entityId": "climate.ac",
            "issuedAt": None, "expectedState": expected, "status": "pending",
            "reconciliationDeadline": (NOW - timedelta(seconds=1)).isoformat(), "failureReason": None}
    assert reconciliation.reconcile_command(fake, {"available": True, "hvacMode": "heat", "targetTemperature": 26},
                                            current_plan=plan, config_revision=4, state_revision=7,
                                            now=NOW)["failureReason"] == "state_not_converged"
