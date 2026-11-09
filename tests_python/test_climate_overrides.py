"""CLM.5 pure expiry, persistence and precedence scenarios A-Q/T."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from climate_pure import load
from test_climate_auto_resolver import house, week

intent = load("intent")
models = load("models")
resolver = load("auto_resolver")
overrides = load("overrides")


def at(value):
    return datetime.fromisoformat(value)


NOW = at("2026-01-05T17:00:00+00:00")  # Monday, 18:00 Europe/Rome.


def record(zone="living", target=22, created=NOW, expires=None, mode="duration", identifier="a" * 32):
    return {"id": identifier, "zoneId": zone, "targetTemperature": target,
            "createdAt": created.isoformat(), "expiresAt": (expires or created + timedelta(hours=1)).isoformat(),
            "expiryMode": mode}


def read(config, now=NOW, *, items=None, operating="heating", control="auto", zone_mode="follow_house", sensor="19"):
    desired = intent.default_intent(config)
    desired["house"] = {"operatingMode": operating, "controlMode": control}
    desired["zones"]["living"] = {"mode": zone_mode, "targetTemperature": 25}
    if items is not None:
        desired["overrides"] = items
    resolution = resolver.resolve_auto(config, now, "Europe/Rome") if control == "auto" else None
    active = overrides.active_overrides(items or {}, now, {zone["id"] for zone in config["zones"]})
    states = {"sensor.living": SimpleNamespace(state=sensor, attributes={}),
              "sensor.bedroom": SimpleNamespace(state="19", attributes={})}
    return intent.preview(config, desired, states, auto_resolution=resolution, active_overrides=active)


def test_a_next_schedule_event_is_absolute_and_frozen():
    config = week()
    resolution = resolver.resolve_auto(config, NOW, "Europe/Rome")
    expires = overrides.expiry_instant("next_schedule_event", NOW, "Europe/Rome", resolution)
    assert expires == at("2026-01-05T22:30:00+00:00")
    config["schedules"][0]["events"].append({"time": "19:00", "profileId": "eco"})
    assert expires == at("2026-01-05T22:30:00+00:00")
    result = read(config, items={"living": record(expires=expires, mode="next_schedule_event")})
    assert result["zones"][0]["derived"]["targetSource"] == "override"


def test_b_duration_is_active_before_boundary_and_expired_at_boundary():
    expires = overrides.expiry_instant("duration", NOW, None, None, duration_minutes=60)
    item = {"living": record(expires=expires)}
    assert read(week(), NOW + timedelta(minutes=59), items=item)["zones"][0]["derived"]["effectiveTarget"] == 22
    zone = read(week(), expires, items=item)["zones"][0]
    assert zone["derived"]["targetSource"] == "schedule"
    assert zone["override"] is None


def test_c_d_until_time_today_or_tomorrow_in_house_timezone():
    assert overrides.expiry_instant("until_time", NOW, "Europe/Rome", None, until_time="18:30") == at("2026-01-05T17:30:00+00:00")
    later = at("2026-01-05T18:00:00+00:00")
    assert overrides.expiry_instant("until_time", later, "Europe/Rome", None, until_time="18:30") == at("2026-01-06T17:30:00+00:00")


def test_e_next_event_crosses_week_boundary():
    sunday = at("2026-01-04T22:30:00+00:00")
    resolution = resolver.resolve_auto(week(), sunday, "Europe/Rome")
    assert overrides.expiry_instant("next_schedule_event", sunday, "Europe/Rome", resolution) == at("2026-01-05T05:30:00+00:00")


def test_f_g_no_schedule_rejects_next_event_but_allows_duration():
    config = house()
    resolution = resolver.resolve_auto(config, NOW, "Europe/Rome")
    with pytest.raises(models.NextScheduleEventUnavailable):
        overrides.expiry_instant("next_schedule_event", NOW, "Europe/Rome", resolution)
    expires = overrides.expiry_instant("duration", NOW, None, resolution, duration_minutes=60)
    item = {"living": record(expires=expires)}
    assert read(config, items=item)["zones"][0]["derived"]["effectiveTarget"] == 22
    assert read(config, expires, items=item)["zones"][0]["derived"]["effectiveTarget"] is None


def test_h_missing_schedule_target_can_be_temporarily_overridden():
    result = read(week(), at("2026-01-05T10:00:00+00:00"), items={"bedroom": record("bedroom", created=at("2026-01-05T09:00:00+00:00"), expires=at("2026-01-05T11:00:00+00:00"))})
    zone = result["zones"][1]
    assert zone["derived"]["scheduledTarget"] is None
    assert zone["derived"]["effectiveTarget"] == 22


def test_i_j_house_and_zone_off_retain_override_without_demand():
    item = {"living": record()}
    for options in ({"zone_mode": "off"}, {"operating": "off"}):
        zone = read(week(), items=item, **options)["zones"][0]
        assert zone["derived"]["thermalStatus"] == "off"
        assert zone["override"]["targetTemperature"] == 22


def test_k_manual_ignores_override_and_uses_preserved_manual_target():
    zone = read(week(), items={"living": record()}, control="manual")["zones"][0]
    assert zone["derived"]["effectiveTarget"] == 25
    assert zone["derived"]["targetSource"] == "manual"
    assert zone["override"] is None


def test_l_explicit_clear_resumes_current_schedule():
    zone = read(week(), items={})["zones"][0]
    assert zone["derived"]["effectiveTarget"] == 21
    assert zone["derived"]["targetSource"] == "schedule"


def test_m_n_schedule_and_profile_edits_change_only_fallback():
    config = week()
    item = {"living": record()}
    assert read(config, items=item)["zones"][0]["derived"]["effectiveTarget"] == 22
    config["profiles"][0]["zoneTargets"]["living"] = 23
    assert read(config, items=item)["zones"][0]["derived"]["scheduledTarget"] == 23
    config["schedules"][0]["events"].append({"time": "18:30", "profileId": "eco"})
    active = read(config, NOW + timedelta(minutes=40), items=item)["zones"][0]
    expired = read(config, NOW + timedelta(hours=1), items=item)["zones"][0]
    assert active["derived"]["effectiveTarget"] == 22
    assert expired["derived"]["effectiveTarget"] == 18


def test_o_house_mode_changes_direction_without_changing_override_target():
    item = {"living": record(target=22)}
    heat = read(week(), items=item, sensor="19")["zones"][0]
    cool = read(week(), items=item, operating="cooling", sensor="27")["zones"][0]
    assert heat["derived"]["thermalStatus"] == "needs_heating"
    assert cool["derived"]["thermalStatus"] == "needs_cooling"
    assert heat["derived"]["effectiveTarget"] == cool["derived"]["effectiveTarget"] == 22


def test_p_q_store_round_trip_and_expired_filter():
    config = week()
    desired = intent.default_intent(config)
    desired["house"]["controlMode"] = "auto"
    desired["overrides"] = {"living": record()}
    revision, restored = intent.parse_state_document(intent.state_document(3, desired))
    assert revision == 3 and restored == intent.parse_intent(desired)
    assert overrides.active_overrides(restored["overrides"], NOW + timedelta(minutes=59), {"living"})
    assert not overrides.active_overrides(restored["overrides"], NOW + timedelta(hours=1), {"living"})


def test_t_multiple_zones_are_independent_and_orphans_ignored():
    items = {"living": record(), "bedroom": record("bedroom", target=24, identifier="b" * 32)}
    result = read(week(), items=items)
    assert [zone["derived"]["effectiveTarget"] for zone in result["zones"]] == [22, 24]
    assert list(overrides.active_overrides(items, NOW, {"living"})) == ["living"]


def test_until_time_reuses_spring_gap_and_first_autumn_overlap():
    spring = at("2026-03-29T00:30:00+00:00")
    assert overrides.expiry_instant("until_time", spring, "Europe/Rome", None, until_time="02:30") == at("2026-03-29T01:30:00+00:00")
    autumn = at("2026-10-25T00:00:00+00:00")
    assert overrides.expiry_instant("until_time", autumn, "Europe/Rome", None, until_time="02:30") == at("2026-10-25T00:30:00+00:00")


@pytest.mark.parametrize("mode,options", [
    ("duration", {"duration_minutes": 0}), ("duration", {"duration_minutes": 1441}),
    ("duration", {"duration_minutes": True}), ("until_time", {"until_time": "25:00"}),
    ("other", {}),
])
def test_invalid_expiry_options_fail_closed(mode, options):
    with pytest.raises(models.InvalidConfig):
        overrides.expiry_instant(mode, NOW, "Europe/Rome", None, **options)


def test_missing_timezone_and_corrupt_store_payload_fail_closed():
    with pytest.raises(models.HouseTimezoneUnavailable):
        overrides.expiry_instant("until_time", NOW, None, None, until_time="18:30")
    good = record()
    for key, value in (("targetTemperature", 50), ("expiresAt", "2020-01-01T00:00:00+00:00"),
                       ("expiryMode", []), ("zoneId", "other"), ("expiresAt", "2100-01-01T00:00:00+00:00")):
        bad = deepcopy(good)
        bad[key] = value
        with pytest.raises(models.InvalidConfig):
            overrides.parse_overrides({"living": bad})
