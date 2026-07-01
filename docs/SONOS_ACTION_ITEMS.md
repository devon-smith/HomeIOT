# Sonos action items — curate the 12 dashboard chips

Scenario-first plan. Decide the 12 moments you want one-tap voice
access to, then add the right playlist to Sonos for each. After
pinning, run `pnpm sonos:list` to confirm, then update `house.yaml`.

## Grounded vibes — what the playlists ACTUALLY are

Confirmed by opening tracklists. The "Andy Smith" day-named playlists
are NOT genre playlists — they're all French nu-disco / chillwave /
downtempo. The word in the title is misleading.

| Title | Real vibe (from tracklist) |
|---|---|
| **Wednesday Morning Jazz** | NOT jazz — upbeat French nu-disco (L'Impératrice, Parcels, KAYTRANADA). Energetic. |
| **Tuesday Morning Chill** | Downtempo French electronic (Polo & Pan, French 79). Mellow. |
| **Thursday Morning Deep House** | French house (same Andy Smith curation pattern). |
| **calm jazz no vocals** | THE one real jazz playlist — Nat King Cole, Bill Evans, Miles Davis. Instrumental. |
| **Chill Jazz Vibes 🎷** | NOT jazz — lofi beats / chillhop. Instrumental study music. |
| **Hôtel Costes 2025/2026** | Downtempo French lounge — St Germain, Gotan Project, Kruder & Dorfmeister. Cocktail hour. |
| **Cool Costes** | Same Costes lounge family. |
| **Swanky Hanky House** | Downtempo nu-disco / lounge house. Not peak-time party. |
| **French Lounge Morning #1** | Smooth jazz lounge w/ vocals — Bublé, Chuck Mangione, Billie Holiday. Brunch. |
| **French Lounge Morning #2** | Upbeat French house — Polo & Pan, Jax Jones, Bonobo. Opposite vibe from #1. |
| **Feel Good Lofi Beats** | Lofi (not "energy" as the prior plan assumed). Chill/focus. |

## The 12 scenarios — recommended picks

| # | Scenario | When | Rooms | Vibe | Best Playlist | Status |
|---|---|---|---|---|---|---|
| 1 | **Morning Coffee** | First hour | kitchen, master_bedroom | Gentle uplift | Lofi Morning | ✓ have |
| 2 | **Cooking** | Prepping food | kitchen | Upbeat lounge | Wednesday Morning *(French nu-disco)* | ✓ have |
| 3 | **Dinner Jazz** | Eating, calm | kitchen, dining_room | Classic jazz | Cocktail Jazz | ✓ have |
| 4 | **Cocktail Hour** | Drinks before dinner | kitchen, dining_room | Sophisticated lounge | Hôtel Costes 2025 | ✓ have |
| 5 | **French Brunch** | Weekend daytime eating | kitchen, dining_room | Mellow vocal jazz lounge | French Brunch Lounge | ⚠ RENAME |
| 6 | **Family Hang** | Evenings, low key | family_room | Background, conversational | Chill Vibes 2025 | ✓ have |
| 7 | **Backyard** | Outdoor entertaining | backyard, terrace, pool_house | Yacht rock | House Yacht Rock Mix | ✓ have |
| 8 | **Poolside** | By the water | pool_house, oasis_palms, waterfall | Tropical chill | Poolside: Miami Chill | ✓ have |
| 9 | **Focus** | Deep work | family_room | Instrumental | Classical Focus | ✓ have |
| 10 | **Late Night** | Wind down | master_bedroom | Soft sleep | Ondas Theta Puras | ✓ have |
| 11 | **Workout** | Gym session | workout | High energy | Beast Mode | ⚠ PIN |
| 12 | **Party** | Energy gathering | kitchen, family_room, backyard | Dance hits | Mood Booster | ⚠ PIN |

## Action items — 3 things in the Sonos app

### 1. RENAME — French Lounge Morning duplicates (30 seconds, highest-leverage)

Two playlists share the exact name with opposite vibes. Substring matching
can never disambiguate identical titles — rename them:

- Mellow vocal-jazz brunch one (Bublé, Chuck Mangione, Billie Holiday)  
  → rename to **"French Brunch Lounge"**
- Upbeat French house one (Polo & Pan, Jax Jones, Bonobo)  
  → rename to **"French House Morning"**

In Sonos app: tap playlist → ⓘ → Edit → Rename.

### 2. PIN — Beast Mode (Workout)

Sonos app → Search → Spotify → "Beast Mode" → ⓘ → **Add to My Sonos**.

Alternatives if you prefer: Power Workout, Cardio, Workout Twerkout.

### 3. PIN — Mood Booster (Party)

Sonos app → Search → Spotify → "Mood Booster" → ⓘ → **Add to My Sonos**.

Alternatives: Today's Top Hits, Hot Hits USA, Pop Rising.

## After you finish in the Sonos app

```bash
cd ~/code/HomeIOT
pnpm sonos:list | grep -iE 'beast|booster|french brunch|french house'
```

Should print 4 matching lines:
- favorite — Beast Mode
- favorite — Mood Booster
- favorite — French Brunch Lounge
- favorite — French House Morning

Then paste both these blocks into `config/house.yaml`:

### starred_playlists (replace existing)

```yaml
starred_playlists:
  - { label: "Morning Coffee",  query: "lofi morning",       mood: "morning",
      rooms: [kitchen, master_bedroom],         volume: 22 }
  - { label: "Cooking",         query: "wednesday morning",  mood: "energy",
      rooms: [kitchen],                         volume: 32 }
  - { label: "Dinner Jazz",     query: "cocktail jazz",      mood: "dinner",
      rooms: [kitchen, dining_room],            volume: 28 }
  - { label: "Cocktail Hour",   query: "costes twenty",      mood: "dinner",
      rooms: [kitchen, dining_room],            volume: 26 }
  - { label: "French Brunch",   query: "french brunch",      mood: "dinner",
      rooms: [kitchen, dining_room],            volume: 26 }
  - { label: "Family Hang",     query: "chill vibes",        mood: "chill",
      rooms: [kitchen, family_room],            volume: 22 }
  - { label: "Backyard",        query: "yacht rock",         mood: "background",
      rooms: [backyard, terrace, pool_house],   volume: 35 }
  - { label: "Poolside",        query: "poolside miami",     mood: "background",
      rooms: [pool_house, oasis_palms, waterfall], volume: 38 }
  - { label: "Focus",           query: "classical focus",    mood: "focus",
      rooms: [family_room],                     volume: 18 }
  - { label: "Late Night",      query: "ondas theta",        mood: "chill",
      rooms: [master_bedroom],                  volume: 14 }
  - { label: "Workout",         query: "beast mode",         mood: "energy",
      rooms: [workout],                         volume: 48 }
  - { label: "Party",           query: "mood booster",       mood: "energy",
      rooms: [kitchen, family_room, backyard],  volume: 42 }
```

### mood_playlists (replace existing)

```yaml
mood_playlists:
  chill: chill vibes
  focus: classical focus
  background: yacht rock
  energy: beast mode
  dinner: cocktail jazz
  morning: lofi morning
default_volume_by_mood:
  chill: 22
  focus: 18
  background: 28
  energy: 48
  dinner: 28
  morning: 22
```

## The 12 Alexa Routines

Set up in Alexa app → More → Routines → + New → Voice trigger → Custom action.

| Alexa trigger | Custom Action |
|---|---|
| "Alexa, morning coffee" | ask smart home to play lofi morning in the kitchen and master bedroom |
| "Alexa, cooking" | ask smart home to play wednesday morning in the kitchen |
| "Alexa, dinner jazz" | ask smart home to play cocktail jazz in the kitchen and dining room |
| "Alexa, cocktail hour" | ask smart home to play costes twenty in the kitchen and dining room |
| "Alexa, french brunch" | ask smart home to play french brunch in the kitchen and dining room |
| "Alexa, chill vibes" | ask smart home to play chill vibes in the kitchen and family room |
| "Alexa, backyard music" | ask smart home to play yacht rock in the backyard, terrace, and pool house |
| "Alexa, poolside" | ask smart home to play poolside miami in the pool house, oasis palms, and waterfall |
| "Alexa, focus mode" | ask smart home to play classical focus in the family room at volume 18 |
| "Alexa, goodnight music" | ask smart home to play ondas theta in the master bedroom at volume 14 |
| "Alexa, workout time" | ask smart home to play beast mode in the workout room |
| "Alexa, party mode" | ask smart home to play mood booster in the kitchen, family room, and backyard at volume 42 |

## Refresh workflow

After any Sonos change (new pin, rename, delete):

```bash
pnpm sonos:list                    # see updated state
pnpm sonos:list --markdown         # paste-ready if reporting back
```

Update `house.yaml` to match, restart the brain:

```bash
tmux kill-session -t brain
launchctl kickstart -k gui/$(id -u)/com.homebrain.brain
```
