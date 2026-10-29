// Media for the deck menu + interactive swipe-to-open. Starts its own server on port 3300.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const PORT = 3300, BASE = `http://localhost:${PORT}`, OUT = path.join(__dirname, '..', 'media');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'whyme-cap-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
/* visible touch-indicator circle that follows the pointer (capture only, not part of the app) */
const INDICATOR = () => { addEventListener('DOMContentLoaded', () => {
  const d = document.createElement('div'); d.id = '__touch';
  d.style.cssText = 'position:fixed;z-index:99999;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(255,255,255,.35);border:3px solid rgba(0,48,135,.85);box-shadow:0 0 0 2px rgba(255,255,255,.8);pointer-events:none;opacity:0;transition:opacity .15s,transform .15s;left:-100px;top:-100px';
  document.body.appendChild(d);
  const mv = e => { d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px'; };
  addEventListener('pointermove', mv, true);
  addEventListener('pointerdown', e => { mv(e); d.style.opacity = 1; d.style.transform = 'scale(.85)'; }, true);
  addEventListener('pointerup', () => { d.style.transform = 'scale(1)'; setTimeout(() => d.style.opacity = 0, 250); }, true);
}); };
async function glide(p, from, to, ms, down) {
  const n = Math.max(2, Math.round(ms / 16));
  for (let i = 1; i <= n; i++) { const t = i / n, e = t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2; await p.mouse.move(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e); await sleep(16); }
}
const tp = (p, x) => p.evaluate(x => window.__whyme.tearPoint(x), x);
const center = async (p, sel) => { const b = await p.locator(sel).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT, WHYME_DATA_DIR: DATA, ADMIN_PASSWORD: 'capture-only' }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await fetch(BASE + '/api/config'); break; } catch { await sleep(100); } }
  const browser = await chromium.launch();
  const vp = { width: 390, height: 844 };
  try {
    // stills
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2 });
    await ctx.addInitScript(() => localStorage.setItem('whyme.a2hs.never', 'true')); await ctx.addInitScript(INDICATOR);
    const p = await ctx.newPage(); const shot = n => p.screenshot({ path: path.join(OUT, n + '-390x844.png') });
    await p.goto(BASE + '/'); await p.waitForSelector('#packPills button');
    await p.evaluate(() => document.querySelector('#menu').scrollIntoView()); await sleep(300);
    await p.click('#modePills button[data-mode=random]'); await sleep(700); await p.evaluate(() => document.querySelector('#menu').scrollIntoView()); await sleep(200); await shot('24-menu-mode-random');
    await p.click('#modePills button[data-mode=deck]'); await sleep(700); await p.click('#packPills button[data-id=legless-lizard]'); await sleep(500); await shot('25-menu-mode-deck');
    await p.click('#playBtn'); await p.waitForSelector('#sealPack'); await sleep(1200); await shot('26-seal-sealed');
    await p.setViewportSize({ width: 844, height: 390 }); await sleep(600); await p.screenshot({ path: path.join(OUT, '26-seal-sealed-844x390.png') });
    await p.setViewportSize(vp); await sleep(600);
    let a = await tp(p, 4); await p.mouse.move(a.x, a.y); await p.mouse.down(); await glide(p, a, await tp(p, 48), 450); await sleep(120); await shot('27-seal-mid-swipe');
    await glide(p, await tp(p, 48), await tp(p, 85), 250); await p.mouse.up();
    await p.waitForFunction(() => document.querySelector('#sealPack').closest('.seal').dataset.phase === 'slide' || document.querySelector('#seal').hidden, null, { timeout: 4000 }).catch(() => {});
    await sleep(380); await shot('28-seal-wrapper-sliding');
    await p.waitForSelector('#seal', { state: 'hidden', timeout: 5000 }); await sleep(600); await shot('29-pile-ready');
    const c = await center(p, '#card'); await p.mouse.click(c.x, c.y); await sleep(900); await shot('30-first-card-flipped');
    await ctx.close();
    // video
    const vdir = fs.mkdtempSync(path.join(os.tmpdir(), 'whyme-vid-'));
    const vctx = await browser.newContext({ viewport: vp, recordVideo: { dir: vdir, size: vp } });
    await vctx.addInitScript(() => localStorage.setItem('whyme.a2hs.never', 'true')); await vctx.addInitScript(INDICATOR);
    const v = await vctx.newPage(); await v.goto(BASE + '/'); await v.waitForSelector('#packPills button'); await sleep(1500);
    await v.evaluate(() => document.querySelector('#menu').scrollIntoView({ behavior: 'smooth' })); await sleep(1200);
    let pos = { x: 195, y: 600 }; await v.mouse.move(pos.x, pos.y);
    const tap = async sel => { const t = await center(v, sel); await glide(v, pos, t, 450); pos = t; await sleep(150); await v.mouse.down(); await sleep(90); await v.mouse.up(); await sleep(700); };
    await tap('#modePills button[data-mode=random]'); await tap('#modePills button[data-mode=own]'); await tap('#modePills button[data-mode=deck]');
    await tap('#packPills button[data-id=eight-legged-octopus]'); await tap('#packPills button[data-id=legless-lizard]');
    await tap('#playBtn'); await v.waitForSelector('#sealPack'); await sleep(2200);
    a = await tp(v, 4); await glide(v, pos, a, 500); await sleep(200); await v.mouse.down();
    await glide(v, a, await tp(v, 30), 500); await sleep(250); await glide(v, await tp(v, 30), await tp(v, 85), 450); await v.mouse.up(); pos = await tp(v, 85);
    await v.waitForSelector('#seal', { state: 'hidden', timeout: 5000 }); await sleep(900);
    await tap('#card'); await sleep(2000);
    const vid = await v.video().path(); await vctx.close();
    const mp4 = path.join(OUT, 'decks-swipe-demo.mp4');
    require('child_process').execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '6', '-i', vid, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-movflags', '+faststart', mp4]);
    console.log('saved', mp4);
  } finally { await browser.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
