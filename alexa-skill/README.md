# Home Brain — Alexa Custom Skill

This is the **skill backend** that forwards every voice command to your local
Home Brain `/interpret` endpoint. The brain does the interpretation; Alexa
just provides the wake word, ASR, and TTS.

> *"Alexa, ask Home Brain to turn off the kitchen lights."*  
> *"Alexa, ask Home Brain to play smooth jazz in the family room at twenty five."*

## What's in here

```
alexa-skill/
├── lambda/
│   ├── index.js          # the handler (~140 lines, ASK SDK v2)
│   └── package.json      # depends only on ask-sdk-core
└── skill-package/
    ├── skill.json        # skill manifest (icons, category, etc.)
    └── interactionModels/custom/en-US.json   # one intent: RunCommandIntent {command}
```

## Prerequisites

1. **The brain's `/interpret` endpoint must be reachable from AWS.** Two ways:
   - **Production:** [Cloudflare Tunnel](../docs/CLOUDFLARE_TUNNEL.md) exposes
     `https://home.brain.<your-domain>/interpret` from the Mac mini.
   - **Dev:** `ngrok http 3000` while iterating — the URL changes each
     session; fine for testing.
2. **HB_HMAC_SECRET set in the brain's `.env`.** Generate with
   `openssl rand -hex 32`. Restart the brain after setting.
3. **Amazon Developer account** (free) at https://developer.amazon.com.
4. **ASK CLI** installed locally for `ask deploy` workflows — optional, you
   can also paste the files into the Alexa Developer Console manually.

## Deploy via Alexa-hosted Lambda (recommended — free, no AWS account)

1. https://developer.amazon.com/alexa/console/ask → **Create Skill**.
2. Skill name: **Home Brain** · Locale: **English (US)**.
3. Experience type: **Other**, model: **Custom**, hosting: **Alexa-hosted (Node.js)**.
4. Click **Create skill** → **Start from scratch**.
5. Once created, go to:
   - **Build → Invocation** — set invocation name to `home brain` (must be 2+ words).
   - **Build → JSON Editor** — paste the contents of
     `skill-package/interactionModels/custom/en-US.json` over the default.
     Save Model → Build Model.
   - **Code** tab — replace `lambda/index.js` with the contents of
     `alexa-skill/lambda/index.js` from this repo. Replace `package.json`
     with `alexa-skill/lambda/package.json`. Click **Save** then **Deploy**.
6. **Code → Environment variables** — add:
   ```
   HOME_BRAIN_URL              https://home.brain.<yourdomain>/interpret
   HB_HMAC_SECRET              <same 32-byte hex as the brain>
   CF_ACCESS_CLIENT_ID         <optional, if you enable Cloudflare Access>
   CF_ACCESS_CLIENT_SECRET     <optional>
   ```
   Save and re-deploy.
7. **Test** tab — set the tester to **Development**. Type or speak
   *"ask home brain to turn off the kitchen lights"* — you should hear
   "On it." followed by the brain's spoken response.

## Test it on a real Echo

Once enabled in the Developer Console, the skill is automatically available
on every Echo signed into your Amazon account. No certification, no review,
no publishing — it stays in **Development** mode for your household.

For other family members on the same household account, they get it for free.
For family on different accounts, you'd need to invite them as **beta testers**
via the Distribution tab (gives a private install link, up to 500 testers).

## Local development loop

While iterating on the brain side, point the Lambda at an ngrok tunnel:

```bash
# on the mini
brew install ngrok
ngrok http 3000
# copy the https URL, e.g. https://abc123.ngrok.app/interpret
```

Set `HOME_BRAIN_URL=https://abc123.ngrok.app/interpret` in the Lambda env,
re-deploy. Now every Echo command hits your local brain through ngrok with
the same HMAC verification path. When you're ready for production, swap
ngrok for the Cloudflare Tunnel URL.

## Latency budget (sanity check)

| Segment | Budget |
|---|---|
| Alexa skill ceiling (request → response) | **~8 s hard** |
| Lambda → Brain client timeout | 7 s |
| Brain voice deadline (race) | 6.5 s |
| Fast-path execution (most commands) | < 1 s |
| Claude planner typical | ~3-5 s |
| Network + TTS margin | ~0.5-1 s |

If a command can't finish in 6.5s the brain returns `status: "async"`, Alexa
speaks the ack ("Setting up movie night."), and the planner finishes in the
background. Push notification on completion is queued for P5.

## Source-aware policy

The brain sees `source: "alexa"` on every voice request and gates accordingly
via `src/auth/source-authz.ts`. Today every tool is allowed via voice; when
we add door locks / alarm disarm, those will require app confirmation rather
than voice.

## Security model

| Layer | Defense |
|---|---|
| Cloudflare Tunnel + Access token | Random internet scanners never reach the brain |
| HMAC-SHA256 over `ts.requestId.text` | Forged requests rejected (401) |
| 5-minute timestamp skew window | Replay defense |
| Redis `SET NX PX` on requestId | Alexa retries never double-execute commands |
| Alexa signature on every request | Spoofed traffic to the Lambda rejected (automatic) |
| Per-source authz in brain | Voice can't issue destructive commands unattended |

## Troubleshooting

- *"Home Brain didn't respond in time"* — check the Lambda's CloudWatch logs
  (Code → Logs). Usually a missing env var or the brain URL not reachable
  from AWS.
- *"There was a problem with the requested skill's response"* — usually a
  thrown error in the Lambda; check CloudWatch.
- *"unsigned"* / *"bad signature"* in brain logs — HMAC secret mismatch
  between Lambda env and brain `.env`.
- *"stale"* — Lambda's clock drifted (rare on AWS). Bump `HB_HMAC_MAX_SKEW_MS`
  in brain `.env` to e.g. 600000 (10 min).
