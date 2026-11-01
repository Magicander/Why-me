/* Card text audit: every card of every pack, at every size, with/without timer and info,
   must fit on the card (no clipped title/body, no word wider than the panel). node tests/cards.js
   Starts its own server on port 3400. CARD_SHOTS=dir saves a shot of the worst cards. */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const PORT = 3400, BASE = `http://localhost:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'whyme-cards-'));
const SIZES = [[320, 568], [360, 640], [375, 667], [390, 844], [430, 932], [844, 390], [667, 375], [568, 320], [1280, 800]];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'seed', 'packs.json'), 'utf8'));
const packs = Array.isArray(seed) ? seed : seed.packs;
const VARIANTS = [{ name: 'plain' }, { name: 'timer+info', timeSeconds: 90, info: 'Explanation.' }];
(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT, WHYME_DATA_DIR: DATA, ADMIN_PASSWORD: 'cards-check-only' }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await fetch(BASE + '/api/config'); break; } catch { await sleep(100); } }
  const browser = await chromium.launch(); const bad = []; let checked = 0;
  const cards = packs.flatMap(p => p.cards.map(c => ({ ...c, pack: p.id })));
  cards.push({ id: 'own-long', pack: 'own', text: 'Own card at the maximum length: ' + 'tell everyone a story about the last time you laughed so hard that you cried, and do it with voices. '.repeat(5).slice(0, 460) });
  cards.push({ id: 'longword', pack: 'own', title: 'Supercalifragilisticexpialidocious', text: 'Pneumonoultramicroscopicsilicovolcanoconiosis is a word, say it three times fast.' });
  try {
    for (const [w, h] of SIZES) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      await ctx.addInitScript(() => localStorage.setItem('whyme.a2hs.never', 'true'));
      const p = await ctx.newPage(); await p.goto(BASE + '/'); await p.waitForSelector('#packPills button');
      await p.evaluate(() => document.querySelector('#menu').scrollIntoView({ behavior: 'instant' })); await p.click('#playBtn'); await p.waitForSelector('#sealPack');
      await p.evaluate(() => { const g = window.__whyme.game; g.sealed = false; g.phase = 'front'; g.index = 0; });
      for (const c of cards) for (const v of [...VARIANTS, { name: 'penalty' }]) {
        const r = await p.evaluate(([c, v]) => {
          const g = window.__whyme.game, card = { id: c.id, text: c.text };
          if (c.title) card.title = c.title; if (c.duo) card.duo = true;
          if (v.timeSeconds) card.timeSeconds = v.timeSeconds; if (v.info) card.info = v.info;
          g.deck = [card]; g.index = 0; g.sealed = false;
          if (v.name === 'penalty') { g.phase = 'penalty'; g.penalty = c.text; g.penaltyReason = 'pass'; g.timer = null; }
          else { g.phase = 'front'; g.penalty = null; g.timer = card.timeSeconds ? { total: 9e4, remaining: 9e4, running: false, endsAt: 0 } : null; }
          window.__whyme.render(false, false, true);
          const panel = document.querySelector('.front-panel'), out = [];
          if (panel.scrollHeight > panel.clientHeight + 1) out.push(`panel overflow ${panel.scrollHeight}>${panel.clientHeight}`);
          for (const s of ['#cardKicker', '#cardTitle', '#cardText', '#timerStart', '#penaltyDone']) {
            const e = document.querySelector(s); if (!e || e.hidden || !e.offsetParent) continue;
            if (e.scrollHeight > e.clientHeight + 1) out.push(`${s} clipped vertically ${e.scrollHeight}>${e.clientHeight}`);
            if (e.scrollWidth > e.clientWidth + 1) out.push(`${s} word too wide ${e.scrollWidth}>${e.clientWidth}`);
            if (e.offsetTop < 0 || e.offsetTop + e.offsetHeight > panel.clientHeight + 1 || e.offsetLeft < 0 || e.offsetLeft + e.offsetWidth > panel.clientWidth + 1) out.push(`${s} outside panel`);
          }
          const cs = getComputedStyle(document.querySelector('#cardText')); if (parseFloat(cs.fontSize) < 10.5) out.push('font below 10.5px');
          return out;
        }, [c, v]);
        checked++;
        if (r.length) bad.push(`${w}x${h} ${c.pack}/${c.id} [${v.name}]: ${r.join('; ')}`);
      }
      await ctx.close();
    }
  } finally { await browser.close(); srv.kill(); }
  for (const b of bad) console.log('FAIL ' + b);
  console.log(`${checked} card renders checked, ${bad.length} clipped`); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
