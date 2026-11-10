"""P2.5D.1 through the real Home Assistant stack: device power is refused for real (docs/access-control-enforcement.md).

A refused request never reaches its handler: no policy is read, saved, linked
or removed, no switch is touched. An administrator works as before. Every
other domain is still only observed.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest.mock import Mock, patch

import pytest
from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import async_mock_service

from custom_components.domusos.access import (
    DATA_ACCESS_MANAGER,
    AccessPolicyManager,
    instrumentation,
)
from custom_components.domusos.access.api import async_register_access_api
from custom_components.domusos.access.models import (
    SCHEMA,
    SCHEMA_VERSION,
    STORAGE_KEY,
    MigrationFailedError,
)
from custom_components.domusos.const import DOMAIN
from custom_components.domusos.core.audit import DomusAuditService
from custom_components.domusos.device_power import (
    DATA_DEVICE_POWER_MANAGER,
    DevicePowerManager,
)
from custom_components.domusos.device_power.api import async_register_device_power_api

NOW = "2026-10-23T10:00:00+00:00"
CLIENT_ID = "https://example.com/app"
BATTERY = "sensor.tablet_battery_level"
SWITCH = "switch.presa_tablet"
ADMIN_VIEW = SimpleNamespace(is_admin=True)
DEVICE_POWER = (
    "domusos/device_power/bind_policy",
    "domusos/device_power/delete_policy",
    "domusos/device_power/get_state",
    "domusos/device_power/save_policy",
)


def settings(**overrides: Any) -> dict[str, Any]:
    payload = {
        "client_id": "client-0001",
        "label": "Tablet soggiorno",
        "enabled": True,
        "battery_entity_id": BATTERY,
        "switch_entity_id": SWITCH,
        "start_threshold": 30,
        "stop_threshold": 80,
    }
    payload.update(overrides)
    return payload


def policy(assignments: dict[str, Any], **overrides: Any) -> dict[str, Any]:
    data = {
        "schema": SCHEMA,
        "version": SCHEMA_VERSION,
        "revision": 2,
        "updated_at": NOW,
        "assignments": assignments,
        "audit": [],
    }
    data.update(overrides)
    return {"version": 1, "minor_version": 1, "key": STORAGE_KEY, "data": data}


def assigned(role: str) -> dict[str, Any]:
    return {"role": role, "grants": [], "assigned_at": NOW, "assigned_by": None}


async def account(hass: HomeAssistant, name: str, group: str = "system-users") -> tuple[Any, str]:
    user = await hass.auth.async_create_user(name, group_ids=[group])
    refresh = await hass.auth.async_create_refresh_token(user, CLIENT_ID)
    return user, hass.auth.async_create_access_token(refresh)


async def domus(hass: HomeAssistant, audit: DomusAuditService | None = None) -> tuple[DevicePowerManager, AccessPolicyManager, list]:
    """Device power with its real manager, under a real access policy."""
    hass.states.async_set(BATTERY, "55", {"device_class": "battery", "unit_of_measurement": "%"})
    hass.states.async_set(SWITCH, "off")
    switched = [*async_mock_service(hass, "switch", "turn_on"), *async_mock_service(hass, "switch", "turn_off")]
    power = DevicePowerManager(hass, runtime=lambda: None)
    await power.async_setup()
    hass.data.setdefault(DOMAIN, {})[DATA_DEVICE_POWER_MANAGER] = power
    access = AccessPolicyManager(hass, runtime=(lambda: SimpleNamespace(audit=audit)) if audit else (lambda: None))
    await access.async_setup()
    hass.data[DOMAIN][DATA_ACCESS_MANAGER] = access
    await async_register_access_api(hass)
    await async_register_device_power_api(hass)
    return power, access, switched


async def ask(client, message: dict[str, Any]) -> dict[str, Any]:
    await client.send_json_auto_id(message)
    return await client.receive_json()


async def saved_policy(admin) -> dict[str, Any]:
    reply = await ask(admin, {"type": "domusos/device_power/save_policy", "policy": settings()})
    assert reply["success"], reply
    return reply["result"]["policy"]


def every_command(policy_id: str, revision: int) -> list[dict[str, Any]]:
    return [
        {"type": "domusos/device_power/get_state"},
        {"type": "domusos/device_power/save_policy", "policy": settings(client_id="client-0009")},
        {"type": "domusos/device_power/bind_policy", "policy_id": policy_id, "expected_revision": revision, "client_id": "client-0002"},
        {"type": "domusos/device_power/delete_policy", "policy_id": policy_id, "expected_revision": revision},
    ]


async def assert_refused_without_effects(client, power: DevicePowerManager, switched: list, policy_id: str, revision: int) -> None:
    before = power.state_for_user(ADMIN_VIEW)
    calls = len(switched)
    for message in every_command(policy_id, revision):
        reply = await ask(client, message)
        assert not reply["success"], message["type"]
        assert reply["error"]["code"] == "access_denied", (message["type"], reply["error"])
    # Nothing ran: the same policies, the same revisions, no switch touched.
    assert power.state_for_user(ADMIN_VIEW) == before
    assert len(switched) == calls


# --- Administrators ------------------------------------------------------------------


async def test_an_administrator_manages_device_power_as_before(hass: HomeAssistant, hass_ws_client) -> None:
    power, _, _ = await domus(hass)
    admin = await hass_ws_client(hass)
    created = await saved_policy(admin)
    linked = await ask(admin, {"type": "domusos/device_power/bind_policy", "policy_id": created["policy_id"], "expected_revision": 1, "client_id": "client-0002"})
    assert linked["success"] and linked["result"]["policy"]["client_id"] == "client-0002"
    state = await ask(admin, {"type": "domusos/device_power/get_state"})
    assert state["success"] and len(state["result"]["policies"]) == 1
    removed = await ask(admin, {"type": "domusos/device_power/delete_policy", "policy_id": created["policy_id"], "expected_revision": 2})
    assert removed["success"] and removed["result"]["policies"] == []
    await power.async_shutdown()


# --- Everyone else, directly on the websocket ------------------------------------------


async def test_a_member_calling_device_power_directly_is_refused_with_no_effect(hass: HomeAssistant, hass_ws_client) -> None:
    power, _, switched = await domus(hass)
    created = await saved_policy(await hass_ws_client(hass))
    _, token = await account(hass, "Mario")
    await assert_refused_without_effects(await hass_ws_client(hass, token), power, switched, created["policy_id"], created["revision"])
    await power.async_shutdown()


async def test_limited_panel_resident_and_read_only_accounts_are_refused(
    hass: HomeAssistant, hass_ws_client, hass_storage, hass_read_only_access_token: str
) -> None:
    child, child_token = await account(hass, "Child")
    panel, panel_token = await account(hass, "Panel")
    spouse, spouse_token = await account(hass, "Spouse")
    # A Resident has the whole house, not the administration of its devices.
    hass_storage[STORAGE_KEY] = policy(
        {child.id: assigned("restricted"), panel.id: assigned("wall_panel"), spouse.id: assigned("resident")}
    )
    power, _, switched = await domus(hass)
    created = await saved_policy(await hass_ws_client(hass))
    for token in (child_token, panel_token, spouse_token, hass_read_only_access_token):
        await assert_refused_without_effects(await hass_ws_client(hass, token), power, switched, created["policy_id"], created["revision"])
    await power.async_shutdown()


async def test_a_system_account_is_refused(hass: HomeAssistant, hass_ws_client) -> None:
    power, _, switched = await domus(hass)
    created = await saved_policy(await hass_ws_client(hass))
    system = await hass.auth.async_create_system_user("Supervisor", group_ids=["system-admin"])
    token = hass.auth.async_create_access_token(await hass.auth.async_create_refresh_token(system))
    await assert_refused_without_effects(await hass_ws_client(hass, token), power, switched, created["policy_id"], created["revision"])
    await power.async_shutdown()


# --- Fail closed ----------------------------------------------------------------------


@pytest.mark.parametrize("state", ["corrupt", "unsupported", "migration_failed"])
async def test_an_untrusted_policy_refuses_even_the_administrator_until_it_is_restored(
    hass: HomeAssistant, hass_ws_client, hass_storage, state: str
) -> None:
    if state == "corrupt":
        hass_storage[STORAGE_KEY] = policy({"x" * 32: {"role": "owner"}})
        power, access, switched = await domus(hass)
    elif state == "unsupported":
        hass_storage[STORAGE_KEY] = policy({}, version=SCHEMA_VERSION + 1)
        power, access, switched = await domus(hass)
    else:
        hass_storage[STORAGE_KEY] = policy({})
        with patch(
            "custom_components.domusos.access.manager.parse_stored_document",
            side_effect=MigrationFailedError("boom"),
        ):
            power, access, switched = await domus(hass)
    assert access.state.value == state
    admin = await hass_ws_client(hass)
    before = power.state_for_user(ADMIN_VIEW)
    for message in every_command("0" * 32, 1):
        reply = await ask(admin, message)
        assert reply["error"]["code"] == "access_denied", message["type"]
    assert power.state_for_user(ADMIN_VIEW) == before and not switched
    # The recovery is apart and still the administrator's; afterwards device power works again.
    with patch("custom_components.domusos.access.manager.set_aside_policy_files", return_value=["kept"]):
        assert (await ask(admin, {"type": "domusos/access/reset_policy"}))["success"]
    assert (await ask(admin, {"type": "domusos/device_power/get_state"}))["success"]
    await power.async_shutdown()


async def test_without_the_access_policy_nothing_runs(hass: HomeAssistant, hass_ws_client) -> None:
    power, _, switched = await domus(hass)
    hass.data[DOMAIN].pop(DATA_ACCESS_MANAGER)
    admin = await hass_ws_client(hass)
    reply = await ask(admin, {"type": "domusos/device_power/save_policy", "policy": settings()})
    assert reply["error"]["code"] == "access_denied"
    assert power.state_for_user(ADMIN_VIEW)["policies"] == [] and not switched
    await power.async_shutdown()


async def test_an_error_while_deciding_refuses_and_nothing_runs(hass: HomeAssistant, hass_ws_client) -> None:
    power, _, switched = await domus(hass)
    admin = await hass_ws_client(hass)
    with patch(
        "custom_components.domusos.access.instrumentation.authorize_user_action",
        side_effect=RuntimeError("evaluator down"),
    ):
        reply = await ask(admin, {"type": "domusos/device_power/save_policy", "policy": settings()})
    assert reply["error"]["code"] == "access_denied"
    assert power.state_for_user(ADMIN_VIEW)["policies"] == [] and not switched
    await power.async_shutdown()


async def test_a_broken_diagnostics_never_opens_an_enforced_action(hass: HomeAssistant, hass_ws_client) -> None:
    power, _, switched = await domus(hass)
    _, token = await account(hass, "Mario")
    member = await hass_ws_client(hass, token)
    admin = await hass_ws_client(hass)
    with patch("custom_components.domusos.access.instrumentation.shadow_stats", side_effect=RuntimeError("stats down")):
        refused = await ask(member, {"type": "domusos/device_power/save_policy", "policy": settings()})
        allowed = await ask(admin, {"type": "domusos/device_power/get_state"})
    assert refused["error"]["code"] == "access_denied" and allowed["success"]
    assert power.state_for_user(ADMIN_VIEW)["policies"] == [] and not switched
    await power.async_shutdown()


# --- Audit and diagnostics -----------------------------------------------------------


async def test_an_applied_refusal_is_a_security_record_and_an_enforced_deny(hass: HomeAssistant, hass_ws_client) -> None:
    audit = DomusAuditService()
    await audit.async_setup()
    power, _, _ = await domus(hass, audit)
    mario, token = await account(hass, "Mario")
    member = await hass_ws_client(hass, token)
    admin = await hass_ws_client(hass)
    await ask(member, {"type": "domusos/device_power/get_state"})
    await ask(admin, {"type": "domusos/device_power/get_state"})
    (entry,) = [item for item in audit.snapshot() if item.source == "access.enforcement"]
    assert (entry.reason, entry.result) == ("request_denied", "requires_ha_admin")
    assert dict(entry.metadata) == {
        "action": "domusos/device_power/get_state",
        "capability": "device_power.manage",
        "origin": "websocket",
        "principal_id": mario.id,
        "policy_state": "absent",
        "policy_revision": 0,
    }
    # Ids and codes only: no name, no payload.
    assert "Mario" not in repr(audit.snapshot())

    diagnostics = (await ask(admin, {"type": "domusos/access/get_shadow_diagnostics"}))["result"]
    assert (diagnostics["mode"], diagnostics["enforced"], diagnostics["rules_version"]) == ("partial", True, 3)
    assert diagnostics["enforced_actions"] == sorted((
        *DEVICE_POWER,
        "domusos/climate/get_config",
        "domusos/climate/save_config",
        "domusos/climate/get_state",
        "domusos/climate/set_house_intent",
        "domusos/climate/set_zone_intent",
        "domusos/climate/set_zone_override",
        "domusos/climate/clear_zone_override",
        "domusos/climate/execute_plan",
        "domusos/house/get_topology",
        "domusos/house/get_snapshot",
    ))
    row = next(row for row in diagnostics["by_action"] if row["action"] == "domusos/device_power/get_state")
    assert row["enforced"] is True
    assert (row["comparisons"]["enforced_deny"], row["comparisons"]["aligned_allow"]) == (1, 1)
    assert diagnostics["totals"]["would_block"] == 0
    assert not [sample for sample in diagnostics["recent_mismatches"] if sample["action"].startswith("domusos/device_power/")]
    await power.async_shutdown()


async def test_one_decision_serves_the_diagnostics_and_the_refusal(hass: HomeAssistant, hass_ws_client) -> None:
    power, _, _ = await domus(hass)
    _, token = await account(hass, "Mario")
    member = await hass_ws_client(hass, token)
    admin = await hass_ws_client(hass)
    with patch.object(
        instrumentation, "authorize_user_action", wraps=instrumentation.authorize_user_action
    ) as decide:
        assert (await ask(member, {"type": "domusos/device_power/get_state"}))["error"]["code"] == "access_denied"
        assert (await ask(admin, {"type": "domusos/device_power/get_state"}))["success"]
    # Once per request: never decided again to enforce what was decided to count.
    assert decide.call_count == 2
    await power.async_shutdown()


async def test_a_failing_audit_never_turns_a_refusal_into_an_allow(hass: HomeAssistant, hass_ws_client) -> None:
    broken = SimpleNamespace(running=True, record=Mock(side_effect=RuntimeError("audit down")))
    power, _, switched = await domus(hass, broken)
    created = await saved_policy(await hass_ws_client(hass))
    _, token = await account(hass, "Mario")
    await assert_refused_without_effects(await hass_ws_client(hass, token), power, switched, created["policy_id"], created["revision"])
    assert broken.record.call_count == 4
    await power.async_shutdown()
