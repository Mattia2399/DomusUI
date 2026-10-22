"""Websocket API of Domus Access Control.

Both commands take no parameter: the account is the one Home Assistant
authenticated for the connection, never an id, a role or a flag sent by the
client. Nothing is enforced yet, except the recovery.

The recovery is a websocket command on purpose, and never a Home Assistant
service: automations and scripts call services, and a service cannot tell a
script started by an administrator from that administrator acting directly,
while an automation calls with no user at all
(docs/access-control-foundation.md#recupero).

The shadow diagnostics tell an administrator what Access Control would have
decided on the requests observed so far; they are counters in memory, read
and cleared here, never stored (docs/access-control-shadow.md).

People and access (docs/access-control-people-access.md): an active Home
Assistant administrator lists the accounts and changes the role and personal
grants of one of them. The administrator is always the connection's account;
the request names only the account it changes, which must be an active
household account of Home Assistant. Who changed it and when are written by
the server, and every change needs the policy revision the page last read.
"""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from ..const import DOMAIN
from .authorization import identify
from .instrumentation import register_websocket_commands, shadow_stats
from .manager import DATA_ACCESS_MANAGER, AccessPolicyManager, principal_from_user
from .administration import AccountFacts, account_view, accounts_view, assignment_request, require_manageable
from .models import AccessDeniedError, AccessError, AccessUnavailableError, UnknownAccountError

WS_PREFIX = f"{DOMAIN}/access"


def _manager(hass: HomeAssistant) -> AccessPolicyManager:
    manager = hass.data.get(DOMAIN, {}).get(DATA_ACCESS_MANAGER)
    if not isinstance(manager, AccessPolicyManager):
        raise AccessUnavailableError("Domus access control is not running")
    return manager


@websocket_api.websocket_command({vol.Required("type"): f"{WS_PREFIX}/get_self"})
@callback
def websocket_get_self(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return the role, grants and capabilities Domus gives the account of this connection."""
    try:
        principal = principal_from_user(connection.user)
        profile = _manager(hass).profile_for(connection.user)
    except AccessError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    except Exception:  # noqa: BLE001 - always answer the client, never with a profile
        connection.send_error(msg["id"], "unknown_error", "Domus access control failed")
        return
    connection.send_result(
        msg["id"],
        {
            # The id lets a client check the answer belongs to the account it shows.
            "principal": {
                "user_id": principal.user_id,
                "is_admin": principal.is_admin,
                "is_owner": principal.is_owner,
            },
            "access": {
                "role": profile.role.value,
                "assigned": profile.source.value == "assignment",
                "grants": list(profile.grants),
                "capabilities": sorted(profile.capabilities),
                "state": profile.state.value,
                "revision": profile.revision,
            },
        },
    )


@websocket_api.websocket_command({vol.Required("type"): f"{WS_PREFIX}/reset_policy"})
@websocket_api.async_response
async def websocket_reset_policy(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return every account to its default role; only for an active Home Assistant administrator."""
    try:
        result = await _manager(hass).async_reset(connection.user)
    except AccessError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    except Exception:  # noqa: BLE001 - never answer success for a reset that did not happen
        connection.send_error(msg["id"], "unknown_error", "Domus access control failed")
        return
    connection.send_result(msg["id"], result)


def _manages_access(user: Any) -> bool:
    """An active Home Assistant administrator, who always holds access.manage."""
    principal, _reason = identify(user)
    return principal is not None and principal.is_admin


def _shadow_diagnostics(hass: HomeAssistant) -> dict[str, Any]:
    manager = hass.data.get(DOMAIN, {}).get(DATA_ACCESS_MANAGER)
    running = isinstance(manager, AccessPolicyManager)
    return shadow_stats(hass).snapshot(
        policy_state=manager.state.value if running else None,
        policy_revision=manager.revision if running else None,
    )


@websocket_api.websocket_command({vol.Required("type"): f"{WS_PREFIX}/get_shadow_diagnostics"})
@websocket_api.require_admin
@callback
def websocket_get_shadow_diagnostics(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """What Access Control would have decided in the current window; read only, administrators only."""
    if not _manages_access(connection.user):
        connection.send_error(msg["id"], AccessDeniedError.code, "This account cannot read the access diagnostics")
        return
    try:
        result = _shadow_diagnostics(hass)
    except Exception:  # noqa: BLE001 - always answer the client
        connection.send_error(msg["id"], "unknown_error", "Domus access control failed")
        return
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command({vol.Required("type"): f"{WS_PREFIX}/reset_shadow_diagnostics"})
@websocket_api.require_admin
@callback
def websocket_reset_shadow_diagnostics(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Start a new observation window; only the in-memory counters change, never the policy."""
    if not _manages_access(connection.user):
        connection.send_error(msg["id"], AccessDeniedError.code, "This account cannot reset the access diagnostics")
        return
    try:
        shadow_stats(hass).reset()
        result = _shadow_diagnostics(hass)
    except Exception:  # noqa: BLE001 - always answer the client
        connection.send_error(msg["id"], "unknown_error", "Domus access control failed")
        return
    connection.send_result(msg["id"], result)


def _person_names(hass: HomeAssistant) -> dict[str, str]:
    """The name of the person linked to each account, to show; never an authority."""
    names: dict[str, str] = {}
    for state in hass.states.async_all("person"):
        user_id = state.attributes.get("user_id")
        name = state.attributes.get("friendly_name")
        if isinstance(user_id, str) and isinstance(name, str) and name.strip():
            names[user_id] = name.strip()
    return names


def _facts(user: Any, names: dict[str, str]) -> AccountFacts:
    return AccountFacts(
        user_id=user.id,
        name=names.get(user.id) or (user.name or "").strip() or user.id[:8],
        is_admin=user.is_admin is True,
        is_owner=user.is_owner is True,
        is_active=user.is_active is True,
        system_generated=user.system_generated is True,
    )


def _policy_summary(manager: AccessPolicyManager) -> dict[str, Any]:
    return {"state": manager.state.value, "revision": manager.revision}


async def _target(hass: HomeAssistant, user_id: str) -> AccountFacts:
    user = await hass.auth.async_get_user(user_id)
    if user is None:
        raise UnknownAccountError("No Home Assistant account has this id")
    return _facts(user, _person_names(hass))


def _send_access_error(connection: websocket_api.ActiveConnection, msg_id: int, err: Exception) -> None:
    if isinstance(err, AccessError):
        connection.send_error(msg_id, err.code, str(err))
    else:
        connection.send_error(msg_id, "unknown_error", "Domus access control failed")


@websocket_api.websocket_command({vol.Required("type"): f"{WS_PREFIX}/list_accounts"})
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_list_accounts(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Every household account with its Domus role and grants; for an administrator, read only."""
    try:
        manager = _manager(hass)
        manager.require_access_manager(connection.user)
        names = _person_names(hass)
        accounts = [_facts(user, names) for user in await hass.auth.async_get_users()]
        result = {
            **_policy_summary(manager),
            "accounts": accounts_view(accounts, manager.state, manager.assignments),
        }
    except Exception as err:  # noqa: BLE001 - always answer the client
        _send_access_error(connection, msg["id"], err)
        return
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/set_assignment",
        vol.Required("user_id"): str,
        vol.Required("role"): str,
        vol.Required("grants"): [str],
        vol.Required("expected_revision"): int,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_set_assignment(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Give one account a role and personal grants, in one write, if the revision still matches."""
    try:
        manager = _manager(hass)
        manager.require_access_manager(connection.user)
        target = await _target(hass, msg["user_id"])
        require_manageable(target)
        role, grants = assignment_request(msg["role"], msg["grants"])
        await manager.async_assign(connection.user, target.user_id, role, list(grants), msg["expected_revision"])
        result = {
            **_policy_summary(manager),
            "account": account_view(target, manager.state, manager.assignments.get(target.user_id)),
        }
    except Exception as err:  # noqa: BLE001 - nothing is reported as saved unless it was
        _send_access_error(connection, msg["id"], err)
        return
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{WS_PREFIX}/remove_assignment",
        vol.Required("user_id"): str,
        vol.Required("expected_revision"): int,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_remove_assignment(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return one account to its default role.

    An assignment left by an account Home Assistant no longer has can be
    removed too; a disabled account keeps its assignment, which may hold it
    back, until it is active again.
    """
    try:
        manager = _manager(hass)
        manager.require_access_manager(connection.user)
        user = await hass.auth.async_get_user(msg["user_id"])
        target = _facts(user, _person_names(hass)) if user is not None else None
        if target is not None:
            require_manageable(target)
        elif msg["user_id"] not in manager.assignments:
            raise UnknownAccountError("No Home Assistant account has this id")
        await manager.async_unassign(connection.user, msg["user_id"], msg["expected_revision"])
        result = {
            **_policy_summary(manager),
            "account": account_view(target, manager.state, None) if target is not None else None,
        }
    except Exception as err:  # noqa: BLE001 - nothing is reported as saved unless it was
        _send_access_error(connection, msg["id"], err)
        return
    connection.send_result(msg["id"], result)


WEBSOCKET_COMMANDS = (
    websocket_get_self,
    websocket_reset_policy,
    websocket_get_shadow_diagnostics,
    websocket_reset_shadow_diagnostics,
    websocket_list_accounts,
    websocket_set_assignment,
    websocket_remove_assignment,
)


async def async_register_access_api(hass: HomeAssistant) -> None:
    """Register the websocket commands once; Access Control registers no service.

    The shadow counters start here, with the integration.
    """
    shadow_stats(hass)
    register_websocket_commands(hass, WEBSOCKET_COMMANDS)
