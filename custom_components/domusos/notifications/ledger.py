"""Persistent record of deliveries, used only to honour a caller's dedupe key.

The ledger is its own store (``domusos.notifications.v1``), separate from the
profiles. An entry is a fingerprint and the time of the delivery, nothing else:
no title, message, metadata, raw dedupe key, person, device or target. The
fingerprint is a SHA-256 of the source, the dedupe key, the person and the
personal device, so a delivery is remembered per device.

The ledger holds at most ``MAX_LEDGER_ENTRIES``; beyond that the oldest
entries are dropped, in delivery order. A ledger that cannot be read is kept
as is and never overwritten, and reports itself unavailable.
"""

from __future__ import annotations

import asyncio
import glob
import hashlib
import json
import logging
import re
from collections.abc import Callable
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

_LOGGER = logging.getLogger(__name__)

STORAGE_KEY = "domusos.notifications.v1"
STORAGE_VERSION = 1
DOCUMENT_SCHEMA = "domusos-notifications"
DOCUMENT_VERSION = 1
MAX_LEDGER_ENTRIES = 1000

_FINGERPRINT = re.compile(r"^[0-9a-f]{64}$")


class LedgerStatus(StrEnum):
    """Whether the ledger can answer and record."""

    NOT_LOADED = "not_loaded"
    READY = "ready"
    CORRUPT = "corrupt"


class LedgerUnavailableError(Exception):
    """The ledger cannot tell whether a delivery already happened."""


def delivery_fingerprint(source: str, dedupe_key: str, person_id: str, personal_device_id: str) -> str:
    """Return the fingerprint of one delivery; the raw key is never stored."""
    # A JSON array keeps the four parts unambiguous whatever characters they hold.
    material = json.dumps([source, dedupe_key, person_id, personal_device_id], ensure_ascii=False)
    return hashlib.sha256(material.encode()).hexdigest()


def _utc_now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def _parse(document: Any) -> list[tuple[str, str]]:
    if not isinstance(document, dict) or set(document) != {"schema", "version", "entries"}:
        raise ValueError("unexpected document shape")
    if document["schema"] != DOCUMENT_SCHEMA or document["version"] != DOCUMENT_VERSION:
        raise ValueError("unknown schema or version")
    entries = document["entries"]
    if not isinstance(entries, list):
        raise ValueError("entries must be a list")
    parsed: list[tuple[str, str]] = []
    seen: set[str] = set()
    for entry in entries:
        if not isinstance(entry, dict) or set(entry) != {"fingerprint", "delivered_at"}:
            raise ValueError("unexpected entry shape")
        fingerprint, delivered_at = entry["fingerprint"], entry["delivered_at"]
        if not isinstance(fingerprint, str) or not _FINGERPRINT.fullmatch(fingerprint):
            raise ValueError("invalid fingerprint")
        if not isinstance(delivered_at, str) or not delivered_at:
            raise ValueError("invalid delivery time")
        if fingerprint in seen:
            raise ValueError("duplicate fingerprint")
        seen.add(fingerprint)
        parsed.append((fingerprint, delivered_at))
    return parsed


def _serialize(entries: list[tuple[str, str]]) -> dict[str, Any]:
    return {
        "schema": DOCUMENT_SCHEMA,
        "version": DOCUMENT_VERSION,
        "entries": [{"fingerprint": fingerprint, "delivered_at": at} for fingerprint, at in entries],
    }


class NotificationLedger:
    """Remembers which deliveries completed, for requests that carry a dedupe key."""

    def __init__(
        self,
        hass: HomeAssistant,
        *,
        max_entries: int = MAX_LEDGER_ENTRIES,
        clock: Callable[[], str] = _utc_now,
    ) -> None:
        self.hass = hass
        self.store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self._max_entries = max_entries
        self._clock = clock
        # Insertion order is delivery order; dict keeps both lookup and pruning cheap.
        self._entries: dict[str, str] = {}
        self._status = LedgerStatus.NOT_LOADED
        # Held only around reads and writes of the document, never during a send.
        self._lock = asyncio.Lock()

    @property
    def status(self) -> LedgerStatus:
        """Return whether the ledger can be used."""
        return self._status

    def __len__(self) -> int:
        return len(self._entries)

    async def async_setup(self) -> None:
        """Load the ledger; an unreadable one is kept untouched and reported corrupt."""
        try:
            stored = await self.store.async_load()
        except Exception as err:  # noqa: BLE001 - a failed load must not take Domus down
            self._mark_corrupt(f"could not be loaded ({type(err).__name__})")
            return
        if stored is None:
            if await self._async_quarantined():
                self._mark_corrupt("could not be decoded and was set aside by Home Assistant")
                return
            self._entries = {}
            self._status = LedgerStatus.READY
            return
        try:
            entries = _parse(stored)
        except ValueError as err:
            self._mark_corrupt(f"is invalid ({err})")
            return
        self._entries = dict(entries[-self._max_entries :])
        self._status = LedgerStatus.READY

    def _mark_corrupt(self, reason: str) -> None:
        self._status = LedgerStatus.CORRUPT
        self._entries = {}
        _LOGGER.error(
            "The Domus notification ledger %s; notifications with a dedupe key are not sent "
            "until it is repaired",
            reason,
        )

    async def _async_quarantined(self) -> bool:
        pattern = f"{glob.escape(self.store.path)}.corrupt.*"
        return bool(await self.hass.async_add_executor_job(glob.glob, pattern))

    def _require_ready(self) -> None:
        if self._status is not LedgerStatus.READY:
            raise LedgerUnavailableError(f"The notification ledger is {self._status.value}")

    async def async_contains(self, fingerprint: str) -> bool:
        """Return whether this delivery already completed."""
        async with self._lock:
            self._require_ready()
            return fingerprint in self._entries

    async def async_record(self, fingerprint: str) -> None:
        """Remember a completed delivery and write the ledger.

        The entry is kept in memory even if the write fails, so the running
        instance never repeats it; the error is raised for the caller to report.
        """
        async with self._lock:
            self._require_ready()
            self._entries.pop(fingerprint, None)
            self._entries[fingerprint] = self._clock()
            while len(self._entries) > self._max_entries:
                # Oldest delivery first: dicts keep insertion order.
                del self._entries[next(iter(self._entries))]
            await self.store.async_save(_serialize(list(self._entries.items())))
