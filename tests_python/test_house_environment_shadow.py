"""Pure parity cases; no Home Assistant import is needed on Windows."""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace

from house_pure import load

resolver = load("resolver")
shadow = load("environment_shadow")
NOW = datetime(2026, 2, 1, tzinfo=UTC)


def state(value: str, unit: str = "°C", device_class: str = "temperature"):
    return SimpleNamespace(state=value, attributes={"unit_of_measurement": unit,
                                             "device_class": device_class, "secret": "private"}, last_updated=NOW)


def house(primary: str | None = None, *, sensor_ids: tuple[str, ...] = ("sensor.temp",)):
    rooms = resolver.normalize_rooms([SimpleNamespace(id="living", name="Living", floor_id=None,
                                                      temperature_entity_id=primary, humidity_entity_id=None)])
    entities = resolver.normalize_entities([SimpleNamespace(id=f"id-{index}", entity_id=entity_id,
                                                            area_id="living", device_id=None, device_class="temperature")
                                          for index, entity_id in enumerate(sensor_ids)])
    return resolver.build_topology([], rooms, [], entities)


def row(topology, states, metric="temperature"):
    result = shadow.build_environment_shadow(topology, states, generated_at="now")
    return next(item for item in result["rows"] if item["metric"] == metric)


def test_2025_absent_area_reference_uses_safe_fallback_and_sanitizes():
    result = shadow.build_environment_shadow(house(), {"sensor.temp": state("21.5")}, generated_at="now")
    reading = result["rows"][0]
    assert reading["category"] == "MATCH"
    assert reading["legacy"]["resolutionSource"] == "AUTO_DISCOVERED_ENTITY"
    assert reading["house"]["resolutionSource"] == "SAFE_ROOM_FALLBACK"
    assert result["readiness"] == "READY" and result["roomsCompared"] == 1
    assert result["counts"]["temperature"]["MATCH"] == 1
    assert "secret" not in str(result) and "attributes" not in str(result)
    unsafe_unit = row(house("sensor.temp"), {"sensor.temp": state("21", "PRIVATE_UNIT")})
    assert "PRIVATE_UNIT" not in str(unsafe_unit)
    assert unsafe_unit["category"] == "HOUSE_UNAVAILABLE"


def test_2026_area_primary_matches_with_tolerance_and_fahrenheit_conversion():
    topology = house("sensor.temp")
    reading = row(topology, {"sensor.temp": state("21.5")})
    assert reading["category"] == "MATCH"
    assert reading["legacy"]["resolutionSource"] == reading["house"]["resolutionSource"] == "HA_AREA_PRIMARY"
    reading = row(topology, {"sensor.temp": state("68", "°F")})
    assert reading["category"] == "MATCH"
    assert abs(reading["house"]["normalizedValue"] - 20) < 1e-8
    assert shadow.compare_readings("temperature", {"available": True, "normalizedValue": 20.04, "entityId": "sensor.a"},
                                   {"available": True, "normalizedValue": 20, "entityId": "sensor.a"}) == "MATCH"


def test_all_comparison_categories_and_explicit_tolerance():
    base = {"available": True, "normalizedValue": 21.0, "entityId": "sensor.a"}
    other = {"available": True, "normalizedValue": 21.0, "entityId": "sensor.b"}
    empty = {"available": False, "normalizedValue": None, "entityId": None}
    missing = {"available": False, "normalizedValue": None, "entityId": "sensor.a"}
    cases = [
        (base, base, "MATCH"), (base, empty, "LEGACY_FALLBACK_ONLY"),
        (empty, base, "HOUSE_PRIMARY_ONLY"), (base, other, "DIFFERENT_SOURCE_SAME_VALUE"),
        (base, {**base, "normalizedValue": 21.11}, "DIFFERENT_VALUE"),
        (empty, empty, "BOTH_UNAVAILABLE"), (missing, base, "LEGACY_UNAVAILABLE"),
        (base, missing, "HOUSE_UNAVAILABLE"),
    ]
    for legacy, house_reading, expected in cases:
        assert shadow.compare_readings("temperature", legacy, house_reading) == expected
    assert shadow.compare_readings("humidity", base, {**base, "normalizedValue": 21.09}) == "MATCH"


def test_primary_unavailable_never_falls_back_and_multiple_candidates_keep_state_order():
    topology = house("sensor.primary", sensor_ids=("sensor.primary", "sensor.first", "sensor.second"))
    states = {"sensor.first": state("20"), "sensor.second": state("22"),
              "sensor.primary": state("unavailable")}
    reading = row(topology, states)
    assert reading["legacy"]["entityId"] == "sensor.primary"
    assert reading["legacy"]["status"] == "unavailable"
    assert reading["category"] == "BOTH_UNAVAILABLE"
    topology["rooms"][0]["temperatureEntityId"] = None
    reading = row(topology, states)
    assert reading["legacy"]["entityId"] == "sensor.first"
    assert reading["legacy"]["normalizedValue"] == 20
    assert reading["category"] == "HOUSE_UNAVAILABLE"


def test_legacy_attribute_value_can_survive_unavailable_primary_state():
    primary = state("unavailable")
    primary.attributes["current_temperature"] = 19.5
    reading = row(house("sensor.temp"), {"sensor.temp": primary})
    assert reading["legacy"]["available"] is True
    assert reading["legacy"]["normalizedValue"] == 19.5
    assert reading["house"]["status"] == "unavailable"
    assert reading["category"] == "HOUSE_UNAVAILABLE"


def test_entity_override_device_inheritance_and_excluded_domains():
    rooms = resolver.normalize_rooms([SimpleNamespace(id="living", name="Living", floor_id=None)])
    devices = resolver.normalize_devices([SimpleNamespace(id="device", name="Monitor", area_id="living")])
    entities = resolver.normalize_entities([
        SimpleNamespace(id="climate", entity_id="climate.thermostat", device_id="device", area_id=None),
        SimpleNamespace(id="weather", entity_id="weather.home", device_id="device", area_id=None),
        SimpleNamespace(id="battery", entity_id="sensor.battery_temperature", device_id="device", area_id=None),
        SimpleNamespace(id="temp", entity_id="sensor.temperature", device_id="device", area_id=None),
    ])
    topology = resolver.build_topology([], rooms, devices, entities)
    states = {"climate.thermostat": state("heat"), "weather.home": state("20"),
              "sensor.battery_temperature": state("24", "%", "battery"),
              "sensor.temperature": state("21")}
    reading = row(topology, states)
    # Name-based legacy heuristic accepts a battery sensor called temperature.
    assert reading["legacy"]["entityId"] == "sensor.battery_temperature"
    assert reading["legacy"]["resolutionSource"] == "DEVICE_INHERITED_ENTITY"
    assert reading["category"] == "LEGACY_UNSAFE_FALLBACK_REJECTED"
    assert row(topology, {"climate.thermostat": state("heat"), "weather.home": state("20")})["legacy"]["entityId"] is None
