"""Control4 system discovery — dumps the full Director item tree to JSON.

Goal: turn "what's in our Control4 system?" into a machine-readable file
that the real C4 adapter (M2) can be built against without guesswork.

Setup (one-time):
  1. Find your Director's LAN IP. In the Control4 mobile app:
       More → System → System Information → IP Address
     Or check your router's DHCP table for a host like "HC800" or "EA-5".
  2. Add three lines to .env:
       CONTROL4_HOST=<director-ip>
       CONTROL4_EMAIL=<your control4 account email>
       CONTROL4_PASSWORD=<your control4 password>
  3. Install pyControl4 into the project venv:
       .venv/bin/pip install pyControl4 aiohttp

Run:
  .venv/bin/python scripts/discover-control4.py > /tmp/c4-inventory.json
  # to also see a quick categorical summary on stderr:
  .venv/bin/python scripts/discover-control4.py 2>&1 > /tmp/c4-inventory.json | grep ^#

The resulting JSON lists every item the Director knows about — rooms,
lights, scenes, AV sources, climate zones, drivers, etc. Each item has
an `id` (the proxy ID), `name`, `type`, and parent room. This is exactly
what we need to wire `set_lights` and `run_c4_scene` against the real
Director.

No state is changed; this is read-only.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from collections import Counter
from pathlib import Path


def load_env() -> None:
    """Cheap dotenv parser — same shape that run-all.sh uses."""
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        # Strip optional matching quotes from value.
        value = value.strip()
        if (value.startswith('"') and value.endswith('"')) or (
            value.startswith("'") and value.endswith("'")
        ):
            value = value[1:-1]
        os.environ.setdefault(key.strip(), value)


async def main() -> int:
    load_env()
    host = os.environ.get("CONTROL4_HOST")
    email = os.environ.get("CONTROL4_EMAIL")
    password = os.environ.get("CONTROL4_PASSWORD")
    missing = [k for k, v in {
        "CONTROL4_HOST": host,
        "CONTROL4_EMAIL": email,
        "CONTROL4_PASSWORD": password,
    }.items() if not v]
    if missing:
        print(f"ERROR: missing in .env: {', '.join(missing)}", file=sys.stderr)
        return 1

    try:
        import aiohttp
        import ssl
        from pyControl4.account import C4Account
        from pyControl4.director import C4Director
    except ImportError as err:
        print(f"ERROR: dependency not installed ({err}).", file=sys.stderr)
        print("Run:  .venv/bin/pip install pyControl4 aiohttp", file=sys.stderr)
        return 1

    async with aiohttp.ClientSession() as session:
        print(f"# auth as {email} ...", file=sys.stderr)
        account = C4Account(email, password, session)
        await account.get_account_bearer_token()

        raw_controllers = await account.get_account_controllers()
        # pyControl4 sometimes returns a dict with one controller, sometimes a list.
        if isinstance(raw_controllers, dict):
            controllers = [raw_controllers]
        else:
            controllers = list(raw_controllers)

        def cname(c: dict) -> str:
            return c.get("controllerCommonName") or c.get("controller_common_name") or ""

        print(f"# {len(controllers)} controller(s) on this account:", file=sys.stderr)
        for c in controllers:
            print(
                f"#   {cname(c)} "
                f"({c.get('href') or c.get('hardwareDescription') or c.get('hardware_description')})",
                file=sys.stderr,
            )

        # Prefer the Master Controller (the EA-5 / HC800 holds the Director DB).
        # Fall back to the first controller if nothing identifies itself as master.
        target = os.environ.get("CONTROL4_CONTROLLER")  # explicit override
        if target:
            controller = next((c for c in controllers if target.lower() in cname(c).lower()), None)
            if not controller:
                print(f"ERROR: CONTROL4_CONTROLLER='{target}' not found among controllers", file=sys.stderr)
                return 1
        else:
            controller = next((c for c in controllers if "master" in cname(c).lower()), controllers[0])

        common_name = cname(controller)
        print(f"# requesting director token for {common_name} ...", file=sys.stderr)
        director_bearer = await account.get_director_bearer_token(common_name)
        token = director_bearer.get("token") if isinstance(director_bearer, dict) else director_bearer

        # The Director uses a self-signed cert (subject = controller name).
        # That's standard for C4 — every Director on every site is self-signed.
        # Cloud auth above uses normal verification; only the local Director
        # call gets a no-verify session.
        ssl_ctx = ssl.create_default_context()
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = ssl.CERT_NONE
        director_conn = aiohttp.TCPConnector(ssl=ssl_ctx)
        async with aiohttp.ClientSession(connector=director_conn) as director_session:
            director = C4Director(host, token, director_session)
            print(f"# fetching item tree from director at {host} ...", file=sys.stderr)
            items_raw = await director.get_all_item_info()
            items = json.loads(items_raw) if isinstance(items_raw, str) else items_raw

        # Stderr summary so the user can eyeball before sending JSON.
        if isinstance(items, list):
            type_counts = Counter(item.get("type") for item in items if isinstance(item, dict))
            cat_counts = Counter(item.get("category") for item in items if isinstance(item, dict))
            print(f"# {len(items)} items total", file=sys.stderr)
            print(f"#", file=sys.stderr)
            print(f"# by category:", file=sys.stderr)
            for cat, n in sorted(cat_counts.items(), key=lambda x: (-x[1], str(x[0]))):
                print(f"#   {cat!s:<24} {n}", file=sys.stderr)
            print(f"#", file=sys.stderr)
            print(f"# by type (top 15):", file=sys.stderr)
            for typ, n in type_counts.most_common(15):
                print(f"#   {typ!s:<32} {n}", file=sys.stderr)

        json.dump(items, sys.stdout, indent=2, default=str)
        sys.stdout.write("\n")

    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
