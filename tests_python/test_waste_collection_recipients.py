"""Waste Collection to people: schema v2, explicit conversion, router delivery and no double send."""

import json
from copy import deepcopy
from datetime import date
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock

import pytest
from homeassistant.core import HomeAssistant, ServiceCall

from custom_components.domusos.notifications import (
    DispatchResult,
    NotificationRequest,
    RecipientResult,
    RecipientStatus,
)
from custom_components.domusos.waste_collection.dispatch import build_waste_dedupe_key
from custom_components.domusos.waste_collection.manager import WasteCollectionManager
from custom_components.domusos.waste_collection.models import (
    WasteCollectionConflictError,
    WasteCollectionValidationError,
    WasteNotificationRouterUnavailableError,
    default_document,
    normalize_stored_document,
    public_document,
)

from notification_support import claim, register_phone, set_person, start

ADMIN = SimpleNamespace(id="admin-1", is_admin=True)
DAY = date(2026, 10, 7)  # a Wednesday with organic and paper
MANAGERS: list[WasteCollectionManager] = []


@pytest.fixture(autouse=True)
async def cleanup():
    yield
    for manager in MANAGERS:
        await manager.async_shutdown()
    MANAGERS.clear()


def v2_document(**notifications: Any) -> dict[str, Any]:
    document = default_document()
    document["sources"] = [{
        "id": "municipal", "kind": "fixed", "name": "Comune", "enabled": True, "entityIds": [],
        "rules": [
            {"id": "organic-wed", "wasteTypeId": "organic", "enabled": True, "weekdays": ["wed"],
             "intervalWeeks": 1, "anchorDate": "2026-10-07", "startDate": "", "endDate": ""},
            {"id": "paper-wed", "wasteTypeId": "paper", "enabled": True, "weekdays": ["wed"],
             "intervalWeeks": 2, "anchorDate": "2026-10-07", "startDate": "", "endDate": ""},
        ],
    }]
    document["notifications"].update(notifications)
    return document


def v1_document(targets: list[str], enabled: bool = True) -> dict[str, Any]:
    document = v2_document()
    document["version"] = 1
    document["revision"] = 7
    document["dispatchLedger"] = ["2026-09-30|notify.mobile_app_phone"]
    document["notifications"] = {"enabled": enabled, "time": "19:30", "targets": targets}
    return document


class RecordingRouter:
    """Stands in for the shared router where only the request matters."""

    def __init__(self, statuses: dict[str, RecipientStatus] | None = None) -> None:
        self.requests: list[NotificationRequest] = []
        self._statuses = statuses or {}

    async def async_send(self, request: NotificationRequest) -> DispatchResult:
        self.requests.append(request)
        return DispatchResult("r" * 32, tuple(
            RecipientResult(person_id, self._statuses.get(person_id, RecipientStatus.DELIVERED))
            for person_id in request.recipients
        ))


async def manager_with(hass: HomeAssistant, stored: dict[str, Any] | None, router: Any = None) -> WasteCollectionManager:
    manager = WasteCollectionManager(hass, notification_router=lambda: router)
    manager.store.async_load = AsyncMock(return_value=deepcopy(stored) if stored else None)
    manager.store.async_save = AsyncMock()
    await manager.async_setup()
    MANAGERS.append(manager)
    return manager


def client_config(document: dict[str, Any], **notifications: Any) -> dict[str, Any]:
    public = public_document(document)
    sent = {key: public["notifications"][key] for key in ("enabled", "time", "mode", "recipients")}
    sent.update(notifications)
    return {**{key: public[key] for key in ("wasteTypes", "sources", "mappings", "exceptions")}, "notifications": sent}


# --- schema and migration --------------------------------------------------------------


async def test_a_version_1_document_migrates_without_changing_who_receives(hass: HomeAssistant) -> None:
    stored = v1_document(["notify.mobile_app_phone", "notify.family"])
    manager = await manager_with(hass, stored)
    document = manager.document

    assert document["version"] == 2
    for key in ("wasteTypes", "sources", "mappings", "exceptions"):
        assert document[key] == normalize_stored_document(stored)[key]
    assert document["revision"] == 7
    assert document["dispatchLedger"] == ["2026-09-30|notify.mobile_app_phone"]
    assert document["notifications"] == {
        "enabled": True, "time": "19:30", "mode": "legacy",
        "recipients": [], "legacyTargets": ["notify.mobile_app_phone", "notify.family"],
    }
    # Loading never writes; the migration reaches disk with the next real save.
    manager.store.async_save.assert_not_called()


async def test_a_version_1_document_without_targets_starts_with_people(hass: HomeAssistant) -> None:
    manager = await manager_with(hass, v1_document([], enabled=False))

    assert manager.document["notifications"]["mode"] == "recipients"
    assert manager.document["notifications"]["legacyTargets"] == []


async def test_a_version_2_document_is_stable_across_save_and_reload(hass: HomeAssistant) -> None:
    manager = await manager_with(hass, v1_document(["notify.mobile_app_phone"]))
    await manager.async_save_configuration(client_config(manager.document), manager.revision, ADMIN)
    saved = manager.store.async_save.await_args.args[0]

    reloaded = await manager_with(hass, saved)

    assert saved["version"] == 2 and "targets" not in saved["notifications"]
    assert reloaded.document == saved


@pytest.mark.parametrize(
    "notifications",
    [
        {"mode": "everyone"},
        {"mode": "recipients", "recipients": ["../evil"]},
        {"mode": "recipients", "recipients": [3]},
        {"mode": "recipients", "recipients": [f"p{index}" for index in range(33)]},
        {"mode": "legacy", "legacyTargets": []},
        {"mode": "legacy", "legacyTargets": ["notify.x"], "recipients": ["p-a"]},
    ],
)
def test_an_invalid_version_2_document_is_refused_never_turned_legacy(notifications: dict) -> None:
    with pytest.raises(WasteCollectionValidationError):
        normalize_stored_document(v2_document(**notifications))


def test_an_unknown_future_version_is_refused() -> None:
    document = v2_document()
    document["version"] = 3
    with pytest.raises(WasteCollectionValidationError):
        normalize_stored_document(document)


def test_recipients_keep_their_order_and_exact_value() -> None:
    document = normalize_stored_document(v2_document(recipients=["B-id", "a_id", "B-id"]))
    assert document["notifications"]["recipients"] == ["B-id", "a_id"]


async def test_a_new_configuration_chooses_people_with_no_technical_target(hass: HomeAssistant) -> None:
    manager = await manager_with(hass, None)
    assert manager.document["notifications"]["mode"] == "recipients"

    saved = await manager.async_save_configuration(
        client_config(v2_document(), enabled=True, recipients=["p-mattia", "p-erika"]), 0, ADMIN
    )

    assert saved["notifications"] == {
        "enabled": True, "time": "20:00", "mode": "recipients",
        "recipients": ["p-mattia", "p-erika"], "legacyTargetCount": 0,
    }
    stored = manager.store.async_save.await_args.args[0]
    assert stored["notifications"]["legacyTargets"] == []


# --- conversion ---------------------------------------------------------------------------


async def test_conversion_is_explicit_atomic_and_keeps_the_legacy_targets(hass: HomeAssistant) -> None:
    manager = await manager_with(hass, v1_document(["notify.mobile_app_mattia", "notify.family"]))
    public = public_document(manager.document)
    # Opening a previous configuration shows no people and no targets.
    assert public["notifications"]["recipients"] == []
    assert "legacyTargets" not in public["notifications"] and public["notifications"]["legacyTargetCount"] == 2

    await manager.async_save_configuration(
        client_config(manager.document, mode="recipients", recipients=["p-mattia", "p-erika"]), 7, ADMIN
    )

    assert manager.store.async_save.await_count == 1
    notifications = manager.store.async_save.await_args.args[0]["notifications"]
    assert notifications == {
        "enabled": True, "time": "19:30", "mode": "recipients",
        "recipients": ["p-mattia", "p-erika"], "legacyTargets": ["notify.mobile_app_mattia", "notify.family"],
    }


async def test_conversion_rules(hass: HomeAssistant) -> None:
    manager = await manager_with(hass, v1_document(["notify.mobile_app_mattia"]))
    before = deepcopy(manager.document)

    for notifications in (
        {"mode": "recipients", "recipients": []},              # converting to nobody
        {"mode": "legacy", "targets": ["notify.new"]},          # a client choosing technical targets
        {"mode": "legacy", "legacyTargets": ["notify.new"]},
        {"mode": None},
    ):
        with pytest.raises(WasteCollectionValidationError):
            await manager.async_save_configuration(client_config(manager.document, **notifications), 7, ADMIN)
    assert manager.document == before
    manager.store.async_save.assert_not_called()

    # Other edits of a previous configuration keep it previous, targets intact.
    await manager.async_save_configuration(client_config(manager.document, time="21:00"), 7, ADMIN)
    assert manager.document["notifications"]["mode"] == "legacy"
    assert manager.document["notifications"]["legacyTargets"] == ["notify.mobile_app_mattia"]

    # Once on people, there is no way back from the client.
    await manager.async_save_configuration(client_config(manager.document, mode="recipients", recipients=["p-a"]), 8, ADMIN)
    with pytest.raises(WasteCollectionValidationError):
        await manager.async_save_configuration(client_config(manager.document, mode="legacy", recipients=[]), 9, ADMIN)


async def test_a_stale_conversion_is_a_revision_conflict(hass: HomeAssistant) -> None:
    manager = await manager_with(hass, v1_document(["notify.mobile_app_mattia"]))
    await manager.async_save_configuration(client_config(manager.document, time="21:00"), 7, ADMIN)

    with pytest.raises(WasteCollectionConflictError):
        await manager.async_save_configuration(client_config(manager.document, mode="recipients", recipients=["p-a"]), 7, ADMIN)
    assert manager.document["notifications"]["mode"] == "legacy"


async def test_nothing_is_ever_preselected_from_a_target_name(hass: HomeAssistant) -> None:
    set_person(hass, "person.mattia", "p-mattia", None)
    hass.states.async_set("person.mattia", "home", {"id": "p-mattia", "friendly_name": "Mattia"})
    manager = await manager_with(hass, v1_document(["notify.mobile_app_mattia"]))

    assert manager.document["notifications"]["recipients"] == []
    assert public_document(manager.document)["notifications"]["recipients"] == []


# --- one authority per reminder ------------------------------------------------------------------


async def test_people_mode_builds_one_router_request_and_never_uses_targets(hass: HomeAssistant) -> None:
    router = RecordingRouter()
    document = v1_document(["notify.mobile_app_mattia"])
    manager = await manager_with(hass, document, router)
    await manager.async_save_configuration(client_config(manager.document, mode="recipients", recipients=["p-mattia", "p-erika"]), 7, ADMIN)
    manager._async_send_to_target = AsyncMock()  # noqa: SLF001 - the legacy sender

    result = await manager.async_dispatch_reminder(DAY)

    (request,) = router.requests
    assert (request.source, request.category) == ("waste_collection", "waste")
    assert request.recipients == ("p-mattia", "p-erika")
    assert (request.title, request.message) == ("Raccolta di domani", "Organico · Carta e cartone")
    assert request.dedupe_key == build_waste_dedupe_key(DAY, ["organic", "paper"])
    manager._async_send_to_target.assert_not_called()  # noqa: SLF001
    assert result["mode"] == "recipients" and result["status"] == "delivered"
    assert result["events"] == ["Organico", "Carta e cartone"]


async def test_legacy_mode_never_calls_the_router(hass: HomeAssistant) -> None:
    router = RecordingRouter()
    manager = await manager_with(hass, v1_document(["notify.mobile_app_phone"]), router)
    manager._async_send_to_target = AsyncMock()  # noqa: SLF001

    result = await manager.async_dispatch_reminder(DAY)

    assert router.requests == []
    assert result["mode"] == "legacy" and result["sent"] == ["notify.mobile_app_phone"]


async def test_no_double_send_with_real_services(hass: HomeAssistant) -> None:
    """People mode with a kept legacy target: only the router path runs."""
    await hass.auth.async_create_user("Owner")
    mattia = await hass.auth.async_create_user("Mattia")
    profiles, _ledger, router = await start(hass)
    phone = register_phone(hass, mattia.id, "Galaxy")
    await claim(profiles, mattia.id, phone)
    set_person(hass, "person.mattia", "p-mattia", mattia.id)
    legacy_calls: list[dict] = []

    async def legacy(call: ServiceCall) -> None:
        legacy_calls.append(dict(call.data))

    hass.services.async_register("notify", "mobile_app_mattia_old", legacy)
    manager = await manager_with(hass, v1_document(["notify.mobile_app_mattia_old"]), router)
    await manager.async_save_configuration(client_config(manager.document, mode="recipients", recipients=["p-mattia"]), 7, ADMIN)

    result = await manager.async_dispatch_reminder(DAY)

    assert result["status"] == "delivered"
    assert phone.calls == [{"message": "Organico · Carta e cartone", "title": "Raccolta di domani"}]
    assert legacy_calls == []
    assert manager.document["dispatchLedger"] == ["2026-09-30|notify.mobile_app_phone"]


async def test_without_the_router_nothing_falls_back_to_targets(hass: HomeAssistant) -> None:
    manager = await manager_with(hass, v1_document(["notify.mobile_app_mattia"]), None)
    await manager.async_save_configuration(client_config(manager.document, mode="recipients", recipients=["p-mattia"]), 7, ADMIN)
    manager._async_send_to_target = AsyncMock()  # noqa: SLF001

    result = await manager.async_dispatch_reminder(DAY)

    assert result["skipped"] == "notification_router_unavailable"
    manager._async_send_to_target.assert_not_called()  # noqa: SLF001
    with pytest.raises(WasteNotificationRouterUnavailableError):
        await manager.async_send_test_notification(ADMIN)
    manager._async_send_to_target.assert_not_called()  # noqa: SLF001


# --- outcomes with the real router -------------------------------------------------------------


@pytest.fixture
async def people(hass: HomeAssistant):
    await hass.auth.async_create_user("Owner")
    mattia = await hass.auth.async_create_user("Mattia")
    erika = await hass.auth.async_create_user("Erika")
    luca = await hass.auth.async_create_user("Luca")
    profiles, _ledger, router = await start(hass)
    galaxy = register_phone(hass, mattia.id, "Galaxy")
    tablet = register_phone(hass, mattia.id, "Tablet")
    iphone = register_phone(hass, erika.id, "iPhone")
    await claim(profiles, mattia.id, galaxy, tablet)
    await claim(profiles, erika.id, iphone)
    await profiles.async_save_self(luca.id, 0, {"notifications": {"enabled": False}})
    await profiles.async_save_self(luca.id, 1, {"notifications": {"enabled": True}})
    set_person(hass, "person.mattia", "p-mattia", mattia.id)
    set_person(hass, "person.erika", "p-erika", erika.id)
    set_person(hass, "person.luca", "p-luca", luca.id)

    async def waste(recipients: list[str]) -> WasteCollectionManager:
        manager = await manager_with(hass, v2_document(enabled=True, recipients=recipients), router)
        manager._async_send_to_target = AsyncMock(side_effect=AssertionError("legacy path"))  # noqa: SLF001
        return manager

    return SimpleNamespace(
        hass=hass, profiles=profiles, router=router, waste=waste,
        mattia=mattia, erika=erika, galaxy=galaxy, tablet=tablet, iphone=iphone,
    )


async def test_partial_and_unknown_recipients_never_break_the_reminder(people) -> None:
    people.hass.services.async_remove("notify", people.tablet.service)
    manager = await people.waste(["p-mattia", "p-erika", "p-luca", "p-removed"])

    result = await manager.async_dispatch_reminder(DAY)

    assert result["status"] == "partial"
    assert result["recipients"] == [
        {"person_id": "p-mattia", "status": "partial"},
        {"person_id": "p-erika", "status": "delivered"},
        {"person_id": "p-luca", "status": "skipped", "reason": "no_devices"},
        {"person_id": "p-removed", "status": "skipped", "reason": "unknown_recipient"},
    ]
    # Never a device detail in what Waste reports.
    assert "personal_device_id" not in json.dumps(result) and "Galaxy" not in json.dumps(result)


async def test_failed_and_skipped_reminders_are_results_not_errors(people) -> None:
    people.galaxy.behaviour = people.tablet.behaviour = "error"
    failed = await (await people.waste(["p-mattia"])).async_dispatch_reminder(DAY)
    skipped = await (await people.waste(["p-luca"])).async_dispatch_reminder(DAY)

    assert failed["status"] == "failed" and failed["recipients"][0]["reason"] == "delivery_failed"
    assert skipped["status"] == "skipped" and skipped["recipients"][0]["reason"] == "no_devices"


async def test_a_retry_of_the_same_reminder_only_repeats_what_failed(people) -> None:
    manager = await people.waste(["p-mattia"])
    people.tablet.behaviour = "error"
    first = await manager.async_dispatch_reminder(DAY)
    people.tablet.behaviour = "ok"

    second = await manager.async_dispatch_reminder(DAY)

    assert (first["status"], second["status"]) == ("partial", "delivered")
    assert len(people.galaxy.calls) == 1 and len(people.tablet.calls) == 1


async def test_renamed_and_relinked_people_need_no_change(people) -> None:
    hass = people.hass
    manager = await people.waste(["p-mattia"])
    revision_before = manager.revision
    hass.states.async_remove("person.mattia")
    set_person(hass, "person.mattia_ticconi", "p-mattia", people.mattia.id)

    assert (await manager.async_dispatch_reminder(DAY))["status"] == "delivered"

    set_person(hass, "person.mattia_ticconi", "p-mattia", people.erika.id)
    assert (await manager.async_dispatch_reminder(date(2026, 10, 14)))["status"] == "delivered"
    assert len(people.iphone.calls) == 1
    assert manager.document["notifications"]["recipients"] == ["p-mattia"]
    assert manager.revision == revision_before


async def test_the_people_test_is_never_deduplicated(people) -> None:
    manager = await people.waste(["p-erika"])

    first = await manager.async_send_test_notification(ADMIN)
    second = await manager.async_send_test_notification(ADMIN)

    assert first == second == {"mode": "recipients", "status": "delivered", "recipients": [{"person_id": "p-erika", "status": "delivered"}]}
    assert people.iphone.calls == [
        {"message": "Le notifiche per la raccolta rifiuti sono configurate correttamente.", "title": "Domus UI · Test raccolta rifiuti"},
    ] * 2


async def test_the_legacy_test_keeps_its_original_path(hass: HomeAssistant) -> None:
    router = RecordingRouter()
    manager = await manager_with(hass, v1_document(["notify.mobile_app_phone"]), router)
    manager._async_send_to_target = AsyncMock()  # noqa: SLF001

    result = await manager.async_send_test_notification(ADMIN)

    assert result == {"mode": "legacy", "sent": ["notify.mobile_app_phone"], "failed": []}
    assert router.requests == []


async def test_the_store_holds_person_ids_and_nothing_about_devices(people) -> None:
    manager = await people.waste([])
    await manager.async_save_configuration(client_config(manager.document, enabled=True, recipients=["p-mattia"]), 0, ADMIN)
    await manager.async_dispatch_reminder(DAY)

    stored = json.dumps(manager.store.async_save.await_args.args[0])
    assert '"recipients": ["p-mattia"]' in stored
    for secret in (people.galaxy.device.id, people.galaxy.service, people.mattia.id, "push", "webhook", "personal_device"):
        assert secret not in stored, secret


# --- the dedupe key ----------------------------------------------------------------------------


def test_the_dedupe_key_is_the_logical_reminder() -> None:
    key = build_waste_dedupe_key(DAY, ["paper", "organic"])

    assert key == "waste:reminder:2026-10-07:organic+paper:evening"
    assert key == build_waste_dedupe_key(DAY, ["organic", "paper", "organic"])
    assert key != build_waste_dedupe_key(date(2026, 10, 8), ["organic", "paper"])
    assert build_waste_dedupe_key(DAY, ["paper"]) != build_waste_dedupe_key(DAY, ["plastic"])
    long = build_waste_dedupe_key(DAY, [f"type-{index:02d}-{'x' * 50}" for index in range(10)])
    assert len(long) <= 256 and long == build_waste_dedupe_key(DAY, [f"type-{index:02d}-{'x' * 50}" for index in reversed(range(10))])


async def test_wording_and_language_never_change_the_key(hass: HomeAssistant) -> None:
    router = RecordingRouter()
    document = v2_document(enabled=True, recipients=["p-a"])
    manager = await manager_with(hass, document, router)
    await manager.async_dispatch_reminder(DAY)
    renamed = deepcopy(manager.document)
    for waste_type in renamed["wasteTypes"]:
        waste_type["name"] = {"organic": "Organic waste", "paper": "Paper"}.get(waste_type["id"], waste_type["name"])
    other = await manager_with(hass, renamed, router)
    await other.async_dispatch_reminder(DAY)

    first, second = router.requests
    assert first.message != second.message
    assert first.dedupe_key == second.dedupe_key
