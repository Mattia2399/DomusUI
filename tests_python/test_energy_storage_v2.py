"""Persistent Energy Profile v2: loading, first save, rollback and compatibility.

These tests use Home Assistant's real Store (backed by the in-memory
``hass_storage``), so documents go through JSON serialization, the Store
version checks and a fresh load on every manager instance, like a restart.
"""

import asyncio
import copy
import json
import os
import sys
from collections.abc import Mapping
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from freezegun.api import FrozenDateTimeFactory
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import Unauthorized
from homeassistant.helpers import storage
from homeassistant.util import dt as dt_util

from custom_components.domusos.const import DOMAIN
from custom_components.domusos.core._values import utc_now
from custom_components.domusos.energy.adapter import EnergyModuleAdapter, derive_home_consumption
from custom_components.domusos.energy.api import websocket_get_profile, websocket_save_profile
from custom_components.domusos.energy.context import async_energy_state
from custom_components.domusos.energy.manager import REJECTED_STORAGE_KEY, EnergyProfileManager
from custom_components.domusos.energy.models import (
    STORAGE_KEY,
    EnergyConflictError,
    EnergyModule,
    EnergyProfileRequiresV2Error,
    EnergyValidationError,
    ModuleStatus,
    parse_stored_profile,
)
from custom_components.domusos.energy.profile_v2 import STORAGE_KEY_V2
from custom_components.domusos.energy.tariff import tariff_state

POWER = {"device_class": "power", "state_class": "measurement", "unit_of_measurement": "W"}
SOC = {"device_class": "battery", "unit_of_measurement": "%"}
TARIFF = {
    "scheme": "three_band",
    "prices": {"f1": 0.31, "f2": 0.27, "f3": 0.22},
    "fixed_monthly": 9.5,
    "vat_percent": 10,
    "export_price": 0.09,
}
V1_COMPLETE = {
    "schema": "domusos-energy-profile",
    "version": 1,
    "revision": 6,
    "updated_at": "2026-10-04T08:00:00+00:00",
    "modules": {
        "grid": {"sensors": {"net_power": "sensor.meter"}, "sign_convention": "positive_import"},
        "solar": {"sensors": {"production_power": "sensor.pv"}},
        "battery": {
            "sensors": {"state_of_charge": "sensor.soc", "net_power": "sensor.bat"},
            "sign_convention": "positive_charge",
        },
        "wallbox": {"sensors": {"charging_power": "sensor.wb"}},
    },
    "tariff": TARIFF,
}
OTHER_STORES = {
    "domusos.irrigation": {"version": 1, "minor_version": 1, "key": "domusos.irrigation", "data": {"zones": [1, 2]}},
    "domusos.calendar": {"version": 1, "minor_version": 1, "key": "domusos.calendar", "data": {"events": []}},
}


def _entry(key: str, data: Any) -> dict[str, Any]:
    return {"version": 1, "minor_version": 1, "key": key, "data": copy.deepcopy(data)}


def _snapshot(storage: dict[str, Any]) -> str:
    """Byte-exact serialization of the whole store."""
    return json.dumps(storage, sort_keys=True)


def _seed(storage: dict[str, Any], v1: Any = None, v2: Any = None) -> None:
    storage.update(copy.deepcopy(OTHER_STORES))
    if v1 is not None:
        storage[STORAGE_KEY] = _entry(STORAGE_KEY, v1)
    if v2 is not None:
        storage[STORAGE_KEY_V2] = _entry(STORAGE_KEY_V2, v2)


def _set_states(hass: HomeAssistant) -> None:
    hass.states.async_set("sensor.meter", "-420", POWER)
    hass.states.async_set("sensor.pv", "5200", POWER)
    hass.states.async_set("sensor.soc", "68", SOC)
    hass.states.async_set("sensor.bat", "1600", POWER)
    hass.states.async_set("sensor.wb", "0", POWER)


async def _manager(hass: HomeAssistant) -> EnergyProfileManager:
    manager = EnergyProfileManager(hass)
    await manager.async_setup()
    return manager


def _v2_plant(**extra: Any) -> dict[str, Any]:
    return {
        "solar": {
            "devices": [
                {"id": "solar-1", "name": "Tetto", "power": {"sensors": {"production_power": "sensor.pv"}}, **extra}
            ]
        }
    }


# --- Loading ---------------------------------------------------------------------------


async def test_v1_only_is_converted_in_memory_without_any_write(hass: HomeAssistant, hass_storage: dict) -> None:
    _seed(hass_storage, v1=V1_COMPLETE)
    before = _snapshot(hass_storage)
    _set_states(hass)

    manager = await _manager(hass)
    result = manager.profile_result()
    await async_energy_state(manager)
    await _manager(hass)  # a second start reads again

    assert _snapshot(hass_storage) == before
    assert STORAGE_KEY_V2 not in hass_storage
    assert result["profile"]["revision"] == 6
    assert result["profile"]["modules"] == V1_COMPLETE["modules"]
    assert result["profile"]["tariff"]["prices"] == TARIFF["prices"]
    assert result["v1_compatible"] is True
    assert result["profile_v2"]["migrated_from"] == {"version": 1, "revision": 6, "updated_at": V1_COMPLETE["updated_at"]}
    assert result["legacy_v1"] == {"valid": True, "revision": 6, "updated_at": V1_COMPLETE["updated_at"], "diverged": False}
    assert result["runtime"] == {"supported": True, "reason": None}


async def test_no_profile_stays_unconfigured_and_writes_nothing(hass: HomeAssistant, hass_storage: dict) -> None:
    _seed(hass_storage)
    before = _snapshot(hass_storage)

    manager = await _manager(hass)
    state = await async_energy_state(manager)

    assert state["configured"] is False
    assert manager.profile_result()["legacy_v1"] is None
    assert manager.profile_result()["profile"]["modules"] == {}
    assert _snapshot(hass_storage) == before


async def test_invalid_v1_disables_energy_and_is_never_rewritten(hass: HomeAssistant, hass_storage: dict) -> None:
    broken = {**V1_COMPLETE, "modules": {"grid": {"sensors": {"net_power": "sensor.meter"}}}}
    _seed(hass_storage, v1=broken)
    before = _snapshot(hass_storage)

    manager = await _manager(hass)

    assert manager.load_error is True
    assert manager.profile.is_empty
    # The revision of the unreadable document is kept, so stale clients still conflict.
    assert manager.profile_v2.revision == 6
    assert manager.profile_result()["legacy_v1"]["valid"] is False
    assert _snapshot(hass_storage) == before

    with pytest.raises(EnergyConflictError):
        await manager.async_save_profile({"modules": {}}, 0)
    await manager.async_save_profile({"modules": {"solar": {"sensors": {"production_power": "sensor.pv"}}}}, 6)
    assert hass_storage[STORAGE_KEY] == before_entry(before, STORAGE_KEY)
    assert hass_storage[STORAGE_KEY_V2]["data"]["revision"] == 7
    # The same report before and after a restart.
    assert manager.profile_result()["legacy_v1"] == (await _manager(hass)).profile_result()["legacy_v1"]


def before_entry(snapshot: str, key: str) -> dict:
    return json.loads(snapshot)[key]


@pytest.fixture
def storage_dir(hass: HomeAssistant, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """A real ``.storage`` directory for files Home Assistant cannot decode."""
    hass.config.config_dir = str(tmp_path)
    if sys.platform == "win32":
        # Home Assistant runs on Linux; its timestamped name is not a Windows file name.
        rename = os.rename

        def windows_rename(src: str, dst: str) -> None:
            folder, name = os.path.split(dst)
            rename(src, os.path.join(folder, name.replace(":", "-")))

        monkeypatch.setattr(storage.os, "rename", windows_rename)
    path = tmp_path / ".storage"
    path.mkdir()
    return path


async def test_an_undecodable_v2_file_is_never_replaced_by_v1(
    hass: HomeAssistant, hass_storage: dict, storage_dir: Path
) -> None:
    _seed(hass_storage, v1=V1_COMPLETE)
    (storage_dir / STORAGE_KEY_V2).write_text('{"version": 1, "data": {"revision"', encoding="utf-8")
    manager = EnergyProfileManager(hass)
    # Read this one file from disk, as Home Assistant does outside tests.
    manager.store_v2.async_load = manager.store_v2._async_load_data
    await manager.async_setup()

    # Home Assistant moved the file aside and loaded nothing; that is not "no v2".
    assert not (storage_dir / STORAGE_KEY_V2).exists()
    assert [path.name.startswith(f"{STORAGE_KEY_V2}.corrupt.") for path in storage_dir.iterdir()] == [True]
    assert manager.load_error is True
    assert manager.profile.is_empty
    assert manager.profile_v2.revision == 6

    # Every later start still refuses to fall back to v1.
    again = await _manager(hass)
    assert again.load_error is True
    assert again.profile.is_empty
    v1_before = json.dumps(hass_storage[STORAGE_KEY], sort_keys=True)

    await again.async_save_profile({"modules": {"solar": {"sensors": {"production_power": "sensor.pv"}}}}, 6)
    recovered = await _manager(hass)
    assert recovered.load_error is False
    assert recovered.profile_v2.revision == 7
    assert json.dumps(hass_storage[STORAGE_KEY], sort_keys=True) == v1_before


async def test_an_undecodable_v1_file_is_reported_not_shown_as_unconfigured(
    hass: HomeAssistant, hass_storage: dict, storage_dir: Path
) -> None:
    _seed(hass_storage)
    (storage_dir / f"{STORAGE_KEY}.corrupt.2026-10-06T09-00-00").write_text("{", encoding="utf-8")

    manager = await _manager(hass)

    assert manager.load_error is True
    assert (await async_energy_state(manager))["load_error"] is True
    assert manager.profile_result()["legacy_v1"]["valid"] is False
    assert STORAGE_KEY_V2 not in hass_storage


async def test_invalid_v2_never_falls_back_to_v1_nor_gets_overwritten_on_load(
    hass: HomeAssistant, hass_storage: dict
) -> None:
    corrupt = {"schema": "domusos-energy-profile", "version": 2, "revision": 9, "plant": {"solar": "broken"}}
    _seed(hass_storage, v1=V1_COMPLETE, v2=corrupt)
    before = _snapshot(hass_storage)

    manager = await _manager(hass)

    assert manager.load_error is True
    assert manager.profile.is_empty
    assert manager.profile_v2.revision == 9
    assert (await async_energy_state(manager))["load_error"] is True
    assert _snapshot(hass_storage) == before

    # An explicit save recovers, after keeping the unreadable document aside.
    await manager.async_save_profile({"modules": {"solar": {"sensors": {"production_power": "sensor.pv"}}}}, 9)
    assert hass_storage[REJECTED_STORAGE_KEY]["data"] == corrupt
    assert hass_storage[STORAGE_KEY_V2]["data"]["revision"] == 10
    assert hass_storage[STORAGE_KEY] == before_entry(before, STORAGE_KEY)
    assert manager.load_error is False


# --- First write, restart and rollback ------------------------------------------------------


async def test_first_save_writes_v2_only_and_keeps_v1_byte_for_byte(hass: HomeAssistant, hass_storage: dict) -> None:
    _seed(hass_storage, v1=V1_COMPLETE)
    v1_before = json.dumps(hass_storage[STORAGE_KEY], sort_keys=True)
    others_before = json.dumps({key: hass_storage[key] for key in OTHER_STORES}, sort_keys=True)
    manager = await _manager(hass)

    result = await manager.async_save_profile({"modules": V1_COMPLETE["modules"]}, 6)

    assert json.dumps(hass_storage[STORAGE_KEY], sort_keys=True) == v1_before
    assert json.dumps({key: hass_storage[key] for key in OTHER_STORES}, sort_keys=True) == others_before
    assert set(hass_storage) == {STORAGE_KEY, STORAGE_KEY_V2, *OTHER_STORES}
    stored = hass_storage[STORAGE_KEY_V2]["data"]
    assert stored["version"] == 2
    assert stored["revision"] == 7
    assert stored["migrated_from"] == {"version": 1, "revision": 6, "updated_at": V1_COMPLETE["updated_at"]}
    # A save without a tariff key keeps the tariff; signed wiring and ids carry over.
    assert stored["tariff"]["prices"] == TARIFF["prices"]
    assert stored["plant"]["battery"]["devices"][0]["power"]["sign_convention"] == "positive_charge"
    assert stored["plant"]["grid"]["devices"][0]["power"]["sign_convention"] == "positive_import"
    assert [plan["devices"][0]["id"] for plan in stored["plant"].values()] == ["grid-1", "solar-1", "battery-1", "wallbox-1"]
    assert result["profile"]["revision"] == 7
    assert result["profile"]["modules"] == V1_COMPLETE["modules"]


async def test_restart_reads_v2_and_never_rebuilds_it_from_v1(hass: HomeAssistant, hass_storage: dict) -> None:
    _seed(hass_storage, v1=V1_COMPLETE)
    first = await _manager(hass)
    await first.async_save_profile({"modules": {"solar": {"sensors": {"production_power": "sensor.pv"}}}}, 6)
    await first.async_shutdown()
    before = _snapshot(hass_storage)

    second = await _manager(hass)
    third = await _manager(hass)

    assert second.profile_v2 == third.profile_v2
    assert second.profile_v2.revision == 7
    assert set(second.profile_v2.plant) == {EnergyModule.SOLAR}
    assert second.profile_result()["legacy_v1"]["diverged"] is False
    assert _snapshot(hass_storage) == before


async def test_downgrade_then_upgrade_keeps_v2_and_reports_v1_changes(hass: HomeAssistant, hass_storage: dict) -> None:
    # 1-3: v1 user upgrades and saves once: v2 is written, v1 stays frozen.
    _seed(hass_storage, v1=V1_COMPLETE)
    upgraded = await _manager(hass)
    await upgraded.async_save_profile({"modules": {"solar": {"sensors": {"production_power": "sensor.pv"}}}}, 6)
    await upgraded.async_shutdown()

    # 4-5: the previous Domus UI only knows v1: it reads the frozen document...
    old_view = parse_stored_profile(hass_storage[STORAGE_KEY]["data"])
    assert old_view.as_document() == parse_stored_profile(V1_COMPLETE).as_document()
    # ...and its own save rewrites v1 only.
    changed = {**V1_COMPLETE, "revision": 7, "updated_at": "2026-10-06T09:00:00+00:00", "modules": {"grid": V1_COMPLETE["modules"]["grid"]}}
    hass_storage[STORAGE_KEY] = _entry(STORAGE_KEY, changed)
    before = _snapshot(hass_storage)

    # 6-7: upgrading again keeps v2 authoritative and does not merge v1.
    again = await _manager(hass)

    assert set(again.profile_v2.plant) == {EnergyModule.SOLAR}
    assert again.profile_v2.revision == 7
    legacy = again.profile_result()["legacy_v1"]
    assert legacy == {"valid": True, "revision": 7, "updated_at": "2026-10-06T09:00:00+00:00", "diverged": True}
    assert _snapshot(hass_storage) == before


async def test_v2_written_without_a_migration_reports_a_later_v1_as_diverged(hass: HomeAssistant, hass_storage: dict) -> None:
    _seed(hass_storage)
    manager = await _manager(hass)
    await manager.async_save_profile({"modules": {"solar": {"sensors": {"production_power": "sensor.pv"}}}}, 0)
    hass_storage[STORAGE_KEY] = _entry(STORAGE_KEY, V1_COMPLETE)

    again = await _manager(hass)

    assert again.profile_v2.migrated_from is None
    assert again.profile_result()["legacy_v1"]["diverged"] is True


# --- Conflicts and failures -----------------------------------------------------------------


async def test_concurrent_saves_with_the_same_revision_let_only_one_win(hass: HomeAssistant, hass_storage: dict) -> None:
    _seed(hass_storage, v1=V1_COMPLETE)
    manager = await _manager(hass)
    solar = {"modules": {"solar": {"sensors": {"production_power": "sensor.pv"}}}}
    wallbox = {"modules": {"wallbox": {"sensors": {"charging_power": "sensor.wb"}}}}

    results = await asyncio.gather(
        manager.async_save_profile(solar, 6),
        manager.async_save_profile(wallbox, 6),
        return_exceptions=True,
    )

    assert sum(isinstance(result, EnergyConflictError) for result in results) == 1
    assert hass_storage[STORAGE_KEY_V2]["data"]["revision"] == 7
    # Saving the same content twice still moves the revision once per save.
    await manager.async_save_profile(solar, 7)
    await manager.async_save_profile(solar, 8)
    assert manager.profile_v2.revision == 9


async def test_reads_during_a_save_see_the_previous_profile_until_it_is_stored(
    hass: HomeAssistant, hass_storage: dict
) -> None:
    _seed(hass_storage, v1=V1_COMPLETE)
    manager = await _manager(hass)
    release = asyncio.Event()
    original = manager.store_v2.async_save

    async def slow_save(data: dict) -> None:
        await release.wait()
        await original(data)

    manager.store_v2.async_save = slow_save
    task = asyncio.create_task(manager.async_save_profile({"modules": {}}, 6))
    await asyncio.sleep(0)

    assert manager.profile_result()["profile"]["revision"] == 6
    assert set(manager.profile_v2.plant) == {EnergyModule.GRID, EnergyModule.SOLAR, EnergyModule.BATTERY, EnergyModule.WALLBOX}
    release.set()
    await task
    assert manager.profile_result()["profile"]["revision"] == 7


async def test_a_failed_write_changes_nothing(hass: HomeAssistant, hass_storage: dict) -> None:
    _seed(hass_storage, v1=V1_COMPLETE)
    manager = await _manager(hass)
    before_profile = manager.profile_v2
    before = _snapshot(hass_storage)
    manager.store_v2.async_save = AsyncMock(side_effect=OSError("disk full"))

    with pytest.raises(OSError):
        await manager.async_save_profile({"modules": {}}, 6)

    assert manager.profile_v2 == before_profile
    assert manager.profile_v2.revision == 6
    assert _snapshot(hass_storage) == before


# --- v1 clients and destructive saves -------------------------------------------------------


async def test_v1_saves_are_refused_when_they_would_drop_v2_data(hass: HomeAssistant, hass_storage: dict) -> None:
    _seed(hass_storage)
    manager = await _manager(hass)
    await manager.async_save_profile({"plant": _v2_plant()}, 0, version=2)
    before = _snapshot(hass_storage)

    result = manager.profile_result()
    assert result["profile"] is None
    assert result["v1_compatible"] is False
    assert result["profile_v2"]["plant"]["solar"]["devices"][0]["name"] == "Tetto"
    with pytest.raises(EnergyProfileRequiresV2Error):
        await manager.async_save_profile({"modules": {"solar": {"sensors": {"production_power": "sensor.pv"}}}}, 1)
    assert _snapshot(hass_storage) == before


async def test_a_partial_v2_save_cannot_wipe_the_plant(hass: HomeAssistant, hass_storage: dict) -> None:
    _seed(hass_storage)
    manager = await _manager(hass)
    await manager.async_save_profile({"plant": _v2_plant(), "tariff": TARIFF}, 0, version=2)

    with pytest.raises(EnergyValidationError, match="whole plant"):
        await manager.async_save_profile({"tariff": None}, 1, version=2)
    assert set(manager.profile_v2.plant) == {EnergyModule.SOLAR}


async def test_device_ids_survive_renames_and_removed_ids_are_not_reused(hass: HomeAssistant, hass_storage: dict) -> None:
    _seed(hass_storage)
    manager = await _manager(hass)
    plant = {
        "solar": {
            "devices": [
                {"id": "solar-1", "name": "Sud", "power": {"sensors": {"production_power": "sensor.inv1"}}},
                {"id": "solar-2", "name": "Ovest", "power": {"sensors": {"production_power": "sensor.inv2"}}},
            ]
        }
    }
    await manager.async_save_profile({"plant": plant}, 0, version=2)

    renamed = copy.deepcopy(plant)
    renamed["solar"]["devices"][0]["name"] = "Tetto sud"
    await manager.async_save_profile({"plant": renamed}, 1, version=2)
    assert [device.id for device in manager.profile_v2.devices] == ["solar-1", "solar-2"]

    single = {"solar": {"devices": [renamed["solar"]["devices"][0]]}}
    await manager.async_save_profile({"plant": single}, 2, version=2)
    assert hass_storage[STORAGE_KEY_V2]["data"]["retired_device_ids"] == ["solar-2"]

    reused = {"solar": {"devices": [*single["solar"]["devices"], {"id": "solar-2", "power": {"sensors": {"production_power": "sensor.new"}}}]}}
    with pytest.raises(EnergyValidationError, match="solar-2"):
        await manager.async_save_profile({"plant": reused}, 3, version=2)


async def test_a_save_never_stores_a_profile_the_next_start_would_reject(
    hass: HomeAssistant, hass_storage: dict
) -> None:
    stored = {
        "schema": "domusos-energy-profile",
        "version": 2,
        "revision": 3,
        "updated_at": None,
        "migrated_from": None,
        "plant": _v2_plant(),
        "tariff": None,
        "retired_device_ids": [f"old-{index}" for index in range(512)],
    }
    _seed(hass_storage, v2=stored)
    manager = await _manager(hass)
    before = _snapshot(hass_storage)

    with pytest.raises(EnergyValidationError, match="512 devices were removed"):
        await manager.async_save_profile({"plant": {}}, 3, version=2)

    assert _snapshot(hass_storage) == before
    assert manager.profile_v2.revision == 3


async def test_v1_clients_can_remove_and_add_back_a_module(hass: HomeAssistant, hass_storage: dict) -> None:
    _seed(hass_storage, v1=V1_COMPLETE)
    manager = await _manager(hass)

    await manager.async_save_profile({"modules": {"grid": V1_COMPLETE["modules"]["grid"]}}, 6)
    await manager.async_save_profile({"modules": V1_COMPLETE["modules"]}, 7)

    assert manager.profile_result()["profile"]["modules"] == V1_COMPLETE["modules"]
    assert manager.profile_v2.retired_device_ids == ()


# --- Websocket contract --------------------------------------------------------------------


class RecordedConnection:
    def __init__(self, *, admin: bool) -> None:
        self.user = MagicMock(is_admin=admin)
        self.results: dict[int, Any] = {}
        self.errors: dict[int, str] = {}

    def send_result(self, msg_id: int, result: Any = None) -> None:
        self.results[msg_id] = result

    def send_error(self, msg_id: int, code: str, message: str, *_: Any, **__: Any) -> None:
        self.errors[msg_id] = code

    def async_handle_exception(self, msg: dict, err: Exception) -> None:
        self.errors[msg["id"]] = type(err).__name__


async def _call(hass: HomeAssistant, handler: Any, connection: RecordedConnection, msg: dict) -> None:
    handler(hass, connection, msg)
    await hass.async_block_till_done(wait_background_tasks=True)


async def test_websocket_contract_for_both_client_generations(hass: HomeAssistant, hass_storage: dict) -> None:
    _seed(hass_storage, v1=V1_COMPLETE)
    manager = await _manager(hass)
    hass.data.setdefault(DOMAIN, {})["energy_manager"] = manager
    admin = RecordedConnection(admin=True)

    with pytest.raises(Unauthorized):
        websocket_save_profile(hass, RecordedConnection(admin=False), {"id": 1, "profile": {"modules": {}}, "expected_revision": 6})

    await _call(hass, websocket_get_profile, admin, {"id": 2})
    current = admin.results[2]
    # The current frontend reads ``profile`` exactly as before.
    assert set(current["profile"]) >= {"revision", "updated_at", "load_error", "modules", "tariff"}
    assert current["profile"]["modules"] == V1_COMPLETE["modules"]
    assert current["profile_v2"]["plant"]["grid"]["devices"][0]["id"] == "grid-1"

    await _call(hass, websocket_save_profile, admin, {"id": 3, "profile": {"modules": {}}, "profile_v2": {"plant": {}}, "expected_revision": 6})
    assert admin.errors[3] == "invalid_profile"

    await _call(hass, websocket_save_profile, admin, {"id": 4, "profile_v2": {"plant": _v2_plant()}, "expected_revision": 6})
    assert admin.results[4]["profile"] is None
    assert admin.results[4]["profile_v2"]["revision"] == 7

    await _call(hass, websocket_save_profile, admin, {"id": 5, "profile": {"modules": {}}, "expected_revision": 7})
    assert admin.errors[5] == "profile_requires_v2"
    await manager.async_shutdown()


# --- Realtime equivalence -------------------------------------------------------------------


def _legacy_state(hass: HomeAssistant, document: dict) -> dict[str, Any]:
    """The A0 projection, computed straight from the v1 document."""
    profile = parse_stored_profile(document)
    states = {module: EnergyModuleAdapter(hass, config).read() for module, config in profile.modules.items()}
    tariff = tariff_state(profile.tariff, dt_util.now())
    if not states:
        return {
            "configured": False, "load_error": False, "available": False,
            "profile_revision": profile.revision, "observed_at": utc_now().isoformat(),
            "modules": {}, "absent_modules": [module.value for module in EnergyModule],
            "offline_modules": [], "home_consumption": None, "tariff": tariff,
        }
    return _thaw({
        "configured": True, "load_error": False, "tariff": tariff,
        "available": any(state.available for state in states.values()),
        "profile_revision": profile.revision, "observed_at": utc_now().isoformat(),
        "modules": {
            module.value: {key: state.values[key] for key in ("status", "complete", "freshness", "sign_convention", "quantities")}
            for module, state in states.items()
        },
        "absent_modules": [module.value for module in profile.absent_modules],
        "offline_modules": [module.value for module, state in states.items() if state.values["status"] == ModuleStatus.OFFLINE],
        "home_consumption": derive_home_consumption(states).as_dict(),
    })


def _thaw(value: Any) -> Any:
    """Plain JSON containers, as the A0 ``get_state`` produced them."""
    if isinstance(value, Mapping):
        return {key: _thaw(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_thaw(item) for item in value]
    return value


V1_EQUIVALENCE = {
    "complete": V1_COMPLETE,
    "grid split": {**V1_COMPLETE, "modules": {"grid": {"sensors": {"import_power": "sensor.in", "export_power": "sensor.out"}}}, "tariff": None},
    "battery offline": {**V1_COMPLETE, "modules": {"battery": {"sensors": {"state_of_charge": "sensor.missing"}}}},
    "empty": {**V1_COMPLETE, "modules": {}},
}


@pytest.mark.parametrize("name", V1_EQUIVALENCE)
async def test_get_state_is_unchanged_for_v1_profiles_before_and_after_the_first_save(
    hass: HomeAssistant, hass_storage: dict, freezer: FrozenDateTimeFactory, name: str
) -> None:
    document = V1_EQUIVALENCE[name]
    _set_states(hass)
    hass.states.async_set("sensor.in", "300", POWER)
    hass.states.async_set("sensor.out", "0", POWER)
    _seed(hass_storage, v1=document)
    expected = _legacy_state(hass, document)

    manager = await _manager(hass)
    before_save = await async_energy_state(manager)
    assert before_save == expected

    await manager.async_save_profile({"modules": document["modules"]}, document["revision"])
    after_save = await async_energy_state(manager)
    assert {**after_save, "profile_revision": None} == {**expected, "profile_revision": None}
    await manager.async_shutdown()


async def test_profiles_the_realtime_cannot_serve_are_reported_not_half_shown(hass: HomeAssistant, hass_storage: dict) -> None:
    _set_states(hass)
    _seed(hass_storage)
    manager = await _manager(hass)
    two_inverters = {
        "solar": {"devices": [
            {"id": "solar-1", "power": {"sensors": {"production_power": "sensor.pv"}}},
            {"id": "solar-2", "power": {"sensors": {"production_power": "sensor.pv2"}}},
        ]},
        "grid": {"devices": [{"id": "grid-1", "power": {"sensors": {"net_power": "sensor.meter"}, "sign_convention": "positive_import"}}]},
    }
    await manager.async_save_profile({"plant": two_inverters}, 0, version=2)

    state = await async_energy_state(manager)
    assert state["configured"] is True
    assert state["unsupported_profile"] == "multiple_devices"
    assert state["available"] is False
    assert state["modules"] == {}
    assert state["home_consumption"] is None
    assert manager.profile.is_empty
    assert manager.profile_result()["runtime"] == {"supported": False, "reason": "multiple_devices"}

    meters_only = {"solar": {"devices": [{"id": "solar-1", "energy": {"production_energy": ["sensor.pv_energy"]}}]}}
    await manager.async_save_profile({"plant": meters_only}, 1, version=2)
    assert (await async_energy_state(manager))["unsupported_profile"] == "no_power_sensors"

    # A single device with v2-only details (name, meters) is still served live.
    named = {"solar": {"devices": [{"id": "solar-1", "name": "Tetto", "power": {"sensors": {"production_power": "sensor.pv"}}, "energy": {"production_energy": ["sensor.pv_energy"]}}]}}
    await manager.async_save_profile({"plant": named}, 2, version=2)
    state = await async_energy_state(manager)
    assert "unsupported_profile" not in state
    assert state["modules"]["solar"]["quantities"]["production_power"]["value"] == 5200.0
    await manager.async_shutdown()
