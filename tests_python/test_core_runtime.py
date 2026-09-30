"""Lifecycle and legacy-manager coexistence tests for DomusRuntime."""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import pytest
from homeassistant.core import HomeAssistant

from custom_components.domusos import (
    DomusEntryData,
    async_setup_entry,
    async_unload_entry,
)
from custom_components.domusos.calendar_store import DomusCalendarStore
from custom_components.domusos.const import DOMAIN, PANEL_URL_PATH
from custom_components.domusos.core import DomusRuntime, RuntimeState
from custom_components.domusos.irrigation import IrrigationManager


async def test_runtime_lifecycle_is_idempotent(hass: HomeAssistant) -> None:
    runtime = DomusRuntime(hass)

    assert runtime.state is RuntimeState.STOPPED
    await runtime.async_setup()
    await runtime.async_setup()
    assert runtime.running
    assert runtime.events.running
    assert runtime.audit.running

    await runtime.async_shutdown()
    await runtime.async_shutdown()
    assert runtime.state is RuntimeState.STOPPED
    assert not runtime.events.running
    assert not runtime.audit.running


async def test_entry_runtime_coexists_with_legacy_managers_and_unloads(
    hass: HomeAssistant,
) -> None:
    entry = SimpleNamespace(
        entry_id="domus-entry",
        runtime_data=None,
        async_on_unload=Mock(),
        add_update_listener=Mock(return_value=Mock()),
    )
    register_static_paths = AsyncMock()
    hass.http = SimpleNamespace(async_register_static_paths=register_static_paths)

    with (
        patch("custom_components.domusos.Path.is_file", return_value=True),
        patch("custom_components.domusos._panel_exists", return_value=False),
        patch(
            "custom_components.domusos.panel_custom.async_register_panel",
            new=AsyncMock(),
        ),
        patch.object(
            hass.config_entries,
            "async_forward_entry_setups",
            new=AsyncMock(),
        ),
        patch.object(
            hass.config_entries,
            "async_unload_platforms",
            new=AsyncMock(return_value=True),
        ),
        patch.object(
            IrrigationManager, "async_setup", new=AsyncMock()
        ) as irrigation_setup,
        patch.object(
            IrrigationManager, "async_shutdown", new=AsyncMock()
        ) as irrigation_shutdown,
        patch.object(
            DomusCalendarStore, "async_setup", new=AsyncMock()
        ) as calendar_setup,
        patch.object(
            DomusCalendarStore, "async_shutdown", new=AsyncMock()
        ) as calendar_shutdown,
    ):
        assert await async_setup_entry(hass, entry)

        domain_data = hass.data[DOMAIN]
        assert isinstance(entry.runtime_data, DomusEntryData)
        assert domain_data["runtime"] is entry.runtime_data.runtime
        assert (
            domain_data["irrigation_manager"] is entry.runtime_data.irrigation_manager
        )
        assert domain_data["calendar_manager"] is entry.runtime_data.calendar_manager
        assert entry.runtime_data.runtime.running
        assert entry.runtime_data.runtime.context.capabilities == frozenset(
            {"calendar", "irrigation"}
        )
        snapshot = await entry.runtime_data.runtime.context.async_snapshot()
        assert snapshot.get("calendar") == {
            "available": True,
            "next_event": None,
        }
        assert snapshot.get("irrigation")["available"] is True
        irrigation_setup.assert_awaited_once()
        calendar_setup.assert_awaited_once()

        event_types: list[str] = []
        entry.runtime_data.runtime.events.subscribe_all(
            lambda event: event_types.append(event.type)
        )
        entry.runtime_data.calendar_manager.store.async_save = AsyncMock()
        start = datetime(2099, 3, 10, 8, 0, tzinfo=timezone.utc)
        await entry.runtime_data.calendar_manager.async_create_event(
            {
                "start": start,
                "end": start + timedelta(hours=1),
                "summary": "Context transition",
            }
        )
        entry.runtime_data.irrigation_manager.store.async_save = AsyncMock()
        await entry.runtime_data.irrigation_manager.async_stop_all(None)
        await hass.async_block_till_done()
        assert event_types == ["calendar.changed", "irrigation.state_changed"]

        assert await async_unload_entry(hass, entry)

        assert "runtime" not in domain_data
        assert "irrigation_manager" not in domain_data
        assert "calendar_manager" not in domain_data
        assert domain_data["static_registered"] is True
        assert entry.runtime_data.runtime.state is RuntimeState.STOPPED
        assert entry.runtime_data.runtime.context.capabilities == frozenset()
        assert entry.runtime_data.irrigation_manager._subscribers == set()
        assert entry.runtime_data.calendar_manager._listeners == set()
        irrigation_shutdown.assert_awaited_once()
        calendar_shutdown.assert_awaited_once()


async def test_reload_replaces_providers_without_zombie_bindings(
    hass: HomeAssistant,
) -> None:
    entry = SimpleNamespace(
        entry_id="domus-entry",
        runtime_data=None,
        async_on_unload=Mock(),
        add_update_listener=Mock(return_value=Mock()),
    )
    hass.http = SimpleNamespace(async_register_static_paths=AsyncMock())

    with (
        patch("custom_components.domusos.Path.is_file", return_value=True),
        patch("custom_components.domusos._panel_exists", return_value=False),
        patch(
            "custom_components.domusos.panel_custom.async_register_panel",
            new=AsyncMock(),
        ),
        patch.object(
            hass.config_entries,
            "async_forward_entry_setups",
            new=AsyncMock(),
        ),
        patch.object(
            hass.config_entries,
            "async_unload_platforms",
            new=AsyncMock(return_value=True),
        ),
        patch.object(IrrigationManager, "async_setup", new=AsyncMock()),
        patch.object(IrrigationManager, "async_shutdown", new=AsyncMock()),
        patch.object(DomusCalendarStore, "async_setup", new=AsyncMock()),
        patch.object(DomusCalendarStore, "async_shutdown", new=AsyncMock()),
    ):
        assert await async_setup_entry(hass, entry)
        first = entry.runtime_data
        assert first.runtime.context.capabilities == frozenset(
            {"calendar", "irrigation"}
        )

        assert await async_unload_entry(hass, entry)
        assert first.irrigation_manager._subscribers == set()
        assert first.calendar_manager._listeners == set()
        assert first.runtime.state is RuntimeState.STOPPED

        assert await async_setup_entry(hass, entry)
        second = entry.runtime_data
        assert second is not first
        assert second.runtime is not first.runtime
        assert second.runtime.context.capabilities == frozenset(
            {"calendar", "irrigation"}
        )

        assert await async_unload_entry(hass, entry)
        assert second.irrigation_manager._subscribers == set()
        assert second.calendar_manager._listeners == set()


async def test_setup_failure_rolls_back_providers_before_managers(
    hass: HomeAssistant,
) -> None:
    entry = SimpleNamespace(
        entry_id="domus-entry",
        runtime_data=None,
        async_on_unload=Mock(),
        add_update_listener=Mock(return_value=Mock()),
    )
    hass.http = SimpleNamespace(async_register_static_paths=AsyncMock())
    runtime = DomusRuntime(hass)
    manager = IrrigationManager(hass)
    manager.async_setup = AsyncMock()
    calendar = DomusCalendarStore(hass)
    calendar.async_setup = AsyncMock()

    async def assert_bindings_removed() -> None:
        assert runtime.context.capabilities == frozenset()
        assert manager._subscribers == set()
        assert calendar._listeners == set()

    manager.async_shutdown = AsyncMock(side_effect=assert_bindings_removed)
    calendar.async_shutdown = AsyncMock(side_effect=assert_bindings_removed)

    with (
        patch("custom_components.domusos.Path.is_file", return_value=True),
        patch(
            "custom_components.domusos._panel_exists",
            side_effect=(False, True),
        ),
        patch("custom_components.domusos.DomusRuntime", return_value=runtime),
        patch("custom_components.domusos.IrrigationManager", return_value=manager),
        patch("custom_components.domusos.DomusCalendarStore", return_value=calendar),
        patch(
            "custom_components.domusos.panel_custom.async_register_panel",
            new=AsyncMock(),
        ),
        patch(
            "custom_components.domusos.frontend.async_remove_panel",
            new=Mock(),
        ) as remove_panel,
        patch.object(
            hass.config_entries,
            "async_forward_entry_setups",
            new=AsyncMock(side_effect=RuntimeError("platform setup failed")),
        ),
        pytest.raises(RuntimeError, match="platform setup failed"),
    ):
        await async_setup_entry(hass, entry)

    domain_data = hass.data[DOMAIN]
    assert "runtime" not in domain_data
    assert "irrigation_manager" not in domain_data
    assert "calendar_manager" not in domain_data
    assert entry.runtime_data is None
    assert runtime.state is RuntimeState.STOPPED
    assert runtime.context.capabilities == frozenset()
    assert manager._subscribers == set()
    assert calendar._listeners == set()
    manager.async_shutdown.assert_awaited_once()
    calendar.async_shutdown.assert_awaited_once()
    remove_panel.assert_called_once_with(hass, PANEL_URL_PATH)
