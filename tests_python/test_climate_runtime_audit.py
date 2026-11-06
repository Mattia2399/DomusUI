"""Table-driven pre-execution invariants for the pure Climate decision preview."""

from __future__ import annotations

from itertools import product

import pytest
from climate_pure import load
from test_climate_architecture import catalog, scenario_a

intent = load("intent")


@pytest.mark.parametrize(
    ("operating", "control", "zone_mode", "sensor_ok", "target_kind"),
    list(product(
        ("heating", "cooling", "off"),
        ("manual", "auto"),
        ("follow_house", "off"),
        (True, False),
        ("target", "missing", "override"),
    )),
)
def test_preview_state_matrix(operating, control, zone_mode, sensor_ok, target_kind):
    config = scenario_a()
    desired = intent.default_intent(config)
    desired["house"] = {"operatingMode": operating, "controlMode": control}
    desired["zones"]["living"] = {
        "mode": zone_mode,
        "targetTemperature": None if target_kind == "missing" else 21,
    }
    states = catalog(config)
    states["sensor.living_temp"].state = (
        ("24" if operating == "cooling" else "18") if sensor_ok else "unavailable"
    )
    resolution = None
    active = None
    if control == "auto":
        resolution = {
            "status": "no_schedule" if target_kind == "missing" else "resolved",
            "activeProfileId": "comfort",
            "activeEvent": None,
            "zoneTargets": {"living": {"status": "resolved", "value": 19 if target_kind == "override" else 21}},
        }
        if target_kind == "override":
            active = {"living": {"targetTemperature": 21, "expiresAt": "2026-01-05T18:00:00+00:00", "expiryMode": "duration"}}

    first = intent.preview(config, desired, states, auto_resolution=resolution, active_overrides=active)
    assert intent.preview(config, desired, states, auto_resolution=resolution, active_overrides=active) == first
    zone = first["zones"][0]
    derived = zone["derived"]
    expected_source = (
        "manual" if control == "manual" and target_kind != "missing" else
        "override" if control == "auto" and target_kind == "override" else
        "schedule" if control == "auto" and target_kind == "target" else None
    )
    assert derived["targetSource"] == expected_source
    assert derived["effectiveTarget"] == (21 if expected_source is not None else None)
    if operating == "off" or zone_mode == "off":
        assert derived["thermalStatus"] == "off"
        assert derived["compatiblePaths"] == []
    elif expected_source is None or not sensor_ok:
        assert derived["thermalStatus"] == "unknown"
    else:
        assert derived["thermalStatus"] == ("needs_heating" if operating == "heating" else "needs_cooling")
    assert derived["thermalStatus"] != ("needs_cooling" if operating == "heating" else "needs_heating")
