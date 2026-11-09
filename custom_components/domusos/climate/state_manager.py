"""Persist Climate intent and coordinate explicit manual supervisory execution."""

from __future__ import annotations

import asyncio
import glob
import logging
from collections.abc import Callable
from copy import deepcopy
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4
from zoneinfo import ZoneInfo

from homeassistant.const import EVENT_CORE_CONFIG_UPDATE
from homeassistant.core import Context, HomeAssistant, callback
from homeassistant.helpers.event import async_track_state_change_event
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from ..core.audit import AuditEntry
from .auto_resolver import resolve_auto
from .auto_timer import BoundaryTimer
from .execution_plan import build_execution_preview
from .execution_runtime import ExecutionRuntime
from .execution_validation import (
    CURRENT_EXECUTION_VALIDATION,
    ExecutionValidationCapabilities,
)
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
    OverrideUnavailable,
    StoreUnavailable,
    UnsupportedSchema,
)
from .overrides import active_overrides, expiry_instant, utc_instant
from .supervisory_adapter import AdapterBlocked, SupervisoryAdapter

_LOGGER = logging.getLogger(__name__)
DATA_CLIMATE_STATE_MANAGER = "climate_state_manager"


class ClimateStateManager:
    def __init__(self, hass: HomeAssistant, config_manager: ClimateManager, *, store: Any = None,
                 clock: Callable[[], datetime] | None = None, schedule: Callable[[float, Callable[[], None]], Any] | None = None,
                 execution_schedule: Callable[[float, Callable[[], None]], Any] | None = None,
                 validation: ExecutionValidationCapabilities = CURRENT_EXECUTION_VALIDATION) -> None:
        self.hass = hass
        self.config_manager = config_manager
        self.store: Store[dict[str, Any]] = store if store is not None else Store(hass, STATE_VERSION, STATE_STORAGE_KEY)
        self.state = ClimateStoreState.ABSENT
        self.revision = 0
        self.intent: dict[str, Any] | None = None
        self._lock = asyncio.Lock()
        self._execute_lock = asyncio.Lock()
        self._unsub_states: Any = None
        self._unsub_config: Any = None
        self._clock = clock or (lambda: datetime.now(UTC))
        self._execution_validation = validation
        self._boundary = BoundaryTimer(self._clock, schedule or hass.loop.call_later, self._on_boundary)
        self._execution = ExecutionRuntime(hass, self._clock, execution_schedule or hass.loop.call_later, self._audit_execution)
        self._adapter = SupervisoryAdapter(hass)
        self._snapshot: dict[str, Any] | None = None
        self._execution_snapshot: dict[str, Any] | None = None
        self._cleanup_queued = False
        self._running = False

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
        await self.async_cleanup_overrides()
        self._running = True
        self._execution.start()
        self._unsub_config = self.hass.bus.async_listen(EVENT_CORE_CONFIG_UPDATE, self._on_core_config_update)
        self.refresh_config()

    async def async_shutdown(self) -> None:
        self._running = False
        self._boundary.cancel()
        self._execution.stop()
        if self._unsub_config is not None:
            self._unsub_config()
            self._unsub_config = None
        if self._unsub_states is not None:
            self._unsub_states()
            self._unsub_states = None
        self._snapshot = None
        self._execution_snapshot = None

    @callback
    def refresh_config(self) -> None:
        if not self._running:
            return
        if self._unsub_states is not None:
            self._unsub_states()
            self._unsub_states = None
        config = self.config_manager.config if self.config_manager.state is ClimateStoreState.READY else None
        if config is None:
            self._boundary.cancel()
            self._snapshot = None
            self._execution_snapshot = None
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
        self._queue_cleanup()

    @callback
    def _on_state_change(self, _event: Any) -> None:
        self._recompute()
        self._execution.reconcile_all()

    @callback
    def _on_core_config_update(self, _event: Any) -> None:
        self._recompute()

    @callback
    def _on_boundary(self) -> None:
        self._recompute()
        self._queue_cleanup()

    def _current_intent(self) -> dict[str, Any]:
        config = self.config_manager.config
        assert config is not None
        base = deepcopy(self.intent) if self.intent is not None else default_intent(config)
        base["zones"] = {zone["id"]: base["zones"].get(zone["id"], {"mode": "follow_house", "targetTemperature": None}) for zone in config["zones"]}
        return base

    def _house_zone(self) -> ZoneInfo | str | None:
        zone_name = getattr(self.hass.config, "time_zone", None)
        loaded_zone = dt_util.get_default_time_zone()
        if isinstance(loaded_zone, ZoneInfo) and loaded_zone.key == zone_name:
            return loaded_zone
        return "UTC" if zone_name == "UTC" else None

    def _needs_cleanup(self) -> bool:
        if self.intent is None or self.config_manager.config is None:
            return False
        zone_ids = {item["id"] for item in self.config_manager.config["zones"]}
        if set(self.intent["zones"]) != zone_ids:
            return True
        if self.intent["house"]["controlMode"] != "auto" and self.intent.get("overrides"):
            return True
        return len(active_overrides(self.intent.get("overrides", {}), self._clock(), zone_ids)) != len(self.intent.get("overrides", {}))

    def _queue_cleanup(self) -> None:
        if not self._running or self._cleanup_queued or not self._needs_cleanup():
            return
        self._cleanup_queued = True

        async def run() -> None:
            try:
                await self.async_cleanup_overrides()
            finally:
                self._cleanup_queued = False

        self.hass.async_create_task(run())

    async def async_cleanup_overrides(self) -> None:
        async with self._lock:
            if not self._needs_cleanup():
                return
            candidate = self._current_intent()
            zone_ids = {item["id"] for item in self.config_manager.config["zones"]}
            previous = candidate.get("overrides", {})
            remaining = active_overrides(previous, self._clock(), zone_ids) if candidate["house"]["controlMode"] == "auto" else {}
            if remaining:
                candidate["overrides"] = remaining
            else:
                candidate.pop("overrides", None)
            await self._save(candidate, self.revision)
            for zone_id in previous.keys() - remaining.keys():
                if zone_id not in zone_ids:
                    event = "override_orphaned"
                elif utc_instant(previous[zone_id]["expiresAt"], "expiresAt") <= self._clock().astimezone(UTC):
                    event = "override_expired"
                else:
                    event = "override_cleared"
                _LOGGER.info("Climate %s zone=%s", event, zone_id)

    def _recompute(self) -> None:
        config = self.config_manager.config
        if not self._running or config is None or self.config_manager.state is not ClimateStoreState.READY or self.state not in (ClimateStoreState.ABSENT, ClimateStoreState.READY):
            self._boundary.cancel()
            self._snapshot = None
            self._execution_snapshot = None
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
        current_intent = self._current_intent()
        now = self._clock()
        zone_name = getattr(self.hass.config, "time_zone", None)
        house_zone = self._house_zone()
        resolution = resolve_auto(config, now, house_zone) if current_intent["house"]["controlMode"] == "auto" else None
        zone_ids = {item["id"] for item in config["zones"]}
        stored_overrides = current_intent.get("overrides", {}) if current_intent["house"]["controlMode"] == "auto" else {}
        overrides = {zone_id: dict(item) for zone_id, item in active_overrides(stored_overrides, now, zone_ids).items()}
        if house_zone is not None:
            tz = UTC if house_zone == "UTC" else house_zone
            for item in overrides.values():
                local_expiry = utc_instant(item["expiresAt"], "expiresAt").astimezone(tz)
                item["expiresAtLocalTime"] = local_expiry.strftime("%H:%M")
                item["expiresAtLocalDate"] = local_expiry.strftime("%d/%m")
        self._snapshot = preview(config, current_intent, states, auto_resolution=resolution, active_overrides=overrides, now=now)
        self._execution_snapshot = build_execution_preview(
            config, self._snapshot, states, config_revision=self.config_manager.revision,
            state_revision=self.revision, evaluated_at=now, validation=self._execution_validation)
        expiries = [utc_instant(item["expiresAt"], "expiresAt") for item in overrides.values()]
        self._boundary.update(resolution, zone_name, expiries)

    def get_state(self) -> dict[str, Any]:
        # Also recompute on read: a new config or a just-arrived HA state is immediately visible.
        self._recompute()
        self._execution.reconcile_all()
        self._queue_cleanup()
        return {"state": self.state.value, "revision": self.revision, "configState": self.config_manager.state.value,
                "configRevision": self.config_manager.revision, "preview": deepcopy(self._snapshot),
                "executionPreview": deepcopy(self._execution_snapshot),
                "executionRuntime": self._execution.snapshot(self.config_manager.config)}

    def _audit_execution(self, reason: str, correlation: Any) -> None:
        try:
            runtime = self.config_manager._runtime()
            if runtime is not None and runtime.audit.running:
                runtime.audit.record(AuditEntry.create(
                    "climate.execution", reason, result=correlation["status"],
                    correlation_id=correlation["correlationId"],
                    metadata={"zoneId": correlation["zoneId"], "endpointId": correlation["endpointId"],
                              "entityId": correlation["entityId"], "actionKinds": correlation["actionKinds"],
                              "result": correlation["status"]},
                ))
        except Exception:
            _LOGGER.debug("Climate execution audit could not be recorded", exc_info=True)

    async def async_execute_plan(self, zone_id: Any, expected_plan_token: Any,
                                 expected_config_revision: Any, expected_state_revision: Any,
                                 user: Any) -> dict[str, Any]:
        """Manually execute one freshly recomputed, armed and ready zone plan."""
        self._require_account(user)
        if type(zone_id) is not str or type(expected_plan_token) is not str or len(expected_plan_token) != 32:
            raise InvalidConfig("plan", "invalid zone or plan token")
        if type(expected_config_revision) is not int or type(expected_state_revision) is not int:
            raise InvalidConfig("revision", "expected integers")
        async with self._execute_lock:
            if not self._running:
                raise StoreUnavailable("Climate runtime is stopped")
            await self.async_cleanup_overrides()
            state = self.get_state()
            config = self.config_manager.config
            if config is None or state["executionPreview"] is None:
                raise StoreUnavailable("Climate execution preview is unavailable")
            plan = next((item for item in state["executionPreview"]["plans"] if item["zoneId"] == zone_id), None)
            if plan is None:
                raise InvalidConfig("zoneId", "unknown zone")
            token = plan["planToken"]

            def blocked(reason: str, blockers: list[str] | None = None) -> dict[str, Any]:
                return {"result": "blocked", "status": "blocked", "planToken": token,
                        "actionsAttempted": 0, "failureReason": reason, "blockers": blockers or []}

            if (expected_config_revision != self.config_manager.revision
                    or expected_state_revision != self.revision or expected_plan_token != token):
                return blocked("plan_stale", ["plan_stale"])
            if config.get("physicalExecutionEnabled") is not True:
                return blocked("execution_disabled", ["execution_disabled"])
            if plan["status"] == "noop":
                return {"result": "noop", "status": "noop", "planToken": token,
                        "actionsAttempted": 0, "failureReason": None, "blockers": []}
            if not plan["physicalExecutionAllowed"]:
                return blocked("execution_blocked", plan["physicalBlockers"])
            if not plan["actions"]:
                return {"result": "noop", "status": "noop", "planToken": token,
                        "actionsAttempted": 0, "failureReason": None, "blockers": []}
            try:
                self._adapter.validate(config, plan, self._clock())
            except AdapterBlocked as err:
                return blocked("execution_blocked", [err.reason])
            if not self._running:
                return blocked("runtime_stopped", ["runtime_stopped"])
            duplicate = self._execution.duplicate(plan)
            if duplicate is not None:
                return {"result": "duplicate", "status": duplicate["status"], "planToken": token,
                        "correlationId": duplicate["correlationId"], "actionsAttempted": 0,
                        "failureReason": None, "blockers": []}
            correlation = self._execution.begin(plan)
            correlation_id = correlation["correlationId"]
            context = Context(user_id=user.id)
            attempted = 0
            for action in plan["actions"]:
                if not self._running:
                    return blocked("runtime_stopped", ["runtime_stopped"])
                attempted += 1
                try:
                    live_config = self.config_manager.config
                    if (live_config is None or self.config_manager.revision != plan["configRevision"]
                            or self.revision != plan["stateRevision"]):
                        raise AdapterBlocked("plan_stale")
                    self._adapter.validate(live_config, plan, self._clock())
                    await self._adapter.send_action(plan, action, context)
                except AdapterBlocked as err:
                    if not self._running:
                        return blocked("runtime_stopped", ["runtime_stopped"])
                    correlation = self._execution.fail(correlation_id, action["kind"], err.reason)
                    break
                except Exception:  # noqa: BLE001 - HA service handlers can raise arbitrary exceptions.
                    if not self._running:
                        return blocked("runtime_stopped", ["runtime_stopped"])
                    _LOGGER.warning("Climate supervisory command failed for correlation %s", correlation_id)
                    correlation = self._execution.fail(correlation_id, action["kind"], "service_call_failed")
                    break
                if not self._running:
                    return blocked("runtime_stopped", ["runtime_stopped"])
                self._execution.completed(correlation_id, action["kind"])
            else:
                self._execution.reconcile_all()
                correlation = self._execution.correlation(correlation_id)
            assert correlation is not None
            return {"result": "dispatched", "status": correlation["status"], "planToken": token,
                    "correlationId": correlation_id, "actionsAttempted": attempted,
                    "failureReason": correlation["failureReason"], "blockers": []}

    async def async_get_state(self) -> dict[str, Any]:
        await self.async_cleanup_overrides()
        return self.get_state()

    def _require_account(self, user: Any) -> None:
        # Access Control enforcement is the sole authorization path at the WS boundary.
        if user is None or getattr(user, "is_active", False) is not True:
            raise ClimatePermissionError("An active Home Assistant account is required")

    def _validate_write(self, expected_revision: int) -> None:
        if self.config_manager.state is not ClimateStoreState.READY:
            raise StoreUnavailable("Climate installation is not configured")
        if self.state not in (ClimateStoreState.ABSENT, ClimateStoreState.READY):
            raise StoreUnavailable(f"Climate intent store is {self.state.value}")
        if type(expected_revision) is not int or expected_revision != self.revision:
            raise Conflict("Climate intent changed; reload before saving")

    async def _save(self, candidate: dict[str, Any], expected_revision: int) -> dict[str, Any]:
        self._validate_write(expected_revision)
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
            cleared = list(candidate.get("overrides", {})) if control_mode == "manual" else []
            if control_mode == "manual":
                candidate.pop("overrides", None)
            result = await self._save(candidate, expected_revision)
            for zone_id in cleared:
                _LOGGER.info("Climate override_cleared zone=%s reason=manual", zone_id)
            return result

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

    async def async_set_zone_override(self, zone_id: Any, target_temperature: Any, expiry_mode: Any,
                                      expected_revision: int, user: Any, *, duration_minutes: Any = None,
                                      until_time: Any = None) -> dict[str, Any]:
        self._require_account(user)
        async with self._lock:
            self._validate_write(expected_revision)
            candidate = self._current_intent()
            if candidate["house"]["controlMode"] != "auto":
                raise OverrideUnavailable("Temporary overrides require AUTO control")
            if type(zone_id) is not str or zone_id not in candidate["zones"]:
                raise InvalidConfig("zoneId", "unknown zone")
            now = self._clock()
            house_zone = self._house_zone()
            resolution = resolve_auto(self.config_manager.config, now, house_zone)
            expires = expiry_instant(expiry_mode, now, house_zone, resolution,
                                     duration_minutes=duration_minutes, until_time=until_time)
            override = {"id": uuid4().hex, "zoneId": zone_id, "targetTemperature": target_temperature,
                        "createdAt": now.astimezone(UTC).isoformat(), "expiresAt": expires.isoformat(), "expiryMode": expiry_mode}
            candidate.setdefault("overrides", {})[zone_id] = override
            result = await self._save(candidate, expected_revision)
            _LOGGER.info("Climate override_created zone=%s mode=%s", zone_id, expiry_mode)
            return result

    async def async_clear_zone_override(self, zone_id: Any, expected_revision: int, user: Any) -> dict[str, Any]:
        self._require_account(user)
        async with self._lock:
            self._validate_write(expected_revision)
            candidate = self._current_intent()
            if type(zone_id) is not str or zone_id not in candidate["zones"]:
                raise InvalidConfig("zoneId", "unknown zone")
            if zone_id not in candidate.get("overrides", {}):
                return self.get_state()
            candidate["overrides"].pop(zone_id)
            if not candidate["overrides"]:
                candidate.pop("overrides")
            result = await self._save(candidate, expected_revision)
            _LOGGER.info("Climate override_cleared zone=%s", zone_id)
            return result
