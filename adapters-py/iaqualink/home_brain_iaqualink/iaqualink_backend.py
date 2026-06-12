"""Real iAquaLink backend using the `iaqualink` Python library.

Cloud-only — every read and write goes through Jandy/Zodiac's servers.
We poll every 30s and emit diffs as external changes; tighter intervals
risk rate-limiting (429).

Device mapping: house.yaml declares one DeviceConfig per controllable
piece (e.g. backyard.hot_tub with config.system=spa, backyard.pool with
config.system=pool). The system tag (spa | pool) maps to iAquaLink's
internal device IDs: ``{tag}_set_point`` for the thermostat,
``{tag}_temp`` for the current temperature read, ``{tag}_heater`` for
the heater on/off.

Environment: reads IAQUALINK_EMAIL and IAQUALINK_PASSWORD via main.py.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Callable

from .backend import Backend, ClimateState, DeviceConfig, Mode

log = logging.getLogger("iaqualink.real")

POLL_INTERVAL_S = 30
LOGIN_RETRY_S = 60


class IAquaLinkBackend(Backend):
    def __init__(self, email: str, password: str) -> None:
        self._email = email
        self._password = password
        self._client: Any = None
        self._system: Any = None
        self._devices_cfg: list[DeviceConfig] = []
        self._handler: Callable[[str, str, ClimateState], None] | None = None
        self._last_state: dict[tuple[str, str], ClimateState] = {}
        self._poll_task: asyncio.Task[None] | None = None

    async def init(self, devices: list[DeviceConfig]) -> None:
        # Import lazily so the mock path doesn't require the library installed.
        from iaqualink.client import AqualinkClient

        self._devices_cfg = devices
        self._client = AqualinkClient(self._email, self._password)
        await self._client.login()

        systems = await self._client.get_systems()
        if not systems:
            raise RuntimeError("iaqualink: no systems found on this account")
        self._system = next(iter(systems.values()))
        log.info(
            "iaqualink connected, system=%s devices=%s",
            getattr(self._system, "serial", "?"),
            [(d.room, d.device, d.system) for d in devices],
        )

        # Prime the state cache so the first poll cycle doesn't emit phantom changes.
        for d in devices:
            try:
                state = await self._read(d.room, d.device, d.system)
                self._last_state[(d.room, d.device)] = state
            except Exception as err:
                log.warning("init read for %s.%s failed: %s", d.room, d.device, err)

        self._poll_task = asyncio.create_task(self._poll_loop())

    async def get_state(self, room: str, device: str) -> ClimateState:
        cfg = self._find(room, device)
        return await self._read(room, device, cfg.system)

    async def set_target(self, room: str, device: str, target_f: float) -> ClimateState:
        cfg = self._find(room, device)
        device_map = await self._refresh_devices()
        set_point = device_map.get(f"{cfg.system}_set_point")
        if set_point is None:
            raise RuntimeError(f"iaqualink: no '{cfg.system}_set_point' on this system")
        await set_point.set_temperature(int(round(target_f)))
        return await self._read(room, device, cfg.system)

    async def set_mode(self, room: str, device: str, mode: Mode) -> ClimateState:
        cfg = self._find(room, device)
        device_map = await self._refresh_devices()
        heater = device_map.get(f"{cfg.system}_heater")
        if heater is None:
            raise RuntimeError(f"iaqualink: no '{cfg.system}_heater' on this system")
        if mode == "heat":
            await heater.turn_on()
        elif mode == "off":
            await heater.turn_off()
        # iAquaLink doesn't expose cool / auto on spa/pool heaters.
        return await self._read(room, device, cfg.system)

    def on_external_change(self, handler: Callable[[str, str, ClimateState], None]) -> None:
        self._handler = handler

    async def close(self) -> None:
        if self._poll_task:
            self._poll_task.cancel()
            try:
                await self._poll_task
            except (asyncio.CancelledError, Exception):
                pass
        if self._client and hasattr(self._client, "close"):
            try:
                await self._client.close()
            except Exception as err:
                log.warning("iaqualink client close failed: %s", err)

    # ------------------------------------------------------------------ internals

    def _find(self, room: str, device: str) -> DeviceConfig:
        cfg = next((d for d in self._devices_cfg if d.room == room and d.device == device), None)
        if cfg is None:
            raise KeyError(f"unknown iaqualink device: {room}.{device}")
        return cfg

    async def _refresh_devices(self) -> dict[str, Any]:
        if self._system is None:
            return {}
        await self._system.update()
        return await self._system.get_devices()

    async def _read(self, room: str, device: str, system_tag: str) -> ClimateState:
        try:
            device_map = await self._refresh_devices()
        except Exception as err:
            log.warning("iaqualink refresh failed for %s.%s: %s", room, device, err)
            return ClimateState(target_f=0.0, current_f=0.0, mode="off", heating=False, online=False)

        set_point = device_map.get(f"{system_tag}_set_point")
        temp = device_map.get(f"{system_tag}_temp")
        heater = device_map.get(f"{system_tag}_heater")

        def _f(d: Any) -> float:
            if d is None:
                return 0.0
            try:
                return float(d.state)
            except (TypeError, ValueError):
                return 0.0

        target_f = _f(set_point)
        current_f = _f(temp)
        heating = bool(getattr(heater, "is_on", False)) if heater is not None else False
        mode: Mode = "heat" if heating else "off"

        return ClimateState(
            target_f=target_f,
            current_f=current_f,
            mode=mode,
            heating=heating,
            online=True,
        )

    async def _poll_loop(self) -> None:
        try:
            while True:
                await asyncio.sleep(POLL_INTERVAL_S)
                for d in self._devices_cfg:
                    try:
                        state = await self._read(d.room, d.device, d.system)
                    except Exception as err:
                        log.warning("poll for %s.%s failed: %s", d.room, d.device, err)
                        continue
                    prev = self._last_state.get((d.room, d.device))
                    if self._diff(prev, state):
                        self._last_state[(d.room, d.device)] = state
                        if self._handler:
                            try:
                                self._handler(d.room, d.device, state)
                            except Exception as err:
                                log.exception("external-change handler raised: %s", err)
        except asyncio.CancelledError:
            return

    @staticmethod
    def _diff(prev: ClimateState | None, curr: ClimateState) -> bool:
        if prev is None:
            return True
        return (
            abs(prev.target_f - curr.target_f) > 0.5
            or abs(prev.current_f - curr.current_f) > 0.5
            or prev.mode != curr.mode
            or prev.heating != curr.heating
            or prev.online != curr.online
        )
