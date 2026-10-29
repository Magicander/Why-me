// Media for v7 (landing snap, mode pills, admin mobile, bigger pack, drag to resolve). Own server on port 3300.
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const PORT = 3300, BASE = `http://localhost:${PORT}`, OUT = path.join(__dirname, '..', 'media');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'whyme-cap-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const INDICATOR = () => { addEventListener('DOMContentLoaded', () => {
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;z-index:99999;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(255,255,255,.35);border:3px solid rgba(0,48,135,.85);box-shadow:0 0 0 2px rgba(255,255,255,.8);pointer-events:none;opacity:0;transition:opacity .15s;left:-100px;top:-100px';
  document.body.appendChild(d);
  const mv = e => { d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px'; };
  addEventListener('pointermove', mv, true);
  addEventListener('pointerdown', e => { mv(e); d.style.opacity = 1; }, true);
  addEventListener('pointerup', () => setTimeout(() => d.style.opacity = 0, 250), true);
}); };
async function glide(p, from, to, ms) { const n = Math.max(2, Math.round(ms / 16)); for (let i = 1; i <= n; i++) { const t = i / n, e = t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2; await p.mouse.move(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e); await sleep(16); } }
const ctr = async (p, sel) => { const b = await p.locator(sel).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
const tp = (p, x) => p.evaluate(x => window.__whyme.tearPoint(x), x);
const toMp4 = (webm, mp4, ss) => { execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(ss), '-i', webm, '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]); fs.unlinkSync(webm); };
async function openGame(p) { await p.goto(BASE + '/'); await p.waitForSelector('#packPills button'); await p.evaluate(() => document.querySelector('#menu').scrollIntoView({ behavior: 'instant' })); await sleep(300); await p.click('#playBtn'); await p.waitForSelector('#sealPack'); await sleep(900); }
async function tear(p) { const a = await tp(p, 4); await p.mouse.move(a.x, a.y); await p.mouse.down(); for (let i = 1; i <= 12; i++) { const q = await tp(p, 4 + i * 7); await p.mouse.move(q.x, q.y); await sleep(20); } await p.mouse.up(); await p.waitForSelector('#seal', { state: 'hidden', timeout: 5000 }); await sleep(300); }
async function revealNonTimed(p) { for (let k = 0; k < 30; k++) { await p.click('#card', { position: { x: 40, y: 40 } }); await sleep(750); const c = await p.evaluate(() => { const g = window.__whyme.game; return g.deck[g.index]; }); if (!c.timeSeconds) return; await p.evaluate(() => { const g = window.__whyme.game; }); await p.click('#btnDone'); await sleep(500); } }
(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT, WHYME_DATA_DIR: DATA, ADMIN_PASSWORD: 'capture-only' }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await fetch(BASE + '/api/config'); break; } catch { await sleep(100); } }
  const browser = await chromium.launch(); const vp = { width: 390, height: 844 };
  try {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2 });
    await ctx.addInitScript(() => localStorage.setItem('whyme.a2hs.never', 'true')); await ctx.addInitScript(INDICATOR);
    const p = await ctx.newPage(); const shot = n => p.screenshot({ path: path.join(OUT, n + '-390x844.png') });
    await p.goto(BASE + '/'); await sleep(250); await shot('31-landing-title-first-paint');
    await p.mouse.move(200, 400); await p.mouse.wheel(0, 140); await sleep(1300); await shot('32-landing-how-to-play-snapped');
    await p.evaluate(() => document.querySelector('#menu').scrollIntoView({ behavior: 'instant' })); await sleep(400);
    await p.click('#modePills button[data-mode=random]'); await sleep(600); await p.evaluate(() => document.querySelector('#menu').scrollIntoView({ behavior: 'instant' })); await sleep(300); await shot('33-menu-mode-random-selected');
    await p.click('#modePills button[data-mode=deck]'); await sleep(400);
    await p.click('#playBtn'); await p.waitForSelector('#sealPack'); await sleep(1000); await shot('34-seal-bigger-pack');
    { const a = await tp(p, 4); await p.mouse.move(a.x, a.y); await p.mouse.down(); for (let i = 1; i <= 7; i++) { const q = await tp(p, 4 + i * 8); await p.mouse.move(q.x, q.y); await sleep(25); } await sleep(150); await shot('35-seal-opening-cards-inside'); await p.mouse.up(); }
    await p.waitForSelector('#seal', { state: 'hidden', timeout: 5000 }).catch(() => {}); await sleep(400);
    await revealNonTimed(p);
    { const a = await ctr(p, '#cardKicker'), b = await ctr(p, '#btnDone'); await p.mouse.move(a.x, a.y); await p.mouse.down(); await glide(p, a, { x: a.x + (b.x - a.x) * .5, y: a.y + (b.y - a.y) * .5 }, 400); await sleep(100); await shot('36-card-mid-drag-to-done'); await p.mouse.up(); await sleep(700); }
    await p.setViewportSize({ width: 844, height: 390 }); await sleep(500); await revealNonTimed(p);
    { const a = await ctr(p, '#cardKicker'), b = await ctr(p, '#btnFailed'); await p.mouse.move(a.x, a.y); await p.mouse.down(); await glide(p, a, { x: a.x + (b.x - a.x) * .5, y: a.y }, 400); await sleep(100); await p.screenshot({ path: path.join(OUT, '37-card-mid-drag-to-failed-844x390.png') }); await p.mouse.up(); await sleep(600); }
    await ctx.close();
    // admin on mobile
    const ac = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 }); const a = await ac.newPage();
    const ashot = n => a.screenshot({ path: path.join(OUT, n + '-375x812.png') });
    await a.goto(BASE + '/admin'); await a.waitForSelector('#pw'); await sleep(300); await ashot('38-admin-login');
    await a.fill('#pw', 'capture-only'); await a.click('#loginForm button'); await a.waitForSelector('#app:not([hidden])'); await sleep(500); await ashot('39-admin-pack-list');
    await a.click('#packList li button'); await a.waitForSelector('#pName'); await sleep(400); await ashot('40-admin-pack-editor');
    await a.evaluate(() => document.querySelector('.a-import').scrollIntoView({ behavior: 'instant' })); await sleep(300); await ashot('41-admin-import-and-cards');
    await a.evaluate(() => document.querySelector('#cardRows tr:nth-child(2)').scrollIntoView({ behavior: 'instant', block: 'center' })); await sleep(300); await ashot('42-admin-card-fields');
    const ov = await a.evaluate(() => document.documentElement.scrollWidth > innerWidth); console.log('admin horizontal overflow:', ov);
    await ac.close();
    // videos
    const vdir = fs.mkdtempSync(path.join(os.tmpdir(), 'whyme-vid-'));
    const v1 = await browser.newContext({ viewport: vp, recordVideo: { dir: vdir, size: vp } });
    await v1.addInitScript(() => localStorage.setItem('whyme.a2hs.never', 'true')); await v1.addInitScript(INDICATOR);
    let q = await v1.newPage(); await openGame(q); await tear(q); await sleep(5000);
    for (let r = 0; r < 3; r++) { await revealNonTimed(q); await sleep(500); const a1 = await ctr(q, '#cardKicker'), tgt = await ctr(q, r === 1 ? '#btnFailed' : '#btnDone');
      await q.mouse.move(a1.x, a1.y); await q.mouse.down(); await glide(q, a1, { x: a1.x + (tgt.x - a1.x) * .8, y: a1.y + (tgt.y - a1.y) * .8 }, 700); await sleep(150); await q.mouse.up(); await sleep(900);
      if (r === 1) { await q.click('#penaltyDone').catch(() => {}); await sleep(600); } }
    let w = await q.video().path(); await v1.close(); toMp4(w, path.join(OUT, 'drag-to-resolve-demo.mp4'), 5.5);
    const v2 = await browser.newContext({ viewport: vp, recordVideo: { dir: vdir, size: vp } });
    await v2.addInitScript(() => localStorage.setItem('whyme.a2hs.never', 'true'));
    q = await v2.newPage(); await q.goto(BASE + '/'); await sleep(1500); await q.mouse.move(200, 400);
    for (const d of [140, 120, 120, -120, -140]) { await q.mouse.wheel(0, d); await sleep(1600); }
    w = await q.video().path(); await v2.close(); toMp4(w, path.join(OUT, 'section-snap-demo.mp4'), 1);
  } finally { await browser.close(); srv.kill(); }
})();
