"""Tests for read-only Calendar and Irrigation context projections."""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from homeassistant.core import HomeAssistant

from custom_components.domusos.calendar_store import DomusCalendarStore
from custom_components.domusos.context_providers import (
    CalendarContextProvider,
    IrrigationContextProvider,
    register_core_bindings,
)
from custom_components.domusos.core import ContextRegistry, DomusRuntime

NOW = datetime(2099, 3, 10, 8, 0, tzinfo=timezone.utc)


async def _calendar_store(hass: HomeAssistant) -> DomusCalendarStore:
    store = DomusCalendarStore(hass)
    store.store.async_load = AsyncMock(return_value=None)
    store.store.async_save = AsyncMock()
    await store.async_setup()
    return store


def _irrigation_manager(*, available: bool = True) -> SimpleNamespace:
    return SimpleNamespace(
        state_for_user=Mock(
            return_value={
                "available": available,
                "revision": 4,
                "mode": "enabled",
                "rain": {
                    "enabled": True,
                    "active": False,
                    "available": True,
                    "blocked": False,
                    "reason": None,
                },
                "sessions": [
                    {
                        "id": "session-running",
                        "zoneId": "garden",
                        "state": "running",
                        "source": "schedule",
                        "startedAt": "2099-03-10T07:55:00+00:00",
                        "deadline": "2099-03-10T08:05:00+00:00",
                        "durationMin": 10,
                        "remainingSeconds": 300,
                        "reason": None,
                        "requestedByUserId": "private-user-id",
                    },
                    {
                        "id": "session-queued",
                        "zoneId": "orchard",
                        "state": "queued",
                        "source": "manual",
                        "durationMin": 8,
                        "remainingSeconds": 480,
                    },
                ],
                "serverTime": "2099-03-10T08:00:00+00:00",
                "history": [{"private": "not context"}],
                "legacyAutomations": ["automation.private"],
            }
        )
    )


async def test_calendar_provider_is_available_without_events(
    hass: HomeAssistant,
) -> None:
    store = await _calendar_store(hass)

    context = await CalendarContextProvider(store).async_get_context()

    assert context == {"available": True, "next_event": None}


async def test_calendar_provider_normalizes_next_event_and_location(
    hass: HomeAssistant,
) -> None:
    store = await _calendar_store(hass)
    event = await store.async_create_event(
        {
            "start": NOW,
            "end": NOW + timedelta(hours=1),
            "summary": "Garden appointment",
            "description": "Private notes are not projected",
            "location": "North garden",
        }
    )

    context = await CalendarContextProvider(store).async_get_context()

    assert context["next_event"] == {
        "uid": event.uid,
        "summary": "Garden appointment",
        "start": event.start.isoformat(),
        "end": event.end.isoformat(),
        "all_day": False,
        "location": "North garden",
    }
    assert "description" not in context["next_event"]


async def test_irrigation_provider_normalizes_public_manager_state() -> None:
    manager = _irrigation_manager()

    context = await IrrigationContextProvider(manager).async_get_context()

    assert context is not None
    assert context["available"] is True
    assert context["revision"] == 4
    assert context["mode"] == "enabled"
    assert context["running"] is True
    assert context["paused"] is False
    assert context["fault"] is False
    assert context["active_zone_ids"] == ("garden",)
    assert context["queued_zone_ids"] == ("orchard",)
    assert context["sessions"][0]["session_id"] == "session-running"
    assert context["rain"]["blocked"] is False
    assert "history" not in context
    assert "legacyAutomations" not in context
    assert "requestedByUserId" not in context["sessions"][0]
    manager.state_for_user.assert_called_once_with(None)


async def test_irrigation_provider_reports_unavailable_manager() -> None:
    manager = _irrigation_manager(available=False)
    registry = ContextRegistry()
    await registry.async_setup()
    registry.register(IrrigationContextProvider(manager))

    snapshot = await registry.async_snapshot()

    assert snapshot.get("irrigation") is None
    assert snapshot.unavailable == frozenset({"irrigation"})


async def test_context_snapshot_combines_and_unregisters_real_providers(
    hass: HomeAssistant,
) -> None:
    calendar_store = await _calendar_store(hass)
    await calendar_store.async_create_event(
        {
            "start": NOW,
            "end": NOW + timedelta(hours=1),
            "summary": "Calendar context",
        }
    )
    registry = ContextRegistry()
    await registry.async_setup()
    unregister_calendar = registry.register(CalendarContextProvider(calendar_store))
    unregister_irrigation = registry.register(
        IrrigationContextProvider(_irrigation_manager())
    )

    snapshot = await registry.async_snapshot()

    assert set(snapshot.capabilities) == {"calendar", "irrigation"}
    assert snapshot.get("calendar")["next_event"]["summary"] == "Calendar context"
    assert snapshot.get("irrigation")["active_zone_ids"] == ("garden",)
    assert snapshot.missing == frozenset()
    assert snapshot.unavailable == frozenset()

    unregister_irrigation()
    unregister_calendar()
    assert registry.capabilities == frozenset()


async def test_binding_registration_failure_rolls_back_partial_work(
    hass: HomeAssistant,
) -> None:
    calendar_store = await _calendar_store(hass)
    runtime = DomusRuntime(hass)
    await runtime.async_setup()
    manager = _irrigation_manager()
    manager.async_subscribe = Mock(side_effect=RuntimeError("subscribe failed"))

    with pytest.raises(RuntimeError, match="subscribe failed"):
        register_core_bindings(hass, runtime, calendar_store, manager)

    assert runtime.context.capabilities == frozenset()
    assert calendar_store._listeners == set()
    await runtime.async_shutdown()
