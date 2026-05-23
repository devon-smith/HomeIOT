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

from .backend import Backend, LightState, RoomConfig, SceneFiring
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


def load_rooms() -> list[RoomConfig]:
    path = find_house_yaml()
    log.info("loading house from %s", path)
    data = yaml.safe_load(path.read_text())
    rooms: list[RoomConfig] = []
    for slug, room in (data.get("rooms") or {}).items():
        lights = (room.get("devices") or {}).get("lights")
        if not lights or lights.get("adapter") != "control4":
            continue
        proxy_id = int((lights.get("config") or {}).get("c4_proxy_id", 0))
        rooms.append(RoomConfig(room=slug, proxy_id=proxy_id))
    return rooms


class Adapter:
    def __init__(self, backend: Backend, rooms: list[RoomConfig], mqtt_url: str) -> None:
        self.backend = backend
        self.rooms = rooms
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
        topics.append(("home/_house/c4/command", 1))
        client.subscribe(topics)
        log.info("mqtt connected; subscribed to %d topic(s)", len(topics))
        self._publish_health()
        # Hydrate initial state for every room.
        for r in self.rooms:
            asyncio.run_coroutine_threadsafe(self._publish_initial_state(r.room), self.loop)

    async def _publish_initial_state(self, room: str) -> None:
        try:
            state = await self.backend.get_light_state(room)
            self._publish_light_state(room, state, cmd_id=None)
        except Exception as err:
            log.exception("initial state for %s failed: %s", room, err)

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
    if not rooms:
        log.error("no rooms in house.yaml use the control4 adapter for lights")
        return 1
    log.info("managing %d rooms: %s", len(rooms), [r.room for r in rooms])

    backend: Backend = MockBackend() if mode == "mock" else PyControl4Backend()
    await backend.init(rooms)

    adapter = Adapter(backend, rooms, mqtt_url)
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
