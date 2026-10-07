"""Energy history (A2.0): periods, aggregation and the real Home Assistant Recorder.

The pure tests check periods, DST, limits and how parts and terms combine. The
tests requesting ``recorder_mock`` run Home Assistant's real Recorder (2025.1
and 2026.2): imported statistics give exact hourly data, and statistics
compiled from real sensor states show resets, ``last_reset`` and unit changes
normalised by Home Assistant itself.
"""

from __future__ import annotations

import copy
import json
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from zoneinfo import ZoneInfo

import pytest
from freezegun.api import FrozenDateTimeFactory
from homeassistant.components.recorder import statistics as recorder_statistics
from homeassistant.const import MAJOR_VERSION, MINOR_VERSION
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.components.recorder.common import (
    async_wait_recording_done,
    do_adhoc_statistics,
)

from custom_components.domusos.const import DOMAIN
from custom_components.domusos.energy import history, meters
from custom_components.domusos.energy.api import websocket_get_history
from custom_components.domusos.energy.history import (
    BALANCE_TOLERANCE_KWH,
    Bucket,
    EnergyHistoryService,
    HistoryRange,
    InvalidHistoryBucketError,
    InvalidHistoryRangeError,
    InvalidHistoryRequestError,
    RecorderUnavailableError,
    balance_value,
    meter_points,
    parse_request,
    resolve_range,
)
from custom_components.domusos.energy.manager import EnergyProfileManager
from custom_components.domusos.energy.profile_v2 import STORAGE_KEY_V2, parse_profile_v2

ROME = ZoneInfo("Europe/Rome")
KWH = {"device_class": "energy", "state_class": "total_increasing", "unit_of_measurement": "kWh"}
W = {"device_class": "power", "state_class": "measurement", "unit_of_measurement": "W"}
# 12:30 in Rome (CEST): the hour, the day and the month in progress are 12:00, 6 October and October.
NOW = datetime(2026, 10, 6, 10, 30, tzinfo=UTC)


@pytest.fixture(autouse=True)
def mock_recorder_before_hass(async_setup_recorder_instance: Any) -> None:
    """Let the tests that request ``recorder_mock`` start the Recorder before hass."""


def rome(*args: int) -> datetime:
    return datetime(*args, tzinfo=ROME)


def _range(request: dict[str, Any], now: datetime = NOW) -> HistoryRange:
    return resolve_range(request, now, ROME, "Europe/Rome")


def _hours(starts: tuple[datetime, ...]) -> list[float]:
    return [(b.timestamp() - a.timestamp()) / 3600 for a, b in zip(starts, starts[1:])]


# --- Periods (pure) ------------------------------------------------------------------------


def test_presets_end_with_the_bucket_in_progress() -> None:
    day = _range({"range": "24h"})
    assert (len(day.starts), day.start, day.starts[-1], day.end) == (24, rome(2026, 10, 5, 13), rome(2026, 10, 6, 12), rome(2026, 10, 6, 13))
    assert day.in_progress_last and day.as_dict() == {
        "start": "2026-10-05T13:00:00+02:00", "end": "2026-10-06T13:00:00+02:00", "bucket": "hour", "timezone": "Europe/Rome",
    }
    week = _range({"range": "7d"})
    assert (week.bucket, len(week.starts), week.start, week.end) == (Bucket.DAY, 7, rome(2026, 9, 30), rome(2026, 10, 7))
    assert len(_range({"range": "30d"}).starts) == 30
    year = _range({"range": "12m"})
    assert (year.start, year.starts[-1], year.end, len(year.starts)) == (rome(2025, 11, 1), rome(2026, 10, 1), rome(2026, 11, 1), 12)
    # The end of October is already in winter time.
    assert year.end.utcoffset() == timedelta(hours=1)


def test_local_days_last_23_or_25_hours_and_hours_follow_dst() -> None:
    later = datetime(2026, 12, 1, tzinfo=UTC)
    spring = _range({"start": "2026-03-28T00:00:00", "end": "2026-03-31T00:00:00", "bucket": "day"}, later)
    assert _hours(spring.starts + (spring.end,)) == [24, 23, 24]
    autumn = _range({"start": "2026-10-24", "end": "2026-10-27", "bucket": "day"}, later)
    assert _hours(autumn.starts + (autumn.end,)) == [24, 25, 24]
    assert len(_range({"start": "2026-03-29T00:00", "end": "2026-03-30T00:00", "bucket": "hour"}, later).starts) == 23
    fall_back = _range({"start": "2026-10-25T00:00", "end": "2026-10-26T00:00", "bucket": "hour"}, later)
    assert len(fall_back.starts) == 25
    # The repeated 02:00 appears twice, once in summer and once in winter time.
    assert [start.isoformat() for start in fall_back.starts[2:4]] == ["2026-10-25T02:00:00+02:00", "2026-10-25T02:00:00+01:00"]
    assert not autumn.in_progress_last


def test_months_years_and_weeks_are_aligned_on_the_local_calendar() -> None:
    later = datetime(2026, 12, 1, tzinfo=UTC)
    months = _range({"start": "2025-11-15T10:00", "end": "2026-02-10T00:00", "bucket": "month"}, later)
    assert [start.date().isoformat() for start in months.starts] == ["2025-11-01", "2025-12-01", "2026-01-01", "2026-02-01"]
    assert months.end == rome(2026, 3, 1)
    # Weeks start on Monday like Home Assistant's.
    weeks = _range({"start": "2026-10-07T09:00+02:00", "end": "2026-10-20", "bucket": "week"}, later)
    assert [start.date().isoformat() for start in weeks.starts] == ["2026-10-05", "2026-10-12", "2026-10-19"]
    # A time with an offset keeps it; the bucket starts are local.
    utc = _range({"start": "2026-10-05T22:00:00+00:00", "end": "2026-10-06T00:00:00+00:00", "bucket": "hour"}, later)
    assert utc.starts == (rome(2026, 10, 6, 0), rome(2026, 10, 6, 1))


def test_a_custom_period_stops_at_the_bucket_in_progress() -> None:
    clipped = _range({"start": "2026-10-06T00:00", "end": "2026-10-08T00:00", "bucket": "hour"})
    assert (len(clipped.starts), clipped.end, clipped.in_progress_last) == (13, rome(2026, 10, 6, 13), True)
    past = _range({"start": "2026-10-01", "end": "2026-10-03", "bucket": "day"})
    assert (len(past.starts), past.in_progress_last) == (2, False)
    # The longest periods: 31 days of hours (745 across the autumn change), 400 days, 156 weeks, 36 months.
    later = datetime(2030, 1, 1, tzinfo=UTC)
    assert len(_range({"start": "2026-10-01", "end": "2026-11-01", "bucket": "hour"}, later).starts) == 745
    assert len(_range({"start": "2026-01-01", "end": "2027-02-05", "bucket": "day"}, later).starts) == 400
    assert len(_range({"start": "2027-01-04", "end": "2029-12-31", "bucket": "week"}, later).starts) == 156
    assert len(_range({"start": "2026-01-01", "end": "2029-01-01", "bucket": "month"}, later).starts) == 36


@pytest.mark.parametrize(
    ("request_", "error"),
    [
        ({"range": "1y"}, InvalidHistoryRangeError),
        ({"range": 24}, InvalidHistoryRangeError),
        ({"range": "24h", "bucket": "hour"}, InvalidHistoryRequestError),
        ({"start": "2026-10-01", "end": "2026-10-02"}, InvalidHistoryRequestError),
        ({}, InvalidHistoryRequestError),
        ({"start": "2026-10-01", "end": "2026-10-02", "bucket": "minute"}, InvalidHistoryBucketError),
        ({"start": "2026-10-01", "end": "2026-10-02", "bucket": None}, InvalidHistoryBucketError),
        ({"start": "yesterday", "end": "2026-10-02", "bucket": "day"}, InvalidHistoryRangeError),
        ({"start": "2026-10-01", "end": 5, "bucket": "day"}, InvalidHistoryRangeError),
        ({"start": "2026-10-01T00:00:00" + "0" * 40, "end": "2026-10-02", "bucket": "day"}, InvalidHistoryRangeError),
        ({"start": "2026-10-03", "end": "2026-10-01", "bucket": "day"}, InvalidHistoryRangeError),
        ({"start": "2026-10-07", "end": "2026-10-09", "bucket": "day"}, InvalidHistoryRangeError),
        ({"start": "2026-08-01", "end": "2026-09-02", "bucket": "hour"}, InvalidHistoryRangeError),
        ({"start": "2025-01-01", "end": "2026-02-06", "bucket": "day"}, InvalidHistoryRangeError),
        ({"start": "2022-01-01", "end": "2025-01-02", "bucket": "month"}, InvalidHistoryRangeError),
        ({"start": "2022-01-03", "end": "2025-01-07", "bucket": "week"}, InvalidHistoryRangeError),
    ],
)
def test_periods_are_validated_strictly(request_: dict[str, Any], error: type[Exception]) -> None:
    with pytest.raises(error):
        _range(request_)


def test_flags_are_validated_strictly() -> None:
    assert parse_request({"range": "24h"}) == (False, None)
    assert parse_request({"range": "24h", "include_devices": True, "compare": "previous"}) == (True, "previous")
    for request in ({"range": "24h", "series": ["production"]}, {"include_devices": "yes"}, {"compare": "last_year"}):
        with pytest.raises(InvalidHistoryRequestError):
            parse_request(request)


# --- Points (pure) -------------------------------------------------------------------------


def test_parts_are_summed_only_when_each_has_the_bucket() -> None:
    period = _range({"start": "2026-10-01T00:00", "end": "2026-10-01T03:00", "bucket": "hour"})
    keys = [round(start.timestamp()) for start in period.starts]
    changes = {
        "sensor.f1": {keys[0]: 1.2, keys[1]: 1.2, keys[2]: 0.0},
        "sensor.f2": {keys[0]: 0.7, keys[1]: 0.7, keys[2]: 0.0},
        "sensor.f3": {keys[0]: 0.1, keys[2]: 0.0},
    }
    parts = ["sensor.f1", "sensor.f2", "sensor.f3"]
    points = meter_points(period, parts, changes)
    assert points == [
        {"start": "2026-10-01T00:00:00+02:00", "value": 2.0},
        # F3 is missing: 1.9 is not the total, only a partial value apart from it.
        {"start": "2026-10-01T01:00:00+02:00", "value": None, "missing": ["sensor.f3"], "partial_value": 1.9},
        # A real zero stays a zero.
        {"start": "2026-10-01T02:00:00+02:00", "value": 0.0},
    ]
    # Devices without a meter: never a total, every bucket only partial.
    partial = meter_points(period, ["sensor.f1"], changes, covered=False)
    assert [(point["value"], point.get("partial_value")) for point in partial] == [(None, 1.2), (None, 1.2), (None, 0.0)]


def test_home_balance_tolerates_only_small_timing_noise() -> None:
    assert balance_value([(1.0, 1), (2.0, 1), (0.5, 1), (1.2, -1), (0.3, -1)]) == 2.0
    assert balance_value([(0.0, 1), (1.0, 1), (1.02, -1)]) == 0.0
    assert balance_value([(0.0, 1), (0.01, 1), (0.01 + BALANCE_TOLERANCE_KWH * 0.99, -1)]) == 0.0
    assert balance_value([(0.0, 1), (0.1, 1), (1.0, -1)]) is None
    # The band grows with the energy flowing: 2% of the terms.
    assert balance_value([(50.0, 1), (50.0, 1), (101.5, -1)]) == 0.0
    assert balance_value([(50.0, 1), (50.0, 1), (104.0, -1)]) == 0.0
    assert balance_value([(50.0, 1), (50.0, 1), (106.0, -1)]) is None


# --- With the real Recorder ------------------------------------------------------------------


def _metadata(statistic_id: str, unit: str = "kWh") -> dict[str, Any]:
    external = ":" in statistic_id
    metadata: dict[str, Any] = {
        "has_sum": True,
        "name": None,
        "source": statistic_id.split(":")[0] if external else "recorder",
        "statistic_id": statistic_id,
        "unit_of_measurement": unit,
    }
    if (MAJOR_VERSION, MINOR_VERSION) >= (2025, 4):
        from homeassistant.components.recorder.models import StatisticMeanType  # noqa: PLC0415

        metadata |= {"mean_type": StatisticMeanType.NONE, "unit_class": "energy"}
    else:
        metadata |= {"has_mean": False}
    return metadata


def _import(hass: HomeAssistant, statistic_id: str, start: datetime, deltas: list[float | None], unit: str = "kWh") -> None:
    """Hourly rows from ``start``; ``None`` leaves an hour without a row."""
    total = 0.0
    rows = []
    for index, delta in enumerate(deltas):
        if delta is None:
            continue
        total += delta
        # Hours are added in UTC: local wall-clock hours skip or repeat across DST.
        rows.append({"start": start.astimezone(UTC) + timedelta(hours=index), "state": total, "sum": total})
    if ":" in statistic_id:
        recorder_statistics.async_add_external_statistics(hass, _metadata(statistic_id, unit), rows)
    else:
        hass.states.async_set(statistic_id, str(total), {**KWH, "unit_of_measurement": unit})
        recorder_statistics.async_import_statistics(hass, _metadata(statistic_id, unit), rows)


def _profile(plant: dict[str, Any]) -> Any:
    return parse_profile_v2({"plant": plant})


def _device(device_id: str, energy: dict[str, list[str]] | None = None, power: dict[str, str] | None = None) -> dict[str, Any]:
    device: dict[str, Any] = {"id": device_id}
    if energy:
        device["energy"] = energy
    if power:
        device["power"] = {"sensors": power}
    return device


async def _setup(hass: HomeAssistant, freezer: FrozenDateTimeFactory, now: datetime = NOW) -> None:
    await hass.config.async_set_time_zone("Europe/Rome")
    freezer.move_to(now)


async def _history(hass: HomeAssistant, plant: dict[str, Any], **request: Any) -> dict[str, Any]:
    return await EnergyHistoryService(hass).async_history(_profile(plant), request)


def _values(series: dict[str, Any]) -> list[float | None]:
    return [point["value"] for point in series["points"]]


async def test_history_reads_change_in_one_query_with_missing_hours_as_null(
    recorder_mock: Any, hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    await _setup(hass, freezer)
    # 00:00 to 11:00 local on 6 October: a real zero at 01:00, no data at 02:00.
    _import(hass, "opower:pv", rome(2026, 10, 6, 0), [0.5, 0.0, None, 1.25, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 1.5])
    await async_wait_recording_done(hass)

    with patch.object(history, "_read_statistics", side_effect=history._read_statistics) as read:
        result = await _history(hass, {"solar": {"devices": [_device("solar-1", {"production_energy": ["opower:pv"]})]}}, range="24h")
    read.assert_called_once()
    assert read.call_args.args[3:] == ({"opower:pv"}, "hour")

    production = result["series"]["production"]
    assert (result["unit"], result["range"]["bucket"], result["range"]["timezone"]) == ("kWh", "hour", "Europe/Rome")
    assert (production["source"], production["statistic_ids"]) == ("devices", ["opower:pv"])
    values = _values(production)
    # 13:00 to 23:00 on the 5th: nothing recorded yet, never 0.
    assert values[:11] == [None] * 11
    assert values[11:23] == [0.5, 0.0, None, 1.25, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 1.5]
    assert production["points"][13] == {"start": "2026-10-06T02:00:00+02:00", "value": None, "missing": ["opower:pv"]}
    # 12:00 is in progress: no hourly statistic yet.
    assert (values[23], production["in_progress_last"], production["complete"], production["status"]) == (None, True, False, "partial_data")
    assert (result["cost"], result["previous"], result["devices"]) == (None, None, {})
    # Without a grid the home balance cannot be computed: said, never guessed.
    assert result["unavailable"] == {"consumption": {"reason": "no_energy_meter", "statistic_ids": [], "needs": ["grid_import"]}}

    # The same statistics by day: the day in progress has the hours compiled so far.
    days = await _history(hass, {"solar": {"devices": [_device("solar-1", {"production_energy": ["opower:pv"]})]}}, range="7d")
    assert _values(days["series"]["production"]) == [None] * 6 + [17.25]
    assert days["series"]["production"]["in_progress_last"] is True


async def test_bands_are_summed_only_when_every_band_has_the_hour(
    recorder_mock: Any, hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    await _setup(hass, freezer)
    start = rome(2026, 10, 6, 8)
    _import(hass, "opower:f1", start, [1.2, 1.2, 0.0])
    _import(hass, "opower:f2", start, [0.7, 0.7, 0.0])
    _import(hass, "opower:f3", start, [0.1, None, 0.0])
    await async_wait_recording_done(hass)
    plant = {"grid": {"devices": [_device("grid-1", {"import_energy": ["opower:f1", "opower:f2", "opower:f3"]})]}}

    result = await _history(hass, plant, start="2026-10-06T08:00", end="2026-10-06T11:00", bucket="hour")

    assert result["series"]["grid_import"]["points"] == [
        {"start": "2026-10-06T08:00:00+02:00", "value": 2.0},
        {"start": "2026-10-06T09:00:00+02:00", "value": None, "missing": ["opower:f3"], "partial_value": 1.9},
        {"start": "2026-10-06T10:00:00+02:00", "value": 0.0},
    ]
    assert result["range"]["end"] == "2026-10-06T11:00:00+02:00"
    assert result["series"]["grid_import"]["in_progress_last"] is False
    # No export meter: said, never 0.
    assert result["unavailable"]["grid_export"] == {"reason": "no_energy_meter", "statistic_ids": []}


async def test_a_total_is_used_alone_and_devices_are_only_detail(
    recorder_mock: Any, hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    await _setup(hass, freezer)
    start = rome(2026, 10, 6, 9)
    _import(hass, "opower:inv1", start, [1.0])
    _import(hass, "opower:inv2", start, [2.0])
    _import(hass, "opower:pv_total", start, [3.1])
    await async_wait_recording_done(hass)
    plant = {"solar": {
        "devices": [_device("solar-1", {"production_energy": ["opower:inv1"]}), _device("solar-2", {"production_energy": ["opower:inv2"]})],
        "total": {"energy": {"production_energy": ["opower:pv_total"]}},
    }}
    request = {"start": "2026-10-06T09:00", "end": "2026-10-06T10:00", "bucket": "hour"}

    with patch.object(history, "_read_statistics", side_effect=history._read_statistics) as read:
        result = await _history(hass, plant, **request)
    # Without the device detail only the total is read.
    assert read.call_args.args[3] == {"opower:pv_total"}
    production = result["series"]["production"]
    assert (production["source"], production["statistic_ids"], _values(production)) == ("total", ["opower:pv_total"], [3.1])
    assert result["devices"] == {}

    with patch.object(history, "_read_statistics", side_effect=history._read_statistics) as read:
        detailed = await _history(hass, plant, include_devices=True, **request)
    read.assert_called_once()
    assert read.call_args.args[3] == {"opower:pv_total", "opower:inv1", "opower:inv2"}
    assert _values(detailed["series"]["production"]) == [3.1]
    assert {key: _values(device["series"]["production"]) for key, device in detailed["devices"].items()} == {"solar-1": [1.0], "solar-2": [2.0]}
    assert detailed["devices"]["solar-1"]["module"] == "solar"


async def test_devices_without_a_meter_leave_only_a_partial_value(
    recorder_mock: Any, hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    await _setup(hass, freezer)
    _import(hass, "opower:inv1", rome(2026, 10, 6, 9), [1.0])
    await async_wait_recording_done(hass)
    plant = {"solar": {"devices": [
        _device("solar-1", {"production_energy": ["opower:inv1"]}),
        _device("solar-2", power={"production_power": "sensor.inv2_power"}),
    ]}}

    result = await _history(hass, plant, include_devices=True, start="2026-10-06T09:00", end="2026-10-06T10:00", bucket="hour")

    production = result["series"]["production"]
    assert production["points"] == [{"start": "2026-10-06T09:00:00+02:00", "value": None, "partial_value": 1.0}]
    assert (production["coverage"], production["complete"]) == ({"contributing": 1, "configured": 2}, False)
    # The device without a meter is not listed: it has nothing to show.
    assert list(result["devices"]) == ["solar-1"]


async def test_home_consumption_direct_or_derived_from_complete_terms(
    recorder_mock: Any, hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    await _setup(hass, freezer)
    start = rome(2026, 10, 6, 6)
    # 06:00 balanced, 07:00 battery missing, 08:00 incoherent, 09:00 timing noise.
    _import(hass, "opower:in", start, [1.0, 1.0, 0.0, 0.0])
    _import(hass, "opower:out", start, [1.2, 1.2, 1.0, 1.02])
    _import(hass, "opower:pv", start, [2.0, 2.0, 0.1, 1.0])
    _import(hass, "opower:bat_in", start, [0.3, 0.3, 0.0, 0.0])
    _import(hass, "opower:bat_out", start, [0.5, None, 0.0, 0.0])
    _import(hass, "opower:car", start, [3.0, 3.0, 0.0, 0.0])
    _import(hass, "opower:house", start, [4.4, 4.0, 3.9, 0.5])
    await async_wait_recording_done(hass)
    plant = {
        "grid": {"devices": [_device("grid-1", {"import_energy": ["opower:in"], "export_energy": ["opower:out"]})]},
        "solar": {"devices": [_device("solar-1", {"production_energy": ["opower:pv"]})]},
        "battery": {"devices": [_device("battery-1", {"charge_energy": ["opower:bat_in"], "discharge_energy": ["opower:bat_out"]})]},
        "wallbox": {"devices": [_device("wallbox-1", {"charging_energy": ["opower:car"]})]},
    }
    request = {"start": "2026-10-06T06:00", "end": "2026-10-06T10:00", "bucket": "hour"}

    derived = (await _history(hass, plant, **request))["series"]
    consumption = derived["consumption"]
    assert (consumption["source"], consumption["terms"]) == (
        "derived", {"grid_import": 1, "production": 1, "battery_discharge": 1, "grid_export": -1, "battery_charge": -1},
    )
    assert consumption["points"] == [
        {"start": "2026-10-06T06:00:00+02:00", "value": 2.0},
        {"start": "2026-10-06T07:00:00+02:00", "value": None, "missing": ["battery_discharge"]},
        {"start": "2026-10-06T08:00:00+02:00", "value": None, "reason": "incoherent_balance"},
        {"start": "2026-10-06T09:00:00+02:00", "value": 0.0},
    ]
    # The car is behind the meter: a series of its own, never subtracted.
    assert _values(derived["wallbox_consumption"]) == [3.0, 3.0, 0.0, 0.0]

    # A home meter is used alone.
    direct = await _history(hass, {**plant, "home": {"devices": [_device("home-1", {"consumption_energy": ["opower:house"]})]}}, **request)
    assert (direct["series"]["consumption"]["source"], _values(direct["series"]["consumption"])) == ("devices", [4.4, 4.0, 3.9, 0.5])

    # Without an export meter the balance of a plant with photovoltaics cannot be computed.
    without_export = copy.deepcopy(plant)
    del without_export["grid"]["devices"][0]["energy"]["export_energy"]
    missing = await _history(hass, without_export, **request)
    assert missing["unavailable"]["consumption"] == {
        "reason": "no_energy_meter", "statistic_ids": [], "needs": ["grid_export"], "terms": {"grid_export": "no_energy_meter"},
    }
    # A grid-only home: what is imported is what the home uses.
    grid_only = await _history(hass, {"grid": {"devices": [_device("grid-1", {"import_energy": ["opower:in"]})]}}, **request)
    assert _values(grid_only["series"]["consumption"]) == [1.0, 1.0, 0.0, 0.0]


async def test_days_follow_dst_and_months_cross_the_year(
    recorder_mock: Any, hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    await _setup(hass, freezer, datetime(2026, 11, 2, tzinfo=UTC))
    # 1 kWh every hour around both changes, and around New Year.
    _import(hass, "opower:spring", rome(2026, 3, 28), [1.0] * 71)
    _import(hass, "opower:autumn", rome(2026, 10, 24), [1.0] * 73)
    _import(hass, "opower:year", rome(2025, 12, 31, 20), [1.0] * 8)
    await async_wait_recording_done(hass)

    def plant(statistic_id: str) -> dict[str, Any]:
        return {"solar": {"devices": [_device("solar-1", {"production_energy": [statistic_id]})]}}

    spring = await _history(hass, plant("opower:spring"), start="2026-03-28", end="2026-03-31", bucket="day")
    assert _values(spring["series"]["production"]) == [24.0, 23.0, 24.0]
    autumn = await _history(hass, plant("opower:autumn"), start="2026-10-24", end="2026-10-27", bucket="day")
    assert _values(autumn["series"]["production"]) == [24.0, 25.0, 24.0]
    hours = await _history(hass, plant("opower:autumn"), start="2026-10-25", end="2026-10-26", bucket="hour")
    assert _values(hours["series"]["production"]) == [1.0] * 25
    year = await _history(hass, plant("opower:year"), start="2025-12-01", end="2026-02-01", bucket="month")
    # 20:00 to 23:00 on 31 December, then 00:00 to 03:00 on 1 January.
    assert [(point["start"], point["value"]) for point in year["series"]["production"]["points"]] == [
        ("2025-12-01T00:00:00+01:00", 4.0), ("2026-01-01T00:00:00+01:00", 4.0),
    ]
    week = await _history(hass, plant("opower:autumn"), start="2026-10-19", end="2026-11-01", bucket="week")
    # Saturday and Sunday (24 + 25 hours) in the week from the 19th, Monday in the next one.
    assert _values(week["series"]["production"]) == [49.0, 24.0]


async def test_resets_last_reset_and_units_are_normalised_by_home_assistant(
    recorder_mock: Any, hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    """Statistics compiled from real sensor states: Home Assistant's own ``sum``."""
    start = datetime(2026, 10, 6, 6, tzinfo=UTC)
    await _setup(hass, freezer, start)
    await async_setup_component(hass, "sensor", {})
    total = {**KWH, "state_class": "total"}
    steps: list[list[tuple[str, str, dict[str, Any]]]] = [
        [
            ("sensor.increasing", "100", KWH), ("sensor.wh", "1000", {**KWH, "unit_of_measurement": "Wh"}),
            ("sensor.mwh", "1.000", {**KWH, "unit_of_measurement": "MWh"}), ("sensor.zero", "7", KWH),
            ("sensor.cycle", "10", {**total, "last_reset": start.isoformat()}), ("sensor.unit", "5", KWH),
        ],
        [("sensor.increasing", "101", KWH), ("sensor.wh", "1500", {**KWH, "unit_of_measurement": "Wh"}),
         ("sensor.mwh", "1.002", {**KWH, "unit_of_measurement": "MWh"}), ("sensor.cycle", "11", {**total, "last_reset": start.isoformat()})],
        # Second hour: a meter reset, a new cycle and the same meter now in Wh.
        [("sensor.increasing", "102", KWH), ("sensor.cycle", "1", {**total, "last_reset": (start + timedelta(hours=1)).isoformat()}),
         ("sensor.unit", "5100", {**KWH, "unit_of_measurement": "Wh"})],
        [("sensor.increasing", "0.5", KWH), ("sensor.cycle", "3", {**total, "last_reset": (start + timedelta(hours=1)).isoformat()})],
        [("sensor.increasing", "1.0", KWH)],
    ]
    # States at 06:00, 06:30, 07:00, 07:20 and 07:40 UTC; every five minutes compiled.
    times = [start, start + timedelta(minutes=30), start + timedelta(hours=1), start + timedelta(minutes=80), start + timedelta(minutes=100)]
    period = start
    for moment, updates in zip(times + [start + timedelta(hours=2)], steps + [[]]):
        while period + timedelta(minutes=5) <= moment:
            freezer.move_to(period + timedelta(minutes=5, seconds=10))
            do_adhoc_statistics(hass, start=period)
            await async_wait_recording_done(hass)
            period += timedelta(minutes=5)
        freezer.move_to(moment)
        for entity_id, state, attributes in updates:
            hass.states.async_set(entity_id, state, attributes)
        await async_wait_recording_done(hass)
    freezer.move_to(start + timedelta(hours=2, minutes=30))

    ids = ["sensor.increasing", "sensor.wh", "sensor.mwh", "sensor.zero", "sensor.cycle", "sensor.unit"]
    plant = {"grid": {"devices": [_device(f"grid-{index}", {"import_energy": [statistic_id]}) for index, statistic_id in enumerate(ids, 1)]}}
    result = await _history(hass, plant, include_devices=True, start="2026-10-06T08:00", end="2026-10-06T10:00", bucket="hour")
    by_meter = {device["series"]["grid_import"]["statistic_ids"][0]: _values(device["series"]["grid_import"]) for device in result["devices"].values()}
    assert by_meter == {
        # total_increasing: +1, then +1 before the reset and the 1.0 counted since the reset.
        "sensor.increasing": [1.0, 2.0],
        # Wh and MWh read in kWh.
        "sensor.wh": [0.5, 0.0],
        "sensor.mwh": [2.0, 0.0],
        # A meter that does not move is a real 0, not missing.
        "sensor.zero": [0.0, 0.0],
        # total with last_reset: +1, then the new cycle from 0 to 3.
        "sensor.cycle": [1.0, 3.0],
        # The same meter switching from kWh to Wh: 5 kWh to 5.1 kWh.
        "sensor.unit": [0.0, 0.1],
    }


async def test_missing_meters_and_recorder_states_never_fail_the_request(
    recorder_mock: Any, hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    await _setup(hass, freezer)
    await async_setup_component(hass, "sensor", {})
    hass.states.async_set("sensor.watts", "300", W)
    hass.states.async_set("sensor.new_meter", "0", KWH)
    _import(hass, "opower:old", rome(2026, 9, 1), [1.0])
    await async_wait_recording_done(hass)
    plant = {
        "solar": {"devices": [_device("solar-1", power={"production_power": "sensor.pv_power"})]},
        "battery": {"devices": [_device("battery-1", {"charge_energy": ["sensor.watts"], "discharge_energy": ["opower:unknown"]})]},
        "wallbox": {"devices": [_device("wallbox-1", {"charging_energy": ["opower:old"]})]},
        "grid": {"devices": [_device("grid-1", {"import_energy": ["sensor.new_meter"]})]},
    }

    result = await _history(hass, plant, range="24h")

    assert result["series"] == {}
    unavailable = result["unavailable"]
    assert unavailable["production"] == {"reason": "no_energy_meter", "statistic_ids": []}
    assert unavailable["battery_charge"] == {"reason": "incompatible_configuration", "statistic_ids": ["sensor.watts"], "meters": {"sensor.watts": "incompatible_device_class"}}
    assert unavailable["battery_discharge"] == {"reason": "no_data", "statistic_ids": ["opower:unknown"], "meters": {"opower:unknown": "unknown"}}
    # Statistics exist, but not in this period.
    assert unavailable["wallbox_consumption"] == {"reason": "no_data", "statistic_ids": ["opower:old"], "meters": {"opower:old": "valid"}}
    assert unavailable["grid_import"]["meters"] == {"sensor.new_meter": "pending"}
    assert unavailable["consumption"]["reason"] == "no_energy_meter"

    # While the Recorder starts, meters it cannot check yet are reported as such.
    starting = meters.MeterReport(
        recorder_available=True,
        complete=False,
        meters={"opower:old": meters.MeterInfo("opower:old", meters.MeterStatus.RECORDER_UNAVAILABLE, "recorder_starting")},
    )
    resolver = MagicMock(async_resolve=AsyncMock(return_value=starting))
    wallbox = {"wallbox": plant["wallbox"]}
    result = await EnergyHistoryService(hass, resolver).async_history(_profile(wallbox), {"range": "24h"})
    assert (result["verification"], result["unavailable"]["wallbox_consumption"]["reason"]) == ("incomplete", "recorder_unavailable")

    with patch.object(history, "_read_statistics", side_effect=RuntimeError("database is locked")), pytest.raises(history.HistoryUnavailableError):
        await _history(hass, wallbox, range="24h")
    with patch.object(history, "_recorder_instance", return_value=None), pytest.raises(RecorderUnavailableError):
        await _history(hass, wallbox, range="24h")


async def test_sixteen_devices_and_several_modules_take_one_statistics_query(
    recorder_mock: Any, hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    await _setup(hass, freezer)
    start = rome(2026, 10, 6, 9)
    inverters = [f"opower:inv{index}" for index in range(16)]
    for statistic_id in inverters:
        _import(hass, statistic_id, start, [0.25])
    for statistic_id in ("opower:a1", "opower:a2", "opower:b1", "opower:b2", "opower:car1", "opower:car2"):
        _import(hass, statistic_id, start, [1.0])
    await async_wait_recording_done(hass)
    plant = {
        "solar": {"devices": [_device(f"solar-{index}", {"production_energy": [statistic_id]}) for index, statistic_id in enumerate(inverters, 1)]},
        "battery": {"devices": [
            _device("battery-1", {"charge_energy": ["opower:a1"], "discharge_energy": ["opower:b1"]}),
            _device("battery-2", {"charge_energy": ["opower:a2"], "discharge_energy": ["opower:b2"]}),
        ]},
        "wallbox": {"devices": [_device("wallbox-1", {"charging_energy": ["opower:car1"]}), _device("wallbox-2", {"charging_energy": ["opower:car2"]})]},
    }

    with (
        patch.object(meters, "_read_recorder", side_effect=meters._read_recorder) as metadata,
        patch.object(history, "_read_statistics", side_effect=history._read_statistics) as read,
    ):
        result = await _history(hass, plant, include_devices=True, start="2026-10-06T09:00", end="2026-10-06T10:00", bucket="hour")
    metadata.assert_called_once()
    read.assert_called_once()
    assert len(read.call_args.args[3]) == 22
    series = result["series"]
    assert (_values(series["production"]), _values(series["battery_charge"]), _values(series["wallbox_consumption"])) == ([4.0], [2.0], [2.0])
    assert len(result["devices"]) == 20


# --- Websocket ------------------------------------------------------------------------------


class RecordedConnection:
    """The parts of ``ActiveConnection`` the Energy handlers use."""

    def __init__(self, *, admin: bool) -> None:
        self.user = MagicMock(is_admin=admin)
        self.results: dict[int, Any] = {}
        self.errors: dict[int, str] = {}

    def send_result(self, msg_id: int, result: Any = None) -> None:
        self.results[msg_id] = result

    def send_error(self, msg_id: int, code: str, message: str, *_: Any, **__: Any) -> None:
        self.errors[msg_id] = code


async def test_any_user_reads_history_without_any_write(
    recorder_mock: Any, hass: HomeAssistant, hass_storage: dict, freezer: FrozenDateTimeFactory
) -> None:
    await _setup(hass, freezer)
    _import(hass, "opower:pv", rome(2026, 10, 6, 9), [1.0])
    await async_wait_recording_done(hass)
    document = {
        "schema": "domusos-energy-profile", "version": 2, "revision": 3, "updated_at": None, "migrated_from": None,
        "plant": {"solar": {"devices": [_device("solar-1", {"production_energy": ["opower:pv"]})]}}, "tariff": None, "retired_device_ids": [],
    }
    hass_storage[STORAGE_KEY_V2] = {"version": 1, "minor_version": 1, "key": STORAGE_KEY_V2, "data": document}
    before = json.dumps(hass_storage, sort_keys=True, default=str)
    connection = RecordedConnection(admin=False)

    async def call(msg: dict[str, Any]) -> None:
        websocket_get_history(hass, connection, {"type": "domusos/energy/get_history", **msg})
        await hass.async_block_till_done(wait_background_tasks=True)

    await call({"id": 1, "range": "24h"})
    assert connection.errors == {1: "energy_unavailable"}

    manager = EnergyProfileManager(hass)
    await manager.async_setup()
    hass.data.setdefault(DOMAIN, {})["energy_manager"] = manager
    await call({"id": 2, "range": "24h"})
    await call({"id": 3, "start": "2026-10-06T09:00", "end": "2026-10-06T10:00", "bucket": "hour", "include_devices": True, "compare": "previous"})
    await call({"id": 4, "range": "2y"})
    await call({"id": 5, "start": "2026-10-06", "end": "2026-10-07", "bucket": "minute"})
    await call({"id": 6, "range": "24h", "bucket": "hour"})

    assert connection.results[2]["series"]["production"]["points"][-4]["value"] == 1.0
    assert _values(connection.results[3]["devices"]["solar-1"]["series"]["production"]) == [1.0]
    assert connection.results[3]["previous"] is None
    assert connection.errors == {1: "energy_unavailable", 4: "invalid_range", 5: "invalid_bucket", 6: "invalid_request"}
    # Reading the history never touches the stores.
    assert json.dumps(hass_storage, sort_keys=True, default=str) == before

    with patch.object(EnergyHistoryService, "async_history", side_effect=ValueError("boom")):
        await call({"id": 7, "range": "24h"})
    assert connection.errors[7] == "unknown_error"


async def test_without_the_recorder_history_is_unavailable_and_nothing_else_breaks(hass: HomeAssistant) -> None:
    profile = _profile({"solar": {"devices": [_device("solar-1", {"production_energy": ["opower:pv"]})]}})
    assert "recorder" not in hass.config.components
    with pytest.raises(RecorderUnavailableError):
        await EnergyHistoryService(hass).async_history(profile, {"range": "7d"})
    # A malformed request is still reported as such, before the Recorder is needed.
    with pytest.raises(InvalidHistoryRangeError):
        await EnergyHistoryService(hass).async_history(profile, {"range": "1y"})
