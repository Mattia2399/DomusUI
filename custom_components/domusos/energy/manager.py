"""Authoritative owner of the Energy Profile and module availability."""

from __future__ import annotations

import asyncio
import glob
import logging
from collections.abc import Callable, Mapping
from typing import Any

from homeassistant.core import CALLBACK_TYPE, Event, HomeAssistant, callback
from homeassistant.helpers.event import async_track_state_change_event
from homeassistant.helpers.storage import Store

from ..core import CapabilityState
from ..core._values import utc_now
from .aggregation import NO_POWER_SENSORS, ModuleAggregator
from .meters import EnergyMeterResolver, MeterReport, energy_meter_plan, profile_statistic_ids
from .models import (
    STORAGE_KEY,
    STORAGE_VERSION,
    EnergyConflictError,
    EnergyModule,
    EnergyProfile,
    EnergyProfileRequiresV2Error,
    EnergyUnavailableError,
    EnergyValidationError,
    ModuleStatus,
    parse_profile,
    parse_stored_profile,
)
from .profile_v2 import (
    MAX_RETIRED_DEVICE_IDS,
    STORAGE_KEY_V2,
    EnergyProfileV2,
    lossless_v1,
    parse_profile_v2,
    parse_stored_profile_v2,
    upgrade_v1,
    v1_save_allowed,
)

_LOGGER = logging.getLogger(__name__)

CHANGE_PROFILE = "profile"
CHANGE_AVAILABILITY = "availability"

# Last v2 document that could not be read, kept before an explicit save replaces it.
REJECTED_STORAGE_KEY = f"{STORAGE_KEY_V2}.rejected"


def _salvaged_revision(*documents: Any) -> int:
    """Highest readable revision of unreadable documents, so conflict checks never restart."""
    revisions = [
        document["revision"]
        for document in documents
        if isinstance(document, Mapping)
        and isinstance(document.get("revision"), int)
        and not isinstance(document["revision"], bool)
        and document["revision"] >= 0
    ]
    return max(revisions, default=0)


def _meters_result(profile: EnergyProfileV2, report: MeterReport) -> dict[str, Any]:
    """The meters' condition and how each module energy role is obtained."""
    return {**report.as_dict(), "plan": energy_meter_plan(profile)}


class EnergyProfileManager:
    """Persist the Energy Profile and expose read-only module adapters.

    Storage. ``domusos.energy.v2`` is authoritative once written. Until then the
    v1 document ``domusos.energy.v1`` is converted in memory; reading never
    writes. The first explicit save writes v2 only, so the v1 document stays as
    it was, a snapshot an older Domus UI keeps reading after a downgrade. Nothing
    is ever merged between the two: a v1 document changed after the migration is
    only reported as diverged.

    The profile is applied in place, so saving it never reloads the config entry
    or interrupts Irrigation. Each module is served live by a ``ModuleAggregator``
    over its devices; a module without any realtime power sensor is listed as
    unsupported instead of being shown.
    """

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        # v1: read-only from now on, the rollback snapshot.
        self.store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self.store_v2: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY_V2)
        self.rejected_store: Store[Any] = Store(hass, STORAGE_VERSION, REJECTED_STORAGE_KEY)
        self._profile_v2 = EnergyProfileV2()
        self._profile = EnergyProfile()
        self._unsupported_modules: dict[EnergyModule, str] = {}
        self._entity_modules: dict[str, EnergyModule] = {}
        self._stored_v2 = False
        self._rejected_document: Any = None
        # The v1 document as read at setup: (present, parsed, valid). It never changes
        # afterwards, since only an older Domus UI writes it.
        self._v1_document: tuple[bool, EnergyProfile | None, bool] = (False, None, False)
        self._adapters: dict[EnergyModule, ModuleAggregator] = {}
        self._module_status: dict[EnergyModule, ModuleStatus] = {}
        self._listeners: set[Callable[[str], None]] = set()
        self._unsubscribe_states: CALLBACK_TYPE | None = None
        self._lock = asyncio.Lock()
        # Energy meters are checked against the Recorder on request, never stored.
        self.meters = EnergyMeterResolver(hass)
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
        """Return the v1 view of the profile, without modules when v1 cannot hold it."""
        return self._profile

    @property
    def profile_v2(self) -> EnergyProfileV2:
        """Return the authoritative profile."""
        return self._profile_v2

    @property
    def unsupported_modules(self) -> Mapping[EnergyModule, str]:
        """Return installed modules that cannot be shown live, with the reason."""
        return dict(self._unsupported_modules)

    @property
    def adapters(self) -> Mapping[EnergyModule, ModuleAggregator]:
        """Return one aggregator per module served live."""
        return dict(self._adapters)

    @property
    def module_status(self) -> Mapping[EnergyModule, ModuleStatus]:
        """Return the last computed status of every module, including absent ones."""
        return {
            module: self._module_status.get(module, ModuleStatus.ABSENT)
            for module in EnergyModule
        }

    async def async_setup(self) -> None:
        """Load v2, or convert v1 in memory; an invalid document disables Energy only."""
        self._load_error = False
        self._rejected_document = None
        stored_v2 = await self.store_v2.async_load()
        stored_v1 = await self.store.async_load()
        # Home Assistant moves a file it cannot decode aside and loads nothing:
        # that document is unreadable, not missing.
        v2_quarantined = stored_v2 is None and await self._async_quarantined(self.store_v2)
        v1_quarantined = stored_v1 is None and await self._async_quarantined(self.store)
        self._stored_v2 = stored_v2 is not None or v2_quarantined
        v1_present = stored_v1 is not None or v1_quarantined
        v1, v1_valid = None, False
        if stored_v1 is not None:
            try:
                v1 = parse_stored_profile(stored_v1)
                v1_valid = True
            except EnergyValidationError as err:
                if not self._stored_v2:
                    _LOGGER.error(
                        "Stored Domus Energy profile is invalid (%s); energy modules "
                        "stay disabled until the profile is saved again",
                        err,
                    )

        if v2_quarantined:
            # Never fall back to v1 silently: v1 may be older than the lost v2.
            self._load_error = True
            profile = EnergyProfileV2(revision=_salvaged_revision(stored_v1))
            _LOGGER.error(
                "Stored Domus Energy profile v2 could not be decoded and was set aside "
                "by Home Assistant; energy modules stay disabled until the profile is "
                "saved again. The v1 document is not used"
            )
        elif self._stored_v2:
            try:
                profile = parse_stored_profile_v2(stored_v2)
            except EnergyValidationError as err:
                # Never fall back to v1 silently: v1 may be older than this v2.
                self._load_error = True
                self._rejected_document = stored_v2
                profile = EnergyProfileV2(revision=_salvaged_revision(stored_v2, stored_v1))
                _LOGGER.error(
                    "Stored Domus Energy profile v2 is invalid (%s); energy modules stay "
                    "disabled until the profile is saved again. The v1 document is kept",
                    err,
                )
        elif v1 is not None:
            profile = upgrade_v1(v1)
        elif v1_present:
            self._load_error = True
            profile = EnergyProfileV2(revision=_salvaged_revision(stored_v1))
            if v1_quarantined:
                _LOGGER.error(
                    "Stored Domus Energy profile could not be decoded and was set aside "
                    "by Home Assistant; energy modules stay disabled until the profile "
                    "is saved again"
                )
        else:
            profile = EnergyProfileV2()

        self._v1_document = (v1_present, v1, v1_valid)
        self._apply_profile(profile)
        legacy = self._legacy_snapshot()
        if legacy and legacy["diverged"]:
            _LOGGER.warning(
                "The Domus Energy v1 document changed after the migration to v2 "
                "(probably with an older Domus UI). Profile v2 stays authoritative; "
                "the changes were not merged"
            )
        self._loaded = True

    async def _async_quarantined(self, store: Store[Any]) -> bool:
        """Return whether Home Assistant set aside an undecodable copy of the store."""
        pattern = f"{glob.escape(store.path)}.corrupt.*"
        return bool(await self.hass.async_add_executor_job(glob.glob, pattern))

    def _legacy_snapshot(self) -> dict[str, Any] | None:
        """Describe the v1 document next to the authoritative profile."""
        v1_present, v1, v1_valid = self._v1_document
        if not v1_present:
            return None
        migrated = self._profile_v2.migrated_from
        diverged = self._stored_v2 and (
            v1 is None
            or migrated is None
            or (v1.revision, v1.updated_at) != (migrated.revision, migrated.updated_at)
        )
        return {
            "valid": v1_valid,
            "revision": v1.revision if v1 else None,
            "updated_at": v1.updated_at if v1 else None,
            # Changed after the migration, e.g. by an older Domus UI after a downgrade.
            "diverged": bool(diverged),
        }

    async def async_shutdown(self) -> None:
        """Release state tracking, adapters and listeners."""
        self._loaded = False
        self._stop_tracking()
        self._adapters.clear()
        self._entity_modules.clear()
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
        """Return current capability states without changing tracked status."""
        return {module: adapter.read() for module, adapter in self._adapters.items()}

    def profile_result(self) -> dict[str, Any]:
        """Return the profile for both client generations.

        ``profile`` keeps the v1 shape and is present only when v1 can hold the
        whole profile; ``profile_v2`` always carries the authoritative document.
        """
        v1_view = lossless_v1(self._profile_v2)
        return {
            "profile": (
                {**v1_view.as_document(), "load_error": self._load_error} if v1_view else None
            ),
            "profile_v2": {**self._profile_v2.as_document(), "load_error": self._load_error},
            "v1_compatible": v1_view is not None,
            "runtime": {
                "supported": not self._unsupported_modules,
                "reason": NO_POWER_SENSORS if self._unsupported_modules else None,
                "unsupported_modules": {
                    module.value: reason for module, reason in self._unsupported_modules.items()
                },
            },
            "legacy_v1": self._legacy_snapshot(),
            "module_status": {
                module.value: status.value for module, status in self.module_status.items()
            },
        }

    async def async_profile_result(self) -> dict[str, Any]:
        """Return ``profile_result`` and the energy meters as Home Assistant sees them."""
        result = self.profile_result()
        profile = self._profile_v2
        report = await self.meters.async_resolve(profile_statistic_ids(profile))
        return {**result, "energy_meters": _meters_result(profile, report)}

    async def async_save_profile(
        self, document: Any, expected_revision: int | None, *, version: int = 1
    ) -> dict[str, Any]:
        """Validate, persist and apply a user-confirmed profile.

        ``version`` 1 is a v1 client save (``modules``), accepted only while v1 can
        hold the current profile; ``version`` 2 is a whole v2 document (``plant``).
        """
        if not self._loaded:
            raise EnergyUnavailableError("Domus Energy is not running")
        if not isinstance(document, Mapping):
            raise EnergyValidationError("The energy profile must be an object")
        async with self._lock:
            current = self._profile_v2
            if expected_revision is not None and expected_revision != current.revision:
                raise EnergyConflictError(
                    f"Energy profile changed (revision {current.revision}); reload and retry"
                )
            if version == 1:
                if not v1_save_allowed(current):
                    raise EnergyProfileRequiresV2Error(
                        "The energy profile holds devices, names or meters a v1 client "
                        "cannot keep; update Domus UI to change it"
                    )
                candidate = upgrade_v1(parse_profile(document))
                # v1 ids are positional (<module>-1): a module removed and added back
                # through a v1 client takes its id again.
                removed = current.device_ids - candidate.device_ids
                retired = (set(current.retired_device_ids) | removed) - candidate.device_ids
            else:
                if "plant" not in document:
                    # A partial document would remove every device it does not list.
                    raise EnergyValidationError("A v2 save must include the whole plant")
                candidate = parse_profile_v2(document)
                reused = sorted(candidate.device_ids & set(current.retired_device_ids))
                if reused:
                    raise EnergyValidationError(
                        f"Device id {reused[0]} belonged to a removed device and cannot be reused"
                    )
                retired = set(current.retired_device_ids) | (current.device_ids - candidate.device_ids)
            if len(retired) > MAX_RETIRED_DEVICE_IDS:
                raise EnergyValidationError(
                    f"More than {MAX_RETIRED_DEVICE_IDS} devices were removed over time; "
                    "keep the device instead of replacing it"
                )
            # One Recorder read per save, reused for the result. Only meters this
            # save adds are refused when verifiably wrong: an existing one that
            # changed in Home Assistant must not block unrelated edits.
            meter_ids = profile_statistic_ids(candidate)
            report = await self.meters.async_resolve(meter_ids)
            if rejected := report.incompatible(meter_ids - profile_statistic_ids(current)):
                raise EnergyValidationError(
                    f"{rejected[0].statistic_id} cannot be an energy meter ({rejected[0].reason})"
                )
            profile = EnergyProfileV2(
                plant=candidate.plant,
                revision=current.revision + 1,
                updated_at=utc_now().isoformat(),
                # A save without a tariff key (the setup wizard) keeps the tariff.
                tariff=candidate.tariff if "tariff" in document else current.tariff,
                migrated_from=current.migrated_from,
                retired_device_ids=tuple(retired),
            )
            # Never store a document the next start would reject (e.g. too many
            # retired ids): that would disable Energy after a successful save.
            parse_stored_profile_v2(profile.as_document())
            if self._rejected_document is not None:
                # Keep the unreadable v2 document before an explicit save replaces it.
                await self.rejected_store.async_save(self._rejected_document)
            # Only v2 is written: the v1 document stays the pre-migration snapshot.
            await self.store_v2.async_save(profile.as_document())
            self._stored_v2 = True
            self._rejected_document = None
            self._load_error = False
            self._apply_profile(profile)
        self._notify(CHANGE_PROFILE)
        return {**self.profile_result(), "energy_meters": _meters_result(profile, report)}

    def _apply_profile(self, profile: EnergyProfileV2) -> None:
        self._stop_tracking()
        self._profile_v2 = profile
        self._profile = lossless_v1(profile) or EnergyProfile(
            revision=profile.revision, updated_at=profile.updated_at, tariff=profile.tariff
        )
        aggregators = {
            module: ModuleAggregator(self.hass, module, plan)
            for module, plan in profile.plant.items()
        }
        self._adapters = {m: a for m, a in aggregators.items() if a.measures_power}
        # Energy meters only: shown once history is read (A1.4), never as 0 W.
        self._unsupported_modules = {
            module: NO_POWER_SENSORS for module, a in aggregators.items() if not a.measures_power
        }
        if self._unsupported_modules:
            _LOGGER.info(
                "Domus Energy modules without realtime power sensors are not shown live: %s",
                ", ".join(module.value for module in self._unsupported_modules),
            )
        self._entity_modules = {
            entity_id: module
            for module, aggregator in self._adapters.items()
            for entity_id in aggregator.entity_ids
        }
        self._module_status = self._compute_status()
        if self._entity_modules:
            self._unsubscribe_states = async_track_state_change_event(
                self.hass, list(self._entity_modules), self._handle_state_change
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
    def _handle_state_change(self, event: Event) -> None:
        if not self._loaded:
            return
        # Only the module owning the sensor can change; the others are not re-read.
        module = self._entity_modules.get(event.data.get("entity_id"))
        if module is None:
            return
        status = ModuleStatus(self._adapters[module].read().values["status"])
        if status == self._module_status.get(module):
            return
        self._module_status = {**self._module_status, module: status}
        self._notify(CHANGE_AVAILABILITY)

    def _notify(self, change: str) -> None:
        for listener in tuple(self._listeners):
            try:
                listener(change)
            except Exception:
                _LOGGER.exception("Domus Energy listener failed")
