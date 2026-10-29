"""People and access: what an administrator sees and may change of each account.

The accounts are Home Assistant users, never persons: the policy is kept by
``user_id``, and a person linked to an account only lends it a name to show.
Only what the page needs is described here: id, name, administrator and
owner flags, whether the account is active, and its Domus role and grants. No
email, credential, token or other Home Assistant metadata.

Plain Python on purpose: no Home Assistant import.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from .models import (
    SYSTEM_ROLES,
    TRUSTED_STATES,
    AccessCapabilityId,
    AccountNotManageableError,
    Assignment,
    InvalidAssignmentError,
    RoleId,
    RoleRequiresHaAdminError,
    StoreState,
    default_role,
    normalize_grants,
    parse_role,
)


class AccountKind(StrEnum):
    # An active household account: its role and grants can be changed.
    MANAGEABLE = "manageable"
    # A disabled account: shown, never given new access.
    DISABLED = "disabled"


@dataclass(frozen=True, slots=True)
class AccountFacts:
    """What Home Assistant says of one account, read on the server."""

    user_id: str
    name: str
    is_admin: bool
    is_owner: bool
    is_active: bool
    system_generated: bool


def is_listed(facts: AccountFacts) -> bool:
    """System accounts (the Supervisor, add-ons, integrations) are not people: they are never listed."""
    return not facts.system_generated


def account_kind(facts: AccountFacts) -> AccountKind:
    if facts.system_generated:
        raise AccountNotManageableError("A system account has no Domus access to manage")
    return AccountKind.MANAGEABLE if facts.is_active else AccountKind.DISABLED


def require_manageable(facts: AccountFacts) -> None:
    """Only an active household account receives a role or grants."""
    if account_kind(facts) is not AccountKind.MANAGEABLE:
        raise AccountNotManageableError("A disabled account is never given new access")


def assignment_request(role: Any, grants: Any) -> tuple[RoleId, tuple[AccessCapabilityId, ...]]:
    """The role and grants an administrator asked for, as the policy will hold them.

    Only the assignable roles; only grants that are personally grantable
    (``access.control``, ``security.control``), each once. A grant the role
    already holds (an Administrator or a Resident has both) is validated, then
    not stored: the policy keeps only what adds to the role.
    """
    parsed = parse_role(role)
    if not isinstance(grants, (list, tuple)) or not all(isinstance(grant, str) for grant in grants):
        raise InvalidAssignmentError("The grants must be a list of names")
    valid = normalize_grants(sorted(set(grants)))  # refuses what could never be granted
    return parsed, tuple(grant for grant in valid if grant not in SYSTEM_ROLES[parsed])


def require_role_eligible(facts: AccountFacts, role: RoleId) -> None:
    """The Administrator role only for an account Home Assistant makes an administrator (Q24).

    Domus never grants more than Home Assistant does, and a non-administrator
    could never hold what the role promises. A Resident has full access to the
    house without administration.
    """
    if role is RoleId.ADMIN and facts.is_admin is not True:
        raise RoleRequiresHaAdminError("The Administrator role needs a Home Assistant administrator")


def account_view(
    facts: AccountFacts,
    state: StoreState,
    assignment: Assignment | None,
) -> dict[str, Any]:
    """One account as the page shows it; the role is the one the policy resolves today."""
    trusted = state in TRUSTED_STATES
    if not trusted:
        role, grants = RoleId.LOCKED, ()
    elif assignment is not None:
        role, grants = assignment.role, assignment.grants
    else:
        role, grants = default_role(facts.is_admin), ()
    return {
        "user_id": facts.user_id,
        "name": facts.name,
        "is_admin": facts.is_admin,
        "is_owner": facts.is_owner,
        "is_active": facts.is_active,
        "manageable": trusted and account_kind(facts) is AccountKind.MANAGEABLE,
        "role": role.value,
        "assigned": trusted and assignment is not None,
        "grants": list(grants),
    }


def accounts_view(
    accounts: Iterable[AccountFacts],
    state: StoreState,
    assignments: Mapping[str, Assignment],
) -> list[dict[str, Any]]:
    """Every listed account: active ones first, then by name, then by id, for a stable page."""
    listed = [facts for facts in accounts if is_listed(facts)]
    listed.sort(key=lambda facts: (not facts.is_active, facts.name.casefold(), facts.user_id))
    return [account_view(facts, state, assignments.get(facts.user_id)) for facts in listed]
