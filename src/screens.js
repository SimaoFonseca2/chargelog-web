/* =========================================================
   Screens: Charge, History + the charge sheets
   ========================================================= */

const ui = { tab: 'charge', statsRange: '1Y', statsMetric: 'cost', statsSel: null };

function isStandalone() {
  return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

/* ---------------- Charge tab ---------------- */

function renderCharge() {
  const el = document.getElementById('screen-charge');
  const active = activeSession();
  const done = completedSessions();
  const showInstall = !isStandalone() && !store.settings.installHintDismissed && /iPhone|iPad|iPod/.test(navigator.userAgent);

  el.innerHTML = `
    <div class="title-row"><h1 class="large-title">Charge</h1></div>
    <div class="stack">
      ${showInstall ? `
        <div class="banner info">
          ${ICON.share}
          <div style="flex:1"><b>Install ChargeLog</b><span class="small muted">Tap Share, then <b style="display:inline">Add to Home Screen</b>, to use it like an app.</span></div>
          <button class="link-btn" data-act="dismiss-install">OK</button>
        </div>` : ''}
      ${active ? activeCardHTML(active) : idleCardHTML(done[0])}
      ${monthSummaryHTML(done)}
      ${done.length ? `
        <div class="card" style="padding-top:14px;padding-bottom:10px">
          <div class="row-between" style="margin-bottom:4px"><h3 class="card-title">Recent</h3><button class="link-btn" data-act="see-all">See all</button></div>
          ${done.slice(0, 4).map((s, i) => (i ? '<div class="divider"></div>' : '') + `<button class="session-row" data-edit="${s.id}">${sessionRowInner(s)}</button>`).join('')}
        </div>` : ''}
    </div>`;
}

function liveEstimate(s, now = Date.now()) {
  const perPct = energyFor(tariffOf(s), 1);
  const power = +store.settings.power;
  if (perPct <= 0 || power <= 0) return s.startPct;
  return Math.min(100, s.startPct + ((now - s.start) / 3600e3) * power / perPct);
}

function activeCardHTML(s) {
  const est = liveEstimate(s);
  const due = s.alarm && s.alarm <= Date.now();
  let alarmText;
  if (!s.alarm) alarmText = `<b>Add a reminder</b>`;
  else if (!due) alarmText = `<div><b>Reminder ${fmt.clockAt(s.alarm)}</b><div class="small" style="opacity:.85" data-countdown="${s.alarm}">${fmt.relative(s.alarm - Date.now())}</div></div>`;
  else alarmText = `<div><b>Reminder time reached</b><div class="small" style="opacity:.85">${fmt.time(s.alarm)} · check the car and end the charge</div></div>`;

  return `
    <div class="active-card">
      <div class="row-between">
        <span class="pill"><span class="pulse">${ICON.bolt}</span>Charging</span>
        <button class="circle-btn" data-act="active-menu" aria-label="More">${ICON.dots}</button>
      </div>
      <div class="active-main">
        <div class="ring-wrap">
          ${ringSVG({ from: 0, to: est, stroke: 11 })}
          <div class="ring-label"><span class="ring-pct" data-est>≈${Math.round(est)}%</span><span class="ring-sub">from ${fmt.pct(s.startPct)}</span></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;min-width:0">
          <div><div class="kv-label">Elapsed</div><div class="kv-big" data-elapsed="${s.start}">${fmt.timer(Date.now() - s.start)}</div></div>
          <div><div class="kv-label">So far ≈</div><div class="kv-mid" data-sofar>${fmt.eur(costFor(tariffOf(s), Math.max(0, est - s.startPct)))}</div></div>
        </div>
      </div>
      <button class="glass-row ${due ? 'due' : ''}" data-act="edit-alarm">
        <span style="font-size:18px">${s.alarm ? ICON.bell : ICON.bellOff}</span>
        <span style="flex:1;font-size:15px">${alarmText}</span>
        <span style="font-size:13px;opacity:.7">${ICON.chevron}</span>
      </button>
      <button class="white-btn" data-act="end">${ICON.flag} End charge</button>
    </div>`;
}

function idleCardHTML(last) {
  return `
    <div class="idle-card">
      <div class="idle-icon">${ICON.car}</div>
      <div>
        <h2 class="idle-title">Ready to charge</h2>
        <div class="muted small" style="margin-top:4px">${last
          ? `Last: ${fmt.clock(last.end || last.start)} · ended at ${fmt.pct(last.endPct ?? 0)}`
          : 'Plug in your car and log the battery %.'}</div>
      </div>
      <button class="primary-btn" data-act="start">${ICON.bolt} Start charging</button>
    </div>`;
}

function monthSummaryHTML(done) {
  const now = new Date();
  const thisM = startOfMonth(now), prevM = addMonths(thisM, -1);
  const inMonth = done.filter((s) => startOfMonth(s.start) === thisM);
  const prev = done.filter((s) => startOfMonth(s.start) === prevM);
  const cost = inMonth.reduce((a, s) => a + sCost(s), 0);
  const energy = inMonth.reduce((a, s) => a + sEnergy(s), 0);
  const prevCost = prev.reduce((a, s) => a + sCost(s), 0);
  return `
    <div class="card">
      <div class="row-between">
        <h3 class="card-title">${fmt.month(now)}</h3>
        ${prevCost > 0 ? `<span class="caption" style="font-weight:600">Last month ${fmt.eur(prevCost)}</span>` : ''}
      </div>
      <div class="big-money">${fmt.eur(cost)}</div>
      <div class="mini-stats">
        <div><div class="mini-val">${fmt.kwh(energy)}</div><div class="caption">Energy</div></div>
        <div><div class="mini-val">${inMonth.length}</div><div class="caption">Charges</div></div>
        <div><div class="mini-val">${inMonth.length ? fmt.eur(cost / inMonth.length) : '–'}</div><div class="caption">Avg / charge</div></div>
      </div>
    </div>`;
}

function sessionRowInner(s) {
  const end = s.endPct ?? s.startPct;
  return `
    <div class="session-ring">
      ${ringSVG({ from: s.startPct, to: end, stroke: 9, size: 100, track: 'rgba(33,199,140,0.15)', color: 'var(--brand)' })}
      <div class="day"><b>${new Date(s.start).getDate()}</b><small>${fmt.weekdayShort(s.start)}</small></div>
    </div>
    <div class="session-mid">
      <div class="session-pcts">${fmt.pct(s.startPct)} ${ICON.arrow} ${fmt.pct(end)}</div>
      <div class="caption">${fmt.time(s.start)} · ${fmt.dur(sDuration(s))}${s.note ? ' · ' + esc(s.note) : ''}</div>
    </div>
    <div class="session-right">
      <div class="session-cost">${fmt.eur(sCost(s))}</div>
      <div class="caption">${fmt.kwh(sEnergy(s))}</div>
    </div>`;
}

/* Live ticking while the Charge tab is open */
function tick() {
  document.querySelectorAll('[data-elapsed]').forEach((el) => { el.textContent = fmt.timer(Date.now() - +el.dataset.elapsed); });
  document.querySelectorAll('[data-countdown]').forEach((el) => { el.textContent = fmt.relative(+el.dataset.countdown - Date.now()); });
  const a = activeSession();
  if (a && a.alarm && a.alarm <= Date.now() && !document.querySelector('.glass-row.due') && ui.tab === 'charge' && !document.querySelector('.sheet')) renderCharge();
}

/* ---------------- Start sheet ---------------- */

function openStartSheet() {
  const s = store.settings;
  const t = tariffNow();
  const st = { startPct: clamp(+s.lastStart, 0, 99), target: +s.target, earlier: false, startAt: Date.now() };

  const sh = openSheet({ title: 'Start charging', footer: true });
  sh.body.innerHTML = `
    <div class="section"><div class="section-head">Battery now</div><div class="group"><div class="block" id="st-pct"></div></div></div>
    <div class="section" id="st-est"></div>
    <div class="section" id="st-rem"></div>
    <div class="section">
      <div class="group">
        <div class="item"><span>Started earlier</span>${toggleHTML('st-earlier', false)}</div>
        <div class="item hidden" id="st-at-row"><span>Started at</span><input type="datetime-local" id="st-at" value="${toLocalInput(Date.now())}" max="${toLocalInput(Date.now())}"></div>
      </div>
    </div>`;
  sh.foot.innerHTML = `<button class="primary-btn" id="st-go">${ICON.bolt} Start charging</button>`;

  const est = () => estimateMs(t, st.startPct, st.target, +s.power);
  let reminder;
  function paintEstimate() {
    const box = sh.body.querySelector('#st-est');
    const toTarget = Math.max(0, st.target - st.startPct);
    const ms = est();
    box.innerHTML = `
      <div class="section-head">Estimate</div>
      <div class="group">
        <div class="block">
          <div class="row-between" style="margin-bottom:10px"><span>Charge to</span><span class="muted num">${fmt.pct(st.target)}</span></div>
          <input type="range" id="st-target" min="5" max="100" step="5" value="${st.target}" style="--p:${((st.target - 5) / 95) * 100}%">
        </div>
        <div class="item"><span>Energy</span><span class="item-value">${fmt.kwh(energyFor(t, toTarget))}</span></div>
        <div class="item"><span>Cost</span><span class="item-value">${fmt.eur(costFor(t, toTarget))}</span></div>
        ${ms ? `<div class="item"><span>Time</span><span class="item-value">≈ ${fmt.dur(ms)}</span></div>` : ''}
      </div>
      <div class="section-foot">Time is estimated for a ${fmt.num(+s.power)} kW charger. You can change it in Settings.</div>`;
    const r = box.querySelector('#st-target');
    r.addEventListener('input', () => {
      st.target = +r.value; r.style.setProperty('--p', ((st.target - 5) / 95) * 100 + '%');
      box.querySelector('.row-between .muted').textContent = fmt.pct(st.target);
    });
    r.addEventListener('change', () => { s.target = st.target; store.save(); paintEstimate(); paintReminder(); });
  }
  function paintReminder() {
    const prev = reminder ? reminder.get() : { on: false };
    reminder = ReminderPicker(sh.body.querySelector('#st-rem'), { on: prev.on, suggestionMs: est() });
  }

  PercentInput(sh.body.querySelector('#st-pct'), {
    value: st.startPct, min: 0, max: 99,
    onChange: (v) => { st.startPct = v; clearTimeout(paintEstimate.t); paintEstimate.t = setTimeout(() => { paintEstimate(); paintReminder(); }, 120); },
  });
  paintEstimate(); paintReminder();

  const earlier = sh.body.querySelector('#st-earlier'), atRow = sh.body.querySelector('#st-at-row'), at = sh.body.querySelector('#st-at');
  earlier.addEventListener('change', () => { st.earlier = earlier.checked; atRow.classList.toggle('hidden', !st.earlier); });

  sh.foot.querySelector('#st-go').addEventListener('click', () => {
    const r = reminder.get();
    let start = Date.now();
    if (st.earlier) { const v = fromLocalInput(at.value); if (v && v <= Date.now()) start = v; }
    const sess = { id: uid(), start, end: null, startPct: st.startPct, endPct: null, ...tariffNow(), alarm: r.on ? r.date : null, note: '' };
    store.sessions.push(sess);
    s.lastStart = st.startPct;
    store.save();
    sh.close();
    render();
    toast('Charging started');
    if (sess.alarm) setTimeout(() => deliverReminder(sess), 350);
  });
}

/* ---------------- End sheet ---------------- */

function openEndSheet() {
  const sess = activeSession();
  if (!sess) return;
  const t = tariffOf(sess);
  const st = { endPct: clamp(Math.max(+store.settings.target, sess.startPct + 1), 0, 100), earlier: false };

  const sh = openSheet({ title: 'End charge', footer: true });
  sh.body.innerHTML = `
    <div class="section">
      <div class="section-head">Battery now</div>
      <div class="group"><div class="block" id="en-pct"></div></div>
      <div class="section-foot">Started at ${fmt.pct(sess.startPct)} · ${fmt.clock(sess.start)}</div>
    </div>
    <div class="section">
      <div class="section-head">This charge</div>
      <div class="group">
        <div class="block"><div class="result-cols" id="en-res"></div></div>
        <div class="block"><div class="formula" id="en-formula"></div></div>
      </div>
    </div>
    <div class="section">
      <div class="group">
        <div class="item"><span>Ended earlier</span>${toggleHTML('en-earlier', false)}</div>
        <div class="item hidden" id="en-at-row"><span>Ended at</span><input type="datetime-local" id="en-at" value="${toLocalInput(Date.now())}" min="${toLocalInput(sess.start)}" max="${toLocalInput(Date.now())}"></div>
      </div>
      <div class="section-foot" id="en-dur"></div>
    </div>`;
  sh.foot.innerHTML = `<button class="primary-btn" id="en-save"></button>`;
  const btn = sh.foot.querySelector('#en-save');
  const at = sh.body.querySelector('#en-at');

  function endTime() { if (st.earlier) { const v = fromLocalInput(at.value); if (v) return clamp(v, sess.start, Date.now()); } return Date.now(); }
  function paint() {
    const added = Math.max(0, st.endPct - sess.startPct);
    const e = energyFor(t, added), c = costFor(t, added);
    sh.body.querySelector('#en-res').innerHTML = `
      <div><div class="caption">Added</div><div class="result-val">+${fmt.pct(added)}</div></div>
      <div><div class="caption">Energy</div><div class="result-val">${fmt.kwh(e)}</div></div>
      <div><div class="caption">Cost</div><div class="result-val" style="color:var(--brand)">${fmt.eur(c)}</div></div>`;
    sh.body.querySelector('#en-formula').innerHTML =
      `${fmt.pct(added)} × ${fmt.num(t.cap)} kWh × ${fmt.num(t.loss)} = ${fmt.num(e)} kWh<br>` +
      `${fmt.num(e)} kWh × ${fmt.num(t.price, 4)} € × ${fmt.num(t.vat)} IVA = ${fmt.eur(c)}`;
    sh.body.querySelector('#en-dur').textContent = 'Charging time: ' + fmt.dur(endTime() - sess.start);
    btn.innerHTML = `${ICON.check} Save · ${fmt.eur(c)}`;
    btn.disabled = added <= 0;
  }
  PercentInput(sh.body.querySelector('#en-pct'), { value: st.endPct, min: Math.min(sess.startPct, 99), max: 100, onChange: (v) => { st.endPct = v; paint(); } });
  const earlier = sh.body.querySelector('#en-earlier'), atRow = sh.body.querySelector('#en-at-row');
  earlier.addEventListener('change', () => { st.earlier = earlier.checked; atRow.classList.toggle('hidden', !st.earlier); paint(); });
  at.addEventListener('change', paint);
  paint();

  btn.addEventListener('click', () => {
    if (st.endPct <= sess.startPct) return;
    const hadFutureAlarm = sess.alarm && sess.alarm > Date.now();
    sess.endPct = st.endPct;
    sess.end = endTime();
    sess.alarm = null;
    store.save();
    sh.close();
    render();
    toast(`Saved · ${fmt.eur(sCost(sess))}`);
    if (hadFutureAlarm && store.settings.reminder !== 'app') {
      setTimeout(() => toast('Tick off the pending reminder in Reminders'), 2800);
    }
  });
}

/* ---------------- Reminder sheet (active charge) ---------------- */

function openAlarmSheet() {
  const sess = activeSession();
  if (!sess) return;
  const future = sess.alarm && sess.alarm > Date.now();
  const remainingMs = (() => {
    const total = estimateMs(tariffOf(sess), sess.startPct, +store.settings.target, +store.settings.power);
    if (!total) return null;
    const r = total - (Date.now() - sess.start);
    return r > 60e3 ? r : null;
  })();
  let picker;
  const sh = openSheet({
    title: 'Reminder', right: 'Save', medium: true,
    onRight: (close) => {
      const r = picker.get();
      const prev = sess.alarm;
      sess.alarm = r.on ? r.date : null;
      store.save();
      close();
      render();
      if (r.on && r.date !== prev) setTimeout(() => deliverReminder(sess), 350);
      else if (!r.on && prev && prev > Date.now() && store.settings.reminder !== 'app') toast('Reminder removed — delete it in Reminders too');
    },
  });
  sh.body.innerHTML = `<div class="section" id="al-rem"></div>`;
  picker = ReminderPicker(sh.body.querySelector('#al-rem'), { on: true, date: future ? sess.alarm : null, clockMode: !!future, suggestionMs: remainingMs });
}

function activeMenu() {
  const sess = activeSession();
  if (!sess) return;
  actionSheet({
    title: 'Discard this charge?', message: "It won't be saved to your history.",
    actions: [{ label: 'Discard charge', destructive: true, handler: () => {
      store.data.sessions = store.sessions.filter((x) => x.id !== sess.id);
      store.save(); render(); toast('Charge discarded');
    } }],
  });
}

/* ---------------- History tab ---------------- */

function renderHistory() {
  const el = document.getElementById('screen-history');
  const done = completedSessions();
  const groups = new Map();
  done.forEach((s) => { const k = startOfMonth(s.start); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); });

  el.innerHTML = `
    <div class="title-row">
      <h1 class="large-title">History</h1>
      ${done.length ? `<button class="icon-btn" data-act="export-csv" aria-label="Export CSV">${ICON.share}</button>` : ''}
    </div>
    ${!done.length ? `
      <div class="empty">${ICON.car}<h3>No charges yet</h3><div>Finished charges show up here, grouped by month.</div></div>` :
      [...groups.entries()].sort((a, b) => b[0] - a[0]).map(([month, list]) => `
        <div class="section">
          <div class="month-head">
            <span class="name">${fmt.month(month)}</span>
            <span class="tot">${fmt.eur(list.reduce((a, s) => a + sCost(s), 0))}</span>
            <span class="caption">· ${fmt.kwh(list.reduce((a, s) => a + sEnergy(s), 0))}</span>
          </div>
          <div class="group">
            ${list.map((s) => `
              <div class="swipe" data-id="${s.id}">
                <button class="swipe-del" data-del="${s.id}">${ICON.trash}<span>Delete</span></button>
                <div class="swipe-content"><button class="session-row" data-edit="${s.id}">${sessionRowInner(s)}</button></div>
              </div>`).join('')}
          </div>
        </div>`).join('')}
    ${done.length ? '<div class="caption" style="text-align:center;margin-top:-6px">Swipe left on a charge to delete it. Tap to edit.</div>' : ''}`;
  wireSwipes(el);
}

function wireSwipes(root) {
  const W = 88;
  root.querySelectorAll('.swipe').forEach((row) => {
    const content = row.querySelector('.swipe-content');
    let x0 = null, y0 = null, dx = 0, dragging = false, open = false;
    row.addEventListener('touchstart', (e) => {
      root.querySelectorAll('.swipe.open').forEach((o) => { if (o !== row) { o.classList.remove('open'); o.querySelector('.swipe-content').style.transform = ''; } });
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; dragging = false; open = row.classList.contains('open');
      content.style.transition = 'none';
    }, { passive: true });
    row.addEventListener('touchmove', (e) => {
      if (x0 == null) return;
      const mx = e.touches[0].clientX - x0, my = e.touches[0].clientY - y0;
      if (!dragging && Math.abs(mx) > 8 && Math.abs(mx) > Math.abs(my)) dragging = true;
      if (!dragging) return;
      dx = clamp((open ? -W : 0) + mx, -W - 30, 0);
      content.style.transform = `translateX(${dx}px)`;
    }, { passive: true });
    row.addEventListener('touchend', () => {
      content.style.transition = '';
      if (dragging) {
        const shouldOpen = dx < -W / 2;
        row.classList.toggle('open', shouldOpen);
        content.style.transform = shouldOpen ? `translateX(${-W}px)` : '';
        row.dataset.justSwiped = '1';
        setTimeout(() => delete row.dataset.justSwiped, 50);
      }
      x0 = null;
    });
  });
}

function deleteSession(id) {
  store.data.sessions = store.sessions.filter((x) => x.id !== id);
  store.save(); render(); toast('Charge deleted');
}

/* ---------------- Edit a finished charge ---------------- */

function openEditSheet(id) {
  const sess = store.sessions.find((x) => x.id === id);
  if (!sess) return;
  const st = {
    start: sess.start, end: sess.end ?? Date.now(), startPct: sess.startPct, endPct: sess.endPct ?? sess.startPct,
    cap: sess.cap, lossPct: Math.round((sess.loss - 1) * 10000) / 100, price: sess.price, vatPct: Math.round((sess.vat - 1) * 10000) / 100, note: sess.note || '',
  };
  const tariff = () => ({ cap: st.cap, loss: 1 + st.lossPct / 100, price: st.price, vat: 1 + st.vatPct / 100 });

  const sh = openSheet({
    title: 'Edit charge', right: 'Save',
    onRight: (close) => {
      readFields();
      Object.assign(sess, {
        start: st.start, end: Math.max(st.end, st.start), startPct: st.startPct, endPct: Math.max(st.endPct, st.startPct),
        ...tariff(), note: st.note.trim(),
      });
      store.save(); close(); render(); toast('Charge updated');
    },
  });
  sh.body.innerHTML = `
    <div class="section"><div class="group"><div class="block row-between" id="ed-sum"></div></div></div>
    <div class="section">
      <div class="section-head">Battery</div>
      <div class="group">
        ${['startPct', 'endPct'].map((k) => `
          <div class="block">
            <div class="row-between" style="margin-bottom:10px">
              <span>${k === 'startPct' ? 'Start' : 'End'}</span>
              <span style="display:flex;align-items:center;gap:10px">
                <span class="muted num" data-pv="${k}"></span>
                <span class="segmented" style="padding:2px"><button data-step="${k}:-1" style="padding:4px 14px">${ICON.minus}</button><button data-step="${k}:1" style="padding:4px 14px">${ICON.plus}</button></span>
              </span>
            </div>
            <input type="range" min="0" max="100" step="1" data-range="${k}">
          </div>`).join('')}
      </div>
    </div>
    <div class="section">
      <div class="section-head">Time</div>
      <div class="group">
        <div class="item"><span>Started</span><input type="datetime-local" id="ed-start" value="${toLocalInput(st.start)}"></div>
        <div class="item"><span>Ended</span><input type="datetime-local" id="ed-end" value="${toLocalInput(st.end)}"></div>
      </div>
    </div>
    <div class="section">
      <div class="section-head">Tariff for this charge</div>
      <div class="group">
        <div class="item"><span>Battery</span>${numberField('ed-cap', st.cap, 'kWh')}</div>
        <div class="item"><span>Cable loss</span>${numberField('ed-loss', st.lossPct, '%')}</div>
        <div class="item"><span>Price</span>${numberField('ed-price', st.price, '€/kWh')}</div>
        <div class="item"><span>IVA</span>${numberField('ed-vat', st.vatPct, '%')}</div>
      </div>
      <div class="section-foot">These were saved when the charge started. Edit them if the price was different.</div>
    </div>
    <div class="section">
      <div class="section-head">Note</div>
      <div class="group"><div class="block"><textarea id="ed-note" placeholder="Optional">${esc(st.note)}</textarea></div></div>
    </div>
    <div class="section"><div class="group"><button class="item button destructive" id="ed-del">Delete charge</button></div></div>`;

  const b = sh.body;
  function readFields() {
    const num = (id, fallback) => { const v = parseNum(b.querySelector(id).value); return Number.isFinite(v) && v >= 0 ? v : fallback; };
    st.cap = num('#ed-cap', st.cap); st.lossPct = num('#ed-loss', st.lossPct); st.price = num('#ed-price', st.price); st.vatPct = num('#ed-vat', st.vatPct);
    st.start = fromLocalInput(b.querySelector('#ed-start').value) ?? st.start;
    st.end = fromLocalInput(b.querySelector('#ed-end').value) ?? st.end;
    st.note = b.querySelector('#ed-note').value;
  }
  function paint() {
    const t = tariff(), added = Math.max(0, st.endPct - st.startPct);
    b.querySelector('#ed-sum').innerHTML = `
      <div>
        <div class="rounded" style="font-size:34px;font-weight:700">${fmt.eur(costFor(t, added))}</div>
        <div class="muted">${fmt.kwh(energyFor(t, added))} · +${fmt.pct(added)}</div>
      </div>
      <div class="session-ring" style="width:58px;height:58px">${ringSVG({ from: st.startPct, to: st.endPct, stroke: 12, track: 'rgba(33,199,140,0.15)', color: 'var(--brand)' })}</div>`;
    ['startPct', 'endPct'].forEach((k) => {
      b.querySelector(`[data-pv="${k}"]`).textContent = fmt.pct(st[k]);
      const r = b.querySelector(`[data-range="${k}"]`); r.value = st[k]; r.style.setProperty('--p', st[k] + '%');
    });
  }
  b.querySelectorAll('[data-range]').forEach((r) => r.addEventListener('input', () => { st[r.dataset.range] = +r.value; paint(); }));
  b.querySelectorAll('[data-step]').forEach((btn) => btn.addEventListener('click', () => {
    const [k, d] = btn.dataset.step.split(':'); st[k] = clamp(st[k] + +d, 0, 100); paint();
  }));
  b.querySelectorAll('.field input').forEach((inp) => inp.addEventListener('input', () => { readFields(); paint(); }));
  b.querySelector('#ed-del').addEventListener('click', () => actionSheet({
    title: 'Delete this charge?', actions: [{ label: 'Delete', destructive: true, handler: () => { sh.close(); setTimeout(() => deleteSession(id), 200); } }],
  }));
  paint();
}
