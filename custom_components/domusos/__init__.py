"""Domus UI integration."""

from __future__ import annotations

import inspect
from pathlib import Path
from typing import Any

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType

from .const import (
    DOMAIN,
    PANEL_ICON,
    PANEL_TITLE,
    PANEL_URL_PATH,
    PANEL_WEB_COMPONENT,
    STATIC_URL_PATH,
    VERSION,
)

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


def _panel_exists(hass: HomeAssistant, frontend_url_path: str) -> bool:
    """Return whether a panel exists across supported Home Assistant versions."""
    panel_exists = getattr(frontend, "async_panel_exists", None)
    if callable(panel_exists):
        return bool(panel_exists(hass, frontend_url_path))

    panels_key = getattr(frontend, "DATA_PANELS", None)
    if panels_key is None:
        return False
    return frontend_url_path in hass.data.get(panels_key, {})


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up Domus UI."""
    return True


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry
) -> bool:
    """Register the Domus UI static frontend and sidebar panel."""
    frontend_directory = Path(__file__).parent / "frontend"
    index_file = frontend_directory / "index.html"
    panel_module = frontend_directory / "ha-dashboard-builder-panel.js"

    if not index_file.is_file() or not panel_module.is_file():
        raise FileNotFoundError(
            "Domus UI frontend assets are missing. Reinstall the integration from HACS."
        )

    domain_data = hass.data.setdefault(DOMAIN, {})
    if not domain_data.get("static_registered"):
        await hass.http.async_register_static_paths(
            [
                StaticPathConfig(
                    STATIC_URL_PATH,
                    str(frontend_directory),
                    cache_headers=False,
                )
            ]
        )
        domain_data["static_registered"] = True

    if _panel_exists(hass, PANEL_URL_PATH):
        raise ConfigEntryError(
            "The 'domusos' panel path is already in use. Remove the legacy "
            "panel_custom entry before setting up the HACS integration."
        )

    panel_options: dict[str, Any] = {
        "frontend_url_path": PANEL_URL_PATH,
        "webcomponent_name": PANEL_WEB_COMPONENT,
        "module_url": f"{STATIC_URL_PATH}/ha-dashboard-builder-panel.js?v={VERSION}",
        "sidebar_title": PANEL_TITLE,
        "sidebar_icon": PANEL_ICON,
        "require_admin": False,
        "config": {
            "app_url": f"{STATIC_URL_PATH}/index.html?v={VERSION}",
            "integration_domain": DOMAIN,
            "version": VERSION,
        },
    }
    if "handle_safe_area" in inspect.signature(
        panel_custom.async_register_panel
    ).parameters:
        panel_options["handle_safe_area"] = True

    await panel_custom.async_register_panel(hass=hass, **panel_options)

    entry.async_on_unload(
        entry.add_update_listener(_async_update_listener)
    )
    return True


async def async_unload_entry(
    hass: HomeAssistant, entry: ConfigEntry
) -> bool:
    """Unload Domus UI and remove its sidebar panel."""
    if _panel_exists(hass, PANEL_URL_PATH):
        frontend.async_remove_panel(hass, PANEL_URL_PATH)
    return True


async def _async_update_listener(
    hass: HomeAssistant, entry: ConfigEntry
) -> None:
    """Reload Domus UI after an entry update."""
    await hass.config_entries.async_reload(entry.entry_id)
