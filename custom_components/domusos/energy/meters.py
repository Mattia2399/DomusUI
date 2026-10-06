"""Energy meters of an Energy Profile v2: Recorder metadata, validation, plan.

POWER and ENERGY stay apart: realtime values come from power sensors only
(``aggregation``), and the meters declared under ``device.energy`` are
Home Assistant long-term statistics that a future history reads. This module
does not read any statistic value; it tells, for each statistic id, whether
Home Assistant can provide an energy sum for it.

Home Assistant behaviour this relies on (identical in 2025.1 and 2026.2):

- A ``sensor.*`` with ``state_class`` ``total`` or ``total_increasing`` gets
  long-term statistics with ``has_sum``. Its metadata exists only after the
  first compilation; until then only the sensor recorder platform lists it.
- ``sum`` accumulates the changes since the statistics started and survives
  meter resets (a drop below 90% for ``total_increasing``, a new
  ``last_reset`` for ``total``); ``state`` is the raw meter reading and is
  not usable across resets; ``change`` is the difference of ``sum`` over a
  period. Hours without data have no row, which is not 0.
- A unit change within the energy class is converted by Home Assistant; a
  non-convertible change stops the compilation and raises a repair issue.
- External statistics (``source:id``) have no entity and are imported by
  their integration with their own metadata.

History (A2) will therefore read ``change`` with ``units={"energy": "kWh"}``
(``HISTORY_STATISTIC_TYPE``, ``HISTORY_UNITS``), never ``state``.

The Recorder is optional: without it the meters are reported as not
verifiable and realtime values are not affected.
"""

from __future__ import annotations

import logging
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from homeassistant.const import STATE_UNAVAILABLE, STATE_UNKNOWN, UnitOfEnergy
from homeassistant.core import HomeAssistant, State
from homeassistant.util.unit_conversion import EnergyConverter

from .models import SENSOR_ENTITY_ID_PATTERN
from .profile_v2 import ENERGY_ROLES, DeviceSources, EnergyProfileV2

_LOGGER = logging.getLogger(__name__)

RECORDER_DOMAIN = "recorder"
HISTORY_STATISTIC_TYPE = "change"
HISTORY_UNITS: Mapping[str, str] = {"energy": UnitOfEnergy.KILO_WATT_HOUR}
ENERGY_UNITS = frozenset(EnergyConverter.VALID_UNITS)
METER_STATE_CLASSES = frozenset({"total", "total_increasing"})
KWH_PRECISION = 9


class MeterStatus(StrEnum):
    """Whether Home Assistant can provide an energy sum for a statistic id."""

    # Long-term statistics with a sum in an energy unit.
    VALID = "valid"
    # Recorded and suitable, but Home Assistant has not compiled it yet.
    PENDING = "pending"
    # Statistics exist or the entity looks right, but it cannot report now.
    UNAVAILABLE = "unavailable"
    # Verifiably not an energy meter.
    INCOMPATIBLE = "incompatible"
    # Neither the Recorder nor Home Assistant knows it (yet).
    UNKNOWN = "unknown"
    # The Recorder is not running, so nothing more can be verified.
    RECORDER_UNAVAILABLE = "recorder_unavailable"


@dataclass(frozen=True, slots=True)
class MeterInfo:
    """What Home Assistant says about one statistic id."""

    statistic_id: str
    status: MeterStatus
    reason: str | None = None
    # ``recorder`` for entities, the integration domain for external statistics.
    source: str | None = None
    unit: str | None = None
    has_sum: bool | None = None
    entity_id: str | None = None
    # Whether long-term statistics already exist.
    long_term: bool = False

    def as_dict(self) -> dict[str, Any]:
        """Return the JSON-compatible representation."""
        return {
            "statistic_id": self.statistic_id,
            "status": self.status.value,
            "reason": self.reason,
            "source": self.source,
            "unit": self.unit,
            "has_sum": self.has_sum,
            "entity_id": self.entity_id,
            "long_term": self.long_term,
        }


@dataclass(frozen=True, slots=True)
class MeterReport:
    """Result of one resolution: the Recorder condition and every meter."""

    recorder_available: bool
    meters: Mapping[str, MeterInfo]

    def incompatible(self, statistic_ids: Iterable[str]) -> list[MeterInfo]:
        """Return the given meters that are verifiably not energy meters."""
        return [
            self.meters[statistic_id]
            for statistic_id in sorted(set(statistic_ids))
            if self.meters[statistic_id].status is MeterStatus.INCOMPATIBLE
        ]

    def as_dict(self) -> dict[str, Any]:
        """Return the JSON-compatible representation."""
        return {
            "recorder": "available" if self.recorder_available else "unavailable",
            "meters": {key: info.as_dict() for key, info in sorted(self.meters.items())},
        }


def energy_to_kwh(value: float, unit: str | None) -> float:
    """Convert an energy value to kWh; 0 stays 0, never missing.

    Power units, unknown units and a missing unit raise ``ValueError``: energy
    is never derived from power here.
    """
    if unit not in ENERGY_UNITS:
        raise ValueError(f"{unit!r} is not an energy unit")
    converted = EnergyConverter.convert(value, unit, UnitOfEnergy.KILO_WATT_HOUR)
    rounded = round(converted, KWH_PRECISION)
    return 0.0 if rounded == 0 else rounded


def _unit_issue(unit: Any) -> str | None:
    if unit is None:
        return "unit_missing"
    if unit not in ENERGY_UNITS:
        return "not_energy_unit"
    return None


def _metadata_issue(unit: Any, has_sum: Any) -> str | None:
    """Why recorded metadata cannot be an energy meter, if it cannot."""
    return _unit_issue(unit) or (None if has_sum else "no_sum")


def _entity_issue(state: State) -> str | None:
    """Why an entity cannot be an energy meter, judging by what it declares."""
    attributes = state.attributes
    device_class = attributes.get("device_class")
    if device_class is not None and device_class != "energy":
        return "incompatible_device_class"
    unit = attributes.get("unit_of_measurement")
    if unit is not None and unit not in ENERGY_UNITS:
        return "not_energy_unit"
    if state.state in (STATE_UNAVAILABLE, STATE_UNKNOWN):
        # Attributes may be incomplete while the entity is not reporting.
        return None
    if unit is None:
        return "unit_missing"
    state_class = attributes.get("state_class")
    if state_class is None:
        return "no_state_class"
    if state_class not in METER_STATE_CLASSES:
        return "no_sum"
    return None


def _not_reporting(state: State) -> str | None:
    if state.state == STATE_UNAVAILABLE:
        return "state_unavailable"
    if state.state == STATE_UNKNOWN:
        return "state_unknown"
    return None


def _recorder_instance(hass: HomeAssistant) -> Any:
    """Return the running Recorder, or ``None``; never waits for it."""
    if RECORDER_DOMAIN not in hass.config.components:
        return None
    try:
        from homeassistant.helpers.recorder import (  # noqa: PLC0415
            async_migration_in_progress,
            get_instance,
        )

        if async_migration_in_progress(hass):
            return None
        instance = get_instance(hass)
    except (ImportError, KeyError):
        return None
    ready = instance.async_db_ready
    if not ready.done() or ready.cancelled() or ready.exception() or not ready.result():
        return None
    return instance


def _read_recorder(hass: HomeAssistant, statistic_ids: set[str]) -> tuple[dict, dict]:
    """Recorder metadata, then what recorder platforms will compile; one job."""
    from homeassistant.components.recorder import statistics  # noqa: PLC0415

    recorded = {
        statistic_id: meta
        for statistic_id, (_, meta) in statistics.get_metadata(
            hass, statistic_ids=statistic_ids
        ).items()
    }
    missing = statistic_ids - recorded.keys()
    listed = (
        {item["statistic_id"]: item for item in statistics.list_statistic_ids(hass, missing)}
        if missing
        else {}
    )
    return recorded, listed


class EnergyMeterResolver:
    """Resolve statistic ids against Home Assistant, read-only.

    One call reads the Recorder once, in its own executor; nothing is cached or
    polled, so a status is as current as the call that produced it.
    """

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass

    async def async_resolve(self, statistic_ids: Iterable[str]) -> MeterReport:
        """Return the status of every statistic id."""
        ids = set(statistic_ids)
        if not ids:
            return MeterReport(recorder_available=_recorder_instance(self.hass) is not None, meters={})
        instance = _recorder_instance(self.hass)
        recorded: dict = {}
        listed: dict = {}
        if instance is not None:
            try:
                recorded, listed = await instance.async_add_executor_job(
                    _read_recorder, self.hass, ids
                )
            except Exception:  # noqa: BLE001 - any database failure means "not verifiable now"
                _LOGGER.warning("Recorder metadata for energy meters could not be read", exc_info=True)
                instance = None
        return MeterReport(
            recorder_available=instance is not None,
            meters={
                statistic_id: self._classify(statistic_id, instance is not None, recorded, listed)
                for statistic_id in ids
            },
        )

    def _classify(
        self, statistic_id: str, recorder: bool, recorded: Mapping, listed: Mapping
    ) -> MeterInfo:
        # What the entity declares (a power or temperature sensor...) explains a
        # refusal better than the statistics derived from it, so it comes first.
        is_entity = bool(SENSOR_ENTITY_ID_PATTERN.fullmatch(statistic_id))
        state = self.hass.states.get(statistic_id) if is_entity else None
        entity_issue = _entity_issue(state) if state is not None else None
        base = {"statistic_id": statistic_id, "entity_id": statistic_id if is_entity else None}

        if not recorder:
            # What the entity declares is enough to reject it, never to accept it.
            if entity_issue:
                return MeterInfo(**base, status=MeterStatus.INCOMPATIBLE, reason=entity_issue)
            return MeterInfo(**base, status=MeterStatus.RECORDER_UNAVAILABLE, reason="recorder_unavailable")

        if (meta := recorded.get(statistic_id)) is not None:
            unit = meta.get("unit_of_measurement")
            details = {
                **base,
                "source": meta.get("source"),
                "unit": unit,
                "has_sum": bool(meta.get("has_sum")),
                "long_term": True,
            }
            if issue := entity_issue or _metadata_issue(unit, meta.get("has_sum")):
                return MeterInfo(**details, status=MeterStatus.INCOMPATIBLE, reason=issue)
            if is_entity and (state is None or _not_reporting(state)):
                # Earlier statistics stay usable; new ones wait for the entity.
                reason = "entity_missing" if state is None else _not_reporting(state)
                return MeterInfo(**details, status=MeterStatus.UNAVAILABLE, reason=reason)
            return MeterInfo(**details, status=MeterStatus.VALID)

        if (item := listed.get(statistic_id)) is not None:
            unit = item.get("statistics_unit_of_measurement")
            details = {**base, "source": item.get("source"), "unit": unit, "has_sum": bool(item.get("has_sum"))}
            if issue := entity_issue or _metadata_issue(unit, item.get("has_sum")):
                return MeterInfo(**details, status=MeterStatus.INCOMPATIBLE, reason=issue)
            # New and suitable: Home Assistant compiles it at the next period.
            return MeterInfo(**details, status=MeterStatus.PENDING, reason="awaiting_first_statistics")

        if state is None:
            return MeterInfo(**base, status=MeterStatus.UNKNOWN, reason="not_found")
        if entity_issue:
            return MeterInfo(**base, status=MeterStatus.INCOMPATIBLE, reason=entity_issue)
        if reason := _not_reporting(state):
            return MeterInfo(**base, status=MeterStatus.UNAVAILABLE, reason=reason)
        # A suitable sensor the Recorder does not record (excluded from it).
        return MeterInfo(**base, status=MeterStatus.INCOMPATIBLE, reason="not_recorded")


def profile_statistic_ids(profile: EnergyProfileV2) -> set[str]:
    """Return every energy meter of the profile, devices and totals."""
    return {
        statistic_id
        for plan in profile.plant.values()
        for sources in (*(device.sources for device in plan.devices), plan.total)
        if sources is not None
        for parts in sources.energy.values()
        for statistic_id in parts
    }


def _parts(sources: DeviceSources | None, role: str) -> list[str]:
    return list(sources.energy.get(role, ())) if sources is not None else []


def energy_meter_plan(profile: EnergyProfileV2) -> dict[str, dict[str, Any]]:
    """How each module energy role is obtained, with the same rules as power.

    A total is authoritative and never added to the devices; otherwise the
    devices are summed, and a device without the meter leaves the sum partial
    instead of counting as 0 kWh. Parts listed in one meter are summed (e.g.
    F1, F2, F3) and flagged for confirmation, since only the user can tell
    whether they are disjoint.
    """
    plan: dict[str, dict[str, Any]] = {}
    for module, module_plan in profile.plant.items():
        roles: dict[str, Any] = {}
        for role in ENERGY_ROLES[module]:
            total = _parts(module_plan.total, role)
            devices = [
                {"device_id": device.id, "statistic_ids": parts}
                for device in module_plan.devices
                if (parts := _parts(device.sources, role))
            ]
            if not total and not devices:
                continue
            review = []
            if any(len(item["statistic_ids"]) > 1 for item in devices) or len(total) > 1:
                review.append("multiple_parts")
            if total and devices:
                review.append("total_with_devices")
            configured = len(module_plan.devices)
            if not total and len(devices) < configured:
                review.append("devices_without_meter")
            roles[role] = {
                "source": "total" if total else "devices",
                "statistic_ids": total or [eid for item in devices for eid in item["statistic_ids"]],
                "devices": devices,
                "coverage": None if total else {"contributing": len(devices), "configured": configured},
                "complete": bool(total) or len(devices) == configured,
                "review": review,
            }
        if roles:
            plan[module.value] = roles
    return plan

