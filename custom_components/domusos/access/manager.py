"""The stored Domus access policy and the profile of each Home Assistant account.

The store is the authority for Domus roles and grants. A store that cannot be
trusted is never repaired by guessing and never overwritten: accounts fall to
the safe floor and only an explicit reset by a Home Assistant administrator
brings the defaults back. Nothing here is enforced yet: it only answers what
Domus would allow (docs/access-control-foundation.md).
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable, Iterable, Mapping
import glob
import logging
import os
from types import MappingProxyType
from typing import Any

from homeassistant.auth.models import User
from homeassistant.core import HomeAssistant
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from ..const import DOMAIN
from ..core import DomusRuntime
from ..core.audit import AuditEntry
from .authorization import identify
from .models import (
    STORAGE_KEY,
    STORAGE_VERSION,
    TRUSTED_STATES,
    AccessDeniedError,
    AccessProfile,
    Assignment,
    InvalidStoredDocumentError,
    MigrationFailedError,
    PolicyDocument,
    Principal,
    ResetFailedError,
    RevisionConflictError,
    SaveFailedError,
    StoreState,
    StoreUntrustedError,
    UnsupportedSchemaError,
    normalize_grants,
    orphaned_assignments,
    parse_role,
    parse_stored_document,
    resolve_access_profile,
    storage_document,
    with_assignment,
)

_LOGGER = logging.getLogger(__name__)

RuntimeProvider = Callable[[], DomusRuntime | None]

# Where the running manager is kept in ``hass.data[DOMAIN]``.
DATA_ACCESS_MANAGER = "access_manager"
ISSUE_POLICY_UNTRUSTED = "access_policy_untrusted"
# Files Home Assistant set aside because they could not be decoded.
_QUARANTINE_MARK = ".corrupt."
# What a reset keeps of the previous policy, never read again by Domus.
_RESET_MARK = ".reset."


def principal_from_user(user: User | None) -> Principal:
    """The principal of a request: a household account of Home Assistant, read on the server."""
    principal, _reason = identify(user)
    if principal is None:
        raise AccessDeniedError("This account has no access to Domus")
    return principal


class SetAsideError(Exception):
    """Moving the policy files stopped halfway; ``moved`` lists what was already moved."""

    def __init__(self, moved: list[str]) -> None:
        super().__init__(f"stopped after moving {len(moved)} file(s)")
        self.moved = moved


def set_aside_policy_files(path: str, stamp: str) -> list[str]:
    """Move the store and anything Home Assistant quarantined out of Domus's way; delete nothing.

    The quarantined copies go first and the store last: if a move fails, the
    store is still in place, so what is left on disk is never read as absent.
    """
    moved: list[str] = []
    try:
        for quarantined in sorted(glob.glob(f"{glob.escape(path)}{_QUARANTINE_MARK}*")):
            suffix = quarantined[len(path) + len(_QUARANTINE_MARK):]
            target = f"{path}{_RESET_MARK}{stamp}.corrupt-{suffix}"
            os.replace(quarantined, target)
            moved.append(os.path.basename(target))
        if os.path.exists(path):
            target = f"{path}{_RESET_MARK}{stamp}"
            os.replace(path, target)
            moved.append(os.path.basename(target))
    except OSError as err:
        raise SetAsideError(moved) from err
    return moved


class AccessPolicyManager:
    """Own the access policy store and resolve profiles from it."""

    def __init__(self, hass: HomeAssistant, runtime: RuntimeProvider | None = None) -> None:
        self.hass = hass
        self.store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self._runtime = runtime or (lambda: hass.data.get(DOMAIN, {}).get("runtime"))
        self._state = StoreState.ABSENT
        self._policy: PolicyDocument | None = None
        self._lock = asyncio.Lock()

    @property
    def state(self) -> StoreState:
        return self._state

    @property
    def revision(self) -> int:
        """The policy revision; 0 while no policy was ever saved."""
        return self._policy.revision if self._policy is not None else 0

    async def async_setup(self) -> None:
        """Load the policy; one that cannot be trusted is kept as it is and never used."""
        await self._async_load()

    async def _async_load(self) -> None:
        try:
            stored = await self.store.async_load()
        except NotImplementedError:
            # The Home Assistant envelope was written by a newer version.
            self._mark_untrusted(StoreState.UNSUPPORTED, "was written by a newer Domus")
            return
        except Exception as err:  # noqa: BLE001 - a failed load must not take Domus down
            self._mark_untrusted(StoreState.CORRUPT, f"could not be loaded ({err})")
            return
        if stored is None:
            if await self._async_quarantined_files():
                self._mark_untrusted(StoreState.CORRUPT, "could not be decoded and was set aside by Home Assistant")
            else:
                self._set_trusted(StoreState.ABSENT, None)
            return
        try:
            policy = parse_stored_document(stored)
        except UnsupportedSchemaError as err:
            self._mark_untrusted(StoreState.UNSUPPORTED, f"is not supported ({err})")
            return
        except MigrationFailedError as err:
            self._mark_untrusted(StoreState.MIGRATION_FAILED, f"could not be migrated ({err})")
            return
        except InvalidStoredDocumentError as err:
            self._mark_untrusted(StoreState.CORRUPT, f"is invalid ({err})")
            return
        self._set_trusted(StoreState.READY, policy)

    def _set_trusted(self, state: StoreState, policy: PolicyDocument | None) -> None:
        self._state = state
        self._policy = policy
        ir.async_delete_issue(self.hass, DOMAIN, ISSUE_POLICY_UNTRUSTED)

    def _mark_untrusted(self, state: StoreState, reason: str) -> None:
        self._state = state
        self._policy = None
        _LOGGER.error(
            "The Domus access policy %s; accounts other than administrators keep only "
            "the safe floor until a Home Assistant administrator resets it (%s/access/reset_policy)",
            reason,
            DOMAIN,
        )
        ir.async_create_issue(
            self.hass,
            DOMAIN,
            ISSUE_POLICY_UNTRUSTED,
            is_fixable=False,
            severity=ir.IssueSeverity.ERROR,
            translation_key=ISSUE_POLICY_UNTRUSTED,
            translation_placeholders={"state": state.value},
        )

    # --- Reading ---------------------------------------------------------------------

    def profile_for(self, user: User | None) -> AccessProfile:
        """What Domus allows this account now; Home Assistant still decides its own half."""
        return self.profile_for_principal(principal_from_user(user))

    def profile_for_principal(self, principal: Principal) -> AccessProfile:
        """The profile of an already verified principal; reads the policy, never changes it."""
        return resolve_access_profile(principal, self._state, self._policy)

    def orphaned_assignments(self, known_user_ids: Iterable[str]) -> list[str]:
        """Assignments of accounts Home Assistant no longer has; kept until someone removes them."""
        return orphaned_assignments(self._policy, known_user_ids)

    @property
    def assignments(self) -> Mapping[str, Assignment]:
        """The stored assignments, read only; none while the policy cannot be trusted."""
        if self._policy is None or self._state not in TRUSTED_STATES:
            return {}
        return MappingProxyType(dict(self._policy.assignments))

    # --- Changing (People and access, docs/access-control-people-access.md) -------------

    def require_access_manager(self, actor: User | None) -> Principal:
        """The account of the request, if it manages Domus access: an active Home Assistant administrator.

        Checked on the account itself: Home Assistant says it is an administrator
        and its Domus profile holds access.manage, which every administrator
        keeps even on the safe floor. Works whatever the state of the store.
        """
        principal = principal_from_user(actor)
        if not principal.is_admin or not self.profile_for_principal(principal).has("access.manage"):
            raise AccessDeniedError("Only Home Assistant administrators manage Domus access")
        return principal

    def _require_manager(self, actor: User | None) -> Principal:
        principal = self.require_access_manager(actor)
        if self._state not in TRUSTED_STATES:
            raise StoreUntrustedError("The access policy cannot be trusted; reset it first")
        return principal

    async def async_assign(
        self,
        actor: User | None,
        user_id: str,
        role: Any,
        grants: Any,
        expected_revision: int,
    ) -> int:
        """Give an account a role and personal grants; returns the policy revision."""
        principal = self._require_manager(actor)
        assignment = Assignment(
            role=parse_role(role),
            grants=normalize_grants(grants),
            assigned_at=dt_util.utcnow().isoformat(),
            assigned_by=principal.user_id,
        )
        async with self._lock:
            self._check_revision(expected_revision)
            current = self._policy.assignments.get(user_id) if self._policy is not None else None
            if current is not None and (current.role, current.grants) == (assignment.role, assignment.grants):
                # Nothing changes: no new revision, no write.
                return self.revision
            await self._async_write(user_id, assignment, principal.user_id)
            self._audit_assignment("assignment_changed", principal.user_id, user_id, current, assignment)
            return self.revision

    async def async_unassign(self, actor: User | None, user_id: str, expected_revision: int) -> int:
        """Return an account to its default role; returns the policy revision."""
        principal = self._require_manager(actor)
        async with self._lock:
            self._check_revision(expected_revision)
            if self._policy is None or user_id not in self._policy.assignments:
                return self.revision
            current = self._policy.assignments[user_id]
            await self._async_write(user_id, None, principal.user_id)
            self._audit_assignment("assignment_removed", principal.user_id, user_id, current, None)
            return self.revision

    def _check_revision(self, expected_revision: Any) -> None:
        if (
            not isinstance(expected_revision, int)
            or isinstance(expected_revision, bool)
            or expected_revision != self.revision
        ):
            raise RevisionConflictError("The access policy was changed elsewhere")

    async def _async_write(self, user_id: str, assignment: Assignment | None, actor: str) -> None:
        candidate = with_assignment(self._policy, user_id, assignment, actor=actor, at=dt_util.utcnow().isoformat())
        try:
            await self.store.async_save(storage_document(candidate))
        except Exception as err:  # noqa: BLE001 - reported to the caller, nothing half-applied
            _LOGGER.error("The Domus access policy could not be written: %s", err)
            raise SaveFailedError("The access policy could not be saved") from err
        self._set_trusted(StoreState.READY, candidate)

    # --- Recovery ----------------------------------------------------------------------

    async def async_reset(self, actor: User | None) -> dict[str, Any]:
        """Return every account to its default role, whatever the state of the store.

        Only an active Home Assistant administrator, the account of the
        websocket connection, may ask; there is no service an automation or a
        script could call. The account is checked before anything changes.
        The previous policy is kept beside the store, never deleted, and Domus
        never reads it again. Afterwards no policy exists: administrators are
        administrators and everyone else a member, exactly as before Access Control.
        """
        principal = principal_from_user(actor)
        if not principal.is_admin:
            raise AccessDeniedError("Only Home Assistant administrators reset Domus access")
        async with self._lock:
            previous_state = self._state
            previous_revision = self._policy.revision if self._policy is not None else None
            stamp = dt_util.utcnow().strftime("%Y-%m-%dT%H-%M-%S.%fZ")
            try:
                kept = await self.hass.async_add_executor_job(set_aside_policy_files, self.store.path, stamp)
                await self.store.async_remove()
            except Exception as err:  # noqa: BLE001 - never reported as done
                moved = err.moved if isinstance(err, SetAsideError) else []
                _LOGGER.error(
                    "The Domus access policy reset by %s did not finish (%s); moved %s; reloading what is on disk",
                    principal.user_id,
                    err,
                    ", ".join(moved) or "nothing",
                )
                # What is on disk decides the state again: a store still in place stays in force.
                await self._async_load()
                self._audit(
                    "policy_reset_failed",
                    self._state.value,
                    principal.user_id,
                    previous_state,
                    previous_revision,
                    moved,
                )
                raise ResetFailedError("The access policy could not be reset; nothing was deleted") from err
            self._set_trusted(StoreState.ABSENT, None)
        _LOGGER.warning(
            "The Domus access policy was reset by %s (previous state %s, revision %s); kept as %s",
            principal.user_id,
            previous_state.value,
            previous_revision,
            ", ".join(kept) or "nothing",
        )
        self._audit("policy_reset", StoreState.ABSENT.value, principal.user_id, previous_state, previous_revision, kept)
        return {
            "state": StoreState.ABSENT.value,
            "previous_state": previous_state.value,
            "previous_revision": previous_revision,
            "kept": kept,
        }

    def _audit_assignment(
        self,
        reason: str,
        actor: str,
        user_id: str,
        previous: Assignment | None,
        current: Assignment | None,
    ) -> None:
        """A security record of who changed whose access, from what to what; ids only, no names."""
        runtime = self._runtime()
        if runtime is None or not runtime.audit.running:
            return
        runtime.audit.record(
            AuditEntry.create(
                "access.policy",
                reason,
                result=StoreState.READY.value,
                metadata={
                    "actor": actor,
                    "user_id": user_id,
                    "revision": self.revision,
                    "previous_role": previous.role.value if previous is not None else None,
                    "previous_grants": list(previous.grants) if previous is not None else [],
                    "role": current.role.value if current is not None else None,
                    "grants": list(current.grants) if current is not None else [],
                },
            )
        )

    def _audit(
        self,
        reason: str,
        result: str,
        actor: str,
        previous_state: StoreState,
        previous_revision: int | None,
        files: list[str],
    ) -> None:
        runtime = self._runtime()
        if runtime is None or not runtime.audit.running:
            return
        runtime.audit.record(
            AuditEntry.create(
                "access.policy",
                reason,
                result=result,
                metadata={
                    "actor": actor,
                    "previous_state": previous_state.value,
                    "previous_revision": previous_revision,
                    "kept": files,
                },
            )
        )

    async def _async_quarantined_files(self) -> bool:
        pattern = f"{glob.escape(self.store.path)}{_QUARANTINE_MARK}*"
        return bool(await self.hass.async_add_executor_job(glob.glob, pattern))
