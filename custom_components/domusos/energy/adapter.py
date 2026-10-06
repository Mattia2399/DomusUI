"""Read-only capability adapters for configured energy modules.

Each configured module gets one ``CapabilityAdapter`` (``energy.grid``,
``energy.battery``, ...). Absent modules get no adapter at all. Canonical net
power follows the Home Assistant Energy convention: positive values flow into
the home (grid import, battery discharge).
"""

from __future__ import annotations

from collections.abc import Collection, Iterable, Mapping
from dataclasses import dataclass, replace
from datetime import datetime
from typing import Any

from homeassistant.core import HomeAssistant

from ..core import CapabilityState
from ..core._values import utc_now
from .models import (
    MODULE_SPECS,
    EnergyModule,
    EnergyModuleConfig,
    Freshness,
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

# Sensors are sampled at slightly different instants and rounded by their
# integrations, so a home balance a little below zero is measurement noise and
# reads as 0 W. The band grows with the power flowing (2% of the absolute terms)
# because timing skew matters more at high power; beyond it the balance is
# reported as incoherent instead of clamped.
BALANCE_TOLERANCE_W = 50.0
BALANCE_TOLERANCE_RATIO = 0.02

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
    freshness: Freshness | None = None
    # Oldest report behind the value, and how long a measured value stays fresh.
    reported_at: datetime | None = None
    stale_after: float | None = None

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
            freshness=reading.freshness,
            reported_at=reading.reported_at if reading.ok else None,
            stale_after=reading.stale_after.total_seconds() if reading.ok else None,
        )

    @classmethod
    def not_measured(cls, unit: str = POWER_UNIT) -> Quantity:
        """Return a value the profile has no sensor or derivation for."""
        return cls(ValueStatus.NOT_MEASURED, unit=unit, reason="not_configured")

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any]) -> Quantity:
        """Rebuild a quantity from its capability-state projection."""
        source = value.get("source")
        freshness = value.get("freshness")
        reported_at = value.get("reported_at")
        return cls(
            status=ValueStatus(value["status"]),
            unit=value.get("unit", POWER_UNIT),
            source=ValueSource(source) if source is not None else None,
            value=value.get("value"),
            entity_ids=tuple(value.get("entity_ids", ())),
            reason=value.get("reason"),
            freshness=Freshness(freshness) if freshness is not None else None,
            reported_at=datetime.fromisoformat(reported_at) if reported_at else None,
            stale_after=value.get("stale_after"),
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
            "freshness": self.freshness.value if self.freshness else None,
            "reported_at": self.reported_at.isoformat() if self.reported_at else None,
            "stale_after": self.stale_after,
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

    def read(self, now: datetime | None = None) -> CapabilityState:
        """Read Home Assistant state synchronously; performs no I/O."""
        return self.read_detailed(now)[0]

    def read_detailed(
        self, now: datetime | None = None
    ) -> tuple[CapabilityState, dict[str, Quantity]]:
        """Return the capability state and its canonical quantities, read once."""
        roles = self.config.spec.roles
        now = now or utc_now()
        readings = {
            role: normalize_state(
                entity_id,
                self.hass.states.get(entity_id),
                roles[role].kind,
                signed=roles[role].signed,
                negative_noise=roles[role].negative_noise,
                now=now,
            )
            for role, entity_id in self.config.sensors.items()
        }
        valid_readings = [reading for reading in readings.values() if reading.ok]
        freshness = (
            None
            if not valid_readings
            else Freshness.STALE
            if any(reading.freshness is Freshness.STALE for reading in valid_readings)
            else Freshness.FRESH
        )
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
        quantities = self._quantities(readings)
        state = CapabilityState(
            capability=self.capability,
            source=ADAPTER_SOURCE,
            observed_at=now,
            available=status is ModuleStatus.ONLINE,
            values={
                "module": self.module.value,
                "status": status.value,
                "complete": valid == len(readings),
                # Fresh only while every valid sensor of the module is still reported.
                "freshness": freshness.value if freshness else None,
                "sign_convention": convention.value if convention else None,
                "sensors": {role: reading.as_dict() for role, reading in readings.items()},
                "quantities": {name: quantity.as_dict() for name, quantity in quantities.items()},
            },
            source_entity_ids=self.config.entity_ids,
            reason=reason,
        )
        return state, quantities

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
    unmeasured: Collection[EnergyModule] = (),
) -> Quantity:
    """Return measured home consumption, or a coherent derived balance.

    The balance ``grid net + solar production + battery net`` is computed only
    when the grid is configured, every configured contributing module provides
    complete flows and the result is not negative. A wallbox sits behind the
    meter, so a derived value includes its load. ``unmeasured`` lists modules
    that are installed but have no realtime power sensor: a balance without
    them would be wrong, so it is not computed.
    """
    home = states.get(EnergyModule.HOME)
    if home is not None:
        return Quantity.from_mapping(home.values["quantities"]["consumption_power"])

    grid = states.get(EnergyModule.GRID)
    if grid is None:
        return Quantity(ValueStatus.NOT_MEASURED, reason="insufficient_data")

    terms = [Quantity.from_mapping(grid.values["quantities"]["net_power"])]
    for module, name in ((EnergyModule.SOLAR, "production_power"), (EnergyModule.BATTERY, "net_power")):
        state = states.get(module)
        if state is not None:
            terms.append(Quantity.from_mapping(state.values["quantities"][name]))
        elif module in unmeasured:
            terms.append(Quantity.not_measured())

    entity_ids = _entity_ids(terms)
    status, reason = _combined_status(terms)
    if status is not ValueStatus.OK:
        return Quantity(
            status,
            source=None if status is ValueStatus.NOT_MEASURED else ValueSource.DERIVED,
            entity_ids=entity_ids,
            reason=reason,
        )
    values = [term.value for term in terms if term.value is not None]
    total = sum(values)
    tolerance = max(BALANCE_TOLERANCE_W, BALANCE_TOLERANCE_RATIO * sum(abs(v) for v in values))
    if total < -tolerance:
        return Quantity(
            ValueStatus.INVALID,
            source=ValueSource.DERIVED,
            entity_ids=entity_ids,
            reason="incoherent_balance",
        )
    return Quantity(
        ValueStatus.OK,
        source=ValueSource.DERIVED,
        # Only a balance inside the tolerance band can be below zero here.
        value=0.0 if total < 0 else clean_value(total),
        entity_ids=entity_ids,
        **_derived_freshness(terms),
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
    # One direction of a signed flow: the opposite direction is 0 W by definition.
    return replace(net, source=ValueSource.DERIVED, value=directed if directed > 0 else 0.0)


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
        **_derived_freshness(terms),
    )


def _derived_freshness(terms: Iterable[Quantity]) -> dict[str, Any]:
    """A derived value is only as fresh as its oldest term."""
    terms = tuple(terms)
    reports = [term.reported_at for term in terms if term.reported_at is not None]
    stale = any(term.freshness is Freshness.STALE for term in terms)
    known = any(term.freshness is not None for term in terms)
    return {
        "freshness": Freshness.STALE if stale else Freshness.FRESH if known else None,
        "reported_at": min(reports) if reports else None,
    }


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
