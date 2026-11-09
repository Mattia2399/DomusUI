"""Real HA service-boundary tests for explicit, single-zone Climate dispatch."""

from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from homeassistant.core import HomeAssistant
from test_climate_architecture import scenario_a
from test_climate_state_manager import USER, setup_state

from custom_components.domusos.climate.models import StoreUnavailable
from custom_components.domusos.core.audit import DomusAuditService


def direct_config(*, armed=True, ownership="domus_supervised"):
    config = scenario_a()
    config["zones"][0]["endpointIds"] = ["ac"]
    config["zones"][0]["reference"].update(freshnessPolicy="max_age", maxAgeSeconds=300)
    config["endpoints"] = [config["endpoints"][0]]
    config["endpoints"][0]["executionOwnership"] = ownership
    config["circuits"] = []
    config["generators"] = []
    config["physicalExecutionEnabled"] = armed
    return config


def observe(hass, *, mode="cool", target=26, sensor=27):
    hass.states.async_set("sensor.living_temp", str(sensor),
                          {"device_class": "temperature", "unit_of_measurement": "°C"})
    hass.states.async_set("climate.ac", mode, {
        "hvac_modes": ["heat", "cool", "off"], "supported_features": 1,
        "temperature_unit": "°C", "temperature": target, "current_temperature": sensor,
        "min_temp": 16, "max_temp": 30, "target_temp_step": 0.5,
    })


async def ready(hass, *, mode="cool", target=26, armed=True, ownership="domus_supervised",
                clock=None, execution_schedule=None):
    manager, store = await setup_state(hass, config=direct_config(armed=armed, ownership=ownership),
                                       clock=clock, execution_schedule=execution_schedule)
    observe(hass, mode=mode, target=target)
    await manager.async_set_house_intent("cooling", "manual", 0, USER)
    response = await manager.async_set_zone_intent("living", "follow_house", 24, 1, USER)
    return manager, store, response["executionPreview"]["plans"][0]


async def execute(manager, plan):
    return await manager.async_execute_plan("living", plan["planToken"], plan["configRevision"],
                                            plan["stateRevision"], USER)


@pytest.mark.parametrize(("mode", "target", "services", "values"), [
    ("cool", 26, ["set_temperature"], [24]),
    ("heat", 26, ["set_hvac_mode", "set_temperature"], ["cool", 24]),
    ("heat", 24, ["set_hvac_mode"], ["cool"]),
])
async def test_only_fixed_supervisory_services_with_user_context(
    hass: HomeAssistant, mode, target, services, values,
):
    manager, _, plan = await ready(hass, mode=mode, target=target)
    try:
        calls = AsyncMock()
        with patch.object(type(hass.services), "async_call", calls):
            result = await execute(manager, plan)
        assert result["result"] == "dispatched"
        assert result["status"] == "pending"
        assert result["actionsAttempted"] == len(services)
        assert [call.args[1] for call in calls.await_args_list] == services
        assert [call.args[0] for call in calls.await_args_list] == ["climate"] * len(services)
        assert [next(value for key, value in call.args[2].items() if key != "entity_id")
                for call in calls.await_args_list] == values
        assert all(call.args[2]["entity_id"] == "climate.ac" and call.kwargs["blocking"] is True
                   and call.kwargs["context"].user_id == USER.id for call in calls.await_args_list)
        correlation = manager.get_state()["executionRuntime"]["zones"]["living"]["currentCorrelation"]
        assert correlation["correlationId"] == result["correlationId"]
        assert correlation["completedActions"] == services
    finally:
        await manager.async_shutdown()


async def test_noop_and_disarmed_never_call_services(hass: HomeAssistant):
    for target, armed, expected in ((24, True, "noop"), (26, False, "blocked")):
        manager, _, plan = await ready(hass, target=target, armed=armed)
        try:
            with patch.object(type(hass.services), "async_call", new_callable=AsyncMock) as calls:
                result = await execute(manager, plan)
            assert result["result"] == expected
            assert result["actionsAttempted"] == 0
            calls.assert_not_awaited()
        finally:
            await manager.async_shutdown()


async def test_stale_token_and_unowned_endpoint_never_call_services(hass: HomeAssistant):
    manager, _, plan = await ready(hass)
    try:
        with patch.object(type(hass.services), "async_call", new_callable=AsyncMock) as calls:
            result = await manager.async_execute_plan("living", "0" * 32, plan["configRevision"],
                                                      plan["stateRevision"], USER)
        assert result["failureReason"] == "plan_stale"
        calls.assert_not_awaited()
    finally:
        await manager.async_shutdown()
    manager, _, plan = await ready(hass, ownership="observe_only")
    try:
        with patch.object(type(hass.services), "async_call", new_callable=AsyncMock) as calls:
            result = await execute(manager, plan)
        assert result["result"] == "blocked" and "endpoint_not_owned" in result["blockers"]
        calls.assert_not_awaited()
    finally:
        await manager.async_shutdown()


async def test_capability_change_and_stale_sensor_block_at_dispatch(hass: HomeAssistant):
    manager, _, plan = await ready(hass)
    try:
        attrs = dict(hass.states.get("climate.ac").attributes)
        attrs["hvac_modes"] = ["heat", "off"]
        hass.states.async_set("climate.ac", "cool", attrs)
        with patch.object(type(hass.services), "async_call", new_callable=AsyncMock) as calls:
            result = await execute(manager, plan)
        assert result["result"] == "blocked"
        calls.assert_not_awaited()
    finally:
        await manager.async_shutdown()


async def test_expired_sensor_and_changed_intent_block_without_dispatch(hass: HomeAssistant):
    now = datetime.now(UTC) + timedelta(seconds=1)

    def clock():
        return now

    manager, _, initial = await ready(hass, clock=clock)
    try:
        now += timedelta(seconds=301)
        stale = manager.get_state()["executionPreview"]["plans"][0]
        assert "sensor_stale" in stale["physicalBlockers"]
        with patch.object(type(hass.services), "async_call", new_callable=AsyncMock) as calls:
            result = await execute(manager, stale)
            assert "sensor_stale" in result["blockers"]
            old = await execute(manager, initial)
            assert old["failureReason"] == "plan_stale"
            calls.assert_not_awaited()
    finally:
        await manager.async_shutdown()


async def test_failure_and_partial_failure_have_no_retry(hass: HomeAssistant):
    for mode, status, completed in (("cool", "failed", []), ("heat", "partial_failure", ["set_hvac_mode"])):
        manager, _, plan = await ready(hass, mode=mode)
        try:
            calls = 0

            async def service(*args, failing_mode=mode, **kwargs):
                nonlocal calls
                calls += 1
                if failing_mode == "cool" or calls == 2:
                    raise RuntimeError("sensitive handler detail")

            with patch.object(type(hass.services), "async_call", service):
                result = await execute(manager, plan)
            assert result["status"] == status
            assert result["failureReason"] == "service_call_failed"
            assert result["actionsAttempted"] == calls
            assert manager.get_state()["executionRuntime"]["zones"]["living"]["currentCorrelation"]["completedActions"] == completed
            assert calls == (1 if mode == "cool" else 2)
        finally:
            await manager.async_shutdown()


async def test_pending_duplicate_convergence_and_explicit_retry(hass: HomeAssistant):
    manager, _, plan = await ready(hass)
    try:
        with patch.object(type(hass.services), "async_call", new_callable=AsyncMock) as calls:
            first = await execute(manager, plan)
            again = await execute(manager, plan)
            assert again["result"] == "duplicate" and again["correlationId"] == first["correlationId"]
            assert calls.await_count == 1
            observe(hass, target=24)
            await hass.async_block_till_done()
            assert manager._execution.current("living")["status"] == "converged"
            assert manager.get_state()["executionRuntime"]["zones"]["living"]["currentCorrelation"]["status"] == "converged"
            observe(hass, target=26)
            new_plan = manager.get_state()["executionPreview"]["plans"][0]
            retry = await execute(manager, new_plan)
            assert retry["correlationId"] != first["correlationId"]
            assert calls.await_count == 2
    finally:
        await manager.async_shutdown()


async def test_new_explicit_command_supersedes_pending_and_restart_clears_memory(hass: HomeAssistant):
    manager, store, plan = await ready(hass)
    with patch.object(type(hass.services), "async_call", new_callable=AsyncMock) as calls:
        first = await execute(manager, plan)
        await manager.async_set_zone_intent("living", "follow_house", 23, 2, USER)
        assert calls.await_count == 1
        next_plan = manager.get_state()["executionPreview"]["plans"][0]
        second = await execute(manager, next_plan)
        assert second["correlationId"] != first["correlationId"]
        assert calls.await_count == 2
        assert manager._execution.correlation(first["correlationId"])["status"] == "superseded"
    await manager.async_shutdown()
    restarted, _ = await setup_state(hass, state_data=store.data, config=direct_config())
    try:
        assert restarted.get_state()["executionRuntime"]["zones"]["living"]["currentCorrelation"] is None
    finally:
        await restarted.async_shutdown()


async def test_timeout_and_unload_clear_runtime_without_retry(hass: HomeAssistant):
    now = datetime.now(UTC) + timedelta(seconds=1)
    scheduled = []

    class Handle:
        cancelled = False

        def cancel(self):
            self.cancelled = True

    def schedule(delay, callback):
        item = (delay, callback, Handle())
        scheduled.append(item)
        return item[2]

    def clock():
        return now

    manager, _, plan = await ready(hass, clock=clock, execution_schedule=schedule)
    with patch.object(type(hass.services), "async_call", new_callable=AsyncMock) as calls:
        result = await execute(manager, plan)
        assert result["status"] == "pending" and calls.await_count == 1
        assert len(scheduled) == 1 and 59 <= scheduled[0][0] <= 60
        now += timedelta(seconds=61)
        scheduled[0][1]()
        assert manager.get_state()["executionRuntime"]["zones"]["living"]["currentCorrelation"]["status"] == "failed"
        assert calls.await_count == 1
    await manager.async_shutdown()
    assert scheduled[0][2].cancelled or manager._execution._handle is None
    assert manager._execution.current("living") is None
    with pytest.raises(StoreUnavailable):
        await execute(manager, plan)


async def test_passive_intent_and_observation_never_dispatch(hass: HomeAssistant):
    manager, _, _ = await ready(hass)
    try:
        with patch.object(type(hass.services), "async_call", new_callable=AsyncMock) as calls:
            await manager.async_get_state()
            observe(hass, target=25)
            await hass.async_block_till_done()
            await manager.async_get_state()
            await manager.async_set_zone_intent("living", "follow_house", 23, 2, USER)
            calls.assert_not_awaited()
    finally:
        await manager.async_shutdown()


async def test_arm_and_command_audit_use_core_without_temperature_payload(hass: HomeAssistant):
    manager, _, plan = await ready(hass)
    audit = DomusAuditService()
    await audit.async_setup()
    manager.config_manager._runtime = lambda: SimpleNamespace(audit=audit)
    admin = SimpleNamespace(id="admin-1", is_active=True, is_admin=True)
    try:
        with patch.object(type(hass.services), "async_call", new_callable=AsyncMock):
            result = await execute(manager, plan)
        observe(hass, target=24)
        manager.get_state()
        config = deepcopy(manager.config_manager.config)
        config["physicalExecutionEnabled"] = False
        await manager.config_manager.async_save_config(config, 1, admin)
        config["physicalExecutionEnabled"] = True
        await manager.config_manager.async_save_config(config, 2, admin)
        events = audit.snapshot()
        assert [entry.reason for entry in events] == [
            "command_dispatched", "command_converged", "save_config", "execution_disarmed",
            "save_config", "execution_armed",
        ]
        assert result["correlationId"] in [entry.correlation_id for entry in events]
        assert all("24" not in repr(entry.metadata) for entry in events)
    finally:
        await manager.async_shutdown()
        await audit.async_shutdown()
