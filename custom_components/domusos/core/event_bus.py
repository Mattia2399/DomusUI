"""Lightweight process-local event bus for Domus Core."""

from __future__ import annotations

import asyncio
import inspect
import logging
from collections import defaultdict
from collections.abc import Awaitable, Callable

from homeassistant.core import callback

from ._values import validate_contract_type
from .events import DomusEvent

_LOGGER = logging.getLogger(__name__)

DomusEventSubscriber = Callable[[DomusEvent], Awaitable[None] | None]
UnsubscribeCallback = Callable[[], None]


class DomusEventBus:
    """Deliver typed internal events without exposing a public HA event API."""

    def __init__(self) -> None:
        self._subscribers: dict[str, set[DomusEventSubscriber]] = defaultdict(set)
        self._all_subscribers: set[DomusEventSubscriber] = set()
        self._running = False

    @property
    def running(self) -> bool:
        """Return whether the bus accepts publications."""
        return self._running

    async def async_setup(self) -> None:
        """Start the event bus."""
        self._running = True

    async def async_shutdown(self) -> None:
        """Stop delivery and release every subscription."""
        self._running = False
        self._subscribers.clear()
        self._all_subscribers.clear()

    def subscribe(
        self,
        event_type: str,
        subscriber: DomusEventSubscriber,
    ) -> UnsubscribeCallback:
        """Subscribe to one event type and return an idempotent unsubscribe."""
        validate_contract_type(event_type, field="event type")
        self._subscribers[event_type].add(subscriber)

        @callback
        def unsubscribe() -> None:
            subscribers = self._subscribers.get(event_type)
            if subscribers is None:
                return
            subscribers.discard(subscriber)
            if not subscribers:
                self._subscribers.pop(event_type, None)

        return unsubscribe

    def subscribe_all(self, subscriber: DomusEventSubscriber) -> UnsubscribeCallback:
        """Subscribe to every internal Domus event."""
        self._all_subscribers.add(subscriber)

        @callback
        def unsubscribe() -> None:
            self._all_subscribers.discard(subscriber)

        return unsubscribe

    async def async_publish(self, event: DomusEvent) -> None:
        """Publish an event, isolating each subscriber from every other one."""
        if not self._running:
            raise RuntimeError("Domus event bus is not running")

        # Preserve registration groups while preventing a callback subscribed
        # both specifically and globally from receiving the same envelope twice.
        subscribers = tuple(
            dict.fromkeys(
                (
                    *self._subscribers.get(event.type, ()),
                    *self._all_subscribers,
                )
            )
        )
        if not subscribers:
            return
        await asyncio.gather(
            *(self._async_deliver(subscriber, event) for subscriber in subscribers)
        )

    @staticmethod
    async def _async_deliver(
        subscriber: DomusEventSubscriber, event: DomusEvent
    ) -> None:
        try:
            result = subscriber(event)
            if inspect.isawaitable(result):
                await result
        except Exception:  # A faulty domain module must not stop other modules.
            _LOGGER.exception(
                "Domus event subscriber failed for event type %s", event.type
            )
