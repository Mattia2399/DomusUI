"""Shared fixtures for the Domus UI Home Assistant integration tests."""

from collections.abc import Generator

import pytest


def _start_dns_shutdown_thread() -> None:
    """Start pycares's process-wide shutdown thread before any test runs.

    pycares 5 starts one daemon thread with the first DNS channel of the
    process (a websocket test client opens one) and keeps it until exit. The
    test plugin of Home Assistant 2025.1 reports it as a thread left behind by
    whichever test opened that first channel; newer plugins allow it. Started
    here, it is already running when every test begins.
    """
    try:
        from pycares import _shutdown_manager
    except ImportError:  # pycares before 5 has no such thread
        return
    _shutdown_manager.start()


_start_dns_shutdown_thread()


@pytest.fixture(autouse=True)
def enable_domus_ui_custom_integration(
    enable_custom_integrations: None,
) -> Generator[None]:
    """Allow Home Assistant to load integrations from custom_components."""
    yield
