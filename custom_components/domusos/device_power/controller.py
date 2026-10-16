"""The controller of one active power policy, running inside Home Assistant.

It reacts to the battery and switch states, decides with the policy's
thresholds (models.evaluate) and calls switch.turn_on / switch.turn_off only
when the switch is not already where it should be. It never runs in a browser.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from datetime import datetime, timedelta
import logging
from typing import Any

from homeassistant.core import Context, Event, HomeAssistant, callback
from homeassistant.helpers.event import (
    async_call_later,
    async_track_state_change_event,
    async_track_time_interval,
)
from homeassistant.helpers.start import async_at_started
from homeassistant.util import dt as dt_util

from .models import POWER_DOMAIN, PolicyStatus, PowerPolicy, evaluate

_LOGGER = logging.getLogger(__name__)

# The hysteresis is the main protection; this only stops two commands in a row.
COMMAND_COOLDOWN = timedelta(seconds=60)
# A slow safety net for a missed event; the states drive everything else.
RECONCILE_INTERVAL = timedelta(minutes=5)

CommandListener = Callable[[PowerPolicy, str, dict[str, Any]], None]


class PolicyController:
    """Keep one switch between two battery thresholds; one evaluation at a time."""

    def __init__(
        self,
        hass: HomeAssistant,
        policy: PowerPolicy,
        on_outcome: CommandListener | None = None,
    ) -> None:
        self.hass = hass
        self.policy = policy
        self._on_outcome = on_outcome
        self._lock = asyncio.Lock()
        self._pending = False
        self._stopped = False
        self._unsubscribers: list[Callable[[], None]] = []
        self._cancel_retry: Callable[[], None] | None = None
        self._last_command_at: datetime | None = None
        self._status = PolicyStatus.STARTING
        self._battery_level: float | None = None
        self._switch_on: bool | None = None
        self._last_action: dict[str, Any] | None = None
        self._last_error: dict[str, Any] | None = None

    @callback
    def async_start(self) -> None:
        """Listen to the two entities; evaluate once Home Assistant has started."""
        policy = self.policy
        self._unsubscribers.append(
            async_track_state_change_event(
                self.hass,
                [policy.battery_entity_id, policy.switch_entity_id],
                self._handle_state_change,
            )
        )
        self._unsubscribers.append(
            async_track_time_interval(self.hass, self._handle_interval, RECONCILE_INTERVAL)
        )
        self._unsubscribers.append(async_at_started(self.hass, self._handle_started))
        _LOGGER.info(
            "Domus power policy %s started for %s", policy.policy_id, policy.switch_entity_id
        )

    async def async_stop(self) -> None:
        """Stop reacting, after any command in progress: never two controllers at once."""
        self._stopped = True
        for unsubscribe in self._unsubscribers:
            unsubscribe()
        self._unsubscribers.clear()
        if self._cancel_retry is not None:
            self._cancel_retry()
            self._cancel_retry = None
        async with self._lock:
            pass
        _LOGGER.info("Domus power policy %s stopped", self.policy.policy_id)

    def runtime(self) -> dict[str, Any]:
        """What the policy is doing now; never stored."""
        return {
            "status": self._status.value,
            "battery_level": self._battery_level,
            "switch_on": self._switch_on,
            "last_action": self._last_action,
            "last_error": self._last_error,
        }

    @callback
    def _handle_started(self, _hass: HomeAssistant) -> None:
        self._schedule()

    @callback
    def _handle_state_change(self, _event: Event) -> None:
        self._schedule()

    @callback
    def _handle_interval(self, _now: datetime) -> None:
        self._schedule()

    @callback
    def _handle_retry(self, _now: datetime) -> None:
        self._cancel_retry = None
        self._schedule()

    @callback
    def _schedule(self) -> None:
        if not self._stopped:
            self.hass.async_create_task(self.async_evaluate())

    async def async_evaluate(self) -> None:
        """Evaluate now; a request during an evaluation runs once more right after it."""
        if self._stopped:
            return
        if self._lock.locked():
            self._pending = True
            return
        async with self._lock:
            while not self._stopped:
                self._pending = False
                await self._async_evaluate_once()
                if not self._pending:
                    break

    async def _async_evaluate_once(self) -> None:
        policy = self.policy
        battery = self.hass.states.get(policy.battery_entity_id)
        switch = self.hass.states.get(policy.switch_entity_id)
        result = evaluate(
            policy.start_threshold,
            policy.stop_threshold,
            battery.state if battery is not None else None,
            switch.state if switch is not None else None,
        )
        self._battery_level = result.battery_level
        self._switch_on = result.switch_on
        _LOGGER.debug(
            "Domus power policy %s: battery %s, switch %s, command %s",
            policy.policy_id,
            result.battery_level,
            result.switch_on,
            result.command,
        )
        if result.status in (PolicyStatus.BATTERY_UNAVAILABLE, PolicyStatus.SWITCH_UNAVAILABLE):
            if self._status is not result.status:
                _LOGGER.warning(
                    "Domus power policy %s does nothing: %s",
                    policy.policy_id,
                    "the battery level is not available"
                    if result.status is PolicyStatus.BATTERY_UNAVAILABLE
                    else "the charger switch is not available",
                )
            self._status = result.status
            return
        if result.command is None:
            # The switch is where it should be: an earlier failure is over.
            self._last_error = None
            self._status = result.status
            return
        service = "turn_on" if result.command else "turn_off"
        if not self.hass.services.has_service(POWER_DOMAIN, service):
            self._status = PolicyStatus.SWITCH_UNAVAILABLE
            return
        now = dt_util.utcnow()
        if self._last_command_at is not None and now - self._last_command_at < COMMAND_COOLDOWN:
            # Too soon after the last command: try again when the cooldown ends.
            remaining = COMMAND_COOLDOWN - (now - self._last_command_at)
            if self._cancel_retry is None:
                self._cancel_retry = async_call_later(
                    self.hass, remaining.total_seconds(), self._handle_retry
                )
            self._status = PolicyStatus.ERROR if self._last_error else result.status
            return
        self._last_command_at = now
        try:
            await self.hass.services.async_call(
                POWER_DOMAIN,
                service,
                {"entity_id": policy.switch_entity_id},
                blocking=True,
                context=Context(),
            )
        except Exception as err:  # noqa: BLE001 - one failed call must not stop the manager
            _LOGGER.error(
                "Domus power policy %s could not call switch.%s for %s: %s",
                policy.policy_id,
                service,
                policy.switch_entity_id,
                err,
            )
            self._last_error = {"code": "service_call_failed", "at": now.isoformat()}
            self._status = PolicyStatus.ERROR
            self._notify("error", {"service": service})
            return
        self._last_error = None
        self._last_action = {"action": service, "at": now.isoformat()}
        self._status = PolicyStatus.CHARGING if result.command else PolicyStatus.WAITING
        self._switch_on = result.command
        self._notify(
            "started_charging" if result.command else "stopped_charging",
            {"battery_level": result.battery_level},
        )

    def _notify(self, outcome: str, details: dict[str, Any]) -> None:
        if self._on_outcome is not None:
            try:
                self._on_outcome(self.policy, outcome, details)
            except Exception:  # noqa: BLE001 - reporting never breaks the controller
                _LOGGER.exception("Domus power policy outcome could not be reported")
