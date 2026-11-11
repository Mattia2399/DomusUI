"""Minimal room membership for Home panels, derived only from House Core."""

from __future__ import annotations

from typing import Any

from ..house.manager import HouseManager

SCHEMA_VERSION = "domusos.dashboard.house.v1"
# Alarm, camera, locks, and security-oriented binary sensors stay on their
# existing paths until the Security permission and privacy review.
PANEL_DOMAINS = frozenset({
    "light", "climate", "media_player", "cover", "sensor", "switch",
    "input_boolean", "fan", "humidifier", "weather", "vacuum", "calendar",
})


async def dashboard_house_context(manager: HouseManager, user: Any) -> dict[str, Any]:
    """Project only HA-readable, non-security panel membership and its room labels."""
    topology = await manager.async_get_topology(user, domains=PANEL_DOMAINS)
    rooms_by_id = {room["id"]: room["name"] for room in topology["rooms"]}
    entities = topology["entities"]
    device_ids = {entity["deviceId"] for entity in entities if entity["deviceId"] is not None}
    devices = [device for device in topology["devices"] if device["id"] in device_ids]
    def room_id_of(area_id: str | None) -> str | None:
        return area_id if area_id in rooms_by_id else None
    referenced_rooms = {
        room_id for room_id in (
            *(room_id_of(device["areaId"]) for device in devices),
            *(room_id_of(entity["effectiveAreaId"]) for entity in entities),
        ) if room_id is not None
    }
    return {
        "schemaVersion": SCHEMA_VERSION,
        "topologyRevision": topology["topologyRevision"],
        "rooms": [{"id": room_id, "name": rooms_by_id[room_id]} for room_id in sorted(referenced_rooms)],
        "devices": [{"id": device["id"], "effectiveRoomId": room_id_of(device["areaId"])} for device in devices],
        "entities": [{
            "registryId": entity["registryId"],
            "entityId": entity["entityId"],
            "deviceId": entity["deviceId"],
            "effectiveRoomId": room_id_of(entity["effectiveAreaId"]),
        } for entity in entities],
    }
