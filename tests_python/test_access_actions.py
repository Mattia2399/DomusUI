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
    # Device power
    "domusos/device_power/get_state": "device_power.manage",
    "domusos/device_power/save_policy": "device_power.manage",
    "domusos/device_power/bind_policy": "device_power.manage",
    "domusos/device_power/delete_policy": "device_power.manage",
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
_SERVICE = re.compile(r'hass\.services\.async_register\(\s*DOMAIN,\s*"([a-z_]+)"', re.S)
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
        # Websocket commands are registered only from each module's WEBSOCKET_COMMANDS.
        for call in re.findall(r"async_register_command\(([^)]*)\)", source):
            assert call.strip() == "hass, command", f"{path.name}: async_register_command({call})"


# --- The registry itself ------------------------------------------------------------------


def test_every_action_maps_to_the_audited_capability_and_mode() -> None:
    assert {contract.id: contract.capability for contract in actions.ACTION_CONTRACT_LIST} == EXPECTED


def test_no_action_is_declared_twice() -> None:
    ids = [contract.id for contract in actions.ACTION_CONTRACT_LIST]
    assert len(ids) == len(set(ids)) == len(actions.ACTION_CONTRACTS) == 38


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
    assert len(actions.contracts_for(Surface.WEBSOCKET)) == 33
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


def test_nothing_outside_access_control_uses_the_evaluator_yet() -> None:
    """P2.2 builds the engine without switching it on: no command calls it."""
    for path in INTEGRATION_DIR.rglob("*.py"):
        if path.parent.name == "access":
            continue
        source = path.read_text(encoding="utf-8")
        for name in ("access.authorization", "access.adapters", "require_capability", "authorize_service_call", "authorize_user"):
            assert name not in source, f"{path.relative_to(INTEGRATION_DIR)} uses {name}"
