"""iAquaLink adapter — bridges MQTT to a Backend (mock or real iaqualink-py).

Topics:
  - Subscribes to home/{room}/{device}/command for every (room, device) in
    house.yaml where adapter == iaqualink (typically hot_tub and pool).
  - Publishes retained state to home/{room}/{device}/state with the
    climate payload shape from docs/MQTT_TOPICS.md.
  - Heartbeats home/_meta/adapter/iaqualink/health every 15s with LWT.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import paho.mqtt.client as mqtt
import yaml

from .backend import Backend, ClimateState, DeviceConfig
from .iaqualink_backend import IAquaLinkBackend
from .mock_backend import MockBackend

NAME = "iaqualink"
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


def load_devices() -> list[DeviceConfig]:
    path = find_house_yaml()
    log.info("loading house from %s", path)
    data = yaml.safe_load(path.read_text())
    out: list[DeviceConfig] = []
    for room_slug, room in (data.get("rooms") or {}).items():
        for device_slug, dev in (room.get("devices") or {}).items():
            if dev.get("adapter") != "iaqualink":
                continue
            system = (dev.get("config") or {}).get("system", device_slug)
            out.append(DeviceConfig(room=room_slug, device=device_slug, system=system))
    return out


class Adapter:
    def __init__(self, backend: Backend, devices: list[DeviceConfig], mqtt_url: str) -> None:
        self.backend = backend
        self.devices = devices
        self.mqtt_url = mqtt_url
        self.started_at = datetime.now(timezone.utc)
        self.last_error: str | None = None
        self.loop = asyncio.get_event_loop()

        url = mqtt_url.replace("mqtt://", "").split(":")
        self._host = url[0]
        self._port = int(url[1]) if len(url) > 1 else 1883
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

    async def start(self) -> None:
        self.client.connect_async(self._host, self._port, keepalive=60)
        self.client.loop_start()
        self.backend.on_external_change(self._on_external_change)
        asyncio.create_task(self._heartbeat_loop())

    def _on_connect(self, client: mqtt.Client, _u: Any, _f: Any, rc: int, _p: Any = None) -> None:
        if rc != 0:
            log.error("mqtt connect failed rc=%s", rc)
            return
        topics = [(f"home/{d.room}/{d.device}/command", 1) for d in self.devices]
        client.subscribe(topics)
        log.info("mqtt connected; subscribed to %d topic(s)", len(topics))
        self._publish_health()
        for d in self.devices:
            asyncio.run_coroutine_threadsafe(self._publish_initial(d), self.loop)

    async def _publish_initial(self, d: DeviceConfig) -> None:
        try:
            state = await self.backend.get_state(d.room, d.device)
            self._publish_state(d.room, d.device, state, cmd_id=None)
        except Exception as err:
            log.exception("initial state for %s.%s failed: %s", d.room, d.device, err)

    def _on_message(self, _client: mqtt.Client, _u: Any, msg: mqtt.MQTTMessage) -> None:
        parts = msg.topic.split("/")
        if len(parts) != 4 or parts[0] != "home" or parts[3] != "command":
            return
        room, device = parts[1], parts[2]
        try:
            payload = json.loads(msg.payload.decode("utf-8"))
        except Exception as err:
            log.warning("bad payload on %s: %s", msg.topic, err)
            return
        asyncio.run_coroutine_threadsafe(self._dispatch(room, device, payload), self.loop)

    async def _dispatch(self, room: str, device: str, cmd: dict[str, Any]) -> None:
        cmd_id = cmd.get("id")
        op = cmd.get("op")
        args = cmd.get("args") or {}
        log.info("command room=%s device=%s op=%s id=%s", room, device, op, cmd_id)
        try:
            if op == "set_target":
                state = await self.backend.set_target(room, device, float(args["target_f"]))
            elif op == "set_mode":
                state = await self.backend.set_mode(room, device, args["mode"])
            else:
                raise ValueError(f"unsupported op: {op}")
            self.last_error = None
            self._publish_state(room, device, state, cmd_id=cmd_id)
        except Exception as err:
            self.last_error = str(err)
            log.exception("command failed: %s", err)
            self._publish_failure(room, device, cmd_id, str(err))

    def _publish_state(
        self, room: str, device: str, state: ClimateState, cmd_id: str | None, pending: bool = False
    ) -> None:
        msg = {
            "ts": now_iso(),
            "source": NAME,
            "online": state.online,
            "_cmd_id": cmd_id,
            "pending": pending,
            "state": {
                "mode": state.mode,
                "target_f": round(state.target_f, 1),
                "current_f": round(state.current_f, 1),
                "heating": state.heating,
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

    def _on_external_change(self, room: str, device: str, state: ClimateState) -> None:
        self._publish_state(room, device, state, cmd_id=None)

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
            "devices_online": len(self.devices),
            "devices_total": len(self.devices),
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
    mode = os.environ.get("IAQUALINK_MODE", "mock").lower()
    mqtt_url = os.environ.get("MQTT_URL", "mqtt://localhost:1883")
    log.info("starting iaqualink adapter mode=%s mqtt=%s", mode, mqtt_url)

    devices = load_devices()
    if not devices:
        log.error("no devices in house.yaml use the iaqualink adapter")
        return 1
    log.info("managing %d devices: %s", len(devices), [(d.room, d.device) for d in devices])

    if mode == "mock":
        backend: Backend = MockBackend()
    else:
        email = os.environ.get("IAQUALINK_EMAIL")
        password = os.environ.get("IAQUALINK_PASSWORD")
        if not email or not password:
            log.error("IAQUALINK_MODE=real but IAQUALINK_EMAIL / IAQUALINK_PASSWORD not set")
            return 1
        backend = IAquaLinkBackend(email, password)
    await backend.init(devices)

    adapter = Adapter(backend, devices, mqtt_url)
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
