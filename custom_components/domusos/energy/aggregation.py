"""Realtime devices of an Energy Profile v2 and their canonical module values.

Every device is normalized by the Energy Core module adapter
(``EnergyModuleAdapter``), so units, sign conventions, real zeros, freshness,
unavailable or unknown states and the noise tolerances apply exactly as for a
v1 module. ``ModuleAggregator`` then turns the devices of one module into the
module's canonical quantities:

- one device and no total: the device's state, unchanged;
- a total is authoritative for every quantity it measures and is never added
  to the devices; when it is not valid the quantity is not valid either, with
  no fallback to the devices;
- otherwise power is summed only when every device provides a valid value;
  with gaps the quantity is not valid, and the sum of the valid devices is
  kept apart as ``partial_value`` with its ``coverage``;
- the battery state of charge is averaged by usable capacity (or nominal
  capacity, when every battery declares it) and not computed otherwise.

Values are always in the canonical convention (positive into the home), so a
signed sum is the sum of already corrected values. A partial sum of signed
values is not a lower bound of the total.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, replace
from datetime import datetime
from enum import StrEnum
from typing import Any

from homeassistant.core import HomeAssistant

from ..core import CapabilityState
from ..core._values import utc_now
from .adapter import (
    CANONICAL_QUANTITIES,
    EnergyModuleAdapter,
    Quantity,
    _combined_status,
    _derived_freshness,
    _entity_ids,
)
from .models import (
    MODULE_SPECS,
    EnergyModule,
    Freshness,
    MeasurementKind,
    ModuleStatus,
    ValueSource,
    ValueStatus,
)
from .normalization import PERCENT_UNIT, POWER_UNIT, clean_value
from .profile_v2 import BatteryCapacity, EnergyDevice, ModulePlan

AGGREGATOR_SOURCE = "energy.module_aggregator"

# Why a value or a module cannot be shown (additive to the A0 reasons).
NO_POWER_SENSORS = "no_power_sensors"
PARTIAL_DEVICES = "partial_devices"
TOTAL_UNAVAILABLE = "total_unavailable"
TOTAL_INVALID = "total_invalid"
CAPACITY_UNKNOWN = "capacity_unknown"
# Status of a device that has energy meters but no realtime power sensor.
DEVICE_NOT_MEASURED = "not_measured"

STATE_OF_CHARGE = "state_of_charge"


class QuantityOrigin(StrEnum):
    """Where the value of a module quantity comes from."""

    DEVICE = "device"
    DEVICES_SUM = "devices_sum"
    DEVICES_WEIGHTED_USABLE = "devices_weighted_usable"
    DEVICES_WEIGHTED_NOMINAL = "devices_weighted_nominal"
    TOTAL = "total"


@dataclass(frozen=True, slots=True)
class ModuleQuantity:
    """A module quantity with how it was obtained."""

    quantity: Quantity
    origin: QuantityOrigin | None = None
    # Sum of the devices that do provide a value, when some do not.
    partial_value: float | None = None
    # (devices providing a valid value, devices that should).
    coverage: tuple[int, int] | None = None

    def as_dict(self) -> dict[str, Any]:
        """Return the A0 quantity with the additive aggregation fields."""
        return {
            **self.quantity.as_dict(),
            "origin": self.origin.value if self.origin else None,
            "partial_value": self.partial_value,
            "coverage": (
                {"contributing": self.coverage[0], "configured": self.coverage[1]}
                if self.coverage
                else None
            ),
        }


@dataclass(frozen=True, slots=True)
class DeviceReading:
    """One read of one device."""

    device: EnergyDevice
    # None for a device without power sensors.
    state: CapabilityState | None
    quantities: Mapping[str, Quantity]

    @property
    def status(self) -> str:
        """Return online, offline, or not_measured without power sensors."""
        return self.state.values["status"] if self.state else DEVICE_NOT_MEASURED

    @property
    def complete(self) -> bool:
        """Return whether every power sensor of the device is valid."""
        return bool(self.state and self.state.values["complete"])

    def as_dict(self) -> dict[str, Any]:
        """Return the device detail of ``get_state``."""
        values = self.state.values if self.state else {}
        return {
            "device_id": self.device.id,
            "name": self.device.name,
            "status": self.status,
            "complete": self.complete,
            "freshness": values.get("freshness"),
            "sign_convention": values.get("sign_convention"),
            "reason": self.state.reason if self.state else NO_POWER_SENSORS,
            "quantities": {name: quantity.as_dict() for name, quantity in self.quantities.items()},
        }


def _unit(module: EnergyModule, name: str) -> str:
    kind = MODULE_SPECS[module].roles[name].kind
    return PERCENT_UNIT if kind is MeasurementKind.STATE_OF_CHARGE else POWER_UNIT


class DeviceAdapter:
    """Normalize one configured device with the Energy Core module rules."""

    def __init__(self, hass: HomeAssistant, module: EnergyModule, device: EnergyDevice) -> None:
        self.module = module
        self.device = device
        power = device.sources.power
        self._adapter = EnergyModuleAdapter(hass, power) if power is not None else None

    @property
    def entity_ids(self) -> tuple[str, ...]:
        """Return the power sensors of the device."""
        return self._adapter.config.entity_ids if self._adapter else ()

    def read(self, now: datetime) -> DeviceReading:
        """Read every power sensor of the device once."""
        if self._adapter is None:
            # Energy meters only: nothing realtime, and never 0 W.
            return DeviceReading(
                self.device,
                None,
                {
                    name: Quantity.not_measured(_unit(self.module, name))
                    for name in CANONICAL_QUANTITIES[self.module]
                },
            )
        state, quantities = self._adapter.read_detailed(now)
        return DeviceReading(self.device, state, quantities)


class ModuleAggregator:
    """Canonical state of one module from its devices and optional total."""

    def __init__(self, hass: HomeAssistant, module: EnergyModule, plan: ModulePlan) -> None:
        self.module = module
        self.capability = f"energy.{module.value}"
        self.devices = tuple(DeviceAdapter(hass, module, device) for device in plan.devices)
        power = plan.total.power if plan.total is not None else None
        self._total = EnergyModuleAdapter(hass, power) if power is not None else None
        self._capacities = tuple(device.capacity for device in plan.devices)

    @property
    def measures_power(self) -> bool:
        """Return whether any device or the total has a realtime power sensor."""
        return self._total is not None or any(device.entity_ids for device in self.devices)

    @property
    def entity_ids(self) -> tuple[str, ...]:
        """Return every power sensor of the module, devices first."""
        total = self._total.config.entity_ids if self._total else ()
        return tuple(eid for device in self.devices for eid in device.entity_ids) + total

    async def async_get_capability(self) -> CapabilityState:
        """Return the current module state."""
        return self.read()

    def read(self, now: datetime | None = None) -> CapabilityState:
        """Read each sensor of the module once and combine the devices."""
        now = now or utc_now()
        readings = tuple(device.read(now) for device in self.devices)
        if len(readings) == 1 and self._total is None and readings[0].state is not None:
            return self._single(readings[0])
        total = self._total.read_detailed(now) if self._total else None
        return self._combined(readings, total, now)

    def _single(self, reading: DeviceReading) -> CapabilityState:
        """One device: exactly the v1 module state, plus the additive fields."""
        state = reading.state
        assert state is not None
        quantities = {}
        for name, quantity in reading.quantities.items():
            measured = quantity.status is not ValueStatus.NOT_MEASURED
            quantities[name] = ModuleQuantity(
                quantity,
                QuantityOrigin.DEVICE if measured else None,
                coverage=(int(quantity.ok), 1) if measured else None,
            ).as_dict()
        return replace(
            state,
            values={
                **state.values,
                "quantities": quantities,
                "devices": (reading.as_dict(),),
                "total": None,
            },
        )

    def _combined(
        self,
        readings: Sequence[DeviceReading],
        total: tuple[CapabilityState, Mapping[str, Quantity]] | None,
        now: datetime,
    ) -> CapabilityState:
        total_state, total_quantities = total if total else (None, {})
        quantities: dict[str, ModuleQuantity] = {}
        for name in CANONICAL_QUANTITIES[self.module]:
            from_total = total_quantities.get(name)
            if from_total is not None and from_total.status is not ValueStatus.NOT_MEASURED:
                quantities[name] = _from_total(from_total)
            elif name == STATE_OF_CHARGE:
                quantities[name] = _weighted_state_of_charge(
                    [reading.quantities[name] for reading in readings], self._capacities
                )
            else:
                quantities[name] = _sum([reading.quantities[name] for reading in readings])

        sources = [reading.state for reading in readings if reading.state is not None]
        if total_state is not None:
            sources.append(total_state)
        online = any(source.available for source in sources)
        freshness = {source.values["freshness"] for source in sources}
        conventions = {
            source.values["sign_convention"]
            for source in sources
            if source.values["sign_convention"] is not None
        }
        reason = None
        if not online:
            reason = (
                "sensors_unavailable"
                if any(source.reason == "sensors_unavailable" for source in sources)
                else "sensors_invalid"
            )
        return CapabilityState(
            capability=self.capability,
            source=AGGREGATOR_SOURCE,
            observed_at=now,
            available=online,
            values={
                "module": self.module.value,
                "status": (ModuleStatus.ONLINE if online else ModuleStatus.OFFLINE).value,
                # Every power sensor of the module, devices and total, is valid.
                "complete": all(reading.complete for reading in readings)
                and (total_state is None or bool(total_state.values["complete"])),
                "freshness": (
                    Freshness.STALE.value
                    if Freshness.STALE.value in freshness
                    else Freshness.FRESH.value
                    if Freshness.FRESH.value in freshness
                    else None
                ),
                # Only when every signed source agrees; each device reports its own.
                "sign_convention": next(iter(conventions)) if len(conventions) == 1 else None,
                "quantities": {name: quantity.as_dict() for name, quantity in quantities.items()},
                "devices": tuple(reading.as_dict() for reading in readings),
                "total": _total_detail(total_state, total_quantities) if total_state else None,
            },
            source_entity_ids=self.entity_ids,
            reason=reason,
        )


def _total_detail(state: CapabilityState, quantities: Mapping[str, Quantity]) -> dict[str, Any]:
    return {
        "status": state.values["status"],
        "complete": state.values["complete"],
        "freshness": state.values["freshness"],
        "sign_convention": state.values["sign_convention"],
        "reason": state.reason,
        "quantities": {name: quantity.as_dict() for name, quantity in quantities.items()},
    }


def _from_total(quantity: Quantity) -> ModuleQuantity:
    """The total decides alone; an invalid total is shown as such, never replaced."""
    if not quantity.ok:
        reason = TOTAL_INVALID if quantity.status is ValueStatus.INVALID else TOTAL_UNAVAILABLE
        quantity = replace(quantity, reason=reason)
    return ModuleQuantity(quantity, QuantityOrigin.TOTAL)


def _not_measured_by_any(terms: Sequence[Quantity]) -> ModuleQuantity | None:
    if any(term.status is not ValueStatus.NOT_MEASURED for term in terms):
        return None
    reasons = {term.reason for term in terms}
    return ModuleQuantity(
        Quantity(
            ValueStatus.NOT_MEASURED,
            unit=terms[0].unit,
            entity_ids=_entity_ids(terms),
            reason=reasons.pop() if len(reasons) == 1 else "insufficient_data",
        )
    )


def _stale_after(terms: Sequence[Quantity]) -> float | None:
    windows = [term.stale_after for term in terms if term.stale_after is not None]
    return min(windows) if windows else None


def _incomplete(
    terms: Sequence[Quantity], valid: Sequence[Quantity], **fields: Any
) -> Quantity:
    """A quantity some devices cannot provide: never a value, always a reason."""
    status, reason = _combined_status(term for term in terms if not term.ok)
    return Quantity(
        status,
        unit=terms[0].unit,
        source=None if status is ValueStatus.NOT_MEASURED else ValueSource.DERIVED,
        entity_ids=_entity_ids(terms),
        reason=PARTIAL_DEVICES if valid else reason,
        **fields,
    )


def _sum(terms: Sequence[Quantity]) -> ModuleQuantity:
    """Sum one power quantity of every device, only when all of them provide it."""
    if (not_measured := _not_measured_by_any(terms)) is not None:
        return not_measured
    valid = [term for term in terms if term.ok and term.value is not None]
    coverage = (len(valid), len(terms))
    if len(valid) < len(terms):
        return ModuleQuantity(
            _incomplete(terms, valid),
            QuantityOrigin.DEVICES_SUM,
            partial_value=clean_value(sum(term.value for term in valid)) if valid else None,
            coverage=coverage,
        )
    return ModuleQuantity(
        Quantity(
            ValueStatus.OK,
            unit=terms[0].unit,
            source=ValueSource.DERIVED,
            value=clean_value(sum(term.value for term in valid)),
            entity_ids=_entity_ids(terms),
            stale_after=_stale_after(terms),
            **_derived_freshness(terms),
        ),
        QuantityOrigin.DEVICES_SUM,
        coverage=coverage,
    )


def _capacity_weights(
    capacities: Sequence[BatteryCapacity | None],
) -> tuple[QuantityOrigin, list[float]] | None:
    """Usable capacity of every battery, else nominal of every battery; never mixed."""
    for origin, field in (
        (QuantityOrigin.DEVICES_WEIGHTED_USABLE, "usable_kwh"),
        (QuantityOrigin.DEVICES_WEIGHTED_NOMINAL, "nominal_kwh"),
    ):
        weights = [getattr(capacity, field) if capacity else None for capacity in capacities]
        if all(weights):
            return origin, weights
    return None


def _weighted_state_of_charge(
    terms: Sequence[Quantity], capacities: Sequence[BatteryCapacity | None]
) -> ModuleQuantity:
    """Capacity-weighted state of charge; no average is ever made up."""
    if (not_measured := _not_measured_by_any(terms)) is not None:
        return not_measured
    valid = [term for term in terms if term.ok and term.value is not None]
    coverage = (len(valid), len(terms))
    weights = _capacity_weights(capacities)
    if weights is None:
        # The individual values stay in the device detail.
        return ModuleQuantity(
            Quantity(
                ValueStatus.NOT_MEASURED,
                unit=PERCENT_UNIT,
                entity_ids=_entity_ids(terms),
                reason=CAPACITY_UNKNOWN,
            ),
            coverage=coverage,
        )
    origin, weight = weights
    if len(valid) < len(terms):
        # An average of some batteries is not the charge of the installation.
        return ModuleQuantity(_incomplete(terms, valid), origin, coverage=coverage)
    value = sum(term.value * w for term, w in zip(valid, weight, strict=True)) / sum(weight)
    return ModuleQuantity(
        Quantity(
            ValueStatus.OK,
            unit=PERCENT_UNIT,
            source=ValueSource.DERIVED,
            value=clean_value(value),
            entity_ids=_entity_ids(terms),
            stale_after=_stale_after(terms),
            **_derived_freshness(terms),
        ),
        origin,
        coverage=coverage,
    )
