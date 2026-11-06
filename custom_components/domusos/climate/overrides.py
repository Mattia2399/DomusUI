"""Pure temporary zone override contract and canonical UTC expiry calculation."""

from __future__ import annotations

import math
import re
from collections.abc import Mapping
from datetime import UTC, datetime, time, timedelta, tzinfo
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .auto_resolver import _instant
from .models import (
    HouseTimezoneUnavailable,
    InvalidConfig,
    NextScheduleEventUnavailable,
)

EXPIRY_MODES = frozenset({"next_schedule_event", "duration", "until_time"})
_LOCAL_TIME = re.compile(r"^(?:[01][0-9]|2[0-3]):[0-5][0-9]$")
_ID = re.compile(r"^[0-9a-f]{32}$")


def utc_instant(value: Any, field: str) -> datetime:
    if type(value) is not str:
        raise InvalidConfig(field, "expected a UTC instant")
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as err:
        raise InvalidConfig(field, "expected a UTC instant") from err
    if parsed.tzinfo is None or parsed.utcoffset() != timedelta(0):
        raise InvalidConfig(field, "expected a UTC instant")
    return parsed.astimezone(UTC)


def parse_overrides(value: Any) -> dict[str, dict[str, Any]]:
    if type(value) is not dict or len(value) > 64:
        raise InvalidConfig("intent.overrides")
    parsed: dict[str, dict[str, Any]] = {}
    for zone_id, item in value.items():
        field = f"intent.overrides.{zone_id}"
        if type(zone_id) is not str or not zone_id or type(item) is not dict or set(item) != {"id", "zoneId", "targetTemperature", "createdAt", "expiresAt", "expiryMode"}:
            raise InvalidConfig(field, "invalid override")
        target = item["targetTemperature"]
        if item["zoneId"] != zone_id or type(item["id"]) is not str or not _ID.fullmatch(item["id"]):
            raise InvalidConfig(field, "invalid identity")
        if type(target) not in (int, float) or not math.isfinite(target) or not 5 <= target <= 40:
            raise InvalidConfig(field + ".targetTemperature", "room target must be 5–40 °C")
        if type(item["expiryMode"]) is not str or item["expiryMode"] not in EXPIRY_MODES:
            raise InvalidConfig(field + ".expiryMode")
        created = utc_instant(item["createdAt"], field + ".createdAt")
        expires = utc_instant(item["expiresAt"], field + ".expiresAt")
        if not created < expires <= created + timedelta(days=7):
            raise InvalidConfig(field + ".expiresAt", "expiry must follow creation within seven days")
        parsed[zone_id] = {"id": item["id"], "zoneId": zone_id, "targetTemperature": float(target),
                           "createdAt": created.isoformat(), "expiresAt": expires.isoformat(), "expiryMode": item["expiryMode"]}
    return parsed


def active_overrides(value: Mapping[str, dict[str, Any]], now: datetime, zone_ids: set[str]) -> dict[str, dict[str, Any]]:
    if now.tzinfo is None or now.utcoffset() is None:
        raise InvalidConfig("now", "expected an aware instant")
    current = now.astimezone(UTC)
    return {zone_id: item for zone_id, item in value.items()
            if zone_id in zone_ids and utc_instant(item["expiresAt"], "expiresAt") > current}


def expiry_instant(mode: str, now: datetime, house_timezone: str | tzinfo | None, resolution: Mapping[str, Any] | None,
                   *, duration_minutes: Any = None, until_time: Any = None) -> datetime:
    """Freeze the requested expiry as one future UTC instant."""
    if now.tzinfo is None or now.utcoffset() is None:
        raise InvalidConfig("now", "expected an aware instant")
    current = now.astimezone(UTC)
    if mode == "next_schedule_event":
        if duration_minutes is not None or until_time is not None:
            raise InvalidConfig("expiry", "unexpected expiry fields")
        next_event = resolution.get("nextEvent") if resolution and resolution.get("status") == "resolved" else None
        if next_event is None:
            raise NextScheduleEventUnavailable("No next schedule event is available")
        expires = utc_instant(next_event["occursAt"], "nextEvent.occursAt")
        if expires <= current:
            raise NextScheduleEventUnavailable("No future schedule event is available")
        return expires
    if mode == "duration":
        if type(duration_minutes) is not int or not 1 <= duration_minutes <= 1440 or until_time is not None:
            raise InvalidConfig("durationMinutes", "expected 1–1440 minutes")
        return current + timedelta(minutes=duration_minutes)
    if mode == "until_time":
        if duration_minutes is not None or type(until_time) is not str or not _LOCAL_TIME.fullmatch(until_time):
            raise InvalidConfig("untilTime", "expected HH:MM")
        try:
            zone = (UTC if house_timezone == "UTC" else ZoneInfo(house_timezone)) if isinstance(house_timezone, str) else house_timezone
        except (ZoneInfoNotFoundError, ValueError, TypeError):
            zone = None
        if zone is None or not isinstance(zone, tzinfo):
            raise HouseTimezoneUnavailable("House timezone is unavailable")
        local = current.astimezone(zone)
        hour, minute = map(int, until_time.split(":"))
        for days in range(3):
            wall = datetime.combine(local.date() + timedelta(days=days), time(hour, minute))
            occurrence = _instant(wall, zone)
            if occurrence is not None and occurrence > current:
                return occurrence
        raise InvalidConfig("untilTime", "no future occurrence")
    raise InvalidConfig("expiryMode", "unknown expiry mode")
