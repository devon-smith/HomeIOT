/**
 * Home Brain dashboard — single-file HTML+CSS+JS, no build step.
 *
 * Implements the "Ambient Hero" + Desktop design handoff (cb9f218d):
 * warm cream-over-near-black surfaces, Newsreader serif italic hero,
 * IBM Plex Mono micro-labels, Plus Jakarta Sans body, per-scene tints
 * (amber Morning, purple Movie, blue Night, warm Hot tub), terracotta
 * primary CTA with glow, green live dot, big 42px serif temps, mono
 * setpoints, COOL pills, active-room terracotta gradient.
 *
 * Preserves prior functionality: PWA, Web Speech voice, optimistic
 * state, Undo toast, sliders, room sheet, BullMQ schedule chips.
 */

export const DASHBOARD_HTML = String.raw`<!doctype html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="Brain" />
  <meta name="theme-color" content="#d07d49" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <link rel="icon" type="image/svg+xml" href="/icon.svg" />
  <link rel="apple-touch-icon" href="/icon.svg" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400;1,6..72,500&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <title>Home Brain</title>
  <style>
    :root {
      --bg-page: radial-gradient(1200px 700px at 30% -10%, #1d1611 0%, #100c09 60%);
      --bg-screen: linear-gradient(180deg, #191410 0%, #14100c 100%);
      --card: rgba(232,210,176,0.035);
      --card-strong: rgba(232,210,176,0.05);
      --inset: rgba(20,16,12,0.4);
      --border: rgba(232,210,176,0.07);
      --border-strong: rgba(232,210,176,0.12);
      --hairline: rgba(232,210,176,0.05);
      --text-hi: #f2e8d8;
      --text-body: #ece1d0;
      --text-body-2: #e9dcc9;
      --text-body-3: #e4d8c6;
      --text-secondary: #cdbfae;
      --text-secondary-2: #bdae9b;
      --text-muted: #9c8e7e;
      --text-muted-2: #a89a88;
      --text-faint: #8d8073;
      --text-faint-2: #7a6e61;
      --accent: #d07d49;
      --accent-on: #1c130c;
      --accent-amber: #d9a85a;
      --accent-amber-light: #e3b07a;
      --accent-amber-light-2: #e7bd7a;
      --accent-warm: #e3a06f;
      --accent-warm-light: #eaa978;
      --accent-green: #7fae6f;
      --accent-cool: #6f8fa8;
      --accent-cool-icon: #9fc0e6;
      --accent-purple: #a882c4;
      --accent-purple-light: #cba8e0;
      --accent-purple-bright: #d7b6ea;
      --glow-primary: 0 4px 14px -2px rgba(208,125,73,0.6);
      --glow-live: 0 0 10px 1px rgba(127,174,111,0.7);
      --font-serif: 'Newsreader', Georgia, serif;
      --font-ui: 'Plus Jakarta Sans', -apple-system, system-ui, sans-serif;
      --font-mono: 'IBM Plex Mono', ui-monospace, monospace;
      --safe-top: env(safe-area-inset-top, 0);
      --safe-bottom: env(safe-area-inset-bottom, 0);
    }
    html[data-theme="light"] {
      --bg-page: radial-gradient(1200px 700px at 30% -10%, #faf4ea 0%, #ede5d6 60%);
      --bg-screen: linear-gradient(180deg, #fbf6ec 0%, #f1ead8 100%);
      --card: rgba(40,28,18,0.04);
      --card-strong: rgba(40,28,18,0.06);
      --border: rgba(40,28,18,0.08);
      --border-strong: rgba(40,28,18,0.16);
      --hairline: rgba(40,28,18,0.06);
      --text-hi: #1c130c;
      --text-body: #2a1f15;
      --text-body-2: #2a1f15;
      --text-body-3: #2a1f15;
      --text-secondary: #4a3d2f;
      --text-secondary-2: #5a4d3f;
      --text-muted: #7a6e61;
      --text-muted-2: #8a7d6f;
      --text-faint: #9c8e7e;
      --text-faint-2: #a89a88;
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { transition: none !important; animation: none !important; }
    }

    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; margin: 0; padding: 0; }
    body {
      font-family: var(--font-ui); font-size: 14px; line-height: 1.4;
      color: var(--text-body);
      background: var(--bg-page); min-height: 100vh;
      padding-bottom: calc(72px + var(--safe-bottom));
      overscroll-behavior-y: contain;
    }
    button { font: inherit; cursor: pointer; color: inherit; background: none; border: none; }
    input { font: inherit; color: inherit; }
    :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 8px; }
    .hb-scroll::-webkit-scrollbar { display: none; }
    .hb-scroll { scrollbar-width: none; }

    /* ============ LAYOUT ============ */
    .app {
      max-width: 460px; margin: 0 auto;
      padding: calc(var(--safe-top) + 14px) 22px 0;
      background: var(--bg-screen); min-height: 100vh;
    }

    @media (min-width: 1000px) {
      body { padding-bottom: 24px; }
      .app {
        max-width: 1320px;
        display: grid;
        grid-template-columns: 236px 1fr 312px;
        background: var(--bg-screen);
        border-radius: 16px;
        margin-top: 16px;
        padding: 0;
        box-shadow: 0 50px 100px -40px rgba(0,0,0,0.85), 0 0 0 1px var(--border);
        overflow: hidden;
        min-height: 840px;
      }
      .app-main { padding: 30px 32px; min-width: 0; }
      .desktop-sidebar { display: flex !important; }
      .desktop-rail { display: block !important; }
    }

    /* ============ HEADER ============ */
    .topbar {
      display: flex; justify-content: space-between; align-items: center;
      padding: 6px 0 0; margin-bottom: 4px;
    }
    @media (min-width: 1000px) { .topbar { display: none; } }
    .brand { font-family: var(--font-serif); font-style: italic; font-weight: 500; font-size: 25px; color: var(--text-hi); letter-spacing: 0.01em; }
    .theme-btn {
      width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0;
      border: 1px solid var(--border-strong); background: var(--card-strong);
      color: var(--accent-amber); display: flex; align-items: center; justify-content: center;
      transition: background 120ms;
    }
    .theme-btn:hover { background: var(--card-strong); }

    /* ============ QUICK ACTIONS ROW (mobile = scroll chips, desktop = 6-up grid) ============ */
    .quick-row {
      display: flex; gap: 9px; padding: 18px 0 4px;
      overflow-x: auto; scroll-snap-type: x mandatory;
    }
    @media (min-width: 1000px) {
      .quick-row {
        display: grid; grid-template-columns: repeat(6, 1fr);
        gap: 13px; padding: 0 0 22px; overflow: visible;
      }
    }
    .quick-chip {
      flex: none; scroll-snap-align: start;
      display: flex; align-items: center; gap: 9px;
      padding: 11px 15px; border-radius: 14px; cursor: pointer;
      transition: transform 120ms, filter 120ms;
    }
    .quick-chip:active { transform: scale(0.97); filter: brightness(1.1); }
    .quick-chip-label { font-size: 13px; font-weight: 600; color: var(--text-hi); }
    .quick-chip-icon { display: flex; flex-shrink: 0; }
    /* tints */
    .qc-action  { border: 1px solid rgba(208,125,73,0.34); background: rgba(208,125,73,0.18); }
    .qc-action .quick-chip-icon { color: var(--accent-warm-light); }
    .qc-warm    { border: 1px solid rgba(227,160,111,0.34); background: rgba(227,160,111,0.16); }
    .qc-warm .quick-chip-icon { color: var(--accent-warm); }
    .qc-morning { border: 1px solid rgba(217,168,90,0.24); background: linear-gradient(165deg, rgba(217,168,90,0.15), rgba(217,168,90,0.02)); }
    .qc-morning .quick-chip-icon { color: var(--accent-amber-light-2); }
    .qc-movie   { border: 1px solid rgba(168,130,196,0.22); background: rgba(168,130,196,0.13); }
    .qc-movie .quick-chip-icon { color: var(--accent-purple-light); }
    .qc-night   { border: 1px solid rgba(108,140,188,0.22); background: rgba(108,140,188,0.14); }
    .qc-night .quick-chip-icon { color: var(--accent-cool-icon); }
    .qc-jazz    { border: 1px solid rgba(208,125,73,0.22); background: rgba(208,125,73,0.12); }
    .qc-jazz .quick-chip-icon { color: var(--accent-warm-light); }
    .qc-generic { border: 1px solid var(--border); background: var(--card); }
    .qc-generic .quick-chip-label { color: var(--text-secondary); }
    .qc-more    { border: 1px dashed var(--border-strong); background: transparent; color: var(--text-faint); justify-content: center; }
    .qc-more .quick-chip-label { color: var(--text-faint); font-weight: 500; }

    /* Desktop: same colors, larger tiles with subtitle */
    @media (min-width: 1000px) {
      .quick-chip {
        flex-direction: column; align-items: flex-start; justify-content: space-between;
        padding: 16px; min-height: 120px; gap: 24px; border-radius: 18px;
      }
      .quick-chip-icon {
        width: 36px; height: 36px; border-radius: 11px;
        align-items: center; justify-content: center;
      }
      .qc-action  .quick-chip-icon { background: rgba(208,125,73,0.22); }
      .qc-warm    .quick-chip-icon { background: rgba(227,160,111,0.20); }
      .qc-morning .quick-chip-icon { background: rgba(217,168,90,0.18); }
      .qc-movie   .quick-chip-icon { background: rgba(168,130,196,0.20); }
      .qc-night   .quick-chip-icon { background: rgba(108,140,188,0.20); }
      .qc-jazz    .quick-chip-icon { background: rgba(208,125,73,0.16); }
      .qc-generic .quick-chip-icon { background: var(--card-strong); color: var(--text-secondary); }
      .qc-action  { background: linear-gradient(165deg, rgba(208,125,73,0.20), rgba(208,125,73,0.02)); }
      .qc-warm    { background: linear-gradient(165deg, rgba(227,160,111,0.18), rgba(232,210,176,0.02)); }
      .qc-movie   { background: linear-gradient(165deg, rgba(146,108,168,0.16), rgba(232,210,176,0.02)); }
      .qc-night   { background: linear-gradient(165deg, rgba(90,120,168,0.18), rgba(232,210,176,0.02)); }
      .qc-jazz    { background: linear-gradient(165deg, rgba(208,125,73,0.12), rgba(232,210,176,0.02)); }
      .qc-text { display: flex; flex-direction: column; gap: 2px; }
      .quick-chip-label { font-size: 13.5px; }
      .quick-chip-sub { font-size: 11px; color: #b6a791; }
    }
    .quick-chip-sub { display: none; }
    @media (min-width: 1000px) { .quick-chip-sub { display: block; } }

    /* ============ NOW PLAYING + HOT TUB CARDS ============ */
    .now-row { padding: 16px 0 0; }
    @media (min-width: 1000px) {
      .now-row { display: grid; grid-template-columns: 1.4fr 1fr; gap: 14px; margin-bottom: 22px; padding: 0; }
    }
    .now-card {
      border-radius: 20px; padding: 16px; cursor: pointer;
      background: linear-gradient(135deg, rgba(208,125,73,0.15), rgba(232,210,176,0.02));
      border: 1px solid rgba(208,125,73,0.22);
      display: flex; align-items: center; gap: 13px;
      margin-bottom: 12px;
    }
    @media (min-width: 1000px) { .now-card { margin-bottom: 0; padding: 18px; gap: 15px; } }
    .now-icon {
      width: 48px; height: 48px; border-radius: 13px; flex-shrink: 0;
      background: rgba(208,125,73,0.18); color: var(--accent-warm-light);
      display: flex; align-items: center; justify-content: center;
    }
    @media (min-width: 1000px) { .now-icon { width: 54px; height: 54px; border-radius: 14px; } }
    .now-meta { flex: 1; min-width: 0; }
    .now-eye { font-family: var(--font-mono); font-size: 9.5px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--text-faint); }
    .now-title { font-size: 15px; color: var(--text-hi); font-weight: 600; margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .now-sub { font-size: 12px; color: var(--text-muted-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .now-play {
      width: 42px; height: 40px; border-radius: 11px;
      border: 1px solid var(--border-strong); background: transparent;
      color: var(--text-secondary); display: flex; align-items: center; justify-content: center;
    }
    @media (min-width: 1000px) {
      .now-play { width: 46px; height: 46px; border-radius: 13px; background: var(--card-strong); border-color: var(--border-strong); }
    }
    .now-vol-row { display: flex; align-items: center; gap: 11px; padding: 0 14px 0 4px; margin-top: 6px; }
    .now-vol-val { font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary); width: 22px; text-align: right; }
    .ht-card {
      border-radius: 20px; padding: 18px;
      background: var(--card); border: 1px solid var(--border);
      display: flex; align-items: center; gap: 15px;
    }
    .ht-ring { position: relative; width: 58px; height: 58px; flex-shrink: 0; }
    .ht-ring svg { width: 58px; height: 58px; }
    .ht-ring .ht-track { fill: none; stroke: rgba(232,210,176,0.1); stroke-width: 5; }
    .ht-ring .ht-fill  { fill: none; stroke: var(--accent); stroke-width: 5; stroke-linecap: round; transform: rotate(-90deg); transform-origin: 32px 32px; }
    .ht-ring .ht-glyph { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--accent-warm); }
    .ht-info { min-width: 0; }
    .ht-name { font-size: 14.5px; color: var(--text-hi); font-weight: 600; }
    .ht-detail { font-family: var(--font-mono); font-size: 11px; color: var(--accent-warm); margin-top: 3px; }

    /* ============ STATUS HERO ============ */
    .hero { position: relative; padding: 18px 0 4px; }
    .hero-glow {
      position: absolute; left: -40px; top: -10px; width: 280px; height: 180px;
      background: radial-gradient(circle at 30% 40%, rgba(208,125,73,0.22), transparent 65%);
      filter: blur(8px); pointer-events: none;
    }
    .hero-eyebrow { position: relative; display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
    .hero-dot {
      width: 7px; height: 7px; border-radius: 50%; background: var(--text-muted);
      flex-shrink: 0;
    }
    .hero-dot.live { background: var(--accent-green); box-shadow: var(--glow-live); }
    .hero-eye-text {
      font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.2em;
      text-transform: uppercase; color: var(--text-faint);
    }
    .hero-sentence {
      position: relative;
      font-family: var(--font-serif); font-size: 25px; line-height: 1.32;
      color: var(--text-body); font-weight: 400;
    }
    .hero-sentence em {
      font-style: italic; color: var(--accent-amber-light); font-weight: 400;
    }
    @media (min-width: 1000px) {
      .hero-sentence { font-size: 30px; line-height: 1.3; max-width: 680px; }
      .hero-glow { width: 520px; height: 160px; left: -30px; top: -20px; }
    }

    /* ============ SCHEDULE CHIPS ============ */
    .schedule-row {
      display: flex; gap: 9px; padding: 14px 0 2px;
      overflow-x: auto; scroll-snap-type: x mandatory;
    }
    .sched-chip {
      flex: none; scroll-snap-align: start;
      display: flex; align-items: center; gap: 8px;
      padding: 9px 13px; border-radius: 12px;
      background: var(--card-strong); border: 1px solid var(--border);
      transition: background 120ms;
    }
    .sched-chip:hover { background: var(--card); border-color: var(--border-strong); }
    .sched-chip.due-soon { border-color: rgba(208,125,73,0.32); }
    .sched-chip svg { color: #c79a6a; }
    .sched-name { font-size: 12px; color: var(--text-body-3); font-weight: 600; line-height: 1.1; }
    .sched-time { font-family: var(--font-mono); font-size: 10px; color: var(--text-faint); margin-top: 1px; }
    .sched-actions { display: flex; gap: 4px; margin-left: 4px; }
    .sched-action {
      width: 28px; height: 28px; border-radius: 8px; padding: 0;
      color: var(--text-faint); font-size: 11px;
      display: inline-flex; align-items: center; justify-content: center;
    }
    .sched-action:hover { background: var(--accent); color: var(--accent-on); }

    /* ============ QUICK ACTIONS LABEL (desktop only) ============ */
    .quick-label-row { display: none; }
    @media (min-width: 1000px) {
      .quick-label-row { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
    }

    /* ============ NL BAR ============ */
    .nl-bar {
      display: flex; align-items: center; gap: 10px;
      padding: 6px 6px 6px 16px; border-radius: 16px;
      background: var(--card-strong); border: 1px solid var(--border-strong);
      margin: 18px 0 6px;
      transition: border-color 120ms;
    }
    .nl-bar:focus-within { border-color: var(--accent); }
    .nl-input {
      flex: 1; background: transparent; border: none; outline: none;
      font-size: 16px; color: var(--text-hi); min-height: 44px;
    }
    .nl-input::placeholder { color: var(--text-faint); }
    .nl-mic, .nl-send {
      width: 38px; height: 38px; border-radius: 11px;
      display: flex; align-items: center; justify-content: center;
    }
    .nl-mic { background: var(--card-strong); color: var(--text-secondary); }
    .nl-mic:hover { background: var(--card); color: var(--text-hi); }
    .nl-mic.listening { background: var(--accent); color: var(--accent-on); }
    .nl-send {
      background: var(--accent); color: var(--accent-on);
      box-shadow: var(--glow-primary);
    }
    .nl-send:hover { filter: brightness(1.1); }
    .nl-send:active { transform: scale(0.96); }

    .response {
      margin-bottom: 12px; padding: 12px 14px;
      background: var(--card-strong); border: 1px solid var(--border);
      border-radius: 14px; font-size: 14px; white-space: pre-wrap;
      color: var(--text-body); display: none;
    }
    .response.show { display: block; animation: fadeIn 200ms; }
    .response.error { border-color: var(--accent); }
    .response .meta { display: none; }
    body.dev .response .meta { display: block; margin-top: 6px; font-family: var(--font-mono); font-size: 11px; color: var(--text-faint); }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }

    /* ============ SECTION LABEL ============ */
    .section-head {
      display: flex; align-items: center; gap: 7px; margin: 20px 0 11px;
    }
    .section-head svg { color: var(--text-faint); }
    .section-label {
      font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.2em;
      text-transform: uppercase; color: var(--text-faint-2); font-weight: 500;
    }

    /* ============ CLIMATE ============ */
    .climate-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 11px;
    }
    @media (min-width: 1000px) {
      .climate-grid { grid-template-columns: 1fr 1fr 1fr; gap: 13px; margin-bottom: 6px; }
    }
    .climate-card {
      border-radius: 18px; padding: 15px;
      background: var(--card); border: 1px solid var(--border);
    }
    .climate-card.heating { background: linear-gradient(120deg, rgba(208,125,73,0.12), rgba(232,210,176,0.02)); border-color: rgba(208,125,73,0.2); }
    .climate-card.cooling { background: linear-gradient(120deg, rgba(108,140,188,0.10), rgba(232,210,176,0.02)); border-color: rgba(108,140,188,0.18); }
    .cc-head { display: flex; justify-content: space-between; align-items: start; }
    .cc-name { font-size: 13px; color: var(--text-secondary); font-weight: 600; }
    .cc-pill {
      font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.12em;
      color: var(--accent-cool); border: 1px solid rgba(111,143,168,0.3);
      padding: 2px 6px; border-radius: 6px; text-transform: uppercase;
    }
    .cc-pill.heat { color: var(--accent-warm); border-color: rgba(208,125,73,0.3); }
    .cc-pill.off { color: var(--text-muted); border-color: var(--border); }
    .cc-temp { font-family: var(--font-serif); font-size: 42px; line-height: 1; color: var(--text-hi); margin: 10px 0 6px; font-weight: 400; }
    @media (min-width: 1000px) { .cc-temp { font-size: 40px; margin-top: 12px; } }
    .cc-setpoints { font-family: var(--font-mono); font-size: 10.5px; color: var(--text-faint); }
    .cc-controls { display: flex; gap: 6px; margin-top: 10px; }
    .stepper {
      flex: 1; height: 32px; border-radius: 9px;
      background: transparent; border: 1px solid var(--border-strong);
      color: var(--text-secondary); font-size: 15px;
    }
    .stepper:hover { background: var(--card-strong); }

    /* ============ ROOM CARDS ============ */
    .room {
      border-radius: 18px; padding: 14px 15px; margin-top: 11px;
      background: var(--card); border: 1px solid var(--border);
      display: flex; flex-direction: column; gap: 12px;
    }
    .room.active { background: linear-gradient(120deg, rgba(208,125,73,0.1), rgba(232,210,176,0.02)); border-color: rgba(208,125,73,0.22); }
    .room.warm   { background: linear-gradient(120deg, rgba(208,125,73,0.12), rgba(232,210,176,0.02)); border-color: rgba(208,125,73,0.2); }
    .room-head { display: flex; justify-content: space-between; align-items: center; cursor: pointer; }
    .room-head-left { display: flex; align-items: center; gap: 9px; min-width: 0; }
    .room-live-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent-green); box-shadow: var(--glow-live); flex-shrink: 0; }
    .room-icon {
      width: 40px; height: 40px; border-radius: 12px;
      background: rgba(208,125,73,0.16); color: var(--accent-warm);
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .room-name { font-size: 14.5px; color: var(--text-hi); font-weight: 600; }
    .room-meta {
      font-family: var(--font-mono); font-size: 10.5px; color: var(--text-faint); margin-top: 3px;
    }
    .room-meta.warm-text { color: var(--accent-warm); }
    .room-meta.percent { color: var(--accent-amber-light); }
    .room-controls { display: flex; gap: 8px; flex-wrap: wrap; }
    .btn-pill {
      padding: 10px 14px; min-height: 38px;
      border-radius: 11px; border: 1px solid var(--border-strong); background: transparent;
      color: var(--text-secondary); font-size: 12.5px; font-weight: 600;
      transition: background 120ms, transform 120ms;
    }
    .btn-pill:hover { background: var(--card-strong); }
    .btn-pill:active { transform: scale(0.96); }
    .btn-pill.primary {
      background: var(--accent); color: var(--accent-on); border-color: var(--accent);
      box-shadow: var(--glow-primary); font-weight: 700;
    }
    .btn-pill.primary:hover { filter: brightness(1.08); }
    .btn-pill.flex { flex: 1; padding: 10px 0; }
    .btn-pill.square { width: 44px; padding: 10px 0; font-size: 15px; }
    .btn-pill.icon { width: 38px; height: 38px; padding: 0; }
    .btn-pill.muted { background: var(--card-strong); color: var(--text-body-3); border-color: transparent; }

    .more-rooms {
      width: 100%; margin-top: 11px; padding: 13px;
      border-radius: 14px; border: 1px dashed var(--border-strong); background: transparent;
      color: var(--text-faint); font-size: 13px; font-weight: 500;
    }
    .more-rooms:hover { color: var(--text-secondary); background: var(--card); }

    /* segmented control for lights */
    .segmented { display: flex; gap: 7px; }
    .segmented .btn-pill { flex: 1; padding: 9px 0; }
    .segmented .btn-pill.primary { flex: 1.4; }

    /* ============ BOTTOM NAV ============ */
    .bottom-nav {
      position: fixed; bottom: 0; left: 0; right: 0;
      max-width: 460px; margin: 0 auto;
      padding: 14px 34px calc(22px + var(--safe-bottom));
      display: flex; justify-content: space-between; align-items: center;
      background: linear-gradient(180deg, rgba(20,16,12,0), rgba(20,16,12,0.95) 38%);
      z-index: 50;
    }
    html[data-theme="light"] .bottom-nav { background: linear-gradient(180deg, rgba(245,243,238,0), rgba(245,243,238,0.95) 38%); }
    @media (min-width: 1000px) { .bottom-nav { display: none; } }
    .nav-btn {
      display: flex; flex-direction: column; align-items: center; gap: 4px;
      color: var(--text-faint-2); min-height: 44px; min-width: 56px; padding: 4px 8px;
      border-radius: 10px;
    }
    .nav-btn.active { color: var(--accent-amber-light); }
    .nav-btn svg { width: 22px; height: 22px; }
    .nav-btn-label { font-size: 10px; font-weight: 600; }

    /* ============ DESKTOP SIDEBAR ============ */
    .desktop-sidebar {
      display: none;
      flex-direction: column; padding: 26px 18px;
      border-right: 1px solid var(--border);
    }
    .desktop-sidebar .brand { padding: 0 10px 26px; font-size: 24px; }
    .sidebar-nav { display: flex; flex-direction: column; gap: 4px; }
    .sidebar-nav-btn {
      display: flex; align-items: center; gap: 12px;
      padding: 11px 14px; border-radius: 12px; color: var(--text-muted);
      font-size: 14px; font-weight: 500;
    }
    .sidebar-nav-btn.active {
      background: rgba(208,125,73,0.12); border: 1px solid rgba(208,125,73,0.18);
      color: var(--accent-warm-light); font-weight: 600;
    }
    .sidebar-nav-btn.active span:last-child { color: var(--text-hi); }
    .sidebar-bottom { margin-top: auto; display: flex; flex-direction: column; gap: 12px; }
    .talk-btn {
      display: flex; align-items: center; justify-content: center; gap: 9px;
      padding: 13px; border-radius: 14px;
      border: 1px solid var(--border-strong); background: var(--card-strong);
      color: var(--text-body-3); font-size: 13px; font-weight: 600;
    }
    .talk-btn:hover { background: var(--card); }
    .user-chip { display: flex; align-items: center; gap: 10px; padding: 0 10px; }
    .user-chip .avatar {
      width: 30px; height: 30px; border-radius: 50%;
      background: linear-gradient(135deg, var(--accent), var(--accent-amber));
    }
    .user-chip-name { font-size: 12.5px; color: var(--text-secondary); font-weight: 600; }
    .user-chip-sub { font-size: 10.5px; color: var(--text-faint); }

    /* ============ DESKTOP RAIL ============ */
    .desktop-rail {
      display: none;
      padding: 30px 24px; border-left: 1px solid var(--border);
      max-height: 100vh; overflow-y: auto;
    }
    .rail-head {
      display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;
    }
    .rail-jobs { display: flex; flex-direction: column; gap: 12px; margin-bottom: 30px; }
    .rail-job {
      border-radius: 15px; padding: 16px;
      background: var(--card); border: 1px solid var(--border);
    }
    .rail-job.due-soon {
      background: linear-gradient(120deg, rgba(208,125,73,0.1), rgba(232,210,176,0.02));
      border-color: rgba(208,125,73,0.18);
    }
    .rail-job-meta { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .rail-job-time { font-family: var(--font-mono); font-size: 11px; color: #c79a6a; }
    .rail-job.due-soon .rail-job-time { color: var(--accent-warm); }
    .rail-job-actions { display: flex; gap: 6px; }
    .rail-job-action {
      font-size: 10.5px; color: var(--text-secondary);
      padding: 4px 9px; border-radius: 7px;
      background: var(--card-strong);
    }
    .rail-job-action:hover { background: var(--accent); color: var(--accent-on); }
    .rail-job-x { font-size: 12px; color: var(--text-faint); padding: 4px 8px; }
    .rail-job-label { font-size: 13.5px; color: var(--text-hi); font-weight: 500; line-height: 1.4; }
    .rail-activity { display: flex; flex-direction: column; }
    .rail-act-row {
      display: flex; gap: 11px; padding: 9px 0; border-bottom: 1px solid var(--hairline);
    }
    .rail-act-row:last-child { border-bottom: none; }
    .rail-act-time { font-family: var(--font-mono); font-size: 10.5px; color: var(--text-faint); width: 38px; flex-shrink: 0; }
    .rail-act-text { font-size: 12.5px; color: var(--text-secondary-2); }
    .verb-music { color: var(--accent-green); }
    .verb-warm { color: var(--accent-warm); }
    .verb-default { color: var(--text-muted-2); }

    /* ============ ACTIVITY TAB ============ */
    .activity-page { padding: 8px 0 0; }
    .activity-item {
      display: flex; gap: 12px; padding: 10px 0;
      border-bottom: 1px solid var(--hairline);
    }
    .activity-item:last-child { border-bottom: none; }
    .activity-time { font-family: var(--font-mono); font-size: 11px; color: var(--text-faint); width: 50px; flex-shrink: 0; }
    .activity-text { font-size: 13px; color: var(--text-secondary-2); }

    /* ============ SEARCH ============ */
    .search-results {
      display: grid; grid-template-columns: 1fr; gap: 11px; margin-top: 12px;
    }
    @media (min-width: 760px) { .search-results { grid-template-columns: 1fr 1fr; } }
    @media (min-width: 1000px) { .search-results { grid-template-columns: 1fr 1fr 1fr; } }
    .search-item {
      padding: 15px; border-radius: 14px; cursor: pointer; text-align: left;
      background: var(--card); border: 1px solid var(--border); width: 100%;
      color: var(--text-body); transition: background 120ms;
    }
    .search-item:hover { background: var(--card-strong); }
    .search-meta { font-family: var(--font-mono); font-size: 10px; color: var(--text-faint); margin-top: 4px; }

    /* ============ SHEET / SECTIONS ============ */
    .section { display: none; }
    .section.active { display: block; }
    @media (min-width: 1000px) { .section.home { display: block !important; } .section.activity, .section.search { display: none !important; } }

    .sheet-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,0.55);
      opacity: 0; pointer-events: none; z-index: 100; transition: opacity 200ms;
    }
    .sheet-backdrop.show { opacity: 1; pointer-events: auto; }
    .sheet {
      position: fixed; left: 0; right: 0; bottom: 0;
      background: var(--bg-screen); border-radius: 24px 24px 0 0;
      padding: 14px 22px calc(22px + var(--safe-bottom));
      max-height: 90vh; overflow-y: auto;
      transform: translateY(100%); transition: transform 280ms cubic-bezier(0.2,0,0,1);
      z-index: 101; box-shadow: 0 -8px 32px rgba(0,0,0,0.4);
    }
    .sheet.show { transform: translateY(0); }
    @media (min-width: 760px) {
      .sheet { left: auto; right: 0; top: 0; bottom: 0; width: 440px; height: 100vh; max-height: 100vh; border-radius: 0; transform: translateX(100%); }
      .sheet.show { transform: translateX(0); }
    }
    .sheet-handle { width: 36px; height: 4px; background: var(--border-strong); border-radius: 99px; margin: 0 auto 14px; }
    @media (min-width: 760px) { .sheet-handle { display: none; } }
    .sheet-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
    .sheet-title { font-family: var(--font-serif); font-style: italic; font-size: 24px; color: var(--text-hi); }
    .sheet-close { font-size: 24px; color: var(--text-faint); width: 44px; height: 44px; border-radius: 10px; }
    .sheet-block { padding: 16px 0; border-bottom: 1px solid var(--hairline); }
    .sheet-block:last-child { border-bottom: 0; }
    .sheet-block-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
    .sheet-block-icon { width: 28px; height: 28px; border-radius: 8px; background: var(--card-strong); color: var(--text-secondary); display: inline-flex; align-items: center; justify-content: center; }
    .sheet-block-title { font-size: 14px; font-weight: 600; color: var(--text-hi); }
    .slider-row { display: flex; align-items: center; gap: 12px; margin: 10px 0; }
    .slider-row label { font-size: 12px; color: var(--text-secondary); min-width: 58px; }
    .slider-row .val { font-family: var(--font-mono); font-size: 12px; color: var(--text-body); min-width: 42px; text-align: right; }
    input[type=range] {
      flex: 1; -webkit-appearance: none; appearance: none;
      height: 5px; border-radius: 5px; background: var(--card-strong); outline: none;
    }
    input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 20px; height: 20px; border-radius: 50%; background: var(--text-hi); border: 4px solid var(--accent); cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.4); }
    input[type=range]::-moz-range-thumb { width: 20px; height: 20px; border-radius: 50%; background: var(--text-hi); border: 4px solid var(--accent); cursor: pointer; }

    .source-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }

    /* ============ TOAST ============ */
    .toast-container {
      position: fixed; left: 0; right: 0; top: calc(var(--safe-top) + 16px);
      display: flex; flex-direction: column; align-items: center; gap: 8px;
      pointer-events: none; z-index: 200;
    }
    .toast {
      pointer-events: auto;
      background: var(--bg-screen); color: var(--text-hi);
      border: 1px solid var(--border-strong); border-radius: 14px;
      padding: 14px 18px; max-width: 90vw;
      box-shadow: 0 4px 24px rgba(0,0,0,0.45);
      display: flex; align-items: center; gap: 14px;
      font-size: 14px; position: relative; overflow: hidden;
      animation: toastIn 200ms cubic-bezier(0.2,0,0,1);
    }
    .toast::after {
      content: ''; position: absolute; left: 0; bottom: 0; height: 2px;
      background: var(--accent); width: 100%;
      transform-origin: left; animation: toastShrink 5s linear forwards;
    }
    .toast.fade { animation: toastOut 200ms forwards; }
    .toast .undo-btn { color: var(--accent); font-weight: 600; padding: 4px 8px; }
    @keyframes toastIn { from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes toastOut { to { opacity: 0; transform: translateY(-12px); } }
    @keyframes toastShrink { from { transform: scaleX(1); } to { transform: scaleX(0); } }

    /* ============ PTR ============ */
    .ptr {
      position: fixed; top: 0; left: 50%; transform: translate(-50%, -100%);
      background: var(--card-strong); border: 1px solid var(--border-strong);
      border-radius: 0 0 8px 8px; padding: 4px 12px; font-size: 11px;
      color: var(--text-faint); z-index: 30; transition: transform 200ms;
    }
    .ptr.show { transform: translate(-50%, 0); }
    .empty { color: var(--text-faint); font-style: italic; font-size: 13px; padding: 8px 0; }

    .hidden { display: none !important; }
  </style>
</head>
<body>
  <div class="app">

    <!-- ============ DESKTOP SIDEBAR ============ -->
    <aside class="desktop-sidebar">
      <div class="brand">Home Brain</div>
      <nav class="sidebar-nav">
        <button class="sidebar-nav-btn active" data-section="home">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M4 11 12 4l8 7M6 9.5V20h12V9.5" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
          <span>Home</span>
        </button>
        <button class="sidebar-nav-btn" data-section="activity">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M3 12h4l2-6 4 14 2-8h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span>Activity</span>
        </button>
        <button class="sidebar-nav-btn" data-section="search">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.6"/><path d="m20 20-3.5-3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          <span>Search</span>
        </button>
      </nav>
      <div class="sidebar-bottom">
        <button class="talk-btn" id="talk-btn-desk" title="voice input">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" stroke-width="1.6"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          Hold to talk
        </button>
        <div class="user-chip">
          <span class="avatar"></span>
          <div>
            <div class="user-chip-name">Owner</div>
            <div class="user-chip-sub" id="user-rooms">— rooms</div>
          </div>
        </div>
      </div>
    </aside>

    <main class="app-main">

      <!-- ============ HEADER (mobile) ============ -->
      <div class="topbar">
        <span class="brand">Home Brain</span>
        <button class="theme-btn" id="theme-btn" aria-label="Theme">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
        </button>
      </div>

      <!-- ============ HOME SECTION ============ -->
      <section class="section home active" data-section="home">

        <div class="hero">
          <div class="hero-glow" id="hero-glow"></div>
          <div class="hero-eyebrow">
            <span class="hero-dot" id="hero-dot"></span>
            <span class="hero-eye-text" id="hero-eyebrow">All quiet · —</span>
          </div>
          <div class="hero-sentence" id="hero-sentence">Loading…</div>
        </div>

        <div class="schedule-row hb-scroll" id="schedule-chips"></div>

        <div class="quick-label-row">
          <span class="section-label">Quick actions</span>
        </div>
        <div class="quick-row hb-scroll" id="quick-row"></div>

        <div class="nl-bar">
          <input class="nl-input" id="msg-input" type="text"
            placeholder='say or type — "play jazz in the kitchen"' autocomplete="off" />
          <button class="nl-mic" id="mic-btn" aria-label="Voice input" aria-pressed="false">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" stroke-width="1.6"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          </button>
          <button class="nl-send" id="msg-send" aria-label="Send">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M5 12h13M12 5l7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
        <div id="msg-response" class="response" role="status" aria-live="polite"></div>

        <div class="now-row" id="now-row"></div>

        <div class="section-head">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M10 13.5V5a2 2 0 1 1 4 0v8.5a4 4 0 1 1-4 0Z" stroke="currentColor" stroke-width="1.6"/></svg>
          <span class="section-label">Comfort</span>
        </div>
        <div id="climate-grid" class="climate-grid"></div>
        <div id="comfort-rooms"></div>

        <div class="section-head">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M9 18V6l10-2v12" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="6" cy="18" r="3" stroke="currentColor" stroke-width="1.6"/><circle cx="16" cy="16" r="3" stroke="currentColor" stroke-width="1.6"/></svg>
          <span class="section-label">Entertainment</span>
        </div>
        <div id="entertainment-rooms"></div>

        <div class="section-head">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 1 4 10.5c-.6.5-1 1.2-1 2v.5H9v-.5c0-.8-.4-1.5-1-2A6 6 0 0 1 12 3Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
          <span class="section-label">Lighting</span>
        </div>
        <div id="lighting-rooms"></div>
      </section>

      <!-- ============ ACTIVITY SECTION (mobile) ============ -->
      <section class="section activity" data-section="activity">
        <div class="section-head" style="margin-top: 14px;">
          <span class="section-label">Recent activity</span>
        </div>
        <div class="activity-page" id="activity-feed"><div class="empty">no events yet</div></div>
      </section>

      <!-- ============ SEARCH SECTION (mobile) ============ -->
      <section class="section search" data-section="search">
        <div class="nl-bar" style="margin-top: 14px;">
          <input class="nl-input" id="search-input" type="text" placeholder="search rooms or devices…" />
        </div>
        <div class="search-results" id="search-results"></div>
      </section>

    </main>

    <!-- ============ DESKTOP RIGHT RAIL ============ -->
    <aside class="desktop-rail">
      <div class="rail-head">
        <span class="section-label">Schedule</span>
        <span style="font-size: 11px; color: var(--text-faint);">+ Add</span>
      </div>
      <div class="rail-jobs" id="rail-jobs"><div class="empty">no pending jobs</div></div>
      <div class="rail-head">
        <span class="section-label">Recent activity</span>
      </div>
      <div class="rail-activity" id="rail-activity"><div class="empty">no events yet</div></div>
    </aside>

  </div>

  <nav class="bottom-nav">
    <button class="nav-btn active" data-section="home">
      <svg viewBox="0 0 24 24" fill="none"><path d="M4 11 12 4l8 7M6 9.5V20h12V9.5" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
      <span class="nav-btn-label">Home</span>
    </button>
    <button class="nav-btn" data-section="activity">
      <svg viewBox="0 0 24 24" fill="none"><path d="M3 12h4l2-6 4 14 2-8h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <span class="nav-btn-label">Activity</span>
    </button>
    <button class="nav-btn" data-section="search">
      <svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.6"/><path d="m20 20-3.5-3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      <span class="nav-btn-label">Search</span>
    </button>
  </nav>

  <div class="sheet-backdrop" id="sheet-backdrop"></div>
  <div class="sheet" id="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title"></div>
  <div class="toast-container" id="toasts" role="alert" aria-live="assertive"></div>
  <div class="ptr" id="ptr">↓ pull to refresh</div>

<script>
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[c]);
const jstr = (s) => JSON.stringify(s).replace(/"/g, '&quot;');
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

// ===== STATE =====
let HOUSE = null;
let WORLD = {};
let LAST_EVENT_TS = 0;
let CURRENT_SHEET = null;
let LAST_UNDO = null;
let OPTIMISTIC = {};
const FIRST_CLASS = { 'good morning': 'morning', 'movie night': 'movie', 'goodnight': 'night' };
const ENTERTAINMENT = new Set(['music', 'av', 'tv']);
const COMFORT_DEVS = new Set(['hot_tub', 'pool', 'skylight']);

// ===== ICONS =====
const SVG = {
  music: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M9 18V6l10-2v12" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="6" cy="18" r="3" stroke="currentColor" stroke-width="1.6"/><circle cx="16" cy="16" r="3" stroke="currentColor" stroke-width="1.6"/></svg>',
  hottub: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 3s5 5.4 5 9a5 5 0 0 1-10 0c0-3.6 5-9 5-9Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  pool: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M2 18s2-1 5-1 5 2 10 2 5-1 5-1M2 14s2-1 5-1 5 2 10 2 5-1 5-1M5 10V6a2 2 0 1 1 4 0v8M15 10V6a2 2 0 1 1 4 0v8" stroke="currentColor" stroke-width="1.6"/></svg>',
  sky: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.6"/><path d="M12 3v2M12 19v2M21 12h-2M5 12H3M18.4 5.6l-1.4 1.4M7 17l-1.4 1.4M18.4 18.4 17 17M7 7 5.6 5.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  lights: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 1 4 10.5c-.6.5-1 1.2-1 2v.5H9v-.5c0-.8-.4-1.5-1-2A6 6 0 0 1 12 3Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  tv: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" stroke-width="1.6"/><path d="M3 9h18M7 5v14M17 5v14" stroke="currentColor" stroke-width="1.6"/></svg>',
  morning: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4.2" stroke="currentColor" stroke-width="1.6"/><path d="M12 2.5v2.6M12 18.9v2.6M21.5 12h-2.6M5.1 12H2.5M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8M18.7 18.7l-1.8-1.8M7.1 7.1 5.3 5.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  night: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  clock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="13" r="8" stroke="currentColor" stroke-width="1.6"/><path d="M12 9v4l2.5 1.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  sunrise: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 3v2M12 19v2M5 12H3M21 12h-2M6 6 4.5 4.5M18 6l1.5-1.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.6"/></svg>',
  play: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  more: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/></svg>',
};
function iconFor(device) {
  if (device === 'music') return SVG.music;
  if (device === 'av' || device === 'tv') return SVG.tv;
  if (device === 'lights') return SVG.lights;
  if (device === 'skylight') return SVG.sky;
  if (device === 'hot_tub') return SVG.hottub;
  if (device === 'pool') return SVG.pool;
  return '';
}

// ===== THEME =====
const THEMES = ['dark', 'light'];
let theme = localStorage.getItem('hb-theme') || 'dark';
function applyTheme(t) { document.documentElement.setAttribute('data-theme', t); }
applyTheme(theme);
$('theme-btn').addEventListener('click', () => {
  theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
  localStorage.setItem('hb-theme', theme); applyTheme(theme);
});

// ===== STATE merge =====
function getState(slug, device) {
  const o = OPTIMISTIC[slug + '/' + device];
  const s = WORLD[slug]?.[device];
  if (!o) return s;
  return { ...s, state: { ...(s?.state ?? {}), ...o } };
}
function applyOptimistic(slug, device, patch) {
  OPTIMISTIC[slug + '/' + device] = { ...(OPTIMISTIC[slug + '/' + device] ?? {}), ...patch };
  renderAll();
}

// ===== TOAST =====
function toast(msg, opts = {}) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = '<span>' + esc(msg) + '</span>' + (opts.undo ? '<button class="undo-btn">Undo</button>' : '');
  $('toasts').appendChild(el);
  if (opts.undo) el.querySelector('.undo-btn').addEventListener('click', () => { opts.undo(); dismiss(); });
  const dismiss = () => { el.classList.add('fade'); setTimeout(() => el.remove(), 200); };
  const timeout = setTimeout(dismiss, opts.duration || 5000);
  el.addEventListener('mouseenter', () => clearTimeout(timeout));
}

// ===== SEND =====
async function send(text, opts = {}) {
  if (!text) return null;
  if (!opts.silent) {
    $('msg-response').classList.add('show');
    $('msg-response').classList.remove('error');
    $('msg-response').textContent = '…';
  }
  try {
    const r = await fetch('/message', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
    const data = await r.json();
    if (!opts.silent) {
      $('msg-response').classList.toggle('error', !data.ok);
      $('msg-response').innerHTML = esc(data.response) + '<span class="meta">' + esc(data.route) + ' · ' + data.latencyMs + 'ms · ' + (data.toolCalls?.length ?? 0) + ' call(s)</span>';
    }
    refresh();
    return data;
  } catch (err) {
    if (!opts.silent) { $('msg-response').classList.add('error'); $('msg-response').textContent = 'error: ' + err.message; }
    return null;
  }
}
async function sendMessage() { const text = $('msg-input').value.trim(); if (!text) return; $('msg-input').value = ''; await send(text); }
window.quickSend = (text) => send(text);
window.cancelJob = async (id) => { await fetch('/schedule/' + id + '/cancel', { method: 'POST' }); renderSchedule(); };
window.snoozeJob = async (id, by) => {
  const r = await fetch('/schedule/' + id + '/snooze', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ by_minutes: by }) });
  if (r.ok) { toast('Snoozed ' + by + ' min'); renderSchedule(); }
};

// ===== VOICE =====
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
if (SR) {
  rec = new SR(); rec.continuous = false; rec.interimResults = true; rec.lang = 'en-US';
  rec.onresult = (e) => {
    const txt = Array.from(e.results).map(r => r[0].transcript).join('');
    $('msg-input').value = txt;
    if (e.results[e.results.length-1].isFinal) { stopMic(); sendMessage(); }
  };
  rec.onerror = stopMic; rec.onend = stopMic;
}
function startMic() {
  if (!rec) return;
  $('mic-btn').classList.add('listening');
  $('mic-btn').setAttribute('aria-pressed', 'true');
  try { rec.start(); } catch {}
}
function stopMic() {
  $('mic-btn').classList.remove('listening');
  $('mic-btn').setAttribute('aria-pressed', 'false');
}
$('mic-btn').addEventListener('click', () => $('mic-btn').classList.contains('listening') ? rec?.stop() : startMic());
$('talk-btn-desk')?.addEventListener('click', () => $('mic-btn').classList.contains('listening') ? rec?.stop() : startMic());
if (!SR) { $('mic-btn').style.display = 'none'; const t = $('talk-btn-desk'); if (t) t.style.display = 'none'; }

// ===== NAV =====
function switchSection(name) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.section === name));
  document.querySelectorAll('.sidebar-nav-btn').forEach(b => b.classList.toggle('active', b.dataset.section === name));
  document.querySelectorAll('.section').forEach(s => s.classList.toggle('active', s.dataset.section === name));
}
document.querySelectorAll('.nav-btn, .sidebar-nav-btn').forEach(b => b.addEventListener('click', () => switchSection(b.dataset.section)));

// ===== ROOM helpers =====
function isHvacOnly(slug) {
  const d = HOUSE.rooms[slug]?.devices ?? [];
  return d.length > 0 && d.every(x => x.startsWith('hvac_') || x === 'climate');
}
function roomGroup(slug) {
  const d = HOUSE.rooms[slug].devices;
  if (d.some(x => ENTERTAINMENT.has(x))) return 'entertainment';
  if (d.some(x => COMFORT_DEVS.has(x))) return 'comfort';
  if (d.includes('lights')) return 'lighting';
  return null;
}
function isRoomActive(slug) {
  const ws = WORLD[slug] || {};
  for (const [d, msg] of Object.entries(ws)) {
    const s = { ...(msg?.state ?? {}), ...(OPTIMISTIC[slug+'/'+d] ?? {}) };
    if (d === 'music' && (s.playState === 'PLAYING' || s.playing === true)) return true;
    if (d === 'lights' && s.on === true) return true;
    if (d === 'av' && s.power === true) return true;
    if (d === 'tv' && s.on === true) return true;
    if (d === 'skylight' && s.open === true) return true;
    if ((d === 'hot_tub' || d === 'pool') && (s.mode === 'heat' || s.heater_on === true)) return true;
    if (d.startsWith('hvac_') && (s.hvac_state === 'heating' || s.hvac_state === 'cooling')) return true;
  }
  return false;
}
function isRoomOnline(slug) {
  const ws = WORLD[slug] || {};
  if (Object.keys(ws).length === 0) return true;
  for (const m of Object.values(ws)) if (m?.online !== false) return true;
  return false;
}

// ===== STATUS HERO =====
function renderHero() {
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const clauses = [];
  let activeAny = false;
  for (const slug of Object.keys(HOUSE?.rooms ?? {})) {
    const label = HOUSE.rooms[slug].label;
    const ws = WORLD[slug] || {};
    for (const [d, msg] of Object.entries(ws)) {
      const s = msg?.state ?? {};
      if (d === 'music' && (s.playState === 'PLAYING' || s.playing === true)) {
        activeAny = true;
        const what = s.track ?? 'music';
        clauses.push('<em>' + esc(what) + ' in the ' + esc(label) + '</em>');
      } else if (d === 'av' && s.power === true) {
        activeAny = true;
        clauses.push('<em>' + esc(s.current_source ?? 'AV') + ' in the ' + esc(label) + '</em>');
      } else if ((d === 'hot_tub' || d === 'pool') && (s.mode === 'heat' || s.heater_on === true)) {
        activeAny = true;
        clauses.push('the <em>' + (d === 'hot_tub' ? 'hot tub' : 'pool') + ' warming to ' + (s.target_f ?? '?') + '°</em>');
      } else if (d.startsWith('hvac_') && (s.hvac_state === 'heating' || s.hvac_state === 'cooling')) {
        activeAny = true;
        clauses.push(esc(label) + ' <em>' + s.hvac_state + '</em>');
      } else if (d === 'skylight' && s.open === true) {
        activeAny = true;
        clauses.push(esc(label) + ' <em>skylight open</em>');
      }
    }
  }
  $('hero-dot').classList.toggle('live', activeAny);
  $('hero-glow').style.display = activeAny ? 'block' : 'none';
  $('hero-eyebrow').textContent = (activeAny ? 'Active' : 'All quiet') + ' · ' + time;
  let sentence;
  if (!activeAny) {
    sentence = "Everything's settled. Nothing's running right now.";
  } else if (clauses.length === 1) {
    sentence = "Just one thing going on — " + clauses[0] + '.';
  } else if (clauses.length === 2) {
    sentence = "Two things going on right now — " + clauses[0] + " and " + clauses[1] + '.';
  } else {
    sentence = "A few things going on — " + clauses.slice(0, 2).join(', ') + ', and ' + (clauses.length - 2) + ' more.';
  }
  $('hero-sentence').innerHTML = sentence;
}

// ===== QUICK ROW (action-first: Theater + Hot tub before scenes) =====
function findRoomWith(devKind) {
  for (const [slug, r] of Object.entries(HOUSE?.rooms ?? {})) {
    if (r.devices?.includes(devKind)) return slug;
  }
  return null;
}
function buildQuickItems() {
  const items = [];

  // 1) Theater action (if house has a theater room with av)
  const theater = HOUSE?.rooms?.theater?.devices?.includes('av') ? 'theater' : findRoomWith('av');
  if (theater) {
    const av = getState(theater, 'av')?.state ?? {};
    const label = HOUSE.rooms[theater].label;
    if (av.power) {
      items.push({ kind: 'action', label, sub: (av.current_source || 'AV') + ' · pause', svg: SVG.tv, msg: 'pause music in the ' + label.toLowerCase() });
    } else {
      items.push({ kind: 'action', label, sub: 'Turn on · AV', svg: SVG.tv, msg: 'watch apple tv in the ' + label.toLowerCase() });
    }
  }

  // 2) Hot tub action
  const tubRoom = findRoomWith('hot_tub');
  if (tubRoom) {
    const tub = getState(tubRoom, 'hot_tub')?.state ?? {};
    const isWarming = tub.mode === 'heat' || tub.heater_on === true;
    const target = 102;
    if (isWarming) {
      items.push({ kind: 'warm', label: 'Hot tub', sub: 'Stop heating', svg: SVG.hottub, msg: 'turn the hot tub off' });
    } else {
      items.push({ kind: 'warm', label: 'Hot tub', sub: 'Warm to ' + target + '°', svg: SVG.hottub, msg: 'warm the hot tub to ' + target });
    }
  }

  // 3) Scenes from house preferences — Movie Night, Goodnight, Dinner Jazz, Good Morning, then others
  const order = ['movie night', 'goodnight', 'dinner jazz', 'good morning'];
  const scenes = (HOUSE?.quick_actions ?? []).slice().sort((a, b) => {
    const ai = order.indexOf(a.label.toLowerCase()); const bi = order.indexOf(b.label.toLowerCase());
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  for (const s of scenes) {
    const key = s.label.toLowerCase();
    const kind = key === 'good morning' ? 'morning'
      : key === 'movie night' ? 'movie'
      : key === 'goodnight' ? 'night'
      : key.includes('jazz') ? 'jazz'
      : 'generic';
    const svg = kind === 'morning' ? SVG.morning
      : kind === 'movie' ? SVG.tv
      : kind === 'night' ? SVG.night
      : kind === 'jazz' ? SVG.music
      : SVG.music;
    items.push({ kind, label: s.label, sub: sceneSub(key), svg, msg: s.message, isScene: true });
  }
  return items;
}
function sceneSub(key) {
  if (key === 'movie night') return 'Theater · dim';
  if (key === 'goodnight') return 'Everything off';
  if (key === 'dinner jazz') return 'Kitchen · 40%';
  if (key === 'good morning') return 'Wake the house';
  if (key.includes('chill')) return 'Background jazz';
  if (key.includes('lights off')) return 'All rooms off';
  if (key.includes('pause music')) return 'Across the house';
  return '';
}
function renderQuickRow() {
  const items = buildQuickItems();
  const html = items.map(it => {
    const inner = '<span class="quick-chip-icon">' + it.svg + '</span>' +
      '<span class="qc-text"><span class="quick-chip-label">' + esc(it.label) + '</span>' +
      (it.sub ? '<span class="quick-chip-sub">' + esc(it.sub) + '</span>' : '') +
      '</span>';
    const handler = it.isScene
      ? 'fireScene(' + jstr(it.label) + ', ' + jstr(it.msg) + ')'
      : 'quickSend(' + jstr(it.msg) + ')';
    return '<button class="quick-chip qc-' + it.kind + '" onclick="' + handler + '">' + inner + '</button>';
  }).join('') + '<button class="quick-chip qc-more" onclick="alert(\'more scenes coming\')"><span class="qc-text"><span class="quick-chip-label">More ›</span><span class="quick-chip-sub">All scenes</span></span></button>';
  $('quick-row').innerHTML = html;
}
// ===== NOW ROW (active music + hot tub) =====
function renderNowRow() {
  if (!HOUSE) return;
  // Find the loudest active music room
  let activeMusic = null;
  let bestVol = -1;
  for (const [slug, r] of Object.entries(HOUSE.rooms)) {
    if (!r.devices.includes('music')) continue;
    const st = getState(slug, 'music')?.state ?? {};
    const playing = st.playState === 'PLAYING' || st.playing === true;
    if (playing) {
      const v = st.volume ?? 0;
      if (v >= bestVol) { activeMusic = { slug, label: r.label, state: st }; bestVol = v; }
    }
  }
  // Hot tub warming?
  let hotTub = null;
  const tubRoom = findRoomWith('hot_tub');
  if (tubRoom) {
    const st = getState(tubRoom, 'hot_tub')?.state ?? {};
    const isWarming = st.mode === 'heat' || st.heater_on === true;
    if (isWarming || st.current_f != null) {
      hotTub = { slug: tubRoom, state: st, warming: isWarming };
    }
  }

  let html = '';
  if (activeMusic) {
    const s = activeMusic.state;
    const title = s.track || 'Music';
    const sub = (s.artist ? s.artist + ' · ' : '') + 'vol ' + (s.volume ?? '—');
    html += '<div class="now-card" onclick="openSheet(' + jstr(activeMusic.slug) + ')">' +
      '<span class="now-icon">' + SVG.music + '</span>' +
      '<div class="now-meta">' +
        '<div class="now-eye">Now playing · ' + esc(activeMusic.label) + '</div>' +
        '<div class="now-title">' + esc(title) + '</div>' +
        '<div class="now-sub">' + esc(sub) + '</div>' +
      '</div>' +
      '<button class="now-play" onclick="event.stopPropagation(); quickSend(' + jstr('pause music in the ' + activeMusic.label.toLowerCase()) + ')">' + SVG.pause + '</button>' +
    '</div>';
  }
  if (hotTub) {
    const cur = hotTub.state.current_f ?? '—';
    const tgt = hotTub.state.target_f ?? 102;
    // Progress: from 70° baseline to target
    const range = Math.max(1, tgt - 70);
    const prog = Math.min(1, Math.max(0, ((cur === '—' ? 70 : cur) - 70) / range));
    const C = 2 * Math.PI * 27;  // r=27 from SVG
    const offset = Math.round(C * (1 - prog));
    html += '<div class="ht-card" onclick="openSheet(' + jstr(hotTub.slug) + ')" style="cursor: pointer;">' +
      '<div class="ht-ring">' +
        '<svg viewBox="0 0 64 64">' +
          '<circle class="ht-track" cx="32" cy="32" r="27"/>' +
          '<circle class="ht-fill" cx="32" cy="32" r="27" stroke-dasharray="' + Math.round(C) + '" stroke-dashoffset="' + offset + '"/>' +
        '</svg>' +
        '<div class="ht-glyph">' + SVG.hottub + '</div>' +
      '</div>' +
      '<div class="ht-info">' +
        '<div class="ht-name">Hot tub</div>' +
        '<div class="ht-detail">' + cur + '° → ' + tgt + '°' + (hotTub.warming ? ' · warming' : '') + '</div>' +
      '</div>' +
    '</div>';
  }
  $('now-row').innerHTML = html;
}

window.fireScene = async (label, message) => {
  const snapshot = JSON.parse(JSON.stringify(WORLD));
  await send(message, { silent: true });
  toast('Activated ' + label, { undo: () => doUndo(snapshot, label) });
};

// ===== UNDO =====
function doUndo(snapshot, label) {
  const cmds = [];
  for (const [slug, devs] of Object.entries(snapshot)) {
    const roomLabel = (HOUSE.rooms[slug]?.label || slug).toLowerCase();
    for (const [d, msg] of Object.entries(devs)) {
      const before = msg?.state ?? {};
      const after = WORLD[slug]?.[d]?.state ?? {};
      if (d === 'lights') {
        if (before.on && !after.on) cmds.push('turn the ' + roomLabel + ' lights to ' + (before.brightness ?? 80) + '%');
        else if (!before.on && after.on) cmds.push('turn off the ' + roomLabel + ' lights');
      } else if (d === 'music') {
        const wasPlay = before.playState === 'PLAYING';
        const isPlay = after.playState === 'PLAYING';
        if (wasPlay && !isPlay) cmds.push('resume music in the ' + roomLabel);
        else if (!wasPlay && isPlay) cmds.push('pause music in the ' + roomLabel);
      } else if (d === 'av') {
        if (before.power && !after.power) cmds.push('watch ' + (before.current_source || 'apple tv') + ' in the ' + roomLabel);
        else if (!before.power && after.power) cmds.push('turn off the ' + roomLabel);
      } else if (d === 'skylight') {
        if (before.open && !after.open) cmds.push('open the ' + roomLabel + ' skylight');
        else if (!before.open && after.open) cmds.push('close the ' + roomLabel + ' skylight');
      }
    }
  }
  if (!cmds.length) { toast('Nothing to undo'); return; }
  cmds.forEach(c => send(c, { silent: true }));
  toast('Undid ' + label);
}

// ===== SCHEDULE =====
let SCHEDULE = [];
async function renderSchedule() {
  try { const { jobs } = await (await fetch('/schedule')).json(); SCHEDULE = jobs; } catch { SCHEDULE = []; }
  // mobile chips
  const chips = SCHEDULE.slice(0, 3).map(j => {
    const label = j.label || prettifyAction(j.actions?.[0]) || 'Job';
    const when = new Date(j.fireAt);
    const dueSoon = (when.getTime() - Date.now()) < 30 * 60_000;
    const ic = j.trigger?.kind === 'sunrise' ? SVG.sunrise : SVG.clock;
    return '<div class="sched-chip' + (dueSoon ? ' due-soon' : '') + '">' + ic +
      '<div><div class="sched-name">' + esc(label) + '</div><div class="sched-time">' + esc(humanTime(when, j)) + '</div></div>' +
      '<div class="sched-actions"><button class="sched-action" onclick="snoozeJob(' + jstr(j.id) + ', 15)">+15</button>' +
      '<button class="sched-action" onclick="cancelJob(' + jstr(j.id) + ')">×</button></div></div>';
  }).join('');
  $('schedule-chips').innerHTML = chips || '';

  // desktop rail jobs
  const rail = SCHEDULE.length ? SCHEDULE.slice(0, 5).map((j, i) => {
    const label = j.label || prettifyAction(j.actions?.[0]) || 'Job';
    const when = new Date(j.fireAt);
    const dueSoon = i === 0 && (when.getTime() - Date.now()) < 30 * 60_000;
    return '<div class="rail-job' + (dueSoon ? ' due-soon' : '') + '">' +
      '<div class="rail-job-meta">' +
        '<span class="rail-job-time">' + esc(humanTime(when, j)) + '</span>' +
        '<div class="rail-job-actions">' +
          (dueSoon ? '<span class="rail-job-action" onclick="snoozeJob(' + jstr(j.id) + ', 15)">+15</span>' : '') +
          '<span class="rail-job-x" onclick="cancelJob(' + jstr(j.id) + ')">×</span>' +
        '</div>' +
      '</div>' +
      '<div class="rail-job-label">' + esc(label) + '</div></div>';
  }).join('') : '<div class="empty">no pending jobs</div>';
  $('rail-jobs').innerHTML = rail;
}
function humanTime(d, j) {
  if (j?.trigger?.kind === 'sunrise') return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) + ' · sunrise';
  if (j?.trigger?.kind === 'sunset') return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) + ' · sunset';
  if (j?.recurrence) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) + ' · ' + j.recurrence;
  const ms = d.getTime() - Date.now();
  if (Math.abs(ms) < 60 * 60_000) { const m = Math.round(ms / 60_000); return m === 0 ? 'now' : m > 0 ? 'in ' + m + 'm' : 'just now'; }
  const sameDay = d.toDateString() === new Date().toDateString();
  const tmrw = new Date(Date.now() + 24*3600_000).toDateString() === d.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  if (sameDay) return 'tonight ' + time;
  if (tmrw) return 'tmrw ' + time;
  return d.toLocaleDateString([], { weekday: 'short' }) + ' ' + time;
}
function prettifyAction(a) {
  const m = { set_lights: 'Lights', set_music: 'Music', set_climate: 'Climate', set_skylight: 'Skylight', control_av: 'AV', run_scene: 'Scene', run_c4_scene: 'Scene' };
  return a ? (m[a.tool] || a.tool.replace(/_/g, ' ')) : null;
}

// ===== CLIMATE =====
function renderClimate() {
  if (!HOUSE) return;
  const slugs = Object.keys(HOUSE.rooms).filter(isHvacOnly);
  const cards = slugs.flatMap(slug => HOUSE.rooms[slug].devices.map(d => {
    const st = getState(slug, d)?.state ?? {};
    const cur = st.current_f;
    const heat = st.heat_setpoint_f;
    const cool = st.cool_setpoint_f;
    const mode = (st.mode || 'off').toLowerCase();
    const hvac = (st.hvac_state || 'idle').toLowerCase();
    const cls = hvac === 'cooling' ? ' cooling' : hvac === 'heating' ? ' heating' : '';
    const pillCls = mode === 'cool' ? '' : mode === 'heat' ? ' heat' : ' off';
    const label = HOUSE.rooms[slug].label.replace(/ HVAC$/i, '');
    const pretty = slug.replace(/_/g, ' ').replace(/ hvac$/i, '');
    return '<div class="climate-card' + cls + '" onclick="openSheet(' + jstr(slug) + ')" role="button" tabindex="0">' +
      '<div class="cc-head"><span class="cc-name">' + esc(label) + '</span><span class="cc-pill' + pillCls + '">' + esc(mode) + '</span></div>' +
      '<div class="cc-temp">' + (cur != null ? cur + '°' : '—') + '</div>' +
      '<div class="cc-setpoints">' + (heat ?? '—') + '° → ' + (cool ?? '—') + '°</div>' +
      '<div class="cc-controls" onclick="event.stopPropagation()">' +
        '<button class="stepper" onclick="quickSend(' + jstr('lower the ' + pretty + ' temperature by 2') + ')">−</button>' +
        '<button class="stepper" onclick="quickSend(' + jstr('raise the ' + pretty + ' temperature by 2') + ')">+</button>' +
      '</div></div>';
  })).join('');
  $('climate-grid').innerHTML = cards;
}

// ===== ROOM CARDS =====
function renderRoom(slug, group) {
  const room = HOUSE.rooms[slug];
  const ws = WORLD[slug] || {};
  const pretty = room.label.toLowerCase();
  const active = isRoomActive(slug);

  // Pick primary device for the card based on group
  let primary, meta = [];
  if (group === 'entertainment') {
    primary = room.devices.find(d => ENTERTAINMENT.has(d)) || room.devices[0];
  } else if (group === 'comfort') {
    primary = room.devices.find(d => COMFORT_DEVS.has(d)) || room.devices[0];
  } else {
    primary = 'lights';
  }

  if (primary === 'hot_tub' || primary === 'pool') {
    const st = getState(slug, primary)?.state ?? {};
    const isWarming = st.mode === 'heat' || st.heater_on === true;
    const name = primary === 'hot_tub' ? 'hot tub' : 'pool';
    const detail = st.current_f != null ? (isWarming ? 'warming · ' + st.current_f + '° → ' + (st.target_f ?? '?') + '°' : (st.current_f + '° · ' + (st.mode || 'off'))) : 'off';
    return '<div class="room' + (isWarming ? ' warm' : '') + '" onclick="openSheet(' + jstr(slug) + ')">' +
      '<div class="room-head"><div class="room-head-left">' +
        '<span class="room-icon">' + (primary === 'hot_tub' ? SVG.hottub : SVG.pool) + '</span>' +
        '<div><div class="room-name">' + esc(primary === 'hot_tub' ? 'Hot tub' : 'Pool') + '</div><div class="room-meta' + (isWarming ? ' warm-text' : '') + '">' + esc(detail) + '</div></div>' +
      '</div>' +
      '<div class="room-controls" onclick="event.stopPropagation()">' +
        '<button class="btn-pill primary" onclick="quickSend(' + jstr('warm the ' + name + ' to ' + (primary === 'hot_tub' ? 102 : 85)) + ')">Warm</button>' +
      '</div></div></div>';
  }

  if (primary === 'skylight') {
    const st = getState(slug, 'skylight')?.state ?? {};
    return '<div class="room"><div class="room-head"><div class="room-head-left"><div><div class="room-name">' + esc(room.label) + ' skylights</div><div class="room-meta">' + (st.open ? 'open' : 'closed') + '</div></div></div>' +
      '<div class="room-controls" onclick="event.stopPropagation()">' +
        '<button class="btn-pill" onclick="quickSend(' + jstr('close the ' + pretty + ' skylights') + ')">Close</button>' +
        '<button class="btn-pill muted" onclick="quickSend(' + jstr('open the ' + pretty + ' skylights') + ')">Open</button>' +
      '</div></div></div>';
  }

  if (primary === 'music' || primary === 'av') {
    const music = getState(slug, 'music')?.state ?? {};
    const av = getState(slug, 'av')?.state ?? {};
    const lights = getState(slug, 'lights')?.state ?? {};
    const playing = music.playState === 'PLAYING' || music.playing === true;
    const avOn = av.power === true;
    const liveBits = [];
    if (avOn && av.current_source) liveBits.push(av.current_source);
    if (playing) liveBits.push('music · vol ' + (music.volume ?? '—'));
    else if (typeof music.volume === 'number') liveBits.push('vol ' + music.volume);
    if (lights.on) liveBits.push('lights ' + (lights.brightness ?? '?') + '%');
    const detail = liveBits.length ? liveBits.join(' · ') : 'idle';
    const cls = active ? ' active' : '';
    let controls;
    if (active) {
      controls =
        '<button class="btn-pill muted flex" onclick="quickSend(' + jstr((playing?'pause':'resume') + ' music in the ' + pretty) + ')">' + (playing ? 'Pause' : 'Play') + '</button>' +
        '<button class="btn-pill square" onclick="quickSend(' + jstr('lower the ' + pretty + ' music volume by 10') + ')">−</button>' +
        '<button class="btn-pill square" onclick="quickSend(' + jstr('raise the ' + pretty + ' music volume by 10') + ')">+</button>' +
        '<button class="btn-pill primary" onclick="quickSend(' + jstr('movie night in the ' + pretty) + ')">Movie</button>';
    } else {
      controls =
        '<button class="btn-pill icon" onclick="quickSend(' + jstr('resume music in the ' + pretty) + ')">' + SVG.play + '</button>' +
        '<button class="btn-pill primary" onclick="quickSend(' + jstr('turn on the ' + pretty + ' lights') + ')">On</button>';
    }
    return '<div class="room' + cls + '" onclick="openSheet(' + jstr(slug) + ')">' +
      '<div class="room-head"><div class="room-head-left">' +
        (active ? '<span class="room-live-dot"></span>' : '') +
        '<div><div class="room-name">' + esc(room.label) + '</div><div class="room-meta">' + esc(detail) + '</div></div>' +
      '</div></div>' +
      '<div class="room-controls" onclick="event.stopPropagation()">' + controls + '</div></div>';
  }

  if (primary === 'lights' || group === 'lighting') {
    const st = getState(slug, 'lights')?.state ?? {};
    const br = st.brightness ?? 0;
    return '<div class="room' + (st.on ? ' active' : '') + '" onclick="openSheet(' + jstr(slug) + ')">' +
      '<div class="room-head"><div class="room-head-left"><div><div class="room-name">' + esc(room.label) + '</div><div class="room-meta percent">' + (st.on ? br + '%' : 'off') + '</div></div></div></div>' +
      '<div class="segmented" onclick="event.stopPropagation()">' +
        '<button class="btn-pill" onclick="quickSend(' + jstr('turn off the ' + pretty + ' lights') + ')">Off</button>' +
        '<button class="btn-pill" onclick="quickSend(' + jstr('dim the ' + pretty + ' lights to 30') + ')">30%</button>' +
        '<button class="btn-pill primary" onclick="quickSend(' + jstr('turn on the ' + pretty + ' lights') + ')">On' + (st.on ? ' · ' + br + '%' : '') + '</button>' +
      '</div></div>';
  }
  return '';
}

function renderRooms() {
  if (!HOUSE) return;
  const groups = { entertainment: [], comfort: [], lighting: [] };
  const hidden = { entertainment: [], comfort: [], lighting: [] };
  for (const slug of Object.keys(HOUSE.rooms)) {
    if (isHvacOnly(slug)) continue;
    const g = roomGroup(slug);
    if (!g) continue;
    const active = isRoomActive(slug);
    const online = isRoomOnline(slug);
    if (active || online) groups[g].push(slug);
    else hidden[g].push(slug);
  }
  for (const g of Object.keys(groups)) {
    groups[g].sort((a, b) => {
      const aa = isRoomActive(a) ? 0 : 1; const bb = isRoomActive(b) ? 0 : 1;
      return aa !== bb ? aa - bb : HOUSE.rooms[a].label.localeCompare(HOUSE.rooms[b].label);
    });
  }
  const render = (slugs, hiddenSlugs, container, group) => {
    const cards = slugs.map(s => renderRoom(s, group)).filter(Boolean).join('');
    let html = cards || '<div class="empty">none</div>';
    if (hiddenSlugs.length) {
      html += '<button class="more-rooms" onclick="window.__expandHidden(this, ' + jstr(hiddenSlugs) + ', ' + jstr(group) + ')">+ ' + hiddenSlugs.length + ' more room' + (hiddenSlugs.length === 1 ? '' : 's') + '</button>';
    }
    container.innerHTML = html;
  };
  render(groups.comfort, hidden.comfort, $('comfort-rooms'), 'comfort');
  render(groups.entertainment, hidden.entertainment, $('entertainment-rooms'), 'entertainment');
  render(groups.lighting, hidden.lighting, $('lighting-rooms'), 'lighting');
}
window.__expandHidden = (btn, slugs, group) => {
  btn.outerHTML = slugs.map(s => renderRoom(s, group)).filter(Boolean).join('');
};

// ===== SHEET =====
window.openSheet = (slug) => {
  CURRENT_SHEET = slug; renderSheet();
  $('sheet').classList.add('show');
  $('sheet-backdrop').classList.add('show');
};
window.closeSheet = () => { CURRENT_SHEET = null; $('sheet').classList.remove('show'); $('sheet-backdrop').classList.remove('show'); };
$('sheet-backdrop').addEventListener('click', closeSheet);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && CURRENT_SHEET) closeSheet(); });

function renderSheet() {
  if (!CURRENT_SHEET || !HOUSE) return;
  const room = HOUSE.rooms[CURRENT_SHEET];
  if (!room) { closeSheet(); return; }
  const blocks = room.devices.map(d => renderSheetBlock(CURRENT_SHEET, d, getState(CURRENT_SHEET, d))).filter(Boolean).join('');
  $('sheet').innerHTML =
    '<div class="sheet-handle"></div>' +
    '<div class="sheet-head"><h2 class="sheet-title" id="sheet-title">' + esc(room.label) + '</h2><button class="sheet-close" onclick="closeSheet()" aria-label="Close">×</button></div>' +
    (blocks || '<div class="empty">no controllable devices</div>');
}

function renderSheetBlock(slug, device, msg) {
  const state = msg?.state ?? {};
  const pretty = HOUSE.rooms[slug].label.toLowerCase();
  let body = '', title = device.replace(/_/g, ' ');
  const icon = iconFor(device) || SVG.lights;

  if (device === 'lights') {
    title = 'Lights';
    const b = state.brightness ?? 0;
    body =
      '<div class="slider-row"><label>Brightness</label>' +
      '<input type="range" min="0" max="100" value="' + b + '" oninput="document.getElementById(\'lb-' + slug + '\').textContent = this.value + \'%\'" onchange="setLightSlider(' + jstr(slug) + ', this.value)" />' +
      '<span class="val" id="lb-' + slug + '">' + b + '%</span></div>' +
      '<div class="source-grid" style="grid-template-columns: 1fr 1fr 1fr; margin-top:10px;">' +
        '<button class="btn-pill" onclick="quickSend(' + jstr('turn off the ' + pretty + ' lights') + ')">Off</button>' +
        '<button class="btn-pill" onclick="quickSend(' + jstr('dim the ' + pretty + ' lights to 30') + ')">30%</button>' +
        '<button class="btn-pill primary" onclick="quickSend(' + jstr('turn on the ' + pretty + ' lights') + ')">On</button>' +
      '</div>';
  } else if (device === 'music') {
    title = 'Music';
    const v = state.volume ?? 25;
    const playing = state.playState === 'PLAYING';
    body =
      '<div style="font-size:13px; color:var(--text-secondary); margin-bottom: 12px;">' + esc(state.track ? ((state.artist ? state.artist + ' · ' : '') + state.track) : 'nothing playing') + '</div>' +
      '<div class="slider-row"><label>Volume</label><input type="range" min="0" max="100" value="' + v + '" oninput="document.getElementById(\'mv-' + slug + '\').textContent = this.value" onchange="setMusicVolume(' + jstr(slug) + ', this.value)" /><span class="val" id="mv-' + slug + '">' + v + '</span></div>' +
      '<div class="source-grid" style="grid-template-columns: 1fr 2fr 1fr; margin-top:10px;">' +
        '<button class="btn-pill" onclick="quickSend(' + jstr('previous track in the ' + pretty) + ')">⏮</button>' +
        '<button class="btn-pill primary" onclick="quickSend(' + jstr((playing?'pause':'resume')+' music in the '+pretty) + ')">' + (playing ? 'Pause' : 'Play') + '</button>' +
        '<button class="btn-pill" onclick="quickSend(' + jstr('next track in the ' + pretty) + ')">⏭</button>' +
      '</div>';
  } else if (device === 'skylight') {
    title = 'Skylight';
    body =
      '<div style="font-size:13px; color:var(--text-secondary); margin-bottom: 12px;">' + (state.open ? 'open' : 'closed') + '</div>' +
      '<div class="source-grid"><button class="btn-pill" onclick="quickSend(' + jstr('close the ' + pretty + ' skylight') + ')">Close</button><button class="btn-pill primary" onclick="quickSend(' + jstr('open the ' + pretty + ' skylight') + ')">Open</button></div>';
  } else if (device === 'av') {
    title = 'AV';
    body =
      '<div style="font-size:13px; color:var(--text-secondary); margin-bottom: 12px;">' + (state.power ? 'on · ' + (state.current_source || '—') + ' · vol ' + (state.volume ?? '—') : 'off') + '</div>' +
      '<div class="source-grid">' +
        '<button class="btn-pill" onclick="quickSend(' + jstr('watch apple tv in the ' + pretty) + ')">Apple TV</button>' +
        '<button class="btn-pill" onclick="quickSend(' + jstr('watch xfinity in the ' + pretty) + ')">Xfinity</button>' +
        '<button class="btn-pill" onclick="quickSend(' + jstr('watch UHD in the ' + pretty) + ')">UHD</button>' +
        '<button class="btn-pill" onclick="quickSend(' + jstr('turn off the ' + pretty) + ')">Off</button>' +
      '</div>' +
      (state.power ? '<div class="slider-row" style="margin-top:12px"><label>Volume</label><input type="range" min="0" max="100" value="' + (state.volume ?? 30) + '" onchange="setAvVolume(' + jstr(slug) + ', this.value)" /><span class="val">' + (state.volume ?? 30) + '</span></div>' : '');
  } else if (device.startsWith('hvac_') || device === 'climate') {
    title = 'Climate';
    const heat = state.heat_setpoint_f ?? 68;
    const cool = state.cool_setpoint_f ?? 75;
    body =
      '<div style="font-size:13px; color:var(--text-secondary); margin-bottom: 12px;">' + (state.current_f != null ? state.current_f + '° · ' + (state.mode || 'off') + ' · ' + (state.hvac_state || 'idle') : '—') + '</div>' +
      '<div class="slider-row"><label>Heat</label><input type="range" min="55" max="85" value="' + heat + '" oninput="document.getElementById(\'h-' + slug + '\').textContent = this.value + \'°\'" onchange="setHeatSetpoint(' + jstr(slug) + ', this.value)" /><span class="val" id="h-' + slug + '">' + heat + '°</span></div>' +
      '<div class="slider-row"><label>Cool</label><input type="range" min="60" max="90" value="' + cool + '" oninput="document.getElementById(\'c-' + slug + '\').textContent = this.value + \'°\'" onchange="setCoolSetpoint(' + jstr(slug) + ', this.value)" /><span class="val" id="c-' + slug + '">' + cool + '°</span></div>' +
      '<div class="source-grid" style="grid-template-columns: repeat(4, 1fr); margin-top:10px;">' +
        '<button class="btn-pill" onclick="quickSend(' + jstr('set ' + pretty + ' to heat mode') + ')">Heat</button>' +
        '<button class="btn-pill" onclick="quickSend(' + jstr('set ' + pretty + ' to cool mode') + ')">Cool</button>' +
        '<button class="btn-pill" onclick="quickSend(' + jstr('set ' + pretty + ' to auto mode') + ')">Auto</button>' +
        '<button class="btn-pill" onclick="quickSend(' + jstr('turn off ' + pretty) + ')">Off</button>' +
      '</div>';
  } else if (device === 'hot_tub' || device === 'pool') {
    title = device === 'hot_tub' ? 'Hot tub' : 'Pool';
    const t = state.target_f ?? (device === 'hot_tub' ? 102 : 85);
    const name = device === 'hot_tub' ? 'hot tub' : 'pool';
    body =
      '<div style="font-size:13px; color:var(--text-secondary); margin-bottom: 12px;">' + (state.current_f != null ? state.current_f + '° → ' + (state.target_f ?? '—') + '°' : '—') + '</div>' +
      '<div class="slider-row"><label>Target</label><input type="range" min="60" max="' + (device==='hot_tub'?104:90) + '" value="' + t + '" oninput="document.getElementById(\'t-' + slug + '\').textContent = this.value + \'°\'" onchange="quickSend(\'warm the ' + name + ' to \' + this.value)" /><span class="val" id="t-' + slug + '">' + t + '°</span></div>' +
      '<div class="source-grid"><button class="btn-pill" onclick="quickSend(' + jstr('turn the ' + name + ' off') + ')">Off</button><button class="btn-pill primary" onclick="quickSend(' + jstr('warm the ' + name + ' to ' + t) + ')">Heat</button></div>';
  } else { return ''; }

  return '<div class="sheet-block"><div class="sheet-block-head"><span class="sheet-block-icon">' + icon + '</span><span class="sheet-block-title">' + esc(title) + '</span></div>' + body + '</div>';
}

const dbLight = debounce((slug, v) => quickSend('dim the ' + HOUSE.rooms[slug].label.toLowerCase() + ' lights to ' + v), 250);
const dbMusic = debounce((slug, v) => quickSend('set ' + HOUSE.rooms[slug].label.toLowerCase() + ' music volume to ' + v), 250);
const dbHeat = debounce((slug, v) => quickSend('set heat setpoint in ' + HOUSE.rooms[slug].label.toLowerCase() + ' to ' + v), 250);
const dbCool = debounce((slug, v) => quickSend('set cool setpoint in ' + HOUSE.rooms[slug].label.toLowerCase() + ' to ' + v), 250);
const dbAv = debounce((slug, v) => quickSend('set ' + HOUSE.rooms[slug].label.toLowerCase() + ' volume to ' + v), 250);
window.setLightSlider = (slug, v) => { applyOptimistic(slug, 'lights', { on: v > 0, brightness: +v }); dbLight(slug, v); };
window.setMusicVolume = (slug, v) => { applyOptimistic(slug, 'music', { volume: +v }); dbMusic(slug, v); };
window.setHeatSetpoint = (slug, v) => { const d = HOUSE.rooms[slug].devices.find(x => x.startsWith('hvac_')) || 'climate'; applyOptimistic(slug, d, { heat_setpoint_f: +v }); dbHeat(slug, v); };
window.setCoolSetpoint = (slug, v) => { const d = HOUSE.rooms[slug].devices.find(x => x.startsWith('hvac_')) || 'climate'; applyOptimistic(slug, d, { cool_setpoint_f: +v }); dbCool(slug, v); };
window.setAvVolume = (slug, v) => { applyOptimistic(slug, 'av', { volume: +v }); dbAv(slug, v); };

// ===== ACTIVITY =====
function translateEvent(e) {
  const ts = new Date(e.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  if (e.kind.startsWith('state:')) {
    const path = e.kind.slice(6);
    const [slug, device] = path.split('/');
    const label = HOUSE?.rooms[slug]?.label || slug;
    const s = e.payload?.state ?? {};
    let text, verb;
    if (device === 'music') {
      if (s.playState === 'PLAYING' || s.playing === true) { text = 'music started'; verb = 'music'; }
      else if (s.playState === 'PAUSED_PLAYBACK' || s.playing === false) text = 'music paused';
      else if (typeof s.volume === 'number') text = 'volume → ' + s.volume;
    } else if (device === 'lights') {
      if (s.on === true) text = 'lights → ' + (s.brightness ?? '?') + '%';
      else if (s.on === false) text = 'lights off';
    } else if (device === 'skylight') text = s.open ? 'skylight opened' : 'skylight closed';
    else if (device === 'av') text = s.power ? 'watching ' + (s.current_source || 'AV') : 'AV off';
    else if (device === 'tv') text = s.on ? 'TV on' : 'TV off';
    else if (device === 'hot_tub' || device === 'pool') {
      if (s.mode === 'heat') { text = 'warming'; verb = 'warm'; }
      else if (s.target_f != null) text = 'target ' + s.target_f + '°';
    } else if (device.startsWith('hvac') || device === 'climate') {
      if (s.hvac_state === 'heating') { text = 'heating'; verb = 'warm'; }
      else if (s.hvac_state === 'cooling') { text = 'cooling'; }
      else if (s.mode) text = 'mode → ' + s.mode;
    }
    if (!text) return null;
    return { ts, room: label, text, verb };
  }
  if (e.kind === 'event:schedule_fired') return { ts, room: 'Schedule', text: (e.payload?.action || 'job') + ' fired', verb: 'music' };
  if (e.kind === 'event:schedule_cancelled') return { ts, room: 'Schedule', text: 'cancelled' };
  if (e.kind === 'event:schedule_snoozed') return { ts, room: 'Schedule', text: 'snoozed ' + (e.payload?.by_minutes ?? '?') + 'm' };
  return null;
}
async function renderActivity() {
  try {
    const { events } = await (await fetch('/events?limit=40')).json();
    for (const e of events) {
      const t = new Date(e.ts).getTime();
      if (t > LAST_EVENT_TS && e.kind === 'event:schedule_fired') toast('⏰ ' + (e.payload?.action || 'Job') + ' fired');
    }
    if (events.length) LAST_EVENT_TS = Math.max(...events.map(e => new Date(e.ts).getTime()));
    const items = events.map(translateEvent).filter(Boolean);
    const html = items.length ? items.map(i => {
      const vc = i.verb === 'music' ? 'verb-music' : i.verb === 'warm' ? 'verb-warm' : 'verb-default';
      return '<div class="activity-item"><span class="activity-time">' + esc(i.ts) + '</span><span class="activity-text">' + esc(i.room) + ' <span class="' + vc + '">' + esc(i.text) + '</span></span></div>';
    }).join('') : '<div class="empty">no events yet</div>';
    $('activity-feed').innerHTML = html;
    $('rail-activity').innerHTML = items.length ? items.slice(0, 8).map(i => {
      const vc = i.verb === 'music' ? 'verb-music' : i.verb === 'warm' ? 'verb-warm' : 'verb-default';
      return '<div class="rail-act-row"><span class="rail-act-time">' + esc(i.ts) + '</span><span class="rail-act-text">' + esc(i.room) + ' <span class="' + vc + '">' + esc(i.text) + '</span></span></div>';
    }).join('') : '<div class="empty">no events yet</div>';
  } catch {}
}

// ===== SEARCH =====
$('search-input')?.addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase().trim();
  if (!HOUSE) return;
  const slugs = Object.keys(HOUSE.rooms);
  const hits = q ? slugs.filter(s => HOUSE.rooms[s].label.toLowerCase().includes(q) || HOUSE.rooms[s].devices.some(d => d.includes(q))) : [];
  $('search-results').innerHTML = hits.length
    ? hits.map(s => '<button class="search-item" onclick="openSheet(' + jstr(s) + '); switchSection(\'home\')">' +
        '<div style="font-size:14px; font-weight:600;">' + esc(HOUSE.rooms[s].label) + '</div>' +
        '<div class="search-meta">' + HOUSE.rooms[s].devices.join(' · ') + '</div></button>').join('')
    : (q ? '<div class="empty">no matches</div>' : '');
});

function renderAll() {
  renderHero();
  renderQuickRow();
  renderNowRow();
  renderClimate();
  renderRooms();
  if (CURRENT_SHEET) renderSheet();
}
async function refresh() {
  try { WORLD = await (await fetch('/world')).json(); } catch {}
  // reconcile optimistic overlays
  for (const key of Object.keys(OPTIMISTIC)) {
    const [slug, d] = key.split('/');
    const real = WORLD[slug]?.[d]?.state ?? {};
    const opt = OPTIMISTIC[key];
    let allMatch = true;
    for (const k of Object.keys(opt)) {
      if (real[k] === undefined) { allMatch = false; break; }
      if (typeof opt[k] === 'number' && typeof real[k] === 'number') {
        if (Math.abs(opt[k] - real[k]) > 0.5) { allMatch = false; break; }
      } else if (opt[k] !== real[k]) { allMatch = false; break; }
    }
    if (allMatch) delete OPTIMISTIC[key];
  }
  renderAll(); renderSchedule(); renderActivity();
}
async function init() {
  try { HOUSE = await (await fetch('/house')).json(); }
  catch { $('hero-sentence').textContent = 'Could not load house definition.'; return; }
  const u = $('user-rooms'); if (u) u.textContent = Object.keys(HOUSE.rooms).length + ' rooms';
  refresh();
  setInterval(refresh, 2000);
  setInterval(renderHero, 30_000);
}

// PTR
let ptrStart = 0, ptrPulling = false;
window.addEventListener('touchstart', (e) => { if (window.scrollY === 0) { ptrStart = e.touches[0].clientY; ptrPulling = true; } }, { passive: true });
window.addEventListener('touchmove', (e) => {
  if (!ptrPulling) return;
  const d = e.touches[0].clientY - ptrStart;
  if (d > 60) { $('ptr').classList.add('show'); $('ptr').textContent = '↑ release to refresh'; }
  else if (d > 0) { $('ptr').classList.add('show'); $('ptr').textContent = '↓ pull to refresh'; }
  else $('ptr').classList.remove('show');
}, { passive: true });
window.addEventListener('touchend', (e) => {
  if (!ptrPulling) return;
  const last = e.changedTouches[0].clientY - ptrStart;
  ptrPulling = false; $('ptr').classList.remove('show');
  if (last > 60) refresh();
});

$('msg-send').addEventListener('click', sendMessage);
$('msg-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });
$('theme-btn').addEventListener('dblclick', () => { document.body.classList.toggle('dev'); toast(document.body.classList.contains('dev') ? 'dev mode on' : 'dev mode off'); });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(()=>{}));
}

init();
</script>
</body>
</html>`;
