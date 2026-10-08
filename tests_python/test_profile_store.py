"""Domus Profile store: strict validation, per-profile revisions, orphaning."""

import asyncio
from copy import deepcopy
from typing import Any
from unittest.mock import AsyncMock

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from custom_components.domusos.profile.manager import ProfileManager, ProfileStoreStatus
from custom_components.domusos.profile.models import (
    MAX_PERSONAL_DEVICES,
    STORAGE_KEY,
    STORAGE_VERSION,
    DeviceManagementNotAvailableError,
    InvalidProfileError,
    InvalidStoredDocumentError,
    ProfileUnavailableError,
    RevisionConflictError,
    StoreCorruptError,
    migrate_document,
)

NOW = "2026-10-08T09:00:00+00:00"
MATTIA = "a" * 32
ERIKA = "b" * 32


def _device(index: int, ha_device_id: str | None = None) -> dict[str, Any]:
    return {
        "id": f"dev-{index}",
        "source": {"kind": "ha_device", "ha_device_id": ha_device_id or f"{index:032x}"},
        "added_at": NOW,
        "notifications": {"enabled": True},
    }


def _profile(owner: str, revision: int = 1, **overrides: Any) -> dict[str, Any]:
    profile = {
        "owner_user_id": owner,
        "revision": revision,
        "created_at": NOW,
        "updated_at": NOW,
        "state": "active",
        "personal_devices": [],
        "notifications": {"enabled": True},
        "preferences": {},
    }
    profile.update(overrides)
    return profile


def _document(*profiles: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema": "domusos-profiles",
        "version": 1,
        "profiles": {profile["owner_user_id"]: profile for profile in profiles},
    }


async def _manager(hass: HomeAssistant, stored: Any = None) -> ProfileManager:
    manager = ProfileManager(hass)
    manager.store.async_load = AsyncMock(return_value=deepcopy(stored))
    manager.store.async_save = AsyncMock()
    await manager.async_setup()
    return manager


SAVE = {"notifications": {"enabled": False}}


async def test_missing_store_serves_a_synthetic_profile_without_writing(hass: HomeAssistant) -> None:
    manager = await _manager(hass)

    view = manager.get_profile(MATTIA)

    assert manager.status is ProfileStoreStatus.READY
    assert view.persisted is False
    assert view.profile is None
    assert view.revision == 0
    assert view.as_dict()["notifications"] == {"enabled": True}
    assert view.as_dict()["personal_devices"] == []
    manager.store.async_save.assert_not_called()
    await manager.async_shutdown()


async def test_first_save_creates_the_profile_then_revisions_increase(hass: HomeAssistant) -> None:
    manager = await _manager(hass)

    first = await manager.async_save_self(MATTIA, 0, SAVE)
    second = await manager.async_save_self(MATTIA, 1, {"notifications": {"enabled": True}})

    assert first.persisted and first.revision == 1
    assert first.profile.notifications_enabled is False
    assert second.revision == 2
    assert second.profile.created_at == first.profile.created_at
    saved = manager.store.async_save.call_args.args[0]
    assert saved["profiles"][MATTIA]["revision"] == 2
    assert saved["profiles"][MATTIA]["owner_user_id"] == MATTIA
    await manager.async_shutdown()


async def test_stale_revision_conflicts_without_merging(hass: HomeAssistant) -> None:
    manager = await _manager(hass, _document(_profile(MATTIA, 4)))

    with pytest.raises(RevisionConflictError):
        await manager.async_save_self(MATTIA, 3, SAVE)
    with pytest.raises(RevisionConflictError):
        await manager.async_save_self(ERIKA, 1, SAVE)

    assert manager.get_profile(MATTIA).revision == 4
    manager.store.async_save.assert_not_called()
    await manager.async_shutdown()


async def test_revisions_are_independent_per_profile(hass: HomeAssistant) -> None:
    manager = await _manager(hass, _document(_profile(MATTIA, 4), _profile(ERIKA, 8)))

    await manager.async_save_self(ERIKA, 8, SAVE)
    mattia = await manager.async_save_self(MATTIA, 4, SAVE)

    assert manager.get_profile(ERIKA).revision == 9
    assert mattia.revision == 5
    await manager.async_shutdown()


async def test_concurrent_saves_on_one_revision_let_exactly_one_win(hass: HomeAssistant) -> None:
    manager = await _manager(hass)

    results = await asyncio.gather(
        manager.async_save_self(MATTIA, 0, SAVE),
        manager.async_save_self(MATTIA, 0, {"notifications": {"enabled": True}}),
        manager.async_save_self(ERIKA, 0, SAVE),
        return_exceptions=True,
    )

    conflicts = [result for result in results if isinstance(result, RevisionConflictError)]
    assert len(conflicts) == 1
    assert manager.get_profile(MATTIA).revision == 1
    assert manager.get_profile(ERIKA).revision == 1
    await manager.async_shutdown()


async def test_failed_write_keeps_the_previous_profile(hass: HomeAssistant) -> None:
    manager = await _manager(hass, _document(_profile(MATTIA, 2)))
    manager.store.async_save.side_effect = OSError("disk full")

    with pytest.raises(OSError):
        await manager.async_save_self(MATTIA, 2, SAVE)

    assert manager.get_profile(MATTIA).revision == 2
    assert manager.get_profile(MATTIA).profile.notifications_enabled is True
    await manager.async_shutdown()


@pytest.mark.parametrize(
    "stored",
    [
        {"schema": "other", "version": 1, "profiles": {}},
        {"schema": "domusos-profiles", "version": 2, "profiles": {}},
        {"schema": "domusos-profiles", "version": 1, "profiles": []},
        _document(_profile(MATTIA, revision=0)),
        {"schema": "domusos-profiles", "version": 1, "profiles": {MATTIA: _profile(ERIKA)}},
        _document(_profile(MATTIA, created_at="yesterday")),
        _document(_profile(MATTIA, state="deleted")),
        _document(_profile(MATTIA, state="orphaned")),
        _document(_profile(MATTIA, orphaned_at=NOW)),
        _document(_profile(MATTIA, personal_devices=[_device(1), {**_device(2), "id": "dev-1"}])),
        _document(_profile(MATTIA, personal_devices=[_device(1, "f" * 32), _device(2, "f" * 32)])),
        _document(_profile(MATTIA, personal_devices=[_device(i) for i in range(MAX_PERSONAL_DEVICES + 1)])),
        _document(_profile(MATTIA, personal_devices=[{**_device(1), "source": {"kind": "entity", "ha_device_id": "x"}}])),
        _document(_profile(MATTIA, personal_devices=[{**_device(1), "label": "x" * 65}])),
        _document(_profile(MATTIA, notifications={"enabled": "yes"})),
        _document(_profile(MATTIA, preferences=[])),
        _document(_profile(MATTIA, name="Mattia")),
    ],
)
async def test_invalid_documents_are_kept_and_never_overwritten(hass: HomeAssistant, stored: Any) -> None:
    manager = await _manager(hass, stored)

    assert manager.status is ProfileStoreStatus.CORRUPT
    with pytest.raises(StoreCorruptError):
        manager.get_profile(MATTIA)
    with pytest.raises(StoreCorruptError):
        await manager.async_save_self(MATTIA, 0, SAVE)
    assert await manager.async_mark_orphaned(MATTIA) is False
    manager.store.async_save.assert_not_called()
    await manager.async_shutdown()


async def test_a_quarantined_store_counts_as_corrupt(hass: HomeAssistant) -> None:
    manager = ProfileManager(hass)
    manager.store.async_load = AsyncMock(return_value=None)
    manager.store.async_save = AsyncMock()
    manager._async_quarantined = AsyncMock(return_value=True)  # noqa: SLF001

    await manager.async_setup()

    assert manager.status is ProfileStoreStatus.CORRUPT
    await manager.async_shutdown()


async def test_a_load_failure_counts_as_corrupt(hass: HomeAssistant) -> None:
    manager = ProfileManager(hass)
    manager.store.async_load = AsyncMock(side_effect=ValueError("bad json"))
    manager.store.async_save = AsyncMock()

    await manager.async_setup()

    assert manager.status is ProfileStoreStatus.CORRUPT
    await manager.async_shutdown()


async def test_device_index_reports_cross_profile_conflicts_without_choosing(hass: HomeAssistant) -> None:
    shared = "c" * 32
    manager = await _manager(
        hass,
        _document(
            _profile(MATTIA, personal_devices=[_device(1, shared), _device(2, "d" * 32)]),
            _profile(ERIKA, personal_devices=[_device(3, shared)]),
        ),
    )

    assert manager.status is ProfileStoreStatus.READY
    assert manager.device_owner("d" * 32) == MATTIA
    assert manager.device_owner(shared) is None
    assert manager.device_conflicts == {shared: tuple(sorted((MATTIA, ERIKA)))}
    await manager.async_shutdown()


async def test_devices_are_served_and_preserved_but_cannot_change(hass: HomeAssistant) -> None:
    devices = [_device(1, "e" * 32)]
    manager = await _manager(hass, _document(_profile(MATTIA, 3, personal_devices=devices)))

    view = manager.get_profile(MATTIA)
    assert view.as_dict()["personal_devices"] == devices

    # Sending the stored devices back unchanged is allowed.
    saved = await manager.async_save_self(MATTIA, 3, {**SAVE, "personal_devices": devices})
    assert [device.as_dict() for device in saved.profile.personal_devices] == devices

    for attempt in ([], [*devices, _device(2)], [{**devices[0], "notifications": {"enabled": False}}]):
        with pytest.raises(DeviceManagementNotAvailableError):
            await manager.async_save_self(MATTIA, 4, {**SAVE, "personal_devices": attempt})
    with pytest.raises(DeviceManagementNotAvailableError):
        await manager.async_save_self(ERIKA, 0, {**SAVE, "personal_devices": [_device(9)]})
    await manager.async_shutdown()


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"notifications": {"enabled": "false"}},
        {"notifications": {"enabled": False, "quiet": True}},
        {"notifications": {"enabled": False}, "preferences": {"language": "en"}},
        {"notifications": {"enabled": False}, "owner_user_id": ERIKA},
        {"notifications": {"enabled": False}, "user_id": ERIKA},
        {"notifications": {"enabled": False}, "person_id": "erika"},
        {"notifications": {"enabled": False}, "revision": 9},
        [],
    ],
)
async def test_only_notification_enabled_is_self_editable(hass: HomeAssistant, payload: Any) -> None:
    manager = await _manager(hass)

    with pytest.raises(InvalidProfileError):
        await manager.async_save_self(MATTIA, 0, payload)
    manager.store.async_save.assert_not_called()
    await manager.async_shutdown()


async def test_user_removal_orphans_the_profile_without_deleting_it(hass: HomeAssistant) -> None:
    user = await hass.auth.async_create_user("Mattia")
    other = await hass.auth.async_create_user("Erika")
    manager = await _manager(hass, _document(_profile(user.id, 2), _profile(other.id, 5)))

    await hass.auth.async_remove_user(user)
    await hass.async_block_till_done()

    orphaned = manager.get_profile(user.id)
    assert orphaned.persisted
    assert orphaned.profile.state == "orphaned"
    assert orphaned.profile.orphaned_at is not None
    assert orphaned.revision == 3
    assert manager.get_profile(other.id).profile.state == "active"
    saved = manager.store.async_save.call_args.args[0]
    assert saved["profiles"][user.id]["state"] == "orphaned"
    with pytest.raises(ProfileUnavailableError):
        await manager.async_save_self(user.id, 3, SAVE)
    # A second removal event changes nothing.
    assert await manager.async_mark_orphaned(user.id) is False
    await manager.async_shutdown()


async def test_disabled_user_keeps_an_active_profile(hass: HomeAssistant) -> None:
    await hass.auth.async_create_user("Owner")  # the first user is the owner, who cannot be disabled
    user = await hass.auth.async_create_user("Ex")
    manager = await _manager(hass, _document(_profile(user.id, 2)))

    await hass.auth.async_deactivate_user(user)
    await hass.async_block_till_done()

    assert manager.get_profile(user.id).profile.state == "active"
    manager.store.async_save.assert_not_called()
    await manager.async_shutdown()


async def test_shutdown_stops_listening_to_user_removal(hass: HomeAssistant) -> None:
    user = await hass.auth.async_create_user("Mattia")
    manager = await _manager(hass, _document(_profile(user.id, 2)))
    await manager.async_shutdown()

    await hass.auth.async_remove_user(user)
    await hass.async_block_till_done()

    assert manager.get_profile(user.id).profile.state == "active"


async def test_saved_document_survives_a_restart(hass: HomeAssistant, hass_storage: dict) -> None:
    manager = ProfileManager(hass)
    await manager.async_setup()
    await manager.async_save_self(MATTIA, 0, SAVE)
    await manager.async_shutdown()
    await hass.async_block_till_done()

    assert hass_storage[STORAGE_KEY]["version"] == STORAGE_VERSION
    restarted = ProfileManager(hass)
    await restarted.async_setup()

    view = restarted.get_profile(MATTIA)
    assert view.persisted and view.revision == 1
    assert view.profile.notifications_enabled is False
    await restarted.async_shutdown()


async def test_store_migration_hook_runs_the_chain(hass: HomeAssistant, hass_storage: dict) -> None:
    hass_storage[STORAGE_KEY] = {"version": 1, "minor_version": 1, "key": STORAGE_KEY, "data": {
        "schema": "domusos-profiles", "version": 1, "profiles": {},
    }}
    store = ProfileManager(hass).store
    assert isinstance(store, Store)

    assert await store._async_migrate_func(1, 1, {"profiles": {}}) == {"profiles": {}}  # noqa: SLF001


def test_migration_chain_steps_one_version_at_a_time() -> None:
    steps = {
        1: lambda data: {**data, "version": 2, "seen": ["v1"]},
        2: lambda data: {**data, "version": 3, "seen": [*data["seen"], "v2"]},
    }

    migrated = migrate_document({"version": 1}, 1, 3, steps)

    assert migrated == {"version": 3, "seen": ["v1", "v2"]}
    assert migrate_document({"version": 1}, 1) == {"version": 1}
    with pytest.raises(InvalidStoredDocumentError):
        migrate_document({}, 1, 3, {1: steps[1]})
    with pytest.raises(InvalidStoredDocumentError):
        migrate_document({}, 4, 3, steps)
