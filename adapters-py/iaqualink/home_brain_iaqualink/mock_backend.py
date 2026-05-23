"""In-memory iAquaLink simulator for sandbox testing.

Models a hot tub and pool with a simple heating curve: every second of
simulated time the current_f moves 1/30 of the way to the target_f when
heating is active. Enough to demonstrate the optimistic-state UX
("pending") without the cloud round-trip.
"""

from __future__ import annotations

import asyncio
from typing import Callable

from .backend import Backend, ClimateState, DeviceConfig, Mode

_DEFAULT_TARGETS: dict[str, float] = {"hot_tub": 102.0, "pool": 82.0}
_DEFAULT_CURRENT: dict[str, float] = {"hot_tub": 88.0, "pool": 78.0}


class MockBackend(Backend):
    def __init__(self, tick_interval_s: float = 1.0) -> None:
        self._states: dict[tuple[str, str], ClimateState] = {}
        self._handler: Callable[[str, str, ClimateState], None] | None = None
        self._tick_interval_s = tick_interval_s
        self._tick_task: asyncio.Task[None] | None = None

    async def init(self, devices: list[DeviceConfig]) -> None:
        for d in devices:
            target = _DEFAULT_TARGETS.get(d.device, 80.0)
            current = _DEFAULT_CURRENT.get(d.device, 75.0)
            self._states[(d.room, d.device)] = ClimateState(
                target_f=target,
                current_f=current,
                mode="off",
                heating=False,
            )
        self._tick_task = asyncio.create_task(self._tick_loop())

    async def get_state(self, room: str, device: str) -> ClimateState:
        return self._require(room, device)

    async def set_target(self, room: str, device: str, target_f: float) -> ClimateState:
        s = self._require(room, device)
        s.target_f = max(60.0, min(110.0, target_f))
        # Setting a higher target implies heat mode.
        if s.mode == "off" and s.target_f > s.current_f:
            s.mode = "heat"
        s.heating = s.mode == "heat" and s.current_f < s.target_f
        return s

    async def set_mode(self, room: str, device: str, mode: Mode) -> ClimateState:
        s = self._require(room, device)
        s.mode = mode
        s.heating = mode == "heat" and s.current_f < s.target_f
        return s

    def on_external_change(
        self, handler: Callable[[str, str, ClimateState], None]
    ) -> None:
        self._handler = handler

    async def close(self) -> None:
        if self._tick_task:
            self._tick_task.cancel()

    def _require(self, room: str, device: str) -> ClimateState:
        s = self._states.get((room, device))
        if s is None:
            raise KeyError(f"unknown device: {room}.{device}")
        return s

    async def _tick_loop(self) -> None:
        """Advance current_f toward target_f when heating; emit external changes."""
        try:
            while True:
                await asyncio.sleep(self._tick_interval_s)
                for (room, device), s in self._states.items():
                    if s.heating:
                        gap = s.target_f - s.current_f
                        if abs(gap) < 0.1:
                            s.heating = False
                            s.current_f = s.target_f
                        else:
                            s.current_f += gap / 30.0  # ~30 ticks to converge
                        if self._handler:
                            self._handler(room, device, s)
        except asyncio.CancelledError:
            return
