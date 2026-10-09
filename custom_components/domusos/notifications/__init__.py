"""Domus Notification Router: deliver notifications to people through their personal devices.

Backend only: features call :meth:`NotificationRouter.async_send` with person
ids. There is no websocket command to send arbitrary notifications; the only
client-facing entry point is the Profile's self test.
"""

from .ledger import LedgerStatus, NotificationLedger
from .models import (
    DeliveryWarning,
    DeviceDeliveryResult,
    DeviceStatus,
    DispatchResult,
    InvalidNotificationRequestError,
    NotificationError,
    NotificationRequest,
    NotificationRouterUnavailableError,
    RateLimitedError,
    Reason,
    RecipientResult,
    RecipientStatus,
)
from .router import NotificationRouter

DATA_NOTIFICATION_ROUTER = "notification_router"

__all__ = [
    "DATA_NOTIFICATION_ROUTER",
    "DeliveryWarning",
    "DeviceDeliveryResult",
    "DeviceStatus",
    "DispatchResult",
    "InvalidNotificationRequestError",
    "LedgerStatus",
    "NotificationError",
    "NotificationLedger",
    "NotificationRequest",
    "NotificationRouter",
    "NotificationRouterUnavailableError",
    "RateLimitedError",
    "Reason",
    "RecipientResult",
    "RecipientStatus",
]
