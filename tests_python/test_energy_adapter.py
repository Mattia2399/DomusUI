"""Energy capability adapters and derived home consumption."""

from typing import Any

from homeassistant.core import HomeAssistant

from custom_components.domusos.core import CapabilityAdapter
from custom_components.domusos.energy.adapter import (
    EnergyModuleAdapter,
    derive_home_consumption,
)
from custom_components.domusos.energy.models import (
    EnergyModule,
    EnergyProfile,
    parse_profile,
)

POWER = {"device_class": "power", "state_class": "measurement"}


def _set_power(
    hass: HomeAssistant, entity_id: str, value: str, unit: str = "W"
) -> None:
    hass.states.async_set(entity_id, value, {**POWER, "unit_of_measurement": unit})


def _profile(modules: dict[str, Any]) -> EnergyProfile:
    return parse_profile({"modules": modules})


def _read(hass: HomeAssistant, profile: EnergyProfile) -> dict:
    return {
        module: EnergyModuleAdapter(hass, config).read()
        for module, config in profile.modules.items()
    }


async def test_adapter_satisfies_capability_contract(hass: HomeAssistant) -> None:
    _set_power(hass, "sensor.pv", "2.4", "kW")
    profile = _profile({"solar": {"sensors": {"production_power": "sensor.pv"}}})
    adapter = EnergyModuleAdapter(hass, profile.modules[EnergyModule.SOLAR])

    state = await adapter.async_get_capability()

    assert isinstance(adapter, CapabilityAdapter)
    assert state.capability == "energy.solar"
    assert state.available is True
    assert state.source_entity_ids == ("sensor.pv",)
    production = state.values["quantities"]["production_power"]
    assert production["value"] == 2400.0
    assert production["source"] == "measured"
    assert production["unit"] == "W"


async def test_grid_only_home_derives_consumption_without_fake_modules(
    hass: HomeAssistant,
) -> None:
    _set_power(hass, "sensor.grid_import", "800")
    _set_power(hass, "sensor.grid_export", "0")
    profile = _profile(
        {
            "grid": {
                "sensors": {
                    "import_power": "sensor.grid_import",
                    "export_power": "sensor.grid_export",
                }
            }
        }
    )

    states = _read(hass, profile)
    home = derive_home_consumption(states)

    assert set(states) == {EnergyModule.GRID}
    assert states[EnergyModule.GRID].values["quantities"]["net_power"] == {
        "status": "ok",
        "value": 800.0,
        "unit": "W",
        "source": "derived",
        "entity_ids": ("sensor.grid_import", "sensor.grid_export"),
        "reason": None,
    }
    assert home.as_dict()["value"] == 800.0
    assert home.as_dict()["source"] == "derived"


async def test_single_direction_grid_cannot_derive_net_or_consumption(
    hass: HomeAssistant,
) -> None:
    _set_power(hass, "sensor.grid_import", "800")
    profile = _profile({"grid": {"sensors": {"import_power": "sensor.grid_import"}}})

    states = _read(hass, profile)
    quantities = states[EnergyModule.GRID].values["quantities"]

    assert quantities["export_power"]["status"] == "not_measured"
    assert quantities["export_power"]["value"] is None
    assert quantities["net_power"]["status"] == "not_measured"
    home = derive_home_consumption(states)
    assert home.status == "not_measured"
    assert home.reason == "insufficient_data"


async def test_signed_grid_meter_uses_only_the_declared_convention(
    hass: HomeAssistant,
) -> None:
    _set_power(hass, "sensor.grid", "-1.2", "kW")
    profile = _profile(
        {
            "grid": {
                "sensors": {"net_power": "sensor.grid"},
                "sign_convention": "positive_export",
            }
        }
    )

    quantities = _read(hass, profile)[EnergyModule.GRID].values["quantities"]

    assert quantities["net_power"]["value"] == 1200.0
    assert quantities["net_power"]["source"] == "measured"
    assert quantities["import_power"]["value"] == 1200.0
    assert quantities["import_power"]["source"] == "derived"
    assert quantities["export_power"]["value"] == 0.0


async def test_full_installation_balance_includes_solar_and_battery(
    hass: HomeAssistant,
) -> None:
    _set_power(hass, "sensor.grid", "-500")
    _set_power(hass, "sensor.pv", "3200")
    _set_power(hass, "sensor.battery", "1000")
    hass.states.async_set(
        "sensor.battery_soc",
        "71",
        {"device_class": "battery", "unit_of_measurement": "%"},
    )
    _set_power(hass, "sensor.wallbox", "1.1", "kW")
    profile = _profile(
        {
            "grid": {
                "sensors": {"net_power": "sensor.grid"},
                "sign_convention": "positive_import",
            },
            "solar": {"sensors": {"production_power": "sensor.pv"}},
            "battery": {
                "sensors": {
                    "state_of_charge": "sensor.battery_soc",
                    "net_power": "sensor.battery",
                },
                "sign_convention": "positive_charge",
            },
            "wallbox": {"sensors": {"charging_power": "sensor.wallbox"}},
        }
    )

    states = _read(hass, profile)
    battery = states[EnergyModule.BATTERY].values["quantities"]
    home = derive_home_consumption(states)

    assert battery["state_of_charge"]["value"] == 71.0
    assert battery["state_of_charge"]["unit"] == "%"
    assert battery["charge_power"]["value"] == 1000.0
    assert battery["discharge_power"]["value"] == 0.0
    assert battery["net_power"]["value"] == -1000.0
    assert states[EnergyModule.WALLBOX].values["quantities"]["charging_power"][
        "value"
    ] == 1100.0
    # -500 grid + 3200 solar - 1000 battery charge
    assert home.value == 1700.0
    assert home.source == "derived"
    assert set(home.entity_ids) == {"sensor.grid", "sensor.pv", "sensor.battery"}


async def test_configured_battery_offline_stays_present(hass: HomeAssistant) -> None:
    _set_power(hass, "sensor.grid_import", "400")
    _set_power(hass, "sensor.grid_export", "0")
    hass.states.async_set("sensor.battery_soc", "unavailable", {})
    hass.states.async_set("sensor.battery_power", "unavailable", {})
    profile = _profile(
        {
            "grid": {
                "sensors": {
                    "import_power": "sensor.grid_import",
                    "export_power": "sensor.grid_export",
                }
            },
            "battery": {
                "sensors": {
                    "state_of_charge": "sensor.battery_soc",
                    "net_power": "sensor.battery_power",
                },
                "sign_convention": "positive_discharge",
            },
        }
    )

    states = _read(hass, profile)
    battery = states[EnergyModule.BATTERY]
    home = derive_home_consumption(states)

    assert battery.available is False
    assert battery.reason == "sensors_unavailable"
    assert battery.values["status"] == "offline"
    assert battery.values["quantities"]["state_of_charge"]["value"] is None
    assert battery.values["quantities"]["net_power"]["status"] == "unavailable"
    assert home.status == "unavailable"
    assert home.value is None
    assert home.reason == "source_unavailable"


async def test_missing_entity_is_offline_and_partial_module_is_online(
    hass: HomeAssistant,
) -> None:
    hass.states.async_set(
        "sensor.battery_soc",
        "55",
        {"device_class": "battery", "unit_of_measurement": "%"},
    )
    profile = _profile(
        {
            "battery": {
                "sensors": {
                    "state_of_charge": "sensor.battery_soc",
                    "charge_power": "sensor.not_created_yet",
                }
            },
            "wallbox": {"sensors": {"charging_power": "sensor.removed_wallbox"}},
        }
    )

    states = _read(hass, profile)

    battery = states[EnergyModule.BATTERY]
    assert battery.available is True
    assert battery.values["status"] == "online"
    assert battery.values["complete"] is False
    assert battery.values["sensors"]["charge_power"]["reason"] == "entity_missing"
    assert battery.values["quantities"]["discharge_power"]["status"] == "not_measured"
    wallbox = states[EnergyModule.WALLBOX]
    assert wallbox.values["status"] == "offline"


async def test_invalid_units_make_module_offline_with_explicit_reason(
    hass: HomeAssistant,
) -> None:
    hass.states.async_set(
        "sensor.pv_energy",
        "1532.4",
        {
            "device_class": "energy",
            "state_class": "total_increasing",
            "unit_of_measurement": "kWh",
        },
    )
    profile = _profile({"solar": {"sensors": {"production_power": "sensor.pv_energy"}}})

    state = _read(hass, profile)[EnergyModule.SOLAR]

    assert state.values["status"] == "offline"
    assert state.reason == "sensors_invalid"
    production = state.values["quantities"]["production_power"]
    assert production["status"] == "invalid"
    assert production["reason"] == "cumulative_energy"
    assert production["value"] is None


async def test_dedicated_home_sensor_is_measured_and_never_replaced(
    hass: HomeAssistant,
) -> None:
    _set_power(hass, "sensor.grid_import", "900")
    _set_power(hass, "sensor.grid_export", "0")
    _set_power(hass, "sensor.house", "870")
    profile = _profile(
        {
            "grid": {
                "sensors": {
                    "import_power": "sensor.grid_import",
                    "export_power": "sensor.grid_export",
                }
            },
            "home": {"sensors": {"consumption_power": "sensor.house"}},
        }
    )

    measured = derive_home_consumption(_read(hass, profile))
    assert measured.value == 870.0
    assert measured.source == "measured"

    hass.states.async_set("sensor.house", "unavailable", {})
    offline = derive_home_consumption(_read(hass, profile))
    assert offline.status == "unavailable"
    assert offline.value is None
    assert offline.source == "measured"


async def test_battery_without_power_flows_prevents_derivation(
    hass: HomeAssistant,
) -> None:
    _set_power(hass, "sensor.grid_import", "300")
    _set_power(hass, "sensor.grid_export", "0")
    hass.states.async_set(
        "sensor.battery_soc",
        "40",
        {"device_class": "battery", "unit_of_measurement": "%"},
    )
    profile = _profile(
        {
            "grid": {
                "sensors": {
                    "import_power": "sensor.grid_import",
                    "export_power": "sensor.grid_export",
                }
            },
            "battery": {"sensors": {"state_of_charge": "sensor.battery_soc"}},
        }
    )

    home = derive_home_consumption(_read(hass, profile))

    assert home.status == "not_measured"
    assert home.reason == "insufficient_data"


async def test_incoherent_balance_is_invalid_not_clamped(hass: HomeAssistant) -> None:
    _set_power(hass, "sensor.grid_import", "0")
    _set_power(hass, "sensor.grid_export", "2500")
    _set_power(hass, "sensor.pv", "1000")
    profile = _profile(
        {
            "grid": {
                "sensors": {
                    "import_power": "sensor.grid_import",
                    "export_power": "sensor.grid_export",
                }
            },
            "solar": {"sensors": {"production_power": "sensor.pv"}},
        }
    )

    home = derive_home_consumption(_read(hass, profile))

    assert home.status == "invalid"
    assert home.reason == "incoherent_balance"
    assert home.value is None


async def test_home_without_grid_has_no_derived_consumption(
    hass: HomeAssistant,
) -> None:
    _set_power(hass, "sensor.pv", "1000")
    profile = _profile({"solar": {"sensors": {"production_power": "sensor.pv"}}})

    home = derive_home_consumption(_read(hass, profile))

    assert home.status == "not_measured"
    assert home.source is None
