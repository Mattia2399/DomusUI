"""The action registry: every Domus backend entry point declared, correctly (S8).

The registrations are read from the integration's source here, on any
machine; ``test_access_authorization_ha.py`` checks the same set against what
Home Assistant actually registers.
"""

from __future__ import annotations

import re

import pytest
from access_pure import INTEGRATION_DIR, load

models = load("models")
actions = load("actions")

AuthMode = actions.AuthMode
Surface = actions.SurfaceKind
EXPECTED = {
    # Access Control
    "domusos/access/get_self": None,
    "domusos/access/reset_policy": "access.manage",
    "domusos/access/get_shadow_diagnostics": "access.manage",
    "domusos/access/reset_shadow_diagnostics": "access.manage",
    "domusos/access/list_accounts": "access.manage",
    "domusos/access/set_assignment": "access.manage",
    "domusos/access/remove_assignment": "access.manage",
    # Device power
    "domusos/device_power/get_state": "device_power.manage",
    "domusos/device_power/save_policy": "device_power.manage",
    "domusos/device_power/bind_policy": "device_power.manage",
    "domusos/device_power/delete_policy": "device_power.manage",
    "domusos/climate/get_config": "climate.view",
    "domusos/climate/save_config": "climate.manage",
    "domusos/climate/get_state": "climate.view",
    "domusos/climate/set_house_intent": "climate.control",
    "domusos/climate/set_zone_intent": "climate.control",
    # Device timers
    "domusos/device_timers/get_state": "devices.timers",
    "domusos/device_timers/subscribe": "devices.timers",
    "domusos/device_timers/set_timer": "devices.timers",
    "domusos/device_timers/cancel_timer": "devices.timers",
    # Energy
    "domusos/energy/get_state": "energy.view",
    "domusos/energy/get_history": "energy.view",
    "domusos/energy/get_profile": "energy.manage",
    "domusos/energy/save_profile": "energy.manage",
    "domusos/energy/discover": "energy.manage",
    # Irrigation
    "domusos/irrigation/get_config": "irrigation.view",
    "domusos/irrigation/get_state": "irrigation.view",
    "domusos/irrigation/subscribe": "irrigation.view",
    "domusos/irrigation/save_config": "irrigation.manage",
    "domusos/irrigation/prepare_legacy_removal": "irrigation.manage",
    "domusos/irrigation/start_zone": "irrigation.control",
    "domusos/irrigation/stop_zone": "irrigation.control",
    "domusos/irrigation/pause": "irrigation.control",
    "domusos/irrigation/resume": "irrigation.control",
    "domusos/irrigation/stop_all": "irrigation.control",
    "domusos.start_irrigation_zone": "irrigation.control",
    "domusos.stop_irrigation_zone": "irrigation.control",
    "domusos.pause_irrigation": "irrigation.control",
    "domusos.resume_irrigation": "irrigation.control",
    "domusos.stop_all_irrigation": "irrigation.control",
    # Profile
    "domusos/profile/get_self": "profile.manage",
    "domusos/profile/save_self": "profile.manage",
    "domusos/profile/discover_devices": "profile.manage",
    "domusos/profile/add_device": "profile.manage",
    "domusos/profile/remove_device": "profile.manage",
    "domusos/profile/update_device": "profile.manage",
    "domusos/profile/test_self": "profile.manage",
    "domusos/profile/list_recipients": "notifications.recipients",
    # Waste collection
    "domusos/waste_collection/get_config": "waste.view",
    "domusos/waste_collection/preview": "waste.view",
    "domusos/waste_collection/save_config": "waste.manage",
    "domusos/waste_collection/test_notification": "waste.manage",
}


# --- Registrations read from the source -----------------------------------------------

_PREFIX = re.compile(r'WS_PREFIX\s*=\s*f"\{DOMAIN\}/([a-z_]+)"')
_COMMAND = re.compile(r'f"\{WS_PREFIX\}/([a-z_]+)"')
_GENERATED = re.compile(r'f"\{WS_PREFIX\}/\{command\}"')
_SIMPLE = re.compile(r'_simple_command\("([a-z_]+)"\)')
_SERVICE = re.compile(r'register_service\(\s*hass,\s*"([a-z_]+)"', re.DOTALL)
# The one module that hands registrations to Home Assistant, wrapping each for shadow authorization.
INSTRUMENTATION = INTEGRATION_DIR / "access" / "instrumentation.py"
_OTHER_REGISTRATIONS = (
    "async_register_admin_service",
    "async_register_entity_service",
    "register_entity_service",
    "async_register_platform_entity_service",
    "HomeAssistantView",
    "register_view",
)


def registered_in_source() -> set[str]:
    found: set[str] = set()
    for path in INTEGRATION_DIR.rglob("*.py"):
        source = path.read_text(encoding="utf-8")
        prefix = _PREFIX.search(source)
        commands = set(_COMMAND.findall(source))
        if _GENERATED.search(source):
            commands |= set(_SIMPLE.findall(source))
        if commands:
            assert prefix, f"{path.name} names websocket commands without a WS_PREFIX"
            found |= {f"domusos/{prefix.group(1)}/{command}" for command in commands}
        found |= {f"domusos.{service}" for service in _SERVICE.findall(source)}
    return found


def test_the_source_registers_exactly_the_audited_entry_points() -> None:
    assert registered_in_source() == set(EXPECTED)


def test_every_registered_entry_point_is_declared_s8() -> None:
    registered = registered_in_source()
    assert actions.undeclared_actions(registered) == []
    assert actions.stale_contracts(registered) == []


def test_a_new_undeclared_command_or_service_is_caught() -> None:
    registered = registered_in_source() | {"domusos/energy/delete_everything", "domusos.open_all_doors"}
    assert actions.undeclared_actions(registered) == ["domusos.open_all_doors", "domusos/energy/delete_everything"]
    assert actions.stale_contracts(registered_in_source() - {"domusos/energy/get_state"}) == ["domusos/energy/get_state"]


def test_the_integration_has_no_other_way_to_register_an_entry_point() -> None:
    for path in INTEGRATION_DIR.rglob("*.py"):
        source = path.read_text(encoding="utf-8")
        for pattern in _OTHER_REGISTRATIONS:
            assert pattern not in source, f"{path.name} uses {pattern}: declare it in access/actions.py"
        if path == INSTRUMENTATION:
            continue
        # Home Assistant receives registrations only from the instrumentation, never directly.
        assert "async_register_command" not in source, f"{path.name} registers a command around shadow authorization"
        assert "services.async_register(" not in source, f"{path.name} registers a service around shadow authorization"
        # Websocket commands go through it only as each module's WEBSOCKET_COMMANDS.
        for call in re.findall(r"register_websocket_commands\(([^)]*)\)", source):
            assert call.strip() == "hass, WEBSOCKET_COMMANDS", f"{path.name}: register_websocket_commands({call})"
    instrumentation = INSTRUMENTATION.read_text(encoding="utf-8")
    assert instrumentation.count("async_register_command(") == 1
    assert "websocket_api.async_register_command(hass, observed_command(command))" in instrumentation
    assert instrumentation.count("services.async_register(") == 1
    assert "hass.services.async_register(DOMAIN, service, target, schema=schema)" in instrumentation


def test_every_module_with_commands_registers_them_through_the_instrumentation() -> None:
    modules = 0
    for path in INTEGRATION_DIR.rglob("*.py"):
        source = path.read_text(encoding="utf-8")
        if re.search(r"^WEBSOCKET_COMMANDS = \(", source, re.MULTILINE):
            modules += 1
            assert "register_websocket_commands(hass, WEBSOCKET_COMMANDS)" in source, path.name
    assert modules == 8


# --- The registry itself ------------------------------------------------------------------


def test_every_action_maps_to_the_audited_capability_and_mode() -> None:
    assert {contract.id: contract.capability for contract in actions.ACTION_CONTRACT_LIST} == EXPECTED


def test_no_action_is_declared_twice() -> None:
    ids = [contract.id for contract in actions.ACTION_CONTRACT_LIST]
    # 38 in P2.2, the two shadow diagnostics commands of P2.3, the three of People and access (P2.4.1),
    # the four of device timers.
    assert len(ids) == len(set(ids)) == len(actions.ACTION_CONTRACTS) == 52


def test_every_capability_exists_and_is_enforced_by_domus() -> None:
    for contract in actions.ACTION_CONTRACT_LIST:
        if contract.capability is None:
            continue
        entry = models.capability(contract.capability)
        assert entry is not None, contract.id
        # A backend action is guarded by what Domus enforces, never a browser-only or HA-native capability.
        assert entry.enforcement is models.EnforcementKind.DOMUS, contract.id


def test_surfaces_match_their_names() -> None:
    for contract in actions.ACTION_CONTRACT_LIST:
        if contract.surface is Surface.WEBSOCKET:
            assert re.fullmatch(r"domusos/[a-z_]+/[a-z_]+", contract.id), contract.id
        else:
            assert contract.surface is Surface.SERVICE and re.fullmatch(r"domusos\.[a-z_]+", contract.id), contract.id
    assert len(actions.contracts_for(Surface.WEBSOCKET)) == 47
    assert len(actions.contracts_for(Surface.SERVICE)) == 5


def test_only_two_named_exceptions_to_a_plain_capability() -> None:
    special = {contract.id: contract for contract in actions.ACTION_CONTRACT_LIST if contract.auth_mode is not AuthMode.CAPABILITY}
    assert set(special) == {"domusos/access/get_self", "domusos/access/reset_policy"}
    get_self = special["domusos/access/get_self"]
    assert get_self.auth_mode is AuthMode.AUTHENTICATED_BOOTSTRAP and get_self.capability is None
    reset = special["domusos/access/reset_policy"]
    assert reset.auth_mode is AuthMode.RECOVERY and reset.capability == "access.manage"
    for contract in special.values():
        assert contract.rationale and len(contract.rationale) > 40, contract.id
    for contract in actions.ACTION_CONTRACT_LIST:
        if contract.auth_mode is AuthMode.CAPABILITY:
            assert contract.capability is not None, contract.id


def test_what_home_assistant_already_checks_is_recorded() -> None:
    admin_only = {contract.id for contract in actions.ACTION_CONTRACT_LIST if contract.ha_check is actions.HaCheck.ADMIN}
    for contract in actions.ACTION_CONTRACT_LIST:
        if contract.capability is not None and models.capability(contract.capability).requires_ha_admin:
            assert contract.id in admin_only, contract.id
    controls = [contract for contract in actions.ACTION_CONTRACT_LIST if contract.capability == "irrigation.control"]
    assert all(contract.ha_check is actions.HaCheck.ENTITY_CONTROL for contract in controls)


@pytest.mark.parametrize("capability", sorted(
    entry.id for entry in models.ACCESS_CAPABILITIES.values() if entry.enforcement is not models.EnforcementKind.DOMUS
))
def test_ha_native_and_local_capabilities_have_no_backend_action(capability) -> None:
    assert capability not in {contract.capability for contract in actions.ACTION_CONTRACT_LIST}


# --- Shadow authorization (P2.3) ------------------------------------------------------------

SHADOW_EXEMPT = {
    "domusos/access/get_self",
    "domusos/access/reset_policy",
    "domusos/access/get_shadow_diagnostics",
    "domusos/access/reset_shadow_diagnostics",
    "domusos/access/list_accounts",
    "domusos/access/set_assignment",
    "domusos/access/remove_assignment",
}
ENFORCEMENT_PRIMITIVES = (
    "require_capability",
    "require_action",
    "require_user_capability",
    "require_service_capability",
    "AuthorizationDeniedError",
)


def test_only_named_entry_points_are_exempt_from_shadow_and_each_says_why() -> None:
    exempt = {contract.id: contract for contract in actions.ACTION_CONTRACT_LIST if contract.shadow_exemption is not None}
    assert set(exempt) == SHADOW_EXEMPT
    for contract in exempt.values():
        assert len(contract.shadow_exemption) > 40, contract.id
    observed = actions.shadow_contracts()
    assert {contract.id for contract in observed} == set(EXPECTED) - SHADOW_EXEMPT
    assert len([contract for contract in observed if contract.surface is Surface.WEBSOCKET]) == 40
    assert len([contract for contract in observed if contract.surface is Surface.SERVICE]) == 5


def test_the_shadow_diagnostics_are_protected_not_bootstrap() -> None:
    for action in (
        "domusos/access/get_shadow_diagnostics",
        "domusos/access/reset_shadow_diagnostics",
        "domusos/access/list_accounts",
        "domusos/access/set_assignment",
        "domusos/access/remove_assignment",
    ):
        contract = actions.ACTION_CONTRACTS[action]
        assert contract.auth_mode is AuthMode.CAPABILITY and contract.capability == "access.manage"
        assert contract.ha_check is actions.HaCheck.ADMIN


def test_no_handler_enforces_the_evaluator_yet() -> None:
    """P2.3 observes: no command calls a primitive that could refuse it."""
    for path in INTEGRATION_DIR.rglob("*.py"):
        if path.parent.name == "access" and path.name in ("authorization.py", "adapters.py"):
            continue
        source = path.read_text(encoding="utf-8")
        for name in ENFORCEMENT_PRIMITIVES:
            assert name not in source, f"{path.relative_to(INTEGRATION_DIR)} uses {name}"


def test_modules_reach_access_control_only_through_the_instrumentation() -> None:
    for path in INTEGRATION_DIR.rglob("*.py"):
        if path.parent.name == "access":
            continue
        source = path.read_text(encoding="utf-8")
        for name in ("access.authorization", "access.adapters", "access.shadow", "authorize_user", "authorize_service"):
            assert name not in source, f"{path.relative_to(INTEGRATION_DIR)} uses {name}"
        for imported in re.findall(r"from \.\.access\.instrumentation import ([^\n]+)", source):
            assert set(map(str.strip, imported.split(","))) <= {"register_service", "register_websocket_commands"}, path.name


def test_every_refusal_code_of_the_modules_is_read_as_a_refusal() -> None:
    shadow = load("shadow")
    refusal = re.compile(r'class (\w*(?:Permission|Denied|NotHousehold|Disabled)\w*Error)\([^)]*\):\n(?:(?!class )[^\n]*\n)*?\s+code = "([a-z_]+)"')
    found = {}
    for path in INTEGRATION_DIR.rglob("models.py"):
        found.update(dict(refusal.findall(path.read_text(encoding="utf-8"))))
    assert len(found) >= 6, found
    for name, code in found.items():
        assert code in shadow.PERMISSION_ERROR_CODES, (name, code)
