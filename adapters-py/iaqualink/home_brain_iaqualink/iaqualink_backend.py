"""Real iAquaLink backend stub. Implementation lands on the Mac mini.

To wire up:
  1. `pip install iaqualink` (uncomment in pyproject.toml)
  2. Configure IAQUALINK_EMAIL and IAQUALINK_PASSWORD env vars
  3. Use `iaqualink.AqualinkClient` to authenticate, fetch systems, and
     control them via `set_temperature` / `set_aux` / etc.
  4. Run a 20-30s poll loop calling `system.update()` then publish state
     diffs. iAquaLink does not push updates, so polling is the only path.
  5. Respect the library's 429 backoff — Jandy rate-limits aggressively.

See https://github.com/flz/iaqualink-py for API docs and example usage.
"""

from __future__ import annotations

from typing import Callable

from .backend import Backend, ClimateState, DeviceConfig, Mode


class IAquaLinkBackend(Backend):
    async def init(self, devices: list[DeviceConfig]) -> None:
        raise NotImplementedError(
            "IAquaLinkBackend not implemented — set IAQUALINK_MODE=mock for now, "
            "or implement against iaqualink-py on the Mac mini."
        )

    async def get_state(self, room: str, device: str) -> ClimateState:
        raise NotImplementedError

    async def set_target(self, room: str, device: str, target_f: float) -> ClimateState:
        raise NotImplementedError

    async def set_mode(self, room: str, device: str, mode: Mode) -> ClimateState:
        raise NotImplementedError

    def on_external_change(
        self, handler: Callable[[str, str, ClimateState], None]
    ) -> None:
        pass

    async def close(self) -> None:
        pass
