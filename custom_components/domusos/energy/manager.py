"""Authoritative owner of the Energy Profile and module availability."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable, Mapping
from dataclasses import replace
from typing import Any

from homeassistant.core import CALLBACK_TYPE, Event, HomeAssistant, callback
from homeassistant.helpers.event import async_track_state_change_event
from homeassistant.helpers.storage import Store

from ..core import CapabilityState
from ..core._values import utc_now
from .adapter import EnergyModuleAdapter
from .models import (
    STORAGE_KEY,
    STORAGE_VERSION,
    EnergyConflictError,
    EnergyModule,
    EnergyProfile,
    EnergyUnavailableError,
    EnergyValidationError,
    ModuleStatus,
    parse_profile,
    parse_stored_profile,
)

_LOGGER = logging.getLogger(__name__)

CHANGE_PROFILE = "profile"
CHANGE_AVAILABILITY = "availability"


class EnergyProfileManager:
    """Persist the Energy Profile and expose read-only module adapters.

    The profile lives in its own Store document and is applied in place, so
    saving it never reloads the config entry or interrupts Irrigation.
    """

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self.store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self._profile = EnergyProfile()
        self._adapters: dict[EnergyModule, EnergyModuleAdapter] = {}
        self._module_status: dict[EnergyModule, ModuleStatus] = {}
        self._listeners: set[Callable[[str], None]] = set()
        self._unsubscribe_states: CALLBACK_TYPE | None = None
        self._lock = asyncio.Lock()
        self._loaded = False
        self._load_error = False

    @property
    def loaded(self) -> bool:
        """Return whether the manager is serving a profile."""
        return self._loaded

    @property
    def load_error(self) -> bool:
        """Return whether the stored profile was rejected during setup."""
        return self._load_error

    @property
    def profile(self) -> EnergyProfile:
        """Return the active validated profile."""
        return self._profile

    @property
    def adapters(self) -> Mapping[EnergyModule, EnergyModuleAdapter]:
        """Return one adapter per configured module."""
        return dict(self._adapters)

    @property
    def module_status(self) -> Mapping[EnergyModule, ModuleStatus]:
        """Return the last computed status of every module, including absent ones."""
        return {
            module: self._module_status.get(module, ModuleStatus.ABSENT)
            for module in EnergyModule
        }

    async def async_setup(self) -> None:
        """Load the stored profile; an invalid document disables Energy only."""
        document = await self.store.async_load()
        profile = EnergyProfile()
        self._load_error = False
        if document is not None:
            try:
                profile = parse_stored_profile(document)
            except EnergyValidationError as err:
                self._load_error = True
                _LOGGER.error(
                    "Stored Domus Energy profile is invalid (%s); energy modules "
                    "stay disabled until the profile is saved again",
                    err,
                )
        self._apply_profile(profile)
        self._loaded = True

    async def async_shutdown(self) -> None:
        """Release state tracking, adapters and listeners."""
        self._loaded = False
        self._stop_tracking()
        self._adapters.clear()
        self._module_status.clear()
        self._listeners.clear()

    @callback
    def async_add_listener(self, listener: Callable[[str], None]) -> Callable[[], None]:
        """Register a change listener and return its unsubscribe callback."""
        self._listeners.add(listener)

        @callback
        def unsubscribe() -> None:
            self._listeners.discard(listener)

        return unsubscribe

    def read_modules(self) -> dict[EnergyModule, CapabilityState]:
        """Return the current capability state of each configured module."""
        return {module: adapter.read() for module, adapter in self._adapters.items()}

    def profile_document(self) -> dict[str, Any]:
        """Return the active profile as a versioned document."""
        document = self._profile.as_document()
        document["load_error"] = self._load_error
        return document

    async def async_save_profile(
        self, document: Any, expected_revision: int | None
    ) -> dict[str, Any]:
        """Validate, persist and apply a user-confirmed profile."""
        if not self._loaded:
            raise EnergyUnavailableError("Domus Energy is not running")
        candidate = parse_profile(document)
        async with self._lock:
            current = self._profile.revision
            if expected_revision is not None and expected_revision != current:
                raise EnergyConflictError(
                    f"Energy profile changed (revision {current}); reload and retry"
                )
            # A save without a tariff key (the setup wizard) keeps the tariff.
            tariff = candidate.tariff if "tariff" in document else self._profile.tariff
            profile = replace(
                candidate,
                revision=current + 1,
                updated_at=utc_now().isoformat(),
                tariff=tariff,
            )
            await self.store.async_save(profile.as_document())
            self._load_error = False
            self._apply_profile(profile)
        self._notify(CHANGE_PROFILE)
        return self.profile_document()

    def _apply_profile(self, profile: EnergyProfile) -> None:
        self._stop_tracking()
        self._profile = profile
        self._adapters = {
            module: EnergyModuleAdapter(self.hass, config)
            for module, config in profile.modules.items()
        }
        self._module_status = self._compute_status()
        if profile.entity_ids:
            self._unsubscribe_states = async_track_state_change_event(
                self.hass, list(profile.entity_ids), self._handle_state_change
            )

    def _stop_tracking(self) -> None:
        if self._unsubscribe_states is not None:
            self._unsubscribe_states()
            self._unsubscribe_states = None

    def _compute_status(self) -> dict[EnergyModule, ModuleStatus]:
        return {
            module: ModuleStatus(state.values["status"])
            for module, state in self.read_modules().items()
        }

    @callback
    def _handle_state_change(self, _event: Event) -> None:
        if not self._loaded:
            return
        status = self._compute_status()
        if status == self._module_status:
            return
        self._module_status = status
        self._notify(CHANGE_AVAILABILITY)

    def _notify(self, change: str) -> None:
        for listener in tuple(self._listeners):
            try:
                listener(change)
            except Exception:
                _LOGGER.exception("Domus Energy listener failed")
