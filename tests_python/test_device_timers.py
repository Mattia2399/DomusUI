"""Device timers: what is accepted and stored, and the switch-off inside Home Assistant."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any
from unittest.mock import patch

from freezegun.api import FrozenDateTimeFactory
import pytest

from homeassistant.auth.permissions.const import POLICY_CONTROL
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import async_fire_time_changed

from custom_components.domusos.device_timers import DeviceTimerManager
from custom_components.domusos.device_timers.models import (
    STORAGE_KEY,
    DeviceTimer,
    InvalidStoredDocumentError,
    InvalidTimerError,
    PermissionDeniedError,
    SaveFailedError,
    parse_stored_document,
    parse_timer_request,
    storage_document,
)

PLUG = "switch.presa_tv"
FAN = "fan.ventilatore"
LAMP = "light.lampada_salotto"
ADMIN = SimpleNamespace(id="a" * 32, is_admin=True)


def member(*, control: set[str] = frozenset(), read: set[str] = frozenset()) -> SimpleNamespace:
    def check_entity(entity_id: str, policy: str) -> bool:
        return entity_id in (control if policy == POLICY_CONTROL else read | control)

    return SimpleNamespace(id="b" * 32, is_admin=False, permissions=SimpleNamespace(check_entity=check_entity))


@pytest.fixture
def calls(hass: HomeAssistant) -> list[ServiceCall]:
    """Every switch-on and switch-off, in order; the states are left as they are."""
    recorded: list[ServiceCall] = []

    async def record(call: ServiceCall) -> None:
        recorded.append(call)

    for domain in ("switch", "fan", "light"):
        for service in ("turn_on", "turn_off"):
            hass.services.async_register(domain, service, record)
    return recorded


def commands(calls: list[ServiceCall]) -> list[tuple[str, str, str | None]]:
    return [(f"{call.domain}.{call.service}", call.data["entity_id"], call.context.user_id) for call in calls]


async def started(hass: HomeAssistant) -> DeviceTimerManager:
    manager = DeviceTimerManager(hass, runtime=lambda: None)
    await manager.async_setup()
    await hass.async_block_till_done()
    return manager


async def advance(hass: HomeAssistant, freezer: FrozenDateTimeFactory, minutes: float) -> None:
    freezer.tick(timedelta(minutes=minutes))
    async_fire_time_changed(hass, dt_util.utcnow())
    await hass.async_block_till_done()


# --- What is accepted and stored ------------------------------------------------------


def test_a_timer_is_for_a_plug_fan_humidifier_or_light_and_lasts_a_day_at_most() -> None:
    assert parse_timer_request("switch.tv", 15) == ("switch.tv", 15)
    assert parse_timer_request("fan.soffitto", 120) == ("fan.soffitto", 120)
    assert parse_timer_request("humidifier.bagno", 1440) == ("humidifier.bagno", 1440)
    assert parse_timer_request("light.salotto", 30) == ("light.salotto", 30)
    for entity_id in ("cover.tapparella", "climate.soggiorno", "lock.porta", "switch", "switch.TV", 3):
        with pytest.raises(InvalidTimerError) as err:
            parse_timer_request(entity_id, 15)
        assert err.value.field == "entity_id"
    for minutes in (0, 1441, 1.5, "15", True, None):
        with pytest.raises(InvalidTimerError) as err:
            parse_timer_request("switch.tv", minutes)
        assert err.value.field == "minutes"


def test_the_stored_document_round_trips_and_refuses_anything_odd() -> None:
    now = datetime(2026, 10, 27, 10, 0, tzinfo=UTC)
    timers = {PLUG: DeviceTimer.start(PLUG, 30, now, "a" * 32), FAN: DeviceTimer.start(FAN, 60, now, None)}
    document = storage_document(timers)
    assert parse_stored_document(document) == timers
    assert timers[PLUG].view() == {
        "entity_id": PLUG,
        "minutes": 30,
        "started_at": "2026-10-27T10:00:00+00:00",
        "ends_at": "2026-10-27T10:30:00+00:00",
    }
    entry = document["timers"][0]
    for bad in (
        {"timers": [entry, entry]},
        {"timers": [{**entry, "ends_at": "2026-10-27T11:00:00+00:00"}]},
        {"timers": [{**entry, "started_at": "2026-10-27T10:00:00"}]},
        {"timers": [{**entry, "user_id": "someone"}]},
        {"timers": [{**entry, "extra": 1}]},
        {"timers": {}},
        {"timers": [], "other": 1},
        [],
    ):
        with pytest.raises(InvalidStoredDocumentError):
            parse_stored_document(bad)


# --- Switching off --------------------------------------------------------------------


async def test_a_device_switches_off_when_its_timer_ends(hass: HomeAssistant, calls, freezer: FrozenDateTimeFactory) -> None:
    hass.states.async_set(PLUG, "on")
    manager = await started(hass)
    heard: list[bool] = []
    manager.async_subscribe(lambda: heard.append(True))

    state = await manager.async_set_timer(ADMIN, PLUG, 30)
    assert [timer["entity_id"] for timer in state["timers"]] == [PLUG] and state["now"]
    assert commands(calls) == [] and heard == [True]

    await advance(hass, freezer, 29)
    assert commands(calls) == []
    await advance(hass, freezer, 1)
    assert commands(calls) == [("switch.turn_off", PLUG, ADMIN.id)]
    assert manager.state_for_user(ADMIN)["timers"] == [] and len(heard) == 2
    await manager.async_shutdown()


async def test_a_device_that_is_off_is_switched_on_first(hass: HomeAssistant, calls) -> None:
    hass.states.async_set(FAN, "off")
    manager = await started(hass)
    await manager.async_set_timer(ADMIN, FAN, 15)
    assert commands(calls) == [("fan.turn_on", FAN, ADMIN.id)]
    await manager.async_shutdown()


async def test_a_light_that_is_off_is_switched_on_then_off_when_its_timer_ends(
    hass: HomeAssistant, calls, freezer: FrozenDateTimeFactory
) -> None:
    hass.states.async_set(LAMP, "off")
    manager = await started(hass)
    await manager.async_set_timer(ADMIN, LAMP, 15)
    assert commands(calls) == [("light.turn_on", LAMP, ADMIN.id)]
    # The light came on: Home Assistant would say so.
    hass.states.async_set(LAMP, "on")
    await hass.async_block_till_done()
    await advance(hass, freezer, 15)
    assert commands(calls) == [("light.turn_on", LAMP, ADMIN.id), ("light.turn_off", LAMP, ADMIN.id)]
    assert manager.state_for_user(ADMIN)["timers"] == []
    await manager.async_shutdown()


async def test_a_cancelled_light_timer_leaves_the_light_on(hass: HomeAssistant, calls, freezer: FrozenDateTimeFactory) -> None:
    hass.states.async_set(LAMP, "on")
    manager = await started(hass)
    await manager.async_set_timer(ADMIN, LAMP, 30)
    assert (await manager.async_cancel_timer(ADMIN, LAMP))["timers"] == []
    await advance(hass, freezer, 31)
    assert commands(calls) == []
    await manager.async_shutdown()


async def test_a_light_switched_off_by_hand_ends_its_timer(hass: HomeAssistant, calls, freezer: FrozenDateTimeFactory) -> None:
    hass.states.async_set(LAMP, "on")
    manager = await started(hass)
    await manager.async_set_timer(ADMIN, LAMP, 30)
    hass.states.async_set(LAMP, "off")
    await hass.async_block_till_done()
    assert manager.state_for_user(ADMIN)["timers"] == []
    await advance(hass, freezer, 31)
    assert commands(calls) == []
    await manager.async_shutdown()


async def test_a_new_timer_replaces_the_old_one(hass: HomeAssistant, calls, freezer: FrozenDateTimeFactory) -> None:
    hass.states.async_set(PLUG, "on")
    manager = await started(hass)
    await manager.async_set_timer(ADMIN, PLUG, 15)
    await manager.async_set_timer(ADMIN, PLUG, 60)
    await advance(hass, freezer, 30)
    assert commands(calls) == []
    assert [timer["minutes"] for timer in manager.state_for_user(ADMIN)["timers"]] == [60]
    await advance(hass, freezer, 30)
    assert commands(calls) == [("switch.turn_off", PLUG, ADMIN.id)]
    await manager.async_shutdown()


async def test_switched_off_another_way_or_cancelled_the_timer_is_gone(
    hass: HomeAssistant, calls, freezer: FrozenDateTimeFactory
) -> None:
    hass.states.async_set(PLUG, "on")
    hass.states.async_set(FAN, "on")
    manager = await started(hass)
    await manager.async_set_timer(ADMIN, PLUG, 30)
    await manager.async_set_timer(ADMIN, FAN, 30)

    hass.states.async_set(PLUG, "off")
    await hass.async_block_till_done()
    remaining = await manager.async_cancel_timer(ADMIN, FAN)
    assert remaining["timers"] == []
    # Cancelling again is not an error.
    assert (await manager.async_cancel_timer(ADMIN, FAN))["timers"] == []

    await advance(hass, freezer, 31)
    assert commands(calls) == []
    await manager.async_shutdown()


async def test_timers_survive_a_restart_and_one_that_ended_meanwhile_switches_off(
    hass: HomeAssistant, calls, freezer: FrozenDateTimeFactory
) -> None:
    hass.states.async_set(PLUG, "on")
    hass.states.async_set(FAN, "on")
    first = await started(hass)
    await first.async_set_timer(ADMIN, PLUG, 15)
    await first.async_set_timer(ADMIN, FAN, 120)
    await first.async_shutdown()

    freezer.tick(timedelta(minutes=30))
    second = await started(hass)
    assert commands(calls) == [("switch.turn_off", PLUG, ADMIN.id)]
    assert [timer["entity_id"] for timer in second.state_for_user(ADMIN)["timers"]] == [FAN]
    await advance(hass, freezer, 90)
    assert commands(calls)[-1] == ("fan.turn_off", FAN, ADMIN.id)
    await second.async_shutdown()


async def test_an_unreadable_store_starts_empty_and_takes_new_timers(hass: HomeAssistant, hass_storage: dict[str, Any], calls) -> None:
    hass_storage[STORAGE_KEY] = {"version": 1, "key": STORAGE_KEY, "data": {"timers": "nonsense"}}
    hass.states.async_set(PLUG, "on")
    manager = await started(hass)
    assert manager.state_for_user(ADMIN)["timers"] == []
    await manager.async_set_timer(ADMIN, PLUG, 15)
    assert parse_stored_document(hass_storage[STORAGE_KEY]["data"]).keys() == {PLUG}
    await manager.async_shutdown()


async def test_a_failed_write_sets_no_timer(hass: HomeAssistant, calls) -> None:
    hass.states.async_set(PLUG, "on")
    manager = await started(hass)
    with patch.object(manager.store, "async_save", side_effect=OSError("disk full")), pytest.raises(SaveFailedError):
        await manager.async_set_timer(ADMIN, PLUG, 15)
    assert manager.state_for_user(ADMIN)["timers"] == []
    await manager.async_shutdown()


# --- Who may --------------------------------------------------------------------------


async def test_only_an_account_that_controls_the_device_sets_its_timer(hass: HomeAssistant, calls) -> None:
    hass.states.async_set(PLUG, "on")
    hass.states.async_set(FAN, "on")
    manager = await started(hass)
    viewer = member(read={PLUG})
    with pytest.raises(PermissionDeniedError):
        await manager.async_set_timer(viewer, PLUG, 15)
    with pytest.raises(PermissionDeniedError):
        await manager.async_set_timer(None, PLUG, 15)

    controller = member(control={FAN})
    await manager.async_set_timer(controller, FAN, 15)
    await manager.async_set_timer(ADMIN, PLUG, 15)
    # Each account sees the timers of the devices it can read, never who set them.
    assert [timer["entity_id"] for timer in manager.state_for_user(controller)["timers"]] == [FAN]
    assert [timer["entity_id"] for timer in manager.state_for_user(viewer)["timers"]] == [PLUG]
    assert all("user_id" not in timer for timer in manager.state_for_user(ADMIN)["timers"])
    with pytest.raises(PermissionDeniedError):
        await manager.async_cancel_timer(viewer, PLUG)
    await manager.async_shutdown()


async def test_a_device_that_is_not_in_home_assistant_has_no_timer(hass: HomeAssistant, calls) -> None:
    manager = await started(hass)
    with pytest.raises(InvalidTimerError) as err:
        await manager.async_set_timer(ADMIN, "switch.missing", 15)
    assert err.value.field == "entity_id"
    await manager.async_shutdown()
