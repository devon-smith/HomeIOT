"""Backend abstraction for the Tuya adapter.

Handles two device shapes (declared in house.yaml via the device slug):

  - climate-style devices (e.g. sauna): support set_target / set_mode and
    publish a climate state payload.
  - switch-style devices (e.g. fountain, miscellaneous WiFi switches):
    support set_on and publish a `{on: bool}` state.

The MockBackend implements both for sandbox testing. The TinyTuyaBackend
stub uses tinytuya for real LAN control on the Mac mini.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Literal, Protocol


DeviceKind = Literal["climate", "switch"]
Mode = Literal["heat", "cool", "off", "auto"]


@dataclass
class ClimateState:
    target_f: float
    current_f: float
    mode: Mode
    heating: bool
    online: bool = True


@dataclass
class SwitchState:
    on: bool
    online: bool = True


@dataclass
class DeviceConfig:
    room: str
    device: str
    kind: DeviceKind
    tuya_id: str  # Tuya device ID (used by real backend)
    local_key: str | None = None  # populated only for real backend


class Backend(Protocol):
    async def init(self, devices: list[DeviceConfig]) -> None: ...

    async def get_state(self, room: str, device: str) -> ClimateState | SwitchState: ...

    # Climate ops (raises if device is not climate kind)
    async def set_target(self, room: str, device: str, target_f: float) -> ClimateState: ...
    async def set_mode(self, room: str, device: str, mode: Mode) -> ClimateState: ...

    # Switch ops (raises if device is not switch kind)
    async def set_on(self, room: str, device: str, on: bool) -> SwitchState: ...

    def on_external_change(
        self,
        handler: Callable[[str, str, ClimateState | SwitchState], None],
    ) -> None: ...

    async def close(self) -> None: ...
