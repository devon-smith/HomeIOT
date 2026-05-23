"""Backend abstraction for the Control4 adapter.

Two implementations:
  - MockBackend: in-memory simulator for sandbox testing and CI.
  - PyControl4Backend: real implementation using the `pyControl4` library.
    Stubbed for now; fill in on the Mac mini when C4 access is available.
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
class SceneFiring:
    name: str
    fired_at: str  # ISO 8601
    room: str | None = None


@dataclass
class RoomConfig:
    room: str
    proxy_id: int  # Composer proxy id for the room's lights


class Backend(Protocol):
    """Contract every Control4 backend must satisfy."""

    async def init(self, rooms: list[RoomConfig]) -> None: ...

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

    async def close(self) -> None: ...
