"""Lifecycle owner for the backend services that form Domus Core."""

from __future__ import annotations

import asyncio
from enum import StrEnum

from homeassistant.core import HomeAssistant

from .audit import DomusAuditService
from .context import ContextRegistry
from .event_bus import DomusEventBus


class RuntimeState(StrEnum):
    """Observable lifecycle states used by tests and diagnostics."""

    STOPPED = "stopped"
    STARTING = "starting"
    RUNNING = "running"
    STOPPING = "stopping"


class DomusRuntime:
    """Own and coordinate the lightweight Domus Core services."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self.events = DomusEventBus()
        self.context = ContextRegistry()
        self.audit = DomusAuditService()
        self._state = RuntimeState.STOPPED
        self._lifecycle_lock = asyncio.Lock()

    @property
    def state(self) -> RuntimeState:
        """Return the current lifecycle state."""
        return self._state

    @property
    def running(self) -> bool:
        """Return whether every core service is available."""
        return self._state is RuntimeState.RUNNING

    async def async_setup(self) -> None:
        """Start owned services once, safely handling concurrent callers."""
        async with self._lifecycle_lock:
            if self._state is RuntimeState.RUNNING:
                return
            self._state = RuntimeState.STARTING
            try:
                await self.events.async_setup()
                await self.context.async_setup()
                await self.audit.async_setup()
            except Exception:
                await self.audit.async_shutdown()
                await self.context.async_shutdown()
                await self.events.async_shutdown()
                self._state = RuntimeState.STOPPED
                raise
            self._state = RuntimeState.RUNNING

    async def async_shutdown(self) -> None:
        """Stop owned services in a deterministic, idempotent order."""
        async with self._lifecycle_lock:
            if self._state is RuntimeState.STOPPED:
                return
            self._state = RuntimeState.STOPPING
            try:
                # Stop new publications first; keep audit alive until the other
                # registries have released their runtime references.
                await self.events.async_shutdown()
                await self.context.async_shutdown()
                await self.audit.async_shutdown()
            finally:
                self._state = RuntimeState.STOPPED
