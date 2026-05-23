"""Real Control4 backend stub. Implementation lands on the Mac mini.

To wire up:
  1. `pip install pyControl4` (uncomment in pyproject.toml)
  2. Get the controller IP, account email, account password, and director
     bearer token via the C4Account / C4Director helpers.
  3. Map each RoomConfig.proxy_id to a C4Light instance for set_light /
     get_light_state.
  4. Use C4Director.sendPostRequest to fire scenes by name (the dealer
     defines these in Composer).
  5. Subscribe to the C4Director WebSocket for keypad / app events and
     route them to `on_external_light_change`.

See https://github.com/lawtancool/pyControl4 for API docs.

Note: Director bearer tokens expire every 86,400 seconds. Implement a
refresh loop using C4Account.getDirectorBearerToken before each call,
or cache with a short TTL.
"""

from __future__ import annotations

from typing import Callable

from .backend import Backend, LightState, RoomConfig, SceneFiring


class PyControl4Backend(Backend):
    async def init(self, rooms: list[RoomConfig]) -> None:
        raise NotImplementedError(
            "PyControl4Backend not implemented — set CONTROL4_MODE=mock for now, "
            "or implement against the pyControl4 library on the Mac mini."
        )

    async def get_light_state(self, room: str) -> LightState:
        raise NotImplementedError

    async def set_light(self, room: str, on: bool | None = None, brightness: int | None = None) -> LightState:
        raise NotImplementedError

    async def run_room_scene(self, room: str, scene_name: str) -> LightState:
        raise NotImplementedError

    async def run_c4_scene(self, scene_name: str, room: str | None = None) -> SceneFiring:
        raise NotImplementedError

    def on_external_light_change(self, handler: Callable[[str, LightState], None]) -> None:
        pass

    async def close(self) -> None:
        pass
