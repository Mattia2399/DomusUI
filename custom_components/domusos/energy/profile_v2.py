"""Energy Profile v2: device instances, power sensors and energy meters.

Version 2 describes each module as one or more devices (inverters, batteries,
wallboxes...) plus an optional ``total`` source that already covers all of
them. Every device may bind instantaneous POWER sensors, validated exactly as a
v1 module, and cumulative ENERGY meters: Home Assistant statistic ids, either
``sensor.*`` entities or external statistics such as ``opower:energy``.

This module is pure. Nothing loads, stores or serves v2 yet: the live profile
is still v1, and ``upgrade_v1`` only converts it in memory.

Compatibility with v1 clients rests on ``lossless_v1``: a v2 profile has a v1
view only when v1 can hold all of it (one device per module with the id v1
conversion assigns, no name, no Home Assistant device, no capacity, no energy
meter, no total). A v1 save may only replace a profile that has such a view;
anything else would silently drop data and must be refused.
"""

from __future__ import annotations

import math
import re
from collections.abc import Mapping
from dataclasses import dataclass, field
from types import MappingProxyType
from typing import Any

from .models import (
    DOCUMENT_SCHEMA,
    DOCUMENT_VERSION,
    SENSOR_ENTITY_ID_PATTERN,
    EnergyModule,
    EnergyModuleConfig,
    EnergyProfile,
    EnergyValidationError,
    _parse_module,
    parse_stored_profile,
)
from .tariff import EnergyTariff, parse_tariff

DOCUMENT_VERSION_V2 = 2
# Reserved for the persistent migration (A1.2); nothing writes it yet.
STORAGE_KEY_V2 = "domusos.energy.v2"

DEVICE_ID_PATTERN = re.compile(r"^[a-z][a-z0-9_-]{0,47}$")
HA_DEVICE_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
# Home Assistant's external statistic ids: "<source>:<id>", lowercase, no
# leading, trailing or doubled underscores.
EXTERNAL_STATISTIC_PATTERN = re.compile(
    r"^(?!_)(?!.*__)[a-z0-9_]+(?<!_):(?!_)[a-z0-9_]+(?<!_)$"
)
MAX_DEVICES_PER_MODULE = 16
MAX_METER_PARTS = 8
MAX_NAME_LENGTH = 64
MAX_CAPACITY_KWH = 1000.0

# Cumulative energy roles per module. A role lists the meters whose sum is the
# quantity, as Home Assistant's flow_from does for tariff-split grid meters.
ENERGY_ROLES: Mapping[EnergyModule, tuple[str, ...]] = MappingProxyType(
    {
        EnergyModule.GRID: ("import_energy", "export_energy"),
        EnergyModule.SOLAR: ("production_energy",),
        EnergyModule.HOME: ("consumption_energy",),
        EnergyModule.BATTERY: ("charge_energy", "discharge_energy"),
        EnergyModule.WALLBOX: ("charging_energy",),
    }
)

_PROFILE_KEYS = frozenset({"plant", "tariff"})
_SERVER_KEYS = frozenset({"schema", "version", "revision", "updated_at", "migrated_from"})
_MODULE_KEYS = frozenset({"devices", "total"})
_DEVICE_KEYS = frozenset({"id", "name", "ha_device_id", "power", "energy", "capacity"})
_SOURCE_KEYS = frozenset({"power", "energy"})
_CAPACITY_KEYS = frozenset({"nominal_kwh", "usable_kwh"})


def v1_device_id(module: EnergyModule) -> str:
    """Return the id a v1 module receives when converted to a device."""
    return f"{module.value}-1"


def is_statistic_id(value: Any) -> bool:
    """Return whether ``value`` names a sensor entity or an external statistic."""
    return isinstance(value, str) and bool(
        SENSOR_ENTITY_ID_PATTERN.fullmatch(value)
        or EXTERNAL_STATISTIC_PATTERN.fullmatch(value)
    )


@dataclass(frozen=True, slots=True)
class BatteryCapacity:
    """Battery capacity. Nominal and usable capacity are kept apart: a residual
    energy based only on the nominal value is an approximation."""

    nominal_kwh: float | None = None
    usable_kwh: float | None = None

    def as_document(self) -> dict[str, Any]:
        """Return the JSON-compatible representation."""
        return {"nominal_kwh": self.nominal_kwh, "usable_kwh": self.usable_kwh}


@dataclass(frozen=True, slots=True)
class DeviceSources:
    """Power sensors and energy meters of a device or of a module total."""

    power: EnergyModuleConfig | None = None
    energy: Mapping[str, tuple[str, ...]] = field(default_factory=dict)

    def __post_init__(self) -> None:
        object.__setattr__(self, "energy", MappingProxyType(dict(self.energy)))

    @property
    def references(self) -> tuple[tuple[str, str], ...]:
        """Return (location, entity or statistic id) for every bound source."""
        power = (
            tuple((f"power.{role}", entity_id) for role, entity_id in self.power.sensors.items())
            if self.power
            else ()
        )
        energy = tuple(
            (f"energy.{role}", statistic_id)
            for role, parts in self.energy.items()
            for statistic_id in parts
        )
        return power + energy

    def as_document(self) -> dict[str, Any]:
        """Return the JSON-compatible representation, omitting absent sources."""
        document: dict[str, Any] = {}
        if self.power is not None:
            document["power"] = self.power.as_document()
        if self.energy:
            document["energy"] = {role: list(parts) for role, parts in self.energy.items()}
        return document


@dataclass(frozen=True, slots=True)
class EnergyDevice:
    """One physical device of a module, with a stable id that is never reused."""

    id: str
    sources: DeviceSources
    name: str | None = None
    ha_device_id: str | None = None
    capacity: BatteryCapacity | None = None

    def as_document(self) -> dict[str, Any]:
        """Return the JSON-compatible representation."""
        document: dict[str, Any] = {
            "id": self.id,
            "name": self.name,
            "ha_device_id": self.ha_device_id,
            **self.sources.as_document(),
        }
        if self.capacity is not None:
            document["capacity"] = self.capacity.as_document()
        return document


@dataclass(frozen=True, slots=True)
class ModulePlan:
    """Devices of one module, and optionally a source covering all of them."""

    devices: tuple[EnergyDevice, ...]
    # Takes precedence over the devices when valid; it is never added to them.
    total: DeviceSources | None = None

    def as_document(self) -> dict[str, Any]:
        """Return the JSON-compatible representation."""
        document: dict[str, Any] = {"devices": [device.as_document() for device in self.devices]}
        if self.total is not None:
            document["total"] = self.total.as_document()
        return document


@dataclass(frozen=True, slots=True)
class MigrationRecord:
    """The v1 profile a v2 profile was converted from."""

    version: int
    revision: int
    updated_at: str | None

    def as_document(self) -> dict[str, Any]:
        """Return the JSON-compatible representation."""
        return {"version": self.version, "revision": self.revision, "updated_at": self.updated_at}


@dataclass(frozen=True, slots=True)
class EnergyProfileV2:
    """Validated Energy Profile v2 containing only configured modules."""

    plant: Mapping[EnergyModule, ModulePlan] = field(default_factory=dict)
    revision: int = 0
    updated_at: str | None = None
    tariff: EnergyTariff | None = None
    migrated_from: MigrationRecord | None = None

    def __post_init__(self) -> None:
        ordered = {module: self.plant[module] for module in EnergyModule if module in self.plant}
        object.__setattr__(self, "plant", MappingProxyType(ordered))

    @property
    def devices(self) -> tuple[EnergyDevice, ...]:
        """Return every device in canonical module order."""
        return tuple(device for plan in self.plant.values() for device in plan.devices)

    def as_document(self) -> dict[str, Any]:
        """Return the versioned Store document."""
        return {
            "schema": DOCUMENT_SCHEMA,
            "version": DOCUMENT_VERSION_V2,
            "revision": self.revision,
            "updated_at": self.updated_at,
            "migrated_from": self.migrated_from.as_document() if self.migrated_from else None,
            "plant": {module.value: plan.as_document() for module, plan in self.plant.items()},
            "tariff": self.tariff.as_document() if self.tariff else None,
        }


# --- Parsing -------------------------------------------------------------------


def _reject_unknown(raw: Mapping[str, Any], allowed: frozenset[str], where: str) -> None:
    unknown = set(raw) - allowed
    if unknown:
        raise EnergyValidationError(
            f"{where} has unknown keys: {', '.join(sorted(map(str, unknown)))}"
        )


def _parse_energy(module: EnergyModule, raw: Any, where: str) -> dict[str, tuple[str, ...]]:
    if not isinstance(raw, Mapping) or not raw:
        raise EnergyValidationError(f"{where}.energy must map roles to meters")
    energy: dict[str, tuple[str, ...]] = {}
    for role, parts in raw.items():
        if role not in ENERGY_ROLES[module]:
            raise EnergyValidationError(f"Unknown energy role for {module.value}: {role}")
        if not isinstance(parts, list) or not 1 <= len(parts) <= MAX_METER_PARTS:
            raise EnergyValidationError(
                f"{where}.energy.{role} must list 1 to {MAX_METER_PARTS} meters"
            )
        for part in parts:
            if not is_statistic_id(part):
                raise EnergyValidationError(
                    f"{where}.energy.{role} must reference a sensor or an external statistic"
                )
        if len(set(parts)) != len(parts):
            raise EnergyValidationError(f"{where}.energy.{role} lists a meter twice")
        energy[role] = tuple(parts)
    return energy


def _parse_sources(module: EnergyModule, raw: Mapping[str, Any], where: str) -> DeviceSources:
    power = None
    if raw.get("power") is not None:
        # Same rules as a v1 module: roles, sensor ids, signed wiring, convention.
        power = _parse_module(module, raw["power"])
    energy = _parse_energy(module, raw["energy"], where) if raw.get("energy") is not None else {}
    if power is None and not energy:
        raise EnergyValidationError(f"{where} needs a power sensor or an energy meter")
    return DeviceSources(power=power, energy=energy)


def _parse_name(raw: Any, where: str) -> str | None:
    if raw is None:
        return None
    if not isinstance(raw, str) or not raw.strip() or len(raw.strip()) > MAX_NAME_LENGTH:
        raise EnergyValidationError(f"{where}.name must be 1 to {MAX_NAME_LENGTH} characters")
    return raw.strip()


def _parse_kwh(raw: Any, where: str) -> float | None:
    if raw is None:
        return None
    if (
        isinstance(raw, bool)
        or not isinstance(raw, (int, float))
        or not math.isfinite(raw)
        or not 0 < raw <= MAX_CAPACITY_KWH
    ):
        raise EnergyValidationError(f"{where} must be above 0 and at most {MAX_CAPACITY_KWH:g} kWh")
    return float(raw)


def _parse_capacity(module: EnergyModule, raw: Any, where: str) -> BatteryCapacity | None:
    if raw is None:
        return None
    if module is not EnergyModule.BATTERY:
        raise EnergyValidationError(f"{where}: only batteries declare a capacity")
    if not isinstance(raw, Mapping):
        raise EnergyValidationError(f"{where}.capacity must be an object")
    _reject_unknown(raw, _CAPACITY_KEYS, f"{where}.capacity")
    nominal = _parse_kwh(raw.get("nominal_kwh"), f"{where}.capacity.nominal_kwh")
    usable = _parse_kwh(raw.get("usable_kwh"), f"{where}.capacity.usable_kwh")
    if nominal is None and usable is None:
        raise EnergyValidationError(f"{where}.capacity needs a nominal or usable value")
    if nominal is not None and usable is not None and usable > nominal:
        raise EnergyValidationError(f"{where}.capacity: usable cannot exceed nominal")
    return BatteryCapacity(nominal_kwh=nominal, usable_kwh=usable)


def _parse_device(module: EnergyModule, raw: Any, index: int) -> EnergyDevice:
    where = f"{module.value}.devices[{index}]"
    if not isinstance(raw, Mapping):
        raise EnergyValidationError(f"{where} must be an object")
    _reject_unknown(raw, _DEVICE_KEYS, where)
    device_id = raw.get("id")
    if not isinstance(device_id, str) or not DEVICE_ID_PATTERN.fullmatch(device_id):
        raise EnergyValidationError(
            f"{where}.id must start with a letter and use lowercase letters, digits, - or _"
        )
    ha_device_id = raw.get("ha_device_id")
    if ha_device_id is not None and (
        not isinstance(ha_device_id, str) or not HA_DEVICE_ID_PATTERN.fullmatch(ha_device_id)
    ):
        raise EnergyValidationError(f"{where}.ha_device_id is not a Home Assistant device id")
    return EnergyDevice(
        id=device_id,
        sources=_parse_sources(module, raw, where),
        name=_parse_name(raw.get("name"), where),
        ha_device_id=ha_device_id,
        capacity=_parse_capacity(module, raw.get("capacity"), where),
    )


def _parse_plan(module: EnergyModule, raw: Any) -> ModulePlan:
    if not isinstance(raw, Mapping):
        raise EnergyValidationError(f"Module {module.value} must be an object")
    _reject_unknown(raw, _MODULE_KEYS, f"Module {module.value}")
    raw_devices = raw.get("devices")
    if not isinstance(raw_devices, list) or not 1 <= len(raw_devices) <= MAX_DEVICES_PER_MODULE:
        raise EnergyValidationError(
            f"Module {module.value} needs 1 to {MAX_DEVICES_PER_MODULE} devices; omit absent modules"
        )
    devices = tuple(_parse_device(module, item, index) for index, item in enumerate(raw_devices))
    total = None
    if raw.get("total") is not None:
        raw_total = raw["total"]
        where = f"{module.value}.total"
        if not isinstance(raw_total, Mapping):
            raise EnergyValidationError(f"{where} must be an object")
        _reject_unknown(raw_total, _SOURCE_KEYS, where)
        if len(devices) < 2:
            # With a single device the total would only duplicate it.
            raise EnergyValidationError(f"{where} needs at least two devices to cover")
        total = _parse_sources(module, raw_total, where)
    return ModulePlan(devices=devices, total=total)


def _check_unique(plant: Mapping[EnergyModule, ModulePlan]) -> None:
    """Every device id and every sensor or statistic is used exactly once."""
    device_ids: set[str] = set()
    used: dict[str, str] = {}
    for module, plan in plant.items():
        holders: list[tuple[str, DeviceSources]] = [
            (f"{module.value}.{device.id}", device.sources) for device in plan.devices
        ]
        if plan.total is not None:
            holders.append((f"{module.value}.total", plan.total))
        for device in plan.devices:
            if device.id in device_ids:
                raise EnergyValidationError(f"Device id {device.id} is used twice")
            device_ids.add(device.id)
        for holder, sources in holders:
            for location, reference in sources.references:
                where = f"{holder}.{location}"
                if reference in used:
                    raise EnergyValidationError(
                        f"{reference} is used by both {used[reference]} and {where}"
                    )
                used[reference] = where


def parse_profile_v2(document: Any) -> EnergyProfileV2:
    """Strictly validate a user-supplied v2 profile (``plant`` and ``tariff``)."""
    if not isinstance(document, Mapping):
        raise EnergyValidationError("The energy profile must be an object")
    if "modules" in document:
        raise EnergyValidationError("A v2 profile describes modules under 'plant', not 'modules'")
    _reject_unknown(document, _PROFILE_KEYS | _SERVER_KEYS, "The energy profile")
    raw_plant = document.get("plant", {})
    if not isinstance(raw_plant, Mapping):
        raise EnergyValidationError("'plant' must be an object")
    plant: dict[EnergyModule, ModulePlan] = {}
    for raw_name, raw_plan in raw_plant.items():
        try:
            module = EnergyModule(raw_name)
        except ValueError as err:
            raise EnergyValidationError(f"Unknown energy module: {raw_name}") from err
        plant[module] = _parse_plan(module, raw_plan)
    _check_unique(plant)
    return EnergyProfileV2(plant=plant, tariff=parse_tariff(document.get("tariff")))


def _parse_migration(raw: Any) -> MigrationRecord | None:
    if raw is None:
        return None
    if (
        not isinstance(raw, Mapping)
        or set(raw) != {"version", "revision", "updated_at"}
        or raw["version"] != DOCUMENT_VERSION
        or not isinstance(raw["revision"], int)
        or isinstance(raw["revision"], bool)
        or raw["revision"] < 0
        or (raw["updated_at"] is not None and not isinstance(raw["updated_at"], str))
    ):
        raise EnergyValidationError("Stored energy profile has an invalid migration record")
    return MigrationRecord(version=raw["version"], revision=raw["revision"], updated_at=raw["updated_at"])


def parse_stored_profile_v2(document: Any) -> EnergyProfileV2:
    """Validate a persisted v2 document, including server-owned metadata."""
    if not isinstance(document, Mapping):
        raise EnergyValidationError("Stored energy profile is not an object")
    if document.get("schema") != DOCUMENT_SCHEMA:
        raise EnergyValidationError("Stored energy profile has an unknown schema")
    if document.get("version") != DOCUMENT_VERSION_V2:
        raise EnergyValidationError("Stored energy profile is not a v2 document")
    revision = document.get("revision")
    if not isinstance(revision, int) or isinstance(revision, bool) or revision < 0:
        raise EnergyValidationError("Stored energy profile has an invalid revision")
    updated_at = document.get("updated_at")
    if updated_at is not None and not isinstance(updated_at, str):
        raise EnergyValidationError("Stored energy profile has an invalid timestamp")
    profile = parse_profile_v2(document)
    return EnergyProfileV2(
        plant=profile.plant,
        revision=revision,
        updated_at=updated_at,
        tariff=profile.tariff,
        migrated_from=_parse_migration(document.get("migrated_from")),
    )


# --- Conversion ----------------------------------------------------------------


def upgrade_v1(profile: EnergyProfile) -> EnergyProfileV2:
    """Convert a v1 profile in memory, losslessly and deterministically.

    Each v1 module becomes one device with the id ``<module>-1`` and the same
    sensors and sign convention; revision, timestamp and tariff carry over.
    """
    return EnergyProfileV2(
        plant={
            module: ModulePlan(
                devices=(EnergyDevice(id=v1_device_id(module), sources=DeviceSources(power=config)),)
            )
            for module, config in profile.modules.items()
        },
        revision=profile.revision,
        updated_at=profile.updated_at,
        tariff=profile.tariff,
        migrated_from=MigrationRecord(
            version=DOCUMENT_VERSION, revision=profile.revision, updated_at=profile.updated_at
        ),
    )


def load_profile_document(document: Any) -> EnergyProfileV2:
    """Return a v2 profile from a stored v1 or v2 document; v1 is upgraded."""
    if isinstance(document, Mapping) and document.get("version") == DOCUMENT_VERSION_V2:
        return parse_stored_profile_v2(document)
    return upgrade_v1(parse_stored_profile(document))


def lossless_v1(profile: EnergyProfileV2) -> EnergyProfile | None:
    """Return the v1 view of a profile, or None when v1 cannot hold all of it."""
    modules: dict[EnergyModule, EnergyModuleConfig] = {}
    for module, plan in profile.plant.items():
        if plan.total is not None or len(plan.devices) != 1:
            return None
        device = plan.devices[0]
        if (
            device.id != v1_device_id(module)
            or device.name is not None
            or device.ha_device_id is not None
            or device.capacity is not None
            or device.sources.energy
            or device.sources.power is None
        ):
            return None
        modules[module] = device.sources.power
    return EnergyProfile(
        revision=profile.revision,
        modules=modules,
        updated_at=profile.updated_at,
        tariff=profile.tariff,
    )


def v1_save_allowed(current: EnergyProfileV2) -> bool:
    """Return whether a v1 client may overwrite ``current`` without losing data."""
    return lossless_v1(current) is not None
