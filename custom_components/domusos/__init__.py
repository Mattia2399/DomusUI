"""Domus UI integration."""

from __future__ import annotations

import inspect
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType

from .calendar_store import DomusCalendarStore
from .const import (
    DOMAIN,
    PANEL_ICON,
    PANEL_TITLE,
    PANEL_URL_PATH,
    PANEL_WEB_COMPONENT,
    STATIC_URL_PATH,
    VERSION,
)
from .context_providers import register_core_bindings
from .core import DomusRuntime
from .irrigation import IrrigationManager
from .irrigation.api import async_register_irrigation_api

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)
PLATFORMS = [Platform.CALENDAR]


@dataclass(slots=True)
class DomusEntryData:
    """Runtime objects owned by the single Domus UI config entry."""

    runtime: DomusRuntime
    irrigation_manager: IrrigationManager
    calendar_manager: DomusCalendarStore
    unregister_core_bindings: Callable[[], None] | None = None


DomusConfigEntry = ConfigEntry[DomusEntryData]


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
    await async_register_irrigation_api(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: DomusConfigEntry) -> bool:
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
    if (
        "handle_safe_area"
        in inspect.signature(panel_custom.async_register_panel).parameters
    ):
        panel_options["handle_safe_area"] = True

    runtime = DomusRuntime(hass)
    manager = IrrigationManager(hass)
    calendar_manager = DomusCalendarStore(hass)
    entry_data = DomusEntryData(
        runtime=runtime,
        irrigation_manager=manager,
        calendar_manager=calendar_manager,
    )
    runtime_started = False
    manager_started = False
    calendar_started = False
    try:
        runtime_started = True
        await runtime.async_setup()
        domain_data["runtime"] = runtime
        manager_started = True
        await manager.async_setup()
        calendar_started = True
        await calendar_manager.async_setup()
        entry_data.unregister_core_bindings = register_core_bindings(
            hass,
            runtime,
            calendar_manager,
            manager,
        )
        await panel_custom.async_register_panel(hass=hass, **panel_options)
        domain_data["irrigation_manager"] = manager
        domain_data["calendar_manager"] = calendar_manager
        entry.runtime_data = entry_data
        await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    except Exception:
        if _panel_exists(hass, PANEL_URL_PATH):
            frontend.async_remove_panel(hass, PANEL_URL_PATH)
        if domain_data.get("irrigation_manager") is manager:
            domain_data.pop("irrigation_manager", None)
        if domain_data.get("calendar_manager") is calendar_manager:
            domain_data.pop("calendar_manager", None)
        if domain_data.get("runtime") is runtime:
            domain_data.pop("runtime", None)
        if entry_data.unregister_core_bindings is not None:
            entry_data.unregister_core_bindings()
            entry_data.unregister_core_bindings = None
        if getattr(entry, "runtime_data", None) is entry_data:
            entry.runtime_data = None
        if calendar_started:
            await calendar_manager.async_shutdown()
        if manager_started:
            await manager.async_shutdown()
        if runtime_started:
            await runtime.async_shutdown()
        raise

    entry.async_on_unload(entry.add_update_listener(_async_update_listener))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: DomusConfigEntry) -> bool:
    """Unload Domus UI and remove its sidebar panel."""
    if not await hass.config_entries.async_unload_platforms(entry, PLATFORMS):
        return False
    if _panel_exists(hass, PANEL_URL_PATH):
        frontend.async_remove_panel(hass, PANEL_URL_PATH)
    entry_data = getattr(entry, "runtime_data", None)
    if (
        isinstance(entry_data, DomusEntryData)
        and entry_data.unregister_core_bindings is not None
    ):
        entry_data.unregister_core_bindings()
        entry_data.unregister_core_bindings = None
    manager = (
        entry_data.irrigation_manager
        if isinstance(entry_data, DomusEntryData)
        else entry_data
    )
    domain_data = hass.data.get(DOMAIN, {})
    if isinstance(manager, IrrigationManager):
        await manager.async_shutdown()
        if domain_data.get("irrigation_manager") is manager:
            domain_data.pop("irrigation_manager", None)
    calendar_manager = (
        entry_data.calendar_manager
        if isinstance(entry_data, DomusEntryData)
        else domain_data.get("calendar_manager")
    )
    if isinstance(calendar_manager, DomusCalendarStore):
        await calendar_manager.async_shutdown()
        if domain_data.get("calendar_manager") is calendar_manager:
            domain_data.pop("calendar_manager", None)
    runtime = (
        entry_data.runtime
        if isinstance(entry_data, DomusEntryData)
        else domain_data.get("runtime")
    )
    if isinstance(runtime, DomusRuntime):
        await runtime.async_shutdown()
        if domain_data.get("runtime") is runtime:
            domain_data.pop("runtime", None)
    return True


async def _async_update_listener(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Reload Domus UI after an entry update."""
    await hass.config_entries.async_reload(entry.entry_id)
