"""Discovery v2: several devices per module, energy meters and existing profiles.

The A0 discovery contract is covered by ``test_energy_discovery.py``; here the
additive ``v2`` result is checked against Energy Profile v2.
"""

import copy
import json
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.domusos.const import DOMAIN
from custom_components.domusos.energy import meters
from custom_components.domusos.energy.api import websocket_discover
from custom_components.domusos.energy.discovery import EnergyDiscoveryService, parse_energy_dashboard
from custom_components.domusos.energy.discovery_plant import Binding, build_plant_proposals
from custom_components.domusos.energy.manager import EnergyProfileManager
from custom_components.domusos.energy.meters import MeterInfo, MeterReport, MeterStatus
from custom_components.domusos.energy.models import STORAGE_KEY, EnergyModule, SignConvention
from custom_components.domusos.energy.profile_v2 import STORAGE_KEY_V2, EnergyProfileV2, parse_profile_v2

ENERGY_MANAGER = "homeassistant.components.energy.data.async_get_manager"
A0_KEYS = {
    "generated_at", "energy_dashboard", "suggested_profile", "proposals", "ambiguous",
    "requires_input", "unassigned", "candidates", "ignored", "warnings",
}


@pytest.fixture(autouse=True)
def mock_recorder_before_hass(async_setup_recorder_instance: Any) -> None:
    """Let the tests that request ``recorder_mock`` start the Recorder before hass."""


def _device(hass: HomeAssistant, name: str, model: str | None = None) -> str:
    entry = MockConfigEntry(domain="test")
    entry.add_to_hass(hass)
    return dr.async_get(hass).async_get_or_create(
        config_entry_id=entry.entry_id, identifiers={("test", name)}, name=name, model=model
    ).id


def _sensor(
    hass: HomeAssistant,
    object_id: str,
    *,
    value: str = "100",
    unit: str | None = "W",
    device_class: str | None = "power",
    state_class: str | None = "measurement",
    device_id: str | None = None,
    original_name: str | None = None,
    config_entry: MockConfigEntry | None = None,
    attributes: dict[str, Any] | None = None,
) -> str:
    entity_id = er.async_get(hass).async_get_or_create(
        "sensor", "test", object_id, suggested_object_id=object_id, device_id=device_id,
        original_name=original_name, original_device_class=device_class, unit_of_measurement=unit,
        capabilities={"state_class": state_class} if state_class else None, config_entry=config_entry,
    ).entity_id
    state_attributes = {
        key: value
        for key, value in (("unit_of_measurement", unit), ("device_class", device_class), ("state_class", state_class))
        if value is not None
    }
    hass.states.async_set(entity_id, value, {**state_attributes, **(attributes or {})})
    return entity_id


def _meter(hass: HomeAssistant, object_id: str, **kwargs: Any) -> str:
    kwargs.setdefault("value", "1520.4")
    return _sensor(hass, object_id, unit="kWh", device_class="energy", state_class="total_increasing", **kwargs)


async def _discover(
    hass: HomeAssistant,
    preferences: dict[str, Any] | None = None,
    current: EnergyProfileV2 | None = None,
) -> dict[str, Any]:
    service = EnergyDiscoveryService(hass)
    if preferences is None:
        return await service.async_discover(current)
    hass.config.components.add("energy")
    with patch(ENERGY_MANAGER, new=AsyncMock(return_value=SimpleNamespace(data=preferences))):
        return await service.async_discover(current)


def _devices(result: dict[str, Any], module: str) -> list[dict[str, Any]]:
    return [d for d in result["v2"]["devices"] if d["module"] == module]


def _by_ha(result: dict[str, Any], module: str, ha_device_id: str) -> dict[str, Any]:
    return next(d for d in _devices(result, module) if d["ha_device_id"] == ha_device_id)


def _inverter(hass: HomeAssistant, index: int) -> tuple[str, str, str]:
    device = _device(hass, f"Inverter {index}")
    power = _sensor(hass, f"inverter_{index}_power", device_id=device, value=str(1000 * index))
    meter = _meter(hass, f"inverter_{index}_energy", device_id=device)
    return device, power, meter


def _solar_sources(*meters_: str) -> dict[str, Any]:
    # Home Assistant 2025.1: solar sources carry energy statistics only.
    return {"energy_sources": [{"type": "solar", "stat_energy_from": m} for m in meters_]}


# --- One and several inverters ---------------------------------------------------------------


async def test_one_inverter_with_power_and_meter_is_one_proposed_device(hass: HomeAssistant) -> None:
    device = _device(hass, "Inverter Tetto")
    power = _sensor(hass, "inverter_power", device_id=device, value="2500")
    meter = _meter(hass, "inverter_energy", device_id=device)

    result = await _discover(hass, _solar_sources(meter))

    assert set(result) == A0_KEYS | {"v2"}
    # The A0 draft is unchanged.
    assert result["suggested_profile"] == {"modules": {"solar": {"sensors": {"production_power": power}}}}
    v2 = result["v2"]
    [solar] = v2["devices"]
    assert solar | {"power": None, "energy": None, "warnings": None} == {
        "key": f"solar:dev:{device}", "module": "solar", "status": "new", "device_id": "solar-1",
        "ha_device_id": device, "name": "Inverter Tetto", "integration": "test", "confidence": "high",
        "eligible": True, "power": None, "energy": None, "additions": [], "corrections": [], "warnings": None,
    }
    assert solar["power"] == [{
        "role": "production_power", "entity_id": power, "confidence": "medium",
        "evidence": ["device_class", "energy_dashboard_device", "measurement_state_class"],
        "sign_convention": None, "requires": [],
    }]
    assert solar["energy"] == [{
        "role": "production_energy", "statistic_ids": [meter], "confidence": "high",
        "evidence": ["energy_dashboard"], "statuses": ["recorder_unavailable"],
    }]
    # Without the Recorder the meter is kept, flagged as not verified yet.
    assert solar["warnings"] == [{"code": "meter_not_verified_yet", "role": "production_energy", "ids": [meter]}]
    assert v2["verification"] == "incomplete" and v2["recorder"] == "unavailable"
    assert v2["suggested_plant"] == {"solar": {"devices": [{
        "id": "solar-1", "name": "Inverter Tetto", "ha_device_id": device,
        "power": {"sensors": {"production_power": power}},
        "energy": {"production_energy": [meter]},
    }]}}
    parse_profile_v2({"plant": v2["suggested_plant"]})
    assert v2["profile"] == {"configured": False, "revision": 0, "load_error": False}


@pytest.mark.parametrize("count", [2, 3])
async def test_several_inverters_are_separate_devices_never_summed_into_one(
    hass: HomeAssistant, count: int
) -> None:
    inverters = [_inverter(hass, index) for index in range(1, count + 1)]

    result = await _discover(hass, _solar_sources(*(meter for _, _, meter in inverters)))

    devices = _devices(result, "solar")
    assert len(devices) == count
    assert {d["device_id"] for d in devices} == {f"solar-{i}" for i in range(1, count + 1)}
    for device, power, meter in inverters:
        proposal = _by_ha(result, "solar", device)
        assert [p["entity_id"] for p in proposal["power"]] == [power]
        assert [e["statistic_ids"] for e in proposal["energy"]] == [[meter]]
    plant = result["v2"]["suggested_plant"]
    assert len(plant["solar"]["devices"]) == count and "total" not in plant["solar"]
    assert result["v2"]["totals"] == []
    parse_profile_v2({"plant": plant})


async def test_a_hybrid_inverter_gives_one_proposal_per_flow(hass: HomeAssistant) -> None:
    device = _device(hass, "Hybrid")
    pv = _sensor(hass, "hybrid_pv_power", device_id=device)
    soc = _sensor(hass, "hybrid_battery_soc", unit="%", device_class="battery", value="55")
    er.async_get(hass).async_update_entity(soc, device_id=device)
    pv_meter = _meter(hass, "hybrid_pv_energy", device_id=device)
    charge = _meter(hass, "hybrid_battery_charge", device_id=device)
    discharge = _meter(hass, "hybrid_battery_discharge", device_id=device)

    result = await _discover(hass, {"energy_sources": [
        {"type": "solar", "stat_energy_from": pv_meter},
        {"type": "battery", "stat_energy_from": discharge, "stat_energy_to": charge},
    ]})

    solar, battery = _by_ha(result, "solar", device), _by_ha(result, "battery", device)
    assert [p["entity_id"] for p in solar["power"]] == [pv]
    assert [p["entity_id"] for p in battery["power"]] == [soc]
    assert {e["role"]: e["statistic_ids"] for e in battery["energy"]} == {
        "charge_energy": [charge], "discharge_energy": [discharge],
    }
    parse_profile_v2({"plant": result["v2"]["suggested_plant"]})


# --- Batteries and wallboxes ------------------------------------------------------------------


def _battery(hass: HomeAssistant, index: int) -> dict[str, str]:
    device = _device(hass, f"Batteria {index}")
    return {
        "device": device,
        "soc": _sensor(hass, f"battery_{index}_soc", unit="%", device_class="battery", value="60", device_id=device),
        "power": _sensor(hass, f"battery_{index}_power", value="-300", device_id=device),
        "charge": _meter(hass, f"battery_{index}_charged", device_id=device),
        "discharge": _meter(hass, f"battery_{index}_discharged", device_id=device),
    }


async def test_several_batteries_stay_separate_and_signed_power_needs_confirmation(
    hass: HomeAssistant,
) -> None:
    batteries = [_battery(hass, 1), _battery(hass, 2)]

    result = await _discover(hass, {"energy_sources": [
        {"type": "battery", "stat_energy_from": b["discharge"], "stat_energy_to": b["charge"]} for b in batteries
    ]})

    plant = result["v2"]["suggested_plant"]
    assert {d["ha_device_id"] for d in plant["battery"]["devices"]} == {b["device"] for b in batteries}
    for battery in batteries:
        proposal = _by_ha(result, "battery", battery["device"])
        net = next(p for p in proposal["power"] if p["role"] == "net_power")
        # 2025.1 has no sign convention to read: the user must confirm it.
        assert (net["entity_id"], net["requires"], net["sign_convention"]) == (battery["power"], ["sign_convention"], None)
        assert {"code": "requires_sign_convention", "role": "net_power", "ids": [battery["power"]]} in proposal["warnings"]
        document = next(d for d in plant["battery"]["devices"] if d["ha_device_id"] == battery["device"])
        # Capacity is unknown and stays unknown; no aggregate state of charge.
        assert document["power"] == {"sensors": {"state_of_charge": battery["soc"]}}
        assert document["energy"] == {"discharge_energy": [battery["discharge"]], "charge_energy": [battery["charge"]]}
        assert "capacity" not in document


async def test_a_verified_battery_convention_from_newer_home_assistant_is_kept(hass: HomeAssistant) -> None:
    battery = _battery(hass, 1)

    # Home Assistant 2026.2 adds power_config to battery sources.
    result = await _discover(hass, {"energy_sources": [{
        "type": "battery", "stat_energy_from": battery["discharge"], "stat_energy_to": battery["charge"],
        "power_config": {"stat_rate_inverted": battery["power"]},
    }]})

    document = result["v2"]["suggested_plant"]["battery"]["devices"][0]
    assert document["power"] == {
        "sensors": {"state_of_charge": battery["soc"], "net_power": battery["power"]},
        "sign_convention": "positive_charge",
    }


async def test_wallboxes_found_by_name_are_proposed_per_device_but_never_suggested(
    hass: HomeAssistant,
) -> None:
    wallboxes = []
    for index in (1, 2):
        device = _device(hass, f"Wallbox {index}")
        power = _sensor(hass, f"wallbox_{index}_power", device_id=device, original_name="Wallbox power")
        meter = _meter(hass, f"wallbox_{index}_energy", device_id=device, original_name="Wallbox energy")
        wallboxes.append((device, power, meter))

    result = await _discover(hass)

    for index, (device, power, meter) in enumerate(wallboxes, 1):
        proposal = _by_ha(result, "wallbox", device)
        assert (proposal["confidence"], proposal["eligible"], proposal["name"]) == ("low", False, f"Wallbox {index}")
        assert [p["entity_id"] for p in proposal["power"]] == [power]
        assert [e["statistic_ids"] for e in proposal["energy"]] == [[meter]]
    assert result["v2"]["suggested_plant"] is None


# --- POWER / ENERGY, meters only, power only --------------------------------------------------


async def test_power_and_energy_are_never_exchanged(hass: HomeAssistant) -> None:
    device = _device(hass, "Inverter")
    power = _sensor(hass, "inverter_power", device_id=device)
    meter = _meter(hass, "inverter_energy_total", device_id=device)

    result = await _discover(hass, _solar_sources(meter))

    proposal = _by_ha(result, "solar", device)
    assert [p["entity_id"] for p in proposal["power"]] == [power]
    assert [e["statistic_ids"] for e in proposal["energy"]] == [[meter]]
    assert meter not in result["candidates"]
    assert power not in result["v2"]["meters"]


async def test_devices_with_meters_only_or_power_only(hass: HomeAssistant) -> None:
    battery = _device(hass, "Batteria")
    charge = _meter(hass, "storage_charged", device_id=battery)
    discharge = _meter(hass, "storage_discharged", device_id=battery)
    grid = _device(hass, "Contatore")
    grid_power = _sensor(hass, "meter_power", device_id=grid)

    result = await _discover(hass, {"energy_sources": [
        {"type": "battery", "stat_energy_from": discharge, "stat_energy_to": charge},
        # 2026.2: grid power without any grid energy statistic.
        {"type": "grid", "flow_from": [], "flow_to": [], "power": [{"stat_rate": grid_power}]},
    ]})

    plant = result["v2"]["suggested_plant"]
    assert plant["battery"]["devices"][0] == {
        "id": "battery-1", "name": "Batteria", "ha_device_id": battery,
        "energy": {"discharge_energy": [discharge], "charge_energy": [charge]},
    }
    assert plant["grid"]["devices"][0]["power"] == {
        "sensors": {"net_power": grid_power}, "sign_convention": "positive_import",
    }
    assert "energy" not in plant["grid"]["devices"][0]


# --- Tariff bands, totals and duplicates -------------------------------------------------------


def _band_meter(hass: HomeAssistant, device: str, band: str) -> str:
    return _meter(hass, f"grid_import_{band}", device_id=device, original_name=f"Energia prelevata {band.upper()}")


async def test_bands_summed_by_the_energy_dashboard_are_parts_and_the_plain_meter_overlaps(
    hass: HomeAssistant,
) -> None:
    device = _device(hass, "Contatore")
    bands = [_band_meter(hass, device, band) for band in ("f1", "f2", "f3")]
    overall = _meter(hass, "grid_import_total", device_id=device, original_name="Energia prelevata")

    result = await _discover(hass, {"energy_sources": [
        {"type": "grid", "flow_from": [{"stat_energy_from": b} for b in bands], "flow_to": []},
    ]})

    grid = _by_ha(result, "grid", device)
    assert grid["energy"][0]["statistic_ids"] == bands
    assert {"code": "parts_summed_by_energy_dashboard", "role": "import_energy", "ids": bands} in grid["warnings"]
    assert {"code": "possible_overlap", "role": "import_energy", "ids": [overall]} in grid["warnings"]
    assert result["v2"]["suggested_plant"]["grid"]["devices"][0]["energy"] == {"import_energy": bands}


def _binding(id_: str, role: str, module: EnergyModule = EnergyModule.GRID, **kwargs: Any) -> Binding:
    kind = "power" if role.endswith("_power") or role == "state_of_charge" else "energy"
    kwargs.setdefault("ha_device_id", "meter_device")
    kwargs.setdefault("confidence", "medium")
    kwargs.setdefault("evidence", ("same_device",))
    tokens = kwargs.pop("tokens", frozenset(id_.split("_")))
    return Binding(kind=kind, module=module, role=role, id=id_, tokens=tokens, **kwargs)


def _build(bindings: list[Binding], current: EnergyProfileV2 | None = None, **kwargs: Any) -> dict[str, Any]:
    ids = {b.id for b in bindings if b.kind == "energy"}
    report = MeterReport(True, {i: MeterInfo(i, MeterStatus.VALID) for i in ids}, complete=True)
    return build_plant_proposals(
        bindings, devices={}, group_sums=kwargs.pop("group_sums", {}),
        current=current or EnergyProfileV2(), report=report, **kwargs,
    )


def test_band_meters_without_the_dashboard_need_confirmation_or_a_choice() -> None:
    bands = [_binding(f"sensor.import_f{i}", "import_energy") for i in (1, 2, 3)]
    result = _build(bands)
    [grid] = result["devices"]
    assert grid["energy"][0]["statistic_ids"] == ["sensor.import_f1", "sensor.import_f2", "sensor.import_f3"]
    assert {"code": "parts_disjointness_unconfirmed", "role": "import_energy",
            "ids": ["sensor.import_f1", "sensor.import_f2", "sensor.import_f3"]} in grid["warnings"]

    # Bands next to a plain meter: either the total or the bands, never both.
    result = _build([*bands, _binding("sensor.import_all", "import_energy")])
    assert result["devices"][0]["energy"] == []
    [ambiguity] = result["ambiguous"]
    assert ambiguity["reason"] == "total_or_bands"
    assert ambiguity["alternatives"] == [["sensor.import_all"], ["sensor.import_f1", "sensor.import_f2", "sensor.import_f3"]]
    assert result["suggested_plant"] is None


def test_a_lifetime_meter_is_preferred_to_a_daily_one_and_two_plain_meters_are_a_choice() -> None:
    result = _build([_binding("sensor.pv_energy_today", "production_energy", EnergyModule.SOLAR),
                     _binding("sensor.pv_energy_lifetime", "production_energy", EnergyModule.SOLAR)])
    [solar] = result["devices"]
    assert solar["energy"][0]["statistic_ids"] == ["sensor.pv_energy_lifetime"]
    assert {"code": "alternative_meters", "role": "production_energy", "ids": ["sensor.pv_energy_today"]} in solar["warnings"]

    result = _build([_binding("sensor.pv_a", "production_energy", EnergyModule.SOLAR),
                     _binding("sensor.pv_b", "production_energy", EnergyModule.SOLAR)])
    assert result["ambiguous"][0]["reason"] == "multiple_candidates"
    assert result["suggested_plant"] is None


def test_several_power_candidates_on_one_device_are_never_picked_by_name() -> None:
    # MPPT strings and the inverter total on the same device.
    result = _build([
        _binding("sensor.pv1_power", "production_power", EnergyModule.SOLAR),
        _binding("sensor.pv2_power", "production_power", EnergyModule.SOLAR),
        _binding("sensor.pv_power", "production_power", EnergyModule.SOLAR),
    ])
    assert result["devices"][0]["power"] == []
    assert result["ambiguous"] == [{
        "module": "solar", "role": "production_power", "reason": "multiple_candidates",
        "entity_ids": ["sensor.pv1_power", "sensor.pv2_power", "sensor.pv_power"],
    }]


def test_net_and_directional_power_of_equal_confidence_conflict() -> None:
    result = _build([
        _binding("sensor.grid_net", "net_power", sign_convention=SignConvention.POSITIVE_IMPORT),
        _binding("sensor.grid_in", "import_power"),
    ])
    assert result["ambiguous"][0]["reason"] == "net_and_directional_conflict"
    assert result["devices"][0]["power"] == []


async def test_a_group_helper_summing_the_inverters_is_a_verified_total(hass: HomeAssistant) -> None:
    inverters = [_inverter(hass, 1), _inverter(hass, 2)]
    helper = MockConfigEntry(domain="group", options={
        "group_type": "sensor", "type": "sum", "entities": [p for _, p, _ in inverters],
    })
    helper.add_to_hass(hass)
    total = _sensor(hass, "pv_total_power", config_entry=helper, value="3000",
                    original_name="PV total power", attributes={"entity_id": [p for _, p, _ in inverters]})

    result = await _discover(hass, _solar_sources(*(m for _, _, m in inverters)))

    [verified] = result["v2"]["totals"]
    assert verified | {"covers": None} == {
        "module": "solar", "kind": "power", "role": "production_power", "ids": [total],
        "status": "verified", "covers": None, "evidence": ["group_sum"],
    }
    assert len(verified["covers"]) == 2
    plant = result["v2"]["suggested_plant"]
    assert plant["solar"]["total"] == {"power": {"sensors": {"production_power": total}}}
    assert len(plant["solar"]["devices"]) == 2
    assert all(total not in json.dumps(d) for d in plant["solar"]["devices"])
    parse_profile_v2({"plant": plant})


async def test_presumed_totals_and_undetermined_sensors_are_reported_never_used(hass: HomeAssistant) -> None:
    inverters = [_inverter(hass, 1), _inverter(hass, 2)]
    presumed = _sensor(hass, "pv_total_power", original_name="PV total power")
    loose = _sensor(hass, "pv_string_power", original_name="PV string power")
    # A YAML group: members known, aggregation unknown.
    yaml_group = _sensor(hass, "solar_group_power", original_name="Solar group",
                         attributes={"entity_id": [p for _, p, _ in inverters]})
    result = await _discover(hass, _solar_sources(*(m for _, _, m in inverters)))

    def flagged(reason: str) -> set[str]:
        return {i for a in result["v2"]["ambiguous"] if a["reason"] == reason for i in a["entity_ids"]}

    assert flagged("presumed_total") == {presumed, yaml_group}
    assert flagged("membership_undetermined") == {loose}
    statuses = {t["ids"][0]: (t["status"], t["evidence"]) for t in result["v2"]["totals"]}
    assert statuses == {
        yaml_group: ("presumed", ["group_of_unknown_type"]),
        presumed: ("presumed", ["aggregate_keyword"]),
    }
    plant = result["v2"]["suggested_plant"]
    assert "total" not in plant["solar"]
    assert {d["ha_device_id"] for d in plant["solar"]["devices"]} == {d for d, _, _ in inverters}
    for entity_id in (presumed, loose, yaml_group):
        assert entity_id not in json.dumps(plant)


async def test_one_statistic_in_two_roles_is_never_suggested(hass: HomeAssistant) -> None:
    device = _device(hass, "Inverter")
    _sensor(hass, "inverter_power", device_id=device)
    shared = _meter(hass, "inverter_energy", device_id=device)

    result = await _discover(hass, {"energy_sources": [
        {"type": "solar", "stat_energy_from": shared},
        {"type": "battery", "stat_energy_from": shared, "stat_energy_to": "sensor.other"},
    ]})

    assert result["v2"]["suggested_plant"] is None
    assert any(a["reason"] == "invalid_combination" for a in result["v2"]["ambiguous"])


async def test_external_statistics_keep_their_source_and_no_device(hass: HomeAssistant) -> None:
    result = await _discover(hass, {"energy_sources": [
        {"type": "grid", "flow_from": [{"stat_energy_from": "opower:grid_import"}], "flow_to": []},
    ]})
    [grid] = _devices(result, "grid")
    assert (grid["key"], grid["ha_device_id"], grid["name"]) == ("grid:grp:grid:0", None, None)
    assert grid["energy"][0]["statistic_ids"] == ["opower:grid_import"]
    assert result["v2"]["meters"]["opower:grid_import"]["entity_id"] is None


# --- The Recorder ---------------------------------------------------------------------------


async def test_meters_are_checked_once_and_only_verifiable_errors_are_dropped(
    recorder_mock: Any, hass: HomeAssistant
) -> None:
    await async_setup_component(hass, "sensor", {})
    device = _device(hass, "Inverter")
    _sensor(hass, "inverter_power", device_id=device)
    pending = _meter(hass, "inverter_energy", device_id=device)
    watts = _sensor(hass, "home_power")

    with patch.object(meters, "_read_recorder", side_effect=meters._read_recorder) as read:
        result = await _discover(hass, {"energy_sources": [
            {"type": "solar", "stat_energy_from": pending},
            {"type": "grid", "flow_from": [{"stat_energy_from": "sensor.not_created"}],
             "flow_to": [{"stat_energy_to": watts}]},
        ]})
    read.assert_called_once()

    v2 = result["v2"]
    assert (v2["verification"], v2["recorder"]) == ("complete", "available")
    statuses = {key: (info["status"], info["reason"]) for key, info in v2["meters"].items()}
    assert statuses == {
        pending: ("pending", "awaiting_first_statistics"),
        "sensor.not_created": ("unknown", "not_found"),
        watts: ("incompatible", "incompatible_device_class"),
    }
    plant = v2["suggested_plant"]
    # A new meter is suggested; an unknown id or a power sensor never is.
    assert plant["solar"]["devices"][0]["energy"] == {"production_energy": [pending]}
    assert "grid" not in plant
    grid = _devices(result, "grid")
    warnings = [w for d in grid for w in d["warnings"]]
    assert {"code": "meter_unknown", "role": "import_energy", "ids": ["sensor.not_created"]} in warnings
    assert {"code": "meter_incompatible", "role": "export_energy", "ids": [watts]} in warnings


async def test_a_recorder_still_starting_keeps_meters_as_provisional(
    recorder_mock: Any, hass: HomeAssistant
) -> None:
    # The sensor recorder platform is not registered yet.
    device = _device(hass, "Inverter")
    _sensor(hass, "inverter_power", device_id=device)
    meter = _meter(hass, "inverter_energy", device_id=device)

    result = await _discover(hass, _solar_sources(meter))

    v2 = result["v2"]
    assert (v2["verification"], v2["recorder"]) == ("incomplete", "available")
    assert (v2["meters"][meter]["status"], v2["meters"][meter]["reason"]) == ("recorder_unavailable", "recorder_starting")
    assert v2["suggested_plant"]["solar"]["devices"][0]["energy"] == {"production_energy": [meter]}
    assert {"code": "meter_not_verified_yet", "role": "production_energy", "ids": [meter]} in v2["devices"][0]["warnings"]


# --- Existing profiles ------------------------------------------------------------------------


class RecordedConnection:
    def __init__(self) -> None:
        self.user = MagicMock(is_admin=True)
        self.results: dict[int, Any] = {}
        self.errors: dict[int, Any] = {}

    def send_result(self, msg_id: int, result: Any = None) -> None:
        self.results[msg_id] = result

    def send_error(self, msg_id: int, code: str, message: str, *_: Any, **__: Any) -> None:
        self.errors[msg_id] = (code, message)


async def test_a_new_discovery_on_a_v1_installation_changes_nothing(
    hass: HomeAssistant, hass_storage: dict
) -> None:
    first, power_1, meter_1 = _inverter(hass, 1)
    second, power_2, meter_2 = _inverter(hass, 2)
    hass_storage[STORAGE_KEY] = {"version": 1, "minor_version": 1, "key": STORAGE_KEY, "data": {
        "schema": "domusos-energy-profile", "version": 1, "revision": 3, "updated_at": None,
        "modules": {"solar": {"sensors": {"production_power": power_1}}}, "tariff": None,
    }}
    manager = EnergyProfileManager(hass)
    await manager.async_setup()
    hass.data.setdefault(DOMAIN, {})["energy_manager"] = manager
    before_storage = json.dumps(hass_storage, sort_keys=True)
    before_profile = manager.profile_v2
    connection = RecordedConnection()

    hass.config.components.add("energy")
    with patch(ENERGY_MANAGER, new=AsyncMock(return_value=SimpleNamespace(data=_solar_sources(meter_1, meter_2)))):
        websocket_discover(hass, connection, {"id": 1})
        await hass.async_block_till_done(wait_background_tasks=True)
    v2 = connection.results[1]["v2"]

    configured = _by_ha({"v2": v2}, "solar", first)
    assert (configured["status"], configured["device_id"]) == ("update", "solar-1")
    # The configured inverter keeps its sensor; its meter is an addition to confirm.
    assert configured["additions"] == [{"kind": "energy", "role": "production_energy", "ids": [meter_1]}]
    assert configured["corrections"] == []
    new = _by_ha({"v2": v2}, "solar", second)
    assert (new["status"], new["device_id"], new["eligible"]) == ("new", "solar-2", True)
    assert v2["profile"] == {"configured": True, "revision": 3, "load_error": False}
    devices = v2["suggested_plant"]["solar"]["devices"]
    # solar-1 exactly as configured (no meter added), solar-2 new.
    assert devices[0] == before_profile.as_document()["plant"]["solar"]["devices"][0]
    assert devices[1]["power"] == {"sensors": {"production_power": power_2}}
    assert json.dumps(hass_storage, sort_keys=True) == before_storage
    assert manager.profile_v2 is before_profile
    assert STORAGE_KEY_V2 not in hass_storage
    await manager.async_shutdown()


async def test_a_v2_installation_keeps_names_ids_capacity_and_conventions(hass: HomeAssistant) -> None:
    battery = _battery(hass, 1)
    old_soc = _sensor(hass, "old_soc", unit="%", device_class="battery", value="50")
    inverter, power, meter = _inverter(hass, 1)
    current = parse_profile_v2({"plant": {"battery": {"devices": [{
        "id": "battery-7", "name": "Accumulo garage", "ha_device_id": battery["device"],
        "capacity": {"nominal_kwh": 10, "usable_kwh": 9.5},
        "power": {"sensors": {"state_of_charge": old_soc, "net_power": battery["power"]},
                  "sign_convention": "positive_charge"},
    }]}}})
    current = EnergyProfileV2(plant=current.plant, revision=9, retired_device_ids=("solar-1",))

    result = await _discover(hass, {"energy_sources": [
        {"type": "battery", "stat_energy_from": battery["discharge"], "stat_energy_to": battery["charge"],
         "power_config": {"stat_rate": battery["power"]}},
        {"type": "solar", "stat_energy_from": meter},
    ]}, current=current)

    configured = _by_ha(result, "battery", battery["device"])
    assert configured["status"] == "update" and configured["device_id"] == "battery-7"
    assert {"kind": "power", "role": "state_of_charge", "configured": [old_soc], "proposed": [battery["soc"]]} in configured["corrections"]
    # The dashboard says positive discharge; the user chose positive charge.
    assert {"kind": "sign_convention", "role": "net_power", "configured": ["positive_charge"],
            "proposed": ["positive_discharge"]} in configured["corrections"]
    plant = result["v2"]["suggested_plant"]
    assert plant["battery"] == current.as_document()["plant"]["battery"]
    # A retired id is never given again.
    assert _by_ha(result, "solar", inverter)["device_id"] == "solar-2"
    assert plant["solar"]["devices"][0]["id"] == "solar-2"


def test_sensors_of_configured_devices_are_not_proposed_again_and_totals_block_new_devices() -> None:
    current = parse_profile_v2({"plant": {"solar": {
        "devices": [
            {"id": "solar-1", "power": {"sensors": {"production_power": "sensor.a"}}},
            {"id": "solar-2", "power": {"sensors": {"production_power": "sensor.b"}}},
        ],
        "total": {"power": {"sensors": {"production_power": "sensor.total"}}},
    }}})
    result = _build(
        [
            _binding("sensor.b", "production_power", EnergyModule.SOLAR, ha_device_id="other"),
            _binding("sensor.c", "production_power", EnergyModule.SOLAR, ha_device_id="new_inverter"),
        ],
        current=current,
    )
    reasons = [a["reason"] for a in result["ambiguous"]]
    # The new inverter may or may not be inside the configured total.
    assert "total_coverage_unknown" in reasons
    assert result["suggested_plant"] is None
    detected = {d["device_id"]: d for d in result["devices"] if d.get("detected", True)}
    assert detected["solar-2"]["status"] == "configured"
    assert {d["device_id"] for d in result["devices"] if d.get("detected") is False} == {"solar-1"}


# --- Home Assistant versions and the A0 contract --------------------------------------------------


def test_energy_dashboard_shapes_of_both_home_assistant_versions() -> None:
    v2025 = {
        "energy_sources": [
            {"type": "grid", "flow_from": [{"stat_energy_from": "sensor.f1"}, {"stat_energy_from": "sensor.f2"}],
             "flow_to": [{"stat_energy_to": "sensor.out"}], "cost_adjustment_day": 0},
            {"type": "solar", "stat_energy_from": "sensor.pv", "config_entry_solar_forecast": None},
            {"type": "battery", "stat_energy_from": "sensor.bat_out", "stat_energy_to": "sensor.bat_in"},
            {"type": "gas", "stat_energy_from": "sensor.gas"},
        ],
        "device_consumption": [{"stat_consumption": "sensor.wallbox", "name": None}],
    }
    evidence = parse_energy_dashboard(v2025)
    assert [(m.module.value, m.role, m.statistic_id, m.group) for m in evidence.meters] == [
        ("grid", "import_energy", "sensor.f1", "grid:0"),
        ("grid", "import_energy", "sensor.f2", "grid:0"),
        ("grid", "export_energy", "sensor.out", "grid:0"),
        ("solar", "production_energy", "sensor.pv", "solar:1"),
        ("battery", "discharge_energy", "sensor.bat_out", "battery:2"),
        ("battery", "charge_energy", "sensor.bat_in", "battery:2"),
    ]
    assert evidence.groups == {}
    assert evidence.consumers == ["sensor.wallbox"]

    v2026 = copy.deepcopy(v2025)
    v2026["energy_sources"][0]["power"] = [{"power_config": {"stat_rate_from": "sensor.in_w", "stat_rate_to": "sensor.out_w"}}]
    v2026["energy_sources"][1]["stat_rate"] = "sensor.pv_w"
    v2026["energy_sources"][2]["power_config"] = {"stat_rate": "sensor.bat_w"}
    v2026["device_consumption"][0] |= {"stat_rate": "sensor.wallbox_w", "included_in_stat": "sensor.house"}
    v2026["device_consumption_water"] = []
    evidence = parse_energy_dashboard(v2026)
    assert len(evidence.meters) == 6
    assert evidence.groups == {
        "sensor.in_w": "grid:0", "sensor.out_w": "grid:0", "sensor.pv_w": "solar:1", "sensor.bat_w": "battery:2",
    }
    for malformed in ({}, {"energy_sources": "x"}, {"energy_sources": [None, {"type": "grid", "flow_from": "x"}]}):
        assert parse_energy_dashboard(malformed).meters == []


async def test_discovery_without_any_energy_hardware_keeps_the_a0_shape(hass: HomeAssistant) -> None:
    result = await _discover(hass)
    assert set(result) == A0_KEYS | {"v2"}
    assert result["suggested_profile"] == {"modules": {}}
    assert result["v2"]["devices"] == [] and result["v2"]["suggested_plant"] is None
    assert result["v2"]["ambiguous"] == [] and result["v2"]["totals"] == []
