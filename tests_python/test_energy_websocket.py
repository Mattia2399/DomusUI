"""Admin websocket contract for Energy discovery and profile confirmation."""

from unittest.mock import AsyncMock

from homeassistant.core import HomeAssistant

from custom_components.domusos.const import DOMAIN
from custom_components.domusos.energy.api import async_register_energy_api
from custom_components.domusos.energy.manager import EnergyProfileManager

POWER = {"device_class": "power", "state_class": "measurement", "unit_of_measurement": "kW"}


async def _setup(hass: HomeAssistant) -> EnergyProfileManager:
    manager = EnergyProfileManager(hass)
    manager.store.async_load = AsyncMock(return_value=None)
    manager.store.async_save = AsyncMock()
    await manager.async_setup()
    hass.data.setdefault(DOMAIN, {})["energy_manager"] = manager
    await async_register_energy_api(hass)
    return manager


async def test_admin_can_discover_confirm_and_correct_profile(
    hass: HomeAssistant, hass_ws_client
) -> None:
    manager = await _setup(hass)
    hass.states.async_set("sensor.solar_power", "1.5", POWER)
    client = await hass_ws_client(hass)

    await client.send_json_auto_id({"type": "domusos/energy/discover"})
    discovered = await client.receive_json()
    assert discovered["success"]
    assert discovered["result"]["proposals"]["solar"]["production_power"][0][
        "entity_id"
    ] == "sensor.solar_power"
    manager.store.async_save.assert_not_awaited()

    await client.send_json_auto_id({"type": "domusos/energy/get_profile"})
    initial = await client.receive_json()
    assert initial["result"]["profile"]["revision"] == 0
    assert initial["result"]["module_status"]["solar"] == "absent"

    await client.send_json_auto_id(
        {
            "type": "domusos/energy/save_profile",
            "expected_revision": 0,
            "profile": {
                "modules": {"solar": {"sensors": {"production_power": "sensor.solar_power"}}}
            },
        }
    )
    saved = await client.receive_json()
    assert saved["success"]
    assert saved["result"]["profile"]["revision"] == 1
    assert saved["result"]["module_status"]["solar"] == "online"
    assert saved["result"]["module_status"]["battery"] == "absent"

    await client.send_json_auto_id(
        {
            "type": "domusos/energy/save_profile",
            "expected_revision": 0,
            "profile": {"modules": {}},
        }
    )
    conflict = await client.receive_json()
    assert not conflict["success"]
    assert conflict["error"]["code"] == "revision_conflict"

    await client.send_json_auto_id(
        {
            "type": "domusos/energy/save_profile",
            "expected_revision": 1,
            "profile": {"modules": {"grid": {"sensors": {"net_power": "sensor.grid"}}}},
        }
    )
    invalid = await client.receive_json()
    assert not invalid["success"]
    assert invalid["error"]["code"] == "invalid_profile"
    assert manager.profile.revision == 1

    await manager.async_shutdown()


async def test_energy_commands_require_admin(
    hass: HomeAssistant, hass_ws_client, hass_read_only_access_token: str
) -> None:
    manager = await _setup(hass)
    client = await hass_ws_client(hass, hass_read_only_access_token)

    for command in ("discover", "get_profile"):
        await client.send_json_auto_id({"type": f"domusos/energy/{command}"})
        response = await client.receive_json()
        assert not response["success"]
        assert response["error"]["code"] == "unauthorized"

    await manager.async_shutdown()


async def test_profile_commands_report_unavailable_energy(
    hass: HomeAssistant, hass_ws_client
) -> None:
    await async_register_energy_api(hass)
    client = await hass_ws_client(hass)

    await client.send_json_auto_id({"type": "domusos/energy/get_profile"})
    response = await client.receive_json()

    assert not response["success"]
    assert response["error"]["code"] == "energy_unavailable"


async def test_state_is_readable_by_any_user_and_never_invents_modules(
    hass: HomeAssistant, hass_ws_client, hass_read_only_access_token: str
) -> None:
    manager = await _setup(hass)
    client = await hass_ws_client(hass, hass_read_only_access_token)

    await client.send_json_auto_id({"type": "domusos/energy/get_state"})
    empty = await client.receive_json()
    assert empty["success"]
    assert empty["result"]["configured"] is False
    assert empty["result"]["modules"] == {}
    assert empty["result"]["home_consumption"] is None
    assert set(empty["result"]["absent_modules"]) == {
        "grid",
        "solar",
        "home",
        "battery",
        "wallbox",
    }

    hass.states.async_set("sensor.solar_power", "1.5", POWER)
    hass.states.async_set("sensor.grid_power", "unavailable", {})
    await manager.async_save_profile(
        {
            "modules": {
                "solar": {"sensors": {"production_power": "sensor.solar_power"}},
                "grid": {
                    "sensors": {"net_power": "sensor.grid_power"},
                    "sign_convention": "positive_import",
                },
            }
        },
        0,
    )

    await client.send_json_auto_id({"type": "domusos/energy/get_state"})
    configured = await client.receive_json()
    result = configured["result"]
    assert result["configured"] is True
    assert set(result["modules"]) == {"grid", "solar"}
    assert result["offline_modules"] == ["grid"]
    assert result["modules"]["grid"]["status"] == "offline"
    solar = result["modules"]["solar"]["quantities"]["production_power"]
    assert solar == {
        "status": "ok",
        "value": 1500.0,
        "unit": "W",
        "source": "measured",
        "entity_ids": ["sensor.solar_power"],
        "reason": None,
    }
    assert result["home_consumption"]["status"] == "unavailable"
    assert result["home_consumption"]["value"] is None
    assert "battery" in result["absent_modules"]

    await manager.async_shutdown()
