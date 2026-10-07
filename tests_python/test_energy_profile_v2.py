"""Energy Profile v2 model, validation and pure conversion from v1."""

import copy
import inspect
from typing import Any
from unittest.mock import AsyncMock

import pytest
from homeassistant.core import HomeAssistant

from custom_components.domusos.energy import adapter, context
from custom_components.domusos.energy.manager import EnergyProfileManager
from custom_components.domusos.energy.models import (
    EnergyModule,
    EnergyValidationError,
    parse_stored_profile,
)
from custom_components.domusos.energy.profile_v2 import (
    BatteryCapacity,
    EnergyProfileV2,
    load_profile_document,
    lossless_v1,
    parse_profile_v2,
    parse_stored_profile_v2,
    upgrade_v1,
    v1_save_allowed,
)

TARIFF = {
    "scheme": "three_band",
    "prices": {"f1": 0.31, "f2": 0.27, "f3": 0.22},
    "fixed_monthly": 9.5,
    "vat_percent": 10,
    "export_price": 0.09,
}


def _v1(modules: dict[str, Any], tariff: dict | None = None, revision: int = 4) -> dict:
    return {
        "schema": "domusos-energy-profile",
        "version": 1,
        "revision": revision,
        "updated_at": "2026-10-05T10:00:00+00:00",
        "modules": modules,
        "tariff": tariff,
    }


V1_PROFILES = {
    "grid split": _v1({"grid": {"sensors": {"import_power": "sensor.grid_in", "export_power": "sensor.grid_out"}}}),
    "grid signed": _v1(
        {"grid": {"sensors": {"net_power": "sensor.meter"}, "sign_convention": "positive_export"}}
    ),
    "complete with tariff": _v1(
        {
            "grid": {"sensors": {"net_power": "sensor.meter"}, "sign_convention": "positive_import"},
            "solar": {"sensors": {"production_power": "sensor.pv"}},
            "home": {"sensors": {"consumption_power": "sensor.house"}},
            "battery": {
                "sensors": {"state_of_charge": "sensor.soc", "net_power": "sensor.bat"},
                "sign_convention": "positive_charge",
            },
            "wallbox": {"sensors": {"charging_power": "sensor.wb"}},
        },
        tariff=TARIFF,
    ),
    "battery state of charge only": _v1({"battery": {"sensors": {"state_of_charge": "sensor.soc"}}}),
    "empty": _v1({}, revision=0),
}


def _plant(plant: dict[str, Any], tariff: dict | None = None) -> EnergyProfileV2:
    return parse_profile_v2({"plant": plant, "tariff": tariff})


def _device(device_id: str, **sources: Any) -> dict[str, Any]:
    return {"id": device_id, **sources}


def _power(**sensors: str) -> dict[str, Any]:
    return {"sensors": sensors}


# --- v1 conversion ---------------------------------------------------------------


@pytest.mark.parametrize("name", V1_PROFILES)
def test_v1_profiles_convert_without_losing_anything(name: str) -> None:
    v1 = parse_stored_profile(V1_PROFILES[name])

    v2 = upgrade_v1(v1)

    assert v2.revision == v1.revision
    assert v2.updated_at == v1.updated_at
    assert v2.migrated_from is not None
    assert v2.migrated_from.as_document() == {"version": 1, "revision": v1.revision, "updated_at": v1.updated_at}
    view = lossless_v1(v2)
    assert view is not None
    assert view.as_document() == v1.as_document()


def test_conversion_keeps_sign_conventions_tariff_and_device_ids() -> None:
    v2 = upgrade_v1(parse_stored_profile(V1_PROFILES["complete with tariff"]))

    assert [device.id for device in v2.devices] == ["grid-1", "solar-1", "home-1", "battery-1", "wallbox-1"]
    grid = v2.plant[EnergyModule.GRID].devices[0].sources.power
    battery = v2.plant[EnergyModule.BATTERY].devices[0].sources.power
    assert grid.sign_convention == "positive_import"
    assert battery.sign_convention == "positive_charge"
    assert dict(battery.sensors) == {"state_of_charge": "sensor.soc", "net_power": "sensor.bat"}
    assert v2.tariff is not None
    assert v2.tariff.as_document() == {**TARIFF, "prices": TARIFF["prices"]}
    assert all(plan.total is None and not plan.devices[0].sources.energy for plan in v2.plant.values())


@pytest.mark.parametrize("name", V1_PROFILES)
def test_conversion_is_deterministic_and_idempotent(name: str) -> None:
    document = V1_PROFILES[name]
    first = load_profile_document(copy.deepcopy(document))
    second = load_profile_document(copy.deepcopy(document))

    assert first == second
    stored = first.as_document()
    # Loading the converted document again changes nothing.
    assert load_profile_document(stored) == first
    assert load_profile_document(stored).as_document() == stored
    assert stored["version"] == 2
    assert "modules" not in stored


def test_conversion_does_not_mutate_its_input() -> None:
    document = copy.deepcopy(V1_PROFILES["complete with tariff"])
    snapshot = copy.deepcopy(document)

    load_profile_document(document)

    assert document == snapshot


# --- Device model ----------------------------------------------------------------


def test_single_inverter() -> None:
    profile = _plant(
        {
            "solar": {
                "devices": [
                    _device(
                        "solar-1",
                        name="  Tetto sud ",
                        power=_power(production_power="sensor.inv_power"),
                        energy={"production_energy": ["sensor.inv_energy"]},
                    )
                ]
            }
        }
    )

    device = profile.plant[EnergyModule.SOLAR].devices[0]
    assert device.name == "Tetto sud"
    assert dict(device.sources.energy) == {"production_energy": ("sensor.inv_energy",)}
    assert lossless_v1(profile) is None


def test_two_inverters_with_a_total_that_covers_them() -> None:
    profile = _plant(
        {
            "solar": {
                "devices": [
                    _device("solar-1", power=_power(production_power="sensor.inv1")),
                    _device("solar-2", power=_power(production_power="sensor.inv2")),
                ],
                "total": {"power": _power(production_power="sensor.pv_total")},
            }
        }
    )

    plan = profile.plant[EnergyModule.SOLAR]
    assert [device.id for device in plan.devices] == ["solar-1", "solar-2"]
    assert dict(plan.total.power.sensors) == {"production_power": "sensor.pv_total"}


def test_two_batteries_with_different_capacities_and_conventions() -> None:
    profile = _plant(
        {
            "battery": {
                "devices": [
                    _device(
                        "battery-1",
                        capacity={"nominal_kwh": 10, "usable_kwh": 9.5},
                        power={
                            "sensors": {"state_of_charge": "sensor.b1_soc", "net_power": "sensor.b1"},
                            "sign_convention": "positive_discharge",
                        },
                        energy={"charge_energy": ["sensor.b1_in"], "discharge_energy": ["sensor.b1_out"]},
                    ),
                    _device(
                        "battery-2",
                        capacity={"nominal_kwh": 5},
                        power={
                            "sensors": {"state_of_charge": "sensor.b2_soc", "net_power": "sensor.b2"},
                            "sign_convention": "positive_charge",
                        },
                    ),
                ]
            }
        }
    )

    first, second = profile.plant[EnergyModule.BATTERY].devices
    assert first.capacity == BatteryCapacity(nominal_kwh=10.0, usable_kwh=9.5)
    assert second.capacity == BatteryCapacity(nominal_kwh=5.0, usable_kwh=None)
    assert first.sources.power.sign_convention == "positive_discharge"
    assert second.sources.power.sign_convention == "positive_charge"


def test_two_wallboxes() -> None:
    profile = _plant(
        {
            "wallbox": {
                "devices": [
                    _device("wallbox-1", name="Box", power=_power(charging_power="sensor.wb1")),
                    _device("wallbox-2", name="Esterno", energy={"charging_energy": ["sensor.wb2_energy"]}),
                ]
            }
        }
    )

    assert [device.name for device in profile.devices] == ["Box", "Esterno"]
    assert profile.devices[1].sources.power is None


def test_tariff_split_meters_external_statistics_and_round_trip() -> None:
    document = {
        "plant": {
            "grid": {
                "devices": [
                    _device(
                        "grid",
                        ha_device_id="0f1e2d3c4b5a69788796a5b4c3d2e1f0",
                        power={"sensors": {"net_power": "sensor.meter"}, "sign_convention": "positive_import"},
                        energy={
                            "import_energy": ["sensor.meter_f1", "sensor.meter_f2", "opower:meter_f3"],
                            "export_energy": ["tibber:energy_production"],
                        },
                    )
                ]
            }
        },
        "tariff": TARIFF,
    }

    profile = parse_profile_v2(document)

    meters = profile.devices[0].sources.energy
    assert meters["import_energy"] == ("sensor.meter_f1", "sensor.meter_f2", "opower:meter_f3")
    assert meters["export_energy"] == ("tibber:energy_production",)
    stored = profile.as_document()
    assert parse_stored_profile_v2(stored) == profile
    assert parse_stored_profile_v2(stored).as_document() == stored


def test_plant_without_energy_meters_is_valid_and_keeps_power_only() -> None:
    profile = _plant(
        {
            "grid": {"devices": [_device("grid-1", power=_power(import_power="sensor.in", export_power="sensor.out"))]},
            "solar": {"devices": [_device("solar-1", power=_power(production_power="sensor.pv"))]},
        }
    )

    assert all(not device.sources.energy for device in profile.devices)
    assert "energy" not in profile.as_document()["plant"]["grid"]["devices"][0]


# --- Duplicates and overlaps -------------------------------------------------------


@pytest.mark.parametrize(
    ("plant", "message"),
    [
        (
            {
                "solar": {
                    "devices": [
                        _device("solar-1", power=_power(production_power="sensor.pv")),
                        _device("solar-2", power=_power(production_power="sensor.pv")),
                    ]
                }
            },
            "sensor.pv is used by both solar.solar-1.power.production_power and solar.solar-2.power.production_power",
        ),
        (
            {
                "solar": {
                    "devices": [
                        _device("solar-1", power=_power(production_power="sensor.inv1")),
                        _device("solar-2", power=_power(production_power="sensor.inv2")),
                    ],
                    "total": {"power": _power(production_power="sensor.inv1")},
                }
            },
            "sensor.inv1 is used by both solar.solar-1.power.production_power and solar.total.power.production_power",
        ),
        (
            {"grid": {"devices": [_device("grid-1", energy={"import_energy": ["sensor.m", "sensor.m"]})]}},
            "lists a meter twice",
        ),
        (
            {
                "grid": {
                    "devices": [
                        _device("grid-1", energy={"import_energy": ["sensor.m"], "export_energy": ["sensor.m"]})
                    ]
                }
            },
            "sensor.m is used by both",
        ),
        (
            {
                "solar": {"devices": [_device("shared", power=_power(production_power="sensor.pv"))]},
                "wallbox": {"devices": [_device("shared", power=_power(charging_power="sensor.wb"))]},
            },
            "Device id shared is used twice",
        ),
        (
            {
                "solar": {"devices": [_device("solar-1", energy={"production_energy": ["sensor.x"]})]},
                "wallbox": {"devices": [_device("wallbox-1", power=_power(charging_power="sensor.x"))]},
            },
            "sensor.x is used by both",
        ),
    ],
)
def test_duplicate_and_overlapping_references_are_rejected(plant: dict, message: str) -> None:
    with pytest.raises(EnergyValidationError, match=message):
        _plant(plant)


# --- Invalid data -------------------------------------------------------------------


@pytest.mark.parametrize(
    "document",
    [
        {"modules": {"solar": {"sensors": {"production_power": "sensor.pv"}}}},
        {"plant": {"solar": {"devices": []}}},
        {"plant": {"solar": {"devices": [{"id": "solar-1"}]}}},
        {"plant": {"solar": {"devices": [_device("Solar 1", power=_power(production_power="sensor.pv"))]}}},
        {"plant": {"solar": {"devices": [_device("solar-1", power=_power(production_power="sensor.pv"), extra=1)]}}},
        {"plant": {"solar": {"devices": [_device("solar-1", power=_power(production_power="sensor.pv"))], "extra": {}}}},
        {"plant": {"pool": {"devices": [_device("pool-1", power=_power(production_power="sensor.pv"))]}}},
        {"plant": {"solar": {"devices": [_device("solar-1", power=_power(production_power="switch.pv"))]}}},
        {"plant": {"solar": {"devices": [_device("solar-1", energy={"production_energy": ["Opower:Meter"]})]}}},
        {"plant": {"solar": {"devices": [_device("solar-1", energy={"production_energy": ["opower__x:meter"]})]}}},
        {"plant": {"solar": {"devices": [_device("solar-1", energy={"import_energy": ["sensor.x"]})]}}},
        {"plant": {"solar": {"devices": [_device("solar-1", energy={"production_energy": []})]}}},
        {"plant": {"solar": {"devices": [_device("solar-1", energy={"production_energy": [f"sensor.p{i}" for i in range(9)]})]}}},
        {"plant": {"grid": {"devices": [_device("grid-1", power=_power(net_power="sensor.meter"))]}}},
        {"plant": {"solar": {"devices": [_device("solar-1", name="", power=_power(production_power="sensor.pv"))]}}},
        {"plant": {"solar": {"devices": [_device("solar-1", capacity={"nominal_kwh": 5}, power=_power(production_power="sensor.pv"))]}}},
        {"plant": {"battery": {"devices": [_device("battery-1", capacity={"nominal_kwh": 5, "usable_kwh": 6}, power=_power(state_of_charge="sensor.soc"))]}}},
        {"plant": {"battery": {"devices": [_device("battery-1", capacity={"nominal_kwh": True}, power=_power(state_of_charge="sensor.soc"))]}}},
        {"plant": {"battery": {"devices": [_device("battery-1", capacity={"nominal_kwh": -1}, power=_power(state_of_charge="sensor.soc"))]}}},
        {"plant": {"battery": {"devices": [_device("battery-1", capacity={}, power=_power(state_of_charge="sensor.soc"))]}}},
        {
            "plant": {
                "solar": {
                    "devices": [_device("solar-1", power=_power(production_power="sensor.pv"))],
                    "total": {"power": _power(production_power="sensor.total")},
                }
            }
        },
        {"plant": {"solar": {"devices": [_device("solar-1", ha_device_id="not a device", power=_power(production_power="sensor.pv"))]}}},
        {"plant": {}, "unexpected": True},
    ],
)
def test_invalid_documents_are_rejected(document: dict) -> None:
    with pytest.raises(EnergyValidationError):
        parse_profile_v2(document)


@pytest.mark.parametrize(
    "change",
    [
        {"schema": "other"},
        {"version": 1},
        {"version": 3},
        {"revision": -1},
        {"revision": True},
        {"updated_at": 5},
        {"migrated_from": {"version": 2, "revision": 1, "updated_at": None}},
        {"migrated_from": {"version": 1, "revision": 1}},
    ],
)
def test_invalid_stored_documents_are_rejected(change: dict) -> None:
    stored = upgrade_v1(parse_stored_profile(V1_PROFILES["grid split"])).as_document()

    with pytest.raises(EnergyValidationError):
        parse_stored_profile_v2({**stored, **change})


# --- v1 compatibility contract -----------------------------------------------------


@pytest.mark.parametrize(
    "plan",
    [
        {"devices": [_device("solar-1", name="Tetto", power=_power(production_power="sensor.pv"))]},
        {"devices": [_device("solar-7", power=_power(production_power="sensor.pv"))]},
        {"devices": [_device("solar-1", ha_device_id="abc123", power=_power(production_power="sensor.pv"))]},
        {"devices": [_device("solar-1", power=_power(production_power="sensor.pv"), energy={"production_energy": ["sensor.e"]})]},
        {"devices": [_device("solar-1", energy={"production_energy": ["sensor.e"]})]},
        {
            "devices": [
                _device("solar-1", power=_power(production_power="sensor.inv1")),
                _device("solar-2", power=_power(production_power="sensor.inv2")),
            ]
        },
        {
            "devices": [
                _device("solar-1", power=_power(production_power="sensor.inv1")),
                _device("solar-2", power=_power(production_power="sensor.inv2")),
            ],
            "total": {"power": _power(production_power="sensor.total")},
        },
    ],
)
def test_a_v1_save_is_refused_whenever_it_would_drop_data(plan: dict) -> None:
    profile = _plant({"solar": plan})

    assert lossless_v1(profile) is None
    assert v1_save_allowed(profile) is False


def test_a_battery_capacity_alone_blocks_a_v1_save() -> None:
    profile = _plant(
        {
            "battery": {
                "devices": [_device("battery-1", capacity={"usable_kwh": 9}, power=_power(state_of_charge="sensor.soc"))]
            }
        }
    )

    assert v1_save_allowed(profile) is False


def test_a_converted_v1_profile_stays_writable_by_v1_clients() -> None:
    profile = upgrade_v1(parse_stored_profile(V1_PROFILES["complete with tariff"]))

    assert v1_save_allowed(profile) is True


# --- Isolation from the live profile -------------------------------------------------


async def test_conversion_never_writes_the_v1_store(hass: HomeAssistant) -> None:
    energy = EnergyProfileManager(hass)
    stored = copy.deepcopy(V1_PROFILES["complete with tariff"])
    energy.store.async_load = AsyncMock(return_value=stored)
    energy.store.async_save = AsyncMock()
    energy.store_v2.async_save = AsyncMock()
    await energy.async_setup()
    before = energy.profile_result()

    upgraded = upgrade_v1(energy.profile)
    lossless_v1(upgraded)

    energy.store.async_save.assert_not_awaited()
    energy.store_v2.async_save.assert_not_awaited()
    assert energy.profile_result() == before
    assert stored == V1_PROFILES["complete with tariff"]
    await energy.async_shutdown()


def test_realtime_adapters_still_read_only_v1_module_configs() -> None:
    # The adapters and the projection are untouched by v2: they read the v1 view.
    for module in (adapter, context):
        assert "profile_v2 import" not in inspect.getsource(module)
