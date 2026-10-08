"""Energy analytics (A2.2A): period totals, KPIs and the previous period.

The pure tests check the formulas, tolerances and comparisons on totals built
like History Core's; the tests requesting ``recorder_mock`` read the real
Recorder (2025.1 and 2026.2) and check that the previous period comes from the
same single statistics query.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from unittest.mock import patch

import pytest
from freezegun.api import FrozenDateTimeFactory
from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.components.recorder.common import (
    async_wait_recording_done,
)
from test_energy_history import NOW, ROME, _device, _history, _import, _setup, rome

from custom_components.domusos.energy import history
from custom_components.domusos.energy.analytics import (
    ENERGY_TOLERANCE_KWH,
    change,
    comparison,
    energy_tolerance,
    period_kpis,
    period_summary,
    self_consumption,
    self_sufficiency,
    series_total,
    solar_offset,
)
from custom_components.domusos.energy.history import (
    BALANCE_TOLERANCE_KWH,
    previous_range,
    resolve_range,
)


@pytest.fixture(autouse=True)
def mock_recorder_before_hass(async_setup_recorder_instance: Any) -> None:
    """Let the tests that request ``recorder_mock`` start the Recorder before hass."""


def _series(*values: float | None, source: str = "total", in_progress: bool = False, partial: dict[int, float] | None = None) -> dict[str, Any]:
    points: list[dict[str, Any]] = []
    for index, value in enumerate(values):
        point: dict[str, Any] = {"start": f"2026-10-06T{index:02d}:00:00+02:00", "value": value}
        if value is None and partial and index in partial:
            point |= {"missing": ["sensor.x"], "partial_value": partial[index]}
        points.append(point)
    return {"source": source, "statistic_ids": ["sensor.x"], "points": points, "in_progress_last": in_progress}


def _summary(**totals: float | None | str) -> dict[str, dict[str, Any]]:
    """Totals by name: a number, None (partial data) or "unavailable"."""
    series = {name: _series(value) for name, value in totals.items() if value != "unavailable"}
    unavailable = {name: {"reason": "no_energy_meter", "statistic_ids": []} for name, value in totals.items() if value == "unavailable"}
    return period_summary(series, unavailable, in_progress=False)


def _range(request: dict[str, Any], now: datetime = NOW) -> history.HistoryRange:
    return resolve_range(request, now, ROME, "Europe/Rome")


def _iso(starts: tuple[datetime, ...]) -> list[str]:
    return [start.isoformat() for start in starts]


# --- Totals ---------------------------------------------------------------------------------


def test_a_total_sums_closed_buckets_and_says_whether_the_bucket_in_progress_is_in() -> None:
    today = series_total(_series(1.0, 2.5, 0.75, in_progress=True))
    assert (today["value"], today["closed_value"], today["in_progress"], today["in_progress_included"]) == (4.25, 3.5, True, True)
    assert (today["status"], today["complete"], today["source"], today["unit"]) == ("complete", True, "measured", "kWh")
    # The hour in progress has no row yet: the total so far is the closed hours alone.
    hour = series_total(_series(1.0, 2.0, None, in_progress=True))
    assert (hour["value"], hour["closed_value"], hour["in_progress_included"], hour["complete"]) == (3.0, 3.0, False, True)
    closed = series_total(_series(1.0, 2.0))
    assert (closed["value"], closed["closed_value"], closed["in_progress"]) == (3.0, 3.0, False)


def test_a_missing_bucket_leaves_only_a_partial_value_and_a_real_zero_stays_zero() -> None:
    partial = series_total(_series(1.0, None, 2.0, partial={1: 0.4}))
    assert (partial["value"], partial["closed_value"], partial["partial_value"]) == (None, None, 3.4)
    assert (partial["status"], partial["complete"], partial["reason"]) == ("partial_data", False, "partial_data")
    zero = series_total(_series(0.0, 0.0, 0.0))
    assert (zero["value"], zero["status"]) == (0.0, "complete")
    # A single bucket in progress with nothing compiled yet has no total so far.
    empty = series_total(_series(None, in_progress=True))
    assert (empty["value"], empty["status"]) == (None, "partial_data")
    assert "partial_value" not in empty


def test_the_summary_lists_configured_series_only_with_their_quality() -> None:
    summary = period_summary(
        {"grid_import": _series(1.0), "consumption": _series(2.0, source="derived")},
        {"production": {"reason": "no_data", "statistic_ids": ["sensor.pv"]}},
        in_progress=True,
    )
    assert list(summary) == ["production", "consumption", "grid_import"]
    assert summary["production"] == {
        "value": None, "closed_value": None, "unit": "kWh", "status": "unavailable", "complete": False,
        "in_progress": True, "in_progress_included": False, "source": "measured", "reason": "no_data",
    }
    assert summary["consumption"]["source"] == "derived"
    no_balance = period_summary({}, {"consumption": {"reason": "no_energy_meter", "statistic_ids": [], "needs": ["grid_import"]}}, in_progress=False)
    assert no_balance["consumption"]["source"] == "derived"


# --- KPIs -----------------------------------------------------------------------------------


def test_one_tolerance_band_for_every_energy_balance() -> None:
    assert BALANCE_TOLERANCE_KWH == ENERGY_TOLERANCE_KWH == 0.05
    assert energy_tolerance(0.1, 0.2) == 0.05
    assert energy_tolerance(50.0, 50.0) == pytest.approx(2.0)


@pytest.mark.parametrize(
    ("production", "export", "expected"),
    [
        (10.0, 3.0, {"value": 70.0, "status": "complete"}),
        (10.0, 0.0, {"value": 100.0, "status": "complete"}),
        (0.0, 0.0, {"value": None, "status": "unavailable", "reason": "no_solar_production"}),
        # Exported a little more than produced: timing noise within the band reads 0.
        (1.0, 1.02, {"value": 0.0, "status": "complete"}),
        (10.0, 10.15, {"value": 0.0, "status": "complete"}),
        # Beyond the band the meters disagree: no percentage.
        (1.0, 1.5, {"value": None, "status": "incoherent", "reason": "incoherent_balance"}),
        (10.0, 10.5, {"value": None, "status": "incoherent", "reason": "incoherent_balance"}),
    ],
)
def test_self_consumption_is_the_share_of_production_not_exported(production: float, export: float, expected: dict[str, Any]) -> None:
    kpi = self_consumption(_summary(production=production, grid_export=export))
    assert {key: kpi.get(key) for key in expected} == expected
    assert (kpi["unit"], kpi["source"], kpi["complete"]) == ("%", "measured", True)


def test_self_consumption_needs_both_complete_totals() -> None:
    missing = self_consumption(_summary(production=10.0, grid_export="unavailable"))
    assert (missing["value"], missing["status"], missing["reason"], missing["needs"]) == (None, "unavailable", "missing_data", ["grid_export"])
    partial = self_consumption(_summary(production=None, grid_export=1.0))
    assert (partial["value"], partial["status"], partial["reason"], partial["complete"]) == (None, "partial_data", "partial_data", False)
    # Without a grid there is no export: everything produced is used on site.
    assert self_consumption(_summary(production=4.0))["value"] == 100.0


@pytest.mark.parametrize(
    ("consumption", "imported", "expected"),
    [
        (10.0, 4.0, {"value": 60.0, "status": "complete"}),
        (10.0, 0.0, {"value": 100.0, "status": "complete"}),
        (0.0, 0.0, {"value": None, "status": "unavailable", "reason": "no_consumption"}),
        (10.0, 10.1, {"value": 0.0, "status": "complete"}),
        (10.0, 12.0, {"value": None, "status": "incoherent", "reason": "incoherent_balance"}),
    ],
)
def test_self_sufficiency_is_the_share_of_consumption_not_drawn_from_the_grid(consumption: float, imported: float, expected: dict[str, Any]) -> None:
    kpi = self_sufficiency(_summary(consumption=consumption, grid_import=imported))
    assert {key: kpi.get(key) for key in expected} == expected


def test_self_sufficiency_needs_the_consumption_and_says_where_it_comes_from() -> None:
    missing = self_sufficiency(_summary(consumption="unavailable", grid_import=2.0))
    assert (missing["status"], missing["needs"]) == ("unavailable", ["consumption"])
    summary = period_summary(
        {"consumption": _series(10.0, source="derived"), "grid_import": _series(4.0)}, {}, in_progress=False
    )
    # A derived consumption with a measured import: a deterministic calculation, not an estimate.
    assert (self_sufficiency(summary)["value"], self_sufficiency(summary)["source"]) == (60.0, "mixed")


@pytest.mark.parametrize(
    ("production", "consumption", "value", "reason"),
    [(8.0, 10.0, 80.0, None), (12.0, 10.0, 120.0, None), (5.0, 0.0, None, "no_consumption"), (0.0, 10.0, 0.0, None)],
)
def test_solar_offset_compares_production_with_consumption_and_may_exceed_100(
    production: float, consumption: float, value: float | None, reason: str | None
) -> None:
    kpi = solar_offset(_summary(production=production, consumption=consumption))
    assert (kpi["value"], kpi.get("reason")) == (value, reason)


def test_solar_offset_without_production_has_no_value() -> None:
    assert solar_offset(_summary(production="unavailable", consumption=10.0))["status"] == "unavailable"
    assert solar_offset(_summary(production=None, consumption=10.0))["status"] == "partial_data"


def test_kpis_apply_to_the_installation_and_read_so_far_while_in_progress() -> None:
    assert list(period_kpis(_summary(consumption=10.0, grid_import=4.0))) == ["self_sufficiency"]
    summary = period_summary(
        {
            "production": _series(5.0, 3.0, in_progress=True),
            "grid_export": _series(1.0, 1.0, in_progress=True),
            "consumption": _series(4.0, 2.0, in_progress=True),
            "grid_import": _series(0.0, 0.0, in_progress=True),
        },
        {},
        in_progress=True,
    )
    kpis = period_kpis(summary)
    assert list(kpis) == ["self_consumption", "self_sufficiency", "solar_offset"]
    # So far: 8 produced, 2 exported, 6 consumed.
    assert (kpis["self_consumption"]["value"], kpis["self_sufficiency"]["value"], kpis["solar_offset"]["value"]) == (75.0, 100.0, 133.3)
    assert all(kpi["in_progress"] and kpi["complete"] for kpi in kpis.values())


# --- Changes --------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("current", "previous", "absolute", "percent", "reason"),
    [
        (10.0, 10.0, 0.0, 0.0, None),
        (12.0, 10.0, 2.0, 20.0, None),
        (7.5, 10.0, -2.5, -25.0, None),
        (0.0, 0.0, 0.0, 0.0, None),
        (3.0, 0.0, 3.0, None, "no_percentage_baseline"),
        (0.0, 4.0, -4.0, -100.0, None),
    ],
)
def test_a_change_has_a_percentage_only_where_it_has_a_meaning(
    current: float, previous: float, absolute: float, percent: float | None, reason: str | None
) -> None:
    result = change(current, previous)
    assert (result["absolute_change"], result["percent_change"], result.get("reason"), result["status"]) == (absolute, percent, reason, "complete")


def test_incomplete_periods_give_no_change() -> None:
    for current, previous in ((None, 10.0), (10.0, None)):
        result = change(current, previous)
        assert (result["absolute_change"], result["percent_change"], result["status"]) == (None, None, "partial_data")


def test_the_comparison_uses_the_same_closed_positions_in_both_periods() -> None:
    current = {"production": _series(2.0, 2.0, 5.0, in_progress=True), "grid_import": _series(1.0, None, 1.0, in_progress=True)}
    previous = {"production": _series(1.0, 1.0, 9.0), "grid_import": _series(1.0, 1.0, 1.0)}
    summary = period_summary(current, {"grid_export": {"reason": "no_energy_meter", "statistic_ids": []}}, in_progress=True)
    result = comparison(current, previous, summary, buckets=2)
    assert result["buckets"] == 2
    # Today so far (5) is never set against the whole last day (9).
    assert (result["series"]["production"]["current"], result["series"]["production"]["previous"], result["series"]["production"]["percent_change"]) == (4.0, 2.0, 100.0)
    assert result["series"]["grid_import"]["status"] == "partial_data"
    assert result["series"]["grid_export"] | {} == {
        "current": None, "previous": None, "absolute_change": None, "percent_change": None, "status": "unavailable", "reason": "missing_data",
    }
    assert comparison(current, previous, summary, buckets=0)["series"]["production"]["reason"] == "no_closed_buckets"


# --- Previous period ------------------------------------------------------------------------


def test_presets_compare_with_the_same_number_of_civil_buckets_before() -> None:
    day = previous_range(_range({"range": "24h"}), ROME)
    assert (len(day.starts), day.start, day.end, day.in_progress_last) == (24, rome(2026, 10, 4, 13), rome(2026, 10, 5, 13), False)
    week = previous_range(_range({"range": "7d"}), ROME)
    assert (week.start, week.end) == (rome(2026, 9, 23), rome(2026, 9, 30))
    month = previous_range(_range({"range": "30d"}), ROME)
    assert (len(month.starts), month.start, month.end) == (30, rome(2026, 8, 8), rome(2026, 9, 7))
    year = previous_range(_range({"range": "12m"}), ROME)
    # Twelve calendar months, across the turn of the year.
    assert (year.start, year.starts[2], year.end) == (rome(2024, 11, 1), rome(2025, 1, 1), rome(2025, 11, 1))
    assert year.as_dict()["start"] == "2024-11-01T00:00:00+01:00"


def test_the_previous_period_follows_dst_on_the_local_calendar() -> None:
    later = datetime(2026, 12, 1, tzinfo=UTC)
    # The previous day of 26 October is the 25-hour day of the change to winter time.
    after_autumn = previous_range(_range({"start": "2026-10-26", "end": "2026-10-27", "bucket": "day"}, later), ROME)
    assert (after_autumn.start, after_autumn.end) == (rome(2026, 10, 25), rome(2026, 10, 26))
    assert after_autumn.end.timestamp() - after_autumn.start.timestamp() == 25 * 3600
    # The previous of the 23-hour 29 March is a 24-hour day.
    spring = previous_range(_range({"start": "2026-03-29", "end": "2026-03-30", "bucket": "day"}, later), ROME)
    assert (spring.start, spring.end) == (rome(2026, 3, 28), rome(2026, 3, 29))
    # Hours are real hours: the 25 hours of 25 October compare with the 25 hours before them.
    hours = previous_range(_range({"start": "2026-10-25T00:00", "end": "2026-10-26T00:00", "bucket": "hour"}, later), ROME)
    assert (len(hours.starts), hours.start, hours.end) == (25, rome(2026, 10, 23, 23), rome(2026, 10, 25))
    # The 24 hours after the change compare with 24 hours that hold the repeated 02:00 twice.
    after = previous_range(_range({"start": "2026-10-25T23:00", "end": "2026-10-26T23:00", "bucket": "hour"}, later), ROME)
    assert _iso(after.starts)[2:4] == ["2026-10-25T02:00:00+02:00", "2026-10-25T02:00:00+01:00"]


def test_custom_periods_compare_with_the_same_span_before() -> None:
    later = datetime(2027, 6, 1, tzinfo=UTC)
    months = previous_range(_range({"start": "2026-11-01", "end": "2027-02-01", "bucket": "month"}, later), ROME)
    assert _iso(months.starts) == ["2026-08-01T00:00:00+02:00", "2026-09-01T00:00:00+02:00", "2026-10-01T00:00:00+02:00"]
    weeks = previous_range(_range({"start": "2026-10-05", "end": "2026-10-19", "bucket": "week"}, later), ROME)
    assert (weeks.start, weeks.end) == (rome(2026, 9, 21), rome(2026, 10, 5))
    days = previous_range(_range({"start": "2026-02-27", "end": "2026-03-02", "bucket": "day"}, later), ROME)
    assert _iso(days.starts) == ["2026-02-24T00:00:00+01:00", "2026-02-25T00:00:00+01:00", "2026-02-26T00:00:00+01:00"]


# --- With the real Recorder ------------------------------------------------------------------


PLANT = {
    "grid": {"devices": [_device("grid-1", {"import_energy": ["opower:import"], "export_energy": ["opower:export"]})]},
    "solar": {"devices": [_device("solar-1", {"production_energy": ["opower:pv"]})]},
}


async def test_the_previous_period_comes_from_the_same_single_query(
    recorder_mock: Any, hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    await _setup(hass, freezer)
    # 47 closed hours: 4 Oct 13:00 to 6 Oct 11:00. The previous day produced 1 kWh an hour, this one 2.
    start = rome(2026, 10, 4, 13)
    _import(hass, "opower:pv", start, [1.0] * 24 + [2.0] * 23)
    _import(hass, "opower:export", start, [0.25] * 24 + [0.5] * 23)
    _import(hass, "opower:import", start, [0.5] * 24 + [0.0] * 22 + [None])
    await async_wait_recording_done(hass)

    with patch.object(history, "_read_statistics", side_effect=history._read_statistics) as read:
        alone = await _history(hass, PLANT, range="24h")
        result = await _history(hass, PLANT, range="24h", compare="previous")
    assert read.call_count == 2
    assert read.call_args_list[0].args[1] == rome(2026, 10, 5, 13).astimezone(UTC)
    # With the comparison the same single query starts 24 hours earlier.
    assert read.call_args_list[1].args[1] == start.astimezone(UTC)
    assert read.call_args_list[1].args[2:] == read.call_args_list[0].args[2:]
    assert alone["previous"] is None
    assert {key: alone[key] for key in ("series", "summary", "kpis")} == {key: result[key] for key in ("series", "summary", "kpis")}

    summary = result["summary"]
    assert (summary["production"]["value"], summary["production"]["in_progress"], summary["production"]["in_progress_included"]) == (46.0, True, False)
    # The import meter has no row at 11:00: no total, only what is known.
    assert (summary["grid_import"]["value"], summary["grid_import"]["partial_value"], summary["grid_import"]["status"]) == (None, 0.0, "partial_data")
    assert (summary["consumption"]["source"], summary["consumption"]["status"]) == ("derived", "partial_data")
    kpis = result["kpis"]
    assert (kpis["self_consumption"]["value"], kpis["self_consumption"]["in_progress"]) == (75.0, True)
    assert (kpis["self_sufficiency"]["status"], kpis["solar_offset"]["status"]) == ("partial_data", "partial_data")

    previous = result["previous"]
    assert previous["range"] == {"start": "2026-10-04T13:00:00+02:00", "end": "2026-10-05T13:00:00+02:00", "bucket": "hour", "timezone": "Europe/Rome"}
    assert (previous["summary"]["production"]["value"], previous["summary"]["production"]["in_progress"]) == (24.0, False)
    assert previous["summary"]["consumption"]["value"] == 30.0
    assert (previous["kpis"]["self_consumption"]["value"], previous["kpis"]["self_sufficiency"]["value"], previous["kpis"]["solar_offset"]["value"]) == (75.0, 60.0, 80.0)
    compared = previous["comparison"]
    # 23 closed hours against the same 23 hours one day earlier.
    assert compared["buckets"] == 23
    assert compared["series"]["production"] | {} == {
        "current": 46.0, "previous": 23.0, "absolute_change": 23.0, "percent_change": 100.0, "status": "complete",
    }
    assert (compared["series"]["grid_import"]["status"], compared["series"]["grid_import"]["percent_change"]) == ("partial_data", None)
    assert (result["cost"], result["range"]["start"]) == (None, "2026-10-05T13:00:00+02:00")


async def test_twelve_months_compare_with_the_year_before_in_one_query(
    recorder_mock: Any, hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    await _setup(hass, freezer)
    _import(hass, "opower:pv", rome(2025, 10, 31, 23), [1.0, 1.0])
    await async_wait_recording_done(hass)
    with patch.object(history, "_read_statistics", side_effect=history._read_statistics) as read:
        result = await _history(hass, {"solar": PLANT["solar"]}, range="12m", compare="previous")
    read.assert_called_once()
    assert read.call_args.args[1] == rome(2024, 11, 1).astimezone(UTC) and read.call_args.args[4] == "month"
    # 31 October 23:00 falls in the previous year, 1 November 00:00 in the current one.
    assert result["previous"]["summary"]["production"]["partial_value"] == 1.0
    assert result["summary"]["production"]["partial_value"] == 1.0
    assert result["previous"]["comparison"]["buckets"] == 11


async def test_a_multi_device_plant_with_comparison_still_takes_one_query(
    recorder_mock: Any, hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    await _setup(hass, freezer)
    inverters = [f"opower:inv{index}" for index in range(8)]
    for statistic_id in inverters:
        _import(hass, statistic_id, rome(2026, 10, 6, 8), [0.5, 0.25])
    for statistic_id in ("opower:a1", "opower:b1", "opower:car1"):
        _import(hass, statistic_id, rome(2026, 10, 6, 8), [1.0, 1.0])
    await async_wait_recording_done(hass)
    plant = {
        "solar": {"devices": [_device(f"solar-{index}", {"production_energy": [statistic_id]}) for index, statistic_id in enumerate(inverters, 1)]},
        "battery": {"devices": [_device("battery-1", {"charge_energy": ["opower:a1"], "discharge_energy": ["opower:b1"]})]},
        "wallbox": {"devices": [_device("wallbox-1", {"charging_energy": ["opower:car1"]})]},
    }
    with patch.object(history, "_read_statistics", side_effect=history._read_statistics) as read:
        result = await _history(
            hass, plant, include_devices=True, compare="previous", start="2026-10-06T09:00", end="2026-10-06T10:00", bucket="hour"
        )
    read.assert_called_once()
    assert len(read.call_args.args[3]) == 11
    assert result["summary"]["production"]["value"] == 2.0
    assert result["previous"]["summary"]["production"]["value"] == 4.0
    assert result["previous"]["comparison"]["series"]["production"]["percent_change"] == -50.0
    # Battery and car totals are reported as they are; no battery or car KPI exists.
    assert (result["summary"]["battery_charge"]["value"], result["summary"]["wallbox_consumption"]["value"]) == (1.0, 1.0)
    assert set(result["kpis"]) == {"self_consumption", "self_sufficiency", "solar_offset"}
    assert result["kpis"]["self_sufficiency"]["status"] == "unavailable"
    assert result["previous"]["summary"]["production"]["in_progress"] is False
