"""Domus Energy Core: read-only, vendor-neutral energy profile and adapters."""

from .adapter import EnergyModuleAdapter, Quantity, derive_home_consumption
from .discovery import EnergyDiscoveryService
from .manager import EnergyProfileManager
from .models import (
    EnergyModule,
    EnergyModuleConfig,
    EnergyProfile,
    ModuleStatus,
    SignConvention,
    ValueSource,
    ValueStatus,
)

__all__ = [
    "EnergyDiscoveryService",
    "EnergyModule",
    "EnergyModuleAdapter",
    "EnergyModuleConfig",
    "EnergyProfile",
    "EnergyProfileManager",
    "ModuleStatus",
    "Quantity",
    "SignConvention",
    "ValueSource",
    "ValueStatus",
    "derive_home_consumption",
]
