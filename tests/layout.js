/* Layout check: node tests/layout.js  -> horizontal overflow, elements outside the viewport, overlapping key elements */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const PORT = 3200, BASE = `http://localhost:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'whyme-layout-'));
const SIZES = [[360,640],[375,667],[390,844],[430,932],[844,390],[667,375],[1280,800]];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const KEY = 'whyme.game.v1';
/* per screen: inView = must be fully inside the viewport, hOnly = only horizontally (scrolling sections), apart = must not overlap each other */
const SCREENS = {
  landing: { inView: ['.title-art'], hOnly: ['#top h1, #top p, .scroll-hint'], apart: [['.title-art .tagline', '.scroll-hint']] },
  menuOpen: { hOnly: ['#modePills button', '#packPills button', '#packInfo', '#settings', '#playBtn', '#menuNote'],
    apart: [['#modePills', '#deckRow'], ['#deckRow', '#packInfo'], ['#packInfo', '#settings'], ['#settings', '#playBtn'], ['#modePills', '#packInfo']], each: '#packPills button' },
  menuClosed: { hOnly: ['#modePills button', '#packInfo', '#settings', '#playBtn'], apart: [['#modePills', '#packInfo'], ['#packInfo', '#settings'], ['#settings', '#playBtn']] },
  seal: { centred: '#sealPack', inView: ['#sealPack', '#sealHint', '#sealTap', '#gExit'], apart: [['#sealHint', '#sealPack'], ['#sealHint', '#gExit'], ['#gExit', '#sealPack'], ['#gExit', '#sealHint']] },
  game: { centred: '#card', fits: ['#cardText'], inView: ['#gExit', '#btnFailed', '#card', '#btnDone', '#btnInfo', '#gTimer'],
    apart: [['#btnFailed', '#card'], ['#btnDone', '#card'], ['#gExit', '#card'], ['#btnInfo', '#card'], ['#gTimer', '#card'], ['#btnInfo', '#btnDone'], ['#btnInfo', '#btnFailed img'], ['#gTimer', '#btnDone img'], ['#gExit', '#btnFailed img'], ['#gTimer', '#gExit']] },
  info: { inView: ['#infoText', '#infoClose'], apart: [['#infoText', '#infoClose']] },
  penalty: { inView: ['#card', '#cardText', '#penaltyDone', '#btnFailed', '#btnDone'], apart: [['#cardText', '#penaltyDone'], ['#btnFailed', '#card'], ['#btnDone', '#card']], within: [['#penaltyDone', '#card'], ['#cardText', '#card']] },
  end: { inView: ['#againBtn', '#menuBtn', '#endSum'], apart: [['#againBtn', '#menuBtn'], ['#endSum', '#againBtn']] },
};
async function check(p, name, spec) {
  const vs = p.viewportSize(), innerW = () => `${vs.width}x${vs.height}`;
  return p.evaluate(({ name, spec }) => {
    const W = innerWidth, H = innerHeight, out = [], T = 1;
    const vis = e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && !e.closest('[hidden]'); };
    const els = sel => [...document.querySelectorAll(sel)].filter(vis);
    const rect = sel => { const e = els(sel)[0]; return e && e.getBoundingClientRect(); };
    if (document.documentElement.scrollWidth > W + T) out.push(`horizontal overflow: scrollWidth ${document.documentElement.scrollWidth} > ${W}`);
    for (const sel of spec.inView || []) for (const e of els(sel)) { const r = e.getBoundingClientRect();
      if (r.left < -T || r.top < -T || r.right > W + T || r.bottom > H + T) out.push(`${sel} outside viewport [${r.left|0},${r.top|0},${r.right|0},${r.bottom|0}]`); }
    for (const sel of spec.hOnly || []) for (const e of els(sel)) { const r = e.getBoundingClientRect();
      if (r.left < -T || r.right > W + T) out.push(`${sel} outside viewport horizontally [${r.left|0}..${r.right|0}]`); }
    const ov = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > T && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > T;
    for (const [x, y] of spec.apart || []) { const a = rect(x), b = rect(y); if (a && b && ov(a, b)) out.push(`${x} overlaps ${y}`); }
    for (const [x, y] of spec.within || []) { const a = rect(x), b = rect(y); if (a && b && (a.left < b.left - T || a.right > b.right + T || a.top < b.top - T || a.bottom > b.bottom + T)) out.push(`${x} not inside ${y}`); }
    if (spec.centred) { const e = document.querySelector(spec.centred), r = e.getBoundingClientRect(), dx = (r.left + r.right) / 2 - W / 2, dy = (r.top + r.bottom) / 2 - H / 2;
      out.centre = `dx ${dx.toFixed(2)} dy ${dy.toFixed(2)} size ${Math.round(r.width)}x${Math.round(r.height)}`;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) out.push(`${spec.centred} off centre by ${dx.toFixed(1)}, ${dy.toFixed(1)} px`); }
    if (spec.fits) for (const sel of spec.fits) for (const e of els(sel)) if (e.scrollHeight > e.clientHeight + 2) out.push(`${sel} text clipped (${e.scrollHeight} > ${e.clientHeight})`);
    if (spec.each) { const rs = els(spec.each).map(e => e.getBoundingClientRect()); for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) if (ov(rs[i], rs[j])) out.push(`${spec.each} #${i} overlaps #${j}`); }
    return { out, centre: out.centre };
  }, { name, spec }).then(r => { if (r.centre) console.log(`${innerW()} ${name} centre: ${r.centre}`); return r.out; });
}
(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT, WHYME_DATA_DIR: DATA, ADMIN_PASSWORD: 'layout-check-only' }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await fetch(BASE + '/api/config'); break; } catch { await sleep(100); } }
  const browser = await chromium.launch(); let issues = 0; const shotDir = process.env.LAYOUT_SHOTS;
  try {
    for (const [w, h] of SIZES) {
      const touch = w < 1000;
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 2 });
      await ctx.addInitScript(() => localStorage.setItem('whyme.a2hs.never', 'true'));
      const p = await ctx.newPage(); const res = {};
      const run = async (name) => { res[name] = await check(p, name, SCREENS[name]); if (shotDir) { fs.mkdirSync(shotDir, { recursive: true }); await p.screenshot({ path: path.join(shotDir, `${w}x${h}-${name}.png`) }); } };
      await p.goto(BASE + '/'); await p.waitForSelector('#packPills button'); await sleep(1800); await run('landing');
      await p.locator('#menu').scrollIntoViewIfNeeded(); await p.click('#modePills button[data-mode=deck]'); await sleep(600); await run('menuOpen');
      await p.click('#modePills button[data-mode=random]'); await sleep(600); await run('menuClosed');
      await p.click('#modePills button[data-mode=deck]'); await sleep(400);
      await p.click('#playBtn'); await p.waitForSelector('#sealPack'); await sleep(4200); await run('seal');
      const edit = async f => { await p.evaluate(([k, f]) => { const g = JSON.parse(localStorage.getItem(k)); new Function('g', f)(g); localStorage.setItem(k, JSON.stringify(g)); }, [KEY, f]); await p.reload(); await p.waitForSelector('#game:not([hidden])'); await sleep(700); };
      await edit(`g.sealed=false; g.phase='front'; const c=g.deck[0]; c.text='Name three things in the room that are navy, then swap places with the person on your left.'; c.title='DUO CARD: Long title here'; c.info='A longer explanation of how this challenge works, so we can see the popup wrap properly on small screens.'; c.timeSeconds=30;`);
      await run('game');
      await p.click('#btnInfo'); await sleep(300); await run('info'); await p.click('#infoClose');
      await edit(`g.phase='penalty'; g.penalty='Drink 3 shots.'; g.penaltyReason='failed';`); await run('penalty');
      await edit(`g.phase='end'; g.index=g.deck.length; g.history=g.deck.map((c,i)=>({text:c.text, result:i%2?'done':'failed'}));`); await run('end');
      for (const [k, v] of Object.entries(res)) { console.log(`${w}x${h} ${k.padEnd(10)} ${v.length ? 'FAIL ' + v.join('; ') : 'ok'}`); issues += v.length; }
      await ctx.close();
    }
  } finally { await browser.close(); srv.kill(); }
  console.log(issues ? `${issues} layout issues` : 'no layout issues'); process.exit(issues ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
