"""Send one notification to one resolved target through Home Assistant ``notify``.

Target resolution (which entity or service belongs to a device) is the Profile
Core's job; this module only sends to what it is given, and never reads push
registrations, webhooks or tokens.

Home Assistant semantics, identical in 2025.1 and 2026.2.3:

- ``EntityTarget``: ``notify.send_message`` with ``message`` and optional
  ``title``, targeted at the entity. Home Assistant hands the title to every
  entity, whatever it supports, so the title is sent only to entities that
  declare ``NotifyEntityFeature.TITLE``; the message always goes. An entity
  service skips missing or unavailable entities *silently*, so the entity is
  checked right before the call: otherwise a vanished target would look
  delivered.
- ``LegacyServiceTarget``: ``notify.<service>`` (``notify.mobile_app_<name>``)
  with ``message`` and optional ``title``. ``mobile_app`` drops the default
  "Home Assistant" title, raises ``HomeAssistantError`` when the app has no
  way to be reached, and logs (without raising) a rejection by the push
  gateway. "Delivered" therefore means "Home Assistant accepted the
  notification without an error", not "the phone displayed it".

Calls are blocking, so an error raised by the service reaches the router, and
bounded by a timeout. ``mobile_app`` already gives the push gateway 10
seconds; ``DELIVERY_TIMEOUT`` leaves room for that.
"""

from __future__ import annotations

import asyncio
import logging
from enum import StrEnum

from homeassistant.components.notify import NotifyEntityFeature
from homeassistant.const import ATTR_SUPPORTED_FEATURES, STATE_UNAVAILABLE
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError, ServiceNotFound

from ..profile.targets import NOTIFY_DOMAIN, EntityTarget, LegacyServiceTarget

_LOGGER = logging.getLogger(__name__)

SERVICE_SEND_MESSAGE = "send_message"
DELIVERY_TIMEOUT = 15.0


class DeliveryOutcome(StrEnum):
    """What happened to one send."""

    DELIVERED = "delivered"
    FAILED = "failed"
    TIMEOUT = "timeout"
    # The target vanished between resolution and send: nothing was sent.
    TARGET_UNAVAILABLE = "target_unavailable"


def _service_data(message: str, title: str | None) -> dict[str, str]:
    data = {"message": message}
    if title:
        data["title"] = title
    return data


async def async_send_target(
    hass: HomeAssistant,
    target: EntityTarget | LegacyServiceTarget,
    message: str,
    title: str | None = None,
    *,
    timeout: float = DELIVERY_TIMEOUT,
) -> DeliveryOutcome:
    """Send to one target and report the outcome; never raises except on cancellation."""
    if isinstance(target, EntityTarget):
        state = hass.states.get(target.entity_id)
        if state is None or state.state == STATE_UNAVAILABLE:
            return DeliveryOutcome.TARGET_UNAVAILABLE
        features = state.attributes.get(ATTR_SUPPORTED_FEATURES)
        if not isinstance(features, int) or not features & NotifyEntityFeature.TITLE:
            title = None
        data = _service_data(message, title)
        service, call_target = SERVICE_SEND_MESSAGE, {"entity_id": target.entity_id}
        kind = "notify entity"
    else:
        if not hass.services.has_service(target.domain, target.service):
            return DeliveryOutcome.TARGET_UNAVAILABLE
        data = _service_data(message, title)
        service, call_target = target.service, None
        kind = "legacy notify service"
    try:
        async with asyncio.timeout(timeout):
            await hass.services.async_call(
                NOTIFY_DOMAIN, service, data, blocking=True, target=call_target
            )
    except ServiceNotFound:
        return DeliveryOutcome.TARGET_UNAVAILABLE
    except TimeoutError:
        _LOGGER.warning("A Domus notification through a %s timed out", kind)
        return DeliveryOutcome.TIMEOUT
    except HomeAssistantError as err:
        # The error text may echo the payload: only its type is logged.
        _LOGGER.warning("A Domus notification through a %s failed (%s)", kind, type(err).__name__)
        return DeliveryOutcome.FAILED
    except Exception as err:  # noqa: BLE001 - one broken integration must not stop the others
        _LOGGER.warning("A Domus notification through a %s failed unexpectedly (%s)", kind, type(err).__name__)
        return DeliveryOutcome.FAILED
    return DeliveryOutcome.DELIVERED
