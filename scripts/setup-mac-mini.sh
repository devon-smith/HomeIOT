#!/usr/bin/env bash
#
# One-shot bootstrap for the Mac mini (or any macOS dev box).
# Idempotent — safe to re-run. Run from the repo root:
#
#   ./scripts/setup-mac-mini.sh
#
# Installs the toolchain, brings up the Docker stack, installs all
# adapter dependencies, and runs the test + smoke suites as verification.

set -euo pipefail

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '  \033[31m✗ %s\033[0m\n' "$*"; exit 1; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

bold "1/7 · Homebrew"
if ! command -v brew >/dev/null 2>&1; then
  warn "Homebrew not found — installing (this prompts for your password)"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # Apple Silicon brew lives in /opt/homebrew
  if [ -x /opt/homebrew/bin/brew ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  fi
else
  ok "brew $(brew --version | head -1)"
fi

bold "2/7 · Toolchain (node, pnpm, python, tmux, git)"
for pkg in node@22 pnpm python@3.12 tmux git; do
  if brew list "$pkg" >/dev/null 2>&1; then
    ok "$pkg already installed"
  else
    brew install "$pkg"
    ok "$pkg installed"
  fi
done

bold "3/7 · Docker"
if ! command -v docker >/dev/null 2>&1; then
  warn "Docker not found — installing Docker Desktop"
  brew install --cask docker
fi
if ! docker ps >/dev/null 2>&1; then
  warn "Docker daemon not running — launching Docker Desktop (first launch needs the GUI once)"
  open -a Docker || die "couldn't launch Docker Desktop — open it manually from /Applications"
  printf '  waiting for the daemon'
  for _ in $(seq 1 60); do
    if docker ps >/dev/null 2>&1; then break; fi
    printf '.'
    sleep 2
  done
  echo
  docker ps >/dev/null 2>&1 || die "Docker daemon still not up after 2 min — open Docker Desktop manually, accept the first-run prompts, then re-run this script"
fi
ok "docker daemon responding"

bold "4/7 · Node dependencies + Prisma client"
[ -f .env ] || { cp .env.example .env; warn "created .env from .env.example — add your ANTHROPIC_API_KEY when ready"; }
# pnpm 10+ blocks postinstall scripts by default. The set of allowed
# packages is pinned in package.json under "pnpm.onlyBuiltDependencies",
# but if it's missing for any reason we fall back to running install
# without aborting on ERR_PNPM_IGNORED_BUILDS — postinstall failures
# surface in the prisma generate / smoke tests below.
pnpm install || warn "pnpm install reported a non-fatal warning (likely build-script approval); continuing"
pnpm exec prisma generate >/dev/null
ok "pnpm install + prisma generate"

bold "5/7 · Docker stack (mosquitto + postgres + redis)"
docker compose up -d
sleep 3
docker compose ps
pnpm exec prisma migrate dev --name init --skip-generate 2>/dev/null || warn "prisma migrate skipped or already applied"
ok "stack up"

bold "6/7 · Python adapter dependencies (in .venv)"
# Homebrew Python on macOS is PEP 668-protected — we can't pip install
# system-wide. Use a project-scoped venv at .venv/ instead. The Python
# adapter panes in run-all.sh source this venv before launching.
if [ ! -d .venv ]; then
  python3 -m venv .venv
  ok "created .venv"
else
  ok ".venv exists"
fi
.venv/bin/pip install --quiet --upgrade pip
.venv/bin/pip install --quiet paho-mqtt PyYAML
ok "paho-mqtt + PyYAML"
for adapter in control4 iaqualink tuya; do
  if .venv/bin/pip install --quiet -e "adapters-py/$adapter"; then
    ok "adapters-py/$adapter"
  else
    warn "adapters-py/$adapter editable install failed"
  fi
done

bold "7/7 · Verification"
pnpm typecheck && ok "typecheck"
pnpm test >/dev/null 2>&1 && ok "unit tests" || die "unit tests failed — run 'pnpm test' to see why"
warn "running the full adapter smoke (~20s)…"
if pnpm exec tsx scripts/smoke.ts >/tmp/home-brain-smoke.log 2>&1; then
  ok "smoke: $(grep -c '✓' /tmp/home-brain-smoke.log) assertions passed"
else
  die "smoke failed — see /tmp/home-brain-smoke.log"
fi

echo
bold "Done. Next:"
echo "  · ./scripts/run-all.sh        # start brain + all adapters (mock) in tmux"
echo "  · open http://localhost:3000  # dashboard"
echo "  · pnpm discover               # scan the LAN for devices (do this while home!)"
echo "  · docs/DATA_INGESTION_CHECKLIST.md for going from mock to real hardware"
