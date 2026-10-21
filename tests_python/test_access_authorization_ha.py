"""Authorization adapters with Home Assistant: real users, service contexts, real registrations."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest.mock import patch

import pytest

from homeassistant.core import Context, HomeAssistant

from custom_components.domusos import async_setup
from custom_components.domusos.access.actions import ACTION_CONTRACTS, stale_contracts, undeclared_actions
from custom_components.domusos.access.adapters import (
    authorize_service_call,
    authorize_user,
    authorize_user_action,
    require_service_capability,
    require_user_capability,
)
from custom_components.domusos.access.authorization import AuthorizationDeniedError, DecisionReason
from custom_components.domusos.access.manager import AccessPolicyManager
from custom_components.domusos.access.models import SCHEMA, SCHEMA_VERSION, STORAGE_KEY
from custom_components.domusos.const import DOMAIN

NOW = "2026-10-21T10:00:00+00:00"


async def accounts(hass: HomeAssistant):
    # Home Assistant makes its first user the owner, and an owner is always an admin.
    await hass.auth.async_create_user("Owner", group_ids=["system-admin"])
    admin = await hass.auth.async_create_user("Admin", group_ids=["system-admin"])
    member = await hass.auth.async_create_user("Member", group_ids=["system-users"])
    return admin, member


async def loaded(hass: HomeAssistant) -> AccessPolicyManager:
    manager = AccessPolicyManager(hass, runtime=lambda: None)
    await manager.async_setup()
    return manager


def call_by(user_id: str | None) -> Any:
    # The adapters only read the context Home Assistant attached to the call.
    return SimpleNamespace(context=Context(user_id=user_id))


async def test_every_entry_point_home_assistant_registers_is_declared(hass: HomeAssistant) -> None:
    assert await async_setup(hass, {})
    commands = {command for command in hass.data["websocket_api"] if command.startswith("domusos/")}
    services = {f"{DOMAIN}.{service}" for service in hass.services.async_services().get(DOMAIN, {})}
    registered = commands | services
    assert undeclared_actions(registered) == []
    assert stale_contracts(registered) == []
    assert registered == set(ACTION_CONTRACTS)
    assert f"{DOMAIN}.reset_access_policy" not in registered


async def test_a_websocket_user_is_decided_from_home_assistant(hass: HomeAssistant, hass_storage) -> None:
    admin, member = await accounts(hass)
    manager = await loaded(hass)
    assert authorize_user(manager, admin, "energy.manage").allowed
    denied = authorize_user(manager, member, "energy.manage", action="domusos/energy/save_profile")
    assert not denied.allowed and denied.reason is DecisionReason.REQUIRES_HA_ADMIN
    assert denied.principal_id == member.id and denied.action == "domusos/energy/save_profile"
    assert authorize_user(manager, member, "energy.view").allowed
    assert authorize_user_action(manager, member, "domusos/access/get_self").allowed
    assert not authorize_user_action(manager, member, "domusos/access/reset_policy").allowed
    with pytest.raises(AuthorizationDeniedError):
        require_user_capability(manager, member, "access.control")


async def test_accounts_that_are_no_principal_are_denied(hass: HomeAssistant, hass_storage) -> None:
    await accounts(hass)
    manager = await loaded(hass)
    system = await hass.auth.async_create_system_user("Supervisor", group_ids=["system-admin"])
    disabled = await hass.auth.async_create_user("Ex", group_ids=["system-admin"])
    await hass.auth.async_deactivate_user(disabled)
    assert authorize_user(manager, None, "energy.view").reason is DecisionReason.NO_PRINCIPAL
    assert authorize_user(manager, system, "energy.view").reason is DecisionReason.INVALID_PRINCIPAL
    assert authorize_user(manager, disabled, "energy.view").reason is DecisionReason.INACTIVE_USER


async def test_without_a_policy_or_with_a_broken_one_nothing_is_allowed(hass: HomeAssistant, hass_storage) -> None:
    admin, _ = await accounts(hass)
    assert authorize_user(None, admin, "energy.view").reason is DecisionReason.POLICY_UNAVAILABLE
    manager = await loaded(hass)
    with patch.object(manager, "profile_for_principal", side_effect=RuntimeError("boom")):
        decision = authorize_user(manager, admin, "access.manage")
    assert not decision.allowed and decision.reason is DecisionReason.INTERNAL_ERROR


async def test_a_service_call_is_decided_from_its_context(hass: HomeAssistant, hass_storage) -> None:
    admin, member = await accounts(hass)
    manager = await loaded(hass)
    assert (await authorize_service_call(hass, manager, call_by(admin.id), "irrigation.control")).allowed
    assert (await authorize_service_call(hass, manager, call_by(member.id), "irrigation.control")).allowed
    denied = await authorize_service_call(hass, manager, call_by(member.id), "irrigation.manage")
    assert not denied.allowed and denied.reason is DecisionReason.REQUIRES_HA_ADMIN


async def test_a_service_call_without_a_user_has_no_principal(hass: HomeAssistant, hass_storage) -> None:
    """An automation calls with no user: the decision is a deny, not yet enforced anywhere."""
    admin, _ = await accounts(hass)
    manager = await loaded(hass)
    decision = await authorize_service_call(hass, manager, call_by(None), "irrigation.control")
    assert not decision.allowed and decision.reason is DecisionReason.NO_PRINCIPAL
    unknown = await authorize_service_call(hass, manager, call_by("f" * 32), "irrigation.control")
    assert unknown.reason is DecisionReason.INVALID_PRINCIPAL
    with patch.object(hass.auth, "async_get_user", side_effect=RuntimeError("auth down")):
        broken = await authorize_service_call(hass, manager, call_by(admin.id), "irrigation.control")
    assert not broken.allowed and broken.reason is DecisionReason.INTERNAL_ERROR
    with pytest.raises(AuthorizationDeniedError):
        await require_service_capability(hass, manager, call_by(None), "irrigation.control")


async def test_deciding_never_writes_the_policy_or_changes_its_revision(hass: HomeAssistant, hass_storage) -> None:
    admin, member = await accounts(hass)
    hass_storage[STORAGE_KEY] = {
        "version": 1,
        "minor_version": 1,
        "key": STORAGE_KEY,
        "data": {
            "schema": SCHEMA,
            "version": SCHEMA_VERSION,
            "revision": 5,
            "updated_at": NOW,
            "assignments": {
                member.id: {"role": "member", "grants": ["access.control"], "assigned_at": NOW, "assigned_by": None}
            },
            "audit": [],
        },
    }
    before = dict(hass_storage[STORAGE_KEY]["data"])
    manager = await loaded(hass)
    for _ in range(3):
        for capability in ("access.control", "security.control", "energy.manage", "access.manage"):
            authorize_user(manager, member, capability)
            authorize_user(manager, admin, capability)
            await authorize_service_call(hass, manager, call_by(member.id), capability)
    assert authorize_user(manager, member, "access.control").allowed
    assert not authorize_user(manager, member, "security.control").allowed
    assert manager.revision == 5 and hass_storage[STORAGE_KEY]["data"] == before
