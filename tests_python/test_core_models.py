"""Tests for capability, decision, action and audit contracts."""

from datetime import datetime, timedelta, timezone

import pytest

from custom_components.domusos.core import (
    ActionResult,
    ActionStatus,
    AuditEntry,
    CapabilityAdapter,
    CapabilityState,
    DecisionMode,
    DomusAction,
    DomusAuditService,
    DomusDecision,
)

NOW = datetime(2026, 9, 28, 12, 0, tzinfo=timezone.utc)


class VehicleAdapter:
    capability = "vehicle"

    async def async_get_capability(self) -> CapabilityState:
        return CapabilityState(
            capability=self.capability,
            source="vehicle.profile",
            observed_at=NOW,
            available=True,
            values={"soc": 42},
            source_entity_ids=("sensor.car_soc",),
        )


async def test_capability_adapter_contract_is_vendor_neutral() -> None:
    adapter = VehicleAdapter()
    assert isinstance(adapter, CapabilityAdapter)
    state = await adapter.async_get_capability()
    assert state.capability == "vehicle"
    assert state.values == {"soc": 42}
    with pytest.raises(TypeError):
        state.values["soc"] = 75


@pytest.mark.parametrize("mode", [DecisionMode.AUTOMATIC, DecisionMode.ASSISTED])
def test_actionable_decision_modes_and_proposed_actions(
    mode: DecisionMode,
) -> None:
    decision_id = "decision-1"
    action = DomusAction.create(
        "vehicle.charge_to",
        target="vehicle.primary",
        parameters={"soc": 75},
        requesting_decision_id=decision_id,
        safety_policy="explicit_vehicle_profile",
        correlation_id="trip-plan-1",
    )
    decision = DomusDecision.create(
        "vehicle.charge_needed",
        mode,
        "Upcoming trip requires additional range",
        decision_id=decision_id,
        created_at=NOW,
        expires_at=NOW + timedelta(hours=12),
        context_references=("calendar:trip-1", "vehicle:primary"),
        proposed_actions=(action,),
        metadata={"minimum_margin_percent": 10},
        correlation_id="trip-plan-1",
    )

    assert decision.mode is mode
    assert decision.proposed_actions == (action,)
    assert decision.metadata["minimum_margin_percent"] == 10
    with pytest.raises(TypeError):
        action.parameters["soc"] = 100


def test_informative_decision_cannot_propose_actions() -> None:
    decision = DomusDecision.create(
        "vehicle.range_notice",
        DecisionMode.INFORMATIVE,
        "Current range is available",
        created_at=NOW,
    )
    assert decision.proposed_actions == ()

    with pytest.raises(ValueError, match="cannot propose actions"):
        DomusDecision.create(
            "vehicle.range_notice",
            DecisionMode.INFORMATIVE,
            "Current range is available",
            proposed_actions=(DomusAction.create("notification.send"),),
            created_at=NOW,
        )


def test_action_result_and_decision_expiry_are_consistent() -> None:
    result = ActionResult(
        status=ActionStatus.SUCCEEDED,
        completed_at=NOW,
        message="Charge target accepted",
        data={"target_soc": 75},
    )
    completed = DomusAction(
        action_id="action-1",
        type="vehicle.charge_to",
        target="vehicle.primary",
        status=ActionStatus.SUCCEEDED,
        result=result,
    )
    assert completed.result is result

    with pytest.raises(ValueError, match="require a result"):
        DomusAction(
            action_id="action-2",
            type="vehicle.charge_to",
            target="vehicle.primary",
            status=ActionStatus.FAILED,
        )
    with pytest.raises(ValueError, match="after created_at"):
        DomusDecision.create(
            "vehicle.charge_needed",
            DecisionMode.INFORMATIVE,
            "Trip context changed",
            created_at=NOW,
            expires_at=NOW,
        )


async def test_audit_service_is_bounded_and_filterable() -> None:
    audit = DomusAuditService(max_entries=2)
    await audit.async_setup()
    for index in range(3):
        audit.record(
            AuditEntry.create(
                "decision.engine",
                f"Reason {index}",
                decision_id=f"decision-{index}",
                correlation_id="trip-plan-1" if index > 0 else "other",
                result="recorded",
                timestamp=NOW + timedelta(minutes=index),
            )
        )

    assert [entry.decision_id for entry in audit.snapshot()] == [
        "decision-1",
        "decision-2",
    ]
    assert len(audit.snapshot(correlation_id="trip-plan-1", limit=1)) == 1
    await audit.async_shutdown()
    assert audit.snapshot() == ()
    with pytest.raises(RuntimeError, match="not running"):
        audit.record(AuditEntry.create("domus.runtime", "Stopped"))
