"""Shared fixtures for the Domus UI Home Assistant integration tests."""

from collections.abc import Generator

import pytest


@pytest.fixture(autouse=True)
def enable_domus_ui_custom_integration(
    enable_custom_integrations: None,
) -> Generator[None]:
    """Allow Home Assistant to load integrations from custom_components."""
    yield
