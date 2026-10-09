"""Waste reminders to people, through the Domus Notification Router.

Waste decides *when* to remind, *what* to say and *who* was chosen; the
router decides *how* each person is reached. This module therefore knows
person ids and router results only: never personal devices, Home Assistant
devices, notify services or targets.

The legacy path (technical notify targets) stays in the manager and is used
only for configurations still in ``legacy`` mode; the two never run for the
same reminder.
"""

from __future__ import annotations

import hashlib
import logging
from collections.abc import Iterable
from datetime import date
from typing import Any

from ..notifications import (
    DispatchResult,
    NotificationRequest,
    NotificationRouter,
    RecipientStatus,
)

_LOGGER = logging.getLogger(__name__)

SOURCE = "waste_collection"
CATEGORY = "waste"
MAX_DEDUPE_KEY_LENGTH = 256


def build_waste_dedupe_key(collection_day: date, waste_type_ids: Iterable[str]) -> str:
    """Identity of one evening reminder: the collection day and the waste types it announces.

    The same reminder always gets the same key, whatever language or wording
    the message uses, so a retry never repeats a device that already got it.
    Another day, or another set of types on the same day (an exception added
    later, say), is another reminder.
    """
    types = "+".join(sorted(set(waste_type_ids)))
    key = f"waste:reminder:{collection_day.isoformat()}:{types}:evening"
    if len(key) <= MAX_DEDUPE_KEY_LENGTH:
        return key
    # Many long type ids: a digest of the same parts keeps the key stable and bounded.
    digest = hashlib.sha256(types.encode()).hexdigest()
    return f"waste:reminder:{collection_day.isoformat()}:sha256-{digest}:evening"


def overall_status(result: DispatchResult) -> str:
    """One word for the whole reminder: delivered, partial, failed or skipped."""
    statuses = [item.status for item in result.results]
    if statuses and all(status is RecipientStatus.DELIVERED for status in statuses):
        return "delivered"
    if any(status in (RecipientStatus.DELIVERED, RecipientStatus.PARTIAL) for status in statuses):
        return "partial"
    if any(status is RecipientStatus.FAILED for status in statuses):
        return "failed"
    return "skipped"


def person_summary(result: DispatchResult) -> list[dict[str, Any]]:
    """Per person outcome without any device detail: what an administrator may see."""
    summary: list[dict[str, Any]] = []
    for item in result.results:
        entry: dict[str, Any] = {"person_id": item.person_id, "status": item.status.value}
        if item.reason is not None:
            entry["reason"] = item.reason.value
        summary.append(entry)
    return summary


async def async_send_to_recipients(
    router: NotificationRouter,
    recipients: list[str],
    title: str,
    message: str,
    dedupe_key: str | None,
) -> dict[str, Any]:
    """Send one Waste notification to people; the router resolves their devices."""
    request = NotificationRequest.create(
        recipients=recipients,
        source=SOURCE,
        category=CATEGORY,
        title=title,
        message=message,
        dedupe_key=dedupe_key,
    )
    result = await router.async_send(request)
    status = overall_status(result)
    _LOGGER.info(
        "Waste notification %s: %s for %d people",
        result.request_id,
        status,
        len(result.results),
    )
    for item in result.results:
        if item.reason is not None:
            _LOGGER.debug(
                "Waste notification %s: person %s %s (%s)",
                result.request_id,
                item.person_id,
                item.status.value,
                item.reason.value,
            )
    return {"mode": "recipients", "status": status, "recipients": person_summary(result)}
