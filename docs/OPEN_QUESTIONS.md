# Open questions — what to decide before going live

Every question that's still in your head (or implicit in the docs) about
how Home Brain should behave. Organized so you can sit down once and
work through it. Each question is tagged:

- **[BLOCKING]** — must answer before going live for v1
- **[IMPORTANT]** — should answer before the milestone that depends on it
- **[FUTURE]** — defer, but worth capturing so it isn't lost

The defaults listed are what's currently baked into the code or docs —
override any you disagree with.

---

## 1 · Scope for v1

### What counts as "v1"? **[BLOCKING]**

The codebase covers M0–M5 in working form. Which subset is your actual
v1 cut-over from "fiddle with mocks" → "use it daily"?

- **Default:** M0–M3 working with real hardware (foundation + Sonos +
  Control4 + iAquaLink + Tuya). M4 (TVs) and M5 (web + iMessage) are
  nice-to-have but not blocking.
- **Why it matters:** drives where you spend the first weekend.

### What's the v1 demo? **[BLOCKING]**

The single sentence you'd say to show this works.

- **Default:** "Type 'pause music in the living room' on my phone, and it
  pauses." That's M1 done-when, achievable in a weekend on real hardware.
- **Why it matters:** keeps you from over-investing pre-launch.

### Which adapters are blockers vs nice-to-have? **[BLOCKING]**

Rank by "if this doesn't work, v1 is a flop":

| Adapter | Default rank |
|---|---|
| Sonos | Blocker — music is the daily-driver use case |
| Control4 scenes | Blocker — needed for "movie night" demo |
| iAquaLink | Blocker — hot tub is in the founder's stated use case |
| Tuya (sauna) | Important — but sauna is occasional |
| Tuya (fountain etc.) | Nice-to-have |
| TVs | Nice-to-have for v1; needed for "movie night" full demo |

---

## 2 · Identity & permissions

### Who are all the actors? **[BLOCKING]**

For each person who can talk to the system:

- [ ] Their iMessage handles (phone numbers + Apple IDs)
- [ ] Their role: owner / partner / guest
- [ ] Expiration if temporary (house-sitter)

Currently `config/house.example.yaml` shows owner + partner placeholders.

### Are there children in the house? **[IMPORTANT]**

- **Why it matters:** kids texting the brain is a different threat
  model. They might also have phones that aren't on your account.
- **Default:** No special handling. Add a `child` role in M6 if needed.

### Frequency of house-sitters / guests? **[IMPORTANT]**

- **Why it matters:** if it's "twice a year," the M6 guest provisioning
  UI is overkill. If it's "every other weekend," it's load-bearing.
- **Default:** assume 2-3 times a year, lean on M6 admin UI when it lands.

### Does the housekeeper / contractor / dog-walker need access? **[FUTURE]**

- **Default:** No — they don't text the house. If this changes, add as
  guest actor with narrow permissions.

---

## 3 · Music

### What's the music-service priority for ambiguous queries? **[IMPORTANT]**

"Play jazz rock" — which service?

- **Default:** Spotify primary, fall back to Sonos favorites
  (PROJECT_REPORT §7.1)
- **Why it matters:** wrong default = wrong queries 80% of the time.
- **Sub-question:** do you have a Sonos-linked Spotify account?

### Named playlists you'd reference verbally? **[IMPORTANT]**

Give the brain a short list of named playlists it should know:

- [ ] "evening playlist" → ?
- [ ] "morning playlist" → ?
- [ ] "dinner playlist" → ?
- [ ] "workout playlist" → ?
- [ ] "kids playlist" → ?

These should be Sonos favorites or Spotify playlist URIs. Add them to
`config/house.yaml` under each room's music device config, or as a
top-level `music_aliases` section (TBD).

### Default volume per room? **[IMPORTANT]**

When you say "play X" without specifying volume:

| Room | Default volume |
|---|---|
| Living room | 25 |
| Kitchen | 30 |
| Theater | 25 |
| Backyard | 40 |

Adjust per room. Currently `set_music` accepts no default; falls back
to whatever the Sonos was last set to.

### "Music everywhere" — what's the room set? **[IMPORTANT]**

- **Default:** the `downstairs` zone in `house.yaml`. If you want a
  separate "whole house" group that includes upstairs, add it as a zone.

---

## 4 · Lighting & scenes

### Which named C4 scenes do you want the dealer to expose? **[BLOCKING]**

These map to `run_c4_scene(name: ...)` calls from brain compositions.
Start with what you already use via keypads or the C4 app:

- [ ] `theater_movie` — projector down, lights dim, AVR routed, etc.
- [ ] `theater_lights_only` — for non-movie use
- [ ] `kitchen_dinner` — kitchen warm lighting preset
- [ ] `kitchen_bright` — full bright for cooking
- [ ] `all_off` — every C4-controlled light off
- [ ] `bedtime` — bedroom + hallway dim
- [ ] `morning` — daylight-balanced everywhere
- [ ] `away` — minimal "house is occupied" lighting

You don't need all of these. Anything you fire from a keypad more than
once a week is a candidate.

### Brain-composed scenes — what's the starter list? **[BLOCKING]**

These live in `config/scenes.yaml` and cross vendors. M2 ships with
movie_night, dinner, evening_outdoor as examples; rewrite to match:

- [ ] `movie_night` — uses which rooms, which adjacent rooms get
      music-quiet?
- [ ] `dinner` — kitchen + dining + which playlist?
- [ ] `evening_outdoor` — pool lights, music, hot tub?
- [ ] `welcome_home` — fires when you arrive (M12 presence)
- [ ] `bedtime` — lights off, music off, hot tub mode change?
- [ ] `away` — security mode, climate setback?

### Brightness by time of day? **[FUTURE]**

- **Default:** no auto-adjust. Each scene specifies brightness
  explicitly.
- **Why it matters:** circadian-rhythm lighting is a real preference;
  M9 could learn this but it's significant scope.

---

## 5 · Climate

### Hot tub default target? **[BLOCKING]**

When you say "warm the hot tub" without a temperature:

- **Default:** 102°F (current mock backend default)
- Confirm or change.

### Sauna default target and warm-up time? **[BLOCKING]**

- **Default:** 180°F (current mock backend default)
- **Sub-question:** how long does it take to warm up? Brain should know
  so "warm the sauna for 7pm" works in practice (currently the brain
  doesn't compensate; it fires at 7pm exactly).

### Should "warm for 9pm" schedule the fire-time backward? **[IMPORTANT]**

I.e. if hot tub takes 30 min to warm, should the brain fire at 8:30pm
when you say "warm the hot tub for 9pm"?

- **Default:** No. The brain fires at the time you say. The LLM
  responds with "I've started warming — should be at temperature by
  9:45pm" honestly.
- **Why it matters:** "for 9pm" is ambiguous (start vs. ready). Pick a
  convention and document it in the planner system prompt.

### HVAC in scope? **[FUTURE]**

- **Default:** Out for v1. C4 controls HVAC; add `hvac_main` as a
  climate zone via the C4 adapter in M3.5 if wanted.

### Pool automation — which decisions are yours vs the system's? **[IMPORTANT]**

Pool pump runs on a daily schedule today (set by iAquaLink). Does the
brain ever touch the pool's schedule, or only its on-demand controls?

- **Default:** brain reads pool state; doesn't touch its automated
  schedule. Only fires explicit user commands.

---

## 6 · TVs & video

### Which brands do you actually have? **[BLOCKING]**

Per room:

- [ ] Theater TV: brand + model
- [ ] Living room TV: brand + model (if any)
- [ ] Bedroom TV: brand + model (if any)
- [ ] Other rooms: ?

This determines which `brand-backends.ts` stubs to implement first.

### AVR / receiver topology? **[IMPORTANT]**

If TVs are all chained through one AVR with HDMI-CEC:

- **Option A:** control TVs through the AVR (one Pulse-Eight USB-CEC
  adapter on the Mac mini does everything)
- **Option B:** control each TV directly over IP

- **Why it matters:** Option A is fewer integrations but coarser
  control. Option B is per-brand work but per-TV granularity.

### Apple TV per room? **[IMPORTANT]**

If yes, decide: Python adapter (`adapters-py/apple_tv/` with pyatv) or
shell out to `atvremote` from the TS adapter.

- **Default:** separate Python adapter — cleaner.

### Does TV power-on need to be silent (no startup chime)? **[FUTURE]**

Some Samsungs play a noise on wake. Configurable in TV settings, not by us.

---

## 7 · Other devices

### Tuya inventory — what's actually on the network besides sauna? **[IMPORTANT]**

Run `tinytuya wizard` once and list everything it finds:

- [ ] Sauna (climate)
- [ ] Fountain (switch)
- [ ] Other WiFi switches: ?
- [ ] Other plugs / outlets: ?

### Kasa / Wemo / other smart switches? **[FUTURE]**

If you have `python-kasa`-compatible switches:

- **Default:** add to Tuya adapter (kind: switch). If they speak Kasa
  protocol, add a `kasa` adapter family.
- **Why it matters:** mostly fungible — switch-style is switch-style.

### Cameras — what's installed and in scope? **[FUTURE]**

Per ROADMAP M12. Capturing now so it isn't lost:

- [ ] Cameras: brand + count
- [ ] Currently controlled by: ?
- [ ] In-scope for the brain? (presence detection, package alerts,
      "is anyone at the door")

### Door locks, gate, garage? **[BLOCKING for security model]**

These are destructive. Need explicit approval design (M6).

- [ ] Front door lock: smart lock brand?
- [ ] Gate: controllable how (relay, Z-Wave, manual)?
- [ ] Garage door: opener with API access?
- [ ] Permission default: owner only, always require explicit
      confirmation even for owner?

### Security system? **[BLOCKING for security model]**

- [ ] Brand (Honeywell, Ring, ADT, etc.)
- [ ] Arm/disarm via API?
- [ ] In scope for the brain at all, or strictly out-of-bounds?

### Irrigation / sprinklers? **[FUTURE]**

- [ ] Brand (Rachio, etc.)
- [ ] In scope? Schedule-based already?

---

## 8 · Scheduling

### Auto-approve scheduling within 24h? **[IMPORTANT]**

- **Default:** Yes (PROJECT_REPORT §7.4)
- **Counter-question:** does scheduling include anything destructive
  ever? If yes, the 24h rule needs an exclusion list.

### What's destructive in your house? **[BLOCKING]**

Explicit list — these always require explicit approval regardless of
who asks:

- [ ] Door lock unlock
- [ ] Gate open
- [ ] Garage door open
- [ ] Security disarm
- [ ] ???

Anything else? Pool drain? Anything you can't easily undo?

### Max scheduling horizon? **[IMPORTANT]**

- **Default:** No max. "Warm the hot tub at 7pm on Friday" is fine.
- **Why it matters:** if there's a max (e.g. 7 days), the schedule_action
  tool should reject longer.

### Recurring schedules — in scope for v1? **[FUTURE]**

"Every Friday at 7pm warm the hot tub" — needs a cron-style schedule,
not just a one-shot.

- **Default:** Out for v1. M9 (learning) might propose them.
- **Why it matters:** if you want this in v1, add to schedule_action.

---

## 9 · Approvals (M6)

### Approval channel? **[IMPORTANT]**

When a destructive action needs sign-off, where does the prompt go?

- **Default:** iMessage to the owner. They reply "approve" or "deny"
  in the same thread. The approval expires after 5 minutes.
- **Alternatives:** web push notification, dedicated approval app.

### Approval TTL? **[IMPORTANT]**

- **Default:** 5 minutes. If no decision in 5 minutes, the request
  fails closed.

### Override channel for emergencies? **[FUTURE]**

E.g. partner is locked out, owner phone is dead. Some kind of
challenge-response panic button?

- **Default:** No emergency override. Use the physical key / keypad.

---

## 10 · Interfaces

### iMessage primary or web-first? **[BLOCKING for M5]**

PROJECT_REPORT §7.2 defaults to "both eventually, web-first for v1."
Confirm or flip.

- **Why it matters:** iMessage needs FDA + launchd ceremony. Web works
  immediately.

### Voice (M8) — yes/no, and when? **[IMPORTANT]**

- **Default:** Defer to M8, gated on M7 eval-set + telemetry showing
  the planner is fast enough (<2s p50). The ROADMAP flags this milestone
  as "easy to quietly drop."
- **Counter-question:** is voice the primary intended interface, or a
  nice-to-have? Different answer changes M8 priority.

### Mobile app? **[FUTURE]**

The web dashboard is a PWA-able page. If you want a true native app,
that's M5+ scope creep.

- **Default:** PWA from the web dashboard is enough. Add to home screen.

### Wake word on the Mac mini? **[FUTURE]**

A "Hey home" hotword via Whisper would enable hands-free voice. Substantial
work (always-listening, false-positive tuning).

- **Default:** Defer past M8. Push-to-talk first.

---

## 11 · Remote access (M10)

### Who needs remote access? **[IMPORTANT]**

- **Default:** Owner + partner via Tailscale.
- [ ] Anyone else? Adult children? Property manager?

### Tailscale vs. exposed-to-internet? **[BLOCKING for M10]**

- **Default:** Tailscale only. Never expose the brain's port to the
  open internet.
- This is non-negotiable in the threat model (PROJECT_REPORT §8).

### What about away-from-home schedule firing? **[IMPORTANT]**

If you're traveling, should scheduled actions still fire?

- **Default:** Yes — they fire regardless of presence.
- **Alternative:** add a `pause_schedules_when_away` flag tied to M12
  presence detection.

---

## 12 · Cross-domain (M11)

### What other agent-fleet domains exist? **[IMPORTANT]**

PROJECT_REPORT mentions Instagram pipeline + entertainment tracker.
Anything else?

- [ ] Instagram-saved-posts pipeline
- [ ] Entertainment tracker
- [ ] Email triage
- [ ] Calendar / scheduling
- [ ] Note-taking / second brain
- [ ] Other?

### Which to integrate first into the chat surface? **[FUTURE]**

When you say "queue up the podcast I saved last night" — which system
owns "podcasts I saved"?

- **Default:** Defer to M11. The 1-week spike answers this.

---

## 13 · LLM behavior

### Default planner model? **[IMPORTANT]**

- **Default:** `claude-sonnet-4-6` (per PROJECT_REPORT §9 and currently
  in `.env.example`).
- **Counter:** Opus 4.7 is much smarter for tool use. Cost is ~5x
  Sonnet. Worth it for a home automation planner?

### When does the heavy model (`claude-opus-4-7`) kick in? **[IMPORTANT]**

Currently never auto-escalated. We could:

- **Default:** Manual — owner can ask explicitly. The brain stays on
  Sonnet for normal use.
- **Alternative:** Auto-escalate on retry, on long planning sequences,
  or on conversational ambiguity.

### Eval set seed messages? **[BLOCKING for M7]**

The first ~20 messages that should round-trip correctly. Start small,
grow from real usage. Examples to include from your actual planned use:

- [ ] "pause music in the living room"
- [ ] "what's playing?"
- [ ] "warm the hot tub for 9pm"
- [ ] "movie night in the theater"
- [ ] "is the sauna ready?"
- [ ] "turn off the pool lights"
- [ ] "set the mood for dinner"
- [ ] "good morning" (presence + ambient — M12?)
- [ ] "I'm leaving" (security mode — M12?)
- [ ] ...?

Capture failures from real use here once running.

### Tone / persona for the brain? **[IMPORTANT]**

Current system prompt: "be concise, one or two sentences max."

- **Alternatives:** more conversational, more terse, more formal,
  British butler, etc.
- **Why it matters:** sets the day-to-day vibe of the interaction.

---

## 14 · Observability

### Where do logs go? **[IMPORTANT]**

- **Default:** stdout + Postgres `audit_log` (M5+). Local-only.
- **Alternative:** ship to a cloud log aggregator (Datadog, Logtail,
  self-hosted Loki). Adds dependency.

### Cost telemetry? **[BLOCKING for M7]**

Planner cost in dollars per day — visible where?

- **Default:** in the web dashboard under `/admin` (M7 work).
- **Sub-question:** alert me if daily Anthropic spend exceeds $X?

### Alerting — phone notification for what? **[IMPORTANT]**

- [ ] Brain process crashed?
- [ ] Adapter offline for >5 min?
- [ ] Scheduled job failed?
- [ ] Daily LLM cost exceeded $?
- [ ] Unusual command volume?

- **Default:** No alerts in v1. Add in M7 once telemetry exists.

---

## 15 · Cost

### Anthropic API monthly budget? **[IMPORTANT]**

- **Default:** No cap.
- **Sub-question:** notify threshold (e.g. >$30/month)?
- **Why it matters:** prompt caching keeps this low if your usage is
  ~50 messages/day, but bad design (no cache, big context) can 10x.

### Other ongoing costs? **[FUTURE]**

- [ ] iAquaLink subscription (existing, not from us)
- [ ] Tailscale free tier vs paid
- [ ] Cloud backup of Postgres (if wanted) — see #16

---

## 16 · Failures & durability

### Mac mini single point of failure — backup plan? **[IMPORTANT]**

If the Mac mini dies, what's the fallback?

- **Default:** Manual fallback to vendor apps (Sonos, Control4, etc.)
  for a few days while a replacement arrives.
- **Alternative:** spare Mac mini ready-to-go with a `docker-compose
  pull && up` deploy.

### Postgres backup cadence? **[IMPORTANT]**

- **Default:** Daily `pg_dump` to local disk, kept 30 days. Nothing
  off-site.
- **Alternative:** off-site backup (S3, Backblaze) — depends on data
  sensitivity.

### Internet down — what stays working? **[BLOCKING for v1 confidence]**

The system is local-first, so the answer should be "most things." But
verify:

| Function | Works without internet? |
|---|---|
| Sonos play/pause/volume | ✓ (LAN UPnP) |
| Sonos play *query* | ✗ if query needs Spotify search (cloud) |
| C4 scenes | ✓ |
| Lights | ✓ |
| Hot tub / pool | ✗ (iAquaLink is cloud) |
| Sauna | ✓ (Tuya local) |
| Fountain | ✓ |
| TVs | depends on brand |
| LLM planner | ✗ (Anthropic is cloud) — fast-path only |
| Scheduler firing | ✓ |

**Why it matters:** confirm this matches your expectation. iAquaLink
unavailability is the biggest gap.

### C4 firmware update — pin or auto-update? **[IMPORTANT]**

Auto-updates can break `pyControl4` overnight.

- **Default:** Pin firmware with dealer; review updates before
  applying. Maintain a "scene-only" minimal mode that doesn't depend on
  individual-device commands (PROJECT_REPORT §8).

---

## 17 · Privacy & data retention

### Conversation history retention? **[IMPORTANT]**

How long do we keep what was said and what was done?

- **Default:** indefinite in `audit_log` (M5+). Reasonable since it's
  single-user.
- **Alternative:** 90-day rolling for everything except destructive
  actions.

### Per-actor visibility? **[IMPORTANT]**

Can the partner see what the owner did? Can guests see what anyone did?

- **Default:** owner sees all; partner sees their own; guests see only
  the current session.
- **Why it matters:** the dashboard needs to enforce this in M5+.

### iMessage thread privacy? **[BLOCKING]**

iMessages contain sender content. We send those to Anthropic (cloud).

- **Default:** Acceptable for owner / partner. Document this; if
  guests use iMessage, get consent.

---

## 18 · Maintenance & operations

### Who maintains this code? **[IMPORTANT]**

- **Default:** You alone.
- **Why it matters:** if "you and your partner," maintenance docs need
  to assume two people. If "you alone for now, others later," docs
  should be explicit about the bus contract so future contributors can
  add adapters without rewriting the core.

### What happens when you're away for >1 week? **[IMPORTANT]**

- [ ] Does the system get traffic at all (partner home, guests, etc.)?
- [ ] Who's the on-call if something breaks while you're away?
- [ ] Does the brain auto-pause anything (climate, schedules)?

- **Default:** It keeps running unattended. Partner has dashboard
  access. Nothing pauses. You triage on return.

### Update cadence? **[IMPORTANT]**

How often do you ship changes to the production brain?

- **Default:** When you feel like it. No CI/CD yet; manual `git pull
  && pnpm install && pnpm build && launchctl restart`.
- **Alternative:** GitHub Actions deploy on merge to main (M7+ scope).

---

## 19 · Domain & geography

### Single house assumption — confirm? **[BLOCKING]**

PROJECT_REPORT §2 says "no multi-home support." Confirm — even if you
get a second property, you'd run a separate instance there?

- **Default:** Yes. Multi-home is M~∞.

### Timezone — confirm Pacific? **[BLOCKING]**

- **Default:** America/Los_Angeles per `house.example.yaml`.

### Weather integration? **[FUTURE]**

For things like "is it warm enough for the pool?" or "close the shades
when sunny."

- **Default:** Out for v1. Add as a tool that calls weather API in M9+.

---

## 20 · Future / strategic

### When does this stop being "Devon's project"? **[FUTURE]**

Open-source it? Sell as a product? Stay personal forever?

- **Default:** stay personal. The "agent fleet" framing in PROJECT_REPORT
  suggests it stays a personal infrastructure piece, with insights
  cross-pollinating to other agents you build.

### What's the "I would feel like this failed" outcome? **[BLOCKING]**

The lower bound for v1 success.

- **Default:** "I built a thing but never use it." Lock in *one* use
  case (music control via text) before generalizing.

---

## How to use this doc

1. Print it / open it in a split pane.
2. Triage the **[BLOCKING]** items first — sit down for a focused hour
   and answer each.
3. Update `config/house.yaml`, `.env`, and scene files as you go.
4. For the deferred items, leave the default unless a question prompts
   a different answer.
5. Capture new questions here as they emerge from real usage.

A small number of these (notably scenes, named playlists, default
volumes, eval set messages, destructive-action list) are things that
benefit from iteration. Get the first answer in; revisit monthly.
