"""Assisted Energy discovery from Home Assistant metadata."""

from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, patch

from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.domusos.energy.discovery import (
    EnergyDiscoveryService,
    parse_energy_preferences,
)
from custom_components.domusos.energy.models import (
    EnergyModule,
    SignConvention,
    parse_profile,
)

ENERGY_MANAGER = "homeassistant.components.energy.data.async_get_manager"


def _device(hass: HomeAssistant, name: str, **kwargs: Any) -> str:
    entry = MockConfigEntry(domain="test")
    entry.add_to_hass(hass)
    device = dr.async_get(hass).async_get_or_create(
        config_entry_id=entry.entry_id,
        identifiers={("test", name)},
        name=name,
        **kwargs,
    )
    return device.id


def _sensor(
    hass: HomeAssistant,
    object_id: str,
    *,
    value: str = "100",
    unit: str | None = "W",
    device_class: str | None = "power",
    state_class: str | None = "measurement",
    device_id: str | None = None,
    platform: str = "test",
    translation_key: str | None = None,
    original_name: str | None = None,
    entity_category: EntityCategory | None = None,
    disabled: bool = False,
    registry: bool = True,
) -> str:
    attributes: dict[str, Any] = {}
    if unit is not None:
        attributes["unit_of_measurement"] = unit
    if device_class is not None:
        attributes["device_class"] = device_class
    if state_class is not None:
        attributes["state_class"] = state_class
    entity_id = f"sensor.{object_id}"
    if registry:
        entity_id = (
            er.async_get(hass)
            .async_get_or_create(
                "sensor",
                platform,
                object_id,
                suggested_object_id=object_id,
                device_id=device_id,
                translation_key=translation_key,
                original_name=original_name,
                original_device_class=device_class,
                unit_of_measurement=unit,
                capabilities={"state_class": state_class} if state_class else None,
                entity_category=entity_category,
                disabled_by=er.RegistryEntryDisabler.USER if disabled else None,
            )
            .entity_id
        )
    if not disabled:
        hass.states.async_set(entity_id, value, attributes)
    return entity_id


async def _discover(
    hass: HomeAssistant, preferences: dict[str, Any] | None = None
) -> dict[str, Any]:
    if preferences is None:
        return await EnergyDiscoveryService(hass).async_discover()
    hass.config.components.add("energy")
    with patch(
        ENERGY_MANAGER,
        new=AsyncMock(return_value=SimpleNamespace(data=preferences)),
    ):
        return await EnergyDiscoveryService(hass).async_discover()


def _proposal(result: dict[str, Any], module: str, role: str, entity_id: str) -> dict:
    return next(
        item
        for item in result["proposals"][module][role]
        if item["entity_id"] == entity_id
    )


def test_energy_preferences_parser_maps_verified_power_configs() -> None:
    verified, anchors = parse_energy_preferences(
        {
            "energy_sources": [
                {
                    "type": "grid",
                    "flow_from": [{"stat_energy_from": "sensor.grid_in_kwh"}],
                    "flow_to": [{"stat_energy_to": "sensor.grid_out_kwh"}],
                    "power": [
                        {
                            "power_config": {
                                "stat_rate_from": "sensor.grid_in",
                                "stat_rate_to": "sensor.grid_out",
                            }
                        }
                    ],
                },
                {"type": "solar", "stat_energy_from": "sensor.pv_kwh", "stat_rate": "sensor.pv"},
                {
                    "type": "battery",
                    "stat_energy_from": "sensor.bat_out_kwh",
                    "stat_energy_to": "sensor.bat_in_kwh",
                    "power_config": {"stat_rate_inverted": "sensor.bat"},
                },
                {"type": "gas", "stat_energy_from": "sensor.gas"},
                "malformed",
            ]
        }
    )

    assert {(v.module, v.role, v.entity_id, v.sign_convention) for v in verified} == {
        (EnergyModule.GRID, "import_power", "sensor.grid_in", None),
        (EnergyModule.GRID, "export_power", "sensor.grid_out", None),
        (EnergyModule.SOLAR, "production_power", "sensor.pv", None),
        (
            EnergyModule.BATTERY,
            "net_power",
            "sensor.bat",
            SignConvention.POSITIVE_CHARGE,
        ),
    }
    assert anchors["sensor.grid_in_kwh"] == {EnergyModule.GRID}
    assert anchors["sensor.bat_in_kwh"] == {EnergyModule.BATTERY}
    assert "sensor.gas" not in anchors


def test_legacy_energy_preferences_without_power_are_tolerated() -> None:
    verified, anchors = parse_energy_preferences(
        {
            "energy_sources": [
                {"type": "grid", "flow_from": [{"stat_energy_from": "sensor.in"}], "flow_to": []},
                {"type": "battery", "stat_energy_from": "sensor.a", "stat_energy_to": "sensor.b"},
            ]
        }
    )

    assert verified == []
    assert set(anchors) == {"sensor.in", "sensor.a", "sensor.b"}


async def test_energy_dashboard_power_sensors_become_a_valid_draft(
    hass: HomeAssistant,
) -> None:
    grid_in = _sensor(hass, "meter_in", value="0.8", unit="kW")
    grid_out = _sensor(hass, "meter_out")
    pv = _sensor(hass, "inverter_dc")
    battery = _sensor(hass, "storage_flow", value="-300")

    result = await _discover(
        hass,
        {
            "energy_sources": [
                {
                    "type": "grid",
                    "flow_from": [],
                    "flow_to": [],
                    "power": [
                        {
                            "power_config": {
                                "stat_rate_from": grid_in,
                                "stat_rate_to": grid_out,
                            }
                        }
                    ],
                },
                {"type": "solar", "stat_energy_from": "sensor.pv_kwh", "stat_rate": pv},
                {
                    "type": "battery",
                    "stat_energy_from": "sensor.x",
                    "stat_energy_to": "sensor.y",
                    "power_config": {"stat_rate": battery},
                },
            ]
        },
    )

    assert result["energy_dashboard"] == "used"
    assert result["suggested_profile"] == {
        "modules": {
            "grid": {"sensors": {"import_power": grid_in, "export_power": grid_out}},
            "solar": {"sensors": {"production_power": pv}},
            "battery": {
                "sensors": {"net_power": battery},
                "sign_convention": "positive_discharge",
            },
        }
    }
    parse_profile(result["suggested_profile"])
    assert _proposal(result, "grid", "import_power", grid_in)["confidence"] == "high"
    assert result["candidates"][grid_in]["preview"]["value"] == 800.0
    assert result["ambiguous"] == []
    assert result["requires_input"] == []


async def test_meter_device_metadata_gives_medium_directional_proposals(
    hass: HomeAssistant,
) -> None:
    meter = _device(hass, "Main meter", manufacturer="Any", model="Bidirectional")
    _sensor(
        hass,
        "meter_energy_in",
        unit="kWh",
        device_class="energy",
        state_class="total_increasing",
        device_id=meter,
    )
    imported = _sensor(
        hass, "meter_p1", device_id=meter, translation_key="power_import"
    )
    exported = _sensor(
        hass, "meter_p2", device_id=meter, translation_key="power_export"
    )

    result = await _discover(
        hass,
        {
            "energy_sources": [
                {
                    "type": "grid",
                    "flow_from": [{"stat_energy_from": "sensor.meter_energy_in"}],
                    "flow_to": [],
                }
            ]
        },
    )

    assert _proposal(result, "grid", "import_power", imported)["confidence"] == "medium"
    assert _proposal(result, "grid", "import_power", imported)["evidence"] == [
        "device_class",
        "energy_dashboard_device",
        "measurement_state_class",
        "role_keyword",
    ]
    assert result["suggested_profile"]["modules"]["grid"] == {
        "sensors": {"import_power": imported, "export_power": exported}
    }
    assert result["candidates"][imported]["device"]["name"] == "Main meter"


async def test_signed_meter_without_verified_convention_requires_input(
    hass: HomeAssistant,
) -> None:
    meter = _device(hass, "Meter")
    _sensor(
        hass,
        "meter_energy",
        unit="kWh",
        device_class="energy",
        state_class="total_increasing",
        device_id=meter,
    )
    signed = _sensor(hass, "meter_active_power", device_id=meter, value="-150")

    result = await _discover(
        hass,
        {
            "energy_sources": [
                {
                    "type": "grid",
                    "flow_from": [{"stat_energy_from": "sensor.meter_energy"}],
                    "flow_to": [],
                }
            ]
        },
    )

    assert "grid" not in result["suggested_profile"]["modules"]
    assert result["requires_input"] == [
        {
            "module": "grid",
            "role": "net_power",
            "entity_id": signed,
            "confidence": "medium",
            "missing": ["sign_convention"],
            "allowed": ["positive_export", "positive_import"],
        }
    ]
    assert _proposal(result, "grid", "net_power", signed)["requires"] == [
        "sign_convention"
    ]


async def test_name_only_matches_stay_low_and_are_never_suggested(
    hass: HomeAssistant,
) -> None:
    pv = _sensor(hass, "solar_power", registry=False)
    grid = _sensor(hass, "grid_import_power", registry=False)
    plug = _sensor(hass, "kitchen_plug_power", registry=False)

    result = await _discover(hass)

    assert result["energy_dashboard"] == "not_loaded"
    assert _proposal(result, "solar", "production_power", pv)["confidence"] == "low"
    assert _proposal(result, "grid", "import_power", grid)["confidence"] == "low"
    assert result["suggested_profile"] == {"modules": {}}
    assert result["unassigned"] == [plug]
    assert plug in result["candidates"]


async def test_ambiguous_batteries_are_reported_not_configured(
    hass: HomeAssistant,
) -> None:
    first = _device(hass, "Storage A")
    second = _device(hass, "Storage B")
    socs = []
    for index, device_id in enumerate((first, second)):
        _sensor(hass, f"storage_{index}_power", device_id=device_id)
        socs.append(
            _sensor(
                hass,
                f"storage_{index}_level",
                value="50",
                unit="%",
                device_class="battery",
                device_id=device_id,
            )
        )

    result = await _discover(hass)

    assert "battery" not in result["suggested_profile"]["modules"]
    assert {
        "module": "battery",
        "role": "state_of_charge",
        "entity_ids": sorted(socs),
        "reason": "multiple_candidates",
    } in result["ambiguous"]


async def test_portable_and_diagnostic_batteries_are_low_confidence(
    hass: HomeAssistant,
) -> None:
    phone = _device(hass, "Phone")
    _sensor(hass, "phone_battery_power", device_id=phone, platform="mobile_app")
    phone_soc = _sensor(
        hass,
        "phone_battery_level",
        unit="%",
        device_class="battery",
        device_id=phone,
        platform="mobile_app",
    )
    plug = _device(hass, "Plug")
    _sensor(hass, "plug_power", device_id=plug)
    plug_soc = _sensor(
        hass,
        "plug_backup_battery",
        unit="%",
        device_class="battery",
        device_id=plug,
        entity_category=EntityCategory.DIAGNOSTIC,
    )
    storage = _device(hass, "Home storage")
    _sensor(hass, "storage_power", device_id=storage)
    storage_soc = _sensor(
        hass, "storage_level", unit="%", device_class="battery", device_id=storage
    )

    result = await _discover(hass)

    assert _proposal(result, "battery", "state_of_charge", phone_soc)["confidence"] == "low"
    assert _proposal(result, "battery", "state_of_charge", plug_soc)["confidence"] == "low"
    assert result["suggested_profile"]["modules"]["battery"] == {
        "sensors": {"state_of_charge": storage_soc}
    }


async def test_cumulative_incompatible_and_disabled_sensors_are_excluded(
    hass: HomeAssistant,
) -> None:
    _sensor(
        hass,
        "solar_energy_today",
        unit="kWh",
        device_class="energy",
        state_class="total_increasing",
    )
    _sensor(hass, "solar_apparent_power", unit="VA", device_class="apparent_power")
    _sensor(hass, "solar_power_total", unit="kW", state_class="total_increasing")
    _sensor(hass, "solar_disabled_power", disabled=True)
    _sensor(hass, "outdoor_temperature", unit="°C", device_class="temperature")

    result = await _discover(hass)

    assert result["proposals"] == {}
    assert result["candidates"] == {}
    assert result["ignored"] == {
        "cumulative_energy": 1,
        "disabled": 1,
        "incompatible_metadata": 1,
    }


async def test_unavailable_registry_entities_use_registry_metadata(
    hass: HomeAssistant,
) -> None:
    entity_id = _sensor(hass, "pv_inverter_power", unit="kW", translation_key="pv_power")
    hass.states.async_set(entity_id, "unavailable", {})

    result = await _discover(hass)

    proposal = _proposal(result, "solar", "production_power", entity_id)
    assert proposal["confidence"] == "low"
    assert result["candidates"][entity_id]["unit"] == "kW"
    assert result["candidates"][entity_id]["preview"]["status"] == "unavailable"


async def test_unusable_energy_dashboard_sensor_is_reported(
    hass: HomeAssistant,
) -> None:
    _sensor(
        hass,
        "pv_energy",
        unit="kWh",
        device_class="energy",
        state_class="total_increasing",
    )

    result = await _discover(
        hass,
        {
            "energy_sources": [
                {"type": "solar", "stat_energy_from": "sensor.pv_energy", "stat_rate": "sensor.pv_energy"}
            ]
        },
    )

    assert result["warnings"] == [
        {"entity_id": "sensor.pv_energy", "reason": "energy_dashboard_sensor_unusable"}
    ]
    assert result["suggested_profile"] == {"modules": {}}


async def test_energy_dashboard_failure_does_not_break_discovery(
    hass: HomeAssistant,
) -> None:
    pv = _sensor(hass, "solar_power", registry=False)
    hass.config.components.add("energy")

    with patch(ENERGY_MANAGER, new=AsyncMock(side_effect=RuntimeError("boom"))):
        result = await EnergyDiscoveryService(hass).async_discover()

    assert result["energy_dashboard"] == "unavailable"
    assert pv in result["candidates"]


async def test_entity_matching_several_roles_is_not_suggested_twice(
    hass: HomeAssistant,
) -> None:
    hybrid = _device(hass, "Hybrid inverter")
    _sensor(
        hass,
        "hybrid_total",
        unit="kWh",
        device_class="energy",
        state_class="total_increasing",
        device_id=hybrid,
    )
    shared = _sensor(hass, "hybrid_ac_power", device_id=hybrid)

    result = await _discover(
        hass,
        {
            "energy_sources": [
                {"type": "solar", "stat_energy_from": "sensor.hybrid_total"},
                {"type": "battery", "stat_energy_from": "sensor.hybrid_total", "stat_energy_to": "sensor.hybrid_total"},
            ]
        },
    )

    assert result["suggested_profile"] == {"modules": {}}
    reasons = {
        (item["module"], item["reason"])
        for item in result["ambiguous"]
        if shared in item["entity_ids"]
    }
    assert ("solar", "entity_matches_multiple_roles") in reasons
