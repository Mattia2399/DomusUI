"""Server-owned power policies for the devices that show Domus (a wall tablet, ...).

The store is the authority; one controller runs per active policy. A store
that cannot be trusted runs nothing and is never overwritten.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable, Mapping
from enum import StrEnum
import glob
import logging
from typing import Any
from uuid import uuid4

from homeassistant.auth.models import User
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from ..const import DOMAIN
from ..core import DomusRuntime
from ..core.audit import AuditEntry
from ..core.events import DomusEvent
from .controller import PolicyController
from .models import (
    BATTERY_DOMAIN,
    MAX_POLICIES,
    POWER_DOMAIN,
    STORAGE_KEY,
    STORAGE_VERSION,
    DevicePowerUnavailableError,
    InvalidPolicyError,
    InvalidStoredDocumentError,
    PermissionDeniedError,
    PolicyNotFoundError,
    PolicySettings,
    PolicyStatus,
    PowerPolicy,
    RevisionConflictError,
    SaveFailedError,
    StoreCorruptError,
    TooManyPoliciesError,
    canonical_client_id,
    check_policy_set,
    parse_policy_settings,
    parse_stored_document,
    read_battery_level,
    read_switch_state,
    storage_document,
)

_LOGGER = logging.getLogger(__name__)

RuntimeProvider = Callable[[], DomusRuntime | None]


class DevicePowerStoreStatus(StrEnum):
    NOT_LOADED = "not_loaded"
    READY = "ready"
    CORRUPT = "corrupt"


class DevicePowerManager:
    """Own the power policies and their controllers."""

    def __init__(self, hass: HomeAssistant, runtime: RuntimeProvider | None = None) -> None:
        self.hass = hass
        self.store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self._runtime = runtime or (lambda: hass.data.get(DOMAIN, {}).get("runtime"))
        self._policies: dict[str, PowerPolicy] = {}
        self._controllers: dict[str, PolicyController] = {}
        self._status = DevicePowerStoreStatus.NOT_LOADED
        self._lock = asyncio.Lock()

    @property
    def status(self) -> DevicePowerStoreStatus:
        return self._status

    async def async_setup(self) -> None:
        """Load the policies and start the active ones; an untrusted store runs nothing."""
        try:
            stored = await self.store.async_load()
        except Exception as err:  # noqa: BLE001 - a failed load must not take Domus down
            self._mark_corrupt(f"could not be loaded ({err})")
            return
        if stored is None and await self._async_quarantined():
            self._mark_corrupt("could not be decoded and was set aside by Home Assistant")
            return
        try:
            policies = parse_stored_document(stored) if stored is not None else {}
        except InvalidStoredDocumentError as err:
            self._mark_corrupt(f"is invalid ({err})")
            return
        self._policies = policies
        self._status = DevicePowerStoreStatus.READY
        for policy in policies.values():
            if policy.enabled:
                self._start_controller(policy)

    async def async_shutdown(self) -> None:
        """Stop every controller; the switches keep their current state."""
        controllers = list(self._controllers.values())
        self._controllers.clear()
        for controller in controllers:
            await controller.async_stop()

    def _mark_corrupt(self, reason: str) -> None:
        self._status = DevicePowerStoreStatus.CORRUPT
        self._policies = {}
        _LOGGER.error(
            "The Domus device power store %s; no charger is controlled until it is repaired",
            reason,
        )

    async def _async_quarantined(self) -> bool:
        pattern = f"{glob.escape(self.store.path)}.corrupt.*"
        return bool(await self.hass.async_add_executor_job(glob.glob, pattern))

    def _require_ready(self, user: User | None) -> None:
        if user is None or not user.is_admin:
            raise PermissionDeniedError("Only administrators manage device power")
        if self._status is DevicePowerStoreStatus.CORRUPT:
            raise StoreCorruptError("The device power store is invalid and is not being changed")
        if self._status is not DevicePowerStoreStatus.READY:
            raise DevicePowerUnavailableError("Device power management is not running")

    # --- Reading ---------------------------------------------------------------------

    def state_for_user(self, user: User | None) -> dict[str, Any]:
        """Every policy with what it is doing now; for administrators only."""
        if user is None or not user.is_admin:
            raise PermissionDeniedError("Only administrators manage device power")
        if self._status is not DevicePowerStoreStatus.READY:
            return {"status": self._status.value, "policies": []}
        return {
            "status": self._status.value,
            "policies": [self._policy_view(policy) for policy in self._policies.values()],
        }

    def _policy_view(self, policy: PowerPolicy) -> dict[str, Any]:
        view = policy.to_storage()
        controller = self._controllers.get(policy.policy_id)
        if controller is not None:
            view["runtime"] = controller.runtime()
        else:
            # Not controlled: show the entities as they are, and do nothing.
            battery = self.hass.states.get(policy.battery_entity_id)
            switch = self.hass.states.get(policy.switch_entity_id)
            view["runtime"] = {
                "status": PolicyStatus.DISABLED.value,
                "battery_level": read_battery_level(battery.state if battery else None),
                "switch_on": read_switch_state(switch.state if switch else None),
                "last_action": None,
                "last_error": None,
            }
        return view

    # --- Changing --------------------------------------------------------------------

    async def async_save_policy(
        self,
        user: User | None,
        payload: Any,
        *,
        policy_id: str | None = None,
        expected_revision: int | None = None,
    ) -> dict[str, Any]:
        """Create a policy, or change one whose revision still matches."""
        self._require_ready(user)
        settings = parse_policy_settings(payload)
        async with self._lock:
            current = self._existing(policy_id, expected_revision) if policy_id else None
            if current is None and expected_revision is not None:
                raise InvalidPolicyError("A new policy has no revision yet")
            if current is not None and current.settings == settings:
                # Nothing changes: no new revision, no write, no restart.
                return self._policy_view(current)
            self._validate_entities(settings)
            now = dt_util.utcnow().isoformat()
            if current is None:
                if len(self._policies) >= MAX_POLICIES:
                    raise TooManyPoliciesError(f"At most {MAX_POLICIES} power policies")
                policy = PowerPolicy(
                    policy_id=uuid4().hex,
                    revision=1,
                    created_at=now,
                    updated_at=now,
                    **_settings_fields(settings),
                )
            else:
                policy = current.with_settings(settings, updated_at=now)
            await self._async_replace(policy.policy_id, policy)
            return self._policy_view(policy)

    async def async_bind_policy(
        self, user: User | None, policy_id: str, expected_revision: int, client_id: Any
    ) -> dict[str, Any]:
        """Tie a policy to this device again, for example after its browser storage was cleared."""
        self._require_ready(user)
        client = canonical_client_id(client_id)
        if client is None:
            raise InvalidPolicyError("Choose the device to link", "client_id")
        async with self._lock:
            current = self._existing(policy_id, expected_revision)
            if current.client_id == client:
                return self._policy_view(current)
            settings = PolicySettings(**{**_settings_fields(current.settings), "client_id": client})
            policy = current.with_settings(settings, updated_at=dt_util.utcnow().isoformat())
            await self._async_replace(policy_id, policy)
            return self._policy_view(policy)

    async def async_delete_policy(
        self, user: User | None, policy_id: str, expected_revision: int
    ) -> None:
        """Remove a policy; its switch is left exactly as it is."""
        self._require_ready(user)
        async with self._lock:
            self._existing(policy_id, expected_revision)
            await self._async_replace(policy_id, None)

    def _existing(self, policy_id: str | None, expected_revision: int | None) -> PowerPolicy:
        policy = self._policies.get(policy_id or "")
        if policy is None:
            raise PolicyNotFoundError("This power policy no longer exists")
        if expected_revision is None or expected_revision != policy.revision:
            raise RevisionConflictError("This power policy was changed elsewhere")
        return policy

    def _validate_entities(self, settings: PolicySettings) -> None:
        """The entities must exist in Home Assistant now; their state may be unavailable."""
        registry = er.async_get(self.hass)
        for entity_id, domain, field in (
            (settings.battery_entity_id, BATTERY_DOMAIN, "battery_entity_id"),
            (settings.switch_entity_id, POWER_DOMAIN, "switch_entity_id"),
        ):
            known = self.hass.states.get(entity_id) is not None or registry.async_get(entity_id) is not None
            if not known or entity_id.split(".", 1)[0] != domain:
                raise InvalidPolicyError("This entity is not in Home Assistant", field)

    async def _async_replace(self, policy_id: str, policy: PowerPolicy | None) -> None:
        """Stop the old controller, write, then start the new one.

        Old and new settings never control the switch together. When the write
        fails, the previous settings, still stored, are put back in force.
        """
        candidate = dict(self._policies)
        if policy is None:
            candidate.pop(policy_id, None)
        else:
            candidate[policy_id] = policy
        check_policy_set(candidate.values())
        previous = self._policies.get(policy_id)
        await self._async_stop_controller(policy_id)
        try:
            await self.store.async_save(storage_document(candidate))
        except Exception as err:  # noqa: BLE001 - reported to the client, nothing half-applied
            _LOGGER.error("The Domus device power store could not be written: %s", err)
            if previous is not None and previous.enabled:
                self._start_controller(previous)
            raise SaveFailedError("The power policy could not be saved") from err
        self._policies = candidate
        if policy is not None and policy.enabled:
            self._start_controller(policy)

    async def _async_stop_controller(self, policy_id: str) -> None:
        controller = self._controllers.pop(policy_id, None)
        if controller is not None:
            await controller.async_stop()

    @callback
    def _start_controller(self, policy: PowerPolicy) -> None:
        controller = PolicyController(self.hass, policy, self._handle_outcome)
        self._controllers[policy.policy_id] = controller
        controller.async_start()

    # --- Reporting -------------------------------------------------------------------

    @callback
    def _handle_outcome(self, policy: PowerPolicy, outcome: str, details: Mapping[str, Any]) -> None:
        """Report a command through the Domus runtime: one event and one audit entry."""
        runtime = self._runtime()
        if runtime is None:
            return
        payload = {
            "policy_id": policy.policy_id,
            "switch_entity_id": policy.switch_entity_id,
            **dict(details),
        }
        if runtime.audit.running:
            runtime.audit.record(
                AuditEntry.create(
                    "device_power.controller",
                    outcome,
                    result=policy.switch_entity_id,
                    metadata=payload,
                )
            )
        if runtime.events.running:
            self.hass.async_create_task(
                runtime.events.async_publish(
                    DomusEvent.create(f"device_power.{outcome}", "device_power.controller", payload)
                )
            )


def _settings_fields(settings: PolicySettings) -> dict[str, Any]:
    return {
        "client_id": settings.client_id,
        "label": settings.label,
        "enabled": settings.enabled,
        "battery_entity_id": settings.battery_entity_id,
        "switch_entity_id": settings.switch_entity_id,
        "start_threshold": settings.start_threshold,
        "stop_threshold": settings.stop_threshold,
    }
