/**
 * Single-file HTML dashboard. No build step, no framework — vanilla JS hits
 * the existing /world, /events, /schedule, and /message endpoints. Inlined
 * in server.ts via the GET / route.
 *
 * Auto-refreshes world and events every 2s. Pending jobs are listed with a
 * Cancel button. The message input echoes the response back inline.
 */

export const DASHBOARD_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Home Brain</title>
  <style>
    :root {
      --bg: #f4f1ea;
      --fg: #2a2a2a;
      --muted: #777;
      --card: #fff;
      --accent: #c8623a;
      --border: #e3ddd1;
      --mono: ui-monospace, "JetBrains Mono", Menlo, Monaco, Consolas, monospace;
    }
    @media (prefers-color-scheme: dark) {
      :root { --bg: #1f1d1a; --fg: #ece8df; --muted: #999; --card: #2a2725; --border: #3a3633; }
    }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; max-width: 1200px; margin-inline: auto; font: 14px/1.5 system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--fg); }
    h1 { font-family: Georgia, serif; font-weight: 400; font-style: italic; margin: 0 0 4px; }
    h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin: 24px 0 8px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    @media (max-width: 800px) { .grid { grid-template-columns: 1fr; } }
    .card { background: var(--card); border: 1px solid var(--border); border-radius: 6px; padding: 16px; }
    .room { margin-bottom: 12px; }
    .room-name { font-weight: 600; }
    .device { font-family: var(--mono); font-size: 12px; color: var(--muted); margin-left: 12px; }
    .device .k { color: var(--fg); }
    .pending { color: var(--accent); }
    .event { font-family: var(--mono); font-size: 12px; padding: 4px 0; border-bottom: 1px solid var(--border); }
    .event .ts { color: var(--muted); }
    .job { padding: 8px 0; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 12px; }
    .job-label { flex: 1; }
    .job-fire-at { font-family: var(--mono); font-size: 12px; color: var(--muted); }
    button { background: var(--accent); color: #fff; border: 0; padding: 6px 12px; border-radius: 4px; cursor: pointer; font: inherit; }
    button:hover { filter: brightness(1.1); }
    button.muted { background: transparent; color: var(--muted); border: 1px solid var(--border); padding: 4px 8px; font-size: 12px; }
    input[type=text] { width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 4px; background: var(--card); color: var(--fg); font: inherit; }
    .send-row { display: flex; gap: 8px; margin-top: 8px; }
    .send-row input { flex: 1; }
    .response { margin-top: 12px; padding: 12px; background: var(--bg); border-radius: 4px; font-family: var(--mono); font-size: 13px; white-space: pre-wrap; }
    .response.error { color: var(--accent); }
    .empty { color: var(--muted); font-style: italic; }
  </style>
</head>
<body>
  <h1>Home Brain</h1>
  <p style="color: var(--muted); margin-top: 0;">Diagnostic dashboard — auto-refresh every 2s.</p>

  <h2>Send a message</h2>
  <div class="card">
    <div class="send-row">
      <input id="msg-input" type="text" placeholder="e.g. pause music in the living room" autocomplete="off" />
      <button id="msg-send">Send</button>
    </div>
    <div id="msg-response" class="response" style="display:none"></div>
  </div>

  <div class="grid">
    <div>
      <h2>World state</h2>
      <div id="world" class="card"><div class="empty">loading…</div></div>
    </div>
    <div>
      <h2>Scheduled jobs</h2>
      <div id="schedule" class="card"><div class="empty">loading…</div></div>
      <h2>Recent events</h2>
      <div id="events" class="card"><div class="empty">loading…</div></div>
    </div>
  </div>

  <script>
    const $ = (id) => document.getElementById(id);

    function fmt(v) {
      if (v === null || v === undefined) return '—';
      if (typeof v === 'boolean') return v ? '✓' : '✗';
      if (typeof v === 'object') return JSON.stringify(v);
      return String(v);
    }

    async function renderWorld() {
      try {
        const r = await fetch('/world');
        const data = await r.json();
        const rooms = Object.keys(data).sort();
        if (rooms.length === 0) {
          $('world').innerHTML = '<div class="empty">no devices reporting state yet</div>';
          return;
        }
        $('world').innerHTML = rooms.map((r) => {
          const devs = Object.entries(data[r]).map(([d, m]) => {
            const pending = m.pending ? ' <span class="pending">[pending]</span>' : '';
            const kvs = Object.entries(m.state || {}).map(([k, v]) => '<span class="k">' + k + '</span>=' + fmt(v)).join(' ');
            return '<div class="device">' + d + ': ' + kvs + pending + '</div>';
          }).join('');
          return '<div class="room"><div class="room-name">' + r + '</div>' + devs + '</div>';
        }).join('');
      } catch (err) {
        $('world').innerHTML = '<div class="empty">world fetch failed: ' + err.message + '</div>';
      }
    }

    async function renderSchedule() {
      try {
        const r = await fetch('/schedule');
        const jobs = (await r.json()).jobs;
        if (jobs.length === 0) {
          $('schedule').innerHTML = '<div class="empty">no pending jobs</div>';
          return;
        }
        $('schedule').innerHTML = jobs.map((j) => {
          const label = j.label || j.actions.map((a) => a.tool).join(' + ');
          return '<div class="job"><div class="job-label">' + label + '<div class="job-fire-at">' + j.fireAt + '</div></div>' +
            '<button class="muted" onclick="cancelJob(\'' + j.id + '\')">Cancel</button></div>';
        }).join('');
      } catch (err) {
        $('schedule').innerHTML = '<div class="empty">schedule fetch failed: ' + err.message + '</div>';
      }
    }

    async function renderEvents() {
      try {
        const r = await fetch('/events?limit=30');
        const events = (await r.json()).events;
        if (events.length === 0) {
          $('events').innerHTML = '<div class="empty">no events yet</div>';
          return;
        }
        $('events').innerHTML = events.map((e) => {
          const ts = new Date(e.ts).toLocaleTimeString();
          return '<div class="event"><span class="ts">' + ts + '</span> ' + e.kind + ' ' + JSON.stringify(e.payload) + '</div>';
        }).join('');
      } catch (err) {
        $('events').innerHTML = '<div class="empty">events fetch failed: ' + err.message + '</div>';
      }
    }

    window.cancelJob = async function (id) {
      await fetch('/schedule/' + id + '/cancel', { method: 'POST' });
      renderSchedule();
    };

    $('msg-send').addEventListener('click', sendMessage);
    $('msg-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });

    async function sendMessage() {
      const text = $('msg-input').value.trim();
      if (!text) return;
      $('msg-response').style.display = 'block';
      $('msg-response').className = 'response';
      $('msg-response').textContent = 'sending…';
      try {
        const r = await fetch('/message', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        const data = await r.json();
        $('msg-response').className = 'response' + (data.ok ? '' : ' error');
        $('msg-response').textContent = data.response + '\n\n[' + data.route + ', ' + data.latencyMs + 'ms]';
        $('msg-input').value = '';
        renderWorld();
        renderEvents();
        renderSchedule();
      } catch (err) {
        $('msg-response').className = 'response error';
        $('msg-response').textContent = 'error: ' + err.message;
      }
    }

    renderWorld(); renderSchedule(); renderEvents();
    setInterval(() => { renderWorld(); renderSchedule(); renderEvents(); }, 2000);
  </script>
</body>
</html>`;
