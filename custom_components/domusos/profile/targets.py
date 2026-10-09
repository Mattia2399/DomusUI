"""Resolve where a personal device could be notified, without ever sending.

Order of preference:

1. a ``notify.*`` entity that the entity registry ties to the same device
   (ready for integrations that moved to ``NotifyEntity``);
2. the legacy ``notify.mobile_app_<name>`` service of the Companion App
   registration linked to the device (``mobile_app`` still uses it in Home
   Assistant 2025.1 and 2026.2.3);
3. nothing.

The result is computed live on every request and never stored. Sending is the
job of the future notification router.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from homeassistant.const import STATE_UNAVAILABLE
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er

from .mobile_app import MobileAppRegistration, registrations_for_device

NOTIFY_DOMAIN = "notify"


class TargetStatus(StrEnum):
    """Whether a device can be notified right now."""

    READY = "ready"
    UNAVAILABLE = "unavailable"
    AMBIGUOUS = "ambiguous"
    UNSUPPORTED = "unsupported"


@dataclass(frozen=True, slots=True)
class EntityTarget:
    """A ``notify.*`` entity of the device (``notify.send_message``)."""

    entity_id: str
    status: TargetStatus = TargetStatus.READY


@dataclass(frozen=True, slots=True)
class LegacyServiceTarget:
    """A legacy ``notify.<service>`` service of the device."""

    service: str
    domain: str = NOTIFY_DOMAIN
    status: TargetStatus = TargetStatus.READY


@dataclass(frozen=True, slots=True)
class UnavailableTarget:
    """The device has, or could have, a target that cannot be used now."""

    reason: str
    status: TargetStatus = TargetStatus.UNAVAILABLE


@dataclass(frozen=True, slots=True)
class AmbiguousTarget:
    """A target exists but cannot be told apart from another device's."""

    reason: str
    status: TargetStatus = TargetStatus.AMBIGUOUS


@dataclass(frozen=True, slots=True)
class UnsupportedTarget:
    """Nothing about the device can receive notifications."""

    status: TargetStatus = TargetStatus.UNSUPPORTED


NotificationTargetResolution = (
    EntityTarget | LegacyServiceTarget | UnavailableTarget | AmbiguousTarget | UnsupportedTarget
)


def resolve_notification_target(
    hass: HomeAssistant,
    ha_device_id: str,
    registrations: list[MobileAppRegistration],
) -> NotificationTargetResolution:
    """Return the target the device would be notified through."""
    entity_registry = er.async_get(hass)
    notify_entities = [
        entry.entity_id
        for entry in er.async_entries_for_device(entity_registry, ha_device_id)
        if entry.domain == NOTIFY_DOMAIN
    ]
    if len(notify_entities) > 1:
        return AmbiguousTarget("several notify entities belong to the device")
    if notify_entities:
        state = hass.states.get(notify_entities[0])
        if state is None or state.state == STATE_UNAVAILABLE:
            return UnavailableTarget("notify entity unavailable")
        return EntityTarget(notify_entities[0])

    linked = registrations_for_device(registrations, ha_device_id)
    if not linked:
        return UnsupportedTarget()
    if len(linked) > 1:
        return AmbiguousTarget("several app registrations link the device")
    service = linked[0].legacy_notify_service
    if service is None:
        return UnavailableTarget("registration has no name")
    # Another registration with a name that slugifies the same would share the service.
    if sum(1 for item in registrations if item.legacy_notify_service == service) > 1:
        return AmbiguousTarget("legacy notify service shared with another registration")
    if not linked[0].entry_enabled or not hass.services.has_service(NOTIFY_DOMAIN, service):
        return UnavailableTarget("legacy notify service not registered")
    return LegacyServiceTarget(service)
