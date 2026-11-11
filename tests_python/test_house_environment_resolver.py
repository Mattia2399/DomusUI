"""Canonical environment selection and sanitized real-house false positives."""

from __future__ import annotations

from types import SimpleNamespace

from house_pure import load

resolver = load("resolver")
environment = load("environment")
shadow = load("environment_shadow")


def topology(*, primary=None, entries=(), devices=()):
    rooms = resolver.normalize_rooms([SimpleNamespace(
        id="living", name="Living", floor_id=None,
        temperature_entity_id=primary, humidity_entity_id=None,
    )])
    return resolver.build_topology([], rooms, resolver.normalize_devices(devices), resolver.normalize_entities(entries))


def entity(entity_id, metric, *, area="living", device=None, stable=None):
    return SimpleNamespace(id=stable or entity_id, entity_id=entity_id, area_id=area,
                           device_id=device, device_class=metric)


def state(value, metric, unit):
    return SimpleNamespace(state=str(value), attributes={"device_class": metric, "unit_of_measurement": unit})


def test_strict_metric_and_real_qa_rejections():
    rooms = resolver.normalize_rooms([
        SimpleNamespace(id="cucina", name="Cucina"),
        SimpleNamespace(id="giardino", name="Giardino"),
        SimpleNamespace(id="soggiorno", name="Soggiorno"),
    ])
    devices = resolver.normalize_devices([SimpleNamespace(id="stove", name="Stove", area_id="giardino")])
    entries = [
        entity("sensor.a55_di_angela_battery_level", "battery", area="cucina"),
        entity("sensor.stufa_casa_flame_temperature", "temperature", area=None, device="stove"),
        entity("sensor.hp_officejet_3830_series_nero", None, area="soggiorno"),
        entity("sensor.cpu_percent", None, area="soggiorno"),
        entity("sensor.generic_percent", None, area="soggiorno"),
    ]
    house = resolver.build_topology([], rooms, devices, resolver.normalize_entities(entries))
    index = environment.build_environment_candidate_index(house)
    assert index == {}
    states = {
        "sensor.a55_di_angela_battery_level": state(52, "battery", "%"),
        "sensor.stufa_casa_flame_temperature": state(37, "temperature", "°C"),
        "sensor.hp_officejet_3830_series_nero": state(20, None, "%"),
        "sensor.cpu_percent": state(42, None, "%"),
        "sensor.generic_percent": state(67, None, "%"),
    }
    snapshot = resolver.build_snapshot(house, states.get, candidates=index)
    assert all(not room[metric]["available"] for room in snapshot["rooms"] for metric in ("temperature", "humidity"))
    report = shadow.build_environment_shadow(house, states, candidates=index)
    rejected = {(row["roomId"], row["metric"]) for row in report["rows"]
                if row["category"] == "LEGACY_UNSAFE_FALLBACK_REJECTED"}
    assert {("cucina", "humidity"), ("giardino", "temperature"), ("soggiorno", "humidity")} <= rejected
    assert report["acceptedDivergences"] >= 3
    assert report["readiness"] == "READY"


def test_safe_fallback_ranking_stability_and_runtime_updates():
    house = topology(entries=[
        entity("sensor.b_temperature", "temperature", stable="b"),
        entity("sensor.a_temperature", "temperature", stable="a"),
        entity("sensor.humidity", "humidity"),
    ])
    index = environment.build_environment_candidate_index(house)
    assert index[("living", "temperature")] == ["sensor.a_temperature", "sensor.b_temperature"]
    states = {"sensor.a_temperature": state("unavailable", "temperature", "°C"),
              "sensor.b_temperature": state(22, "temperature", "°C"),
              "sensor.humidity": state(48, "humidity", "%")}
    first = resolver.build_snapshot(house, states.get, candidates=index)
    reading = first["rooms"][0]["temperature"]
    assert reading["selectedEntityId"] == "sensor.a_temperature"
    assert reading["selectionSource"] == "SAFE_ROOM_FALLBACK" and not reading["available"]
    assert first["rooms"][0]["humidity"]["value"] == 48
    assert any(issue["code"] == "environment_multiple_safe_candidates" for issue in first["issues"])
    states["sensor.a_temperature"] = state(21, "temperature", "°C")
    second = resolver.build_snapshot(house, states.get, candidates=index)
    assert second["rooms"][0]["temperature"]["value"] == 21
    assert second["topologyFingerprint"] == first["topologyFingerprint"]


def test_device_pair_without_controls_is_safe_but_equipment_and_diagnostics_are_not():
    devices = [SimpleNamespace(id="monitor", name="Monitor", area_id="living"),
               SimpleNamespace(id="stove", name="Stove", area_id="living")]
    house = topology(devices=devices, entries=[
        entity("sensor.monitor_t", "temperature", area=None, device="monitor"),
        entity("sensor.monitor_h", "humidity", area=None, device="monitor"),
        entity("sensor.stove_t", "temperature", area=None, device="stove"),
        entity("sensor.stove_h", "humidity", area=None, device="stove"),
        entity("switch.stove", None, area=None, device="stove"),
    ])
    index = environment.build_environment_candidate_index(house)
    assert index[("living", "temperature")] == ["sensor.monitor_t"]
    assert index[("living", "humidity")] == ["sensor.monitor_h"]
    disabled = environment.build_environment_candidate_index(house, {
        "sensor.monitor_t": {"disabledBy": "user"},
        "sensor.monitor_h": {"entityCategory": "diagnostic"},
    })
    assert disabled == {}


def test_primary_authority_provenance_and_permission_filter():
    house = topology(primary="sensor.outside", entries=[
        entity("sensor.outside", "temperature", area="other"),
        entity("sensor.local", "temperature"),
    ])
    index = environment.build_environment_candidate_index(house)
    assert environment.visible_environment_candidates(index, set()) == {}
    states = {"sensor.outside": state("unavailable", "temperature", "°C"),
              "sensor.local": state(23, "temperature", "°C")}
    reading = resolver.build_snapshot(house, states.get, candidates=index)["rooms"][0]["temperature"]
    assert reading["configuredPrimaryEntityId"] == reading["selectedEntityId"] == "sensor.outside"
    assert reading["status"] == "unavailable" and not reading["fallbackUsed"]
    assert reading["safeFallbackEntityId"] == "sensor.local" and reading["safeFallbackAvailable"]
    assert any(issue["code"] == "environment_primary_outside_room" for issue in house["issues"])
    house["rooms"][0]["temperatureEntityId"] = "sensor.missing"
    missing = resolver.build_snapshot(house, states.get, candidates=index)["rooms"][0]["temperature"]
    assert missing["selectedEntityId"] == "sensor.missing" and missing["status"] == "missing"
    unassigned = topology(primary="sensor.loose", entries=[entity("sensor.loose", "temperature", area=None)])
    assert any(issue["code"] == "environment_primary_unassigned" for issue in unassigned["issues"])


def test_primary_metric_and_unit_validation_does_not_replace_identity():
    house = topology(primary="sensor.explicit", entries=[
        entity("sensor.explicit", "temperature"), entity("sensor.safe", "temperature"),
    ])
    states = {"sensor.explicit": state(52, "battery", "%"),
              "sensor.safe": state(21, "temperature", "°C")}
    reading = resolver.build_snapshot(house, states.get)["rooms"][0]["temperature"]
    assert reading["selectedEntityId"] == "sensor.explicit"
    assert reading["status"] == "metric_mismatch" and not reading["available"]
    states["sensor.explicit"] = state(21, "temperature", "%")
    snapshot = resolver.build_snapshot(house, states.get)
    assert snapshot["rooms"][0]["temperature"]["status"] == "incompatible_unit"
    assert any(issue["code"] == "environment_primary_metric_mismatch" for issue in snapshot["issues"])
