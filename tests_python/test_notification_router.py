"""Notification Router: person-based routing, preferences, isolation and deduplication.

Every send goes through real Home Assistant notify services (legacy
``notify.mobile_app_<name>``) or a real ``NotifyEntity``.
"""

import asyncio
import json
from unittest.mock import AsyncMock, patch

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr

from custom_components.domusos.notifications import (
    DeliveryWarning,
    DeviceStatus,
    InvalidNotificationRequestError,
    NotificationRequest,
    Reason,
    RecipientStatus,
)
from custom_components.domusos.notifications.delivery import DeliveryOutcome
from custom_components.domusos.notifications.ledger import STORAGE_KEY as LEDGER_KEY
from custom_components.domusos.notifications.ledger import LedgerStatus, NotificationLedger
from custom_components.domusos.notifications.router import NotificationRouter
from custom_components.domusos.profile.models import STORAGE_KEY as PROFILE_KEY

from notification_support import add_notify_entity, claim, register_phone, set_person, start

SENTINELS = ("VERY_PRIVATE_MESSAGE", "VERY_PRIVATE_TITLE", "VERY_PRIVATE_METADATA", "VERY_PRIVATE_KEY")


def request(*recipients: str, dedupe_key: str | None = None, source: str = "waste_collection") -> NotificationRequest:
    return NotificationRequest.create(
        recipients=recipients,
        source=source,
        category="waste",
        title="VERY_PRIVATE_TITLE",
        message="VERY_PRIVATE_MESSAGE",
        dedupe_key=dedupe_key,
        metadata={"trace": "VERY_PRIVATE_METADATA"},
    )


@pytest.fixture
async def home(hass: HomeAssistant):
    """Mattia with two phones, Erika with one; both linked to their person."""
    await hass.auth.async_create_user("Owner")
    mattia = await hass.auth.async_create_user("Mattia")
    erika = await hass.auth.async_create_user("Erika")
    manager, ledger, router = await start(hass)
    galaxy = register_phone(hass, mattia.id, "Galaxy")
    tablet = register_phone(hass, mattia.id, "Tablet")
    iphone = register_phone(hass, erika.id, "iPhone")
    galaxy_id, tablet_id = await claim(manager, mattia.id, galaxy, tablet)
    (iphone_id,) = await claim(manager, erika.id, iphone)
    set_person(hass, "person.mattia", "p-mattia", mattia.id)
    set_person(hass, "person.erika", "p-erika", erika.id)
    return {
        "hass": hass, "manager": manager, "ledger": ledger, "router": router,
        "mattia": mattia, "erika": erika,
        "galaxy": galaxy, "tablet": tablet, "iphone": iphone,
        "galaxy_id": galaxy_id, "tablet_id": tablet_id, "iphone_id": iphone_id,
    }


# --- request ----------------------------------------------------------------------


def test_requests_are_validated_and_recipients_deduplicated_in_order() -> None:
    built = NotificationRequest.create(recipients=["b", "a", "b"], source="self_test", message="hi")
    assert built.recipients == ("b", "a")
    assert built.category == "default"
    assert "hi" not in repr(built)

    bad = [
        {"recipients": [], "source": "waste", "message": "x"},
        {"recipients": "abc", "source": "waste", "message": "x"},
        {"recipients": ["person.mattia"], "source": "waste", "message": "x"},
        {"recipients": [str(index) for index in range(33)], "source": "waste", "message": "x"},
        {"recipients": ["a"], "source": "Waste Collection", "message": "x"},
        {"recipients": ["a"], "source": "waste", "message": "   "},
        {"recipients": ["a"], "source": "waste", "message": "x" * 4097},
        {"recipients": ["a"], "source": "waste", "message": "x", "title": "x" * 257},
        {"recipients": ["a"], "source": "waste", "message": "x", "category": "marketing"},
        {"recipients": ["a"], "source": "waste", "message": "x", "dedupe_key": "x" * 257},
        {"recipients": ["a"], "source": "waste", "message": "x", "metadata": {"blob": "x" * 5000}},
        {"recipients": ["a"], "source": "waste", "message": "x", "metadata": {"bad": object()}},
    ]
    for fields in bad:
        with pytest.raises(InvalidNotificationRequestError):
            NotificationRequest.create(**fields)


# --- recipient resolution -----------------------------------------------------------


async def test_a_person_with_a_profile_gets_it_on_every_enabled_device(home) -> None:
    result = await home["router"].async_send(request("p-mattia"))

    (mattia,) = result.results
    assert mattia.person_id == "p-mattia"
    assert mattia.status is RecipientStatus.DELIVERED
    assert [device.personal_device_id for device in mattia.devices] == [home["galaxy_id"], home["tablet_id"]]
    assert home["galaxy"].calls == [{"message": "VERY_PRIVATE_MESSAGE", "title": "VERY_PRIVATE_TITLE"}]
    assert len(home["tablet"].calls) == 1
    assert home["iphone"].calls == []
    assert len(result.request_id) == 32


async def test_renaming_the_person_entity_changes_nothing(home) -> None:
    hass = home["hass"]
    hass.states.async_remove("person.mattia")
    set_person(hass, "person.mattia_ticconi", "p-mattia", home["mattia"].id)

    (result,) = (await home["router"].async_send(request("p-mattia"))).results

    assert result.status is RecipientStatus.DELIVERED


async def test_recipients_that_cannot_be_resolved(home) -> None:
    hass = home["hass"]
    set_person(hass, "person.guest", "p-guest", None)
    set_person(hass, "person.copy_a", "p-copy", home["mattia"].id)
    set_person(hass, "person.copy_b", "p-copy", home["erika"].id)
    disabled = await hass.auth.async_create_user("Disabled")
    await hass.auth.async_deactivate_user(disabled)
    set_person(hass, "person.disabled", "p-disabled", disabled.id)
    system = await hass.auth.async_create_system_user("Supervisor")
    set_person(hass, "person.system", "p-system", system.id)
    set_person(hass, "person.removed_user", "p-removed", "0" * 32)

    result = await home["router"].async_send(
        request("p-unknown", "p-guest", "p-copy", "p-disabled", "p-system", "p-removed")
    )

    assert [(item.person_id, item.status, item.reason) for item in result.results] == [
        ("p-unknown", RecipientStatus.SKIPPED, Reason.UNKNOWN_RECIPIENT),
        ("p-guest", RecipientStatus.SKIPPED, Reason.NO_ACCOUNT),
        # Never the first match.
        ("p-copy", RecipientStatus.SKIPPED, Reason.AMBIGUOUS_RECIPIENT),
        ("p-disabled", RecipientStatus.SKIPPED, Reason.ACCOUNT_DISABLED),
        ("p-system", RecipientStatus.SKIPPED, Reason.ACCOUNT_UNAVAILABLE),
        ("p-removed", RecipientStatus.SKIPPED, Reason.ACCOUNT_UNAVAILABLE),
    ]
    assert not home["galaxy"].calls and not home["iphone"].calls


async def test_a_removed_person_is_unknown(home) -> None:
    home["hass"].states.async_remove("person.mattia")

    (result,) = (await home["router"].async_send(request("p-mattia"))).results

    assert result.reason is Reason.UNKNOWN_RECIPIENT


async def test_relinking_a_person_routes_to_the_new_users_profile(home) -> None:
    set_person(home["hass"], "person.mattia", "p-mattia", home["erika"].id)

    (result,) = (await home["router"].async_send(request("p-mattia"))).results

    assert result.status is RecipientStatus.DELIVERED
    assert [device.personal_device_id for device in result.devices] == [home["iphone_id"]]
    assert home["galaxy"].calls == [] and len(home["iphone"].calls) == 1


# --- profile and preferences --------------------------------------------------------


async def test_no_profile_and_no_devices_stay_distinct(home) -> None:
    hass, manager = home["hass"], home["manager"]
    luca = await hass.auth.async_create_user("Luca")
    anna = await hass.auth.async_create_user("Anna")
    set_person(hass, "person.luca", "p-luca", luca.id)
    set_person(hass, "person.anna", "p-anna", anna.id)
    # Anna saved her profile once (a real change) but has no device.
    await manager.async_save_self(anna.id, 0, {"notifications": {"enabled": False}})
    await manager.async_save_self(anna.id, 1, {"notifications": {"enabled": True}})

    result = await home["router"].async_send(request("p-luca", "p-anna"))

    assert [(item.status, item.reason) for item in result.results] == [
        (RecipientStatus.SKIPPED, Reason.NO_PROFILE),
        (RecipientStatus.SKIPPED, Reason.NO_DEVICES),
    ]


async def test_the_general_switch_off_sends_nothing_and_keeps_device_switches(home) -> None:
    manager, mattia = home["manager"], home["mattia"]
    revision = manager.get_profile(mattia.id).revision
    await manager.async_save_self(mattia.id, revision, {"notifications": {"enabled": False}})
    before = manager.get_profile(mattia.id).profile

    (result,) = (await home["router"].async_send(request("p-mattia"))).results

    assert (result.status, result.reason, result.devices) == (
        RecipientStatus.SKIPPED, Reason.NOTIFICATIONS_DISABLED, (),
    )
    assert home["galaxy"].calls == [] and home["tablet"].calls == []
    assert manager.get_profile(mattia.id).profile == before
    assert all(device.notifications_enabled for device in before.personal_devices)


async def test_device_switches_choose_the_devices(home) -> None:
    manager, mattia = home["manager"], home["mattia"]
    revision = manager.get_profile(mattia.id).revision
    await manager.async_update_device(mattia.id, revision, home["tablet_id"], {"notifications_enabled": False})

    (result,) = (await home["router"].async_send(request("p-mattia"))).results
    assert result.status is RecipientStatus.DELIVERED
    assert [device.personal_device_id for device in result.devices] == [home["galaxy_id"]]
    assert len(home["galaxy"].calls) == 1 and home["tablet"].calls == []

    revision = manager.get_profile(mattia.id).revision
    await manager.async_update_device(mattia.id, revision, home["galaxy_id"], {"notifications_enabled": False})
    (result,) = (await home["router"].async_send(request("p-mattia"))).results
    # Devices exist but none wants notifications: that is not "no devices".
    assert (result.status, result.reason) == (RecipientStatus.SKIPPED, Reason.NOTIFICATIONS_DISABLED)


# --- targets -------------------------------------------------------------------------


async def test_one_unavailable_device_makes_a_partial_delivery_without_touching_the_store(
    home, hass_storage: dict
) -> None:
    hass = home["hass"]
    hass.services.async_remove("notify", home["tablet"].service)
    before = json.dumps(hass_storage[PROFILE_KEY], sort_keys=True)

    (result,) = (await home["router"].async_send(request("p-mattia"))).results

    assert result.status is RecipientStatus.PARTIAL
    assert [(device.status, device.reason) for device in result.devices] == [
        (DeviceStatus.DELIVERED, None),
        (DeviceStatus.SKIPPED, Reason.TARGET_UNAVAILABLE),
    ]
    assert len(home["galaxy"].calls) == 1
    assert json.dumps(hass_storage[PROFILE_KEY], sort_keys=True) == before


async def test_an_ambiguous_target_is_never_guessed(home) -> None:
    hass = home["hass"]
    # A second registration whose name slugifies like the tablet's shares its legacy service.
    register_phone(hass, home["erika"].id, "tablet", legacy_service=False)

    (result,) = (await home["router"].async_send(request("p-mattia"))).results

    assert result.status is RecipientStatus.PARTIAL
    assert result.devices[1].reason is Reason.AMBIGUOUS_TARGET
    assert home["tablet"].calls == []


async def test_a_notify_entity_of_the_device_is_preferred(home) -> None:
    hass = home["hass"]
    entity_id = await add_notify_entity(hass, home["galaxy"])
    assert hass.states.get(entity_id).state == "unknown"

    (result,) = (await home["router"].async_send(request("p-mattia"))).results

    assert result.status is RecipientStatus.DELIVERED
    # Exactly one call for the galaxy, and it went through the entity, which now records its last send.
    assert home["galaxy"].calls == [{"message": "VERY_PRIVATE_MESSAGE", "title": "VERY_PRIVATE_TITLE"}]
    assert hass.states.get(entity_id).state not in ("unknown", "unavailable")


async def test_failures_and_timeouts(hass: HomeAssistant, home) -> None:
    manager, ledger = home["manager"], home["ledger"]

    router = NotificationRouter(hass, manager, ledger, timeout=0.05)
    home["galaxy"].behaviour = "error"
    home["tablet"].behaviour = "hang"

    (result,) = (await router.async_send(request("p-mattia"))).results

    assert result.status is RecipientStatus.FAILED
    assert result.reason is Reason.DELIVERY_FAILED
    assert [(device.status, device.reason) for device in result.devices] == [
        (DeviceStatus.FAILED, Reason.DELIVERY_FAILED),
        (DeviceStatus.FAILED, Reason.DELIVERY_TIMEOUT),
    ]
    home["galaxy"].behaviour = "hang"
    (result,) = (await router.async_send(request("p-mattia"))).results
    assert (result.status, result.reason) == (RecipientStatus.FAILED, Reason.DELIVERY_TIMEOUT)


async def test_a_device_no_longer_tied_to_the_user_is_never_notified(home) -> None:
    hass = home["hass"]
    # The tablet's app now says it belongs to Erika.
    entry = home["tablet"].entry
    hass.config_entries.async_update_entry(entry, data={**entry.data, "user_id": home["erika"].id})

    (result,) = (await home["router"].async_send(request("p-mattia"))).results

    assert result.status is RecipientStatus.PARTIAL
    assert result.devices[1].reason is Reason.DEVICE_NOT_VERIFIED
    assert home["tablet"].calls == []


async def test_a_device_removed_from_home_assistant_is_unavailable(home) -> None:
    dr.async_get(home["hass"]).async_remove_device(home["tablet"].device.id)

    (result,) = (await home["router"].async_send(request("p-mattia"))).results

    assert result.status is RecipientStatus.PARTIAL
    assert result.devices[1].reason is Reason.TARGET_UNAVAILABLE


# --- isolation -------------------------------------------------------------------------


async def test_every_recipient_gets_its_own_outcome(home) -> None:
    hass = home["hass"]
    hass.services.async_remove("notify", home["tablet"].service)
    luca = await hass.auth.async_create_user("Luca")
    set_person(hass, "person.luca", "p-luca", luca.id)
    await home["manager"].async_save_self(luca.id, 0, {"notifications": {"enabled": False}})
    await home["manager"].async_save_self(luca.id, 1, {"notifications": {"enabled": True}})
    set_person(hass, "person.anna", "p-anna", None)
    home["galaxy"].behaviour = "crash"

    result = await home["router"].async_send(request("p-mattia", "p-erika", "p-luca", "p-anna", "p-mattia"))

    assert [(item.person_id, item.status, item.reason) for item in result.results] == [
        ("p-mattia", RecipientStatus.FAILED, Reason.DELIVERY_FAILED),
        ("p-erika", RecipientStatus.DELIVERED, None),
        ("p-luca", RecipientStatus.SKIPPED, Reason.NO_DEVICES),
        ("p-anna", RecipientStatus.SKIPPED, Reason.NO_ACCOUNT),
    ]
    assert len(home["iphone"].calls) == 1


async def test_an_unexpected_error_in_one_recipient_does_not_cancel_the_others(home) -> None:
    router = home["router"]
    original = router._recipient  # noqa: SLF001

    async def broken(request_id, person_id, persons, content):
        if person_id == "p-mattia":
            raise RuntimeError("bug")
        return await original(request_id, person_id, persons, content)

    with patch.object(router, "_recipient", broken):
        result = await router.async_send(request("p-mattia", "p-erika"))

    assert [(item.status, item.reason) for item in result.results] == [
        (RecipientStatus.FAILED, Reason.DELIVERY_FAILED),
        (RecipientStatus.DELIVERED, None),
    ]


async def test_deliveries_run_in_parallel_under_a_bound(hass: HomeAssistant, home) -> None:
    running = peak = 0

    async def send(*_args, **_kwargs):
        nonlocal running, peak
        running += 1
        peak = max(peak, running)
        await asyncio.sleep(0.01)
        running -= 1
        return DeliveryOutcome.DELIVERED

    router = NotificationRouter(hass, home["manager"], home["ledger"], send=send, concurrency=2)
    result = await router.async_send(request("p-mattia", "p-erika"))

    assert all(item.status is RecipientStatus.DELIVERED for item in result.results)
    assert peak == 2


# --- deduplication -----------------------------------------------------------------------


async def test_a_dedupe_key_delivers_once_per_device(home) -> None:
    router = home["router"]

    first = (await router.async_send(request("p-mattia", dedupe_key="waste:2026-10-12:paper"))).results[0]
    second = (await router.async_send(request("p-mattia", dedupe_key="waste:2026-10-12:paper"))).results[0]

    assert first.status is RecipientStatus.DELIVERED
    assert second.status is RecipientStatus.DELIVERED
    assert [device.status for device in second.devices] == [DeviceStatus.ALREADY_SENT] * 2
    assert len(home["galaxy"].calls) == 1 and len(home["tablet"].calls) == 1


async def test_dedupe_is_per_device_person_and_source(home) -> None:
    router, manager, mattia = home["router"], home["manager"], home["mattia"]
    revision = manager.get_profile(mattia.id).revision
    await manager.async_update_device(mattia.id, revision, home["tablet_id"], {"notifications_enabled": False})
    await router.async_send(request("p-mattia", dedupe_key="abc"))
    revision = manager.get_profile(mattia.id).revision
    await manager.async_update_device(mattia.id, revision, home["tablet_id"], {"notifications_enabled": True})

    (again,) = (await router.async_send(request("p-mattia", dedupe_key="abc"))).results
    assert [device.status for device in again.devices] == [DeviceStatus.ALREADY_SENT, DeviceStatus.DELIVERED]

    (erika,) = (await router.async_send(request("p-erika", dedupe_key="abc"))).results
    assert erika.devices[0].status is DeviceStatus.DELIVERED

    (other_source,) = (await router.async_send(request("p-mattia", dedupe_key="abc", source="security"))).results
    assert [device.status for device in other_source.devices] == [DeviceStatus.DELIVERED] * 2
    assert len(home["galaxy"].calls) == 2 and len(home["tablet"].calls) == 2


async def test_without_a_dedupe_key_every_call_sends(home, hass_storage: dict) -> None:
    await home["router"].async_send(request("p-mattia"))
    await home["router"].async_send(request("p-mattia"))

    assert len(home["galaxy"].calls) == 2
    assert LEDGER_KEY not in hass_storage


async def test_a_retry_repeats_only_the_devices_that_did_not_get_it(home) -> None:
    router = home["router"]
    home["tablet"].behaviour = "error"
    (first,) = (await router.async_send(request("p-mattia", dedupe_key="abc"))).results
    assert first.status is RecipientStatus.PARTIAL

    home["tablet"].behaviour = "ok"
    (retry,) = (await router.async_send(request("p-mattia", dedupe_key="abc"))).results

    assert retry.status is RecipientStatus.DELIVERED
    assert [device.status for device in retry.devices] == [DeviceStatus.ALREADY_SENT, DeviceStatus.DELIVERED]
    assert len(home["galaxy"].calls) == 1 and len(home["tablet"].calls) == 1


async def test_failed_or_skipped_deliveries_are_never_recorded(home) -> None:
    router, ledger = home["router"], home["ledger"]
    home["galaxy"].behaviour = "error"
    home["hass"].services.async_remove("notify", home["tablet"].service)

    await router.async_send(request("p-mattia", dedupe_key="abc"))

    assert len(ledger) == 0


async def test_concurrent_identical_requests_send_once(home) -> None:
    router = home["router"]

    first, second = await asyncio.gather(
        router.async_send(request("p-mattia", dedupe_key="abc")),
        router.async_send(request("p-mattia", dedupe_key="abc")),
    )

    statuses = sorted(device.status.value for result in (first, second) for device in result.results[0].devices)
    assert statuses == ["already_sent", "already_sent", "delivered", "delivered"]
    assert len(home["galaxy"].calls) == 1 and len(home["tablet"].calls) == 1
    assert len(router._locks) == 0  # noqa: SLF001 - every keyed lock is released


async def test_a_slow_delivery_does_not_block_another_person(hass: HomeAssistant, home) -> None:
    router = NotificationRouter(hass, home["manager"], home["ledger"], timeout=0.3)
    home["galaxy"].behaviour = "hang"
    home["hass"].services.async_remove("notify", home["tablet"].service)
    slow = asyncio.create_task(router.async_send(request("p-mattia", dedupe_key="abc")))
    await asyncio.sleep(0.01)

    fast = await asyncio.wait_for(router.async_send(request("p-erika", dedupe_key="abc")), timeout=0.2)

    assert fast.results[0].status is RecipientStatus.DELIVERED
    slow_result = (await slow).results[0]
    assert (slow_result.status, slow_result.reason) == (RecipientStatus.FAILED, Reason.DELIVERY_TIMEOUT)


async def test_the_ledger_survives_a_restart(hass: HomeAssistant, home) -> None:
    await home["router"].async_send(request("p-mattia", dedupe_key="abc"))
    ledger = NotificationLedger(hass)
    await ledger.async_setup()
    router = NotificationRouter(hass, home["manager"], ledger)

    (result,) = (await router.async_send(request("p-mattia", dedupe_key="abc"))).results

    assert [device.status for device in result.devices] == [DeviceStatus.ALREADY_SENT] * 2
    assert len(home["galaxy"].calls) == 1


async def test_an_unavailable_ledger_refuses_deduplicated_sends_only(hass: HomeAssistant, home, hass_storage: dict) -> None:
    hass_storage[LEDGER_KEY] = {"version": 1, "minor_version": 1, "key": LEDGER_KEY, "data": {"bad": True}}
    ledger = NotificationLedger(hass)
    await ledger.async_setup()
    assert ledger.status is LedgerStatus.CORRUPT
    router = NotificationRouter(hass, home["manager"], ledger)

    (refused,) = (await router.async_send(request("p-mattia", dedupe_key="abc"))).results
    assert (refused.status, refused.reason) == (RecipientStatus.SKIPPED, Reason.DEDUPE_UNAVAILABLE)
    assert home["galaxy"].calls == []

    (plain,) = (await router.async_send(request("p-mattia"))).results
    assert plain.status is RecipientStatus.DELIVERED
    # The corrupt ledger is kept as it was; the profile keeps working.
    assert hass_storage[LEDGER_KEY]["data"] == {"bad": True}
    assert home["manager"].get_profile(home["mattia"].id).persisted

    no_ledger = NotificationRouter(hass, home["manager"], None)
    (missing,) = (await no_ledger.async_send(request("p-mattia", dedupe_key="abc"))).results
    assert missing.reason is Reason.DEDUPE_UNAVAILABLE


async def test_a_ledger_write_failure_after_sending_is_still_a_delivery(home, caplog) -> None:
    ledger = home["ledger"]

    with patch.object(ledger.store, "async_save", AsyncMock(side_effect=OSError("disk full"))):
        (result,) = (await home["router"].async_send(request("p-mattia", dedupe_key="abc"))).results

    assert result.status is RecipientStatus.DELIVERED
    assert [(device.status, device.warning) for device in result.devices] == [
        (DeviceStatus.DELIVERED, DeliveryWarning.DEDUPE_NOT_RECORDED),
    ] * 2
    assert "VERY_PRIVATE" not in caplog.text


# --- privacy -------------------------------------------------------------------------------


async def test_no_content_or_target_is_ever_stored_or_logged(home, hass_storage: dict, caplog) -> None:
    caplog.set_level("DEBUG", logger="custom_components.domusos")
    home["tablet"].behaviour = "error"

    result = await home["router"].async_send(request("p-mattia", "p-erika", dedupe_key="VERY_PRIVATE_KEY"))

    stores = json.dumps({key: hass_storage[key] for key in (PROFILE_KEY, LEDGER_KEY)})
    for text in (*SENTINELS, home["galaxy"].service, "notify.", "push_token", "webhook", "https://"):
        assert text not in stores
    result_text = json.dumps(result.as_dict())
    for text in (*SENTINELS, home["galaxy"].service, "notify"):
        assert text not in result_text
    for text in SENTINELS:
        assert text not in caplog.text
