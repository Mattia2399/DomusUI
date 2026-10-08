"""Domus Profile Core inside the integration lifecycle, isolated from other modules."""

from collections.abc import Iterator
from contextlib import ExitStack, contextmanager
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, Mock, patch

from homeassistant.core import HomeAssistant

from custom_components.domusos import DomusEntryData, async_setup_entry, async_unload_entry
from custom_components.domusos.calendar_store import DomusCalendarStore
from custom_components.domusos.const import DOMAIN
from custom_components.domusos.irrigation import IrrigationManager
from custom_components.domusos.profile import ProfileManager, ProfileStoreStatus
from custom_components.domusos.profile.api import DATA_PROFILE_MANAGER
from custom_components.domusos.profile.models import STORAGE_KEY


@contextmanager
def _entry_environment(hass: HomeAssistant) -> Iterator[None]:
    hass.http = SimpleNamespace(async_register_static_paths=AsyncMock())
    with ExitStack() as stack:
        stack.enter_context(patch("custom_components.domusos.Path.is_file", return_value=True))
        stack.enter_context(patch("custom_components.domusos._panel_exists", return_value=False))
        stack.enter_context(
            patch("custom_components.domusos.panel_custom.async_register_panel", new=AsyncMock())
        )
        stack.enter_context(
            patch.object(hass.config_entries, "async_forward_entry_setups", new=AsyncMock())
        )
        stack.enter_context(
            patch.object(
                hass.config_entries, "async_unload_platforms", new=AsyncMock(return_value=True)
            )
        )
        for manager in (IrrigationManager, DomusCalendarStore):
            stack.enter_context(patch.object(manager, "async_setup", new=AsyncMock()))
            stack.enter_context(patch.object(manager, "async_shutdown", new=AsyncMock()))
        yield


def _entry() -> SimpleNamespace:
    return SimpleNamespace(
        entry_id="domus-entry",
        runtime_data=None,
        async_on_unload=Mock(),
        add_update_listener=Mock(return_value=Mock()),
    )


async def test_entry_lifecycle_starts_and_releases_the_profile_core(hass: HomeAssistant) -> None:
    entry = _entry()

    with _entry_environment(hass):
        assert await async_setup_entry(hass, entry)
        data: DomusEntryData = entry.runtime_data
        manager = data.profile_manager

        assert isinstance(manager, ProfileManager)
        assert manager.status is ProfileStoreStatus.READY
        assert hass.data[DOMAIN][DATA_PROFILE_MANAGER] is manager
        assert await async_unload_entry(hass, entry)

    assert DATA_PROFILE_MANAGER not in hass.data[DOMAIN]
    assert data.profile_manager is None
    assert manager._unsubscribe_user_removed is None  # noqa: SLF001


async def test_profile_setup_failure_keeps_the_other_modules(hass: HomeAssistant) -> None:
    entry = _entry()

    with (
        _entry_environment(hass),
        patch.object(ProfileManager, "async_setup", new=AsyncMock(side_effect=RuntimeError("boom"))),
    ):
        assert await async_setup_entry(hass, entry)
        data: DomusEntryData = entry.runtime_data

        assert data.profile_manager is None
        assert DATA_PROFILE_MANAGER not in hass.data[DOMAIN]
        assert data.runtime.running
        assert hass.data[DOMAIN]["irrigation_manager"] is data.irrigation_manager
        assert hass.data[DOMAIN]["calendar_manager"] is data.calendar_manager
        assert await async_unload_entry(hass, entry)


async def test_a_corrupt_profile_store_does_not_block_setup(
    hass: HomeAssistant, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORAGE_KEY] = {
        "version": 1,
        "minor_version": 1,
        "key": STORAGE_KEY,
        "data": {"schema": "domusos-profiles", "version": 1, "profiles": "broken"},
    }
    entry = _entry()

    with _entry_environment(hass):
        assert await async_setup_entry(hass, entry)
        manager = entry.runtime_data.profile_manager

        assert manager.status is ProfileStoreStatus.CORRUPT
        assert entry.runtime_data.runtime.running
        assert await async_unload_entry(hass, entry)

    # The invalid document is still on disk exactly as it was.
    assert hass_storage[STORAGE_KEY]["data"]["profiles"] == "broken"


async def test_profile_unload_failure_does_not_block_other_modules(hass: HomeAssistant) -> None:
    entry = _entry()

    with _entry_environment(hass):
        assert await async_setup_entry(hass, entry)
        data: DomusEntryData = entry.runtime_data
        with patch.object(
            ProfileManager, "async_shutdown", new=AsyncMock(side_effect=RuntimeError("boom"))
        ):
            assert await async_unload_entry(hass, entry)

    assert DATA_PROFILE_MANAGER not in hass.data[DOMAIN]
    assert not data.runtime.running
