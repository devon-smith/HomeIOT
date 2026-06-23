"""In-memory Control4 simulator for sandbox testing and CI."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Callable

from .backend import (
    AvConfig,
    AvState,
    Backend,
    ClimateState,
    LightState,
    RoomConfig,
    SceneFiring,
    SkylightConfig,
    SkylightState,
    ThermostatConfig,
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class MockBackend(Backend):
    """Holds per-room light state in memory and records scene firings."""

    def __init__(self) -> None:
        self._lights: dict[str, LightState] = {}
        self._climate: dict[str, ClimateState] = {}  # keyed by device slot
        self._skylights: dict[tuple[str, str], SkylightState] = {}  # (room, device)
        self._avs: dict[tuple[str, str], AvState] = {}
        self._av_sources: dict[tuple[str, str], dict[str, int]] = {}
        self._external_handler: Callable[[str, LightState], None] | None = None

    async def init(
        self,
        rooms: list[RoomConfig],
        thermostats: list[ThermostatConfig] | None = None,
        skylights: list[SkylightConfig] | None = None,
        avs: list[AvConfig] | None = None,
    ) -> None:
        for r in rooms:
            self._lights[r.room] = LightState(on=False, brightness=0, online=True)
        for t in thermostats or []:
            self._climate[t.device] = ClimateState(
                current_f=72.0,
                heat_setpoint_f=68.0,
                cool_setpoint_f=76.0,
                mode="auto",
                hvac_state="idle",
                online=True,
            )
        for s in skylights or []:
            self._skylights[(s.room, s.device)] = SkylightState(position=0, online=True)
        for a in avs or []:
            self._avs[(a.room, a.device)] = AvState(online=True)
            self._av_sources[(a.room, a.device)] = dict(a.sources)

    # Lights ----------------------------------------------------------------

    async def get_light_state(self, room: str) -> LightState:
        return self._require_light(room)

    async def set_light(
        self,
        room: str,
        on: bool | None = None,
        brightness: int | None = None,
    ) -> LightState:
        s = self._require_light(room)
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
        s = self._require_light(room)
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
        s = self._require_light(room)
        s.on = on
        s.brightness = brightness
        if self._external_handler:
            self._external_handler(room, s)

    # Climate ---------------------------------------------------------------

    async def get_climate_state(self, device: str) -> ClimateState:
        return self._require_climate(device)

    async def set_climate(
        self,
        device: str,
        target_f: float | None = None,
        mode: str | None = None,
    ) -> ClimateState:
        s = self._require_climate(device)
        if mode is not None:
            s.mode = mode
        if target_f is not None:
            # Apply to whichever setpoint matches the mode; auto updates both.
            if s.mode == "heat":
                s.heat_setpoint_f = float(target_f)
            elif s.mode == "cool":
                s.cool_setpoint_f = float(target_f)
            else:
                s.heat_setpoint_f = float(target_f) - 2
                s.cool_setpoint_f = float(target_f) + 2
        return s

    # Skylights -------------------------------------------------------------

    async def get_skylight_state(self, room: str, device: str) -> SkylightState:
        return self._require_skylight(room, device)

    async def set_skylight(self, room: str, device: str, position: int) -> SkylightState:
        s = self._require_skylight(room, device)
        s.position = max(0, min(100, int(position)))
        return s

    # AV --------------------------------------------------------------------

    async def get_av_state(self, room: str, device: str) -> AvState:
        return self._require_av(room, device)

    async def watch_av(self, room: str, device: str, source: str) -> AvState:
        s = self._require_av(room, device)
        sources = self._av_sources.get((room, device), {})
        if source not in sources:
            raise KeyError(f"unknown source '{source}' for {room}.{device} (have: {list(sources)})")
        s.power = True
        s.current_source = source
        s.current_device_id = sources[source]
        return s

    async def av_off(self, room: str, device: str) -> AvState:
        s = self._require_av(room, device)
        s.power = False
        s.current_source = None
        s.current_device_id = 0
        return s

    async def set_av_volume(self, room: str, device: str, level: int) -> AvState:
        s = self._require_av(room, device)
        s.volume = max(0, min(100, int(level)))
        return s

    async def set_av_mute(self, room: str, device: str, muted: bool) -> AvState:
        s = self._require_av(room, device)
        s.muted = bool(muted)
        return s

    async def close(self) -> None:
        self._lights.clear()
        self._climate.clear()
        self._skylights.clear()
        self._avs.clear()
        self._av_sources.clear()

    def _require_light(self, room: str) -> LightState:
        if room not in self._lights:
            raise KeyError(f"unknown room: {room}")
        return self._lights[room]

    def _require_climate(self, device: str) -> ClimateState:
        if device not in self._climate:
            raise KeyError(f"unknown climate device: {device}")
        return self._climate[device]

    def _require_skylight(self, room: str, device: str) -> SkylightState:
        if (room, device) not in self._skylights:
            raise KeyError(f"unknown skylight: {room}.{device}")
        return self._skylights[(room, device)]

    def _require_av(self, room: str, device: str) -> AvState:
        if (room, device) not in self._avs:
            raise KeyError(f"unknown av: {room}.{device}")
        return self._avs[(room, device)]
