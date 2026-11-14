/* =========================================================
   Reminders: picker UI + delivery to iOS Reminders / Calendar
   ========================================================= */

const PRESET_HOURS = [1, 2, 3, 4, 5, 6, 8, 10];

/**
 * Reminders-style picker ("After…" X hours or "At time…").
 * Renders into `container` (a .section). Returns { get(): { on, date } }.
 */
function ReminderPicker(container, { on = false, date = null, suggestionMs = null, clockMode = false }) {
  const st = {
    on,
    mode: clockMode ? 'at' : 'after',
    hours: 4,
    minutes: 0,
    clock: date ? fmtHM(date) : '07:30',
    date: date || Date.now() + 4 * 3600e3,
  };

  function fmtHM(ts) { const d = new Date(ts); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }

  function recompute() {
    if (st.mode === 'after') {
      st.date = Date.now() + Math.max(1, st.hours * 60 + st.minutes) * 60e3;
    } else {
      const [hh, mm] = st.clock.split(':').map(Number);
      const d = new Date(); d.setSeconds(0, 0); d.setHours(hh || 0, mm || 0);
      if (d.getTime() <= Date.now() + 30e3) d.setDate(d.getDate() + 1);
      st.date = d.getTime();
    }
  }

  function methodNote() {
    const m = store.settings.reminder;
    if (m === 'shortcut') return 'Added to your Reminders app via the Shortcut.';
    if (m === 'calendar') return 'Added as a Calendar event with an alert.';
    return 'Shown inside ChargeLog only.';
  }

  function render() {
    const hourOpts = Array.from({ length: 24 }, (_, i) => `<option value="${i}" ${i === st.hours ? 'selected' : ''}>${i} h</option>`).join('');
    const minOpts = Array.from({ length: 12 }, (_, i) => i * 5).map((m) => `<option value="${m}" ${m === st.minutes ? 'selected' : ''}>${m} min</option>`).join('');
    container.innerHTML = `
      <div class="section-head">Reminder</div>
      <div class="group">
        <div class="item">
          <div class="item-label"><span class="app-icon" style="background:var(--orange)">${ICON.bell}</span>Remind me</div>
          ${toggleHTML('rem-on', st.on)}
        </div>
        ${st.on ? `
        <div class="block">${segmentedHTML('rem-mode', [['after', 'After…'], ['at', 'At time…']], st.mode)}</div>
        ${st.mode === 'after' ? `
          <div class="block"><div class="chips">${PRESET_HOURS.map((hh) => `<button class="chip ${st.hours === hh && st.minutes === 0 ? 'on' : ''}" data-h="${hh}">${hh}h</button>`).join('')}</div></div>
          <div class="item"><span>Hours</span><select id="rem-h">${hourOpts}</select></div>
          <div class="item"><span>Minutes</span><select id="rem-m">${minOpts}</select></div>
        ` : `
          <div class="item"><span>Time</span><input type="time" id="rem-clock" value="${st.clock}"></div>
        `}
        ${suggestionMs && suggestionMs > 60e3 ? `<button class="item button" id="rem-suggest"><span class="item-label">${ICON.wand} Use charge estimate · ${fmt.dur(suggestionMs)}</span></button>` : ''}
        ` : ''}
      </div>
      ${st.on ? `<div class="section-foot" id="rem-foot"></div>` : ''}`;
    paintFoot();

    container.querySelector('#rem-on').addEventListener('change', (e) => { st.on = e.target.checked; recompute(); render(); });
    if (!st.on) return;
    wireSegmented(container, 'rem-mode', (v) => { st.mode = v; recompute(); render(); });
    container.querySelectorAll('[data-h]').forEach((b) => b.addEventListener('click', () => { st.hours = +b.dataset.h; st.minutes = 0; recompute(); render(); }));
    const hs = container.querySelector('#rem-h'), ms = container.querySelector('#rem-m'), ck = container.querySelector('#rem-clock');
    hs && hs.addEventListener('change', () => { st.hours = +hs.value; recompute(); render(); });
    ms && ms.addEventListener('change', () => { st.minutes = +ms.value; recompute(); render(); });
    ck && ck.addEventListener('change', () => { if (ck.value) { st.clock = ck.value; recompute(); paintFoot(); } });
    const sg = container.querySelector('#rem-suggest');
    sg && sg.addEventListener('click', () => {
      const total = Math.min(23 * 60 + 55, Math.ceil(Math.ceil(suggestionMs / 60e3) / 5) * 5);
      st.mode = 'after'; st.hours = Math.floor(total / 60); st.minutes = total % 60;
      recompute(); render();
    });
  }

  function paintFoot() {
    const f = container.querySelector('#rem-foot');
    if (f) f.textContent = `Rings ${fmt.clockAt(st.date)} · ${fmt.relative(st.date - Date.now())}\n${methodNote()}`;
  }

  if (!clockMode) recompute();
  render();
  return { get: () => { if (st.mode === 'after') recompute(); return { on: st.on, date: st.date }; } };
}

/* ---------- Delivery ---------- */

function shortcutDateText(ts) {
  const d = new Date(ts), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Hands the reminder to iOS. Returns true if the app is leaving for another app. */
function deliverReminder(session) {
  if (!session.alarm) return false;
  const method = store.settings.reminder;
  if (method === 'shortcut') {
    const name = store.settings.shortcutName || DEFAULTS.shortcutName;
    const url = `shortcuts://run-shortcut?name=${encodeURIComponent(name)}&input=text&text=${encodeURIComponent(shortcutDateText(session.alarm))}`;
    window.location.href = url;
    return true;
  }
  if (method === 'calendar') {
    downloadICS(session);
    return true;
  }
  return false;
}

function icsDate(ts) { return new Date(ts).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
function downloadICS(session) {
  const start = session.alarm;
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ChargeLog//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${session.id}-${start}@chargelog`,
    `DTSTAMP:${icsDate(Date.now())}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(start + 10 * 60e3)}`,
    'SUMMARY:Check the car (ChargeLog)',
    `DESCRIPTION:Charging since ${fmt.time(session.start)} from ${fmt.pct(session.startPct)}. Open ChargeLog to log the end %.`,
    'BEGIN:VALARM', 'TRIGGER:PT0S', 'ACTION:DISPLAY', 'DESCRIPTION:Check the car', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'chargelog-reminder.ics';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

function testReminder() {
  const fake = { id: 'test', start: Date.now(), startPct: 50, alarm: Date.now() + 2 * 60e3 };
  if (store.settings.reminder === 'app') { toast('Reminders are set to "In app only"'); return; }
  deliverReminder(fake);
}
