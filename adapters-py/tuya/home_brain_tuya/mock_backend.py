"""In-memory Tuya simulator for sandbox testing."""

from __future__ import annotations

import asyncio
from typing import Callable

from .backend import Backend, ClimateState, DeviceConfig, Mode, SwitchState


class MockBackend(Backend):
    def __init__(self, tick_interval_s: float = 1.0) -> None:
        self._kinds: dict[tuple[str, str], str] = {}
        self._climate: dict[tuple[str, str], ClimateState] = {}
        self._switch: dict[tuple[str, str], SwitchState] = {}
        self._handler: Callable[[str, str, ClimateState | SwitchState], None] | None = None
        self._tick_interval_s = tick_interval_s
        self._tick_task: asyncio.Task[None] | None = None

    async def init(self, devices: list[DeviceConfig]) -> None:
        for d in devices:
            self._kinds[(d.room, d.device)] = d.kind
            if d.kind == "climate":
                # Sauna defaults: cool starting temp, warm-target preset
                target = 170.0 if d.device == "sauna" else 75.0
                self._climate[(d.room, d.device)] = ClimateState(
                    target_f=target,
                    current_f=72.0,
                    mode="off",
                    heating=False,
                )
            else:
                self._switch[(d.room, d.device)] = SwitchState(on=False)
        self._tick_task = asyncio.create_task(self._tick_loop())

    async def get_state(self, room: str, device: str) -> ClimateState | SwitchState:
        kind = self._kinds.get((room, device))
        if kind == "climate":
            return self._climate[(room, device)]
        if kind == "switch":
            return self._switch[(room, device)]
        raise KeyError(f"unknown device: {room}.{device}")

    async def set_target(self, room: str, device: str, target_f: float) -> ClimateState:
        self._must_be("climate", room, device)
        s = self._climate[(room, device)]
        s.target_f = max(60.0, min(200.0, target_f))
        if s.mode == "off" and s.target_f > s.current_f:
            s.mode = "heat"
        s.heating = s.mode == "heat" and s.current_f < s.target_f
        return s

    async def set_mode(self, room: str, device: str, mode: Mode) -> ClimateState:
        self._must_be("climate", room, device)
        s = self._climate[(room, device)]
        s.mode = mode
        s.heating = mode == "heat" and s.current_f < s.target_f
        return s

    async def set_on(self, room: str, device: str, on: bool) -> SwitchState:
        self._must_be("switch", room, device)
        s = self._switch[(room, device)]
        s.on = on
        return s

    def on_external_change(
        self,
        handler: Callable[[str, str, ClimateState | SwitchState], None],
    ) -> None:
        self._handler = handler

    async def close(self) -> None:
        if self._tick_task:
            self._tick_task.cancel()

    def _must_be(self, expected: str, room: str, device: str) -> None:
        kind = self._kinds.get((room, device))
        if kind is None:
            raise KeyError(f"unknown device: {room}.{device}")
        if kind != expected:
            raise ValueError(f"{room}.{device} is a {kind} device, not {expected}")

    async def _tick_loop(self) -> None:
        """Sauna heats faster than a hot tub — 1/15 of the gap per tick."""
        try:
            while True:
                await asyncio.sleep(self._tick_interval_s)
                for (room, device), s in self._climate.items():
                    if s.heating:
                        gap = s.target_f - s.current_f
                        if abs(gap) < 0.5:
                            s.heating = False
                            s.current_f = s.target_f
                        else:
                            s.current_f += gap / 15.0
                        if self._handler:
                            self._handler(room, device, s)
        except asyncio.CancelledError:
            return
