"""Recipient readiness: who can be chosen as a notification recipient, and whether it is ready.

Readiness is computed from the same plan the router sends from, so these
tests also check that both always agree.
"""

import json
from typing import Any

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import Unauthorized
from homeassistant.helpers import device_registry as dr

from custom_components.domusos.const import DOMAIN
from custom_components.domusos.notifications import NotificationRequest, Reason, RecipientStatus
from custom_components.domusos.notifications.ledger import STORAGE_KEY as LEDGER_KEY
from custom_components.domusos.notifications.recipients import RecipientReadiness, async_list_readiness
from custom_components.domusos.profile.api import DATA_PROFILE_MANAGER, websocket_list_recipients
from custom_components.domusos.profile.manager import ProfileStoreStatus
from custom_components.domusos.profile.models import STORAGE_KEY as PROFILE_KEY

from notification_support import claim, register_phone, set_person, start

ALLOWED_KEYS = {"person_id", "person_entity_id", "status", "selectable"}


class RecordedConnection:
    def __init__(self, user: Any) -> None:
        self.user = user
        self.results: dict[int, Any] = {}
        self.errors: dict[int, str] = {}

    def send_result(self, msg_id: int, result: Any = None) -> None:
        self.results[msg_id] = result

    def send_error(self, msg_id: int, code: str, message: str, *_: Any, **__: Any) -> None:
        self.errors[msg_id] = code


async def _listed(hass: HomeAssistant, manager) -> dict[str, dict[str, Any]]:
    return {entry["person_id"]: entry for entry in await async_list_readiness(hass, manager)}


async def _toggle(manager, user_id: str, device_id: str | None = None, enabled: bool = False) -> None:
    revision = manager.get_profile(user_id).revision
    if device_id is None:
        await manager.async_save_self(user_id, revision, {"notifications": {"enabled": enabled}})
    else:
        await manager.async_update_device(user_id, revision, device_id, {"notifications_enabled": enabled})


async def _empty_profile(manager, user_id: str) -> None:
    # A real change and back: a persisted profile without devices.
    await manager.async_save_self(user_id, 0, {"notifications": {"enabled": False}})
    await manager.async_save_self(user_id, 1, {"notifications": {"enabled": True}})


@pytest.fixture
async def home(hass: HomeAssistant):
    await hass.auth.async_create_user("Owner")
    manager, ledger, router = await start(hass)
    hass.data.setdefault(DOMAIN, {})[DATA_PROFILE_MANAGER] = manager
    return {"hass": hass, "manager": manager, "ledger": ledger, "router": router}


async def _person_with_phones(home, name: str, person_id: str, *phones: str):
    hass, manager = home["hass"], home["manager"]
    user = await hass.auth.async_create_user(name)
    registered = [register_phone(hass, user.id, phone) for phone in phones]
    ids = await claim(manager, user.id, *registered) if registered else []
    set_person(hass, f"person.{name.lower()}", person_id, user.id)
    return user, registered, ids


# --- enumeration and identity ---------------------------------------------------------


async def test_people_are_listed_from_persons_not_users(home) -> None:
    hass, manager = home["hass"], home["manager"]
    await _person_with_phones(home, "Mattia", "p-mattia", "Galaxy")
    await hass.auth.async_create_user("Lonely")  # an account without a person
    set_person(hass, "person.guest", "p-guest", None)
    # A person from configuration.yaml: read-only, same identity rules.
    hass.states.async_set("person.yaml_anna", "home", {"id": "p-anna", "editable": False})
    # A person without an internal id cannot be a recipient.
    hass.states.async_set("person.broken", "home", {"friendly_name": "Broken"})

    entries = await async_list_readiness(hass, manager)

    assert [entry["person_id"] for entry in entries] == ["p-anna", "p-guest", "p-mattia"]
    listed = {entry["person_id"]: entry for entry in entries}
    assert listed["p-mattia"] == {
        "person_id": "p-mattia", "person_entity_id": "person.mattia", "status": "ready", "selectable": True,
    }
    assert listed["p-guest"]["status"] == "no_account" and listed["p-guest"]["selectable"]
    assert listed["p-anna"]["status"] == "no_account" and listed["p-anna"]["person_entity_id"] == "person.yaml_anna"


async def test_a_renamed_person_keeps_its_id(home) -> None:
    hass, manager = home["hass"], home["manager"]
    user, _, _ = await _person_with_phones(home, "Mattia", "p-mattia", "Galaxy")
    hass.states.async_remove("person.mattia")
    set_person(hass, "person.mattia_t", "p-mattia", user.id)

    listed = await _listed(hass, manager)

    assert listed["p-mattia"]["person_entity_id"] == "person.mattia_t"
    assert listed["p-mattia"]["status"] == "ready"


async def test_a_duplicated_internal_id_is_one_ambiguous_entry(home) -> None:
    hass, manager = home["hass"], home["manager"]
    erika = await hass.auth.async_create_user("Erika")
    set_person(hass, "person.andrea_1", "p-dup", erika.id)
    set_person(hass, "person.andrea_2", "p-dup", None)

    entries = await async_list_readiness(hass, manager)

    assert entries == [{"person_id": "p-dup", "person_entity_id": None, "status": "ambiguous", "selectable": False}]


async def test_relinking_is_read_live(home) -> None:
    hass, manager = home["hass"], home["manager"]
    mattia, _, _ = await _person_with_phones(home, "Mattia", "p-mattia", "Galaxy")
    erika = await hass.auth.async_create_user("Erika")
    assert (await _listed(hass, manager))["p-mattia"]["status"] == "ready"

    set_person(hass, "person.mattia", "p-mattia", erika.id)

    assert (await _listed(hass, manager))["p-mattia"]["status"] == "no_profile"


async def test_names_never_decide_anything(home) -> None:
    hass, manager = home["hass"], home["manager"]
    mattia, _, _ = await _person_with_phones(home, "Mattia", "p-mattia", "Galaxy")
    # Same name, no account: never borrows Mattia's account or devices; "guest" means nothing.
    hass.states.async_set("person.mattia_2", "home", {"id": "p-other", "friendly_name": "Mattia"})
    hass.states.async_set("person.guest", "home", {"id": "p-ospite", "friendly_name": "Ospite"})

    listed = await _listed(hass, manager)

    assert listed["p-other"]["status"] == "no_account"
    assert listed["p-ospite"] == {"person_id": "p-ospite", "person_entity_id": "person.guest", "status": "no_account", "selectable": True}


# --- account states ---------------------------------------------------------------------


async def test_account_states(home) -> None:
    hass, manager = home["hass"], home["manager"]
    disabled = await hass.auth.async_create_user("Disabled")
    await hass.auth.async_deactivate_user(disabled)
    system = await hass.auth.async_create_system_user("Supervisor")
    set_person(hass, "person.disabled", "p-disabled", disabled.id)
    set_person(hass, "person.system", "p-system", system.id)
    set_person(hass, "person.removed", "p-removed", "0" * 32)
    set_person(hass, "person.nobody", "p-nobody", None)
    active = await hass.auth.async_create_user("Active")
    set_person(hass, "person.active", "p-active", active.id)

    listed = await _listed(hass, manager)

    assert {key: (value["status"], value["selectable"]) for key, value in listed.items()} == {
        "p-active": ("no_profile", True),
        "p-disabled": ("account_disabled", True),
        "p-nobody": ("no_account", True),
        "p-removed": ("account_unavailable", True),
        "p-system": ("account_unavailable", True),
    }


# --- profile and device states -------------------------------------------------------------


async def test_profile_and_device_states(home) -> None:
    hass, manager = home["hass"], home["manager"]
    _, _, _ = await _person_with_phones(home, "Ready", "p-ready", "Ready phone")
    off_user, _, _ = await _person_with_phones(home, "Off", "p-off", "Off phone")
    await _toggle(manager, off_user.id)
    all_off_user, _, (first, second) = await _person_with_phones(home, "AllOff", "p-alloff", "A1", "A2")
    await _toggle(manager, all_off_user.id, first)
    await _toggle(manager, all_off_user.id, second)
    empty = await hass.auth.async_create_user("Empty")
    await _empty_profile(manager, empty.id)
    set_person(hass, "person.empty", "p-empty", empty.id)
    _, [unavailable_phone], _ = await _person_with_phones(home, "Unavailable", "p-unavailable", "Gone service")
    hass.services.async_remove("notify", unavailable_phone.service)
    _, [missing_phone], _ = await _person_with_phones(home, "Missing", "p-missing", "Removed device")
    dr.async_get(hass).async_remove_device(missing_phone.device.id)
    unverified_user, [moved], _ = await _person_with_phones(home, "Unverified", "p-unverified", "Moved app")
    other = await hass.auth.async_create_user("Other")
    hass.config_entries.async_update_entry(moved.entry, data={**moved.entry.data, "user_id": other.id})
    await _mixed(home)

    listed = await _listed(hass, manager)

    assert {key: value["status"] for key, value in listed.items()} == {
        "p-alloff": "notifications_disabled",
        "p-empty": "no_devices",
        "p-missing": "temporarily_unavailable",
        "p-mixed": "ready",
        "p-off": "notifications_disabled",
        "p-ready": "ready",
        "p-unavailable": "temporarily_unavailable",
        "p-unverified": "temporarily_unavailable",
    }
    assert all(entry["selectable"] for entry in listed.values())


async def _mixed(home):
    """Two enabled devices, one ready and one whose target vanished: still ready."""
    user, phones, ids = await _person_with_phones(home, "Mixed", "p-mixed", "Mixed ok", "Mixed gone")
    home["hass"].services.async_remove("notify", phones[1].service)
    return user, [phones[0]], ids


async def test_an_ownership_conflict_is_not_ready(hass: HomeAssistant, home, hass_storage: dict) -> None:
    from notification_support import start as start_again

    mattia = await hass.auth.async_create_user("Mattia")
    erika = await hass.auth.async_create_user("Erika")
    phone = register_phone(hass, mattia.id, "Galaxy")
    device = {
        "id": "pd-1", "source": {"kind": "ha_device", "ha_device_id": phone.device.id},
        "added_at": "2026-10-09T09:00:00+00:00", "notifications": {"enabled": True},
    }

    def profile(owner: str) -> dict:
        return {
            "owner_user_id": owner, "revision": 1, "created_at": "2026-10-09T09:00:00+00:00",
            "updated_at": "2026-10-09T09:00:00+00:00", "state": "active",
            "personal_devices": [device], "notifications": {"enabled": True}, "preferences": {},
        }

    hass_storage[PROFILE_KEY] = {
        "version": 1, "minor_version": 1, "key": PROFILE_KEY,
        "data": {"schema": "domusos-profiles", "version": 1, "profiles": {mattia.id: profile(mattia.id), erika.id: profile(erika.id)}},
    }
    manager, _, _ = await start_again(hass)
    set_person(hass, "person.mattia", "p-mattia", mattia.id)

    assert (await _listed(hass, manager))["p-mattia"]["status"] == "temporarily_unavailable"


async def test_an_unreadable_profile_store_fails_the_whole_list(hass: HomeAssistant, hass_storage: dict) -> None:
    hass_storage[PROFILE_KEY] = {"version": 1, "minor_version": 1, "key": PROFILE_KEY, "data": {"broken": True}}
    manager, _, _ = await start(hass)
    assert manager.status is ProfileStoreStatus.CORRUPT
    hass.data.setdefault(DOMAIN, {})[DATA_PROFILE_MANAGER] = manager
    admin = await hass.auth.async_create_user("Admin", group_ids=["system-admin"])
    set_person(hass, "person.admin", "p-admin", admin.id)
    connection = RecordedConnection(admin)

    websocket_list_recipients(hass, connection, {"id": 1, "type": "domusos/profile/list_recipients"})
    await hass.async_block_till_done(wait_background_tasks=True)

    assert connection.errors == {1: "profile_unavailable"}


# --- the router agrees ------------------------------------------------------------------------


async def test_readiness_and_the_router_apply_the_same_rules(home) -> None:
    hass, manager, router = home["hass"], home["manager"], home["router"]
    await _person_with_phones(home, "Ready", "p-ready", "Ready phone")
    off_user, _, _ = await _person_with_phones(home, "Off", "p-off", "Off phone")
    await _toggle(manager, off_user.id)
    all_off_user, _, (only,) = await _person_with_phones(home, "AllOff", "p-alloff", "A1")
    await _toggle(manager, all_off_user.id, only)
    empty = await hass.auth.async_create_user("Empty")
    await _empty_profile(manager, empty.id)
    set_person(hass, "person.empty", "p-empty", empty.id)
    _, [gone], _ = await _person_with_phones(home, "Gone", "p-gone", "Gone phone")
    hass.services.async_remove("notify", gone.service)
    fresh = await hass.auth.async_create_user("Fresh")
    set_person(hass, "person.fresh", "p-fresh", fresh.id)
    set_person(hass, "person.nobody", "p-nobody", None)
    await _mixed(home)

    listed = await _listed(hass, manager)
    sent = await router.async_send(NotificationRequest.create(recipients=sorted(listed), source="self_test", message="x"))
    outcome = {result.person_id: result for result in sent.results}

    expected_reason = {
        "notifications_disabled": Reason.NOTIFICATIONS_DISABLED,
        "no_devices": Reason.NO_DEVICES,
        "no_profile": Reason.NO_PROFILE,
        "no_account": Reason.NO_ACCOUNT,
    }
    for person_id, entry in listed.items():
        result = outcome[person_id]
        if entry["status"] == "ready":
            # At least one real delivery happened.
            assert any(device.status.value == "delivered" for device in result.devices), person_id
        elif entry["status"] == "temporarily_unavailable":
            assert result.status is RecipientStatus.SKIPPED and result.devices, person_id
        else:
            assert (result.status, result.reason) == (RecipientStatus.SKIPPED, expected_reason[entry["status"]]), person_id
    assert {entry["status"] for entry in listed.values()} == {
        "ready", "temporarily_unavailable", "notifications_disabled", "no_devices", "no_profile", "no_account",
    }


# --- read only, private, admin only -------------------------------------------------------------


async def test_listing_writes_nothing_and_sends_nothing(home, hass_storage: dict) -> None:
    hass, manager = home["hass"], home["manager"]
    _, phones, _ = await _person_with_phones(home, "Mattia", "p-mattia", "Galaxy", "Tablet")
    fresh = await hass.auth.async_create_user("Fresh")
    set_person(hass, "person.fresh", "p-fresh", fresh.id)
    profiles_before = json.dumps(hass_storage.get(PROFILE_KEY), sort_keys=True)
    states_before = {state.entity_id: (state.state, dict(state.attributes)) for state in hass.states.async_all()}
    def registry() -> list[tuple]:
        return sorted((d.id, tuple(sorted(d.config_entries)), d.disabled_by, d.name_by_user) for d in dr.async_get(hass).devices.values())

    devices_before = registry()

    for _ in range(3):
        listed = await _listed(hass, manager)

    assert listed["p-fresh"]["status"] == "no_profile"
    assert json.dumps(hass_storage.get(PROFILE_KEY), sort_keys=True) == profiles_before
    assert not manager.get_profile(fresh.id).persisted
    assert LEDGER_KEY not in hass_storage
    assert all(phone.calls == [] for phone in phones)
    assert {state.entity_id: (state.state, dict(state.attributes)) for state in hass.states.async_all()} == states_before
    assert registry() == devices_before


async def test_the_list_says_who_and_whether_never_where(home) -> None:
    hass, manager = home["hass"], home["manager"]
    user, phones, ids = await _person_with_phones(home, "Mattia", "p-mattia", "Galaxy S26")
    hass.states.async_set("person.mattia", "home", {
        "id": "p-mattia", "user_id": user.id, "device_trackers": ["device_tracker.galaxy_s26"],
        "friendly_name": "Mattia", "email": "mattia@example.com",
    })

    entries = await async_list_readiness(hass, manager)
    text = json.dumps(entries)

    assert all(set(entry) == ALLOWED_KEYS for entry in entries)
    for secret in (user.id, ids[0], phones[0].device.id, phones[0].service, "Galaxy", "device_tracker",
                   "notify", "mattia@example.com", "push", "webhook", "enabled", "label"):
        assert secret not in text, secret


async def test_only_administrators_can_list(home) -> None:
    hass = home["hass"]
    regular = await hass.auth.async_create_user("Regular")
    admin = await hass.auth.async_create_user("Admin", group_ids=["system-admin"])
    set_person(hass, "person.regular", "p-regular", regular.id)

    with pytest.raises(Unauthorized):
        websocket_list_recipients(hass, RecordedConnection(regular), {"id": 1, "type": "domusos/profile/list_recipients"})

    connection = RecordedConnection(admin)
    websocket_list_recipients(hass, connection, {"id": 2, "type": "domusos/profile/list_recipients"})
    await hass.async_block_till_done(wait_background_tasks=True)
    assert [entry["person_id"] for entry in connection.results[2]["recipients"]] == ["p-regular"]


def test_the_request_takes_no_parameters() -> None:
    # No command schema: Home Assistant accepts nothing but id and type (checked on the real stack too).
    assert websocket_list_recipients._ws_schema is False  # noqa: SLF001


def test_readiness_values_are_the_documented_ones() -> None:
    assert {status.value for status in RecipientReadiness} == {
        "ready", "temporarily_unavailable", "notifications_disabled", "no_devices", "no_profile",
        "no_account", "account_disabled", "account_unavailable", "profile_unavailable", "ambiguous",
    }
