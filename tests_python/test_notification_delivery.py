"""Delivery adapter against real Home Assistant notify services and entities.

Runs on Home Assistant 2025.1 and 2026.2.3: the service shapes and the
blocking semantics checked here are the ones the router relies on.
"""

import asyncio

import pytest
from homeassistant.const import STATE_UNAVAILABLE
from homeassistant.core import HomeAssistant

from custom_components.domusos.notifications.delivery import DeliveryOutcome, async_send_target
from custom_components.domusos.profile.targets import EntityTarget, LegacyServiceTarget

from notification_support import add_notify_entity, register_phone


async def test_legacy_service_gets_message_and_title_and_waits(hass: HomeAssistant) -> None:
    phone = register_phone(hass, "user-1", "Pixel 8")

    outcome = await async_send_target(hass, LegacyServiceTarget(phone.service), "Paper tonight", "Domus")

    assert outcome is DeliveryOutcome.DELIVERED
    # Blocking: the handler already ran when the call returned.
    assert phone.calls == [{"message": "Paper tonight", "title": "Domus"}]


async def test_legacy_service_without_title_sends_only_the_message(hass: HomeAssistant) -> None:
    phone = register_phone(hass, "user-1", "Pixel 8")

    assert await async_send_target(hass, LegacyServiceTarget(phone.service), "Paper tonight") is DeliveryOutcome.DELIVERED
    assert phone.calls == [{"message": "Paper tonight"}]


async def test_notify_entity_uses_send_message_on_that_entity(hass: HomeAssistant) -> None:
    phone = register_phone(hass, "user-1", "Pixel 8", legacy_service=False)
    entity_id = await add_notify_entity(hass, phone, title=True)
    other = register_phone(hass, "user-2", "Tablet", legacy_service=False)
    await add_notify_entity(hass, other, title=True)

    outcome = await async_send_target(hass, EntityTarget(entity_id), "Paper tonight", "Domus")

    assert outcome is DeliveryOutcome.DELIVERED
    assert phone.calls == [{"message": "Paper tonight", "title": "Domus"}]
    assert other.calls == []
    # NotifyEntity records the time of the last notification as its state.
    assert hass.states.get(entity_id).state not in (None, "unknown", STATE_UNAVAILABLE)


async def test_notify_entity_without_title_support_drops_the_title_itself(hass: HomeAssistant) -> None:
    phone = register_phone(hass, "user-1", "Pixel 8", legacy_service=False)
    entity_id = await add_notify_entity(hass, phone, title=False)

    assert await async_send_target(hass, EntityTarget(entity_id), "Paper tonight", "Domus") is DeliveryOutcome.DELIVERED
    assert phone.calls == [{"message": "Paper tonight", "title": None}]


async def test_a_vanished_entity_is_not_reported_as_delivered(hass: HomeAssistant) -> None:
    # Home Assistant silently skips missing or unavailable entities in entity services.
    phone = register_phone(hass, "user-1", "Pixel 8", legacy_service=False)
    entity_id = await add_notify_entity(hass, phone)
    hass.states.async_set(entity_id, STATE_UNAVAILABLE)

    assert await async_send_target(hass, EntityTarget(entity_id), "x") is DeliveryOutcome.TARGET_UNAVAILABLE
    assert await async_send_target(hass, EntityTarget("notify.never_existed"), "x") is DeliveryOutcome.TARGET_UNAVAILABLE
    assert phone.calls == []


async def test_a_service_removed_after_resolution_is_unavailable(hass: HomeAssistant) -> None:
    phone = register_phone(hass, "user-1", "Pixel 8")
    hass.services.async_remove("notify", phone.service)

    assert await async_send_target(hass, LegacyServiceTarget(phone.service), "x") is DeliveryOutcome.TARGET_UNAVAILABLE


@pytest.mark.parametrize("behaviour", ["error", "crash"])
async def test_service_errors_become_failures(hass: HomeAssistant, behaviour: str, caplog) -> None:
    phone = register_phone(hass, "user-1", "Pixel 8")
    phone.behaviour = behaviour

    assert await async_send_target(hass, LegacyServiceTarget(phone.service), "VERY_PRIVATE_MESSAGE") is DeliveryOutcome.FAILED
    # The error text echoes the payload; the log keeps only its type.
    assert "VERY_PRIVATE_MESSAGE" not in caplog.text


async def test_notify_entity_errors_become_failures(hass: HomeAssistant) -> None:
    phone = register_phone(hass, "user-1", "Pixel 8", legacy_service=False)
    entity_id = await add_notify_entity(hass, phone)
    phone.behaviour = "error"

    assert await async_send_target(hass, EntityTarget(entity_id), "x") is DeliveryOutcome.FAILED


async def test_a_hanging_service_times_out(hass: HomeAssistant) -> None:
    phone = register_phone(hass, "user-1", "Pixel 8")
    phone.behaviour = "hang"

    assert await async_send_target(hass, LegacyServiceTarget(phone.service), "x", timeout=0.05) is DeliveryOutcome.TIMEOUT


async def test_cancellation_is_never_swallowed(hass: HomeAssistant) -> None:
    phone = register_phone(hass, "user-1", "Pixel 8")
    phone.behaviour = "hang"
    task = asyncio.create_task(async_send_target(hass, LegacyServiceTarget(phone.service), "x", timeout=30))
    await asyncio.sleep(0)
    await asyncio.sleep(0)
    task.cancel()

    with pytest.raises(asyncio.CancelledError):
        await task
