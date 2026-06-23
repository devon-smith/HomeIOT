"""Backend abstraction for the Control4 adapter.

Two implementations:
  - MockBackend: in-memory simulator for sandbox testing and CI.
  - PyControl4Backend: real implementation using the `pyControl4` library.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Protocol


@dataclass
class LightState:
    on: bool = False
    brightness: int = 0  # 0–100
    scene: str | None = None
    online: bool = True


@dataclass
class ClimateState:
    current_f: float | None = None
    heat_setpoint_f: float | None = None
    cool_setpoint_f: float | None = None
    mode: str = "off"  # heat | cool | auto | off
    hvac_state: str = "idle"  # idle | heating | cooling | fan
    online: bool = True


@dataclass
class SkylightState:
    position: int = 0  # 0 = closed, 100 = open
    online: bool = True


@dataclass
class AvState:
    power: bool = False
    current_source: str | None = None  # human name from sources map
    current_device_id: int = 0
    volume: int = 0  # 0–100
    muted: bool = False
    online: bool = True


@dataclass
class SceneFiring:
    name: str
    fired_at: str  # ISO 8601
    room: str | None = None


@dataclass
class RoomConfig:
    room: str
    c4_room_id: int = 0  # Director room id (type 8) — used for scoping/diagnostics
    light_ids: list[int] = field(default_factory=list)  # type-7 load IDs in this room
    proxy_id: int = 0  # legacy; kept so old configs still parse


@dataclass
class ThermostatConfig:
    room: str        # house.yaml room slug (e.g. "upstairs_hvac")
    device: str      # device slot name (e.g. "hvac_upstairs")
    item_id: int     # Director item id for the thermostat


@dataclass
class SkylightConfig:
    room: str            # house.yaml room slug (e.g. "kitchen")
    device: str          # device slot name (e.g. "skylight")
    item_ids: list[int]  # Director item ids for the motorized covers in this group


@dataclass
class AvConfig:
    room: str             # house.yaml room slug (e.g. "theater")
    device: str           # device slot name (e.g. "av")
    c4_room_id: int       # Director room id (type 8) for this AV room
    sources: dict[str, int] = field(default_factory=dict)  # source name -> source item id


class Backend(Protocol):
    """Contract every Control4 backend must satisfy."""

    async def init(
        self,
        rooms: list[RoomConfig],
        thermostats: list[ThermostatConfig] | None = None,
        skylights: list[SkylightConfig] | None = None,
        avs: list[AvConfig] | None = None,
    ) -> None: ...

    # Lights ------------------------------------------------------------
    async def get_light_state(self, room: str) -> LightState: ...

    async def set_light(
        self,
        room: str,
        on: bool | None = None,
        brightness: int | None = None,
    ) -> LightState: ...

    async def run_room_scene(self, room: str, scene_name: str) -> LightState: ...

    async def run_c4_scene(self, scene_name: str, room: str | None = None) -> SceneFiring: ...

    def on_external_light_change(self, handler: Callable[[str, LightState], None]) -> None: ...

    # Climate / HVAC ----------------------------------------------------
    async def get_climate_state(self, device: str) -> ClimateState: ...

    async def set_climate(
        self,
        device: str,
        target_f: float | None = None,
        mode: str | None = None,
    ) -> ClimateState: ...

    # Skylights / Blinds ------------------------------------------------
    async def get_skylight_state(self, room: str, device: str) -> SkylightState: ...

    async def set_skylight(
        self,
        room: str,
        device: str,
        position: int,
    ) -> SkylightState: ...

    # AV (room-centric Control4 source select) --------------------------
    async def get_av_state(self, room: str, device: str) -> AvState: ...

    async def watch_av(self, room: str, device: str, source: str) -> AvState: ...

    async def av_off(self, room: str, device: str) -> AvState: ...

    async def set_av_volume(self, room: str, device: str, level: int) -> AvState: ...

    async def set_av_mute(self, room: str, device: str, muted: bool) -> AvState: ...

    async def close(self) -> None: ...
