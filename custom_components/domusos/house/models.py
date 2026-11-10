"""Small, versioned read contracts for the House Core.

The topology contains HA registry facts and deterministic relationships. Runtime
states belong only to the snapshot. Neither contract is persisted by Domus.
"""

from __future__ import annotations

from typing import Any, Literal, TypedDict

SCHEMA = "domusos.house.v1"


class HouseIssue(TypedDict):
    code: Literal[
        "missing_floor_reference",
        "missing_area_reference",
        "missing_device_reference",
        "missing_temperature_entity",
        "missing_humidity_entity",
        "registry_unavailable",
    ]
    subjectId: str
    referenceId: str | None


class HouseTopology(TypedDict):
    schemaVersion: str
    topologyRevision: int
    topologyFingerprint: str
    generatedAt: str
    floors: list[dict[str, Any]]
    rooms: list[dict[str, Any]]
    devices: list[dict[str, Any]]
    entities: list[dict[str, Any]]
    unassigned: dict[str, list[str]]
    issues: list[HouseIssue]


class HouseSnapshot(TypedDict):
    schemaVersion: str
    topologyFingerprint: str
    generatedAt: str
    rooms: list[dict[str, Any]]
