"""Pure, read-only supervisory execution planning for CLM.3B.

Plans describe possible commands. They never authorize or issue HA service calls.
"""

from __future__ import annotations

import hashlib
import json
import math
from collections.abc import Mapping
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from .execution_validation import (
    CURRENT_EXECUTION_VALIDATION,
    ExecutionValidationCapabilities,
)
from .sensor_freshness import assess_freshness

ROOM_MIN_C = 0.0
ROOM_MAX_C = 50.0
TARGET_FEATURE = 1  # HA ClimateEntityFeature.TARGET_TEMPERATURE


def _number(value: Any) -> float | None:
    if type(value) not in (str, int, float):
        return None
    try:
        result = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return result if math.isfinite(result) else None


def _celsius(value: float, unit: Any) -> float | None:
    if unit == "°C":
        return value
    if unit == "°F":
        return (value - 32) * 5 / 9
    return None


def _from_celsius(value: float, unit: str) -> float:
    return value if unit == "°C" else value * 9 / 5 + 32


def sensor_validity(source: str | None, states: Mapping[str, Any], availability: str,
                    reference: Mapping[str, Any] | None = None, now: datetime | None = None) -> dict[str, Any]:
    """Validate the selected room reference; HA last_updated alone proves no sample freshness."""
    state = states.get(source) if source else None
    if availability == "stale":
        return {"status": "stale", "valueCelsius": None, "source": source, "unit": None, "freshness": "stale", "lastUpdated": None}
    if state is None or getattr(state, "state", None) in ("unknown", "unavailable"):
        return {"status": "sensor_invalid", "valueCelsius": None, "source": source, "unit": None, "freshness": "unknown", "lastUpdated": None}
    attrs = getattr(state, "attributes", {})
    raw = attrs.get("current_temperature") if source.startswith("climate.") else getattr(state, "state", None)
    unit = attrs.get("temperature_unit") if source.startswith("climate.") else attrs.get("unit_of_measurement")
    number = _number(raw)
    value = _celsius(number, unit) if number is not None else None
    timestamp = getattr(state, "last_updated", None)
    last_updated = timestamp.isoformat() if isinstance(timestamp, datetime) and timestamp.tzinfo else None
    if number is None:
        status = "sensor_invalid"
    elif value is None:
        status = "sensor_unit_unknown"
    elif not ROOM_MIN_C <= value <= ROOM_MAX_C:
        status = "sensor_outside_plausible_range"
    else:
        status = "valid"
    freshness = assess_freshness(state, reference or {}, now)
    return {"status": status, "valueCelsius": value if status == "valid" else None, "source": source,
            "unit": unit, "freshness": freshness, "lastUpdated": last_updated}


def _blocked(zone_id: str, reason: str, *, sensor: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"zoneId": zone_id, "status": "unresolved" if reason in ("config_invalid", "state_invalid", "no_target", "endpoint_target_unknown") else "blocked",
            "endpointId": None, "entityId": None, "controlKind": None, "desired": None, "observed": None,
            "diff": None, "actions": [], "sensor": sensor, "reasons": [reason], "planSafe": False,
            "physicalExecutionAllowed": False, "physicalBlockers": []}


def _target_for_endpoint(requested_c: float, attrs: Mapping[str, Any]) -> tuple[dict[str, Any] | None, str | None]:
    unit = attrs.get("temperature_unit")
    if unit not in ("°C", "°F"):
        return None, "endpoint_temperature_unit_unknown"
    requested = _from_celsius(requested_c, unit)
    minimum, maximum = _number(attrs.get("min_temp")), _number(attrs.get("max_temp"))
    if minimum is None or maximum is None or minimum > maximum:
        return None, "endpoint_range_unknown"
    if not minimum <= requested <= maximum:
        return None, "target_outside_endpoint_range"
    step = _number(attrs.get("target_temp_step"))
    if attrs.get("target_temp_step") is not None and (step is None or step <= 0):
        return None, "endpoint_step_invalid"
    planned = requested
    if step is not None:
        quantum = Decimal(str(step))
        planned = float((Decimal(str(requested)) / quantum).quantize(Decimal(1), rounding=ROUND_HALF_UP) * quantum)
        if not minimum <= planned <= maximum:
            return None, "target_outside_endpoint_range"
    return {"requestedTargetCelsius": requested_c, "requestedTarget": round(requested, 6),
            "targetTemperature": round(planned, 6), "temperatureUnit": unit,
            "normalization": "endpoint_step" if abs(planned - requested) > 1e-6 else None,
            "targetStep": step}, None


def evaluate_execution_eligibility(config: Mapping[str, Any], zone: Mapping[str, Any],
                                   zone_preview: Mapping[str, Any], house_mode: str,
                                   states: Mapping[str, Any], evaluated_at: datetime | None = None) -> dict[str, Any]:
    """Resolve exactly one supported supervisory path; never select by list order."""
    zone_id = zone["id"]
    if house_mode == "off":
        return _blocked(zone_id, "house_off")
    if zone_preview["intent"]["mode"] == "off":
        return _blocked(zone_id, "zone_off")
    requested = _number(zone_preview["derived"]["effectiveTarget"])
    if requested is None:
        return _blocked(zone_id, "no_target")
    source = zone_preview["observed"]["temperatureSource"] or zone["reference"]["primaryEntityId"]
    sensor = sensor_validity(source, states,
                             zone_preview["observed"]["temperatureAvailability"], zone["reference"], evaluated_at)
    if sensor["status"] != "valid":
        return _blocked(zone_id, sensor["status"], sensor=sensor)
    endpoints = {item["id"]: item for item in config["endpoints"]}
    paths = zone_preview["derived"]["compatiblePaths"]
    if len(paths) > 1:
        return _blocked(zone_id, "delivery_strategy_required", sensor=sensor)
    if not paths:
        rows = zone_preview["derived"]["terminals"]
        if any(not row["available"] for row in rows):
            reason = "endpoint_unavailable"
        elif len(rows) == 1 and rows[0]["entityId"].startswith("climate."):
            modes = getattr(states.get(rows[0]["entityId"]), "attributes", {}).get("hvac_modes", [])
            desired_mode = {"heating": "heat", "cooling": "cool"}.get(house_mode)
            reason = "unsupported_hvac_mode" if desired_mode not in modes else "no_compatible_terminal"
        else:
            reason = "no_compatible_terminal"
        return _blocked(zone_id, reason, sensor=sensor)
    path = paths[0]
    endpoint = endpoints[path["terminalId"]]
    entity_id = endpoint["entity"]["primaryEntityId"]
    if path["circuitId"] and house_mode == "cooling":
        circuits = {item["id"]: item for item in config["circuits"]}
        if circuits[path["circuitId"]]["kind"] in ("radiant_floor", "radiant_ceiling"):
            return _blocked(zone_id, "condensation_safety_not_implemented", sensor=sensor)
    if endpoint["entity"]["relatedControls"]:
        return _blocked(zone_id, "composite_execution_not_supported", sensor=sensor)
    if path["sharedOperatingMode"]:
        return _blocked(zone_id, "shared_equipment_coordination_required", sensor=sensor)
    if path["circuitId"]:
        if endpoint["kind"] == "manifold_actuator" or not entity_id.startswith("climate."):
            reason = "unsupported_direct_actuator"
        else:
            reason = "hydronic_dependency_unmanaged"
        return _blocked(zone_id, reason, sensor=sensor)
    if endpoint["kind"] == "manifold_actuator" or not entity_id.startswith("climate."):
        return _blocked(zone_id, "unsupported_direct_actuator", sensor=sensor)
    if endpoint["kind"] not in ("air_conditioner", "other") or (endpoint["kind"] == "other" and endpoint.get("controlTopology") != "direct_supervisory"):
        return _blocked(zone_id, "autonomous_control_not_confirmed", sensor=sensor)
    if endpoint["setpointKind"] != "room_temperature":
        return _blocked(zone_id, "unsupported_setpoint_kind", sensor=sensor)
    state = states.get(entity_id)
    if state is None or getattr(state, "state", None) in ("unavailable", "unknown"):
        return _blocked(zone_id, "endpoint_unavailable", sensor=sensor)
    attrs = getattr(state, "attributes", {})
    desired_mode = {"heating": "heat", "cooling": "cool"}.get(house_mode)
    modes = attrs.get("hvac_modes")
    if desired_mode is None or type(modes) not in (list, tuple) or desired_mode not in modes:
        return _blocked(zone_id, "unsupported_hvac_mode", sensor=sensor)
    features = attrs.get("supported_features")
    if type(features) is not int or not features & TARGET_FEATURE:
        return _blocked(zone_id, "target_temperature_unsupported", sensor=sensor)
    target, reason = _target_for_endpoint(requested, attrs)
    if reason:
        return _blocked(zone_id, reason, sensor=sensor)
    observed_target = _number(attrs.get("temperature"))
    if observed_target is None:
        return _blocked(zone_id, "endpoint_target_unknown", sensor=sensor)
    return {"zoneId": zone_id, "status": "eligible", "endpointId": endpoint["id"], "entityId": entity_id,
            "controlKind": "supervisory", "desired": {"hvacMode": desired_mode, **target},
            "observed": {"hvacMode": state.state, "targetTemperature": observed_target,
                         "currentTemperature": _number(attrs.get("current_temperature")),
                         "available": True, "temperatureUnit": target["temperatureUnit"]},
            "diff": None, "actions": [], "sensor": sensor, "reasons": [], "planSafe": True,
            "physicalExecutionAllowed": False, "physicalBlockers": []}


def _valid_until(zone_preview: Mapping[str, Any], auto_resolution: Mapping[str, Any] | None) -> str | None:
    candidates: list[datetime] = []
    override = zone_preview.get("override") or {}
    next_event = (auto_resolution or {}).get("nextEvent") or {}
    for raw in (override.get("expiresAt"), next_event.get("occursAt")):
        if isinstance(raw, str):
            try:
                instant = datetime.fromisoformat(raw)
                if instant.tzinfo is not None:
                    candidates.append(instant.astimezone(UTC))
            except ValueError:
                pass
    return min(candidates).isoformat() if candidates else None


def _input_fingerprint(config: Mapping[str, Any], zone: Mapping[str, Any],
                       zone_preview: Mapping[str, Any], states: Mapping[str, Any]) -> str:
    """Bind to configured entities only, including HA capability and freshness metadata."""
    endpoints = [item for item in config["endpoints"] if item["id"] in zone["endpointIds"]]
    entity_ids = [zone["reference"]["primaryEntityId"], *zone["reference"]["fallbacks"]]
    entity_ids.extend(item["entity"]["primaryEntityId"] for item in endpoints)
    attributes = ("unit_of_measurement", "temperature_unit", "current_temperature", "temperature",
                  "hvac_modes", "supported_features", "min_temp", "max_temp", "target_temp_step")
    observed = {}
    for entity_id in sorted(set(entity_ids)):
        state = states.get(entity_id)
        attrs = getattr(state, "attributes", {}) if state is not None else {}
        stamp = getattr(state, "last_updated", None)
        observed[entity_id] = {"state": str(getattr(state, "state", "")) if state is not None else None,
                               "attributes": {key: attrs.get(key) for key in attributes if key in attrs},
                               "lastUpdated": stamp.isoformat() if isinstance(stamp, datetime) else None}
    payload = {"zone": zone, "endpoints": endpoints, "preview": zone_preview, "observed": observed}
    return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str, separators=(",", ":")).encode()).hexdigest()


def build_execution_preview(config: Mapping[str, Any], preview: Mapping[str, Any],
                            states: Mapping[str, Any], *, config_revision: int, state_revision: int,
                            evaluated_at: datetime,
                            validation: ExecutionValidationCapabilities = CURRENT_EXECUTION_VALIDATION) -> dict[str, Any]:
    """Derive a deterministic revision-bound snapshot from the existing Climate preview."""
    if evaluated_at.tzinfo is None:
        raise ValueError("evaluated_at must be timezone aware")
    instant = evaluated_at.astimezone(UTC).isoformat()
    zones = {item["id"]: item for item in config["zones"]}
    plans: list[dict[str, Any]] = []
    for zone_preview in preview["zones"]:
        zone = zones[zone_preview["zoneId"]]
        plan = evaluate_execution_eligibility(config, zone, zone_preview, preview["house"]["operatingMode"], states, evaluated_at)
        if plan["status"] == "eligible":
            desired, observed = plan["desired"], plan["observed"]
            mode_changed = desired["hvacMode"] != observed["hvacMode"]
            observed_target = observed["targetTemperature"]
            target_changed = observed_target is None or not math.isclose(desired["targetTemperature"], observed_target, abs_tol=1e-4)
            plan["diff"] = {"hvacModeChanged": mode_changed, "targetChanged": target_changed}
            if mode_changed:
                plan["actions"].append({"kind": "set_hvac_mode", "entityId": plan["entityId"], "value": desired["hvacMode"], "expected": {"hvacMode": desired["hvacMode"]}})
            if target_changed:
                plan["actions"].append({"kind": "set_temperature", "entityId": plan["entityId"], "value": desired["targetTemperature"], "temperatureUnit": desired["temperatureUnit"], "expected": {"targetTemperature": desired["targetTemperature"]}})
            if not plan["actions"]:
                plan["status"] = "noop"
        plan["configRevision"] = config_revision
        plan["stateRevision"] = state_revision
        plan["inputFingerprint"] = _input_fingerprint(config, zone, zone_preview, states)
        plan["evaluatedAt"] = instant
        plan["validUntil"] = _valid_until(zone_preview, preview.get("autoResolution"))
        # Stable across read/recompute calls; changes with every relevant input or revision.
        token_input = {key: plan[key] for key in ("zoneId", "endpointId", "entityId", "status", "desired", "actions",
                                                   "configRevision", "stateRevision", "inputFingerprint", "validUntil")}
        plan["planToken"] = hashlib.sha256(json.dumps(token_input, sort_keys=True, separators=(",", ":")).encode()).hexdigest()[:32]
        plan["planId"] = hashlib.sha256(json.dumps(plan, sort_keys=True, separators=(",", ":")).encode()).hexdigest()[:24]
        readiness = evaluate_physical_execution_readiness(
            plan, config, zone, config_trusted=True, state_trusted=True,
            current_plan=plan, config_revision=config_revision, state_revision=state_revision,
            now=evaluated_at, linux_ha_validated=validation.linux_home_assistant)
        plan["physicalExecutionAllowed"] = readiness["allowed"]
        plan["physicalBlockers"] = readiness["blockers"]
        plans.append(plan)
    return {"plans": plans, "configRevision": config_revision, "stateRevision": state_revision, "evaluatedAt": instant}


def plan_is_current(plan: Mapping[str, Any], *, config_revision: int, state_revision: int,
                    now: datetime, current_plan: Mapping[str, Any] | None = None) -> bool:
    if now.tzinfo is None or current_plan is None:
        return False
    if plan.get("configRevision") != config_revision or plan.get("stateRevision") != state_revision:
        return False
    if (current_plan.get("configRevision") != config_revision or current_plan.get("stateRevision") != state_revision
            or plan.get("inputFingerprint") != current_plan.get("inputFingerprint")
            or plan.get("planId") != current_plan.get("planId")):
        return False
    try:
        evaluated = datetime.fromisoformat(plan["evaluatedAt"])
        if evaluated.tzinfo is None or now.astimezone(UTC) < evaluated.astimezone(UTC):
            return False
    except (KeyError, TypeError, ValueError):
        return False
    until = plan.get("validUntil")
    if until is None:
        return True
    try:
        return now.astimezone(UTC) < datetime.fromisoformat(until)
    except (ValueError, TypeError):
        return False


def evaluate_physical_execution_readiness(
    plan: Mapping[str, Any], config: Mapping[str, Any], zone: Mapping[str, Any], *,
    config_trusted: bool, state_trusted: bool, current_plan: Mapping[str, Any] | None,
    config_revision: int, state_revision: int, now: datetime, linux_ha_validated: bool,
) -> dict[str, Any]:
    """Collect deterministic V1 blockers. This only describes readiness; it never executes."""
    blockers: list[str] = []
    if not config_trusted:
        blockers.append("config_untrusted")
    if not state_trusted:
        blockers.append("state_untrusted")
    if not plan_is_current(plan, config_revision=config_revision, state_revision=state_revision,
                           current_plan=current_plan, now=now):
        blockers.append("plan_stale")
    blockers.extend(plan.get("reasons", []))
    if plan.get("status") == "noop":
        blockers.append("no_command_required")
    elif plan.get("status") != "eligible" and not plan.get("reasons"):
        blockers.append("plan_not_eligible")
    if plan.get("status") == "eligible":
        endpoint = next((item for item in config["endpoints"] if item["id"] == plan.get("endpointId")), None)
        if endpoint is None or endpoint.get("executionOwnership", "observe_only") != "domus_supervised":
            blockers.append("endpoint_not_owned")
        # Eligibility already verifies one direct, available climate entity, exact mode,
        # target capability/range, and excludes shared/hydronic/composite paths.
        if plan.get("controlKind") != "supervisory" or not str(plan.get("entityId", "")).startswith("climate."):
            blockers.append("unsupported_execution_topology")
        if zone.get("id") != plan.get("zoneId"):
            blockers.append("zone_mismatch")
    sensor = plan.get("sensor") or {}
    if sensor.get("freshness") == "stale":
        blockers.append("sensor_stale")
    elif sensor.get("freshness") != "verified":
        blockers.append("sensor_freshness_unknown")
    if not linux_ha_validated:
        blockers.append("linux_ha_validation_required")
    unique = list(dict.fromkeys(blockers))
    return {"allowed": not unique, "blockers": unique}
