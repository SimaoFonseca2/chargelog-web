/* =========================================================
   Settings tab, backup/export, navigation and boot
   ========================================================= */

function renderSettings() {
  const el = document.getElementById('screen-settings');
  const s = store.settings;
  const method = s.reminder;
  const methodRow = (val, label, icon, color) => `
    <button class="item button" data-method="${val}" style="color:var(--text)">
      <span class="item-label"><span class="app-icon" style="background:${color}">${icon}</span>${label}</span>
      <span style="color:var(--brand);font-size:18px">${method === val ? ICON.check : ''}</span>
    </button>`;

  el.innerHTML = `
    <div class="title-row"><h1 class="large-title">Settings</h1></div>

    <div class="section">
      <div class="section-head">Car &amp; charger</div>
      <div class="group">
        <div class="item"><span>Battery capacity</span>${numberField('set-capacity', s.capacity, 'kWh')}</div>
        <div class="item"><span>Cable / heat loss</span>${numberField('set-lossPct', s.lossPct, '%')}</div>
        <div class="item"><span>Charger power</span>${numberField('set-power', s.power, 'kW')}</div>
      </div>
      <div class="section-foot">Charger power is only used to estimate charging time and the live % while charging.</div>
    </div>

    <div class="section">
      <div class="section-head">Electricity price</div>
      <div class="group">
        <div class="item"><span>Price</span>${numberField('set-price', s.price, '€/kWh')}</div>
        <div class="item"><span>IVA</span>${numberField('set-vatPct', s.vatPct, '%')}</div>
      </div>
    </div>

    <div class="section" id="cost-table"></div>

    <div class="section">
      <div class="group"><button class="item button" data-act="apply-all"><span class="item-label">${ICON.repeat} Apply these values to all past charges</span></button></div>
    </div>

    <div class="section">
      <div class="section-head">Reminders go to</div>
      <div class="group">
        ${methodRow('shortcut', 'Reminders app', ICON.bell, 'var(--orange)')}
        ${methodRow('calendar', 'Calendar event', ICON.calendar, 'var(--red)')}
        ${methodRow('app', 'In ChargeLog only', ICON.bolt, 'var(--brand)')}
      </div>
      <div class="section-foot">${{
        shortcut: 'Uses a small Shortcut to create a real reminder that rings even when ChargeLog is closed, with the usual Reminders snooze options.',
        calendar: 'Adds an event with an alert to your calendar. iOS asks you to confirm each time.',
        app: 'The reminder only shows inside ChargeLog. Nothing rings when the app is closed.',
      }[method]}</div>
    </div>

    ${method === 'shortcut' ? `
    <div class="section">
      <div class="group">
        <button class="item button" data-act="shortcut-help"><span class="item-label">${ICON.info} How to set up the Shortcut</span><span style="color:var(--text3)">${ICON.chevron}</span></button>
        <div class="item"><span>Shortcut name</span><div class="field"><input id="set-shortcutName" value="${esc(s.shortcutName)}" style="width:170px" autocomplete="off" autocapitalize="words"></div></div>
        <button class="item button" data-act="test-reminder"><span class="item-label">${ICON.bell} Send a test reminder (in 2 min)</span></button>
      </div>
    </div>` : method === 'calendar' ? `
    <div class="section"><div class="group"><button class="item button" data-act="test-reminder"><span class="item-label">${ICON.calendar} Try it (event in 2 min)</span></button></div></div>` : ''}

    <div class="section">
      <div class="section-head">Your data</div>
      <div class="group">
        <button class="item button" data-act="backup"><span class="item-label">${ICON.download} Save a backup</span></button>
        <button class="item button" data-act="restore"><span class="item-label">${ICON.upload} Restore from backup</span></button>
        <button class="item button" data-act="export-csv"><span class="item-label">${ICON.share} Export CSV</span></button>
      </div>
      <div class="section-foot">Your charges are stored only on this iPhone. Save a backup now and then (to Files or iCloud Drive) so nothing is lost if Safari's data is cleared.</div>
    </div>

    <div class="section">
      <div class="group">
        <div class="item"><span>Charges logged</span><span class="item-value">${completedSessions().length}</span></div>
        <div class="item"><span>Installed as app</span><span class="item-value">${isStandalone() ? 'Yes' : 'No — use Share → Add to Home Screen'}</span></div>
        <div class="item"><span>Version</span><span class="item-value">${APP_VERSION}</span></div>
      </div>
    </div>
    <input type="file" id="restore-file" accept="application/json,.json" class="hidden">`;

  paintCostTable();

  ['capacity', 'lossPct', 'power', 'price', 'vatPct'].forEach((k) => {
    const inp = el.querySelector('#set-' + k);
    inp.addEventListener('input', () => {
      const v = parseNum(inp.value);
      if (Number.isFinite(v) && v >= 0) { s[k] = v; store.save(); paintCostTable(); }
    });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
  });
  const sn = el.querySelector('#set-shortcutName');
  sn && sn.addEventListener('change', () => { s.shortcutName = sn.value.trim() || DEFAULTS.shortcutName; store.save(); });
  el.querySelectorAll('[data-method]').forEach((b) => b.addEventListener('click', () => { s.reminder = b.dataset.method; store.save(); renderSettings(); }));
  el.querySelector('#restore-file').addEventListener('change', onRestoreFile);
}

function paintCostTable() {
  const t = tariffNow(), s = store.settings;
  const row = (label, pct) => `<div class="item"><span>${label}</span><span class="item-value">${fmt.num(energyFor(t, pct))} kWh · ${fmt.eur(costFor(t, pct))}</span></div>`;
  document.getElementById('cost-table').innerHTML = `
    <div class="section-head">What it costs</div>
    <div class="group">
      ${row('1% of battery', 1)}${row('10% of battery', 10)}${row('Full 0 → 100%', 100)}
      <div class="item"><span>Effective price</span><span class="item-value">${fmt.num(t.price * t.vat, 4)} €/kWh</span></div>
    </div>
    <div class="section-foot">kWh = battery % × ${fmt.num(s.capacity)} kWh × ${fmt.num(t.loss)}
€ = kWh × ${fmt.num(s.price, 4)} × ${fmt.num(t.vat)} IVA

New prices apply to new charges. Past charges keep the price they were logged with.</div>`;
}

function openShortcutHelp() {
  const name = store.settings.shortcutName || DEFAULTS.shortcutName;
  const sh = openSheet({ title: 'Reminders Shortcut', left: 'Done' });
  sh.body.innerHTML = `
    <div class="section"><div class="group"><div class="block">
      <p style="margin:0 0 12px">You do this once. Afterwards ChargeLog hands the reminder time to this Shortcut, and it creates a real reminder in the Reminders app.</p>
      <ol class="steps">
        <li>Open the <b>Shortcuts</b> app and tap <b>+</b> to make a new shortcut.</li>
        <li>Name it exactly <code>${esc(name)}</code>. Tap the name at the top, then <b>Rename</b>.</li>
        <li>Add the action <b>Get Dates from Input</b>. Tap its input and pick <b>Shortcut Input</b>.</li>
        <li>Add the action <b>Add New Reminder</b>. Set the reminder text to <code>Check the car (ChargeLog)</code>.</li>
        <li>In that action, tap <b>Show More</b> (or the arrow), turn on the alert or <b>Remind Me</b>, and set its date to <b>Dates</b> from step 3.</li>
        <li>Tap <b>Done</b>. Come back here and tap <b>Send a test reminder</b>. Allow access to Reminders when asked.</li>
      </ol>
      <p class="small muted" style="margin:10px 0 0">After the Shortcut runs, swipe back or tap the ChargeLog name in the top-left corner to return. To snooze, use the reminder's own options. If you end a charge early, tick the reminder off in Reminders.</p>
    </div></div></div>`;
}

/* ---------------- Backup / export ---------------- */

async function shareOrDownload(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  try {
    const file = new File([blob], filename, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

function csvText() {
  const iso = (ts) => (ts ? new Date(ts).toISOString() : '');
  const rows = [['start', 'end', 'start_percent', 'end_percent', 'added_percent', 'kwh', 'cost_eur', 'price_per_kwh', 'vat_factor', 'loss_factor', 'battery_kwh', 'note']];
  completedSessions().slice().reverse().forEach((s) => rows.push([
    iso(s.start), iso(s.end), s.startPct, s.endPct ?? '', addedPct(s),
    sEnergy(s).toFixed(2), sCost(s).toFixed(2), s.price, s.vat.toFixed(2), s.loss.toFixed(2), s.cap, `"${(s.note || '').replace(/"/g, '""')}"`,
  ]));
  return rows.map((r) => r.join(',')).join('\n');
}

function exportCSV() {
  if (!completedSessions().length) { toast('No charges to export yet'); return; }
  shareOrDownload('ChargeLog.csv', csvText(), 'text/csv');
}

function backup() {
  const payload = { app: 'ChargeLog', version: 1, exported: new Date().toISOString(), settings: store.settings, sessions: store.sessions };
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  shareOrDownload(`ChargeLog-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`, JSON.stringify(payload, null, 2), 'application/json');
}

function validSession(x) {
  return x && typeof x.id === 'string' && Number.isFinite(x.start) && Number.isFinite(x.startPct)
    && Number.isFinite(x.cap) && Number.isFinite(x.loss) && Number.isFinite(x.price) && Number.isFinite(x.vat);
}

function onRestoreFile(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try { data = JSON.parse(reader.result); } catch { toast('That file is not a ChargeLog backup', 'warn'); return; }
    if (!data || data.app !== 'ChargeLog' || !Array.isArray(data.sessions)) { toast('That file is not a ChargeLog backup', 'warn'); return; }
    const sessions = data.sessions.filter(validSession);
    actionSheet({
      title: `Restore ${sessions.length} charge${sessions.length === 1 ? '' : 's'}?`,
      message: 'This replaces everything currently in ChargeLog.',
      actions: [{ label: 'Replace with backup', destructive: true, handler: () => {
        store.data.sessions = sessions;
        store.data.settings = { ...DEFAULTS, ...(data.settings || {}) };
        store.save(); render(); toast('Backup restored');
      } }],
    });
  };
  reader.readAsText(file);
}

function applyToAll() {
  const n = store.sessions.length;
  if (!n) { toast('No charges yet'); return; }
  actionSheet({
    title: 'Recalculate all past charges?',
    message: 'Every saved charge will use the battery size, loss, price and IVA above.',
    actions: [{ label: `Apply to ${n} charge${n === 1 ? '' : 's'}`, handler: () => {
      const t = tariffNow();
      store.sessions.forEach((s) => Object.assign(s, t));
      store.save(); render(); toast('All charges recalculated');
    } }],
  });
}

/* ---------------- Navigation ---------------- */

const SCREENS = { charge: renderCharge, history: renderHistory, stats: renderStats, settings: renderSettings };

function render() {
  document.querySelectorAll('.screen').forEach((sc) => sc.classList.toggle('active', sc.id === 'screen-' + ui.tab));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === ui.tab));
  SCREENS[ui.tab]();
}

function setTab(tab) {
  if (ui.tab === tab) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  ui.tab = tab;
  window.scrollTo(0, 0);
  render();
}

function buildTabbar() {
  const tabs = [['charge', 'Charge', ICON.bolt], ['history', 'History', ICON.list], ['stats', 'Stats', ICON.chart], ['settings', 'Settings', ICON.sliders]];
  const bar = document.getElementById('tabbar');
  bar.innerHTML = tabs.map(([k, label, icon]) => `<button class="tab" data-tab="${k}">${icon}<span>${label}</span></button>`).join('');
  bar.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
}

const ACTIONS = {
  start: openStartSheet,
  end: openEndSheet,
  'edit-alarm': openAlarmSheet,
  'active-menu': activeMenu,
  'see-all': () => setTab('history'),
  'export-csv': exportCSV,
  backup,
  restore: () => document.getElementById('restore-file').click(),
  'apply-all': applyToAll,
  'shortcut-help': openShortcutHelp,
  'test-reminder': testReminder,
  'dismiss-install': () => { store.settings.installHintDismissed = true; store.save(); render(); },
};

document.addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]');
  if (act && ACTIONS[act.dataset.act]) { ACTIONS[act.dataset.act](); return; }
  const del = e.target.closest('[data-del]');
  if (del) { deleteSession(del.dataset.del); return; }
  const edit = e.target.closest('[data-edit]');
  if (edit) {
    const row = edit.closest('.swipe');
    if (row && (row.dataset.justSwiped || row.classList.contains('open'))) {
      row.classList.remove('open'); row.querySelector('.swipe-content').style.transform = '';
      return;
    }
    openEditSheet(edit.dataset.edit);
  }
});

/* ---------------- Boot ---------------- */

function boot() {
  store.load();
  buildTabbar();
  render();
  setInterval(tick, 1000);
  setInterval(() => {
    if (ui.tab === 'charge' && activeSession() && !document.querySelector('.sheet, .action-sheet')) renderCharge();
  }, 30000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !document.querySelector('.sheet, .action-sheet')) render();
  });
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot();
