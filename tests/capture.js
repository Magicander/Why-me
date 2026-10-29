/* Captures media/*.png and media/demo.webm against a running server (default http://localhost:3000).
   Admin password is read from ADMIN_PASSWORD or data/initial-admin-password.txt and never printed. */
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const BASE = process.env.BASE || 'http://localhost:3000';
const MEDIA = path.join(__dirname, '..', 'media');
const PW = process.env.ADMIN_PASSWORD || fs.readFileSync(path.join(__dirname, '..', 'data', 'initial-admin-password.txt'), 'utf8').trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(MEDIA, { recursive: true });

async function shots(b, w, h) {
  const tag = `${w}x${h}`;
  const ctx = await b.newContext({ ...devices['iPhone 13'], viewport: { width: w, height: h } });
  const p = await ctx.newPage(); const s = n => p.screenshot({ path: path.join(MEDIA, `${n}-${tag}.png`) });
  await p.goto(BASE + '/'); await p.waitForSelector('#packPills button'); await sleep(3200); await s('01-landing-title');
  await p.locator('#rules').scrollIntoViewIfNeeded(); await sleep(700); await s('02-rules');
  await p.click('#packPills button[data-id=legless-lizard]'); await p.locator('#menu').scrollIntoViewIfNeeded(); await sleep(700); await s('03-menu');
  await p.locator('#contact').scrollIntoViewIfNeeded(); await sleep(700); await s('04-contact');
  await p.click('#playBtn'); await sleep(500); await s('05-a2hs-prompt');
  await p.click('#a2hsSkip'); await sleep(900); await s('06-game-facedown');
  const g = () => p.evaluate(() => window.__whyme.game);
  for (let i = 0; i < 15; i++) { await p.click('#card', { position: { x: 40, y: 40 } }); await sleep(800); const c = (await g()).deck[(await g()).index]; if (c.info || i === 14) break; await p.click('#btnDone'); await sleep(500); }
  await s('07-revealed-card');
  if (!(await p.isDisabled('#btnInfo'))) { await p.click('#btnInfo'); await sleep(300); await s('08-info-popup'); await p.click('#infoClose'); }
  if ((await g()).phase === 'front') { await p.click('#btnFailed'); await sleep(700); await s('09-penalty'); await p.click('#penaltyDone'); await sleep(500); }
  for (let i = 0; i < 20 && (await g()).phase !== 'end'; i++) { await p.click('#card', { position: { x: 40, y: 40 } }); await sleep(350); await p.click('#btnDone'); await sleep(250); }
  await sleep(600); await s('10-end-screen');
  const a = await ctx.newPage(); await a.goto(BASE + '/admin'); await a.fill('#pw', PW); await a.click('#loginForm button');
  await a.waitForSelector('#app:not([hidden])'); await a.click('#packList li >> nth=0'); await sleep(500);
  await a.screenshot({ path: path.join(MEDIA, `11-admin-${tag}.png`) });
  await ctx.close();
}

async function video(b) {
  const ctx = await b.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, recordVideo: { dir: MEDIA, size: { width: 390, height: 844 } } });
  const p = await ctx.newPage(); await p.clock.install();
  const g = () => p.evaluate(() => window.__whyme.game);
  const scroll = async (sel, ms = 1600) => { await p.evaluate(s => document.querySelector(s).scrollIntoView({ behavior: 'smooth' }), sel); await sleep(ms); };
  await p.goto(BASE + '/'); await sleep(3500);
  await scroll('#rules', 2500); await scroll('#menu', 1500); await scroll('#contact', 2000); await scroll('#menu', 1500);
  await p.click('#packPills button[data-id=legless-lizard]'); await sleep(900);
  await p.click('#packPills button[data-id=eight-legged-octopus]'); await sleep(1200);
  await p.click('#playBtn'); await sleep(1800); await p.click('#a2hsSkip'); await sleep(1500);
  let expired = false, failedOnce = false, refreshed = false;
  while ((await g()).phase !== 'end') {
    await p.click('#card', { position: { x: 40, y: 40 } }); await sleep(1600);
    const st = await g(), c = st.deck[st.index];
    if (!refreshed && st.index === 1) { await p.reload(); await p.waitForSelector('#game:not([hidden])'); await sleep(1800); refreshed = true; }
    if (c.timeSeconds && !expired) {
      await p.click('#timerStart'); await sleep(1500);
      await p.clock.fastForward(Math.max(0, c.timeSeconds * 1000 - 4500)); await sleep(5000);
      expired = true; await sleep(1200); await p.click('#penaltyDone'); await sleep(900);
    } else if (!c.timeSeconds && !failedOnce) {
      await p.click('#btnFailed'); await sleep(2200); await p.click('#penaltyDone'); await sleep(900); failedOnce = true;
    } else { if (c.timeSeconds) { await p.click('#timerStart'); await sleep(1500); } await p.click('#btnDone'); await sleep(900); }
  }
  await sleep(3500);
  const v = p.video(); await ctx.close(); const f = await v.path(); fs.renameSync(f, path.join(MEDIA, 'demo.webm'));
}

(async () => {
  const b = await chromium.launch();
  await shots(b, 390, 844); await shots(b, 844, 390); await video(b);
  await b.close(); console.log('done');
})();
