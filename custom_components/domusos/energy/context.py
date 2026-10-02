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


async def async_build_energy_context(
    manager: EnergyProfileManager,
) -> dict[str, Any] | None:
    """Return the projection of configured modules, or ``None`` without a profile."""
    profile = manager.profile
    if not manager.loaded or profile.is_empty:
        return None
    states = {
        module: await adapter.async_get_capability()
        for module, adapter in manager.adapters.items()
    }
    return {
        "available": any(state.available for state in states.values()),
        "profile_revision": profile.revision,
        "observed_at": utc_now().isoformat(),
        "modules": {
            module.value: {
                key: state.values[key]
                for key in ("status", "complete", "sign_convention", "quantities")
            }
            for module, state in states.items()
        },
        "absent_modules": tuple(module.value for module in profile.absent_modules),
        "offline_modules": tuple(
            module.value
            for module, state in states.items()
            if state.values["status"] == ModuleStatus.OFFLINE
        ),
        "home_consumption": derive_home_consumption(states).as_dict(),
    }


async def async_energy_state(manager: EnergyProfileManager) -> dict[str, Any]:
    """Return a JSON-compatible state document for any configuration."""
    context = await async_build_energy_context(manager)
    tariff = tariff_state(manager.profile.tariff, dt_util.now())
    if context is None:
        return {
            "configured": False,
            "load_error": manager.load_error,
            "available": False,
            "profile_revision": manager.profile.revision,
            "observed_at": utc_now().isoformat(),
            "modules": {},
            "absent_modules": [module.value for module in EnergyModule],
            "offline_modules": [],
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
