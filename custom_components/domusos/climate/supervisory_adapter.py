"""The only Climate boundary that may issue Home Assistant service calls."""

from __future__ import annotations

import math
from collections.abc import Mapping
from datetime import datetime
from typing import Any

from homeassistant.core import Context, HomeAssistant

from .execution_plan import TARGET_FEATURE, sensor_validity

ALLOWED_ACTIONS = ("set_hvac_mode", "set_temperature")
ALLOWED_MODES = frozenset({"heat", "cool"})


class AdapterBlocked(Exception):
    """The server-side snapshot no longer satisfies the narrow adapter contract."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


class SupervisoryAdapter:
    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass

    def validate(self, config: Mapping[str, Any], plan: Mapping[str, Any], now: datetime) -> None:
        """Reject the complete action sequence before its first service call."""
        if config.get("physicalExecutionEnabled") is not True:
            raise AdapterBlocked("execution_disabled")
        if plan.get("status") != "eligible" or plan.get("physicalExecutionAllowed") is not True:
            raise AdapterBlocked("execution_blocked")
        entity_id = plan.get("entityId")
        endpoint = next((item for item in config["endpoints"] if item["id"] == plan.get("endpointId")), None)
        zone = next((item for item in config["zones"] if item["id"] == plan.get("zoneId")), None)
        if (not isinstance(entity_id, str) or not entity_id.startswith("climate.") or entity_id.count(".") != 1
                or endpoint is None or zone is None or endpoint["id"] not in zone["endpointIds"]
                or endpoint["zoneId"] != zone["id"] or endpoint["entity"]["primaryEntityId"] != entity_id
                or endpoint.get("executionOwnership", "observe_only") != "domus_supervised"
                or endpoint.get("circuitId") is not None or endpoint["entity"]["relatedControls"]
                or plan.get("controlKind") != "supervisory"):
            raise AdapterBlocked("unsupported_execution_topology")
        if endpoint["kind"] not in ("air_conditioner", "other") or (endpoint["kind"] == "other" and endpoint.get("controlTopology") != "direct_supervisory"):
            raise AdapterBlocked("unsupported_execution_topology")
        if any(endpoint["id"] in group["memberEndpointIds"] for group in config.get("equipmentGroups", [])):
            raise AdapterBlocked("shared_equipment_coordination_required")
        source = (plan.get("sensor") or {}).get("source")
        sensor = sensor_validity(source, {source: self.hass.states.get(source)} if source else {},
                                 "available", zone["reference"], now)
        if sensor["status"] != "valid":
            raise AdapterBlocked(sensor["status"])
        if sensor["freshness"] != "verified":
            raise AdapterBlocked("sensor_stale" if sensor["freshness"] == "stale" else "sensor_freshness_unknown")
        actions = plan.get("actions")
        if not isinstance(actions, list) or not actions or [item.get("kind") for item in actions] not in (["set_hvac_mode"], ["set_temperature"], ["set_hvac_mode", "set_temperature"]):
            raise AdapterBlocked("unsupported_action")
        desired = plan.get("desired") or {}
        if desired.get("hvacMode") not in ALLOWED_MODES:
            raise AdapterBlocked("unsupported_hvac_mode")
        for action in actions:
            if action.get("entityId") != entity_id:
                raise AdapterBlocked("unsupported_action")
            if action["kind"] == "set_hvac_mode":
                if action.get("value") != desired["hvacMode"] or action.get("expected") != {"hvacMode": desired["hvacMode"]}:
                    raise AdapterBlocked("unsupported_action")
            elif action["kind"] == "set_temperature":
                target = action.get("value")
                if (type(target) not in (int, float) or not math.isfinite(target)
                        or target != desired.get("targetTemperature") or action.get("temperatureUnit") != desired.get("temperatureUnit")
                        or action.get("expected") != {"targetTemperature": target}):
                    raise AdapterBlocked("unsupported_action")
        self.validate_live(plan)

    def validate_live(self, plan: Mapping[str, Any]) -> None:
        """Recheck live availability and advertised capabilities before each action."""
        entity_id = plan["entityId"]
        state = self.hass.states.get(entity_id)
        if state is None or state.state in ("unknown", "unavailable"):
            raise AdapterBlocked("entity_unavailable")
        attrs = state.attributes
        desired = plan["desired"]
        if (desired["hvacMode"] not in attrs.get("hvac_modes", ())
                or attrs.get("temperature_unit") != desired["temperatureUnit"]
                or type(attrs.get("supported_features")) is not int
                or not attrs["supported_features"] & TARGET_FEATURE):
            raise AdapterBlocked("capability_changed")
        minimum, maximum, target = attrs.get("min_temp"), attrs.get("max_temp"), desired["targetTemperature"]
        if (type(minimum) not in (int, float) or type(maximum) not in (int, float)
                or not math.isfinite(minimum) or not math.isfinite(maximum)
                or not minimum <= target <= maximum
                or attrs.get("target_temp_step") != desired.get("targetStep")):
            raise AdapterBlocked("capability_changed")

    async def send_action(self, plan: Mapping[str, Any], action: Mapping[str, Any], context: Context) -> None:
        """Only two fixed Climate services can cross this boundary."""
        self.validate_live(plan)
        if action["kind"] == "set_hvac_mode":
            await self.hass.services.async_call("climate", "set_hvac_mode",
                                                {"entity_id": plan["entityId"], "hvac_mode": action["value"]},
                                                blocking=True, context=context)
        elif action["kind"] == "set_temperature":
            await self.hass.services.async_call("climate", "set_temperature",
                                                {"entity_id": plan["entityId"], "temperature": action["value"]},
                                                blocking=True, context=context)
        else:
            raise AdapterBlocked("unsupported_action")
