"""Shared set-up for the Notification Router tests: people, accounts, apps and real notify targets.

Targets are real Home Assistant notify services and ``NotifyEntity`` objects,
so every test goes through ``hass.services.async_call`` exactly as production.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any
from uuid import uuid4

from homeassistant.components.notify import NotifyEntity, NotifyEntityFeature
from homeassistant.components.notify.const import NOTIFY_SERVICE_SCHEMA
from homeassistant.config_entries import ConfigEntry, ConfigFlow
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.setup import async_setup_component
from homeassistant.util import slugify
from pytest_homeassistant_custom_component.common import (
    MockConfigEntry,
    MockModule,
    MockPlatform,
    mock_integration,
    mock_platform,
)

from custom_components.domusos.notifications.ledger import NotificationLedger
from custom_components.domusos.notifications.router import NotificationRouter, SelfTestRateLimiter
from custom_components.domusos.profile.manager import ProfileManager

SECRET = "push-secret-do-not-store"


@dataclass
class Phone:
    """One Companion App registration with its device and notify target."""

    name: str
    device: dr.DeviceEntry
    entry: MockConfigEntry
    service: str
    app_device_id: str
    calls: list[dict[str, Any]] = field(default_factory=list)
    # "ok", "error" (HomeAssistantError), "crash" (unexpected), "hang" (never returns)
    behaviour: str = "ok"


def register_phone(hass: HomeAssistant, user_id: str, name: str, *, legacy_service: bool = True) -> Phone:
    """Create a registration as mobile_app would, with a legacy notify service that records calls."""
    app_device_id = uuid4().hex
    entry = MockConfigEntry(
        domain="mobile_app",
        title=name,
        data={
            "user_id": user_id,
            "device_id": app_device_id,
            "device_name": name,
            "webhook_id": SECRET,
            "app_data": {"push_token": SECRET, "push_url": "https://push.example/secret"},
        },
    )
    entry.add_to_hass(hass)
    device = dr.async_get(hass).async_get_or_create(
        config_entry_id=entry.entry_id,
        identifiers={("mobile_app", app_device_id)},
        manufacturer="Google",
        model="Pixel 8",
        name=name,
    )
    phone = Phone(name, device, entry, slugify(f"mobile_app_{name}"), app_device_id)
    if legacy_service:

        async def handle(call: ServiceCall) -> None:
            if phone.behaviour == "hang":
                await asyncio.Event().wait()
            if phone.behaviour == "error":
                raise HomeAssistantError(f"push rejected: {call.data.get('message')}")
            if phone.behaviour == "crash":
                raise RuntimeError("integration bug")
            phone.calls.append(dict(call.data))

        # The real legacy notify schema: what Home Assistant validates in production.
        hass.services.async_register("notify", phone.service, handle, schema=NOTIFY_SERVICE_SCHEMA)
    return phone


class RecordingNotifyEntity(NotifyEntity):
    """A real NotifyEntity on the phone's device; records what Home Assistant passes it."""

    _attr_has_entity_name = True
    _attr_name = None

    def __init__(self, phone: Phone, *, title: bool) -> None:
        self._phone = phone
        self._attr_unique_id = f"notify-{phone.app_device_id}"
        self._attr_device_info = {"identifiers": {("mobile_app", phone.app_device_id)}}
        self._attr_supported_features = NotifyEntityFeature.TITLE if title else NotifyEntityFeature(0)

    async def async_send_message(self, message: str, title: str | None = None) -> None:
        if self._phone.behaviour == "error":
            raise HomeAssistantError("entity send failed")
        self._phone.calls.append({"message": message, "title": title})


async def add_notify_entity(hass: HomeAssistant, phone: Phone, *, title: bool = True) -> str:
    """Give the phone's device a real notify entity through a config entry platform."""
    domain = f"notify_test_{uuid4().hex[:8]}"
    entity = RecordingNotifyEntity(phone, title=title)

    async def setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
        await hass.config_entries.async_forward_entry_setups(entry, [Platform.NOTIFY])
        return True

    async def setup_platform(hass: HomeAssistant, entry: ConfigEntry, add: AddEntitiesCallback) -> None:
        add([entity])

    await async_setup_component(hass, "notify", {})
    mock_integration(hass, MockModule(domain, async_setup_entry=setup_entry))
    mock_platform(hass, f"{domain}.notify", MockPlatform(async_setup_entry=setup_platform))
    mock_platform(hass, f"{domain}.config_flow")
    # Declaring the flow registers its handler, which a config entry needs to set up.
    type(f"Flow{domain}", (ConfigFlow,), {}, domain=domain)
    entry = MockConfigEntry(domain=domain)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert entity.entity_id is not None
    return entity.entity_id


def set_person(hass: HomeAssistant, entity_id: str, person_id: str, user_id: str | None) -> None:
    """Expose a person entity the way the person integration does."""
    attributes: dict[str, Any] = {"id": person_id, "editable": True, "device_trackers": []}
    if user_id is not None:
        attributes["user_id"] = user_id
    hass.states.async_set(entity_id, "home", attributes)


async def start(
    hass: HomeAssistant,
    *,
    ledger: bool = True,
    timeout: float = 15.0,
    clock: Callable[[], float] | None = None,
) -> tuple[ProfileManager, NotificationLedger | None, NotificationRouter]:
    """Start the Profile Core, the ledger and the router on real (in-memory) stores."""
    manager = ProfileManager(hass)
    await manager.async_setup()
    notification_ledger = NotificationLedger(hass) if ledger else None
    if notification_ledger is not None:
        await notification_ledger.async_setup()
    limiter = SelfTestRateLimiter(clock=clock) if clock is not None else None
    router = NotificationRouter(hass, manager, notification_ledger, timeout=timeout, self_test_limiter=limiter)
    return manager, notification_ledger, router


async def claim(manager: ProfileManager, user_id: str, *phones: Phone) -> list[str]:
    """Add phones to a user's profile through the real device commands; return their ids."""
    ids: list[str] = []
    for phone in phones:
        revision = manager.get_profile(user_id).revision
        view = await manager.async_add_device(user_id, revision, phone.device.id)
        ids.append(next(device.id for device in view.profile.personal_devices if device.ha_device_id == phone.device.id))
    return ids
