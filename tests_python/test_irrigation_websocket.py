"""Authenticated websocket contract tests for Domus Core Irrigation."""

from unittest.mock import AsyncMock

from homeassistant.core import HomeAssistant

from custom_components.domusos.const import DOMAIN
from custom_components.domusos.irrigation.api import async_register_irrigation_api
from custom_components.domusos.irrigation.manager import IrrigationManager


async def test_get_config_and_subscription_are_available_to_authenticated_clients(
    hass: HomeAssistant, hass_ws_client
) -> None:
    manager = IrrigationManager(hass)
    manager.store.async_load = AsyncMock(return_value=None)
    manager.store.async_save = AsyncMock()
    await manager.async_setup()
    hass.data.setdefault(DOMAIN, {})["irrigation_manager"] = manager
    await async_register_irrigation_api(hass)

    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "domusos/irrigation/get_config"})
    response = await client.receive_json()
    assert response["success"]
    assert response["result"]["schema"] == "domusos-irrigation"
    assert response["result"]["mode"] == "stopped"

    await client.send_json_auto_id(
        {"type": "domusos/irrigation/prepare_legacy_removal"}
    )
    prepared = await client.receive_json()
    assert prepared["success"]
    assert prepared["result"]["legacyAutomations"] == []

    await client.send_json_auto_id({"type": "domusos/irrigation/subscribe"})
    subscribed = await client.receive_json()
    initial = await client.receive_json()
    assert subscribed["success"]
    assert initial["type"] == "event"
    assert initial["event"]["available"] is True

    await manager.async_shutdown()
