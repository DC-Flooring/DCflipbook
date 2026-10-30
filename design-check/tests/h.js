// Test harness: a static server for a repo folder, a mocked Supabase, a frozen clock and an admin session.
const path0 = require('path');
let chromium; try{ ({ chromium } = require('playwright')); }catch(e){ ({ chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright')); }
const REPO = process.env.REPO || path0.resolve(__dirname, '../..');
const http = require('http'), fs = require('fs'), path = require('path');
const NOW = new Date('2026-10-30T12:00:00Z');
const day = n => new Date(NOW.getTime() - n * 86400000).toISOString();
const dateOnly = n => new Date(NOW.getTime() + n * 86400000).toISOString().slice(0, 10);
const LI = (...a) => a.map(([product, qty, unitPrice]) => ({ product, qty, unitPrice }));
function q(ref, name, o) {
  return Object.assign({ ref, customer_name: name, date: day(10).slice(0, 10), valid_until: dateOnly(14), line_items: LI(['Oak engineered 14mm', '24', '34.99'], ['Fitting', '', '450']),
    notes: 'Price valid for 14 days.', gallery: [], status: 'sent', response: null, hidden: false, short_slug: 'slug' + ref.slice(-6), created_at: day(5), sent_at: day(5), updated_at: day(5),
    first_viewed_at: null, last_viewed_at: null, view_count: 0, last_chased_at: null, snoozed_until: null }, o);
}
const acc = (days, extra) => Object.assign({ decision: 'accepted', reason: '', respondedAt: day(days) }, extra || {});
function seed() {
  return [
    q('DCF-100001', 'Hannah Draft', { status: 'draft', sent_at: null, created_at: day(1) }),
    q('DCF-100002', 'Ben Fresh', { created_at: day(1), sent_at: day(1), valid_until: dateOnly(13) }),
    q('DCF-100003', 'Priya Expiring Cold', { created_at: day(5), sent_at: day(5), valid_until: dateOnly(2) }),
    q('DCF-100004', 'Tom Both Lists', { created_at: day(6), sent_at: day(6), valid_until: dateOnly(1), view_count: 3, first_viewed_at: day(5), last_viewed_at: day(1) }),
    q('DCF-100005', 'Sarah Warm', { created_at: day(4), sent_at: day(4), view_count: 2, first_viewed_at: day(3), last_viewed_at: day(2), line_items: LI(['Karndean vinyl', '35', '41.20']) }),
    q('DCF-100006', 'Mohammed Cold', { created_at: day(8), sent_at: day(8), line_items: LI(['Carpet', '60', '18.50'], ['Underlay', '60', '4']) }),
    q('DCF-100007', 'Grace Snoozed', { created_at: day(10), sent_at: day(10), view_count: 1, first_viewed_at: day(9), last_viewed_at: day(9), last_chased_at: day(2), snoozed_until: new Date(NOW.getTime() + 86400000).toISOString() }),
    q('DCF-100008', 'Liam Today', { created_at: day(3), sent_at: day(3), valid_until: dateOnly(0), view_count: 1, first_viewed_at: day(3), last_viewed_at: day(3) }),
    q('DCF-100009', 'Olivia Expired', { created_at: day(20), sent_at: day(20), valid_until: dateOnly(-5) }),
    q('DCF-100010', 'Noah Signed', { status: 'accepted', created_at: day(12), sent_at: day(12), response: acc(9), view_count: 4, first_viewed_at: day(11), last_viewed_at: day(9) }),
    q('DCF-100011', 'Emma Phoned', { status: 'accepted', created_at: day(8), sent_at: day(8), response: acc(5, { source: 'staff', method: 'phone', recorded_by: 'dave@example.com' }) }),
    q('DCF-100012', 'Jack Declined', { status: 'declined', created_at: day(11), sent_at: day(11), response: { decision: 'declined', reason: 'Too expensive', respondedAt: day(7) } }),
    q('DCF-100013', 'Ava Old Decline', { status: 'declined', created_at: day(27), sent_at: day(27), response: { decision: 'declined', reason: '', respondedAt: day(25) } }),
    q('DCF-100014', 'Lucas Old Win', { status: 'accepted', created_at: day(45), sent_at: day(45), response: acc(40) }),
    q('DCF-100015', 'Mia Hidden', { hidden: true, created_at: day(6), sent_at: day(6), view_count: 3, first_viewed_at: day(5), last_viewed_at: day(1) }),
    q('DCF-100016', 'Ethan Keen', { created_at: day(2), sent_at: day(2), valid_until: dateOnly(12), view_count: 5, first_viewed_at: day(2), last_viewed_at: day(0.1) }),
    q('DCF-100017', 'Isla Cold Expiring', { created_at: day(12), sent_at: day(12), valid_until: dateOnly(2), line_items: LI(['Laminate', '48', '12.99']) }),
    q('DCF-100018', 'Ryan Second Draft', { status: 'draft', sent_at: null, created_at: day(3) }),
    q('DCF-100019', 'Zoe Recent Win', { status: 'accepted', created_at: day(4), sent_at: day(4), response: acc(3), line_items: LI(['Herringbone oak', '30', '89']) }),
    q('DCF-100020', 'Finn Recent Loss', { status: 'declined', created_at: day(3), sent_at: day(3), response: { decision: 'declined', reason: 'Went elsewhere', respondedAt: day(2) } }),
  ];
}
const SETTINGS = { id: 1, business_name: 'Floors for Living', phone: '01632 960123', email: 'hello@example.com', address: '1 High Street', default_terms: 'Price valid for 14 days.', quote_valid_days: 14, reminder_days: 5 };
function jwt(email) { const b = o => Buffer.from(JSON.stringify(o)).toString('base64url'); return b({ alg: 'none' }) + '.' + b({ email, sub: 'u1' }) + '.x'; }

async function start({ root, port, quotes, viewport = { width: 1440, height: 900 }, theme, nav, clock = true, session = true, reducedMotion }) {
  const srv = http.createServer((req, res) => {
    const u = req.url.split('?')[0]; let f = path.join(root, decodeURIComponent(u));
    if (u.startsWith('/q/') || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(root, 'index.html');
    res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.woff2': 'font/woff2' }[path.extname(f)] || 'application/octet-stream');
    fs.createReadStream(f).pipe(res);
  }).listen(port);
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}).catch(() => chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }));
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: reducedMotion || 'no-preference', hasTouch: viewport.width < 800, isMobile: viewport.width < 800 });
  const store = { quotes: JSON.parse(JSON.stringify(quotes)), settings: { ...SETTINGS }, calls: [] };
  const page = await ctx.newPage();
  page._u = pth => 'http://localhost:' + port + pth;
  const errors = []; page.on('pageerror', e => errors.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  if (clock) await page.clock.setFixedTime(NOW);
  await ctx.addInitScript(([sess, theme, nav, t]) => {
    try {
      if (sess) localStorage.setItem('dcf.session', JSON.stringify({ access_token: sess, refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 99999, email: 'dave@example.com' }));
      if (theme) localStorage.setItem('dcf.theme', theme);
      if (nav) localStorage.setItem('dcf.sidebar', nav);
    } catch (e) {}
  }, [session ? jwt('dave@example.com') : '', theme || '', nav || '', 0]);
  await page.route('**/*', async route => {
    const url = route.request().url(); const m = route.request().method();
    if (url.startsWith('http://localhost:' + port)) return route.continue();
    if (url.includes('.supabase.co/rest/v1/')) {
      const rest = url.split('/rest/v1/')[1];
      const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
      if (rest.startsWith('rpc/')) {
        const fn = rest.slice(4); const body = JSON.parse(route.request().postData() || '{}'); store.calls.push({ fn, body });
        if (fn === 'get_business') return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ business_name: 'Floors for Living', phone: '01632 960123', email: 'hello@example.com', address: '1 High Street' }) });
        if (fn === 'get_quote') { const r = store.quotes.find(x => x.short_slug === body.p_slug); return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(r || null) }); }
        return route.fulfill({ status: 200, headers: cors, body: 'null' });
      }
      if (rest.startsWith('settings')) return route.fulfill({ status: 200, headers: cors, body: JSON.stringify([store.settings]) });
      if (rest.startsWith('quote_signatures')) return route.fulfill({ status: 200, headers: cors, body: JSON.stringify([{ full_name: 'Noah Signed', signature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHMDz1wAAAABJRU5ErkJggg==', signed_at: day(9) }]) });
      if (rest.startsWith('quotes')) {
        const ref = (rest.match(/ref=eq\.([^&]+)/) || [])[1];
        if (m === 'GET') {
          let rows = store.quotes; if (ref) rows = rows.filter(x => x.ref === decodeURIComponent(ref));
          return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(rows) });
        }
        if (m === 'PATCH') {
          const body = JSON.parse(route.request().postData() || '{}'); const r = store.quotes.find(x => x.ref === decodeURIComponent(ref));
          if (r) Object.assign(r, body); store.calls.push({ patch: ref, body });
          return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(r ? [r] : []) });
        }
        return route.fulfill({ status: 200, headers: cors, body: '[]' });
      }
      return route.fulfill({ status: 200, headers: cors, body: '[]' });
    }
    if (url.includes('.supabase.co/auth/')) return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: '{}' });
    return route.abort();
  });
  return { page, ctx, browser, store, errors, close: async () => { await browser.close(); srv.close(); } };
}
module.exports = { REPO, start, seed, NOW, day, dateOnly, q, SETTINGS };
