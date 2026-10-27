"""Device timers: plugs, fans and humidifiers that switch themselves off."""

from .api import DATA_DEVICE_TIMER_MANAGER
from .manager import DeviceTimerManager

__all__ = ["DATA_DEVICE_TIMER_MANAGER", "DeviceTimerManager"]
