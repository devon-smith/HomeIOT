# Alexa Routines — friction shortcuts for Smart Home

You set Routines up in the Alexa mobile app (one-time, per-device). Each one
maps a short phrase you actually want to say (e.g. *"fan off"*) to the long
form Alexa expects (*"ask smart home to turn off Devon's fan"*). Routines
are an Alexa feature — Home Brain doesn't need any code changes to support
them.

## How to add a Routine

1. Open the **Alexa app** → **More** → **Routines** → **+ New**.
2. **When this happens** → **Voice** → type the trigger phrase exactly as
   you'll say it.
3. **Add action** → **Custom** → type the command you want Alexa to run —
   prefix with `ask smart home to `. Avoid `tell` here because Alexa can
   interpret name-like phrases as communications or announcements.
4. **From** → the Echo you want to trigger from (or "Customized" → every
   Echo in the relevant room).
5. **Save**.

That's it. The phrase now fires the command without you having to say
"Alexa, ask smart home to ...".

## Recommended Routines

Tested phrasings — copy/paste these. Each entry lists the trigger phrase
(what you say) and the full command (what to put in the Custom action).

### Lighting

| Trigger | Custom action |
|---|---|
| *Alexa, lights out* | ask smart home to turn off all the lights |
| *Alexa, kitchen lights* | ask smart home to turn on the kitchen lights |
| *Alexa, dim the kitchen* | ask smart home to dim the kitchen to 40 |
| *Alexa, bright kitchen* | ask smart home to turn on the kitchen lights at 100 |
| *Alexa, devon's room* | ask smart home to turn on Devon's room lights |
| *Alexa, foyer on* | ask smart home to turn on the foyer lights |

### Climate

| Trigger | Custom action |
|---|---|
| *Alexa, warmer upstairs* | ask smart home to raise the upstairs temperature by 2 |
| *Alexa, cooler upstairs* | ask smart home to lower the upstairs temperature by 2 |
| *Alexa, sleep mode* | ask smart home to set upstairs to 68 and downstairs to 68 |

### Hot tub / pool

| Trigger | Custom action |
|---|---|
| *Alexa, warm the tub* | ask smart home to warm the hot tub to 102 |
| *Alexa, tub off* | ask smart home to turn off the hot tub |
| *Alexa, warm the pool* | ask smart home to warm the pool to 85 |
| *Alexa, pool off* | ask smart home to turn off the pool heater |

### Music

| Trigger | Custom action |
|---|---|
| *Alexa, jazz time* | ask smart home to play coffee table jazz in the kitchen and family room |
| *Alexa, dinner jazz* | ask smart home to play dinner jazz in the kitchen and dining room |
| *Alexa, backyard music* | ask smart home to play acoustic chill in the backyard and terrace |
| *Alexa, workout music* | ask smart home to play a high energy mix in the workout room |
| *Alexa, music off* | ask smart home to pause all music |

### Theater / TV

| Trigger | Custom action |
|---|---|
| *Alexa, movie night* | ask smart home to start movie night in the theater |
| *Alexa, watch tv* | ask smart home to watch xfinity in the master bedroom |
| *Alexa, theater off* | ask smart home to turn off the theater |

### Scenes (compound)

| Trigger | Custom action |
|---|---|
| *Alexa, good morning* | ask smart home to start the morning |
| *Alexa, goodnight* | ask smart home to run goodnight |
| *Alexa, dinner time* | ask smart home to dim the kitchen and play dinner jazz |

## How Routines compose with terse session-keep-alive

Home Brain returns **terse confirmations** (e.g. *"OK, lights off."*) and
**keeps the Alexa session open** when `HB_VOICE_TERSE` and
`HB_VOICE_KEEP_OPEN` are on (both default true). After the Routine fires,
you can immediately say a follow-up — *"and warm the hot tub"*, *"and play
jazz in the kitchen"* — without re-prefixing.

```
You    : "Alexa, lights out."
Routine: → "ask smart home to turn off all the lights"
Brain  : "OK, lights off." [session stays open]
You    : "and warm the hot tub."
Brain  : "Warming to 102." [session stays open]
You    : "stop." [or just wait 8s]
```

That chain takes ~6 seconds end-to-end instead of ~18 if each command
required its own *"Alexa, ask smart home to..."* preamble.

## Troubleshooting

- **Routine doesn't fire**: Alexa Routines are picky about exact phrasing.
  Re-record the trigger if needed.
- **Brain replies with "I didn't catch that"**: the Custom action text
  reached Home Brain garbled. Open the Alexa app → History to see what
  Alexa actually heard, then adjust the Custom action.
- **Routine fires but Brain is silent**: the Custom action probably
  forgot the *"ask smart home to "* prefix.
- **Want to disable terse mode for queries**: queries (no tool calls)
  always get the full response — only successful actions get the short
  ack. To turn off the short ack entirely set `HB_VOICE_TERSE=false` in
  the brain's `.env`.
- **Want to end the session immediately after each action**: set
  `HB_VOICE_KEEP_OPEN=false`. This brings back the old behavior where
  every command requires its own *"Alexa, ask smart home to..."*.
