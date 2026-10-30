const { REPO, start, seed } = require('./h.js');
let port = 8500; const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m) || (c ? 0 : (process.exitCode = 1));
(async () => {
  // ---------- desktop ----------
  let t = await start({ root: REPO, port: port++, quotes: seed() }); let p = t.page;
  // theme is on <html> before first paint: check from an init script at DOMContentLoaded
  await p.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { window.__themeAtDCL = document.documentElement.getAttribute('data-theme'); }); });
  await p.goto(p._u('/#/dashboard')); await p.waitForSelector('.kpi'); await p.waitForTimeout(500);
  ok(await p.evaluate(() => window.__themeAtDCL) === 'dark', 'theme attribute already set before first paint (default dark)');
  ok(await p.evaluate(() => getComputedStyle(document.body).backgroundColor) === 'rgb(28, 28, 28)', 'page background is #1c1c1c in dark');
  // default tab / row
  ok(await p.innerText('.tab[aria-selected="true"]') .then(x => /^Expiring/.test(x)), 'first non-empty tab (Expiring) opens by default');
  ok(await p.getAttribute('.na-row[aria-current="true"]', 'data-ref') === 'DCF-100008', 'first row is selected by default (aria-current)');
  ok((await p.innerText('.qd-ref')).includes('DCF-100008'), 'detail panel shows the selected quote');
  const evs = await p.$$eval('.timeline .tl-what', els => els.map(e => e.textContent.replace('Upcoming', '').trim()));
  console.log('     timeline:', evs.join(' > '));
  ok(evs[evs.length - 1] === 'Expires' && await p.$eval('.tl-item.upcoming .tl-tag', e => e.textContent) === 'Upcoming', 'expiry is the last event and marked Upcoming (not colour alone)');
  // tab switching + keyboard
  await p.click('.tab[data-tab="warm"]'); ok(await p.$eval('.tab[aria-selected="true"]', e => e.dataset.tab) === 'warm', 'clicking a tab selects it');
  ok(await p.evaluate(() => document.activeElement.dataset.tab) === 'warm', 'focus stays on the tab after repaint');
  await p.keyboard.press('ArrowRight'); ok(await p.$eval('.tab[aria-selected="true"]', e => e.dataset.tab) === 'cold', 'ArrowRight moves to the next tab');
  await p.keyboard.press('Home'); ok(await p.$eval('.tab[aria-selected="true"]', e => e.dataset.tab) === 'expiring', 'Home goes to the first tab');
  await p.keyboard.press('End'); ok(await p.$eval('.tab[aria-selected="true"]', e => e.dataset.tab) === 'cold', 'End goes to the last tab');
  await p.keyboard.press('Home');
  ok(await p.$$eval('.tab', ts => ts.map(x => x.getAttribute('tabindex')).join(',')) === '0,-1,-1', 'roving tabindex on the tablist');
  ok(await p.$eval('[role=tablist]', e => !!e) && await p.$eval('[role=tabpanel]', e => e.getAttribute('aria-labelledby')) === 'tab-expiring', 'tablist / tabpanel roles wired');
  // Tab key into the list, arrow down selects the next row
  await p.keyboard.press('Tab'); const f1 = await p.evaluate(() => document.activeElement.className); 
  await p.focus('.na-row[aria-current="true"]'); await p.keyboard.press('ArrowDown');
  ok(await p.getAttribute('.na-row[aria-current="true"]', 'data-ref') === 'DCF-100004', 'ArrowDown selects the next row; the detail panel follows');
  ok((await p.innerText('.qd-ref')).includes('DCF-100004'), 'detail panel updated');
  ok(await p.evaluate(() => document.activeElement.classList.contains('na-row')), 'focus stays on the selected row');
  // focus outline visible
  await p.keyboard.press('Tab');
  const ring = await p.evaluate(() => { const cs = getComputedStyle(document.activeElement); return cs.outlineStyle + ' ' + cs.outlineWidth + ' ' + cs.outlineColor; });
  ok(/solid 2px rgb\(176, 141, 87\)/.test(ring), 'keyboard focus shows a 2px brass outline: ' + ring);
  // Chased via keyboard -> toast, row leaves, selection moves, Undo restores
  await p.click('.na-row[data-ref="DCF-100008"]');
  await p.focus('.qd-actions [data-act="chase"]'); await p.keyboard.press('Enter');
  await p.waitForSelector('#toast:not([hidden])');
  ok((await p.innerText('#toast')).includes('as chased'), 'Chased shows the toast');
  ok(await p.$('.na-row[data-ref="DCF-100008"]') === null, 'the chased quote leaves the Needs attention list');
  ok(await p.getAttribute('.na-row[aria-current="true"]', 'data-ref') === 'DCF-100004', 'selection moves to the first remaining row');
  ok(await p.evaluate(() => document.activeElement.classList.contains('na-row')), 'keyboard focus returns to the selected row after the action');
  await p.click('.toast-undo'); await p.waitForTimeout(400);
  ok(await p.$('.na-row[data-ref="DCF-100008"]') !== null, 'Undo brings the quote back');
  // extend only on the expiring tab
  ok(await p.$('.qd-actions [data-menu="extend"]') !== null, 'Extend is offered on the Expiring tab');
  await p.click('.tab[data-tab="warm"]'); ok(await p.$('.qd-actions [data-menu="extend"]') === null, 'Extend is not offered on the Warm tab');
  // copy ref
  await p.click('[data-copy-ref]'); await p.waitForSelector('#toast:not([hidden])'); ok(/Copied DCF-/.test(await p.innerText('#toast')), 'copy icon copies the quote ref (toast)');
  // open quote
  await p.click('[data-open]'); await p.waitForSelector('#f-name'); ok(/\/#\/quotes\/DCF-/.test(p.url()), 'Open quote goes to the editor');
  // New quote button
  await p.goto(p._u('/#/dashboard')); await p.waitForSelector('.kpi'); await p.click('#dashNew'); await p.waitForSelector('#f-name'); ok(true, '+ New quote creates a draft and opens the editor');
  // period
  await p.goto(p._u('/#/dashboard')); await p.waitForSelector('.kpi'); await p.click('.period button[data-period="all"]'); ok(await p.$eval('.period button.active', e => e.dataset.period) === 'all', 'period selector works');
  // chart tooltip + focus
  await p.focus('.chartbox .col'); ok(await p.$eval('.chartbox .tip', e => !e.hidden), 'chart tooltip opens on focus'); 
  await p.hover('.chartbox .col:nth-of-type(6)'); ok(await p.$eval('.chartbox .tip', e => !e.hidden && e.textContent.includes('Sent')), 'chart tooltip opens on hover');
  ok(await p.$$eval('.chartbox .col', g => g.every(x => x.getAttribute('aria-label') && x.getAttribute('tabindex') === '0')), 'every chart week is focusable with a text label');
  // theme toggle + persistence
  await p.click('.sb-foot [data-theme-set="light"]');
  ok(await p.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'light' && await p.evaluate(() => localStorage.getItem('dcf.theme')) === 'light', 'Light/Dark toggle switches and remembers the choice');
  await p.reload(); await p.waitForSelector('.kpi'); ok(await p.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'light', 'light theme survives a reload');
  ok(await p.evaluate(() => getComputedStyle(document.body).backgroundColor) === 'rgb(242, 242, 239)', 'page background is #f2f2ef in light');
  // collapse sidebar
  await p.click('#sbCollapse'); await p.waitForTimeout(400); ok(await p.evaluate(() => document.documentElement.getAttribute('data-nav')) === 'collapsed' && await p.getAttribute('#sbCollapse', 'aria-expanded') === 'false', 'sidebar collapses to icons (aria-expanded=false)');
  const w = await p.$eval('.sidebar', e => Math.round(e.getBoundingClientRect().width)); ok(w <= 88, 'collapsed width is ' + w + 'px');
  ok(await p.$$eval('.nav-item', a => a.every(x => x.getAttribute('title') && x.textContent.trim().length)), 'collapsed nav items keep an accessible name and a tooltip');
  await p.reload(); await p.waitForSelector('.kpi'); ok(await p.evaluate(() => document.documentElement.getAttribute('data-nav')) === 'collapsed', 'collapsed state is remembered');
  // preview as customer drops the admin theme
  await p.goto(p._u('/#/quotes/DCF-100005')); await p.waitForSelector('#previewBtn'); await p.click('#previewBtn'); await p.waitForSelector('#book');
  ok(await p.evaluate(() => document.documentElement.getAttribute('data-theme')) === null, 'Preview as customer removes the admin theme (booklet keeps its own look)');
  await p.click('#adminLink'); await p.waitForTimeout(800); ok(await p.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'light', 'back in the admin the theme returns');
  ok(t.errors.length === 0, 'no console errors (desktop): ' + JSON.stringify(t.errors)); await t.close();

  // ---------- storage blocked ----------
  t = await start({ root: REPO, port: port++, quotes: seed(), session: false }); p = t.page;
  await p.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
  await p.goto(p._u('/')); await p.waitForSelector('#loginForm', { state: 'visible' });
  ok(await p.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'dark', 'blocked storage: still dark, no crash'); await t.close();

  // ---------- mobile ----------
  t = await start({ root: REPO, port: port++, quotes: seed(), viewport: { width: 390, height: 844 } }); p = t.page;
  await p.goto(p._u('/#/dashboard')); await p.waitForSelector('.kpi'); await p.waitForTimeout(500);
  ok(await p.$('.qd-panel') === null, 'mobile: no detail panel');
  const grid = await p.$eval('.kpis', e => getComputedStyle(e).gridTemplateColumns.split(' ').length); ok(grid === 2, 'mobile: KPI tiles in two columns');
  const hl = await p.$eval('.kpi.hl', e => Math.round(e.getBoundingClientRect().width)), vw = 390 - 32; ok(hl >= vw - 2, 'mobile: highlight tile is full width (' + hl + 'px)');
  ok(await p.$eval('.kpi:last-child', e => Math.round(e.getBoundingClientRect().width)) >= vw - 2, 'mobile: a last tile left on its own runs full width');
  ok(await p.$eval('.tabs', e => getComputedStyle(e).overflowX) === 'auto', 'mobile: tabs scroll horizontally');
  const small = await p.evaluate(() => { const bad = []; document.querySelectorAll('#admin button, #admin a.nav-item, #admin input:not([type=hidden]), #admin select, #admin .tab').forEach(e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); if (!r.width || !r.height || cs.visibility === 'hidden' || e.closest('[hidden]') || e.closest('.menu')) return; if (e.type === 'checkbox') return; if (r.height < 43.5 || r.width < 43.5) bad.push((e.className || e.tagName) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)); }); return bad; });
  console.log('     touch targets under 44px on the mobile dashboard:', small.length ? [...new Set(small)].join(' | ') : 'none');
  await p.click('.na-row'); await p.waitForSelector('#f-name'); ok(/#\/quotes\/DCF-/.test(p.url()), 'mobile: tapping a row opens the full-screen quote (existing view with Back)');
  ok(await p.$('#backBtn') !== null, 'mobile: Back button present');
  await p.click('#backBtn'); await p.waitForSelector('.kpi'); ok(true, 'mobile: Back returns to the dashboard');
  await p.goto(p._u('/#/settings')); await p.waitForSelector('#settingsForm');
  ok(await p.$eval('.theme-block', e => e.getBoundingClientRect().height > 0), 'mobile: Appearance toggle is in Settings');
  await p.click('.theme-block [data-theme-set="light"]'); ok(await p.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'light', 'mobile: theme toggle works');
  ok(await p.$eval('.nav-item', e => Math.round(e.getBoundingClientRect().height)) >= 44, 'mobile: bottom bar items are 44px+ tall');
  ok(t.errors.length === 0, 'no console errors (mobile): ' + JSON.stringify(t.errors)); await t.close();

  // ---------- empty state ----------
  t = await start({ root: REPO, port: port++, quotes: [], viewport: { width: 1440, height: 900 } }); p = t.page;
  await p.goto(p._u('/#/dashboard')); await p.waitForSelector('.kpi');
  ok((await p.innerText('.qd-panel')).includes('All caught up'), 'empty data: friendly "All caught up" empty state');
  ok(await p.$$eval('.kpi', k => k.length) === 6, 'empty data: six KPI tiles still render');
  ok(t.errors.length === 0, 'no console errors (empty): ' + JSON.stringify(t.errors)); await t.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
