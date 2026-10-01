"""Assisted discovery of energy sensors from Home Assistant metadata.

Discovery only proposes bindings; it never saves a profile. Evidence is ranked
by reliability:

1. the Home Assistant Energy dashboard configuration, where the user already
   assigned power sensors and their sign convention (``high``);
2. structural metadata: the sensor lives on the same device as a meter the
   Energy dashboard uses, or a state of charge lives on energy hardware
   (``medium``);
3. words in translation keys and names, which can only rank candidates and
   never raise confidence above ``low`` on their own.

Device class, unit and state class are hard gates: cumulative energy sensors,
non-power units and contradictory metadata are never proposed for power roles.
Only unique ``high``/``medium`` matches enter the suggested profile; ties are
reported as ambiguous and signed sensors without a verified sign convention are
reported as requiring user input.
"""

from __future__ import annotations

import logging
import re
from collections import Counter, defaultdict
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

from homeassistant.core import HomeAssistant, State
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er

from ..core._values import utc_now
from .adapter import DIRECTIONAL_PAIRS
from .models import (
    MODULE_SPECS,
    EnergyModule,
    EnergyValidationError,
    MeasurementKind,
    SignConvention,
    parse_profile,
)
from .normalization import (
    CUMULATIVE_STATE_CLASSES,
    ENERGY_DEVICE_CLASSES,
    ENERGY_UNITS,
    PERCENT_UNIT,
    POWER_UNIT_FACTORS_TO_W,
    normalize_state,
)

_LOGGER = logging.getLogger(__name__)

SENSOR_DOMAIN = "sensor"


class Confidence(StrEnum):
    """How strongly metadata supports a proposed binding."""

    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


CONFIDENCE_RANK = {Confidence.HIGH: 3, Confidence.MEDIUM: 2, Confidence.LOW: 1}

# Evidence codes and their ranking weights.
EVIDENCE_WEIGHTS: Mapping[str, int] = {
    "energy_dashboard": 100,
    "energy_dashboard_device": 40,
    "energy_hardware_device": 20,
    "module_keyword": 15,
    "role_keyword": 15,
    "device_class": 10,
    "measurement_state_class": 5,
    "hidden_entity": -10,
    "diagnostic_entity": -30,
    "mobile_device": -40,
}
STRUCTURAL_EVIDENCE = frozenset(
    {"energy_dashboard_device", "energy_hardware_device"}
)
# Evidence that caps a proposal at low confidence.
LIMITING_EVIDENCE = frozenset({"diagnostic_entity", "mobile_device"})

MODULE_KEYWORDS: Mapping[EnergyModule, frozenset[str]] = {
    EnergyModule.GRID: frozenset(
        {"grid", "rete", "mains", "utility", "netz", "réseau", "reseau", "contatore"}
    ),
    EnergyModule.SOLAR: frozenset(
        {
            "solar",
            "pv",
            "photovoltaic",
            "photovoltaik",
            "fotovoltaico",
            "fotovoltaica",
            "fv",
            "mppt",
            "solaire",
        }
    ),
    EnergyModule.HOME: frozenset(
        {"house", "home", "household", "casa", "abitazione", "haus", "maison", "load"}
    ),
    EnergyModule.BATTERY: frozenset(
        {
            "battery",
            "batteria",
            "batterie",
            "batt",
            "storage",
            "accumulo",
            "akku",
            "speicher",
            "bms",
        }
    ),
    EnergyModule.WALLBOX: frozenset(
        {
            "wallbox",
            "evse",
            "charger",
            "chargepoint",
            "ev",
            "car",
            "vehicle",
            "colonnina",
            "ladestation",
            "borne",
        }
    ),
}
ROLE_KEYWORDS: Mapping[tuple[EnergyModule, str], frozenset[str]] = {
    (EnergyModule.GRID, "import_power"): frozenset(
        {
            "import",
            "imported",
            "importing",
            "consumption",
            "consumo",
            "prelievo",
            "prelevata",
            "prelevato",
            "purchased",
            "bezug",
        }
    ),
    (EnergyModule.GRID, "export_power"): frozenset(
        {
            "export",
            "exported",
            "exporting",
            "immissione",
            "immessa",
            "immesso",
            "feed",
            "feedin",
            "injection",
            "return",
            "returned",
            "sold",
            "einspeisung",
        }
    ),
    (EnergyModule.BATTERY, "charge_power"): frozenset(
        {"charge", "charging", "carica", "ricarica", "laden"}
    ),
    (EnergyModule.BATTERY, "discharge_power"): frozenset(
        {"discharge", "discharging", "scarica", "entladen"}
    ),
}
NET_KEYWORDS = frozenset({"net", "netto", "bidirectional", "balance"})
TOKEN_PATTERN = re.compile(r"[^\W_]+", re.UNICODE)

# Sign conventions that match "positive flows into the home" per module.
INBOUND_CONVENTION = {
    EnergyModule.GRID: SignConvention.POSITIVE_IMPORT,
    EnergyModule.BATTERY: SignConvention.POSITIVE_DISCHARGE,
}
OUTBOUND_CONVENTION = {
    EnergyModule.GRID: SignConvention.POSITIVE_EXPORT,
    EnergyModule.BATTERY: SignConvention.POSITIVE_CHARGE,
}


@dataclass(frozen=True, slots=True)
class EntityFacts:
    """Metadata gathered for one sensor from the state machine and registries."""

    entity_id: str
    kind: MeasurementKind
    name: str | None
    unit: str | None
    device_class: str | None
    state_class: str | None
    device_id: str | None
    device_name: str | None
    manufacturer: str | None
    model: str | None
    platform: str | None
    entity_category: str | None
    hidden: bool
    tokens: frozenset[str]
    state: State | None

    def summary(self) -> dict[str, Any]:
        """Return the candidate description shown to the user."""
        return {
            "entity_id": self.entity_id,
            "name": self.name,
            "kind": self.kind.value,
            "unit": self.unit,
            "device_class": self.device_class,
            "state_class": self.state_class,
            "device": {
                "id": self.device_id,
                "name": self.device_name,
                "manufacturer": self.manufacturer,
                "model": self.model,
            }
            if self.device_id is not None
            else None,
            "preview": normalize_state(
                self.entity_id, self.state, self.kind, signed=True
            ).as_dict(),
        }


@dataclass(frozen=True, slots=True)
class VerifiedBinding:
    """A power sensor the user already assigned in the HA Energy dashboard."""

    module: EnergyModule
    role: str
    entity_id: str
    sign_convention: SignConvention | None = None


@dataclass(slots=True)
class Proposal:
    """One candidate binding for a module role."""

    entity_id: str
    module: EnergyModule
    role: str
    evidence: list[str] = field(default_factory=list)
    sign_convention: SignConvention | None = None
    role_resolved: bool = True

    @property
    def score(self) -> int:
        """Return the ranking score."""
        return sum(EVIDENCE_WEIGHTS[code] for code in self.evidence)

    @property
    def signed(self) -> bool:
        """Return whether the role needs a sign convention."""
        return MODULE_SPECS[self.module].roles[self.role].signed

    @property
    def confidence(self) -> Confidence:
        """Return the confidence level supported by the evidence."""
        if LIMITING_EVIDENCE.intersection(self.evidence):
            return Confidence.LOW
        if "energy_dashboard" in self.evidence:
            return Confidence.HIGH
        if STRUCTURAL_EVIDENCE.intersection(self.evidence) and self.role_resolved:
            return Confidence.MEDIUM
        return Confidence.LOW

    def as_dict(self) -> dict[str, Any]:
        """Return a JSON-compatible representation."""
        needs = (
            ["sign_convention"] if self.signed and self.sign_convention is None else []
        )
        return {
            "entity_id": self.entity_id,
            "confidence": self.confidence.value,
            "score": self.score,
            "evidence": sorted(dict.fromkeys(self.evidence)),
            "sign_convention": self.sign_convention.value
            if self.sign_convention
            else None,
            "requires": needs,
        }


def parse_energy_preferences(
    preferences: Mapping[str, Any],
) -> tuple[list[VerifiedBinding], dict[str, set[EnergyModule]]]:
    """Extract verified power bindings and meter anchors from HA Energy prefs.

    Every lookup is defensive because the preference schema grew across Home
    Assistant releases (power sensors are absent from older versions).
    """
    verified: list[VerifiedBinding] = []
    anchors: dict[str, set[EnergyModule]] = defaultdict(set)

    def anchor(entity_id: Any, module: EnergyModule) -> None:
        if isinstance(entity_id, str) and entity_id.startswith(f"{SENSOR_DOMAIN}."):
            anchors[entity_id].add(module)

    def power_config(module: EnergyModule, config: Any, stat_rate: Any) -> None:
        inbound, outbound = DIRECTIONAL_PAIRS[module]
        if isinstance(config, Mapping):
            if isinstance(config.get("stat_rate"), str):
                verified.append(
                    VerifiedBinding(
                        module, "net_power", config["stat_rate"], INBOUND_CONVENTION[module]
                    )
                )
            elif isinstance(config.get("stat_rate_inverted"), str):
                verified.append(
                    VerifiedBinding(
                        module,
                        "net_power",
                        config["stat_rate_inverted"],
                        OUTBOUND_CONVENTION[module],
                    )
                )
            elif isinstance(config.get("stat_rate_from"), str) and isinstance(
                config.get("stat_rate_to"), str
            ):
                verified.append(
                    VerifiedBinding(module, inbound, config["stat_rate_from"])
                )
                verified.append(VerifiedBinding(module, outbound, config["stat_rate_to"]))
        elif isinstance(stat_rate, str):
            # Without power_config, HA documents stat_rate as positive inbound.
            verified.append(
                VerifiedBinding(module, "net_power", stat_rate, INBOUND_CONVENTION[module])
            )

    sources = preferences.get("energy_sources")
    for source in sources if isinstance(sources, list) else ():
        if not isinstance(source, Mapping):
            continue
        source_type = source.get("type")
        if source_type == "grid":
            for flow in _mappings(source.get("flow_from")):
                anchor(flow.get("stat_energy_from"), EnergyModule.GRID)
            for flow in _mappings(source.get("flow_to")):
                anchor(flow.get("stat_energy_to"), EnergyModule.GRID)
            for power in _mappings(source.get("power")):
                power_config(
                    EnergyModule.GRID, power.get("power_config"), power.get("stat_rate")
                )
        elif source_type == "solar":
            anchor(source.get("stat_energy_from"), EnergyModule.SOLAR)
            if isinstance(source.get("stat_rate"), str):
                verified.append(
                    VerifiedBinding(
                        EnergyModule.SOLAR, "production_power", source["stat_rate"]
                    )
                )
        elif source_type == "battery":
            anchor(source.get("stat_energy_from"), EnergyModule.BATTERY)
            anchor(source.get("stat_energy_to"), EnergyModule.BATTERY)
            power_config(
                EnergyModule.BATTERY, source.get("power_config"), source.get("stat_rate")
            )
    return verified, dict(anchors)


def classify_metadata(
    device_class: str | None, unit: str | None, state_class: str | None
) -> tuple[MeasurementKind | None, str | None]:
    """Return the measurement kind, or the reason an energy-like sensor is excluded."""
    if unit in ENERGY_UNITS or device_class in ENERGY_DEVICE_CLASSES:
        return None, "cumulative_energy"
    if device_class == "battery":
        if unit == PERCENT_UNIT:
            return MeasurementKind.STATE_OF_CHARGE, None
        return None, "incompatible_metadata"
    if unit in POWER_UNIT_FACTORS_TO_W:
        if device_class not in (None, "power") or state_class in CUMULATIVE_STATE_CLASSES:
            return None, "incompatible_metadata"
        return MeasurementKind.POWER, None
    if device_class == "power":
        return None, "incompatible_metadata"
    return None, None


def tokenize(*texts: str | None) -> frozenset[str]:
    """Split identifiers and names into lower-case word tokens."""
    return frozenset(
        token
        for text in texts
        if text
        for token in TOKEN_PATTERN.findall(text.casefold())
    )


class EnergyDiscoveryService:
    """Propose Energy Profile bindings without changing any configuration."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass

    async def async_discover(self) -> dict[str, Any]:
        """Return ranked proposals, a conservative draft profile and ambiguities."""
        dashboard_status, verified, anchor_entities = await self._async_energy_dashboard()
        facts, ignored, hardware_devices = self._collect_facts()
        facts_by_id = {item.entity_id: item for item in facts}

        ent_reg = er.async_get(self.hass)
        anchors: dict[str, set[EnergyModule]] = defaultdict(set)
        for entity_id, modules in anchor_entities.items():
            entry = ent_reg.async_get(entity_id)
            if entry is not None and entry.device_id is not None:
                anchors[entry.device_id].update(modules)

        proposals: dict[tuple[str, EnergyModule, str], Proposal] = {}
        unassigned: list[str] = []
        for item in facts:
            created = self._heuristic_proposals(item, anchors, hardware_devices)
            for proposal in created:
                proposals[(item.entity_id, proposal.module, proposal.role)] = proposal
            if not created:
                unassigned.append(item.entity_id)

        warnings: list[dict[str, str]] = []
        for binding in verified:
            item = facts_by_id.get(binding.entity_id)
            if item is None or item.kind is not MeasurementKind.POWER:
                warnings.append(
                    {
                        "entity_id": binding.entity_id,
                        "reason": "energy_dashboard_sensor_unusable",
                    }
                )
                continue
            key = (binding.entity_id, binding.module, binding.role)
            proposal = proposals.get(key)
            if proposal is None:
                proposal = Proposal(
                    binding.entity_id,
                    binding.module,
                    binding.role,
                    evidence=self._base_evidence(item),
                )
                proposals[key] = proposal
            proposal.evidence.append("energy_dashboard")
            proposal.sign_convention = binding.sign_convention
            proposal.role_resolved = True
            if binding.entity_id in unassigned:
                unassigned.remove(binding.entity_id)

        ranked: dict[EnergyModule, dict[str, list[Proposal]]] = defaultdict(
            lambda: defaultdict(list)
        )
        for proposal in proposals.values():
            ranked[proposal.module][proposal.role].append(proposal)
        for roles in ranked.values():
            for items in roles.values():
                items.sort(
                    key=lambda p: (-CONFIDENCE_RANK[p.confidence], -p.score, p.entity_id)
                )

        suggested, ambiguous, requires_input = self._suggest(ranked)
        referenced = dict.fromkeys(
            [p.entity_id for p in proposals.values()] + unassigned
        )
        return {
            "generated_at": utc_now().isoformat(),
            "energy_dashboard": dashboard_status,
            "suggested_profile": suggested,
            "proposals": {
                module.value: {
                    role: [p.as_dict() for p in ranked[module][role]]
                    for role in MODULE_SPECS[module].roles
                    if ranked[module].get(role)
                }
                for module in EnergyModule
                if module in ranked
            },
            "ambiguous": ambiguous,
            "requires_input": requires_input,
            "unassigned": unassigned,
            "candidates": {
                entity_id: facts_by_id[entity_id].summary() for entity_id in referenced
            },
            "ignored": dict(sorted(ignored.items())),
            "warnings": warnings,
        }

    async def _async_energy_dashboard(
        self,
    ) -> tuple[str, list[VerifiedBinding], dict[str, set[EnergyModule]]]:
        if "energy" not in self.hass.config.components:
            return "not_loaded", [], {}
        try:
            from homeassistant.components.energy.data import (  # noqa: PLC0415
                async_get_manager,
            )

            manager = await async_get_manager(self.hass)
            preferences = manager.data
        except Exception:  # Optional evidence: discovery works without it.
            _LOGGER.debug("Energy dashboard preferences are unavailable", exc_info=True)
            return "unavailable", [], {}
        if not isinstance(preferences, Mapping):
            return "not_configured", [], {}
        verified, anchors = parse_energy_preferences(preferences)
        return "used", verified, anchors

    def _collect_facts(self) -> tuple[list[EntityFacts], Counter[str], set[str]]:
        ent_reg = er.async_get(self.hass)
        dev_reg = dr.async_get(self.hass)
        entity_ids = set(self.hass.states.async_entity_ids(SENSOR_DOMAIN))
        entity_ids.update(
            entry.entity_id
            for entry in ent_reg.entities.values()
            if entry.domain == SENSOR_DOMAIN
        )

        facts: list[EntityFacts] = []
        ignored: Counter[str] = Counter()
        hardware_devices: set[str] = set()
        for entity_id in sorted(entity_ids):
            entry = ent_reg.async_get(entity_id)
            if entry is not None and entry.disabled_by is not None:
                ignored["disabled"] += 1
                continue
            state = self.hass.states.get(entity_id)
            attributes: Mapping[str, Any] = state.attributes if state is not None else {}
            device_class = _text(attributes.get("device_class")) or (
                _text(entry.device_class or entry.original_device_class)
                if entry is not None
                else None
            )
            unit = _text(attributes.get("unit_of_measurement")) or (
                _registry_unit(entry) if entry is not None else None
            )
            state_class = _text(attributes.get("state_class")) or (
                _text((entry.capabilities or {}).get("state_class"))
                if entry is not None
                else None
            )
            kind, excluded = classify_metadata(device_class, unit, state_class)
            device_id = entry.device_id if entry is not None else None
            if (
                kind is MeasurementKind.POWER or excluded == "cumulative_energy"
            ) and device_id is not None:
                hardware_devices.add(device_id)
            if excluded is not None:
                ignored[excluded] += 1
            if kind is None:
                continue

            device = dev_reg.async_get(device_id) if device_id is not None else None
            primary_texts = (
                (entry.translation_key, entry.original_name, entry.name)
                if entry is not None
                else ()
            )
            if any(primary_texts):
                tokens = tokenize(*primary_texts)
            else:
                tokens = tokenize(
                    _text(attributes.get("friendly_name")), entity_id.split(".", 1)[1]
                )
            facts.append(
                EntityFacts(
                    entity_id=entity_id,
                    kind=kind,
                    name=_text(attributes.get("friendly_name"))
                    or (entry.name or entry.original_name if entry is not None else None),
                    unit=unit,
                    device_class=device_class,
                    state_class=state_class,
                    device_id=device_id,
                    device_name=(device.name_by_user or device.name) if device else None,
                    manufacturer=device.manufacturer if device else None,
                    model=device.model if device else None,
                    platform=entry.platform if entry is not None else None,
                    entity_category=_text(entry.entity_category)
                    if entry is not None
                    else None,
                    hidden=entry is not None and entry.hidden_by is not None,
                    tokens=tokens,
                    state=state,
                )
            )
        return facts, ignored, hardware_devices

    @staticmethod
    def _base_evidence(item: EntityFacts) -> list[str]:
        evidence: list[str] = []
        if item.device_class is not None:
            evidence.append("device_class")
        if item.state_class == "measurement":
            evidence.append("measurement_state_class")
        if item.entity_category == "diagnostic":
            evidence.append("diagnostic_entity")
        if item.hidden:
            evidence.append("hidden_entity")
        if item.platform == "mobile_app":
            evidence.append("mobile_device")
        return evidence

    def _heuristic_proposals(
        self,
        item: EntityFacts,
        anchors: Mapping[str, set[EnergyModule]],
        hardware_devices: set[str],
    ) -> list[Proposal]:
        base = self._base_evidence(item)
        device_modules = anchors.get(item.device_id, set()) if item.device_id else set()

        if item.kind is MeasurementKind.STATE_OF_CHARGE:
            evidence = list(base)
            if EnergyModule.BATTERY in device_modules:
                evidence.append("energy_dashboard_device")
            elif item.device_id in hardware_devices:
                evidence.append("energy_hardware_device")
            if item.tokens & MODULE_KEYWORDS[EnergyModule.BATTERY]:
                evidence.append("module_keyword")
            return [
                Proposal(item.entity_id, EnergyModule.BATTERY, "state_of_charge", evidence)
            ]

        proposals: list[Proposal] = []
        for module in EnergyModule:
            module_evidence: list[str] = []
            if module in device_modules:
                module_evidence.append("energy_dashboard_device")
            if item.tokens & MODULE_KEYWORDS[module]:
                module_evidence.append("module_keyword")
            if not module_evidence:
                continue
            for role, role_evidence, resolved in self._power_roles(module, item.tokens):
                proposals.append(
                    Proposal(
                        item.entity_id,
                        module,
                        role,
                        [*base, *module_evidence, *role_evidence],
                        role_resolved=resolved,
                    )
                )
        return proposals

    @staticmethod
    def _power_roles(
        module: EnergyModule, tokens: frozenset[str]
    ) -> Iterable[tuple[str, list[str], bool]]:
        power_roles = [
            role
            for role, spec in MODULE_SPECS[module].roles.items()
            if spec.kind is MeasurementKind.POWER
        ]
        if module not in DIRECTIONAL_PAIRS:
            return [(power_roles[0], [], True)]
        matched = [
            role
            for role in DIRECTIONAL_PAIRS[module]
            if tokens & ROLE_KEYWORDS[(module, role)]
        ]
        if tokens & NET_KEYWORDS:
            matched.append("net_power")
        if len(matched) == 1:
            return [(matched[0], ["role_keyword"], True)]
        if matched:
            # Contradictory direction words: every reading stays unresolved.
            return [(role, [], False) for role in matched]
        # No direction words: a single bidirectional meter is the plausible role.
        return [("net_power", [], True)]

    def _suggest(
        self, ranked: Mapping[EnergyModule, Mapping[str, list[Proposal]]]
    ) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
        ambiguous: list[dict[str, Any]] = []
        picks: dict[tuple[EnergyModule, str], Proposal] = {}

        for module in EnergyModule:
            for role in MODULE_SPECS[module].roles:
                items = ranked.get(module, {}).get(role, [])
                if not items or items[0].confidence is Confidence.LOW:
                    continue
                best = [p for p in items if p.confidence is items[0].confidence]
                if len(best) > 1:
                    ambiguous.append(
                        _ambiguity(module, role, best, "multiple_candidates")
                    )
                    continue
                picks[(module, role)] = best[0]

        by_entity: dict[str, list[tuple[EnergyModule, str]]] = defaultdict(list)
        for key, proposal in picks.items():
            by_entity[proposal.entity_id].append(key)
        for keys in by_entity.values():
            if len(keys) < 2:
                continue
            top = max(CONFIDENCE_RANK[picks[key].confidence] for key in keys)
            winners = [key for key in keys if CONFIDENCE_RANK[picks[key].confidence] == top]
            # One sensor can fill one role: keep a unique strongest match only.
            keep = winners[0] if len(winners) == 1 else None
            for module, role in keys:
                if (module, role) == keep:
                    continue
                ambiguous.append(
                    _ambiguity(
                        module,
                        role,
                        [picks.pop((module, role))],
                        "entity_matches_multiple_roles",
                    )
                )

        for module in DIRECTIONAL_PAIRS:
            net = picks.get((module, "net_power"))
            split = [
                picks[(module, role)]
                for role in DIRECTIONAL_PAIRS[module]
                if (module, role) in picks
            ]
            if net is None or not split:
                continue
            net_rank = CONFIDENCE_RANK[net.confidence]
            split_rank = max(CONFIDENCE_RANK[p.confidence] for p in split)
            if net_rank > split_rank:
                for proposal in split:
                    picks.pop((module, proposal.role))
            elif split_rank > net_rank:
                picks.pop((module, "net_power"))
            else:
                for proposal in [net, *split]:
                    picks.pop((module, proposal.role))
                ambiguous.append(
                    _ambiguity(module, "net_power", [net, *split], "net_and_directional_conflict")
                )

        requires_input: list[dict[str, Any]] = []
        modules: dict[str, dict[str, Any]] = {}
        for (module, role), proposal in picks.items():
            if proposal.signed and proposal.sign_convention is None:
                requires_input.append(
                    {
                        "module": module.value,
                        "role": role,
                        "entity_id": proposal.entity_id,
                        "confidence": proposal.confidence.value,
                        "missing": ["sign_convention"],
                        "allowed": sorted(
                            c.value for c in MODULE_SPECS[module].sign_conventions
                        ),
                    }
                )
                continue
            document = modules.setdefault(module.value, {"sensors": {}})
            document["sensors"][role] = proposal.entity_id
            if proposal.sign_convention is not None:
                document["sign_convention"] = proposal.sign_convention.value

        suggested = {"modules": {}}
        for module in EnergyModule:
            document = modules.get(module.value)
            if document is None:
                continue
            try:
                parse_profile({"modules": {module.value: document}})
            except EnergyValidationError:
                ambiguous.append(
                    {
                        "module": module.value,
                        "role": None,
                        "entity_ids": sorted(document["sensors"].values()),
                        "reason": "invalid_combination",
                    }
                )
                continue
            suggested["modules"][module.value] = document
        return suggested, ambiguous, requires_input


def _ambiguity(
    module: EnergyModule, role: str, proposals: Iterable[Proposal], reason: str
) -> dict[str, Any]:
    return {
        "module": module.value,
        "role": role,
        "entity_ids": sorted({p.entity_id for p in proposals}),
        "reason": reason,
    }


def _mappings(value: Any) -> Iterable[Mapping[str, Any]]:
    if not isinstance(value, list):
        return ()
    return [item for item in value if isinstance(item, Mapping)]


def _registry_unit(entry: er.RegistryEntry) -> str | None:
    sensor_options = (entry.options or {}).get(SENSOR_DOMAIN) or {}
    return _text(sensor_options.get("unit_of_measurement")) or _text(
        entry.unit_of_measurement
    )


def _text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value)
    return text or None
