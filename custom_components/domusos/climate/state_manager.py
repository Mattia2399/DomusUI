"""Persist climate intent separately; observe configured HA entities without commanding them."""

from __future__ import annotations

import asyncio
import glob
import logging
from copy import deepcopy
from typing import Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import async_track_state_change_event
from homeassistant.helpers.storage import Store

from .intent import (
    STATE_STORAGE_KEY,
    STATE_VERSION,
    default_intent,
    parse_intent,
    parse_state_document,
    preview,
    state_document,
)
from .manager import ClimateManager, ClimateStoreState
from .models import (
    ClimatePermissionError,
    Conflict,
    InvalidConfig,
    StoreUnavailable,
    UnsupportedSchema,
)

_LOGGER = logging.getLogger(__name__)
DATA_CLIMATE_STATE_MANAGER = "climate_state_manager"


class ClimateStateManager:
    def __init__(self, hass: HomeAssistant, config_manager: ClimateManager, *, store: Any = None) -> None:
        self.hass = hass
        self.config_manager = config_manager
        self.store: Store[dict[str, Any]] = store if store is not None else Store(hass, STATE_VERSION, STATE_STORAGE_KEY)
        self.state = ClimateStoreState.ABSENT
        self.revision = 0
        self.intent: dict[str, Any] | None = None
        self._lock = asyncio.Lock()
        self._unsub_states: Any = None
        self._snapshot: dict[str, Any] | None = None

    async def async_setup(self) -> None:
        try:
            raw = await self.store.async_load()
        except NotImplementedError:
            self.state = ClimateStoreState.UNSUPPORTED
        except Exception:
            _LOGGER.exception("Climate intent store could not be loaded")
            self.state = ClimateStoreState.CORRUPT
        else:
            if raw is None:
                path = getattr(self.store, "path", None) or self.hass.config.path(".storage", STATE_STORAGE_KEY)
                if await self.hass.async_add_executor_job(glob.glob, f"{glob.escape(str(path))}.corrupt*"):
                    self.state = ClimateStoreState.CORRUPT
            else:
                try:
                    self.revision, self.intent = parse_state_document(raw)
                except UnsupportedSchema:
                    self.state = ClimateStoreState.UNSUPPORTED
                except InvalidConfig:
                    self.state = ClimateStoreState.CORRUPT
                else:
                    self.state = ClimateStoreState.READY
        self.refresh_config()

    async def async_shutdown(self) -> None:
        if self._unsub_states is not None:
            self._unsub_states()
            self._unsub_states = None
        self._snapshot = None

    @callback
    def refresh_config(self) -> None:
        if self._unsub_states is not None:
            self._unsub_states()
            self._unsub_states = None
        config = self.config_manager.config if self.config_manager.state is ClimateStoreState.READY else None
        if config is None:
            self._snapshot = None
            return
        entity_ids = {
            entity_id
            for zone in config["zones"]
            for reference in (zone["reference"], zone.get("humidityReference"))
            if reference is not None
            for entity_id in [reference["primaryEntityId"], *reference["fallbacks"]]
        }
        entity_ids.update(item["entity"]["primaryEntityId"] for item in config["endpoints"])
        if entity_ids:
            self._unsub_states = async_track_state_change_event(self.hass, sorted(entity_ids), self._on_state_change)
        self._recompute()

    @callback
    def _on_state_change(self, _event: Any) -> None:
        self._recompute()

    def _current_intent(self) -> dict[str, Any]:
        config = self.config_manager.config
        assert config is not None
        base = deepcopy(self.intent) if self.intent is not None else default_intent(config)
        base["zones"] = {zone["id"]: base["zones"].get(zone["id"], {"mode": "follow_house", "targetTemperature": None}) for zone in config["zones"]}
        return base

    def _recompute(self) -> None:
        config = self.config_manager.config
        if config is None:
            self._snapshot = None
            return
        ids = {
            entity_id
            for zone in config["zones"]
            for reference in (zone["reference"], zone.get("humidityReference"))
            if reference is not None
            for entity_id in [reference["primaryEntityId"], *reference["fallbacks"]]
        }
        ids.update(item["entity"]["primaryEntityId"] for item in config["endpoints"])
        states = {entity_id: self.hass.states.get(entity_id) for entity_id in ids}
        self._snapshot = preview(config, self._current_intent(), states)

    def get_state(self) -> dict[str, Any]:
        # Also recompute on read: a new config or a just-arrived HA state is immediately visible.
        self._recompute()
        return {"state": self.state.value, "revision": self.revision, "configState": self.config_manager.state.value,
                "configRevision": self.config_manager.revision, "preview": deepcopy(self._snapshot)}

    def _require_account(self, user: Any) -> None:
        # Access Control enforcement is the sole authorization path at the WS boundary.
        if user is None or getattr(user, "is_active", False) is not True:
            raise ClimatePermissionError("An active Home Assistant account is required")

    async def _save(self, candidate: dict[str, Any], expected_revision: int) -> dict[str, Any]:
        if self.config_manager.state is not ClimateStoreState.READY:
            raise StoreUnavailable("Climate installation is not configured")
        if self.state not in (ClimateStoreState.ABSENT, ClimateStoreState.READY):
            raise StoreUnavailable(f"Climate intent store is {self.state.value}")
        if type(expected_revision) is not int or expected_revision != self.revision:
            raise Conflict("Climate intent changed; reload before saving")
        candidate = parse_intent(candidate)
        if self.state is ClimateStoreState.READY and candidate == self.intent:
            return self.get_state()
        revision = self.revision + 1
        try:
            await self.store.async_save(state_document(revision, candidate))
        except Exception as err:
            _LOGGER.exception("Climate intent could not be saved")
            raise StoreUnavailable("Climate intent store write failed") from err
        self.intent = candidate
        self.revision = revision
        self.state = ClimateStoreState.READY
        return self.get_state()

    async def async_set_house_intent(self, operating_mode: Any, control_mode: Any, expected_revision: int, user: Any) -> dict[str, Any]:
        self._require_account(user)
        async with self._lock:
            candidate = self._current_intent() if self.config_manager.config is not None else None
            if candidate is None:
                raise StoreUnavailable("Climate installation is not configured")
            candidate["house"] = {"operatingMode": operating_mode, "controlMode": control_mode}
            return await self._save(candidate, expected_revision)

    async def async_set_zone_intent(self, zone_id: Any, mode: Any, target_temperature: Any, expected_revision: int, user: Any) -> dict[str, Any]:
        self._require_account(user)
        async with self._lock:
            candidate = self._current_intent() if self.config_manager.config is not None else None
            if candidate is None:
                raise StoreUnavailable("Climate installation is not configured")
            if type(zone_id) is not str or zone_id not in candidate["zones"]:
                raise InvalidConfig("zoneId", "unknown zone")
            candidate["zones"][zone_id] = {"mode": mode, "targetTemperature": target_temperature}
            return await self._save(candidate, expected_revision)
