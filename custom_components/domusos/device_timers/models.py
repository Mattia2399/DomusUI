"""Device timers: a device that switches itself off after a few minutes.

One timer per entity: when it ends, the server turns the device off, with no
Domus UI open. This module is plain Python on purpose: no Home Assistant
import, so what is accepted and what is stored are tested on their own.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Mapping

STORAGE_KEY = "domusos.device_timers.v1"
STORAGE_VERSION = 1

# What can switch itself off: plugs and switches, fans, humidifiers.
TIMER_DOMAINS = frozenset({"switch", "fan", "humidifier"})
MIN_MINUTES = 1
MAX_MINUTES = 24 * 60
MAX_TIMERS = 200

_ENTITY_ID = re.compile(r"^[a-z0-9_]+\.[a-z0-9_]+$")
_USER_ID = re.compile(r"^[a-f0-9]{32}$")
_TIMER_KEYS = frozenset({"entity_id", "minutes", "started_at", "ends_at", "user_id"})


class DeviceTimerError(Exception):
    """An expected failure with a stable code for the websocket API."""

    code = "device_timer_error"


class InvalidTimerError(DeviceTimerError):
    """The request is not acceptable; nothing changes."""

    code = "invalid_timer"

    def __init__(self, message: str, field: str | None = None) -> None:
        super().__init__(message)
        self.field = field


class PermissionDeniedError(DeviceTimerError):
    code = "permission_denied"


class TooManyTimersError(DeviceTimerError):
    code = "too_many_timers"


class DeviceTimersUnavailableError(DeviceTimerError):
    code = "device_timers_unavailable"


class CommandFailedError(DeviceTimerError):
    """Home Assistant could not switch the device on; no timer was set."""

    code = "command_failed"


class SaveFailedError(DeviceTimerError):
    """Home Assistant could not write the store; the previous timers stay in force."""

    code = "save_failed"


class InvalidStoredDocumentError(DeviceTimerError):
    code = "invalid_stored_document"


@dataclass(frozen=True, slots=True)
class DeviceTimer:
    """A device to switch off at ``ends_at`` (UTC)."""

    entity_id: str
    minutes: int
    started_at: datetime
    ends_at: datetime
    # Who set it: the switch-off is attributed to them.
    user_id: str | None

    @classmethod
    def start(cls, entity_id: str, minutes: int, now: datetime, user_id: str | None) -> DeviceTimer:
        return cls(entity_id, minutes, now, now + timedelta(minutes=minutes), user_id)

    def to_storage(self) -> dict[str, Any]:
        return {
            "entity_id": self.entity_id,
            "minutes": self.minutes,
            "started_at": self.started_at.isoformat(),
            "ends_at": self.ends_at.isoformat(),
            "user_id": self.user_id,
        }

    def view(self) -> dict[str, Any]:
        """What a client sees; never who set it."""
        return {
            "entity_id": self.entity_id,
            "minutes": self.minutes,
            "started_at": self.started_at.isoformat(),
            "ends_at": self.ends_at.isoformat(),
        }


def is_entity_id(value: Any) -> bool:
    return isinstance(value, str) and len(value) <= 255 and _ENTITY_ID.fullmatch(value) is not None


def parse_timer_request(entity_id: Any, minutes: Any) -> tuple[str, int]:
    """The entity and the minutes of a new timer, or InvalidTimerError."""
    if not is_entity_id(entity_id) or entity_id.split(".", 1)[0] not in TIMER_DOMAINS:
        raise InvalidTimerError("This device cannot switch itself off", "entity_id")
    if isinstance(minutes, bool) or not isinstance(minutes, int) or not MIN_MINUTES <= minutes <= MAX_MINUTES:
        raise InvalidTimerError(f"Choose between {MIN_MINUTES} and {MAX_MINUTES} minutes", "minutes")
    return entity_id, minutes


def _moment(value: Any) -> datetime:
    if not isinstance(value, str):
        raise InvalidStoredDocumentError("A time is not text")
    try:
        moment = datetime.fromisoformat(value)
    except ValueError as err:
        raise InvalidStoredDocumentError("A time cannot be read") from err
    if moment.tzinfo is None:
        raise InvalidStoredDocumentError("A time has no time zone")
    return moment.astimezone(UTC)


def parse_stored_timer(raw: Any) -> DeviceTimer:
    if not isinstance(raw, Mapping) or set(raw) != _TIMER_KEYS:
        raise InvalidStoredDocumentError("A timer has unexpected fields")
    try:
        entity_id, minutes = parse_timer_request(raw["entity_id"], raw["minutes"])
    except InvalidTimerError as err:
        raise InvalidStoredDocumentError(str(err)) from err
    user_id = raw["user_id"]
    if user_id is not None and (not isinstance(user_id, str) or _USER_ID.fullmatch(user_id) is None):
        raise InvalidStoredDocumentError("A timer has an invalid user")
    started_at, ends_at = _moment(raw["started_at"]), _moment(raw["ends_at"])
    if ends_at != started_at + timedelta(minutes=minutes):
        raise InvalidStoredDocumentError("A timer does not end when it should")
    return DeviceTimer(entity_id, minutes, started_at, ends_at, user_id)


def parse_stored_document(raw: Any) -> dict[str, DeviceTimer]:
    """The stored timers by entity; InvalidStoredDocumentError when anything is off."""
    if not isinstance(raw, Mapping) or set(raw) != {"timers"} or not isinstance(raw["timers"], list):
        raise InvalidStoredDocumentError("The document is not a list of timers")
    if len(raw["timers"]) > MAX_TIMERS:
        raise InvalidStoredDocumentError("Too many timers")
    timers: dict[str, DeviceTimer] = {}
    for entry in raw["timers"]:
        timer = parse_stored_timer(entry)
        if timer.entity_id in timers:
            raise InvalidStoredDocumentError("Two timers for one device")
        timers[timer.entity_id] = timer
    return timers


def storage_document(timers: Mapping[str, DeviceTimer]) -> dict[str, Any]:
    return {"timers": [timer.to_storage() for timer in timers.values()]}
