"""Versioned, revisioned HOUSE store for climate configuration only."""

from __future__ import annotations

import asyncio
import glob
import logging
from collections.abc import Callable
from copy import deepcopy
from enum import StrEnum
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers.storage import Store

from ..const import DOMAIN
from ..core.audit import AuditEntry
from .models import (
    STORAGE_KEY,
    STORAGE_VERSION,
    ClimatePermissionError,
    Conflict,
    InvalidConfig,
    MigrationFailed,
    StoreUnavailable,
    UnsupportedSchema,
    parse_config,
    parse_stored,
    storage_document,
)
from .validation import validate_catalog

_LOGGER = logging.getLogger(__name__)
DATA_CLIMATE_MANAGER = "climate_manager"


class ClimateStoreState(StrEnum):
    ABSENT = "absent"
    READY = "ready"
    CORRUPT = "corrupt"
    UNSUPPORTED = "unsupported"
    MIGRATION_FAILED = "migration_failed"


class ClimateManager:
    def __init__(self, hass: HomeAssistant, *, store: Any = None, runtime: Callable[[], Any] | None = None) -> None:
        self.hass = hass
        self.store: Store[dict[str, Any]] = store if store is not None else Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self._runtime = runtime or (lambda: hass.data.get(DOMAIN, {}).get("runtime"))
        self.state = ClimateStoreState.ABSENT
        self.revision = 0
        self.config: dict[str, Any] | None = None
        self.on_change: Callable[[], None] | None = None
        self._lock = asyncio.Lock()

    async def async_setup(self) -> None:
        try:
            raw = await self.store.async_load()
        except NotImplementedError:
            self.state = ClimateStoreState.UNSUPPORTED
            return
        except Exception:
            _LOGGER.exception("Climate store could not be loaded")
            self.state = ClimateStoreState.CORRUPT
            return
        if raw is None:
            # HA may quarantine invalid JSON and return None: never pretend that it was absent.
            path = getattr(self.store, "path", None) or self.hass.config.path(".storage", STORAGE_KEY)
            if await self.hass.async_add_executor_job(glob.glob, f"{glob.escape(str(path))}.corrupt*"):
                self.state = ClimateStoreState.CORRUPT
            return
        try:
            self.revision, self.config = parse_stored(raw)
        except UnsupportedSchema:
            self.state = ClimateStoreState.UNSUPPORTED
        except MigrationFailed:
            self.state = ClimateStoreState.MIGRATION_FAILED
        except InvalidConfig:
            self.state = ClimateStoreState.CORRUPT
        else:
            self.state = ClimateStoreState.READY

    async def async_shutdown(self) -> None:
        """No listeners or controller are started by CLM.2."""

    def get_config(self) -> dict[str, Any]:
        return {"state": self.state.value, "revision": self.revision, "config": deepcopy(self.config)}

    async def async_save_config(self, payload: Any, expected_revision: int, user: Any) -> dict[str, Any]:
        if user is None or getattr(user, "is_active", False) is not True or getattr(user, "is_admin", False) is not True:
            raise ClimatePermissionError("Home Assistant administrator required")
        candidate = parse_config(payload)
        async with self._lock:
            if self.state not in (ClimateStoreState.ABSENT, ClimateStoreState.READY):
                raise StoreUnavailable(f"Climate store is {self.state.value}")
            if type(expected_revision) is not int or expected_revision != self.revision:
                raise Conflict("Climate configuration changed; reload before saving")
            areas = ar.async_get(self.hass)
            validate_catalog(
                candidate,
                area_exists=lambda area_id: areas.async_get_area(area_id) is not None,
                get_state=self.hass.states.get,
            )
            if self.state is ClimateStoreState.READY and candidate == self.config:
                return self.get_config()
            next_revision = self.revision + 1
            try:
                await self.store.async_save(storage_document(next_revision, candidate))
            except Exception as err:
                _LOGGER.exception("Climate configuration could not be saved")
                raise StoreUnavailable("Climate store write failed") from err
            before = self.revision
            was_armed = bool(self.config and self.config.get("physicalExecutionEnabled") is True)
            self.config = candidate
            self.revision = next_revision
            self.state = ClimateStoreState.READY
            if self.on_change is not None:
                try:
                    self.on_change()
                except Exception:
                    _LOGGER.exception("Climate state listener could not refresh after configuration save")
            self._audit_change(before, next_revision, user.id, was_armed,
                               candidate.get("physicalExecutionEnabled") is True)
            return self.get_config()

    def _audit_change(self, before: int, after: int, principal_id: str,
                      was_armed: bool, is_armed: bool) -> None:
        try:
            runtime = self._runtime()
            if runtime is not None and runtime.audit.running:
                runtime.audit.record(AuditEntry.create(
                    "climate.config", "save_config", result="success",
                    metadata={"action": "domusos/climate/save_config", "revision_before": before,
                              "revision_after": after, "principal_id": principal_id},
                ))
                if was_armed != is_armed:
                    runtime.audit.record(AuditEntry.create(
                        "climate.execution", "execution_armed" if is_armed else "execution_disarmed",
                        result="success", metadata={"principal_id": principal_id,
                                                    "revision_before": before, "revision_after": after},
                    ))
        except Exception:
            _LOGGER.debug("Climate audit could not be recorded", exc_info=True)
