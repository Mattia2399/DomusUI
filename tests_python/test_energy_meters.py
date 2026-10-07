"""Energy meters: Recorder metadata, validation, unit normalization and plan.

Tests that request ``recorder_mock`` run Home Assistant's real Recorder on an
in-memory database and compile statistics the way Home Assistant does, so the
statuses and the statistics semantics below are those of the installed
Home Assistant version.
"""

import copy
import json
from datetime import datetime, timedelta, timezone
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from freezegun.api import FrozenDateTimeFactory
from homeassistant.components.recorder import get_instance
from homeassistant.components.recorder import statistics as recorder_statistics
from homeassistant.const import MAJOR_VERSION, MINOR_VERSION
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.components.recorder.common import (
    async_wait_recording_done,
    do_adhoc_statistics,
)

from custom_components.domusos.const import DOMAIN
from custom_components.domusos.energy import meters
from custom_components.domusos.energy.api import websocket_get_profile, websocket_save_profile
from custom_components.domusos.energy.context import async_energy_state
from custom_components.domusos.energy.manager import EnergyProfileManager
from custom_components.domusos.energy.meters import (
    MeterStatus,
    energy_meter_plan,
    energy_to_kwh,
    profile_statistic_ids,
)
from custom_components.domusos.energy.models import STORAGE_KEY, EnergyValidationError
from custom_components.domusos.energy.profile_v2 import STORAGE_KEY_V2, parse_profile_v2

KWH = {"device_class": "energy", "state_class": "total_increasing", "unit_of_measurement": "kWh"}
W = {"device_class": "power", "state_class": "measurement", "unit_of_measurement": "W"}
V1 = {
    "schema": "domusos-energy-profile",
    "version": 1,
    "revision": 4,
    "updated_at": "2026-10-01T08:00:00+00:00",
    "modules": {"solar": {"sensors": {"production_power": "sensor.pv"}}},
    "tariff": None,
}


@pytest.fixture(autouse=True)
def mock_recorder_before_hass(async_setup_recorder_instance: Any) -> None:
    """Let the tests that request ``recorder_mock`` start the Recorder before hass."""


def at(minute: int, hour: int = 10) -> datetime:
    return datetime(2026, 10, 6, hour, 0, tzinfo=timezone.utc) + timedelta(minutes=minute)


def _entry(key: str, data: dict[str, Any]) -> dict[str, Any]:
    return {"version": 1, "minor_version": 1, "key": key, "data": copy.deepcopy(data)}


async def _manager(hass: HomeAssistant) -> EnergyProfileManager:
    manager = EnergyProfileManager(hass)
    await manager.async_setup()
    return manager


def _solar(*devices: dict[str, Any], total: dict[str, Any] | None = None) -> dict[str, Any]:
    plan: dict[str, Any] = {"devices": list(devices)}
    if total is not None:
        plan["total"] = total
    return {"solar": plan}


def _meter_device(device_id: str, *parts: str, power: str | None = None) -> dict[str, Any]:
    device: dict[str, Any] = {"id": device_id}
    if parts:
        device["energy"] = {"production_energy": list(parts)}
    if power:
        device["power"] = {"sensors": {"production_power": power}}
    return device


async def _compile_hour(hass: HomeAssistant, freezer: FrozenDateTimeFactory) -> None:
    """Compile 10:00-11:00 statistics, as Home Assistant does at the end of the hour."""
    freezer.move_to(at(61))
    do_adhoc_statistics(hass, start=at(55))
    await async_wait_recording_done(hass)


def _add_external(hass: HomeAssistant, statistic_id: str, rows: list[tuple[int, float, float]]) -> None:
    metadata: dict[str, Any] = {
        "has_sum": True,
        "name": "Imported grid",
        "source": statistic_id.split(":")[0],
        "statistic_id": statistic_id,
        "unit_of_measurement": "kWh",
    }
    if (MAJOR_VERSION, MINOR_VERSION) >= (2025, 4):
        from homeassistant.components.recorder.models import StatisticMeanType

        metadata |= {"mean_type": StatisticMeanType.NONE, "unit_class": "energy"}
    else:
        metadata |= {"has_mean": False}
    recorder_statistics.async_add_external_statistics(
        hass,
        metadata,
        [{"start": at(0, hour), "state": state, "sum": total} for hour, state, total in rows],
    )


# --- Units and plan (pure) ------------------------------------------------------------------


@pytest.mark.parametrize(
    ("value", "unit", "kwh"),
    [
        (1500, "Wh", 1.5),
        (2.25, "kWh", 2.25),
        (0.0035, "MWh", 3.5),
        (2_000_000, "mWh", 2.0),
        (3600, "kJ", 1.0),
        (0.1 + 0.2, "kWh", 0.3),
        (1, "Wh", 0.001),
        (0, "Wh", 0.0),
        (-0.0, "kWh", 0.0),
    ],
)
def test_energy_is_normalized_to_kwh(value: float, unit: str, kwh: float) -> None:
    assert energy_to_kwh(value, unit) == kwh


@pytest.mark.parametrize("unit", ["W", "kW", "°C", "", None, "kwh"])
def test_power_and_unknown_units_are_never_converted(unit: str | None) -> None:
    with pytest.raises(ValueError):
        energy_to_kwh(10, unit)


def test_meter_plan_keeps_totals_apart_and_flags_what_needs_confirmation() -> None:
    profile = parse_profile_v2({"plant": {
        **_solar(
            _meter_device("solar-1", "sensor.inv1_f1", "sensor.inv1_f2", "sensor.inv1_f3"),
            _meter_device("solar-2", "sensor.inv2_energy", power="sensor.inv2_power"),
            # Power only: its energy is unknown, never 0 kWh.
            _meter_device("solar-3", power="sensor.inv3_power"),
        ),
        "grid": {
            "devices": [{"id": "grid-1", "energy": {"import_energy": ["sensor.grid_in"], "export_energy": ["sensor.grid_out"]}},
                        {"id": "grid-2", "energy": {"import_energy": ["sensor.grid2_in"]}}],
            "total": {"energy": {"import_energy": ["sensor.main_in"]}},
        },
        "battery": {"devices": [
            {"id": "battery-1", "energy": {"charge_energy": ["sensor.b1_in"], "discharge_energy": ["sensor.b1_out"]}},
            {"id": "battery-2", "energy": {"charge_energy": ["sensor.b2_in"], "discharge_energy": ["sensor.b2_out"]}},
        ]},
        "wallbox": {"devices": [
            {"id": "wallbox-1", "energy": {"charging_energy": ["sensor.wb1"]}},
            {"id": "wallbox-2", "energy": {"charging_energy": ["sensor.wb2"]}},
        ]},
    }})
    plan = energy_meter_plan(profile)

    solar = plan["solar"]["production_energy"]
    assert solar["source"] == "devices"
    assert solar["statistic_ids"] == ["sensor.inv1_f1", "sensor.inv1_f2", "sensor.inv1_f3", "sensor.inv2_energy"]
    assert solar["coverage"] == {"contributing": 2, "configured": 3}
    assert solar["complete"] is False
    assert solar["review"] == ["multiple_parts", "devices_without_meter"]

    grid_import = plan["grid"]["import_energy"]
    # The main meter already includes both supply points: never added to them.
    assert (grid_import["source"], grid_import["statistic_ids"]) == ("total", ["sensor.main_in"])
    assert grid_import["coverage"] is None and grid_import["complete"] is True
    assert grid_import["review"] == ["total_with_devices"]
    assert [d["device_id"] for d in grid_import["devices"]] == ["grid-1", "grid-2"]
    grid_export = plan["grid"]["export_energy"]
    assert grid_export["source"] == "devices"
    assert grid_export["coverage"] == {"contributing": 1, "configured": 2}

    for role in ("charge_energy", "discharge_energy"):
        assert plan["battery"][role]["complete"] is True
        assert plan["battery"][role]["review"] == []
    assert plan["wallbox"]["charging_energy"]["statistic_ids"] == ["sensor.wb1", "sensor.wb2"]
    assert "home" not in plan
    assert len(profile_statistic_ids(profile)) == 14


@pytest.mark.parametrize(
    "plant",
    [
        _solar(_meter_device("solar-1", "sensor.e"), _meter_device("solar-2", "sensor.e")),
        _solar(_meter_device("solar-1", "sensor.e"), _meter_device("solar-2", "sensor.f"), total={"energy": {"production_energy": ["sensor.e"]}}),
        _solar(_meter_device("solar-1", "sensor.e", "sensor.e")),
        _solar(_meter_device("solar-1", "sensor.e", power="sensor.e")),
    ],
)
async def test_a_meter_counted_twice_is_refused(hass: HomeAssistant, hass_storage: dict, plant: dict) -> None:
    manager = await _manager(hass)
    with pytest.raises(EnergyValidationError):
        await manager.async_save_profile({"plant": plant}, 0, version=2)
    assert STORAGE_KEY_V2 not in hass_storage


# --- Without the Recorder -----------------------------------------------------------------


async def test_without_recorder_meters_are_kept_and_only_verifiable_errors_refused(
    hass: HomeAssistant, hass_storage: dict
) -> None:
    hass.states.async_set("sensor.pv_energy", "120.5", KWH)
    hass.states.async_set("sensor.temperature", "21", {"device_class": "temperature", "state_class": "measurement", "unit_of_measurement": "°C"})
    hass.states.async_set("sensor.pv", "800", W)
    manager = await _manager(hass)

    result = await manager.async_save_profile(
        {"plant": _solar(_meter_device("solar-1", "sensor.pv_energy", "opower:pv", power="sensor.pv"))}, 0, version=2
    )
    report = result["energy_meters"]
    assert report["recorder"] == "unavailable"
    assert {key: value["status"] for key, value in report["meters"].items()} == {
        "sensor.pv_energy": "recorder_unavailable",
        "opower:pv": "recorder_unavailable",
    }
    # Realtime does not need the Recorder.
    assert (await async_energy_state(manager))["modules"]["solar"]["quantities"]["production_power"]["value"] == 800.0

    with pytest.raises(EnergyValidationError, match=r"sensor.temperature cannot be an energy meter \(incompatible_device_class\)"):
        await manager.async_save_profile(
            {"plant": _solar(_meter_device("solar-1", "sensor.temperature", power="sensor.pv"))}, 1, version=2
        )
    assert manager.profile_v2.revision == 1


async def test_a_power_only_profile_never_asks_the_recorder(
    recorder_mock: Any, hass: HomeAssistant, hass_storage: dict
) -> None:
    await async_setup_component(hass, "sensor", {})
    hass_storage[STORAGE_KEY] = _entry(STORAGE_KEY, V1)
    manager = await _manager(hass)

    with patch.object(meters, "_read_recorder", side_effect=meters._read_recorder) as read:
        profile = await manager.async_profile_result()
        await manager.async_save_profile({"modules": V1["modules"]}, 4)
        saved = await manager.async_save_profile(
            {"plant": _solar(_meter_device("solar-1", power="sensor.pv"))}, 5, version=2
        )
    read.assert_not_called()
    for result in (profile, saved):
        assert result["energy_meters"] == {"recorder": "available", "verification": "complete", "meters": {}, "plan": {}}
    assert profile["profile"]["modules"] == V1["modules"]


async def test_a_recorder_error_makes_meters_unverifiable_not_invalid(
    recorder_mock: Any, hass: HomeAssistant, hass_storage: dict
) -> None:
    hass.states.async_set("sensor.pv_energy", "120.5", KWH)
    manager = await _manager(hass)
    with patch.object(meters, "_read_recorder", side_effect=RuntimeError("database is locked")):
        result = await manager.async_save_profile(
            {"plant": _solar(_meter_device("solar-1", "sensor.pv_energy"))}, 0, version=2
        )
    assert result["energy_meters"]["recorder"] == "unavailable"
    assert result["energy_meters"]["meters"]["sensor.pv_energy"]["status"] == "recorder_unavailable"
    assert manager.profile_v2.revision == 1


# --- With the real Recorder -------------------------------------------------------------------


async def _recorded_installation(hass: HomeAssistant, freezer: FrozenDateTimeFactory) -> None:
    """Meters with compiled statistics, then some that change afterwards."""
    freezer.move_to(at(0))
    await async_setup_component(hass, "sensor", {})
    hass.states.async_set("sensor.import_kwh", "1520.4", KWH)
    hass.states.async_set("sensor.export_wh", "800", {**KWH, "state_class": "total", "unit_of_measurement": "Wh", "last_reset": at(0).isoformat()})
    hass.states.async_set("sensor.pv_mwh", "12.5", {**KWH, "unit_of_measurement": "MWh"})
    hass.states.async_set("sensor.zero_meter", "0", KWH)
    hass.states.async_set("sensor.power", "500", W)
    hass.states.async_set("sensor.temperature", "21", {"device_class": "temperature", "state_class": "measurement", "unit_of_measurement": "°C"})
    hass.states.async_set("sensor.energy_level", "4.2", {"device_class": "energy_storage", "state_class": "measurement", "unit_of_measurement": "kWh"})
    hass.states.async_set("sensor.gone", "10", KWH)
    hass.states.async_set("sensor.offline", "10", KWH)
    await async_wait_recording_done(hass)
    freezer.move_to(at(50))
    hass.states.async_set("sensor.import_kwh", "1521.0", KWH)
    await async_wait_recording_done(hass)
    await _compile_hour(hass, freezer)
    _add_external(hass, "opower:grid_import", [(8, 10.0, 10.0), (9, 12.5, 12.5)])
    await async_wait_recording_done(hass)

    # After the compilation: a new meter, and two that stopped reporting.
    hass.states.async_set("sensor.new_meter", "0.0", KWH)
    hass.states.async_set("sensor.no_state_class", "3", {"device_class": "energy", "unit_of_measurement": "kWh"})
    hass.states.async_remove("sensor.gone")
    hass.states.async_set("sensor.offline", "unavailable", KWH)
    await async_wait_recording_done(hass)


async def test_meter_statuses_come_from_the_recorder_in_one_read(
    recorder_mock: Any, hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    await _recorded_installation(hass, freezer)
    ids = {
        "sensor.import_kwh", "sensor.export_wh", "sensor.pv_mwh", "sensor.zero_meter", "sensor.new_meter",
        "sensor.power", "sensor.temperature", "sensor.energy_level", "sensor.no_state_class",
        "sensor.missing", "sensor.gone", "sensor.offline", "opower:grid_import", "opower:unknown",
    }

    with patch.object(meters, "_read_recorder", side_effect=meters._read_recorder) as read:
        report = await meters.EnergyMeterResolver(hass).async_resolve(ids)
    read.assert_called_once()
    statuses = {key: (info.status, info.reason) for key, info in report.meters.items()}
    assert report.recorder_available is True
    assert statuses == {
        # total_increasing and total, in kWh, Wh and MWh; a real 0 kWh is valid.
        "sensor.import_kwh": (MeterStatus.VALID, None),
        "sensor.export_wh": (MeterStatus.VALID, None),
        "sensor.pv_mwh": (MeterStatus.VALID, None),
        "sensor.zero_meter": (MeterStatus.VALID, None),
        # Suitable, compiled at the next period: never reported as invalid.
        "sensor.new_meter": (MeterStatus.PENDING, "awaiting_first_statistics"),
        "sensor.power": (MeterStatus.INCOMPATIBLE, "incompatible_device_class"),
        "sensor.temperature": (MeterStatus.INCOMPATIBLE, "incompatible_device_class"),
        "sensor.energy_level": (MeterStatus.INCOMPATIBLE, "incompatible_device_class"),
        "sensor.no_state_class": (MeterStatus.INCOMPATIBLE, "no_state_class"),
        "sensor.missing": (MeterStatus.UNKNOWN, "not_found"),
        # Valid statistics whose entity is gone or not reporting now.
        "sensor.gone": (MeterStatus.UNAVAILABLE, "entity_missing"),
        "sensor.offline": (MeterStatus.UNAVAILABLE, "state_unavailable"),
        "opower:grid_import": (MeterStatus.VALID, None),
        "opower:unknown": (MeterStatus.UNKNOWN, "not_found"),
    }
    imported = report.meters["sensor.export_wh"]
    assert (imported.source, imported.unit, imported.has_sum, imported.long_term, imported.entity_id) == (
        "recorder", "Wh", True, True, "sensor.export_wh",
    )
    external = report.meters["opower:grid_import"]
    assert (external.source, external.unit, external.has_sum, external.entity_id) == ("opower", "kWh", True, None)
    pending = report.meters["sensor.new_meter"]
    assert (pending.long_term, pending.has_sum, pending.unit) == (False, True, "kWh")


async def test_metadata_without_a_sum_or_an_energy_unit_is_incompatible(
    recorder_mock: Any, hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    # Declared without a device class, so only the statistics can tell.
    freezer.move_to(at(0))
    await async_setup_component(hass, "sensor", {})
    hass.states.async_set("sensor.kwh_measurement", "3", {"state_class": "measurement", "unit_of_measurement": "kWh"})
    hass.states.async_set("sensor.watts", "3", {"state_class": "total_increasing", "unit_of_measurement": "W"})
    await async_wait_recording_done(hass)
    report = await meters.EnergyMeterResolver(hass).async_resolve({"sensor.kwh_measurement", "sensor.watts"})
    assert report.meters["sensor.kwh_measurement"].reason == "no_sum"
    assert report.meters["sensor.watts"].reason == "not_energy_unit"

    await _compile_hour(hass, freezer)
    report = await meters.EnergyMeterResolver(hass).async_resolve({"sensor.kwh_measurement"})
    recorded = report.meters["sensor.kwh_measurement"]
    assert (recorded.status, recorded.reason, recorded.long_term) == (MeterStatus.INCOMPATIBLE, "no_sum", True)


async def test_saving_meters_keeps_v1_and_refuses_only_new_wrong_meters(
    recorder_mock: Any, hass: HomeAssistant, hass_storage: dict, freezer: FrozenDateTimeFactory
) -> None:
    await _recorded_installation(hass, freezer)
    hass.states.async_set("sensor.pv", "800", W)
    hass_storage[STORAGE_KEY] = _entry(STORAGE_KEY, V1)
    v1_before = json.dumps(hass_storage[STORAGE_KEY], sort_keys=True)
    manager = await _manager(hass)
    plant = {
        **_solar(_meter_device("solar-1", "sensor.pv_mwh", power="sensor.pv")),
        "grid": {"devices": [{"id": "grid-1", "energy": {
            "import_energy": ["sensor.import_kwh", "opower:grid_import"],
            "export_energy": ["sensor.new_meter"],
        }}]},
        "home": {"devices": [{"id": "home-1", "energy": {"consumption_energy": ["sensor.not_yet_created"]}}]},
    }

    result = await manager.async_save_profile({"plant": plant}, 4, version=2)

    statuses = {key: value["status"] for key, value in result["energy_meters"]["meters"].items()}
    assert statuses == {
        "opower:grid_import": "valid",
        "sensor.import_kwh": "valid",
        "sensor.new_meter": "pending",
        "sensor.not_yet_created": "unknown",
        "sensor.pv_mwh": "valid",
    }
    assert result["energy_meters"]["plan"]["grid"]["import_energy"]["review"] == ["multiple_parts"]
    assert json.dumps(hass_storage[STORAGE_KEY], sort_keys=True) == v1_before
    stored = hass_storage[STORAGE_KEY_V2]["data"]
    # Statuses are never stored: they change on their own in Home Assistant.
    assert "energy_meters" not in stored and "status" not in json.dumps(stored)
    assert stored["plant"]["grid"]["devices"][0]["energy"]["export_energy"] == ["sensor.new_meter"]

    wrong = copy.deepcopy(plant)
    wrong["home"]["devices"][0]["energy"]["consumption_energy"].append("sensor.power")
    with pytest.raises(EnergyValidationError, match=r"sensor.power cannot be an energy meter"):
        await manager.async_save_profile({"plant": wrong}, 5, version=2)

    # A meter that later turns incompatible does not block an unrelated edit.
    hass.states.async_set("sensor.pv_mwh", "1", W)
    renamed = copy.deepcopy(plant)
    renamed["solar"]["devices"][0]["name"] = "Tetto"
    result = await manager.async_save_profile({"plant": renamed}, 5, version=2)
    assert result["energy_meters"]["meters"]["sensor.pv_mwh"]["status"] == "incompatible"
    assert manager.profile_v2.revision == 6
    assert json.dumps(hass_storage[STORAGE_KEY], sort_keys=True) == v1_before

    before = json.dumps(hass_storage, sort_keys=True)
    read = await manager.async_profile_result()
    assert read["energy_meters"]["meters"]["sensor.new_meter"]["status"] == "pending"
    assert json.dumps(hass_storage, sort_keys=True) == before


async def test_meters_never_enter_the_realtime_balance(
    recorder_mock: Any, hass: HomeAssistant, hass_storage: dict
) -> None:
    hass.states.async_set("sensor.grid", "1000", W)
    hass.states.async_set("sensor.pv", "800", W)
    hass.states.async_set("sensor.pv_energy", "120.5", KWH)
    grid = {"devices": [{"id": "grid-1", "power": {"sensors": {"net_power": "sensor.grid"}, "sign_convention": "positive_import"}}]}
    states = []
    for solar in (
        _solar(_meter_device("solar-1", power="sensor.pv")),
        _solar(_meter_device("solar-1", "sensor.pv_energy", power="sensor.pv")),
    ):
        hass_storage[STORAGE_KEY_V2] = _entry(STORAGE_KEY_V2, {
            "schema": "domusos-energy-profile", "version": 2, "revision": 1, "updated_at": None,
            "migrated_from": None, "plant": {"grid": grid, **solar}, "tariff": None, "retired_device_ids": [],
        })
        manager = await _manager(hass)
        with patch.object(meters, "_read_recorder", side_effect=meters._read_recorder) as read:
            state = await async_energy_state(manager)
        read.assert_not_called()
        await manager.async_shutdown()
        states.append(state)

    with_meter, without_meter = states[1], states[0]
    for state in states:
        del state["observed_at"]
    assert with_meter == without_meter
    assert with_meter["home_consumption"]["value"] == 1800.0


async def test_statistics_semantics_the_history_will_rely_on(
    recorder_mock: Any, hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    """``change`` survives resets and unit changes; ``state`` does not; gaps have no row."""
    freezer.move_to(at(0))
    await async_setup_component(hass, "sensor", {})
    total = {**KWH, "state_class": "total", "last_reset": at(0).isoformat()}
    hass.states.async_set("sensor.increasing", "100", KWH)
    hass.states.async_set("sensor.total", "50", total)
    hass.states.async_set("sensor.wh", "1000", {**KWH, "unit_of_measurement": "Wh"})
    await async_wait_recording_done(hass)
    freezer.move_to(at(50))
    hass.states.async_set("sensor.increasing", "105", KWH)
    hass.states.async_set("sensor.wh", "2000", {**KWH, "unit_of_measurement": "Wh"})
    freezer.move_to(at(56))
    hass.states.async_set("sensor.increasing", "2", KWH)  # below 90%: a meter reset
    freezer.move_to(at(57))
    hass.states.async_set("sensor.total", "1", {**total, "last_reset": at(57).isoformat()})
    hass.states.async_set("sensor.wh", "2.5", KWH)  # same meter, now reported in kWh
    freezer.move_to(at(58))
    hass.states.async_set("sensor.increasing", "4", KWH)
    await async_wait_recording_done(hass)
    await _compile_hour(hass, freezer)
    _add_external(hass, "opower:grid_import", [(8, 10.0, 10.0), (9, 0.0, 10.0)])
    await async_wait_recording_done(hass)

    rows = await get_instance(hass).async_add_executor_job(
        recorder_statistics.statistics_during_period,
        hass, at(0, 8), None,
        {"sensor.increasing", "sensor.total", "sensor.wh", "opower:grid_import"},
        "hour", dict(meters.HISTORY_UNITS), {"state", "sum", meters.HISTORY_STATISTIC_TYPE},
    )
    values = {key: [(row.get("state"), row.get("change")) for row in value] for key, value in rows.items()}
    # After a reset the meter restarts from 0: 2 kWh, then 2 more.
    assert values["sensor.increasing"] == [(4.0, 4.0)]
    assert values["sensor.total"] == [(1.0, 1.0)]
    # 2000 Wh -> 2.5 kWh is 0.5 kWh, converted by Home Assistant.
    assert values["sensor.wh"] == [(2.5, 0.5)]
    # An external meter reading back to 0 is a state, not a negative energy;
    # hour 10 has no row at all, which is not 0 kWh.
    assert values["opower:grid_import"] == [(10.0, 10.0), (0.0, 0.0)]


class RecordedConnection:
    """The parts of ``ActiveConnection`` the Energy handlers use."""

    def __init__(self) -> None:
        self.user = MagicMock(is_admin=True)
        self.results: dict[int, Any] = {}
        self.errors: dict[int, tuple[str, str]] = {}

    def send_result(self, msg_id: int, result: Any = None) -> None:
        self.results[msg_id] = result

    def send_error(self, msg_id: int, code: str, message: str, *_: Any, **__: Any) -> None:
        self.errors[msg_id] = (code, message)


async def test_websocket_contract_adds_meters_and_tells_errors_from_waiting(
    hass: HomeAssistant, hass_storage: dict
) -> None:
    hass.states.async_set("sensor.pv_energy", "120.5", KWH)
    hass.states.async_set("sensor.pv_power", "800", W)
    manager = await _manager(hass)
    hass.data.setdefault(DOMAIN, {})["energy_manager"] = manager
    connection = RecordedConnection()

    async def call(handler: Any, msg: dict[str, Any]) -> None:
        handler(hass, connection, msg)
        await hass.async_block_till_done(wait_background_tasks=True)

    plant = _solar(_meter_device("solar-1", "sensor.pv_energy"))
    await call(websocket_save_profile, {"id": 1, "profile_v2": {"plant": plant}, "expected_revision": 0})
    await call(websocket_get_profile, {"id": 2})
    await call(websocket_save_profile, {"id": 3, "profile_v2": {"plant": _solar(_meter_device("solar-1", "sensor.pv_power"))}, "expected_revision": 1})

    # Not verifiable now is a status of a saved profile, not an error.
    for result in (connection.results[1], connection.results[2]):
        assert result["energy_meters"]["meters"]["sensor.pv_energy"]["status"] == "recorder_unavailable"
        assert result["energy_meters"]["plan"]["solar"]["production_energy"]["source"] == "devices"
        assert result["profile_v2"]["revision"] == 1
    # A verifiably wrong meter is an invalid profile, with the reason.
    code, message = connection.errors[3]
    assert code == "invalid_profile"
    assert message == "sensor.pv_power cannot be an energy meter (incompatible_device_class)"
    await manager.async_shutdown()
