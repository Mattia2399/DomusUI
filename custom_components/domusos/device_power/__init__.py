"""Device power management: keep a wall tablet's charger between two battery levels."""

from .api import DATA_DEVICE_POWER_MANAGER
from .manager import DevicePowerManager, DevicePowerStoreStatus

__all__ = ["DATA_DEVICE_POWER_MANAGER", "DevicePowerManager", "DevicePowerStoreStatus"]
