"""Notification Ledger: minimal, bounded, persistent and conservative when unreadable."""

import json
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from homeassistant.core import HomeAssistant

from custom_components.domusos.notifications.ledger import (
    STORAGE_KEY,
    LedgerStatus,
    LedgerUnavailableError,
    NotificationLedger,
    delivery_fingerprint,
)


def _clock() -> Any:
    ticks = iter(range(10_000))
    return lambda: f"2026-10-09T10:{next(ticks):04d}"


async def _ledger(hass: HomeAssistant, **kwargs: Any) -> NotificationLedger:
    ledger = NotificationLedger(hass, clock=_clock(), **kwargs)
    await ledger.async_setup()
    return ledger


def test_fingerprint_separates_source_key_person_and_device() -> None:
    base = delivery_fingerprint("waste", "abc", "person-a", "device-1")
    assert len(base) == 64 and base == delivery_fingerprint("waste", "abc", "person-a", "device-1")
    others = {
        delivery_fingerprint("security", "abc", "person-a", "device-1"),
        delivery_fingerprint("waste", "abd", "person-a", "device-1"),
        delivery_fingerprint("waste", "abc", "person-b", "device-1"),
        delivery_fingerprint("waste", "abc", "person-a", "device-2"),
        # Moving characters between parts never collides.
        delivery_fingerprint("waste", "abcperson-a", "", "device-1"),
    }
    assert base not in others and len(others) == 5


async def test_a_missing_ledger_starts_empty_without_writing(hass: HomeAssistant, hass_storage: dict) -> None:
    ledger = await _ledger(hass)

    assert ledger.status is LedgerStatus.READY
    assert len(ledger) == 0
    assert STORAGE_KEY not in hass_storage


async def test_a_record_survives_a_reload(hass: HomeAssistant, hass_storage: dict) -> None:
    fingerprint = delivery_fingerprint("waste", "abc", "person-a", "device-1")
    ledger = await _ledger(hass)
    await ledger.async_record(fingerprint)

    reloaded = await _ledger(hass)

    assert await reloaded.async_contains(fingerprint)
    assert not await reloaded.async_contains(delivery_fingerprint("waste", "abc", "person-a", "device-2"))


async def test_the_stored_entries_hold_only_a_fingerprint_and_a_time(hass: HomeAssistant, hass_storage: dict) -> None:
    ledger = await _ledger(hass)
    await ledger.async_record(delivery_fingerprint("waste", "VERY_PRIVATE_KEY", "person-a", "device-1"))

    stored = hass_storage[STORAGE_KEY]["data"]
    assert stored["schema"] == "domusos-notifications"
    assert [set(entry) for entry in stored["entries"]] == [{"fingerprint", "delivered_at"}]
    text = json.dumps(hass_storage[STORAGE_KEY])
    for secret in ("VERY_PRIVATE_KEY", "person-a", "device-1", "waste"):
        assert secret not in text


async def test_the_ledger_is_bounded_and_drops_the_oldest_first(hass: HomeAssistant, hass_storage: dict) -> None:
    ledger = await _ledger(hass, max_entries=3)
    prints = [delivery_fingerprint("waste", str(index), "p", "d") for index in range(5)]
    for fingerprint in prints:
        await ledger.async_record(fingerprint)

    assert len(ledger) == 3
    stored = [entry["fingerprint"] for entry in hass_storage[STORAGE_KEY]["data"]["entries"]]
    assert stored == prints[2:]
    reloaded = await _ledger(hass, max_entries=3)
    assert reloaded.status is LedgerStatus.READY
    assert [await reloaded.async_contains(fingerprint) for fingerprint in prints] == [False, False, True, True, True]


async def test_recording_again_moves_the_entry_to_the_newest_place(hass: HomeAssistant, hass_storage: dict) -> None:
    ledger = await _ledger(hass, max_entries=2)
    first, second, third = (delivery_fingerprint("waste", key, "p", "d") for key in "abc")
    await ledger.async_record(first)
    await ledger.async_record(second)
    await ledger.async_record(first)
    await ledger.async_record(third)

    assert await ledger.async_contains(first)
    assert not await ledger.async_contains(second)


@pytest.mark.parametrize(
    "stored",
    [
        {"schema": "other", "version": 1, "entries": []},
        {"schema": "domusos-notifications", "version": 2, "entries": []},
        {"schema": "domusos-notifications", "version": 1, "entries": [{"fingerprint": "x", "delivered_at": "t"}]},
        {"schema": "domusos-notifications", "version": 1, "entries": [{"fingerprint": "a" * 64, "delivered_at": "t", "message": "x"}]},
        {"schema": "domusos-notifications", "version": 1, "entries": "nope"},
        ["not", "a", "document"],
    ],
)
async def test_an_invalid_ledger_is_kept_and_reported(hass: HomeAssistant, hass_storage: dict, stored: Any) -> None:
    hass_storage[STORAGE_KEY] = {"version": 1, "minor_version": 1, "key": STORAGE_KEY, "data": stored}
    before = json.dumps(hass_storage[STORAGE_KEY], sort_keys=True)

    ledger = await _ledger(hass)

    assert ledger.status is LedgerStatus.CORRUPT
    with pytest.raises(LedgerUnavailableError):
        await ledger.async_contains("a" * 64)
    with pytest.raises(LedgerUnavailableError):
        await ledger.async_record("a" * 64)
    # Never reset, never overwritten.
    assert json.dumps(hass_storage[STORAGE_KEY], sort_keys=True) == before


async def test_a_load_failure_or_a_quarantined_file_counts_as_corrupt(hass: HomeAssistant) -> None:
    ledger = NotificationLedger(hass)
    with patch.object(ledger.store, "async_load", AsyncMock(side_effect=OSError("disk"))):
        await ledger.async_setup()
    assert ledger.status is LedgerStatus.CORRUPT

    quarantined = NotificationLedger(hass)
    with (
        patch.object(quarantined.store, "async_load", AsyncMock(return_value=None)),
        patch("custom_components.domusos.notifications.ledger.glob.glob", return_value=["x.corrupt.1"]),
    ):
        await quarantined.async_setup()
    assert quarantined.status is LedgerStatus.CORRUPT


async def test_a_failed_write_still_remembers_the_delivery_in_memory(hass: HomeAssistant) -> None:
    ledger = await _ledger(hass)
    fingerprint = delivery_fingerprint("waste", "abc", "p", "d")

    with patch.object(ledger.store, "async_save", AsyncMock(side_effect=OSError("disk full"))):
        with pytest.raises(OSError):
            await ledger.async_record(fingerprint)

    assert await ledger.async_contains(fingerprint)
