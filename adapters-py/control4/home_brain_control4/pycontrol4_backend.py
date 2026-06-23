"""Real Control4 backend against pyControl4 v2 + Director REST API.

Talks to the Director via:
  * Cloud auth (apis.control4.com) — gets a Director bearer token.
  * Director REST API on the Master Controller's LAN IP — sends SET_LEVEL
    and PRESS commands, reads LIGHT_LEVEL variables.

The Director uses a self-signed cert; we open a no-verify session just for
the LAN side. Cloud auth keeps full TLS verification.

Per-room light handling: each room has a list of type-7 load IDs.
`set_light(room, ...)` ramps every load in the room together. The aggregate
state we report is `on = any load on`, `brightness = average of lit loads`.

State polling: rather than wiring the Director's WebSocket events, we poll
LIGHT_LEVEL every poll_interval_s. That covers external changes (keypads,
app, other scenes) at a small cost in latency — fine for v1.
"""

from __future__ import annotations

import asyncio
import logging
import ssl
from datetime import datetime, timezone
from typing import Callable

import aiohttp
from pyControl4.account import C4Account
from pyControl4.director import C4Director

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

log = logging.getLogger("control4.real")

# Director tokens are valid for 24h. Refresh proactively at 12h.
TOKEN_REFRESH_S = 12 * 60 * 60

# Per-call HTTP timeouts. Keep these short — the room's tool-side timeout
# bound (e.g. set_lights waits 8s for the MQTT echo) sets our hard ceiling
# for *any* slow load not to block the whole room.
DIRECTOR_CMD_TIMEOUT = 3.5        # POST /commands (set_level, set_setpoint, etc)
DIRECTOR_READ_TIMEOUT = 2.5       # variable reads
DIRECTOR_COVER_TIMEOUT = 5.0      # IR covers respond a bit slower

# C4 thermostat mode constants
_MODE_TO_C4 = {"heat": "Heat", "cool": "Cool", "auto": "Auto", "off": "Off"}
_C4_TO_MODE = {v.lower(): k for k, v in _MODE_TO_C4.items()}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class PyControl4Backend(Backend):
    def __init__(
        self,
        host: str,
        email: str,
        password: str,
        *,
        scene_ids: dict[str, int] | None = None,
        poll_interval_s: int = 60,
        controller_match: str = "master",
    ) -> None:
        self.host = host
        self.email = email
        self.password = password
        self.scene_ids = {k.lower(): v for k, v in (scene_ids or {}).items()}
        self.poll_interval_s = poll_interval_s
        self.controller_match = controller_match.lower()

        self._cloud_session: aiohttp.ClientSession | None = None
        self._director_session: aiohttp.ClientSession | None = None
        self._account: C4Account | None = None
        self._director: C4Director | None = None
        self._token_acquired_at: datetime | None = None
        self._controller_name: str | None = None

        self._room_lights: dict[str, list[int]] = {}
        self._cached: dict[str, LightState] = {}
        self._external_handler: Callable[[str, LightState], None] | None = None
        self._poll_task: asyncio.Task | None = None

        # Climate / skylight maps
        self._thermostats: dict[str, int] = {}                  # device slot -> item_id
        self._climate_cache: dict[str, ClimateState] = {}       # device slot -> state
        self._skylights: dict[tuple[str, str], list[int]] = {}  # (room, device) -> ids
        self._skylight_cache: dict[tuple[str, str], SkylightState] = {}

        # AV maps
        self._av_rooms: dict[tuple[str, str], int] = {}                # (room, device) -> c4_room_id
        self._av_sources: dict[tuple[str, str], dict[str, int]] = {}   # (room, device) -> {source_name: c4_id}
        self._av_cache: dict[tuple[str, str], AvState] = {}

    async def init(
        self,
        rooms: list[RoomConfig],
        thermostats: list[ThermostatConfig] | None = None,
        skylights: list[SkylightConfig] | None = None,
        avs: list[AvConfig] | None = None,
    ) -> None:
        for r in rooms:
            self._room_lights[r.room] = list(r.light_ids)
            self._cached[r.room] = LightState(on=False, brightness=0, online=True)
        for t in thermostats or []:
            self._thermostats[t.device] = t.item_id
            self._climate_cache[t.device] = ClimateState(online=True)
        for s in skylights or []:
            self._skylights[(s.room, s.device)] = list(s.item_ids)
            self._skylight_cache[(s.room, s.device)] = SkylightState(position=0, online=True)
        for a in avs or []:
            self._av_rooms[(a.room, a.device)] = a.c4_room_id
            self._av_sources[(a.room, a.device)] = dict(a.sources)
            self._av_cache[(a.room, a.device)] = AvState(online=True)

        self._cloud_session = aiohttp.ClientSession()
        ssl_ctx = ssl.create_default_context()
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = ssl.CERT_NONE
        self._director_session = aiohttp.ClientSession(
            connector=aiohttp.TCPConnector(ssl=ssl_ctx)
        )

        await self._auth()
        await self._refresh_all_state()
        self._poll_task = asyncio.create_task(self._poll_loop())
        log.info(
            "ready: %d rooms / %d lights / %d thermostats / %d skylight groups / %d AV rooms / %d scenes",
            len(self._room_lights),
            sum(len(v) for v in self._room_lights.values()),
            len(self._thermostats),
            len(self._skylights),
            len(self._av_rooms),
            len(self.scene_ids),
        )

    async def _auth(self) -> None:
        assert self._cloud_session is not None and self._director_session is not None
        self._account = C4Account(self.email, self.password, self._cloud_session)
        await self._account.get_account_bearer_token()

        raw = await self._account.get_account_controllers()
        controllers = [raw] if isinstance(raw, dict) else list(raw)

        def cname(c: dict) -> str:
            return c.get("controllerCommonName") or c.get("controller_common_name") or ""

        chosen = next((c for c in controllers if self.controller_match in cname(c).lower()), None)
        if chosen is None:
            chosen = controllers[0]
            log.warning(
                "no controller matched '%s'; using first: %s",
                self.controller_match, cname(chosen),
            )
        self._controller_name = cname(chosen)

        tok_resp = await self._account.get_director_bearer_token(self._controller_name)
        token = tok_resp.get("token") if isinstance(tok_resp, dict) else tok_resp
        if not token:
            raise RuntimeError(f"empty director token for {self._controller_name}")

        self._director = C4Director(self.host, token, self._director_session)
        self._token_acquired_at = datetime.now(timezone.utc)
        log.info("auth ok: controller=%s host=%s", self._controller_name, self.host)

    async def _ensure_token_fresh(self) -> None:
        if self._token_acquired_at is None:
            await self._auth()
            return
        age = (datetime.now(timezone.utc) - self._token_acquired_at).total_seconds()
        if age > TOKEN_REFRESH_S:
            log.info("director token age=%ds; refreshing", int(age))
            await self._auth()

    async def get_light_state(self, room: str) -> LightState:
        return self._cached.get(room, LightState(on=False, brightness=0, online=False))

    async def set_light(
        self,
        room: str,
        on: bool | None = None,
        brightness: int | None = None,
    ) -> LightState:
        light_ids = self._room_lights.get(room)
        if not light_ids:
            raise KeyError(f"no C4 lights bound to room '{room}'")

        if brightness is not None:
            target = max(0, min(100, int(brightness)))
        elif on is True:
            cur = self._cached.get(room, LightState())
            target = cur.brightness if (cur.on and cur.brightness > 0) else 80
        elif on is False:
            target = 0
        else:
            raise ValueError("set_light requires 'on' or 'brightness'")

        await self._ensure_token_fresh()
        assert self._director is not None
        results = await asyncio.gather(
            *(self._set_level(lid, target) for lid in light_ids),
            return_exceptions=True,
        )
        errors = [r for r in results if isinstance(r, Exception)]
        if errors and len(errors) == len(results):
            raise errors[0]
        if errors:
            log.warning("set_light room=%s: %d/%d loads failed", room, len(errors), len(results))

        state = LightState(on=target > 0, brightness=target, online=True)
        self._cached[room] = state
        return state

    async def _set_level(self, item_id: int, level: int) -> None:
        assert self._director is not None
        await asyncio.wait_for(
            self._director.send_post_request(
                f"/api/v1/items/{item_id}/commands",
                "SET_LEVEL",
                {"LEVEL": level},
            ),
            timeout=DIRECTOR_CMD_TIMEOUT,
        )

    async def run_room_scene(self, room: str, scene_name: str) -> LightState:
        # Brain-side common presets — useful even without dealer-defined room scenes.
        presets = {
            "bright": 100, "full": 100, "on": 80,
            "normal": 75, "default": 75,
            "dim": 30, "low": 30,
            "movie": 15, "night": 5,
            "off": 0, "all_off": 0,
            "reading": 80,
        }
        target = presets.get(scene_name.lower())
        if target is None:
            raise KeyError(
                f"unknown room scene '{scene_name}' (known: {sorted(presets)})"
            )
        return await self.set_light(room, brightness=target)

    async def run_c4_scene(self, scene_name: str, room: str | None = None) -> SceneFiring:
        key = scene_name.lower().strip()
        scene_id = self.scene_ids.get(key) or self.scene_ids.get(key.replace(" ", "_"))
        if not scene_id:
            raise KeyError(
                f"unknown C4 scene '{scene_name}' "
                f"(known: {sorted(self.scene_ids.keys())})"
            )
        await self._ensure_token_fresh()
        assert self._director is not None
        # Scene-button items respond to PRESS like a keypad press.
        await self._director.send_post_request(
            f"/api/v1/items/{scene_id}/commands",
            "PRESS",
            {},
        )
        log.info("fired c4 scene: %s (id=%d)", scene_name, scene_id)
        return SceneFiring(name=scene_name, fired_at=_now_iso(), room=room)

    def on_external_light_change(self, handler: Callable[[str, LightState], None]) -> None:
        self._external_handler = handler

    # ------------------------------------------------------------------
    # Climate / HVAC
    # ------------------------------------------------------------------

    async def get_climate_state(self, device: str) -> ClimateState:
        return self._climate_cache.get(device, ClimateState(online=False))

    async def set_climate(
        self,
        device: str,
        target_f: float | None = None,
        mode: str | None = None,
    ) -> ClimateState:
        item_id = self._thermostats.get(device)
        if not item_id:
            raise KeyError(f"no C4 thermostat bound to device '{device}'")
        await self._ensure_token_fresh()
        assert self._director is not None

        if mode is not None:
            c4_mode = _MODE_TO_C4.get(mode.lower())
            if c4_mode is None:
                raise ValueError(f"invalid mode '{mode}' (use heat/cool/auto/off)")
            await self._director.send_post_request(
                f"/api/v1/items/{item_id}/commands",
                "SET_MODE_HVAC",
                {"MODE": c4_mode},
            )

        cur = self._climate_cache.get(device) or ClimateState()
        effective_mode = (mode or cur.mode or "auto").lower()

        if target_f is not None:
            t = float(target_f)
            # Standard C4 Ecobee/HVAC commands; param is FAHRENHEIT.
            # In auto/off we bracket the target with the driver's deadband.
            if effective_mode == "heat":
                await self._send_setpoint(item_id, "SET_SETPOINT_HEAT", t)
            elif effective_mode == "cool":
                await self._send_setpoint(item_id, "SET_SETPOINT_COOL", t)
            else:
                await self._send_setpoint(item_id, "SET_SETPOINT_HEAT", t - 2)
                await self._send_setpoint(item_id, "SET_SETPOINT_COOL", t + 2)

        # Optimistic state: patch the cache with what we just commanded.
        # Reading 5 variables back from the Director after every setpoint
        # change adds ~10s of round-trip and was timing out the MQTT echo.
        # The next poll cycle (60s) will reconcile to real Director state.
        new_state = ClimateState(
            current_f=cur.current_f,
            heat_setpoint_f=t if (target_f is not None and effective_mode in ("heat", "auto", "off")) else cur.heat_setpoint_f,
            cool_setpoint_f=t if (target_f is not None and effective_mode in ("cool", "auto", "off")) else cur.cool_setpoint_f,
            mode=effective_mode if mode is not None else cur.mode,
            hvac_state=cur.hvac_state,
            online=True,
        )
        if target_f is not None and effective_mode == "auto":
            new_state.heat_setpoint_f = float(target_f) - 2
            new_state.cool_setpoint_f = float(target_f) + 2
        self._climate_cache[device] = new_state
        return new_state

    async def _send_setpoint(self, item_id: int, command: str, value: float) -> None:
        assert self._director is not None
        await asyncio.wait_for(
            self._director.send_post_request(
                f"/api/v1/items/{item_id}/commands",
                command,
                {"FAHRENHEIT": int(round(value))},
            ),
            timeout=DIRECTOR_CMD_TIMEOUT,
        )

    async def _fetch_climate_state(self, device: str) -> ClimateState:
        item_id = self._thermostats.get(device)
        if not item_id:
            return ClimateState(online=False)
        await self._ensure_token_fresh()
        assert self._director is not None

        async def _read(var: str) -> str | None:
            try:
                return await asyncio.wait_for(
                    self._director.get_item_variable_value(item_id, var),
                    timeout=DIRECTOR_READ_TIMEOUT,
                )
            except Exception as err:
                log.debug("thermostat %s read %s failed: %s", item_id, var, err)
                return None

        # Standard C4 Ecobee variable names. ANA_* are the canonical
        # in-driver values; TEMPERATURE_F etc. are the user-facing ones.
        temp_raw = await _read("TEMPERATURE_F") or await _read("CURRENT_TEMPERATURE")
        heat_sp = await _read("HEAT_SETPOINT_F") or await _read("HEATING_SETPOINT")
        cool_sp = await _read("COOL_SETPOINT_F") or await _read("COOLING_SETPOINT")
        mode_raw = await _read("ANA_HVACMODE") or await _read("HVAC_MODE")
        state_raw = await _read("ANA_HVACSTATE") or await _read("HVAC_STATE")

        def _f(v: str | None) -> float | None:
            if v is None:
                return None
            try:
                return float(v)
            except (TypeError, ValueError):
                return None

        return ClimateState(
            current_f=_f(temp_raw),
            heat_setpoint_f=_f(heat_sp),
            cool_setpoint_f=_f(cool_sp),
            mode=_C4_TO_MODE.get((mode_raw or "").lower(), "off"),
            hvac_state=(state_raw or "idle").lower(),
            online=temp_raw is not None,
        )

    # ------------------------------------------------------------------
    # Skylights / motorized covers
    # ------------------------------------------------------------------

    async def get_skylight_state(self, room: str, device: str) -> SkylightState:
        return self._skylight_cache.get((room, device), SkylightState(online=False))

    async def set_skylight(self, room: str, device: str, position: int) -> SkylightState:
        ids = self._skylights.get((room, device))
        if not ids:
            raise KeyError(f"no C4 skylights bound to {room}.{device}")
        await self._ensure_token_fresh()
        assert self._director is not None
        target = max(0, min(100, int(position)))

        # C4 motorized covers (Velux + Lutron Sivoia) are binary in this
        # system: SET_LEVEL_TARGET:LEVEL_TARGET_OPEN or LEVEL_TARGET_CLOSED.
        # We snap target to 0 (close) or 100 (open) — no intermediate stops.
        snapped = 100 if target > 0 else 0
        cmd = (
            "SET_LEVEL_TARGET:LEVEL_TARGET_OPEN"
            if snapped == 100
            else "SET_LEVEL_TARGET:LEVEL_TARGET_CLOSED"
        )
        results = await asyncio.gather(
            *(self._send_cover_cmd(i, cmd) for i in ids),
            return_exceptions=True,
        )
        errors = [r for r in results if isinstance(r, Exception)]
        if errors and len(errors) == len(results):
            raise errors[0]
        if errors:
            log.warning(
                "set_skylight %s.%s: %d/%d covers failed",
                room, device, len(errors), len(results),
            )

        state = SkylightState(position=snapped, online=True)
        self._skylight_cache[(room, device)] = state
        return state

    async def _send_cover_cmd(self, item_id: int, cmd: str) -> None:
        assert self._director is not None
        await asyncio.wait_for(
            self._director.send_post_request(
                f"/api/v1/items/{item_id}/commands",
                cmd,
                {},
            ),
            timeout=DIRECTOR_COVER_TIMEOUT,
        )

    # ------------------------------------------------------------------
    # AV (room-centric Control4 source routing)
    # ------------------------------------------------------------------

    async def get_av_state(self, room: str, device: str) -> AvState:
        return self._av_cache.get((room, device), AvState(online=False))

    async def watch_av(self, room: str, device: str, source: str) -> AvState:
        c4_room_id = self._av_rooms.get((room, device))
        if not c4_room_id:
            raise KeyError(f"no AV room bound to {room}.{device}")
        sources = self._av_sources.get((room, device), {})
        source_id = sources.get(source) or sources.get(source.lower())
        if not source_id:
            raise KeyError(
                f"unknown source '{source}' for {room}.{device} (have: {sorted(sources)})"
            )

        await self._ensure_token_fresh()
        assert self._director is not None
        # SELECT_VIDEO_DEVICE takes lowercase deviceid + deselect=0 (start).
        await self._director.send_post_request(
            f"/api/v1/items/{c4_room_id}/commands",
            "SELECT_VIDEO_DEVICE",
            {"deviceid": int(source_id), "deselect": 0},
        )
        log.info("watch_av: room=%s c4_room=%d source=%s (id=%d)", room, c4_room_id, source, source_id)

        new_state = await self._fetch_av_state(room, device)
        # The Director can take a few seconds to update CURRENT_VIDEO_DEVICE,
        # so blend in what we just commanded so the echo is meaningful.
        new_state.power = True
        new_state.current_source = source
        new_state.current_device_id = source_id
        self._av_cache[(room, device)] = new_state
        return new_state

    async def av_off(self, room: str, device: str) -> AvState:
        c4_room_id = self._av_rooms.get((room, device))
        if not c4_room_id:
            raise KeyError(f"no AV room bound to {room}.{device}")
        await self._ensure_token_fresh()
        assert self._director is not None
        await self._director.send_post_request(
            f"/api/v1/items/{c4_room_id}/commands",
            "ROOM_OFF",
            {},
        )
        log.info("av_off: room=%s c4_room=%d", room, c4_room_id)
        state = AvState(power=False, current_source=None, current_device_id=0, online=True)
        self._av_cache[(room, device)] = state
        return state

    async def set_av_volume(self, room: str, device: str, level: int) -> AvState:
        c4_room_id = self._av_rooms.get((room, device))
        if not c4_room_id:
            raise KeyError(f"no AV room bound to {room}.{device}")
        target = max(0, min(100, int(level)))
        await self._ensure_token_fresh()
        assert self._director is not None
        await self._director.send_post_request(
            f"/api/v1/items/{c4_room_id}/commands",
            "SET_VOLUME_LEVEL",
            {"LEVEL": target},
        )
        cur = self._av_cache.get((room, device)) or AvState(online=True)
        cur.volume = target
        cur.online = True
        self._av_cache[(room, device)] = cur
        return cur

    async def set_av_mute(self, room: str, device: str, muted: bool) -> AvState:
        c4_room_id = self._av_rooms.get((room, device))
        if not c4_room_id:
            raise KeyError(f"no AV room bound to {room}.{device}")
        await self._ensure_token_fresh()
        assert self._director is not None
        await self._director.send_post_request(
            f"/api/v1/items/{c4_room_id}/commands",
            "MUTE_ON" if muted else "MUTE_OFF",
            {},
        )
        cur = self._av_cache.get((room, device)) or AvState(online=True)
        cur.muted = bool(muted)
        self._av_cache[(room, device)] = cur
        return cur

    async def _fetch_av_state(self, room: str, device: str) -> AvState:
        c4_room_id = self._av_rooms.get((room, device))
        if not c4_room_id:
            return AvState(online=False)
        await self._ensure_token_fresh()
        assert self._director is not None

        async def _read(var: str) -> str | None:
            try:
                return await asyncio.wait_for(
                    self._director.get_item_variable_value(c4_room_id, var),
                    timeout=DIRECTOR_READ_TIMEOUT,
                )
            except Exception:
                return None

        power_raw = await _read("POWER_STATE")
        video_id = await _read("CURRENT_VIDEO_DEVICE")
        vol_raw = await _read("CURRENT_VOLUME")
        muted_raw = await _read("IS_MUTED")

        def _int(v: str | None, default: int = 0) -> int:
            try:
                return int(v) if v is not None else default
            except (TypeError, ValueError):
                return default

        cur_id = _int(video_id)
        sources = self._av_sources.get((room, device), {})
        name_of = next((n for n, sid in sources.items() if sid == cur_id), None)
        vol = _int(vol_raw, -1)

        return AvState(
            power=_int(power_raw) > 0,
            current_source=name_of,
            current_device_id=cur_id,
            volume=max(0, vol),
            muted=_int(muted_raw) > 0,
            online=True,
        )

    # ------------------------------------------------------------------

    async def _poll_loop(self) -> None:
        while True:
            try:
                await asyncio.sleep(self.poll_interval_s)
                await self._refresh_all_state()
            except asyncio.CancelledError:
                return
            except Exception as err:
                log.warning("poll loop error: %s", err)

    async def _refresh_all_state(self) -> None:
        for room in list(self._room_lights.keys()):
            try:
                new_state = await self._fetch_room_state(room)
                prev = self._cached.get(room)
                self._cached[room] = new_state
                if (
                    self._external_handler is not None
                    and prev is not None
                    and (prev.on != new_state.on or prev.brightness != new_state.brightness)
                ):
                    self._external_handler(room, new_state)
            except Exception as err:
                log.debug("refresh light %s: %s", room, err)

        for device in list(self._thermostats.keys()):
            try:
                self._climate_cache[device] = await self._fetch_climate_state(device)
            except Exception as err:
                log.debug("refresh climate %s: %s", device, err)

        for key in list(self._av_rooms.keys()):
            room, device = key
            try:
                self._av_cache[key] = await self._fetch_av_state(room, device)
            except Exception as err:
                log.debug("refresh av %s.%s: %s", room, device, err)

    async def _fetch_room_state(self, room: str) -> LightState:
        light_ids = self._room_lights.get(room) or []
        if not light_ids:
            return LightState(on=False, brightness=0, online=False)
        await self._ensure_token_fresh()
        assert self._director is not None

        on_count = 0
        bright_sum = 0
        online_count = 0
        for lid in light_ids:
            try:
                raw = await asyncio.wait_for(
                    self._director.get_item_variable_value(lid, "LIGHT_LEVEL"),
                    timeout=DIRECTOR_READ_TIMEOUT,
                )
                level = int(raw)
                online_count += 1
                if level > 0:
                    on_count += 1
                    bright_sum += level
            except Exception as err:
                log.debug("read LIGHT_LEVEL id=%s: %s", lid, err)
        avg = (bright_sum // on_count) if on_count else 0
        return LightState(on=on_count > 0, brightness=avg, online=online_count > 0)

    async def close(self) -> None:
        if self._poll_task is not None:
            self._poll_task.cancel()
            try:
                await self._poll_task
            except (asyncio.CancelledError, Exception):
                pass
        if self._director_session is not None:
            await self._director_session.close()
        if self._cloud_session is not None:
            await self._cloud_session.close()
