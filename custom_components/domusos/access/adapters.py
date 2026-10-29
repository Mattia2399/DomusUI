"""Who is asking, as Home Assistant says, handed to the central evaluator.

The account always comes from Home Assistant: ``connection.user`` on a
websocket command, ``call.context.user_id`` resolved by Home Assistant on a
service call. Never from a field of the request. These adapters only decide;
shadow authorization uses them to observe, and no command enforces them yet
(docs/access-control-authorization.md, docs/access-control-shadow.md).

A service call without a user (an automation, a timer) has no principal.
Domus never makes one up. Such a call is allowed only for a declared service
that opts in, when the context derives from another one and the policy can be
trusted (Q10, docs/access-control-enforcement.md); otherwise it is a deny
with ``no_principal``. A call with a user is always decided for that user,
and a denial never falls back to the path without one.
"""

from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant, ServiceCall

from .authorization import (
    AuthorizationDecision,
    AuthorizationDeniedError,
    DecisionReason,
    authorize,
    authorize_action,
    authorize_unattributed_action,
    deny,
    identify,
)
from .manager import AccessPolicyManager
from .models import AccessProfile, Principal
from .shadow import Origin


def _resolve(manager: AccessPolicyManager | None, user: Any) -> tuple[Principal | None, AccessProfile | None, DecisionReason | None]:
    principal, reason = identify(user)
    if principal is None:
        return None, None, reason
    if not isinstance(manager, AccessPolicyManager):
        return principal, None, DecisionReason.POLICY_UNAVAILABLE
    try:
        return principal, manager.profile_for_principal(principal), None
    except Exception:  # noqa: BLE001 - no profile, no allow
        return principal, None, DecisionReason.INTERNAL_ERROR


def authorize_user(
    manager: AccessPolicyManager | None,
    user: Any,
    capability: str,
    *,
    action: str | None = None,
) -> AuthorizationDecision:
    """Decide for a Home Assistant user already attached to the request (``connection.user``)."""
    try:
        principal, profile, reason = _resolve(manager, user)
        if reason is not None:
            return deny(reason, capability, action=action, principal=principal)
        return authorize(principal, profile, capability, action=action)
    except Exception:  # noqa: BLE001 - fail closed
        return deny(DecisionReason.INTERNAL_ERROR, capability, action=action)


def authorize_user_action(manager: AccessPolicyManager | None, user: Any, action: str) -> AuthorizationDecision:
    """Decide a declared backend action for a Home Assistant user, following its contract."""
    try:
        principal, profile, reason = _resolve(manager, user)
        if reason is not None:
            return deny(reason, action=action, principal=principal)
        return authorize_action(principal, profile, action)
    except Exception:  # noqa: BLE001 - fail closed
        return deny(DecisionReason.INTERNAL_ERROR, action=action)


def require_user_capability(
    manager: AccessPolicyManager | None,
    user: Any,
    capability: str,
    *,
    action: str | None = None,
) -> AuthorizationDecision:
    decision = authorize_user(manager, user, capability, action=action)
    if not decision.allowed:
        raise AuthorizationDeniedError(decision)
    return decision


def has_parent_context(call: ServiceCall) -> bool:
    """Whether Home Assistant derived the call's context from another one; only "there is a parent", never its id."""
    parent_id = getattr(call.context, "parent_id", None)
    return isinstance(parent_id, str) and parent_id != ""


def service_origin(call: ServiceCall) -> Origin:
    """Where a service call came from, as Home Assistant attached it; the one classification for decisions and diagnostics."""
    if call.context.user_id is not None:
        return Origin.SERVICE_WITH_USER
    if has_parent_context(call):
        return Origin.SERVICE_NO_USER_WITH_PARENT
    return Origin.SERVICE_NO_USER_WITHOUT_PARENT


async def _service_user(hass: HomeAssistant, call: ServiceCall) -> tuple[Any, DecisionReason | None]:
    user_id = call.context.user_id
    if user_id is None:
        return None, DecisionReason.NO_PRINCIPAL
    try:
        user = await hass.auth.async_get_user(user_id)
    except Exception:  # noqa: BLE001 - an identity that cannot be read is no identity
        return None, DecisionReason.INTERNAL_ERROR
    if user is None:
        return None, DecisionReason.INVALID_PRINCIPAL
    return user, None


async def authorize_service_call(
    hass: HomeAssistant,
    manager: AccessPolicyManager | None,
    call: ServiceCall,
    capability: str,
    *,
    action: str | None = None,
) -> AuthorizationDecision:
    """Decide for the user Home Assistant attached to a service call, or deny without one."""
    try:
        user, reason = await _service_user(hass, call)
        if reason is not None:
            return deny(reason, capability, action=action)
        return authorize_user(manager, user, capability, action=action)
    except Exception:  # noqa: BLE001 - fail closed
        return deny(DecisionReason.INTERNAL_ERROR, capability, action=action)


async def authorize_service_action(
    hass: HomeAssistant,
    manager: AccessPolicyManager | None,
    call: ServiceCall,
    action: str,
) -> AuthorizationDecision:
    """Decide a declared service for the user Home Assistant attached to the call, following its contract.

    With a user, only that user's decision counts. Without one, the call can
    only be allowed as an unattributed Home Assistant context (Q10).
    """
    try:
        if service_origin(call) is not Origin.SERVICE_WITH_USER:
            trusted_manager = manager if isinstance(manager, AccessPolicyManager) else None
            return authorize_unattributed_action(
                action,
                has_parent=has_parent_context(call),
                policy_state=trusted_manager.state if trusted_manager is not None else None,
                policy_revision=trusted_manager.revision if trusted_manager is not None else None,
            )
        user, reason = await _service_user(hass, call)
        if reason is not None:
            return deny(reason, action=action)
        return authorize_user_action(manager, user, action)
    except Exception:  # noqa: BLE001 - fail closed
        return deny(DecisionReason.INTERNAL_ERROR, action=action)


async def require_service_capability(
    hass: HomeAssistant,
    manager: AccessPolicyManager | None,
    call: ServiceCall,
    capability: str,
    *,
    action: str | None = None,
) -> AuthorizationDecision:
    decision = await authorize_service_call(hass, manager, call, capability, action=action)
    if not decision.allowed:
        raise AuthorizationDeniedError(decision)
    return decision
