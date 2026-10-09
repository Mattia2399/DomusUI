"""Live view of personal devices: Device Registry, presence and discovery.

Everything here is derived on request and never stored. Names, models and
trackers only describe a device; ownership comes from ``mobile_app`` alone.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr, entity_registry as er

from .identity import resolve_user_person, list_persons
from .mobile_app import (
    DeviceLink,
    MobileAppRegistration,
    list_registrations,
    registrations_for_device,
    verified_registration,
)
from .models import PersonalDevice
from .targets import TargetStatus, resolve_notification_target

TRACKER_DOMAIN = "device_tracker"

_TABLET_HINTS = ("ipad", "tablet", "galaxy tab", "sm-t", "sm-x", "sm-p", "lenovo tab", "mediapad", "pixel tablet")
_COMPUTER_HINTS = ("mac", "windows", "linux", "pc", "laptop", "desktop", "chromebook")


class DiscoveryStatus(StrEnum):
    """Why a verified device can or cannot be added."""

    AVAILABLE = "available"
    ALREADY_OWNED = "already_owned"
    OWNED_BY_OTHER = "owned_by_other"
    OWNERSHIP_CONFLICT = "ownership_conflict"
    MISSING = "missing"
    UNAVAILABLE = "unavailable"


class LiveStatus(StrEnum):
    """State of a device already in the profile."""

    ACTIVE = "active"
    UNVERIFIED = "unverified"
    OWNERSHIP_CONFLICT = "ownership_conflict"
    UNAVAILABLE = "unavailable"
    MISSING = "missing"


@dataclass(frozen=True, slots=True)
class OwnershipView:
    """Read-only access to the active ownership index of the profile store."""

    owner_of: Mapping[str, str]
    conflicts: Mapping[str, tuple[str, ...]]


def device_display_name(device: dr.DeviceEntry) -> str | None:
    """Return the name a user knows the device by: their rename, its name, its model."""
    for candidate in (device.name_by_user, device.name):
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()
    model = " ".join(part for part in (device.manufacturer, device.model) if part)
    return model or None


def device_kind(device: dr.DeviceEntry | None, *, is_mobile_app: bool) -> str:
    """Guess phone, tablet, computer or other from model metadata; presentation only."""
    if device is None:
        return "other"
    text = " ".join(part for part in (device.manufacturer, device.model) if part).lower()
    if any(hint in text for hint in _TABLET_HINTS):
        return "tablet"
    if any(hint in text for hint in _COMPUTER_HINTS):
        return "computer"
    return "phone" if is_mobile_app else "other"


def _tracker_entity_ids(hass: HomeAssistant, ha_device_id: str) -> list[str]:
    registry = er.async_get(hass)
    return sorted(
        entry.entity_id
        for entry in er.async_entries_for_device(registry, ha_device_id)
        if entry.domain == TRACKER_DOMAIN
    )


def _person_trackers(hass: HomeAssistant, user_id: str) -> set[str]:
    person = resolve_user_person(list_persons(hass), user_id).person
    if person is None:
        return set()
    state = hass.states.get(person.entity_id)
    trackers = state.attributes.get("device_trackers") if state is not None else None
    return {item for item in trackers if isinstance(item, str)} if isinstance(trackers, list) else set()


def _presence(hass: HomeAssistant, ha_device_id: str | None, person_trackers: set[str]) -> dict[str, Any]:
    trackers = _tracker_entity_ids(hass, ha_device_id) if ha_device_id else []
    return {
        "tracker_entity_ids": trackers,
        # Read only: Domus never edits the trackers of a person.
        "in_person_trackers": any(tracker in person_trackers for tracker in trackers),
    }


def _capabilities(target_status: TargetStatus, presence: Mapping[str, Any]) -> dict[str, bool]:
    return {
        "notifications": target_status is TargetStatus.READY,
        "presence": bool(presence["tracker_entity_ids"]),
    }


class DeviceInspector:
    """One consistent live snapshot of registrations and registries per request."""

    def __init__(
        self,
        hass: HomeAssistant,
        user_id: str,
        registrations: list[MobileAppRegistration] | None = None,
    ) -> None:
        self.hass = hass
        self.user_id = user_id
        # A caller inspecting several users passes one read of the registrations.
        self.registrations = registrations if registrations is not None else list_registrations(hass)
        self._device_registry = dr.async_get(hass)
        self._trackers: set[str] | None = None

    @property
    def _person_trackers(self) -> set[str]:
        # Only descriptions need them; ownership and status checks never do.
        if self._trackers is None:
            self._trackers = _person_trackers(self.hass, self.user_id)
        return self._trackers

    def device(self, ha_device_id: str) -> dr.DeviceEntry | None:
        """Return the device registry entry, if it still exists."""
        return self._device_registry.async_get(ha_device_id)

    def verified(self, ha_device_id: str) -> MobileAppRegistration | None:
        """Return the registration proving the user owns the device."""
        return verified_registration(self.registrations, ha_device_id, self.user_id)

    def _describe(self, ha_device_id: str | None, fallback_name: str | None = None) -> dict[str, Any]:
        device = self.device(ha_device_id) if ha_device_id else None
        linked = registrations_for_device(self.registrations, ha_device_id) if ha_device_id else []
        if device is None:
            target_status = TargetStatus.UNAVAILABLE if linked else TargetStatus.UNSUPPORTED
        else:
            target_status = resolve_notification_target(self.hass, device.id, self.registrations).status
        presence = _presence(self.hass, ha_device_id if device is not None else None, self._person_trackers)
        return {
            "display_name": device_display_name(device) if device is not None else fallback_name,
            "kind": device_kind(device, is_mobile_app=bool(linked)),
            "capabilities": _capabilities(target_status, presence),
            "notification_target_status": target_status.value,
            "presence": presence,
        }

    def live_status(self, device: PersonalDevice, ownership: OwnershipView) -> LiveStatus:
        """Return the current state of a stored personal device."""
        entry = self.device(device.ha_device_id)
        if entry is None:
            return LiveStatus.MISSING
        if device.ha_device_id in ownership.conflicts:
            return LiveStatus.OWNERSHIP_CONFLICT
        if entry.disabled_by is not None:
            return LiveStatus.UNAVAILABLE
        if self.verified(device.ha_device_id) is None:
            return LiveStatus.UNVERIFIED
        return LiveStatus.ACTIVE

    def live_device(self, device: PersonalDevice, ownership: OwnershipView) -> dict[str, Any]:
        """Describe a stored personal device with its current state."""
        status = self.live_status(device, ownership)
        return {"device_id": device.id, "status": status.value, **self._describe(device.ha_device_id)}

    def discover(
        self, own_devices: Iterable[PersonalDevice], ownership: OwnershipView
    ) -> list[dict[str, Any]]:
        """List the devices Home Assistant ties to this user, and whether each can be added.

        Only registrations made by this user are considered: a device of
        another user never appears, whatever its name.
        """
        owned = {device.ha_device_id for device in own_devices}
        results: list[dict[str, Any]] = []
        for registration in self.registrations:
            if not registration.owned_by(self.user_id):
                continue
            ha_device_id = registration.ha_device_id
            if registration.device_link is not DeviceLink.LINKED or ha_device_id is None:
                status = DiscoveryStatus.MISSING
            elif not registration.proves_ownership:
                status = DiscoveryStatus.UNAVAILABLE
            elif ha_device_id in owned:
                status = DiscoveryStatus.ALREADY_OWNED
            elif ha_device_id in ownership.conflicts:
                status = DiscoveryStatus.OWNERSHIP_CONFLICT
            elif ownership.owner_of.get(ha_device_id) not in (None, self.user_id):
                status = DiscoveryStatus.OWNED_BY_OTHER
            elif self.verified(ha_device_id) is None:
                # Linked to more than one registration: nothing can be proven.
                status = DiscoveryStatus.UNAVAILABLE
            else:
                status = DiscoveryStatus.AVAILABLE
            results.append(
                {
                    "ha_device_id": ha_device_id,
                    "confidence": "verified",
                    "status": status.value,
                    "claimable": status is DiscoveryStatus.AVAILABLE,
                    **self._describe(ha_device_id, fallback_name=registration.device_name),
                }
            )
        return sorted(results, key=lambda item: ((item["display_name"] or "").lower(), item["ha_device_id"] or ""))
