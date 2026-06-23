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

from .backend import Backend, LightState, RoomConfig, SceneFiring

log = logging.getLogger("control4.real")

# Director tokens are valid for 24h. Refresh proactively at 12h.
TOKEN_REFRESH_S = 12 * 60 * 60


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

    async def init(self, rooms: list[RoomConfig]) -> None:
        for r in rooms:
            self._room_lights[r.room] = list(r.light_ids)
            self._cached[r.room] = LightState(on=False, brightness=0, online=True)

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
            "ready: %d rooms, %d total lights, %d scenes",
            len(self._room_lights),
            sum(len(v) for v in self._room_lights.values()),
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
        await self._director.send_post_request(
            f"/api/v1/items/{item_id}/commands",
            "SET_LEVEL",
            {"LEVEL": level},
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
                log.debug("refresh %s: %s", room, err)

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
                raw = await self._director.get_item_variable_value(lid, "LIGHT_LEVEL")
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
