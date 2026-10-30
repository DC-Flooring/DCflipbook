const { REPO, start, seed } = require('./h.js');
const PERIODS = ['month', '30d', 'quarter', 'all'];
async function readOld(page) {
  return page.evaluate(() => ({
    kpis: [...document.querySelectorAll('.kpi')].map(k => ({ label: k.querySelector('.k-label').textContent.trim().toLowerCase(), value: k.querySelector('.k-value').innerText, sub: k.querySelector('.k-sub').innerText.replace(/\s+/g, ' ').trim(), cap: k.querySelector('.k-cap').innerText })),
    total: document.querySelector('.na-total').innerText,
    cols: [...document.querySelectorAll('.att-col')].map(c => ({ count: c.querySelector('h3 span').innerText, rows: [...c.querySelectorAll('.na-row')].map(r => ({ ref: r.dataset.ref, name: r.querySelector('.na-name').innerText, value: r.querySelector('.na-value').innerText, meta: r.querySelector('.na-meta').innerText.replace(/\s+/g, ' ').trim() })), more: (c.querySelector('.na-more') || {}).innerText || '' })),
    snoozed: document.querySelector('.snz-toggle').textContent.replace(/[▴▾]/g, '').trim().toLowerCase(),
    chart: [...(document.querySelector('.chart') ? [document.querySelector('.chart').getAttribute('aria-label')] : [])]
  }));
}
async function readNew(page) {
  const base = await page.evaluate(() => ({
    kpis: [...document.querySelectorAll('.kpi')].map(k => ({ label: k.querySelector('.k-label').textContent.trim().toLowerCase(), value: k.querySelector('.k-value').innerText, sub: k.querySelector('.k-sub').innerText.replace(/\s+/g, ' ').trim(), cap: k.querySelector('.sr-only').textContent })),
    total: document.querySelector('.na-total').innerText,
    snoozed: document.querySelector('.snz-toggle').textContent.replace(/[▴▾]/g, '').trim().toLowerCase(),
    chart: [...document.querySelectorAll('.chartbox .col')].map(g => g.getAttribute('aria-label'))
  }));
  const cols = [];
  for (const k of ['expiring', 'warm', 'cold']) {
    await page.click(`.tab[data-tab="${k}"]`);
    cols.push(await page.evaluate(() => ({ count: document.querySelector('.tab[aria-selected="true"] .tab-n').innerText.replace(/[()]/g, ''), rows: [...document.querySelectorAll('#naList .na-row')].map(r => ({ ref: r.dataset.ref, name: r.querySelector('.na-name').innerText, value: r.querySelector('.na-value').innerText, meta: r.querySelector('.na-meta').innerText.replace(/\s+/g, ' ').trim() })), more: (document.querySelector('#naList .na-more') || {}).innerText || '' })));
  }
  return { ...base, cols };
}
function norm(chartOld) { // "week of 26 Oct, 3 sent, 1 accepted; ..." -> [[26 Oct,3,1],...]
  return chartOld.join('; ').split('; ').filter(Boolean).map(s => (s.match(/(?:week of|Week of) (.+?)[,:] (\d+) sent, (\d+) accepted/i) || []).slice(1).join('|'));
}
(async () => {
  let bad = 0;
  for (const [name, quotes] of [['full data', seed()], ['empty', []]]) {
    const o = await start({ root: process.env.OLD, port: 8211, quotes });
    const n = await start({ root: REPO, port: 8212, quotes });
    await o.page.goto('http://localhost:8211/#/dashboard'); await n.page.goto('http://localhost:8212/#/dashboard');
    for (const per of PERIODS) {
      for (const t of [o, n]) { await t.page.waitForSelector('.kpi'); await t.page.click(`.period button[data-period="${per}"]`); await t.page.waitForTimeout(300); }
      const a = await readOld(o.page), b = await readNew(n.page);
      const issues = [];
      a.kpis.forEach((k, i) => { const m = b.kpis[i]; const labelOk = k.label === m.label || (k.label.startsWith('average time') && m.label === 'time to decision'); if (!labelOk || k.value !== m.value || k.sub !== m.sub || k.cap !== m.cap) issues.push(['kpi', i, k, m]); });
      if (a.total !== b.total) issues.push(['needs-attention total', a.total, b.total]);
      a.cols.forEach((c, i) => { if (JSON.stringify(c) !== JSON.stringify(b.cols[i])) issues.push(['att col', i, c, b.cols[i]]); });
      if (a.snoozed !== b.snoozed) issues.push(['snoozed', a.snoozed, b.snoozed]);
      if (JSON.stringify(norm(a.chart)) !== JSON.stringify(norm(b.chart))) issues.push(['chart', norm(a.chart), norm(b.chart)]);
      console.log(`${name} / ${per}: ${issues.length ? 'DIFF' : 'identical'} (kpis ${b.kpis.map(k => k.value).join(' | ')})`);
      if (issues.length) { bad++; console.log(JSON.stringify(issues, null, 1).slice(0, 1500)); }
    }
    if (o.errors.length || n.errors.length) console.log('errors', o.errors, n.errors);
    await o.close(); await n.close();
  }
  console.log(bad ? 'MISMATCHES: ' + bad : 'ALL IDENTICAL');
})().catch(e => { console.error(e); process.exit(1); });
