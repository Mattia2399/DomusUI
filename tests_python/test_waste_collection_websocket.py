"""Authenticated websocket contract tests for waste collection."""

from unittest.mock import AsyncMock

from homeassistant.core import HomeAssistant

from custom_components.domusos.const import DOMAIN
from custom_components.domusos.waste_collection.api import (
    async_register_waste_collection_api,
)
from custom_components.domusos.waste_collection.manager import WasteCollectionManager


async def test_get_config_and_preview_are_available_to_authenticated_clients(
    hass: HomeAssistant,
    hass_ws_client,
) -> None:
    manager = WasteCollectionManager(hass)
    manager.store.async_load = AsyncMock(return_value=None)
    manager.store.async_save = AsyncMock()
    await manager.async_setup()
    hass.data.setdefault(DOMAIN, {})["waste_collection_manager"] = manager
    await async_register_waste_collection_api(hass)

    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "domusos/waste_collection/get_config"})
    response = await client.receive_json()
    assert response["success"]
    assert response["result"]["schema"] == "domusos-waste-collection"
    assert response["result"]["notifications"]["time"] == "20:00"

    await client.send_json_auto_id(
        {"type": "domusos/waste_collection/preview", "days": 7}
    )
    preview = await client.receive_json()
    assert preview["success"]
    assert preview["result"]["events"] == []
    assert preview["result"]["warnings"] == []

    await manager.async_shutdown()
