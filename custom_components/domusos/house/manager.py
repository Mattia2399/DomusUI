"""HA-scoped, read-only House Core lifecycle and authorized projections."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from time import monotonic
from typing import Any

from homeassistant.auth.permissions.const import POLICY_READ
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers import floor_registry as fr

from .models import HouseTopology
from .environment_shadow import build_environment_shadow
from .environment import build_environment_candidate_index, visible_environment_candidates
from .resolver import (
    build_snapshot,
    build_topology,
    normalize_devices,
    normalize_entities,
    normalize_floors,
    normalize_rooms,
)

DATA_HOUSE_MANAGER = "house_manager"
_CACHE_SECONDS = 300.0
_PARTIAL_RETRY_SECONDS = 30.0
_LOGGER = logging.getLogger(__name__)
# Rooms needs structural references for its existing live controls. These
# records contain IDs/assignments only; state, camera data and attributes stay
# in HA's separately authorized live stream.
_ROOM_REF_DOMAINS = frozenset({
    "light", "climate", "media_player", "cover", "sensor", "binary_sensor",
    "switch", "input_boolean", "fan", "humidifier", "scene", "weather",
    "lock", "camera",
})


class HouseUnavailableError(Exception):
    """A request reached a stopped or unavailable House runtime."""

    code = "house_unavailable"


class HouseManager:
    """One resolver and cache per HA config entry, never per browser."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._lock = asyncio.Lock()
        self._unsubscribers: list[Callable[[], None]] = []
        self._running = False
        self._dirty = True
        self._cache: HouseTopology | None = None
        self._cached_at = 0.0
        self._revision = 0
        self._environment_candidates: dict[tuple[str, str], list[str]] = {}
        self.rebuild_count = 0

    async def async_setup(self) -> None:
        """Subscribe to the four public registry update events."""
        if self._running:
            return
        self._running = True
        self._dirty = True
        for event_type in (
            fr.EVENT_FLOOR_REGISTRY_UPDATED,
            ar.EVENT_AREA_REGISTRY_UPDATED,
            dr.EVENT_DEVICE_REGISTRY_UPDATED,
            er.EVENT_ENTITY_REGISTRY_UPDATED,
        ):
            self._unsubscribers.append(self.hass.bus.async_listen(event_type, self._on_registry_update))

    @callback
    def _on_registry_update(self, _event: Any) -> None:
        if self._running:
            self._dirty = True

    async def async_shutdown(self) -> None:
        """Prevent new reads and remove listeners before dropping the cache."""
        self._running = False
        for unsubscribe in self._unsubscribers:
            unsubscribe()
        self._unsubscribers.clear()
        async with self._lock:
            self._cache = None
            self._environment_candidates = {}
            self._dirty = True
            self._cached_at = 0.0

    def _read_registries(self) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], list[str], dict[str, dict[str, Any]]]:
        unavailable: list[str] = []

        def read(name: str, fetch: Callable[[], list[dict[str, Any]]]) -> list[dict[str, Any]]:
            try:
                return fetch()
            except Exception:  # One unavailable registry must not break all House reads.
                _LOGGER.exception("Domus House could not read the %s registry", name)
                unavailable.append(name)
                return []

        floors = read("floor", lambda: normalize_floors(fr.async_get(self.hass).async_list_floors()))
        rooms = read("area", lambda: normalize_rooms(ar.async_get(self.hass).async_list_areas()))
        devices = read("device", lambda: normalize_devices(dr.async_get(self.hass).devices.values()))
        registry_entries = read("entity", lambda: list(er.async_get(self.hass).entities.values()))
        entities = normalize_entities(registry_entries)
        metadata = {entry.entity_id: {
            "disabledBy": getattr(entry, "disabled_by", None),
            "hiddenBy": getattr(entry, "hidden_by", None),
            "entityCategory": getattr(entry, "entity_category", None),
        } for entry in registry_entries}
        return floors, rooms, devices, entities, unavailable, metadata

    async def _topology(self) -> HouseTopology:
        if not self._running:
            raise HouseUnavailableError("Domus House is not running")
        async with self._lock:
            if not self._running:
                raise HouseUnavailableError("Domus House is not running")
            ttl = _PARTIAL_RETRY_SECONDS if self._cache and any(issue["code"] == "registry_unavailable" for issue in self._cache["issues"]) else _CACHE_SECONDS
            if self._cache is None or self._dirty or monotonic() - self._cached_at >= ttl:
                floors, rooms, devices, entities, unavailable, metadata = self._read_registries()
                candidate = build_topology(floors, rooms, devices, entities, unavailable_registries=unavailable)
                if self._cache is None or self._dirty or candidate["topologyFingerprint"] != self._cache["topologyFingerprint"]:
                    self._revision += 1
                candidate["topologyRevision"] = self._revision
                self._cache = candidate
                self._environment_candidates = build_environment_candidate_index(candidate, metadata)
                self._cached_at = monotonic()
                self._dirty = False
                self.rebuild_count += 1
            return self._cache

    @staticmethod
    def _may_read_entity(user: Any, entity_id: str) -> bool:
        if getattr(user, "is_admin", False) is True:
            return True
        try:
            return user.permissions.check_entity(entity_id, POLICY_READ) is True
        except Exception:  # noqa: BLE001 - missing/changed HA permission API fails closed
            return False

    def _project(self, source: HouseTopology, user: Any, *, domains: frozenset[str] = _ROOM_REF_DOMAINS) -> HouseTopology:
        """Allow only safe domains and HA-readable entities before serialization."""
        entities = [
            entity for entity in source["entities"]
            if entity["domain"] in domains
            and self._may_read_entity(user, entity["entityId"])
        ]
        entity_ids = {entity["entityId"] for entity in entities}
        device_ids = {entity["deviceId"] for entity in entities if entity["deviceId"] is not None}
        devices = [device for device in source["devices"] if device["id"] in device_ids]
        rooms = []
        for room in source["rooms"]:
            projected = {key: value for key, value in room.items() if key != "capabilities"}
            for field in ("temperatureEntityId", "humidityEntityId"):
                ref = room[field]
                # A missing ref is visible only to an administrator; other
                # accounts must have a real, HA-readable registry entry.
                if ref is not None and ref not in entity_ids and not (getattr(user, "is_admin", False) is True and ref.startswith("sensor.")):
                    projected[field] = None
            rooms.append(projected)
        unavailable = [issue["subjectId"] for issue in source["issues"] if issue["code"] == "registry_unavailable"]
        return build_topology(
            source["floors"], rooms, devices, entities,
            revision=source["topologyRevision"],
            unavailable_registries=unavailable,
            generated_at=source["generatedAt"],
        )

    async def async_get_topology(self, user: Any, *, domains: frozenset[str] = _ROOM_REF_DOMAINS) -> HouseTopology:
        return self._project(await self._topology(), user, domains=domains)

    async def async_get_snapshot(self, user: Any) -> dict[str, Any]:
        topology = self._project(await self._topology(), user)
        visible = {entity["entityId"] for entity in topology["entities"]}
        candidates = visible_environment_candidates(self._environment_candidates, visible)
        return build_snapshot(topology, self.hass.states.get, candidates=candidates)

    async def async_get_room_choices(self) -> dict[str, Any]:
        """Small internal room catalog for administrators editing a linked domain."""
        topology = await self._topology()
        if any(issue["code"] == "registry_unavailable" and issue["subjectId"] == "area"
               for issue in topology["issues"]):
            return {"status": "house_unavailable", "rooms": []}
        floors = {floor["id"]: floor["name"] for floor in topology["floors"]}
        return {"status": "available", "rooms": [
            {"id": room["id"], "name": room["name"], "floorId": room["floorId"],
             "floorName": floors.get(room["floorId"])}
            for room in topology["rooms"]
        ]}

    async def async_get_room_contexts(self, user: Any, room_ids: set[str]) -> dict[str, Any]:
        """Return only requested rooms and HA-readable environmental readings.

        This is an internal domain projection. It never returns topology,
        devices, unrelated rooms or raw entity attributes to its caller.
        """
        source = await self._topology()
        topology = self._project(source, user)
        rooms = {room["id"]: room for room in topology["rooms"] if room["id"] in room_ids}
        floors = {floor["id"]: floor["name"] for floor in topology["floors"]}
        visible = {entity["entityId"] for entity in topology["entities"]}
        candidates = visible_environment_candidates(self._environment_candidates, visible)
        selected = {**topology, "rooms": list(rooms.values())}
        snapshot = build_snapshot(selected, self.hass.states.get, candidates=candidates)
        readings = {item["roomId"]: item for item in snapshot["rooms"]}
        area_unavailable = any(issue["code"] == "registry_unavailable" and issue["subjectId"] == "area"
                               for issue in source["issues"])
        result = {}
        for room_id in room_ids:
            room = rooms.get(room_id)
            if room is None:
                result[room_id] = {"status": "house_unavailable" if area_unavailable else "room_missing"}
                continue
            environment = readings[room_id]
            result[room_id] = {
                "status": "linked", "room": {"id": room_id, "name": room["name"],
                                             "floorId": room["floorId"], "floorName": floors.get(room["floorId"]),
                                             "available": True},
                "environment": {metric: {
                    key: environment[metric][key]
                    for key in ("value", "unit", "available", "sourceEntityId", "updatedAt", "status")
                } for metric in ("temperature", "humidity")},
                "issues": [issue["code"] for issue in (*topology["issues"], *snapshot["issues"])
                           if issue["subjectId"] == room_id],
            }
        return {"topologyRevision": topology["topologyRevision"], "rooms": result}

    async def async_get_environment_shadow(self, user: Any) -> dict[str, Any]:
        """Admin-only, on-demand diagnostic; never cache HA states or telemetry."""
        if getattr(user, "is_admin", False) is not True:
            raise PermissionError("House diagnostics require an HA administrator")
        topology = self._project(await self._topology(), user)
        # HA state insertion order is the order Rooms receives in its live map.
        # One snapshot avoids mixed state reads while topology remains cached.
        states = {state.entity_id: state for state in self.hass.states.async_all()}
        visible = {entity["entityId"] for entity in topology["entities"]}
        candidates = visible_environment_candidates(self._environment_candidates, visible)
        return build_environment_shadow(topology, states, candidates=candidates)
