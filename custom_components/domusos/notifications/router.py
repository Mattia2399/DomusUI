"""Person-based Notification Router.

Domus features name people, never phones::

    person internal id -> live person -> user_id -> Domus Profile
        -> notifications.enabled -> PersonalDevice[] (each with its own switch)
        -> notification target resolved live -> Home Assistant notify

Everything between the person and the target is resolved on every send and
never stored: renaming the person entity changes nothing, and relinking the
person to another user routes to that user's profile from then on.

Preferences decide *whether* a device should get a notification (general
switch AND device switch); live availability only decides whether it *can*
right now. An unavailable target never changes a stored switch.

Who receives what is planned by ``RecipientInspector`` (``recipients.py``),
which the readiness list shares: the router only follows the plan.

Isolation: every recipient and every device runs on its own, so one failing
phone never stops another person's delivery, nor another device of the same
person. Sends run in parallel under one router-wide semaphore.

Idempotency, when the caller passes a ``dedupe_key``: a delivery is
remembered per (source, dedupe key, person, personal device) only after it
succeeded, so a retry repeats just the devices that did not get it. Concurrent
requests for the same delivery are serialized by a lock keyed on its
fingerprint, held across check, send and record (never the ledger's own lock).
Within one running Home Assistant that is exactly once. Across a crash it is
not: if Home Assistant stops after the send and before the ledger write, a
retry sends again. Home Assistant ``notify`` has no transaction to do better.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass
from uuid import uuid4

from homeassistant.core import HomeAssistant

from ..profile.manager import ProfileManager
from ..profile.models import DeviceNotInProfileError, PersonalDevice
from ..profile.targets import EntityTarget, LegacyServiceTarget
from .delivery import DELIVERY_TIMEOUT, DeliveryOutcome, async_send_target
from .ledger import LedgerUnavailableError, NotificationLedger, delivery_fingerprint
from .recipients import DevicePlan, RecipientInspector, RecipientPlan
from .models import (
    DeliveryWarning,
    DeviceDeliveryResult,
    DeviceStatus,
    DispatchResult,
    NotificationRequest,
    RateLimitedError,
    Reason,
    RecipientResult,
    RecipientStatus,
    summarize,
)

_LOGGER = logging.getLogger(__name__)

# At most 10 devices per profile and 32 recipients per request: a small shared
# limit keeps Home Assistant responsive while slow phones wait their turn.
MAX_CONCURRENT_DELIVERIES = 8
SELF_TEST_INTERVAL = 10.0
SELF_TEST_SOURCE = "self_test"
SELF_TEST_TITLE = "Domus UI"
SELF_TEST_MESSAGE = "Test notification from Domus UI."

SendTarget = Callable[..., Awaitable[DeliveryOutcome]]


@dataclass(frozen=True, slots=True)
class _Content:
    message: str
    title: str | None
    source: str
    dedupe_key: str | None


class _KeyedLocks:
    """One lock per delivery fingerprint, dropped when nobody holds or waits for it."""

    def __init__(self) -> None:
        self._locks: dict[str, tuple[asyncio.Lock, int]] = {}

    @asynccontextmanager
    async def hold(self, key: str) -> AsyncIterator[None]:
        lock, users = self._locks.get(key, (asyncio.Lock(), 0))
        self._locks[key] = (lock, users + 1)
        try:
            async with lock:
                yield
        finally:
            lock, users = self._locks[key]
            if users <= 1:
                del self._locks[key]
            else:
                self._locks[key] = (lock, users - 1)

    def __len__(self) -> int:
        return len(self._locks)


class SelfTestRateLimiter:
    """In memory: one self test per user every ``interval`` seconds."""

    def __init__(self, interval: float = SELF_TEST_INTERVAL, clock: Callable[[], float] = time.monotonic) -> None:
        self._interval = interval
        self._clock = clock
        self._last: dict[str, float] = {}

    def check(self, user_id: str) -> None:
        """Count one test for ``user_id``, or raise ``RateLimitedError``."""
        now = self._clock()
        last = self._last.get(user_id)
        if last is not None and now - last < self._interval:
            raise RateLimitedError("Wait a few seconds before sending another test notification")
        self._last[user_id] = now

    def clear(self) -> None:
        """Forget every user."""
        self._last.clear()


class NotificationRouter:
    """Deliver Domus notifications to people through their own personal devices."""

    def __init__(
        self,
        hass: HomeAssistant,
        profiles: ProfileManager,
        ledger: NotificationLedger | None,
        *,
        send: SendTarget = async_send_target,
        timeout: float = DELIVERY_TIMEOUT,
        concurrency: int = MAX_CONCURRENT_DELIVERIES,
        self_test_limiter: SelfTestRateLimiter | None = None,
    ) -> None:
        self.hass = hass
        self._profiles = profiles
        # None when the ledger could not start: requests with a dedupe key are then not sent.
        self._ledger = ledger
        self._send = send
        self._timeout = timeout
        self._semaphore = asyncio.Semaphore(concurrency)
        self._locks = _KeyedLocks()
        self.self_test_limiter = self_test_limiter or SelfTestRateLimiter()

    async def async_shutdown(self) -> None:
        """Release in-memory state; nothing is pending to write."""
        self.self_test_limiter.clear()

    async def async_send(self, request: NotificationRequest) -> DispatchResult:
        """Deliver ``request`` to each of its recipients and report every outcome."""
        request_id = uuid4().hex
        content = _Content(request.message, request.title, request.source, request.dedupe_key)
        inspector = RecipientInspector(self.hass, self._profiles)
        results = await asyncio.gather(
            *(self._recipient(request_id, person_id, inspector, content) for person_id in request.recipients),
            return_exceptions=True,
        )
        outcome: list[RecipientResult] = []
        for person_id, result in zip(request.recipients, results, strict=True):
            if isinstance(result, BaseException):
                if isinstance(result, asyncio.CancelledError):
                    raise result
                _LOGGER.error(
                    "Domus notification %s: recipient %s failed unexpectedly (%s)",
                    request_id,
                    person_id,
                    type(result).__name__,
                )
                result = RecipientResult(person_id, RecipientStatus.FAILED, Reason.DELIVERY_FAILED)
            outcome.append(result)
        dispatch = DispatchResult(request_id, tuple(outcome))
        for result in dispatch.results:
            _LOGGER.debug(
                "Domus notification %s from %s: person %s %s%s",
                request_id,
                request.source,
                result.person_id,
                result.status.value,
                f" ({result.reason.value})" if result.reason else "",
            )
        return dispatch

    async def async_send_self_test(self, user_id: str, personal_device_id: str | None = None) -> RecipientResult:
        """Send the fixed test notification to the user's own devices.

        Acts on the user's own profile directly, so a user without a person can
        test too. Preferences still apply; there is no dedupe, only a rate limit.
        Raises ``DeviceNotInProfileError`` for a device that is not the user's.
        """
        self.self_test_limiter.check(user_id)
        request_id = uuid4().hex
        content = _Content(SELF_TEST_MESSAGE, SELF_TEST_TITLE, SELF_TEST_SOURCE, None)
        inspector = RecipientInspector(self.hass, self._profiles)
        profile, reason = inspector.usable_profile(user_id)
        if profile is None:
            if personal_device_id is not None:
                raise DeviceNotInProfileError("This device is not in your profile")
            return RecipientResult(None, RecipientStatus.SKIPPED, reason)
        if personal_device_id is not None and not any(
            device.id == personal_device_id for device in profile.personal_devices
        ):
            raise DeviceNotInProfileError("This device is not in your profile")
        plan = inspector.plan_profile(None, user_id, profile, personal_device_id)
        result = await self._follow(request_id, plan, content)
        _LOGGER.debug("Domus self test %s: %s", request_id, result.status.value)
        return result

    async def _recipient(
        self,
        request_id: str,
        person_id: str,
        inspector: RecipientInspector,
        content: _Content,
    ) -> RecipientResult:
        return await self._follow(request_id, await inspector.async_plan(person_id), content)

    async def _follow(self, request_id: str, plan: RecipientPlan, content: _Content) -> RecipientResult:
        """Send to every device of the plan that has a target; report the others as planned."""
        if plan.reason is not None:
            return RecipientResult(plan.person_id, RecipientStatus.SKIPPED, plan.reason)
        results = await asyncio.gather(
            *(self._device(request_id, plan.person_id, device, content) for device in plan.devices),
            return_exceptions=True,
        )
        outcome: list[DeviceDeliveryResult] = []
        for planned, result in zip(plan.devices, results, strict=True):
            if isinstance(result, BaseException):
                if isinstance(result, asyncio.CancelledError):
                    raise result
                _LOGGER.error(
                    "Domus notification %s: device %s failed unexpectedly (%s)",
                    request_id,
                    planned.device.id,
                    type(result).__name__,
                )
                result = DeviceDeliveryResult(planned.device.id, DeviceStatus.FAILED, Reason.DELIVERY_FAILED)
            outcome.append(result)
        return summarize(plan.person_id, outcome)

    async def _device(
        self,
        request_id: str,
        person_id: str | None,
        planned: DevicePlan,
        content: _Content,
    ) -> DeviceDeliveryResult:
        device, target = planned.device, planned.target
        if target is None:
            return DeviceDeliveryResult(device.id, DeviceStatus.SKIPPED, planned.reason or Reason.TARGET_UNAVAILABLE)
        if content.dedupe_key is None or person_id is None:
            return self._result(device.id, await self._attempt(target, content))
        return await self._deduplicated(request_id, person_id, device, target, content)

    async def _deduplicated(
        self,
        request_id: str,
        person_id: str,
        device: PersonalDevice,
        target: EntityTarget | LegacyServiceTarget,
        content: _Content,
    ) -> DeviceDeliveryResult:
        assert content.dedupe_key is not None
        if self._ledger is None:
            return DeviceDeliveryResult(device.id, DeviceStatus.SKIPPED, Reason.DEDUPE_UNAVAILABLE)
        fingerprint = delivery_fingerprint(content.source, content.dedupe_key, person_id, device.id)
        # Check, send and record under one lock for this delivery only.
        async with self._locks.hold(fingerprint):
            try:
                if await self._ledger.async_contains(fingerprint):
                    return DeviceDeliveryResult(device.id, DeviceStatus.ALREADY_SENT, Reason.ALREADY_SENT)
            except LedgerUnavailableError:
                # The caller asked for at most once: without the ledger nothing is sent.
                return DeviceDeliveryResult(device.id, DeviceStatus.SKIPPED, Reason.DEDUPE_UNAVAILABLE)
            outcome = await self._attempt(target, content)
            result = self._result(device.id, outcome)
            if outcome is not DeliveryOutcome.DELIVERED:
                return result
            try:
                await self._ledger.async_record(fingerprint)
            except Exception as err:  # noqa: BLE001 - the notification is out; only the record failed
                _LOGGER.error(
                    "Domus notification %s: delivered to device %s but not recorded (%s); "
                    "a retry with the same key may repeat it",
                    request_id,
                    device.id,
                    type(err).__name__,
                )
                return DeviceDeliveryResult(
                    device.id, DeviceStatus.DELIVERED, warning=DeliveryWarning.DEDUPE_NOT_RECORDED
                )
            return result

    async def _attempt(
        self, target: EntityTarget | LegacyServiceTarget, content: _Content
    ) -> DeliveryOutcome:
        async with self._semaphore:
            return await self._send(self.hass, target, content.message, content.title, timeout=self._timeout)

    @staticmethod
    def _result(device_id: str, outcome: DeliveryOutcome) -> DeviceDeliveryResult:
        if outcome is DeliveryOutcome.DELIVERED:
            return DeviceDeliveryResult(device_id, DeviceStatus.DELIVERED)
        if outcome is DeliveryOutcome.TIMEOUT:
            return DeviceDeliveryResult(device_id, DeviceStatus.FAILED, Reason.DELIVERY_TIMEOUT)
        if outcome is DeliveryOutcome.TARGET_UNAVAILABLE:
            return DeviceDeliveryResult(device_id, DeviceStatus.SKIPPED, Reason.TARGET_UNAVAILABLE)
        return DeviceDeliveryResult(device_id, DeviceStatus.FAILED, Reason.DELIVERY_FAILED)
