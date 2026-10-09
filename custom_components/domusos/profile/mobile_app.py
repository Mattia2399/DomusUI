"""Read Home Assistant Companion App registrations for ownership checks.

This is the only module that knows how ``mobile_app`` stores a registration.
It reads three keys of its config entry, all set by the app's own config flow:
``user_id`` (the account that registered the app), ``device_id`` (the device
registry identifier) and ``device_name`` (which also names the legacy notify
service). Webhook ids, secrets, push tokens and URLs are never read.

``user_id`` in the config entry data is not a documented Home Assistant API,
but it is what ``mobile_app`` itself uses to remove a removed user's apps. It
behaves the same in Home Assistant 2025.1 and 2026.2.3.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.util import slugify

MOBILE_APP_DOMAIN = "mobile_app"
# Keys written by the mobile_app config flow (homeassistant.components.mobile_app.const).
_DATA_USER_ID = "user_id"
_DATA_DEVICE_ID = "device_id"
_DATA_DEVICE_NAME = "device_name"


class DeviceLink(StrEnum):
    """How a registration maps to the device registry."""

    LINKED = "linked"
    MISSING = "missing"
    AMBIGUOUS = "ambiguous"


@dataclass(frozen=True, slots=True)
class MobileAppRegistration:
    """One Companion App registration, reduced to what Domus may use."""

    config_entry_id: str
    user_id: str | None
    device_name: str | None
    entry_enabled: bool
    device_link: DeviceLink
    ha_device_id: str | None = None
    device_enabled: bool = False

    @property
    def proves_ownership(self) -> bool:
        """Whether this registration is valid enough to claim its device."""
        return (
            self.user_id is not None
            and self.entry_enabled
            and self.device_link is DeviceLink.LINKED
            and self.device_enabled
        )

    def owned_by(self, user_id: str) -> bool:
        """Whether Home Assistant ties this registration to ``user_id``."""
        return self.user_id is not None and self.user_id == user_id

    @property
    def legacy_notify_service(self) -> str | None:
        """Return the legacy ``notify`` service name Home Assistant derives for the app.

        The legacy notify platform registers ``slugify(f"mobile_app_{name}")`` for
        every push-capable registration; whether it exists right now must still
        be checked with ``hass.services.has_service``.
        """
        if not self.device_name:
            return None
        return slugify(f"{MOBILE_APP_DOMAIN}_{self.device_name}")


def _text(value: object) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def list_registrations(hass: HomeAssistant) -> list[MobileAppRegistration]:
    """Return every Companion App registration with its device link."""
    registry = dr.async_get(hass)
    registrations: list[MobileAppRegistration] = []
    for entry in hass.config_entries.async_entries(MOBILE_APP_DOMAIN, include_ignore=False):
        if entry.domain != MOBILE_APP_DOMAIN:
            continue
        data = entry.data
        app_device_id = _text(data.get(_DATA_DEVICE_ID))
        # The device must belong to this entry *and* carry the app's identifier.
        devices = [
            device
            for device in dr.async_entries_for_config_entry(registry, entry.entry_id)
            if app_device_id is not None and (MOBILE_APP_DOMAIN, app_device_id) in device.identifiers
        ]
        if len(devices) == 1:
            device = devices[0]
            link, ha_device_id, device_enabled = DeviceLink.LINKED, device.id, device.disabled_by is None
        else:
            link = DeviceLink.MISSING if not devices else DeviceLink.AMBIGUOUS
            ha_device_id, device_enabled = None, False
        registrations.append(
            MobileAppRegistration(
                config_entry_id=entry.entry_id,
                user_id=_text(data.get(_DATA_USER_ID)),
                device_name=_text(data.get(_DATA_DEVICE_NAME)),
                entry_enabled=entry.disabled_by is None,
                device_link=link,
                ha_device_id=ha_device_id,
                device_enabled=device_enabled,
            )
        )
    return registrations


def registrations_for_device(
    registrations: list[MobileAppRegistration], ha_device_id: str
) -> list[MobileAppRegistration]:
    """Return the registrations linked to one device registry entry."""
    return [item for item in registrations if item.ha_device_id == ha_device_id]


def verified_registration(
    registrations: list[MobileAppRegistration], ha_device_id: str, user_id: str
) -> MobileAppRegistration | None:
    """Return the registration proving ``user_id`` owns the device, if exactly one does.

    The device must be linked to exactly one registration: two apps claiming
    the same device registry entry cannot prove anything.
    """
    linked = registrations_for_device(registrations, ha_device_id)
    if len(linked) != 1:
        return None
    registration = linked[0]
    return registration if registration.proves_ownership and registration.owned_by(user_id) else None
