"""Capability-based context provider registry for Domus Core."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Protocol, runtime_checkable

from homeassistant.core import callback

from ._values import (
    freeze_mapping,
    utc_now,
    validate_dotted_name,
    validate_timestamp,
)

_LOGGER = logging.getLogger(__name__)
DEFAULT_PROVIDER_TIMEOUT = 10.0


@runtime_checkable
class ContextProvider(Protocol):
    """Produce one optional, normalized part of the Domus context."""

    capability: str

    async def async_get_context(self) -> Mapping[str, Any] | None:
        """Return context data, or ``None`` when temporarily unavailable."""


@dataclass(frozen=True, slots=True)
class ContextSnapshot:
    """Immutable aggregate returned by the context registry."""

    generated_at: datetime
    capabilities: Mapping[str, Mapping[str, Any]] = field(default_factory=dict)
    missing: frozenset[str] = field(default_factory=frozenset)
    unavailable: frozenset[str] = field(default_factory=frozenset)

    def __post_init__(self) -> None:
        validate_timestamp(self.generated_at, field="context generated_at")
        object.__setattr__(self, "capabilities", freeze_mapping(self.capabilities))
        object.__setattr__(self, "missing", frozenset(self.missing))
        object.__setattr__(self, "unavailable", frozenset(self.unavailable))

    def get(self, capability: str) -> Mapping[str, Any] | None:
        """Return one capability fragment when present."""
        return self.capabilities.get(capability)


class ContextRegistry:
    """Register optional providers and aggregate only available capabilities."""

    def __init__(self, *, provider_timeout: float = DEFAULT_PROVIDER_TIMEOUT) -> None:
        if provider_timeout <= 0:
            raise ValueError("provider_timeout must be positive")
        self._providers: dict[str, ContextProvider] = {}
        self._provider_timeout = provider_timeout
        self._running = False

    @property
    def capabilities(self) -> frozenset[str]:
        """Return the registered capability names."""
        return frozenset(self._providers)

    async def async_setup(self) -> None:
        """Start accepting context snapshot requests."""
        self._running = True

    async def async_shutdown(self) -> None:
        """Stop snapshot requests and release registered providers."""
        self._running = False
        self._providers.clear()

    def register(self, provider: ContextProvider) -> Callable[[], None]:
        """Register one provider and return an idempotent unregister callback."""
        capability = validate_dotted_name(
            provider.capability, field="context capability"
        )
        if capability in self._providers:
            raise ValueError(f"Context capability already registered: {capability}")
        self._providers[capability] = provider

        @callback
        def unregister() -> None:
            if self._providers.get(capability) is provider:
                self._providers.pop(capability, None)

        return unregister

    def has_capability(self, capability: str) -> bool:
        """Return whether a provider is registered for a capability."""
        return capability in self._providers

    async def async_snapshot(
        self, requested_capabilities: Iterable[str] | None = None
    ) -> ContextSnapshot:
        """Aggregate providers without requiring every home to expose each one."""
        if not self._running:
            raise RuntimeError("Domus context registry is not running")

        if requested_capabilities is None:
            requested = tuple(self._providers)
        else:
            requested = tuple(
                dict.fromkeys(
                    validate_dotted_name(value, field="requested capability")
                    for value in requested_capabilities
                )
            )

        missing = frozenset(
            capability for capability in requested if capability not in self._providers
        )
        available_requests = tuple(
            (capability, self._providers[capability])
            for capability in requested
            if capability in self._providers
        )
        results = await asyncio.gather(
            *(
                self._async_read_provider(capability, provider)
                for capability, provider in available_requests
            )
        )

        capabilities: dict[str, Mapping[str, Any]] = {}
        unavailable: set[str] = set()
        for capability, value in results:
            if value is None:
                unavailable.add(capability)
            else:
                capabilities[capability] = value
        return ContextSnapshot(
            generated_at=utc_now(),
            capabilities=capabilities,
            missing=missing,
            unavailable=frozenset(unavailable),
        )

    async def _async_read_provider(
        self, capability: str, provider: ContextProvider
    ) -> tuple[str, Mapping[str, Any] | None]:
        try:
            async with asyncio.timeout(self._provider_timeout):
                value = await provider.async_get_context()
            if value is None:
                return capability, None
            if not isinstance(value, Mapping):
                raise TypeError("context providers must return a mapping or None")
            return capability, freeze_mapping(value)
        except Exception:
            _LOGGER.exception("Domus context provider failed: %s", capability)
            return capability, None
