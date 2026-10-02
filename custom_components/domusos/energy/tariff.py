"""Electricity tariff configuration and Italian ARERA time bands.

The tariff only describes prices the user entered from their contract. Costs
are never estimated here: they require energy history, which Energy Core does
not collect yet. The current band and its price are pure functions of time.
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from enum import StrEnum
from types import MappingProxyType
from typing import Any

from .models import EnergyValidationError


class TariffScheme(StrEnum):
    """Price structure of the supply contract."""

    SINGLE = "single"
    TWO_BAND = "two_band"
    THREE_BAND = "three_band"


PRICE_KEYS: Mapping[TariffScheme, tuple[str, ...]] = MappingProxyType(
    {
        TariffScheme.SINGLE: ("single",),
        TariffScheme.TWO_BAND: ("f1", "f23"),
        TariffScheme.THREE_BAND: ("f1", "f2", "f3"),
    }
)
TARIFF_KEYS = frozenset({"scheme", "prices", "fixed_monthly", "vat_percent", "export_price"})
MAX_ENERGY_PRICE = 10.0  # EUR/kWh
MAX_FIXED_MONTHLY = 10_000.0  # EUR/month

# National holidays with a fixed date (month, day); Easter Monday is computed.
FIXED_HOLIDAYS = frozenset(
    {(1, 1), (1, 6), (4, 25), (5, 1), (6, 2), (8, 15), (11, 1), (12, 8), (12, 25), (12, 26)}
)


@dataclass(frozen=True, slots=True)
class EnergyTariff:
    """Validated electricity tariff in EUR."""

    scheme: TariffScheme
    prices: Mapping[str, float] = field(default_factory=dict)
    fixed_monthly: float | None = None
    vat_percent: float | None = None
    export_price: float | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "prices", MappingProxyType(dict(self.prices)))

    def as_document(self) -> dict[str, Any]:
        """Return the JSON-compatible stored representation."""
        return {
            "scheme": self.scheme.value,
            "prices": dict(self.prices),
            "fixed_monthly": self.fixed_monthly,
            "vat_percent": self.vat_percent,
            "export_price": self.export_price,
        }

    def price_for(self, band: str) -> tuple[str, float]:
        """Return the contract band label and its price for an ARERA band."""
        if self.scheme is TariffScheme.SINGLE:
            return "Monoraria", self.prices["single"]
        if self.scheme is TariffScheme.TWO_BAND:
            return ("F1", self.prices["f1"]) if band == "F1" else ("F23", self.prices["f23"])
        return band, self.prices[band.lower()]


def _number(raw: Any, field_name: str, maximum: float, *, optional: bool) -> float | None:
    if raw is None and optional:
        return None
    if isinstance(raw, bool) or not isinstance(raw, (int, float)) or not math.isfinite(raw):
        raise EnergyValidationError(f"{field_name} must be a number")
    if not 0 <= raw <= maximum:
        raise EnergyValidationError(f"{field_name} must be between 0 and {maximum:g}")
    return round(float(raw), 6)


def parse_tariff(raw: Any) -> EnergyTariff | None:
    """Strictly validate a tariff document; ``None`` means no tariff."""
    if raw is None:
        return None
    if not isinstance(raw, Mapping):
        raise EnergyValidationError("The tariff must be an object")
    unknown = set(raw) - TARIFF_KEYS
    if unknown:
        raise EnergyValidationError(f"Unknown tariff keys: {', '.join(sorted(map(str, unknown)))}")
    try:
        scheme = TariffScheme(raw.get("scheme"))
    except ValueError as err:
        raise EnergyValidationError("Unknown tariff scheme") from err
    prices = raw.get("prices")
    if not isinstance(prices, Mapping) or set(prices) != set(PRICE_KEYS[scheme]):
        raise EnergyValidationError(
            f"Tariff {scheme.value} needs exactly the prices: {', '.join(PRICE_KEYS[scheme])}"
        )
    return EnergyTariff(
        scheme=scheme,
        prices={
            key: _number(prices[key], f"Price {key}", MAX_ENERGY_PRICE, optional=False)
            for key in PRICE_KEYS[scheme]
        },
        fixed_monthly=_number(raw.get("fixed_monthly"), "Fixed monthly fee", MAX_FIXED_MONTHLY, optional=True),
        vat_percent=_number(raw.get("vat_percent"), "VAT", 100.0, optional=True),
        export_price=_number(raw.get("export_price"), "Export price", MAX_ENERGY_PRICE, optional=True),
    )


def easter_sunday(year: int) -> date:
    """Gregorian Easter Sunday (anonymous algorithm)."""
    a = year % 19
    b, c = divmod(year, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month, day = divmod(h + l - 7 * m + 114, 31)
    return date(year, month, day + 1)


def is_national_holiday(day: date) -> bool:
    """Return whether a day is an Italian national holiday."""
    return (day.month, day.day) in FIXED_HOLIDAYS or day == easter_sunday(day.year) + timedelta(days=1)


def arera_band(moment: datetime) -> str:
    """Return the ARERA band (F1, F2, F3) for a local wall-clock time."""
    if moment.weekday() == 6 or is_national_holiday(moment.date()):
        return "F3"
    if moment.hour < 7 or moment.hour >= 23:
        return "F3"
    if moment.weekday() == 5:
        return "F2"
    return "F1" if 8 <= moment.hour < 19 else "F2"


def tariff_state(tariff: EnergyTariff | None, now: datetime) -> dict[str, Any] | None:
    """Return the live tariff summary shown on the Energy page."""
    if tariff is None:
        return None
    band = arera_band(now)
    label, price = tariff.price_for(band)
    return {
        "scheme": tariff.scheme.value,
        "band": band,
        "band_label": label,
        "price": price,
        "export_price": tariff.export_price,
        "currency": "EUR",
    }
