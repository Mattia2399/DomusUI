"""Personal devices: mobile_app ownership, discovery, targets and device commands."""

import asyncio
import json
from typing import Any
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from homeassistant.config_entries import ConfigEntryDisabler
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import device_registry as dr, entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.domusos.profile.devices import DeviceInspector, device_display_name, device_kind
from custom_components.domusos.profile.manager import ProfileManager
from custom_components.domusos.profile.mobile_app import DeviceLink, list_registrations, verified_registration
from custom_components.domusos.profile.models import (
    MAX_PERSONAL_DEVICES,
    DeviceManagementNotAvailableError,
    DeviceNotClaimableError,
    DeviceNotFoundError,
    DeviceNotInProfileError,
    DeviceOwnedByOtherProfileError,
    DeviceOwnershipConflictError,
    InvalidDeviceError,
    RevisionConflictError,
    TooManyDevicesError,
)
from custom_components.domusos.profile.targets import (
    AmbiguousTarget,
    EntityTarget,
    LegacyServiceTarget,
    TargetStatus,
    UnavailableTarget,
    UnsupportedTarget,
    resolve_notification_target,
)

NOW = "2026-10-09T09:00:00+00:00"
SECRET = "webhook-secret-do-not-store"


def register_app(
    hass: HomeAssistant,
    user_id: str,
    name: str,
    *,
    push: bool = True,
    disabled: bool = False,
    with_device: bool = True,
    manufacturer: str = "Google",
    model: str = "Pixel 8",
) -> tuple[MockConfigEntry, dr.DeviceEntry | None]:
    """Create a Companion App registration as mobile_app would."""
    app_device_id = uuid4().hex
    entry = MockConfigEntry(
        domain="mobile_app",
        title=name,
        data={
            "user_id": user_id,
            "device_id": app_device_id,
            "device_name": name,
            "manufacturer": manufacturer,
            "model": model,
            "webhook_id": SECRET,
            "secret": SECRET,
            "app_data": {"push_token": SECRET, "push_url": "https://push.example/secret"},
        },
        disabled_by=ConfigEntryDisabler.USER if disabled else None,
    )
    entry.add_to_hass(hass)
    device = None
    if with_device:
        device = dr.async_get(hass).async_get_or_create(
            config_entry_id=entry.entry_id,
            identifiers={("mobile_app", app_device_id)},
            manufacturer=manufacturer,
            model=model,
            name=name,
        )
    if push and not disabled:
        service = f"mobile_app_{name.lower().replace(' ', '_')}"
        hass.services.async_register("notify", service, _never_called)
    return entry, device


async def _never_called(call: ServiceCall) -> None:
    raise AssertionError("P1.2 must never send a notification")


def forget_app(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    """Drop a registration as Home Assistant does when the app is removed.

    ``config_entries.async_remove`` would import the real mobile_app
    integration and its optional dependencies, which the test environment
    does not install; clearing the devices and the entry is the same outcome.
    """
    dr.async_get(hass).async_clear_config_entry(entry.entry_id)
    del hass.config_entries._entries[entry.entry_id]  # noqa: SLF001


def add_tracker(hass: HomeAssistant, device: dr.DeviceEntry, unique_id: str) -> str:
    entry = er.async_get(hass).async_get_or_create(
        "device_tracker", "mobile_app", unique_id, device_id=device.id
    )
    return entry.entity_id


async def _manager(hass: HomeAssistant, stored: Any = None) -> ProfileManager:
    manager = ProfileManager(hass)
    manager.store.async_load = AsyncMock(return_value=stored)
    manager.store.async_save = AsyncMock()
    await manager.async_setup()
    return manager


def _stored_device(device_id: str, ha_device_id: str, label: str | None = None) -> dict[str, Any]:
    device = {
        "id": device_id,
        "source": {"kind": "ha_device", "ha_device_id": ha_device_id},
        "added_at": NOW,
        "notifications": {"enabled": True},
    }
    if label is not None:
        device["label"] = label
    return device


def _stored_profile(owner: str, revision: int, devices: list[dict], state: str = "active") -> dict[str, Any]:
    profile = {
        "owner_user_id": owner,
        "revision": revision,
        "created_at": NOW,
        "updated_at": NOW,
        "state": state,
        "personal_devices": devices,
        "notifications": {"enabled": True},
        "preferences": {},
    }
    if state == "orphaned":
        profile["orphaned_at"] = NOW
    return profile


def _document(*profiles: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema": "domusos-profiles",
        "version": 1,
        "profiles": {profile["owner_user_id"]: profile for profile in profiles},
    }


@pytest.fixture
async def users(hass: HomeAssistant):
    await hass.auth.async_create_user("Owner")
    mattia = await hass.auth.async_create_user("Mattia")
    erika = await hass.auth.async_create_user("Erika")
    return mattia, erika


# --- mobile_app ownership adapter ----------------------------------------------------


async def test_registrations_are_read_without_secrets(hass: HomeAssistant, users) -> None:
    mattia, erika = users
    _, phone = register_app(hass, mattia.id, "Pixel 8")
    _, tablet = register_app(hass, mattia.id, "Tab S9", manufacturer="samsung", model="SM-X710")
    register_app(hass, erika.id, "iPhone", manufacturer="Apple", model="iPhone15,2")
    register_app(hass, mattia.id, "Orphan app", with_device=False)

    registrations = {item.device_name: item for item in list_registrations(hass)}

    assert registrations["Pixel 8"].ha_device_id == phone.id
    assert registrations["Pixel 8"].user_id == mattia.id
    assert registrations["Tab S9"].ha_device_id == tablet.id
    assert registrations["iPhone"].user_id == erika.id
    assert registrations["Orphan app"].device_link is DeviceLink.MISSING
    assert SECRET not in repr(list_registrations(hass))
    assert verified_registration(list_registrations(hass), phone.id, mattia.id) is not None
    assert verified_registration(list_registrations(hass), phone.id, erika.id) is None


async def test_a_disabled_registration_does_not_prove_ownership(hass: HomeAssistant, users) -> None:
    mattia, _ = users
    _, device = register_app(hass, mattia.id, "Old phone", disabled=True)

    registration = next(item for item in list_registrations(hass) if item.ha_device_id == device.id)

    assert not registration.entry_enabled
    assert not registration.proves_ownership
    assert verified_registration(list_registrations(hass), device.id, mattia.id) is None


async def test_a_disabled_device_does_not_prove_ownership(hass: HomeAssistant, users) -> None:
    mattia, _ = users
    _, device = register_app(hass, mattia.id, "Pixel 8")
    dr.async_get(hass).async_update_device(device.id, disabled_by=dr.DeviceEntryDisabler.USER)

    assert verified_registration(list_registrations(hass), device.id, mattia.id) is None


# --- Device Registry presentation --------------------------------------------------


async def test_display_name_and_kind_are_presentation_only(hass: HomeAssistant, users) -> None:
    mattia, _ = users
    _, phone = register_app(hass, mattia.id, "Pixel 8")
    _, tablet = register_app(hass, mattia.id, "Tab", manufacturer="samsung", model="SM-X710")
    _, ipad = register_app(hass, mattia.id, "iPad", manufacturer="Apple", model="iPad13,4")
    registry = dr.async_get(hass)

    renamed = registry.async_update_device(phone.id, name_by_user="Telefono di lavoro")
    nameless = registry.async_update_device(tablet.id, name=None)

    assert device_display_name(renamed) == "Telefono di lavoro"
    assert renamed.id == phone.id
    assert device_display_name(nameless) == "samsung SM-X710"
    assert device_kind(renamed, is_mobile_app=True) == "phone"
    assert device_kind(nameless, is_mobile_app=True) == "tablet"
    assert device_kind(ipad, is_mobile_app=True) == "tablet"
    assert device_kind(None, is_mobile_app=True) == "other"


async def test_presence_lists_trackers_of_the_device_read_only(hass: HomeAssistant, users) -> None:
    mattia, _ = users
    _, phone = register_app(hass, mattia.id, "Pixel 8")
    _, tablet = register_app(hass, mattia.id, "Tablet", push=False)
    first = add_tracker(hass, phone, "pixel-gps")
    second = add_tracker(hass, phone, "pixel-wifi")
    hass.states.async_set(
        "person.mattia", "home", {"id": "mattia", "user_id": mattia.id, "device_trackers": [first]}
    )
    manager = await _manager(hass)

    found = {item["ha_device_id"]: item for item in DeviceInspector(hass, mattia.id).discover((), manager.ownership())}

    assert found[phone.id]["presence"] == {"tracker_entity_ids": sorted([first, second]), "in_person_trackers": True}
    assert found[phone.id]["capabilities"]["presence"] is True
    assert found[tablet.id]["presence"] == {"tracker_entity_ids": [], "in_person_trackers": False}
    assert found[tablet.id]["capabilities"]["presence"] is False
    # The person's trackers are untouched.
    assert hass.states.get("person.mattia").attributes["device_trackers"] == [first]


# --- notification target resolver --------------------------------------------------


async def test_legacy_mobile_app_service_is_resolved_without_sending(hass: HomeAssistant, users) -> None:
    mattia, _ = users
    _, device = register_app(hass, mattia.id, "Pixel 8")

    target = resolve_notification_target(hass, device.id, list_registrations(hass))

    assert target == LegacyServiceTarget("mobile_app_pixel_8")
    assert target.status is TargetStatus.READY


async def test_missing_legacy_service_is_unavailable(hass: HomeAssistant, users) -> None:
    mattia, _ = users
    _, device = register_app(hass, mattia.id, "Pixel 8", push=False)

    target = resolve_notification_target(hass, device.id, list_registrations(hass))

    assert isinstance(target, UnavailableTarget)


async def test_two_registrations_sharing_a_slug_are_ambiguous(hass: HomeAssistant, users) -> None:
    mattia, erika = users
    _, first = register_app(hass, mattia.id, "Pixel 8")
    _, second = register_app(hass, erika.id, "Pixel-8", push=False)

    registrations = list_registrations(hass)

    assert isinstance(resolve_notification_target(hass, first.id, registrations), AmbiguousTarget)
    assert isinstance(resolve_notification_target(hass, second.id, registrations), AmbiguousTarget)


async def test_a_notify_entity_of_the_same_device_wins(hass: HomeAssistant, users) -> None:
    mattia, _ = users
    _, device = register_app(hass, mattia.id, "Pixel 8")
    _, other = register_app(hass, mattia.id, "Tablet", push=False)
    entity = er.async_get(hass).async_get_or_create("notify", "mobile_app", "pixel-notify", device_id=device.id)
    hass.states.async_set(entity.entity_id, "unknown")
    # A notify entity named like the tablet but attached to another device does not count.
    er.async_get(hass).async_get_or_create("notify", "other", "tablet-notify", device_id=device.id, disabled_by=er.RegistryEntryDisabler.USER)

    registrations = list_registrations(hass)

    assert resolve_notification_target(hass, device.id, registrations) == EntityTarget(entity.entity_id)
    assert isinstance(resolve_notification_target(hass, other.id, registrations), UnavailableTarget)


async def test_an_unavailable_notify_entity_is_not_ready(hass: HomeAssistant, users) -> None:
    mattia, _ = users
    _, device = register_app(hass, mattia.id, "Pixel 8")
    entity = er.async_get(hass).async_get_or_create("notify", "mobile_app", "pixel-notify", device_id=device.id)
    hass.states.async_set(entity.entity_id, "unavailable")

    assert isinstance(resolve_notification_target(hass, device.id, list_registrations(hass)), UnavailableTarget)


async def test_a_device_without_app_or_notify_entity_is_unsupported(hass: HomeAssistant) -> None:
    entry = MockConfigEntry(domain="hue")
    entry.add_to_hass(hass)
    lamp = dr.async_get(hass).async_get_or_create(config_entry_id=entry.entry_id, identifiers={("hue", "lamp")})

    assert isinstance(resolve_notification_target(hass, lamp.id, list_registrations(hass)), UnsupportedTarget)


# --- discovery ------------------------------------------------------------------------


async def test_discovery_lists_only_the_users_own_registrations(hass: HomeAssistant, users) -> None:
    mattia, erika = users
    _, mine = register_app(hass, mattia.id, "Pixel 8")
    _, second = register_app(hass, mattia.id, "Tab S9", manufacturer="samsung", model="SM-X710")
    register_app(hass, erika.id, "Telefono Mattia")
    register_app(hass, erika.id, "mattia@example.com")
    manager = await _manager(hass)

    found = DeviceInspector(hass, mattia.id).discover((), manager.ownership())

    assert {item["ha_device_id"] for item in found} == {mine.id, second.id}
    assert all(item["confidence"] == "verified" and item["claimable"] for item in found)
    assert {item["kind"] for item in found} == {"phone", "tablet"}
    assert all(item["notification_target_status"] == "ready" for item in found)
    manager.store.async_save.assert_not_called()


async def test_a_tracker_named_like_the_user_changes_nothing(hass: HomeAssistant, users) -> None:
    mattia, erika = users
    _, erika_phone = register_app(hass, erika.id, "Pixel di Erika")
    tracker = add_tracker(hass, erika_phone, "erika-gps")
    hass.states.async_set(tracker, "home", {"friendly_name": "Mattia", "user_id": mattia.id})
    manager = await _manager(hass)

    assert DeviceInspector(hass, mattia.id).discover((), manager.ownership()) == []
    with pytest.raises(DeviceNotClaimableError):
        await manager.async_add_device(mattia.id, 0, erika_phone.id)


async def test_discovery_states(hass: HomeAssistant, users) -> None:
    mattia, erika = users
    _, owned = register_app(hass, mattia.id, "Owned")
    _, other = register_app(hass, mattia.id, "Other profile")
    _, conflict = register_app(hass, mattia.id, "Conflict")
    _, disabled = register_app(hass, mattia.id, "Disabled", disabled=True)
    register_app(hass, mattia.id, "Without device", with_device=False)
    third = await hass.auth.async_create_user("Luca")
    manager = await _manager(
        hass,
        _document(
            _stored_profile(mattia.id, 2, [_stored_device("dev-owned", owned.id)]),
            _stored_profile(erika.id, 3, [_stored_device("dev-other", other.id), _stored_device("dev-c1", conflict.id)]),
            _stored_profile(third.id, 1, [_stored_device("dev-c2", conflict.id)]),
        ),
    )
    own = manager.get_profile(mattia.id).profile.personal_devices

    found = {item["display_name"]: item for item in DeviceInspector(hass, mattia.id).discover(own, manager.ownership())}

    assert found["Owned"]["status"] == "already_owned"
    assert found["Other profile"]["status"] == "owned_by_other"
    assert found["Conflict"]["status"] == "ownership_conflict"
    assert found["Disabled"]["status"] == "unavailable"
    assert found["Without device"]["status"] == "missing"
    assert found["Without device"]["ha_device_id"] is None
    assert not any(item["claimable"] for item in found.values())
    assert erika.id not in json.dumps(found) and third.id not in json.dumps(found)


# --- add / remove / update ----------------------------------------------------------


async def test_adding_a_verified_device_creates_a_server_side_record(hass: HomeAssistant, users) -> None:
    mattia, _ = users
    _, device = register_app(hass, mattia.id, "Pixel 8")
    manager = await _manager(hass)

    view = await manager.async_add_device(mattia.id, 0, device.id, "  Telefono  ")

    added = view.profile.personal_devices[0]
    assert view.revision == 1 and view.persisted
    assert added.ha_device_id == device.id
    assert added.label == "Telefono"
    assert added.notifications_enabled is True
    assert len(added.id) == 32 and added.added_at
    saved = manager.store.async_save.call_args.args[0]
    assert saved["profiles"][mattia.id]["personal_devices"][0]["label"] == "Telefono"
    assert SECRET not in json.dumps(saved)
    assert "mobile_app_pixel_8" not in json.dumps(saved)
    assert manager.device_owner(device.id) == mattia.id


@pytest.mark.parametrize("label", [None, "", "   "])
async def test_an_added_device_without_label_stores_no_label(hass: HomeAssistant, users, label) -> None:
    mattia, _ = users
    _, device = register_app(hass, mattia.id, "Pixel 8")
    manager = await _manager(hass)

    await manager.async_add_device(mattia.id, 0, device.id, label)

    assert "label" not in manager.store.async_save.call_args.args[0]["profiles"][mattia.id]["personal_devices"][0]


async def test_adding_the_same_device_again_is_a_no_op(hass: HomeAssistant, users) -> None:
    mattia, _ = users
    _, device = register_app(hass, mattia.id, "Pixel 8")
    manager = await _manager(hass)
    await manager.async_add_device(mattia.id, 0, device.id)

    view = await manager.async_add_device(mattia.id, 1, device.id, "Altro nome")

    assert view.revision == 1
    assert manager.store.async_save.call_count == 1


async def test_claims_that_must_be_refused(hass: HomeAssistant, users) -> None:
    mattia, erika = users
    _, foreign = register_app(hass, erika.id, "Telefono Mattia")
    _, disabled = register_app(hass, mattia.id, "Disabled", disabled=True)
    hue = MockConfigEntry(domain="hue")
    hue.add_to_hass(hass)
    lamp = dr.async_get(hass).async_get_or_create(config_entry_id=hue.entry_id, identifiers={("hue", "lamp")})
    manager = await _manager(hass)

    with pytest.raises(DeviceNotClaimableError):
        await manager.async_add_device(mattia.id, 0, foreign.id)
    with pytest.raises(DeviceNotClaimableError):
        await manager.async_add_device(mattia.id, 0, disabled.id)
    with pytest.raises(DeviceNotClaimableError):
        await manager.async_add_device(mattia.id, 0, lamp.id)
    with pytest.raises(DeviceNotFoundError):
        await manager.async_add_device(mattia.id, 0, "f" * 32)
    with pytest.raises(InvalidDeviceError):
        await manager.async_add_device(mattia.id, 0, foreign.id, 42)
    with pytest.raises(InvalidDeviceError):
        await manager.async_add_device(mattia.id, 0, foreign.id, "x" * 65)
    with pytest.raises(RevisionConflictError):
        await manager.async_add_device(mattia.id, 3, foreign.id)
    manager.store.async_save.assert_not_called()


async def test_a_device_owned_by_another_active_profile_is_refused(hass: HomeAssistant, users) -> None:
    mattia, erika = users
    _, device = register_app(hass, mattia.id, "Pixel 8")
    manager = await _manager(hass, _document(_stored_profile(erika.id, 2, [_stored_device("dev-e", device.id)])))

    with pytest.raises(DeviceOwnedByOtherProfileError) as raised:
        await manager.async_add_device(mattia.id, 0, device.id)
    assert erika.id not in str(raised.value)


async def test_the_profile_holds_at_most_ten_devices(hass: HomeAssistant, users) -> None:
    mattia, _ = users
    devices = [_stored_device(f"dev-{index}", f"{index:032x}") for index in range(MAX_PERSONAL_DEVICES)]
    _, phone = register_app(hass, mattia.id, "Pixel 8")
    manager = await _manager(hass, _document(_stored_profile(mattia.id, 4, devices)))

    with pytest.raises(TooManyDevicesError):
        await manager.async_add_device(mattia.id, 4, phone.id)


async def test_removal_works_even_when_home_assistant_forgot_the_device(hass: HomeAssistant, users) -> None:
    mattia, _ = users
    entry, phone = register_app(hass, mattia.id, "Pixel 8")
    manager = await _manager(hass)
    view = await manager.async_add_device(mattia.id, 0, phone.id)
    device_id = view.profile.personal_devices[0].id
    forget_app(hass, entry)

    live = DeviceInspector(hass, mattia.id).live_device(view.profile.personal_devices[0], manager.ownership())
    removed = await manager.async_remove_device(mattia.id, 1, device_id)

    assert live["status"] == "missing"
    assert live["capabilities"] == {"notifications": False, "presence": False}
    assert removed.revision == 2
    assert removed.profile.personal_devices == ()
    assert manager.store.async_save.call_args.args[0]["profiles"][mattia.id]["personal_devices"] == []
    with pytest.raises(DeviceNotInProfileError):
        await manager.async_remove_device(mattia.id, 2, device_id)


async def test_removing_and_adding_again_creates_a_new_record(hass: HomeAssistant, users) -> None:
    mattia, _ = users
    _, phone = register_app(hass, mattia.id, "Pixel 8")
    manager = await _manager(hass)

    first = (await manager.async_add_device(mattia.id, 0, phone.id)).profile.personal_devices[0]
    await manager.async_remove_device(mattia.id, 1, first.id)
    second = (await manager.async_add_device(mattia.id, 2, phone.id)).profile.personal_devices[0]

    assert second.id != first.id
    assert second.added_at >= first.added_at
    assert second.ha_device_id == first.ha_device_id


async def test_updates_change_label_and_switch_only(hass: HomeAssistant, users) -> None:
    mattia, _ = users
    _, phone = register_app(hass, mattia.id, "Pixel 8")
    manager = await _manager(hass)
    device = (await manager.async_add_device(mattia.id, 0, phone.id)).profile.personal_devices[0]

    for blank in (None, "", "   "):
        assert (await manager.async_update_device(mattia.id, 1, device.id, {"label": blank})).revision == 1
    named = await manager.async_update_device(mattia.id, 1, device.id, {"label": "  Telefono  "})
    same = await manager.async_update_device(mattia.id, 2, device.id, {"label": "Telefono"})
    off = await manager.async_update_device(mattia.id, 2, device.id, {"notifications_enabled": False})
    on = await manager.async_update_device(mattia.id, 3, device.id, {"notifications_enabled": True})
    cleared = await manager.async_update_device(mattia.id, 4, device.id, {"label": ""})

    assert named.revision == 2 and named.profile.personal_devices[0].label == "Telefono"
    assert same.revision == 2
    assert off.profile.personal_devices[0].notifications_enabled is False
    assert on.revision == 4
    assert cleared.revision == 5 and cleared.profile.personal_devices[0].label is None
    stored = cleared.profile.personal_devices[0]
    assert (stored.id, stored.added_at, stored.ha_device_id) == (device.id, device.added_at, device.ha_device_id)
    assert manager.store.async_save.call_count == 5
    for changes in ({}, {"id": "x"}, {"ha_device_id": "y"}, {"added_at": NOW}, {"notifications_enabled": "no"}):
        with pytest.raises(InvalidDeviceError):
            await manager.async_update_device(mattia.id, 5, device.id, changes)
    with pytest.raises(DeviceNotInProfileError):
        await manager.async_update_device(mattia.id, 5, "missing-device", {"label": "x"})


async def test_save_self_still_never_changes_devices(hass: HomeAssistant, users) -> None:
    mattia, _ = users
    _, phone = register_app(hass, mattia.id, "Pixel 8")
    manager = await _manager(hass)
    await manager.async_add_device(mattia.id, 0, phone.id)

    with pytest.raises(DeviceManagementNotAvailableError):
        await manager.async_save_self(mattia.id, 1, {"notifications": {"enabled": True}, "personal_devices": []})


# --- conflicts, orphans, concurrency, TOCTOU ---------------------------------------


async def test_a_conflicted_device_is_quarantined_until_one_profile_removes_it(hass: HomeAssistant, users) -> None:
    mattia, erika = users
    _, device = register_app(hass, mattia.id, "Pixel 8")
    luca = await hass.auth.async_create_user("Luca")
    manager = await _manager(
        hass,
        _document(
            _stored_profile(erika.id, 2, [_stored_device("dev-e", device.id)]),
            _stored_profile(luca.id, 5, [_stored_device("dev-l", device.id)]),
        ),
    )

    assert manager.device_conflicts == {device.id: tuple(sorted((erika.id, luca.id)))}
    assert manager.get_profile(erika.id).persisted and manager.get_profile(luca.id).persisted
    with pytest.raises(DeviceOwnershipConflictError):
        await manager.async_add_device(mattia.id, 0, device.id)
    live = DeviceInspector(hass, erika.id).live_device(
        manager.get_profile(erika.id).profile.personal_devices[0], manager.ownership()
    )
    assert live["status"] == "ownership_conflict"

    await manager.async_remove_device(erika.id, 2, "dev-e")

    assert manager.device_conflicts == {}
    assert manager.device_owner(device.id) == luca.id


async def test_an_orphaned_profile_does_not_block_a_verified_claim(hass: HomeAssistant, users) -> None:
    mattia, erika = users
    _, device = register_app(hass, mattia.id, "Pixel 8")
    manager = await _manager(
        hass, _document(_stored_profile(erika.id, 7, [_stored_device("dev-e", device.id)], state="orphaned"))
    )

    view = await manager.async_add_device(mattia.id, 0, device.id)

    assert view.profile.personal_devices[0].ha_device_id == device.id
    orphan = manager.get_profile(erika.id).profile
    assert orphan.state == "orphaned" and orphan.revision == 7
    assert orphan.personal_devices[0].ha_device_id == device.id
    assert manager.device_owner(device.id) == mattia.id
    assert manager.device_conflicts == {}


async def test_concurrent_claims_of_one_device_let_one_profile_win(hass: HomeAssistant, users) -> None:
    mattia, erika = users
    _, device = register_app(hass, mattia.id, "Pixel 8")
    manager = await _manager(hass)
    write_started = asyncio.Event()

    async def slow_save(_document: Any) -> None:
        write_started.set()
        await asyncio.sleep(0)

    manager.store.async_save = AsyncMock(side_effect=slow_save)

    # Synthetic: pretend Home Assistant verifies both users, so only the lock and
    # the ownership index stand between them.
    with patch(
        "custom_components.domusos.profile.manager.DeviceInspector.verified",
        return_value=object(),
    ):
        results = await asyncio.gather(
            manager.async_add_device(mattia.id, 0, device.id),
            manager.async_add_device(erika.id, 0, device.id),
            return_exceptions=True,
        )

    assert write_started.is_set()
    winners = [result for result in results if not isinstance(result, Exception)]
    losers = [result for result in results if isinstance(result, DeviceOwnedByOtherProfileError)]
    assert len(winners) == 1 and len(losers) == 1
    assert manager.device_conflicts == {}
    owners = [user for user in (mattia.id, erika.id) if manager.get_profile(user).persisted]
    assert len(owners) == 1


async def test_only_the_real_owner_can_claim_when_both_try(hass: HomeAssistant, users) -> None:
    mattia, erika = users
    _, device = register_app(hass, mattia.id, "Pixel 8")
    manager = await _manager(hass)

    results = await asyncio.gather(
        manager.async_add_device(erika.id, 0, device.id),
        manager.async_add_device(mattia.id, 0, device.id),
        return_exceptions=True,
    )

    assert isinstance(results[0], DeviceNotClaimableError)
    assert results[1].profile.personal_devices[0].ha_device_id == device.id


async def test_claims_are_rechecked_live_after_discovery(hass: HomeAssistant, users) -> None:
    mattia, _ = users
    entry, device = register_app(hass, mattia.id, "Pixel 8")
    manager = await _manager(hass)
    assert DeviceInspector(hass, mattia.id).discover((), manager.ownership())[0]["claimable"]

    forget_app(hass, entry)

    with pytest.raises((DeviceNotClaimableError, DeviceNotFoundError)):
        await manager.async_add_device(mattia.id, 0, device.id)
    manager.store.async_save.assert_not_called()


async def test_a_reinstalled_app_is_a_new_device(hass: HomeAssistant, users) -> None:
    mattia, _ = users
    entry, old = register_app(hass, mattia.id, "Pixel 8")
    manager = await _manager(hass)
    view = await manager.async_add_device(mattia.id, 0, old.id, "Telefono")
    forget_app(hass, entry)
    _, new = register_app(hass, mattia.id, "Pixel 8")

    stored = view.profile.personal_devices[0]
    found = DeviceInspector(hass, mattia.id).discover(view.profile.personal_devices, manager.ownership())
    added = await manager.async_add_device(mattia.id, 1, new.id)

    assert DeviceInspector(hass, mattia.id).live_device(stored, manager.ownership())["status"] == "missing"
    assert [(item["ha_device_id"], item["status"]) for item in found] == [(new.id, "available")]
    fresh = added.profile.personal_devices[1]
    assert fresh.id != stored.id and fresh.label is None


async def test_a_user_without_person_manages_devices(hass: HomeAssistant, users) -> None:
    mattia, _ = users
    _, device = register_app(hass, mattia.id, "Pixel 8")
    manager = await _manager(hass)

    view = await manager.async_add_device(mattia.id, 0, device.id)
    live = DeviceInspector(hass, mattia.id).live_device(view.profile.personal_devices[0], manager.ownership())

    assert live["status"] == "active"
    assert live["presence"]["in_person_trackers"] is False
