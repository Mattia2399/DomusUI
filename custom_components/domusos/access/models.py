"""Domus Access Control: what an account may do in Domus, decided from its Home Assistant user.

The principal is always the Home Assistant user id, read by the server from
the connection. A person, a device or anything the browser stores is never an
identity here (docs/access-control-architecture.md).

Domus only restricts: what an account may finally do is what Home Assistant
allows AND what Domus allows. This module holds the registry of access
capabilities, the system roles, the stored policy and how a profile is
resolved. It is plain Python on purpose: no Home Assistant import, so the
model is tested on its own.

These capabilities are about access. They are not the device capabilities of
Domus Core (``core.capabilities.CapabilityState``, e.g. a light's brightness):
the two sets never mix, and only ids in ``ACCESS_CAPABILITIES`` are accepted.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
import re
from typing import Any, NewType

STORAGE_KEY = "domusos.access.v1"
# The Home Assistant Store envelope; the policy carries its own schema version.
STORAGE_VERSION = 1
SCHEMA = "domusos-access-policy"
SCHEMA_VERSION = 1
MAX_ASSIGNMENTS = 500
MAX_AUDIT_RECORDS = 200

AccessCapabilityId = NewType("AccessCapabilityId", str)
"""An access capability id (``domain.action``); never a device capability."""

_CAPABILITY_ID = re.compile(r"^[a-z][a-z_]*\.[a-z][a-z_]*$")
# A Home Assistant user id (a uuid hex today); names and emails never match it.
_USER_ID = re.compile(r"^[A-Za-z0-9_-]{1,128}$")


# --- Errors ------------------------------------------------------------------------


class AccessError(Exception):
    """An expected failure with a stable code for the websocket API."""

    code = "access_error"


class AccessUnavailableError(AccessError):
    code = "access_unavailable"


class AccessDeniedError(AccessError):
    code = "access_denied"


class InvalidAssignmentError(AccessError):
    """An assignment that the policy can never hold; nothing changes."""

    code = "invalid_assignment"


class RevisionConflictError(AccessError):
    code = "revision_conflict"


class StoreUntrustedError(AccessError):
    """The stored policy cannot be trusted; it is never changed until a reset."""

    code = "access_store_untrusted"


class SaveFailedError(AccessError):
    code = "save_failed"


class ResetFailedError(AccessError):
    """A reset did not finish; the policy is reloaded from what is on disk, nothing is deleted."""

    code = "reset_failed"


class InvalidStoredDocumentError(Exception):
    """The stored policy breaks the schema: the whole document is refused."""


class UnsupportedSchemaError(Exception):
    """The stored policy was written by a newer Domus; it is left untouched."""


class MigrationFailedError(Exception):
    """An older policy could not be brought to the current schema."""


# --- Registry ------------------------------------------------------------------------


class Risk(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class EnforcementKind(StrEnum):
    """Where a capability can really be enforced."""

    # The Domus backend runs the command: a real boundary.
    DOMUS = "domus"
    # The browser calls Home Assistant directly: Domus only shapes its UI, Home Assistant decides.
    HA_NATIVE = "ha_native"
    # A preference or a control of this browser: UX only.
    LOCAL = "local"


@dataclass(frozen=True, slots=True)
class AccessCapability:
    """One thing an account may do in Domus, by area and verb, never a single button."""

    id: AccessCapabilityId
    risk: Risk
    enforcement: EnforcementKind
    # Home Assistant itself only allows it to administrators.
    requires_ha_admin: bool
    # May be granted to one account on top of its role.
    user_grantable: bool
    description: str

    @property
    def domain(self) -> str:
        return self.id.split(".", 1)[0]

    @property
    def action(self) -> str:
        return self.id.split(".", 1)[1]


def _capability(
    capability_id: str,
    risk: Risk,
    enforcement: EnforcementKind,
    description: str,
    *,
    requires_ha_admin: bool = False,
    user_grantable: bool = False,
) -> AccessCapability:
    return AccessCapability(
        id=AccessCapabilityId(capability_id),
        risk=risk,
        enforcement=enforcement,
        requires_ha_admin=requires_ha_admin,
        user_grantable=user_grantable,
        description=description,
    )


_D, _N, _L = EnforcementKind.DOMUS, EnforcementKind.HA_NATIVE, EnforcementKind.LOCAL

ACCESS_CAPABILITIES: Mapping[str, AccessCapability] = {
    capability.id: capability
    for capability in (
        _capability("dashboard.view", Risk.LOW, _N, "See Home and its cards"),
        _capability("dashboard.edit", Risk.MEDIUM, _N, "Change the shared layout and cards", requires_ha_admin=True),
        _capability("dashboard.reset", Risk.HIGH, _N, "Reset the shared dashboard", requires_ha_admin=True),
        _capability("rooms.view", Risk.LOW, _N, "See the rooms"),
        _capability("devices.control", Risk.MEDIUM, _N, "Lights, plugs, climate, blinds, media, vacuums, fans"),
        _capability(
            "access.control",
            Risk.HIGH,
            _N,
            "Physical access: locks, doors, gates, garage doors and other motorized entrances",
            user_grantable=True,
        ),
        _capability("security.view", Risk.MEDIUM, _N, "The Security page, cameras and sensors"),
        _capability(
            "security.control",
            Risk.HIGH,
            _N,
            "The alarm: arm, disarm and its modes",
            user_grantable=True,
        ),
        _capability("security.manage", Risk.HIGH, _N, "Security settings and protected cards", requires_ha_admin=True),
        _capability("automations.view", Risk.LOW, _N, "See the automations"),
        _capability("automations.run", Risk.MEDIUM, _N, "Run scenes, scripts and automations"),
        _capability("automations.manage", Risk.HIGH, _N, "Create and change automations", requires_ha_admin=True),
        _capability("energy.view", Risk.LOW, _D, "Energy state and history"),
        _capability("energy.manage", Risk.MEDIUM, _D, "The Energy installation profile and discovery", requires_ha_admin=True),
        _capability("irrigation.view", Risk.LOW, _D, "Irrigation zones, calendar, activity and usage"),
        _capability("irrigation.control", Risk.MEDIUM, _D, "Start, stop and pause irrigation"),
        _capability("irrigation.manage", Risk.MEDIUM, _D, "Irrigation configuration", requires_ha_admin=True),
        _capability("waste.view", Risk.LOW, _D, "The waste collection calendar and its preview"),
        _capability("waste.manage", Risk.LOW, _D, "Waste collection settings and test", requires_ha_admin=True),
        _capability("house.manage", Risk.MEDIUM, _N, "Floors, areas and rooms", requires_ha_admin=True),
        _capability("people.view", Risk.LOW, _N, "The members and people of the house"),
        _capability("people.manage", Risk.HIGH, _N, "Create people, link accounts, pictures", requires_ha_admin=True),
        _capability("access.manage", Risk.CRITICAL, _D, "Domus roles and their recovery", requires_ha_admin=True),
        _capability("system.view", Risk.LOW, _N, "The System page and diagnostics"),
        _capability("system.manage", Risk.HIGH, _N, "Connection, devices and entities", requires_ha_admin=True),
        _capability("backup.export", Risk.MEDIUM, _L, "Download the configuration"),
        _capability("backup.restore", Risk.HIGH, _N, "Restore a configuration", requires_ha_admin=True),
        _capability("ha.restart", Risk.CRITICAL, _N, "Restart Home Assistant", requires_ha_admin=True),
        _capability(
            "ha_frontend.open",
            Risk.LOW,
            _L,
            "The Back to Home Assistant command; hiding it does not stop opening Home Assistant directly",
        ),
        _capability("device.manage", Risk.LOW, _L, "Appearance, language, screensaver, kiosk and attention of this device"),
        _capability("device_power.manage", Risk.HIGH, _D, "Power and charging of the devices", requires_ha_admin=True),
        _capability("profile.manage", Risk.LOW, _D, "Your own profile, personal devices and test notification"),
        _capability("notifications.recipients", Risk.MEDIUM, _D, "Choose notification recipients", requires_ha_admin=True),
        _capability("developer.use", Risk.LOW, _L, "Developer mode"),
    )
}

ACCESS_MANAGE = AccessCapabilityId("access.manage")


def capability(capability_id: str) -> AccessCapability | None:
    """The registry entry for an id, or None for anything that is not an access capability."""
    return ACCESS_CAPABILITIES.get(capability_id) if isinstance(capability_id, str) else None


# --- Roles ---------------------------------------------------------------------------


class RoleId(StrEnum):
    ADMIN = "admin"
    MEMBER = "member"
    RESTRICTED = "restricted"
    WALL_PANEL = "wall_panel"
    # Internal only: what an account keeps while the policy cannot be trusted.
    LOCKED = "locked"


ASSIGNABLE_ROLES = frozenset({RoleId.ADMIN, RoleId.MEMBER, RoleId.RESTRICTED, RoleId.WALL_PANEL})


def _ids(*ids: str) -> frozenset[AccessCapabilityId]:
    return frozenset(AccessCapabilityId(capability_id) for capability_id in ids)


# System roles: immutable presets, versioned with the integration and never stored.
SYSTEM_ROLES: Mapping[RoleId, frozenset[AccessCapabilityId]] = {
    # Everything; what Home Assistant keeps to administrators still needs one.
    RoleId.ADMIN: frozenset(ACCESS_CAPABILITIES),
    # The everyday user of the house. Locks, gates and the alarm only by a personal grant.
    RoleId.MEMBER: _ids(
        "dashboard.view",
        "rooms.view",
        "devices.control",
        "security.view",
        "automations.view",
        "automations.run",
        "energy.view",
        "irrigation.view",
        "irrigation.control",
        "waste.view",
        "people.view",
        "system.view",
        "device.manage",
        "profile.manage",
    ),
    # Deliberately small: the house and its everyday devices, nothing sensitive.
    RoleId.RESTRICTED: _ids(
        "dashboard.view",
        "rooms.view",
        "devices.control",
        "irrigation.view",
        "waste.view",
        "profile.manage",
    ),
    # A Home Assistant account used by a dedicated panel; not the Kiosk mode of a browser.
    RoleId.WALL_PANEL: _ids(
        "dashboard.view",
        "rooms.view",
        "devices.control",
        "security.view",
        "automations.run",
        "energy.view",
        "irrigation.view",
        "waste.view",
    ),
    RoleId.LOCKED: _ids("dashboard.view", "rooms.view", "profile.manage"),
}


def default_role(is_admin: bool) -> RoleId:
    """The role of an account with no assignment: what it can do in Domus today."""
    return RoleId.ADMIN if is_admin else RoleId.MEMBER


# --- Stored policy -------------------------------------------------------------------


class StoreState(StrEnum):
    # No policy was ever saved: every account has its default role.
    ABSENT = "absent"
    READY = "ready"
    CORRUPT = "corrupt"
    # Written by a newer Domus: left untouched.
    UNSUPPORTED = "unsupported"
    MIGRATION_FAILED = "migration_failed"


TRUSTED_STATES = frozenset({StoreState.ABSENT, StoreState.READY})


class AuditEvent(StrEnum):
    ASSIGNMENT_CHANGED = "assignment_changed"
    ASSIGNMENT_REMOVED = "assignment_removed"


@dataclass(frozen=True, slots=True)
class Assignment:
    """One account's role and its personal grants, keyed by the Home Assistant user id."""

    role: RoleId
    grants: tuple[AccessCapabilityId, ...]
    assigned_at: str
    assigned_by: str | None

    def to_storage(self) -> dict[str, Any]:
        return {
            "role": self.role.value,
            "grants": list(self.grants),
            "assigned_at": self.assigned_at,
            "assigned_by": self.assigned_by,
        }


@dataclass(frozen=True, slots=True)
class AuditRecord:
    """A change of the policy: who, when and what; ids only, never names."""

    at: str
    event: AuditEvent
    actor: str | None
    user_id: str
    revision: int
    role: RoleId | None = None
    grants: tuple[AccessCapabilityId, ...] = ()

    def to_storage(self) -> dict[str, Any]:
        return {
            "at": self.at,
            "event": self.event.value,
            "actor": self.actor,
            "user_id": self.user_id,
            "revision": self.revision,
            "role": self.role.value if self.role is not None else None,
            "grants": list(self.grants),
        }


@dataclass(frozen=True, slots=True)
class PolicyDocument:
    revision: int
    updated_at: str
    assignments: Mapping[str, Assignment]
    audit: tuple[AuditRecord, ...] = ()


def is_user_id(value: Any) -> bool:
    return isinstance(value, str) and _USER_ID.fullmatch(value) is not None


def _timestamp(value: Any) -> bool:
    if not isinstance(value, str) or not value:
        return False
    try:
        datetime.fromisoformat(value)
    except ValueError:
        return False
    return True


def _revision(value: Any, minimum: int) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= minimum


def normalize_grants(grants: Any) -> tuple[AccessCapabilityId, ...]:
    """Grants as stored: known, personally grantable, no duplicate, in a stable order."""
    if not isinstance(grants, (list, tuple)):
        raise InvalidAssignmentError("The grants must be a list")
    seen: set[str] = set()
    for grant in grants:
        entry = capability(grant)
        if entry is None:
            raise InvalidAssignmentError(f"Unknown capability {grant!r}")
        if not entry.user_grantable:
            raise InvalidAssignmentError(f"{grant} cannot be granted to an account")
        if grant in seen:
            raise InvalidAssignmentError(f"{grant} is granted twice")
        seen.add(grant)
    return tuple(sorted(AccessCapabilityId(grant) for grant in seen))


def parse_role(value: Any) -> RoleId:
    """An assignable role; the internal ``locked`` never is."""
    try:
        role = RoleId(value)
    except ValueError as err:
        raise InvalidAssignmentError(f"Unknown role {value!r}") from err
    if role not in ASSIGNABLE_ROLES:
        raise InvalidAssignmentError(f"The role {role} cannot be assigned")
    return role


def _stored_assignment(raw: Any) -> Assignment:
    if not isinstance(raw, Mapping) or set(raw) != {"role", "grants", "assigned_at", "assigned_by"}:
        raise InvalidStoredDocumentError("an assignment does not have the expected fields")
    try:
        role = parse_role(raw["role"])
        grants = normalize_grants(raw["grants"])
    except InvalidAssignmentError as err:
        # A security policy with a wrong value is not repaired by guessing what was meant.
        raise InvalidStoredDocumentError(str(err)) from err
    if not _timestamp(raw["assigned_at"]):
        raise InvalidStoredDocumentError("an assignment has no valid date")
    if raw["assigned_by"] is not None and not is_user_id(raw["assigned_by"]):
        raise InvalidStoredDocumentError("an assignment names an invalid author")
    return Assignment(role=role, grants=grants, assigned_at=raw["assigned_at"], assigned_by=raw["assigned_by"])


_AUDIT_KEYS = frozenset({"at", "event", "actor", "user_id", "revision", "role", "grants"})


def _stored_audit(raw: Any) -> AuditRecord:
    if not isinstance(raw, Mapping) or set(raw) != _AUDIT_KEYS:
        raise InvalidStoredDocumentError("an audit record does not have the expected fields")
    try:
        event = AuditEvent(raw["event"])
        role = parse_role(raw["role"]) if raw["role"] is not None else None
        grants = normalize_grants(raw["grants"])
    except (ValueError, InvalidAssignmentError) as err:
        raise InvalidStoredDocumentError(f"an audit record is invalid ({err})") from err
    if not _timestamp(raw["at"]) or not is_user_id(raw["user_id"]) or not _revision(raw["revision"], 1):
        raise InvalidStoredDocumentError("an audit record is invalid")
    if raw["actor"] is not None and not is_user_id(raw["actor"]):
        raise InvalidStoredDocumentError("an audit record names an invalid author")
    return AuditRecord(
        at=raw["at"],
        event=event,
        actor=raw["actor"],
        user_id=raw["user_id"],
        revision=raw["revision"],
        role=role,
        grants=grants,
    )


_DOCUMENT_KEYS = frozenset({"schema", "version", "revision", "updated_at", "assignments", "audit"})

# Pure steps from one schema version to the next: MIGRATIONS[1] turns a v1 document into v2.
Migration = Callable[[Mapping[str, Any]], Mapping[str, Any]]
MIGRATIONS: Mapping[int, Migration] = {}


def migrate_document(
    document: Mapping[str, Any],
    migrations: Mapping[int, Migration] = MIGRATIONS,
    target: int = SCHEMA_VERSION,
) -> Mapping[str, Any]:
    """Bring an older document to ``target``, one version at a time, or fail without guessing."""
    version = document.get("version")
    while version != target:
        step = migrations.get(version)
        if step is None:
            raise MigrationFailedError(f"no migration from version {version}")
        try:
            document = step(document)
        except Exception as err:  # noqa: BLE001 - any failure leaves the original untouched
            raise MigrationFailedError(f"the migration from version {version} failed ({err})") from err
        if not isinstance(document, Mapping) or document.get("version") != version + 1:
            raise MigrationFailedError(f"the migration from version {version} gave no version {version + 1}")
        version = document["version"]
    return document


def parse_stored_document(
    document: Any,
    migrations: Mapping[int, Migration] = MIGRATIONS,
    current: int = SCHEMA_VERSION,
) -> PolicyDocument:
    """Read the stored policy, or refuse the whole document.

    Nothing is filtered out to make a document fit: an unknown role, an
    unknown capability or a grant that cannot be granted makes it corrupt.
    """
    if not isinstance(document, Mapping) or document.get("schema") != SCHEMA:
        raise InvalidStoredDocumentError("the document is not a Domus access policy")
    version = document.get("version")
    if not _revision(version, 1):
        raise InvalidStoredDocumentError("the document has no valid version")
    if version > current:
        raise UnsupportedSchemaError(f"version {version} is newer than {current}")
    if version < current:
        document = migrate_document(document, migrations, current)
    if set(document) != _DOCUMENT_KEYS:
        raise InvalidStoredDocumentError("the document does not have the expected fields")
    if not _revision(document["revision"], 1) or not _timestamp(document["updated_at"]):
        raise InvalidStoredDocumentError("the document has no valid revision")
    raw_assignments = document["assignments"]
    if not isinstance(raw_assignments, Mapping) or len(raw_assignments) > MAX_ASSIGNMENTS:
        raise InvalidStoredDocumentError("the assignments are not valid")
    assignments: dict[str, Assignment] = {}
    for user_id, raw in raw_assignments.items():
        if not is_user_id(user_id):
            raise InvalidStoredDocumentError("an assignment is not keyed by a user id")
        assignments[user_id] = _stored_assignment(raw)
    raw_audit = document["audit"]
    if not isinstance(raw_audit, list) or len(raw_audit) > MAX_AUDIT_RECORDS:
        raise InvalidStoredDocumentError("the audit is not valid")
    return PolicyDocument(
        revision=document["revision"],
        updated_at=document["updated_at"],
        assignments=assignments,
        audit=tuple(_stored_audit(raw) for raw in raw_audit),
    )


def storage_document(policy: PolicyDocument) -> dict[str, Any]:
    return {
        "schema": SCHEMA,
        "version": SCHEMA_VERSION,
        "revision": policy.revision,
        "updated_at": policy.updated_at,
        "assignments": {user_id: assignment.to_storage() for user_id, assignment in sorted(policy.assignments.items())},
        "audit": [record.to_storage() for record in policy.audit],
    }


def with_assignment(
    policy: PolicyDocument | None,
    user_id: str,
    assignment: Assignment | None,
    *,
    actor: str | None,
    at: str,
) -> PolicyDocument:
    """The next policy: one assignment set or removed, a new revision and one audit record."""
    if not is_user_id(user_id):
        raise InvalidAssignmentError("Choose an account")
    assignments = dict(policy.assignments) if policy is not None else {}
    if assignment is None:
        assignments.pop(user_id, None)
    else:
        assignments[user_id] = assignment
    if len(assignments) > MAX_ASSIGNMENTS:
        raise InvalidAssignmentError(f"At most {MAX_ASSIGNMENTS} assignments")
    revision = (policy.revision if policy is not None else 0) + 1
    record = AuditRecord(
        at=at,
        event=AuditEvent.ASSIGNMENT_REMOVED if assignment is None else AuditEvent.ASSIGNMENT_CHANGED,
        actor=actor,
        user_id=user_id,
        revision=revision,
        role=assignment.role if assignment is not None else None,
        grants=assignment.grants if assignment is not None else (),
    )
    audit = ((policy.audit if policy is not None else ()) + (record,))[-MAX_AUDIT_RECORDS:]
    return PolicyDocument(revision=revision, updated_at=at, assignments=assignments, audit=audit)


def orphaned_assignments(policy: PolicyDocument | None, known_user_ids: Iterable[str]) -> list[str]:
    """Assignments whose account Home Assistant no longer has; kept, never removed on their own."""
    if policy is None:
        return []
    known = set(known_user_ids)
    return sorted(user_id for user_id in policy.assignments if user_id not in known)


# --- Resolution ----------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class Principal:
    """The Home Assistant user behind a request, as the server sees it now.

    ``is_admin`` comes from Home Assistant on every request and is never stored:
    a demotion applies at the next request, without a new policy revision.
    """

    user_id: str
    is_admin: bool
    is_owner: bool = False


class ProfileSource(StrEnum):
    DEFAULT = "default"
    ASSIGNMENT = "assignment"
    # The policy cannot be trusted: the safe floor, plus recovery for administrators.
    FAIL_CLOSED = "fail_closed"


@dataclass(frozen=True, slots=True)
class AccessProfile:
    role: RoleId
    grants: tuple[AccessCapabilityId, ...]
    capabilities: frozenset[AccessCapabilityId]
    state: StoreState
    revision: int
    source: ProfileSource

    def has(self, capability_id: str) -> bool:
        return capability_id in self.capabilities


def resolve_access_profile(
    principal: Principal,
    state: StoreState,
    policy: PolicyDocument | None,
) -> AccessProfile:
    """What Domus allows this account: its role's capabilities plus its valid grants.

    - No assignment: the default role (administrator or member).
    - Policy not trusted: the internal ``locked`` floor, never a default.
    - What Home Assistant keeps to administrators is removed for anyone else.
    - Every Home Assistant administrator can always manage access, so the
      house is never locked out; nothing else is added to them.
    This is Domus's half of "Home Assistant AND Domus"; Home Assistant still
    checks its own half on every command.
    """
    revision = policy.revision if policy is not None and state is StoreState.READY else 0
    if state not in TRUSTED_STATES:
        role, grants, source = RoleId.LOCKED, (), ProfileSource.FAIL_CLOSED
    else:
        assignment = policy.assignments.get(principal.user_id) if policy is not None and state is StoreState.READY else None
        if assignment is None:
            role, grants, source = default_role(principal.is_admin), (), ProfileSource.DEFAULT
        else:
            role, grants, source = assignment.role, assignment.grants, ProfileSource.ASSIGNMENT
    granted = set(SYSTEM_ROLES[role]) | set(grants)
    capabilities = {
        capability_id
        for capability_id in granted
        if (entry := capability(capability_id)) is not None and (principal.is_admin or not entry.requires_ha_admin)
    }
    if principal.is_admin:
        capabilities.add(ACCESS_MANAGE)
    return AccessProfile(
        role=role,
        grants=grants,
        capabilities=frozenset(capabilities),
        state=state,
        revision=revision,
        source=source,
    )
