"""Validation tests for the persistent irrigation document."""

import pytest

from custom_components.domusos.irrigation.models import (
    IrrigationValidationError,
    default_document,
    normalize_configuration,
    normalize_stored_document,
)


def configuration(*, actuator: str = "valve.garden", concurrent: int = 1, acknowledged: bool = False):
    return {
        "settings": {
            "maximumManualDurationMin": 30,
            "maxConcurrentZones": concurrent,
            "parallelSafetyAcknowledged": acknowledged,
            "rainSensorEnabled": False,
            "rainSensorEntityId": "",
            "blockOnRainSensorUnavailable": True,
            "rainDuringCycle": "stop_immediately",
        },
        "sources": {},
        "zones": [{
            "id": "garden", "name": "Garden", "entityId": actuator,
            "enabled": True, "days": ["mon", "wed"],
            "startTimes": ["06:00"], "baseDuration": 10,
            "manualDurationMin": 10,
        }],
    }


def test_defaults_are_stopped_and_server_owned() -> None:
    document = default_document()
    assert document["mode"] == "stopped"
    assert document["revision"] == 0
    assert document["sessions"] == []
    assert document["legacyMigrationCompleted"] is False


@pytest.mark.parametrize("actuator", ["input_boolean.garden", "light.garden", "script.garden"])
def test_real_configuration_rejects_non_actuator_domains(actuator: str) -> None:
    with pytest.raises(IrrigationValidationError):
        normalize_configuration(configuration(actuator=actuator))


def test_parallel_operation_requires_explicit_hydraulic_acknowledgement() -> None:
    value = configuration(concurrent=2)
    value["zones"].append({
        **value["zones"][0], "id": "orchard", "name": "Orchard",
        "entityId": "switch.orchard",
    })
    with pytest.raises(IrrigationValidationError, match="portata"):
        normalize_configuration(value)
    value["settings"]["parallelSafetyAcknowledged"] = True
    assert normalize_configuration(value)["settings"]["maxConcurrentZones"] == 2


def test_duration_and_rain_sensor_are_fail_closed() -> None:
    value = configuration()
    value["settings"]["maximumManualDurationMin"] = 61
    with pytest.raises(IrrigationValidationError):
        normalize_configuration(value)
    value = configuration()
    value["settings"]["rainSensorEnabled"] = True
    with pytest.raises(IrrigationValidationError, match="sensore"):
        normalize_configuration(value)


def test_stored_runtime_lists_do_not_trust_malformed_values() -> None:
    stored = default_document() | configuration()
    stored["history"] = ["bad", {"zoneId": "garden", "state": "completed"}]
    stored["legacyMigrationCompleted"] = True
    normalized = normalize_stored_document(stored)
    assert normalized["history"] == [{"zoneId": "garden", "state": "completed"}]
    assert normalized["legacyMigrationCompleted"] is True
