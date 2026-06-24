"""Control4 adapter — bridges MQTT to a Backend (mock or real pyControl4).

Topic responsibilities:
  - Subscribes to home/{room}/lights/command for every room where house.yaml
    declares lights.adapter == control4.
  - Subscribes to home/_house/c4/command and home/{room}/c4/command for the
    run_c4_scene tool.
  - Publishes retained state to home/{room}/lights/state and
    home/{room}/c4/state (or home/_house/c4/state).
  - Publishes a 15s heartbeat to home/_meta/adapter/control4/health with an
    MQTT LWT so disconnects are immediately visible.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
import sys
import uuid
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import paho.mqtt.client as mqtt
import yaml

from .backend import (
    AvConfig,
    AvState,
    Backend,
    ClimateState,
    FanConfig,
    LightState,
    RoomConfig,
    SceneFiring,
    SkylightConfig,
    SkylightState,
    ThermostatConfig,
)
from .mock_backend import MockBackend
from .pycontrol4_backend import PyControl4Backend

NAME = "control4"
VERSION = "0.1.0"
HEARTBEAT_S = 15

log = logging.getLogger(NAME)
logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "info").upper(),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def find_house_yaml() -> Path:
    if os.environ.get("HOUSE_YAML"):
        return Path(os.environ["HOUSE_YAML"])
    repo_root = Path(__file__).resolve().parents[3]
    primary = repo_root / "config" / "house.yaml"
    example = repo_root / "config" / "house.example.yaml"
    return primary if primary.exists() else example


def _load_house() -> dict[str, Any]:
    path = find_house_yaml()
    log.info("loading house from %s", path)
    return yaml.safe_load(path.read_text()) or {}


def load_rooms() -> list[RoomConfig]:
    data = _load_house()
    rooms: list[RoomConfig] = []
    for slug, room in (data.get("rooms") or {}).items():
        lights = (room.get("devices") or {}).get("lights")
        if not lights or lights.get("adapter") != "control4":
            continue
        cfg = lights.get("config") or {}
        light_ids = [int(x) for x in (cfg.get("c4_light_ids") or [])]
        rooms.append(
            RoomConfig(
                room=slug,
                c4_room_id=int(cfg.get("c4_room_id", 0)),
                light_ids=light_ids,
                proxy_id=int(cfg.get("c4_proxy_id", 0)),
            )
        )
    return rooms


def load_thermostats() -> list[ThermostatConfig]:
    """Find every device with adapter=control4 and config.c4_thermostat_id set."""
    data = _load_house()
    out: list[ThermostatConfig] = []
    for room_slug, room in (data.get("rooms") or {}).items():
        for device_slot, dev in (room.get("devices") or {}).items():
            if not isinstance(dev, dict) or dev.get("adapter") != "control4":
                continue
            cfg = dev.get("config") or {}
            thermo_id = cfg.get("c4_thermostat_id")
            if not thermo_id:
                continue
            out.append(
                ThermostatConfig(
                    room=room_slug,
                    device=device_slot,
                    item_id=int(thermo_id),
                )
            )
    return out


def load_skylights() -> list[SkylightConfig]:
    """Find every device with adapter=control4 and config.c4_skylight_ids set."""
    data = _load_house()
    out: list[SkylightConfig] = []
    for room_slug, room in (data.get("rooms") or {}).items():
        for device_slot, dev in (room.get("devices") or {}).items():
            if not isinstance(dev, dict) or dev.get("adapter") != "control4":
                continue
            cfg = dev.get("config") or {}
            ids = cfg.get("c4_skylight_ids")
            if not ids:
                continue
            out.append(
                SkylightConfig(
                    room=room_slug,
                    device=device_slot,
                    item_ids=[int(x) for x in ids],
                )
            )
    return out


def load_scene_ids() -> dict[str, int]:
    """Pull `c4.scenes:` mapping out of house.yaml (scene_name -> c4 item id)."""
    data = _load_house()
    scenes = ((data.get("c4") or {}).get("scenes") or {})
    return {str(k): int(v) for k, v in scenes.items()}


def load_fans() -> list[FanConfig]:
    """Find every device with adapter=control4 and config.c4_fan_ids set.
    Fans are dimmer loads, identical SET_LEVEL primitive as lights, but
    addressed under their own device slot so they're not swept by 'lights off'."""
    data = _load_house()
    out: list[FanConfig] = []
    for room_slug, room in (data.get("rooms") or {}).items():
        for device_slot, dev in (room.get("devices") or {}).items():
            if not isinstance(dev, dict) or dev.get("adapter") != "control4":
                continue
            cfg = dev.get("config") or {}
            ids = cfg.get("c4_fan_ids")
            if not ids:
                continue
            out.append(
                FanConfig(
                    room=room_slug,
                    device=device_slot,
                    fan_ids=[int(x) for x in ids],
                )
            )
    return out


def load_avs() -> list[AvConfig]:
    """Find every device with adapter=control4 + config.c4_av_room_id set."""
    data = _load_house()
    out: list[AvConfig] = []
    for room_slug, room in (data.get("rooms") or {}).items():
        for device_slot, dev in (room.get("devices") or {}).items():
            if not isinstance(dev, dict) or dev.get("adapter") != "control4":
                continue
            cfg = dev.get("config") or {}
            c4_room_id = cfg.get("c4_av_room_id")
            if not c4_room_id:
                continue
            sources_raw = cfg.get("sources") or {}
            sources = {str(name): int(sid) for name, sid in sources_raw.items()}
            out.append(
                AvConfig(
                    room=room_slug,
                    device=device_slot,
                    c4_room_id=int(c4_room_id),
                    sources=sources,
                )
            )
    return out


class Adapter:
    def __init__(
        self,
        backend: Backend,
        rooms: list[RoomConfig],
        mqtt_url: str,
        thermostats: list[ThermostatConfig] | None = None,
        skylights: list[SkylightConfig] | None = None,
        avs: list[AvConfig] | None = None,
        fans: list[FanConfig] | None = None,
    ) -> None:
        self.backend = backend
        self.rooms = rooms
        self.thermostats = thermostats or []
        self.skylights = skylights or []
        self.avs = avs or []
        self.fans = fans or []
        self.mqtt_url = mqtt_url
        self.started_at = datetime.now(timezone.utc)
        self.last_error: str | None = None
        self.loop = asyncio.get_event_loop()
        self.last_scene_state: dict[str, SceneFiring] = {}

        url = mqtt_url.replace("mqtt://", "").split(":")
        host = url[0]
        port = int(url[1]) if len(url) > 1 else 1883
        self.client = mqtt.Client(
            mqtt.CallbackAPIVersion.VERSION2,
            client_id=f"{NAME}-{uuid.uuid4().hex[:8]}",
        )
        self.client.will_set(
            f"home/_meta/adapter/{NAME}/health",
            json.dumps({"name": NAME, "online": False, "ts": now_iso()}),
            qos=1,
            retain=True,
        )
        self.client.on_connect = self._on_connect
        self.client.on_message = self._on_message
        self._host = host
        self._port = port

    async def start(self) -> None:
        self.client.connect_async(self._host, self._port, keepalive=60)
        self.client.loop_start()
        self.backend.on_external_light_change(self._on_external_light_change)
        # heartbeat
        asyncio.create_task(self._heartbeat_loop())

    def _on_connect(self, client: mqtt.Client, _userdata: Any, _flags: Any, rc: int, _props: Any = None) -> None:
        if rc != 0:
            log.error("mqtt connect failed rc=%s", rc)
            return
        topics: list[tuple[str, int]] = []
        for r in self.rooms:
            topics.append((f"home/{r.room}/lights/command", 1))
            topics.append((f"home/{r.room}/c4/command", 1))
        for t in self.thermostats:
            topics.append((f"home/{t.room}/{t.device}/command", 1))
        for s in self.skylights:
            topics.append((f"home/{s.room}/{s.device}/command", 1))
        for a in self.avs:
            topics.append((f"home/{a.room}/{a.device}/command", 1))
        for f in self.fans:
            topics.append((f"home/{f.room}/{f.device}/command", 1))
        topics.append(("home/_house/c4/command", 1))
        client.subscribe(topics)
        log.info("mqtt connected; subscribed to %d topic(s)", len(topics))
        self._publish_health()
        # Hydrate initial state for every room/device.
        for r in self.rooms:
            asyncio.run_coroutine_threadsafe(self._publish_initial_state(r.room), self.loop)
        for t in self.thermostats:
            asyncio.run_coroutine_threadsafe(self._publish_initial_climate(t), self.loop)
        for s in self.skylights:
            asyncio.run_coroutine_threadsafe(self._publish_initial_skylight(s), self.loop)
        for a in self.avs:
            asyncio.run_coroutine_threadsafe(self._publish_initial_av(a), self.loop)
        for f in self.fans:
            asyncio.run_coroutine_threadsafe(self._publish_initial_fan(f), self.loop)

    async def _publish_initial_state(self, room: str) -> None:
        try:
            state = await self.backend.get_light_state(room)
            self._publish_light_state(room, state, cmd_id=None)
        except Exception as err:
            log.exception("initial state for %s failed: %s", room, err)

    async def _publish_initial_climate(self, t: ThermostatConfig) -> None:
        try:
            state = await self.backend.get_climate_state(t.device)
            self._publish_climate_state(t.room, t.device, state, cmd_id=None)
        except Exception as err:
            log.exception("initial climate state for %s.%s failed: %s", t.room, t.device, err)

    async def _publish_initial_skylight(self, s: SkylightConfig) -> None:
        try:
            state = await self.backend.get_skylight_state(s.room, s.device)
            self._publish_skylight_state(s.room, s.device, state, cmd_id=None)
        except Exception as err:
            log.exception("initial skylight state for %s.%s failed: %s", s.room, s.device, err)

    async def _publish_initial_av(self, a: AvConfig) -> None:
        try:
            state = await self.backend.get_av_state(a.room, a.device)
            self._publish_av_state(a.room, a.device, state, cmd_id=None)
        except Exception as err:
            log.exception("initial av state for %s.%s failed: %s", a.room, a.device, err)

    async def _publish_initial_fan(self, f: FanConfig) -> None:
        try:
            state = await self.backend.get_fan_state(f.room, f.device)
            self._publish_fan_state(f.room, f.device, state, cmd_id=None)
        except Exception as err:
            log.exception("initial fan state for %s.%s failed: %s", f.room, f.device, err)

    def _on_message(self, _client: mqtt.Client, _userdata: Any, msg: mqtt.MQTTMessage) -> None:
        topic = msg.topic
        parts = topic.split("/")
        try:
            payload = json.loads(msg.payload.decode("utf-8"))
        except Exception as err:
            log.warning("bad payload on %s: %s", topic, err)
            return

        if len(parts) != 4 or parts[0] != "home" or parts[3] != "command":
            return
        room, device = parts[1], parts[2]

        asyncio.run_coroutine_threadsafe(self._dispatch(room, device, payload), self.loop)

    def _is_thermostat_device(self, room: str, device: str) -> bool:
        return any(t.room == room and t.device == device for t in self.thermostats)

    def _is_skylight_device(self, room: str, device: str) -> bool:
        return any(s.room == room and s.device == device for s in self.skylights)

    def _is_av_device(self, room: str, device: str) -> bool:
        return any(a.room == room and a.device == device for a in self.avs)

    def _is_fan_device(self, room: str, device: str) -> bool:
        return any(f.room == room and f.device == device for f in self.fans)

    async def _dispatch(self, room: str, device: str, cmd: dict[str, Any]) -> None:
        cmd_id = cmd.get("id")
        op = cmd.get("op")
        args = cmd.get("args") or {}
        log.info("command room=%s device=%s op=%s id=%s", room, device, op, cmd_id)
        try:
            if device == "lights":
                if op == "set":
                    state = await self.backend.set_light(
                        room,
                        on=args.get("on"),
                        brightness=args.get("brightness"),
                    )
                elif op == "scene":
                    state = await self.backend.run_room_scene(room, args["name"])
                else:
                    raise ValueError(f"unsupported lights op: {op}")
                self.last_error = None
                self._publish_light_state(room, state, cmd_id=cmd_id)
            elif device == "c4":
                if op == "scene":
                    target_room = args.get("room") if room == "_house" else room
                    firing = await self.backend.run_c4_scene(args["name"], target_room)
                    self.last_error = None
                    self._publish_c4_state(room, firing, cmd_id=cmd_id)
                else:
                    raise ValueError(f"unsupported c4 op: {op}")
            elif self._is_thermostat_device(room, device):
                if op == "set_target":
                    state = await self.backend.set_climate(device, target_f=float(args["target_f"]))
                elif op == "set_mode":
                    state = await self.backend.set_climate(device, mode=str(args["mode"]))
                else:
                    raise ValueError(f"unsupported thermostat op: {op}")
                self.last_error = None
                self._publish_climate_state(room, device, state, cmd_id=cmd_id)
            elif self._is_skylight_device(room, device):
                if op == "set":
                    position = args.get("position")
                    if position is None:
                        # Treat on/off as open/closed for compatibility.
                        if args.get("on") is True:
                            position = 100
                        elif args.get("on") is False:
                            position = 0
                        else:
                            raise ValueError("skylight set requires position or on")
                    state = await self.backend.set_skylight(room, device, int(position))
                else:
                    raise ValueError(f"unsupported skylight op: {op}")
                self.last_error = None
                self._publish_skylight_state(room, device, state, cmd_id=cmd_id)
            elif self._is_av_device(room, device):
                if op == "watch":
                    av_state = await self.backend.watch_av(room, device, str(args["source"]))
                elif op == "off":
                    av_state = await self.backend.av_off(room, device)
                elif op == "set_volume":
                    av_state = await self.backend.set_av_volume(room, device, int(args["level"]))
                elif op == "set_mute":
                    av_state = await self.backend.set_av_mute(room, device, bool(args["muted"]))
                else:
                    raise ValueError(f"unsupported av op: {op}")
                self.last_error = None
                self._publish_av_state(room, device, av_state, cmd_id=cmd_id)
            elif self._is_fan_device(room, device):
                if op == "set":
                    fan_state = await self.backend.set_fan(
                        room,
                        device,
                        on=args.get("on"),
                        brightness=args.get("brightness"),
                    )
                else:
                    raise ValueError(f"unsupported fan op: {op}")
                self.last_error = None
                self._publish_fan_state(room, device, fan_state, cmd_id=cmd_id)
            else:
                raise ValueError(f"unsupported device: {device}")
        except Exception as err:
            self.last_error = str(err)
            log.exception("command failed: %s", err)
            self._publish_failure(room, device, cmd_id, str(err))

    def _publish_light_state(self, room: str, state: LightState, cmd_id: str | None) -> None:
        msg = {
            "ts": now_iso(),
            "source": NAME,
            "online": state.online,
            "_cmd_id": cmd_id,
            "pending": False,
            "state": {"on": state.on, "brightness": state.brightness, "scene": state.scene},
        }
        self.client.publish(f"home/{room}/lights/state", json.dumps(msg), qos=1, retain=True)

    def _publish_fan_state(
        self, room: str, device: str, state: LightState, cmd_id: str | None
    ) -> None:
        msg = {
            "ts": now_iso(),
            "source": NAME,
            "online": state.online,
            "_cmd_id": cmd_id,
            "pending": False,
            "state": {"on": state.on, "brightness": state.brightness},
        }
        self.client.publish(f"home/{room}/{device}/state", json.dumps(msg), qos=1, retain=True)

    def _publish_c4_state(self, room: str, firing: SceneFiring, cmd_id: str | None) -> None:
        prev = asdict(firing)
        msg = {
            "ts": now_iso(),
            "source": NAME,
            "online": True,
            "_cmd_id": cmd_id,
            "pending": False,
            "state": {"last_scene": prev["name"], "last_scene_at": prev["fired_at"], "last_room": prev["room"]},
        }
        self.client.publish(f"home/{room}/c4/state", json.dumps(msg), qos=1, retain=True)

    def _publish_climate_state(
        self, room: str, device: str, state: ClimateState, cmd_id: str | None
    ) -> None:
        msg = {
            "ts": now_iso(),
            "source": NAME,
            "online": state.online,
            "_cmd_id": cmd_id,
            "pending": False,
            "state": {
                "current_f": state.current_f,
                "heat_setpoint_f": state.heat_setpoint_f,
                "cool_setpoint_f": state.cool_setpoint_f,
                "mode": state.mode,
                "hvac_state": state.hvac_state,
            },
        }
        self.client.publish(f"home/{room}/{device}/state", json.dumps(msg), qos=1, retain=True)

    def _publish_skylight_state(
        self, room: str, device: str, state: SkylightState, cmd_id: str | None
    ) -> None:
        msg = {
            "ts": now_iso(),
            "source": NAME,
            "online": state.online,
            "_cmd_id": cmd_id,
            "pending": False,
            "state": {"position": state.position, "open": state.position > 0},
        }
        self.client.publish(f"home/{room}/{device}/state", json.dumps(msg), qos=1, retain=True)

    def _publish_av_state(
        self, room: str, device: str, state: AvState, cmd_id: str | None
    ) -> None:
        msg = {
            "ts": now_iso(),
            "source": NAME,
            "online": state.online,
            "_cmd_id": cmd_id,
            "pending": False,
            "state": {
                "power": state.power,
                "current_source": state.current_source,
                "current_device_id": state.current_device_id,
                "volume": state.volume,
                "muted": state.muted,
            },
        }
        self.client.publish(f"home/{room}/{device}/state", json.dumps(msg), qos=1, retain=True)

    def _publish_failure(self, room: str, device: str, cmd_id: str | None, err: str) -> None:
        msg = {
            "ts": now_iso(),
            "source": NAME,
            "online": True,
            "_cmd_id": cmd_id,
            "pending": False,
            "state": {"last_error": err},
        }
        self.client.publish(f"home/{room}/{device}/state", json.dumps(msg), qos=1, retain=True)

    def _on_external_light_change(self, room: str, state: LightState) -> None:
        log.debug("external change room=%s state=%s", room, state)
        self._publish_light_state(room, state, cmd_id=None)

    async def _heartbeat_loop(self) -> None:
        while True:
            self._publish_health()
            await asyncio.sleep(HEARTBEAT_S)

    def _publish_health(self) -> None:
        uptime = int((datetime.now(timezone.utc) - self.started_at).total_seconds())
        payload = {
            "ts": now_iso(),
            "name": NAME,
            "version": VERSION,
            "uptime_s": uptime,
            "devices_online": len(self.rooms),
            "devices_total": len(self.rooms),
            "last_error": self.last_error,
        }
        self.client.publish(
            f"home/_meta/adapter/{NAME}/health",
            json.dumps(payload),
            qos=1,
            retain=True,
        )

    async def stop(self) -> None:
        try:
            self.client.publish(
                f"home/_meta/adapter/{NAME}/health",
                json.dumps({"name": NAME, "online": False, "ts": now_iso()}),
                qos=1,
                retain=True,
            )
        except Exception:
            pass
        self.client.loop_stop()
        self.client.disconnect()
        await self.backend.close()


async def amain() -> int:
    mode = os.environ.get("CONTROL4_MODE", "mock").lower()
    mqtt_url = os.environ.get("MQTT_URL", "mqtt://localhost:1883")
    log.info("starting control4 adapter mode=%s mqtt=%s", mode, mqtt_url)

    rooms = load_rooms()
    thermostats = load_thermostats()
    skylights = load_skylights()
    avs = load_avs()
    fans = load_fans()
    if not rooms and not thermostats and not skylights and not avs and not fans:
        log.error("no devices in house.yaml use the control4 adapter")
        return 1
    log.info(
        "managing %d light rooms, %d thermostats, %d skylight groups, %d AV rooms, %d fans",
        len(rooms), len(thermostats), len(skylights), len(avs), len(fans),
    )

    backend: Backend
    if mode == "mock":
        backend = MockBackend()
    else:
        host = os.environ.get("CONTROL4_HOST")
        email = os.environ.get("CONTROL4_EMAIL")
        password = os.environ.get("CONTROL4_PASSWORD")
        missing = [k for k, v in {
            "CONTROL4_HOST": host,
            "CONTROL4_EMAIL": email,
            "CONTROL4_PASSWORD": password,
        }.items() if not v]
        if missing:
            log.error("CONTROL4_MODE=real but missing in env: %s", ", ".join(missing))
            return 1
        scene_ids = load_scene_ids()
        log.info("real backend: host=%s scenes=%d", host, len(scene_ids))
        backend = PyControl4Backend(host, email, password, scene_ids=scene_ids)
    await backend.init(rooms, thermostats=thermostats, skylights=skylights, avs=avs, fans=fans)

    adapter = Adapter(
        backend, rooms, mqtt_url,
        thermostats=thermostats, skylights=skylights, avs=avs, fans=fans,
    )
    stop_event = asyncio.Event()

    def request_stop(*_: Any) -> None:
        stop_event.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, request_stop)

    await adapter.start()
    await stop_event.wait()
    log.info("shutting down")
    await adapter.stop()
    return 0


def main() -> None:
    sys.exit(asyncio.run(amain()))


if __name__ == "__main__":
    main()
