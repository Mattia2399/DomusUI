"""Persistent Domus Profiles with per-profile optimistic concurrency."""

from __future__ import annotations

import asyncio
import glob
import logging
from collections.abc import Callable, Mapping
from dataclasses import dataclass, replace
from enum import StrEnum
from typing import Any

from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers.storage import Store

from .models import (
    PROFILE_STATE_ACTIVE,
    PROFILE_STATE_ORPHANED,
    STORAGE_KEY,
    STORAGE_VERSION,
    DomusUserProfile,
    InvalidStoredDocumentError,
    ProfileContent,
    ProfileUnavailableError,
    RevisionConflictError,
    StoreCorruptError,
    build_device_index,
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
            _LOGGER.warning(
                "Home Assistant device %s is listed by %d Domus profiles; it has no owner "
                "until the conflict is resolved",
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
