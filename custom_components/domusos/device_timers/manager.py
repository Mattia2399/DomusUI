"""Server-owned device timers: the device switches off even with no Domus UI open.

The store keeps the timers across restarts; one scheduled call per timer
switches its device off. A device switched off by any other means ends its
timer. A timer that ended while Home Assistant was down switches its device
off once Home Assistant has started.

Timers last a day at most, so an unreadable store is reported and replaced by
the next timer instead of blocking every device.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
import logging
from typing import Any

from homeassistant.auth.models import User
from homeassistant.auth.permissions.const import POLICY_CONTROL, POLICY_READ
from homeassistant.const import STATE_OFF
from homeassistant.core import CALLBACK_TYPE, Context, Event, EventStateChangedData, HomeAssistant, callback
from homeassistant.helpers.event import async_track_point_in_utc_time, async_track_state_change_event
from homeassistant.helpers.start import async_at_started
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from ..const import DOMAIN
from ..core import DomusRuntime
from ..core.audit import AuditEntry
from ..core.events import DomusEvent
from .models import (
    MAX_TIMERS,
    STORAGE_KEY,
    STORAGE_VERSION,
    CommandFailedError,
    DeviceTimer,
    DeviceTimersUnavailableError,
    InvalidTimerError,
    PermissionDeniedError,
    SaveFailedError,
    TooManyTimersError,
    is_entity_id,
    parse_stored_document,
    parse_timer_request,
    storage_document,
)

_LOGGER = logging.getLogger(__name__)

RuntimeProvider = Callable[[], DomusRuntime | None]


class DeviceTimerManager:
    """Own the timers, their scheduled switch-off and who hears about them."""

    def __init__(self, hass: HomeAssistant, runtime: RuntimeProvider | None = None) -> None:
        self.hass = hass
        self.store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self._runtime = runtime or (lambda: hass.data.get(DOMAIN, {}).get("runtime"))
        self._timers: dict[str, DeviceTimer] = {}
        self._scheduled: dict[str, CALLBACK_TYPE] = {}
        self._unsub_states: CALLBACK_TYPE | None = None
        self._unsub_started: CALLBACK_TYPE | None = None
        self._subscribers: set[Callable[[], None]] = set()
        self._lock = asyncio.Lock()
        self._running = False
        # Home Assistant has started: every entity is loaded, timers may run.
        self._started = False

    async def async_setup(self) -> None:
        """Load the timers; they are scheduled once Home Assistant has started."""
        try:
            stored = await self.store.async_load()
            self._timers = parse_stored_document(stored) if stored is not None else {}
        except Exception as err:  # noqa: BLE001 - a bad store must not take Domus down
            _LOGGER.error("The Domus device timers could not be read (%s); they start empty", err)
            self._timers = {}
        self._running = True
        self._unsub_started = async_at_started(self.hass, self._handle_started)

    async def async_shutdown(self) -> None:
        """Stop scheduling; the timers stay stored and resume at the next start."""
        self._running = False
        self._started = False
        if self._unsub_started is not None:
            self._unsub_started()
            self._unsub_started = None
        for cancel in self._scheduled.values():
            cancel()
        self._scheduled.clear()
        if self._unsub_states is not None:
            self._unsub_states()
            self._unsub_states = None
        self._subscribers.clear()

    @callback
    def _handle_started(self, _hass: HomeAssistant) -> None:
        # Also called at once, from async_setup, when Home Assistant already runs.
        if not self._running or self._started:
            return
        self._started = True
        for timer in list(self._timers.values()):
            self._schedule(timer)
        self._track_states()

    # --- Reading ---------------------------------------------------------------------

    def state_for_user(self, user: User | None) -> dict[str, Any]:
        """The timers of the devices this account can see, and the server's time."""
        if user is None:
            raise PermissionDeniedError("Device timers need a Home Assistant account")
        return {
            "now": dt_util.utcnow().isoformat(),
            "timers": [
                timer.view()
                for timer in self._timers.values()
                if user.is_admin or user.permissions.check_entity(timer.entity_id, POLICY_READ)
            ],
        }

    def async_subscribe(self, subscriber: Callable[[], None]) -> Callable[[], None]:
        self._subscribers.add(subscriber)

        @callback
        def unsubscribe() -> None:
            self._subscribers.discard(subscriber)

        return unsubscribe

    @callback
    def _notify(self) -> None:
        for subscriber in tuple(self._subscribers):
            subscriber()

    # --- Changing --------------------------------------------------------------------

    def _require_control(self, user: User | None, entity_id: str) -> None:
        if not self._running:
            raise DeviceTimersUnavailableError("Device timers are not running")
        if user is None:
            raise PermissionDeniedError("Device timers need a Home Assistant account")
        if not user.is_admin and not user.permissions.check_entity(entity_id, POLICY_CONTROL):
            raise PermissionDeniedError("This account cannot control this device")

    async def async_set_timer(self, user: User | None, entity_id: Any, minutes: Any) -> dict[str, Any]:
        """Switch the device off in ``minutes``; a device that is off is switched on first."""
        entity_id, minutes = parse_timer_request(entity_id, minutes)
        self._require_control(user, entity_id)
        state = self.hass.states.get(entity_id)
        if state is None:
            raise InvalidTimerError("This device is not in Home Assistant", "entity_id")
        if entity_id not in self._timers and len(self._timers) >= MAX_TIMERS:
            raise TooManyTimersError(f"At most {MAX_TIMERS} timers at once")
        if state.state == STATE_OFF:
            try:
                await self.hass.services.async_call(
                    entity_id.split(".", 1)[0],
                    "turn_on",
                    {"entity_id": entity_id},
                    blocking=True,
                    context=Context(user_id=user.id),
                )
            except Exception as err:  # noqa: BLE001 - reported to the client, no timer set
                raise CommandFailedError("The device could not be switched on") from err
        timer = DeviceTimer.start(entity_id, minutes, dt_util.utcnow(), user.id)
        async with self._lock:
            await self._async_write({**self._timers, entity_id: timer})
            self._schedule(timer)
            self._track_states()
        self._notify()
        return self.state_for_user(user)

    async def async_cancel_timer(self, user: User | None, entity_id: Any) -> dict[str, Any]:
        """Forget the timer; the device stays as it is. No timer is not an error."""
        if not is_entity_id(entity_id):
            raise InvalidTimerError("This device cannot switch itself off", "entity_id")
        self._require_control(user, entity_id)
        if await self._async_remove(entity_id):
            self._notify()
        return self.state_for_user(user)

    async def _async_remove(self, entity_id: str) -> bool:
        async with self._lock:
            if entity_id not in self._timers:
                return False
            await self._async_write({key: timer for key, timer in self._timers.items() if key != entity_id})
            cancel = self._scheduled.pop(entity_id, None)
            if cancel is not None:
                cancel()
            self._track_states()
            return True

    async def _async_write(self, timers: dict[str, DeviceTimer]) -> None:
        try:
            await self.store.async_save(storage_document(timers))
        except Exception as err:  # noqa: BLE001 - reported to the client, nothing half-applied
            _LOGGER.error("The Domus device timers could not be written: %s", err)
            raise SaveFailedError("The timer could not be saved") from err
        self._timers = timers

    # --- Running ---------------------------------------------------------------------

    @callback
    def _schedule(self, timer: DeviceTimer) -> None:
        cancel = self._scheduled.pop(timer.entity_id, None)
        if cancel is not None:
            cancel()
        if not self._started:
            # Scheduled by _handle_started, with every entity loaded.
            return

        @callback
        def due(_now: Any) -> None:
            self._scheduled.pop(timer.entity_id, None)
            self.hass.async_create_task(self._async_expire(timer))

        if timer.ends_at <= dt_util.utcnow():
            due(None)
        else:
            self._scheduled[timer.entity_id] = async_track_point_in_utc_time(self.hass, due, timer.ends_at)

    @callback
    def _track_states(self) -> None:
        if self._unsub_states is not None:
            self._unsub_states()
            self._unsub_states = None
        if self._timers and self._started:
            self._unsub_states = async_track_state_change_event(
                self.hass, list(self._timers), self._handle_state_change
            )

    @callback
    def _handle_state_change(self, event: Event[EventStateChangedData]) -> None:
        """Switched off another way, or removed: the timer has nothing left to do."""
        new_state = event.data["new_state"]
        if new_state is None or new_state.state == STATE_OFF:
            self.hass.async_create_task(self._async_end(event.data["entity_id"], "ended"))

    async def _async_end(self, entity_id: str, outcome: str) -> None:
        try:
            removed = await self._async_remove(entity_id)
        except SaveFailedError:
            return
        if removed:
            self._report(outcome, entity_id)
            self._notify()

    async def _async_expire(self, timer: DeviceTimer) -> None:
        """The timer ended: forget it, then switch the device off."""
        if self._timers.get(timer.entity_id) != timer:
            return
        try:
            await self._async_remove(timer.entity_id)
        except SaveFailedError:
            pass
        state = self.hass.states.get(timer.entity_id)
        if state is not None and state.state != STATE_OFF:
            try:
                await self.hass.services.async_call(
                    timer.entity_id.split(".", 1)[0],
                    "turn_off",
                    {"entity_id": timer.entity_id},
                    blocking=True,
                    context=Context(user_id=timer.user_id),
                )
            except Exception as err:  # noqa: BLE001 - one failed call must not stop the others
                _LOGGER.error("Domus could not switch off %s at the end of its timer: %s", timer.entity_id, err)
                self._report("failed", timer.entity_id, {"error": str(err)})
                self._notify()
                return
        self._report("expired", timer.entity_id)
        self._notify()

    # --- Reporting -------------------------------------------------------------------

    @callback
    def _report(self, outcome: str, entity_id: str, details: dict[str, Any] | None = None) -> None:
        """One event and one audit entry through the Domus runtime."""
        runtime = self._runtime()
        if runtime is None:
            return
        payload = {"entity_id": entity_id, **(details or {})}
        if runtime.audit.running:
            runtime.audit.record(AuditEntry.create("device_timers.manager", outcome, result=entity_id, metadata=payload))
        if runtime.events.running:
            self.hass.async_create_task(
                runtime.events.async_publish(DomusEvent.create(f"device_timers.{outcome}", "device_timers.manager", payload))
            )
