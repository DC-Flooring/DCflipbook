const { REPO, start, seed } = require('./h.js');
const fs = require('fs');
async function shoot(root, port, vw, vh, tag) {
  const t = await start({ root, port, quotes: seed(), viewport: { width: vw, height: vh }, session: false });
  const p = t.page; const shots = [];
  await p.goto(`http://localhost:${port}/q/slug100005`); await p.waitForSelector('#book'); await p.waitForTimeout(900);
  for (let i = 0; i < 6; i++) {
    await p.evaluate(i => document.querySelector('.dot[data-i="' + i + '"]').click(), i); await p.waitForTimeout(1400);
    shots.push(await p.screenshot());
  }
  // signing dialog step 1 and the zoom view
  await p.click('#signBtn'); await p.waitForSelector('.sg-modal'); await p.waitForTimeout(500); shots.push(await p.screenshot());
  await p.click('#sgClose'); await p.waitForTimeout(500);
  const zb = await p.$('#zoomBtn'); if (zb) { await zb.click(); await p.waitForSelector('.zv'); await p.waitForTimeout(500); shots.push(await p.screenshot()); await p.keyboard.press('Escape'); await p.waitForTimeout(400); }
  // the print layouts
  const print = await p.evaluate(() => { const q = { ref:'DCF-1', customerName:'Ann <b>Smith</b>', date:'2026-10-20', validUntil:'2026-12-01', notes:'Terms & conditions', shortSlug:'abc123', lineItems:[{product:'Oak', qty:'2', unitPrice:'10'},{product:'Fit', qty:'', unitPrice:'50'}] };
    return buildPrintHtml(q) + '\n=====\n' + buildPrintHtml(q, { business:{phone:'0123', email:'a@b.c', address:'X'}, brand:'FFL', signature:{ name:'Ann', signature:'data:image/png;base64,AAAA', signedAt:'2026-10-21T10:00:00Z' } }); });
  const errs = t.errors; await t.close();
  return { shots, print, errs };
}
(async () => {
  let bad = 0;
  for (const [vw, vh] of [[390, 844], [1440, 900]]) {
    const a = await shoot(process.env.OLD, 8221, vw, vh), b = await shoot(REPO, 8221, vw, vh);
    const same = a.shots.length === b.shots.length && a.shots.every((s, i) => s.equals(b.shots[i]));
    console.log(`${vw}px: ${a.shots.length} screens (6 pages, sign dialog, zoom view) pixel-identical: ${same}; print HTML identical: ${a.print === b.print}; errors: ${JSON.stringify(b.errs)}`);
    if (!same) { bad++; a.shots.forEach((s, i) => { if (!s.equals(b.shots[i])) console.log('  differs: screen', i); }); }
    if (a.print !== b.print) bad++;
  }
  console.log(bad ? 'BOOKLET CHANGED' : 'BOOKLET + PRINT UNCHANGED');
})().catch(e => { console.error(e); process.exit(1); });
