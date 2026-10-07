"""Energy Profile validation and sensor normalization tests."""

import math
from typing import Any

import pytest
from homeassistant.core import State

from custom_components.domusos.energy.models import (
    DOCUMENT_SCHEMA,
    MODULE_SPECS,
    EnergyModule,
    EnergyValidationError,
    MeasurementKind,
    SignConvention,
    ValueStatus,
    parse_profile,
    parse_stored_profile,
)
from custom_components.domusos.energy.normalization import (
    NEGATIVE_NOISE_TOLERANCE_W,
    normalize_state,
)


def _power(value: str, unit: str | None = "W", **attributes: Any) -> State:
    attrs: dict[str, Any] = {"device_class": "power", "state_class": "measurement"}
    if unit is not None:
        attrs["unit_of_measurement"] = unit
    attrs.update(attributes)
    return State("sensor.power", value, attrs)


def test_profile_contains_only_configured_modules() -> None:
    profile = parse_profile(
        {"modules": {"grid": {"sensors": {"import_power": "sensor.grid_import"}}}}
    )

    assert profile.configured_modules == (EnergyModule.GRID,)
    assert EnergyModule.BATTERY in profile.absent_modules
    assert EnergyModule.SOLAR in profile.absent_modules
    assert EnergyModule.WALLBOX in profile.absent_modules
    assert profile.entity_ids == ("sensor.grid_import",)


def test_empty_profile_is_valid_and_has_no_placeholder_modules() -> None:
    profile = parse_profile({"modules": {}})

    assert profile.is_empty
    assert profile.configured_modules == ()
    assert set(profile.absent_modules) == set(EnergyModule)


@pytest.mark.parametrize(
    ("modules", "message"),
    [
        ({"heat_pump": {"sensors": {"power": "sensor.x"}}}, "Unknown energy module"),
        ({"battery": {"sensors": {}}}, "omit absent modules"),
        ({"solar": {"sensors": {"production": "sensor.x"}}}, "Unknown role"),
        ({"solar": {"sensors": {"production_power": "switch.x"}}}, "sensor entity"),
        ({"solar": {"sensors": {"production_power": "sensor.x"}, "x": 1}}, "unknown keys"),
        (
            {"grid": {"sensors": {"net_power": "sensor.grid"}}},
            "must declare its sign convention",
        ),
        (
            {
                "grid": {
                    "sensors": {"net_power": "sensor.grid"},
                    "sign_convention": "positive_discharge",
                }
            },
            "does not apply",
        ),
        (
            {
                "grid": {
                    "sensors": {"import_power": "sensor.grid"},
                    "sign_convention": "positive_import",
                }
            },
            "without a signed sensor",
        ),
        (
            {
                "battery": {
                    "sensors": {
                        "net_power": "sensor.batt",
                        "charge_power": "sensor.batt_charge",
                    },
                    "sign_convention": "positive_discharge",
                }
            },
            "cannot combine",
        ),
        (
            {
                "solar": {"sensors": {"production_power": "sensor.same"}},
                "home": {"sensors": {"consumption_power": "sensor.same"}},
            },
            "is used by both",
        ),
    ],
)
def test_profile_validation_rejects_ambiguous_or_malformed_input(
    modules: dict[str, Any], message: str
) -> None:
    with pytest.raises(EnergyValidationError, match=message):
        parse_profile({"modules": modules})


def test_signed_sensor_keeps_declared_convention_and_round_trips() -> None:
    profile = parse_profile(
        {
            "modules": {
                "battery": {
                    "sensors": {
                        "state_of_charge": "sensor.soc",
                        "net_power": "sensor.batt",
                    },
                    "sign_convention": "positive_charge",
                }
            }
        }
    )
    stored = parse_stored_profile({**profile.as_document(), "revision": 3})

    battery = stored.modules[EnergyModule.BATTERY]
    assert battery.sign_convention is SignConvention.POSITIVE_CHARGE
    assert stored.revision == 3
    assert stored.as_document()["schema"] == DOCUMENT_SCHEMA


@pytest.mark.parametrize(
    "document",
    [
        None,
        {"schema": "other", "version": 1, "revision": 0, "modules": {}},
        {"schema": DOCUMENT_SCHEMA, "version": 99, "revision": 0, "modules": {}},
        {"schema": DOCUMENT_SCHEMA, "version": 1, "revision": -1, "modules": {}},
        {"schema": DOCUMENT_SCHEMA, "version": 1, "revision": True, "modules": {}},
    ],
)
def test_stored_profile_rejects_untrusted_documents(document: Any) -> None:
    with pytest.raises(EnergyValidationError):
        parse_stored_profile(document)


@pytest.mark.parametrize(
    ("value", "unit", "expected"),
    [
        ("850", "W", 850.0),
        ("1.25", "kW", 1250.0),
        ("0.0042", "MW", 4200.0),
        ("1500000", "mW", 1500.0),
        ("0.000002", "GW", 2000.0),
        ("3412.14", "BTU/h", 1000.0),
        ("0", "kW", 0.0),
    ],
)
def test_power_is_normalized_to_watts(value: str, unit: str, expected: float) -> None:
    reading = normalize_state("sensor.power", _power(value, unit), MeasurementKind.POWER)

    assert reading.status is ValueStatus.OK
    assert reading.value == pytest.approx(expected, abs=0.01)
    assert reading.unit == "W"
    assert reading.source_unit == unit


@pytest.mark.parametrize(
    ("state", "reason"),
    [
        (None, "entity_missing"),
        (State("sensor.power", "unavailable", {"unit_of_measurement": "W"}), "state_unavailable"),
        (State("sensor.power", "unknown", {"unit_of_measurement": "W"}), "state_unknown"),
    ],
)
def test_missing_data_is_unavailable_and_never_zero(
    state: State | None, reason: str
) -> None:
    reading = normalize_state("sensor.power", state, MeasurementKind.POWER)

    assert reading.status is ValueStatus.UNAVAILABLE
    assert reading.value is None
    assert reading.reason == reason


@pytest.mark.parametrize(
    ("state", "reason"),
    [
        (_power("abc"), "non_numeric"),
        (_power("nan"), "non_finite"),
        (_power("inf"), "non_finite"),
        (_power("100", None), "unit_missing"),
        (_power("100", "VA", device_class=None), "unsupported_unit"),
        (_power("100", "kw"), "unsupported_unit"),
        (_power("12.5", "kWh", device_class="energy"), "cumulative_energy"),
        (_power("12.5", "kWh", device_class=None), "cumulative_energy"),
        (
            _power("12.5", "kW", state_class="total_increasing"),
            "cumulative_energy",
        ),
        (_power("230", "W", device_class="voltage"), "incompatible_device_class"),
        (_power("-40", "W"), "unexpected_negative"),
    ],
)
def test_malformed_power_values_are_invalid(state: State, reason: str) -> None:
    reading = normalize_state("sensor.power", state, MeasurementKind.POWER)

    assert reading.status is ValueStatus.INVALID
    assert reading.value is None
    assert reading.reason == reason


def test_signed_power_accepts_negative_values() -> None:
    reading = normalize_state(
        "sensor.power", _power("-1.5", "kW"), MeasurementKind.POWER, signed=True
    )

    assert reading.status is ValueStatus.OK
    assert reading.value == -1500.0


@pytest.mark.parametrize(
    ("value", "unit", "status", "reason"),
    [
        ("64", "%", ValueStatus.OK, None),
        ("100", "%", ValueStatus.OK, None),
        ("101", "%", ValueStatus.INVALID, "out_of_range"),
        ("-1", "%", ValueStatus.INVALID, "out_of_range"),
        ("0.64", None, ValueStatus.INVALID, "unit_missing"),
        ("6.4", "kWh", ValueStatus.INVALID, "cumulative_energy"),
    ],
)
def test_state_of_charge_is_normalized_to_percent(
    value: str, unit: str | None, status: ValueStatus, reason: str | None
) -> None:
    attributes: dict[str, Any] = {"device_class": "battery"}
    if unit is not None:
        attributes["unit_of_measurement"] = unit
    reading = normalize_state(
        "sensor.soc",
        State("sensor.soc", value, attributes),
        MeasurementKind.STATE_OF_CHARGE,
    )

    assert reading.status is status
    assert reading.reason == reason
    assert reading.unit == "%"
    if status is ValueStatus.OK:
        assert reading.value == float(value)


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("0", 0.0),
        ("-0", 0.0),
        ("-1", 0.0),
        ("-12.5", 0.0),
        (str(-NEGATIVE_NOISE_TOLERANCE_W), 0.0),
        ("2400", 2400.0),
    ],
)
def test_production_tolerates_night_noise_below_zero(value: str, expected: float) -> None:
    reading = normalize_state(
        "sensor.pv", _power(value, "W"), MeasurementKind.POWER, negative_noise=True
    )

    assert reading.status == "ok"
    assert reading.value == expected
    assert math.copysign(1, reading.value) == 1


@pytest.mark.parametrize("value", [str(-NEGATIVE_NOISE_TOLERANCE_W - 0.1), "-800"])
def test_significant_negative_production_stays_invalid(value: str) -> None:
    reading = normalize_state(
        "sensor.pv", _power(value, "W"), MeasurementKind.POWER, negative_noise=True
    )

    assert reading.status == "invalid"
    assert reading.reason == "unexpected_negative"
    assert reading.value is None


def test_noise_tolerance_only_applies_where_declared() -> None:
    reading = normalize_state("sensor.wallbox", _power("-1", "W"), MeasurementKind.POWER)

    assert reading.status == "invalid"
    assert reading.reason == "unexpected_negative"


def test_tolerance_is_checked_after_unit_conversion() -> None:
    within = normalize_state(
        "sensor.pv", _power("-0.05", "kW"), MeasurementKind.POWER, negative_noise=True
    )
    beyond = normalize_state(
        "sensor.pv", _power("-0.06", "kW"), MeasurementKind.POWER, negative_noise=True
    )

    assert within.value == 0.0
    assert beyond.reason == "unexpected_negative"


def test_only_solar_production_declares_noise_tolerance() -> None:
    tolerant = [
        (module, role)
        for module, spec in MODULE_SPECS.items()
        for role, role_spec in spec.roles.items()
        if role_spec.negative_noise
    ]

    assert tolerant == [(EnergyModule.SOLAR, "production_power")]
