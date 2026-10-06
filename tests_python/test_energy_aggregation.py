"""Realtime multi-device support: device adapters and module aggregation.

Profiles go through the real Store (``hass_storage``) and the manager, and the
assertions read ``get_state`` exactly as the websocket command returns it.
"""

import itertools
import json
from collections.abc import Mapping
from datetime import timedelta
from typing import Any
from unittest.mock import patch

import pytest
from freezegun.api import FrozenDateTimeFactory
from homeassistant.core import HomeAssistant, StateMachine
from homeassistant.util import dt as dt_util

from custom_components.domusos.energy.adapter import EnergyModuleAdapter, derive_home_consumption
from custom_components.domusos.energy.context import async_energy_state
from custom_components.domusos.energy.manager import EnergyProfileManager
from custom_components.domusos.energy.models import (
    STORAGE_KEY,
    EnergyModule,
    ModuleStatus,
    parse_stored_profile,
)
from custom_components.domusos.energy.profile_v2 import STORAGE_KEY_V2
from custom_components.domusos.energy.tariff import tariff_state

W = {"device_class": "power", "state_class": "measurement", "unit_of_measurement": "W"}
KW = {**W, "unit_of_measurement": "kW"}
SOC = {"device_class": "battery", "unit_of_measurement": "%"}
A0_QUANTITY_KEYS = {"status", "value", "unit", "source", "entity_ids", "reason", "freshness", "reported_at", "stale_after"}
A0_MODULE_KEYS = {"status", "complete", "freshness", "sign_convention", "quantities"}


def _document_v2(plant: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema": "domusos-energy-profile",
        "version": 2,
        "revision": 1,
        "updated_at": None,
        "migrated_from": None,
        "plant": plant,
        "tariff": None,
        "retired_device_ids": [],
    }


def _entry(key: str, data: dict[str, Any]) -> dict[str, Any]:
    return {"version": 1, "minor_version": 1, "key": key, "data": data}


async def _state(hass: HomeAssistant, storage: dict, plant: dict[str, Any]) -> dict[str, Any]:
    storage[STORAGE_KEY_V2] = _entry(STORAGE_KEY_V2, _document_v2(plant))
    manager = EnergyProfileManager(hass)
    await manager.async_setup()
    try:
        return await async_energy_state(manager)
    finally:
        await manager.async_shutdown()


def _devices(module: str, *powers: dict[str, Any], **extra: Any) -> dict[str, Any]:
    """One device per power config, with ids ``<module>-1``, ``<module>-2``..."""
    return {
        "devices": [
            {"id": f"{module}-{index}", "power": power, **extra.get(f"{module}-{index}", {})}
            for index, power in enumerate(powers, 1)
        ]
    }


def _sensor(role: str, entity_id: str, convention: str | None = None) -> dict[str, Any]:
    power: dict[str, Any] = {"sensors": {role: entity_id}}
    if convention:
        power["sign_convention"] = convention
    return power


def _inverters(*entity_ids: str) -> dict[str, Any]:
    return _devices("solar", *(_sensor("production_power", entity_id) for entity_id in entity_ids))


def _quantity(state: dict[str, Any], module: str, name: str) -> dict[str, Any]:
    return state["modules"][module]["quantities"][name]


# --- One device: the A0 behaviour --------------------------------------------------------


async def test_one_inverter_is_exactly_the_a0_module(
    hass: HomeAssistant, hass_storage: dict, freezer: FrozenDateTimeFactory
) -> None:
    hass.states.async_set("sensor.pv", "2.5", KW)
    state = await _state(hass, hass_storage, {"solar": _inverters("sensor.pv")})

    reference = EnergyModuleAdapter(hass, parse_stored_profile(
        {"schema": "domusos-energy-profile", "version": 1, "revision": 1, "updated_at": None,
         "modules": {"solar": {"sensors": {"production_power": "sensor.pv"}}}}
    ).modules[EnergyModule.SOLAR]).read()
    solar = state["modules"]["solar"]
    production = solar["quantities"]["production_power"]
    expected = dict(reference.values["quantities"]["production_power"])
    assert {key: production[key] for key in A0_QUANTITY_KEYS} == {**expected, "entity_ids": list(expected["entity_ids"])}
    assert production["value"] == 2500.0
    assert production["source"] == "measured"
    assert (production["origin"], production["partial_value"], production["coverage"]) == (
        "device", None, {"contributing": 1, "configured": 1},
    )
    assert {key: solar[key] for key in A0_MODULE_KEYS - {"quantities"}} == {
        key: reference.values[key] for key in A0_MODULE_KEYS - {"quantities"}
    }
    assert solar["devices"][0]["device_id"] == "solar-1"
    assert solar["total"] is None


# --- Several devices --------------------------------------------------------------------------


async def test_two_inverters_are_summed_after_normalization(hass: HomeAssistant, hass_storage: dict) -> None:
    hass.states.async_set("sensor.inv1", "2500", W)
    hass.states.async_set("sensor.inv2", "1.8", KW)
    state = await _state(hass, hass_storage, {"solar": _inverters("sensor.inv1", "sensor.inv2")})

    production = _quantity(state, "solar", "production_power")
    assert production["status"] == "ok"
    assert production["value"] == 4300.0
    # Domus computed it, from measured values.
    assert production["source"] == "derived"
    assert production["origin"] == "devices_sum"
    assert production["coverage"] == {"contributing": 2, "configured": 2}
    assert production["entity_ids"] == ["sensor.inv1", "sensor.inv2"]
    assert production["stale_after"] == 1800.0
    devices = state["modules"]["solar"]["devices"]
    assert [(d["device_id"], d["quantities"]["production_power"]["value"]) for d in devices] == [
        ("solar-1", 2500.0),
        ("solar-2", 1800.0),
    ]
    assert state["modules"]["solar"]["complete"] is True


async def test_three_inverters_with_one_unavailable_are_partial_not_a_total(
    hass: HomeAssistant, hass_storage: dict
) -> None:
    hass.states.async_set("sensor.inv1", "2000", W)
    hass.states.async_set("sensor.inv2", "1500", W)
    hass.states.async_set("sensor.inv3", "unavailable", W)
    hass.states.async_set("sensor.grid", "500", W)
    plant = {
        "solar": _inverters("sensor.inv1", "sensor.inv2", "sensor.inv3"),
        "grid": _devices("grid", _sensor("net_power", "sensor.grid", "positive_import")),
    }
    state = await _state(hass, hass_storage, plant)

    production = _quantity(state, "solar", "production_power")
    assert production["status"] == "unavailable"
    assert production["value"] is None
    assert production["partial_value"] == 3500.0
    assert production["coverage"] == {"contributing": 2, "configured": 3}
    assert production["reason"] == "partial_devices"
    assert production["entity_ids"] == ["sensor.inv1", "sensor.inv2", "sensor.inv3"]
    solar = state["modules"]["solar"]
    assert solar["status"] == "online"
    assert solar["complete"] is False
    assert solar["devices"][2]["status"] == "offline"
    assert solar["devices"][2]["reason"] == "sensors_unavailable"
    assert solar["devices"][2]["quantities"]["production_power"]["reason"] == "state_unavailable"
    # The home balance is never computed from a partial total.
    assert state["home_consumption"]["status"] == "unavailable"
    assert state["home_consumption"]["value"] is None


async def test_unknown_and_invalid_devices_keep_their_reasons(hass: HomeAssistant, hass_storage: dict) -> None:
    hass.states.async_set("sensor.inv1", "2000", W)
    hass.states.async_set("sensor.inv2", "unknown", W)
    hass.states.async_set("sensor.inv3", "12.5", {**W, "unit_of_measurement": "kWh"})
    state = await _state(hass, hass_storage, {"solar": _inverters("sensor.inv1", "sensor.inv2", "sensor.inv3")})

    production = _quantity(state, "solar", "production_power")
    # An invalid device outranks an unavailable one, as in the A0 balance.
    assert production["status"] == "invalid"
    assert production["reason"] == "partial_devices"
    assert production["partial_value"] == 2000.0
    assert production["coverage"] == {"contributing": 1, "configured": 3}
    reasons = [d["quantities"]["production_power"]["reason"] for d in state["modules"]["solar"]["devices"]]
    assert reasons == [None, "state_unknown", "cumulative_energy"]


async def test_real_zero_and_night_noise_are_summed_as_zero(hass: HomeAssistant, hass_storage: dict) -> None:
    hass.states.async_set("sensor.inv1", "0", W)
    hass.states.async_set("sensor.inv2", "-20", W)
    state = await _state(hass, hass_storage, {"solar": _inverters("sensor.inv1", "sensor.inv2")})

    production = _quantity(state, "solar", "production_power")
    assert (production["status"], production["value"]) == ("ok", 0.0)
    assert production["coverage"] == {"contributing": 2, "configured": 2}


async def test_a_module_with_every_device_offline_is_offline(hass: HomeAssistant, hass_storage: dict) -> None:
    hass.states.async_set("sensor.inv1", "unavailable", W)
    state = await _state(hass, hass_storage, {"solar": _inverters("sensor.inv1", "sensor.missing")})

    production = _quantity(state, "solar", "production_power")
    assert state["modules"]["solar"]["status"] == "offline"
    assert state["offline_modules"] == ["solar"]
    assert production["status"] == "unavailable"
    assert production["reason"] == "source_unavailable"
    assert production["partial_value"] is None
    assert production["coverage"] == {"contributing": 0, "configured": 2}
    assert state["modules"]["solar"]["freshness"] is None


async def test_a_stale_device_keeps_the_sum_and_marks_it_stale(
    hass: HomeAssistant, hass_storage: dict, freezer: FrozenDateTimeFactory
) -> None:
    hass.states.async_set("sensor.inv1", "1000", W)
    reported = dt_util.utcnow()
    freezer.tick(timedelta(minutes=40))
    hass.states.async_set("sensor.inv2", "500", W)
    state = await _state(hass, hass_storage, {"solar": _inverters("sensor.inv1", "sensor.inv2")})

    production = _quantity(state, "solar", "production_power")
    assert (production["status"], production["value"]) == ("ok", 1500.0)
    assert production["freshness"] == "stale"
    assert production["reported_at"] == reported.isoformat()
    assert state["modules"]["solar"]["freshness"] == "stale"
    freshness = [d["freshness"] for d in state["modules"]["solar"]["devices"]]
    assert freshness == ["stale", "fresh"]


async def test_a_device_with_meters_only_is_never_counted_as_zero(hass: HomeAssistant, hass_storage: dict) -> None:
    hass.states.async_set("sensor.inv1", "2000", W)
    plant = {"solar": {"devices": [
        {"id": "solar-1", "power": _sensor("production_power", "sensor.inv1")},
        {"id": "solar-2", "name": "Garage", "energy": {"production_energy": ["sensor.inv2_energy"]}},
    ]}}
    state = await _state(hass, hass_storage, plant)

    production = _quantity(state, "solar", "production_power")
    assert production["status"] == "not_measured"
    assert production["value"] is None
    assert production["partial_value"] == 2000.0
    assert production["coverage"] == {"contributing": 1, "configured": 2}
    garage = state["modules"]["solar"]["devices"][1]
    assert (garage["name"], garage["status"], garage["reason"]) == ("Garage", "not_measured", "no_power_sensors")
    assert state["modules"]["solar"]["complete"] is False


# --- Totals --------------------------------------------------------------------------------


def _with_total(entity_id: str) -> dict[str, Any]:
    return {
        **_inverters("sensor.inv1", "sensor.inv2"),
        "total": {"power": _sensor("production_power", entity_id)},
    }


async def test_a_total_is_authoritative_and_never_added_to_the_devices(
    hass: HomeAssistant, hass_storage: dict
) -> None:
    hass.states.async_set("sensor.inv1", "2500", W)
    hass.states.async_set("sensor.inv2", "1800", W)
    hass.states.async_set("sensor.pv_total", "4400", W)
    state = await _state(hass, hass_storage, {"solar": _with_total("sensor.pv_total")})

    production = _quantity(state, "solar", "production_power")
    assert (production["value"], production["source"], production["origin"]) == (4400.0, "measured", "total")
    assert production["entity_ids"] == ["sensor.pv_total"]
    assert production["coverage"] is None
    solar = state["modules"]["solar"]
    assert [d["quantities"]["production_power"]["value"] for d in solar["devices"]] == [2500.0, 1800.0]
    assert solar["total"]["status"] == "online"
    assert solar["total"]["quantities"]["production_power"]["value"] == 4400.0


async def test_an_offline_device_does_not_invalidate_a_valid_total(hass: HomeAssistant, hass_storage: dict) -> None:
    hass.states.async_set("sensor.inv1", "2500", W)
    hass.states.async_set("sensor.inv2", "unavailable", W)
    hass.states.async_set("sensor.pv_total", "4400", W)
    state = await _state(hass, hass_storage, {"solar": _with_total("sensor.pv_total")})

    production = _quantity(state, "solar", "production_power")
    assert (production["status"], production["value"]) == ("ok", 4400.0)
    assert state["modules"]["solar"]["devices"][1]["status"] == "offline"
    # Not every configured sensor reports, which the detail shows.
    assert state["modules"]["solar"]["complete"] is False


@pytest.mark.parametrize(
    ("total_state", "status", "reason"),
    [("unavailable", "unavailable", "total_unavailable"), ("-900", "invalid", "total_invalid")],
)
async def test_a_total_that_is_not_valid_is_shown_as_such_without_fallback(
    hass: HomeAssistant, hass_storage: dict, total_state: str, status: str, reason: str
) -> None:
    hass.states.async_set("sensor.inv1", "2500", W)
    hass.states.async_set("sensor.inv2", "1800", W)
    hass.states.async_set("sensor.pv_total", total_state, W)
    state = await _state(hass, hass_storage, {"solar": _with_total("sensor.pv_total")})

    production = _quantity(state, "solar", "production_power")
    assert (production["status"], production["value"], production["reason"]) == (status, None, reason)
    assert production["partial_value"] is None
    # The devices are still there, valid, for the detail.
    assert [d["quantities"]["production_power"]["value"] for d in state["modules"]["solar"]["devices"]] == [2500.0, 1800.0]
    assert state["modules"]["solar"]["status"] == "online"


async def test_a_battery_total_without_charge_level_leaves_it_to_the_devices(
    hass: HomeAssistant, hass_storage: dict
) -> None:
    for entity_id, value in (("sensor.b1_soc", "80"), ("sensor.b2_soc", "40")):
        hass.states.async_set(entity_id, value, SOC)
    hass.states.async_set("sensor.bat_total", "-700", W)
    plant = {"battery": {
        "devices": [
            {"id": "battery-1", "power": _sensor("state_of_charge", "sensor.b1_soc"), "capacity": {"usable_kwh": 10}},
            {"id": "battery-2", "power": _sensor("state_of_charge", "sensor.b2_soc"), "capacity": {"usable_kwh": 5}},
        ],
        "total": {"power": _sensor("net_power", "sensor.bat_total", "positive_discharge")},
    }}
    state = await _state(hass, hass_storage, plant)

    assert _quantity(state, "battery", "net_power")["value"] == -700.0
    assert _quantity(state, "battery", "net_power")["origin"] == "total"
    assert _quantity(state, "battery", "charge_power")["value"] == 700.0
    soc = _quantity(state, "battery", "state_of_charge")
    assert (soc["value"], soc["origin"]) == (66.667, "devices_weighted_usable")


# --- Batteries -------------------------------------------------------------------------------


def _two_batteries(capacity_1: dict | None, capacity_2: dict | None) -> dict[str, Any]:
    extra = {}
    if capacity_1:
        extra["battery-1"] = {"capacity": capacity_1}
    if capacity_2:
        extra["battery-2"] = {"capacity": capacity_2}
    return {"battery": _devices(
        "battery",
        {"sensors": {"state_of_charge": "sensor.b1_soc", "net_power": "sensor.b1"}, "sign_convention": "positive_discharge"},
        {"sensors": {"state_of_charge": "sensor.b2_soc", "net_power": "sensor.b2"}, "sign_convention": "positive_charge"},
        **extra,
    )}


def _set_batteries(hass: HomeAssistant, soc_1: str = "80", soc_2: str = "40") -> None:
    hass.states.async_set("sensor.b1_soc", soc_1, SOC)
    hass.states.async_set("sensor.b2_soc", soc_2, SOC)
    # Battery 1 discharges 1 kW, battery 2 (positive = charge) charges 400 W.
    hass.states.async_set("sensor.b1", "1000", W)
    hass.states.async_set("sensor.b2", "400", W)


async def test_batteries_with_different_sign_conventions_add_up_canonically(
    hass: HomeAssistant, hass_storage: dict
) -> None:
    _set_batteries(hass)
    state = await _state(hass, hass_storage, _two_batteries({"usable_kwh": 10}, {"usable_kwh": 5}))

    # Discharge counts towards the home, charge against it.
    assert _quantity(state, "battery", "net_power")["value"] == 600.0
    assert _quantity(state, "battery", "discharge_power")["value"] == 1000.0
    assert _quantity(state, "battery", "charge_power")["value"] == 400.0
    battery = state["modules"]["battery"]
    assert battery["sign_convention"] is None
    assert [d["sign_convention"] for d in battery["devices"]] == ["positive_discharge", "positive_charge"]
    assert [d["quantities"]["net_power"]["value"] for d in battery["devices"]] == [1000.0, -400.0]


@pytest.mark.parametrize(
    ("capacity_1", "capacity_2", "origin"),
    [
        ({"usable_kwh": 10}, {"usable_kwh": 5}, "devices_weighted_usable"),
        # Usable missing on one battery: nominal for both, never a mix.
        ({"nominal_kwh": 10, "usable_kwh": 9.5}, {"nominal_kwh": 5}, "devices_weighted_nominal"),
    ],
)
async def test_state_of_charge_is_weighted_by_capacity(
    hass: HomeAssistant, hass_storage: dict, capacity_1: dict, capacity_2: dict, origin: str
) -> None:
    _set_batteries(hass)
    state = await _state(hass, hass_storage, _two_batteries(capacity_1, capacity_2))

    soc = _quantity(state, "battery", "state_of_charge")
    assert (soc["status"], soc["value"], soc["unit"]) == ("ok", 66.667, "%")
    assert (soc["source"], soc["origin"]) == ("derived", origin)
    assert soc["stale_after"] == 10800.0


@pytest.mark.parametrize(
    ("capacity_1", "capacity_2"),
    [(None, {"usable_kwh": 5}), ({"usable_kwh": 9}, {"nominal_kwh": 5})],
)
async def test_unknown_capacity_gives_no_aggregate_but_keeps_each_battery(
    hass: HomeAssistant, hass_storage: dict, capacity_1: dict | None, capacity_2: dict
) -> None:
    _set_batteries(hass)
    state = await _state(hass, hass_storage, _two_batteries(capacity_1, capacity_2))

    soc = _quantity(state, "battery", "state_of_charge")
    assert (soc["status"], soc["value"], soc["reason"]) == ("not_measured", None, "capacity_unknown")
    assert soc["coverage"] == {"contributing": 2, "configured": 2}
    individual = [d["quantities"]["state_of_charge"]["value"] for d in state["modules"]["battery"]["devices"]]
    assert individual == [80.0, 40.0]
    # Power does not depend on capacity.
    assert _quantity(state, "battery", "net_power")["value"] == 600.0


async def test_one_battery_without_charge_level_leaves_no_average(hass: HomeAssistant, hass_storage: dict) -> None:
    _set_batteries(hass, soc_2="unavailable")
    state = await _state(hass, hass_storage, _two_batteries({"usable_kwh": 10}, {"usable_kwh": 5}))

    soc = _quantity(state, "battery", "state_of_charge")
    assert (soc["status"], soc["reason"]) == ("unavailable", "partial_devices")
    # An average of some batteries is not shown, not even as partial.
    assert soc["value"] is None and soc["partial_value"] is None
    assert soc["coverage"] == {"contributing": 1, "configured": 2}
    assert state["modules"]["battery"]["devices"][0]["quantities"]["state_of_charge"]["value"] == 80.0


# --- Wallboxes and the home balance ------------------------------------------------------------


async def test_two_wallboxes_are_summed_and_never_added_to_the_home(hass: HomeAssistant, hass_storage: dict) -> None:
    hass.states.async_set("sensor.wb1", "7400", W)
    hass.states.async_set("sensor.wb2", "3.7", KW)
    hass.states.async_set("sensor.grid", "12000", W)
    plant = {
        "grid": _devices("grid", _sensor("net_power", "sensor.grid", "positive_import")),
        "wallbox": {"devices": [
            {"id": "wallbox-1", "name": "Garage", "power": _sensor("charging_power", "sensor.wb1")},
            {"id": "wallbox-2", "name": "Cortile", "power": _sensor("charging_power", "sensor.wb2")},
        ]},
    }
    state = await _state(hass, hass_storage, plant)

    assert _quantity(state, "wallbox", "charging_power")["value"] == 11100.0
    names = [(d["name"], d["quantities"]["charging_power"]["value"]) for d in state["modules"]["wallbox"]["devices"]]
    assert names == [("Garage", 7400.0), ("Cortile", 3700.0)]
    # Behind the meter: the grid already includes the wallboxes.
    assert (state["home_consumption"]["status"], state["home_consumption"]["value"]) == ("ok", 12000.0)


def _full_plant() -> dict[str, Any]:
    return {
        # Positive = export: 1 kW leaving the home.
        "grid": _devices("grid", _sensor("net_power", "sensor.grid", "positive_export")),
        "solar": _inverters("sensor.inv1", "sensor.inv2"),
        **_two_batteries({"usable_kwh": 10}, {"usable_kwh": 5}),
    }


def _set_full_plant(hass: HomeAssistant, inverter_2: str = "1000") -> None:
    hass.states.async_set("sensor.grid", "1000", W)
    hass.states.async_set("sensor.inv1", "3000", W)
    hass.states.async_set("sensor.inv2", inverter_2, W)
    _set_batteries(hass)


async def test_complete_balance_uses_the_aggregated_flows_once(hass: HomeAssistant, hass_storage: dict) -> None:
    _set_full_plant(hass)
    state = await _state(hass, hass_storage, _full_plant())

    grid = state["modules"]["grid"]["quantities"]
    assert (grid["net_power"]["value"], grid["import_power"]["value"], grid["export_power"]["value"]) == (-1000.0, 0.0, 1000.0)
    home = state["home_consumption"]
    # -1000 (export) + 4000 (two inverters) + 600 (batteries) = 3600 W.
    assert (home["status"], home["value"], home["source"]) == ("ok", 3600.0, "derived")
    assert home["entity_ids"] == ["sensor.grid", "sensor.inv1", "sensor.inv2", "sensor.b1", "sensor.b2"]


async def test_balance_with_an_incomplete_module_is_not_computed(hass: HomeAssistant, hass_storage: dict) -> None:
    _set_full_plant(hass, inverter_2="unavailable")
    state = await _state(hass, hass_storage, _full_plant())

    home = state["home_consumption"]
    assert (home["status"], home["value"], home["reason"]) == ("unavailable", None, "source_unavailable")


async def test_a_direct_home_meter_keeps_precedence_and_has_no_fallback(
    hass: HomeAssistant, hass_storage: dict
) -> None:
    _set_full_plant(hass)
    hass.states.async_set("sensor.panel_a", "2000", W)
    hass.states.async_set("sensor.panel_b", "unavailable", W)
    plant = {
        **_full_plant(),
        "home": _devices(
            "home",
            _sensor("consumption_power", "sensor.panel_a"),
            _sensor("consumption_power", "sensor.panel_b"),
        ),
    }
    state = await _state(hass, hass_storage, plant)

    home = state["home_consumption"]
    # Not the 3600 W balance: the measured home wins, and a gap stays a gap.
    assert (home["status"], home["value"]) == ("unavailable", None)
    assert home["entity_ids"] == ["sensor.panel_a", "sensor.panel_b"]

    hass.states.async_set("sensor.panel_b", "1500", W)
    state = await _state(hass, hass_storage, plant)
    assert (state["home_consumption"]["status"], state["home_consumption"]["value"]) == ("ok", 3500.0)


async def test_grid_meters_with_both_directions_keep_import_and_export_apart(
    hass: HomeAssistant, hass_storage: dict
) -> None:
    # Two supply points: one imports 300 W, the other exports 200 W.
    hass.states.async_set("sensor.grid_a", "300", W)
    hass.states.async_set("sensor.grid_b_in", "0", W)
    hass.states.async_set("sensor.grid_b_out", "200", W)
    plant = {"grid": _devices(
        "grid",
        _sensor("net_power", "sensor.grid_a", "positive_import"),
        {"sensors": {"import_power": "sensor.grid_b_in", "export_power": "sensor.grid_b_out"}},
    )}
    state = await _state(hass, hass_storage, plant)

    grid = state["modules"]["grid"]["quantities"]
    assert grid["net_power"]["value"] == 100.0
    assert grid["import_power"]["value"] == 300.0
    assert grid["export_power"]["value"] == 200.0


# --- Contract, efficiency and v1 profiles -----------------------------------------------------


async def test_multi_device_state_keeps_the_a0_shape(
    hass: HomeAssistant, hass_storage: dict, freezer: FrozenDateTimeFactory
) -> None:
    _set_full_plant(hass, inverter_2="unavailable")
    hass_storage[STORAGE_KEY_V2] = _entry(STORAGE_KEY_V2, _document_v2(_full_plant()))
    before = json.dumps(hass_storage, sort_keys=True)
    manager = EnergyProfileManager(hass)
    await manager.async_setup()
    state = await async_energy_state(manager)
    await manager.async_shutdown()

    # Reading never writes the profile.
    assert json.dumps(hass_storage, sort_keys=True) == before
    json.dumps(state)
    assert isinstance(state["configured"], bool) and isinstance(state["profile_revision"], int)
    assert isinstance(state["absent_modules"], list) and isinstance(state["modules"], dict)
    for module in state["modules"].values():
        assert A0_MODULE_KEYS <= set(module)
        assert module["status"] in {"online", "offline"}
        assert isinstance(module["complete"], bool)
        for quantity in module["quantities"].values():
            assert A0_QUANTITY_KEYS <= set(quantity)
            assert quantity["status"] in {"ok", "unavailable", "invalid", "not_measured"}
            assert isinstance(quantity["entity_ids"], list)
            # Never a value next to a status that says there is none.
            assert quantity["value"] is None or quantity["status"] == "ok"


async def test_each_sensor_is_read_once_per_projection_even_with_sixteen_devices(
    hass: HomeAssistant, hass_storage: dict
) -> None:
    inverters = [f"sensor.inv{index}" for index in range(16)]
    for entity_id in inverters:
        hass.states.async_set(entity_id, "100", W)
    _set_batteries(hass)
    hass_storage[STORAGE_KEY_V2] = _entry(STORAGE_KEY_V2, _document_v2({
        "solar": _inverters(*inverters),
        **_two_batteries({"usable_kwh": 10}, {"usable_kwh": 5}),
    }))
    manager = EnergyProfileManager(hass)
    await manager.async_setup()
    original = StateMachine.get

    with patch.object(StateMachine, "get", autospec=True, side_effect=original) as get:
        state = await async_energy_state(manager)
    read = [call.args[1] for call in get.call_args_list]
    assert sorted(read) == sorted(manager.adapters[EnergyModule.SOLAR].entity_ids + manager.adapters[EnergyModule.BATTERY].entity_ids)
    assert _quantity(state, "solar", "production_power")["value"] == 1600.0

    # A battery update re-reads the battery only, not the sixteen inverters.
    with patch.object(StateMachine, "get", autospec=True, side_effect=original) as get:
        hass.states.async_set("sensor.b1", "unavailable", W)
        await hass.async_block_till_done()
    assert {call.args[1] for call in get.call_args_list} <= set(manager.adapters[EnergyModule.BATTERY].entity_ids)
    assert manager.module_status[EnergyModule.BATTERY] is ModuleStatus.ONLINE
    await manager.async_shutdown()


async def test_module_status_follows_the_aggregated_devices(hass: HomeAssistant, hass_storage: dict) -> None:
    hass.states.async_set("sensor.inv1", "100", W)
    hass.states.async_set("sensor.inv2", "100", W)
    hass_storage[STORAGE_KEY_V2] = _entry(STORAGE_KEY_V2, _document_v2({"solar": _inverters("sensor.inv1", "sensor.inv2")}))
    manager = EnergyProfileManager(hass)
    await manager.async_setup()
    changes: list[str] = []
    manager.async_add_listener(changes.append)

    hass.states.async_set("sensor.inv1", "unavailable", W)
    await hass.async_block_till_done()
    assert changes == []
    hass.states.async_set("sensor.inv2", "unavailable", W)
    await hass.async_block_till_done()
    assert changes == ["availability"]
    assert manager.module_status[EnergyModule.SOLAR] is ModuleStatus.OFFLINE
    await manager.async_shutdown()


GRID_VARIANTS = (
    {"sensors": {"net_power": "sensor.grid"}, "sign_convention": "positive_import"},
    {"sensors": {"net_power": "sensor.grid"}, "sign_convention": "positive_export"},
    {"sensors": {"import_power": "sensor.grid_in", "export_power": "sensor.grid_out"}},
    {"sensors": {"import_power": "sensor.grid_in"}},
    None,
)
BATTERY_VARIANTS = (
    {"sensors": {"state_of_charge": "sensor.soc", "net_power": "sensor.bat"}, "sign_convention": "positive_discharge"},
    {"sensors": {"state_of_charge": "sensor.soc", "net_power": "sensor.bat"}, "sign_convention": "positive_charge"},
    {"sensors": {"charge_power": "sensor.bat_in", "discharge_power": "sensor.bat_out"}},
    {"sensors": {"state_of_charge": "sensor.soc"}},
    None,
)
SCENARIOS = {
    "valid": {},
    "some unavailable": {"sensor.pv": "unavailable", "sensor.bat": "unknown", "sensor.grid_out": "unavailable"},
    "some invalid": {"sensor.grid": "abc", "sensor.soc": "120", "sensor.home": "-300"},
}


def _v1_profiles() -> list[dict[str, Any]]:
    profiles = []
    for grid, battery, solar, home, wallbox in itertools.product(
        GRID_VARIANTS, BATTERY_VARIANTS, (True, False), (True, False), (True, False)
    ):
        modules: dict[str, Any] = {}
        if grid:
            modules["grid"] = grid
        if solar:
            modules["solar"] = {"sensors": {"production_power": "sensor.pv"}}
        if home:
            modules["home"] = {"sensors": {"consumption_power": "sensor.home"}}
        if battery:
            modules["battery"] = battery
        if wallbox:
            modules["wallbox"] = {"sensors": {"charging_power": "sensor.wb"}}
        profiles.append(modules)
    return profiles


def _a0_reference(hass: HomeAssistant, document: dict[str, Any]) -> dict[str, Any]:
    """``get_state`` as A0 computed it: one module adapter per v1 module."""
    profile = parse_stored_profile(document)
    states = {module: EnergyModuleAdapter(hass, config).read() for module, config in profile.modules.items()}
    tariff = tariff_state(profile.tariff, dt_util.now())
    if not states:
        return {
            "configured": False, "load_error": False, "available": False, "profile_revision": profile.revision,
            "observed_at": dt_util.utcnow().isoformat(), "modules": {},
            "absent_modules": [module.value for module in EnergyModule], "offline_modules": [],
            "home_consumption": None, "tariff": tariff,
        }
    return _thaw({
        "configured": True, "load_error": False, "tariff": tariff,
        "available": any(state.available for state in states.values()),
        "profile_revision": profile.revision, "observed_at": dt_util.utcnow().isoformat(),
        "modules": {module.value: {key: state.values[key] for key in A0_MODULE_KEYS} for module, state in states.items()},
        "absent_modules": [module.value for module in profile.absent_modules],
        "offline_modules": [module.value for module, state in states.items() if state.values["status"] == ModuleStatus.OFFLINE],
        "home_consumption": derive_home_consumption(states).as_dict(),
    })


def _thaw(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {key: _thaw(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_thaw(item) for item in value]
    return value


def _a0_view(state: dict[str, Any]) -> dict[str, Any]:
    view = {key: value for key, value in state.items() if key != "unsupported_modules"}
    view["modules"] = {
        module: {
            **{key: value for key, value in values.items() if key in A0_MODULE_KEYS},
            "quantities": {
                name: {key: value for key, value in quantity.items() if key in A0_QUANTITY_KEYS}
                for name, quantity in values["quantities"].items()
            },
        }
        for module, values in state["modules"].items()
    }
    return view


@pytest.mark.parametrize("scenario", SCENARIOS)
async def test_every_v1_profile_keeps_its_a0_state(
    hass: HomeAssistant, hass_storage: dict, freezer: FrozenDateTimeFactory, scenario: str
) -> None:
    values = {
        "sensor.grid": "-420", "sensor.grid_in": "0", "sensor.grid_out": "420", "sensor.pv": "5200",
        "sensor.home": "900", "sensor.soc": "68", "sensor.bat": "1600", "sensor.bat_in": "0",
        "sensor.bat_out": "1600", "sensor.wb": "0",
    } | SCENARIOS[scenario]
    for entity_id, value in values.items():
        hass.states.async_set(entity_id, value, SOC if entity_id == "sensor.soc" else W)

    profiles = _v1_profiles()
    assert len(profiles) == 200
    for revision, modules in enumerate(profiles, 1):
        document = {"schema": "domusos-energy-profile", "version": 1, "revision": revision,
                    "updated_at": None, "modules": modules, "tariff": None}
        hass_storage.clear()
        hass_storage[STORAGE_KEY] = _entry(STORAGE_KEY, document)
        manager = EnergyProfileManager(hass)
        await manager.async_setup()
        state = await async_energy_state(manager)
        await manager.async_shutdown()

        assert _a0_view(state) == _a0_reference(hass, document), modules
        assert state["unsupported_modules"] == {}
        for module in state["modules"].values():
            assert len(module["devices"]) == 1 and module["total"] is None
        assert STORAGE_KEY_V2 not in hass_storage
