"""Home Assistant action contract tests for Domus Core Irrigation."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

from homeassistant.const import STATE_OFF, STATE_ON
from homeassistant.core import HomeAssistant

from custom_components.domusos.const import DOMAIN
from custom_components.domusos.irrigation.api import async_register_irrigation_api
from custom_components.domusos.irrigation.manager import IrrigationManager


OWNER = SimpleNamespace(id="owner-1", is_admin=True, permissions=None)


def configuration() -> dict:
    return {
        "settings": {
            "maximumManualDurationMin": 30,
            "maxConcurrentZones": 1,
            "parallelSafetyAcknowledged": False,
            "rainSensorEnabled": False,
            "rainSensorEntityId": "",
            "blockOnRainSensorUnavailable": True,
            "rainDuringCycle": "stop_immediately",
        },
        "sources": {},
        "zones": [{
            "id": "garden",
            "name": "Garden",
            "entityId": "switch.garden",
            "enabled": True,
            "days": ["mon"],
            "startTimes": ["06:00"],
            "baseDuration": 10,
            "manualDurationMin": 10,
        }],
    }


async def test_home_assistant_actions_use_the_authoritative_manager(
    hass: HomeAssistant,
) -> None:
    hass.states.async_set("switch.garden", STATE_OFF)

    async def set_switch(call) -> None:
        hass.states.async_set(
            "switch.garden", STATE_ON if call.service == "turn_on" else STATE_OFF
        )

    hass.services.async_register("switch", "turn_on", set_switch)
    hass.services.async_register("switch", "turn_off", set_switch)

    manager = IrrigationManager(hass)
    manager.store.async_load = AsyncMock(return_value=None)
    manager.store.async_save = AsyncMock()
    await manager.async_setup()
    hass.data.setdefault(DOMAIN, {})["irrigation_manager"] = manager
    await async_register_irrigation_api(hass)
    await manager.async_save_configuration(configuration(), None, OWNER)
    await manager.async_resume(OWNER)

    for service in (
        "start_irrigation_zone",
        "stop_irrigation_zone",
        "pause_irrigation",
        "resume_irrigation",
        "stop_all_irrigation",
    ):
        assert hass.services.has_service(DOMAIN, service)

    await hass.services.async_call(
        DOMAIN,
        "start_irrigation_zone",
        {"zone_id": "garden", "duration_min": 5, "request_id": "service-test"},
        blocking=True,
    )
    assert hass.states.get("switch.garden").state == STATE_ON
    assert manager.document["sessions"][0]["source"] == "service"

    await hass.services.async_call(
        DOMAIN, "stop_irrigation_zone", {"zone_id": "garden"}, blocking=True
    )
    assert hass.states.get("switch.garden").state == STATE_OFF
    assert manager.document["sessions"] == []

    await hass.services.async_call(DOMAIN, "pause_irrigation", {}, blocking=True)
    assert manager.document["mode"] == "paused"
    await hass.services.async_call(DOMAIN, "resume_irrigation", {}, blocking=True)
    assert manager.document["mode"] == "enabled"
    await hass.services.async_call(DOMAIN, "stop_all_irrigation", {}, blocking=True)
    assert manager.document["mode"] == "stopped"

    await manager.async_shutdown()
