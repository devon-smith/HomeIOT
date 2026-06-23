/**
 * Home Brain dashboard. Single-file HTML+CSS+JS (no build step). Hits
 * /house, /world, /events, /schedule, /message on the same origin.
 *
 * Layout (top to bottom):
 *   - Hero: title + natural-language input + response area
 *   - Quick actions: one-tap scene shortcuts from preferences.quick_actions
 *   - Rooms: live state cards with inline controls per device kind
 *   - Right rail: scheduled jobs + recent events feed
 *
 * Auto-refreshes world/events/schedule every 2s. Quick actions and inline
 * controls all route through POST /message so the LLM/fast-path stay in
 * the loop (no direct MQTT from the browser).
 */

export const DASHBOARD_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="theme-color" content="#1f1d1a" />
  <title>Home Brain</title>
  <style>
    :root {
      --bg: #f4f1ea;
      --fg: #2a2a2a;
      --muted: #7a7470;
      --card: #fff;
      --card-2: #fbf8f1;
      --accent: #c8623a;
      --accent-soft: #e8d2c6;
      --good: #4a8c5a;
      --warn: #b88a2a;
      --border: #e3ddd1;
      --shadow: 0 1px 2px rgba(0,0,0,0.04);
      --mono: ui-monospace, "JetBrains Mono", Menlo, Monaco, Consolas, monospace;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #15140f;
        --fg: #ece8df;
        --muted: #8a847d;
        --card: #221f1a;
        --card-2: #1c1a16;
        --border: #34302a;
        --accent-soft: #4a2e22;
        --shadow: 0 1px 2px rgba(0,0,0,0.4);
      }
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font: 14px/1.5 -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
      background: var(--bg); color: var(--fg);
      padding: 20px;
      max-width: 1400px;
      margin-inline: auto;
    }
    h1 { font: 400 italic 28px Georgia, serif; margin: 0; }
    .subtitle { color: var(--muted); margin: 4px 0 24px; font-size: 13px; }
    h2 {
      font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em;
      color: var(--muted); margin: 28px 0 10px; font-weight: 600;
    }

    /* Hero / input */
    .hero { margin-bottom: 8px; }
    .send-row { display: flex; gap: 8px; }
    input[type=text] {
      flex: 1; padding: 12px 16px; border-radius: 8px;
      border: 1px solid var(--border); background: var(--card); color: var(--fg);
      font: inherit; font-size: 15px;
      box-shadow: var(--shadow);
    }
    input[type=text]:focus { outline: 2px solid var(--accent-soft); }
    button {
      background: var(--accent); color: #fff; border: 0; padding: 12px 18px;
      border-radius: 8px; cursor: pointer; font: inherit; font-weight: 500;
      box-shadow: var(--shadow);
    }
    button:hover:not(:disabled) { filter: brightness(1.08); }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-ghost {
      background: var(--card); color: var(--fg); border: 1px solid var(--border);
      padding: 8px 12px; font-size: 13px; font-weight: 400;
    }
    .btn-icon {
      padding: 6px 10px; font-size: 12px; min-width: 32px;
      background: var(--card-2); color: var(--fg); border: 1px solid var(--border);
    }
    .btn-icon:hover:not(:disabled) { background: var(--accent-soft); }

    .response {
      margin-top: 12px; padding: 12px 14px;
      background: var(--card); border: 1px solid var(--border); border-radius: 8px;
      font-size: 14px; white-space: pre-wrap;
      box-shadow: var(--shadow);
    }
    .response.error { border-color: var(--accent); }
    .response .meta {
      display: block; margin-top: 6px; color: var(--muted);
      font-family: var(--mono); font-size: 11px;
    }

    /* Quick actions row */
    .quick-row { display: flex; flex-wrap: wrap; gap: 8px; }
    .quick-row .btn-ghost { display: inline-flex; align-items: center; gap: 6px; }
    .quick-row .icon { font-size: 16px; }

    /* Main grid: rooms (left) + side rail (right) */
    .main-grid {
      display: grid;
      grid-template-columns: 1fr 320px;
      gap: 20px;
      align-items: start;
    }
    @media (max-width: 980px) { .main-grid { grid-template-columns: 1fr; } }

    /* Room cards */
    .rooms {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 12px;
    }
    .room {
      background: var(--card); border: 1px solid var(--border); border-radius: 10px;
      padding: 14px; box-shadow: var(--shadow);
      display: flex; flex-direction: column; gap: 8px;
    }
    .room-head {
      display: flex; align-items: baseline; justify-content: space-between;
      gap: 8px;
    }
    .room-name { font-weight: 600; font-size: 15px; }
    .room-tags { font-family: var(--mono); font-size: 10px; color: var(--muted); }
    .device-row {
      display: flex; align-items: center; gap: 8px;
      padding: 6px 0; border-top: 1px solid var(--border);
    }
    .device-row:first-of-type { border-top: 0; }
    .device-icon { font-size: 18px; width: 22px; text-align: center; }
    .device-meta {
      flex: 1; min-width: 0;
      display: flex; flex-direction: column; gap: 1px;
    }
    .device-title { font-weight: 500; font-size: 13px; }
    .device-detail {
      font-family: var(--mono); font-size: 11px; color: var(--muted);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .device-controls { display: flex; gap: 4px; flex-shrink: 0; }
    .pending { color: var(--accent); font-style: italic; }
    .offline { color: var(--muted); }
    .on { color: var(--good); }

    /* Right rail */
    .rail { display: flex; flex-direction: column; gap: 16px; }
    .rail-card {
      background: var(--card); border: 1px solid var(--border); border-radius: 10px;
      padding: 12px 14px; box-shadow: var(--shadow);
    }
    .rail-card h3 {
      font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em;
      color: var(--muted); margin: 0 0 8px; font-weight: 600;
    }
    .job, .event {
      padding: 6px 0; border-top: 1px solid var(--border);
      font-size: 12px;
    }
    .job:first-of-type, .event:first-of-type { border-top: 0; }
    .job { display: flex; align-items: center; gap: 8px; }
    .job-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    .job-fire-at { color: var(--muted); font-family: var(--mono); font-size: 11px; }
    .event-row { display: flex; gap: 6px; align-items: baseline; font-family: var(--mono); font-size: 11px; }
    .event-row .ts { color: var(--muted); flex-shrink: 0; }
    .event-row .kind { color: var(--accent); flex-shrink: 0; }
    .event-row .payload { color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex: 1; }
    .empty { color: var(--muted); font-style: italic; font-size: 12px; padding: 4px 0; }

    /* Refresh indicator */
    .live { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--good); margin-right: 4px; animation: pulse 2s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
  </style>
</head>
<body>
  <h1>Home Brain</h1>
  <p class="subtitle"><span class="live"></span>live · auto-refresh every 2s</p>

  <div class="hero">
    <div class="send-row">
      <input id="msg-input" type="text" placeholder="say anything — 'play smooth jazz in the kitchen', 'set upstairs to 70', 'movie night'" autocomplete="off" autofocus />
      <button id="msg-send">Send</button>
    </div>
    <div id="msg-response" class="response" style="display:none"></div>
  </div>

  <h2>Quick actions</h2>
  <div id="quick-row" class="quick-row"><span class="empty">loading…</span></div>

  <div class="main-grid">
    <div>
      <h2>Rooms</h2>
      <div id="rooms" class="rooms"><div class="empty">loading…</div></div>
    </div>
    <div class="rail">
      <div class="rail-card">
        <h3>Scheduled</h3>
        <div id="schedule"><div class="empty">no pending jobs</div></div>
      </div>
      <div class="rail-card">
        <h3>Recent events</h3>
        <div id="events"><div class="empty">no events yet</div></div>
      </div>
    </div>
  </div>

<script>
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[c]);

let HOUSE = null;     // /house response
let WORLD = {};       // /world response (rooms with reported state)
let LAST_RESPONSE_TS = 0;

// ----- icons per device kind -----
const ICONS = {
  music: "🎵",
  lights: "💡",
  skylight: "🌤",
  av: "📺",
  tv: "📺",
  hot_tub: "🛁",
  pool: "🏊",
  hvac_upstairs: "🌡",
  hvac_downstairs: "🌡",
};
const iconFor = (device) => ICONS[device] ?? (device.startsWith("hvac") ? "🌡" : "•");

// ----- send command -----
async function send(text) {
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
    LAST_RESPONSE_TS = Date.now();
    $('msg-response').className = 'response' + (data.ok ? '' : ' error');
    $('msg-response').innerHTML = esc(data.response) + '<span class="meta">' + esc(data.route) + ' · ' + data.latencyMs + 'ms · ' + (data.toolCalls?.length ?? 0) + ' tool call(s)</span>';
    refresh();
  } catch (err) {
    $('msg-response').className = 'response error';
    $('msg-response').textContent = 'error: ' + err.message;
  }
}

async function sendMessage() {
  const text = $('msg-input').value.trim();
  if (!text) return;
  $('msg-input').value = '';
  await send(text);
}

window.cancelJob = async function (id) {
  await fetch('/schedule/' + id + '/cancel', { method: 'POST' });
  renderSchedule();
};

window.quickSend = (text) => send(text);

// ----- render quick actions -----
function renderQuick() {
  const qa = HOUSE?.quick_actions ?? [];
  if (!qa.length) {
    $('quick-row').innerHTML = '<span class="empty">configure quick actions under preferences.quick_actions in house.yaml</span>';
    return;
  }
  $('quick-row').innerHTML = qa.map(a => {
    const icon = a.icon ? '<span class="icon">' + esc(a.icon) + '</span>' : '';
    return '<button class="btn-ghost" onclick="quickSend(' + JSON.stringify(a.message).replace(/"/g, '&quot;') + ')">' + icon + esc(a.label) + '</button>';
  }).join('');
}

// ----- render room cards -----
function renderRooms() {
  if (!HOUSE) return;
  const slugs = Object.keys(HOUSE.rooms).sort();
  if (!slugs.length) { $('rooms').innerHTML = '<div class="empty">no rooms configured</div>'; return; }
  $('rooms').innerHTML = slugs.map(slug => {
    const room = HOUSE.rooms[slug];
    const state = WORLD[slug] || {};
    const deviceRows = room.devices.map(d => renderDevice(slug, d, state[d])).filter(Boolean).join('');
    if (!deviceRows) return ''; // skip empty rooms
    return '<div class="room">' +
      '<div class="room-head">' +
        '<div class="room-name">' + esc(room.label) + '</div>' +
        '<div class="room-tags">' + room.devices.length + ' device' + (room.devices.length===1?'':'s') + '</div>' +
      '</div>' + deviceRows +
    '</div>';
  }).filter(Boolean).join('');
}

function renderDevice(roomSlug, device, msg) {
  const icon = iconFor(device);
  const state = msg?.state ?? {};
  const offline = msg && msg.online === false;
  const pending = msg?.pending;

  let detail = '';
  let title = device.replace(/_/g, ' ');
  let controls = '';
  const pretty = roomSlug.replace(/_/g, ' ');

  if (device === 'music') {
    const playing = state.playState === 'PLAYING' || state.playing === true;
    const track = state.track || state.title;
    const artist = state.artist;
    const volume = state.volume;
    title = playing ? 'Playing' : (track ? 'Paused' : 'Music');
    if (track) detail = (artist ? artist + ' · ' : '') + track;
    else if (volume !== undefined) detail = 'volume ' + volume + '%';
    else detail = '—';
    controls =
      '<button class="btn-icon" title="play/pause" onclick="quickSend(' + JSON.stringify((playing ? 'pause' : 'resume') + ' music in the ' + pretty) + ')">' + (playing ? '⏸' : '▶') + '</button>' +
      '<button class="btn-icon" title="volume down" onclick="quickSend(' + JSON.stringify('lower the ' + pretty + ' music volume by 10') + ')">−</button>' +
      '<button class="btn-icon" title="volume up" onclick="quickSend(' + JSON.stringify('raise the ' + pretty + ' music volume by 10') + ')">+</button>';
  } else if (device === 'lights') {
    const on = state.on;
    const brightness = state.brightness;
    title = on ? 'Lights' : 'Lights';
    detail = on ? (brightness !== undefined ? brightness + '%' : 'on') : 'off';
    controls =
      '<button class="btn-icon" title="off" onclick="quickSend(' + JSON.stringify('turn off the ' + pretty + ' lights') + ')">off</button>' +
      '<button class="btn-icon" title="dim" onclick="quickSend(' + JSON.stringify('dim the ' + pretty + ' lights to 30') + ')">30%</button>' +
      '<button class="btn-icon" title="on" onclick="quickSend(' + JSON.stringify('turn on the ' + pretty + ' lights') + ')">on</button>';
  } else if (device === 'skylight') {
    const open = state.open;
    title = 'Skylight';
    detail = open ? 'open' : 'closed';
    controls =
      '<button class="btn-icon" onclick="quickSend(' + JSON.stringify('close the ' + pretty + ' skylight') + ')">close</button>' +
      '<button class="btn-icon" onclick="quickSend(' + JSON.stringify('open the ' + pretty + ' skylight') + ')">open</button>';
  } else if (device === 'av') {
    const src = state.current_source;
    const power = state.power;
    title = power ? 'AV — ' + (src || 'on') : 'AV';
    detail = power ? (state.volume !== undefined ? 'vol ' + state.volume : 'on') : 'off';
    controls = power
      ? '<button class="btn-icon" onclick="quickSend(' + JSON.stringify('turn off the ' + pretty) + ')">off</button>'
      : '<button class="btn-icon" onclick="quickSend(' + JSON.stringify('watch apple tv in the ' + pretty) + ')">ATV</button>';
  } else if (device.startsWith('hvac_') || device === 'climate') {
    const cur = state.current_f;
    const heat = state.heat_setpoint_f;
    const cool = state.cool_setpoint_f;
    const mode = state.mode;
    title = device.startsWith('hvac_') ? device.replace('hvac_', '').replace(/_/g, ' ') + ' HVAC' : 'Climate';
    detail = cur !== undefined && cur !== null
      ? cur + '° (set ' + (heat ?? '—') + '/' + (cool ?? '—') + ', ' + (mode || '?') + ')'
      : (mode || '—');
    controls =
      '<button class="btn-icon" title="cooler" onclick="quickSend(' + JSON.stringify('lower the ' + pretty + ' temperature by 2') + ')">−</button>' +
      '<button class="btn-icon" title="warmer" onclick="quickSend(' + JSON.stringify('raise the ' + pretty + ' temperature by 2') + ')">+</button>';
  } else if (device === 'hot_tub' || device === 'pool') {
    const cur = state.current_f;
    const target = state.target_f;
    const mode = state.mode;
    title = device === 'hot_tub' ? 'Hot tub' : 'Pool';
    detail = cur !== undefined ? cur + '° → ' + (target ?? '—') + '° · ' + (mode || 'off') : (mode || '—');
    controls =
      '<button class="btn-icon" onclick="quickSend(' + JSON.stringify('turn the ' + (device === 'hot_tub' ? 'hot tub' : 'pool') + ' off') + ')">off</button>' +
      '<button class="btn-icon" onclick="quickSend(' + JSON.stringify('warm the ' + (device === 'hot_tub' ? 'hot tub to 102' : 'pool to 85')) + ')">warm</button>';
  } else if (device === 'tv') {
    const on = state.on;
    title = 'TV';
    detail = on ? (state.app || state.input || 'on') : 'off';
    controls = on
      ? '<button class="btn-icon" onclick="quickSend(' + JSON.stringify('turn off the ' + pretty + ' tv') + ')">off</button>'
      : '<button class="btn-icon" onclick="quickSend(' + JSON.stringify('turn on the ' + pretty + ' tv') + ')">on</button>';
  } else {
    // generic fallback — just show first few state keys
    const kvs = Object.entries(state).slice(0, 3).map(([k,v]) => k + '=' + JSON.stringify(v)).join(' ');
    detail = kvs || '—';
  }

  const statusClass = offline ? 'offline' : (pending ? 'pending' : '');
  const statusBadge = pending ? ' <span class="pending">[pending]</span>' : (offline ? ' <span class="offline">[offline]</span>' : '');

  return '<div class="device-row">' +
    '<div class="device-icon">' + icon + '</div>' +
    '<div class="device-meta">' +
      '<div class="device-title ' + statusClass + '">' + esc(title) + statusBadge + '</div>' +
      '<div class="device-detail">' + esc(detail) + '</div>' +
    '</div>' +
    '<div class="device-controls">' + controls + '</div>' +
  '</div>';
}

// ----- right rail -----
async function renderSchedule() {
  try {
    const r = await fetch('/schedule');
    const { jobs } = await r.json();
    if (!jobs.length) { $('schedule').innerHTML = '<div class="empty">no pending jobs</div>'; return; }
    $('schedule').innerHTML = jobs.map(j => {
      const label = j.label || j.actions.map(a => a.tool).join(' + ');
      const when = new Date(j.fireAt);
      const local = when.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      return '<div class="job">' +
        '<div class="job-label">' + esc(label) + '<div class="job-fire-at">' + esc(local) + '</div></div>' +
        '<button class="btn-icon" onclick="cancelJob(' + JSON.stringify(j.id) + ')">×</button>' +
      '</div>';
    }).join('');
  } catch (err) {
    $('schedule').innerHTML = '<div class="empty">schedule fetch failed</div>';
  }
}

async function renderEvents() {
  try {
    const r = await fetch('/events?limit=20');
    const { events } = await r.json();
    if (!events.length) { $('events').innerHTML = '<div class="empty">no events yet</div>'; return; }
    $('events').innerHTML = events.map(e => {
      const ts = new Date(e.ts).toLocaleTimeString([], { hour12: false });
      // compact payload — first 60 chars only
      let payload = '';
      if (e.payload && typeof e.payload === 'object') {
        const state = e.payload.state;
        if (state && typeof state === 'object') {
          payload = Object.entries(state).slice(0,3).map(([k,v]) => k+'=' + (typeof v === 'object' ? JSON.stringify(v) : v)).join(' ');
        } else {
          payload = JSON.stringify(e.payload);
        }
      } else {
        payload = String(e.payload ?? '');
      }
      if (payload.length > 80) payload = payload.slice(0, 77) + '…';
      return '<div class="event"><div class="event-row">' +
        '<span class="ts">' + ts + '</span>' +
        '<span class="kind">' + esc(e.kind) + '</span>' +
        '<span class="payload">' + esc(payload) + '</span>' +
      '</div></div>';
    }).join('');
  } catch (err) {
    $('events').innerHTML = '<div class="empty">events fetch failed</div>';
  }
}

async function refresh() {
  try {
    const w = await fetch('/world');
    WORLD = await w.json();
    renderRooms();
  } catch {}
  renderSchedule();
  renderEvents();
}

async function init() {
  try {
    const r = await fetch('/house');
    HOUSE = await r.json();
    renderQuick();
  } catch (err) {
    $('quick-row').innerHTML = '<span class="empty">house fetch failed: ' + esc(err.message) + '</span>';
  }
  refresh();
}

$('msg-send').addEventListener('click', sendMessage);
$('msg-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });

init();
setInterval(refresh, 2000);
</script>
</body>
</html>`;
