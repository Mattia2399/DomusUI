"""Read-only projection of configured energy modules.

Shared by the Domus ``EnergyContextProvider`` and the ``get_state`` websocket
command so that values, offline modules and derived consumption are computed
in exactly one place.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from homeassistant.util import dt as dt_util

from ..core._values import utc_now
from .adapter import derive_home_consumption
from .manager import EnergyProfileManager
from .models import EnergyModule, ModuleStatus
from .tariff import tariff_state

# The A0 module fields, then the additive device detail.
MODULE_FIELDS = ("status", "complete", "freshness", "sign_convention", "quantities", "devices", "total")


async def async_build_energy_context(
    manager: EnergyProfileManager,
) -> dict[str, Any] | None:
    """Return the projection of configured modules, or ``None`` without a profile."""
    profile = manager.profile_v2
    if not manager.loaded or profile.is_empty:
        return None
    states = {
        module: await adapter.async_get_capability()
        for module, adapter in manager.adapters.items()
    }
    unsupported = manager.unsupported_modules
    return {
        "available": any(state.available for state in states.values()),
        "profile_revision": profile.revision,
        "observed_at": utc_now().isoformat(),
        "modules": {
            module.value: {key: state.values[key] for key in MODULE_FIELDS}
            for module, state in states.items()
        },
        "absent_modules": tuple(module.value for module in EnergyModule if module not in profile.plant),
        "offline_modules": tuple(
            module.value
            for module, state in states.items()
            if state.values["status"] == ModuleStatus.OFFLINE
        ),
        # Installed, but without a realtime power sensor: not shown, never 0 W.
        "unsupported_modules": {module.value: reason for module, reason in unsupported.items()},
        "home_consumption": derive_home_consumption(states, unsupported).as_dict(),
    }


async def async_energy_state(manager: EnergyProfileManager) -> dict[str, Any]:
    """Return a JSON-compatible state document for any configuration."""
    context = await async_build_energy_context(manager)
    tariff = tariff_state(manager.profile_v2.tariff, dt_util.now())
    if context is None:
        return {
            "configured": False,
            "load_error": manager.load_error,
            "available": False,
            "profile_revision": manager.profile_v2.revision,
            "observed_at": utc_now().isoformat(),
            "modules": {},
            "absent_modules": [module.value for module in EnergyModule],
            "offline_modules": [],
            "unsupported_modules": {},
            "home_consumption": None,
            "tariff": tariff,
        }
    return {"configured": True, "load_error": manager.load_error, "tariff": tariff, **_thaw(context)}


def _thaw(value: Any) -> Any:
    """Convert frozen capability values into plain JSON containers."""
    if isinstance(value, Mapping):
        return {key: _thaw(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_thaw(item) for item in value]
    return value
