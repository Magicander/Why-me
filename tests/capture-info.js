/* Captures the info ("i") button demo: two landscape screenshots and media/info-button-demo.mp4 */
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const BASE = process.env.BASE || 'http://localhost:3000', MEDIA = path.join(__dirname, '..', 'media');
const sleep = ms => new Promise(r => setTimeout(r, ms)); const VP = { width: 844, height: 390 };
(async () => {
  const b = await chromium.launch();
  // 1) play a real Legless Lizard game until the card with info + timer (ll02) is on top, face down
  const prep = await b.newContext({ ...devices['iPhone 13'], viewport: VP }); const p = await prep.newPage();
  await p.goto(BASE + '/'); await p.waitForSelector('#packPills button');
  await p.click('#packPills button[data-id=legless-lizard]'); await p.click('#playBtn');
  if (await p.isVisible('#a2hs')) await p.click('#a2hsNever');
  await p.waitForSelector('#game:not([hidden])');
  for (let i = 0; i < 24; i++) {
    const g = await p.evaluate(() => window.__whyme.game); if (g.deck[g.index].id === 'll02') break;
    await p.click('#card', { position: { x: 40, y: 40 } }); await sleep(250); await p.click('#btnDone'); await sleep(150);
  }
  const ls = await p.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage))));
  await prep.close();
  // 2) record: same game state restored from localStorage
  const ctx = await b.newContext({ ...devices['iPhone 13'], viewport: VP, recordVideo: { dir: MEDIA, size: VP } });
  await ctx.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { for (const [k, v] of Object.entries(JSON.parse(s))) localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, ls);
  const v = await ctx.newPage(); await v.goto(BASE + '/'); await v.waitForSelector('#game:not([hidden])'); await sleep(1200);
  await v.click('#card', { position: { x: 40, y: 40 } }); await sleep(1500);
  await v.screenshot({ path: path.join(MEDIA, '13-info-before-tap-844x390.png') });
  await v.click('#btnInfo'); await sleep(2600);
  await v.screenshot({ path: path.join(MEDIA, '14-info-shown-844x390.png') });
  await sleep(1200); await v.click('#infoClose'); await sleep(1800);
  await v.click('#timerStart'); await sleep(2200);
  const vid = v.video(); await ctx.close(); await b.close();
  const webm = await vid.path(), mp4 = path.join(MEDIA, 'info-button-demo.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]);
  fs.unlinkSync(webm); console.log('done');
})();
