/**
 * Home Brain dashboard — single-file HTML+CSS+JS, no build step.
 *
 * Built from the build spec: status hero, big scene tiles, schedule chips
 * promoted, unified climate, grouped rooms (Entertainment/Comfort/Lighting),
 * hide-empty, plain-language activity feed, optimistic state, Undo toasts,
 * mobile bottom nav + desktop sidebar/right rail, no slugs/IDs anywhere.
 *
 * All commands flow through POST /message. Sliders + room-off snapshots
 * enable optimistic UI; the next /world refresh reconciles.
 */

export const DASHBOARD_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="Brain" />
  <meta name="theme-color" content="#C26E4D" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <link rel="icon" type="image/svg+xml" href="/icon.svg" />
  <link rel="apple-touch-icon" href="/icon.svg" />
  <title>Home Brain</title>
  <style>
    /* ===== TOKENS ===== */
    :root {
      /* Surfaces */
      --bg: #1A1714;
      --surface: #221F1A;
      --surface-raised: #2A2620;
      --surface-input: #1E1B17;
      --border: #322E27;
      --border-strong: #463F35;
      /* Text */
      --text: #F0EBE2;
      --text-secondary: #A39A8C;
      --text-muted: #6B6358;
      /* Accent */
      --accent: #C26E4D;
      --accent-hover: #D07E5D;
      --accent-press: #AE5E3F;
      --accent-fg: #FFFFFF;
      --accent-subtle: rgba(194,110,77,0.14);
      /* Status */
      --success: #6FAE5E;
      --success-subtle: rgba(111,174,94,0.14);
      --warn: #D9A441;
      --danger: #C9533F;
      /* Climate cool (use ONLY for cooling/setpoints) */
      --cool: #5E84A8;
      --cool-subtle: rgba(94,132,168,0.12);
      /* Type */
      --font-display: Georgia, 'Newsreader', 'Lora', serif;
      --font-ui: -apple-system, BlinkMacSystemFont, 'Inter', system-ui, sans-serif;
      --font-mono: ui-monospace, 'JetBrains Mono', Menlo, monospace;
      /* Spacing — 4px base */
      --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px;
      --sp-5: 20px; --sp-6: 24px; --sp-8: 32px; --sp-10: 40px;
      /* Radii */
      --r-sm: 8px; --r-md: 12px; --r-lg: 16px; --r-pill: 999px;
      /* Elevation (flat — borders do the work) */
      --shadow-sheet: 0 -8px 32px rgba(0,0,0,0.40);
      --shadow-toast: 0 4px 24px rgba(0,0,0,0.35);
      /* Motion */
      --ease: cubic-bezier(0.2, 0, 0, 1);
      --dur-fast: 120ms; --dur-base: 200ms; --dur-sheet: 280ms;
      --safe-bottom: env(safe-area-inset-bottom, 0);
      --safe-top: env(safe-area-inset-top, 0);
    }
    html[data-theme="light"] {
      --bg: #F5F3EE;
      --surface: #FFFFFF;
      --surface-raised: #FBF8F1;
      --surface-input: #FFFFFF;
      --border: #E3DDD1;
      --border-strong: #C9C0AE;
      --text: #2A2620;
      --text-secondary: #6B6358;
      --text-muted: #9A9389;
      --accent-subtle: rgba(194,110,77,0.10);
      --success-subtle: rgba(111,174,94,0.10);
      --cool-subtle: rgba(94,132,168,0.10);
      --shadow-sheet: 0 -8px 32px rgba(0,0,0,0.15);
      --shadow-toast: 0 4px 24px rgba(0,0,0,0.15);
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { transition: none !important; animation: none !important; }
    }

    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    html, body { margin: 0; padding: 0; min-height: 100%; }
    body {
      font: 14px/1.4 var(--font-ui);
      background: var(--bg); color: var(--text);
      padding-bottom: calc(72px + var(--safe-bottom));
      overscroll-behavior-y: contain;
    }
    button { font: inherit; cursor: pointer; }
    input { font: inherit; }
    :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: var(--r-sm); }

    /* ===== LAYOUT ===== */
    .layout {
      display: grid;
      grid-template-columns: 1fr;
      max-width: 1400px; margin: 0 auto;
    }
    .sidebar { display: none; }
    .desktop-rail { display: none; }
    .main { padding: var(--sp-5) var(--sp-4) 0; min-width: 0; }

    @media (min-width: 960px) {
      body { padding-bottom: var(--sp-6); }
      .layout {
        grid-template-columns: 200px 1fr 320px;
        gap: var(--sp-5);
        padding: 0 var(--sp-5);
      }
      .sidebar { display: flex; flex-direction: column; gap: var(--sp-2); padding-top: var(--sp-6); position: sticky; top: 0; height: 100vh; }
      .desktop-rail { display: flex; flex-direction: column; gap: var(--sp-3); padding-top: var(--sp-6); position: sticky; top: var(--sp-6); align-self: start; max-height: calc(100vh - var(--sp-6)); overflow-y: auto; }
      .main { padding-top: var(--sp-6); padding-left: 0; padding-right: 0; }
      .bottom-nav { display: none !important; }
    }

    /* ===== HEADER ===== */
    .topbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--sp-3); }
    .brand { font: italic 400 22px/1 var(--font-display); color: var(--text); }
    @media (min-width: 960px) {
      .brand { font-size: 24px; }
      .topbar .brand { display: none; }
    }
    .theme-btn {
      min-width: 40px; min-height: 40px; padding: 0;
      background: transparent; border: 1px solid var(--border);
      border-radius: var(--r-sm); color: var(--text-secondary);
      transition: background var(--dur-fast) var(--ease);
    }
    .theme-btn:hover { background: var(--surface-raised); }

    /* ===== STATUS HERO ===== */
    .hero-status {
      font-size: 16px; line-height: 1.4; color: var(--text);
      margin-bottom: var(--sp-2); min-height: 22px;
      display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap;
    }
    .hero-dot {
      display: inline-block; width: 8px; height: 8px; border-radius: 50%;
      background: var(--text-muted); flex-shrink: 0;
    }
    .hero-dot.active { background: var(--success); animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
    .hero-summary { font-weight: 500; }
    .hero-time { color: var(--text-muted); font-family: var(--font-mono); font-size: 13px; }

    /* ===== SCHEDULE CHIPS (mobile under hero) ===== */
    .schedule-chips { display: flex; gap: var(--sp-2); flex-wrap: wrap; margin-bottom: var(--sp-4); }
    @media (min-width: 960px) { .schedule-chips { display: none; } }
    .chip {
      display: inline-flex; align-items: center; gap: var(--sp-2);
      padding: var(--sp-2) var(--sp-3); min-height: 36px;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--r-pill); color: var(--text-secondary);
      font-size: 13px; transition: background var(--dur-fast) var(--ease);
    }
    .chip:hover { background: var(--surface-raised); }
    .chip.due-soon { border-color: var(--accent); color: var(--text); }
    .chip-label { font-weight: 500; color: var(--text); }
    .chip-time { color: var(--text-muted); font-family: var(--font-mono); font-size: 12px; }
    .chip-action {
      background: transparent; border: 0; color: var(--text-muted);
      padding: 0 var(--sp-1); min-width: 28px; min-height: 28px; border-radius: var(--r-sm);
      font-size: 12px;
    }
    .chip-action:hover { background: var(--accent-subtle); color: var(--accent); }

    /* ===== SCENE TILES ===== */
    .scenes { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--sp-2); margin-bottom: var(--sp-3); }
    @media (min-width: 640px) { .scenes { grid-template-columns: repeat(4, 1fr); } }
    @media (min-width: 960px) { .scenes { grid-template-columns: repeat(6, 1fr); } }
    .scene-tile {
      min-height: 92px; padding: var(--sp-3);
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--r-lg); color: var(--text);
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--sp-2);
      transition: transform var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease);
    }
    .scene-tile:hover { background: var(--surface-raised); border-color: var(--border-strong); }
    .scene-tile:active { transform: scale(0.97); background: var(--accent-subtle); }
    .scene-tile.last-fired { border-color: var(--accent); }
    .scene-glyph { font-size: 26px; line-height: 1; }
    .scene-label { font-size: 13px; font-weight: 500; text-align: center; line-height: 1.2; }
    .scene-more { color: var(--text-secondary); }
    .scenes-more-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--sp-2); margin-bottom: var(--sp-4); }
    @media (min-width: 640px) { .scenes-more-row { grid-template-columns: repeat(4, 1fr); } }
    @media (min-width: 960px) { .scenes-more-row { display: none; } }
    .scenes-more-row.hidden { display: none; }

    /* ===== COMMAND BAR ===== */
    .command-card {
      background: var(--surface-input); border: 1px solid var(--border);
      border-radius: var(--r-md); padding: var(--sp-1);
      display: flex; align-items: center; gap: var(--sp-1);
      margin-bottom: var(--sp-3);
    }
    .command-card:focus-within { border-color: var(--accent); }
    .command-input {
      flex: 1; padding: var(--sp-3) var(--sp-3); min-height: 44px;
      border: 0; background: transparent; color: var(--text);
      font-size: 16px; outline: none;
    }
    .command-input::placeholder { color: var(--text-muted); }
    .mic-btn, .send-btn {
      min-width: 44px; min-height: 44px;
      border: 0; border-radius: var(--r-sm);
      display: inline-flex; align-items: center; justify-content: center;
      transition: background var(--dur-fast) var(--ease), transform var(--dur-fast) var(--ease);
    }
    .mic-btn { background: transparent; color: var(--text-secondary); font-size: 16px; }
    .mic-btn:hover { background: var(--surface-raised); color: var(--text); }
    .mic-btn.listening { background: var(--danger); color: #fff; animation: pulse 1.2s infinite; }
    .send-btn { background: var(--accent); color: var(--accent-fg); padding: 0 var(--sp-4); font-weight: 500; }
    .send-btn:hover { background: var(--accent-hover); }
    .send-btn:active { transform: scale(0.97); background: var(--accent-press); }

    .response {
      margin-bottom: var(--sp-4); padding: var(--sp-3) var(--sp-4);
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--r-md); font-size: 14px; white-space: pre-wrap;
      display: none;
    }
    .response.show { display: block; animation: fadeIn var(--dur-base) var(--ease); }
    .response.error { border-color: var(--danger); }
    .response .meta { display: none; }
    body.dev .response .meta { display: block; margin-top: var(--sp-2); color: var(--text-muted); font-family: var(--font-mono); font-size: 11px; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }

    /* ===== SECTIONS ===== */
    .section-label {
      font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em;
      color: var(--text-muted); margin: var(--sp-6) 0 var(--sp-3); font-weight: 600;
    }
    .section-label:first-child { margin-top: var(--sp-3); }

    /* ===== CLIMATE CARD ===== */
    .climate-card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--r-md); padding: var(--sp-4); margin-bottom: var(--sp-3);
    }
    .climate-zones {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: var(--sp-3);
    }
    .climate-zone {
      padding: var(--sp-3); border: 1px solid var(--border); border-radius: var(--r-sm);
      background: var(--surface-raised);
      transition: border-color var(--dur-fast) var(--ease);
    }
    .climate-zone:hover { border-color: var(--border-strong); }
    .climate-zone.heating { border-color: var(--accent); background: var(--accent-subtle); }
    .climate-zone.cooling { border-color: var(--cool); background: var(--cool-subtle); }
    .cz-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sp-2); }
    .cz-name { font-weight: 600; font-size: 14px; }
    .cz-mode { font-family: var(--font-mono); font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .cz-temp { font: 300 36px/1 var(--font-ui); letter-spacing: -0.02em; margin: var(--sp-2) 0; }
    .cz-setpoints { display: flex; gap: var(--sp-3); font-family: var(--font-mono); font-size: 11px; color: var(--cool); margin-bottom: var(--sp-2); }
    .cz-controls { display: flex; gap: var(--sp-2); margin-top: var(--sp-2); }
    .cz-controls .btn-icon { flex: 1; }

    /* ===== ROOM CARDS ===== */
    .rooms {
      display: grid; gap: var(--sp-3);
      grid-template-columns: 1fr;
    }
    @media (min-width: 640px) { .rooms { grid-template-columns: 1fr 1fr; } }
    @media (min-width: 960px) { .rooms { grid-template-columns: repeat(3, 1fr); } }
    .room {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--r-md); padding: var(--sp-3) var(--sp-4);
      display: flex; flex-direction: column; gap: var(--sp-2);
      transition: border-color var(--dur-fast) var(--ease);
      position: relative;
    }
    .room:hover { border-color: var(--border-strong); }
    .room.has-active::before {
      content: ''; position: absolute; left: 0; top: var(--sp-3); bottom: var(--sp-3);
      width: 3px; background: var(--accent); border-radius: 0 var(--r-sm) var(--r-sm) 0;
    }
    .room.all-off { opacity: 0.75; }
    .room-head { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); cursor: pointer; padding-bottom: var(--sp-1); }
    .room-name { font-weight: 600; font-size: 15px; }
    .room-tags { font-size: 11px; color: var(--text-muted); }
    .device-row {
      display: flex; align-items: center; gap: var(--sp-3);
      padding: var(--sp-2) 0; border-top: 1px solid var(--border);
    }
    .device-row:first-of-type { border-top: 0; padding-top: 0; }
    .device-icon { font-size: 16px; width: 22px; text-align: center; flex-shrink: 0; color: var(--text-secondary); }
    .device-icon.on { color: var(--success); }
    .device-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
    .device-title { font-size: 13px; font-weight: 500; }
    .device-title.on { color: var(--success); }
    .device-detail {
      font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .offline-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--text-muted); opacity: 0.5; margin-left: var(--sp-1); }
    .device-controls { display: flex; gap: var(--sp-1); flex-shrink: 0; }
    .btn-icon {
      min-width: 44px; min-height: 36px; padding: 0 var(--sp-2);
      background: var(--surface-raised); color: var(--text); border: 1px solid var(--border);
      border-radius: var(--r-sm); font-size: 12px;
      display: inline-flex; align-items: center; justify-content: center;
      transition: background var(--dur-fast) var(--ease), transform var(--dur-fast) var(--ease);
    }
    .btn-icon:hover { background: var(--accent-subtle); border-color: var(--accent); }
    .btn-icon:active { transform: scale(0.94); }
    .btn-icon.primary { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
    .btn-icon.primary:hover { background: var(--accent-hover); border-color: var(--accent-hover); }

    .more-rooms {
      grid-column: 1 / -1;
      background: transparent; border: 1px dashed var(--border);
      border-radius: var(--r-md); padding: var(--sp-3);
      color: var(--text-muted); font-size: 13px;
      transition: background var(--dur-fast) var(--ease);
    }
    .more-rooms:hover { background: var(--surface); color: var(--text-secondary); }

    /* ===== RIGHT RAIL (desktop) ===== */
    .rail-card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--r-md); padding: var(--sp-4);
    }
    .rail-card h3 {
      font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em;
      color: var(--text-muted); margin: 0 0 var(--sp-3); font-weight: 600;
    }
    .rail-job, .rail-event {
      padding: var(--sp-2) 0; border-top: 1px solid var(--border); font-size: 13px;
    }
    .rail-job:first-of-type, .rail-event:first-of-type { border-top: 0; padding-top: 0; }
    .rail-job { display: flex; align-items: center; gap: var(--sp-2); }
    .rail-job-meta { flex: 1; min-width: 0; }
    .rail-job-label { font-size: 13px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rail-job-time { font-size: 11px; color: var(--text-muted); font-family: var(--font-mono); }

    /* ===== BADGES ===== */
    .badge {
      display: inline-block; padding: 1px 6px; margin-left: var(--sp-1);
      background: var(--accent-subtle); color: var(--accent);
      border-radius: var(--r-sm); font-size: 9px; text-transform: uppercase;
      letter-spacing: 0.05em; font-weight: 600; vertical-align: middle;
    }

    /* ===== ACTIVITY FEED ===== */
    .activity-list { display: flex; flex-direction: column; gap: 1px; }
    .activity-item {
      padding: var(--sp-2) var(--sp-3); display: flex; gap: var(--sp-3);
      background: var(--surface); border-radius: var(--r-sm);
      align-items: baseline; font-size: 13px;
    }
    .activity-time { font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); flex-shrink: 0; min-width: 50px; }
    .activity-text { flex: 1; color: var(--text); min-width: 0; }
    .activity-room { color: var(--text-secondary); font-weight: 500; }

    /* ===== SEARCH ===== */
    .search-results { display: flex; flex-direction: column; gap: var(--sp-2); margin-top: var(--sp-3); }
    .search-item {
      padding: var(--sp-3); background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--r-md); font-size: 14px;
    }

    /* ===== BOTTOM NAV (mobile) ===== */
    .bottom-nav {
      position: fixed; bottom: 0; left: 0; right: 0;
      background: var(--surface); border-top: 1px solid var(--border);
      padding: var(--sp-2) var(--sp-1) calc(var(--sp-2) + var(--safe-bottom));
      display: flex; justify-content: space-around; z-index: 50;
    }
    .nav-btn {
      background: transparent; border: 0; color: var(--text-muted);
      font-size: 10px; padding: var(--sp-2) var(--sp-3);
      display: flex; flex-direction: column; align-items: center; gap: 2px;
      min-height: 44px; min-width: 56px; border-radius: var(--r-sm);
      transition: color var(--dur-fast) var(--ease);
    }
    .nav-btn.active { color: var(--accent); }
    .nav-btn .nav-icon { font-size: 20px; }

    /* ===== SIDEBAR (desktop) ===== */
    .sidebar-brand { padding: 0 var(--sp-3) var(--sp-4); }
    .sidebar-nav { display: flex; flex-direction: column; gap: var(--sp-1); }
    .sidebar-nav .nav-btn {
      flex-direction: row; justify-content: flex-start; gap: var(--sp-3);
      padding: var(--sp-3); width: 100%; font-size: 14px;
      color: var(--text-secondary);
    }
    .sidebar-nav .nav-btn.active { background: var(--accent-subtle); color: var(--accent); }

    /* ===== SECTIONS show/hide ===== */
    .section { display: none; }
    .section.active { display: block; }
    @media (min-width: 960px) { .section { display: block !important; } }

    /* ===== SHEET / DRAWER ===== */
    .sheet-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,0.5);
      opacity: 0; pointer-events: none; transition: opacity var(--dur-base) var(--ease); z-index: 100;
    }
    .sheet-backdrop.show { opacity: 1; pointer-events: auto; }
    .sheet {
      position: fixed; left: 0; right: 0; bottom: 0;
      background: var(--surface); border-radius: var(--r-lg) var(--r-lg) 0 0;
      padding: var(--sp-4) var(--sp-4) calc(var(--sp-5) + var(--safe-bottom));
      max-height: 88vh; overflow-y: auto;
      transform: translateY(100%); transition: transform var(--dur-sheet) var(--ease);
      box-shadow: var(--shadow-sheet); z-index: 101;
    }
    .sheet.show { transform: translateY(0); }
    @media (min-width: 760px) {
      .sheet {
        left: auto; right: 0; top: 0; bottom: 0;
        width: 420px; max-width: 90vw; height: 100vh; max-height: 100vh;
        border-radius: 0; transform: translateX(100%);
      }
      .sheet.show { transform: translateX(0); }
    }
    .sheet-handle { width: 36px; height: 4px; background: var(--border-strong); border-radius: var(--r-pill); margin: 0 auto var(--sp-3); }
    @media (min-width: 760px) { .sheet-handle { display: none; } }
    .sheet-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--sp-4); }
    .sheet-title { font: italic 400 22px/1 var(--font-display); margin: 0; }
    .sheet-close { background: transparent; border: 0; font-size: 22px; color: var(--text-secondary); min-width: 44px; min-height: 44px; border-radius: var(--r-sm); }
    .sheet-block { padding: var(--sp-4) 0; border-bottom: 1px solid var(--border); }
    .sheet-block:last-child { border-bottom: 0; }
    .sheet-block-head { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); }
    .sheet-block-title { font-weight: 600; font-size: 14px; }

    /* sliders */
    .slider-row { display: flex; align-items: center; gap: var(--sp-3); margin: var(--sp-2) 0; }
    .slider-row label { font-size: 12px; color: var(--text-secondary); min-width: 56px; }
    .slider-row .val { font-family: var(--font-mono); font-size: 13px; min-width: 40px; text-align: right; color: var(--text); }
    input[type=range] {
      flex: 1; height: 36px; cursor: pointer; background: transparent;
      -webkit-appearance: none; appearance: none;
    }
    input[type=range]::-webkit-slider-runnable-track { height: 4px; background: var(--border-strong); border-radius: 2px; }
    input[type=range]::-moz-range-track { height: 4px; background: var(--border-strong); border-radius: 2px; }
    input[type=range]::-webkit-slider-thumb {
      -webkit-appearance: none; appearance: none; width: 22px; height: 22px;
      border-radius: 50%; background: var(--accent); border: 2px solid var(--surface);
      margin-top: -9px; cursor: pointer;
    }
    input[type=range]::-moz-range-thumb { width: 22px; height: 22px; border-radius: 50%; background: var(--accent); border: 2px solid var(--surface); cursor: pointer; }

    .source-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--sp-2); margin-top: var(--sp-2); }
    .pill-btn {
      padding: var(--sp-3); min-height: 44px;
      background: var(--surface-raised); border: 1px solid var(--border);
      border-radius: var(--r-sm); color: var(--text); font-size: 13px;
      text-transform: capitalize;
      transition: background var(--dur-fast) var(--ease);
    }
    .pill-btn:hover { background: var(--accent-subtle); border-color: var(--accent); }
    .pill-btn.primary { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
    .pill-btn.primary:hover { background: var(--accent-hover); }

    /* ===== TOAST ===== */
    .toast-container {
      position: fixed; left: 0; right: 0; top: calc(var(--safe-top) + var(--sp-4));
      display: flex; flex-direction: column; align-items: center; gap: var(--sp-2);
      pointer-events: none; z-index: 200;
    }
    .toast {
      pointer-events: auto;
      background: var(--surface); color: var(--text); border: 1px solid var(--border-strong);
      border-radius: var(--r-md); padding: var(--sp-3) var(--sp-4);
      box-shadow: var(--shadow-toast); font-size: 14px;
      display: flex; align-items: center; gap: var(--sp-3); max-width: 90vw;
      animation: toastIn var(--dur-base) var(--ease);
      position: relative; overflow: hidden;
    }
    .toast::after {
      content: ''; position: absolute; left: 0; bottom: 0; height: 2px;
      background: var(--accent); animation: toastProgress 5s linear forwards;
    }
    .toast.fade { animation: toastOut var(--dur-base) var(--ease) forwards; }
    .toast .undo-btn {
      background: transparent; border: 0; color: var(--accent); font-weight: 600;
      padding: var(--sp-1) var(--sp-2); border-radius: var(--r-sm);
    }
    .toast .undo-btn:hover { background: var(--accent-subtle); }
    @keyframes toastIn { from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes toastOut { to { opacity: 0; transform: translateY(-12px); } }
    @keyframes toastProgress { to { right: 100%; left: auto; width: 0; } }

    /* ===== PTR ===== */
    .ptr-indicator {
      position: fixed; top: 0; left: 50%; transform: translate(-50%, -100%);
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 0 0 var(--r-sm) var(--r-sm); padding: var(--sp-1) var(--sp-3);
      font-size: 12px; color: var(--text-muted); transition: transform var(--dur-base) var(--ease); z-index: 30;
    }
    .ptr-indicator.show { transform: translate(-50%, 0); }

    .empty { color: var(--text-muted); font-style: italic; font-size: 13px; padding: var(--sp-2) 0; }
  </style>
</head>
<body>
  <div class="layout">

    <aside class="sidebar">
      <div class="sidebar-brand"><span class="brand">Home Brain</span></div>
      <nav class="sidebar-nav">
        <button class="nav-btn active" data-section="home"><span class="nav-icon">🏠</span><span>Home</span></button>
        <button class="nav-btn" data-section="activity"><span class="nav-icon">📋</span><span>Activity</span></button>
        <button class="nav-btn" data-section="search"><span class="nav-icon">🔍</span><span>Search</span></button>
      </nav>
    </aside>

    <main class="main">
      <header class="topbar">
        <span class="brand">Home Brain</span>
        <button class="theme-btn" id="theme-btn" aria-label="Cycle theme">◐</button>
      </header>

      <section class="section active" data-section="home">
        <div class="hero-status" id="hero-status" role="status" aria-live="polite">
          <span class="hero-dot"></span><span class="hero-summary">…</span><span class="hero-time"></span>
        </div>
        <div class="schedule-chips" id="schedule-chips"></div>

        <div class="scenes" id="scenes-primary"></div>
        <div class="scenes-more-row hidden" id="scenes-more"></div>

        <div class="command-card">
          <input class="command-input" id="msg-input" type="text"
            placeholder="say or type — 'play jazz in the kitchen'" autocomplete="off" />
          <button class="mic-btn" id="mic-btn" aria-label="Voice input" aria-pressed="false">🎙</button>
          <button class="send-btn" id="msg-send" aria-label="Send">➤</button>
        </div>
        <div id="msg-response" class="response" role="status" aria-live="polite"></div>

        <h2 class="section-label">Comfort</h2>
        <div id="climate-section"></div>
        <div id="comfort-rooms" class="rooms"></div>

        <h2 class="section-label">Entertainment</h2>
        <div id="entertainment-rooms" class="rooms"></div>

        <h2 class="section-label">Lighting</h2>
        <div id="lighting-rooms" class="rooms"></div>
      </section>

      <section class="section" data-section="activity">
        <h2 class="section-label">Recent activity</h2>
        <div id="activity-feed" class="activity-list"><div class="empty">no events yet</div></div>
      </section>

      <section class="section" data-section="search">
        <h2 class="section-label">Search</h2>
        <div class="command-card">
          <input class="command-input" id="search-input" type="text" placeholder="search rooms or devices…" />
        </div>
        <div id="search-results" class="search-results"></div>
      </section>
    </main>

    <aside class="desktop-rail">
      <div class="rail-card">
        <h3>Schedule</h3>
        <div id="rail-schedule"><div class="empty">no pending jobs</div></div>
      </div>
      <div class="rail-card">
        <h3>Recent activity</h3>
        <div id="rail-activity"><div class="empty">no events yet</div></div>
      </div>
    </aside>

  </div>

  <nav class="bottom-nav">
    <button class="nav-btn active" data-section="home"><span class="nav-icon">🏠</span><span>Home</span></button>
    <button class="nav-btn" data-section="activity"><span class="nav-icon">📋</span><span>Activity</span></button>
    <button class="nav-btn" data-section="search"><span class="nav-icon">🔍</span><span>Search</span></button>
  </nav>

  <div class="sheet-backdrop" id="sheet-backdrop"></div>
  <div class="sheet" id="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title"></div>
  <div class="toast-container" id="toasts" role="alert" aria-live="assertive"></div>
  <div class="ptr-indicator" id="ptr">↓ pull to refresh</div>

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
let CURRENT_SECTION = 'home';
let LAST_UNDO = null;          // { snapshot, label, commands }
let OPTIMISTIC = {};            // overlay over WORLD
const FIRST_CLASS_SCENES = new Set(['good morning', 'movie night', 'goodnight']);
const ENTERTAINMENT = new Set(['music', 'av', 'tv']);
const COMFORT = new Set(['hot_tub', 'pool', 'skylight']);

// ===== THEME =====
const THEMES = ['system', 'dark', 'light'];
function applyTheme(t) {
  const root = document.documentElement;
  if (t === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', t);
  }
  $('theme-btn').textContent = t === 'light' ? '☀' : t === 'dark' ? '🌙' : '◐';
}
let theme = localStorage.getItem('hb-theme') || 'dark';
applyTheme(theme);
$('theme-btn').addEventListener('click', () => {
  theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
  localStorage.setItem('hb-theme', theme);
  applyTheme(theme);
});

// ===== ICONS =====
const ICONS = { music: '🎵', lights: '💡', skylight: '🌤', av: '📺', tv: '📺', hot_tub: '🛁', pool: '🏊', climate: '🌡' };
const iconFor = (d) => ICONS[d] ?? (d.startsWith('hvac') ? '🌡' : '•');

// ===== TOASTS =====
function toast(msg, opts = {}) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = '<span>' + esc(msg) + '</span>' + (opts.undo ? '<button class="undo-btn">Undo</button>' : '');
  $('toasts').appendChild(el);
  if (opts.undo) {
    el.querySelector('.undo-btn').addEventListener('click', () => {
      opts.undo();
      dismiss();
    });
  }
  const dismiss = () => { el.classList.add('fade'); setTimeout(() => el.remove(), 200); };
  const timeout = setTimeout(dismiss, opts.duration || 5000);
  el.addEventListener('mouseenter', () => clearTimeout(timeout));
}

// ===== STATE merge (for optimistic updates) =====
function getState(slug, device) {
  const o = OPTIMISTIC[slug + '/' + device];
  const s = WORLD[slug]?.[device];
  if (!o) return s;
  // Merge optimistic over real
  return { ...s, state: { ...(s?.state ?? {}), ...o } };
}
function applyOptimistic(slug, device, patch) {
  OPTIMISTIC[slug + '/' + device] = { ...(OPTIMISTIC[slug + '/' + device] ?? {}), ...patch };
  renderAll();
}
function clearOptimistic() { OPTIMISTIC = {}; }

// ===== SEND =====
async function send(text, opts = {}) {
  if (!text) return null;
  if (!opts.silent) {
    $('msg-response').classList.add('show');
    $('msg-response').classList.remove('error');
    $('msg-response').textContent = '…';
  }
  try {
    const r = await fetch('/message', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const data = await r.json();
    if (!opts.silent) {
      $('msg-response').classList.toggle('error', !data.ok);
      $('msg-response').innerHTML = esc(data.response) +
        '<span class="meta">' + esc(data.route) + ' · ' + data.latencyMs + 'ms · ' + (data.toolCalls?.length ?? 0) + ' call(s)</span>';
    }
    refresh();
    return data;
  } catch (err) {
    if (!opts.silent) {
      $('msg-response').classList.add('error');
      $('msg-response').textContent = 'error: ' + err.message;
    }
    return null;
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
window.snoozeJob = async (id, by) => {
  const r = await fetch('/schedule/' + id + '/snooze', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ by_minutes: by }),
  });
  if (r.ok) { toast('Snoozed ' + by + ' min'); renderSchedule(); }
};

// ===== VOICE =====
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SR) {
  const rec = new SR();
  rec.continuous = false; rec.interimResults = true; rec.lang = 'en-US';
  $('mic-btn').addEventListener('click', () => {
    const btn = $('mic-btn');
    if (btn.classList.contains('listening')) { rec.stop(); return; }
    btn.classList.add('listening');
    btn.setAttribute('aria-pressed', 'true');
    try { rec.start(); } catch {}
  });
  rec.onresult = (e) => {
    const txt = Array.from(e.results).map(r => r[0].transcript).join('');
    $('msg-input').value = txt;
    if (e.results[e.results.length-1].isFinal) {
      $('mic-btn').classList.remove('listening');
      $('mic-btn').setAttribute('aria-pressed', 'false');
      sendMessage();
    }
  };
  const stop = () => { $('mic-btn').classList.remove('listening'); $('mic-btn').setAttribute('aria-pressed', 'false'); };
  rec.onerror = stop; rec.onend = stop;
} else {
  $('mic-btn').style.display = 'none';
}

// ===== NAV =====
function switchSection(name) {
  CURRENT_SECTION = name;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.section === name));
  document.querySelectorAll('.section').forEach(s => s.classList.toggle('active', s.dataset.section === name));
}
document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => switchSection(b.dataset.section)));

// ===== ROOM CLASSIFICATION =====
function isHvacOnly(slug) {
  const devs = HOUSE.rooms[slug]?.devices ?? [];
  return devs.length > 0 && devs.every(d => d.startsWith('hvac_') || d === 'climate');
}
function roomGroup(slug) {
  const devs = HOUSE.rooms[slug].devices;
  if (devs.some(d => ENTERTAINMENT.has(d))) return 'entertainment';
  if (devs.some(d => COMFORT.has(d))) return 'comfort';
  if (devs.includes('lights')) return 'lighting';
  return null;
}
function isRoomActive(slug) {
  const ws = WORLD[slug] || {};
  for (const [d, msg] of Object.entries(ws)) {
    const s = msg?.state ?? {};
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
  for (const msg of Object.values(ws)) if (msg?.online !== false) return true;
  return Object.keys(ws).length === 0; // unknown = treat online so we show
}

// ===== STATUS HERO =====
function renderHero() {
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const clauses = [];
  for (const slug of Object.keys(HOUSE?.rooms ?? {})) {
    const label = HOUSE.rooms[slug].label;
    const ws = WORLD[slug] || {};
    for (const [d, msg] of Object.entries(ws)) {
      const s = msg?.state ?? {};
      if (d === 'music' && (s.playState === 'PLAYING' || s.playing === true)) {
        const t = s.track ?? 'Music';
        clauses.push(t + ' in ' + label);
      } else if (d === 'av' && s.power === true) {
        clauses.push((s.current_source ?? 'AV') + ' in ' + label);
      } else if ((d === 'hot_tub' || d === 'pool') && (s.mode === 'heat' || s.heater_on === true)) {
        clauses.push((d === 'hot_tub' ? 'Hot tub' : 'Pool') + ' heating to ' + (s.target_f ?? '?') + '°');
      } else if (d.startsWith('hvac_') && (s.hvac_state === 'heating' || s.hvac_state === 'cooling')) {
        clauses.push(label + ' ' + s.hvac_state);
      } else if (d === 'skylight' && s.open === true) {
        clauses.push(label + ' skylight open');
      }
    }
  }
  const active = clauses.length > 0;
  const summary = active ? clauses.slice(0, 3).join(' · ') : 'All quiet';
  $('hero-status').innerHTML =
    '<span class="hero-dot' + (active ? ' active' : '') + '"></span>' +
    '<span class="hero-summary">' + esc(summary) + '</span>' +
    '<span class="hero-time">' + esc(time) + '</span>';
}

// ===== SCHEDULE CHIPS + RAIL =====
let SCHEDULE = [];
async function renderSchedule() {
  try {
    const { jobs } = await (await fetch('/schedule')).json();
    SCHEDULE = jobs;
  } catch { SCHEDULE = []; }

  // mobile chips: next 2
  const chips = SCHEDULE.slice(0, 2).map(j => {
    const label = j.label || j.actions.map(a => prettifyAction(a)).join(' + ');
    const when = new Date(j.fireAt);
    const dueSoon = (when.getTime() - Date.now()) < 30 * 60_000;
    const local = humanTime(when);
    const recur = j.recurrence ? '<span class="badge">' + esc(j.recurrence) + '</span>' : '';
    return '<div class="chip' + (dueSoon ? ' due-soon' : '') + '">' +
      '<span class="chip-label">' + esc(label) + '</span>' + recur +
      '<span class="chip-time">' + esc(local) + '</span>' +
      '<button class="chip-action" title="snooze 15m" onclick="snoozeJob(' + jstr(j.id) + ', 15)">+15</button>' +
      '<button class="chip-action" title="cancel" onclick="cancelJob(' + jstr(j.id) + ')">×</button>' +
    '</div>';
  }).join('');
  $('schedule-chips').innerHTML = chips;

  // desktop rail: next 5
  const rail = SCHEDULE.length ? SCHEDULE.slice(0, 5).map(j => {
    const label = j.label || j.actions.map(a => prettifyAction(a)).join(' + ');
    const when = new Date(j.fireAt);
    const recur = j.recurrence ? '<span class="badge">' + esc(j.recurrence) + '</span>' : '';
    return '<div class="rail-job"><div class="rail-job-meta">' +
      '<div class="rail-job-label">' + esc(label) + recur + '</div>' +
      '<div class="rail-job-time">' + esc(humanTime(when)) + '</div></div>' +
      '<button class="btn-icon" onclick="snoozeJob(' + jstr(j.id) + ', 15)">+15</button>' +
      '<button class="btn-icon" onclick="cancelJob(' + jstr(j.id) + ')">×</button></div>';
  }).join('') : '<div class="empty">no pending jobs</div>';
  $('rail-schedule').innerHTML = rail;
}
function humanTime(d) {
  const ms = d.getTime() - Date.now();
  if (Math.abs(ms) < 60 * 60_000) {
    const m = Math.round(ms / 60_000);
    return m === 0 ? 'now' : m > 0 ? 'in ' + m + 'm' : (-m) + 'm ago';
  }
  return d.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}
function prettifyAction(a) {
  // strip slug-y tool names into plain language
  const map = { set_lights: 'Lights', set_music: 'Music', set_climate: 'Climate',
    set_skylight: 'Skylight', control_av: 'AV', run_scene: 'Scene', run_c4_scene: 'Scene' };
  return map[a.tool] || a.tool.replace(/_/g, ' ');
}

// ===== SCENES =====
function renderScenes() {
  const all = HOUSE?.quick_actions ?? [];
  const primary = all.filter(a => FIRST_CLASS_SCENES.has(a.label.toLowerCase()));
  const more = all.filter(a => !FIRST_CLASS_SCENES.has(a.label.toLowerCase()));
  const tile = (a) => '<button class="scene-tile" onclick="fireScene(' + jstr(a.label) + ', ' + jstr(a.message) + ')" aria-label="Activate ' + esc(a.label) + '">' +
    (a.icon ? '<span class="scene-glyph" aria-hidden="true">' + esc(a.icon) + '</span>' : '') +
    '<span class="scene-label">' + esc(a.label) + '</span></button>';
  // first-class first, then a "More" tile that toggles the more row
  const moreBtn = more.length ? '<button class="scene-tile scene-more" onclick="document.getElementById(\'scenes-more\').classList.toggle(\'hidden\')" aria-label="More scenes"><span class="scene-glyph" aria-hidden="true">⋯</span><span class="scene-label">More</span></button>' : '';
  $('scenes-primary').innerHTML = primary.map(tile).join('') + moreBtn;
  $('scenes-more').innerHTML = more.map(tile).join('');
}
window.fireScene = async (label, message) => {
  const snapshot = JSON.parse(JSON.stringify(WORLD));
  LAST_UNDO = { snapshot, label, kind: 'scene' };
  await send(message, { silent: true });
  toast('Activated ' + label, { undo: () => doUndo(snapshot, label) });
};

// ===== UNDO =====
function doUndo(snapshot, label) {
  // Walk the snapshot vs current state, send restoration commands.
  const cmds = [];
  for (const [slug, devs] of Object.entries(snapshot)) {
    const roomLabel = (HOUSE.rooms[slug]?.label || slug).toLowerCase();
    for (const [d, msg] of Object.entries(devs)) {
      const before = msg?.state ?? {};
      const after = WORLD[slug]?.[d]?.state ?? {};
      if (d === 'lights') {
        const wasOn = before.on === true;
        const isOn = after.on === true;
        if (wasOn && !isOn) cmds.push('turn the ' + roomLabel + ' lights to ' + (before.brightness ?? 80) + '%');
        else if (!wasOn && isOn) cmds.push('turn off the ' + roomLabel + ' lights');
        else if (wasOn && isOn && before.brightness !== after.brightness)
          cmds.push('set the ' + roomLabel + ' lights to ' + (before.brightness ?? 80) + '%');
      } else if (d === 'music') {
        const wasPlay = before.playState === 'PLAYING';
        const isPlay = after.playState === 'PLAYING';
        if (wasPlay && !isPlay) cmds.push('resume music in the ' + roomLabel);
        else if (!wasPlay && isPlay) cmds.push('pause music in the ' + roomLabel);
      } else if (d === 'av') {
        if (before.power && !after.power) cmds.push('watch ' + (before.current_source ?? 'apple tv') + ' in the ' + roomLabel);
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

// ===== CLIMATE CARD =====
function renderClimate() {
  if (!HOUSE) return;
  const slugs = Object.keys(HOUSE.rooms).filter(isHvacOnly);
  if (!slugs.length) { $('climate-section').innerHTML = ''; return; }
  const zones = slugs.flatMap(slug => HOUSE.rooms[slug].devices.map(d => ({
    slug, device: d,
    label: HOUSE.rooms[slug].label.replace(/ HVAC$/i, ''),
    state: getState(slug, d)?.state ?? {},
  })));
  const html = zones.map(z => {
    const cur = z.state.current_f;
    const heat = z.state.heat_setpoint_f;
    const cool = z.state.cool_setpoint_f;
    const mode = z.state.mode || 'off';
    const hvac = z.state.hvac_state || 'idle';
    const cls = hvac === 'cooling' ? ' cooling' : hvac === 'heating' ? ' heating' : '';
    const pretty = z.slug.replace(/_/g, ' ').replace(/ hvac$/i, '');
    return '<div class="climate-zone' + cls + '" onclick="openSheet(' + jstr(z.slug) + ')" role="button" tabindex="0" aria-label="' + esc(z.label) + ' climate, currently ' + (cur != null ? cur + ' degrees' : 'unknown') + '">' +
      '<div class="cz-head"><span class="cz-name">' + esc(z.label) + '</span><span class="cz-mode">' + esc(mode) + (hvac !== 'idle' ? ' · ' + hvac : '') + '</span></div>' +
      '<div class="cz-temp">' + (cur != null ? cur + '°' : '—') + '</div>' +
      '<div class="cz-setpoints"><span>▲ ' + (heat ?? '—') + '°</span><span>▼ ' + (cool ?? '—') + '°</span></div>' +
      '<div class="cz-controls" onclick="event.stopPropagation()">' +
        '<button class="btn-icon" aria-label="cooler" onclick="optimisticTempStep(' + jstr(z.slug) + ', ' + jstr(z.device) + ', -2)">−</button>' +
        '<button class="btn-icon" aria-label="warmer" onclick="optimisticTempStep(' + jstr(z.slug) + ', ' + jstr(z.device) + ', 2)">+</button>' +
      '</div>' +
    '</div>';
  }).join('');
  $('climate-section').innerHTML = '<div class="climate-card"><div class="climate-zones">' + html + '</div></div>';
}
window.optimisticTempStep = (slug, device, delta) => {
  const cur = getState(slug, device)?.state ?? {};
  const newCool = Math.max(60, Math.min(85, (cur.cool_setpoint_f ?? 75) + delta));
  applyOptimistic(slug, device, { cool_setpoint_f: newCool });
  const pretty = slug.replace(/_/g, ' ').replace(/ hvac$/i, '');
  send((delta > 0 ? 'raise' : 'lower') + ' the ' + pretty + ' temperature by ' + Math.abs(delta), { silent: true });
};

// ===== ROOM CARDS =====
function renderRoomCard(slug) {
  const room = HOUSE.rooms[slug];
  // Pick up to 3 device rows, prioritising "interesting" ones
  const order = ['music', 'av', 'lights', 'tv', 'skylight', 'hot_tub', 'pool'];
  const devs = [...room.devices].sort((a, b) => {
    const oa = order.indexOf(a); const ob = order.indexOf(b);
    return (oa === -1 ? 99 : oa) - (ob === -1 ? 99 : ob);
  }).slice(0, 3);
  const rows = devs.map(d => renderDeviceRow(slug, d, getState(slug, d))).filter(Boolean).join('');
  if (!rows) return '';
  const active = isRoomActive(slug);
  const cls = 'room' + (active ? ' has-active' : ' all-off');
  return '<div class="' + cls + '">' +
    '<div class="room-head" onclick="openSheet(' + jstr(slug) + ')" role="button" tabindex="0" aria-label="Open ' + esc(room.label) + '">' +
      '<span class="room-name">' + esc(room.label) + '</span>' +
      '<span class="room-tags">' + devs.length + (room.devices.length > devs.length ? '/' + room.devices.length : '') + '</span>' +
    '</div>' + rows + '</div>';
}

function renderDeviceRow(slug, device, msg) {
  const icon = iconFor(device);
  const state = msg?.state ?? {};
  const offline = msg && msg.online === false;
  const pretty = HOUSE.rooms[slug].label.toLowerCase();
  let title = device.replace(/_/g, ' '), detail = '—', controls = '', on = false;

  if (device === 'music') {
    const playing = state.playState === 'PLAYING' || state.playing === true;
    on = playing;
    title = playing ? 'Playing' : (state.track ? 'Paused' : 'Music');
    detail = state.track ? ((state.artist ? state.artist + ' · ' : '') + state.track) : ('volume ' + (state.volume ?? '—'));
    controls = stopProp(
      iconBtn(playing ? '⏸' : '▶', (playing ? 'pause' : 'resume') + ' music in the ' + pretty) +
      iconBtn('−', 'lower the ' + pretty + ' music volume by 10') +
      iconBtn('+', 'raise the ' + pretty + ' music volume by 10')
    );
  } else if (device === 'lights') {
    on = state.on;
    title = 'Lights';
    detail = state.on ? ((state.brightness ?? '?') + '%') : 'off';
    controls = stopProp(
      iconBtn('off', 'turn off the ' + pretty + ' lights') +
      iconBtn('30%', 'dim the ' + pretty + ' lights to 30') +
      iconBtn('on', 'turn on the ' + pretty + ' lights', 'primary')
    );
  } else if (device === 'skylight') {
    on = state.open;
    title = 'Skylight';
    detail = state.open ? 'open' : 'closed';
    controls = stopProp(
      iconBtn('close', 'close the ' + pretty + ' skylight') +
      iconBtn('open', 'open the ' + pretty + ' skylight', state.open ? '' : 'primary')
    );
  } else if (device === 'av') {
    on = state.power;
    title = state.power ? 'AV — ' + (state.current_source || 'on') : 'AV';
    detail = state.power ? ('vol ' + (state.volume ?? '—')) : 'off';
    controls = stopProp(state.power
      ? iconBtn('off', 'turn off the ' + pretty)
      : iconBtn('ATV', 'watch apple tv in the ' + pretty, 'primary'));
  } else if (device === 'hot_tub' || device === 'pool') {
    on = state.mode === 'heat' || state.heater_on === true;
    const name = device === 'hot_tub' ? 'hot tub' : 'pool';
    title = device === 'hot_tub' ? 'Hot tub' : 'Pool';
    detail = state.current_f != null ? (state.current_f + '° → ' + (state.target_f ?? '—') + '°') : (state.mode || '—');
    controls = stopProp(
      iconBtn('off', 'turn the ' + name + ' off') +
      iconBtn('warm', 'warm the ' + name + ' to ' + (device === 'hot_tub' ? 102 : 85), on ? '' : 'primary')
    );
  } else if (device === 'tv') {
    on = state.on;
    title = 'TV';
    detail = state.on ? (state.app || state.input || 'on') : 'off';
    controls = stopProp(state.on
      ? iconBtn('off', 'turn off the ' + pretty + ' tv')
      : iconBtn('on', 'turn on the ' + pretty + ' tv', 'primary'));
  } else if (device.startsWith('hvac_') || device === 'climate') {
    // shouldn't show here normally (HVAC rooms go to Climate card)
    return '';
  }

  const offlineBadge = offline ? '<span class="offline-dot" title="offline"></span>' : '';
  return '<div class="device-row">' +
    '<div class="device-icon ' + (on ? 'on' : '') + '" aria-hidden="true">' + icon + '</div>' +
    '<div class="device-meta">' +
      '<div class="device-title ' + (on ? 'on' : '') + '">' + esc(title) + offlineBadge + '</div>' +
      '<div class="device-detail">' + esc(detail) + '</div>' +
    '</div>' +
    '<div class="device-controls">' + controls + '</div>' +
  '</div>';
}
function iconBtn(label, cmd, cls = '') {
  return '<button class="btn-icon ' + cls + '" onclick="quickSend(' + jstr(cmd) + ')">' + esc(label) + '</button>';
}
const stopProp = (html) => html.replaceAll('onclick="', 'onclick="event.stopPropagation();');

function renderRooms() {
  if (!HOUSE) return;
  const slugs = Object.keys(HOUSE.rooms).filter(s => !isHvacOnly(s));
  const groups = { entertainment: [], comfort: [], lighting: [] };
  const hidden = { entertainment: [], comfort: [], lighting: [] };
  for (const slug of slugs) {
    const g = roomGroup(slug);
    if (!g) continue;
    const active = isRoomActive(slug);
    const online = isRoomOnline(slug);
    if (active || online) groups[g].push(slug);
    else hidden[g].push(slug);
  }
  // Active rooms first within each group
  for (const g of Object.keys(groups)) {
    groups[g].sort((a, b) => {
      const aa = isRoomActive(a) ? 0 : 1;
      const bb = isRoomActive(b) ? 0 : 1;
      if (aa !== bb) return aa - bb;
      return HOUSE.rooms[a].label.localeCompare(HOUSE.rooms[b].label);
    });
  }
  const render = (slugs, hiddenSlugs, container) => {
    const cards = slugs.map(renderRoomCard).filter(Boolean).join('');
    let html = cards;
    if (hiddenSlugs.length) {
      html += '<button class="more-rooms" onclick="this.previousElementSibling.parentElement.querySelector(\'.more-rooms-extra\')?.classList.toggle(\'hidden\') || (this.parentElement.insertAdjacentHTML(\'beforeend\', \'<div class=\\\'more-rooms-extra\\\'></div>\'), this.parentElement.querySelector(\'.more-rooms-extra\').innerHTML = window.__renderHiddenRooms(' + jstr(hiddenSlugs) + '))">+ ' + hiddenSlugs.length + ' more room' + (hiddenSlugs.length===1?'':'s') + '</button>';
    }
    container.innerHTML = html || '<div class="empty">no rooms in this group</div>';
  };
  render(groups.comfort, hidden.comfort, $('comfort-rooms'));
  render(groups.entertainment, hidden.entertainment, $('entertainment-rooms'));
  render(groups.lighting, hidden.lighting, $('lighting-rooms'));
}
window.__renderHiddenRooms = (slugs) => slugs.map(renderRoomCard).filter(Boolean).join('');

// ===== SHEET =====
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
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && CURRENT_SHEET) closeSheet(); });

function renderSheet() {
  if (!CURRENT_SHEET || !HOUSE) return;
  const room = HOUSE.rooms[CURRENT_SHEET];
  if (!room) { closeSheet(); return; }
  const blocks = room.devices.map(d => renderSheetBlock(CURRENT_SHEET, d, getState(CURRENT_SHEET, d))).filter(Boolean).join('');
  $('sheet').innerHTML =
    '<div class="sheet-handle"></div>' +
    '<div class="sheet-head">' +
      '<h2 class="sheet-title" id="sheet-title">' + esc(room.label) + '</h2>' +
      '<button class="sheet-close" onclick="closeSheet()" aria-label="Close">×</button>' +
    '</div>' +
    (blocks || '<div class="empty">no controllable devices in this room</div>');
}

function renderSheetBlock(slug, device, msg) {
  const state = msg?.state ?? {};
  const icon = iconFor(device);
  const pretty = HOUSE.rooms[slug].label.toLowerCase();
  let body = '', title = device.replace(/_/g, ' ');

  if (device === 'lights') {
    title = 'Lights';
    const b = state.brightness ?? 0;
    body =
      '<div class="slider-row"><label>Brightness</label>' +
      '<input type="range" min="0" max="100" value="' + b + '" oninput="document.getElementById(\'lb-' + slug + '\').textContent = this.value + \'%\'" onchange="setLightSlider(' + jstr(slug) + ', this.value)" aria-label="brightness" />' +
      '<span class="val" id="lb-' + slug + '">' + b + '%</span></div>' +
      '<div class="source-grid">' +
        '<button class="pill-btn" onclick="quickSend(' + jstr('turn off the ' + pretty + ' lights') + ')">Off</button>' +
        '<button class="pill-btn primary" onclick="quickSend(' + jstr('turn on the ' + pretty + ' lights') + ')">On</button>' +
      '</div>';
  } else if (device === 'music') {
    title = 'Music';
    const v = state.volume ?? 25;
    const playing = state.playState === 'PLAYING';
    body =
      '<div class="device-detail" style="font-family:var(--font-ui); font-size:13px; color:var(--text-secondary); margin-bottom: var(--sp-3)">' + esc(state.track ? ((state.artist ? state.artist + ' · ' : '') + state.track) : 'nothing playing') + '</div>' +
      '<div class="slider-row"><label>Volume</label>' +
      '<input type="range" min="0" max="100" value="' + v + '" oninput="document.getElementById(\'mv-' + slug + '\').textContent = this.value" onchange="setMusicVolume(' + jstr(slug) + ', this.value)" aria-label="volume" />' +
      '<span class="val" id="mv-' + slug + '">' + v + '</span></div>' +
      '<div class="source-grid" style="grid-template-columns: repeat(3, 1fr)">' +
        '<button class="pill-btn" onclick="quickSend(' + jstr('previous track in the ' + pretty) + ')">⏮</button>' +
        '<button class="pill-btn primary" onclick="quickSend(' + jstr((playing?'pause':'resume')+' music in the '+pretty) + ')">' + (playing?'Pause':'Play') + '</button>' +
        '<button class="pill-btn" onclick="quickSend(' + jstr('next track in the ' + pretty) + ')">⏭</button>' +
      '</div>';
  } else if (device === 'skylight') {
    title = 'Skylight';
    body =
      '<div class="device-detail" style="font-family:var(--font-ui); font-size:13px; margin-bottom: var(--sp-3)">' + (state.open ? 'open' : 'closed') + '</div>' +
      '<div class="source-grid">' +
        '<button class="pill-btn" onclick="quickSend(' + jstr('close the ' + pretty + ' skylight') + ')">Close</button>' +
        '<button class="pill-btn primary" onclick="quickSend(' + jstr('open the ' + pretty + ' skylight') + ')">Open</button>' +
      '</div>';
  } else if (device === 'av') {
    title = 'AV';
    body =
      '<div class="device-detail" style="font-family:var(--font-ui); font-size:13px; margin-bottom: var(--sp-3)">' + (state.power ? 'on · ' + (state.current_source || '—') + ' · vol ' + (state.volume ?? '—') : 'off') + '</div>' +
      '<div class="source-grid">' +
        '<button class="pill-btn" onclick="quickSend(' + jstr('watch apple tv in the ' + pretty) + ')">Apple TV</button>' +
        '<button class="pill-btn" onclick="quickSend(' + jstr('watch xfinity in the ' + pretty) + ')">Xfinity</button>' +
        '<button class="pill-btn" onclick="quickSend(' + jstr('watch UHD in the ' + pretty) + ')">UHD</button>' +
        '<button class="pill-btn" onclick="quickSend(' + jstr('turn off the ' + pretty) + ')">Off</button>' +
      '</div>' +
      (state.power ? '<div class="slider-row"><label>Volume</label>' +
        '<input type="range" min="0" max="100" value="' + (state.volume ?? 30) + '" onchange="setAvVolume(' + jstr(slug) + ', this.value)" aria-label="volume" />' +
        '<span class="val">' + (state.volume ?? 30) + '</span></div>' : '');
  } else if (device.startsWith('hvac_') || device === 'climate') {
    title = 'Climate';
    const heat = state.heat_setpoint_f ?? 68;
    const cool = state.cool_setpoint_f ?? 75;
    body =
      '<div class="device-detail" style="font-family:var(--font-ui); font-size:13px; margin-bottom: var(--sp-3)">' + (state.current_f != null ? state.current_f + '° · ' + (state.mode || 'off') + ' · ' + (state.hvac_state || 'idle') : '—') + '</div>' +
      '<div class="slider-row"><label>Heat</label>' +
      '<input type="range" min="55" max="85" value="' + heat + '" oninput="document.getElementById(\'h-' + slug + '\').textContent = this.value + \'°\'" onchange="setHeatSetpoint(' + jstr(slug) + ', this.value)" aria-label="heat setpoint" />' +
      '<span class="val" id="h-' + slug + '">' + heat + '°</span></div>' +
      '<div class="slider-row"><label>Cool</label>' +
      '<input type="range" min="60" max="90" value="' + cool + '" oninput="document.getElementById(\'c-' + slug + '\').textContent = this.value + \'°\'" onchange="setCoolSetpoint(' + jstr(slug) + ', this.value)" aria-label="cool setpoint" />' +
      '<span class="val" id="c-' + slug + '">' + cool + '°</span></div>' +
      '<div class="source-grid" style="grid-template-columns: repeat(4, 1fr)">' +
        '<button class="pill-btn" onclick="quickSend(' + jstr('set ' + pretty + ' to heat mode') + ')">Heat</button>' +
        '<button class="pill-btn" onclick="quickSend(' + jstr('set ' + pretty + ' to cool mode') + ')">Cool</button>' +
        '<button class="pill-btn" onclick="quickSend(' + jstr('set ' + pretty + ' to auto mode') + ')">Auto</button>' +
        '<button class="pill-btn" onclick="quickSend(' + jstr('turn off ' + pretty) + ')">Off</button>' +
      '</div>';
  } else if (device === 'hot_tub' || device === 'pool') {
    title = device === 'hot_tub' ? 'Hot tub' : 'Pool';
    const t = state.target_f ?? (device === 'hot_tub' ? 102 : 85);
    const name = device === 'hot_tub' ? 'hot tub' : 'pool';
    body =
      '<div class="device-detail" style="font-family:var(--font-ui); font-size:13px; margin-bottom: var(--sp-3)">' + (state.current_f != null ? state.current_f + '° → ' + (state.target_f ?? '—') + '°' : (state.mode || '—')) + '</div>' +
      '<div class="slider-row"><label>Target</label>' +
      '<input type="range" min="60" max="' + (device==='hot_tub'?104:90) + '" value="' + t + '" oninput="document.getElementById(\'t-' + slug + '\').textContent = this.value + \'°\'" onchange="quickSend(\'warm the ' + name + ' to \' + this.value)" aria-label="target temperature" />' +
      '<span class="val" id="t-' + slug + '">' + t + '°</span></div>' +
      '<div class="source-grid">' +
        '<button class="pill-btn" onclick="quickSend(' + jstr('turn the ' + name + ' off') + ')">Off</button>' +
        '<button class="pill-btn primary" onclick="quickSend(' + jstr('warm the ' + name + ' to ' + t) + ')">Heat</button>' +
      '</div>';
  } else {
    return '';
  }

  return '<div class="sheet-block">' +
    '<div class="sheet-block-head"><span aria-hidden="true">' + icon + '</span><span class="sheet-block-title">' + esc(title) + '</span></div>' +
    body + '</div>';
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
  // Translate raw state events into plain language
  if (e.kind.startsWith('state:')) {
    const path = e.kind.slice(6);
    const [slug, device] = path.split('/');
    const label = HOUSE?.rooms[slug]?.label || slug;
    const s = e.payload?.state ?? {};
    let text = null;
    if (device === 'music') {
      if (s.playState === 'PLAYING' || s.playing === true) text = 'music started' + (s.track ? ' · ' + s.track : '');
      else if (s.playState === 'PAUSED_PLAYBACK' || s.playing === false) text = 'music paused';
      else if (typeof s.volume === 'number') text = 'music volume → ' + s.volume;
    } else if (device === 'lights') {
      if (s.on === true) text = 'lights → ' + (s.brightness ?? '?') + '%';
      else if (s.on === false) text = 'lights off';
    } else if (device === 'skylight') text = s.open ? 'skylight opened' : 'skylight closed';
    else if (device === 'av') text = s.power ? 'watching ' + (s.current_source || 'AV') : 'AV off';
    else if (device === 'tv') text = s.on ? 'TV on' : 'TV off';
    else if (device === 'hot_tub' || device === 'pool') text = s.target_f != null ? 'target ' + s.target_f + '°' : (s.mode || 'updated');
    else if (device.startsWith('hvac') || device === 'climate') {
      if (s.hvac_state === 'heating' || s.hvac_state === 'cooling') text = s.hvac_state;
      else if (s.mode) text = 'mode → ' + s.mode;
    }
    if (!text) return null;
    return { ts, room: label, text };
  }
  if (e.kind === 'event:schedule_fired') {
    return { ts, room: 'Schedule', text: (e.payload?.action || 'job') + ' fired' + (e.payload?.ok === false ? ' (failed)' : '') };
  }
  if (e.kind === 'event:schedule_cancelled') return { ts, room: 'Schedule', text: 'job cancelled' };
  if (e.kind === 'event:schedule_snoozed') return { ts, room: 'Schedule', text: 'snoozed ' + (e.payload?.by_minutes ?? '?') + 'm' };
  return null;
}

async function renderActivity() {
  try {
    const { events } = await (await fetch('/events?limit=40')).json();
    // toast on new schedule_fired
    for (const e of events) {
      const t = new Date(e.ts).getTime();
      if (t > LAST_EVENT_TS && e.kind === 'event:schedule_fired') {
        toast('⏰ ' + (e.payload?.action || 'Job') + ' fired');
      }
    }
    if (events.length) LAST_EVENT_TS = Math.max(...events.map(e => new Date(e.ts).getTime()));
    const items = events.map(translateEvent).filter(Boolean);
    const html = items.length ? items.map(i =>
      '<div class="activity-item"><span class="activity-time">' + esc(i.ts) + '</span>' +
      '<span class="activity-text"><span class="activity-room">' + esc(i.room) + '</span> · ' + esc(i.text) + '</span></div>'
    ).join('') : '<div class="empty">no events yet</div>';
    $('activity-feed').innerHTML = html;
    $('rail-activity').innerHTML = items.length ? items.slice(0, 8).map(i =>
      '<div class="rail-event"><span class="activity-time">' + esc(i.ts) + '</span> ' +
      '<span class="activity-room">' + esc(i.room) + '</span> ' + esc(i.text) + '</div>'
    ).join('') : '<div class="empty">no events yet</div>';
  } catch {}
}

// ===== SEARCH =====
$('search-input')?.addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase().trim();
  const slugs = Object.keys(HOUSE?.rooms ?? {});
  const hits = q ? slugs.filter(s => HOUSE.rooms[s].label.toLowerCase().includes(q) || s.includes(q)) : [];
  $('search-results').innerHTML = hits.length
    ? hits.map(s => '<div class="search-item" onclick="openSheet(' + jstr(s) + '); switchSection(\'home\')" role="button" tabindex="0">' + esc(HOUSE.rooms[s].label) + ' <span style="color:var(--text-muted)">— ' + HOUSE.rooms[s].devices.length + ' device(s)</span></div>').join('')
    : (q ? '<div class="empty">no matches</div>' : '');
});

// ===== RENDER ALL =====
function renderAll() {
  renderHero();
  renderScenes();
  renderClimate();
  renderRooms();
  if (CURRENT_SHEET) renderSheet();
}

async function refresh() {
  try { WORLD = await (await fetch('/world')).json(); } catch {}
  // Drop optimistic overlays for keys that now match.
  for (const key of Object.keys(OPTIMISTIC)) {
    const [slug, d] = key.split('/');
    const real = WORLD[slug]?.[d]?.state ?? {};
    const opt = OPTIMISTIC[key];
    let allMatch = true;
    for (const k of Object.keys(opt)) {
      if (real[k] === undefined) { allMatch = false; break; }
      // tolerate small numeric drift for brightness/volume/temps
      if (typeof opt[k] === 'number' && typeof real[k] === 'number') {
        if (Math.abs(opt[k] - real[k]) > 0.5) { allMatch = false; break; }
      } else if (opt[k] !== real[k]) { allMatch = false; break; }
    }
    if (allMatch) delete OPTIMISTIC[key];
  }
  renderAll();
  renderSchedule();
  renderActivity();
}

async function init() {
  try {
    HOUSE = await (await fetch('/house')).json();
  } catch (err) {
    $('hero-status').innerHTML = '<span class="empty">house fetch failed</span>';
    return;
  }
  refresh();
  setInterval(refresh, 2000);
  // Hero clock updates separately so the time stays fresh between refreshes.
  setInterval(renderHero, 30_000);
}

// ===== PTR (mobile) =====
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
  if (last > 60) { refresh(); }
});

$('msg-send').addEventListener('click', sendMessage);
$('msg-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });

// Hidden dev mode: triple-tap the theme button to reveal metadata
let tapTimes = [];
$('theme-btn').addEventListener('dblclick', () => {
  document.body.classList.toggle('dev');
  toast(document.body.classList.contains('dev') ? 'dev mode on' : 'dev mode off');
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(()=>{}));
}

init();
</script>
</body>
</html>`;
