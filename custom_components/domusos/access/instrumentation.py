"""Shadow authorization on every Domus backend entry point: it observes, it never decides.

Every websocket command and service of Domus is registered through here
(``register_websocket_commands``, ``register_service``). Each declared action
that is not exempt is wrapped: before the handler runs, the central evaluator
decides what Access Control would do, then the handler runs exactly as before,
with the same arguments, response and errors, and what it actually did is
compared with the decision (docs/access-control-shadow.md).

A deny is only counted. Nothing here raises, blocks or changes a response;
when the observation itself fails, that is counted and the request runs
untouched. The checks that exist today (``require_admin``, entity
permissions, the own-profile rule) stay where they are.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable, Iterable
from functools import wraps
import inspect
import logging
from typing import Any

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import Unauthorized
from homeassistant.util import dt as dt_util

from ..const import DOMAIN
from .actions import ACTION_CONTRACTS, ActionContract
from .adapters import authorize_service_action, authorize_user_action, service_origin
from .authorization import AuthorizationDecision
from .manager import DATA_ACCESS_MANAGER, AccessPolicyManager
from .shadow import CurrentOutcome, Origin, ShadowStats, observe, outcome_for_code

_LOGGER = logging.getLogger(__name__)

DATA_ACCESS_SHADOW = "access_shadow"
# Set on every wrapped handler: the contract tests check each registration carries its own action.
SHADOW_ACTION_ATTR = "domus_shadow_action"


def shadow_stats(hass: HomeAssistant) -> ShadowStats:
    """The counters of this Home Assistant run; created once, kept across reloads of the integration."""
    domain_data = hass.data.setdefault(DOMAIN, {})
    stats = domain_data.get(DATA_ACCESS_SHADOW)
    if not isinstance(stats, ShadowStats):
        stats = domain_data[DATA_ACCESS_SHADOW] = ShadowStats(dt_util.utcnow)
    return stats


def _access_manager(hass: HomeAssistant) -> AccessPolicyManager | None:
    manager = hass.data.get(DOMAIN, {}).get(DATA_ACCESS_MANAGER)
    return manager if isinstance(manager, AccessPolicyManager) else None


def _policy_key(manager: AccessPolicyManager | None) -> tuple[str, int] | None:
    return None if manager is None else (manager.state.value, manager.revision)


def _outcome_for_exception(err: BaseException) -> CurrentOutcome:
    if isinstance(err, Unauthorized):
        return CurrentOutcome.DENY
    return outcome_for_code(getattr(err, "code", None))


def _instrumentation_failed(hass: HomeAssistant) -> None:
    try:
        shadow_stats(hass).instrumentation_failed()
    except Exception:  # noqa: BLE001 - nothing may reach the request
        pass


class _Probe:
    """One request being observed: the decision taken before it ran, waiting for what it did."""

    __slots__ = ("_contract", "_decision", "_done", "_generation", "_hass", "_origin", "_stats")

    def __init__(
        self,
        hass: HomeAssistant,
        stats: ShadowStats,
        generation: int,
        contract: ActionContract,
        origin: Origin,
        decision: AuthorizationDecision | None,
    ) -> None:
        self._hass = hass
        self._stats = stats
        self._generation = generation
        self._contract = contract
        self._origin = origin
        self._decision = decision
        self._done = False

    def finish(self, outcome: CurrentOutcome) -> None:
        """Count the request once, with its first answer; never raises."""
        if self._done:
            return
        self._done = True
        try:
            self._stats.record(self._generation, observe(self._contract, self._origin, self._decision, outcome))
        except Exception:  # noqa: BLE001 - nothing may reach the request
            _instrumentation_failed(self._hass)

    def raised(self, err: BaseException) -> None:
        try:
            outcome = _outcome_for_exception(err)
        except Exception:  # noqa: BLE001
            outcome = CurrentOutcome.ERROR
        self.finish(outcome)


def _begin(hass: HomeAssistant) -> tuple[ShadowStats, int, AccessPolicyManager | None] | None:
    try:
        stats = shadow_stats(hass)
        manager = _access_manager(hass)
        return stats, stats.begin(_policy_key(manager)), manager
    except Exception:  # noqa: BLE001 - nothing may reach the request
        _instrumentation_failed(hass)
        return None


class _ObservedConnection:
    """The handler's own connection, unchanged, except that its first answer is noted.

    Everything else (``user``, ``subscriptions``, ``send_event``...) is the
    real connection's; the answers go to it exactly as the handler sends them.
    """

    __slots__ = ("_connection", "_probe")

    def __init__(self, connection: websocket_api.ActiveConnection, probe: _Probe) -> None:
        object.__setattr__(self, "_connection", connection)
        object.__setattr__(self, "_probe", probe)

    def __getattr__(self, name: str) -> Any:
        return getattr(self._connection, name)

    def __setattr__(self, name: str, value: Any) -> None:
        setattr(self._connection, name, value)

    def send_result(self, msg_id: int, result: Any | None = None) -> None:
        self._probe.finish(CurrentOutcome.SUCCESS)
        self._connection.send_result(msg_id, result)

    def send_error(self, msg_id: int, code: str, *args: Any, **kwargs: Any) -> None:
        self._probe.finish(outcome_for_code(code))
        self._connection.send_error(msg_id, code, *args, **kwargs)

    def async_handle_exception(self, msg: dict[str, Any], err: Exception) -> None:
        self._probe.raised(err)
        self._connection.async_handle_exception(msg, err)


def _observed_command(contract: ActionContract, handler: Callable[..., None]) -> Callable[..., None]:
    @wraps(handler)
    def observed(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
        probe: _Probe | None = None
        started = _begin(hass)
        if started is not None:
            stats, generation, manager = started
            try:
                decision: AuthorizationDecision | None = authorize_user_action(manager, connection.user, contract.id)
            except Exception:  # noqa: BLE001 - counted as a shadow error, never applied
                decision = None
            probe = _Probe(hass, stats, generation, contract, Origin.WEBSOCKET, decision)
        if probe is None:
            handler(hass, connection, msg)
            return
        try:
            handler(hass, _ObservedConnection(connection, probe), msg)
        except Exception as err:
            # require_admin refuses here, before the handler runs: noted, then raised unchanged.
            probe.raised(err)
            raise

    setattr(observed, SHADOW_ACTION_ATTR, contract.id)
    return observed


def observed_command(handler: Callable[..., None]) -> Callable[..., None]:
    """The command wrapped for shadow authorization, or the command itself when exempt or undeclared."""
    action = getattr(handler, "_ws_command", None)
    contract = ACTION_CONTRACTS.get(action) if isinstance(action, str) else None
    if contract is None:
        _LOGGER.warning("Websocket command %s is not declared in access/actions.py; it is not observed", action)
        return handler
    if contract.shadow_exemption is not None:
        return handler
    return _observed_command(contract, handler)


def register_websocket_commands(hass: HomeAssistant, commands: Iterable[Callable[..., None]]) -> None:
    """Register Domus websocket commands, each one observed unless its contract exempts it."""
    for command in commands:
        websocket_api.async_register_command(hass, observed_command(command))


def _observed_service(
    hass: HomeAssistant, contract: ActionContract, handler: Callable[[ServiceCall], Awaitable[Any]]
) -> Callable[[ServiceCall], Awaitable[Any]]:
    @wraps(handler)
    async def observed(call: ServiceCall) -> Any:
        probe: _Probe | None = None
        started = _begin(hass)
        if started is not None:
            stats, generation, manager = started
            try:
                origin = service_origin(call)
                decision: AuthorizationDecision | None = await authorize_service_action(hass, manager, call, contract.id)
                probe = _Probe(hass, stats, generation, contract, origin, decision)
            except Exception:  # noqa: BLE001 - nothing may reach the request
                _instrumentation_failed(hass)
        if probe is None:
            return await handler(call)
        try:
            result = await handler(call)
        except Exception as err:
            probe.raised(err)
            raise
        probe.finish(CurrentOutcome.SUCCESS)
        return result

    setattr(observed, SHADOW_ACTION_ATTR, contract.id)
    return observed


def register_service(
    hass: HomeAssistant,
    service: str,
    handler: Callable[[ServiceCall], Awaitable[Any]],
    schema: Any = None,
) -> None:
    """Register a Domus service, observed unless its contract exempts it."""
    action = f"{DOMAIN}.{service}"
    contract = ACTION_CONTRACTS.get(action)
    target: Callable[..., Any] = handler
    if contract is None:
        _LOGGER.warning("Service %s is not declared in access/actions.py; it is not observed", action)
    elif contract.shadow_exemption is None and inspect.iscoroutinefunction(handler):
        target = _observed_service(hass, contract, handler)
    hass.services.async_register(DOMAIN, service, target, schema=schema)
