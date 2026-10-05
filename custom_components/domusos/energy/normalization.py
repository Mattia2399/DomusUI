"""Pure normalization of Home Assistant sensor states into Domus energy units.

Instantaneous power is normalized to W and state of charge to %. Cumulative
energy (Wh, kWh, ...) is a different physical quantity and is never accepted
where power is expected. Missing data is reported as unavailable, never as 0.
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime, timedelta
from types import MappingProxyType
from typing import Any

from homeassistant.const import STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.core import State

from .models import Freshness, MeasurementKind, ValueStatus

POWER_UNIT = "W"
PERCENT_UNIT = "%"

# Exact, case-sensitive symbols: "mW" and "MW" differ by nine orders of magnitude.
POWER_UNIT_FACTORS_TO_W: Mapping[str, float] = MappingProxyType(
    {
        "mW": 0.001,
        "W": 1.0,
        "kW": 1_000.0,
        "MW": 1_000_000.0,
        "GW": 1_000_000_000.0,
        "TW": 1_000_000_000_000.0,
        "BTU/h": 0.29307107,
    }
)
ENERGY_UNITS = frozenset(
    {
        "mWh",
        "Wh",
        "kWh",
        "MWh",
        "GWh",
        "TWh",
        "J",
        "kJ",
        "MJ",
        "GJ",
        "cal",
        "kcal",
        "Mcal",
        "Gcal",
    }
)
CUMULATIVE_STATE_CLASSES = frozenset({"total", "total_increasing"})
ENERGY_DEVICE_CLASSES = frozenset({"energy", "energy_storage"})
COMPATIBLE_DEVICE_CLASSES: Mapping[MeasurementKind, str] = MappingProxyType(
    {
        MeasurementKind.POWER: "power",
        MeasurementKind.STATE_OF_CHARGE: "battery",
    }
)
VALUE_PRECISION = 3

# Inverters report a few watts below zero at night (standby draw, offset, meter
# noise). Within this band a production reading is 0 W; beyond it the reading
# stays invalid, so a reversed sign or a wiring error is never hidden.
NEGATIVE_NOISE_TOLERANCE_W = 50.0

# A valid value turns stale once its integration has not reported it for this
# long. Home Assistant refreshes ``last_reported`` on every write, unchanged
# values included, so a polling integration never trips it; the windows are
# generous so that sensors reporting only on change are not flagged while a
# load is steady. Stale values are kept and labelled, never turned into zero.
STALE_AFTER: Mapping[MeasurementKind, timedelta] = MappingProxyType(
    {
        MeasurementKind.POWER: timedelta(minutes=30),
        # State of charge moves slowly and many batteries report it on change.
        MeasurementKind.STATE_OF_CHARGE: timedelta(hours=3),
    }
)


@dataclass(frozen=True, slots=True)
class Reading:
    """One normalized sensor reading with an explicit availability status."""

    entity_id: str
    kind: MeasurementKind
    status: ValueStatus
    value: float | None = None
    reason: str | None = None
    source_unit: str | None = None
    observed_at: datetime | None = None
    # Last time the integration wrote the state, even with an unchanged value.
    reported_at: datetime | None = None
    freshness: Freshness | None = None

    @property
    def ok(self) -> bool:
        """Return whether the reading carries a valid value."""
        return self.status is ValueStatus.OK

    @property
    def stale_after(self) -> timedelta:
        """Return how long this kind of value stays fresh without a report."""
        return STALE_AFTER[self.kind]

    @property
    def unit(self) -> str:
        """Return the normalized unit."""
        return PERCENT_UNIT if self.kind is MeasurementKind.STATE_OF_CHARGE else POWER_UNIT

    def as_dict(self) -> dict[str, Any]:
        """Return a JSON-compatible representation."""
        return {
            "entity_id": self.entity_id,
            "status": self.status.value,
            "value": self.value,
            "unit": self.unit,
            "reason": self.reason,
            "source_unit": self.source_unit,
            "observed_at": self.observed_at.isoformat() if self.observed_at else None,
            "reported_at": self.reported_at.isoformat() if self.reported_at else None,
            "freshness": self.freshness.value if self.freshness else None,
        }


def normalize_state(
    entity_id: str,
    state: State | None,
    kind: MeasurementKind,
    *,
    signed: bool = False,
    negative_noise: bool = False,
    now: datetime | None = None,
) -> Reading:
    """Normalize one state, refusing ambiguous, cumulative or malformed data.

    With ``now`` a valid reading also carries its freshness.
    """
    if state is None:
        return Reading(entity_id, kind, ValueStatus.UNAVAILABLE, reason="entity_missing")

    observed_at = state.last_updated
    if state.state == STATE_UNAVAILABLE:
        return Reading(
            entity_id,
            kind,
            ValueStatus.UNAVAILABLE,
            reason="state_unavailable",
            observed_at=observed_at,
        )
    if state.state == STATE_UNKNOWN:
        return Reading(
            entity_id,
            kind,
            ValueStatus.UNAVAILABLE,
            reason="state_unknown",
            observed_at=observed_at,
        )

    attributes = state.attributes
    unit = attributes.get("unit_of_measurement")
    unit = unit if isinstance(unit, str) and unit else None
    device_class = attributes.get("device_class")
    state_class = attributes.get("state_class")

    def invalid(reason: str) -> Reading:
        return Reading(
            entity_id,
            kind,
            ValueStatus.INVALID,
            reason=reason,
            source_unit=unit,
            observed_at=observed_at,
        )

    if (
        unit in ENERGY_UNITS
        or device_class in ENERGY_DEVICE_CLASSES
        or (kind is MeasurementKind.POWER and state_class in CUMULATIVE_STATE_CLASSES)
    ):
        return invalid("cumulative_energy")
    if device_class is not None and device_class != COMPATIBLE_DEVICE_CLASSES[kind]:
        return invalid("incompatible_device_class")

    try:
        raw_value = float(state.state)
    except (TypeError, ValueError):
        return invalid("non_numeric")
    if not math.isfinite(raw_value):
        return invalid("non_finite")

    if unit is None:
        return invalid("unit_missing")

    if kind is MeasurementKind.POWER:
        factor = POWER_UNIT_FACTORS_TO_W.get(unit)
        if factor is None:
            return invalid("unsupported_unit")
        value = raw_value * factor
        if value < 0 and not signed:
            if not negative_noise or value < -NEGATIVE_NOISE_TOLERANCE_W:
                return invalid("unexpected_negative")
            value = 0.0
    else:
        if unit != PERCENT_UNIT:
            return invalid("unsupported_unit")
        if not 0 <= raw_value <= 100:
            return invalid("out_of_range")
        value = raw_value

    reported_at = getattr(state, "last_reported", None) or observed_at
    freshness: Freshness | None = None
    if now is not None and reported_at is not None:
        freshness = (
            Freshness.STALE if now - reported_at > STALE_AFTER[kind] else Freshness.FRESH
        )
    return Reading(
        entity_id,
        kind,
        ValueStatus.OK,
        value=clean_value(value),
        source_unit=unit,
        observed_at=observed_at,
        reported_at=reported_at,
        freshness=freshness,
    )


def clean_value(value: float) -> float:
    """Remove float conversion noise and negative zero."""
    rounded = round(value, VALUE_PRECISION)
    return 0.0 if rounded == 0 else rounded
