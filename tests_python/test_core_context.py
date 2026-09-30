"""Tests for capability-based Domus context aggregation."""

from collections.abc import Mapping
from typing import Any

import pytest

from custom_components.domusos.core import ContextRegistry


class StaticProvider:
    def __init__(self, capability: str, value: Mapping[str, Any] | None) -> None:
        self.capability = capability
        self.value = value

    async def async_get_context(self) -> Mapping[str, Any] | None:
        return self.value


class BrokenProvider:
    capability = "weather"

    async def async_get_context(self) -> Mapping[str, Any] | None:
        raise RuntimeError("weather unavailable")


async def test_provider_registration_and_context_snapshot() -> None:
    registry = ContextRegistry()
    await registry.async_setup()
    calendar = StaticProvider("calendar", {"next_trip_km": 170})
    unregister = registry.register(calendar)

    assert registry.has_capability("calendar")
    assert registry.capabilities == frozenset({"calendar"})
    with pytest.raises(ValueError, match="already registered"):
        registry.register(StaticProvider("calendar", {}))

    snapshot = await registry.async_snapshot(["calendar", "vehicle"])
    assert snapshot.get("calendar") == {"next_trip_km": 170}
    assert snapshot.missing == frozenset({"vehicle"})
    assert snapshot.unavailable == frozenset()
    assert snapshot.generated_at.tzinfo is not None
    with pytest.raises(TypeError):
        snapshot.capabilities["vehicle"] = {}

    unregister()
    unregister()
    assert not registry.has_capability("calendar")


async def test_unavailable_or_failed_providers_do_not_break_snapshot(
    caplog: pytest.LogCaptureFixture,
) -> None:
    registry = ContextRegistry()
    await registry.async_setup()
    registry.register(StaticProvider("vehicle", None))
    registry.register(BrokenProvider())

    snapshot = await registry.async_snapshot()

    assert snapshot.capabilities == {}
    assert snapshot.unavailable == frozenset({"vehicle", "weather"})
    assert "weather unavailable" in caplog.text
    await registry.async_shutdown()
    assert registry.capabilities == frozenset()
