"""Discovery v2: group discovered sensors and meters into Energy Profile v2 devices.

This module is pure. ``discovery.EnergyDiscoveryService`` ranks every power
sensor and energy meter with its usual evidence and confidence; here those
bindings become device proposals (``plant → modules → devices[]``):

- bindings of one module are grouped by Home Assistant device, and by Energy
  dashboard source (one solar or battery entry is one physical source); a
  device exposing several modules (a hybrid inverter) gives one proposal per
  module, because its sensors do not all belong to the same flow;
- one sensor per power role and per device: several candidates are reported,
  never picked by name;
- meters listed together in a role are parts of a sum only when the Energy
  dashboard sums them or they are all tariff bands; a band set next to a plain
  meter, or two plain meters, could overlap and need a choice;
- a module total is ``verified`` only when Home Assistant itself sums the
  devices (a ``group`` helper of type ``sum``); a sensor that only looks like a
  total (no device, words like "total" or "plant", a group of unknown type) is
  ``presumed`` and never used; a sensor without a device next to device sensors
  is ``membership_undetermined``;
- an existing profile is never changed: its devices are matched and reported
  as ``configured`` or ``update`` (additions and corrections to confirm), and
  only new, unambiguous devices of ``medium`` confidence or more enter the
  suggested plant, with ids that were never used.

High confidence is a suggestion, never an authorized configuration.
"""

from __future__ import annotations

import copy
from collections import defaultdict
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field, replace
from typing import Any

from .adapter import DIRECTIONAL_PAIRS
from .meters import MeterReport, MeterStatus
from .models import MODULE_SPECS, EnergyModule, EnergyValidationError, SignConvention
from .profile_v2 import (
    MAX_DEVICES_PER_MODULE,
    MAX_NAME_LENGTH,
    EnergyDevice,
    EnergyProfileV2,
    parse_profile_v2,
)

CONFIDENCE_ORDER: Mapping[str, int] = {"high": 3, "medium": 2, "low": 1}
SUGGESTED_CONFIDENCE = 2
MAX_LOW_CONFIDENCE = 100
# Evidence that never makes a device worth proposing on its own (phones, diagnostics).
LIMITING_EVIDENCE = frozenset({"mobile_device", "diagnostic_entity"})

# Tariff bands (F1/F2/F3, DSMR tariff 1/2, peak/off-peak) and meters that reset
# every period ("energy today"): both read as hints, never as proof.
BAND_TOKENS = frozenset(
    {"f1", "f2", "f3", "t1", "t2", "t3", "fascia", "tariff", "tarif", "tariffa", "tarifa", "peak", "offpeak"}
)
PERIODIC_TOKENS = frozenset(
    {"today", "daily", "day", "yesterday", "week", "weekly", "month", "monthly", "year", "yearly",
     "oggi", "giornaliera", "giornaliero", "ieri", "settimana", "mese", "anno"}
)
# Words of a sensor or device that covers several others.
AGGREGATE_TOKENS = frozenset(
    {"total", "totale", "sum", "somma", "combined", "aggregate", "plant", "impianto",
     "site", "gesamt", "overall"}
)


@dataclass(frozen=True, slots=True)
class Binding:
    """One sensor or meter discovery proposes for a module role."""

    kind: str  # "power" (instantaneous, incl. state of charge) or "energy" (meter)
    module: EnergyModule
    role: str
    id: str  # entity id, or statistic id for a meter
    confidence: str
    evidence: tuple[str, ...]
    ha_device_id: str | None = None
    # Energy dashboard source entry this sensor belongs to.
    group: str | None = None
    tokens: frozenset[str] = frozenset()
    sign_convention: SignConvention | None = None
    dashboard: bool = False
    integration: str | None = None

    @property
    def rank(self) -> int:
        """Return the confidence rank."""
        return CONFIDENCE_ORDER[self.confidence]

    @property
    def signed(self) -> bool:
        """Return whether the role needs a sign convention."""
        return self.kind == "power" and MODULE_SPECS[self.module].roles[self.role].signed

    @property
    def band(self) -> bool:
        """Return whether the meter looks like one tariff band."""
        return bool(self.tokens & BAND_TOKENS)

    @property
    def periodic(self) -> bool:
        """Return whether the meter looks like one that restarts every period."""
        return bool(self.tokens & PERIODIC_TOKENS)


@dataclass(frozen=True, slots=True)
class HaDevice:
    """What the device registry says about one Home Assistant device."""

    name: str | None
    tokens: frozenset[str] = frozenset()


@dataclass(frozen=True, slots=True)
class GroupSum:
    """A sensor that Home Assistant computes from other sensors."""

    members: frozenset[str]
    # A ``group`` helper declared as a sum; otherwise the aggregation is unknown.
    verified: bool


@dataclass(slots=True)
class _Component:
    module: EnergyModule
    keys: set[str]
    bindings: list[Binding] = field(default_factory=list)

    @property
    def key(self) -> str:
        order = {"dev": 0, "grp": 1, "ent": 2}
        return f"{self.module.value}:" + min(self.keys, key=lambda k: (order[k[:3]], k))

    @property
    def ha_device_ids(self) -> list[str]:
        return sorted({b.ha_device_id for b in self.bindings if b.ha_device_id})

    @property
    def has_power(self) -> bool:
        return any(b.kind == "power" for b in self.bindings)

    @property
    def ids(self) -> set[str]:
        return {b.id for b in self.bindings}

    def tokens(self, devices: Mapping[str, HaDevice]) -> frozenset[str]:
        if self.ha_device_ids:
            return frozenset().union(*(devices.get(d, HaDevice(None)).tokens for d in self.ha_device_ids))
        return frozenset().union(*(b.tokens for b in self.bindings))


def _ambiguity(
    module: EnergyModule | None, role: str | None, ids: Iterable[str], reason: str, **extra: Any
) -> dict[str, Any]:
    return {
        "module": module.value if module else None,
        "role": role,
        "entity_ids": sorted(set(ids)),
        "reason": reason,
        **extra,
    }


def _components(module: EnergyModule, bindings: list[Binding]) -> list[_Component]:
    """Union bindings sharing a Home Assistant device or a dashboard source."""
    parent: dict[str, str] = {}

    def find(key: str) -> str:
        while parent.setdefault(key, key) != key:
            parent[key] = parent[parent[key]]
            key = parent[key]
        return key

    keys_of: list[list[str]] = []
    for binding in bindings:
        keys = []
        if binding.ha_device_id:
            keys.append(f"dev:{binding.ha_device_id}")
        if binding.group:
            keys.append(f"grp:{binding.group}")
        keys = keys or [f"ent:{binding.id}"]
        for key in keys[1:]:
            parent[find(key)] = find(keys[0])
        keys_of.append(keys)
    components: dict[str, _Component] = {}
    for binding, keys in zip(bindings, keys_of, strict=True):
        component = components.setdefault(find(keys[0]), _Component(module, set()))
        component.keys.update(keys)
        component.bindings.append(binding)
    return sorted(components.values(), key=lambda c: c.key)


def _classify(
    module: EnergyModule,
    components: list[_Component],
    devices: Mapping[str, HaDevice],
    group_sums: Mapping[str, GroupSum],
) -> tuple[list[_Component], list[dict[str, Any]], list[dict[str, Any]]]:
    """Split components into devices, totals and undetermined sensors."""
    totals: list[dict[str, Any]] = []
    ambiguous: list[dict[str, Any]] = []
    owner = {b.id: c for c in components for b in c.bindings}
    remaining: list[_Component] = []

    # 1. Sums Home Assistant computes from the other sensors of the module.
    for component in components:
        sums = [(b, group_sums[b.id]) for b in component.bindings if b.id in group_sums]
        covered = {
            owner[member].key
            for _, total in sums
            for member in total.members
            if member in owner and owner[member] is not component
        }
        if not sums or len(covered) < 2:
            remaining.append(component)
            continue
        for binding, total in sums:
            peers = {
                c.key
                for c in components
                if c is not component
                and any(b.kind == binding.kind and b.role == binding.role for b in c.bindings)
            }
            verified = total.verified and covered == peers and total.members <= set(owner)
            totals.append({
                "module": module.value,
                "kind": binding.kind,
                "role": binding.role,
                "ids": [binding.id],
                "status": "verified" if verified else "presumed",
                "covers": sorted(covered),
                "evidence": ["group_sum"] if total.verified else ["group_of_unknown_type"],
            })
            if not verified:
                ambiguous.append(_ambiguity(
                    module, binding.role, [binding.id],
                    "partial_aggregate" if total.verified else "presumed_total",
                ))
    components = remaining

    # 2. One device in the module: its meters without a device are its meters.
    powered = [c for c in components if c.has_power]
    loose = [c for c in components if not c.has_power and not c.ha_device_ids]
    if len(powered) == 1:
        target = powered[0]
        for component in loose:
            taken = {(b.kind, b.role) for b in target.bindings}
            if any((b.kind, b.role) in taken for b in component.bindings):
                # The device already has that meter: this one stays undetermined.
                continue
            target.bindings.extend(
                replace(b, evidence=(*b.evidence, "single_device_module")) for b in component.bindings
            )
            target.keys.update(component.keys)
            components = [c for c in components if c is not component]

    # 3. Something that only looks like the total of the others.
    result: list[_Component] = []
    for component in components:
        others = [c for c in components if c is not component]
        if len(others) >= 2 and component.tokens(devices) & AGGREGATE_TOKENS:
            for binding in component.bindings:
                totals.append({
                    "module": module.value, "kind": binding.kind, "role": binding.role,
                    "ids": [binding.id], "status": "presumed",
                    "covers": sorted(c.key for c in others), "evidence": ["aggregate_keyword"],
                })
            ambiguous.append(_ambiguity(module, None, component.ids, "presumed_total"))
            continue
        result.append(component)

    # 4. Without a device next to devices, it could be one of them or their total.
    if any(c.ha_device_ids for c in result):
        undetermined = [c for c in result if not c.ha_device_ids and not any(b.group for b in c.bindings)]
        for component in undetermined:
            ambiguous.append(_ambiguity(module, None, component.ids, "membership_undetermined"))
        result = [c for c in result if c not in undetermined]
    return result, totals, ambiguous


def _resolve_power(
    module: EnergyModule, bindings: list[Binding]
) -> tuple[dict[str, Binding], list[dict[str, Any]], list[dict[str, Any]]]:
    """One sensor per role; ties are reported, never broken by name."""
    picked: dict[str, Binding] = {}
    ambiguous: list[dict[str, Any]] = []
    warnings: list[dict[str, Any]] = []
    by_role: dict[str, list[Binding]] = defaultdict(list)
    for binding in bindings:
        if binding.kind == "power":
            by_role[binding.role].append(binding)
    for role, items in by_role.items():
        top = max(b.rank for b in items)
        best = {b.id: b for b in items if b.rank == top}
        if len(best) > 1:
            ambiguous.append(_ambiguity(module, role, best, "multiple_candidates"))
            continue
        picked[role] = next(iter(best.values()))
        others = sorted({b.id for b in items} - set(best))
        if others:
            warnings.append({"code": "alternative_sensors", "role": role, "ids": others})
    pair = DIRECTIONAL_PAIRS.get(module)
    if pair and "net_power" in picked and any(role in picked for role in pair):
        net = picked["net_power"].rank
        split = max(picked[role].rank for role in pair if role in picked)
        conflict = [picked[r].id for r in ("net_power", *pair) if r in picked]
        if net > split:
            for role in pair:
                picked.pop(role, None)
        elif split > net:
            picked.pop("net_power")
        else:
            for role in ("net_power", *pair):
                picked.pop(role, None)
            ambiguous.append(_ambiguity(module, "net_power", conflict, "net_and_directional_conflict"))
    return picked, ambiguous, warnings


def _resolve_energy(
    module: EnergyModule, bindings: list[Binding]
) -> tuple[dict[str, list[Binding]], list[dict[str, Any]], list[dict[str, Any]]]:
    """Meters of one role: a single meter, or parts only with adequate evidence."""
    picked: dict[str, list[Binding]] = {}
    ambiguous: list[dict[str, Any]] = []
    warnings: list[dict[str, Any]] = []
    by_role: dict[str, dict[str, Binding]] = defaultdict(dict)
    for binding in bindings:
        if binding.kind == "energy":
            known = by_role[binding.role].get(binding.id)
            if known is None or binding.rank > known.rank:
                by_role[binding.role][binding.id] = binding
    for role, found in by_role.items():
        items = list(found.values())
        dashboard = [b for b in items if b.dashboard]
        if dashboard:
            # Home Assistant already sums these; anything else would double count.
            if len(dashboard) > 1:
                warnings.append({"code": "parts_summed_by_energy_dashboard", "role": role,
                                 "ids": [b.id for b in dashboard]})
            if others := sorted(b.id for b in items if not b.dashboard):
                warnings.append({"code": "possible_overlap", "role": role, "ids": others})
            picked[role] = dashboard
            continue
        lifetime = [b for b in items if not b.periodic]
        if lifetime and len(lifetime) < len(items):
            warnings.append({"code": "alternative_meters", "role": role,
                             "ids": sorted(b.id for b in items if b.periodic)})
            items = lifetime
        if len(items) == 1:
            picked[role] = items
            continue
        bands = sorted((b for b in items if b.band), key=lambda b: b.id)
        plain = sorted((b for b in items if not b.band), key=lambda b: b.id)
        if not plain:
            warnings.append({"code": "parts_disjointness_unconfirmed", "role": role,
                             "ids": [b.id for b in bands]})
            picked[role] = bands
        elif len(plain) == 1 and bands:
            ambiguous.append(_ambiguity(
                module, role, [b.id for b in items], "total_or_bands",
                alternatives=[[plain[0].id], [b.id for b in bands]],
            ))
        else:
            ambiguous.append(_ambiguity(module, role, [b.id for b in items], "multiple_candidates"))
    return picked, ambiguous, warnings


@dataclass(slots=True)
class _Proposal:
    component: _Component
    power: dict[str, Binding]
    energy: dict[str, list[Binding]]
    warnings: list[dict[str, Any]]
    name: str | None
    status: str = "new"
    device_id: str | None = None
    additions: list[dict[str, Any]] = field(default_factory=list)
    corrections: list[dict[str, Any]] = field(default_factory=list)
    eligible_power: dict[str, Binding] = field(default_factory=dict)
    eligible_energy: dict[str, list[Binding]] = field(default_factory=dict)

    @property
    def module(self) -> EnergyModule:
        return self.component.module

    @property
    def confidence(self) -> str:
        top = max(b.rank for b in self.component.bindings)
        return next(name for name, rank in CONFIDENCE_ORDER.items() if rank == top)

    def document(self, device_id: str) -> dict[str, Any]:
        """The Energy Profile v2 device, with eligible bindings only."""
        document: dict[str, Any] = {"id": device_id, "name": self.name}
        ha_ids = self.component.ha_device_ids
        document["ha_device_id"] = ha_ids[0] if len(ha_ids) == 1 else None
        if self.eligible_power:
            power: dict[str, Any] = {"sensors": {r: b.id for r, b in self.eligible_power.items()}}
            if (net := self.eligible_power.get("net_power")) is not None:
                power["sign_convention"] = net.sign_convention.value  # type: ignore[union-attr]
            document["power"] = power
        if self.eligible_energy:
            document["energy"] = {r: [b.id for b in parts] for r, parts in self.eligible_energy.items()}
        return document

    def as_dict(self, report: MeterReport) -> dict[str, Any]:
        ha_ids = self.component.ha_device_ids
        integrations = sorted({b.integration for b in self.component.bindings if b.integration})
        return {
            "key": self.component.key,
            "module": self.module.value,
            "status": self.status,
            "device_id": self.device_id,
            "ha_device_id": ha_ids[0] if len(ha_ids) == 1 else None,
            "name": self.name,
            "integration": integrations[0] if len(integrations) == 1 else None,
            "confidence": self.confidence,
            "eligible": bool(self.eligible_power or self.eligible_energy) and self.status == "new",
            "power": [
                {
                    "role": role,
                    "entity_id": b.id,
                    "confidence": b.confidence,
                    "evidence": sorted(set(b.evidence)),
                    "sign_convention": b.sign_convention.value if b.sign_convention else None,
                    "requires": ["sign_convention"] if b.signed and b.sign_convention is None else [],
                }
                for role, b in sorted(self.power.items())
            ],
            "energy": [
                {
                    "role": role,
                    "statistic_ids": [b.id for b in parts],
                    "confidence": min((b.confidence for b in parts), key=CONFIDENCE_ORDER.__getitem__),
                    "evidence": sorted({e for b in parts for e in b.evidence}),
                    "statuses": sorted({report.meters[b.id].status.value for b in parts if b.id in report.meters}),
                }
                for role, parts in sorted(self.energy.items())
            ],
            "additions": self.additions,
            "corrections": self.corrections,
            "warnings": self.warnings,
        }


def _proposal(
    component: _Component, devices: Mapping[str, HaDevice], report: MeterReport
) -> tuple[_Proposal, list[dict[str, Any]]]:
    module = component.module
    power, ambiguous, warnings = _resolve_power(module, component.bindings)
    energy, energy_ambiguous, energy_warnings = _resolve_energy(module, component.bindings)
    ambiguous += energy_ambiguous
    warnings += energy_warnings
    ha_ids = component.ha_device_ids
    if len(ha_ids) > 1:
        warnings.append({"code": "several_ha_devices", "ids": ha_ids})
    name = devices[ha_ids[0]].name if len(ha_ids) == 1 and ha_ids[0] in devices else None
    if name is not None and len(name.strip()) > MAX_NAME_LENGTH:
        warnings.append({"code": "name_too_long"})
        name = None
    proposal = _Proposal(component, power, energy, warnings, name.strip() if name else None)

    for role, binding in power.items():
        if binding.signed and binding.sign_convention is None:
            warnings.append({"code": "requires_sign_convention", "role": role, "ids": [binding.id]})
        elif binding.rank >= SUGGESTED_CONFIDENCE:
            proposal.eligible_power[role] = binding
    for role, parts in energy.items():
        statuses = {b.id: report.meters.get(b.id) for b in parts}
        wrong = sorted(i for i, info in statuses.items() if info and info.status is MeterStatus.INCOMPATIBLE)
        unknown = sorted(i for i, info in statuses.items() if info is None or info.status is MeterStatus.UNKNOWN)
        provisional = sorted(
            i for i, info in statuses.items()
            if info and info.status in (MeterStatus.RECORDER_UNAVAILABLE, MeterStatus.PENDING)
        )
        if wrong:
            warnings.append({"code": "meter_incompatible", "role": role, "ids": wrong})
        if unknown:
            warnings.append({"code": "meter_unknown", "role": role, "ids": unknown})
        if provisional:
            warnings.append({"code": "meter_not_verified_yet", "role": role, "ids": provisional})
        if not wrong and not unknown and min(b.rank for b in parts) >= SUGGESTED_CONFIDENCE:
            proposal.eligible_energy[role] = parts
    if proposal.eligible_power or proposal.eligible_energy:
        try:
            parse_profile_v2({"plant": {module.value: {"devices": [proposal.document("probe")]}}})
        except EnergyValidationError as err:
            ambiguous.append(_ambiguity(module, None, component.ids, "invalid_combination", detail=str(err)))
            proposal.eligible_power.clear()
            proposal.eligible_energy.clear()
    return proposal, ambiguous


def _references(device: EnergyDevice) -> set[str]:
    return {reference for _, reference in device.sources.references}


def _match_configured(
    proposal: _Proposal, current: EnergyProfileV2, used: Mapping[str, str]
) -> list[dict[str, Any]]:
    """Compare with the configured devices; never change them."""
    module = proposal.module
    plan = current.plant.get(module)
    ambiguous: list[dict[str, Any]] = []
    ha_ids = set(proposal.component.ha_device_ids)
    ids = proposal.component.ids
    matches = [
        device
        for device in (plan.devices if plan else ())
        if (device.ha_device_id and device.ha_device_id in ha_ids) or _references(device) & ids
    ]
    if len(matches) > 1:
        proposal.status = "conflict"
        ambiguous.append(_ambiguity(module, None, ids, "matches_several_configured_devices",
                                    device_ids=[d.id for d in matches]))
        return ambiguous
    owner = matches[0].id if matches else None

    # A sensor already used elsewhere in the profile is not proposed again.
    def keep(binding: Binding) -> bool:
        holder = used.get(binding.id)
        if holder is not None and holder != f"{module.value}.{owner}":
            proposal.warnings.append({"code": "used_by_configured", "ids": [binding.id], "by": holder})
            return False
        return True

    proposal.power = {r: b for r, b in proposal.power.items() if keep(b)}
    proposal.energy = {r: kept for r, parts in proposal.energy.items() if (kept := [b for b in parts if keep(b)])}
    proposal.eligible_power = {r: b for r, b in proposal.eligible_power.items() if r in proposal.power and proposal.power[r] is b}
    proposal.eligible_energy = {r: proposal.energy[r] for r in proposal.eligible_energy if r in proposal.energy}
    if not matches:
        return ambiguous

    device = matches[0]
    proposal.device_id = device.id
    sensors = dict(device.sources.power.sensors) if device.sources.power else {}
    for role, binding in proposal.power.items():
        if sensors.get(role) == binding.id:
            continue
        if role not in sensors:
            proposal.additions.append({"kind": "power", "role": role, "ids": [binding.id]})
        else:
            proposal.corrections.append({"kind": "power", "role": role, "configured": [sensors[role]], "proposed": [binding.id]})
    configured_convention = device.sources.power.sign_convention if device.sources.power else None
    net = proposal.power.get("net_power")
    if net and sensors.get("net_power") == net.id and net.sign_convention and configured_convention and net.sign_convention != configured_convention:
        proposal.corrections.append({"kind": "sign_convention", "role": "net_power",
                                     "configured": [configured_convention.value], "proposed": [net.sign_convention.value]})
    for role, parts in proposal.energy.items():
        proposed = [b.id for b in parts]
        configured = list(device.sources.energy.get(role, ()))
        if set(proposed) <= set(configured):
            continue
        if not configured or set(configured) < set(proposed):
            proposal.additions.append({"kind": "energy", "role": role, "ids": sorted(set(proposed) - set(configured))})
        else:
            proposal.corrections.append({"kind": "energy", "role": role, "configured": configured, "proposed": proposed})
    proposal.status = "update" if proposal.additions or proposal.corrections else "configured"
    return ambiguous


def _used_references(current: EnergyProfileV2) -> dict[str, str]:
    used: dict[str, str] = {}
    for module, plan in current.plant.items():
        for device in plan.devices:
            for reference in _references(device):
                used[reference] = f"{module.value}.{device.id}"
        if plan.total is not None:
            for _, reference in plan.total.references:
                used[reference] = f"{module.value}.total"
    return used


def _next_ids(current: EnergyProfileV2) -> Any:
    taken = set(current.device_ids) | set(current.retired_device_ids)

    def next_id(module: EnergyModule) -> str:
        index = 1
        while f"{module.value}-{index}" in taken:
            index += 1
        taken.add(f"{module.value}-{index}")
        return f"{module.value}-{index}"

    return next_id


def build_plant_proposals(
    bindings: Iterable[Binding],
    *,
    devices: Mapping[str, HaDevice],
    group_sums: Mapping[str, GroupSum],
    current: EnergyProfileV2,
    report: MeterReport,
    ambiguous: Iterable[dict[str, Any]] = (),
) -> dict[str, Any]:
    """Return the v2 discovery result; ``current`` is read, never changed."""
    ambiguous = list(ambiguous)
    by_module: dict[EnergyModule, list[Binding]] = defaultdict(list)
    for binding in bindings:
        by_module[binding.module].append(binding)

    proposals: list[_Proposal] = []
    totals: list[dict[str, Any]] = []
    low_confidence: list[dict[str, Any]] = []
    used = _used_references(current)
    for module in EnergyModule:
        if module not in by_module:
            continue
        components, module_totals, module_ambiguous = _classify(
            module, _components(module, by_module[module]), devices, group_sums
        )
        totals += module_totals
        ambiguous += module_ambiguous
        for component in components:
            # A device found only by words is still shown as a device (never
            # suggested); loose words without a device stay a short list.
            if max(b.rank for b in component.bindings) < SUGGESTED_CONFIDENCE and (
                not component.ha_device_ids
                or all(LIMITING_EVIDENCE & set(b.evidence) for b in component.bindings)
            ):
                low_confidence += [
                    {"kind": b.kind, "module": module.value, "role": b.role, "id": b.id}
                    for b in component.bindings
                ]
                continue
            proposal, found = _proposal(component, devices, report)
            ambiguous += found
            ambiguous += _match_configured(proposal, current, used)
            proposals.append(proposal)

    # A readable, stable order (and so the ids of new devices): by name, then key.
    modules = list(EnergyModule)
    proposals.sort(key=lambda p: (modules.index(p.module), (p.name or "").casefold(), p.component.key))
    detected = {(p.module, p.device_id) for p in proposals if p.device_id}
    configured_only = [
        {"key": f"{module.value}:configured:{device.id}", "module": module.value, "status": "configured",
         "device_id": device.id, "name": device.name, "detected": False}
        for module, plan in current.plant.items()
        for device in plan.devices
        if (module, device.id) not in detected
    ]
    for total in totals:
        plan = current.plant.get(EnergyModule(total["module"]))
        if plan and plan.total and set(total["ids"]) <= {r for _, r in plan.total.references}:
            total["status"] = "configured"

    suggested = _suggested_plant(proposals, totals, current, ambiguous)
    return {
        "profile": {
            "configured": not current.is_empty,
            "revision": current.revision,
        },
        "verification": "complete" if report.complete else "incomplete",
        "recorder": "available" if report.recorder_available else "unavailable",
        "devices": [p.as_dict(report) for p in proposals] + configured_only,
        "totals": totals,
        "meters": {key: info.as_dict() for key, info in sorted(report.meters.items())},
        "ambiguous": ambiguous,
        "suggested_plant": suggested,
        "low_confidence": low_confidence[:MAX_LOW_CONFIDENCE],
        "low_confidence_truncated": len(low_confidence) > MAX_LOW_CONFIDENCE,
    }


def _suggested_plant(
    proposals: list[_Proposal],
    totals: list[dict[str, Any]],
    current: EnergyProfileV2,
    ambiguous: list[dict[str, Any]],
) -> dict[str, Any] | None:
    """The current plant, unchanged, plus the new devices that need no choice."""
    base = current.as_document()["plant"]
    plant = copy.deepcopy(base)
    next_id = _next_ids(current)
    added: dict[EnergyModule, list[_Proposal]] = defaultdict(list)
    for proposal in proposals:
        if proposal.status != "new" or not (proposal.eligible_power or proposal.eligible_energy):
            continue
        plan = current.plant.get(proposal.module)
        if plan is not None and plan.total is not None:
            # The configured total may not cover a new device.
            ambiguous.append(_ambiguity(proposal.module, None, proposal.component.ids, "total_coverage_unknown"))
            continue
        added[proposal.module].append(proposal)

    for module, new in added.items():
        devices = plant.setdefault(module.value, {"devices": []})["devices"]
        if len(devices) + len(new) > MAX_DEVICES_PER_MODULE:
            ambiguous.append(_ambiguity(module, None, [i for p in new for i in p.component.ids], "too_many_devices"))
            continue
        documents = []
        for proposal in new:
            proposal.device_id = next_id(module)
            documents.append(proposal.document(proposal.device_id))
        candidate = {**plant[module.value], "devices": [*devices, *documents]}
        if module not in current.plant:
            covered = {p.component.key for p in new}
            verified = [t for t in totals if t["module"] == module.value and t["status"] == "verified" and set(t["covers"]) == covered]
            if verified and len(new) >= 2:
                total: dict[str, Any] = {}
                for item in verified:
                    if item["kind"] == "power":
                        total.setdefault("power", {"sensors": {}})["sensors"][item["role"]] = item["ids"][0]
                    else:
                        total.setdefault("energy", {})[item["role"]] = item["ids"]
                candidate["total"] = total
        try:
            parse_profile_v2({"plant": {module.value: candidate}})
        except EnergyValidationError as err:
            ambiguous.append(_ambiguity(module, None, [i for p in new for i in p.component.ids],
                                        "invalid_combination", detail=str(err)))
            for proposal in new:
                proposal.device_id = None
            if module not in current.plant:
                plant.pop(module.value, None)
            continue
        plant[module.value] = candidate
    if plant == base:
        return None
    try:
        parse_profile_v2({"plant": plant})
    except EnergyValidationError as err:
        ambiguous.append(_ambiguity(None, None, [], "invalid_combination", detail=str(err)))
        return None
    return plant
