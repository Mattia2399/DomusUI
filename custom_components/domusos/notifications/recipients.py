"""Read-only view of who can receive Domus notifications, shared by the router and the readiness list.

One ``RecipientInspector`` reads Home Assistant once per request (people,
Companion App registrations, the profile ownership index) and turns each
person id into a *plan*: either the reason nothing would be sent, or the
devices that want the notification with the target each would use right now.

The router sends by following a plan; ``list_recipients`` summarizes the same
plan as a readiness status. Both therefore apply exactly the same rules, in
the same order, and planning never writes, sends or records anything.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from enum import StrEnum

from homeassistant.core import HomeAssistant

from ..profile.devices import DeviceInspector, LiveStatus
from ..profile.identity import (
    AccountEligibility,
    PersonIdentity,
    ResolutionStatus,
    account_eligibility,
    list_persons,
    resolve_person_id,
)
from ..profile.manager import ProfileManager, ProfileStoreStatus
from ..profile.mobile_app import list_registrations
from ..profile.models import (
    DomusUserProfile,
    PersonalDevice,
    ProfileError,
    ProfileUnavailableError,
)
from ..profile.targets import (
    AmbiguousTarget,
    EntityTarget,
    LegacyServiceTarget,
    resolve_notification_target,
)
from .models import Reason

Target = EntityTarget | LegacyServiceTarget


@dataclass(frozen=True, slots=True)
class DevicePlan:
    """One device that wants the notification: its live target, or why it has none now."""

    device: PersonalDevice
    target: Target | None = None
    reason: Reason | None = None


@dataclass(frozen=True, slots=True)
class RecipientPlan:
    """What a send to one recipient would do right now."""

    person_id: str | None
    # Set when nothing would be sent at all: no account, no profile, notifications off...
    reason: Reason | None = None
    devices: tuple[DevicePlan, ...] = ()


class RecipientReadiness(StrEnum):
    """What an administrator may know about a recipient: whether it is ready, never where."""

    READY = "ready"
    TEMPORARILY_UNAVAILABLE = "temporarily_unavailable"
    NOTIFICATIONS_DISABLED = "notifications_disabled"
    NO_DEVICES = "no_devices"
    NO_PROFILE = "no_profile"
    NO_ACCOUNT = "no_account"
    ACCOUNT_DISABLED = "account_disabled"
    ACCOUNT_UNAVAILABLE = "account_unavailable"
    PROFILE_UNAVAILABLE = "profile_unavailable"
    AMBIGUOUS = "ambiguous"


_READINESS_BY_REASON = {
    Reason.AMBIGUOUS_RECIPIENT: RecipientReadiness.AMBIGUOUS,
    Reason.NO_ACCOUNT: RecipientReadiness.NO_ACCOUNT,
    Reason.ACCOUNT_DISABLED: RecipientReadiness.ACCOUNT_DISABLED,
    Reason.ACCOUNT_UNAVAILABLE: RecipientReadiness.ACCOUNT_UNAVAILABLE,
    Reason.NO_PROFILE: RecipientReadiness.NO_PROFILE,
    Reason.PROFILE_UNAVAILABLE: RecipientReadiness.PROFILE_UNAVAILABLE,
    Reason.NOTIFICATIONS_DISABLED: RecipientReadiness.NOTIFICATIONS_DISABLED,
    Reason.NO_DEVICES: RecipientReadiness.NO_DEVICES,
}


def readiness(plan: RecipientPlan) -> RecipientReadiness:
    """Summarize a plan: ready when at least one device has a target right now."""
    if plan.reason is not None:
        # An unknown person is never listed; the router reports it on its own.
        return _READINESS_BY_REASON.get(plan.reason, RecipientReadiness.PROFILE_UNAVAILABLE)
    if any(device.target is not None for device in plan.devices):
        return RecipientReadiness.READY
    return RecipientReadiness.TEMPORARILY_UNAVAILABLE


class RecipientInspector:
    """One consistent, read-only snapshot of Home Assistant for planning several recipients."""

    def __init__(self, hass: HomeAssistant, profiles: ProfileManager) -> None:
        self.hass = hass
        self._profiles = profiles
        self.persons: list[PersonIdentity] = list_persons(hass)
        self._registrations = list_registrations(hass)
        self._ownership = profiles.ownership()

    def person_ids(self) -> list[str]:
        """Every internal person id Home Assistant exposes, once each, in a stable order."""
        return sorted({person.person_id for person in self.persons})

    def person_entity_id(self, person_id: str) -> str | None:
        """The entity of the only person carrying ``person_id``; None when there are several."""
        return resolve_person_id(self.persons, person_id).person.entity_id if self._single(person_id) else None

    def _single(self, person_id: str) -> bool:
        return Counter(person.person_id for person in self.persons)[person_id] == 1

    async def async_plan(self, person_id: str) -> RecipientPlan:
        """Resolve a person id live to its account, profile and devices."""
        resolution = resolve_person_id(self.persons, person_id)
        if resolution.status is ResolutionStatus.UNKNOWN:
            return RecipientPlan(person_id, Reason.UNKNOWN_RECIPIENT)
        if resolution.status is ResolutionStatus.AMBIGUOUS:
            # Never the first match: there is no single "who".
            return RecipientPlan(person_id, Reason.AMBIGUOUS_RECIPIENT)
        user_id = resolution.person.user_id if resolution.person is not None else None
        if user_id is None:
            return RecipientPlan(person_id, Reason.NO_ACCOUNT)
        user = await self.hass.auth.async_get_user(user_id)
        if user is None:
            return RecipientPlan(person_id, Reason.ACCOUNT_UNAVAILABLE)
        eligibility = account_eligibility(user)
        if eligibility is AccountEligibility.SYSTEM:
            return RecipientPlan(person_id, Reason.ACCOUNT_UNAVAILABLE)
        if eligibility is AccountEligibility.DISABLED:
            return RecipientPlan(person_id, Reason.ACCOUNT_DISABLED)
        profile, reason = self.usable_profile(user_id)
        if profile is None:
            return RecipientPlan(person_id, reason)
        return self.plan_profile(person_id, user_id, profile)

    def usable_profile(self, user_id: str) -> tuple[DomusUserProfile | None, Reason | None]:
        """The persisted, active profile of a user, or why there is none."""
        try:
            view = self._profiles.get_profile(user_id)
        except ProfileError:
            return None, Reason.PROFILE_UNAVAILABLE
        # A synthesized profile is not a configured one, and reading it writes nothing.
        if not view.persisted or view.profile is None:
            return None, Reason.NO_PROFILE
        if not view.profile.active:
            return None, Reason.PROFILE_UNAVAILABLE
        return view.profile, None

    def plan_profile(
        self,
        person_id: str | None,
        user_id: str,
        profile: DomusUserProfile,
        only_device_id: str | None = None,
    ) -> RecipientPlan:
        """Apply the preference hierarchy, then check each wanted device live."""
        if not profile.notifications_enabled:
            # The general switch wins: devices are not even looked at, and their switches stay as they are.
            return RecipientPlan(person_id, Reason.NOTIFICATIONS_DISABLED)
        devices = [
            device
            for device in profile.personal_devices
            if only_device_id is None or device.id == only_device_id
        ]
        if not devices:
            return RecipientPlan(person_id, Reason.NO_DEVICES)
        due = [device for device in devices if device.notifications_enabled]
        if not due:
            return RecipientPlan(person_id, Reason.NOTIFICATIONS_DISABLED)
        inspector = DeviceInspector(self.hass, user_id, self._registrations)
        return RecipientPlan(person_id, None, tuple(self._device(inspector, device) for device in due))

    def _device(self, inspector: DeviceInspector, device: PersonalDevice) -> DevicePlan:
        status = inspector.live_status(device, self._ownership)
        if status in (LiveStatus.UNVERIFIED, LiveStatus.OWNERSHIP_CONFLICT):
            # Home Assistant no longer ties the device to this user: never send to it.
            return DevicePlan(device, reason=Reason.DEVICE_NOT_VERIFIED)
        if status is not LiveStatus.ACTIVE:
            return DevicePlan(device, reason=Reason.TARGET_UNAVAILABLE)
        target = resolve_notification_target(self.hass, device.ha_device_id, self._registrations)
        if isinstance(target, AmbiguousTarget):
            return DevicePlan(device, reason=Reason.AMBIGUOUS_TARGET)
        if isinstance(target, (EntityTarget, LegacyServiceTarget)):
            return DevicePlan(device, target=target)
        return DevicePlan(device, reason=Reason.TARGET_UNAVAILABLE)


async def async_list_readiness(hass: HomeAssistant, profiles: ProfileManager) -> list[dict[str, object]]:
    """Every person as a possible recipient, with its readiness and nothing else.

    Raises ``ProfileError`` when the profile store cannot be read at all: no
    status is invented for anyone then.
    """
    if profiles.status is not ProfileStoreStatus.READY:
        # Corrupt or not loaded: fail closed instead of guessing a status per person.
        raise ProfileUnavailableError("Domus profiles cannot be read; recipient readiness is unavailable")
    inspector = RecipientInspector(hass, profiles)
    entries: list[dict[str, object]] = []
    for person_id in inspector.person_ids():
        status = readiness(await inspector.async_plan(person_id))
        entries.append(
            {
                "person_id": person_id,
                # Presentation only: lets the client read the name and picture of that exact entity.
                "person_entity_id": inspector.person_entity_id(person_id),
                "status": status.value,
                # Readiness never decides who can be chosen; only an ambiguous identity cannot.
                "selectable": status is not RecipientReadiness.AMBIGUOUS,
            }
        )
    return entries


__all__ = [
    "DevicePlan",
    "RecipientInspector",
    "RecipientPlan",
    "RecipientReadiness",
    "async_list_readiness",
    "readiness",
]
