"""Device power decisions and validation, without Home Assistant.

The model is plain Python, so it is loaded from its file: these tests run
anywhere the backend runs, and on machines without Home Assistant installed.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
import sys

import pytest

_MODELS_PATH = (
    Path(__file__).resolve().parents[1] / "custom_components" / "domusos" / "device_power" / "models.py"
)
_spec = importlib.util.spec_from_file_location("domus_device_power_models", _MODELS_PATH)
models = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = models
_spec.loader.exec_module(models)

PolicyStatus = models.PolicyStatus

POLICY_ID = "0123456789abcdef0123456789abcdef"
NOW = "2026-10-16T10:00:00+00:00"


def settings(**overrides):
    payload = {
        "client_id": "client-0001",
        "label": "Tablet soggiorno",
        "enabled": True,
        "battery_entity_id": "sensor.tablet_battery_level",
        "switch_entity_id": "switch.presa_tablet",
        "start_threshold": 30,
        "stop_threshold": 80,
    }
    payload.update(overrides)
    return payload


def stored(**overrides):
    policy = {**settings(), "policy_id": POLICY_ID, "revision": 1, "created_at": NOW, "updated_at": NOW}
    policy.update(overrides)
    return policy


# --- Hysteresis -------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("battery", "switch", "command"),
    [
        ("31", "off", None),  # between the thresholds: leave it
        ("30", "off", True),  # at the start threshold: charge
        ("25", "off", True),
        ("0", "off", True),
        ("55", "on", None),  # charging, between the thresholds: keep charging
        ("79", "on", None),
        ("80", "on", False),  # at the stop threshold: stop
        ("85", "on", False),
        ("100", "on", False),
        ("60", "off", None),  # stopped, between the thresholds: stay stopped
        ("31", "off", None),
    ],
)
def test_hysteresis_turns_the_charger_on_and_off_only_at_the_thresholds(battery, switch, command):
    result = models.evaluate(30, 80, battery, switch)
    assert result.command is command


def test_hysteresis_follows_a_whole_charge_cycle():
    switch = "off"
    issued = []
    for battery in ["31", "30", "55", "79", "80", "60", "31", "30"]:
        result = models.evaluate(30, 80, battery, switch)
        if result.command is not None:
            issued.append((battery, result.command))
            switch = "on" if result.command else "off"
    assert issued == [("30", True), ("80", False), ("30", True)]


def test_no_command_when_the_switch_is_already_where_it_should_be():
    assert models.evaluate(30, 80, "20", "on").command is None
    assert models.evaluate(30, 80, "90", "off").command is None


def test_status_reports_charging_or_waiting_from_the_switch():
    assert models.evaluate(30, 80, "25", "on").status is PolicyStatus.CHARGING
    assert models.evaluate(30, 80, "55", "off").status is PolicyStatus.WAITING


@pytest.mark.parametrize(
    "battery", ["unknown", "unavailable", "", "abc", "nan", "inf", "-1", "100.5", "101", None, 42]
)
def test_battery_without_trustworthy_data_never_drives_the_switch(battery):
    result = models.evaluate(30, 80, battery, "off")
    assert result.command is None
    assert result.status is PolicyStatus.BATTERY_UNAVAILABLE
    assert result.battery_level is None


@pytest.mark.parametrize("switch", ["unknown", "unavailable", "", None, "ON"])
def test_switch_without_a_known_state_is_never_commanded(switch):
    result = models.evaluate(30, 80, "10", switch)
    assert result.command is None
    assert result.status is PolicyStatus.SWITCH_UNAVAILABLE


def test_decimal_battery_levels_are_read_as_percentages():
    assert models.read_battery_level("29.9") == pytest.approx(29.9)
    assert models.evaluate(30, 80, "30.0", "off").command is True


# --- Settings validation ----------------------------------------------------------------


def test_valid_settings_are_kept_as_sent():
    parsed = models.parse_policy_settings(settings(label="  Tablet cucina  "))
    assert parsed.label == "Tablet cucina"
    assert parsed.start_threshold == 30 and parsed.stop_threshold == 80


@pytest.mark.parametrize(
    ("start", "stop"),
    [(80, 30), (50, 50), (-1, 50), (30, 101), (30.5, 80), (True, 80), ("30", 80)],
)
def test_invalid_thresholds_are_refused_not_corrected(start, stop):
    with pytest.raises(models.InvalidPolicyError):
        models.parse_policy_settings(settings(start_threshold=start, stop_threshold=stop))


def test_extreme_but_ordered_thresholds_are_accepted():
    parsed = models.parse_policy_settings(settings(start_threshold=0, stop_threshold=100))
    assert (parsed.start_threshold, parsed.stop_threshold) == (0, 100)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("battery_entity_id", "binary_sensor.tablet_battery"),
        ("battery_entity_id", "switch.presa_tablet"),
        ("switch_entity_id", "light.presa_tablet"),
        ("switch_entity_id", "input_boolean.presa"),
        ("switch_entity_id", "script.ricarica"),
        ("switch_entity_id", "button.presa"),
        ("switch_entity_id", "Switch.Presa"),
        ("switch_entity_id", ""),
    ],
)
def test_only_a_sensor_battery_and_a_switch_charger_are_supported(field, value):
    with pytest.raises(models.InvalidPolicyError) as raised:
        models.parse_policy_settings(settings(**{field: value}))
    assert raised.value.field == field


def test_labels_are_trimmed_bounded_and_empty_means_none():
    assert models.canonical_label("   ") is None
    assert models.canonical_label(None) is None
    assert models.canonical_label("x" * 64) == "x" * 64
    with pytest.raises(models.InvalidPolicyError):
        models.canonical_label("x" * 65)


def test_client_reference_is_optional_and_never_free_text():
    assert models.parse_policy_settings(settings(client_id=None)).client_id is None
    for value in ["short", "has space here", "a" * 65, 123]:
        with pytest.raises(models.InvalidPolicyError):
            models.parse_policy_settings(settings(client_id=value))


def test_unknown_or_missing_fields_are_refused():
    with pytest.raises(models.InvalidPolicyError):
        models.parse_policy_settings({**settings(), "strategy": "schedule"})
    with pytest.raises(models.InvalidPolicyError):
        models.parse_policy_settings({key: value for key, value in settings().items() if key != "enabled"})


# --- Stored document ---------------------------------------------------------------------


def test_a_valid_store_is_read_without_change():
    policies = models.parse_stored_document({"policies": [stored()]})
    assert list(policies) == [POLICY_ID]
    assert models.storage_document(policies) == {"policies": [stored()]}


@pytest.mark.parametrize(
    "document",
    [
        None,
        [],
        {"policies": "x"},
        {"policies": [], "extra": 1},
        {"policies": [{**stored(), "strategy": "threshold"}]},
        {"policies": [stored(revision=0)]},
        {"policies": [stored(policy_id="not-an-id")]},
        {"policies": [stored(start_threshold=80, stop_threshold=30)]},
        {"policies": [stored(label="  untrimmed ")]},
        {"policies": [stored(updated_at="yesterday")]},
        {"policies": [stored(), stored()]},
    ],
)
def test_an_untrustworthy_store_is_refused_as_a_whole(document):
    with pytest.raises(models.InvalidStoredDocumentError):
        models.parse_stored_document(document)


def test_a_store_with_two_active_policies_on_one_switch_runs_nothing():
    other = stored(policy_id="f" * 32, client_id="client-0002")
    with pytest.raises(models.InvalidStoredDocumentError):
        models.parse_stored_document({"policies": [stored(), other]})


def test_a_disabled_policy_may_name_the_switch_of_an_active_one():
    other = stored(policy_id="f" * 32, client_id="client-0002", enabled=False)
    assert len(models.parse_stored_document({"policies": [stored(), other]})) == 2


def test_one_device_has_at_most_one_policy():
    other = stored(policy_id="f" * 32, switch_entity_id="switch.altra_presa")
    with pytest.raises(models.InvalidStoredDocumentError):
        models.parse_stored_document({"policies": [stored(), other]})


def test_duplicate_switches_are_an_explicit_error_never_first_or_last_wins():
    first = models.parse_stored_document({"policies": [stored()]})[POLICY_ID]
    second = models.PowerPolicy(**{**stored(policy_id="f" * 32, client_id="client-0002")})
    with pytest.raises(models.SwitchInUseError):
        models.check_policy_set([first, second])
