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
from collections.abc import AsyncIterator, Awaitable, Callable, Sequence
from contextlib import asynccontextmanager
from dataclasses import dataclass
from uuid import uuid4

from homeassistant.core import HomeAssistant

from ..profile.devices import DeviceInspector, LiveStatus, OwnershipView
from ..profile.identity import (
    AccountEligibility,
    PersonIdentity,
    ResolutionStatus,
    account_eligibility,
    list_persons,
    resolve_person_id,
)
from ..profile.manager import ProfileManager
from ..profile.models import DeviceNotInProfileError, DomusUserProfile, PersonalDevice, ProfileError
from ..profile.targets import (
    AmbiguousTarget,
    EntityTarget,
    LegacyServiceTarget,
    resolve_notification_target,
)
from .delivery import DELIVERY_TIMEOUT, DeliveryOutcome, async_send_target
from .ledger import LedgerUnavailableError, NotificationLedger, delivery_fingerprint
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
        persons = list_persons(self.hass)
        results = await asyncio.gather(
            *(self._recipient(request_id, person_id, persons, content) for person_id in request.recipients),
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
        profile, reason = self._usable_profile(user_id)
        if profile is None:
            if personal_device_id is not None:
                raise DeviceNotInProfileError("This device is not in your profile")
            return RecipientResult(None, RecipientStatus.SKIPPED, reason)
        if personal_device_id is not None and not any(
            device.id == personal_device_id for device in profile.personal_devices
        ):
            raise DeviceNotInProfileError("This device is not in your profile")
        result = await self._deliver_profile(request_id, None, user_id, profile, content, personal_device_id)
        _LOGGER.debug("Domus self test %s: %s", request_id, result.status.value)
        return result

    async def _recipient(
        self,
        request_id: str,
        person_id: str,
        persons: Sequence[PersonIdentity],
        content: _Content,
    ) -> RecipientResult:
        resolution = resolve_person_id(persons, person_id)
        if resolution.status is ResolutionStatus.UNKNOWN:
            return RecipientResult(person_id, RecipientStatus.SKIPPED, Reason.UNKNOWN_RECIPIENT)
        if resolution.status is ResolutionStatus.AMBIGUOUS:
            return RecipientResult(person_id, RecipientStatus.SKIPPED, Reason.AMBIGUOUS_RECIPIENT)
        user_id = resolution.person.user_id if resolution.person is not None else None
        if user_id is None:
            return RecipientResult(person_id, RecipientStatus.SKIPPED, Reason.NO_ACCOUNT)
        user = await self.hass.auth.async_get_user(user_id)
        if user is None:
            return RecipientResult(person_id, RecipientStatus.SKIPPED, Reason.ACCOUNT_UNAVAILABLE)
        eligibility = account_eligibility(user)
        if eligibility is AccountEligibility.SYSTEM:
            return RecipientResult(person_id, RecipientStatus.SKIPPED, Reason.ACCOUNT_UNAVAILABLE)
        if eligibility is AccountEligibility.DISABLED:
            return RecipientResult(person_id, RecipientStatus.SKIPPED, Reason.ACCOUNT_DISABLED)
        profile, reason = self._usable_profile(user_id)
        if profile is None:
            return RecipientResult(person_id, RecipientStatus.SKIPPED, reason)
        return await self._deliver_profile(request_id, person_id, user_id, profile, content, None)

    def _usable_profile(self, user_id: str) -> tuple[DomusUserProfile | None, Reason | None]:
        try:
            view = self._profiles.get_profile(user_id)
        except ProfileError:
            return None, Reason.PROFILE_UNAVAILABLE
        # A synthesized profile is not a configured one.
        if not view.persisted or view.profile is None:
            return None, Reason.NO_PROFILE
        if not view.profile.active:
            return None, Reason.PROFILE_UNAVAILABLE
        return view.profile, None

    async def _deliver_profile(
        self,
        request_id: str,
        person_id: str | None,
        user_id: str,
        profile: DomusUserProfile,
        content: _Content,
        only_device_id: str | None,
    ) -> RecipientResult:
        devices = [
            device
            for device in profile.personal_devices
            if only_device_id is None or device.id == only_device_id
        ]
        if not profile.notifications_enabled:
            # The general switch wins: devices are not even looked at, and their switches stay as they are.
            return RecipientResult(person_id, RecipientStatus.SKIPPED, Reason.NOTIFICATIONS_DISABLED)
        if not devices:
            return RecipientResult(person_id, RecipientStatus.SKIPPED, Reason.NO_DEVICES)
        due = [device for device in devices if device.notifications_enabled]
        if not due:
            return RecipientResult(person_id, RecipientStatus.SKIPPED, Reason.NOTIFICATIONS_DISABLED)
        inspector = DeviceInspector(self.hass, user_id)
        ownership = self._profiles.ownership()
        results = await asyncio.gather(
            *(self._device(request_id, person_id, inspector, ownership, device, content) for device in due),
            return_exceptions=True,
        )
        outcome: list[DeviceDeliveryResult] = []
        for device, result in zip(due, results, strict=True):
            if isinstance(result, BaseException):
                if isinstance(result, asyncio.CancelledError):
                    raise result
                _LOGGER.error(
                    "Domus notification %s: device %s failed unexpectedly (%s)",
                    request_id,
                    device.id,
                    type(result).__name__,
                )
                result = DeviceDeliveryResult(device.id, DeviceStatus.FAILED, Reason.DELIVERY_FAILED)
            outcome.append(result)
        return summarize(person_id, outcome)

    async def _device(
        self,
        request_id: str,
        person_id: str | None,
        inspector: DeviceInspector,
        ownership: OwnershipView,
        device: PersonalDevice,
        content: _Content,
    ) -> DeviceDeliveryResult:
        status = inspector.live_status(device, ownership)
        if status in (LiveStatus.UNVERIFIED, LiveStatus.OWNERSHIP_CONFLICT):
            # Home Assistant no longer ties the device to this user: never send to it.
            return DeviceDeliveryResult(device.id, DeviceStatus.SKIPPED, Reason.DEVICE_NOT_VERIFIED)
        if status is not LiveStatus.ACTIVE:
            return DeviceDeliveryResult(device.id, DeviceStatus.SKIPPED, Reason.TARGET_UNAVAILABLE)
        target = resolve_notification_target(self.hass, device.ha_device_id, inspector.registrations)
        if isinstance(target, AmbiguousTarget):
            return DeviceDeliveryResult(device.id, DeviceStatus.SKIPPED, Reason.AMBIGUOUS_TARGET)
        if not isinstance(target, (EntityTarget, LegacyServiceTarget)):
            return DeviceDeliveryResult(device.id, DeviceStatus.SKIPPED, Reason.TARGET_UNAVAILABLE)
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
