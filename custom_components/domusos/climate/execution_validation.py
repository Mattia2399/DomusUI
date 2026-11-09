"""Build capability for the validated, pre-execution Climate runtime.

This evidence covers planning and safety checks, not a physical HA adapter.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ExecutionValidationCapabilities:
    linux_home_assistant: bool
    validated_ha_versions: tuple[str, ...] = ()
    evidence_runs: tuple[int, ...] = ()


CURRENT_EXECUTION_VALIDATION = ExecutionValidationCapabilities(
    linux_home_assistant=True,
    validated_ha_versions=("2025.1.0", "2026.2.3"),
    evidence_runs=(42586803454, 42587240131),
)
