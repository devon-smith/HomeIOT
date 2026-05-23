# iMessage bridge

Runs as a launchd agent on the Mac mini, watches incoming iMessages, posts
them to the Home Brain HTTP endpoint, and sends the reply back via
osascript / Messages.app.

## What it does

For every new incoming message in `~/Library/Messages/chat.db`:

1. Resolves the sender handle (phone or Apple ID) to an actor slug from
   `config/house.yaml` → `actors[*].imessage_handles`. Unknown handles
   default to `guest` (and the brain's permission model enforces from
   there).
2. POSTs `{text, actor}` to `http://localhost:3000/message`.
3. Sends the response back to the sender's iMessage conversation.

Cursor (last-seen message ROWID) is persisted to `~/.home-brain/imessage-cursor`
so the bridge resumes cleanly after restarts.

## Install

1. **Copy the plist:**

   ```sh
   cp scripts/com.homebrain.imessage.plist ~/Library/LaunchAgents/
   ```

2. **Edit the plist** — replace `/Users/REPLACE_ME/code/HomeIOT` with your
   actual repo path. Same for the log file location under
   `~/Library/Logs/`.

3. **Grant Full Disk Access** to both binaries the bridge uses:
   - System Settings → Privacy & Security → Full Disk Access
   - Click `+` and add `/opt/node22/bin/node` (or wherever your `node` lives)
   - Also add `/usr/bin/sqlite3`
   - Without FDA, the bridge cannot read `chat.db` and exits immediately.

4. **Grant Messages automation** — first send attempt will trigger a
   permission prompt for `/usr/bin/osascript` to control Messages.app.
   Approve it. (Settings → Privacy & Security → Automation → osascript →
   Messages.)

5. **Load and start:**

   ```sh
   launchctl load ~/Library/LaunchAgents/com.homebrain.imessage.plist
   launchctl start com.homebrain.imessage
   ```

6. **Verify:**

   ```sh
   tail -f ~/Library/Logs/home-brain-imessage.log
   ```

   Send yourself an iMessage from another device — you should see the
   bridge log it and the brain respond.

## Configure actors

In `config/house.yaml`:

```yaml
actors:
  owner:
    role: owner
    imessage_handles:
      - "+15551234567"
      - "owner@icloud.com"
  partner:
    role: partner
    imessage_handles: ["+15559876543"]
```

Handles are matched after normalization (phone digits stripped of
formatting; emails lowercased). One handle per line; can mix phone numbers
and Apple ID emails.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Bridge exits immediately with "chat.db not found" | Full Disk Access not granted to the `node` binary in the plist |
| `sqlite3` errors in log | Same — FDA also needed for `/usr/bin/sqlite3` |
| Messages sent but no reply arrives | Automation permission not granted to osascript |
| Replies go to wrong conversation | Sender handle didn't match the iMessage conversation buddy — check normalization in `buildActorMap` |
| Brain returns "fast-path-only" responses | `ANTHROPIC_API_KEY` not set in the brain process |

## Local testing without a Mac

The pure-logic pieces of the bridge (handle normalization, actor resolution,
house.yaml parsing) are unit-tested in `scripts/imessage-bridge.test.ts` and
run on any platform via `pnpm test`. The sqlite + osascript paths are
macOS-only and have to be verified on the Mac mini.

## Uninstall

```sh
launchctl unload ~/Library/LaunchAgents/com.homebrain.imessage.plist
rm ~/Library/LaunchAgents/com.homebrain.imessage.plist
rm -rf ~/.home-brain
```
