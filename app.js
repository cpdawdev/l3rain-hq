/*
 * L3RAIN HQ Command Center — dashboard application.
 *
 * Vanilla JS port of the original Claude-Artifact React/DC component
 * (preserved in legacy.html). No framework, no build step.
 *
 * Structure:
 *   1. CONFIG            — feed URL, poll interval, sim speed (URL-param overrides)
 *   2. Static world data — snapshot state, status vocabulary, rooms, desks, cast
 *   3. class L3RainHQ    — live feed + usage cap, side panel, simulation, canvas
 *   4. boot()            — runs after sprites.js thanks to `defer` ordering
 *
 * Sprite-face guarantee (the fix for the old intermittent blank faces):
 *   - index.html loads sprites.js and app.js with `defer`, so the browser
 *     executes sprites.js (defines window.L3RAIN_SPRITES) strictly before this
 *     file. There is no mount-before-data race by construction.
 *   - Every face image gets an onerror handler, and drawChar() falls back to an
 *     initials avatar until/unless the sprite is decoded. A face can be a
 *     sprite or initials — never blank.
 */
'use strict';

const TAU = Math.PI * 2;

/* ======================== 1. CONFIG ======================== */

// Single source of truth for the live feed endpoint (arch-docs Worker).
const FEED_URL = 'https://l3rain-arch-docs-stage.cpda-wdev.workers.dev/status.json';

// URL-param overrides mirror the old artifact's editor props:
//   ?feed=<url>  ?poll=<ms 1000-600000>  ?speed=<0.4-2.5>  ?shadows=0
const CONFIG = (() => {
  const q = new URLSearchParams(location.search);
  const num = (key, def, min, max) => {
    const v = parseFloat(q.get(key));
    return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
  };
  return {
    feedUrl: q.get('feed') || FEED_URL,
    pollMs: num('poll', 30000, 1000, 600000),
    speed: num('speed', 1, 0.4, 2.5),
    showShadows: q.get('shadows') !== '0'
  };
})();

/* ======================== 2. STATIC WORLD DATA ======================== */

// Embedded snapshot: shown until the live feed answers, and kept as the
// fallback whenever the feed is unreachable (same values the old bundle shipped).
const SNAPSHOT = {
  phases: [
    { name: 'PHASE 0 · PREPARATION', pct: 100 },
    { name: 'PHASE 1 · PLANNING', pct: 100 },
    { name: 'PHASE 2 · EXECUTION', pct: 62 },
    { name: 'PHASE 3 · VALIDATION', pct: 35 },
    { name: 'PHASE 4 · OPTIMIZATION', pct: 10 }
  ],
  departments: {
    orchestrator: 'working', engineering: 'working', infra: 'working',
    integrations: 'waiting', customer: 'idle', marketing: 'working', csuite: 'opening'
  },
  feed: [
    { k: 'Repo state', v: 'Syncing', c: '#4ade80' },
    { k: 'GH Actions', v: 'Running', c: '#4ade80' },
    { k: 'Resume-queue', v: 'Active', c: '#67e8f9' },
    { k: 'Waker', v: 'Armed', c: '#facc15' }
  ]
};

// ONLY the owner-defined status-light vocabulary — no per-department accent hues.
const STATUS = {
  working: { c: '#3ee06b', label: 'Working' },   // green
  error:   { c: '#ff4d5e', label: 'Error' },     // red
  waiting: { c: '#ffd23e', label: 'Waiting' },   // yellow
  idle:    { c: '#8b93a7', label: 'Idle' },      // gray
  opening: { c: '#ffffff', label: 'Opening' },   // white
  paused:  { c: '#6aa9d6', label: 'Paused' },    // token/rate limit — on break
  done:    { c: '#0b0e14', label: 'Finished' },  // black
  capped:  { c: '#ff8a2a', label: 'Capped' }     // orange — usage cap flips every room to this
};

const DEPT_NAMES = {
  orchestrator: 'Orchestrator', engineering: 'Engineering', infra: 'Infra & Ops',
  integrations: 'Integrations', customer: 'Customer', marketing: 'Marketing & Design',
  csuite: 'C-Suite'
};

// Isometric floor plan. rect = [x1, y1, x2, y2] in world units; dept rooms carry
// a status lamp + meeting point; social rooms carry break spots.
const ROOMS = {
  engineering: { name: 'ENGINEERING', rect: [0, 0, 52, 34], floor: '#cdd2db', dept: true, tallN: true, tallW: true,
    doors: [{ wall: 'S', c: 14, hall: { x: 14, y: 38, lane: 'H1' } }, { wall: 'S', c: 40, hall: { x: 40, y: 38, lane: 'H1' } }], meet: { x: 26, y: 29 } },
  infra: { name: 'INFRA & OPS', rect: [58, 0, 100, 34], floor: '#c8ccd6', dept: true, tallN: true, tallW: true,
    doors: [{ wall: 'S', c: 79, hall: { x: 79, y: 38, lane: 'H1' } }], meet: { x: 72, y: 20 } },
  integrations: { name: 'INTEGRATIONS', rect: [106, 0, 136, 34], floor: '#ccd0d9', dept: true, tallN: true, tallW: true,
    doors: [{ wall: 'S', c: 121, hall: { x: 121, y: 38, lane: 'H1' } }], meet: { x: 117, y: 26 } },
  lounge: { name: 'LOUNGE', rect: [0, 42, 22, 74], floor: '#cabfa8', tallW: true, tallN: true,
    doors: [{ wall: 'E', c: 58, hall: { x: 26, y: 58, lane: 'VL' } }],
    spots: [[6, 55], [14, 55], [10, 66]] },
  orchestrator: { name: 'ORCHESTRATOR', rect: [30, 42, 76, 74], floor: '#586488', dept: true, elev: 16,
    doors: [{ wall: 'W', c: 58, hall: { x: 26, y: 58, lane: 'VL' } }, { wall: 'E', c: 58, hall: { x: 80, y: 58, lane: 'VR' } }], meet: { x: 42, y: 68 } },
  cafeteria: { name: 'CAFETERIA', rect: [84, 42, 112, 74], floor: '#c9d1d3', tallN: true, tallW: true,
    doors: [{ wall: 'W', c: 58, hall: { x: 80, y: 58, lane: 'VR' } }, { wall: 'S', c: 98, hall: { x: 98, y: 78, lane: 'H2' } }],
    spots: [[89, 49], [93, 49], [106, 49], [92, 64], [104, 64]] },
  restroom: { name: 'RESTROOM', rect: [118, 42, 136, 74], floor: '#c6d0d4', tallN: true, tallW: true,
    doors: [{ wall: 'S', c: 127, hall: { x: 127, y: 78, lane: 'H2' } }],
    spots: [[123, 50], [131, 50]] },
  customer: { name: 'CUSTOMER', rect: [0, 82, 32, 110], floor: '#d0ccd4', dept: true, tallW: true, tallN: true,
    doors: [{ wall: 'N', c: 16, hall: { x: 16, y: 78, lane: 'H2' } }], meet: { x: 27, y: 88 } },
  reception: { name: 'COLLAB HUB', rect: [36, 82, 56, 110], floor: '#cbd0da', tallN: true, tallW: true,
    doors: [{ wall: 'N', c: 46, hall: { x: 46, y: 78, lane: 'H2' } }],
    spots: [[42, 92], [45, 92], [49, 99], [52, 99], [40, 103]] },
  marketing: { name: 'MARKETING & DESIGN', rect: [60, 82, 92, 110], floor: '#ccd1da', dept: true, tallN: true, tallW: true,
    doors: [{ wall: 'N', c: 76, hall: { x: 76, y: 78, lane: 'H2' } }], meet: { x: 86, y: 102 } },
  csuite: { name: 'C-SUITE', rect: [98, 82, 136, 110], floor: '#7a5a3c', dept: true, tallN: true, tallW: true,
    doors: [{ wall: 'N', c: 110, hall: { x: 110, y: 78, lane: 'H2' } }], meet: { x: 131, y: 88 } }
};

const HALLS = [[0, 34, 136, 42], [0, 74, 136, 82], [22, 42, 30, 74], [76, 42, 84, 74]];

const DESKS = {
  engineering: [[8, 10], [20, 10], [32, 10], [44, 10], [8, 24], [20, 24], [32, 24], [44, 24]],
  infra: [[66, 12], [79, 12], [92, 12], [66, 26], [79, 26], [92, 26]],
  integrations: [[112, 16], [121, 16], [130, 16]],
  customer: [[5, 96], [13, 96], [21, 96], [28, 96]],
  marketing: [[65, 96], [73, 96], [81, 96], [88, 96]],
  csuite: [[106, 90], [113, 90], [120, 90], [127, 90]],
  orchestrator: [[53, 57]]
};

// The agent-cpd-* cast: [role, character, role label, department, shirt, pants].
const CHARS = [
  ['orchestrator', 'SUNG JIN-WOO', 'Orchestrator', 'orchestrator', '#141420', '#141420'],
  ['architect', 'SENKU', 'Architect', 'engineering', '#e8e4d8', '#5a5f6b'],
  ['module-builder', 'EDWARD ELRIC', 'Module Builder', 'engineering', '#a32c26', '#2f2f33'],
  ['worker-builder', 'FRANKY', 'Worker Builder', 'engineering', '#d94f3d', '#274f8f'],
  ['frontend-builder', 'SAI', 'Frontend Builder', 'engineering', '#1b1c22', '#2c2d33'],
  ['data-modeler', 'KURAPIKA', 'Data Modeler', 'engineering', '#2e4f9e', '#d8d3c6'],
  ['ai-engineer', 'GOJO SATORU', 'AI Engineer', 'engineering', '#15161d', '#15161d'],
  ['test-author', 'LEVI', 'Test Author', 'engineering', '#b9a27e', '#e8e6df'],
  ['data-seeder', 'SANJI', 'Data Seeder', 'engineering', '#1c1d24', '#1c1d24'],
  ['devops', 'KISUKE URAHARA', 'DevOps', 'infra', '#264d3c', '#3a4438'],
  ['infrastructure', 'YAMATO', 'Infrastructure', 'infra', '#26324a', '#26324a'],
  ['provisioning', 'TRAFALGAR LAW', 'Provisioning', 'infra', '#e5c33c', '#2a3a63'],
  ['release-manager', 'REBORN', 'Release Manager', 'infra', '#191a20', '#191a20'],
  ['security-reviewer', 'ITACHI UCHIHA', 'Security Reviewer', 'infra', '#191a22', '#191a22'],
  ['resource-manager', 'NAMI', 'Resource Manager', 'infra', '#f2f0ea', '#3a67b0'],
  ['integrations-engineer', 'TANJIRO', 'Integrations Engineer', 'integrations', '#274d3c', '#1e2126'],
  ['email-specialist', 'FINRAL', 'Email Specialist', 'integrations', '#57683f', '#4c4438'],
  ['billing-specialist', 'ASKELADD', 'Billing Specialist', 'integrations', '#5a5f68', '#3f444c'],
  ['customer-success', 'MITSURI', 'Customer Success', 'customer', '#2b2530', '#2b2530'],
  ['support-engineer', 'THORFINN', 'Support Engineer', 'customer', '#7a5b3e', '#5b4632'],
  ['docs-writer', 'NICO ROBIN', 'Docs Writer', 'customer', '#6b3fa0', '#2b2d38'],
  ['compliance', 'RIZA HAWKEYE', 'Compliance', 'customer', '#2e3f66', '#2e3f66'],
  ['marketing-strategist', 'LELOUCH', 'Marketing Strategist', 'marketing', '#26262e', '#26262e'],
  ['marketing-writer', 'LIGHT YAGAMI', 'Marketing Writer', 'marketing', '#c9b490', '#54473a'],
  ['designer', 'MEI HATSUME', 'Designer', 'marketing', '#d96a4f', '#3d4148'],
  ['prospect-researcher', 'HANGE ZOË', 'Prospect Researcher', 'marketing', '#8a7355', '#8a7355'],
  ['ceo', 'ERWIN SMITH', 'CEO', 'csuite', '#b99a6b', '#e8e4d8'],
  ['cfo', 'NANAMI KENTO', 'CFO', 'csuite', '#c8b287', '#c8b287'],
  ['cio', 'ARMIN ARLERT', 'CIO', 'csuite', '#b99a6b', '#e8e4d8'],
  ['data-analyst', 'L', 'Data Analyst', 'csuite', '#f0f2f4', '#3a5b8c']
];

// Opening tableau so the office looks alive on first paint:
// [role, room ('hall' = corridor), x, y, state, dwell secs, facing, hall lane].
const CHOREO = [
  ['worker-builder', 'hall', 53.5, 38, 'chat', 26, 'right', 'H1'],
  ['infrastructure', 'hall', 56.5, 38, 'chat', 26, 'left', 'H1'],
  ['resource-manager', 'hall', 95, 37.5, 'break', 22, 'up', 'H1'],
  ['email-specialist', 'hall', 24, 78, 'break', 18, 'left', 'H2'],
  ['billing-specialist', 'hall', 129, 76.5, 'break', 16, 'down', 'H2'],
  ['compliance', 'hall', 110, 76.5, 'chat', 28, 'down', 'H2'],
  ['data-modeler', 'reception', 42, 92, 'chat', 30, 'right', null],
  ['docs-writer', 'reception', 45, 92, 'chat', 30, 'left', null],
  ['customer-success', 'reception', 49, 99, 'chat', 32, 'right', null],
  ['prospect-researcher', 'reception', 52, 99, 'chat', 32, 'left', null],
  ['data-seeder', 'cafeteria', 89, 49, 'break', 30, 'up', null],
  ['cfo', 'cafeteria', 93, 49, 'break', 24, 'up', null],
  ['designer', 'cafeteria', 106, 49, 'break', 28, 'up', null],
  ['marketing-strategist', 'lounge', 6, 55, 'break', 45, 'down', null],
  ['marketing-writer', 'lounge', 14, 55, 'break', 40, 'down', null]
];

const OUTFIT = {
  'test-author': 'cravat', 'security-reviewer': 'cloak', 'ai-engineer': 'highcollar',
  'data-seeder': 'suit', 'billing-specialist': 'coat', 'provisioning': 'coat',
  'ceo': 'coat', 'cio': 'coat', 'cfo': 'tie', 'marketing-writer': 'tie',
  'marketing-strategist': 'cloak', 'resource-manager': 'sash', 'customer-success': 'sash',
  'designer': 'apron', 'worker-builder': 'openshirt', 'compliance': 'tie', 'docs-writer': 'coat',
  'devops': 'apron', 'architect': 'openshirt'
};

/* ======================== 3. THE DASHBOARD ======================== */

class L3RainHQ {
  // isometric projection constants
  S = 6.4; CX = 706; CY = 88;
  FIVE_H_MS = 5 * 3600 * 1000;

  constructor() {
    this.DATA = JSON.parse(JSON.stringify(SNAPSHOT));   // live-mutable state
    window.L3RAIN_DATA = this.DATA;                     // debug handle (same as old build)

    this.capActive = false; this.realDepts = null; this.usage = null;
    this._live = false;
    this.t = 0; this.last = 0;
    this.view = { scale: 1, ox: 0, oy: 0 };

    this.initDom();
    this.initWorld();
    this.initSprites();
    this.bindPointer();

    this.updatePanel();
    this._rafOn = true;
    this._raf = requestAnimationFrame(this.tick);
    this.draw();                                        // paint one frame immediately
    this._int = setInterval(() => this.watchdog(), 1000);
    this.startPolling();
  }

  /* ---------- DOM references + panel rendering ---------- */

  initDom() {
    const $ = (id) => document.getElementById(id);
    this.canvasEl = $('l3rain-canvas');
    this.ctx = this.canvasEl.getContext('2d');
    this.el = {
      clock: $('hq-clock'),
      capBanner: $('l3-cap-banner'), capMsg: $('hq-cap-msg'),
      phases: $('hq-phases'),
      usageBox: $('l3-usage'), usagePct: $('hq-usage-pct'), usageMode: $('hq-usage-mode'), usageBar: $('hq-usage-bar'),
      usageStart: $('hq-usage-start'), usageReset: $('hq-usage-reset'), usageCount: $('hq-usage-count'),
      usageWeekly: $('hq-usage-weekly'),
      donut: $('hq-donut'), donutInner: $('hq-donut-inner'),
      depts: $('hq-depts'), feed: $('hq-feed'),
      actTotal: $('hq-act-total'), actWork: $('hq-act-work'),
      actMove: $('hq-act-move'), actBreak: $('hq-act-break')
    };
  }

  // Keep `container` holding exactly n rows produced by build().
  syncRows(container, n, build) {
    while (container.children.length > n) container.lastChild.remove();
    while (container.children.length < n) container.appendChild(build());
    return container.children;
  }

  buildPhaseRow() {
    const row = document.createElement('div'); row.className = 'phase';
    row.innerHTML = '<div class="phase-head"><span class="name"></span><span class="pct"></span></div>' +
      '<div class="bar"><div class="bar-fill"></div></div>';
    return row;
  }
  buildDeptRow() {
    const row = document.createElement('div'); row.className = 'dept-row';
    row.innerHTML = '<span class="dept-dot"></span><span class="dept-name"></span><span class="dept-status"></span>';
    return row;
  }
  buildKvRow() {
    const row = document.createElement('div'); row.className = 'kv';
    row.innerHTML = '<span class="k"></span><span class="v"></span>';
    return row;
  }

  updatePanel() {
    const el = this.el;
    const P = this.DATA.phases;
    const overall = P.reduce((s, p) => s + p.pct, 0) / P.length;

    el.clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // phase bars
    const phaseRows = this.syncRows(el.phases, P.length, () => this.buildPhaseRow());
    P.forEach((p, i) => {
      const row = phaseRows[i];
      row.querySelector('.name').textContent = p.name;
      row.querySelector('.pct').textContent = Math.round(p.pct) + '%';
      row.querySelector('.bar-fill').style.width = Math.round(p.pct) + '%';
    });

    // 5-hour usage bar (recomputed every second so the countdown ticks).
    // The bar + big number show REAL quota consumed (usedPct) when a live capture
    // exists; otherwise they fall back to time-elapsed, labelled honestly so the
    // meter is never mislabeled ("used" = real quota, "elapsed" = time in window).
    const capped = !!this.capActive, usg = this.computeUsage();
    let uLabel = '—', uMode = '', uW = '0%', uStart = '—', uReset = '—', uCount = '—',
        uColor = '#67e8f9', uBar = 'linear-gradient(90deg,#22d3ee,#3b82f6)', uBorder = '#1f3a63';
    if (usg.has) {
      const pctR = Math.round(usg.pct);
      uLabel = pctR + '%'; uW = pctR + '%';
      uMode = usg.mode === 'used' ? 'used' : 'elapsed';
      uStart = this.fmtClock(usg.start); uReset = this.fmtClock(usg.reset); uCount = this.fmtDur(usg.remaining);
      if (pctR >= 95 || capped) { uColor = '#ff6b6b'; uBar = 'linear-gradient(90deg,#f87171,#ef4444)'; uBorder = '#7f1d1d'; }
      else if (pctR >= 85) { uColor = '#f5b301'; uBar = 'linear-gradient(90deg,#fbbf24,#f59e0b)'; uBorder = '#78591c'; }
    } else if (capped) {
      uLabel = 'CAP'; uMode = ''; uW = '100%'; uColor = '#ff6b6b'; uBar = 'linear-gradient(90deg,#f87171,#ef4444)'; uBorder = '#7f1d1d';
    }
    el.usagePct.textContent = uLabel; el.usagePct.style.color = uColor;
    if (el.usageMode) el.usageMode.textContent = uMode;
    el.usageBar.style.width = uW; el.usageBar.style.background = uBar;
    el.usageBox.style.borderColor = uBorder;
    el.usageStart.textContent = 'Start ' + uStart;
    el.usageReset.textContent = 'Reset ' + uReset;
    el.usageCount.textContent = uCount; el.usageCount.style.color = uColor;
    // optional 7-day line: only when a real weekly quota % is present
    if (el.usageWeekly) {
      const wk = usg.has ? usg.weekly : null;
      if (Number.isFinite(wk)) { el.usageWeekly.textContent = '7-day ' + Math.round(wk) + '%'; el.usageWeekly.style.display = ''; }
      else { el.usageWeekly.textContent = ''; el.usageWeekly.style.display = 'none'; }
    }

    // cap banner
    el.capBanner.classList.toggle('on', capped);
    el.capMsg.textContent = capped ? this.capMessage(usg) : '';

    // overall donut
    el.donut.style.background = 'conic-gradient(#22d3ee ' + (overall * 3.6).toFixed(0) + 'deg, rgba(76,201,255,.12) 0deg)';
    el.donutInner.textContent = Math.round(overall) + '%';

    // department lights
    const keys = Object.keys(DEPT_NAMES);
    const deptRows = this.syncRows(el.depts, keys.length, () => this.buildDeptRow());
    keys.forEach((k, i) => {
      const st = this.DATA.departments[k];
      const meta = STATUS[st] || STATUS.idle;
      const col = st === 'done' ? '#39414f' : meta.c;
      const row = deptRows[i], dot = row.querySelector('.dept-dot');
      dot.style.background = col;
      dot.style.boxShadow = '0 0 8px ' + col;
      row.querySelector('.dept-name').textContent = DEPT_NAMES[k];
      row.querySelector('.dept-status').textContent = meta.label;
    });

    // employee activity
    let w = 0, m = 0, b = 0;
    if (this.agents) for (const a of this.agents) {
      if (a.state === 'work') w++; else if (a.state === 'walk' || a.state === 'chat') m++; else b++;
    }
    el.actTotal.textContent = String(this.agents ? this.agents.length : 30);
    el.actWork.textContent = String(w);
    el.actMove.textContent = String(m);
    el.actBreak.textContent = String(b);

    // live data feed
    const feed = this.DATA.feed || [];
    const feedRows = this.syncRows(el.feed, feed.length, () => this.buildKvRow());
    feed.forEach((f, i) => {
      const row = feedRows[i];
      row.querySelector('.k').textContent = f.k;
      const v = row.querySelector('.v');
      v.textContent = f.v; v.style.color = f.c || '#e7f6ff';
    });
  }

  /* ---------- live feed: poll /status.json, merge into DATA ---------- */
  // Shape: { phases:[{name,pct}], departments:{key:status}, feed:[{k,v,c}], usage:{...} }.
  // While a live feed is reachable the built-in demo animation stops driving state.

  startPolling() {
    const tick = async () => {
      try {
        const res = await fetch(CONFIG.feedUrl, { cache: 'no-store' });
        if (res.ok) this.applyLive(await res.json());
      } catch (e) { /* offline / no file → keep snapshot + demo running */ }
    };
    tick();
    this._poll = setInterval(tick, CONFIG.pollMs);   // cap state re-checked every poll
  }

  applyLive(d) {
    if (!d || typeof d !== 'object') return;
    this._live = true;
    const incoming = (d.departments && typeof d.departments === 'object') ? d.departments : null;
    // While capped, keep every room orange but stash the true states so the
    // office restores correctly the moment the cap lifts.
    if (this.capActive) { if (incoming) Object.assign(this.realDepts, incoming); }
    else if (incoming) Object.assign(this.DATA.departments, incoming);
    if (Array.isArray(d.phases) && d.phases.length) this.DATA.phases = d.phases;
    if (Array.isArray(d.feed) && d.feed.length) this.DATA.feed = d.feed;
    this.usage = (d.usage && typeof d.usage === 'object') ? d.usage : null;
    this.applyCap(!!(this.usage && this.usage.capActive));
    this.updatePanel();
  }

  /* ---------- honest cap state ---------- */
  // capActive true → every room's light flips to the distinct cap-orange, the
  // characters idle in place, and a banner explains why. Never show "working".

  applyCap(on) {
    if (on && !this.capActive) {
      this.realDepts = Object.assign({}, this.DATA.departments);   // snapshot the truth
      for (const k in this.DATA.departments) this.DATA.departments[k] = 'capped';
      this.capActive = true;
      this.idleAgents();
      this.slimes = []; this.shadows = [];                         // stop all "producing" props
    } else if (!on && this.capActive) {
      this.capActive = false;
      if (this.realDepts) { Object.assign(this.DATA.departments, this.realDepts); this.realDepts = null; }
      this.releaseAgents();
    }
  }
  idleAgents() {
    for (const a of this.agents) { a.path = []; a.after = null; a.state = 'break'; a.timer = 1e9; a.faceLock = 'down'; a.face = 'down'; }
  }
  releaseAgents() {
    for (const a of this.agents) { a.state = 'work'; a.timer = 2 + Math.random() * 6; a.faceLock = null; a.face = 'down'; }
  }

  /* ---------- 5-hour usage window ---------- */
  // Everything is derived client-side from resetIso so the countdown ticks every
  // second between polls. Tolerant of a few key aliases.

  computeUsage() {
    const u = this.usage || {};
    // Wire contract (l3rain #139): the real numbers live under usage.fiveHour, but
    // we stay tolerant of the older top-level aliases so nothing breaks in between.
    const fh = (u.fiveHour && typeof u.fiveHour === 'object') ? u.fiveHour : {};
    // Prefer an explicit 5-hour reset; fall back to the generic resetIso.
    const resetIso = fh.resetIso || u.fiveHourResetIso || u.window5hResetIso ||
      u.resetIso || u.reset || u.resetAt || u.windowResetIso || null;
    if (!resetIso) return { has: false };
    const reset = Date.parse(resetIso);
    if (isNaN(reset)) return { has: false };
    const now = Date.now();
    // A 5-hour window's reset is at most 5h away; anything further (e.g. a weekly
    // reset arriving in this field) is not a 5-hour boundary → don't fake a bar.
    if (reset - now > this.FIVE_H_MS + 60000) return { has: false };
    const startIso = fh.startIso || fh.windowStartIso || u.windowStartIso || u.startIso || u.windowStart || u.start || null;
    let start = startIso ? Date.parse(startIso) : NaN;
    if (isNaN(start)) start = reset - this.FIVE_H_MS;   // 5-hour window → derive from reset
    const span = Math.max(1, reset - start);
    // Time elapsed in the window: use the authoritative wire value when present,
    // else derive it client-side so the bar still moves between polls.
    const rawElapsed = this.num(fh.pctElapsed);
    const pctElapsed = Number.isFinite(rawElapsed)
      ? Math.max(0, Math.min(100, rawElapsed))
      : Math.max(0, Math.min(100, (now - start) / span * 100));
    // REAL quota consumed 0–100: present only when a live capture exists (nested
    // usedPct, or a reasonable top-level alias). Absent/null → time-elapsed fallback.
    const rawUsed = this.num(fh.usedPct != null ? fh.usedPct : (u.usedPct != null ? u.usedPct : u.fiveHourUsedPct));
    const hasReal = Number.isFinite(rawUsed);
    const usedPct = hasReal ? Math.max(0, Math.min(100, rawUsed)) : null;
    const pct = hasReal ? usedPct : pctElapsed;   // meter value
    // Optional 7-day window quota (usage.weekly.usedPct), if a real number is given.
    const wk = (u.weekly && typeof u.weekly === 'object') ? this.num(u.weekly.usedPct) : NaN;
    const weekly = Number.isFinite(wk) ? Math.max(0, Math.min(100, wk)) : null;
    return {
      has: true, pct, usedPct, pctElapsed,
      mode: hasReal ? 'used' : 'elapsed',
      remaining: Math.max(0, reset - now), start, reset, weekly
    };
  }
  // Coerce to a finite number or NaN (rejects null/'' /booleans).
  num(v) { return (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) ? Number(v) : NaN; }
  fmtClock(ms) { return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
  fmtDur(ms) {
    const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
    return h + 'h ' + String(m).padStart(2, '0') + 'm ' + String(sec).padStart(2, '0') + 's';
  }
  capMessage(usg) {
    const u = this.usage || {};
    const r = ((u.capReason || u.reason || u.capType || '') + '').toLowerCase();
    if (r.includes('week')) return 'Weekly usage limit reached — office paused until the weekly window resets';
    if (r.includes('token')) return 'No API token available — agents idle until a token is provided';
    if (usg.has) return '5-hour usage cap reached — resets in ' + this.fmtDur(usg.remaining);
    return 'Usage cap active — agents idle until the limit clears';
  }

  /* ---------- world / agents setup ---------- */

  initWorld() {
    this.corners = { c1: { x: 26, y: 38 }, c2: { x: 80, y: 38 }, c3: { x: 26, y: 78 }, c4: { x: 80, y: 78 } };
    this.laneCorners = { H1: ['c1', 'c2'], H2: ['c3', 'c4'], VL: ['c1', 'c3'], VR: ['c2', 'c4'] };
    this.adj = { c1: ['c2', 'c3'], c2: ['c1', 'c4'], c3: ['c1', 'c4'], c4: ['c2', 'c3'] };
    for (const k in ROOMS) {
      const r = ROOMS[k];
      for (const d of r.doors) {
        if (d.wall === 'S') d.inner = { x: d.c, y: r.rect[3] - 4 };
        else if (d.wall === 'N') d.inner = { x: d.c, y: r.rect[1] + 4 };
        else if (d.wall === 'E') d.inner = { x: r.rect[2] - 4, y: d.c };
        else d.inner = { x: r.rect[0] + 4, y: d.c };
      }
    }
    this.mkAgents();
    this.shadows = []; this.shadowT = 4;
    this.slimes = []; this.slimeT = 1.5;
    this.resShadows = [
      { pos: { x: 58, y: 57 }, face: 'left', state: 'wait', timer: 5, path: [], seed: 1.3 },
      { pos: { x: 47, y: 62 }, face: 'right', state: 'wait', timer: 8, path: [], seed: 4.1 },
      { pos: { x: 53, y: 50 }, face: 'down', state: 'wait', timer: 11, path: [], seed: 7.7 }
    ];
    this.scriptI = 0;
    // demo-mode status script (only drives state while the live feed is unreachable)
    this.script = [
      ['csuite', 'working'], ['customer', 'opening'], ['customer', 'working'], ['integrations', 'working'],
      ['infra', 'error'], ['infra', 'working'], ['engineering', 'paused'], ['marketing', 'waiting'],
      ['marketing', 'working'], ['engineering', 'working'], ['integrations', 'paused'], ['integrations', 'working'],
      ['customer', 'idle'], ['csuite', 'done']
    ];
  }

  // Face sprites. sprites.js has ALREADY run (defer ordering), so the map is
  // complete here; the failed/onerror flags only cover a corrupt entry or a
  // missing sprites.js — drawChar falls back to initials, never a blank face.
  initSprites() {
    this.imgs = {};
    const MAP = window.L3RAIN_SPRITES || {};
    if (!window.L3RAIN_SPRITES) console.warn('[l3rain-hq] sprites.js did not load — using initials avatars');
    for (const [role] of CHARS) {
      const rec = { img: new Image(), failed: !MAP[role] };
      rec.img.onerror = () => { rec.failed = true; };
      if (MAP[role]) rec.img.src = MAP[role];
      this.imgs[role] = rec;
    }
  }

  mkAgents() {
    const counters = {};
    this.agents = CHARS.map(([role, char, roleLabel, dept, top, bottom]) => {
      const i = counters[dept] = (counters[dept] || 0); counters[dept]++;
      const d = DESKS[dept][i];
      const home = { x: d[0], y: d[1] - 2.6 };
      return {
        role, char, roleLabel, dept, top, bottom, deskI: i,
        curRoom: dept, hallLane: null, home, pos: { x: home.x, y: home.y },
        face: 'down', state: 'work', timer: 4 + Math.random() * 10,
        path: [], after: null, seed: Math.random() * 10,
        scale: role === 'orchestrator' ? 1.16 : role === 'release-manager' ? 0.9 : 1
      };
    });
    for (const [role, room, x, y, state, timer, faceLock, lane] of CHOREO) {
      const a = this.agents.find(g => g.role === role);
      a.pos = { x, y }; a.state = state; a.timer = timer; a.faceLock = faceLock; a.face = faceLock || 'down';
      if (room === 'hall') { a.curRoom = 'hall'; a.hallLane = lane; } else a.curRoom = room;
    }
  }

  /* ---------- main loop ---------- */

  tick = (ts) => {
    this._raf = requestAnimationFrame(this.tick);
    if (!this.last) this.last = ts;
    const dt = Math.min(0.05, (ts - this.last) / 1000) * CONFIG.speed;
    this.last = ts;
    this.t += dt;
    this._frames = (this._frames || 0) + 1;
    this.update(dt);
    this.draw();
  };

  // Runs every second: ticks the clock/panel, and — if requestAnimationFrame is
  // throttled (backgrounded tab) — advances the simulation so the office never
  // freezes.
  watchdog() {
    const framed = this._frames || 0;
    if (framed === this._lastFrames) {
      this.t += 0.9;
      this.update(0.9 * CONFIG.speed);
      try { this.draw(); } catch (e) { /* canvas may be gone during teardown */ }
    }
    this._lastFrames = framed;
    this.second();
  }

  second() {
    if (!this._live) {   // demo mode only — real feed drives state via applyLive()
      const P = this.DATA.phases;
      if (P[2].pct < 88) P[2].pct = Math.min(88, P[2].pct + 0.03);
      if (P[3].pct < 60) P[3].pct = Math.min(60, P[3].pct + 0.015);
      this._cyc = (this._cyc || 0) + 1;
      if (this._cyc % 18 === 0) { const [dk, st] = this.script[this.scriptI % this.script.length]; this.scriptI++; this.DATA.departments[dk] = st; }
    }
    this.updatePanel();
  }

  /* ---------- zoom / pan ---------- */

  clampView() {
    const v = this.view, w = 1600, h = 920;
    v.scale = Math.min(4, Math.max(1, v.scale));
    v.ox = Math.min(0, Math.max(w - w * v.scale, v.ox));
    v.oy = Math.min(0, Math.max(h - h * v.scale, v.oy));
    if (v.scale <= 1.001) { v.ox = 0; v.oy = 0; }
  }
  zoomAt(px, py, factor) {
    const v = this.view, ns = Math.min(4, Math.max(1, v.scale * factor)), k = ns / v.scale;
    v.ox = px - (px - v.ox) * k; v.oy = py - (py - v.oy) * k; v.scale = ns;
    this.clampView(); this.draw();
  }
  bindPointer() {
    const el = this.canvasEl;
    const toC = (cx, cy) => { const r = el.getBoundingClientRect(); const f = el.width / r.width; return { x: (cx - r.left) * f, y: (cy - r.top) * f }; };
    el.addEventListener('wheel', (e) => { e.preventDefault(); const p = toC(e.clientX, e.clientY); this.zoomAt(p.x, p.y, e.deltaY < 0 ? 1.14 : 0.877); }, { passive: false });
    let drag = false, lx = 0, ly = 0;
    el.addEventListener('pointerdown', (e) => { if (this._touches >= 2) return; drag = true; lx = e.clientX; ly = e.clientY; try { el.setPointerCapture(e.pointerId); } catch (x) {} el.style.cursor = 'grabbing'; });
    el.addEventListener('pointermove', (e) => {
      if (!drag || this._touches >= 2) return;
      const r = el.getBoundingClientRect(); const f = el.width / r.width;
      this.view.ox += (e.clientX - lx) * f; this.view.oy += (e.clientY - ly) * f;
      lx = e.clientX; ly = e.clientY; this.clampView(); this.draw();
    });
    const up = () => { drag = false; el.style.cursor = this.view.scale > 1 ? 'grab' : 'default'; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up);
    el.addEventListener('dblclick', () => { this.view = { scale: 1, ox: 0, oy: 0 }; this.draw(); });
    // touch: pinch-to-zoom + two-finger pan (mobile)
    this._touches = 0; let pd = 0, pcx = 0, pcy = 0;
    const mid = (ts) => { const r = el.getBoundingClientRect(), f = el.width / r.width; return { x: ((ts[0].clientX + ts[1].clientX) / 2 - r.left) * f, y: ((ts[0].clientY + ts[1].clientY) / 2 - r.top) * f }; };
    const spread = (ts) => Math.hypot(ts[0].clientX - ts[1].clientX, ts[0].clientY - ts[1].clientY);
    el.addEventListener('touchstart', (e) => { this._touches = e.touches.length; if (e.touches.length === 2) { drag = false; pd = spread(e.touches); const m = mid(e.touches); pcx = m.x; pcy = m.y; } }, { passive: false });
    el.addEventListener('touchmove', (e) => {
      this._touches = e.touches.length;
      if (e.touches.length === 2) {
        e.preventDefault();
        const nd = spread(e.touches), m = mid(e.touches);
        if (pd > 0) this.zoomAt(m.x, m.y, nd / pd);
        // pan with the two-finger centroid too
        this.view.ox += (m.x - pcx); this.view.oy += (m.y - pcy);
        pd = nd; pcx = m.x; pcy = m.y; this.clampView(); this.draw();
      }
    }, { passive: false });
    const tend = (e) => { this._touches = e.touches ? e.touches.length : 0; if (this._touches < 2) pd = 0; };
    el.addEventListener('touchend', tend); el.addEventListener('touchcancel', tend);
    const btn = (id, fn) => { const b = document.getElementById(id); if (b) b.onclick = fn; };
    btn('l3-zin', () => this.zoomAt(800, 460, 1.25));
    btn('l3-zout', () => this.zoomAt(800, 460, 0.8));
    btn('l3-zreset', () => { this.view = { scale: 1, ox: 0, oy: 0 }; this.draw(); });
  }

  /* ---------- isometric projection ---------- */

  iso(wx, wy) { return { x: this.CX + (wx - wy) * this.S, y: this.CY + (wx + wy) * this.S * 0.5 }; }
  isoE(wx, wy, e) { const p = this.iso(wx, wy); return { x: p.x, y: p.y - (e || 0) }; }
  elevAt(x, y) { return (x >= 30 && x <= 76 && y >= 42 && y <= 74) ? 16 : 0; }

  /* ---------- pathfinding (doors + hall lanes + corners) ---------- */

  dist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
  hallRoute(a, b) {
    if (a.lane === b.lane) return [a, b];
    const C = this.corners;
    const shared = this.laneCorners[a.lane].filter(k => this.laneCorners[b.lane].includes(k));
    if (shared.length) return [a, C[shared[0]], b];
    let best = null, bl = 1e9;
    for (const ka of this.laneCorners[a.lane]) for (const kb of this.laneCorners[b.lane]) {
      if (!this.adj[ka].includes(kb)) continue;
      const l = this.dist(a, C[ka]) + this.dist(C[ka], C[kb]) + this.dist(C[kb], b);
      if (l < bl) { bl = l; best = [a, C[ka], C[kb], b]; }
    }
    return best || [a, b];
  }
  buildPath(fromRoom, fromPt, hallLane, toRoom, toPt) {
    if (fromRoom === toRoom) return [{ x: toPt.x, y: toPt.y }];
    const tr = ROOMS[toRoom];
    if (fromRoom === 'hall') {
      let bt = null, bl = 1e9;
      const src = { x: fromPt.x, y: fromPt.y, lane: hallLane };
      for (const td of tr.doors) { const l = this.dist(src, td.hall) + this.dist(td.inner, toPt); if (l < bl) { bl = l; bt = td; } }
      const route = this.hallRoute(src, bt.hall);
      return [...route.slice(1).map(p => ({ x: p.x, y: p.y })), { x: bt.inner.x, y: bt.inner.y }, { x: toPt.x, y: toPt.y }];
    }
    const fr = ROOMS[fromRoom];
    let bf = null, bt = null, bl = 1e9;
    for (const fd of fr.doors) for (const td of tr.doors) {
      const l = this.dist(fromPt, fd.inner) + this.dist(fd.hall, td.hall) + this.dist(td.inner, toPt);
      if (l < bl) { bl = l; bf = fd; bt = td; }
    }
    const route = this.hallRoute(bf.hall, bt.hall);
    return [{ x: bf.inner.x, y: bf.inner.y }, ...route.map(p => ({ x: p.x, y: p.y })), { x: bt.inner.x, y: bt.inner.y }, { x: toPt.x, y: toPt.y }];
  }

  /* ---------- agent behavior ---------- */

  // statuses where the room is NOT actively producing → agents go on break, room dims
  isBreak(k) { const s = this.DATA.departments[k]; return s === 'done' || s === 'idle' || s === 'paused' || s === 'capped'; }

  trip(a, roomKey, spot, dwell, face) {
    const target = { x: spot[0] + (Math.random() - 0.5) * 2.5, y: spot[1] + (Math.random() - 0.5) * 1.5 };
    a.path = this.buildPath(a.curRoom, a.pos, a.hallLane, roomKey, target);
    a.state = 'walk';
    a.after = () => { a.curRoom = roomKey; a.hallLane = null; a.state = 'break'; a.timer = dwell; a.faceLock = face || 'down'; };
  }
  goHome(a) {
    if (this.isBreak(a.dept)) {
      const pools = [['lounge', ROOMS.lounge.spots], ['cafeteria', ROOMS.cafeteria.spots], ['reception', ROOMS.reception.spots]];
      const [rk, spots] = pools[Math.floor(Math.random() * pools.length)];
      this.trip(a, rk, spots[Math.floor(Math.random() * spots.length)], 12 + Math.random() * 15, 'down');
      return;
    }
    a.path = this.buildPath(a.curRoom, a.pos, a.hallLane, a.dept, a.home);
    a.state = 'walk';
    a.after = () => { a.curRoom = a.dept; a.hallLane = null; a.state = 'work'; a.timer = 8 + Math.random() * 12; a.faceLock = null; a.face = 'down'; };
  }
  tryChat(a) {
    const room = ROOMS[a.dept];
    if (!room || !room.meet) return false;
    const peers = this.agents.filter(b => b !== a && b.dept === a.dept && b.state === 'work');
    if (!peers.length) return false;
    const b = peers[Math.floor(Math.random() * peers.length)];
    const m = room.meet, dur = 5 + Math.random() * 5;
    const send = (ag, off, fc) => {
      ag.path = this.buildPath(ag.curRoom, ag.pos, ag.hallLane, a.dept, { x: m.x + off, y: m.y });
      ag.state = 'walk';
      ag.after = () => { ag.curRoom = a.dept; ag.state = 'chat'; ag.timer = dur; ag.faceLock = fc; };
    };
    send(a, -1.8, 'right'); send(b, 1.8, 'left');
    return true;
  }
  decide(a) {
    const r = Math.random();
    if (a.role === 'orchestrator') {
      if (r < 0.9) { a.timer = 6 + Math.random() * 8; return; }
      this.trip(a, 'cafeteria', ROOMS.cafeteria.spots[0], 3 + Math.random() * 3, 'up'); return;
    }
    if (this.isBreak(a.dept)) { this.goHome(a); return; }
    if (r < 0.52) { a.timer = 7 + Math.random() * 9; return; }
    if (r < 0.66) { if (!this.tryChat(a)) a.timer = 5; return; }
    if (r < 0.78) { const s = ROOMS.cafeteria.spots[Math.floor(Math.random() * ROOMS.cafeteria.spots.length)]; this.trip(a, 'cafeteria', s, 4 + Math.random() * 4, 'up'); return; }
    if (r < 0.84) { const s = ROOMS.restroom.spots[Math.floor(Math.random() * 2)]; this.trip(a, 'restroom', s, 3 + Math.random() * 2, 'up'); return; }
    if (r < 0.9) { const s = ROOMS.lounge.spots[Math.floor(Math.random() * 3)]; this.trip(a, 'lounge', s, 5 + Math.random() * 5, 'down'); return; }
    if (r < 0.95) { const s = ROOMS.reception.spots[Math.floor(Math.random() * ROOMS.reception.spots.length)]; this.trip(a, 'reception', s, 5 + Math.random() * 4, 'down'); return; }
    const others = Object.keys(DEPT_NAMES).filter(k => k !== a.dept && ROOMS[k].meet && !this.isBreak(k));
    const dk = others[Math.floor(Math.random() * others.length)];
    this.trip(a, dk, [ROOMS[dk].meet.x, ROOMS[dk].meet.y], 4 + Math.random() * 3, 'down');
  }
  moveAlong(o, dt, speed) {
    let left = speed * dt;
    while (left > 0 && o.path.length) {
      const p = o.path[0];
      const dx = p.x - o.pos.x, dy = p.y - o.pos.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.15) { o.path.shift(); continue; }
      const sdx = (dx - dy), sdy = (dx + dy);
      o.face = Math.abs(sdx) > Math.abs(sdy) * 0.6 ? (sdx > 0 ? 'right' : 'left') : (sdy > 0 ? 'down' : 'up');
      const step = Math.min(d, left);
      o.pos.x += dx / d * step; o.pos.y += dy / d * step;
      left -= step;
    }
    return o.path.length === 0;
  }

  update(dt) {
    for (const a of this.agents) {
      if (a.state === 'walk') {
        if (this.moveAlong(a, dt, 14)) { const f = a.after; a.after = null; if (f) f(); }
      } else {
        a.timer -= dt;
        if (a.state === 'work') { if (a.timer <= 0) this.decide(a); a.face = 'down'; }
        else if (a.timer <= 0) this.goHome(a);
        else if (a.faceLock) a.face = a.faceLock;
      }
    }
    if (CONFIG.showShadows) {
      // Sung Jin-Woo's shadow clones: dispatched from the platform to working rooms
      this.shadowT -= dt;
      if (this.shadowT <= 0 && this.shadows.length < 5 && this.DATA.departments.orchestrator === 'working') {
        this.shadowT = 6 + Math.random() * 8;
        const depts = Object.keys(DEPT_NAMES).filter(k => k !== 'orchestrator' && this.DATA.departments[k] === 'working');
        if (depts.length) {
          const dk = depts[Math.floor(Math.random() * depts.length)];
          const m = ROOMS[dk].meet;
          const jw = this.agents[0];
          this.shadows.push({
            pos: { x: jw.pos.x + 2, y: jw.pos.y + 1 }, face: 'down', alpha: 0, state: 'out', seed: Math.random() * 10, timer: 0,
            path: this.buildPath('orchestrator', jw.pos, null, dk, { x: m.x + (Math.random() - 0.5) * 4, y: m.y })
          });
        }
      }
      for (const s of this.shadows) {
        if (s.state === 'out') {
          s.alpha = Math.min(0.88, s.alpha + dt * 2);
          if (this.moveAlong(s, dt, 17)) { s.state = 'linger'; s.timer = 1.5 + Math.random() * 2; }
        } else if (s.state === 'linger') { s.timer -= dt; if (s.timer <= 0) s.state = 'fade'; }
        else s.alpha -= dt * 1.4;
      }
      this.shadows = this.shadows.filter(s => s.alpha > 0);
      // resident shadows wandering the platform
      if (!this.capActive) for (const s of this.resShadows) {
        if (s.state === 'wait') {
          s.timer -= dt;
          if (s.timer <= 0) {
            const spots = [[44, 65], [60, 66], [66, 50], [40, 48], [58, 56]];
            const p = spots[Math.floor(Math.random() * spots.length)];
            s.path = [{ x: p[0] + (Math.random() - 0.5) * 4, y: p[1] + (Math.random() - 0.5) * 3 }];
            s.state = 'move';
          }
        } else if (this.moveAlong(s, dt, 8)) { s.state = 'wait'; s.timer = 4 + Math.random() * 7; s.face = 'down'; }
      }
    }
    // green slime subagents — spawn in working rooms, wander, fade when work stops
    const working = Object.keys(DEPT_NAMES).filter(k => k !== 'orchestrator' && this.DATA.departments[k] === 'working');
    this.slimeT -= dt;
    if (this.slimeT <= 0) {
      this.slimeT = 2 + Math.random() * 2.5;
      if (working.length && this.slimes.filter(s => s.state !== 'out').length < working.length * 2) {
        const dk = working[Math.floor(Math.random() * working.length)];
        const r = ROOMS[dk].rect;
        const tg = this.randIn(r);
        this.slimes.push({ dept: dk, pos: this.randIn(r), target: tg, path: [tg], state: 'in', alpha: 0, seed: Math.random() * 10, wait: 0 });
      }
    }
    for (const s of this.slimes) {
      const stop = this.DATA.departments[s.dept] !== 'working';
      if (stop) s.state = 'out';
      if (s.state === 'in') { s.alpha = Math.min(1, s.alpha + dt * 2); if (s.alpha >= 1) s.state = 'live'; }
      else if (s.state === 'out') s.alpha -= dt * 1.5;
      if (s.state !== 'out') {
        if (!s.path || !s.path.length) s.path = [s.target || this.randIn(ROOMS[s.dept].rect)];
        if (s.wait > 0) s.wait -= dt;
        else if (this.moveAlong(s, dt, 6.5)) { s.wait = 0.6 + Math.random() * 2; s.target = this.randIn(ROOMS[s.dept].rect); s.path = [s.target]; }
      }
    }
    this.slimes = this.slimes.filter(s => s.alpha > 0.02);
  }
  randIn(r) { return { x: r[0] + 4 + Math.random() * (r[2] - r[0] - 8), y: r[1] + 5 + Math.random() * (r[3] - r[1] - 9) }; }

  /* ---------- drawing helpers ---------- */

  rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
  shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (f > 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  }
  floorPoly(ctx, x1, y1, x2, y2, e) {
    const a = this.isoE(x1, y1, e), b = this.isoE(x2, y1, e), c = this.isoE(x2, y2, e), d = this.isoE(x1, y2, e);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath();
  }
  box(ctx, wx, wy, wwx, wwy, h, col, opts) {
    const o = opts || {}; const e = o.e || 0;
    const p1 = this.isoE(wx, wy, e), p2 = this.isoE(wx + wwx, wy, e), p3 = this.isoE(wx + wwx, wy + wwy, e), p4 = this.isoE(wx, wy + wwy, e);
    ctx.beginPath(); ctx.moveTo(p4.x, p4.y); ctx.lineTo(p3.x, p3.y); ctx.lineTo(p3.x, p3.y - h); ctx.lineTo(p4.x, p4.y - h); ctx.closePath();
    ctx.fillStyle = this.shade(col, -0.3); ctx.fill();
    ctx.beginPath(); ctx.moveTo(p3.x, p3.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p2.x, p2.y - h); ctx.lineTo(p3.x, p3.y - h); ctx.closePath();
    ctx.fillStyle = this.shade(col, -0.15); ctx.fill();
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y - h); ctx.lineTo(p2.x, p2.y - h); ctx.lineTo(p3.x, p3.y - h); ctx.lineTo(p4.x, p4.y - h); ctx.closePath();
    ctx.fillStyle = this.shade(col, 0.14); ctx.fill();
    if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }
  wallSeg(ctx, a, b, h, fill, glow) {
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(b.x, b.y - h); ctx.lineTo(a.x, a.y - h); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    ctx.beginPath(); ctx.moveTo(a.x, a.y - h); ctx.lineTo(b.x, b.y - h);
    ctx.strokeStyle = glow; ctx.lineWidth = 1.6; ctx.stroke();
    // baseboard
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = 'rgba(20,30,50,.5)'; ctx.lineWidth = 1.4; ctx.stroke();
  }
  // split wall run [c1,c2] into segments around door cuts (3 units of clearance)
  segments(c1, c2, doorCs) {
    const cuts = doorCs.slice().sort((a, b) => a - b);
    const segs = []; let cur = c1;
    for (const d of cuts) { if (d - 3 > cur) segs.push([cur, d - 3]); cur = d + 3; }
    if (cur < c2) segs.push([cur, c2]);
    return segs;
  }

  /* ---------- scene: walls, platform, rooms ---------- */

  drawTallWalls(ctx, t) {
    const cap = this.capActive;
    const H = 62, fillN = cap ? '#7a5a34' : '#98a1bd', fillW = cap ? '#6b4e2c' : '#868fac',
      glow = cap ? 'rgba(255,150,60,.75)' : 'rgba(170,215,255,.55)';
    for (const k in ROOMS) {
      const r = ROOMS[k]; if (r.elev) continue;
      const [x1, y1, x2, y2] = r.rect;
      const st = this.DATA.departments[k];
      const dim = st === 'done' ? -0.5 : this.isBreak(k) ? -0.28 : 0;
      const fN = dim ? this.shade(fillN, dim) : fillN;
      const fW = dim ? this.shade(fillW, dim) : fillW;
      const dN = r.doors.filter(d => d.wall === 'N').map(d => d.c);
      const dW = r.doors.filter(d => d.wall === 'W').map(d => d.c);
      if (r.tallW) for (const [a, b] of this.segments(y1, y2, dW)) this.wallSeg(ctx, this.iso(x1, a), this.iso(x1, b), H, fW, glow);
      if (r.tallN) for (const [a, b] of this.segments(x1, x2, dN)) this.wallSeg(ctx, this.iso(a, y1), this.iso(b, y1), H, fN, glow);
    }
    this.wallDeco(ctx, t);
  }

  drawPlatform(ctx, t) {
    const r = ROOMS.orchestrator, e = r.elev;
    const [x1, y1, x2, y2] = r.rect;
    // side faces (drop from elevated floor to ground)
    const tp = (x, y) => this.isoE(x, y, e), gp = (x, y) => this.iso(x, y);
    const faceQ = (ax, ay, bx, by, col) => {
      ctx.beginPath();
      const a = tp(ax, ay), b = tp(bx, by), c = gp(bx, by), d = gp(ax, ay);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath();
      ctx.fillStyle = col; ctx.fill();
    };
    faceQ(x1, y2, x2, y2, '#3c4568'); // front-left (S)
    faceQ(x2, y1, x2, y2, '#313a5a'); // right (E)
    // top floor
    this.floorPoly(ctx, x1, y1, x2, y2, e);
    const g = ctx.createLinearGradient(0, tp(x1, y1).y, 0, tp(x2, y2).y);
    g.addColorStop(0, this.shade(r.floor, 0.12)); g.addColorStop(1, this.shade(r.floor, -0.08));
    ctx.fillStyle = this.capActive ? '#5a3a1c' : g; ctx.fill();
    ctx.strokeStyle = this.capActive ? 'rgba(255,150,60,.5)' : 'rgba(120,150,210,.4)'; ctx.lineWidth = 1; ctx.stroke();
    // L3RAIN on the front face
    const fc = this.iso((x1 + x2) / 2, y2);
    ctx.save();
    ctx.font = '800 22px "Chakra Petch", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(150,200,255,.85)'; ctx.shadowColor = '#67e8f9'; ctx.shadowBlur = 12;
    ctx.fillText('L3RAIN', fc.x, fc.y - 8);
    ctx.restore();
    // steps at both doors
    for (const dr of r.doors) {
      for (let s = 0; s < 3; s++) {
        const yy = dr.inner.y;
        const off = dr.wall === 'W' ? -1 - s * 0.9 : 1 + s * 0.9;
        this.box(ctx, dr.wall === 'W' ? x1 + off - 1.2 : x2 + off - 1.2, yy - 1.3, 2.4, 2.6, e - s * 5, '#48527a', { e: 0 });
      }
    }
    // dais rings on top
    const dc = this.isoE(53, 60, e);
    const rg = ctx.createRadialGradient(dc.x, dc.y, 6, dc.x, dc.y, 110);
    rg.addColorStop(0, 'rgba(139,92,246,.28)'); rg.addColorStop(1, 'rgba(139,92,246,0)');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.ellipse(dc.x, dc.y, 110, 55, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(167,139,250,.55)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(dc.x, dc.y, 70, 35, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(103,232,249,.7)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(dc.x, dc.y, 84, 42, 0, t * 0.8, t * 0.8 + 1.5); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(dc.x, dc.y, 84, 42, 0, t * 0.8 + Math.PI, t * 0.8 + Math.PI + 1.5); ctx.stroke();
  }

  /* ---------- characters ---------- */

  drawChar(ctx, a, t) {
    const e = this.elevAt(a.pos.x, a.pos.y);
    const p = this.isoE(a.pos.x, a.pos.y, e);
    const sc = a.scale * 1.34;
    ctx.save();
    ctx.translate(p.x, p.y); ctx.scale(sc, sc);
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(0, 1, 10, 3.6, 0, 0, TAU); ctx.fill();
    if (a.role === 'orchestrator') {
      const g = ctx.createRadialGradient(0, -28, 4, 0, -28, 34);
      g.addColorStop(0, 'rgba(139,92,246,.45)'); g.addColorStop(1, 'rgba(139,92,246,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -28, 34, 0, TAU); ctx.fill();
    }
    const walking = a.state === 'walk';
    const ph = t * 9 + a.seed;
    const swing = walking ? Math.sin(ph) : 0;          // -1..1 gait phase
    const bob = walking ? -Math.abs(Math.sin(ph)) * 2.4 : (a.state === 'work' ? Math.sin(t * 5.5 + a.seed) * 0.8 : 0);
    ctx.translate(0, bob);
    // striding legs: lift + swing forward/back
    const lift = 6.5, base = 9;
    const legL = base - Math.max(0, swing) * lift, legR = base - Math.max(0, -swing) * lift;
    const legLX = -5.5 + swing * 1.8, legRX = 1 + swing * 1.8;
    ctx.fillStyle = a.bottom;
    ctx.fillRect(legLX, -legL, 4.5, legL);
    ctx.fillRect(legRX, -legR, 4.5, legR);
    // torso
    this.rr(ctx, -8.5, -26, 17, 18, 6); ctx.fillStyle = a.top; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 1; ctx.stroke();
    this.drawOutfit(ctx, OUTFIT[a.role]);
    // arms swing opposite to legs while walking
    const armSw = walking ? swing * 3.2 : 0; ctx.fillStyle = a.top;
    ctx.save(); ctx.translate(-9.5, -22); ctx.rotate(-armSw * 0.14); this.rr(ctx, -1.7, 0, 3.4, 10.5, 1.7); ctx.fill(); ctx.restore();
    ctx.save(); ctx.translate(9.5, -22); ctx.rotate(armSw * 0.14); this.rr(ctx, -1.7, 0, 3.4, 10.5, 1.7); ctx.fill(); ctx.restore();
    // face: sprite when decoded, initials avatar otherwise — never blank
    const rec = this.imgs[a.role], R = 17;
    const img = rec && !rec.failed ? rec.img : null;
    if (img && img.complete && img.naturalWidth) {
      ctx.save(); ctx.beginPath(); ctx.arc(0, -38, R, 0, TAU); ctx.clip();
      if (a.face === 'left') { ctx.scale(-1, 1); ctx.drawImage(img, -R, -38 - R, R * 2, R * 2); }
      else ctx.drawImage(img, -R, -38 - R, R * 2, R * 2);
      ctx.restore();
      ctx.beginPath(); ctx.arc(0, -38, R, 0, TAU); ctx.strokeStyle = 'rgba(10,14,26,.7)'; ctx.lineWidth = 1.6; ctx.stroke();
    } else {
      this.drawInitialsFace(ctx, a, R);
    }
    ctx.restore();
  }

  // Fallback avatar: dark disc + character initials in the department glow.
  drawInitialsFace(ctx, a, R) {
    ctx.beginPath(); ctx.arc(0, -38, R, 0, TAU);
    ctx.fillStyle = '#1d2a47'; ctx.fill();
    ctx.strokeStyle = 'rgba(103,232,249,.75)'; ctx.lineWidth = 1.6; ctx.stroke();
    const initials = a.char.split(/\s+/).map(wd => wd[0]).join('').slice(0, 2);
    ctx.font = '700 13px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#cfe8ff'; ctx.fillText(initials, 0, -38);
  }

  drawOutfit(ctx, kind) {
    if (!kind) return;
    ctx.save();
    if (kind === 'tie') {
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(-4.5, -25.5); ctx.lineTo(0, -21); ctx.lineTo(4.5, -25.5); ctx.stroke();
      ctx.fillStyle = '#b12a3a'; ctx.beginPath(); ctx.moveTo(0, -21.5); ctx.lineTo(-1.7, -19); ctx.lineTo(0, -10); ctx.lineTo(1.7, -19); ctx.closePath(); ctx.fill();
    } else if (kind === 'suit') {
      ctx.fillStyle = 'rgba(15,16,22,.85)';
      ctx.beginPath(); ctx.moveTo(-8, -25.5); ctx.lineTo(-0.5, -22); ctx.lineTo(-4, -9); ctx.lineTo(-8, -9); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(8, -25.5); ctx.lineTo(0.5, -22); ctx.lineTo(4, -9); ctx.lineTo(8, -9); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#1b1c24'; ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(-1.4, -20); ctx.lineTo(0, -11); ctx.lineTo(1.4, -20); ctx.closePath(); ctx.fill();
    } else if (kind === 'coat') {
      ctx.fillStyle = 'rgba(0,0,0,.22)'; this.rr(ctx, -8.5, -18, 17, 10, 4); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, -25); ctx.lineTo(0, -9); ctx.stroke();
      ctx.fillStyle = 'rgba(20,24,34,.7)';
      ctx.beginPath(); ctx.moveTo(-7.5, -26); ctx.lineTo(-2, -24); ctx.lineTo(-6, -20); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(7.5, -26); ctx.lineTo(2, -24); ctx.lineTo(6, -20); ctx.closePath(); ctx.fill();
    } else if (kind === 'cravat') {
      ctx.fillStyle = '#f2f4f7'; ctx.beginPath(); ctx.moveTo(0, -26); ctx.lineTo(-4.5, -20); ctx.lineTo(0, -17.5); ctx.lineTo(4.5, -20); ctx.closePath(); ctx.fill();
    } else if (kind === 'cloak') {
      ctx.fillStyle = 'rgba(12,10,20,.55)'; this.rr(ctx, -8.5, -26, 17, 18, 6); ctx.fill();
      ctx.fillStyle = '#b0202e';
      [[-4, -20], [3, -15], [1, -23], [-2, -12], [5, -21]].forEach(p => { ctx.beginPath(); ctx.moveTo(p[0], p[1] - 1.6); ctx.lineTo(p[0] + 1.6, p[1] + 1); ctx.lineTo(p[0] - 1.6, p[1] + 1); ctx.closePath(); ctx.fill(); });
    } else if (kind === 'highcollar') {
      ctx.fillStyle = '#0c0d12'; this.rr(ctx, -7, -27.5, 14, 4.5, 2); ctx.fill();
    } else if (kind === 'sash') {
      ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(-7.5, -24); ctx.lineTo(7, -12); ctx.stroke();
    } else if (kind === 'apron') {
      ctx.fillStyle = 'rgba(240,240,244,.4)'; this.rr(ctx, -5.5, -22, 11, 13, 3); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.lineWidth = 0.8; ctx.strokeRect(-5.5, -22, 11, 13);
    } else if (kind === 'openshirt') {
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-3.5, -25.5); ctx.lineTo(0, -19); ctx.lineTo(3.5, -25.5); ctx.stroke();
    }
    ctx.restore();
  }

  drawShadowChibi(ctx, s, t) {
    const e = this.elevAt(s.pos.x, s.pos.y);
    const p = this.isoE(s.pos.x, s.pos.y, e);
    const al = s.alpha === undefined ? 0.88 : s.alpha;
    ctx.save(); ctx.globalAlpha = al; ctx.translate(p.x, p.y); ctx.scale(1.05, 1.05);
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(0, 1, 8, 3, 0, 0, TAU); ctx.fill();
    const g = ctx.createRadialGradient(0, -24, 2, 0, -24, 26);
    g.addColorStop(0, 'rgba(124,58,237,.38)'); g.addColorStop(1, 'rgba(124,58,237,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -24, 26, 0, TAU); ctx.fill();
    const step = s.path && s.path.length ? Math.sin(t * 11 + s.seed) * 3 : 0;
    const l1 = 8 - Math.max(0, step), l2 = 8 - Math.max(0, -step);
    ctx.fillStyle = '#150e2e'; ctx.fillRect(-5, -l1, 4, l1); ctx.fillRect(1, -l2, 4, l2);
    this.rr(ctx, -7.5, -23, 15, 16, 5); ctx.fillStyle = '#241a4a'; ctx.fill();
    ctx.beginPath(); ctx.arc(0, -31, 10, 0, TAU); ctx.fillStyle = '#2a2044'; ctx.fill();
    ctx.fillStyle = '#1b1330'; ctx.beginPath();
    [[-6, -38], [0, -41], [6, -38]].forEach(q => { ctx.moveTo(q[0] - 2.5, q[1]); ctx.lineTo(q[0] + Math.sin(t * 4 + s.seed + q[0]), q[1] - 5); ctx.lineTo(q[0] + 2.5, q[1]); });
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#b09bfa'; ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.arc(-3.4, -31, 1.5, 0, TAU); ctx.arc(3.4, -31, 1.5, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0; ctx.restore();
  }

  badge(ctx, a) {
    const e = this.elevAt(a.pos.x, a.pos.y);
    const p = this.isoE(a.pos.x, a.pos.y, e);
    const y = p.y - 66 * (a.scale * 1.34) / 1.34;
    ctx.font = '700 9px "Chakra Petch", sans-serif';
    const w1 = ctx.measureText(a.char).width;
    ctx.font = '500 7px "Chakra Petch", sans-serif';
    const w2 = ctx.measureText(a.roleLabel).width;
    const w = Math.max(w1, w2) + 12;
    this.rr(ctx, p.x - w / 2, y - 20, w, 21, 5);
    ctx.fillStyle = 'rgba(9,14,28,.9)'; ctx.fill();
    ctx.strokeStyle = 'rgba(103,232,249,.5)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 9px "Chakra Petch", sans-serif'; ctx.fillStyle = '#f2f8ff'; ctx.fillText(a.char, p.x, y - 13);
    ctx.font = '500 7px "Chakra Petch", sans-serif'; ctx.fillStyle = '#8fdcf0'; ctx.fillText(a.roleLabel, p.x, y - 4.5);
  }

  /* ---------- signs, bubbles, slimes ---------- */

  lampCol(k) { return (STATUS[this.DATA.departments[k]] || STATUS.idle).c; }

  drawSign(ctx, key, t) {
    const r = ROOMS[key];
    const [x1, y1, x2] = r.rect;
    const mid = this.iso((x1 + x2) / 2, y1);
    const y = mid.y - (r.tallN ? 66 : 44) - (r.elev || 0);
    ctx.font = '700 12px "Chakra Petch", sans-serif';
    const tw = ctx.measureText(r.name).width;
    const hasLamp = !!r.dept;
    const w = tw + (hasLamp ? 46 : 24);
    this.rr(ctx, mid.x - w / 2, y - 11, w, 22, 6);
    ctx.fillStyle = 'rgba(13,19,36,.95)'; ctx.fill();
    ctx.strokeStyle = '#3b4c78'; ctx.lineWidth = 1.4; ctx.stroke();
    if (hasLamp) {
      const st = this.DATA.departments[key], col = this.lampCol(key);
      let alpha = 1;
      if (st === 'error') alpha = 0.4 + 0.6 * (Math.sin(t * 7) > 0 ? 1 : 0);
      else if (st === 'opening') alpha = 0.55 + 0.45 * Math.sin(t * 2.6);
      else if (st === 'paused') alpha = 0.5 + 0.35 * Math.sin(t * 1.6);
      else if (st === 'capped') alpha = 0.55 + 0.4 * Math.sin(t * 3);
      else if (st === 'idle') alpha = 0.75;
      ctx.save(); ctx.globalAlpha = alpha;
      ctx.beginPath(); ctx.arc(mid.x - w / 2 + 13, y, 5, 0, TAU);
      ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = (st === 'done' || st === 'idle') ? 0 : 11; ctx.fill(); ctx.restore();
      ctx.beginPath(); ctx.arc(mid.x - w / 2 + 13, y, 5, 0, TAU); ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#e6eefb'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(r.name, mid.x - w / 2 + 24, y + 1);
    } else {
      ctx.fillStyle = '#b7c6dd'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(r.name, mid.x, y + 1);
    }
  }

  drawSlime(ctx, s, t) {
    const e = this.elevAt(s.pos.x, s.pos.y);
    const p = this.isoE(s.pos.x, s.pos.y, e);
    const hop = Math.abs(Math.sin(t * 4 + s.seed));
    const moving = s.path && s.path.length && s.wait <= 0;
    const lift = moving ? hop * 3 : 0;
    const sq = moving ? 1 - hop * 0.12 : 1;
    ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, s.alpha)); ctx.translate(p.x, p.y - lift);
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(0, lift, 8, 3, 0, 0, TAU); ctx.fill();
    const g = ctx.createRadialGradient(-2, -8, 1, 0, -4, 12);
    g.addColorStop(0, '#8ef0a0'); g.addColorStop(0.6, '#46c46a'); g.addColorStop(1, '#2c9a4c');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-8.5 * sq, 0);
    ctx.quadraticCurveTo(-9 * sq, -13 / sq, 0, -13 / sq);
    ctx.quadraticCurveTo(9 * sq, -13 / sq, 8.5 * sq, 0);
    ctx.quadraticCurveTo(4, 1.5, 0, 1.5); ctx.quadraticCurveTo(-4, 1.5, -8.5 * sq, 0);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.ellipse(-3, -9, 2.4, 1.6, -0.4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#12321c';
    ctx.beginPath(); ctx.ellipse(-2.6, -6, 1.3, 1.8, 0, 0, TAU); ctx.ellipse(2.6, -6, 1.3, 1.8, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-2.2, -6.6, 0.5, 0, TAU); ctx.arc(3, -6.6, 0.5, 0, TAU); ctx.fill();
    ctx.restore();
  }

  drawBubbles(ctx, t) {
    for (const k of Object.keys(DEPT_NAMES)) {
      if (k === 'orchestrator') continue;
      const st = this.DATA.departments[k];
      let txt = null, col = '#0b1220';
      if (st === 'waiting') { txt = 'waiting'; col = '#a86a00'; }
      else if (st === 'opening') { txt = '?'; col = '#2a5fa8'; }
      else if (st === 'error') { txt = '!'; col = '#c0263a'; }
      else if (st === 'paused') { txt = 'on break'; col = '#2f6f96'; }
      if (!txt) continue;
      const pool = this.agents.filter(g => g.dept === k);
      const a = (st === 'paused' ? pool.find(g => g.state === 'break' || g.state === 'chat') : pool.find(g => g.dept === k && g.state !== 'walk')) || pool[0];
      if (!a) continue;
      const e = this.elevAt(a.pos.x, a.pos.y);
      const p = this.isoE(a.pos.x, a.pos.y, e);
      const bob = Math.sin(t * 2 + a.seed) * 1.5;
      this.bubble(ctx, p.x + 16, p.y - 78 + bob, txt, col);
    }
  }
  bubble(ctx, x, y, txt, col) {
    ctx.font = '700 10px "Chakra Petch", sans-serif';
    const w = ctx.measureText(txt).width + 14, h = 17;
    this.rr(ctx, x - w / 2, y - h, w, h, 6); ctx.fillStyle = 'rgba(248,251,255,.96)'; ctx.fill();
    ctx.strokeStyle = 'rgba(120,150,190,.7)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 3, y - 1); ctx.lineTo(x + 4, y - 1); ctx.lineTo(x - 2, y + 5); ctx.closePath(); ctx.fillStyle = 'rgba(248,251,255,.96)'; ctx.fill();
    ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x, y - h / 2);
  }

  /* ---------- low walls + furniture (depth-sorted items) ---------- */

  lowWallItems(items) {
    const glowLo = this.capActive ? 'rgba(255,150,60,.5)' : 'rgba(140,200,255,.4)', fill = this.capActive ? '#6b5030' : '#6b7699';
    for (const k in ROOMS) {
      const r = ROOMS[k]; const e = r.elev || 0;
      const [x1, y1, x2, y2] = r.rect;
      const on = (wall) => r.doors.filter(d => d.wall === wall).map(d => d.c);
      const seg = (edge, a, b) => {
        if (edge === 'S') items.push({ d: (a + b) / 2 + y2 + 0.4, draw: (c) => this.wallSeg(c, this.isoE(a, y2, e), this.isoE(b, y2, e), 12, fill, glowLo) });
        else if (edge === 'E') items.push({ d: x2 + (a + b) / 2 + 0.4, draw: (c) => this.wallSeg(c, this.isoE(x2, a, e), this.isoE(x2, b, e), 12, fill, glowLo) });
        else if (edge === 'N') items.push({ d: (a + b) / 2 + y1 - 0.4, draw: (c) => this.wallSeg(c, this.isoE(a, y1, e), this.isoE(b, y1, e), 12, fill, glowLo) });
        else items.push({ d: x1 + (a + b) / 2 - 0.4, draw: (c) => this.wallSeg(c, this.isoE(x1, a, e), this.isoE(x1, b, e), 12, fill, glowLo) });
      };
      for (const [a, b] of this.segments(x1, x2, on('S'))) seg('S', a, b);
      for (const [a, b] of this.segments(y1, y2, on('E'))) seg('E', a, b);
      if (!r.tallN) for (const [a, b] of this.segments(x1, x2, on('N'))) seg('N', a, b);
      if (!r.tallW) for (const [a, b] of this.segments(y1, y2, on('W'))) seg('W', a, b);
    }
  }

  furnitureItems(items, t) {
    const on = (k) => !this.isBreak(k);
    // desks + chairs + glowing monitors in dept rooms
    for (const k of ['engineering', 'infra', 'integrations', 'customer', 'marketing']) {
      const lit = on(k);
      for (const [dx, dy] of DESKS[k]) {
        items.push({
          d: dx + dy, draw: (ctx) => {
            this.box(ctx, dx - 2.8, dy - 1.2, 5.6, 2.4, 11, '#e2e6ee');
            this.box(ctx, dx - 1, dy - 1, 2, 0.6, 12, '#12151f');
            if (lit) { const p = this.iso(dx, dy - 0.7); ctx.fillStyle = 'rgba(103,232,249,' + (0.3 + 0.16 * Math.sin(t * 3 + dx)) + ')'; ctx.beginPath(); ctx.ellipse(p.x, p.y - 15, 7, 3, 0, 0, TAU); ctx.fill(); }
            // chair
            this.box(ctx, dx - 1.2, dy + 1.6, 2.4, 2.4, 7, '#3a4463');
          }
        });
      }
    }
    // c-suite boardroom table
    items.push({ d: 117 + 97, draw: (ctx) => { this.box(ctx, 104, 94, 26, 6, 12, '#6a4a30', { stroke: 'rgba(0,0,0,.3)' }); } });
    // infra server racks with blinking LEDs
    for (let i = 0; i < 4; i++) { const x = 62 + i * 9; items.push({ d: x + 2, draw: (ctx) => { this.box(ctx, x, 1.5, 5, 2.6, 30, '#1c2740', { stroke: '#3b4c78' }); const p = this.iso(x + 2.5, 4); for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) { const o = Math.sin(t * 3 + x + r * 2 + c) > 0; ctx.fillStyle = o ? (c === 2 ? '#3ee06b' : '#67e8f9') : '#26365a'; ctx.beginPath(); ctx.arc(p.x - 8 + c * 8, p.y - 26 + r * 6, 1.6, 0, TAU); ctx.fill(); } } }); }
    // cafeteria counter + coffee machine with blinking light
    items.push({ d: 92 + 44, draw: (ctx) => { this.box(ctx, 86, 43.5, 13, 2.6, 14, '#c8d2dc'); this.box(ctx, 88.5, 43.8, 2.2, 1.8, 22, '#2a2f3a'); const p = this.iso(89.5, 44.6); ctx.fillStyle = Math.sin(t * 2) > 0 ? '#ff4d5e' : '#5a2a30'; ctx.beginPath(); ctx.arc(p.x, p.y - 19, 1.8, 0, TAU); ctx.fill(); } });
    // cafeteria vending machine (purple glow)
    items.push({ d: 106 + 44, draw: (ctx) => { this.box(ctx, 104.5, 43.5, 3.4, 2.4, 25, '#43305c', { stroke: 'rgba(168,85,247,.5)' }); const p = this.iso(106.2, 45.7); ctx.fillStyle = 'rgba(196,181,253,.5)'; ctx.fillRect(p.x - 5, p.y - 24, 10, 14); } });
    // cafeteria tables
    items.push({ d: 92 + 62, draw: (ctx) => { this.box(ctx, 90.5, 60.8, 3, 2.8, 9, '#cdd6e0'); } });
    items.push({ d: 104 + 62, draw: (ctx) => { this.box(ctx, 102.5, 60.8, 3, 2.8, 9, '#cdd6e0'); } });
    // restroom sinks
    items.push({ d: 127 + 45, draw: (ctx) => { this.box(ctx, 121, 43.6, 3, 1.8, 11, '#aeb9c6'); this.box(ctx, 129, 43.6, 3, 1.8, 11, '#aeb9c6'); } });
    // lounge sofas + coffee table + plant
    items.push({ d: 6 + 53, draw: (ctx) => { this.box(ctx, 3.5, 51.5, 6, 2.8, 10, '#9a7a54'); this.box(ctx, 3.5, 51, 6, 1, 16, '#7e6142'); } });
    items.push({ d: 14 + 53, draw: (ctx) => { this.box(ctx, 11.5, 51.5, 6, 2.8, 10, '#9a7a54'); this.box(ctx, 11.5, 51, 6, 1, 16, '#7e6142'); } });
    items.push({ d: 10 + 61, draw: (ctx) => { this.box(ctx, 8, 59.8, 4, 2.8, 7, '#5a5240'); } });
    items.push({ d: 4 + 68, draw: (ctx) => { this.box(ctx, 3, 67, 1.8, 1.6, 6, '#7a4a30'); const p = this.iso(3.9, 67.8); ctx.fillStyle = '#3f8a52'; ctx.beginPath(); ctx.arc(p.x - 4, p.y - 12, 5, 0, TAU); ctx.arc(p.x + 4, p.y - 12, 5, 0, TAU); ctx.arc(p.x, p.y - 17, 5, 0, TAU); ctx.fill(); } });
    // collab hub sofa + kiosk + screen
    items.push({ d: 26 + 104, draw: (ctx) => { this.box(ctx, 22, 102.5, 7, 2.8, 10, '#8a6b52'); } });
    items.push({ d: 39 + 103, draw: (ctx) => { this.box(ctx, 38, 101.8, 2.4, 2, 17, '#33436a', { stroke: 'rgba(103,232,249,.5)' }); const p = this.iso(39.2, 103.5); ctx.fillStyle = 'rgba(103,232,249,.55)'; ctx.fillRect(p.x - 4, p.y - 16, 8, 6); } });
    // hall status board (H2)
    items.push({ d: 62 + 81.5, draw: (ctx) => { this.box(ctx, 60, 80.9, 5, 0.9, 20, '#1a2b48', { stroke: 'rgba(103,232,249,.45)' }); const p = this.iso(62.5, 81.3); ctx.fillStyle = 'rgba(143,220,240,.45)'; for (let i = 0; i < 3; i++) ctx.fillRect(p.x - 10, p.y - 18 + i * 5, 14 - i * 3, 2); } });
    // hall water cooler (H1)
    items.push({ d: 95 + 35, draw: (ctx) => { this.box(ctx, 94, 34.5, 2.2, 1.4, 15, '#2e6ea8', { stroke: 'rgba(103,232,249,.6)' }); const p = this.iso(95.1, 35.2); ctx.fillStyle = '#9fe6ff'; ctx.beginPath(); ctx.arc(p.x, p.y - 12, 2, 0, TAU); ctx.fill(); } });
    // orchestrator console (on platform)
    items.push({ d: 53 + 58.5, draw: (ctx) => { this.box(ctx, 50, 57.4, 6, 2, 11, '#2a2050', { stroke: 'rgba(139,92,246,.7)', e: 16 }); } });
    // potted plants in room corners
    const plant = (px, py, big) => items.push({
      d: px + py, draw: (ctx) => {
        this.box(ctx, px - 0.9, py - 0.9, 1.8, 1.8, big ? 6 : 5, '#7a4a30');
        const p = this.iso(px, py); const R = big ? 6 : 5;
        ctx.fillStyle = '#3f8a52'; ctx.beginPath(); ctx.arc(p.x - R * 0.7, p.y - 12, R, 0, TAU); ctx.arc(p.x + R * 0.7, p.y - 12, R, 0, TAU); ctx.arc(p.x, p.y - 12 - R, R, 0, TAU); ctx.fill();
        ctx.fillStyle = '#4fa866'; ctx.beginPath(); ctx.arc(p.x, p.y - 13 - R * 0.6, R * 0.6, 0, TAU); ctx.fill();
      }
    });
    plant(49, 3, true); plant(96, 3); plant(133, 3, true); plant(90, 84); plant(134, 84, true); plant(2, 84);
    // customer bookshelf (docs)
    items.push({ d: 2 + 86, draw: (ctx) => { this.box(ctx, 1, 84, 2, 6, 22, '#5a4433', { stroke: 'rgba(0,0,0,.3)' }); const p = this.iso(2, 87); for (let i = 0; i < 4; i++) { ctx.fillStyle = ['#c26', '#2a8', '#c93', '#48c'][i]; ctx.fillRect(p.x - 6, p.y - 20 + i * 4.5, 12, 3); } } });
    // marketing design easel
    items.push({ d: 62 + 90, draw: (ctx) => { this.box(ctx, 61, 88, 4, 0.8, 18, '#8a6b4a'); const p = this.iso(63, 88.4); ctx.fillStyle = '#eef0f4'; ctx.fillRect(p.x - 7, p.y - 17, 14, 12); ctx.strokeStyle = '#d96a4f'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(p.x, p.y - 11, 4, 0, TAU); ctx.stroke(); } });
    // entrance mat
    items.push({ d: 46 + 110.6, draw: (ctx) => { const p1 = this.iso(43, 110), p2 = this.iso(49, 110), p3 = this.iso(50, 113), p4 = this.iso(42, 113); ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y); ctx.closePath(); ctx.fillStyle = 'rgba(103,232,249,.14)'; ctx.fill(); ctx.strokeStyle = 'rgba(103,232,249,.4)'; ctx.stroke(); ctx.font = '600 9px "Chakra Petch", sans-serif'; ctx.fillStyle = '#7fd6ea'; ctx.textAlign = 'center'; const m = this.iso(46, 112.6); ctx.fillText('MAIN ENTRANCE', m.x, m.y + 10); } });
  }

  // Orange ceiling wash over every room (dept and non-dept) while capped.
  drawCapLight(ctx, t) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const k in ROOMS) {
      const r = ROOMS[k];
      const cx = (r.rect[0] + r.rect[2]) / 2, cy = (r.rect[1] + r.rect[3]) / 2;
      const c = this.isoE(cx, cy, r.elev || 0);
      const rad = 96, pulse = 0.15 + 0.06 * Math.sin(t * 3 + cx * 0.2);
      const g = ctx.createRadialGradient(c.x, c.y - 10, 6, c.x, c.y - 10, rad);
      g.addColorStop(0, 'rgba(255,138,42,' + pulse.toFixed(3) + ')');
      g.addColorStop(1, 'rgba(255,138,42,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(c.x, c.y - 10, rad, rad * 0.6, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  drawRugs(ctx) {
    const rugs = [
      { r: [3, 58, 18, 71], c: 'rgba(150,92,60,.3)', b: 'rgba(200,150,110,.4)' },      // lounge
      { r: [103, 91, 131, 108], c: 'rgba(110,80,46,.34)', b: 'rgba(180,140,90,.45)' }, // c-suite under table
      { r: [18, 100, 31, 109], c: 'rgba(80,104,150,.28)', b: 'rgba(140,175,220,.4)' }, // customer
      { r: [39, 99, 53, 110], c: 'rgba(80,116,160,.24)', b: 'rgba(130,180,220,.36)' }, // collab hub
      { r: [87, 60, 109, 71], c: 'rgba(120,128,146,.22)', b: 'rgba(170,180,200,.34)' } // cafeteria
    ];
    for (const g of rugs) {
      this.floorPoly(ctx, g.r[0], g.r[1], g.r[2], g.r[3], 0);
      ctx.fillStyle = g.c; ctx.fill();
      ctx.strokeStyle = g.b; ctx.lineWidth = 1.4; ctx.setLineDash([6, 5]); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  wallDeco(ctx, t) {
    const face = (x1, x2, top, bot, fill, stroke) => {
      const a = this.iso(x1, 0), b = this.iso(x2, 0);
      ctx.beginPath(); ctx.moveTo(a.x, a.y - top); ctx.lineTo(b.x, b.y - top); ctx.lineTo(b.x, b.y - bot); ctx.lineTo(a.x, a.y - bot); ctx.closePath();
      ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke();
    };
    // engineering windows
    face(4, 24, 52, 20, 'rgba(120,170,220,.35)', 'rgba(180,220,255,.6)');
    ctx.strokeStyle = 'rgba(210,235,255,.5)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let i = 0; i < 6; i++) { const q = this.iso(6 + i * 3, 0); ctx.moveTo(q.x, q.y - 50); ctx.lineTo(q.x, q.y - 22); } ctx.stroke();
    // engineering blueprint monitor
    face(28, 42, 50, 24, 'rgba(13,30,55,.92)', 'rgba(103,232,249,.55)');
    ctx.strokeStyle = 'rgba(103,232,249,.5)'; ctx.beginPath();
    const eb = this.iso(30, 0); ctx.moveTo(eb.x, eb.y - 30 - 6 * Math.sin(t)); ctx.lineTo(this.iso(41, 0).x, this.iso(41, 0).y - 40 + 5 * Math.sin(t + 1)); ctx.stroke();
    // infra world map with blinking nodes
    face(62, 82, 52, 22, 'rgba(10,26,48,.94)', 'rgba(59,130,246,.6)');
    ctx.fillStyle = 'rgba(62,224,107,.55)';
    for (let i = 0; i < 8; i++) { const q = this.iso(64 + (i * 2.3) % 18, 0); ctx.beginPath(); ctx.arc(q.x, q.y - 46 + (i * 7) % 22, 1.6 + Math.sin(t * 2 + i) * 0.5, 0, TAU); ctx.fill(); }
    // infra dashboards
    face(84, 98, 50, 24, 'rgba(12,20,40,.92)', 'rgba(103,232,249,.5)');
    // integrations portal
    const e = this.iso(122, 0);
    const pg = ctx.createRadialGradient(e.x, e.y - 36, 2, e.x, e.y - 36, 17);
    pg.addColorStop(0, 'rgba(196,181,253,.95)'); pg.addColorStop(1, 'rgba(76,29,149,.05)');
    ctx.fillStyle = pg; ctx.beginPath(); ctx.ellipse(e.x, e.y - 36, 12, 16, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(196,181,253,.85)'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.ellipse(e.x, e.y - 36, 12, 16, 0, t, t + 4); ctx.stroke();
    // customer window (W wall)
    const cwa = this.iso(0, 88), cwb = this.iso(0, 104);
    ctx.beginPath(); ctx.moveTo(cwa.x, cwa.y - 46); ctx.lineTo(cwb.x, cwb.y - 46); ctx.lineTo(cwb.x, cwb.y - 22); ctx.lineTo(cwa.x, cwa.y - 22); ctx.closePath();
    ctx.fillStyle = 'rgba(120,170,220,.28)'; ctx.fill(); ctx.strokeStyle = 'rgba(180,220,255,.5)'; ctx.stroke();
    // marketing whiteboards (N wall)
    face(62, 90, 50, 24, 'rgba(232,236,242,.95)', 'rgba(150,170,200,.7)');
    ctx.strokeStyle = 'rgba(70,110,180,.7)'; ctx.lineWidth = 1.2; ctx.beginPath();
    const mb = this.iso(66, 0); ctx.moveTo(mb.x, mb.y - 42); ctx.lineTo(mb.x + 40, mb.y - 34); ctx.moveTo(mb.x, mb.y - 34); ctx.lineTo(mb.x + 26, mb.y - 30); ctx.stroke();
    ctx.strokeStyle = 'rgba(200,90,90,.8)'; ctx.beginPath(); ctx.arc(mb.x + 60, mb.y - 36, 6, 0, TAU); ctx.stroke();
    // c-suite art (warm)
    face(100, 134, 50, 24, 'rgba(60,42,28,.9)', 'rgba(180,150,100,.6)');
    ctx.fillStyle = 'rgba(200,170,110,.4)';
    const ca = this.iso(112, 0); ctx.fillRect(ca.x, ca.y - 46, 26, 18);
  }

  holo(ctx, t) {
    const p = this.isoE(53, 57, 16); const y = p.y - 42;
    ctx.save(); ctx.globalAlpha = 0.9;
    const g = ctx.createRadialGradient(p.x, y, 2, p.x, y, 40);
    g.addColorStop(0, 'rgba(103,232,249,.42)'); g.addColorStop(1, 'rgba(103,232,249,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, y, 40, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(103,232,249,.7)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(p.x, y, 30, 11, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(167,139,250,.8)'; ctx.beginPath(); ctx.ellipse(p.x, y, 37, 14, 0, t * 1.2, t * 1.2 + 1.8); ctx.stroke();
    ctx.fillStyle = 'rgba(103,232,249,.9)';
    for (let i = 0; i < 6; i++) { const ang = t * 0.9 + i * 1.05; ctx.beginPath(); ctx.arc(p.x + Math.cos(ang) * 30, y + Math.sin(ang) * 11, 1.8, 0, TAU); ctx.fill(); }
    ctx.font = '700 11px "Chakra Petch", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(143,220,240,.95)';
    ctx.fillText('ORCHESTRATOR', p.x, y - 20);
    ctx.restore();
  }

  /* ---------- frame ---------- */

  draw() {
    const ctx = this.ctx, t = this.t;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, 1600, 920);
    ctx.fillStyle = '#0c142a'; ctx.fillRect(0, 0, 1600, 920);
    const v = this.view;
    ctx.setTransform(v.scale, 0, 0, v.scale, v.ox, v.oy);
    // hall floors + marching lane dashes
    for (const [x1, y1, x2, y2] of HALLS) { this.floorPoly(ctx, x1, y1, x2, y2, 0); ctx.fillStyle = '#1a2440'; ctx.fill(); }
    ctx.strokeStyle = 'rgba(103,232,249,.18)'; ctx.lineWidth = 2; ctx.setLineDash([10, 14]); ctx.lineDashOffset = -t * 26;
    const lane = (a, b) => { const p = this.iso(a[0], a[1]), q = this.iso(b[0], b[1]); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); };
    lane([2, 38], [134, 38]); lane([2, 78], [134, 78]); lane([26, 40], [26, 76]); lane([80, 40], [80, 76]);
    ctx.setLineDash([]);
    // room floors (except platform)
    for (const k in ROOMS) {
      const r = ROOMS[k]; if (r.elev) continue;
      const brk = this.isBreak(k), done = this.DATA.departments[k] === 'done';
      this.floorPoly(ctx, r.rect[0], r.rect[1], r.rect[2], r.rect[3], 0);
      const g = ctx.createLinearGradient(0, this.iso(r.rect[0], r.rect[1]).y, 0, this.iso(r.rect[2], r.rect[3]).y);
      g.addColorStop(0, this.shade(r.floor, 0.06)); g.addColorStop(1, this.shade(r.floor, -0.12));
      ctx.fillStyle = this.capActive ? '#5a3a1c' : done ? this.shade(r.floor, -0.5) : brk ? this.shade(r.floor, -0.26) : g; ctx.fill();
      ctx.strokeStyle = 'rgba(40,55,85,.18)'; ctx.lineWidth = 1;
      ctx.save(); ctx.clip();
      ctx.beginPath();
      for (let gx = r.rect[0]; gx <= r.rect[2]; gx += 6) { const a = this.iso(gx, r.rect[1]), b = this.iso(gx, r.rect[3]); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
      for (let gy = r.rect[1]; gy <= r.rect[3]; gy += 6) { const a = this.iso(r.rect[0], gy), b = this.iso(r.rect[2], gy); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
      ctx.stroke(); ctx.restore();
    }
    // rugs / floor decals (on floor, under furniture)
    this.drawRugs(ctx);
    // usage-cap: every room bathed in orange light
    if (this.capActive) this.drawCapLight(ctx, t);
    // tall back walls + wall deco
    this.drawTallWalls(ctx, t);
    // platform (elevated)
    this.drawPlatform(ctx, t);
    // network delegation lines from platform
    const dc = this.isoE(53, 58, 16);
    for (const k of Object.keys(DEPT_NAMES)) {
      if (k === 'orchestrator') continue;
      if (this.isBreak(k)) continue;
      const r = ROOMS[k];
      const m = this.iso((r.rect[0] + r.rect[2]) / 2, (r.rect[1] + r.rect[3]) / 2);
      const lc = this.lampCol(k);
      ctx.save(); ctx.shadowColor = lc; ctx.shadowBlur = 8;
      ctx.strokeStyle = lc; ctx.globalAlpha = 0.7; ctx.lineWidth = 2.4; ctx.setLineDash([5, 9]); ctx.lineDashOffset = -t * 34;
      ctx.beginPath(); ctx.moveTo(dc.x, dc.y);
      ctx.quadraticCurveTo((dc.x + m.x) / 2, Math.min(dc.y, m.y) - 60, m.x, m.y); ctx.stroke();
      ctx.restore();
    }
    ctx.setLineDash([]);
    // depth-sorted items: walls, furniture, agents, shadows, slimes
    const items = [];
    this.lowWallItems(items);
    this.furnitureItems(items, t);
    for (const a of this.agents) items.push({ d: a.pos.x + a.pos.y + this.elevAt(a.pos.x, a.pos.y) * 0.01, draw: (c) => this.drawChar(c, a, t) });
    if (CONFIG.showShadows) for (const s of [...this.resShadows, ...this.shadows]) items.push({ d: s.pos.x + s.pos.y, draw: (c) => this.drawShadowChibi(c, s, t) });
    for (const s of this.slimes) items.push({ d: s.pos.x + s.pos.y - 0.5, draw: (c) => this.drawSlime(c, s, t) });
    items.sort((a, b) => a.d - b.d);
    for (const it of items) it.draw(ctx);
    // holo above orchestrator console
    this.holo(ctx, t);
    // signs + badges
    for (const k in ROOMS) this.drawSign(ctx, k, t);
    for (const a of this.agents) this.badge(ctx, a);
    this.drawBubbles(ctx, t);
  }
}

/* ======================== 4. BOOT ======================== */
// Deferred scripts run in order after the DOM is parsed: sprites.js has already
// defined window.L3RAIN_SPRITES by the time this executes.
window.__l3rainOwner = new L3RainHQ();
