// The token values are read from index.html itself, so this check can never drift from the real CSS.
const html = require('fs').readFileSync(require('path').join(process.env.REPO || require('path').resolve(__dirname, '../..'), 'index.html'), 'utf8');
function tokens(theme) {
  const m = html.match(new RegExp('html\\[data-theme="' + theme + '"\\]\\{([^}]*)\\}'));
  const raw = {}; m[1].replace(/--([\w-]+):\s*([^;]+);/g, (_, k, v) => { raw[k] = v.trim(); });
  const camel = k => k.replace(/-(\w)/g, (_, c) => c.toUpperCase());
  const t = {};
  for (const [k, v] of Object.entries(raw)) {
    const rg = v.match(/^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/);
    t[camel(k)] = rg ? [+rg[1], +rg[2], +rg[3], +rg[4]] : v;
  }
  t.navBg = t.navActiveBg; t.navText = t.navActiveText; t.control = t.controlBorder; t.chartWon = t.chartWon; t.chartSent = t.chartSent;
  return t;
}
const T = { dark: tokens('dark'), light: tokens('light') };
const rgb = h => typeof h === 'string' ? [1,3,5].map(i => parseInt(h.slice(i, i + 2), 16)) : h.slice(0, 3);
const lum = c => { const [r, g, b] = c.map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
const ratio = (a, b) => { const la = lum(rgb(a)), lb = lum(rgb(b)); return (Math.max(la, lb) + .05) / (Math.min(la, lb) + .05); };
const over = (fg, bg) => { const a = fg[3], b = rgb(bg), f = fg.slice(0, 3); return f.map((v, i) => v * a + b[i] * (1 - a)); };
let fails = 0;
const row = (name, a, b, need) => { const r = ratio(a, b); const ok = r >= need; if (!ok) fails++; return `${ok ? 'pass' : 'FAIL'}  ${r.toFixed(2).padStart(5)}  (need ${need})  ${name}`; };
for (const th of ['dark', 'light']) {
  const t = T[th]; console.log(`\n=== ${th} ===`);
  const out = [];
  for (const s of ['bg', 'panel', 'tile', 'tileActive']) { out.push(row(`text on ${s}`, t.text, t[s], 4.5)); out.push(row(`muted on ${s}`, t.muted, t[s], 4.5)); out.push(row(`accent-text on ${s}`, t.accentText, t[s], 4.5)); }
  for (const c of ['green', 'red', 'amber']) for (const s of ['panel', 'tile', 'tileActive']) out.push(row(`${c}-text on ${s}`, t[c + 'Text'], t[s], 4.5));
  for (const c of ['green', 'red', 'amber']) for (const s of ['panel', 'tile']) out.push(row(`pill: normal text on ${c} pill bg over ${s}`, t.text, over(t[c + 'Bg'], t[s]), 4.5));
  out.push(row('destructive button: white on red-solid', t.onSolid, t.redSolid, 4.5));
  out.push(row('red-text on bg (errors on the login screen)', t.redText, t.bg, 4.5));
  for (const s of ['bg', 'panel', 'tile', 'tileActive']) out.push(row(`focus ring vs ${s}`, t.focus, t[s], 3));
  for (const c of ['green', 'red', 'amber']) out.push(row(`status dot/border (${c}) vs panel`, t[c], t.panel, 3));
  out.push(row('on-accent text on accent (buttons, active tab, KPI)', t.onAccent, t.accent, 4.5));
  out.push(row('on-accent text on accent-hover', t.onAccent, t.accentHover, 4.5));
  out.push(row('nav active text on pill', t.navText, t.navBg, 4.5));
  out.push(row('muted text on nav hover (tile)', t.muted, t.tile, 4.5));
  out.push(row('red on bg (login error)', t.red, t.bg, 4.5));
  // UI parts (3:1)
  out.push(row('accent fill (active tab / period / nav pill) vs panel', t.accent, t.panel, 3));
  for (const s of ['panel', 'tile']) out.push(row(`form-field border vs ${s}`, t.control, t[s], 3));
  for (const s of ['panel']) { out.push(row(`chart: sent bars vs ${s}`, t.chartSent, t[s], 3)); out.push(row(`chart: accepted bars vs ${s}`, t.chartWon, t[s], 3)); }
  out.push(row('chart: sent vs accepted bars (neighbours)', t.chartSent, t.chartWon, 1.1));
  console.log(out.join('\n'));
}
console.log('\nFAILS:', fails);
