"""Tests for waste collection rules, sources and reminders."""

from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from homeassistant.core import HomeAssistant

from custom_components.domusos.waste_collection.manager import (
    WASTE_UID_PREFIX,
    WasteCollectionManager,
)
from custom_components.domusos.waste_collection.models import (
    WasteCollectionValidationError,
    default_document,
    normalize_configuration,
)

OWNER = SimpleNamespace(id="owner-1", is_admin=True)
ACTIVE_MANAGERS: list[WasteCollectionManager] = []


@pytest.fixture(autouse=True)
async def cleanup_waste_collection_managers():
    """Remove every scheduler installed by a manager under test."""
    yield
    for manager in reversed(ACTIVE_MANAGERS):
        await manager.async_shutdown()
    ACTIVE_MANAGERS.clear()


def configured_document() -> dict:
    document = default_document()
    document["sources"] = [{
        "id": "municipal-fixed",
        "kind": "fixed",
        "name": "Calendario comunale",
        "enabled": True,
        "entityIds": [],
        "rules": [
            {
                "id": "organic-wed",
                "wasteTypeId": "organic",
                "enabled": True,
                "weekdays": ["wed"],
                "intervalWeeks": 1,
                "anchorDate": "2026-10-07",
                "startDate": "",
                "endDate": "",
            },
            {
                "id": "paper-wed",
                "wasteTypeId": "paper",
                "enabled": True,
                "weekdays": ["wed"],
                "intervalWeeks": 2,
                "anchorDate": "2026-10-07",
                "startDate": "",
                "endDate": "",
            },
        ],
    }]
    return document


async def create_manager(
    hass: HomeAssistant,
    stored: dict | None = None,
) -> WasteCollectionManager:
    manager = WasteCollectionManager(hass)
    manager.store.async_load = AsyncMock(return_value=stored)
    manager.store.async_save = AsyncMock()
    await manager.async_setup()
    ACTIVE_MANAGERS.append(manager)
    return manager


async def test_fixed_schedule_keeps_multiple_types_as_separate_rows_and_applies_exceptions(
    hass: HomeAssistant,
) -> None:
    document = configured_document()
    document["exceptions"] = [
        {"id": "skip-paper", "date": "2026-10-07", "wasteTypeId": "paper", "action": "skip"},
        {"id": "add-glass", "date": "2026-10-07", "wasteTypeId": "glass", "action": "add"},
    ]
    manager = await create_manager(hass, document)

    events, warnings = await manager.async_events_between(
        datetime(2026, 10, 7, tzinfo=timezone.utc),
        datetime(2026, 10, 8, tzinfo=timezone.utc),
    )

    assert warnings == []
    assert [event.summary for event in events] == ["Vetro", "Organico"]
    assert all(event.uid.startswith(WASTE_UID_PREFIX) for event in events)
    assert all(event.all_day for event in events)


async def test_waste_type_styles_expose_name_icon_and_color(hass: HomeAssistant) -> None:
    manager = await create_manager(hass, configured_document())

    styles = manager.waste_type_styles()

    assert styles["organic"] == {"name": "Organico", "icon": "mdi:leaf", "color": "#22c55e"}
    assert set(styles) == {item["id"] for item in manager.document["wasteTypes"]}


async def test_duplicate_fixed_occurrences_collapse_to_one_row(
    hass: HomeAssistant,
) -> None:
    document = configured_document()
    duplicate = {
        **document["sources"][0],
        "id": "second-source",
        "name": "Seconda sorgente",
        "rules": [{**document["sources"][0]["rules"][0], "id": "organic-duplicate"}],
    }
    document["sources"].append(duplicate)
    manager = await create_manager(hass, document)

    events, _warnings = await manager.async_events_between(
        datetime(2026, 10, 7, tzinfo=timezone.utc),
        datetime(2026, 10, 8, tzinfo=timezone.utc),
    )

    assert [event.summary for event in events].count("Organico") == 1


async def test_external_calendar_uses_exact_mapping_and_warns_when_unavailable(
    hass: HomeAssistant,
) -> None:
    document = default_document()
    document["sources"] = [{
        "id": "external",
        "kind": "calendar",
        "name": "Rifiuti comunali",
        "enabled": True,
        "entityIds": ["calendar.rifiuti"],
        "rules": [],
    }]
    document["mappings"] = [{
        "id": "map-umido",
        "sourceId": "external",
        "match": "Umido porta a porta",
        "wasteTypeId": "organic",
    }]
    manager = await create_manager(hass, document)
    hass.states.async_set("calendar.rifiuti", "off")
    response = {
        "calendar.rifiuti": {
            "events": [
                {"summary": "Umido porta a porta", "start": "2026-10-07", "end": "2026-10-08"},
                {"summary": "Evento non mappato", "start": "2026-10-07", "end": "2026-10-08"},
            ]
        }
    }

    with (
        patch.object(hass.services, "has_service", return_value=True),
        patch.object(hass.services, "async_call", new=AsyncMock(return_value=response)),
    ):
        events, warnings = await manager.async_events_between(
            datetime(2026, 10, 7, tzinfo=timezone.utc),
            datetime(2026, 10, 8, tzinfo=timezone.utc),
        )
    assert warnings == []
    assert [event.summary for event in events] == ["Organico"]

    hass.states.async_set("calendar.rifiuti", "unavailable")
    events, warnings = await manager.async_events_between(
        datetime(2026, 10, 7, tzinfo=timezone.utc),
        datetime(2026, 10, 8, tzinfo=timezone.utc),
    )
    assert events == []
    assert warnings and "non disponibile" in warnings[0]


async def test_aggregated_reminder_is_idempotent_per_target_and_day(
    hass: HomeAssistant,
) -> None:
    document = configured_document()
    document["notifications"] = {
        "enabled": True,
        "time": "20:00",
        "targets": ["notify.mobile_app_phone"],
    }
    manager = await create_manager(hass, document)
    manager._async_send_to_target = AsyncMock()

    first = await manager.async_dispatch_reminder(date(2026, 10, 7))
    second = await manager.async_dispatch_reminder(date(2026, 10, 7))

    assert first["events"] == ["Organico", "Carta e cartone"]
    assert first["sent"] == ["notify.mobile_app_phone"]
    assert second["sent"] == []
    manager._async_send_to_target.assert_awaited_once_with(
        "notify.mobile_app_phone",
        "Raccolta di domani",
        "Organico \u00b7 Carta e cartone",
    )


def test_validation_requires_targets_and_rejects_the_domus_calendar() -> None:
    document = configured_document()
    document["notifications"] = {"enabled": True, "time": "20:00", "targets": []}
    with pytest.raises(WasteCollectionValidationError, match="destinatario"):
        normalize_configuration(document)

    document = default_document()
    document["sources"] = [{
        "id": "recursive",
        "kind": "calendar",
        "name": "Domus",
        "enabled": True,
        "entityIds": ["calendar.domus_ui"],
        "rules": [],
    }]
    with pytest.raises(WasteCollectionValidationError, match="propria sorgente"):
        normalize_configuration(document)
