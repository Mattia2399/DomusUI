"""Pure weekly climate resolver. All instants are UTC; schedule times are house-local."""

from __future__ import annotations

import math
import re
from collections.abc import Mapping
from datetime import UTC, datetime, time, timedelta, tzinfo
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .models import WEEKDAYS

_TIME = re.compile(r"^(?:[01][0-9]|2[0-3]):[0-5][0-9]$")


def _empty(status: str) -> dict[str, Any]:
    return {"status": status, "activeProfileId": None, "activeProfileName": None,
            "activeEvent": None, "nextEvent": None, "zoneTargets": {}}


def _instant(local: datetime, zone: tzinfo) -> datetime | None:
    """First occurrence of an overlap; shift a gap forward by its DST jump."""
    valid: list[datetime] = []
    shifted: list[datetime] = []
    for fold in (0, 1):
        instant = local.replace(tzinfo=zone, fold=fold).astimezone(UTC)
        actual = instant.astimezone(zone).replace(tzinfo=None)
        if actual == local:
            valid.append(instant)
        elif actual > local:
            shifted.append(instant)
    if valid:
        return min(valid)
    return min(shifted) if shifted else None


def resolve_auto(config: Mapping[str, Any], now: datetime, house_timezone: str | tzinfo | None) -> dict[str, Any]:
    """Resolve the active and next event without reading a clock or Home Assistant."""
    if now.tzinfo is None or now.utcoffset() is None:
        return _empty("invalid_instant")
    try:
        zone = (UTC if house_timezone == "UTC" else ZoneInfo(house_timezone)) if isinstance(house_timezone, str) else house_timezone
    except (ZoneInfoNotFoundError, ValueError, TypeError):
        zone = None
    if zone is None or not isinstance(zone, tzinfo):
        return _empty("timezone_unavailable")
    current = now.astimezone(UTC)
    local_date = current.astimezone(zone).date()
    monday = local_date - timedelta(days=local_date.weekday())
    try:
        rows = config["schedules"]
        profiles = config["profiles"]
        zones = config["zones"]
        if type(rows) is not list or type(profiles) is not list or type(zones) is not list or len(rows) > 7:
            return _empty("invalid_schedule")
        if not rows or all(not row["events"] for row in rows):
            return _empty("no_schedule")
        profile_by_id = {item["id"]: item for item in profiles}
        seen_days: set[str] = set()
        occurrences: list[tuple[datetime, dict[str, str]]] = []
        for row in rows:
            day = row["day"]
            if day not in WEEKDAYS or day in seen_days or type(row["events"]) is not list:
                return _empty("invalid_schedule")
            seen_days.add(day)
            seen_times: set[str] = set()
            for event in row["events"]:
                wall_time = event["time"]
                profile_id = event["profileId"]
                if type(wall_time) is not str or _TIME.fullmatch(wall_time) is None or wall_time in seen_times or type(profile_id) is not str:
                    return _empty("invalid_schedule")
                if profile_id not in profile_by_id:
                    return _empty("profile_missing")
                seen_times.add(wall_time)
                hour, minute = map(int, wall_time.split(":"))
                for week in (-1, 0, 1):
                    date = monday + timedelta(days=WEEKDAYS.index(day) + 7 * week)
                    instant = _instant(datetime.combine(date, time(hour, minute)), zone)
                    if instant is None:
                        return _empty("invalid_schedule")
                    occurrences.append((instant, {"day": day, "time": wall_time, "profileId": profile_id}))
        occurrences.sort(key=lambda item: item[0])
        active = next((item for item in reversed(occurrences) if item[0] <= current), None)
        upcoming = next((item for item in occurrences if item[0] > current), None)
        if active is None or upcoming is None:
            return _empty("invalid_schedule")
        active_profile = profile_by_id.get(active[1]["profileId"])
        if active_profile is None:
            result = _empty("profile_missing")
            result["activeEvent"] = active[1]
            return result
        next_profile = profile_by_id.get(upcoming[1]["profileId"])
        targets = active_profile["zoneTargets"]
        if type(targets) is not dict:
            return _empty("invalid_schedule")
        zone_targets: dict[str, dict[str, Any]] = {}
        for zone_item in zones:
            zone_id = zone_item["id"]
            value = targets.get(zone_id)
            if value is None:
                zone_targets[zone_id] = {"status": "no_target", "value": None}
            elif type(value) not in (int, float) or not math.isfinite(value) or not 5 <= value <= 40:
                return _empty("invalid_schedule")
            else:
                zone_targets[zone_id] = {"status": "resolved", "value": float(value)}
        return {"status": "resolved", "activeProfileId": active_profile["id"], "activeProfileName": active_profile["name"],
                "activeEvent": active[1], "nextEvent": {**upcoming[1], "profileName": next_profile["name"] if next_profile else None,
                                                     "occursAt": upcoming[0].isoformat()}, "zoneTargets": zone_targets}
    except (KeyError, TypeError, ValueError, AttributeError, OverflowError):
        return _empty("invalid_schedule")
