'use strict';

/* =========================================================
   ChargeLog web — core: storage, maths, formatting, icons
   ========================================================= */

const APP_VERSION = '1.0';
const STORAGE_KEY = 'chargelog.v1';

const DEFAULTS = {
  capacity: 44,        // kWh
  lossPct: 20,         // cable / heat loss %
  price: 0.15,         // € per kWh before IVA
  vatPct: 23,          // IVA %
  power: 2.3,          // charger kW (estimates only)
  target: 80,          // estimate target %
  lastStart: 30,
  reminder: 'shortcut',            // 'shortcut' | 'calendar' | 'app'
  shortcutName: 'ChargeLog Reminder',
  installHintDismissed: false,
};

const store = {
  data: { sessions: [], settings: { ...DEFAULTS } },
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.data.sessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];
        this.data.settings = { ...DEFAULTS, ...(parsed.settings || {}) };
      }
    } catch (e) { console.warn('Could not load data', e); }
  },
  save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data)); }
    catch (e) { console.warn('Could not save data', e); toast('Could not save — storage is full or blocked', 'warn'); }
  },
  get settings() { return this.data.settings; },
  get sessions() { return this.data.sessions; },
};

/* ---------- Maths: your formula ---------- */
// kWh = consumption(%) × capacity × cable loss
// €   = kWh × price × IVA
function tariffNow() {
  const s = store.settings;
  return { cap: +s.capacity, loss: 1 + s.lossPct / 100, price: +s.price, vat: 1 + s.vatPct / 100 };
}
const energyFor = (t, pct) => (pct / 100) * t.cap * t.loss;
const costFor = (t, pct) => energyFor(t, pct) * t.price * t.vat;

const tariffOf = (s) => ({ cap: s.cap, loss: s.loss, price: s.price, vat: s.vat });
const isActive = (s) => s.end == null;
const addedPct = (s) => Math.max(0, (s.endPct ?? s.startPct) - s.startPct);
const sEnergy = (s) => energyFor(tariffOf(s), addedPct(s));
const sCost = (s) => costFor(tariffOf(s), addedPct(s));
const sDuration = (s) => (s.end ?? Date.now()) - s.start;

const activeSession = () => store.sessions.find(isActive) || null;
const completedSessions = () => store.sessions.filter((s) => !isActive(s)).sort((a, b) => b.start - a.start);

function estimateMs(t, fromPct, toPct, powerKw) {
  const pct = toPct - fromPct;
  if (powerKw <= 0 || pct <= 0) return null;
  return (energyFor(t, pct) / powerKw) * 3600 * 1000;
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

/* ---------- Formatting ---------- */
const LOCALE = navigator.language || 'pt-PT';      // numbers & currency
const DATE_LOCALE = 'en-GB';                         // dates & times (UI language)
const eurFmt = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'EUR' });
const kwhFmt = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmt = {
  eur: (v) => eurFmt.format(v || 0),
  kwh: (v) => kwhFmt.format(v || 0) + ' kWh',
  num: (v, d = 2) => new Intl.NumberFormat(LOCALE, { maximumFractionDigits: d }).format(v || 0),
  pct: (v) => Math.round(v) + '%',
  dur(ms) {
    const m = Math.round(Math.max(0, ms) / 60000);
    if (m < 1) return '<1m';
    const h = Math.floor(m / 60), mm = m % 60;
    return h ? (mm ? `${h}h ${mm}m` : `${h}h`) : `${mm}m`;
  },
  timer(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const p = (n) => String(n).padStart(2, '0');
    return h ? `${h}:${p(m)}:${p(sec)}` : `${m}:${p(sec)}`;
  },
  time: (d) => new Date(d).toLocaleTimeString(DATE_LOCALE, { hour: '2-digit', minute: '2-digit' }),
  dayKey: (d) => { const x = new Date(d); return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`; },
  clock(d) {
    const date = new Date(d), now = new Date();
    const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    const k = fmt.dayKey(date);
    if (k === fmt.dayKey(now)) return fmt.time(date);
    if (k === fmt.dayKey(tomorrow)) return 'tomorrow ' + fmt.time(date);
    if (k === fmt.dayKey(yesterday)) return 'yesterday ' + fmt.time(date);
    return date.toLocaleDateString(DATE_LOCALE, { day: 'numeric', month: 'short' }) + ' ' + fmt.time(date);
  },
  clockAt(d) {
    const c = fmt.clock(d);
    return /^\d/.test(c) ? 'at ' + c : c.replace(/ (\d{1,2}:\d{2})$/, ' at $1');
  },
  month(d) {
    const s = new Date(d).toLocaleDateString(DATE_LOCALE, { month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  },
  monthNarrow: (d) => new Date(d).toLocaleDateString(DATE_LOCALE, { month: 'narrow' }).toUpperCase(),
  weekdayShort: (d) => new Date(d).toLocaleDateString(DATE_LOCALE, { weekday: 'short' }).replace('.', '').toUpperCase(),
  relative(ms) {
    if (ms <= 0) return 'now';
    return 'in ' + fmt.dur(ms);
  },
};

function parseNum(str) {
  if (typeof str === 'number') return str;
  const v = parseFloat(String(str).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(v) ? v : NaN;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function startOfMonth(d) { const x = new Date(d); return new Date(x.getFullYear(), x.getMonth(), 1).getTime(); }
function addMonths(ts, n) { const x = new Date(ts); return new Date(x.getFullYear(), x.getMonth() + n, 1).getTime(); }
function toLocalInput(ts) {
  const d = new Date(ts), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fromLocalInput(v) { const t = new Date(v).getTime(); return Number.isFinite(t) ? t : null; }

/* ---------- Icons (simple line icons) ---------- */
const I = (body, fill = false) =>
  `<svg class="ico" viewBox="0 0 24 24" fill="${fill ? 'currentColor' : 'none'}" stroke="${fill ? 'none' : 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICON = {
  bolt: I('<path d="M13.5 2 4.5 13.5h6.5L9.5 22l10-12h-6.6L13.5 2z"/>', true),
  car: I('<path d="M5 16.5V12l2-5.2A2 2 0 0 1 8.9 5.5h6.2a2 2 0 0 1 1.9 1.3L19 12v4.5"/><path d="M3.5 16.5h17v2.2a1 1 0 0 1-1 1H18a1 1 0 0 1-1-1v-.7H7v.7a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1z"/><path d="M5 12h14"/><circle cx="7.5" cy="14.3" r=".6"/><circle cx="16.5" cy="14.3" r=".6"/>'),
  list: I('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2" fill="currentColor"/><circle cx="4.5" cy="12" r="1.2" fill="currentColor"/><circle cx="4.5" cy="18" r="1.2" fill="currentColor"/>'),
  chart: I('<path d="M4 20h16"/><rect x="5.5" y="11" width="3" height="6.5" rx="1"/><rect x="10.5" y="6" width="3" height="11.5" rx="1"/><rect x="15.5" y="9" width="3" height="8.5" rx="1"/>'),
  sliders: I('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>'),
  bell: I('<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>'),
  bellOff: I('<path d="M8.6 5.6A6 6 0 0 1 18 11v4M6 11v5l-1.5 2H17"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/><path d="M3 3l18 18"/>'),
  flag: I('<path d="M5 21V4"/><path d="M5 4h12l-2.5 4L17 12H5"/>'),
  chevron: I('<path d="M9 5l7 7-7 7"/>'),
  arrow: I('<path d="M4 12h15M13 6l6 6-6 6"/>'),
  plus: I('<path d="M12 5v14M5 12h14"/>'),
  minus: I('<path d="M5 12h14"/>'),
  dots: I('<circle cx="5.5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="18.5" cy="12" r="1.6" fill="currentColor"/>'),
  share: I('<path d="M12 3v12M7.5 7.5 12 3l4.5 4.5"/><path d="M6 11H5v9h14v-9h-1"/>'),
  trash: I('<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>'),
  check: I('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  clock: I('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  wand: I('<path d="M4 20 15 9M14 4v3M12.5 5.5h3M19 9v3M17.5 10.5h3M18 3.5l.7.7"/>'),
  euro: I('<circle cx="12" cy="12" r="9"/><path d="M15.5 8.6a4 4 0 1 0 0 6.8M7 11h6M7 13h6"/>'),
  battery: I('<rect x="3" y="7" width="16" height="10" rx="2.5"/><path d="M21.5 10.5v3"/><path d="M11.5 9 9 12.3h3.3L10 15.5" stroke-width="1.6"/>'),
  hash: I('<path d="M9 4 7.5 20M16.5 4 15 20M4.5 9h16M3.5 15h16"/>'),
  divide: I('<circle cx="12" cy="6.5" r="1.2" fill="currentColor"/><circle cx="12" cy="17.5" r="1.2" fill="currentColor"/><path d="M5 12h14"/>'),
  warn: I('<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.2M12 17h.01"/>'),
  info: I('<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8h.01"/>'),
  download: I('<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M5 19.5h14"/>'),
  upload: I('<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/><path d="M5 19.5h14"/>'),
  repeat: I('<path d="M4 11V9a3 3 0 0 1 3-3h12M16 3l3 3-3 3"/><path d="M20 13v2a3 3 0 0 1-3 3H5M8 21l-3-3 3-3"/>'),
  calendar: I('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
  plug: I('<path d="M9 3v5M15 3v5M6.5 8h11v3a5.5 5.5 0 0 1-11 0z"/><path d="M12 16.5V21"/>'),
};

/* ---------- Small UI primitives ---------- */
function h(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }

let toastTimer = null;
function toast(msg, kind = 'ok') {
  let el = document.getElementById('toast');
  if (!el) { el = h('<div id="toast" class="toast"></div>'); document.body.appendChild(el); }
  el.innerHTML = (kind === 'warn' ? ICON.warn.replace('class="ico"', 'class="ico" style="color:var(--orange)"') : ICON.check) + `<span>${esc(msg)}</span>`;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/** iOS-style bottom sheet. Returns { el, body, close }. */
function openSheet({ title, left = 'Cancel', right = null, onRight = null, medium = false, footer = null, onClose = null }) {
  const backdrop = h('<div class="backdrop"></div>');
  const sheet = h(`
    <div class="sheet${medium ? ' medium' : ''}" role="dialog" aria-modal="true">
      <div class="sheet-grabber"></div>
      <div class="sheet-head">
        <button class="left">${esc(left)}</button>
        <h2>${esc(title)}</h2>
        ${right ? `<button class="right">${esc(right)}</button>` : '<span></span>'}
      </div>
      <div class="sheet-body"></div>
      ${footer ? '<div class="sheet-foot"></div>' : ''}
    </div>`);
  document.body.append(backdrop, sheet);
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => { backdrop.classList.add('show'); sheet.classList.add('show'); });

  let closed = false;
  function close() {
    if (closed) return; closed = true;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    backdrop.classList.remove('show'); sheet.classList.remove('show');
    setTimeout(() => { backdrop.remove(); sheet.remove(); if (!document.querySelector('.sheet')) document.body.style.overflow = ''; }, 380);
    onClose && onClose();
  }
  backdrop.addEventListener('click', close);
  sheet.querySelector('.left').addEventListener('click', close);
  if (right) sheet.querySelector('.right').addEventListener('click', () => onRight && onRight(close));

  // Drag the grabber/header down to dismiss
  const head = sheet.querySelector('.sheet-head'), grab = sheet.querySelector('.sheet-grabber');
  let startY = null, dy = 0;
  const onStart = (e) => { if (e.target.closest('button')) return; startY = e.touches[0].clientY; dy = 0; sheet.style.transition = 'none'; };
  const onMove = (e) => { if (startY == null) return; dy = Math.max(0, e.touches[0].clientY - startY); sheet.style.transform = `translateY(${dy}px)`; };
  const onEnd = () => { if (startY == null) return; sheet.style.transition = ''; sheet.style.transform = ''; if (dy > 110) close(); startY = null; };
  [head, grab].forEach((el) => { el.addEventListener('touchstart', onStart, { passive: true }); el.addEventListener('touchmove', onMove, { passive: true }); el.addEventListener('touchend', onEnd); });

  return { el: sheet, body: sheet.querySelector('.sheet-body'), foot: sheet.querySelector('.sheet-foot'), close };
}

/** iOS-style action sheet. actions: [{ label, destructive, handler }] */
function actionSheet({ title = '', message = '', actions = [] }) {
  const backdrop = h('<div class="backdrop" style="z-index:60"></div>');
  const el = h(`
    <div class="action-sheet">
      <div class="action-group">
        ${title || message ? `<div class="msg">${title ? `<b>${esc(title)}</b>` : ''}${esc(message)}</div>` : ''}
        ${actions.map((a, i) => `<button data-i="${i}" class="${a.destructive ? 'destructive' : ''}">${esc(a.label)}</button>`).join('')}
      </div>
      <div class="action-group cancel-group"><button class="cancel">Cancel</button></div>
    </div>`);
  document.body.append(backdrop, el);
  requestAnimationFrame(() => { backdrop.classList.add('show'); el.classList.add('show'); });
  const close = () => { backdrop.classList.remove('show'); el.classList.remove('show'); setTimeout(() => { backdrop.remove(); el.remove(); }, 320); };
  backdrop.addEventListener('click', close);
  el.querySelector('.cancel').addEventListener('click', close);
  el.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => { close(); actions[+b.dataset.i].handler(); }));
}

function ringSVG({ from = 0, to, stroke = 12, track = 'rgba(255,255,255,0.25)', color = '#fff', size = 100 }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const a = clamp(from / 100, 0, 1), b = Math.max(a + 0.005, clamp(to / 100, 0, 1));
  const len = (b - a) * c;
  return `<svg viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${track}" stroke-width="${stroke}"/>
    <circle class="ring-arc" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"
      stroke-linecap="round" stroke-dasharray="${len} ${c}" stroke-dashoffset="${-a * c}"/>
  </svg>`;
}

function batteryColor(p) { return p < 20 ? 'var(--red)' : p < 40 ? 'var(--orange)' : 'var(--brand)'; }

/** Big % picker: number, battery bar, − slider +. */
function PercentInput(container, { value, min = 0, max = 100, onChange }) {
  container.innerHTML = `
    <div class="pct-display"><span class="pct-num num"></span><span class="pct-sign">%</span></div>
    <div class="battery-bar"><div class="battery-fill"></div></div>
    <div class="pct-controls">
      <button class="round-btn" data-d="-1" aria-label="Minus 1">${ICON.minus}</button>
      <input type="range" step="1" aria-label="Battery percentage">
      <button class="round-btn" data-d="1" aria-label="Plus 1">${ICON.plus}</button>
    </div>`;
  const num = container.querySelector('.pct-num'), fill = container.querySelector('.battery-fill'), range = container.querySelector('input');
  let v = value, lo = min, hi = max;
  function paint() {
    num.textContent = Math.round(v);
    fill.style.width = clamp(v, 0, 100) + '%';
    fill.style.background = batteryColor(v);
    range.min = lo; range.max = hi; range.value = v;
    range.style.setProperty('--p', ((v - lo) / Math.max(1, hi - lo)) * 100 + '%');
  }
  function set(nv, notify = true) {
    const c = clamp(Math.round(nv), lo, hi);
    if (c !== v) { v = c; if (navigator.vibrate) navigator.vibrate(4); }
    paint(); if (notify && onChange) onChange(v);
  }
  range.addEventListener('input', () => set(+range.value));
  container.querySelectorAll('.round-btn').forEach((btn) => {
    let t1 = null, t2 = null;
    const d = +btn.dataset.d;
    const stop = () => { clearTimeout(t1); clearInterval(t2); t1 = t2 = null; };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault(); set(v + d);
      t1 = setTimeout(() => { t2 = setInterval(() => set(v + d), 70); }, 380);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btn.addEventListener(ev, stop));
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  });
  v = clamp(value, lo, hi); paint();
  return {
    get value() { return v; },
    set(nv) { set(nv); },
    setRange(nlo, nhi) { lo = nlo; hi = nhi; set(v); },
  };
}

function toggleHTML(id, checked) {
  return `<label class="switch"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''}><span></span></label>`;
}
function segmentedHTML(name, options, current) {
  return `<div class="segmented" data-seg="${name}">${options.map(([val, label]) => `<button data-val="${esc(val)}" class="${val === current ? 'on' : ''}">${esc(label)}</button>`).join('')}</div>`;
}
function wireSegmented(root, name, onChange) {
  const seg = root.querySelector(`[data-seg="${name}"]`);
  seg.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    onChange(b.dataset.val);
  }));
}
const DECIMAL_SEP = (1.1).toLocaleString(LOCALE).charAt(1) || '.';
function numberField(id, value, unit) {
  const shown = String(+(+value).toFixed(4)).replace('.', DECIMAL_SEP);
  return `<div class="field"><input id="${id}" inputmode="decimal" enterkeyhint="done" autocomplete="off" value="${esc(shown)}"><span class="unit">${esc(unit)}</span></div>`;
}
