"""Runtime-only manual command correlations and one reconciliation deadline timer."""

from __future__ import annotations

from collections.abc import Callable, Mapping
from copy import deepcopy
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

from homeassistant.core import HomeAssistant

from .reconciliation import (
    ClimateCommandCorrelation,
    expected_state,
    observed_matches_expected,
    same_desired_pending,
)

RECONCILIATION_DEADLINE_SECONDS = 60
MAX_CORRELATIONS = 128


class ExecutionRuntime:
    def __init__(self, hass: HomeAssistant, clock: Callable[[], datetime],
                 schedule: Callable[[float, Callable[[], None]], Any],
                 audit: Callable[[str, Mapping[str, Any]], None]) -> None:
        self.hass = hass
        self.clock = clock
        self.schedule = schedule
        self.audit = audit
        self._by_zone: dict[str, ClimateCommandCorrelation] = {}
        self._by_id: dict[str, ClimateCommandCorrelation] = {}
        self._handle: Any = None
        self._scheduled_at: datetime | None = None
        self._generation = 0
        self._running = False

    def start(self) -> None:
        self._running = True

    def stop(self) -> None:
        self._running = False
        self._cancel_timer()
        self._by_zone.clear()
        self._by_id.clear()

    def current(self, zone_id: str) -> ClimateCommandCorrelation | None:
        value = self._by_zone.get(zone_id)
        return deepcopy(value) if value is not None else None

    def correlation(self, correlation_id: str) -> ClimateCommandCorrelation | None:
        value = self._by_id.get(correlation_id)
        return deepcopy(value) if value is not None else None

    def snapshot(self, config: Mapping[str, Any] | None) -> dict[str, Any]:
        def summary(zone_id: str) -> dict[str, Any] | None:
            item = self._by_zone.get(zone_id)
            if item is None:
                return None
            return {key: deepcopy(item[key]) for key in ("correlationId", "status", "issuedAt",
                                                         "failureReason", "completedActions")}
        return {"armed": bool(config and config.get("physicalExecutionEnabled") is True),
                "zones": {zone["id"]: {"currentCorrelation": summary(zone["id"])}
                          for zone in (config or {}).get("zones", [])}}

    def duplicate(self, plan: Mapping[str, Any]) -> ClimateCommandCorrelation | None:
        current = self._by_zone.get(plan["zoneId"])
        return deepcopy(current) if same_desired_pending(current, plan) else None

    def begin(self, plan: Mapping[str, Any]) -> ClimateCommandCorrelation:
        if not self._running:
            raise RuntimeError("Climate execution runtime is stopped")
        previous = self._by_zone.get(plan["zoneId"])
        if previous is not None and previous["status"] == "pending":
            previous["status"] = "superseded"
            previous["failureReason"] = None
            self.audit("command_superseded", previous)
        now = self.clock().astimezone(UTC)
        correlation: ClimateCommandCorrelation = {
            "correlationId": uuid4().hex, "zoneId": plan["zoneId"], "endpointId": plan["endpointId"],
            "entityId": plan["entityId"], "planToken": plan["planToken"],
            "planGeneration": plan["planId"], "createdAt": now.isoformat(), "issuedAt": now.isoformat(),
            "expectedState": expected_state(plan), "status": "pending", "completedActions": [],
            "actionKinds": [action["kind"] for action in plan["actions"]], "failedAction": None,
            "failureReason": None,
            "reconciliationDeadline": (now + timedelta(seconds=RECONCILIATION_DEADLINE_SECONDS)).isoformat(),
        }
        self._by_zone[plan["zoneId"]] = correlation
        self._by_id[correlation["correlationId"]] = correlation
        while len(self._by_id) > MAX_CORRELATIONS:
            self._by_id.pop(next(iter(self._by_id)))
        self.audit("command_dispatched", correlation)
        self._schedule_next()
        return deepcopy(correlation)

    def completed(self, correlation_id: str, action_kind: str) -> None:
        correlation = self._by_id[correlation_id]
        correlation["completedActions"].append(action_kind)

    def fail(self, correlation_id: str, action_kind: str, reason: str) -> ClimateCommandCorrelation:
        correlation = self._by_id[correlation_id]
        correlation["failedAction"] = action_kind
        correlation["failureReason"] = reason
        correlation["status"] = "partial_failure" if correlation["completedActions"] else "failed"
        self.audit("command_partial_failure" if correlation["completedActions"] else "command_failed", correlation)
        self._schedule_next()
        return deepcopy(correlation)

    def reconcile_all(self) -> None:
        if not self._running:
            return
        now = self.clock().astimezone(UTC)
        for correlation in self._by_zone.values():
            if correlation["status"] != "pending":
                continue
            state = self.hass.states.get(correlation["entityId"])
            if state is None or state.state in ("unknown", "unavailable"):
                correlation["status"] = "failed"
                correlation["failureReason"] = "entity_unavailable"
                self.audit("command_failed", correlation)
                continue
            observed = {"available": True, "hvacMode": state.state,
                        "targetTemperature": state.attributes.get("temperature")}
            if observed_matches_expected(correlation["expectedState"], observed):
                correlation["status"] = "converged"
                correlation["failureReason"] = None
                self.audit("command_converged", correlation)
            elif now >= datetime.fromisoformat(correlation["reconciliationDeadline"]):
                correlation["status"] = "failed"
                correlation["failureReason"] = "state_not_converged"
                self.audit("command_failed", correlation)
        self._schedule_next()

    def _cancel_timer(self) -> None:
        self._generation += 1
        if self._handle is not None:
            self._handle.cancel()
            self._handle = None
        self._scheduled_at = None

    def _schedule_next(self) -> None:
        if not self._running:
            return
        deadlines = [datetime.fromisoformat(item["reconciliationDeadline"])
                     for item in self._by_zone.values() if item["status"] == "pending"]
        when = min(deadlines) if deadlines else None
        if when == self._scheduled_at and self._handle is not None:
            return
        self._cancel_timer()
        if when is None:
            return
        self._scheduled_at = when
        delay = max(0.001, (when - self.clock().astimezone(UTC)).total_seconds())
        generation = self._generation
        self._handle = self.schedule(delay, lambda: self._on_deadline(generation))

    def _on_deadline(self, generation: int) -> None:
        if not self._running or generation != self._generation:
            return
        self._handle = None
        self._scheduled_at = None
        self.reconcile_all()
