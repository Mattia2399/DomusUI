"""Tests for the native Domus UI calendar."""

from datetime import date, datetime, timedelta, timezone
from unittest.mock import AsyncMock, Mock

import pytest

from homeassistant.components.calendar import CalendarEntityFeature
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError

from custom_components.domusos.calendar import DomusCalendarEntity, IRRIGATION_UID_PREFIX
from custom_components.domusos.calendar_store import DomusCalendarStore


async def calendar_store(
    hass: HomeAssistant,
    stored: dict | None = None,
) -> DomusCalendarStore:
    """Create a store backed by mocks so tests never touch disk."""
    manager = DomusCalendarStore(hass)
    manager.store.async_load = AsyncMock(return_value=stored)
    manager.store.async_save = AsyncMock()
    await manager.async_setup()
    return manager


async def test_store_crud_and_overlap_query(hass: HomeAssistant) -> None:
    manager = await calendar_store(hass)
    changed = Mock()
    manager.async_add_listener(changed)
    start = datetime(2026, 9, 24, 8, 30, tzinfo=timezone.utc)

    created = await manager.async_create_event(
        {
            "start": start,
            "end": start + timedelta(hours=1),
            "summary": "Irrigation check",
            "description": "Inspect valves",
            "location": "Garden",
        }
    )
    assert created.uid
    assert manager.next_event(datetime(2026, 9, 24, 8, tzinfo=timezone.utc)) == created
    assert manager.events_between(
        start - timedelta(minutes=1), start + timedelta(minutes=1)
    ) == [created]

    updated = await manager.async_update_event(
        created.uid,
        {
            "start": start + timedelta(hours=2),
            "end": start + timedelta(hours=3),
            "summary": "Updated check",
        },
    )
    assert updated.summary == "Updated check"
    assert len(manager.snapshot()) == 1

    await manager.async_delete_event(created.uid)
    assert manager.snapshot() == []
    assert manager.store.async_save.await_count == 3
    assert changed.call_count == 3


async def test_store_restores_timed_and_all_day_events(hass: HomeAssistant) -> None:
    manager = await calendar_store(
        hass,
        {
            "version": 1,
            "events": [
                {
                    "uid": "all-day",
                    "start": "2099-01-10",
                    "end": "2099-01-11",
                    "all_day": True,
                    "summary": "Maintenance",
                },
                {
                    "uid": "timed",
                    "start": "2099-01-10T10:00:00+00:00",
                    "end": "2099-01-10T11:00:00+00:00",
                    "all_day": False,
                    "summary": "Appointment",
                },
                {"uid": "invalid", "summary": "Ignored"},
            ],
        },
    )
    events = manager.events_between(
        datetime(2099, 1, 9, tzinfo=timezone.utc),
        datetime(2099, 1, 12, tzinfo=timezone.utc),
    )
    assert [event.uid for event in events] == ["all-day", "timed"]
    assert events[0].start == date(2099, 1, 10)
    assert isinstance(events[1].start, datetime)


async def test_store_rejects_invalid_and_recurring_events(hass: HomeAssistant) -> None:
    manager = await calendar_store(hass)
    start = datetime(2026, 9, 24, 8, 30, tzinfo=timezone.utc)

    with pytest.raises(HomeAssistantError, match="after"):
        await manager.async_create_event(
            {"start": start, "end": start, "summary": "Invalid"}
        )
    with pytest.raises(HomeAssistantError, match="Recurring"):
        await manager.async_create_event(
            {
                "start": start,
                "end": start + timedelta(hours=1),
                "summary": "Recurring",
                "rrule": "FREQ=DAILY",
            }
        )


async def test_entity_exposes_edit_features_and_store_data(hass: HomeAssistant) -> None:
    manager = await calendar_store(hass)
    entity = DomusCalendarEntity(manager)
    assert entity.supported_features == (
        CalendarEntityFeature.CREATE_EVENT
        | CalendarEntityFeature.DELETE_EVENT
        | CalendarEntityFeature.UPDATE_EVENT
    )

    await entity.async_create_event(
        start=date(2099, 2, 1),
        end=date(2099, 2, 2),
        summary="All day",
    )
    events = await entity.async_get_events(
        hass,
        datetime(2099, 2, 1, tzinfo=timezone.utc),
        datetime(2099, 2, 3, tzinfo=timezone.utc),
    )
    assert len(events) == 1
    assert events[0].all_day is True

    await entity.async_update_event(
        events[0].uid,
        {"start": date(2099, 2, 2), "end": date(2099, 2, 3), "summary": "Moved"},
    )
    assert manager.snapshot()[0]["summary"] == "Moved"
    await entity.async_delete_event(events[0].uid)
    assert manager.snapshot() == []


async def test_entity_derives_read_only_irrigation_events(hass: HomeAssistant) -> None:
    manager = await calendar_store(hass)
    irrigation = Mock()
    irrigation.document = {
        "zones": [{
            "id": "garden",
            "name": "Garden",
            "enabled": True,
            "days": ["thu"],
            "startTimes": ["06:30"],
            "baseDuration": 12,
        }]
    }
    entity = DomusCalendarEntity(manager, irrigation)
    entity.hass = hass

    events = await entity.async_get_events(
        hass,
        datetime(2026, 9, 24, 0, tzinfo=timezone.utc),
        datetime(2026, 9, 25, 0, tzinfo=timezone.utc),
    )

    assert len(events) == 1
    assert events[0].uid.startswith(IRRIGATION_UID_PREFIX)
    assert events[0].summary == "Garden · Irrigation"
    assert events[0].end - events[0].start == timedelta(minutes=12)

    with pytest.raises(HomeAssistantError, match="read-only"):
        await entity.async_delete_event(events[0].uid)
