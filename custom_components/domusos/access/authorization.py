"""Domus Access Control: the one place that decides whether a request is authorized.

Features never test roles, administrators or capability lists themselves:
they ask ``can``, ``authorize`` or ``require_capability`` here
(docs/access-control-authorization.md). This module only decides. It is not
wired to any command yet, so nothing is enforced by it today.

The decision is Domus's half of "Home Assistant AND Domus": Home Assistant
still checks its own half (administrators, entity permissions) on every
command, and Domus never grants what Home Assistant refuses.

Plain Python on purpose: no Home Assistant import, so it is tested anywhere.
Any unexpected error is a deny, never an allow.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from .actions import ACTION_CONTRACTS, ActionContract, AuthMode
from .models import (
    AccessDeniedError,
    AccessProfile,
    EnforcementKind,
    Principal,
    RoleId,
    StoreState,
    capability as capability_entry,
    is_user_id,
)


class DecisionReason(StrEnum):
    """Why a request was allowed or denied; stable codes, never UI text."""

    ALLOWED = "allowed"
    # The account is valid but its role and grants do not include the capability.
    MISSING_CAPABILITY = "missing_capability"
    # The policy cannot be trusted: the account is on the safe floor.
    LOCKED = "locked"
    # No account at all (a service call without a user, for example).
    NO_PRINCIPAL = "no_principal"
    # A system account, an unknown user or an identity that is not well formed.
    INVALID_PRINCIPAL = "invalid_principal"
    INACTIVE_USER = "inactive_user"
    # Home Assistant only allows the capability to administrators.
    REQUIRES_HA_ADMIN = "requires_ha_admin"
    # The access policy is not running, or no profile could be resolved.
    POLICY_UNAVAILABLE = "policy_unavailable"
    UNKNOWN_CAPABILITY = "unknown_capability"
    # An action nobody declared in the action registry.
    UNKNOWN_ACTION = "unknown_action"
    INTERNAL_ERROR = "internal_error"


@dataclass(frozen=True, slots=True)
class AuthorizationDecision:
    """One decision, rich enough to be compared with today's behaviour later (shadow mode).

    It carries ids and codes only: no name, email, person or picture, and never
    the policy of anyone else.
    """

    allowed: bool
    reason: DecisionReason
    # The capability asked for, as asked (it may be unknown).
    capability: str | None
    action: str | None = None
    principal_id: str | None = None
    role: RoleId | None = None
    policy_state: StoreState | None = None
    policy_revision: int | None = None
    requires_ha_admin: bool | None = None
    enforcement: EnforcementKind | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "allowed": self.allowed,
            "reason": self.reason.value,
            "capability": self.capability,
            "action": self.action,
            "principal_id": self.principal_id,
            "role": self.role.value if self.role is not None else None,
            "policy_state": self.policy_state.value if self.policy_state is not None else None,
            "policy_revision": self.policy_revision,
            "requires_ha_admin": self.requires_ha_admin,
            "enforcement": self.enforcement.value if self.enforcement is not None else None,
        }


class AuthorizationDeniedError(AccessDeniedError):
    """A denied request, raised by ``require_capability``; carries the decision, no UI text."""

    def __init__(self, decision: AuthorizationDecision) -> None:
        super().__init__(f"{decision.reason.value}: {decision.capability or decision.action}")
        self.decision = decision

    @property
    def reason(self) -> DecisionReason:
        return self.decision.reason


# --- Identity ------------------------------------------------------------------------


def identify(user: Any) -> tuple[Principal | None, DecisionReason | None]:
    """The principal of a Home Assistant user, or why there is none.

    ``user`` is the user Home Assistant attached to the request (a
    websocket connection or a service call context), never something a client
    sent. Only household accounts are principals: no system account, no
    disabled account, no malformed id.
    """
    if user is None:
        return None, DecisionReason.NO_PRINCIPAL
    try:
        if getattr(user, "system_generated", False):
            return None, DecisionReason.INVALID_PRINCIPAL
        if not getattr(user, "is_active", False):
            return None, DecisionReason.INACTIVE_USER
        user_id = getattr(user, "id", None)
        if not is_user_id(user_id):
            return None, DecisionReason.INVALID_PRINCIPAL
        return (
            Principal(
                user_id=user_id,
                is_admin=getattr(user, "is_admin", False) is True,
                is_owner=getattr(user, "is_owner", False) is True,
            ),
            None,
        )
    except Exception:  # noqa: BLE001 - an identity that cannot be read is no identity
        return None, DecisionReason.INVALID_PRINCIPAL


# --- Evaluation ----------------------------------------------------------------------


def _decision(
    allowed: bool,
    reason: DecisionReason,
    capability: str | None,
    *,
    action: str | None,
    principal: Principal | None,
    profile: AccessProfile | None,
) -> AuthorizationDecision:
    entry = capability_entry(capability) if capability is not None else None
    return AuthorizationDecision(
        allowed=allowed,
        reason=reason,
        capability=capability,
        action=action,
        principal_id=principal.user_id if principal is not None else None,
        role=profile.role if profile is not None else None,
        policy_state=profile.state if profile is not None else None,
        policy_revision=profile.revision if profile is not None else None,
        requires_ha_admin=entry.requires_ha_admin if entry is not None else None,
        enforcement=entry.enforcement if entry is not None else None,
    )


def deny(
    reason: DecisionReason,
    capability: str | None = None,
    *,
    action: str | None = None,
    principal: Principal | None = None,
    profile: AccessProfile | None = None,
) -> AuthorizationDecision:
    """A denial for a request that never reached the evaluation (no principal, no policy...)."""
    if reason is DecisionReason.ALLOWED:
        reason = DecisionReason.INTERNAL_ERROR
    return _decision(False, reason, capability, action=action, principal=principal, profile=profile)


def _evaluate(
    principal: Principal | None,
    profile: AccessProfile | None,
    capability: str,
    action: str | None,
) -> AuthorizationDecision:
    def result(allowed: bool, reason: DecisionReason) -> AuthorizationDecision:
        return _decision(allowed, reason, capability, action=action, principal=principal, profile=profile)

    if principal is None:
        return result(False, DecisionReason.NO_PRINCIPAL)
    if not isinstance(principal, Principal) or not is_user_id(principal.user_id):
        return result(False, DecisionReason.INVALID_PRINCIPAL)
    if not isinstance(profile, AccessProfile):
        return result(False, DecisionReason.POLICY_UNAVAILABLE)
    entry = capability_entry(capability)
    if entry is None:
        return result(False, DecisionReason.UNKNOWN_CAPABILITY)
    # Checked again even though profiles already leave these out for anyone else:
    # a profile built wrongly must not be enough.
    if entry.requires_ha_admin and principal.is_admin is not True:
        return result(False, DecisionReason.REQUIRES_HA_ADMIN)
    if capability in profile.capabilities:
        return result(True, DecisionReason.ALLOWED)
    if profile.role is RoleId.LOCKED:
        return result(False, DecisionReason.LOCKED)
    return result(False, DecisionReason.MISSING_CAPABILITY)


def authorize(
    principal: Principal | None,
    profile: AccessProfile | None,
    capability: str,
    *,
    action: str | None = None,
) -> AuthorizationDecision:
    """The full decision for one capability; never raises, never allows by mistake."""
    try:
        return _evaluate(principal, profile, capability, action)
    except Exception:  # noqa: BLE001 - an error is a deny, whatever it is
        return AuthorizationDecision(
            allowed=False,
            reason=DecisionReason.INTERNAL_ERROR,
            capability=capability if isinstance(capability, str) else None,
            action=action if isinstance(action, str) else None,
        )


def can(principal: Principal | None, profile: AccessProfile | None, capability: str) -> bool:
    """Whether the capability is allowed; False on anything unexpected."""
    try:
        return authorize(principal, profile, capability).allowed is True
    except Exception:  # noqa: BLE001 - fail closed
        return False


def require_capability(
    principal: Principal | None,
    profile: AccessProfile | None,
    capability: str,
    *,
    action: str | None = None,
) -> AuthorizationDecision:
    """Return the allowing decision, or raise ``AuthorizationDeniedError`` with the denial."""
    decision = authorize(principal, profile, capability, action=action)
    if not decision.allowed:
        raise AuthorizationDeniedError(decision)
    return decision


# --- Actions -------------------------------------------------------------------------


def authorize_action(
    principal: Principal | None,
    profile: AccessProfile | None,
    action: str,
    contracts: Mapping[str, ActionContract] | None = None,
) -> AuthorizationDecision:
    """The decision for a declared backend action, following its contract.

    - ``capability``: the action's capability decides.
    - ``authenticated_bootstrap``: any valid account (how a client learns its
      own capabilities); still no request without a principal or a policy.
    - ``recovery``: access management, which only a Home Assistant
      administrator ever has.
    An action that is not declared is denied.
    """
    try:
        registry = ACTION_CONTRACTS if contracts is None else contracts
        contract = registry.get(action) if isinstance(action, str) else None
        if contract is None:
            return deny(DecisionReason.UNKNOWN_ACTION, action=action if isinstance(action, str) else None, principal=principal)
        if contract.auth_mode is AuthMode.AUTHENTICATED_BOOTSTRAP:
            if principal is None:
                return deny(DecisionReason.NO_PRINCIPAL, action=action)
            if not isinstance(principal, Principal) or not is_user_id(principal.user_id):
                return deny(DecisionReason.INVALID_PRINCIPAL, action=action)
            if not isinstance(profile, AccessProfile):
                return deny(DecisionReason.POLICY_UNAVAILABLE, action=action, principal=principal)
            return _decision(True, DecisionReason.ALLOWED, None, action=action, principal=principal, profile=profile)
        return authorize(principal, profile, contract.capability, action=action)
    except Exception:  # noqa: BLE001 - fail closed
        return AuthorizationDecision(
            allowed=False,
            reason=DecisionReason.INTERNAL_ERROR,
            capability=None,
            action=action if isinstance(action, str) else None,
        )


def require_action(
    principal: Principal | None,
    profile: AccessProfile | None,
    action: str,
) -> AuthorizationDecision:
    decision = authorize_action(principal, profile, action)
    if not decision.allowed:
        raise AuthorizationDeniedError(decision)
    return decision
