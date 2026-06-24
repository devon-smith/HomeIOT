# Sonos action items — curate the 12 dashboard chips

Scenario-first plan. Decide the 12 moments you want one-tap voice
access to, then add the right playlist to Sonos for each. After
pinning, run `pnpm sonos:list` to confirm, then update `house.yaml`.

## The 12 scenarios

| # | Scenario | When you'd use it | Rooms | Vibe |
|---|---|---|---|---|
| 1 | **Morning Coffee** | First hour of the day | kitchen, master_bedroom | Gentle uplift |
| 2 | **Cooking** | Prepping dinner | kitchen | Upbeat lounge |
| 3 | **Dinner Jazz** | Eating, calm | kitchen, dining_room | Classic dinner jazz |
| 4 | **Cocktail Hour** | Guests over, drinks before dinner | kitchen, dining_room | Sophisticated lounge |
| 5 | **Family Hang** | Evenings, low key | family_room, kitchen | Background, conversational |
| 6 | **Backyard** | Outdoor entertaining | backyard, terrace, pool_house | Yacht rock, summer |
| 7 | **Poolside** | By the pool | pool_house, oasis_palms, waterfall | Tropical chill |
| 8 | **Workout** | Gym session | workout | High energy, motivating |
| 9 | **Focus** | Deep work | family_room | Instrumental, no lyrics |
| 10 | **Late Night** | Wind down, pre-bed | master_bedroom | Soft, sleep-adjacent |
| 11 | **Party** | Energy gathering | kitchen, family_room, backyard | Dance hits |
| 12 | **Holiday** | Christmas, festive | kitchen, dining_room | Seasonal |

## Action items — what to pin in Sonos

For each item: tap the playlist in the Sonos app → ⓘ → **Add to My Sonos**.
After all pins, re-run `pnpm sonos:list` to verify they show up. Then I'll
tune `house.yaml`.

---

### 1. Morning Coffee ✓ ALREADY HAVE
- **Use:** *Lofi Morning* (already pinned)
- **Trigger phrase:** "lofi morning"
- **Action:** Done. No work needed.

### 2. Cooking ⚠ DECIDE
The current library is jazz-heavy for cooking. Two paths:
- **Easy option:** reuse *Wednesday Morning Jazz* (you already have it).
- **Better option:** pin one cooking-flavored upbeat lounge. Suggested searches in Sonos app → Spotify → Search:
  - "Italian Bistro" (Spotify-curated, ~6 hours of upbeat Italian café)
  - "Jazz in the Kitchen" (light bossa nova, cooking energy)
  - "Cocktail Jazz" — wait, you have this, but it's slower; pair with #4 (Cocktail Hour)
- **TODO:** decide which, pin it, then voice-trigger query becomes its first-3-words substring.

### 3. Dinner Jazz ✓ ALREADY HAVE
- **Use:** *Cocktail Jazz* (already pinned)
- **Trigger phrase:** "cocktail jazz"
- **Action:** Done.

### 4. Cocktail Hour ✓ ALREADY HAVE (multiple)
- **Use:** *Cool Costes* OR *Costes Club Chillout DJ* (both pinned)
- **Trigger phrase:** "cool costes" or "costes club"
- **Action:** Done. Pick whichever you prefer; if both, use *Cool Costes* for default chip.

### 5. Family Hang ✓ ALREADY HAVE
- **Use:** *Chill Vibes 2025*
- **Trigger phrase:** "chill vibes"
- **Action:** Done.

### 6. Backyard ✓ ALREADY HAVE
- **Use:** *House Yacht Rock Mix*
- **Trigger phrase:** "yacht rock"
- **Action:** Done.

### 7. Poolside ✓ ALREADY HAVE
- **Use:** *Poolside: Miami Chill*
- **Trigger phrase:** "poolside miami"
- **Action:** Done.

### 8. Workout ⚠ NEED TO ADD
Your library is missing a real high-energy playlist. *Feel Good Lofi*
isn't actually energizing. **Pick one** of these and pin it:
- "Beast Mode" (Spotify-curated, gym staple — 4 hours of high-BPM)
- "Power Workout" (Spotify, similar)
- "Cardio Hits" (Spotify, top 40 + electronic)
- "Pump Up Songs" or "Workout Twerkout" (depending on vibe)
- "**Workout 2026**" or just current year's workout playlist
- **TODO:** Pin one; the trigger becomes "beast mode", "power workout", etc.

### 9. Focus ✓ ALREADY HAVE (multiple)
- **Use:** *Classical Focus* (cleanest) OR *calm jazz no vocals*
- **Trigger phrase:** "classical focus" or "calm jazz"
- **Action:** Done. Pick *Classical Focus* for the default chip.

### 10. Late Night ⚠ DECIDE
You have a binaural-beats playlist (*Ondas Theta Puras*) which is
literally for meditation/sleep. That'll work if it's the vibe you want.
- **Easy option:** *Ondas Theta Puras* (already pinned) — trigger "ondas theta"
- **Better option:** more conventional sleep music. Pin one:
  - "Peaceful Piano" (Spotify-curated, sleepy solo piano)
  - "Sleep" (Spotify-curated, ambient)
  - "Calm Before The Storm" or "Night Rain"
- **TODO:** decide whether Ondas is the vibe or you want something more mainstream.

### 11. Party ⚠ NEED TO ADD
You have *Thursday Morning Deep House* (sort of), but nothing truly
party-energy. **Pick one** to pin:
- "Today's Top Hits" (Spotify, current Top 40)
- "Disco Forever" or "Mood Booster"
- "Dance Hits 2020s" or "Dance Party"
- "House Party" (Spotify-curated)
- **TODO:** Pin one; trigger becomes "dance party", "mood booster", etc.

### 12. Holiday ✓ ALREADY HAVE
- **Use:** *iHeart Christmas* (already pinned)
- **Trigger phrase:** "iheart christmas"
- **Action:** Done. Only fires when you trigger it — won't auto-play in summer.

---

## Summary — what you need to do in the Sonos app

Three pins required:

- [ ] **#2 Cooking** — pin one cooking-flavored upbeat lounge (or reuse Wednesday Morning Jazz)
- [ ] **#8 Workout** — pin one high-energy gym playlist (e.g. "Beast Mode")
- [ ] **#11 Party** — pin one dance-party playlist (e.g. "Mood Booster" or "Today's Top Hits")

Optional decision:
- [ ] **#10 Late Night** — confirm Ondas Theta Puras is the vibe, OR pin a Peaceful Piano

## After you pin

```bash
cd ~/code/HomeIOT
pnpm sonos:list | grep -iE 'beast|workout|party|hits|piano|booster'
```

Paste the matching titles back here and I'll generate the final
`starred_playlists` + `mood_playlists` blocks with your actual chosen
queries, plus the matching 12 Alexa Routines.

## Why this matters

The brain's `set_music` does case-insensitive substring search. If you
say *"play beast mode"* and Sonos has *"Beast Mode Workout 2026"* in
favorites, it matches on "beast mode". As long as each chip's query
substring uniquely hits one playlist, voice routing is bulletproof.

The 79 items in your library today are richer than the chips need —
the 12 chips are deliberately a curated, daily-use set. Everything else
stays reachable via "play [name] in [room]" but isn't in the
one-tap surface.
