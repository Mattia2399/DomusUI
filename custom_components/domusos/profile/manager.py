"""Persistent Domus Profiles with per-profile optimistic concurrency."""

from __future__ import annotations

import asyncio
import glob
import logging
from collections.abc import Callable, Mapping
from dataclasses import dataclass, replace
from enum import StrEnum
from typing import Any
from uuid import uuid4

from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers.storage import Store

from .devices import DeviceInspector, OwnershipView
from .models import (
    MAX_DEVICE_LABEL_LENGTH,
    MAX_PERSONAL_DEVICES,
    PROFILE_STATE_ACTIVE,
    PROFILE_STATE_ORPHANED,
    STORAGE_KEY,
    STORAGE_VERSION,
    DeviceNotClaimableError,
    DeviceNotFoundError,
    DeviceNotInProfileError,
    DomusUserProfile,
    InvalidDeviceError,
    InvalidStoredDocumentError,
    PersonalDevice,
    ProfileContent,
    ProfileUnavailableError,
    RevisionConflictError,
    StoreCorruptError,
    TooManyDevicesError,
    build_device_index,
    canonical_label,
    migrate_document,
    parse_self_changes,
    parse_stored_document,
    serialize_document,
    utc_now_iso,
)

try:
    from homeassistant.auth import EVENT_USER_REMOVED
except ImportError:  # pragma: no cover - the constant exists in every supported release
    EVENT_USER_REMOVED = "user_removed"

_LOGGER = logging.getLogger(__name__)


class ProfileStoreStatus(StrEnum):
    """Whether the manager can serve profiles."""

    NOT_LOADED = "not_loaded"
    READY = "ready"
    CORRUPT = "corrupt"


@dataclass(frozen=True, slots=True)
class ProfileView:
    """A profile as served to its owner.

    ``persisted`` is False for a profile that was never saved: it is
    synthesized in memory and nothing is written by reading it. A future
    router uses this to tell ``no_profile`` apart from ``no_devices``.
    """

    profile: DomusUserProfile | None
    persisted: bool

    @property
    def revision(self) -> int:
        """Return the revision a client must send back to save."""
        return self.profile.revision if self.profile is not None else 0

    def as_dict(self) -> dict[str, Any]:
        """Serialize the editable part of the profile for its owner."""
        if self.profile is None:
            return {
                "revision": 0,
                "state": PROFILE_STATE_ACTIVE,
                "created_at": None,
                "updated_at": None,
                "personal_devices": [],
                "notifications": {"enabled": True},
                "preferences": {},
            }
        stored = self.profile.as_dict()
        stored.pop("owner_user_id")
        stored.setdefault("orphaned_at", None)
        return stored


def _device_label(value: Any) -> str | None:
    try:
        label = canonical_label(value)
    except ValueError:
        raise InvalidDeviceError("The label must be a string") from None
    if label is not None and len(label) > MAX_DEVICE_LABEL_LENGTH:
        raise InvalidDeviceError(f"The label is longer than {MAX_DEVICE_LABEL_LENGTH} characters")
    return label


class ProfileStore(Store[dict[str, Any]]):
    """Store whose version upgrades go through the Domus migration chain."""

    async def _async_migrate_func(
        self,
        old_major_version: int,
        old_minor_version: int,
        old_data: dict[str, Any],
    ) -> dict[str, Any]:
        return migrate_document(old_data, old_major_version)


class ProfileManager:
    """Own the Domus Profile document; one lock, one revision per profile."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self.store = ProfileStore(hass, STORAGE_VERSION, STORAGE_KEY)
        self._profiles: dict[str, DomusUserProfile] = {}
        self._device_index: dict[str, str] = {}
        self._device_conflicts: dict[str, tuple[str, ...]] = {}
        self._status = ProfileStoreStatus.NOT_LOADED
        self._lock = asyncio.Lock()
        self._unsubscribe_user_removed: Callable[[], None] | None = None

    @property
    def status(self) -> ProfileStoreStatus:
        """Return whether profiles can be read and saved."""
        return self._status

    @property
    def device_conflicts(self) -> Mapping[str, tuple[str, ...]]:
        """Return Home Assistant devices listed by more than one active profile."""
        return dict(self._device_conflicts)

    def device_owner(self, ha_device_id: str) -> str | None:
        """Return the only active profile listing a device, if exactly one does."""
        return self._device_index.get(ha_device_id)

    def ownership(self) -> OwnershipView:
        """Return the active ownership index; orphaned profiles own nothing."""
        return OwnershipView(owner_of=dict(self._device_index), conflicts=dict(self._device_conflicts))

    async def async_setup(self) -> None:
        """Load and validate the store; an invalid store is kept and never overwritten."""
        self._status = ProfileStoreStatus.NOT_LOADED
        try:
            stored = await self.store.async_load()
        except Exception as err:  # noqa: BLE001 - a failed load must not take Domus down
            self._mark_corrupt(f"could not be loaded ({err})")
        else:
            if stored is None and await self._async_quarantined():
                # Home Assistant set aside a file it could not decode: unreadable, not absent.
                self._mark_corrupt("could not be decoded and was set aside by Home Assistant")
            else:
                try:
                    profiles = parse_stored_document(stored) if stored is not None else {}
                except InvalidStoredDocumentError as err:
                    self._mark_corrupt(f"is invalid ({err})")
                else:
                    self._apply(profiles)
                    self._status = ProfileStoreStatus.READY
        self._unsubscribe_user_removed = self.hass.bus.async_listen(
            EVENT_USER_REMOVED, self._handle_user_removed
        )

    async def async_shutdown(self) -> None:
        """Stop listening to Home Assistant; nothing is pending to write."""
        if self._unsubscribe_user_removed is not None:
            self._unsubscribe_user_removed()
            self._unsubscribe_user_removed = None

    def _mark_corrupt(self, reason: str) -> None:
        self._status = ProfileStoreStatus.CORRUPT
        self._profiles = {}
        self._device_index, self._device_conflicts = {}, {}
        _LOGGER.error(
            "The Domus Profile store %s; profiles stay read-only until it is repaired",
            reason,
        )

    async def _async_quarantined(self) -> bool:
        pattern = f"{glob.escape(self.store.path)}.corrupt.*"
        return bool(await self.hass.async_add_executor_job(glob.glob, pattern))

    def _apply(self, profiles: dict[str, DomusUserProfile]) -> None:
        previous_conflicts = self._device_conflicts
        self._profiles = profiles
        self._device_index, self._device_conflicts = build_device_index(profiles)
        if self._device_conflicts == previous_conflicts:
            return
        for device_id, owners in self._device_conflicts.items():
            _LOGGER.info(
                "Home Assistant device %s is listed by %d Domus profiles; only the one Home "
                "Assistant ties it to receives notifications",
                device_id,
                len(owners),
            )

    def _require_ready(self) -> None:
        if self._status is ProfileStoreStatus.CORRUPT:
            raise StoreCorruptError("The Domus Profile store is invalid and is not being changed")
        if self._status is not ProfileStoreStatus.READY:
            raise ProfileUnavailableError("The Domus Profile Core is not running")

    def get_profile(self, user_id: str) -> ProfileView:
        """Return a user's profile, synthesizing an empty one without writing."""
        self._require_ready()
        profile = self._profiles.get(user_id)
        if profile is None:
            return ProfileView(profile=None, persisted=False)
        return ProfileView(profile=profile, persisted=True)

    async def async_save_self(
        self, user_id: str, expected_revision: int, payload: Any
    ) -> ProfileView:
        """Apply the owner's allowed changes when the revision still matches."""
        return await self._async_commit(
            user_id, expected_revision, lambda current: parse_self_changes(payload, current)
        )

    async def _async_commit(
        self,
        user_id: str,
        expected_revision: int,
        build_content: Callable[[DomusUserProfile | None], ProfileContent],
    ) -> ProfileView:
        """Write a profile's new canonical content, or nothing when it is unchanged.

        The revision is checked first, so a stale client gets a conflict even
        when it sends the current content. Content equal to the current one,
        including the defaults of a profile that was never saved, is a no-op:
        no new revision, no new ``updated_at`` and no write.
        """
        async with self._lock:
            self._require_ready()
            current = self._profiles.get(user_id)
            if current is not None and not current.active:
                raise ProfileUnavailableError("This profile belongs to a removed account")
            current_revision = current.revision if current is not None else 0
            if expected_revision != current_revision:
                raise RevisionConflictError(
                    f"The profile changed (revision {current_revision}); reload and retry"
                )
            content = build_content(current)
            if content == ProfileContent.of(current):
                return ProfileView(profile=current, persisted=current is not None)
            now = utc_now_iso()
            if current is None:
                updated = DomusUserProfile(
                    owner_user_id=user_id,
                    revision=1,
                    created_at=now,
                    updated_at=now,
                    personal_devices=content.personal_devices,
                    notifications_enabled=content.notifications_enabled,
                    preferences=dict(content.preferences),
                )
            else:
                updated = replace(
                    current,
                    revision=current.revision + 1,
                    updated_at=now,
                    personal_devices=content.personal_devices,
                    notifications_enabled=content.notifications_enabled,
                    preferences=dict(content.preferences),
                )
            await self._async_write({**self._profiles, user_id: updated})
            return ProfileView(profile=updated, persisted=True)

    async def async_add_device(
        self, user_id: str, expected_revision: int, ha_device_id: str, label: Any = None
    ) -> ProfileView:
        """Add a device Home Assistant proves belongs to the user.

        Everything that decides the claim is checked again here, under the
        document lock and right before the commit: the live registration and
        the device registry. Discovery grants nothing.

        Home Assistant is the authority on ownership: a device whose app
        registration belongs to this user can be added even if another
        profile still lists it from before (an app signed in with the wrong
        account and then moved). That listing is left untouched; it simply no
        longer verifies, so it never receives anything.
        """
        device_label = _device_label(label)

        def build(current: DomusUserProfile | None) -> ProfileContent:
            content = ProfileContent.of(current)
            if any(device.ha_device_id == ha_device_id for device in content.personal_devices):
                # Already in this profile: adding it again changes nothing.
                return content
            if len(content.personal_devices) >= MAX_PERSONAL_DEVICES:
                raise TooManyDevicesError(f"A profile holds at most {MAX_PERSONAL_DEVICES} devices")
            inspector = DeviceInspector(self.hass, user_id)
            if inspector.device(ha_device_id) is None:
                raise DeviceNotFoundError("The Home Assistant device does not exist")
            if inspector.verified(ha_device_id) is None:
                _LOGGER.debug("Device %s is not verified for the requesting user", ha_device_id)
                raise DeviceNotClaimableError("Home Assistant does not tie this device to your account")
            if ha_device_id in self._device_index or ha_device_id in self._device_conflicts:
                _LOGGER.info(
                    "Device %s is still listed by another profile that Home Assistant no longer "
                    "ties to it; the verified owner adds it",
                    ha_device_id,
                )
            added = PersonalDevice(
                # A new record every time: removing and adding again never reuses an id.
                id=uuid4().hex,
                ha_device_id=ha_device_id,
                label=device_label,
                added_at=utc_now_iso(),
                notifications_enabled=True,
            )
            return replace(content, personal_devices=(*content.personal_devices, added))

        return await self._async_commit(user_id, expected_revision, build)

    async def async_remove_device(
        self, user_id: str, expected_revision: int, device_id: str
    ) -> ProfileView:
        """Remove one of the user's devices, even if Home Assistant no longer knows it."""

        def build(current: DomusUserProfile | None) -> ProfileContent:
            content = ProfileContent.of(current)
            remaining = tuple(device for device in content.personal_devices if device.id != device_id)
            if len(remaining) == len(content.personal_devices):
                raise DeviceNotInProfileError("This device is not in your profile")
            return replace(content, personal_devices=remaining)

        return await self._async_commit(user_id, expected_revision, build)

    async def async_update_device(
        self,
        user_id: str,
        expected_revision: int,
        device_id: str,
        changes: Mapping[str, Any],
    ) -> ProfileView:
        """Change the label or the notification switch of one of the user's devices.

        ``changes`` may hold ``label`` (absent, null, empty or blank clears it)
        and ``notifications_enabled``. Identity fields never change: replacing
        a device is a removal followed by a new addition.
        """
        unknown = set(changes) - {"label", "notifications_enabled"}
        if unknown or not changes:
            raise InvalidDeviceError("Only the label and the notification switch can change")
        if "notifications_enabled" in changes and not isinstance(changes["notifications_enabled"], bool):
            raise InvalidDeviceError("notifications.enabled must be a boolean")
        new_label = _device_label(changes["label"]) if "label" in changes else None

        def build(current: DomusUserProfile | None) -> ProfileContent:
            content = ProfileContent.of(current)
            if not any(device.id == device_id for device in content.personal_devices):
                raise DeviceNotInProfileError("This device is not in your profile")
            devices = tuple(
                replace(
                    device,
                    label=new_label if "label" in changes else device.label,
                    notifications_enabled=changes.get("notifications_enabled", device.notifications_enabled),
                )
                if device.id == device_id
                else device
                for device in content.personal_devices
            )
            return replace(content, personal_devices=devices)

        return await self._async_commit(user_id, expected_revision, build)

    async def async_mark_orphaned(self, user_id: str) -> bool:
        """Keep a removed user's profile, flagged as orphaned; never delete it."""
        async with self._lock:
            if self._status is not ProfileStoreStatus.READY:
                return False
            current = self._profiles.get(user_id)
            if current is None or not current.active:
                return False
            now = utc_now_iso()
            orphaned = replace(
                current,
                state=PROFILE_STATE_ORPHANED,
                orphaned_at=now,
                updated_at=now,
                revision=current.revision + 1,
            )
            await self._async_write({**self._profiles, user_id: orphaned})
            return True

    async def _async_write(self, profiles: dict[str, DomusUserProfile]) -> None:
        # Memory changes only after Home Assistant accepted the write.
        await self.store.async_save(serialize_document(profiles))
        self._apply(profiles)

    @callback
    def _handle_user_removed(self, event: Event) -> None:
        user_id = event.data.get("user_id")
        if isinstance(user_id, str) and user_id in self._profiles:
            self.hass.async_create_task(self._async_orphan_safely(user_id))

    async def _async_orphan_safely(self, user_id: str) -> None:
        try:
            await self.async_mark_orphaned(user_id)
        except Exception:  # noqa: BLE001 - lifecycle bookkeeping must not raise into HA
            _LOGGER.exception("Could not mark the Domus profile of a removed user as orphaned")
