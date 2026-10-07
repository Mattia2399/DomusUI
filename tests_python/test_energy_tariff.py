"""Energy tariff validation, ARERA time bands and persistence."""

from datetime import datetime
from typing import Any
from unittest.mock import AsyncMock

import pytest
from homeassistant.core import HomeAssistant

from custom_components.domusos.energy.context import async_energy_state
from custom_components.domusos.energy.manager import EnergyProfileManager
from custom_components.domusos.energy.models import EnergyValidationError, parse_profile, parse_stored_profile
from custom_components.domusos.energy.tariff import (
    TariffScheme,
    arera_band,
    easter_sunday,
    parse_tariff,
    tariff_state,
)

THREE_BAND = {
    "scheme": "three_band",
    "prices": {"f1": 0.31, "f2": 0.27, "f3": 0.22},
    "fixed_monthly": 9.5,
    "vat_percent": 10,
    "export_price": 0.09,
}
GRID = {"grid": {"sensors": {"import_power": "sensor.grid_import"}}}


def test_valid_tariff_schemes_round_trip() -> None:
    single = parse_tariff({"scheme": "single", "prices": {"single": 0.25}})
    two = parse_tariff({"scheme": "two_band", "prices": {"f1": 0.3, "f23": 0.2}, "vat_percent": None})
    three = parse_tariff(THREE_BAND)

    assert single is not None and single.scheme is TariffScheme.SINGLE
    assert two is not None and two.vat_percent is None
    assert three is not None and three.as_document() == {**THREE_BAND, "vat_percent": 10.0}
    assert parse_tariff(None) is None


@pytest.mark.parametrize(
    ("raw", "message"),
    [
        ([], "must be an object"),
        ({"scheme": "hourly", "prices": {}}, "Unknown tariff scheme"),
        ({"scheme": "two_band", "prices": {"f1": 0.3}}, "needs exactly the prices"),
        ({"scheme": "single", "prices": {"single": 0.2, "f1": 0.3}}, "needs exactly the prices"),
        ({"scheme": "single", "prices": {"single": -0.1}}, "between 0 and 10"),
        ({"scheme": "single", "prices": {"single": 12}}, "between 0 and 10"),
        ({"scheme": "single", "prices": {"single": True}}, "must be a number"),
        ({"scheme": "single", "prices": {"single": float("nan")}}, "must be a number"),
        ({"scheme": "single", "prices": {"single": 0.2}, "vat_percent": 120}, "between 0 and 100"),
        ({"scheme": "single", "prices": {"single": 0.2}, "discount": 1}, "Unknown tariff keys"),
    ],
)
def test_invalid_tariffs_are_rejected(raw: Any, message: str) -> None:
    with pytest.raises(EnergyValidationError, match=message):
        parse_tariff(raw)


@pytest.mark.parametrize(
    ("moment", "band"),
    [
        ("2026-10-05T10:00", "F1"),  # Monday
        ("2026-10-05T07:30", "F2"),
        ("2026-10-05T08:00", "F1"),
        ("2026-10-05T19:00", "F2"),
        ("2026-10-05T23:00", "F3"),
        ("2026-10-05T06:59", "F3"),
        ("2026-10-10T10:00", "F2"),  # Saturday
        ("2026-10-10T06:00", "F3"),
        ("2026-10-11T12:00", "F3"),  # Sunday
        ("2026-12-25T10:00", "F3"),  # Christmas, Friday
        ("2026-04-06T10:00", "F3"),  # Easter Monday
        ("2026-06-02T10:00", "F3"),  # Republic Day, Tuesday
    ],
)
def test_arera_bands(moment: str, band: str) -> None:
    assert arera_band(datetime.fromisoformat(moment)) == band


def test_easter_dates() -> None:
    assert easter_sunday(2026).isoformat() == "2026-04-05"
    assert easter_sunday(2027).isoformat() == "2027-03-28"


def test_two_band_contracts_group_f2_and_f3() -> None:
    tariff = parse_tariff({"scheme": "two_band", "prices": {"f1": 0.3, "f23": 0.2}})

    assert tariff_state(tariff, datetime.fromisoformat("2026-10-10T10:00"))["band_label"] == "F23"
    peak = tariff_state(tariff, datetime.fromisoformat("2026-10-05T10:00"))
    assert peak == {
        "scheme": "two_band",
        "band": "F1",
        "band_label": "F1",
        "price": 0.3,
        "export_price": None,
        "vat_percent": None,
        "currency": "EUR",
    }
    assert tariff_state(None, datetime.fromisoformat("2026-10-05T10:00")) is None


def test_stored_profile_keeps_the_tariff() -> None:
    profile = parse_profile({"modules": GRID, "tariff": THREE_BAND})
    stored = parse_stored_profile({**profile.as_document(), "revision": 2})

    assert stored.tariff == profile.tariff
    assert stored.as_document()["tariff"]["prices"] == THREE_BAND["prices"]


async def test_wizard_saves_keep_and_explicit_null_clears_the_tariff(hass: HomeAssistant) -> None:
    manager = EnergyProfileManager(hass)
    manager.store.async_load = AsyncMock(return_value=None)
    manager.store.async_save = AsyncMock()
    manager.store_v2.async_load = AsyncMock(return_value=None)
    manager.store_v2.async_save = AsyncMock()
    await manager.async_setup()

    await manager.async_save_profile({"modules": GRID, "tariff": THREE_BAND}, 0)
    assert manager.profile.tariff is not None

    await manager.async_save_profile({"modules": GRID}, 1)
    assert manager.profile.tariff is not None
    assert manager.store_v2.async_save.await_args.args[0]["tariff"]["scheme"] == "three_band"

    state = await async_energy_state(manager)
    assert state["tariff"]["band"] in {"F1", "F2", "F3"}
    assert state["tariff"]["currency"] == "EUR"

    await manager.async_save_profile({"modules": GRID, "tariff": None}, 2)
    assert manager.profile.tariff is None
    assert (await async_energy_state(manager))["tariff"] is None
    await manager.async_shutdown()


def test_state_carries_the_vat_rate_for_estimates() -> None:
    tariff = parse_tariff(
        {"scheme": "single", "prices": {"single": 0.25}, "vat_percent": 10, "export_price": 0.09}
    )

    state = tariff_state(tariff, datetime.fromisoformat("2026-10-05T10:00"))

    assert state["vat_percent"] == 10
    assert state["price"] == 0.25
    assert state["export_price"] == 0.09
