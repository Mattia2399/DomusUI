"""Energy manager, context provider and Domus runtime lifecycle tests."""

from collections.abc import Iterator
from contextlib import ExitStack, contextmanager
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, Mock, patch

import pytest
from homeassistant.core import HomeAssistant

from custom_components.domusos import (
    DomusEntryData,
    async_setup_entry,
    async_unload_entry,
)
from custom_components.domusos.calendar_store import DomusCalendarStore
from custom_components.domusos.const import DOMAIN
from custom_components.domusos.context_providers import (
    CalendarContextProvider,
    EnergyContextProvider,
    register_energy_bindings,
)
from custom_components.domusos.core import ContextRegistry, DomusRuntime, RuntimeState
from custom_components.domusos.energy import EnergyProfileManager, ModuleStatus
from custom_components.domusos.energy.manager import (
    CHANGE_AVAILABILITY,
    CHANGE_PROFILE,
)
from custom_components.domusos.energy.models import (
    STORAGE_KEY,
    EnergyConflictError,
    EnergyModule,
    EnergyValidationError,
)
from custom_components.domusos.irrigation import IrrigationManager

POWER = {"device_class": "power", "state_class": "measurement", "unit_of_measurement": "W"}
SOC = {"device_class": "battery", "unit_of_measurement": "%"}

GRID_AND_BATTERY = {
    "modules": {
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
}


def _set_states(hass: HomeAssistant) -> None:
    hass.states.async_set("sensor.grid_import", "600", POWER)
    hass.states.async_set("sensor.grid_export", "0", POWER)
    hass.states.async_set("sensor.battery_power", "250", POWER)
    hass.states.async_set("sensor.battery_soc", "80", SOC)


async def _manager(
    hass: HomeAssistant, document: dict[str, Any] | None = None
) -> EnergyProfileManager:
    manager = EnergyProfileManager(hass)
    manager.store.async_load = AsyncMock(return_value=document)
    manager.store.async_save = AsyncMock()
    await manager.async_setup()
    return manager


async def _configured_manager(hass: HomeAssistant) -> EnergyProfileManager:
    manager = await _manager(hass)
    await manager.async_save_profile(GRID_AND_BATTERY, expected_revision=0)
    return manager


async def test_manager_starts_empty_without_stored_profile(hass: HomeAssistant) -> None:
    manager = await _manager(hass)

    assert manager.loaded
    assert manager.profile.is_empty
    assert manager.adapters == {}
    assert set(manager.module_status.values()) == {ModuleStatus.ABSENT}
    await manager.async_shutdown()


async def test_invalid_stored_profile_disables_energy_only(hass: HomeAssistant) -> None:
    manager = await _manager(
        hass, {"schema": "domusos-energy-profile", "version": 1, "revision": "x"}
    )

    assert manager.loaded
    assert manager.load_error is True
    assert manager.profile.is_empty
    assert manager.profile_document()["load_error"] is True
    await manager.async_shutdown()


async def test_save_profile_validates_versions_and_persists(hass: HomeAssistant) -> None:
    _set_states(hass)
    manager = await _manager(hass)

    document = await manager.async_save_profile(GRID_AND_BATTERY, expected_revision=0)

    assert document["revision"] == 1
    assert document["updated_at"] is not None
    manager.store.async_save.assert_awaited_once()
    saved = manager.store.async_save.await_args.args[0]
    assert saved["modules"]["battery"]["sign_convention"] == "positive_discharge"
    assert set(manager.adapters) == {EnergyModule.GRID, EnergyModule.BATTERY}
    assert manager.module_status[EnergyModule.BATTERY] is ModuleStatus.ONLINE
    assert manager.module_status[EnergyModule.SOLAR] is ModuleStatus.ABSENT

    with pytest.raises(EnergyConflictError):
        await manager.async_save_profile(GRID_AND_BATTERY, expected_revision=0)
    with pytest.raises(EnergyValidationError):
        await manager.async_save_profile(
            {"modules": {"grid": {"sensors": {"net_power": "sensor.grid"}}}}, 1
        )
    assert manager.profile.revision == 1
    assert manager.store.async_save.await_count == 1
    await manager.async_shutdown()


async def test_stored_profile_survives_restart(hass: HomeAssistant) -> None:
    first = await _configured_manager(hass)
    stored = first.store.async_save.await_args.args[0]
    await first.async_shutdown()

    second = await _manager(hass, stored)

    assert second.profile.revision == 1
    assert second.profile.configured_modules == (EnergyModule.GRID, EnergyModule.BATTERY)
    await second.async_shutdown()


async def test_availability_changes_notify_only_on_transitions(
    hass: HomeAssistant,
) -> None:
    _set_states(hass)
    manager = await _configured_manager(hass)
    changes: list[str] = []
    manager.async_add_listener(changes.append)

    hass.states.async_set("sensor.battery_power", "300", POWER)
    await hass.async_block_till_done()
    assert changes == []

    hass.states.async_set("sensor.battery_power", "unavailable", {})
    hass.states.async_set("sensor.battery_soc", "unavailable", {})
    await hass.async_block_till_done()
    assert changes == [CHANGE_AVAILABILITY]
    assert manager.module_status[EnergyModule.BATTERY] is ModuleStatus.OFFLINE
    assert EnergyModule.BATTERY in manager.profile.configured_modules

    hass.states.async_set("sensor.battery_soc", "79", SOC)
    await hass.async_block_till_done()
    assert changes == [CHANGE_AVAILABILITY, CHANGE_AVAILABILITY]
    assert manager.module_status[EnergyModule.BATTERY] is ModuleStatus.ONLINE

    await manager.async_shutdown()
    hass.states.async_set("sensor.battery_soc", "unavailable", {})
    await hass.async_block_till_done()
    assert len(changes) == 2


async def test_profile_change_stops_tracking_removed_sensors(
    hass: HomeAssistant,
) -> None:
    _set_states(hass)
    manager = await _configured_manager(hass)
    changes: list[str] = []
    manager.async_add_listener(changes.append)

    await manager.async_save_profile(
        {"modules": {"grid": GRID_AND_BATTERY["modules"]["grid"]}}, 1
    )
    hass.states.async_set("sensor.battery_soc", "unavailable", {})
    hass.states.async_set("sensor.battery_power", "unavailable", {})
    await hass.async_block_till_done()

    assert changes == [CHANGE_PROFILE]
    assert manager.module_status[EnergyModule.BATTERY] is ModuleStatus.ABSENT
    await manager.async_shutdown()


async def test_failing_listener_does_not_block_other_listeners(
    hass: HomeAssistant,
) -> None:
    manager = await _manager(hass)
    received: list[str] = []
    manager.async_add_listener(Mock(side_effect=RuntimeError("listener failed")))
    manager.async_add_listener(received.append)

    await manager.async_save_profile(GRID_AND_BATTERY, None)

    assert received == [CHANGE_PROFILE]
    await manager.async_shutdown()


async def test_energy_context_lists_absent_and_offline_modules(
    hass: HomeAssistant,
) -> None:
    _set_states(hass)
    hass.states.async_set("sensor.battery_power", "unavailable", {})
    hass.states.async_set("sensor.battery_soc", "unavailable", {})
    manager = await _configured_manager(hass)

    context = await EnergyContextProvider(manager).async_get_context()

    assert context is not None
    assert context["available"] is True
    assert set(context["modules"]) == {"grid", "battery"}
    assert context["modules"]["battery"]["status"] == "offline"
    assert context["offline_modules"] == ("battery",)
    assert context["absent_modules"] == ("solar", "home", "wallbox")
    assert context["home_consumption"]["status"] == "unavailable"
    assert context["home_consumption"]["value"] is None
    await manager.async_shutdown()


async def test_energy_context_derives_home_consumption(hass: HomeAssistant) -> None:
    _set_states(hass)
    manager = await _configured_manager(hass)
    registry = ContextRegistry()
    await registry.async_setup()
    registry.register(EnergyContextProvider(manager))

    snapshot = await registry.async_snapshot()

    energy = snapshot.get("energy")
    assert energy["home_consumption"]["value"] == 850.0
    assert energy["home_consumption"]["source"] == "derived"
    assert energy["modules"]["grid"]["quantities"]["import_power"]["value"] == 600.0
    await manager.async_shutdown()


async def test_energy_provider_failure_is_isolated_from_other_providers(
    hass: HomeAssistant,
) -> None:
    calendar = DomusCalendarStore(hass)
    calendar.store.async_load = AsyncMock(return_value=None)
    await calendar.async_setup()
    manager = await _configured_manager(hass)
    registry = ContextRegistry()
    await registry.async_setup()
    registry.register(CalendarContextProvider(calendar))
    registry.register(EnergyContextProvider(manager))

    with patch.object(
        EnergyProfileManager,
        "adapters",
        new=property(Mock(side_effect=RuntimeError("adapter crashed"))),
    ):
        snapshot = await registry.async_snapshot()

    assert snapshot.get("calendar") == {"available": True, "next_event": None}
    assert snapshot.unavailable == frozenset({"energy"})
    await manager.async_shutdown()


async def test_bindings_register_provider_only_for_configured_homes(
    hass: HomeAssistant,
) -> None:
    _set_states(hass)
    runtime = DomusRuntime(hass)
    await runtime.async_setup()
    manager = await _manager(hass)
    events: list[str] = []
    runtime.events.subscribe_all(lambda event: events.append(event.type))

    unregister = register_energy_bindings(hass, runtime, manager)
    assert "energy" not in runtime.context.capabilities
    snapshot = await runtime.context.async_snapshot(["energy"])
    assert snapshot.missing == frozenset({"energy"})

    await manager.async_save_profile(GRID_AND_BATTERY, 0)
    await hass.async_block_till_done()
    assert "energy" in runtime.context.capabilities

    hass.states.async_set("sensor.grid_import", "unavailable", {})
    hass.states.async_set("sensor.grid_export", "unavailable", {})
    await hass.async_block_till_done()

    await manager.async_save_profile({"modules": {}}, 1)
    await hass.async_block_till_done()
    assert "energy" not in runtime.context.capabilities
    assert events == [
        "energy.profile_changed",
        "energy.availability_changed",
        "energy.profile_changed",
    ]

    await manager.async_save_profile(GRID_AND_BATTERY, 2)
    unregister()
    unregister()
    assert "energy" not in runtime.context.capabilities
    assert manager._listeners == set()
    await manager.async_shutdown()
    await runtime.async_shutdown()


@contextmanager
def _entry_environment(hass: HomeAssistant) -> Iterator[None]:
    hass.http = SimpleNamespace(async_register_static_paths=AsyncMock())
    with ExitStack() as stack:
        stack.enter_context(
            patch("custom_components.domusos.Path.is_file", return_value=True)
        )
        stack.enter_context(
            patch("custom_components.domusos._panel_exists", return_value=False)
        )
        stack.enter_context(
            patch(
                "custom_components.domusos.panel_custom.async_register_panel",
                new=AsyncMock(),
            )
        )
        stack.enter_context(
            patch.object(
                hass.config_entries, "async_forward_entry_setups", new=AsyncMock()
            )
        )
        stack.enter_context(
            patch.object(
                hass.config_entries,
                "async_unload_platforms",
                new=AsyncMock(return_value=True),
            )
        )
        stack.enter_context(
            patch.object(IrrigationManager, "async_setup", new=AsyncMock())
        )
        stack.enter_context(
            patch.object(IrrigationManager, "async_shutdown", new=AsyncMock())
        )
        stack.enter_context(
            patch.object(DomusCalendarStore, "async_setup", new=AsyncMock())
        )
        stack.enter_context(
            patch.object(DomusCalendarStore, "async_shutdown", new=AsyncMock())
        )
        yield


def _entry() -> SimpleNamespace:
    return SimpleNamespace(
        entry_id="domus-entry",
        runtime_data=None,
        async_on_unload=Mock(),
        add_update_listener=Mock(return_value=Mock()),
    )


def _stored(document: dict[str, Any]) -> dict[str, Any]:
    return {
        "version": 1,
        "minor_version": 1,
        "key": STORAGE_KEY,
        "data": {
            "schema": "domusos-energy-profile",
            "version": 1,
            "revision": 5,
            "updated_at": None,
            **document,
        },
    }


async def test_entry_lifecycle_registers_energy_with_runtime(
    hass: HomeAssistant, hass_storage: dict[str, Any]
) -> None:
    _set_states(hass)
    hass_storage[STORAGE_KEY] = _stored(GRID_AND_BATTERY)
    entry = _entry()

    with _entry_environment(hass):
        assert await async_setup_entry(hass, entry)
        data: DomusEntryData = entry.runtime_data
        manager = data.energy_manager

        assert isinstance(manager, EnergyProfileManager)
        assert hass.data[DOMAIN]["energy_manager"] is manager
        assert manager.profile.revision == 5
        assert data.runtime.context.capabilities == frozenset(
            {"calendar", "irrigation", "energy"}
        )
        snapshot = await data.runtime.context.async_snapshot()
        assert snapshot.get("energy")["home_consumption"]["value"] == 850.0

        assert await async_unload_entry(hass, entry)

    assert "energy_manager" not in hass.data[DOMAIN]
    assert not manager.loaded
    assert manager._listeners == set()
    assert manager._unsubscribe_states is None
    assert data.runtime.state is RuntimeState.STOPPED


async def test_entry_without_energy_hardware_has_no_energy_capability(
    hass: HomeAssistant,
) -> None:
    entry = _entry()

    with _entry_environment(hass):
        assert await async_setup_entry(hass, entry)
        runtime = entry.runtime_data.runtime
        snapshot = await runtime.context.async_snapshot(["energy", "calendar"])

        assert runtime.context.capabilities == frozenset({"calendar", "irrigation"})
        assert snapshot.missing == frozenset({"energy"})
        assert entry.runtime_data.energy_manager.profile.is_empty
        assert await async_unload_entry(hass, entry)


async def test_energy_setup_failure_keeps_calendar_and_irrigation(
    hass: HomeAssistant,
) -> None:
    entry = _entry()

    with (
        _entry_environment(hass),
        patch.object(
            EnergyProfileManager,
            "async_setup",
            new=AsyncMock(side_effect=RuntimeError("energy store broken")),
        ),
    ):
        assert await async_setup_entry(hass, entry)
        data: DomusEntryData = entry.runtime_data

        assert data.energy_manager is None
        assert "energy_manager" not in hass.data[DOMAIN]
        assert data.runtime.running
        assert data.runtime.context.capabilities == frozenset(
            {"calendar", "irrigation"}
        )
        assert hass.data[DOMAIN]["irrigation_manager"] is data.irrigation_manager
        assert await async_unload_entry(hass, entry)
    assert data.runtime.state is RuntimeState.STOPPED


async def test_energy_unload_failure_does_not_block_other_modules(
    hass: HomeAssistant, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORAGE_KEY] = _stored(GRID_AND_BATTERY)
    entry = _entry()

    with _entry_environment(hass):
        assert await async_setup_entry(hass, entry)
        data: DomusEntryData = entry.runtime_data
        with patch.object(
            EnergyProfileManager,
            "async_shutdown",
            new=AsyncMock(side_effect=RuntimeError("shutdown failed")),
        ):
            assert await async_unload_entry(hass, entry)

    assert "energy_manager" not in hass.data[DOMAIN]
    assert data.runtime.state is RuntimeState.STOPPED
    assert data.calendar_manager._listeners == set()
    assert data.irrigation_manager._subscribers == set()


async def test_reload_replaces_energy_manager_without_zombie_tracking(
    hass: HomeAssistant, hass_storage: dict[str, Any]
) -> None:
    _set_states(hass)
    hass_storage[STORAGE_KEY] = _stored(GRID_AND_BATTERY)
    entry = _entry()

    with _entry_environment(hass):
        assert await async_setup_entry(hass, entry)
        first = entry.runtime_data.energy_manager
        first_changes: list[str] = []
        first.async_add_listener(first_changes.append)
        assert await async_unload_entry(hass, entry)

        assert await async_setup_entry(hass, entry)
        second = entry.runtime_data.energy_manager
        assert second is not first
        assert hass.data[DOMAIN]["energy_manager"] is second
        assert "energy" in entry.runtime_data.runtime.context.capabilities

        hass.states.async_set("sensor.battery_soc", "unavailable", {})
        hass.states.async_set("sensor.battery_power", "unavailable", {})
        await hass.async_block_till_done()
        assert first_changes == []
        assert first._unsubscribe_states is None
        assert second.module_status[EnergyModule.BATTERY] is ModuleStatus.OFFLINE
        assert await async_unload_entry(hass, entry)
