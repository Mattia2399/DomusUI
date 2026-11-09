"""Device timers websocket contract: set, see, follow and cancel a timer."""

from __future__ import annotations

from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import async_mock_service

from custom_components.domusos.const import DOMAIN
from custom_components.domusos.device_timers import DATA_DEVICE_TIMER_MANAGER, DeviceTimerManager
from custom_components.domusos.device_timers.api import async_register_device_timers_api

PLUG = "switch.presa_tv"


async def registered(hass: HomeAssistant) -> DeviceTimerManager:
    hass.states.async_set(PLUG, "on")
    async_mock_service(hass, "switch", "turn_on")
    async_mock_service(hass, "switch", "turn_off")
    manager = DeviceTimerManager(hass, runtime=lambda: None)
    await manager.async_setup()
    hass.data.setdefault(DOMAIN, {})[DATA_DEVICE_TIMER_MANAGER] = manager
    await async_register_device_timers_api(hass)
    return manager


async def test_a_client_sets_follows_and_cancels_a_timer(hass: HomeAssistant, hass_ws_client) -> None:
    manager = await registered(hass)
    client = await hass_ws_client(hass)

    await client.send_json_auto_id({"type": "domusos/device_timers/subscribe"})
    subscribed = await client.receive_json()
    assert subscribed["success"]
    first = await client.receive_json()
    assert first["type"] == "event" and first["event"]["timers"] == []

    await client.send_json_auto_id({"type": "domusos/device_timers/set_timer", "entity_id": PLUG, "minutes": 30})
    replies = [await client.receive_json(), await client.receive_json()]
    pushed = next(reply for reply in replies if reply["type"] == "event")
    result = next(reply for reply in replies if reply["type"] == "result")
    assert result["success"] and [timer["minutes"] for timer in result["result"]["timers"]] == [30]
    assert pushed["event"]["timers"] == result["result"]["timers"]

    await client.send_json_auto_id({"type": "domusos/device_timers/get_state"})
    state = await client.receive_json()
    assert state["success"] and state["result"]["timers"][0]["entity_id"] == PLUG

    await client.send_json_auto_id({"type": "domusos/device_timers/cancel_timer", "entity_id": PLUG})
    replies = [await client.receive_json(), await client.receive_json()]
    cancelled = next(reply for reply in replies if reply["type"] == "result")
    assert cancelled["success"] and cancelled["result"]["timers"] == []
    assert next(reply for reply in replies if reply["type"] == "event")["event"]["timers"] == []
    await manager.async_shutdown()


async def test_refusals_carry_a_stable_code(hass: HomeAssistant, hass_ws_client) -> None:
    manager = await registered(hass)
    client = await hass_ws_client(hass)

    await client.send_json_auto_id({"type": "domusos/device_timers/set_timer", "entity_id": "cover.tapparella", "minutes": 30})
    cover = await client.receive_json()
    assert not cover["success"] and cover["error"]["code"] == "invalid_timer"

    await client.send_json_auto_id({"type": "domusos/device_timers/set_timer", "entity_id": PLUG, "minutes": 0})
    zero = await client.receive_json()
    assert not zero["success"] and zero["error"]["code"] == "invalid_timer"

    await manager.async_shutdown()
    hass.data[DOMAIN].pop(DATA_DEVICE_TIMER_MANAGER)
    await client.send_json_auto_id({"type": "domusos/device_timers/get_state"})
    gone = await client.receive_json()
    assert not gone["success"] and gone["error"]["code"] == "device_timers_unavailable"
