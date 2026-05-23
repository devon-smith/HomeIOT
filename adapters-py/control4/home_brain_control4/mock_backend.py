"""In-memory Control4 simulator for sandbox testing and CI."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Callable

from .backend import Backend, LightState, RoomConfig, SceneFiring


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class MockBackend(Backend):
    """Holds per-room light state in memory and records scene firings."""

    def __init__(self) -> None:
        self._lights: dict[str, LightState] = {}
        self._external_handler: Callable[[str, LightState], None] | None = None

    async def init(self, rooms: list[RoomConfig]) -> None:
        for r in rooms:
            self._lights[r.room] = LightState(on=False, brightness=0, online=True)

    async def get_light_state(self, room: str) -> LightState:
        return self._require(room)

    async def set_light(
        self,
        room: str,
        on: bool | None = None,
        brightness: int | None = None,
    ) -> LightState:
        s = self._require(room)
        if on is not None:
            s.on = on
            if on and s.brightness == 0:
                s.brightness = 80
            if not on:
                s.brightness = 0
        if brightness is not None:
            s.brightness = max(0, min(100, brightness))
            s.on = s.brightness > 0
        s.scene = None
        return s

    async def run_room_scene(self, room: str, scene_name: str) -> LightState:
        s = self._require(room)
        # Simulate scene-applied lighting state.
        s.scene = scene_name
        s.on = True
        s.brightness = 50
        return s

    async def run_c4_scene(self, scene_name: str, room: str | None = None) -> SceneFiring:
        return SceneFiring(name=scene_name, fired_at=_now_iso(), room=room)

    def on_external_light_change(self, handler: Callable[[str, LightState], None]) -> None:
        self._external_handler = handler

    def simulate_external_change(self, room: str, on: bool, brightness: int = 0) -> None:
        """Test hook: simulate a keypad press."""
        s = self._require(room)
        s.on = on
        s.brightness = brightness
        if self._external_handler:
            self._external_handler(room, s)

    async def close(self) -> None:
        self._lights.clear()

    def _require(self, room: str) -> LightState:
        if room not in self._lights:
            raise KeyError(f"unknown room: {room}")
        return self._lights[room]
