"""Period analytics of the energy history: totals, KPIs and the previous period.

Pure functions over the points History Core already built for a request:
nothing here reads the Recorder again, converts power or uses a tariff. A
missing bucket never becomes 0 in a total, and a KPI is computed only from
complete totals.

Totals. ``closed_value`` is the sum of the closed buckets; ``value`` adds the
bucket in progress when it already has energy (``in_progress_included``), so a
period that is not over reads as "so far". With any closed bucket missing both
are null and ``partial_value`` sums the energy that is known, apart from them.

KPIs, in percent of the period totals:

- ``self_consumption`` = (production − grid_export) / production: the share of
  the photovoltaic energy that was not exported. The battery is not a term:
  energy stored and used later was not exported either.
- ``self_sufficiency`` = (consumption − grid_import) / consumption: the share
  of the home consumption not drawn from the grid, whether it came from the
  panels or the battery.
- ``solar_offset`` = production / consumption: photovoltaic energy produced
  against the energy consumed in the same period. It is neither of the two
  above and can exceed 100.

A module that is not installed has no flow (its term is 0); an installed one
must have a complete total. ``wallbox_consumption`` and the battery totals are
reported as they are and enter no KPI.

The comparison with the previous period sums, in both periods, the closed
buckets at the same positions: the last bucket of a period in progress is left
out, so "today so far" is never set against a whole day.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable, Mapping, Sequence
from typing import Any

from .meters import KWH_PRECISION

# Meters are compiled independently, so totals that should balance differ by
# a little timing noise, growing with the energy flowing. The same band as the
# realtime balance (50 W or 2%, adapter.py) and the derived home consumption:
# within it a difference below zero reads 0, beyond it the figure is
# incoherent and never clamped.
ENERGY_TOLERANCE_KWH = 0.05
ENERGY_TOLERANCE_RATIO = 0.02

# Percentages are rounded to one decimal.
PERCENT_DIGITS = 1

SUMMARY_SERIES = (
    "production",
    "consumption",
    "grid_import",
    "grid_export",
    "battery_charge",
    "battery_discharge",
    "wallbox_consumption",
)


def energy_tolerance(*values: float) -> float:
    """How far below zero a balance of these energies may fall from timing noise alone."""
    return max(ENERGY_TOLERANCE_KWH, ENERGY_TOLERANCE_RATIO * sum(abs(value) for value in values))


def kwh(value: float) -> float:
    rounded = round(value, KWH_PRECISION)
    return 0.0 if rounded == 0 else rounded


def _percent(part: float, whole: float) -> float:
    rounded = round(part / whole * 100, PERCENT_DIGITS)
    return 0.0 if rounded == 0 else rounded


# --- Totals ----------------------------------------------------------------------


def _source(series_source: str) -> str:
    return "derived" if series_source == "derived" else "measured"


def series_total(series: Mapping[str, Any]) -> dict[str, Any]:
    """The period total of one series, with how complete it is."""
    points: Sequence[Mapping[str, Any]] = series["points"]
    in_progress = bool(series["in_progress_last"])
    closed = points[:-1] if in_progress else points
    current = points[-1]["value"] if in_progress and points else None
    total: dict[str, Any] = {
        "value": None,
        "closed_value": None,
        "unit": "kWh",
        "status": "partial_data",
        "complete": all(point["value"] is not None for point in closed),
        "in_progress": in_progress,
        "in_progress_included": False,
        "source": _source(series["source"]),
    }
    # A period made only of a bucket without energy yet has no total so far.
    if total["complete"] and (closed or current is not None):
        closed_value = kwh(sum(point["value"] for point in closed))
        total["closed_value"] = closed_value
        total["value"] = closed_value if current is None else kwh(closed_value + current)
        total["in_progress_included"] = current is not None
        total["status"] = "complete"
        return total
    known = [point["value"] if point["value"] is not None else point.get("partial_value") for point in points]
    present = [value for value in known if value is not None]
    if present:
        total["partial_value"] = kwh(sum(present))
    total["reason"] = "partial_data"
    return total


def unavailable_total(item: Mapping[str, Any], *, in_progress: bool, derived: bool) -> dict[str, Any]:
    """The total of a configured series without any data, with the reason History Core gave."""
    return {
        "value": None,
        "closed_value": None,
        "unit": "kWh",
        "status": "unavailable",
        "complete": False,
        "in_progress": in_progress,
        "in_progress_included": False,
        "source": "derived" if derived else "measured",
        "reason": item["reason"],
    }


def period_summary(
    series: Mapping[str, Mapping[str, Any]], unavailable: Mapping[str, Mapping[str, Any]], *, in_progress: bool
) -> dict[str, dict[str, Any]]:
    """A total for every configured series, in a stable order; absent modules have none."""
    summary: dict[str, dict[str, Any]] = {}
    for name in SUMMARY_SERIES:
        if name in series:
            summary[name] = series_total(series[name])
        elif name in unavailable:
            derived = name == "consumption" and "needs" in unavailable[name]
            summary[name] = unavailable_total(unavailable[name], in_progress=in_progress, derived=derived)
    return summary


# --- KPIs ------------------------------------------------------------------------


def _kpi(
    summary: Mapping[str, Mapping[str, Any]],
    names: Iterable[str],
    compute: Callable[[Mapping[str, float]], dict[str, Any]],
) -> dict[str, Any]:
    """A percentage of period totals; a series of a module not installed counts as 0."""
    terms = {name: summary.get(name) for name in names}
    present = {name: total for name, total in terms.items() if total is not None}
    sources = {total["source"] for total in present.values()}
    kpi: dict[str, Any] = {
        "value": None,
        "unit": "%",
        "status": "complete",
        "complete": all(total["complete"] for total in present.values()),
        "in_progress": any(total["in_progress"] for total in present.values()),
        "source": sources.pop() if len(sources) == 1 else "mixed",
    }
    missing = [name for name, total in present.items() if total["status"] == "unavailable"]
    if missing:
        return kpi | {"status": "unavailable", "reason": "missing_data", "needs": missing}
    if any(total["value"] is None for total in present.values()):
        return kpi | {"status": "partial_data", "reason": "partial_data"}
    values = {name: (total["value"] if total is not None else 0.0) for name, total in terms.items()}
    return kpi | compute(values)


def _local_share(whole: float, outside: float, zero_reason: str) -> dict[str, Any]:
    """``(whole − outside) / whole``: within the tolerance a small excess reads 0."""
    if whole <= 0:
        return {"status": "unavailable", "reason": zero_reason}
    local = whole - outside
    if local < 0:
        if -local > energy_tolerance(whole, outside):
            return {"status": "incoherent", "reason": "incoherent_balance"}
        local = 0.0
    return {"value": _percent(local, whole)}


def self_consumption(summary: Mapping[str, Mapping[str, Any]]) -> dict[str, Any]:
    return _kpi(
        summary,
        ("production", "grid_export"),
        lambda v: _local_share(v["production"], v["grid_export"], "no_solar_production"),
    )


def self_sufficiency(summary: Mapping[str, Mapping[str, Any]]) -> dict[str, Any]:
    return _kpi(
        summary,
        ("consumption", "grid_import"),
        lambda v: _local_share(v["consumption"], v["grid_import"], "no_consumption"),
    )


def solar_offset(summary: Mapping[str, Mapping[str, Any]]) -> dict[str, Any]:
    def compute(v: Mapping[str, float]) -> dict[str, Any]:
        if v["consumption"] <= 0:
            return {"status": "unavailable", "reason": "no_consumption"}
        return {"value": _percent(v["production"], v["consumption"])}

    return _kpi(summary, ("production", "consumption"), compute)


def period_kpis(summary: Mapping[str, Mapping[str, Any]]) -> dict[str, dict[str, Any]]:
    """The KPIs that apply to the installation: the solar ones only with photovoltaics."""
    kpis: dict[str, dict[str, Any]] = {}
    if "production" in summary:
        kpis["self_consumption"] = self_consumption(summary)
    if "consumption" in summary:
        kpis["self_sufficiency"] = self_sufficiency(summary)
    if "production" in summary and "consumption" in summary:
        kpis["solar_offset"] = solar_offset(summary)
    return kpis


# --- Previous period ---------------------------------------------------------------


def _aligned_total(series: Mapping[str, Any], buckets: int) -> float | None:
    values = [point["value"] for point in series["points"][:buckets]]
    return None if any(value is None for value in values) else kwh(sum(values))


def change(current: float | None, previous: float | None) -> dict[str, Any]:
    """Current against previous; a percentage only where it has a meaning."""
    result: dict[str, Any] = {
        "current": current,
        "previous": previous,
        "absolute_change": None,
        "percent_change": None,
        "status": "complete",
    }
    if current is None or previous is None:
        return result | {"status": "partial_data", "reason": "partial_data"}
    result["absolute_change"] = kwh(current - previous)
    if previous > 0:
        result["percent_change"] = _percent(current - previous, previous)
    elif current == 0:
        result["percent_change"] = 0.0
    else:
        # From nothing to something is not a percentage: never infinity.
        result["reason"] = "no_percentage_baseline"
    return result


def comparison(
    current: Mapping[str, Mapping[str, Any]],
    previous: Mapping[str, Mapping[str, Any]],
    summary: Mapping[str, Mapping[str, Any]],
    *,
    buckets: int,
) -> dict[str, Any]:
    """Each configured total against the previous period, over the same closed bucket positions."""
    series: dict[str, dict[str, Any]] = {}
    for name in summary:
        if name not in current or name not in previous:
            series[name] = change(None, None) | {"status": "unavailable", "reason": "missing_data"}
        elif buckets == 0:
            series[name] = change(None, None) | {"status": "unavailable", "reason": "no_closed_buckets"}
        else:
            series[name] = change(_aligned_total(current[name], buckets), _aligned_total(previous[name], buckets))
    return {"buckets": buckets, "series": series}
