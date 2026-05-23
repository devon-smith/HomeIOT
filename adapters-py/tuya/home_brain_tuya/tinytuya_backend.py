"""Real Tuya backend stub. Implementation lands on the Mac mini.

To wire up:
  1. `pip install tinytuya` (uncomment in pyproject.toml)
  2. Run `tinytuya wizard` once to extract per-device IDs + local_keys
     from the Tuya IoT Cloud. Store these in house.yaml under each
     device's config block (`tuya_id`, `local_key`).
  3. For climate devices, the Tuya DP map is sauna-specific — discover
     via `device.detect_available_dps()` and map set_target → DP id.
  4. For switch devices, DP 1 is typically on/off.
  5. Subscribe to LAN broadcasts on UDP 6666/6667 for external state
     changes (Tuya devices announce themselves when toggled physically).

See https://github.com/jasonacox/tinytuya for the full API.

Network requirements:
  - UDP 6666, 6667, 7000 inbound for device announcements
  - TCP 6668 outbound for device commands
"""

from __future__ import annotations

from typing import Callable

from .backend import Backend, ClimateState, DeviceConfig, Mode, SwitchState


class TinyTuyaBackend(Backend):
    async def init(self, devices: list[DeviceConfig]) -> None:
        raise NotImplementedError(
            "TinyTuyaBackend not implemented — set TUYA_MODE=mock for now, "
            "or implement against tinytuya on the Mac mini."
        )

    async def get_state(self, room: str, device: str) -> ClimateState | SwitchState:
        raise NotImplementedError

    async def set_target(self, room: str, device: str, target_f: float) -> ClimateState:
        raise NotImplementedError

    async def set_mode(self, room: str, device: str, mode: Mode) -> ClimateState:
        raise NotImplementedError

    async def set_on(self, room: str, device: str, on: bool) -> SwitchState:
        raise NotImplementedError

    def on_external_change(
        self,
        handler: Callable[[str, str, ClimateState | SwitchState], None],
    ) -> None:
        pass

    async def close(self) -> None:
        pass
