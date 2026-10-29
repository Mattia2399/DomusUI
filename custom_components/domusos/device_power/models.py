"""Device power policies: what is stored, what is accepted and how a policy decides.

A policy keeps one charger switch on between two battery thresholds. This
module is plain Python on purpose: no Home Assistant import, so validation and
the decision are tested on their own and the controller only applies them.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Any, Mapping

STORAGE_KEY = "domusos.device_power.v1"
STORAGE_VERSION = 1

MAX_POLICIES = 20
MAX_LABEL_LENGTH = 64
DEFAULT_START_THRESHOLD = 30
DEFAULT_STOP_THRESHOLD = 80

BATTERY_DOMAIN = "sensor"
POWER_DOMAIN = "switch"

_ENTITY_ID = re.compile(r"^[a-z0-9_]+\.[a-z0-9_]+$")
# A random reference chosen by a browser; never an identity or a permission.
_CLIENT_ID = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
_POLICY_ID = re.compile(r"^[a-f0-9]{32}$")

_POLICY_KEYS = frozenset(
    {
        "policy_id",
        "client_id",
        "label",
        "enabled",
        "battery_entity_id",
        "switch_entity_id",
        "start_threshold",
        "stop_threshold",
        "revision",
        "created_at",
        "updated_at",
    }
)
_SETTINGS_KEYS = frozenset(
    {
        "client_id",
        "label",
        "enabled",
        "battery_entity_id",
        "switch_entity_id",
        "start_threshold",
        "stop_threshold",
    }
)


class DevicePowerError(Exception):
    """An expected failure with a stable code for the websocket API."""

    code = "device_power_error"


class InvalidPolicyError(DevicePowerError):
    """The settings sent by the client are not acceptable; nothing changes."""

    code = "invalid_policy"

    def __init__(self, message: str, field: str | None = None) -> None:
        super().__init__(message)
        self.field = field


class PolicyNotFoundError(DevicePowerError):
    code = "policy_not_found"


class RevisionConflictError(DevicePowerError):
    """The policy changed since the client read it; the client must reload."""

    code = "revision_conflict"


class SwitchInUseError(DevicePowerError):
    """Another active policy already drives this switch."""

    code = "switch_in_use"


class ClientAlreadyBoundError(DevicePowerError):
    """This device already has its own policy."""

    code = "client_already_bound"


class TooManyPoliciesError(DevicePowerError):
    code = "too_many_policies"


class StoreCorruptError(DevicePowerError):
    """The stored policies are unreadable: nothing runs and nothing is written."""

    code = "store_corrupt"


class DevicePowerUnavailableError(DevicePowerError):
    code = "device_power_unavailable"


class PermissionDeniedError(DevicePowerError):
    code = "permission_denied"


class SaveFailedError(DevicePowerError):
    """Home Assistant could not write the store; the previous policies stay in force."""

    code = "save_failed"


class InvalidStoredDocumentError(ValueError):
    """The stored document does not match the schema."""


@dataclass(frozen=True, slots=True)
class PolicySettings:
    """What a client may choose for a policy."""

    client_id: str | None
    label: str | None
    enabled: bool
    battery_entity_id: str
    switch_entity_id: str
    start_threshold: int
    stop_threshold: int


@dataclass(frozen=True, slots=True)
class PowerPolicy:
    """A stored policy: the settings plus the identity and history the server owns."""

    policy_id: str
    client_id: str | None
    label: str | None
    enabled: bool
    battery_entity_id: str
    switch_entity_id: str
    start_threshold: int
    stop_threshold: int
    revision: int
    created_at: str
    updated_at: str

    @property
    def settings(self) -> PolicySettings:
        return PolicySettings(
            client_id=self.client_id,
            label=self.label,
            enabled=self.enabled,
            battery_entity_id=self.battery_entity_id,
            switch_entity_id=self.switch_entity_id,
            start_threshold=self.start_threshold,
            stop_threshold=self.stop_threshold,
        )

    def with_settings(self, settings: PolicySettings, *, updated_at: str) -> PowerPolicy:
        return PowerPolicy(
            policy_id=self.policy_id,
            client_id=settings.client_id,
            label=settings.label,
            enabled=settings.enabled,
            battery_entity_id=settings.battery_entity_id,
            switch_entity_id=settings.switch_entity_id,
            start_threshold=settings.start_threshold,
            stop_threshold=settings.stop_threshold,
            revision=self.revision + 1,
            created_at=self.created_at,
            updated_at=updated_at,
        )

    def to_storage(self) -> dict[str, Any]:
        return {
            "policy_id": self.policy_id,
            "client_id": self.client_id,
            "label": self.label,
            "enabled": self.enabled,
            "battery_entity_id": self.battery_entity_id,
            "switch_entity_id": self.switch_entity_id,
            "start_threshold": self.start_threshold,
            "stop_threshold": self.stop_threshold,
            "revision": self.revision,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


def canonical_label(value: Any) -> str | None:
    """Trim a label; an empty one is no label. Never used to identify anything."""
    if value is None:
        return None
    if not isinstance(value, str):
        raise InvalidPolicyError("The label must be text", "label")
    label = value.strip()
    if not label:
        return None
    if len(label) > MAX_LABEL_LENGTH:
        raise InvalidPolicyError(
            f"The label is longer than {MAX_LABEL_LENGTH} characters", "label"
        )
    return label


def canonical_client_id(value: Any) -> str | None:
    """A client reference is optional: a policy without one is still recoverable."""
    if value is None:
        return None
    if not isinstance(value, str) or not _CLIENT_ID.fullmatch(value):
        raise InvalidPolicyError("The client reference is not valid", "client_id")
    return value


def _entity_id(value: Any, domain: str, field: str) -> str:
    if not isinstance(value, str) or not _ENTITY_ID.fullmatch(value):
        raise InvalidPolicyError("Choose an entity", field)
    if value.split(".", 1)[0] != domain:
        raise InvalidPolicyError(f"Only {domain}.* entities are supported", field)
    return value


def _threshold(value: Any, field: str) -> int:
    # bool is an int in Python: refuse it explicitly, and never round a float.
    if isinstance(value, bool) or not isinstance(value, int):
        raise InvalidPolicyError("Thresholds are whole percentages", field)
    if not 0 <= value <= 100:
        raise InvalidPolicyError("Thresholds are between 0 and 100", field)
    return value


def validate_thresholds(start: int, stop: int) -> None:
    """0 <= start < stop <= 100; an invalid pair is refused, never corrected."""
    if not start < stop:
        raise InvalidPolicyError(
            "Charging must start below the level where it stops", "stop_threshold"
        )


def parse_policy_settings(payload: Any) -> PolicySettings:
    """Validate the settings a client sent; unknown keys are refused."""
    if not isinstance(payload, Mapping):
        raise InvalidPolicyError("The policy must be an object")
    unknown = set(payload) - _SETTINGS_KEYS
    if unknown:
        raise InvalidPolicyError(f"Unknown fields: {', '.join(sorted(unknown))}")
    enabled = payload.get("enabled")
    if not isinstance(enabled, bool):
        raise InvalidPolicyError("Choose whether the policy is active", "enabled")
    battery = _entity_id(payload.get("battery_entity_id"), BATTERY_DOMAIN, "battery_entity_id")
    switch = _entity_id(payload.get("switch_entity_id"), POWER_DOMAIN, "switch_entity_id")
    start = _threshold(payload.get("start_threshold"), "start_threshold")
    stop = _threshold(payload.get("stop_threshold"), "stop_threshold")
    validate_thresholds(start, stop)
    return PolicySettings(
        client_id=canonical_client_id(payload.get("client_id")),
        label=canonical_label(payload.get("label")),
        enabled=enabled,
        battery_entity_id=battery,
        switch_entity_id=switch,
        start_threshold=start,
        stop_threshold=stop,
    )


def _timestamp(value: Any, field: str) -> str:
    if not isinstance(value, str):
        raise InvalidStoredDocumentError(f"{field} is not a timestamp")
    try:
        datetime.fromisoformat(value)
    except ValueError as err:
        raise InvalidStoredDocumentError(f"{field} is not a timestamp") from err
    return value


def _stored_policy(value: Any) -> PowerPolicy:
    if not isinstance(value, Mapping) or set(value) != _POLICY_KEYS:
        raise InvalidStoredDocumentError("a policy does not have the expected fields")
    policy_id = value["policy_id"]
    if not isinstance(policy_id, str) or not _POLICY_ID.fullmatch(policy_id):
        raise InvalidStoredDocumentError("a policy id is not valid")
    revision = value["revision"]
    if isinstance(revision, bool) or not isinstance(revision, int) or revision < 1:
        raise InvalidStoredDocumentError("a policy revision is not valid")
    try:
        settings = parse_policy_settings({key: value[key] for key in _SETTINGS_KEYS})
    except InvalidPolicyError as err:
        raise InvalidStoredDocumentError(f"policy {policy_id}: {err}") from err
    # A stored label must already be canonical: a store is never rewritten on load.
    if settings.label != value["label"]:
        raise InvalidStoredDocumentError(f"policy {policy_id}: the label is not canonical")
    return PowerPolicy(
        policy_id=policy_id,
        client_id=settings.client_id,
        label=settings.label,
        enabled=settings.enabled,
        battery_entity_id=settings.battery_entity_id,
        switch_entity_id=settings.switch_entity_id,
        start_threshold=settings.start_threshold,
        stop_threshold=settings.stop_threshold,
        revision=revision,
        created_at=_timestamp(value["created_at"], "created_at"),
        updated_at=_timestamp(value["updated_at"], "updated_at"),
    )


def parse_stored_document(document: Any) -> dict[str, PowerPolicy]:
    """Read the stored policies, or refuse the whole document.

    A document that breaks a rule the API enforces (two active policies on one
    switch, one device with two policies) is as untrustworthy as a malformed
    one: nothing in it is allowed to drive a switch.
    """
    if not isinstance(document, Mapping) or set(document) != {"policies"}:
        raise InvalidStoredDocumentError("the document does not have the expected fields")
    raw_policies = document["policies"]
    if not isinstance(raw_policies, list) or len(raw_policies) > MAX_POLICIES:
        raise InvalidStoredDocumentError("the policy list is not valid")
    policies: dict[str, PowerPolicy] = {}
    for raw in raw_policies:
        policy = _stored_policy(raw)
        if policy.policy_id in policies:
            raise InvalidStoredDocumentError("two policies share an id")
        policies[policy.policy_id] = policy
    try:
        check_policy_set(policies.values())
    except (SwitchInUseError, ClientAlreadyBoundError) as err:
        raise InvalidStoredDocumentError(str(err)) from err
    return policies


def check_policy_set(policies: Any) -> None:
    """One active policy per switch and one policy per device, never first or last wins."""
    switches: set[str] = set()
    clients: set[str] = set()
    for policy in policies:
        if policy.enabled:
            if policy.switch_entity_id in switches:
                raise SwitchInUseError("Another active policy already drives this switch")
            switches.add(policy.switch_entity_id)
        if policy.client_id is not None:
            if policy.client_id in clients:
                raise ClientAlreadyBoundError("This device already has a power policy")
            clients.add(policy.client_id)


def storage_document(policies: Mapping[str, PowerPolicy]) -> dict[str, Any]:
    return {"policies": [policy.to_storage() for policy in policies.values()]}


class PolicyStatus(StrEnum):
    """What a policy is doing now; runtime only, never stored."""

    DISABLED = "disabled"
    STARTING = "starting"
    CHARGING = "charging"
    WAITING = "waiting"
    BATTERY_UNAVAILABLE = "battery_unavailable"
    SWITCH_UNAVAILABLE = "switch_unavailable"
    ERROR = "error"


def read_battery_level(state: Any) -> float | None:
    """A percentage from a sensor state, or None when it cannot be trusted.

    unknown, unavailable, text, NaN and values outside 0-100 all mean "no
    data": never 0 %, so a broken sensor never switches a charger.
    """
    if not isinstance(state, str):
        return None
    try:
        level = float(state)
    except ValueError:
        return None
    if not math.isfinite(level) or not 0 <= level <= 100:
        return None
    return level


def read_switch_state(state: Any) -> bool | None:
    """on or off; anything else (unknown, unavailable) is no state at all."""
    if state == "on":
        return True
    if state == "off":
        return False
    return None


def desired_switch_state(level: float, start: int, stop: int) -> bool | None:
    """Hysteresis: on at or below start, off at or above stop, no opinion between."""
    if level <= start:
        return True
    if level >= stop:
        return False
    return None


@dataclass(frozen=True, slots=True)
class Evaluation:
    """One look at the entities: what they say and what the switch should do."""

    battery_level: float | None
    switch_on: bool | None
    status: PolicyStatus
    # True to turn on, False to turn off, None to leave the switch alone.
    command: bool | None


def evaluate(start: int, stop: int, battery_state: Any, switch_state: Any) -> Evaluation:
    """Decide from the current states; no data means no action."""
    level = read_battery_level(battery_state)
    switch_on = read_switch_state(switch_state)
    if level is None:
        return Evaluation(level, switch_on, PolicyStatus.BATTERY_UNAVAILABLE, None)
    if switch_on is None:
        return Evaluation(level, None, PolicyStatus.SWITCH_UNAVAILABLE, None)
    desired = desired_switch_state(level, start, stop)
    command = desired if desired is not None and desired != switch_on else None
    status = PolicyStatus.CHARGING if switch_on else PolicyStatus.WAITING
    return Evaluation(level, switch_on, status, command)
