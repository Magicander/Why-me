// v8 media: bigger pack (portrait + landscape) and the longest cards. ROOT=<checkout> TAG=before|after PACK=1
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = process.env.ROOT || path.join(__dirname, '..'), TAG = process.env.TAG || 'after', PORT = 3500, BASE = `http://localhost:${PORT}`;
const OUT = path.join(__dirname, '..', 'media'), DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'whyme-v8-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'seed', 'packs.json'), 'utf8')); const packs = Array.isArray(seed) ? seed : seed.packs;
const find = id => packs.flatMap(p => p.cards).find(c => c.id === id);
const SHOTS = [['45', 'll13', 390, 844, true], ['46', 'eo01', 390, 844, true], ['47', 'll12', 844, 390, true], ['48', 'eo11', 360, 640, false]];
(async () => {
  const srv = spawn(process.execPath, [path.join(ROOT, 'server.js')], { cwd: ROOT, env: { ...process.env, PORT, WHYME_DATA_DIR: DATA, ADMIN_PASSWORD: 'capture-only' }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await fetch(BASE + '/api/config'); break; } catch { await sleep(100); } }
  const browser = await chromium.launch();
  const start = async (w, h) => { const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 }); await ctx.addInitScript(() => localStorage.setItem('whyme.a2hs.never', 'true'));
    const p = await ctx.newPage(); await p.goto(BASE + '/'); await p.waitForSelector('#packPills button'); await p.evaluate(() => document.querySelector('#menu').scrollIntoView({ behavior: 'instant' })); await sleep(300); await p.click('#playBtn'); await p.waitForSelector('#sealPack'); await sleep(1200); return [ctx, p]; };
  try {
    if (process.env.PACK) for (const [n, w, h] of [['43', 390, 844], ['44', 844, 390]]) { const [ctx, p] = await start(w, h); await p.screenshot({ path: path.join(OUT, `${n}-seal-bigger-pack-v8-${w}x${h}.png`) }); await ctx.close(); }
    for (const [n, id, w, h, timer] of SHOTS) {
      const [ctx, p] = await start(w, h); const c = find(id);
      await p.evaluate(([c, timer]) => { const k = 'whyme.game.v1', g = JSON.parse(localStorage.getItem(k)); const card = { id: c.id, text: c.text }; if (c.title) card.title = c.title; if (c.duo) card.duo = true; if (timer) { card.timeSeconds = c.timeSeconds || 60; card.info = c.info || 'Explanation.'; }
        g.deck = [card]; g.index = 0; g.sealed = false; g.phase = 'front'; g.timer = timer ? { total: 6e4, remaining: 6e4, running: false, endsAt: 0 } : null; localStorage.setItem(k, JSON.stringify(g)); }, [c, timer]);
      await p.reload(); await p.waitForSelector('#game:not([hidden])'); await sleep(900);
      await p.screenshot({ path: path.join(OUT, `${n}-card-${id}-${TAG}-${w}x${h}.png`) }); await ctx.close();
    }
  } finally { await browser.close(); srv.kill(); }
})();
