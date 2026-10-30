// Finds backgrounds / text colours / borders on admin screens that are not one of the theme tokens (leftover cream etc.)
const { REPO, start, seed } = require('./h.js');
const TOK = {
  dark: ['#1c1c1c','#272727','#303030','#3a3a3a','#f5f5f5','#a8a8a8','#b08d57','#c29d65','#c9a66f','#5fae7a','#d0675f','#d9a441','#ffffff','#7a7a7a','#8a8a8a','#7cc596','#ec928b','#e3b255','#a83f38'],
  light: ['#f2f2ef','#ffffff','#f6f6f3','#e2e2dd','#1c1c1c','#6b6b66','#b08d57','#c29d65','#7a5a2c','#2f7a4d','#b23b33','#8a5a14','#8b8b85','#9a7a45','#272727','#eeeeea'],
};
const hex = (r, g, b) => '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
(async () => {
  let port = 8400, total = 0;
  for (const theme of ['dark', 'light']) for (const [vw, vh] of [[1440, 900], [390, 844]]) {
    const found = new Map();
    const screens = [['/#/dashboard', '.kpi'], ['/#/quotes', '.qcard'], ['/#/quotes/DCF-100010', '#f-name'], ['/#/quotes/DCF-100005', '#recAcceptBtn'], ['/#/reminders', '.qcard'], ['/#/settings', '#settingsForm']];
    for (const [hash, sel] of screens) {
      const t = await start({ root: REPO, port: port++, quotes: seed(), viewport: { width: vw, height: vh }, theme });
      await t.page.goto(t.page._u('/' + hash)); await t.page.waitForSelector(sel); await t.page.waitForTimeout(500);
      if (hash.endsWith('100005')) { await t.page.click('#recAcceptBtn'); await t.page.waitForSelector('#recordModal'); }
      if (hash === '/#/dashboard') { await t.page.evaluate(() => { document.getElementById('toast').hidden = false; document.getElementById('toast').innerHTML = '<span class="toast-msg">x</span><button class="toast-undo">Undo</button>'; }); }
      const res = await t.page.evaluate(() => {
        const out = [];
        const roots = [document.getElementById('admin'), document.querySelector('.modal-back'), document.getElementById('toast')].filter(Boolean);
        for (const r of roots) for (const e of [r, ...r.querySelectorAll('*')]) {
          const cs = getComputedStyle(e); if (cs.display === 'none' || e.closest('[hidden]') && !e.id === 'toast') continue;
          const rect = e.getBoundingClientRect(); if (!rect.width || !rect.height) continue;
          out.push({ s: (e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : '')).slice(0, 60), bg: cs.backgroundColor, c: cs.color, bc: cs.borderTopColor, bw: cs.borderTopWidth, ff: cs.fontFamily.split(',')[0].replace(/["']/g, ''), fs: parseFloat(cs.fontSize), hasText: [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) });
        }
        return out;
      });
      for (const r of res) {
        const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(x => parseFloat(x)); return { h: hex(p[0], p[1], p[2]), a: p.length > 3 ? p[3] : 1 }; };
        const key = (k, v, extra) => { const kk = k + ' ' + v + ' ' + extra; if (!found.has(kk)) found.set(kk, r.s); };
        const bg = parse(r.bg); if (bg && bg.a === 1 && !TOK[theme].includes(bg.h)) key('bg', bg.h, '');
        const col = parse(r.c); if (col && r.hasText && !TOK[theme].includes(col.h) && col.a === 1) key('text', col.h, '');
        const bc = parse(r.bc); if (bc && bc.a > 0 && parseFloat(r.bw) > 0 && !TOK[theme].includes(bc.h)) key('border', bc.h, '');
        if (r.hasText && !/Inter|Montserrat/.test(r.ff)) key('font', r.ff, '');
        if (r.hasText && r.fs < 12) key('tiny-text', r.fs + 'px', '');
      }
      await t.close();
    }
    console.log(`\n== ${theme} ${vw}px: ${found.size} off-token items`); total += found.size;
    [...found].slice(0, 40).forEach(([k, v]) => console.log('  ', k, ' <- ', v));
  }
  console.log('\nTOTAL off-token', total);
})().catch(e => { console.error(e); process.exit(1); });
