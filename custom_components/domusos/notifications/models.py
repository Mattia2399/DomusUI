"""Typed request and result of the Domus Notification Router.

A request names people, never devices: each recipient is the internal id of a
Home Assistant person (the ``id`` attribute of its ``person.*`` entity), which
survives renames of the entity. The router resolves the devices on every send.
"""

from __future__ import annotations

import json
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

MAX_RECIPIENTS = 32
MAX_TITLE_LENGTH = 256
MAX_MESSAGE_LENGTH = 4096
MAX_DEDUPE_KEY_LENGTH = 256
MAX_METADATA_BYTES = 4096

# Short machine names for the calling module and the kind of notification.
SLUG_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_]{0,63}$")
# Person internal ids are uuid hex strings in Home Assistant; the pattern only rejects unsafe input.
PERSON_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

# Categories travel with the request for future preferences; in V1 they never change routing.
CATEGORIES = frozenset({"default", "waste", "security", "energy", "irrigation", "calendar", "urgent"})


class NotificationError(Exception):
    """Base error of the router, surfaced through the websocket API with a stable code."""

    code = "notification_error"


class InvalidNotificationRequestError(NotificationError):
    """A request does not match the contract; nothing is sent."""

    code = "invalid_notification_request"


class NotificationRouterUnavailableError(NotificationError):
    """The router is not running."""

    code = "notification_router_unavailable"


class RateLimitedError(NotificationError):
    """The user asked for a test notification too soon after the previous one."""

    code = "rate_limited"


class RecipientStatus(StrEnum):
    """Outcome of one recipient."""

    DELIVERED = "delivered"
    PARTIAL = "partial"
    SKIPPED = "skipped"
    FAILED = "failed"


class DeviceStatus(StrEnum):
    """Outcome of one personal device."""

    DELIVERED = "delivered"
    ALREADY_SENT = "already_sent"
    SKIPPED = "skipped"
    FAILED = "failed"


class Reason(StrEnum):
    """Why a recipient or a device was not (fully) delivered."""

    UNKNOWN_RECIPIENT = "unknown_recipient"
    AMBIGUOUS_RECIPIENT = "ambiguous_recipient"
    NO_ACCOUNT = "no_account"
    ACCOUNT_DISABLED = "account_disabled"
    ACCOUNT_UNAVAILABLE = "account_unavailable"
    NO_PROFILE = "no_profile"
    PROFILE_UNAVAILABLE = "profile_unavailable"
    NO_DEVICES = "no_devices"
    NOTIFICATIONS_DISABLED = "notifications_disabled"
    DEVICE_NOT_VERIFIED = "device_not_verified"
    TARGET_UNAVAILABLE = "target_unavailable"
    AMBIGUOUS_TARGET = "ambiguous_target"
    DELIVERY_FAILED = "delivery_failed"
    DELIVERY_TIMEOUT = "delivery_timeout"
    ALREADY_SENT = "already_sent"
    DEDUPE_UNAVAILABLE = "dedupe_unavailable"


class DeliveryWarning(StrEnum):
    """Something worth knowing about a delivery that still succeeded."""

    # Sent, but the ledger could not record it: a retry with the same key may repeat it.
    DEDUPE_NOT_RECORDED = "dedupe_not_recorded"


def _slug(value: Any, name: str) -> str:
    if not isinstance(value, str) or not SLUG_PATTERN.fullmatch(value):
        raise InvalidNotificationRequestError(f"{name} must be a short lowercase slug")
    return value


def _text(value: Any, name: str, limit: int, *, required: bool) -> str | None:
    if value is None and not required:
        return None
    if not isinstance(value, str) or not value.strip():
        raise InvalidNotificationRequestError(f"{name} must be a non-empty string")
    if len(value) > limit:
        raise InvalidNotificationRequestError(f"{name} is longer than {limit} characters")
    return value


def _recipients(value: Any) -> tuple[str, ...]:
    if isinstance(value, (str, bytes)) or not isinstance(value, Sequence):
        raise InvalidNotificationRequestError("recipients must be a list of person ids")
    unique: list[str] = []
    for person_id in value:
        if not isinstance(person_id, str) or not PERSON_ID_PATTERN.fullmatch(person_id):
            raise InvalidNotificationRequestError("recipients must be Home Assistant person ids")
        if person_id not in unique:
            # The same person twice is one recipient; the first occurrence keeps its place.
            unique.append(person_id)
    if not unique:
        raise InvalidNotificationRequestError("at least one recipient is required")
    if len(unique) > MAX_RECIPIENTS:
        raise InvalidNotificationRequestError(f"at most {MAX_RECIPIENTS} recipients are allowed")
    return tuple(unique)


def _metadata(value: Any) -> Mapping[str, Any] | None:
    if value is None:
        return None
    if not isinstance(value, Mapping):
        raise InvalidNotificationRequestError("metadata must be an object")
    try:
        size = len(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode())
    except (TypeError, ValueError):
        raise InvalidNotificationRequestError("metadata must be JSON") from None
    if size > MAX_METADATA_BYTES:
        raise InvalidNotificationRequestError(f"metadata is larger than {MAX_METADATA_BYTES} bytes")
    return dict(value)


@dataclass(frozen=True, slots=True)
class NotificationRequest:
    """What a Domus feature asks the router to deliver.

    ``metadata`` is runtime-only context for the caller: it is never stored,
    logged or passed to Home Assistant. Build requests with :meth:`create`,
    which validates and normalizes every field.
    """

    recipients: tuple[str, ...]
    source: str
    category: str
    message: str
    title: str | None = None
    dedupe_key: str | None = None
    metadata: Mapping[str, Any] | None = field(default=None, compare=False, repr=False)

    @classmethod
    def create(
        cls,
        *,
        recipients: Sequence[str],
        source: str,
        message: str,
        category: str = "default",
        title: str | None = None,
        dedupe_key: str | None = None,
        metadata: Mapping[str, Any] | None = None,
    ) -> NotificationRequest:
        """Validate a request; raise ``InvalidNotificationRequestError`` when it is not acceptable."""
        category = _slug(category, "category")
        if category not in CATEGORIES:
            raise InvalidNotificationRequestError("unknown category")
        return cls(
            recipients=_recipients(recipients),
            source=_slug(source, "source"),
            category=category,
            message=_text(message, "message", MAX_MESSAGE_LENGTH, required=True) or "",
            title=_text(title, "title", MAX_TITLE_LENGTH, required=False),
            dedupe_key=_text(dedupe_key, "dedupe_key", MAX_DEDUPE_KEY_LENGTH, required=False),
            metadata=_metadata(metadata),
        )

    def __repr__(self) -> str:
        # Content stays out of logs and tracebacks.
        return (
            f"NotificationRequest(source={self.source!r}, category={self.category!r}, "
            f"recipients={len(self.recipients)}, dedupe={self.dedupe_key is not None})"
        )


@dataclass(frozen=True, slots=True)
class DeviceDeliveryResult:
    """Outcome for one personal device; never holds content or targets."""

    personal_device_id: str
    status: DeviceStatus
    reason: Reason | None = None
    warning: DeliveryWarning | None = None

    @property
    def satisfied(self) -> bool:
        """Whether the device has the notification, now or from an earlier send."""
        return self.status in (DeviceStatus.DELIVERED, DeviceStatus.ALREADY_SENT)

    def as_dict(self) -> dict[str, Any]:
        """Serialize for the websocket API and diagnostics."""
        result: dict[str, Any] = {"personal_device_id": self.personal_device_id, "status": self.status.value}
        if self.reason is not None:
            result["reason"] = self.reason.value
        if self.warning is not None:
            result["warning"] = self.warning.value
        return result


@dataclass(frozen=True, slots=True)
class RecipientResult:
    """Outcome for one recipient; ``person_id`` is None for a self test."""

    person_id: str | None
    status: RecipientStatus
    reason: Reason | None = None
    devices: tuple[DeviceDeliveryResult, ...] = ()

    def as_dict(self) -> dict[str, Any]:
        """Serialize for the websocket API and diagnostics."""
        result: dict[str, Any] = {
            "person_id": self.person_id,
            "status": self.status.value,
            "devices": [device.as_dict() for device in self.devices],
        }
        if self.reason is not None:
            result["reason"] = self.reason.value
        return result


@dataclass(frozen=True, slots=True)
class DispatchResult:
    """Outcome of one router call, one entry per recipient in request order."""

    request_id: str
    results: tuple[RecipientResult, ...]

    def as_dict(self) -> dict[str, Any]:
        """Serialize for diagnostics."""
        return {"request_id": self.request_id, "results": [result.as_dict() for result in self.results]}


def summarize(person_id: str | None, devices: Sequence[DeviceDeliveryResult]) -> RecipientResult:
    """Combine the devices that were due to receive the notification into one outcome.

    - every device satisfied (delivered or already sent): ``delivered``;
    - some satisfied, others not: ``partial``;
    - none satisfied after at least one real attempt: ``failed``;
    - no attempt at all (targets unavailable, ambiguous, ledger unavailable): ``skipped``.
    """
    devices = tuple(devices)
    if not devices:
        return RecipientResult(person_id, RecipientStatus.SKIPPED, Reason.NOTIFICATIONS_DISABLED)
    satisfied = [device for device in devices if device.satisfied]
    failed = [device for device in devices if device.status is DeviceStatus.FAILED]
    if len(satisfied) == len(devices):
        return RecipientResult(person_id, RecipientStatus.DELIVERED, None, devices)
    if satisfied:
        return RecipientResult(person_id, RecipientStatus.PARTIAL, None, devices)
    if failed:
        timeouts = all(device.reason is Reason.DELIVERY_TIMEOUT for device in failed)
        reason = Reason.DELIVERY_TIMEOUT if timeouts else Reason.DELIVERY_FAILED
        return RecipientResult(person_id, RecipientStatus.FAILED, reason, devices)
    reasons = {device.reason for device in devices}
    for reason in (
        Reason.DEDUPE_UNAVAILABLE,
        Reason.DEVICE_NOT_VERIFIED,
        Reason.TARGET_UNAVAILABLE,
        Reason.AMBIGUOUS_TARGET,
    ):
        if reason in reasons:
            return RecipientResult(person_id, RecipientStatus.SKIPPED, reason, devices)
    return RecipientResult(person_id, RecipientStatus.SKIPPED, Reason.TARGET_UNAVAILABLE, devices)
