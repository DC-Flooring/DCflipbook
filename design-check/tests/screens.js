const { REPO, start, seed } = require('./h.js');
const OUT = REPO + '/design-check/';
const only = process.argv[2] ? process.argv[2].split(',') : null;
(async () => {
  let port = 8300; const problems = [];
  for (const theme of ['dark', 'light']) for (const [vw, vh] of [[1440, 900], [390, 844]]) {
    const tag = `${vw}-${theme}`;
    const run = async (name, fn, opts = {}) => {
      if (only && !only.includes(name)) return;
      const t = await start({ root: REPO, port: port++, quotes: opts.quotes || seed(), viewport: { width: vw, height: vh }, theme, session: opts.session !== false, nav: opts.nav });
      try { await fn(t.page, t); await t.page.waitForTimeout(350); await t.page.screenshot({ path: `${OUT}${name}-${tag}.png`, fullPage: opts.full !== false }); }
      catch (e) { problems.push(`${name}-${tag}: ${e.message.split('\n')[0]}`); }
      if (t.errors.length) problems.push(`${name}-${tag} console: ${t.errors.join(' | ')}`);
      await t.close();
    };
    const go = (hash) => async (p) => { await p.goto(`http://localhost:${p.url().match(/:(\d+)/) ? '' : ''}`).catch(() => {}); };
    const at = async (p, t, hash, wait) => { const base = t.browser && p._base; };
    await run('login', async p => { await p.goto(p._u('/')); await p.waitForSelector('#loginForm', { state: 'visible' }); }, { session: false, full: false });
    await run('dashboard', async p => { await p.goto(p._u('/#/dashboard')); await p.waitForSelector('.kpi'); await p.waitForTimeout(500); });
    await run('quotes', async p => { await p.goto(p._u(vw > 800 ? '/#/quotes' : '/#/quotes')); await p.waitForSelector('.qcard'); await p.waitForTimeout(400); });
    await run('quote-editor', async p => { await p.goto(p._u('/#/quotes/DCF-100005')); await p.waitForSelector('#f-name'); await p.waitForTimeout(400); });
    await run('quote-editor-accepted', async p => { await p.goto(p._u('/#/quotes/DCF-100010')); await p.waitForSelector('#f-name'); await p.waitForTimeout(600); });
    await run('reminders', async p => { await p.goto(p._u('/#/reminders')); await p.waitForSelector('.qcard'); await p.waitForTimeout(400); });
    await run('settings', async p => { await p.goto(p._u('/#/settings')); await p.waitForSelector('#settingsForm'); });
    await run('record-dialog', async p => { await p.goto(p._u('/#/quotes/DCF-100005')); await p.waitForSelector('#recAcceptBtn'); await p.click('#recAcceptBtn'); await p.waitForSelector('#recordModal'); }, { full: false });
    await run('toast-and-menu', async p => { await p.goto(p._u('/#/dashboard')); await p.waitForSelector('.kpi'); await p.waitForTimeout(400);
      if (vw > 800) { await p.click('.qd-actions [data-act="chase"]'); } else { await p.click('.na-item [data-act="chase"]'); }
      await p.waitForSelector('#toast:not([hidden])'); }, { full: false });
    await run('snooze-menu', async p => { await p.goto(p._u('/#/dashboard')); await p.waitForSelector('.kpi'); await p.waitForTimeout(400);
      await p.click(vw > 800 ? '.qd-actions [data-menu="snooze"]' : '.na-item [data-menu="snooze"]'); await p.waitForTimeout(200); }, { full: false });
    await run('dashboard-empty', async p => { await p.goto(p._u('/#/dashboard')); await p.waitForSelector('.kpi'); await p.waitForTimeout(400); }, { quotes: [] });
    if (vw > 800) await run('dashboard-collapsed', async p => { await p.goto(p._u('/#/dashboard')); await p.waitForSelector('.kpi'); await p.waitForTimeout(500); }, { nav: '1' });
  }
  console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'all screens captured');
})().catch(e => { console.error(e); process.exit(1); });
