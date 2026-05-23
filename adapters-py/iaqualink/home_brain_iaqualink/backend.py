"""Backend abstraction for the iAquaLink adapter.

Two implementations:
  - MockBackend: in-memory simulator with a basic heating model for sandbox
    testing and CI.
  - IAquaLinkBackend: real implementation using `iaqualink-py`. Stubbed for
    now; fill in on the Mac mini once credentials are configured.

Cloud REST semantics — every state update goes through Jandy/Zodiac's
servers. Expect 10–30s propagation for confirmed state changes. The
adapter compensates with optimistic state at the orchestrator layer.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Literal, Protocol


Mode = Literal["heat", "cool", "off", "auto"]


@dataclass
class ClimateState:
    target_f: float
    current_f: float
    mode: Mode
    heating: bool
    online: bool = True


@dataclass
class DeviceConfig:
    room: str
    device: str  # "hot_tub" or "pool"
    system: str  # iAquaLink system name (e.g. "spa", "pool")


class Backend(Protocol):
    """Contract every iAquaLink backend must satisfy."""

    async def init(self, devices: list[DeviceConfig]) -> None: ...

    async def get_state(self, room: str, device: str) -> ClimateState: ...

    async def set_target(self, room: str, device: str, target_f: float) -> ClimateState: ...

    async def set_mode(self, room: str, device: str, mode: Mode) -> ClimateState: ...

    def on_external_change(
        self, handler: Callable[[str, str, ClimateState], None]
    ) -> None: ...

    async def close(self) -> None: ...
