# Music tuning — playlists, moods, Routines

Source-of-truth for Sonos voice routing. Snapshot from `pnpm sonos:list`
on 2026-06-24: **79 items** reachable (68 favorites + 11 Sonos
Playlists). Re-run the script anytime the library changes.

## Reachability rule

`set_music` matches `query` via two stages, in order:

1. `getFavorites()` — items pinned in **My Sonos**.
2. `searchMusicLibrary("sonos_playlists")` — native Sonos Playlists +
   any Spotify playlist saved with "Save Playlist to Sonos".

Items only in the Spotify Playlists *collection* (visible in the Sonos
app's Spotify section but not pinned) are **not findable**. Pin them in
the Sonos app before relying on them by voice.

## Curated dashboard chips (`starred_playlists`)

The 12 picks below are all confirmed findable on your system, span every
mood, and have zero ambiguity. Paste into `config/house.yaml` under
`preferences.music.starred_playlists`:

```yaml
starred_playlists:
  - { label: "Cocktail Jazz",       query: "cocktail jazz",      mood: "dinner",
      rooms: [kitchen, dining_room],          volume: 28 }
  - { label: "Chill Vibes",         query: "chill vibes 2025",   mood: "chill",
      rooms: [kitchen, family_room],          volume: 22 }
  - { label: "Lofi Morning",        query: "lofi morning",       mood: "morning",
      rooms: [kitchen, master_bedroom],       volume: 22 }
  - { label: "Yacht Rock",          query: "yacht rock",         mood: "background",
      rooms: [backyard, terrace, pool_house], volume: 35 }
  - { label: "Poolside",            query: "poolside miami",     mood: "background",
      rooms: [pool_house, oasis_palms, waterfall], volume: 38 }
  - { label: "Cool Costes",         query: "cool costes",        mood: "background",
      rooms: [kitchen, family_room],          volume: 24 }
  - { label: "Costes Lounge",       query: "costes club",        mood: "dinner",
      rooms: [kitchen, dining_room],          volume: 26 }
  - { label: "Calm Jazz",           query: "calm jazz no",       mood: "focus",
      rooms: [family_room],                   volume: 18 }
  - { label: "Classical Focus",     query: "classical focus",    mood: "focus",
      rooms: [family_room],                   volume: 18 }
  - { label: "Lowkey Tech",         query: "lowkey tech",        mood: "focus",
      rooms: [family_room],                   volume: 20 }
  - { label: "Feel Good Lofi",      query: "feel good lofi",     mood: "energy",
      rooms: [workout],                       volume: 45 }
  - { label: "Sunday Morning",      query: "sunday morning chill", mood: "morning",
      rooms: [kitchen, master_bedroom],       volume: 22 }
```

## Mood mappings — tuned to real findable substrings

```yaml
mood_playlists:
  chill: chill vibes 2025
  focus: classical focus
  background: yacht rock
  energy: feel good lofi
  dinner: cocktail jazz
  morning: lofi morning
default_volume_by_mood:
  chill: 22
  focus: 18
  background: 28
  energy: 45
  dinner: 28
  morning: 22
```

## Alexa Routines — 12 high-value

Trigger phrases are short and phonetically clean; Custom Actions resolve
unambiguously to a real playlist. Set up in **Alexa app → More →
Routines → + New → Voice trigger → Custom action**.

| Alexa trigger | Custom Action |
|---|---|
| "Alexa, dinner jazz" | tell natasha brain to play cocktail jazz in the kitchen and dining room |
| "Alexa, chill vibes" | tell natasha brain to play chill vibes 2025 in the kitchen and family room |
| "Alexa, morning music" | tell natasha brain to play lofi morning in the kitchen and master bedroom |
| "Alexa, yacht rock" | tell natasha brain to play yacht rock in the backyard, terrace, and pool house |
| "Alexa, poolside" | tell natasha brain to play poolside miami in the pool house, oasis palms, and waterfall |
| "Alexa, focus mode" | tell natasha brain to play classical focus in the family room at volume 18 |
| "Alexa, workout time" | tell natasha brain to play feel good lofi in the workout room at volume 50 |
| "Alexa, costes hour" | tell natasha brain to play cool costes in the kitchen and family room |
| "Alexa, sunday chill" | tell natasha brain to play sunday morning chill in the kitchen and master bedroom |
| "Alexa, deep house" | tell natasha brain to play thursday morning in the kitchen and family room |
| "Alexa, holiday vibes" | tell natasha brain to play iheart christmas in the kitchen and family room |
| "Alexa, music off" | tell natasha brain to pause all music |

## Day-of-week morning Routines (optional)

You have distinct playlists for each weekday morning — these read
naturally and are unambiguous:

| Alexa trigger | Custom Action |
|---|---|
| "Alexa, tuesday morning" | tell natasha brain to play tuesday morning in the kitchen and master bedroom |
| "Alexa, wednesday morning" | tell natasha brain to play wednesday morning in the kitchen and master bedroom |
| "Alexa, thursday morning" | tell natasha brain to play thursday morning in the kitchen and master bedroom |
| "Alexa, friday morning" | tell natasha brain to play friday morning in the kitchen and master bedroom |

## Library cleanup suggestions

These are minor — only if you want to tighten up. The brain works fine
without them.

- **"Everything In Its Right Place" appears 2×** (original + House
  remix). Voice "everything in its" matches both — whichever the Sonos
  API returns first wins. Either rename one or accept the coin flip.
- **"Supreme Beings of Leisure" appears 2×** (album + Radio). Same as
  above. Voice "supreme beings" or "supreme beings radio" depending on
  which you want.
- **Generic single-word titles** ("Clara", "Favorites", "Playlists",
  "Starred", "Musicccc", "Milk", "Shadow", "Suzuki", "The Voice")
  could collide with phrases in other contexts. They work, but the
  voice trigger needs to be exact. Consider renaming the ones you'd
  actually voice.
- **"Hôtel Costes 2025 🍸 Hotel Costes" + "Hôtel Costes Radio"** — close
  matches for "costes". Use "cool costes" or "costes club" instead;
  both are uniquely matchable.

## Worth pinning later (if you want more triggers)

Spotify-only items the Chrome browser inventory turned up that AREN'T
yet pinned in My Sonos. Pin via Sonos app → playlist → ⓘ → Add to My
Sonos. Each unlocks a new Routine phrase:

- Paris Vibes → "Alexa, paris"
- Trip Hop → "Alexa, trip hop"
- dirty martini in a swanky hotel → "Alexa, dirty martini"
- Romantic Evening Mind Expansion → "Alexa, romance"
- For All Mankind Tracklist → "Alexa, space launch"
- Luxury Hotel Lounge → "Alexa, hotel lounge"
- Nothing Left - EDM → "Alexa, edm" (also a better fit for `energy` mood)
- Andy's idea of dance music → "Alexa, dance party"
- SUMMER BOPS → "Alexa, summer bops"

Re-run `pnpm sonos:list` after pinning to confirm they show up, then
add them here.

## Refresh workflow

When you save new playlists or change pins:

```bash
pnpm sonos:list                  # see the new state of the library
pnpm sonos:list --markdown       # copy/paste-ready
```

Then update this file + `config/house.yaml` + restart:

```bash
tmux kill-session -t brain
launchctl kickstart -k gui/$(id -u)/com.homebrain.brain
```
