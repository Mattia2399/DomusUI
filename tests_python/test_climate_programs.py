"""CLM.4A pure profile and weekly schedule contract, without Home Assistant."""

from __future__ import annotations

from copy import deepcopy
from types import SimpleNamespace

import pytest
from climate_pure import load

models = load("models")
intent = load("intent")


def house():
    config = models.empty_config()
    for zone_id in ("living", "bedroom", "bathroom", "study"):
        config["zones"].append({"id": zone_id, "name": zone_id.title(), "areaId": None,
                                "reference": {"primaryEntityId": f"sensor.{zone_id}_temp", "fallbacks": []}, "endpointIds": []})
    return config


def profile(profile_id, values):
    return {"id": profile_id, "name": profile_id.title(), "zoneTargets": dict(zip(("living", "bedroom", "bathroom", "study"), values, strict=True))}


def configured():
    config = house()
    config["profiles"] = [profile("comfort", (21, 20, 22, 20)), profile("eco", (18, 18, 18, 18)), profile("night", (18, 19, 17, 17))]
    work = [("06:30", "comfort"), ("08:30", "eco"), ("17:00", "comfort"), ("23:30", "night")]
    weekend = [("08:00", "comfort"), ("00:00", "night")]
    config["schedules"] = [{"day": day, "events": [{"time": time, "profileId": profile_id} for time, profile_id in (work if day not in ("saturday", "sunday") else weekend)]}
                           for day in models.WEEKDAYS]
    return config


def test_profile_crud_optional_targets_and_stable_identity():
    config = house()
    config["profiles"] = [{"id": "comfort", "name": "Comfort", "zoneTargets": {}}]
    assert models.parse_config(config)["profiles"][0]["zoneTargets"] == {}
    config["profiles"][0]["zoneTargets"]["living"] = 21
    config["profiles"][0]["name"] = "Everyday"
    parsed = models.parse_config(config)
    assert parsed["profiles"][0] == {"id": "comfort", "name": "Everyday", "zoneTargets": {"living": 21.0}}
    del config["profiles"][0]["zoneTargets"]["living"]
    assert models.parse_config(config)["profiles"][0]["zoneTargets"] == {}
    config["profiles"] = []
    assert models.parse_config(config)["profiles"] == []


@pytest.mark.parametrize("mutate", [
    lambda item: item["profiles"].append(deepcopy(item["profiles"][0])),
    lambda item: item["profiles"][0].update(name=" "),
    lambda item: item["profiles"][0]["zoneTargets"].update(living=41),
    lambda item: item["profiles"][0]["zoneTargets"].update(living=True),
    lambda item: item["profiles"][0]["zoneTargets"].update(unknown=21),
    lambda item: item["profiles"][0].update(heatingMode="heat"),
])
def test_invalid_profile_data_is_rejected(mutate):
    config = configured()
    mutate(config)
    with pytest.raises(models.InvalidConfig):
        models.parse_config(config)


def test_profile_in_use_cannot_be_deleted_or_renamed_by_identity():
    config = configured()
    config["profiles"][0]["name"] = "Home"
    assert models.parse_config(config)["schedules"][0]["events"][0]["profileId"] == "comfort"
    config["profiles"] = [item for item in config["profiles"] if item["id"] != "comfort"]
    with pytest.raises(models.ProfileInUse):
        models.parse_config(config)


def test_week_is_canonical_with_midnight_and_empty_days():
    config = house()
    config["profiles"] = [{"id": "comfort", "name": "Comfort", "zoneTargets": {}}]
    assert models.parse_config(config)["schedules"] == []
    config["schedules"] = [
        {"day": "sunday", "events": [{"time": "23:59", "profileId": "comfort"}, {"time": "00:00", "profileId": "comfort"}]},
        {"day": "monday", "events": []},
    ]
    assert models.parse_config(config)["schedules"] == [{"day": "sunday", "events": [{"time": "00:00", "profileId": "comfort"}, {"time": "23:59", "profileId": "comfort"}]}]


@pytest.mark.parametrize("day,time,profile_id,error", [
    ("nonday", "06:30", "comfort", models.InvalidConfig),
    ("monday", "24:00", "comfort", models.InvalidConfig),
    ("monday", "6:30", "comfort", models.InvalidConfig),
    ("monday", "06:30", "missing", models.ProfileInUse),
])
def test_invalid_schedule_event_is_rejected(day, time, profile_id, error):
    config = house()
    config["profiles"] = [{"id": "comfort", "name": "Comfort", "zoneTargets": {}}]
    config["schedules"] = [{"day": day, "events": [{"time": time, "profileId": profile_id}]}]
    with pytest.raises(error):
        models.parse_config(config)


def test_duplicate_day_and_duplicate_time_are_rejected():
    config = configured()
    config["schedules"][-1] = {"day": "monday", "events": []}
    with pytest.raises(models.InvalidConfig):
        models.parse_config(config)
    config = configured()
    config["schedules"][0]["events"].append({"time": "06:30", "profileId": "eco"})
    with pytest.raises(models.DuplicateScheduleTime):
        models.parse_config(config)


def test_store_round_trip_keeps_programs_and_schedule_never_changes_runtime_preview():
    config = configured()
    expected = models.parse_config(config)
    revision, restored = models.parse_stored(models.storage_document(7, expected))
    assert revision == 7 and restored == expected
    desired = intent.default_intent(config)
    desired["house"] = {"operatingMode": "heating", "controlMode": "auto"}
    states = {"sensor.living_temp": SimpleNamespace(state="19.0", attributes={})}
    before = intent.preview(house(), desired, states)
    after = intent.preview(config, desired, states)
    assert before == after
    assert all(zone["derived"]["autoPendingConfiguration"] for zone in after["zones"])
