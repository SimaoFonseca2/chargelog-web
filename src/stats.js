/* =========================================================
   Stats tab: monthly chart, tiles, cost-per-charge chart
   ========================================================= */

function niceMax(v) {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return m * p;
}
const axisLabel = (v) => fmt.num(v, v < 10 && v % 1 ? 1 : 0);

function statsData() {
  const done = completedSessions().slice().sort((a, b) => a.start - b.start);
  const thisM = startOfMonth(Date.now());
  let from;
  if (ui.statsRange === '6M') from = addMonths(thisM, -5);
  else if (ui.statsRange === '1Y') from = addMonths(thisM, -11);
  else from = Math.min(done.length ? startOfMonth(done[0].start) : thisM, thisM);
  const sessions = done.filter((s) => s.start >= from);
  const buckets = [];
  for (let m = from, guard = 0; m <= thisM && guard < 600; m = addMonths(m, 1), guard++) {
    const items = sessions.filter((s) => startOfMonth(s.start) === m);
    buckets.push({
      month: m, count: items.length,
      cost: items.reduce((a, s) => a + sCost(s), 0),
      energy: items.reduce((a, s) => a + sEnergy(s), 0),
    });
  }
  return { done, sessions, buckets };
}

function renderStats() {
  const el = document.getElementById('screen-stats');
  const { done, sessions, buckets } = statsData();
  el.innerHTML = `
    <div class="title-row"><h1 class="large-title">Stats</h1></div>
    <div class="stack">
      ${segmentedHTML('range', [['6M', '6M'], ['1Y', '1Y'], ['All', 'All']], ui.statsRange)}
      ${!done.length ? `<div class="empty">${ICON.chart}<h3>No stats yet</h3><div>Finish your first charge to see monthly spending and energy.</div></div>` : `
        <div class="card" id="month-card"></div>
        <div class="tiles" id="tiles"></div>
        ${sessions.length >= 2 ? `<div class="card"><h3 class="card-title" style="margin-bottom:10px">Cost per charge</h3><div id="per-charge"></div></div>` : ''}
      `}
    </div>`;
  wireSegmented(el, 'range', (v) => { ui.statsRange = v; ui.statsSel = null; renderStats(); });
  if (!done.length) return;
  renderMonthCard(buckets);
  renderTiles(sessions);
  if (sessions.length >= 2) renderPerCharge(sessions);
}

function renderMonthCard(buckets) {
  const card = document.getElementById('month-card');
  const key = ui.statsMetric === 'cost' ? 'cost' : 'energy';
  const f = key === 'cost' ? fmt.eur : fmt.kwh;
  const total = buckets.reduce((a, b) => a + b[key], 0);
  const avg = buckets.length ? total / buckets.length : 0;
  const sel = buckets.find((b) => b.month === ui.statsSel) || null;
  const rangeLabel = { '6M': 'last 6 months', '1Y': 'last 12 months', All: 'all time' }[ui.statsRange];

  card.innerHTML = `
    <div class="row-between" style="align-items:flex-start;margin-bottom:12px">
      <div>
        <div class="caption" style="font-weight:600">${sel ? fmt.month(sel.month) : 'Total · ' + rangeLabel}</div>
        <div class="stat-head-val">${f(sel ? sel[key] : total)}</div>
        <div class="caption">${sel ? `${sel.count} charge${sel.count === 1 ? '' : 's'}` : `avg ${f(avg)} / month`}</div>
      </div>
      <div style="width:116px">${segmentedHTML('metric', [['cost', '€'], ['energy', 'kWh']], ui.statsMetric)}</div>
    </div>
    <div id="bars"></div>
    <div class="caption" style="text-align:center;margin-top:6px">${sel ? 'Tap the month again to clear' : 'Tap a month for details'}</div>`;
  wireSegmented(card, 'metric', (v) => { ui.statsMetric = v; renderMonthCard(buckets); });

  const box = card.querySelector('#bars');
  const W = Math.max(260, box.clientWidth || 320), H = 220, padL = 34, padB = 22, padT = 14;
  const max = niceMax(Math.max(...buckets.map((b) => b[key]), avg) * 1.05);
  const n = buckets.length, band = (W - padL) / n, bw = Math.max(4, Math.min(28, band * 0.62));
  const y = (v) => padT + (H - padT - padB) * (1 - v / max);
  const grid = [0, 0.25, 0.5, 0.75, 1].map((r) => {
    const v = max * r, yy = y(v);
    return `<line class="grid" x1="${padL}" x2="${W}" y1="${yy}" y2="${yy}"/><text x="0" y="${yy + 4}">${axisLabel(v)}</text>`;
  }).join('');
  const step = n > 12 ? 3 : 1;
  const bars = buckets.map((b, i) => {
    const x = padL + i * band + (band - bw) / 2, yy = y(b[key]), hgt = Math.max(0, H - padB - yy);
    const dim = sel && sel.month !== b.month ? 0.3 : 1;
    const r = Math.min(5, bw / 2, hgt);
    const path = hgt > 0
      ? `M${x},${H - padB} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + bw - r} Q${x + bw},${yy} ${x + bw},${yy + r} V${H - padB} Z`
      : '';
    return `
      ${path ? `<path class="bar" d="${path}" fill="url(#barGrad)" opacity="${dim}"/>` : ''}
      ${i % step === 0 ? `<text x="${padL + i * band + band / 2}" y="${H - 6}" text-anchor="middle" ${sel && sel.month === b.month ? 'style="fill:var(--text);font-weight:700"' : ''}>${fmt.monthNarrow(b.month)}</text>` : ''}
      <rect x="${padL + i * band}" y="0" width="${band}" height="${H}" fill="transparent" data-month="${b.month}"/>`;
  }).join('');
  const avgLine = !sel && avg > 0 ? `<line class="avg" x1="${padL}" x2="${W}" y1="${y(avg)}" y2="${y(avg)}"/><text x="${padL + 4}" y="${y(avg) - 5}" style="font-weight:600">avg</text>` : '';

  box.innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" height="${H}">
    <defs><linearGradient id="barGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#26d18f"/><stop offset="1" stop-color="#0a80a8"/></linearGradient></defs>
    ${grid}${bars}${avgLine}</svg>`;
  box.querySelectorAll('[data-month]').forEach((r) => r.addEventListener('click', () => {
    const m = +r.dataset.month; ui.statsSel = ui.statsSel === m ? null : m; renderMonthCard(buckets);
  }));
}

function renderTiles(list) {
  const n = Math.max(list.length, 1);
  const cost = list.reduce((a, s) => a + sCost(s), 0);
  const energy = list.reduce((a, s) => a + sEnergy(s), 0);
  const added = list.reduce((a, s) => a + addedPct(s), 0);
  const dur = list.reduce((a, s) => a + sDuration(s), 0);
  const tile = (title, val, icon, color) => `
    <div class="tile">
      <div class="tile-icon" style="color:${color};background:color-mix(in srgb, ${color} 16%, transparent)">${icon}</div>
      <div><div class="tile-val">${val}</div><div class="caption">${title}</div></div>
    </div>`;
  document.getElementById('tiles').innerHTML = [
    tile('Spent', fmt.eur(cost), ICON.euro, 'var(--brand)'),
    tile('Energy', fmt.kwh(energy), ICON.bolt, '#e6a800'),
    tile('Charges', list.length, ICON.hash, 'var(--blue)'),
    tile('Avg per charge', fmt.eur(cost / n), ICON.divide, 'var(--purple)'),
    tile('Avg battery added', '+' + fmt.pct(added / n), ICON.battery, 'var(--teal)'),
    tile('Avg charge time', fmt.dur(dur / n), ICON.clock, 'var(--orange)'),
  ].join('');
}

function renderPerCharge(list) {
  const box = document.getElementById('per-charge');
  const W = Math.max(260, box.clientWidth || 320), H = 170, padL = 34, padB = 20, padT = 10, padR = 8;
  const t0 = list[0].start, t1 = list[list.length - 1].start;
  const span = Math.max(1, t1 - t0);
  const max = niceMax(Math.max(...list.map(sCost)) * 1.1);
  const x = (ts) => padL + 6 + (W - padL - padR - 12) * ((ts - t0) / span);
  const y = (v) => padT + (H - padT - padB) * (1 - v / max);
  const pts = list.map((s) => [x(s.start), y(sCost(s))]);
  // Catmull-Rom → Bézier for a smooth line
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }
  const grid = [0, 0.5, 1].map((r) => { const v = max * r; return `<line class="grid" x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text x="0" y="${y(v) + 4}">${axisLabel(v)}</text>`; }).join('');
  const dateLbl = (ts) => new Date(ts).toLocaleDateString(DATE_LOCALE, { day: 'numeric', month: 'short' });
  box.innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" height="${H}">
    ${grid}
    <path d="${d}" fill="none" stroke="var(--brand)" stroke-opacity="0.5" stroke-width="2.5" stroke-linecap="round"/>
    ${pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="3.6" fill="var(--brand)"/>`).join('')}
    <text x="${padL}" y="${H - 4}">${dateLbl(t0)}</text>
    <text x="${W - padR}" y="${H - 4}" text-anchor="end">${dateLbl(t1)}</text>
  </svg>`;
}
