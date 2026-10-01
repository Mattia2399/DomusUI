"""Read-only capability adapters for configured energy modules.

Each configured module gets one ``CapabilityAdapter`` (``energy.grid``,
``energy.battery``, ...). Absent modules get no adapter at all. Canonical net
power follows the Home Assistant Energy convention: positive values flow into
the home (grid import, battery discharge).
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Any

from homeassistant.core import HomeAssistant

from ..core import CapabilityState
from ..core._values import utc_now
from .models import (
    MODULE_SPECS,
    EnergyModule,
    EnergyModuleConfig,
    MeasurementKind,
    ModuleStatus,
    SignConvention,
    ValueSource,
    ValueStatus,
)
from .normalization import (
    PERCENT_UNIT,
    POWER_UNIT,
    Reading,
    clean_value,
    normalize_state,
)

ADAPTER_SOURCE = "energy.module_adapter"

CANONICAL_QUANTITIES: Mapping[EnergyModule, tuple[str, ...]] = {
    EnergyModule.GRID: ("import_power", "export_power", "net_power"),
    EnergyModule.SOLAR: ("production_power",),
    EnergyModule.HOME: ("consumption_power",),
    EnergyModule.BATTERY: (
        "state_of_charge",
        "charge_power",
        "discharge_power",
        "net_power",
    ),
    EnergyModule.WALLBOX: ("charging_power",),
}
# (flow into the home, flow out of the home) for bidirectional modules.
DIRECTIONAL_PAIRS: Mapping[EnergyModule, tuple[str, str]] = {
    EnergyModule.GRID: ("import_power", "export_power"),
    EnergyModule.BATTERY: ("discharge_power", "charge_power"),
}
SIGN_FACTORS: Mapping[SignConvention, float] = {
    SignConvention.POSITIVE_IMPORT: 1.0,
    SignConvention.POSITIVE_EXPORT: -1.0,
    SignConvention.POSITIVE_DISCHARGE: 1.0,
    SignConvention.POSITIVE_CHARGE: -1.0,
}


@dataclass(frozen=True, slots=True)
class Quantity:
    """One canonical energy value, measured or derived, with its availability."""

    status: ValueStatus
    unit: str = POWER_UNIT
    source: ValueSource | None = None
    value: float | None = None
    entity_ids: tuple[str, ...] = ()
    reason: str | None = None

    @property
    def ok(self) -> bool:
        """Return whether the quantity carries a valid value."""
        return self.status is ValueStatus.OK

    @classmethod
    def measured(cls, reading: Reading, *, factor: float = 1.0) -> Quantity:
        """Project a sensor reading, applying a verified sign factor."""
        return cls(
            status=reading.status,
            unit=reading.unit,
            source=ValueSource.MEASURED,
            value=clean_value(reading.value * factor) if reading.value is not None else None,
            entity_ids=(reading.entity_id,),
            reason=reading.reason,
        )

    @classmethod
    def not_measured(cls, unit: str = POWER_UNIT) -> Quantity:
        """Return a value the profile has no sensor or derivation for."""
        return cls(ValueStatus.NOT_MEASURED, unit=unit, reason="not_configured")

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any]) -> Quantity:
        """Rebuild a quantity from its capability-state projection."""
        source = value.get("source")
        return cls(
            status=ValueStatus(value["status"]),
            unit=value.get("unit", POWER_UNIT),
            source=ValueSource(source) if source is not None else None,
            value=value.get("value"),
            entity_ids=tuple(value.get("entity_ids", ())),
            reason=value.get("reason"),
        )

    def as_dict(self) -> dict[str, Any]:
        """Return a JSON-compatible representation."""
        return {
            "status": self.status.value,
            "value": self.value,
            "unit": self.unit,
            "source": self.source.value if self.source is not None else None,
            "entity_ids": self.entity_ids,
            "reason": self.reason,
        }


class EnergyModuleAdapter:
    """Translate the sensors of one configured module into a capability state."""

    def __init__(self, hass: HomeAssistant, config: EnergyModuleConfig) -> None:
        self.hass = hass
        self.config = config
        self.module = config.module
        self.capability = f"energy.{config.module.value}"

    async def async_get_capability(self) -> CapabilityState:
        """Return the current normalized capability state."""
        return self.read()

    def read(self) -> CapabilityState:
        """Read Home Assistant state synchronously; performs no I/O."""
        roles = self.config.spec.roles
        readings = {
            role: normalize_state(
                entity_id,
                self.hass.states.get(entity_id),
                roles[role].kind,
                signed=roles[role].signed,
            )
            for role, entity_id in self.config.sensors.items()
        }
        valid = sum(reading.ok for reading in readings.values())
        status = ModuleStatus.ONLINE if valid else ModuleStatus.OFFLINE
        reason: str | None = None
        if status is ModuleStatus.OFFLINE:
            reason = (
                "sensors_unavailable"
                if any(r.status is ValueStatus.UNAVAILABLE for r in readings.values())
                else "sensors_invalid"
            )
        convention = self.config.sign_convention
        return CapabilityState(
            capability=self.capability,
            source=ADAPTER_SOURCE,
            observed_at=utc_now(),
            available=status is ModuleStatus.ONLINE,
            values={
                "module": self.module.value,
                "status": status.value,
                "complete": valid == len(readings),
                "sign_convention": convention.value if convention else None,
                "sensors": {role: reading.as_dict() for role, reading in readings.items()},
                "quantities": {
                    name: quantity.as_dict()
                    for name, quantity in self._quantities(readings).items()
                },
            },
            source_entity_ids=self.config.entity_ids,
            reason=reason,
        )

    def _quantities(self, readings: Mapping[str, Reading]) -> dict[str, Quantity]:
        roles = MODULE_SPECS[self.module].roles
        result: dict[str, Quantity] = {}
        for name in CANONICAL_QUANTITIES[self.module]:
            spec = roles[name]
            reading = readings.get(name)
            if reading is not None and not spec.signed:
                result[name] = Quantity.measured(reading)
            else:
                unit = (
                    PERCENT_UNIT
                    if spec.kind is MeasurementKind.STATE_OF_CHARGE
                    else POWER_UNIT
                )
                result[name] = Quantity.not_measured(unit)

        pair = DIRECTIONAL_PAIRS.get(self.module)
        if pair is None:
            return result
        inbound, outbound = pair
        net_reading = readings.get("net_power")
        if net_reading is not None and self.config.sign_convention is not None:
            # Validation guarantees a declared convention for signed sensors.
            net = Quantity.measured(
                net_reading, factor=SIGN_FACTORS[self.config.sign_convention]
            )
            result["net_power"] = net
            result[inbound] = _split(net, inbound=True)
            result[outbound] = _split(net, inbound=False)
        else:
            result["net_power"] = _difference(result[inbound], result[outbound])
        return result


def derive_home_consumption(
    states: Mapping[EnergyModule, CapabilityState],
) -> Quantity:
    """Return measured home consumption, or a coherent derived balance.

    The balance ``grid net + solar production + battery net`` is computed only
    when the grid is configured, every configured contributing module provides
    complete flows and the result is not negative. A wallbox sits behind the
    meter, so a derived value includes its load.
    """
    home = states.get(EnergyModule.HOME)
    if home is not None:
        return Quantity.from_mapping(home.values["quantities"]["consumption_power"])

    grid = states.get(EnergyModule.GRID)
    if grid is None:
        return Quantity(ValueStatus.NOT_MEASURED, reason="insufficient_data")

    terms = [Quantity.from_mapping(grid.values["quantities"]["net_power"])]
    solar = states.get(EnergyModule.SOLAR)
    if solar is not None:
        terms.append(
            Quantity.from_mapping(solar.values["quantities"]["production_power"])
        )
    battery = states.get(EnergyModule.BATTERY)
    if battery is not None:
        terms.append(Quantity.from_mapping(battery.values["quantities"]["net_power"]))

    entity_ids = _entity_ids(terms)
    status, reason = _combined_status(terms)
    if status is not ValueStatus.OK:
        return Quantity(
            status,
            source=None if status is ValueStatus.NOT_MEASURED else ValueSource.DERIVED,
            entity_ids=entity_ids,
            reason=reason,
        )
    total = sum(term.value for term in terms if term.value is not None)
    if total < 0:
        return Quantity(
            ValueStatus.INVALID,
            source=ValueSource.DERIVED,
            entity_ids=entity_ids,
            reason="incoherent_balance",
        )
    return Quantity(
        ValueStatus.OK,
        source=ValueSource.DERIVED,
        value=clean_value(total),
        entity_ids=entity_ids,
    )


def _split(net: Quantity, *, inbound: bool) -> Quantity:
    if not net.ok or net.value is None:
        return Quantity(
            net.status,
            source=ValueSource.DERIVED,
            entity_ids=net.entity_ids,
            reason=net.reason,
        )
    directed = net.value if inbound else -net.value
    return Quantity(
        ValueStatus.OK,
        source=ValueSource.DERIVED,
        value=directed if directed > 0 else 0.0,
        entity_ids=net.entity_ids,
    )


def _difference(inbound: Quantity, outbound: Quantity) -> Quantity:
    terms = (inbound, outbound)
    status, reason = _combined_status(terms)
    if (
        status is not ValueStatus.OK
        or inbound.value is None
        or outbound.value is None
    ):
        return Quantity(
            status,
            source=None if status is ValueStatus.NOT_MEASURED else ValueSource.DERIVED,
            entity_ids=_entity_ids(terms),
            reason=reason,
        )
    return Quantity(
        ValueStatus.OK,
        source=ValueSource.DERIVED,
        value=clean_value(inbound.value - outbound.value),
        entity_ids=_entity_ids(terms),
    )


def _combined_status(terms: Iterable[Quantity]) -> tuple[ValueStatus, str | None]:
    statuses = {term.status for term in terms}
    if ValueStatus.NOT_MEASURED in statuses:
        return ValueStatus.NOT_MEASURED, "insufficient_data"
    if ValueStatus.INVALID in statuses:
        return ValueStatus.INVALID, "source_invalid"
    if ValueStatus.UNAVAILABLE in statuses:
        return ValueStatus.UNAVAILABLE, "source_unavailable"
    return ValueStatus.OK, None


def _entity_ids(terms: Iterable[Quantity]) -> tuple[str, ...]:
    return tuple(dict.fromkeys(eid for term in terms for eid in term.entity_ids))
