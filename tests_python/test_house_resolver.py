"""Pure, cross-version House topology and snapshot contract tests."""

from __future__ import annotations

import ast
from datetime import UTC, datetime
from types import SimpleNamespace

from house_pure import HOUSE_DIR, load

resolver = load("resolver")


def house():
    floors = resolver.normalize_floors([
        SimpleNamespace(floor_id="upper", name="Upper", level=1, aliases={"Up"}),
        SimpleNamespace(floor_id="ground", name="Ground", level=0, aliases=set()),
    ])
    rooms = resolver.normalize_rooms([
        SimpleNamespace(id="living", name="Living", floor_id="ground", aliases={"Lounge"}, icon="mdi:sofa", picture=None,
                        temperature_entity_id="sensor.living_temp", humidity_entity_id="sensor.living_humidity"),
        SimpleNamespace(id="attic", name="Attic", floor_id="upper", aliases=set(), icon=None, picture=None),
    ])
    devices = resolver.normalize_devices([
        SimpleNamespace(id="dev1", name="Thermometer", name_by_user=None, area_id="living"),
        SimpleNamespace(id="dev2", name="Loose", name_by_user=None, area_id=None),
    ])
    entities = resolver.normalize_entities([
        SimpleNamespace(id="stable-1", entity_id="sensor.living_temp", device_id="dev1", area_id=None, device_class="temperature"),
        SimpleNamespace(id="stable-2", entity_id="sensor.living_humidity", device_id="dev1", area_id=None, device_class="humidity"),
        SimpleNamespace(id="stable-3", entity_id="light.living", device_id="dev1", area_id="attic", device_class=None),
        SimpleNamespace(id="stable-4", entity_id="light.loose", device_id="dev2", area_id=None, device_class=None),
        SimpleNamespace(id="stable-5", entity_id="light.orphan", device_id=None, area_id=None, device_class=None),
    ])
    return floors, rooms, devices, entities


def test_normalizes_native_ids_floor_order_and_optional_2025_area_fields():
    floors, rooms, devices, entities = house()
    assert [(item["id"], item["order"], item["level"]) for item in floors] == [("upper", 0, 1), ("ground", 1, 0)]
    assert rooms[0]["id"] == "attic" and rooms[1]["floorId"] == "ground"
    assert rooms[1]["aliases"] == ["Lounge"] and rooms[1]["temperatureEntityId"] == "sensor.living_temp"
    assert rooms[0]["temperatureEntityId"] is None and rooms[0]["humidityEntityId"] is None
    assert devices[0]["id"] == "dev1"
    assert next(item for item in entities if item["entityId"] == "sensor.living_temp")["registryId"] == "stable-1"


def test_effective_area_override_inheritance_and_legitimate_unassigned():
    topology = resolver.build_topology(*house(), generated_at="first")
    by_id = {item["entityId"]: item for item in topology["entities"]}
    assert by_id["sensor.living_temp"]["effectiveAreaId"] == "living"
    assert by_id["light.living"]["effectiveAreaId"] == "attic"
    assert by_id["light.loose"]["effectiveAreaId"] is None
    assert by_id["light.orphan"]["effectiveAreaId"] is None
    assert topology["unassigned"] == {"deviceIds": ["dev2"], "entityIds": ["light.loose", "light.orphan"]}
    assert topology["issues"] == []
    assert [cap["name"] for cap in topology["rooms"][1]["capabilities"]] == ["environment"]


def test_detects_real_missing_references_without_repairing_them():
    floors, rooms, devices, entities = house()
    rooms[0]["floorId"] = "missing-floor"
    rooms[1]["temperatureEntityId"] = "sensor.missing"
    rooms[1]["humidityEntityId"] = "sensor.missing_humidity"
    devices[0]["areaId"] = "missing-area"
    entities[0]["deviceId"] = "missing-device"
    topology = resolver.build_topology(floors, rooms, devices, entities)
    codes = {issue["code"] for issue in topology["issues"]}
    assert {"missing_floor_reference", "missing_area_reference", "missing_device_reference",
            "missing_temperature_entity", "missing_humidity_entity", "environment_primary_missing"} <= codes
    assert next(item for item in topology["entities"] if item["entityId"] == "light.loose")["effectiveAreaId"] is None


def test_fingerprint_ignores_time_and_state_but_changes_on_topology_changes():
    floors, rooms, devices, entities = house()
    first = resolver.build_topology(floors, rooms, devices, entities, generated_at="first")
    again = resolver.build_topology(floors, list(reversed(rooms)), list(reversed(devices)), list(reversed(entities)), generated_at="second")
    assert first["topologyFingerprint"] == again["topologyFingerprint"]
    assert first["generatedAt"] != again["generatedAt"]
    renamed = [dict(room) for room in rooms]
    renamed[1]["name"] = "New Living"
    moved = [dict(room) for room in rooms]
    moved[1]["floorId"] = "upper"
    assert resolver.build_topology(floors, renamed, devices, entities)["topologyFingerprint"] != first["topologyFingerprint"]
    assert resolver.build_topology(floors, moved, devices, entities)["topologyFingerprint"] != first["topologyFingerprint"]
    reordered = [{**floor, "order": 1 - floor["order"]} for floor in floors]
    assert resolver.build_topology(reordered, rooms, devices, entities)["topologyFingerprint"] != first["topologyFingerprint"]


def test_snapshot_preserves_value_unit_timestamp_and_never_returns_raw_attributes():
    topology = resolver.build_topology(*house())
    now = datetime(2026, 2, 1, tzinfo=UTC)
    states = {
        "sensor.living_temp": SimpleNamespace(state="21.5", attributes={"unit_of_measurement": "°C", "secret": "private"}, last_updated=now),
        "sensor.living_humidity": SimpleNamespace(state="48", attributes={"unit_of_measurement": "%", "coordinates": [1, 2]}, last_updated=now),
    }
    result = resolver.build_snapshot(topology, states.get)
    living = next(room for room in result["rooms"] if room["roomId"] == "living")
    assert {key: living["temperature"][key] for key in ("configured", "available", "value", "unit", "sourceEntityId", "updatedAt", "status")} == {
        "configured": True, "available": True, "value": 21.5, "unit": "°C", "sourceEntityId": "sensor.living_temp", "updatedAt": now.isoformat(), "status": "available"}
    assert living["temperature"]["selectionSource"] == "HA_AREA_PRIMARY"
    assert living["humidity"]["value"] == 48 and living["humidity"]["unit"] == "%"
    assert "secret" not in str(result) and "coordinates" not in str(result)
    states["sensor.living_temp"].state = "22"
    changed = resolver.build_snapshot(topology, states.get)
    assert changed["rooms"][1]["temperature"]["value"] == 22
    assert changed["topologyFingerprint"] == result["topologyFingerprint"] == topology["topologyFingerprint"]


def test_snapshot_unavailable_unknown_missing_and_unconfigured():
    topology = resolver.build_topology(*house())
    state = SimpleNamespace(state="unavailable", attributes={"unit_of_measurement": "°C"}, last_updated=None)
    assert resolver.environmental_reading("sensor.x", state)["status"] == "unavailable"
    state.state = "unknown"
    assert resolver.environmental_reading("sensor.x", state)["status"] == "unknown"
    assert resolver.environmental_reading("sensor.x", None)["status"] == "missing"
    assert resolver.environmental_reading(None, None)["status"] == "unconfigured"
    assert resolver.build_snapshot(topology, {}.get)["rooms"][1]["temperature"]["available"] is False


def test_partial_registry_failure_and_invalid_environmental_value():
    topology = resolver.build_topology(*house(), unavailable_registries=["entity", "area", "entity"])
    unavailable = [issue for issue in topology["issues"] if issue["code"] == "registry_unavailable"]
    assert [issue["subjectId"] for issue in unavailable] == ["area", "entity"]
    assert resolver.environmental_reading("sensor.x", SimpleNamespace(state="not-a-number", attributes={}, last_updated=None))["status"] == "invalid"
    assert resolver.environmental_reading("sensor.x", SimpleNamespace(state="nan", attributes={}, last_updated=None))["available"] is False


def test_house_module_has_no_service_call_or_registry_write_method():
    forbidden = {"async_call", "async_create", "async_update", "async_delete", "async_remove_device", "async_update_entity", "async_update_device"}
    for path in HOUSE_DIR.glob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        assert not [node.func.attr for node in ast.walk(tree) if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr in forbidden], path
