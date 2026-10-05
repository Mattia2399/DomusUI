"""Energy Profile models and validation for Domus Energy Core.

The profile only describes which Home Assistant sensors represent the energy
hardware that actually exists in a home. A module that is not part of the
installation is simply absent: no placeholder module is ever created.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass, field
from enum import StrEnum
from types import MappingProxyType
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .tariff import EnergyTariff

STORAGE_KEY = "domusos.energy.v1"
STORAGE_VERSION = 1
DOCUMENT_SCHEMA = "domusos-energy-profile"
DOCUMENT_VERSION = 1

SENSOR_ENTITY_ID_PATTERN = re.compile(r"^sensor\.[a-z0-9_]+$")


class EnergyError(Exception):
    """Base error surfaced through the Energy websocket contract."""

    code = "energy_error"


class EnergyValidationError(EnergyError):
    """Invalid Energy Profile input."""

    code = "invalid_profile"


class EnergyConflictError(EnergyError):
    """Optimistic revision conflict while saving the profile."""

    code = "revision_conflict"


class EnergyUnavailableError(EnergyError):
    """Domus Energy is not running."""

    code = "energy_unavailable"


class EnergyModule(StrEnum):
    """Optional energy modules a home may contain."""

    GRID = "grid"
    SOLAR = "solar"
    HOME = "home"
    BATTERY = "battery"
    WALLBOX = "wallbox"


class MeasurementKind(StrEnum):
    """Physical quantity measured by a configured sensor."""

    # Instantaneous power, normalized to W. Never cumulative energy.
    POWER = "power"
    # Battery state of charge, normalized to %.
    STATE_OF_CHARGE = "state_of_charge"


class SignConvention(StrEnum):
    """Explicitly declared meaning of a positive value on a signed sensor."""

    POSITIVE_IMPORT = "positive_import"
    POSITIVE_EXPORT = "positive_export"
    POSITIVE_DISCHARGE = "positive_discharge"
    POSITIVE_CHARGE = "positive_charge"


class ModuleStatus(StrEnum):
    """Hardware condition of one module."""

    # Not part of the configured installation.
    ABSENT = "absent"
    # Configured, but no configured sensor currently provides valid data.
    OFFLINE = "offline"
    # Configured and at least one configured sensor provides valid data.
    ONLINE = "online"


class ValueStatus(StrEnum):
    """Availability of one normalized value."""

    OK = "ok"
    UNAVAILABLE = "unavailable"
    INVALID = "invalid"
    # No sensor or coherent derivation exists for this value in the profile.
    NOT_MEASURED = "not_measured"


class Freshness(StrEnum):
    """Whether a valid value is still being reported by its integration."""

    FRESH = "fresh"
    # Still the last known value, but the integration stopped reporting it.
    STALE = "stale"


class ValueSource(StrEnum):
    """Whether a value is read from a sensor or computed by Domus."""

    MEASURED = "measured"
    DERIVED = "derived"


@dataclass(frozen=True, slots=True)
class RoleSpec:
    """One sensor role inside a module."""

    kind: MeasurementKind
    signed: bool = False
    # Small negative readings are standby draw or offset, not a reversed flow.
    negative_noise: bool = False


@dataclass(frozen=True, slots=True)
class ModuleSpec:
    """Allowed roles and sign conventions for one module."""

    roles: Mapping[str, RoleSpec]
    sign_conventions: frozenset[SignConvention] = frozenset()


_POWER = RoleSpec(MeasurementKind.POWER)
_SIGNED_POWER = RoleSpec(MeasurementKind.POWER, signed=True)

MODULE_SPECS: Mapping[EnergyModule, ModuleSpec] = MappingProxyType(
    {
        EnergyModule.GRID: ModuleSpec(
            roles=MappingProxyType(
                {
                    "import_power": _POWER,
                    "export_power": _POWER,
                    "net_power": _SIGNED_POWER,
                }
            ),
            sign_conventions=frozenset(
                {SignConvention.POSITIVE_IMPORT, SignConvention.POSITIVE_EXPORT}
            ),
        ),
        EnergyModule.SOLAR: ModuleSpec(
            roles=MappingProxyType(
                {"production_power": RoleSpec(MeasurementKind.POWER, negative_noise=True)}
            ),
        ),
        EnergyModule.HOME: ModuleSpec(
            roles=MappingProxyType({"consumption_power": _POWER}),
        ),
        EnergyModule.BATTERY: ModuleSpec(
            roles=MappingProxyType(
                {
                    "state_of_charge": RoleSpec(MeasurementKind.STATE_OF_CHARGE),
                    "charge_power": _POWER,
                    "discharge_power": _POWER,
                    "net_power": _SIGNED_POWER,
                }
            ),
            sign_conventions=frozenset(
                {SignConvention.POSITIVE_DISCHARGE, SignConvention.POSITIVE_CHARGE}
            ),
        ),
        EnergyModule.WALLBOX: ModuleSpec(
            roles=MappingProxyType({"charging_power": _POWER}),
        ),
    }
)


@dataclass(frozen=True, slots=True)
class EnergyModuleConfig:
    """Sensors bound to one configured module."""

    module: EnergyModule
    sensors: Mapping[str, str]
    sign_convention: SignConvention | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "sensors", MappingProxyType(dict(self.sensors)))

    @property
    def spec(self) -> ModuleSpec:
        """Return the static module specification."""
        return MODULE_SPECS[self.module]

    @property
    def entity_ids(self) -> tuple[str, ...]:
        """Return configured entity IDs in role order."""
        return tuple(
            self.sensors[role] for role in self.spec.roles if role in self.sensors
        )

    def as_document(self) -> dict[str, Any]:
        """Return the JSON-compatible stored representation."""
        document: dict[str, Any] = {"sensors": dict(self.sensors)}
        if self.sign_convention is not None:
            document["sign_convention"] = self.sign_convention.value
        return document


@dataclass(frozen=True, slots=True)
class EnergyProfile:
    """Validated Energy Profile containing only configured modules."""

    revision: int = 0
    modules: Mapping[EnergyModule, EnergyModuleConfig] = field(default_factory=dict)
    updated_at: str | None = None
    tariff: EnergyTariff | None = None

    def __post_init__(self) -> None:
        ordered = {
            module: self.modules[module] for module in EnergyModule if module in self.modules
        }
        object.__setattr__(self, "modules", MappingProxyType(ordered))

    @property
    def configured_modules(self) -> tuple[EnergyModule, ...]:
        """Return configured modules in canonical order."""
        return tuple(self.modules)

    @property
    def absent_modules(self) -> tuple[EnergyModule, ...]:
        """Return modules that are not part of this installation."""
        return tuple(module for module in EnergyModule if module not in self.modules)

    @property
    def is_empty(self) -> bool:
        """Return whether no energy hardware is configured."""
        return not self.modules

    @property
    def entity_ids(self) -> tuple[str, ...]:
        """Return every configured entity ID."""
        return tuple(
            entity_id
            for config in self.modules.values()
            for entity_id in config.entity_ids
        )

    def as_document(self) -> dict[str, Any]:
        """Return the versioned Store document."""
        return {
            "schema": DOCUMENT_SCHEMA,
            "version": DOCUMENT_VERSION,
            "revision": self.revision,
            "updated_at": self.updated_at,
            "modules": {
                module.value: config.as_document()
                for module, config in self.modules.items()
            },
            "tariff": self.tariff.as_document() if self.tariff else None,
        }


def parse_profile(document: Any) -> EnergyProfile:
    """Strictly validate a user-supplied profile document.

    Only ``modules`` and the optional ``tariff`` are read; ``revision`` and
    ``updated_at`` are server-owned.
    """
    from .tariff import parse_tariff  # noqa: PLC0415 - tariff imports this module

    if not isinstance(document, Mapping):
        raise EnergyValidationError("The energy profile must be an object")
    raw_modules = document.get("modules", {})
    if not isinstance(raw_modules, Mapping):
        raise EnergyValidationError("'modules' must be an object")

    modules: dict[EnergyModule, EnergyModuleConfig] = {}
    used_entities: dict[str, str] = {}
    for raw_name, raw_module in raw_modules.items():
        try:
            module = EnergyModule(raw_name)
        except ValueError as err:
            raise EnergyValidationError(f"Unknown energy module: {raw_name}") from err
        config = _parse_module(module, raw_module)
        for role, entity_id in config.sensors.items():
            location = f"{module.value}.{role}"
            if entity_id in used_entities:
                raise EnergyValidationError(
                    f"{entity_id} is used by both {used_entities[entity_id]} "
                    f"and {location}"
                )
            used_entities[entity_id] = location
        modules[module] = config
    return EnergyProfile(modules=modules, tariff=parse_tariff(document.get("tariff")))


def parse_stored_profile(document: Any) -> EnergyProfile:
    """Validate a persisted Store document, including server-owned metadata."""
    if not isinstance(document, Mapping):
        raise EnergyValidationError("Stored energy profile is not an object")
    if document.get("schema") != DOCUMENT_SCHEMA:
        raise EnergyValidationError("Stored energy profile has an unknown schema")
    if document.get("version") != DOCUMENT_VERSION:
        raise EnergyValidationError("Stored energy profile has an unsupported version")
    revision = document.get("revision")
    if not isinstance(revision, int) or isinstance(revision, bool) or revision < 0:
        raise EnergyValidationError("Stored energy profile has an invalid revision")
    updated_at = document.get("updated_at")
    if updated_at is not None and not isinstance(updated_at, str):
        raise EnergyValidationError("Stored energy profile has an invalid timestamp")
    profile = parse_profile(document)
    return EnergyProfile(
        revision=revision,
        modules=profile.modules,
        updated_at=updated_at,
        tariff=profile.tariff,
    )


def _parse_module(module: EnergyModule, raw: Any) -> EnergyModuleConfig:
    spec = MODULE_SPECS[module]
    if not isinstance(raw, Mapping):
        raise EnergyValidationError(f"Module {module.value} must be an object")
    unknown_keys = set(raw) - {"sensors", "sign_convention"}
    if unknown_keys:
        raise EnergyValidationError(
            f"Module {module.value} has unknown keys: {', '.join(sorted(map(str, unknown_keys)))}"
        )
    raw_sensors = raw.get("sensors")
    if not isinstance(raw_sensors, Mapping) or not raw_sensors:
        raise EnergyValidationError(
            f"Module {module.value} needs at least one sensor; omit absent modules"
        )

    sensors: dict[str, str] = {}
    for role, entity_id in raw_sensors.items():
        if role not in spec.roles:
            raise EnergyValidationError(
                f"Unknown role for module {module.value}: {role}"
            )
        if not isinstance(entity_id, str) or not SENSOR_ENTITY_ID_PATTERN.fullmatch(
            entity_id
        ):
            raise EnergyValidationError(
                f"{module.value}.{role} must reference a sensor entity"
            )
        sensors[role] = entity_id

    signed_roles = [role for role in sensors if spec.roles[role].signed]
    split_power_roles = [
        role
        for role in sensors
        if not spec.roles[role].signed
        and spec.roles[role].kind is MeasurementKind.POWER
    ]
    if signed_roles and split_power_roles:
        raise EnergyValidationError(
            f"Module {module.value} cannot combine a signed net sensor with "
            f"directional power sensors"
        )

    raw_convention = raw.get("sign_convention")
    convention: SignConvention | None = None
    if signed_roles:
        if raw_convention is None:
            raise EnergyValidationError(
                f"Module {module.value} uses a signed sensor and must declare "
                f"its sign convention"
            )
        try:
            convention = SignConvention(raw_convention)
        except ValueError as err:
            raise EnergyValidationError(
                f"Invalid sign convention for {module.value}: {raw_convention}"
            ) from err
        if convention not in spec.sign_conventions:
            raise EnergyValidationError(
                f"Sign convention {convention.value} does not apply to {module.value}"
            )
    elif raw_convention is not None:
        raise EnergyValidationError(
            f"Module {module.value} declares a sign convention without a signed sensor"
        )

    return EnergyModuleConfig(module=module, sensors=sensors, sign_convention=convention)
