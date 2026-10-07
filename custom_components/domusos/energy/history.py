"""Energy history read from Home Assistant long-term statistics.

The Recorder is the only source: nothing is stored, cached or integrated from
power. One request reads the ``change`` of every needed statistic in a single
``statistics_during_period`` call (``HISTORY_STATISTIC_TYPE``, converted to
kWh with ``HISTORY_UNITS``), so resets, ``last_reset`` and unit changes are
the ones Home Assistant already normalised in ``sum``.

Home Assistant behaviour this relies on (identical in 2025.1 and 2026.2):

- ``statistics_during_period(hass, start, end, ids, period, units, {"change"})``
  returns, per statistic, one row per period that has data, with ``start``
  (a UTC timestamp) and ``change``: the ``sum`` at the end of the period
  minus the ``sum`` at the end of the previous row, the first row using the
  last ``sum`` before ``start``. A period without a row has no data: it is
  reported as missing, never as 0.
- ``hour`` rows are the compiled hourly statistics; ``day``, ``week`` (from
  Monday) and ``month`` are reduced from them in the Home Assistant time zone,
  so a day lasts 23 or 25 hours across a DST change.
- The hour in progress has no row yet; the current day, week or month has
  the hours compiled so far.

Several meters of one role (F1, F2, F3) are summed only when every one of
them has the bucket; a total is authoritative and never added to its devices
(``energy_meter_plan``); a module whose devices do not all have a meter has
no total, only a separate ``partial_value``.
"""

from __future__ import annotations

import calendar
import logging
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta, tzinfo
from enum import StrEnum
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from ..core._values import utc_now
from .meters import (
    HISTORY_STATISTIC_TYPE,
    HISTORY_UNITS,
    KWH_PRECISION,
    EnergyMeterResolver,
    MeterReport,
    MeterStatus,
    _recorder_instance,
    energy_meter_plan,
)
from .models import EnergyError, EnergyModule
from .profile_v2 import EnergyProfileV2

_LOGGER = logging.getLogger(__name__)

HISTORY_UNIT = "kWh"


class InvalidHistoryRequestError(EnergyError):
    """The request has unknown or malformed parameters."""

    code = "invalid_request"


class InvalidHistoryRangeError(EnergyError):
    """The period cannot be read: malformed, empty, in the future or too long."""

    code = "invalid_range"


class InvalidHistoryBucketError(EnergyError):
    """The bucket is not one of hour, day, week or month."""

    code = "invalid_bucket"


class RecorderUnavailableError(EnergyError):
    """The Recorder is not loaded, not ready or migrating."""

    code = "recorder_unavailable"


class HistoryUnavailableError(EnergyError):
    """The Recorder failed while reading the statistics."""

    code = "history_unavailable"


class Bucket(StrEnum):
    """Length of one point; ``week`` starts on Monday like Home Assistant."""

    HOUR = "hour"
    DAY = "day"
    WEEK = "week"
    MONTH = "month"


# Ready-made periods ending with the bucket in progress.
PRESETS: Mapping[str, tuple[Bucket, int]] = {
    "24h": (Bucket.HOUR, 24),
    "7d": (Bucket.DAY, 7),
    "30d": (Bucket.DAY, 30),
    "12m": (Bucket.MONTH, 12),
}

# Longest custom period per bucket, in calendar units, and an absolute cap.
MAX_SPAN: Mapping[Bucket, tuple[str, int]] = {
    Bucket.HOUR: ("days", 31),
    Bucket.DAY: ("days", 400),
    Bucket.WEEK: ("weeks", 156),
    Bucket.MONTH: ("months", 36),
}
MAX_BUCKETS = 750
MAX_DATETIME_LENGTH = 40

# A derived home balance a little below zero is the timing skew between meters
# compiled independently; the band grows with the energy flowing. Beyond it
# the bucket is reported as incoherent, never clamped.
BALANCE_TOLERANCE_KWH = 0.05
BALANCE_TOLERANCE_RATIO = 0.02

# Series name -> module energy role.
SERIES: Mapping[str, tuple[EnergyModule, str]] = {
    "production": (EnergyModule.SOLAR, "production_energy"),
    "consumption": (EnergyModule.HOME, "consumption_energy"),
    "grid_import": (EnergyModule.GRID, "import_energy"),
    "grid_export": (EnergyModule.GRID, "export_energy"),
    "battery_charge": (EnergyModule.BATTERY, "charge_energy"),
    "battery_discharge": (EnergyModule.BATTERY, "discharge_energy"),
    "wallbox_consumption": (EnergyModule.WALLBOX, "charging_energy"),
}
ROLE_SERIES: Mapping[tuple[EnergyModule, str], str] = {value: key for key, value in SERIES.items()}

# consumption = grid_import + production + battery_discharge - grid_export - battery_charge.
# A wallbox sits behind the meter, so a derived consumption includes it.
DERIVED_TERMS: Sequence[tuple[str, int]] = (
    ("grid_import", 1),
    ("production", 1),
    ("battery_discharge", 1),
    ("grid_export", -1),
    ("battery_charge", -1),
)

REQUEST_KEYS = frozenset({"range", "start", "end", "bucket", "include_devices", "compare"})


class Reason(StrEnum):
    """Why a series has no points at all."""

    NO_ENERGY_METER = "no_energy_meter"
    NO_DATA = "no_data"
    RECORDER_UNAVAILABLE = "recorder_unavailable"
    INCOMPATIBLE_CONFIGURATION = "incompatible_configuration"


# --- Periods -------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class HistoryRange:
    """The buckets of one request, aligned in the Home Assistant time zone."""

    bucket: Bucket
    starts: tuple[datetime, ...]
    end: datetime
    in_progress_last: bool
    timezone: str

    @property
    def start(self) -> datetime:
        return self.starts[0]

    def as_dict(self) -> dict[str, Any]:
        return {
            "start": self.start.isoformat(),
            "end": self.end.isoformat(),
            "bucket": self.bucket.value,
            "timezone": self.timezone,
        }


def _local(value: datetime, tz: tzinfo) -> datetime:
    return value.astimezone(tz)


def _ts(value: datetime) -> float:
    # Aware datetimes sharing a tzinfo compare and subtract by wall clock, which
    # is wrong across a DST change: instants are compared as timestamps.
    return value.timestamp()


def _midnight(day: Any, tz: tzinfo) -> datetime:
    return datetime(day.year, day.month, day.day, tzinfo=tz)


def floor_bucket(value: datetime, bucket: Bucket, tz: tzinfo) -> datetime:
    """Start of the bucket containing ``value``; days follow the local calendar."""
    if bucket is Bucket.HOUR:
        # Hourly statistics start on UTC hours.
        return _local(value.astimezone(UTC).replace(minute=0, second=0, microsecond=0), tz)
    local = _local(value, tz)
    if bucket is Bucket.DAY:
        return _midnight(local.date(), tz)
    if bucket is Bucket.WEEK:
        return _midnight(local.date() - timedelta(days=local.weekday()), tz)
    return datetime(local.year, local.month, 1, tzinfo=tz)


def next_bucket(start: datetime, bucket: Bucket, tz: tzinfo) -> datetime:
    """Start of the following bucket: a local day may last 23 or 25 hours."""
    if bucket is Bucket.HOUR:
        return _local(start.astimezone(UTC) + timedelta(hours=1), tz)
    local = _local(start, tz)
    if bucket is Bucket.DAY:
        return _midnight(local.date() + timedelta(days=1), tz)
    if bucket is Bucket.WEEK:
        return _midnight(local.date() + timedelta(days=7), tz)
    year, month = (local.year + 1, 1) if local.month == 12 else (local.year, local.month + 1)
    return datetime(year, month, 1, tzinfo=tz)


def _ceil_bucket(value: datetime, bucket: Bucket, tz: tzinfo) -> datetime:
    start = floor_bucket(value, bucket, tz)
    return start if _ts(start) == _ts(value) else next_bucket(start, bucket, tz)


def _shift(start: datetime, unit: str, amount: int, tz: tzinfo) -> datetime:
    """``start`` moved by calendar days, weeks or months (local wall clock)."""
    local = _local(start, tz)
    if unit == "months":
        months = local.month - 1 + amount
        year, month = local.year + months // 12, months % 12 + 1
        day = min(local.day, calendar.monthrange(year, month)[1])
        return datetime(year, month, day, local.hour, local.minute, tzinfo=tz)
    days = amount * (7 if unit == "weeks" else 1)
    moved = local.replace(tzinfo=None) + timedelta(days=days)
    return moved.replace(tzinfo=tz)


def _parse_datetime(value: Any, name: str, tz: tzinfo) -> datetime:
    if not isinstance(value, str) or not value or len(value) > MAX_DATETIME_LENGTH:
        raise InvalidHistoryRangeError(f"{name} must be an ISO 8601 date and time")
    parsed = dt_util.parse_datetime(value)
    if parsed is None:
        raise InvalidHistoryRangeError(f"{name} must be an ISO 8601 date and time")
    # A time without an offset is read in the Home Assistant time zone.
    return parsed.replace(tzinfo=tz) if parsed.tzinfo is None else parsed


def _bucket(value: Any) -> Bucket:
    try:
        return Bucket(value)
    except ValueError as err:
        raise InvalidHistoryBucketError("bucket must be hour, day, week or month") from err


def resolve_range(request: Mapping[str, Any], now: datetime, tz: tzinfo, timezone: str) -> HistoryRange:
    """Validate the requested period and list its buckets, up to the one in progress."""
    if "range" in request:
        if request.keys() & {"start", "end", "bucket"}:
            raise InvalidHistoryRequestError("Send either range or start, end and bucket")
        preset = request["range"]
        if not isinstance(preset, str) or preset not in PRESETS:
            raise InvalidHistoryRangeError("range must be 24h, 7d, 30d or 12m")
        bucket, count = PRESETS[preset]
        end = next_bucket(floor_bucket(now, bucket, tz), bucket, tz)
        start = floor_bucket(now, bucket, tz)
        for _ in range(count - 1):
            start = floor_bucket(start - timedelta(seconds=1), bucket, tz)
    else:
        missing = [key for key in ("start", "end", "bucket") if key not in request]
        if missing:
            raise InvalidHistoryRequestError(f"Missing {', '.join(missing)}: send range or start, end and bucket")
        bucket = _bucket(request["bucket"])
        start = floor_bucket(_parse_datetime(request["start"], "start", tz), bucket, tz)
        end = _ceil_bucket(_parse_datetime(request["end"], "end", tz), bucket, tz)
        if _ts(end) <= _ts(start):
            raise InvalidHistoryRangeError("end must come after start")
        if _ts(start) > _ts(now):
            raise InvalidHistoryRangeError("The period starts in the future")
        unit, amount = MAX_SPAN[bucket]
        if _ts(end) > _ts(_shift(start, unit, amount, tz)):
            raise InvalidHistoryRangeError(f"At most {amount} {unit} with {bucket.value} buckets")

    # Nothing after the bucket in progress: future buckets would only be empty.
    current_end = next_bucket(floor_bucket(now, bucket, tz), bucket, tz)
    end = min(end, current_end, key=_ts)
    starts: list[datetime] = []
    cursor = start
    while _ts(cursor) < _ts(end):
        starts.append(cursor)
        if len(starts) > MAX_BUCKETS:
            raise InvalidHistoryRangeError(f"At most {MAX_BUCKETS} points per series")
        cursor = next_bucket(cursor, bucket, tz)
    return HistoryRange(
        bucket=bucket,
        starts=tuple(starts),
        end=_local(end, tz),
        in_progress_last=_ts(end) == _ts(current_end),
        timezone=timezone,
    )


def parse_request(request: Mapping[str, Any]) -> tuple[bool, str | None]:
    """Check the optional flags; the period is checked by ``resolve_range``."""
    unknown = set(request) - REQUEST_KEYS
    if unknown:
        raise InvalidHistoryRequestError(f"Unknown parameters: {', '.join(sorted(unknown))}")
    include_devices = request.get("include_devices", False)
    if not isinstance(include_devices, bool):
        raise InvalidHistoryRequestError("include_devices must be true or false")
    compare = request.get("compare")
    if compare is not None and compare != "previous":
        raise InvalidHistoryRequestError("compare can only be previous")
    return include_devices, compare


# --- Points --------------------------------------------------------------------

Changes = Mapping[str, Mapping[int, float | None]]


def _kwh(value: float) -> float:
    rounded = round(value, KWH_PRECISION)
    return 0.0 if rounded == 0 else rounded


def _key(start: datetime) -> int:
    return round(start.timestamp())


def meter_points(
    history: HistoryRange, parts: Sequence[str], changes: Changes, *, covered: bool = True
) -> list[dict[str, Any]]:
    """One point per bucket: the sum of the parts when every part has it.

    A missing part leaves the value null and is listed; the parts present are
    added as ``partial_value``, kept apart from the value. ``covered`` is False
    when some devices of the module have no meter: the sum is then never a
    total, only a partial value.
    """
    points: list[dict[str, Any]] = []
    for start in history.starts:
        key = _key(start)
        present = {part: changes.get(part, {}).get(key) for part in parts}
        missing = [part for part, value in present.items() if value is None]
        point: dict[str, Any] = {"start": start.isoformat(), "value": None}
        values = [value for value in present.values() if value is not None]
        if not missing and covered:
            point["value"] = _kwh(sum(values))
        else:
            if missing:
                point["missing"] = missing
            if values:
                point["partial_value"] = _kwh(sum(values))
        points.append(point)
    return points


def balance_value(terms: Sequence[tuple[float, int]]) -> float | None:
    """The home balance of one bucket, or None when it is incoherent."""
    total = sum(value * sign for value, sign in terms)
    tolerance = max(BALANCE_TOLERANCE_KWH, BALANCE_TOLERANCE_RATIO * sum(abs(value) for value, _ in terms))
    if total < -tolerance:
        return None
    # Only a balance inside the tolerance band can be below zero here.
    return 0.0 if total < 0 else _kwh(total)


def derived_points(history: HistoryRange, terms: Mapping[str, tuple[int, list[dict[str, Any]]]]) -> list[dict[str, Any]]:
    """Home consumption per bucket from complete terms only; never a 0 fallback."""
    points: list[dict[str, Any]] = []
    for index, start in enumerate(history.starts):
        point: dict[str, Any] = {"start": start.isoformat(), "value": None}
        missing = [name for name, (_, series) in terms.items() if series[index]["value"] is None]
        if missing:
            point["missing"] = missing
        else:
            value = balance_value([(series[index]["value"], sign) for sign, series in terms.values()])
            if value is None:
                point["reason"] = "incoherent_balance"
            point["value"] = value
        points.append(point)
    return points


def _series(history: HistoryRange, source: str, statistic_ids: Iterable[str], points: list[dict[str, Any]], **extra: Any) -> dict[str, Any]:
    # The bucket in progress is incomplete by nature: completeness counts the closed ones.
    closed = points[:-1] if history.in_progress_last else points
    complete = all(point["value"] is not None for point in closed)
    return {
        "source": source,
        "statistic_ids": sorted(set(statistic_ids)),
        "points": points,
        "complete": complete,
        "status": "complete" if complete else "partial_data",
        "in_progress_last": history.in_progress_last,
        **extra,
    }


def _has_data(points: Sequence[Mapping[str, Any]]) -> bool:
    return any(point["value"] is not None or "partial_value" in point for point in points)


def _unavailable(reason: Reason, statistic_ids: Iterable[str] = (), **extra: Any) -> dict[str, Any]:
    return {"reason": reason.value, "statistic_ids": sorted(set(statistic_ids)), **extra}


def _meter_outcome(
    history: HistoryRange,
    parts: Sequence[str],
    report: MeterReport,
    changes: Changes,
    *,
    source: str,
    covered: bool = True,
    **extra: Any,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    """A series of meters, or why there is none."""
    if not parts:
        return None, _unavailable(Reason.NO_ENERGY_METER)
    incompatible = [info for part in parts if (info := report.meters.get(part)) and info.status is MeterStatus.INCOMPATIBLE]
    if incompatible:
        return None, _unavailable(
            Reason.INCOMPATIBLE_CONFIGURATION,
            parts,
            meters={info.statistic_id: info.reason for info in incompatible},
        )
    points = meter_points(history, parts, changes, covered=covered)
    if not _has_data(points):
        statuses = {part: report.meters[part].status.value for part in parts if part in report.meters}
        reason = (
            Reason.RECORDER_UNAVAILABLE
            if statuses and all(status == MeterStatus.RECORDER_UNAVAILABLE for status in statuses.values())
            else Reason.NO_DATA
        )
        return None, _unavailable(reason, parts, meters=statuses)
    return _series(history, source, parts, points, **extra), None


# --- Service -------------------------------------------------------------------


def _read_statistics(
    hass: HomeAssistant, start: datetime, end: datetime, statistic_ids: set[str], period: str
) -> dict[str, list[dict[str, Any]]]:
    """Every statistic of the request in one Recorder query, in its executor."""
    from homeassistant.components.recorder.statistics import statistics_during_period  # noqa: PLC0415

    return statistics_during_period(
        hass, start, end, statistic_ids, period, dict(HISTORY_UNITS), {HISTORY_STATISTIC_TYPE}
    )


def _changes(rows: Mapping[str, Sequence[Mapping[str, Any]]]) -> dict[str, dict[int, float | None]]:
    return {
        statistic_id: {round(row["start"]): row.get("change") for row in statistic_rows}
        for statistic_id, statistic_rows in rows.items()
    }


# A statistic with long-term rows can be read; the others have no rows to read.
READABLE = frozenset({MeterStatus.VALID, MeterStatus.UNAVAILABLE})


class EnergyHistoryService:
    """Read-only energy history of the confirmed profile; never writes."""

    def __init__(self, hass: HomeAssistant, resolver: EnergyMeterResolver | None = None) -> None:
        self.hass = hass
        self.resolver = resolver or EnergyMeterResolver(hass)

    async def async_history(self, profile: EnergyProfileV2, request: Mapping[str, Any]) -> dict[str, Any]:
        """Return the history document of ``request`` (see ``docs/energy-core.md``)."""
        include_devices, _compare = parse_request(request)
        tz = dt_util.get_default_time_zone()
        history = resolve_range(request, dt_util.now(), tz, self.hass.config.time_zone)
        instance = _recorder_instance(self.hass)
        if instance is None:
            raise RecorderUnavailableError(
                "The Home Assistant Recorder is not running or still starting: history is not available yet"
            )

        plan = energy_meter_plan(profile)
        series_parts = {
            name: plan.get(module.value, {}).get(role)
            for name, (module, role) in SERIES.items()
            if module in profile.plant
        }
        wanted = {part for role in series_parts.values() if role for part in role["statistic_ids"]}
        if include_devices:
            wanted |= {
                part for role_plan in (role for roles in plan.values() for role in roles.values())
                for item in role_plan["devices"] for part in item["statistic_ids"]
            }

        report = await self.resolver.async_resolve(wanted)
        readable = {part for part in wanted if report.meters[part].status in READABLE}
        rows: Mapping[str, Sequence[Mapping[str, Any]]] = {}
        if readable:
            try:
                rows = await instance.async_add_executor_job(
                    _read_statistics,
                    self.hass,
                    history.start.astimezone(UTC),
                    # Home Assistant extends the end to the period containing it: stay inside the last bucket.
                    (history.end - timedelta(microseconds=1)).astimezone(UTC),
                    readable,
                    history.bucket.value,
                )
            except Exception as err:
                _LOGGER.warning("Energy history could not be read from the Recorder", exc_info=True)
                raise HistoryUnavailableError("The Recorder could not read the energy history") from err
        changes = _changes(rows)

        series: dict[str, dict[str, Any]] = {}
        unavailable: dict[str, dict[str, Any]] = {}
        for name, role_plan in series_parts.items():
            if role_plan is None:
                unavailable[name] = _unavailable(Reason.NO_ENERGY_METER)
                continue
            coverage = role_plan["coverage"]
            outcome, missing = _meter_outcome(
                history,
                role_plan["statistic_ids"],
                report,
                changes,
                source=role_plan["source"],
                covered=role_plan["complete"],
                **({"coverage": coverage} if coverage and not role_plan["complete"] else {}),
            )
            if outcome is not None:
                series[name] = outcome
            else:
                unavailable[name] = missing

        # A direct home meter is used alone, even without data; only its absence allows the balance.
        if not series_parts.get("consumption"):
            self._derive_consumption(profile, history, series, unavailable)

        return {
            "configured": not profile.is_empty,
            "range": history.as_dict(),
            "unit": HISTORY_UNIT,
            "recorder": "available",
            "verification": "complete" if report.complete else "incomplete",
            "series": series,
            "unavailable": unavailable,
            "devices": self._devices(profile, history, plan, report, changes) if include_devices else {},
            # A historical cost needs the tariff valid at each moment, which is not stored.
            "cost": None,
            # The comparison with the previous period comes with A2.2.
            "previous": None,
            "generated_at": utc_now().isoformat(),
        }

    def _derive_consumption(
        self,
        profile: EnergyProfileV2,
        history: HistoryRange,
        series: dict[str, dict[str, Any]],
        unavailable: dict[str, dict[str, Any]],
    ) -> None:
        """Home consumption from the balance, when every needed term exists."""
        plant = profile.plant
        if EnergyModule.GRID not in plant:
            unavailable["consumption"] = _unavailable(Reason.NO_ENERGY_METER, needs=["grid_import"])
            return
        # A module that is not installed has no flow; an installed one must be measured.
        needed = ["grid_import"]
        if EnergyModule.SOLAR in plant:
            needed.append("production")
        if EnergyModule.BATTERY in plant:
            needed += ["battery_discharge", "battery_charge"]
        if "grid_export" in series or EnergyModule.SOLAR in plant or EnergyModule.BATTERY in plant:
            needed.append("grid_export")
        absent = [name for name in needed if name not in series]
        if absent:
            reasons = {name: unavailable.get(name, {}).get("reason", Reason.NO_ENERGY_METER.value) for name in absent}
            unavailable["consumption"] = _unavailable(Reason.NO_ENERGY_METER, needs=absent, terms=reasons)
            return
        terms = {name: (sign, series[name]["points"]) for name, sign in DERIVED_TERMS if name in needed}
        points = derived_points(history, terms)
        statistic_ids = [part for name in terms for part in series[name]["statistic_ids"]]
        if not _has_data(points) and not any(point.get("reason") for point in points):
            unavailable["consumption"] = _unavailable(Reason.NO_DATA, statistic_ids, needs=list(terms))
            return
        series["consumption"] = _series(
            history, "derived", statistic_ids, points, terms={name: sign for name, (sign, _) in terms.items()}
        )

    def _devices(
        self,
        profile: EnergyProfileV2,
        history: HistoryRange,
        plan: Mapping[str, Mapping[str, Any]],
        report: MeterReport,
        changes: Changes,
    ) -> dict[str, dict[str, Any]]:
        """Each device's own series, as detail: never added to a module total."""
        devices: dict[str, dict[str, Any]] = {}
        for module, module_plan in profile.plant.items():
            for device in module_plan.devices:
                if not device.sources.energy:
                    continue
                own: dict[str, Any] = {"module": module.value, "name": device.name, "series": {}, "unavailable": {}}
                for role in plan.get(module.value, {}):
                    name = ROLE_SERIES[(module, role)]
                    outcome, missing = _meter_outcome(
                        history, list(device.sources.energy.get(role, ())), report, changes, source="meter"
                    )
                    if outcome is not None:
                        own["series"][name] = outcome
                    else:
                        own["unavailable"][name] = missing
                devices[device.id] = own
        return devices
