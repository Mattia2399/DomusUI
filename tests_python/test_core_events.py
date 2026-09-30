"""Tests for the Domus event value object and internal event bus."""

from datetime import datetime

import pytest

from custom_components.domusos.core import DomusEvent, DomusEventBus


def test_event_creation_is_validated_and_immutable() -> None:
    payload = {"trip": {"distance_km": 170}, "sources": ["calendar"]}
    event = DomusEvent.create(
        "calendar.trip_upcoming",
        "calendar.store",
        payload,
        correlation_id="trip-plan-1",
    )

    payload["trip"]["distance_km"] = 1
    payload["sources"].append("vehicle")

    assert event.event_id
    assert event.timestamp.tzinfo is not None
    assert event.payload["trip"]["distance_km"] == 170
    assert event.payload["sources"] == ("calendar",)
    with pytest.raises(TypeError):
        event.payload["new"] = True
    with pytest.raises(ValueError, match="<domain>.<name>"):
        DomusEvent.create("invalid", "calendar.store")
    with pytest.raises(ValueError, match="timezone-aware"):
        DomusEvent(
            event_id="event-1",
            type="calendar.changed",
            source="calendar.store",
            timestamp=datetime(2026, 9, 28),  # noqa: DTZ001 - invalid by design
        )
    with pytest.raises(TypeError, match="Unsupported mutable"):
        DomusEvent.create(
            "calendar.changed",
            "calendar.store",
            {"value": object()},
        )


async def test_event_bus_subscribe_unsubscribe_and_subscribe_all() -> None:
    bus = DomusEventBus()
    await bus.async_setup()
    received: list[tuple[str, str]] = []

    async def specific(event: DomusEvent) -> None:
        received.append(("specific", event.type))

    def all_events(event: DomusEvent) -> None:
        received.append(("all", event.type))

    unsubscribe_specific = bus.subscribe("calendar.changed", specific)
    unsubscribe_all = bus.subscribe_all(all_events)
    event = DomusEvent.create("calendar.changed", "calendar.store")

    await bus.async_publish(event)
    assert set(received) == {
        ("specific", "calendar.changed"),
        ("all", "calendar.changed"),
    }

    unsubscribe_specific()
    unsubscribe_specific()
    received.clear()
    await bus.async_publish(event)
    assert received == [("all", "calendar.changed")]

    unsubscribe_all()
    await bus.async_shutdown()
    with pytest.raises(RuntimeError, match="not running"):
        await bus.async_publish(event)


async def test_event_bus_isolates_broken_subscribers(
    caplog: pytest.LogCaptureFixture,
) -> None:
    bus = DomusEventBus()
    await bus.async_setup()
    delivered: list[str] = []

    def broken(_event: DomusEvent) -> None:
        raise RuntimeError("subscriber failed")

    async def healthy(event: DomusEvent) -> None:
        delivered.append(event.event_id)

    bus.subscribe("energy.changed", broken)
    bus.subscribe("energy.changed", healthy)
    event = DomusEvent.create("energy.changed", "energy.adapter")

    await bus.async_publish(event)

    assert delivered == [event.event_id]
    assert "subscriber failed" in caplog.text
