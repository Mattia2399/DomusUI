"""Versioned Domus Profile document: schema, strict validation and errors.

A Domus Profile extends a Home Assistant user. It never copies what Home
Assistant owns (name, email, picture, role, presence, person entity id): those
are read live. The document only holds what Domus adds on top.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

STORAGE_KEY = "domusos.profiles.v1"
STORAGE_VERSION = 1
DOCUMENT_SCHEMA = "domusos-profiles"
DOCUMENT_VERSION = 1

PROFILE_STATE_ACTIVE = "active"
PROFILE_STATE_ORPHANED = "orphaned"
PROFILE_STATES = frozenset({PROFILE_STATE_ACTIVE, PROFILE_STATE_ORPHANED})

DEVICE_SOURCE_HA_DEVICE = "ha_device"
MAX_PERSONAL_DEVICES = 10
MAX_DEVICE_LABEL_LENGTH = 64

# Home Assistant user and device registry ids are uuid hex strings; the pattern
# stays a little wider so a future id format is rejected only if it is unsafe.
HA_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
DEVICE_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")

PROFILE_KEYS = frozenset(
    {
        "owner_user_id",
        "revision",
        "created_at",
        "updated_at",
        "state",
        "orphaned_at",
        "personal_devices",
        "notifications",
        "preferences",
    }
)
DEVICE_KEYS = frozenset({"id", "source", "label", "added_at", "notifications"})
SELF_EDITABLE_KEYS = frozenset({"notifications", "preferences", "personal_devices"})


class ProfileError(Exception):
    """Base error surfaced through the websocket API with a stable code."""

    code = "profile_error"


class NotHouseholdAccountError(ProfileError):
    """System-generated accounts have no Domus Profile."""

    code = "not_household_account"


class AccountDisabledError(ProfileError):
    """A disabled account keeps its profile but cannot use it."""

    code = "account_disabled"


class ProfileUnavailableError(ProfileError):
    """The Profile Core is not running."""

    code = "profile_unavailable"


class InvalidProfileError(ProfileError):
    """A profile sent by a client does not match the schema."""

    code = "invalid_profile"


class RevisionConflictError(ProfileError):
    """The profile changed since the client read it."""

    code = "revision_conflict"


class DeviceManagementNotAvailableError(ProfileError):
    """save_self never changes personal devices; the device commands do."""

    code = "device_management_not_available"


class StoreCorruptError(ProfileError):
    """The stored document is invalid; it is kept as is and never overwritten."""

    code = "store_corrupt"


class AmbiguousPersonIdentityError(ProfileError):
    """More than one Home Assistant person matches one identity."""

    code = "ambiguous_person_identity"


class DeviceNotFoundError(ProfileError):
    """The Home Assistant device does not exist."""

    code = "device_not_found"


class DeviceNotClaimableError(ProfileError):
    """Home Assistant cannot prove that the device belongs to this user.

    Also raised for another user's device: the owner is never revealed.
    """

    code = "device_not_claimable"


class DeviceOwnedByOtherProfileError(ProfileError):
    """Another active profile owns the device; its owner is never revealed."""

    code = "device_owned_by_other_profile"


class DeviceOwnershipConflictError(ProfileError):
    """Several active profiles list the device; it stays quarantined."""

    code = "device_ownership_conflict"


class TooManyDevicesError(ProfileError):
    """A profile holds at most MAX_PERSONAL_DEVICES devices."""

    code = "too_many_devices"


class InvalidDeviceError(ProfileError):
    """A device request does not match the schema."""

    code = "invalid_device"


class DeviceNotInProfileError(ProfileError):
    """The personal device is not in the user's profile."""

    code = "device_not_in_profile"


class NotificationTargetUnavailableError(ProfileError):
    """No usable notification target exists for the device (used from P1.4)."""

    code = "notification_target_unavailable"


class AmbiguousTargetError(ProfileError):
    """The notification target cannot be told apart safely (used from P1.4)."""

    code = "ambiguous_target"


class InvalidStoredDocumentError(Exception):
    """Raised while validating the persisted document; carries the reason."""


@dataclass(frozen=True, slots=True)
class PersonalDevice:
    """A physical device of the user, linked to one Home Assistant device."""

    id: str
    ha_device_id: str
    added_at: str
    notifications_enabled: bool
    label: str | None = None

    def as_dict(self) -> dict[str, Any]:
        """Serialize the device in the stored/websocket shape."""
        result: dict[str, Any] = {
            "id": self.id,
            "source": {"kind": DEVICE_SOURCE_HA_DEVICE, "ha_device_id": self.ha_device_id},
            "added_at": self.added_at,
            "notifications": {"enabled": self.notifications_enabled},
        }
        if self.label is not None:
            result["label"] = self.label
        return result


@dataclass(frozen=True, slots=True)
class DomusUserProfile:
    """The persisted Domus extension of one Home Assistant user."""

    owner_user_id: str
    revision: int
    created_at: str
    updated_at: str
    state: str = PROFILE_STATE_ACTIVE
    orphaned_at: str | None = None
    personal_devices: tuple[PersonalDevice, ...] = ()
    notifications_enabled: bool = True
    preferences: Mapping[str, Any] = field(default_factory=dict)

    @property
    def active(self) -> bool:
        """Return whether the profile belongs to an existing user."""
        return self.state == PROFILE_STATE_ACTIVE

    def as_dict(self) -> dict[str, Any]:
        """Serialize the profile in the stored shape."""
        result: dict[str, Any] = {
            "owner_user_id": self.owner_user_id,
            "revision": self.revision,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "state": self.state,
            "personal_devices": [device.as_dict() for device in self.personal_devices],
            "notifications": {"enabled": self.notifications_enabled},
            "preferences": dict(self.preferences),
        }
        if self.orphaned_at is not None:
            result["orphaned_at"] = self.orphaned_at
        return result


def utc_now_iso() -> str:
    """Return the current UTC time as an ISO 8601 string."""
    return datetime.now(UTC).isoformat()


def empty_document() -> dict[str, Any]:
    """Return a document with no profiles."""
    return {"schema": DOCUMENT_SCHEMA, "version": DOCUMENT_VERSION, "profiles": {}}


def _is_timestamp(value: Any) -> bool:
    if not isinstance(value, str) or not value:
        return False
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return False
    return parsed.tzinfo is not None


def _require(
    condition: bool, reason: str, error: type[Exception] = InvalidStoredDocumentError
) -> None:
    if not condition:
        raise error(reason)


def canonical_label(value: Any) -> str | None:
    """Return the label a device really has, or ``None`` for no custom label.

    Absent, ``null``, ``""`` and whitespace-only all mean "no label"; any other
    string is trimmed. Raise ``ValueError`` for anything else.
    """
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("label must be a string")
    label = value.strip()
    return label or None


def _parse_device(
    value: Any, where: str, error: type[Exception] = InvalidStoredDocumentError
) -> PersonalDevice:
    _require(isinstance(value, dict), f"{where}: device must be an object", error)
    _require(set(value) <= DEVICE_KEYS, f"{where}: unknown device keys", error)
    device_id = value.get("id")
    _require(
        isinstance(device_id, str) and bool(DEVICE_ID_PATTERN.fullmatch(device_id)),
        f"{where}: invalid device id",
        error,
    )
    source = value.get("source")
    _require(
        isinstance(source, dict) and set(source) == {"kind", "ha_device_id"},
        f"{where}: invalid device source",
        error,
    )
    _require(source["kind"] == DEVICE_SOURCE_HA_DEVICE, f"{where}: unsupported source kind", error)
    ha_device_id = source["ha_device_id"]
    _require(
        isinstance(ha_device_id, str) and bool(HA_ID_PATTERN.fullmatch(ha_device_id)),
        f"{where}: invalid Home Assistant device id",
        error,
    )
    try:
        label = canonical_label(value.get("label"))
    except ValueError:
        raise error(f"{where}: invalid label") from None
    _require(label is None or len(label) <= MAX_DEVICE_LABEL_LENGTH, f"{where}: label too long", error)
    _require(_is_timestamp(value.get("added_at")), f"{where}: invalid added_at", error)
    notifications = value.get("notifications")
    _require(
        isinstance(notifications, dict)
        and set(notifications) == {"enabled"}
        and isinstance(notifications["enabled"], bool),
        f"{where}: invalid notifications",
        error,
    )
    return PersonalDevice(
        id=device_id,
        ha_device_id=ha_device_id,
        label=label,
        added_at=value["added_at"],
        notifications_enabled=notifications["enabled"],
    )


def _parse_devices(
    raw_devices: Any, where: str, error: type[Exception] = InvalidStoredDocumentError
) -> tuple[PersonalDevice, ...]:
    _require(isinstance(raw_devices, list), f"{where}: personal_devices must be a list", error)
    _require(len(raw_devices) <= MAX_PERSONAL_DEVICES, f"{where}: too many devices", error)
    devices = tuple(
        _parse_device(item, f"{where} device {index}", error) for index, item in enumerate(raw_devices)
    )
    _require(len({device.id for device in devices}) == len(devices), f"{where}: duplicate device id", error)
    _require(
        len({device.ha_device_id for device in devices}) == len(devices),
        f"{where}: duplicate Home Assistant device",
        error,
    )
    return devices


def parse_stored_profile(key: str, value: Any) -> DomusUserProfile:
    """Validate one persisted profile; raise InvalidStoredDocumentError."""
    where = f"profile {key}"
    _require(isinstance(value, dict), f"{where}: must be an object")
    _require(set(value) <= PROFILE_KEYS, f"{where}: unknown keys")
    _require(value.get("owner_user_id") == key, f"{where}: owner does not match its key")
    revision = value.get("revision")
    _require(
        isinstance(revision, int) and not isinstance(revision, bool) and revision >= 1,
        f"{where}: persisted revision must be >= 1",
    )
    _require(_is_timestamp(value.get("created_at")), f"{where}: invalid created_at")
    _require(_is_timestamp(value.get("updated_at")), f"{where}: invalid updated_at")
    state = value.get("state")
    _require(state in PROFILE_STATES, f"{where}: invalid state")
    orphaned_at = value.get("orphaned_at")
    if state == PROFILE_STATE_ORPHANED:
        _require(_is_timestamp(orphaned_at), f"{where}: orphaned profile needs orphaned_at")
    else:
        _require(orphaned_at is None, f"{where}: active profile cannot have orphaned_at")
    devices = _parse_devices(value.get("personal_devices"), where)
    notifications = value.get("notifications")
    _require(
        isinstance(notifications, dict)
        and set(notifications) == {"enabled"}
        and isinstance(notifications["enabled"], bool),
        f"{where}: invalid notifications",
    )
    preferences = value.get("preferences")
    _require(isinstance(preferences, dict), f"{where}: preferences must be an object")
    return DomusUserProfile(
        owner_user_id=key,
        revision=revision,
        created_at=value["created_at"],
        updated_at=value["updated_at"],
        state=state,
        orphaned_at=orphaned_at,
        personal_devices=devices,
        notifications_enabled=notifications["enabled"],
        preferences=dict(preferences),
    )


def parse_stored_document(value: Any) -> dict[str, DomusUserProfile]:
    """Validate the whole persisted document; raise InvalidStoredDocumentError."""
    _require(isinstance(value, dict), "document must be an object")
    _require(set(value) == {"schema", "version", "profiles"}, "unexpected document keys")
    _require(value["schema"] == DOCUMENT_SCHEMA, "unknown schema")
    _require(value["version"] == DOCUMENT_VERSION, "unsupported document version")
    profiles = value["profiles"]
    _require(isinstance(profiles, dict), "profiles must be an object")
    parsed: dict[str, DomusUserProfile] = {}
    for key, profile in profiles.items():
        _require(isinstance(key, str) and bool(HA_ID_PATTERN.fullmatch(key)), "invalid user id key")
        parsed[key] = parse_stored_profile(key, profile)
    return parsed


def serialize_document(profiles: Mapping[str, DomusUserProfile]) -> dict[str, Any]:
    """Return the stored document for the given profiles."""
    document = empty_document()
    document["profiles"] = {key: profile.as_dict() for key, profile in sorted(profiles.items())}
    return document


@dataclass(frozen=True, slots=True)
class ProfileContent:
    """What a profile says, without revision or timestamps.

    Two saves with the same canonical content are the same save: the second
    one is a no-op.
    """

    notifications_enabled: bool = True
    personal_devices: tuple[PersonalDevice, ...] = ()
    preferences: Mapping[str, Any] = field(default_factory=dict)

    @classmethod
    def of(cls, profile: DomusUserProfile | None) -> ProfileContent:
        """Return the content of a profile; a missing profile has the defaults."""
        if profile is None:
            return cls()
        return cls(
            notifications_enabled=profile.notifications_enabled,
            personal_devices=profile.personal_devices,
            preferences=dict(profile.preferences),
        )


def parse_self_changes(value: Any, current: DomusUserProfile | None) -> ProfileContent:
    """Validate a save_self payload and return the canonical content it asks for.

    Only ``notifications.enabled`` is editable. ``personal_devices`` and
    ``preferences`` may be sent back, but must mean exactly what is stored once
    canonicalized: devices change through the dedicated device commands,
    which verify ownership server-side.
    """
    if not isinstance(value, dict):
        raise InvalidProfileError("The profile must be an object")
    unknown = set(value) - SELF_EDITABLE_KEYS
    if unknown:
        raise InvalidProfileError(f"Fields not editable: {', '.join(sorted(unknown))}")
    notifications = value.get("notifications")
    if (
        not isinstance(notifications, dict)
        or set(notifications) != {"enabled"}
        or not isinstance(notifications["enabled"], bool)
    ):
        raise InvalidProfileError("notifications must be {enabled: boolean}")
    if "preferences" in value:
        preferences = value["preferences"]
        stored = dict(current.preferences) if current is not None else {}
        if not isinstance(preferences, dict) or preferences != stored:
            raise InvalidProfileError("Preferences cannot be changed yet")
    stored = ProfileContent.of(current)
    if "personal_devices" in value:
        requested = _parse_devices(value["personal_devices"], "profile", InvalidProfileError)
        if requested != stored.personal_devices:
            raise DeviceManagementNotAvailableError(
                "save_self does not change personal devices; use add_device, remove_device or update_device"
            )
    return ProfileContent(
        notifications_enabled=notifications["enabled"],
        personal_devices=stored.personal_devices,
        preferences=stored.preferences,
    )


def build_device_index(
    profiles: Mapping[str, DomusUserProfile],
) -> tuple[dict[str, str], dict[str, tuple[str, ...]]]:
    """Map Home Assistant device ids to the one active profile that lists them.

    A device listed by more than one active profile has no owner: it is
    reported as a conflict and left out of the index, never assigned.
    """
    owners: dict[str, list[str]] = {}
    for user_id, profile in profiles.items():
        if not profile.active:
            continue
        for device in profile.personal_devices:
            owners.setdefault(device.ha_device_id, []).append(user_id)
    index = {device_id: users[0] for device_id, users in owners.items() if len(users) == 1}
    conflicts = {
        device_id: tuple(sorted(users)) for device_id, users in owners.items() if len(users) > 1
    }
    return index, conflicts


# Store migrations, keyed by the version they upgrade from. Only v1 exists, so
# there are none yet; a step must return the document of the next version.
MigrationStep = Callable[[dict[str, Any]], dict[str, Any]]
MIGRATIONS: dict[int, MigrationStep] = {}


def migrate_document(
    data: Any,
    from_version: int,
    to_version: int = STORAGE_VERSION,
    steps: Mapping[int, MigrationStep] | None = None,
) -> Any:
    """Upgrade a stored document one version at a time; refuse unknown paths."""
    if from_version > to_version:
        raise InvalidStoredDocumentError(
            f"Profile store version {from_version} is newer than this Domus UI ({to_version})"
        )
    available = MIGRATIONS if steps is None else steps
    version = from_version
    while version < to_version:
        step = available.get(version)
        if step is None:
            raise InvalidStoredDocumentError(f"No profile store migration from version {version}")
        data = step(data)
        version += 1
    return data
