"""CLM.4B fixed-clock scenarios A-Q, independent of Home Assistant."""

from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace

from climate_pure import load

resolver = load("auto_resolver")
intent = load("intent")
models = load("models")


def at(value):
    return datetime.fromisoformat(value)


def house():
    config = models.empty_config()
    for name in ("living", "bedroom"):
        config["zones"].append({"id": name, "name": name.title(), "areaId": None,
                                "reference": {"primaryEntityId": f"sensor.{name}", "fallbacks": []}, "endpointIds": []})
    config["profiles"] = [
        {"id": "comfort", "name": "Comfort", "zoneTargets": {"living": 21, "bedroom": 20}},
        {"id": "eco", "name": "Eco", "zoneTargets": {"living": 18}},
        {"id": "night", "name": "Night", "zoneTargets": {"living": 17, "bedroom": 18}},
    ]
    return config


def day(config, name, *events):
    config["schedules"].append({"day": name, "events": [{"time": clock, "profileId": profile} for clock, profile in events]})
    return config


def week():
    config = house()
    day(config, "monday", ("06:30", "comfort"), ("08:30", "eco"), ("17:00", "comfort"), ("23:30", "night"))
    day(config, "sunday", ("23:00", "night"))
    return config


def preview(config, moment, *, mode="heating", control="auto", temperature="19", zone_mode="follow_house", manual=22):
    desired = intent.default_intent(config)
    desired["house"] = {"operatingMode": mode, "controlMode": control}
    desired["zones"]["living"] = {"mode": zone_mode, "targetTemperature": manual}
    state = {"sensor.living": SimpleNamespace(state=temperature, attributes={}),
             "sensor.bedroom": SimpleNamespace(state="19", attributes={})}
    resolution = resolver.resolve_auto(config, at(moment), "Europe/Rome") if control == "auto" else None
    return intent.preview(config, desired, state, auto_resolution=resolution)


def test_a_same_day_active_and_next_event():
    result = resolver.resolve_auto(week(), at("2026-01-05T17:00:00+00:00"), "Europe/Rome")
    assert result["status"] == "resolved"
    assert result["activeProfileId"] == "comfort"
    assert result["activeEvent"] == {"day": "monday", "time": "17:00", "profileId": "comfort"}
    assert result["nextEvent"]["time"] == "23:30" and result["nextEvent"]["profileName"] == "Night"


def test_b_before_first_event_wraps_to_sunday():
    result = resolver.resolve_auto(week(), at("2026-01-05T04:00:00+00:00"), "Europe/Rome")
    assert result["activeEvent"] == {"day": "sunday", "time": "23:00", "profileId": "night"}
    assert result["nextEvent"]["time"] == "06:30"


def test_c_empty_days_inherit_last_event():
    config = day(house(), "monday", ("23:00", "night"))
    day(config, "wednesday", ("06:30", "comfort"))
    result = resolver.resolve_auto(config, at("2026-01-06T11:00:00+00:00"), "Europe/Rome")
    assert result["activeProfileId"] == "night" and result["nextEvent"]["day"] == "wednesday"


def test_d_empty_week_and_invalid_timezone_fail_closed():
    assert resolver.resolve_auto(house(), at("2026-01-05T12:00:00+00:00"), "Europe/Rome")["status"] == "no_schedule"
    assert resolver.resolve_auto(week(), at("2026-01-05T12:00:00+00:00"), "Missing/Timezone")["status"] == "timezone_unavailable"
    assert resolver.resolve_auto(week(), at("2026-01-05T12:00:00+00:00"), None)["zoneTargets"] == {}


def test_e_missing_zone_target_never_falls_back_to_manual():
    result = preview(week(), "2026-01-05T10:00:00+00:00")
    bedroom = result["zones"][1]
    assert result["autoResolution"]["activeProfileId"] == "eco"
    assert bedroom["derived"]["effectiveTarget"] is None
    assert bedroom["derived"]["thermalReason"] == "no_target"


def test_f_heating_auto_uses_schedule_target_and_deadband():
    zone = preview(week(), "2026-01-05T17:00:00+00:00")["zones"][0]
    assert zone["derived"]["effectiveTarget"] == 21
    assert zone["derived"]["targetSource"] == "schedule"
    assert zone["derived"]["thermalStatus"] == "needs_heating"
    assert zone["derived"]["effectiveTargetDetail"]["profileId"] == "comfort"


def test_g_cooling_auto_uses_same_room_target():
    zone = preview(week(), "2026-01-05T17:00:00+00:00", mode="cooling", temperature="27")["zones"][0]
    assert zone["derived"]["thermalStatus"] == "needs_cooling" and zone["derived"]["effectiveTarget"] == 21


def test_h_i_zone_and_house_off_do_not_demand():
    assert preview(week(), "2026-01-05T17:00:00+00:00", zone_mode="off")["zones"][0]["derived"]["thermalStatus"] == "off"
    result = preview(week(), "2026-01-05T17:00:00+00:00", mode="off")
    assert result["autoResolution"]["activeProfileId"] == "comfort"
    assert result["zones"][0]["derived"]["thermalStatus"] == "off"


def test_j_fallback_sensor_keeps_scheduled_thermal_decision():
    config = week()
    config["zones"][0]["reference"]["fallbacks"] = ["sensor.living_backup"]
    desired = intent.default_intent(config)
    desired["house"] = {"operatingMode": "heating", "controlMode": "auto"}
    states = {"sensor.living": SimpleNamespace(state="unavailable", attributes={}),
              "sensor.living_backup": SimpleNamespace(state="19.2", attributes={})}
    resolution = resolver.resolve_auto(config, at("2026-01-05T17:00:00+00:00"), "Europe/Rome")
    zone = intent.preview(config, desired, states, auto_resolution=resolution)["zones"][0]
    assert zone["observed"]["temperatureSource"] == "sensor.living_backup"
    assert zone["derived"]["effectiveTarget"] == 21
    assert zone["derived"]["thermalStatus"] == "needs_heating"


def test_sensor_failure_is_distinct_from_missing_target():
    zone = preview(week(), "2026-01-05T17:00:00+00:00", temperature="unavailable")["zones"][0]
    assert zone["derived"]["thermalStatus"] == "unknown"
    assert zone["derived"]["thermalReason"] == "sensor_unavailable"


def test_k_l_manual_target_is_preserved_and_restored():
    config = week()
    manual = preview(config, "2026-01-05T17:00:00+00:00", control="manual")["zones"][0]
    automatic = preview(config, "2026-01-05T17:00:00+00:00")["zones"][0]
    assert manual["intent"]["targetTemperature"] == automatic["intent"]["targetTemperature"] == 22
    assert manual["derived"]["effectiveTarget"] == 22 and automatic["derived"]["effectiveTarget"] == 21
    assert manual["derived"]["targetSource"] == "manual"


def test_m_n_config_target_and_name_updates_resolve_immediately():
    config = week()
    moment = at("2026-01-05T17:00:00+00:00")
    config["profiles"][0]["zoneTargets"]["living"] = 23
    config["profiles"][0]["name"] = "Casa"
    result = resolver.resolve_auto(config, moment, "Europe/Rome")
    assert result["activeProfileId"] == "comfort"
    assert result["activeProfileName"] == "Casa"
    assert result["zoneTargets"]["living"] == {"status": "resolved", "value": 23.0}
    config["schedules"][0]["events"].append({"time": "17:30", "profileId": "eco"})
    assert resolver.resolve_auto(config, at("2026-01-05T18:00:00+00:00"), "Europe/Rome")["activeProfileId"] == "eco"


def test_o_next_event_wraps_to_next_week():
    result = resolver.resolve_auto(week(), at("2026-01-04T22:30:00+00:00"), "Europe/Rome")
    assert result["activeProfileId"] == "night" and result["nextEvent"]["day"] == "monday"


def test_p_spring_gap_moves_event_forward_by_gap():
    config = day(house(), "sunday", ("01:00", "night"), ("02:30", "comfort"))
    before = resolver.resolve_auto(config, at("2026-03-29T01:15:00+00:00"), "Europe/Rome")
    after = resolver.resolve_auto(config, at("2026-03-29T01:30:00+00:00"), "Europe/Rome")
    assert before["activeProfileId"] == "night"
    assert before["nextEvent"]["occursAt"] == "2026-03-29T01:30:00+00:00"
    assert after["activeProfileId"] == "comfort"


def test_q_fall_overlap_fires_only_on_first_occurrence_without_rollback():
    config = day(house(), "sunday", ("01:00", "night"), ("02:30", "comfort"), ("02:45", "eco"))
    first = resolver.resolve_auto(config, at("2026-10-25T00:35:00+00:00"), "Europe/Rome")
    repeated = resolver.resolve_auto(config, at("2026-10-25T01:10:00+00:00"), "Europe/Rome")
    assert first["activeProfileId"] == "comfort"
    assert repeated["activeProfileId"] == "eco"
    assert repeated["nextEvent"]["occursAt"] != "2026-10-25T01:30:00+00:00"


def test_unknown_profile_and_bad_schedule_fail_safe():
    config = week()
    config["schedules"][0]["events"][0]["profileId"] = "missing"
    result = resolver.resolve_auto(config, at("2026-01-05T06:00:00+00:00"), "Europe/Rome")
    assert result["status"] == "profile_missing" and result["zoneTargets"] == {}
    config["schedules"][0]["events"][0]["time"] = "25:00"
    assert resolver.resolve_auto(config, at("2026-01-05T06:00:00+00:00"), "Europe/Rome")["status"] == "invalid_schedule"
