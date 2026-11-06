"""Shadow authorization through the real Home Assistant stack: it observes and never changes a request."""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, Mock, patch

import pytest

from homeassistant.components import websocket_api
from homeassistant.core import Context, HomeAssistant

from custom_components.domusos import async_setup
from custom_components.domusos.access import instrumentation
from custom_components.domusos.access.actions import ACTION_CONTRACTS, shadow_contracts
from custom_components.domusos.access.manager import DATA_ACCESS_MANAGER, AccessPolicyManager
from custom_components.domusos.access.models import SCHEMA, SCHEMA_VERSION, STORAGE_KEY
from custom_components.domusos.access.shadow import ShadowStats
from custom_components.domusos.const import DOMAIN
from custom_components.domusos.irrigation import IrrigationManager
from custom_components.domusos.irrigation.models import IrrigationPermissionError
from custom_components.domusos.waste_collection.manager import WasteCollectionManager

NOW = "2026-10-21T10:00:00+00:00"
CLIENT_ID = "https://example.com/app"
WASTE_CONFIG = {"config": "shared"}


async def member_token(hass: HomeAssistant, name: str = "Member") -> tuple[Any, str]:
    user = await hass.auth.async_create_user(name, group_ids=["system-users"])
    refresh = await hass.auth.async_create_refresh_token(user, CLIENT_ID)
    return user, hass.auth.async_create_access_token(refresh)


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


async def domus(hass: HomeAssistant) -> tuple[AccessPolicyManager, Mock, Mock]:
    """Every Domus command and service registered, with stand-in feature managers."""
    assert await async_setup(hass, {})
    manager = AccessPolicyManager(hass, runtime=lambda: None)
    await manager.async_setup()
    hass.data[DOMAIN][DATA_ACCESS_MANAGER] = manager
    waste = Mock(spec=WasteCollectionManager)
    waste.configuration_for_user.return_value = WASTE_CONFIG
    hass.data[DOMAIN]["waste_collection_manager"] = waste
    irrigation = Mock(spec=IrrigationManager)
    irrigation.state_for_user.return_value = {"state": "idle"}
    for method in ("async_pause", "async_resume", "async_stop_all", "async_start_zone", "async_stop_zone"):
        setattr(irrigation, method, AsyncMock())
    hass.data[DOMAIN]["irrigation_manager"] = irrigation
    return manager, waste, irrigation


async def ask(client, message: dict[str, Any]) -> dict[str, Any]:
    await client.send_json_auto_id(message)
    reply = await client.receive_json()
    reply.pop("id", None)
    return reply


async def diagnostics(client) -> dict[str, Any]:
    reply = await ask(client, {"type": "domusos/access/get_shadow_diagnostics"})
    assert reply["success"], reply
    return reply["result"]


def row(snapshot: dict[str, Any], action: str) -> dict[str, Any]:
    return next(entry for entry in snapshot["by_action"] if entry["action"] == action)


def service_row(snapshot: dict[str, Any], action: str) -> dict[str, Any]:
    return next(entry for entry in snapshot["services"] if entry["action"] == action)


def without_shadow(hass: HomeAssistant, command: str) -> None:
    """Register the command's own handler again, unwrapped: the baseline to compare with."""
    handler, _schema = hass.data["websocket_api"][command]
    websocket_api.async_register_command(hass, handler.__wrapped__)


async def test_every_observed_entry_point_is_instrumented_where_home_assistant_registered_it(hass: HomeAssistant) -> None:
    await domus(hass)
    commands = {command: handler for command, (handler, _) in hass.data["websocket_api"].items() if command.startswith("domusos/")}
    services = hass.services.async_services().get(DOMAIN, {})
    assert (len(commands), len(services)) == (44, 5)
    observed = {contract.id for contract in shadow_contracts()}
    assert len(observed) == 40
    for action in ACTION_CONTRACTS:
        if action.startswith("domusos/"):
            tag = getattr(commands[action], instrumentation.SHADOW_ACTION_ATTR, None)
        else:
            tag = getattr(services[action.removeprefix(f"{DOMAIN}.")].job.target, instrumentation.SHADOW_ACTION_ATTR, None)
        assert tag == (action if action in observed else None), action
    for command, handler in commands.items():
        assert hass.data["websocket_api"][command][1] is handler._ws_schema


async def test_an_allowed_request_answers_exactly_as_without_shadow(hass: HomeAssistant, hass_ws_client) -> None:
    await domus(hass)
    client = await hass_ws_client(hass)
    observed = await ask(client, {"type": "domusos/waste_collection/get_config"})
    assert observed == {"type": "result", "success": True, "result": WASTE_CONFIG}
    assert row(await diagnostics(client), "domusos/waste_collection/get_config")["comparisons"]["aligned_allow"] == 1
    without_shadow(hass, "domusos/waste_collection/get_config")
    assert await ask(client, {"type": "domusos/waste_collection/get_config"}) == observed


async def test_a_shadow_deny_never_stops_the_request(hass: HomeAssistant, hass_ws_client, hass_storage) -> None:
    # A policy that cannot be trusted: the member is locked, and waste.view is not on the safe floor.
    hass_storage[STORAGE_KEY] = policy({"x" * 32: {"role": "owner"}})
    manager, waste, _ = await domus(hass)
    assert manager.state.value == "corrupt"
    _, token = await member_token(hass)
    reply = await ask(await hass_ws_client(hass, token), {"type": "domusos/waste_collection/get_config"})
    assert reply == {"type": "result", "success": True, "result": WASTE_CONFIG}
    waste.configuration_for_user.assert_called_once()
    snapshot = await diagnostics(await hass_ws_client(hass))
    entry = row(snapshot, "domusos/waste_collection/get_config")
    assert entry["comparisons"]["would_block"] == 1 and entry["reasons"] == {"locked": 1} and entry["roles"] == {"locked": 1}
    assert snapshot["recent_mismatches"][-1]["comparison"] == "would_block"


async def test_existing_refusals_are_observed_and_left_as_they_are(hass: HomeAssistant, hass_ws_client) -> None:
    _, _, irrigation = await domus(hass)
    _, token = await member_token(hass)
    member = await hass_ws_client(hass, token)
    # require_admin refuses before the handler runs.
    refused = await ask(member, {"type": "domusos/energy/get_profile"})
    assert refused["success"] is False and refused["error"]["code"] == "unauthorized"
    # The entity permission check of Irrigation refuses inside the handler.
    irrigation.async_start_zone.side_effect = IrrigationPermissionError("Permesso Home Assistant insufficiente per questa zona.")
    stricter = await ask(member, {"type": "domusos/irrigation/start_zone", "zone_id": "z1"})
    assert stricter["error"] == {"code": "unauthorized", "message": "Permesso Home Assistant insufficiente per questa zona."}
    snapshot = await diagnostics(await hass_ws_client(hass))
    assert row(snapshot, "domusos/energy/get_profile")["comparisons"]["aligned_deny"] == 1
    assert row(snapshot, "domusos/energy/get_profile")["reasons"] == {"requires_ha_admin": 1}
    assert row(snapshot, "domusos/irrigation/start_zone")["comparisons"]["current_stricter"] == 1
    without_shadow(hass, "domusos/energy/get_profile")
    without_shadow(hass, "domusos/irrigation/start_zone")
    assert await ask(member, {"type": "domusos/energy/get_profile"}) == refused
    assert await ask(member, {"type": "domusos/irrigation/start_zone", "zone_id": "z1"}) == stricter


async def test_a_failing_request_fails_as_before(hass: HomeAssistant, hass_ws_client) -> None:
    await domus(hass)
    client = await hass_ws_client(hass)
    failed = await ask(client, {"type": "domusos/energy/get_state"})
    assert failed["success"] is False and failed["error"]["code"] == "energy_unavailable"
    assert row(await diagnostics(client), "domusos/energy/get_state")["comparisons"]["current_error"] == 1


async def test_a_service_without_a_user_still_runs(hass: HomeAssistant, hass_ws_client, hass_admin_user) -> None:
    """Q10 in the shadow: an automation context is allowed, a call with no parent is not; all of them run for real."""
    _, _, irrigation = await domus(hass)
    await hass.services.async_call(DOMAIN, "pause_irrigation", {}, blocking=True, context=Context())
    await hass.services.async_call(DOMAIN, "pause_irrigation", {}, blocking=True, context=Context(parent_id="0" * 26))
    await hass.services.async_call(DOMAIN, "pause_irrigation", {}, blocking=True, context=Context(user_id=hass_admin_user.id))
    assert irrigation.async_pause.await_count == 3
    pause = service_row(await diagnostics(await hass_ws_client(hass)), "domusos.pause_irrigation")
    assert pause == {
        "action": "domusos.pause_irrigation",
        "total": 3,
        "with_principal": 1,
        "without_principal": 2,
        "no_user_with_parent": 1,
        "no_user_without_parent": 1,
        "shadow_allow": 2,
        "shadow_deny": 1,
        "no_principal": 1,
        "current_success": 3,
        "current_deny": 0,
        "current_error": 0,
        "would_block": 1,
    }


async def test_real_home_2026_10_22_an_automation_starting_a_zone_is_a_shadow_allow(
    hass: HomeAssistant, hass_ws_client
) -> None:
    """Regression for the case that closed Q10.

    At home on 2026-10-22, start_irrigation_zone ran from an automation
    (no user, a parent context) and succeeded, and the P2.3 rules counted it as
    would_block. Under the Q10 rules it is an aligned shadow allow, and the
    handler still runs exactly as before; a failing zone stays a current error.
    """
    _, _, irrigation = await domus(hass)
    automation = Context(parent_id="01JAUTOMATIONPARENTCONTEXT")
    await hass.services.async_call(DOMAIN, "start_irrigation_zone", {"zone_id": "front"}, blocking=True, context=automation)
    irrigation.async_start_zone.side_effect = RuntimeError("zone disabled")
    with pytest.raises(RuntimeError):
        await hass.services.async_call(DOMAIN, "start_irrigation_zone", {"zone_id": "back"}, blocking=True, context=automation)
    assert irrigation.async_start_zone.await_count == 2
    # Still the household account the handler sees: none.
    assert irrigation.async_start_zone.await_args_list[0].args[2] is None
    snapshot = await diagnostics(await hass_ws_client(hass))
    assert (snapshot["mode"], snapshot["enforced"], snapshot["rules_version"]) == ("partial", True, 3)
    start = service_row(snapshot, "domusos.start_irrigation_zone")
    assert (start["no_user_with_parent"], start["shadow_allow"], start["shadow_deny"], start["no_principal"]) == (2, 2, 0, 0)
    assert (start["current_success"], start["current_error"], start["would_block"]) == (1, 1, 0)
    observed = row(snapshot, "domusos.start_irrigation_zone")
    assert observed["reasons"] == {"allowed_unattributed_ha_context": 2}
    assert observed["roles"] == {"none": 2}
    assert observed["comparisons"]["aligned_allow"] == 1 and observed["comparisons"]["current_error"] == 1
    assert not [sample for sample in snapshot["recent_mismatches"] if sample["action"] == "domusos.start_irrigation_zone"]


async def test_a_member_without_irrigation_control_is_never_let_through_by_a_parent(
    hass: HomeAssistant, hass_ws_client, hass_storage
) -> None:
    child, _ = await member_token(hass, "Child")
    hass_storage[STORAGE_KEY] = policy({child.id: {"role": "restricted", "grants": [], "assigned_at": NOW, "assigned_by": None}})
    _, _, irrigation = await domus(hass)
    context = Context(user_id=child.id, parent_id="01JAUTOMATIONPARENTCONTEXT")
    await hass.services.async_call(DOMAIN, "stop_all_irrigation", {}, blocking=True, context=context)
    # Shadow only: the call still ran as before.
    assert irrigation.async_stop_all.await_count == 1
    stop_all = service_row(await diagnostics(await hass_ws_client(hass)), "domusos.stop_all_irrigation")
    assert (stop_all["with_principal"], stop_all["shadow_deny"], stop_all["would_block"]) == (1, 1, 1)
    assert stop_all["no_user_with_parent"] == 0


async def test_an_untrusted_policy_is_a_shadow_deny_for_automations(hass: HomeAssistant, hass_ws_client, hass_storage) -> None:
    hass_storage[STORAGE_KEY] = policy({}, version=SCHEMA_VERSION + 1)
    _, _, irrigation = await domus(hass)
    await hass.services.async_call(
        DOMAIN, "resume_irrigation", {}, blocking=True, context=Context(parent_id="01JAUTOMATIONPARENTCONTEXT")
    )
    assert irrigation.async_resume.await_count == 1
    snapshot = await diagnostics(await hass_ws_client(hass))
    resume = row(snapshot, "domusos.resume_irrigation")
    assert resume["reasons"] == {"locked": 1} and resume["shadow_deny"] == 1


async def test_a_service_refusal_is_raised_unchanged(hass: HomeAssistant, hass_ws_client) -> None:
    _, _, irrigation = await domus(hass)
    member, _ = await member_token(hass)
    refusal = IrrigationPermissionError("no")
    irrigation.async_pause.side_effect = refusal
    with pytest.raises(IrrigationPermissionError) as raised:
        await hass.services.async_call(DOMAIN, "pause_irrigation", {}, blocking=True, context=Context(user_id=member.id))
    assert raised.value is refusal
    assert service_row(await diagnostics(await hass_ws_client(hass)), "domusos.pause_irrigation")["current_deny"] == 1


async def test_a_broken_shadow_never_reaches_the_request(hass: HomeAssistant, hass_ws_client) -> None:
    _, _, irrigation = await domus(hass)
    client = await hass_ws_client(hass)
    with patch.object(instrumentation, "authorize_user_action", side_effect=RuntimeError("boom")):
        reply = await ask(client, {"type": "domusos/waste_collection/get_config"})
    assert reply["result"] == WASTE_CONFIG
    with patch.object(ShadowStats, "record", side_effect=RuntimeError("boom")):
        assert (await ask(client, {"type": "domusos/waste_collection/get_config"}))["result"] == WASTE_CONFIG
        await hass.services.async_call(DOMAIN, "stop_all_irrigation", {}, blocking=True, context=Context())
    irrigation.async_stop_all.assert_awaited_once()
    with patch.object(instrumentation, "authorize_service_action", side_effect=RuntimeError("boom")):
        await hass.services.async_call(DOMAIN, "resume_irrigation", {}, blocking=True, context=Context())
    irrigation.async_resume.assert_awaited_once()
    snapshot = await diagnostics(client)
    assert row(snapshot, "domusos/waste_collection/get_config")["comparisons"]["shadow_error"] == 1
    assert snapshot["totals"]["instrumentation_failures"] == 3


async def test_the_diagnostics_are_for_administrators_and_change_nothing(
    hass: HomeAssistant, hass_ws_client, hass_storage
) -> None:
    member, token = await member_token(hass)
    hass_storage[STORAGE_KEY] = policy({member.id: {"role": "restricted", "grants": [], "assigned_at": NOW, "assigned_by": None}})
    manager, _, _ = await domus(hass)
    stored = dict(hass_storage[STORAGE_KEY]["data"])
    member_client = await hass_ws_client(hass, token)
    for command in ("get_shadow_diagnostics", "reset_shadow_diagnostics"):
        reply = await ask(member_client, {"type": f"domusos/access/{command}"})
        assert reply["success"] is False and reply["error"]["code"] == "unauthorized", command
    await ask(member_client, {"type": "domusos/waste_collection/get_config"})
    admin = await hass_ws_client(hass)
    first = await diagnostics(admin)
    assert first["totals"]["observed"] == 1 and row(first, "domusos/waste_collection/get_config")["roles"] == {"restricted": 1}
    assert first["policy"] == {"state": "ready", "revision": 2}
    # Reading is not counted, and nothing in the diagnostics names anyone.
    assert (await diagnostics(admin))["totals"] == first["totals"]
    assert member.id not in str(first)
    reset = await ask(admin, {"type": "domusos/access/reset_shadow_diagnostics"})
    assert reset["success"] and reset["result"]["window"]["reason"] == "manual_reset"
    assert all(value == 0 for value in reset["result"]["totals"].values())
    assert (await diagnostics(admin))["totals"]["evaluated"] == 0
    assert manager.revision == 2 and hass_storage[STORAGE_KEY]["data"] == stored


async def test_get_self_and_the_reset_stay_outside_the_shadow(hass: HomeAssistant, hass_ws_client) -> None:
    await domus(hass)
    _, token = await member_token(hass)
    member = await hass_ws_client(hass, token)
    assert (await ask(member, {"type": "domusos/access/get_self"}))["success"]
    refused = await ask(member, {"type": "domusos/access/reset_policy"})
    assert refused["success"] is False and refused["error"]["code"] == "access_denied"
    assert (await diagnostics(await hass_ws_client(hass)))["totals"]["evaluated"] == 0


async def test_a_policy_change_starts_a_new_window(hass: HomeAssistant, hass_ws_client, hass_admin_user) -> None:
    manager, _, _ = await domus(hass)
    member, token = await member_token(hass)
    member_client = await hass_ws_client(hass, token)
    await ask(member_client, {"type": "domusos/waste_collection/get_config"})
    await manager.async_assign(hass_admin_user, member.id, "restricted", [], manager.revision)
    await ask(member_client, {"type": "domusos/waste_collection/get_config"})
    snapshot = await diagnostics(await hass_ws_client(hass))
    assert snapshot["window"]["reason"] == "policy_changed"
    assert (snapshot["window"]["policy_state"], snapshot["window"]["policy_revision"]) == ("ready", manager.revision)
    assert snapshot["totals"]["observed"] == 1
    assert row(snapshot, "domusos/waste_collection/get_config")["roles"] == {"restricted": 1}
