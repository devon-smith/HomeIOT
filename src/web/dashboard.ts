/**
 * Home Brain dashboard — single-file HTML+CSS+JS, no build step, no framework.
 *
 * Features:
 *   - PWA-installable (manifest at /manifest.webmanifest, sw at /sw.js)
 *   - Status hero line summarising the house at a glance
 *   - Voice input (Web Speech API on supporting browsers)
 *   - Light/Dark/System theme toggle (persisted in localStorage)
 *   - Per-room cards with inline buttons + sliders (lights/volume/temp)
 *   - Per-room detail sheet (tap card title) with full controls
 *   - Optimistic UI: tap shows the predicted state instantly, reconciles
 *     when /world refreshes
 *   - Toast notifications when scheduled jobs fire
 *   - Pull-to-refresh on mobile
 *   - Bottom nav on mobile (Rooms / Activity / Quick)
 *   - 44px+ touch targets, system font, careful color contrast
 *
 * All commands flow through POST /message so the fast-path / LLM stay in
 * the loop — the browser never publishes MQTT directly.
 */

export const DASHBOARD_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="Brain" />
  <meta name="theme-color" content="#c8623a" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <link rel="icon" type="image/svg+xml" href="/icon.svg" />
  <link rel="apple-touch-icon" href="/icon.svg" />
  <title>Home Brain</title>
  <style>
    :root {
      --bg: #f4f1ea;
      --fg: #2a2a2a;
      --muted: #7a7470;
      --card: #fff;
      --card-2: #fbf8f1;
      --accent: #c8623a;
      --accent-soft: #f0d9ce;
      --good: #4a8c5a;
      --warn: #b88a2a;
      --bad: #c54545;
      --border: #e3ddd1;
      --shadow: 0 1px 3px rgba(0,0,0,0.06);
      --shadow-lg: 0 8px 32px rgba(0,0,0,0.18);
      --warm-tint: #fff6e8;
      --cool-tint: #e7f0f7;
      --mono: ui-monospace, "JetBrains Mono", Menlo, Monaco, Consolas, monospace;
      --safe-bottom: env(safe-area-inset-bottom, 0);
    }
    html.theme-dark {
      --bg: #15140f;
      --fg: #ece8df;
      --muted: #8a847d;
      --card: #221f1a;
      --card-2: #1c1a16;
      --border: #34302a;
      --accent-soft: #4a2e22;
      --shadow: 0 1px 3px rgba(0,0,0,0.4);
      --shadow-lg: 0 12px 40px rgba(0,0,0,0.6);
      --warm-tint: #2a1f10;
      --cool-tint: #102028;
    }
    @media (prefers-color-scheme: dark) {
      html.theme-system {
        --bg: #15140f;
        --fg: #ece8df;
        --muted: #8a847d;
        --card: #221f1a;
        --card-2: #1c1a16;
        --border: #34302a;
        --accent-soft: #4a2e22;
        --shadow: 0 1px 3px rgba(0,0,0,0.4);
        --shadow-lg: 0 12px 40px rgba(0,0,0,0.6);
        --warm-tint: #2a1f10;
        --cool-tint: #102028;
      }
    }
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    html, body { margin: 0; padding: 0; height: 100%; }
    body {
      font: 14px/1.5 -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
      background: var(--bg); color: var(--fg);
      min-height: 100%;
      padding-bottom: calc(72px + var(--safe-bottom));
      overscroll-behavior-y: contain;
    }
    @media (min-width: 760px) {
      body { padding-bottom: 24px; }
    }
    .container {
      max-width: 1400px;
      margin-inline: auto;
      padding: 20px 20px 0;
    }

    /* Header */
    header { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 6px; }
    h1 { font: 400 italic 26px Georgia, serif; margin: 0; }
    .header-actions { display: flex; gap: 6px; align-items: center; }
    .theme-btn {
      background: transparent; border: 1px solid var(--border); padding: 6px 10px;
      border-radius: 8px; cursor: pointer; font: inherit; color: var(--fg);
      font-size: 13px;
    }
    .live-dot {
      display: inline-block; width: 6px; height: 6px; border-radius: 50%;
      background: var(--good); margin-right: 4px; vertical-align: middle;
      animation: pulse 2s infinite;
    }
    @keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }

    /* Status hero */
    .hero-status {
      font-size: 14px; color: var(--muted); margin: 0 0 16px;
      min-height: 20px;
    }

    /* Input */
    .input-card {
      background: var(--card); border: 1px solid var(--border); border-radius: 12px;
      padding: 8px; margin-bottom: 12px; box-shadow: var(--shadow);
      display: flex; gap: 6px; align-items: center;
    }
    input[type=text] {
      flex: 1; padding: 12px 14px; border-radius: 8px; min-height: 44px;
      border: 0; background: transparent; color: var(--fg);
      font: inherit; font-size: 16px;  /* 16px = no iOS zoom on focus */
      outline: none;
    }
    .mic-btn, .send-btn {
      min-width: 44px; min-height: 44px;
      border-radius: 8px; cursor: pointer; font: inherit; font-size: 15px;
      display: inline-flex; align-items: center; justify-content: center;
      transition: filter 0.15s, transform 0.1s;
    }
    .mic-btn { background: var(--card-2); color: var(--fg); border: 1px solid var(--border); }
    .mic-btn:hover { filter: brightness(1.05); }
    .mic-btn.listening { background: var(--bad); color: #fff; border-color: var(--bad); animation: pulse 1.2s infinite; }
    .send-btn { background: var(--accent); color: #fff; border: 0; padding: 0 18px; font-weight: 500; }
    .send-btn:hover:not(:disabled) { filter: brightness(1.08); }
    .send-btn:active { transform: scale(0.97); }
    .send-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .response {
      margin: 0 0 16px; padding: 14px 16px;
      background: var(--card); border: 1px solid var(--border); border-radius: 12px;
      font-size: 14px; white-space: pre-wrap; box-shadow: var(--shadow);
      display: none;
    }
    .response.show { display: block; animation: slideDown 0.25s ease-out; }
    .response.error { border-color: var(--accent); }
    .response .meta {
      display: block; margin-top: 8px; color: var(--muted);
      font-family: var(--mono); font-size: 11px;
    }
    @keyframes slideDown { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }

    /* Section header */
    h2 {
      font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em;
      color: var(--muted); margin: 24px 0 10px; font-weight: 600;
    }

    /* Quick actions */
    .quick-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
    .quick-btn {
      background: var(--card); color: var(--fg); border: 1px solid var(--border);
      padding: 10px 14px; min-height: 44px; border-radius: 10px; cursor: pointer;
      font: inherit; font-size: 13px;
      display: inline-flex; align-items: center; gap: 6px;
      transition: background 0.15s, transform 0.1s;
    }
    .quick-btn:hover { background: var(--accent-soft); }
    .quick-btn:active { transform: scale(0.97); }
    .quick-btn .icon { font-size: 17px; }

    /* Main layout */
    .main-grid {
      display: grid; grid-template-columns: 1fr 320px; gap: 20px; align-items: start;
    }
    @media (max-width: 980px) { .main-grid { grid-template-columns: 1fr; } }

    /* Room grid */
    .rooms {
      display: grid; gap: 12px;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    }
    .room {
      background: var(--card); border: 1px solid var(--border); border-radius: 14px;
      padding: 14px; box-shadow: var(--shadow);
      display: flex; flex-direction: column; gap: 6px;
      cursor: pointer; transition: box-shadow 0.2s, border-color 0.2s;
    }
    .room:hover { border-color: var(--accent-soft); box-shadow: var(--shadow-lg); }
    .room.has-warm { background: linear-gradient(180deg, var(--warm-tint) 0%, var(--card) 100%); }
    .room.has-cool { background: linear-gradient(180deg, var(--cool-tint) 0%, var(--card) 100%); }
    .room-head {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      margin-bottom: 4px;
    }
    .room-name { font-weight: 600; font-size: 15px; }
    .room-tags { font-family: var(--mono); font-size: 10px; color: var(--muted); }
    .device-row {
      display: flex; align-items: center; gap: 10px; padding: 6px 0;
      border-top: 1px solid var(--border);
    }
    .device-row:first-of-type { border-top: 0; }
    .device-icon { font-size: 18px; width: 22px; text-align: center; flex-shrink: 0; }
    .device-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
    .device-title { font-weight: 500; font-size: 13px; }
    .device-title.on { color: var(--good); }
    .device-detail {
      font-family: var(--mono); font-size: 11px; color: var(--muted);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .device-controls { display: flex; gap: 4px; flex-shrink: 0; }
    .btn-icon {
      min-width: 36px; min-height: 36px; padding: 0 8px;
      background: var(--card-2); color: var(--fg); border: 1px solid var(--border);
      border-radius: 8px; cursor: pointer; font: inherit; font-size: 12px;
      display: inline-flex; align-items: center; justify-content: center;
      transition: background 0.15s, transform 0.1s;
    }
    .btn-icon:hover { background: var(--accent-soft); }
    .btn-icon:active { transform: scale(0.92); }
    .btn-icon.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
    .pending { color: var(--accent); font-style: italic; }
    .offline { color: var(--muted); opacity: 0.6; }

    /* Right rail */
    .rail { display: flex; flex-direction: column; gap: 12px; }
    .rail-card {
      background: var(--card); border: 1px solid var(--border); border-radius: 12px;
      padding: 12px 14px; box-shadow: var(--shadow);
    }
    .rail-card h3 {
      font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em;
      color: var(--muted); margin: 0 0 8px; font-weight: 600;
    }
    .job, .event { padding: 8px 0; border-top: 1px solid var(--border); font-size: 12px; }
    .job:first-of-type, .event:first-of-type { border-top: 0; padding-top: 0; }
    .job { display: flex; align-items: center; gap: 8px; }
    .job-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    .job-fire-at { color: var(--muted); font-family: var(--mono); font-size: 11px; }
    .event-row { display: flex; gap: 6px; align-items: baseline; font-family: var(--mono); font-size: 11px; }
    .event-row .ts { color: var(--muted); flex-shrink: 0; }
    .event-row .kind { color: var(--accent); flex-shrink: 0; }
    .event-row .payload { color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex: 1; }
    .empty { color: var(--muted); font-style: italic; font-size: 12px; padding: 4px 0; }
    .badge {
      display: inline-block; padding: 1px 6px; margin-left: 6px;
      background: var(--accent-soft); color: var(--accent);
      border-radius: 4px; font-size: 10px; text-transform: uppercase;
      letter-spacing: 0.05em; font-weight: 600; vertical-align: middle;
    }

    /* Bottom nav (mobile only) */
    .bottom-nav {
      display: none;
      position: fixed; bottom: 0; left: 0; right: 0;
      background: var(--card); border-top: 1px solid var(--border);
      padding: 6px 4px calc(6px + var(--safe-bottom));
      justify-content: space-around; z-index: 50;
      box-shadow: 0 -4px 12px rgba(0,0,0,0.06);
    }
    @media (max-width: 760px) { .bottom-nav { display: flex; } }
    .nav-btn {
      background: transparent; border: 0; color: var(--muted);
      font: inherit; font-size: 10px; cursor: pointer; padding: 6px 12px;
      display: flex; flex-direction: column; align-items: center; gap: 2px;
      min-height: 44px; min-width: 56px; border-radius: 8px;
    }
    .nav-btn.active { color: var(--accent); }
    .nav-btn .icon { font-size: 20px; }

    .section { display: none; }
    .section.active { display: block; }
    /* On desktop always show all sections */
    @media (min-width: 761px) { .section { display: block !important; } }

    /* Room detail sheet */
    .sheet-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,0.5);
      z-index: 100; opacity: 0; pointer-events: none; transition: opacity 0.2s;
    }
    .sheet-backdrop.show { opacity: 1; pointer-events: auto; }
    .sheet {
      position: fixed; left: 0; right: 0; bottom: 0;
      background: var(--card); border-radius: 16px 16px 0 0; z-index: 101;
      padding: 20px 20px calc(20px + var(--safe-bottom));
      max-height: 85vh; overflow-y: auto;
      transform: translateY(100%); transition: transform 0.25s ease-out;
      box-shadow: var(--shadow-lg);
    }
    .sheet.show { transform: translateY(0); }
    @media (min-width: 761px) {
      .sheet {
        left: 50%; right: auto; top: 50%; bottom: auto;
        transform: translate(-50%, -45%) scale(0.96);
        width: 480px; max-width: 90vw; border-radius: 16px;
        max-height: 80vh;
      }
      .sheet.show { transform: translate(-50%, -50%) scale(1); }
    }
    .sheet-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    .sheet-title { font: 400 italic 20px Georgia, serif; margin: 0; }
    .sheet-close {
      background: transparent; border: 0; font-size: 24px; cursor: pointer;
      color: var(--muted); min-width: 44px; min-height: 44px;
    }
    .sheet .device-detail-block {
      padding: 12px 0; border-bottom: 1px solid var(--border);
    }
    .sheet .device-detail-block:last-child { border-bottom: 0; }
    .slider-row { display: flex; align-items: center; gap: 12px; margin-top: 8px; }
    .slider-row label { font-size: 12px; color: var(--muted); min-width: 60px; }
    .slider-row .val { font-family: var(--mono); font-size: 13px; min-width: 36px; text-align: right; }
    input[type=range] {
      flex: 1; height: 32px; cursor: pointer;
      -webkit-appearance: none; appearance: none;
      background: transparent;
    }
    input[type=range]::-webkit-slider-runnable-track { height: 4px; background: var(--border); border-radius: 2px; }
    input[type=range]::-moz-range-track { height: 4px; background: var(--border); border-radius: 2px; }
    input[type=range]::-webkit-slider-thumb {
      -webkit-appearance: none; appearance: none;
      width: 24px; height: 24px; border-radius: 50%;
      background: var(--accent); border: 2px solid var(--card);
      margin-top: -10px; cursor: pointer;
    }
    input[type=range]::-moz-range-thumb {
      width: 24px; height: 24px; border-radius: 50%;
      background: var(--accent); border: 2px solid var(--card); cursor: pointer;
    }
    .source-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-top: 8px; }
    .source-btn {
      padding: 12px; min-height: 44px;
      background: var(--card-2); border: 1px solid var(--border); border-radius: 8px;
      cursor: pointer; font: inherit; font-size: 13px; color: var(--fg);
      text-transform: capitalize;
    }
    .source-btn:hover { background: var(--accent-soft); }
    .source-btn.primary { background: var(--accent); color: #fff; border-color: var(--accent); }

    /* Toast */
    .toast-container {
      position: fixed; left: 0; right: 0; top: calc(env(safe-area-inset-top, 0) + 16px);
      display: flex; flex-direction: column; align-items: center; gap: 8px;
      pointer-events: none; z-index: 200;
    }
    .toast {
      background: var(--card); color: var(--fg);
      border: 1px solid var(--border); border-radius: 10px;
      padding: 12px 16px; box-shadow: var(--shadow-lg);
      font-size: 13px; max-width: 90vw;
      animation: toastIn 0.3s ease-out;
    }
    .toast.fade { animation: toastOut 0.3s ease-in forwards; }
    @keyframes toastIn { from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes toastOut { to { opacity: 0; transform: translateY(-12px); } }

    /* Pull-to-refresh */
    .ptr-indicator {
      position: fixed; top: 0; left: 50%; transform: translate(-50%, -100%);
      background: var(--card); border: 1px solid var(--border);
      border-radius: 0 0 8px 8px; padding: 6px 16px; font-size: 12px;
      color: var(--muted); transition: transform 0.2s; z-index: 30;
    }
    .ptr-indicator.show { transform: translate(-50%, 0); }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>Home Brain</h1>
        <div class="hero-status" id="hero-status"><span class="live-dot"></span>loading…</div>
      </div>
      <div class="header-actions">
        <button class="theme-btn" id="theme-btn" title="cycle theme">◐</button>
      </div>
    </header>

    <div class="input-card">
      <input id="msg-input" type="text" placeholder="say or type — 'play jazz in the kitchen', 'set upstairs to 70', 'movie night'" autocomplete="off" />
      <button class="mic-btn" id="mic-btn" title="voice (Web Speech API)">🎙</button>
      <button class="send-btn" id="msg-send">Send</button>
    </div>
    <div id="msg-response" class="response"></div>

    <section class="section active" id="section-rooms" data-section="rooms">
      <h2>Quick actions</h2>
      <div id="quick-row" class="quick-row"><span class="empty">loading…</span></div>

      <h2>Rooms</h2>
      <div id="rooms" class="rooms"><div class="empty">loading…</div></div>
    </section>

    <section class="section" id="section-activity" data-section="activity">
      <div class="main-grid" style="grid-template-columns: 1fr;">
        <div class="rail">
          <div class="rail-card">
            <h3>Scheduled jobs</h3>
            <div id="schedule"><div class="empty">no pending jobs</div></div>
          </div>
          <div class="rail-card">
            <h3>Recent events</h3>
            <div id="events"><div class="empty">no events yet</div></div>
          </div>
        </div>
      </div>
    </section>
  </div>

  <!-- desktop side rail (hidden on mobile via media query at bottom) -->
  <style>
    .desktop-rail { display: none; }
    @media (min-width: 761px) {
      .container { display: grid; grid-template-columns: 1fr 320px; gap: 20px; padding: 20px; }
      .container > header, .container > .input-card, .container > .response { grid-column: 1 / -1; }
      .desktop-rail { display: flex; flex-direction: column; gap: 12px; }
      #section-activity { display: none !important; }
    }
  </style>
  <aside class="desktop-rail">
    <div class="rail-card">
      <h3>Scheduled jobs</h3>
      <div id="schedule-desk"><div class="empty">no pending jobs</div></div>
    </div>
    <div class="rail-card">
      <h3>Recent events</h3>
      <div id="events-desk"><div class="empty">no events yet</div></div>
    </div>
  </aside>

  <nav class="bottom-nav" id="bottom-nav">
    <button class="nav-btn active" data-section="rooms"><span class="icon">🏠</span><span>Rooms</span></button>
    <button class="nav-btn" data-section="activity"><span class="icon">📋</span><span>Activity</span></button>
  </nav>

  <!-- Room detail sheet -->
  <div class="sheet-backdrop" id="sheet-backdrop"></div>
  <div class="sheet" id="sheet" role="dialog" aria-modal="true"></div>

  <!-- Toasts + PTR -->
  <div class="toast-container" id="toasts"></div>
  <div class="ptr-indicator" id="ptr">↓ pull to refresh</div>

<script>
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[c]);
const jstr = (s) => JSON.stringify(s).replace(/"/g, '&quot;');
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

// ----- state -----
let HOUSE = null;
let WORLD = {};
let SEEN_EVENT_TS = 0;  // for toast deduping
let CURRENT_SHEET = null;

// ----- theme -----
const THEMES = ['system', 'light', 'dark'];
function applyTheme(t) {
  document.documentElement.classList.remove('theme-system','theme-light','theme-dark');
  document.documentElement.classList.add('theme-' + t);
  $('theme-btn').textContent = t === 'dark' ? '🌙' : t === 'light' ? '☀' : '◐';
  $('theme-btn').title = 'theme: ' + t + ' (tap to cycle)';
}
let theme = localStorage.getItem('hb-theme') || 'system';
applyTheme(theme);
$('theme-btn').addEventListener('click', () => {
  theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
  localStorage.setItem('hb-theme', theme);
  applyTheme(theme);
});

// ----- icons per device -----
const ICONS = {
  music: '🎵', lights: '💡', skylight: '🌤', av: '📺', tv: '📺',
  hot_tub: '🛁', pool: '🏊', climate: '🌡',
};
const iconFor = (d) => ICONS[d] ?? (d.startsWith('hvac') ? '🌡' : '•');

// ----- toasts -----
function toast(msg, kind = 'info') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  $('toasts').appendChild(el);
  setTimeout(() => { el.classList.add('fade'); setTimeout(() => el.remove(), 300); }, 4000);
}

// ----- send -----
async function send(text) {
  if (!text) return;
  $('msg-response').classList.add('show');
  $('msg-response').classList.remove('error');
  $('msg-response').textContent = '…';
  try {
    const r = await fetch('/message', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const data = await r.json();
    $('msg-response').classList.toggle('error', !data.ok);
    $('msg-response').innerHTML = esc(data.response) +
      '<span class="meta">' + esc(data.route) + ' · ' + data.latencyMs + 'ms · ' + (data.toolCalls?.length ?? 0) + ' call(s)</span>';
    refresh();
  } catch (err) {
    $('msg-response').classList.add('error');
    $('msg-response').textContent = 'error: ' + err.message;
  }
}
async function sendMessage() {
  const text = $('msg-input').value.trim();
  if (!text) return;
  $('msg-input').value = '';
  await send(text);
}
window.quickSend = (text) => send(text);
window.cancelJob = async (id) => { await fetch('/schedule/' + id + '/cancel', { method: 'POST' }); renderSchedule(); };
window.snoozeJob = async (id, byMinutes) => {
  const r = await fetch('/schedule/' + id + '/snooze', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ by_minutes: byMinutes }),
  });
  if (r.ok) { toast('snoozed ' + byMinutes + ' min'); renderSchedule(); }
};

// ----- voice input (Web Speech API) -----
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SR) {
  const rec = new SR();
  rec.continuous = false; rec.interimResults = true; rec.lang = 'en-US';
  $('mic-btn').addEventListener('click', () => {
    if ($('mic-btn').classList.contains('listening')) { rec.stop(); return; }
    $('mic-btn').classList.add('listening');
    try { rec.start(); } catch {}
  });
  rec.onresult = (e) => {
    const txt = Array.from(e.results).map(r => r[0].transcript).join('');
    $('msg-input').value = txt;
    if (e.results[e.results.length-1].isFinal) { $('mic-btn').classList.remove('listening'); sendMessage(); }
  };
  rec.onerror = () => $('mic-btn').classList.remove('listening');
  rec.onend = () => $('mic-btn').classList.remove('listening');
} else {
  $('mic-btn').style.display = 'none';
}

// ----- bottom nav -----
document.querySelectorAll('.nav-btn').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    b.classList.add('active');
    $('section-' + b.dataset.section).classList.add('active');
  });
});

// ----- quick actions -----
function renderQuick() {
  const qa = HOUSE?.quick_actions ?? [];
  if (!qa.length) {
    $('quick-row').innerHTML = '<span class="empty">configure under preferences.quick_actions</span>';
    return;
  }
  $('quick-row').innerHTML = qa.map(a => {
    const icon = a.icon ? '<span class="icon">' + esc(a.icon) + '</span>' : '';
    return '<button class="quick-btn" onclick="quickSend(' + jstr(a.message) + ')">' + icon + esc(a.label) + '</button>';
  }).join('');
}

// ----- rooms -----
function renderRooms() {
  if (!HOUSE) return;
  const slugs = Object.keys(HOUSE.rooms).sort();
  if (!slugs.length) { $('rooms').innerHTML = '<div class="empty">no rooms configured</div>'; return; }
  $('rooms').innerHTML = slugs.map(slug => {
    const room = HOUSE.rooms[slug];
    const state = WORLD[slug] || {};
    const rows = room.devices.map(d => renderDevice(slug, d, state[d])).filter(Boolean).join('');
    if (!rows) return '';
    // Tint cards based on what's active.
    const hasLightsOn = state.lights?.state?.on;
    const hvacKey = Object.keys(state).find(k => k.startsWith('hvac') || k === 'climate');
    const hvac = hvacKey ? state[hvacKey]?.state : null;
    const isCooling = hvac && (hvac.hvac_state === 'cooling' || hvac.mode === 'cool');
    const tint = hasLightsOn ? ' has-warm' : (isCooling ? ' has-cool' : '');
    return '<div class="room' + tint + '" onclick="openSheet(' + jstr(slug) + ')">' +
      '<div class="room-head"><div class="room-name">' + esc(room.label) + '</div>' +
      '<div class="room-tags">' + room.devices.length + ' device' + (room.devices.length===1?'':'s') + '</div></div>' +
      rows + '</div>';
  }).filter(Boolean).join('');
}

function renderDevice(roomSlug, device, msg) {
  const icon = iconFor(device);
  const state = msg?.state ?? {};
  const offline = msg && msg.online === false;
  const pending = msg?.pending;
  const pretty = roomSlug.replace(/_/g, ' ');
  let title = device.replace(/_/g, ' '), detail = '—', controls = '', isOn = false;

  if (device === 'music') {
    const playing = state.playState === 'PLAYING' || state.playing === true;
    isOn = playing;
    title = playing ? 'Playing' : (state.track ? 'Paused' : 'Music');
    detail = state.track ? ((state.artist ? state.artist + ' · ' : '') + state.track) : ('volume ' + (state.volume ?? '—'));
    controls = stopProp(
      '<button class="btn-icon" onclick="quickSend(' + jstr((playing?'pause':'resume')+' music in the '+pretty) + ')">' + (playing?'⏸':'▶') + '</button>' +
      '<button class="btn-icon" onclick="quickSend(' + jstr('lower the '+pretty+' music volume by 10') + ')">−</button>' +
      '<button class="btn-icon" onclick="quickSend(' + jstr('raise the '+pretty+' music volume by 10') + ')">+</button>'
    );
  } else if (device === 'lights') {
    isOn = state.on;
    title = 'Lights';
    detail = state.on ? ((state.brightness ?? '?') + '%') : 'off';
    controls = stopProp(
      '<button class="btn-icon" onclick="quickSend(' + jstr('turn off the '+pretty+' lights') + ')">off</button>' +
      '<button class="btn-icon" onclick="quickSend(' + jstr('dim the '+pretty+' lights to 30') + ')">30%</button>' +
      '<button class="btn-icon primary" onclick="quickSend(' + jstr('turn on the '+pretty+' lights') + ')">on</button>'
    );
  } else if (device === 'skylight') {
    isOn = state.open;
    title = 'Skylight';
    detail = state.open ? 'open' : 'closed';
    controls = stopProp(
      '<button class="btn-icon" onclick="quickSend(' + jstr('close the '+pretty+' skylight') + ')">close</button>' +
      '<button class="btn-icon primary" onclick="quickSend(' + jstr('open the '+pretty+' skylight') + ')">open</button>'
    );
  } else if (device === 'av') {
    isOn = state.power;
    title = state.power ? 'AV — ' + (state.current_source || 'on') : 'AV';
    detail = state.power ? ('vol ' + (state.volume ?? '—')) : 'off';
    controls = stopProp(state.power
      ? '<button class="btn-icon" onclick="quickSend(' + jstr('turn off the '+pretty) + ')">off</button>'
      : '<button class="btn-icon primary" onclick="quickSend(' + jstr('watch apple tv in the '+pretty) + ')">ATV</button>');
  } else if (device.startsWith('hvac_') || device === 'climate') {
    const cur = state.current_f, heat = state.heat_setpoint_f, cool = state.cool_setpoint_f;
    isOn = (state.hvac_state === 'cooling' || state.hvac_state === 'heating');
    title = (device.replace('hvac_','').replace(/_/g,' ')) + ' HVAC';
    detail = cur != null ? (cur + '° (' + (heat ?? '—') + '/' + (cool ?? '—') + ' ' + (state.mode||'?') + ')') : (state.mode || '—');
    controls = stopProp(
      '<button class="btn-icon" onclick="quickSend(' + jstr('lower the '+pretty+' temperature by 2') + ')">−</button>' +
      '<button class="btn-icon" onclick="quickSend(' + jstr('raise the '+pretty+' temperature by 2') + ')">+</button>'
    );
  } else if (device === 'hot_tub' || device === 'pool') {
    isOn = state.mode === 'heat' || state.heater_on;
    const name = device === 'hot_tub' ? 'hot tub' : 'pool';
    title = device === 'hot_tub' ? 'Hot tub' : 'Pool';
    detail = state.current_f != null ? (state.current_f + '° → ' + (state.target_f ?? '—') + '° · ' + (state.mode || 'off')) : (state.mode || '—');
    controls = stopProp(
      '<button class="btn-icon" onclick="quickSend(' + jstr('turn the '+name+' off') + ')">off</button>' +
      '<button class="btn-icon primary" onclick="quickSend(' + jstr('warm the '+name+' to ' + (device==='hot_tub'?102:85)) + ')">warm</button>'
    );
  } else if (device === 'tv') {
    isOn = state.on;
    title = 'TV';
    detail = state.on ? (state.app || state.input || 'on') : 'off';
    controls = stopProp(state.on
      ? '<button class="btn-icon" onclick="quickSend(' + jstr('turn off the '+pretty+' tv') + ')">off</button>'
      : '<button class="btn-icon primary" onclick="quickSend(' + jstr('turn on the '+pretty+' tv') + ')">on</button>');
  }

  const cls = (offline ? 'offline' : (isOn ? 'on' : ''));
  const badge = pending ? ' <span class="pending">[pending]</span>' : (offline ? ' <span class="offline">[offline]</span>' : '');
  return '<div class="device-row">' +
    '<div class="device-icon">' + icon + '</div>' +
    '<div class="device-meta">' +
      '<div class="device-title ' + cls + '">' + esc(title) + badge + '</div>' +
      '<div class="device-detail">' + esc(detail) + '</div>' +
    '</div>' +
    '<div class="device-controls">' + controls + '</div>' +
  '</div>';
}
const stopProp = (html) => html.replaceAll('onclick="', 'onclick="event.stopPropagation();');

// ----- room detail sheet -----
window.openSheet = (slug) => {
  CURRENT_SHEET = slug;
  renderSheet();
  $('sheet').classList.add('show');
  $('sheet-backdrop').classList.add('show');
};
window.closeSheet = () => {
  CURRENT_SHEET = null;
  $('sheet').classList.remove('show');
  $('sheet-backdrop').classList.remove('show');
};
$('sheet-backdrop').addEventListener('click', closeSheet);

function renderSheet() {
  if (!CURRENT_SHEET || !HOUSE) return;
  const room = HOUSE.rooms[CURRENT_SHEET];
  if (!room) { closeSheet(); return; }
  const state = WORLD[CURRENT_SHEET] || {};
  const pretty = CURRENT_SHEET.replace(/_/g, ' ');

  const blocks = room.devices.map(d => renderSheetBlock(CURRENT_SHEET, d, state[d], pretty)).filter(Boolean).join('');
  $('sheet').innerHTML =
    '<div class="sheet-head">' +
      '<h2 class="sheet-title">' + esc(room.label) + '</h2>' +
      '<button class="sheet-close" onclick="closeSheet()">×</button>' +
    '</div>' +
    (blocks || '<div class="empty">no controllable devices in this room</div>');
}

function renderSheetBlock(slug, device, msg, pretty) {
  const state = msg?.state ?? {};
  const icon = iconFor(device);
  let title = device.replace(/_/g, ' ');
  let body = '';

  if (device === 'lights') {
    const b = state.brightness ?? 0;
    body =
      '<div class="slider-row"><label>Brightness</label>' +
      '<input type="range" min="0" max="100" value="' + b + '" oninput="document.getElementById(\'lb-' + slug + '\').textContent = this.value + \'%\'" onchange="setLightSlider(' + jstr(slug) + ', this.value)" />' +
      '<span class="val" id="lb-' + slug + '">' + b + '%</span></div>' +
      '<div class="slider-row" style="gap:6px"><label></label>' +
      '<button class="source-btn" style="flex:1" onclick="quickSend(' + jstr('turn off the ' + pretty + ' lights') + ')">Off</button>' +
      '<button class="source-btn" style="flex:1" onclick="quickSend(' + jstr('dim the ' + pretty + ' lights to 30') + ')">30%</button>' +
      '<button class="source-btn primary" style="flex:1" onclick="quickSend(' + jstr('turn on the ' + pretty + ' lights') + ')">On</button>' +
      '</div>';
  } else if (device === 'music') {
    const v = state.volume ?? 25;
    const playing = state.playState === 'PLAYING';
    body =
      '<div class="device-detail">' + esc(state.track ? ((state.artist ? state.artist + ' · ' : '') + state.track) : 'nothing playing') + '</div>' +
      '<div class="slider-row"><label>Volume</label>' +
      '<input type="range" min="0" max="100" value="' + v + '" oninput="document.getElementById(\'mv-' + slug + '\').textContent = this.value" onchange="setMusicVolume(' + jstr(slug) + ', this.value)" />' +
      '<span class="val" id="mv-' + slug + '">' + v + '</span></div>' +
      '<div class="slider-row" style="gap:6px"><label></label>' +
      '<button class="source-btn" style="flex:1" onclick="quickSend(' + jstr('previous track in the ' + pretty) + ')">⏮</button>' +
      '<button class="source-btn primary" style="flex:1" onclick="quickSend(' + jstr((playing?'pause':'resume')+' music in the '+pretty) + ')">' + (playing?'Pause':'Play') + '</button>' +
      '<button class="source-btn" style="flex:1" onclick="quickSend(' + jstr('next track in the ' + pretty) + ')">⏭</button>' +
      '</div>';
  } else if (device === 'skylight') {
    body =
      '<div class="device-detail">' + (state.open ? 'open' : 'closed') + '</div>' +
      '<div class="slider-row" style="gap:6px"><label></label>' +
      '<button class="source-btn" style="flex:1" onclick="quickSend(' + jstr('close the ' + pretty + ' skylight') + ')">Close</button>' +
      '<button class="source-btn primary" style="flex:1" onclick="quickSend(' + jstr('open the ' + pretty + ' skylight') + ')">Open</button>' +
      '</div>';
  } else if (device === 'av') {
    const sources = Object.entries(HOUSE.rooms[slug]?.devices ?? {});
    // We don't have sources in /house yet — but include the most common buttons.
    body =
      '<div class="device-detail">' + (state.power ? 'on · ' + (state.current_source || 'unknown') + ' · vol ' + (state.volume ?? '—') : 'off') + '</div>' +
      '<div class="source-grid">' +
        '<button class="source-btn" onclick="quickSend(' + jstr('watch apple tv in the ' + pretty) + ')">Apple TV</button>' +
        '<button class="source-btn" onclick="quickSend(' + jstr('watch xfinity in the ' + pretty) + ')">Xfinity</button>' +
        '<button class="source-btn" onclick="quickSend(' + jstr('watch UHD in the ' + pretty) + ')">UHD</button>' +
        '<button class="source-btn" onclick="quickSend(' + jstr('turn off the ' + pretty) + ')">Off</button>' +
      '</div>' +
      (state.power ? '<div class="slider-row"><label>Volume</label>' +
        '<input type="range" min="0" max="100" value="' + (state.volume ?? 30) + '" onchange="setAvVolume(' + jstr(slug) + ', this.value)" />' +
        '<span class="val">' + (state.volume ?? 30) + '</span></div>' : '');
  } else if (device.startsWith('hvac_') || device === 'climate') {
    const heat = state.heat_setpoint_f ?? 68;
    const cool = state.cool_setpoint_f ?? 75;
    body =
      '<div class="device-detail">' + (state.current_f != null ? state.current_f + '° · mode ' + (state.mode || 'off') + ' · ' + (state.hvac_state || 'idle') : '—') + '</div>' +
      '<div class="slider-row"><label>Heat</label>' +
      '<input type="range" min="55" max="85" value="' + heat + '" oninput="document.getElementById(\'h-' + slug + '\').textContent = this.value + \'°\'" onchange="setHeatSetpoint(' + jstr(slug) + ', this.value)" />' +
      '<span class="val" id="h-' + slug + '">' + heat + '°</span></div>' +
      '<div class="slider-row"><label>Cool</label>' +
      '<input type="range" min="60" max="90" value="' + cool + '" oninput="document.getElementById(\'c-' + slug + '\').textContent = this.value + \'°\'" onchange="setCoolSetpoint(' + jstr(slug) + ', this.value)" />' +
      '<span class="val" id="c-' + slug + '">' + cool + '°</span></div>' +
      '<div class="slider-row" style="gap:6px"><label></label>' +
      '<button class="source-btn" style="flex:1" onclick="quickSend(' + jstr('set ' + pretty + ' to heat mode') + ')">Heat</button>' +
      '<button class="source-btn" style="flex:1" onclick="quickSend(' + jstr('set ' + pretty + ' to cool mode') + ')">Cool</button>' +
      '<button class="source-btn" style="flex:1" onclick="quickSend(' + jstr('set ' + pretty + ' to auto mode') + ')">Auto</button>' +
      '<button class="source-btn" style="flex:1" onclick="quickSend(' + jstr('turn off ' + pretty) + ')">Off</button>' +
      '</div>';
  } else if (device === 'hot_tub' || device === 'pool') {
    const t = state.target_f ?? 100;
    const name = device === 'hot_tub' ? 'hot tub' : 'pool';
    body =
      '<div class="device-detail">' + (state.current_f != null ? state.current_f + '° → ' + (state.target_f ?? '—') + '° · ' + (state.mode || 'off') : '—') + '</div>' +
      '<div class="slider-row"><label>Target</label>' +
      '<input type="range" min="60" max="' + (device==='hot_tub'?104:90) + '" value="' + t + '" oninput="document.getElementById(\'t-' + slug + '\').textContent = this.value + \'°\'" onchange="quickSend(\'warm the ' + name + ' to \' + this.value)" />' +
      '<span class="val" id="t-' + slug + '">' + t + '°</span></div>' +
      '<div class="slider-row" style="gap:6px"><label></label>' +
      '<button class="source-btn" style="flex:1" onclick="quickSend(' + jstr('turn the ' + name + ' off') + ')">Off</button>' +
      '<button class="source-btn primary" style="flex:1" onclick="quickSend(' + jstr('warm the ' + name + ' to ' + t) + ')">Heat</button>' +
      '</div>';
  } else {
    body = '<div class="device-detail">' + esc(JSON.stringify(state)) + '</div>';
  }

  return '<div class="device-detail-block">' +
    '<div class="device-row" style="border:0;padding:0">' +
      '<div class="device-icon">' + icon + '</div>' +
      '<div class="device-meta"><div class="device-title">' + esc(title) + '</div></div>' +
    '</div>' + body + '</div>';
}

// debounced slider commands
const dbLight = debounce((slug, v) => quickSend('dim the ' + slug.replace(/_/g,' ') + ' lights to ' + v), 250);
const dbMusic = debounce((slug, v) => quickSend('set ' + slug.replace(/_/g,' ') + ' music volume to ' + v), 250);
const dbHeat = debounce((slug, v) => quickSend('set heat setpoint in the ' + slug.replace(/_/g,' ') + ' to ' + v), 250);
const dbCool = debounce((slug, v) => quickSend('set cool setpoint in the ' + slug.replace(/_/g,' ') + ' to ' + v), 250);
const dbAv = debounce((slug, v) => quickSend('set ' + slug.replace(/_/g,' ') + ' volume to ' + v), 250);
window.setLightSlider = (slug, v) => dbLight(slug, v);
window.setMusicVolume = (slug, v) => dbMusic(slug, v);
window.setHeatSetpoint = (slug, v) => dbHeat(slug, v);
window.setCoolSetpoint = (slug, v) => dbCool(slug, v);
window.setAvVolume = (slug, v) => dbAv(slug, v);

// ----- schedule / events -----
async function renderSchedule() {
  try {
    const r = await fetch('/schedule');
    const { jobs } = await r.json();
    const html = jobs.length ? jobs.map(j => {
      const label = j.label || j.actions.map(a => a.tool).join(' + ');
      const when = new Date(j.fireAt);
      const local = when.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      const badge = j.recurrence
        ? ' <span class="badge">' + esc(j.recurrence) + '</span>'
        : (j.trigger ? ' <span class="badge">' + esc(j.trigger.kind) + (j.trigger.offsetMinutes ? (j.trigger.offsetMinutes > 0 ? '+' : '') + j.trigger.offsetMinutes + 'm' : '') + '</span>' : '');
      return '<div class="job"><div class="job-label">' + esc(label) + badge +
        '<div class="job-fire-at">' + esc(local) + '</div></div>' +
        '<button class="btn-icon" title="snooze 15 min" onclick="snoozeJob(' + jstr(j.id) + ', 15)">+15</button>' +
        '<button class="btn-icon" onclick="cancelJob(' + jstr(j.id) + ')">×</button></div>';
    }).join('') : '<div class="empty">no pending jobs</div>';
    $('schedule').innerHTML = html;
    $('schedule-desk').innerHTML = html;
  } catch {}
}
async function renderEvents() {
  try {
    const r = await fetch('/events?limit=25');
    const { events } = await r.json();
    // toast on new schedule_fired events
    for (const e of events) {
      const ts = new Date(e.ts).getTime();
      if (ts > SEEN_EVENT_TS && e.kind === 'event:schedule_fired') {
        const action = e.payload?.action || 'job';
        toast('⏰ ' + action + ' fired' + (e.payload?.ok === false ? ' (failed)' : ''));
      }
    }
    if (events.length) SEEN_EVENT_TS = Math.max(...events.map(e => new Date(e.ts).getTime()));
    const html = events.length ? events.map(e => {
      const ts = new Date(e.ts).toLocaleTimeString([], { hour12: false });
      let payload = '';
      const p = e.payload;
      if (p && typeof p === 'object') {
        const s = p.state;
        payload = s && typeof s === 'object'
          ? Object.entries(s).slice(0,3).map(([k,v]) => k+'='+(typeof v==='object'?JSON.stringify(v):v)).join(' ')
          : JSON.stringify(p);
      } else payload = String(p ?? '');
      if (payload.length > 80) payload = payload.slice(0,77) + '…';
      return '<div class="event"><div class="event-row"><span class="ts">' + ts + '</span><span class="kind">' + esc(e.kind) + '</span><span class="payload">' + esc(payload) + '</span></div></div>';
    }).join('') : '<div class="empty">no events yet</div>';
    $('events').innerHTML = html;
    $('events-desk').innerHTML = html;
  } catch {}
}

async function refresh() {
  try { WORLD = await (await fetch('/world')).json(); renderRooms(); if (CURRENT_SHEET) renderSheet(); } catch {}
  renderSchedule();
  renderEvents();
}

async function init() {
  try {
    HOUSE = await (await fetch('/house')).json();
    renderQuick();
  } catch (err) {
    $('quick-row').innerHTML = '<span class="empty">house fetch failed</span>';
  }
  refresh();
}

// ----- pull to refresh (mobile) -----
let ptrStart = 0, ptrPulling = false;
window.addEventListener('touchstart', (e) => {
  if (window.scrollY === 0) { ptrStart = e.touches[0].clientY; ptrPulling = true; }
}, { passive: true });
window.addEventListener('touchmove', (e) => {
  if (!ptrPulling) return;
  const d = e.touches[0].clientY - ptrStart;
  if (d > 60) { $('ptr').classList.add('show'); $('ptr').textContent = '↑ release to refresh'; }
  else if (d > 0) { $('ptr').classList.add('show'); $('ptr').textContent = '↓ pull to refresh'; }
  else { $('ptr').classList.remove('show'); }
}, { passive: true });
window.addEventListener('touchend', (e) => {
  if (!ptrPulling) return;
  const last = e.changedTouches[0].clientY - ptrStart;
  ptrPulling = false;
  $('ptr').classList.remove('show');
  if (last > 60) { refresh(); toast('refreshed'); }
});

$('msg-send').addEventListener('click', sendMessage);
$('msg-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });

// ----- service worker -----
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(()=>{}));
}

init();
setInterval(refresh, 2000);
</script>
</body>
</html>`;
