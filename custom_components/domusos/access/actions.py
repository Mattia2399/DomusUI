"""Every backend entry point of Domus and what Access Control will require for it.

Each websocket command ``domusos/*`` and each service ``domusos.*`` the
integration registers is declared here, with the capability it needs
(docs/access-control-authorization.md). A contract test fails when one is
registered without being declared, so no entry point is forgotten.

Enforcement is switched on per action, here and only here: a contract with
``enforced`` is refused for real when Access Control denies it, before its
handler runs; every other one is still only observed (docs/access-control-enforcement.md).
Nothing can change that at runtime.

Only what the Domus backend runs belongs here. Native Home Assistant
commands sent by the browser (lights, locks, the alarm, registries...) never
reach Domus, so ``ha_native`` and ``local`` capabilities have no entry.

``ha_check`` records what Home Assistant already checks today on that entry
point: it stays in place, because the final rule is Home Assistant AND Domus.

Every entry point is observed by shadow authorization
(docs/access-control-shadow.md), except the few whose ``shadow_exemption``
says why not.

A service Home Assistant calls with no user (an automation, for example) has
no principal. Only a service whose contract sets
``allow_unattributed_ha_context`` may run from such a context, and only when
the context derives from another one (Q10, docs/access-control-enforcement.md).
Today those are exactly the five Irrigation services.

Plain Python on purpose: no Home Assistant import.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from enum import StrEnum

from .models import ACCESS_MANAGE


class SurfaceKind(StrEnum):
    WEBSOCKET = "websocket"
    SERVICE = "service"


class AuthMode(StrEnum):
    # The action's capability decides.
    CAPABILITY = "capability"
    # Any valid account: how a client learns its own capabilities.
    AUTHENTICATED_BOOTSTRAP = "authenticated_bootstrap"
    # Access management by a Home Assistant administrator (``access.manage``).
    RECOVERY = "recovery"


class HaCheck(StrEnum):
    """What Home Assistant or the module already checks there today."""

    NONE = "none"
    # websocket_api.require_admin, or the manager refusing non-administrators.
    ADMIN = "admin"
    # user.permissions.check_entity(entity, POLICY_READ) filters what is returned.
    ENTITY_READ = "entity_read"
    # user.permissions.check_entity(entity, POLICY_CONTROL) before acting.
    ENTITY_CONTROL = "entity_control"
    # Only the account's own household profile (require_household_account).
    HOUSEHOLD_SELF = "household_self"


@dataclass(frozen=True, slots=True)
class ActionContract:
    """One backend entry point: where it is, how it is authorized, what it needs."""

    id: str
    surface: SurfaceKind
    auth_mode: AuthMode
    capability: str | None
    ha_check: HaCheck = HaCheck.NONE
    # Required for anything that is not a plain capability check.
    rationale: str | None = None
    # Why shadow authorization does not observe this entry point; None means it is observed.
    shadow_exemption: str | None = None
    # A Home Assistant context without a user, derived from another context, may run it (Q10).
    # A deliberate opt-in: only services, never Access Control, never a websocket command.
    allow_unattributed_ha_context: bool = False
    # Access Control refuses the request for real when it denies it (P2.5D); otherwise shadow only.
    # Set per action in this table, never at runtime.
    enforced: bool = False


def _ws(command: str, capability: str, ha_check: HaCheck = HaCheck.NONE, *, enforced: bool = False) -> ActionContract:
    return ActionContract(
        f"domusos/{command}", SurfaceKind.WEBSOCKET, AuthMode.CAPABILITY, capability, ha_check, enforced=enforced
    )


def _service(
    service: str,
    capability: str,
    ha_check: HaCheck = HaCheck.NONE,
    *,
    allow_unattributed_ha_context: bool = False,
) -> ActionContract:
    return ActionContract(
        f"domusos.{service}",
        SurfaceKind.SERVICE,
        AuthMode.CAPABILITY,
        capability,
        ha_check,
        allow_unattributed_ha_context=allow_unattributed_ha_context,
    )


_A, _R, _C, _H = HaCheck.ADMIN, HaCheck.ENTITY_READ, HaCheck.ENTITY_CONTROL, HaCheck.HOUSEHOLD_SELF

# The declarations as written, so a repeated id is caught instead of silently replaced.
ACTION_CONTRACT_LIST: tuple[ActionContract, ...] = (
    # --- Access Control -----------------------------------------------------------------
    ActionContract(
        "domusos/access/get_self",
        SurfaceKind.WEBSOCKET,
        AuthMode.AUTHENTICATED_BOOTSTRAP,
        None,
        HaCheck.HOUSEHOLD_SELF,
        rationale="How a client learns its own role and capabilities: it cannot require one of them. "
        "Still refused without a valid household account.",
        shadow_exemption="Bootstrap: it never requires a capability, so it can never be a future denial.",
    ),
    ActionContract(
        "domusos/access/reset_policy",
        SurfaceKind.WEBSOCKET,
        AuthMode.RECOVERY,
        ACCESS_MANAGE,
        HaCheck.ADMIN,
        rationale="Recovery of an untrusted policy: only the active Home Assistant administrator of the "
        "connection, who always holds access.manage. A websocket command, never a service.",
        shadow_exemption="Already enforced since P2.1.2 (active Home Assistant administrator); not a shadow surface.",
    ),
    ActionContract(
        "domusos/access/get_shadow_diagnostics",
        SurfaceKind.WEBSOCKET,
        AuthMode.CAPABILITY,
        ACCESS_MANAGE,
        HaCheck.ADMIN,
        shadow_exemption="The shadow diagnostics themselves: observing them would count the reader in what it reads.",
    ),
    ActionContract(
        "domusos/access/reset_shadow_diagnostics",
        SurfaceKind.WEBSOCKET,
        AuthMode.CAPABILITY,
        ACCESS_MANAGE,
        HaCheck.ADMIN,
        shadow_exemption="Clears the shadow diagnostics: observing it would dirty the counters it just cleared.",
    ),
    # People and access: enforced from the start (active Home Assistant administrator with access.manage).
    *(
        ActionContract(
            f"domusos/access/{command}",
            SurfaceKind.WEBSOCKET,
            AuthMode.CAPABILITY,
            ACCESS_MANAGE,
            HaCheck.ADMIN,
            shadow_exemption="Access Control administration: already enforced on the connection's administrator, "
            "like the recovery; not a shadow surface.",
        )
        for command in ("list_accounts", "set_assignment", "remove_assignment")
    ),
    # --- Device power: enforced since P2.5D.1, the first domain ------------------------------
    _ws("device_power/get_state", "device_power.manage", _A, enforced=True),
    _ws("device_power/save_policy", "device_power.manage", _A, enforced=True),
    _ws("device_power/bind_policy", "device_power.manage", _A, enforced=True),
    _ws("device_power/delete_policy", "device_power.manage", _A, enforced=True),
    # --- Device timers: the switch-off the account could make now (HA entity control) --------
    _ws("device_timers/get_state", "devices.timers", _R),
    _ws("device_timers/subscribe", "devices.timers", _R),
    _ws("device_timers/set_timer", "devices.timers", _C),
    _ws("device_timers/cancel_timer", "devices.timers", _C),
    # --- Energy ----------------------------------------------------------------------------
    _ws("energy/get_state", "energy.view"),
    _ws("energy/get_history", "energy.view"),
    _ws("energy/get_profile", "energy.manage", _A),
    _ws("energy/save_profile", "energy.manage", _A),
    _ws("energy/discover", "energy.manage", _A),
    # --- Climate configuration: backend enforced from the first write -------------
    _ws("climate/get_config", "climate.view", enforced=True),
    _ws("climate/save_config", "climate.manage", _A, enforced=True),
    _ws("climate/get_house_rooms", "climate.manage", _A, enforced=True),
    _ws("climate/get_state", "climate.view", enforced=True),
    _ws("climate/set_house_intent", "climate.control", enforced=True),
    _ws("climate/set_zone_intent", "climate.control", enforced=True),
    _ws("climate/set_zone_override", "climate.control", enforced=True),
    _ws("climate/clear_zone_override", "climate.control", enforced=True),
    _ws("climate/execute_plan", "climate.control", enforced=True),
    # --- House Core: read-only, Rooms-scoped projection -------------------------------
    _ws("house/get_topology", "rooms.view", enforced=True),
    _ws("house/get_snapshot", "rooms.view", enforced=True),
    _ws("house/get_environment_shadow", "rooms.view", HaCheck.ADMIN, enforced=True),
    # Home may be available to accounts without rooms.view. House still filters
    # every entity through HA POLICY_READ before this narrow projection is built.
    _ws("dashboard/get_house_context", "dashboard.view", enforced=True),
    # --- Irrigation ------------------------------------------------------------------------
    _ws("irrigation/get_config", "irrigation.view", _R),
    _ws("irrigation/get_state", "irrigation.view", _R),
    _ws("irrigation/subscribe", "irrigation.view", _R),
    _ws("irrigation/save_config", "irrigation.manage", _A),
    _ws("irrigation/prepare_legacy_removal", "irrigation.manage", _A),
    _ws("irrigation/start_zone", "irrigation.control", _C),
    _ws("irrigation/stop_zone", "irrigation.control", _C),
    _ws("irrigation/pause", "irrigation.control", _C),
    _ws("irrigation/resume", "irrigation.control", _C),
    _ws("irrigation/stop_all", "irrigation.control", _C),
    # The house's own automations run these with no user (Q10): the only unattributed opt-in.
    _service("start_irrigation_zone", "irrigation.control", _C, allow_unattributed_ha_context=True),
    _service("stop_irrigation_zone", "irrigation.control", _C, allow_unattributed_ha_context=True),
    _service("pause_irrigation", "irrigation.control", _C, allow_unattributed_ha_context=True),
    _service("resume_irrigation", "irrigation.control", _C, allow_unattributed_ha_context=True),
    _service("stop_all_irrigation", "irrigation.control", _C, allow_unattributed_ha_context=True),
    # --- Profile (always the account's own) ------------------------------------------------
    _ws("profile/get_self", "profile.manage", _H),
    _ws("profile/save_self", "profile.manage", _H),
    _ws("profile/discover_devices", "profile.manage", _H),
    _ws("profile/add_device", "profile.manage", _H),
    _ws("profile/remove_device", "profile.manage", _H),
    _ws("profile/update_device", "profile.manage", _H),
    _ws("profile/test_self", "profile.manage", _H),
    _ws("profile/list_recipients", "notifications.recipients", _A),
    # --- Waste collection ------------------------------------------------------------------
    _ws("waste_collection/get_config", "waste.view"),
    _ws("waste_collection/preview", "waste.view"),
    _ws("waste_collection/save_config", "waste.manage", _A),
    _ws("waste_collection/test_notification", "waste.manage", _A),
)

ACTION_CONTRACTS: Mapping[str, ActionContract] = {contract.id: contract for contract in ACTION_CONTRACT_LIST}


def contracts_for(surface: SurfaceKind) -> list[ActionContract]:
    return [contract for contract in ACTION_CONTRACTS.values() if contract.surface is surface]


def shadow_contracts() -> list[ActionContract]:
    """The entry points shadow authorization observes, in declaration order."""
    return [contract for contract in ACTION_CONTRACT_LIST if contract.shadow_exemption is None]


def enforced_contracts() -> list[ActionContract]:
    """The entry points Access Control refuses for real, in declaration order."""
    return [contract for contract in ACTION_CONTRACT_LIST if contract.enforced]


def unattributed_contracts() -> list[ActionContract]:
    """The entry points a Home Assistant context without a user may run (Q10), in declaration order."""
    return [contract for contract in ACTION_CONTRACT_LIST if contract.allow_unattributed_ha_context]


def undeclared_actions(registered: Iterable[str]) -> list[str]:
    """Entry points the integration registers with no declaration here (contract test S8)."""
    return sorted(set(registered) - set(ACTION_CONTRACTS))


def stale_contracts(registered: Iterable[str]) -> list[str]:
    """Declarations whose entry point the integration no longer registers."""
    return sorted(set(ACTION_CONTRACTS) - set(registered))
