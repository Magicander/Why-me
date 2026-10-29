/* End-to-end tests: node tests/e2e.js  (starts its own server on a temp data dir) */
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const PORT = 3100, BASE = `http://localhost:${PORT}`;
const PW = crypto.randomBytes(12).toString('hex');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'whyme-test-'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
/* drag along the tear line of the sealed deck, from x0 % to x1 % of the pack width (works in rotated portrait too) */
async function swipe(p, x0, x1, { touch = false, steps = 12 } = {}) {
  await p.waitForSelector('#sealPack'); await sleep(500);
  const pts = []; for (let i = 0; i <= steps; i++) pts.push(await p.evaluate(x => window.__whyme.tearPoint(x), x0 + (x1 - x0) * i / steps));
  if (touch) {
    const cdp = await p.context().newCDPSession(p);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pts[0]] });
    for (const q of pts.slice(1)) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [q] }); await sleep(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach();
  } else {
    await p.mouse.move(pts[0].x, pts[0].y); await p.mouse.down();
    for (const q of pts.slice(1)) { await p.mouse.move(q.x, q.y); await sleep(16); }
    await p.mouse.up();
  }
}
async function openSeal(p, opts) { await swipe(p, 4, 80, opts); await p.waitForSelector('#seal', { state: 'hidden', timeout: 4000 }); }
const centre = (p, sel) => p.evaluate(sel => { const r = document.querySelector(sel).getBoundingClientRect(); return { dx: (r.left + r.right) / 2 - innerWidth / 2, dy: (r.top + r.bottom) / 2 - innerHeight / 2, w: r.width, h: r.height }; }, sel);
/* drag the revealed card from its centre toward an edge label, `frac` of the way (screen coords, so it works rotated) */
async function dragCard(p, target, frac = .8, { touch = false, steps = 14, hold } = {}) {
  const [a, b] = await p.evaluate(t => [document.querySelector('#cardKicker'), document.querySelector(t)].map(e => { const r = e.getBoundingClientRect(); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; }), target);
  const s0 = { x: a.x, y: a.y + 0 }, pts = []; for (let i = 0; i <= steps; i++) pts.push({ x: s0.x + (b.x - s0.x) * frac * i / steps, y: s0.y + (b.y - s0.y) * frac * i / steps });
  if (touch) {
    const cdp = await p.context().newCDPSession(p);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pts[0]] });
    for (const q of pts.slice(1)) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [q] }); await sleep(20); }
    if (hold) await hold();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach();
  } else {
    await p.mouse.move(pts[0].x, pts[0].y); await p.mouse.down();
    for (const q of pts.slice(1)) { await p.mouse.move(q.x, q.y); await sleep(20); }
    if (hold) await hold();
    await p.mouse.up();
  }
  await sleep(450);
}
const mode = (p, m) => p.click(`#modePills button[data-mode=${m}]`);

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT, WHYME_DATA_DIR: DATA, ADMIN_PASSWORD: PW }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await fetch(BASE + '/api/config'); break; } catch { await sleep(100); } }
  const browser = await chromium.launch();
  const errors = [];
  const mk = async (vp) => { const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: vp }); const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(e.message)); return { ctx, p }; };
  try {
    console.log('Admin');
    const { ctx: actx, p: a } = await mk({ width: 1280, height: 860 });
    await a.goto(BASE + '/admin');
    await a.fill('#pw', 'wrong-password'); await a.click('#loginForm button');
    await a.waitForFunction(() => document.querySelector('#loginMsg').textContent.length > 0);
    ok(!(await a.isVisible('#app')), 'wrong password rejected');
    await a.fill('#pw', PW); await a.click('#loginForm button');
    await a.waitForSelector('#app:not([hidden])'); ok(true, 'login works');
    ok((await a.locator('#packList li').count()) >= 2, 'seed packs listed');
    await a.click('#newPack'); await a.waitForSelector('#pName');
    await a.fill('#pName', 'Test Pack'); await a.fill('#pDesc', 'Pack made by the test.'); await a.check('#pPub');
    await a.click('#addCard'); await a.locator('#cardRows tr .c-text').last().fill('Clap three times.');
    await a.click('#packForm button[type=submit]'); await a.waitForFunction(() => /Saved/.test(document.querySelector('#saveMsg').textContent));
    ok(true, 'pack created and saved');
    const png = path.join(DATA, 't.png');
    fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));
    await a.setInputFiles('#pImgFile', png); await a.waitForFunction(() => /uploaded/.test(document.querySelector('#saveMsg').textContent));
    ok((await a.getAttribute('#pImg', 'src')).startsWith('/uploads/'), 'image upload');
    const csv = path.join(DATA, 'cards.csv');
    fs.writeFileSync(csv, 'type,text,timeSeconds,info\ncard,"Hum a song, any song.",2,"Any tune counts."\ncard,Stand on one leg.,,\npenalty,Sing the alphabet.,,\n');
    await a.setInputFiles('#importFile', csv); await a.waitForFunction(() => /Imported/.test(document.querySelector('#importMsg').textContent));
    ok(/Imported 2 cards and 1 penalties/.test(await a.textContent('#importMsg')), 'CSV import: ' + await a.textContent('#importMsg'));
    const js = path.join(DATA, 'cards.json');
    fs.writeFileSync(js, JSON.stringify({ cards: [{ text: 'Whistle for 5 seconds.' }, { text: '' }] }));
    await a.setInputFiles('#importFile', js); await a.waitForFunction(() => /Imported 1/.test(document.querySelector('#importMsg').textContent));
    ok(true, 'JSON import: ' + await a.textContent('#importMsg'));
    ok((await a.locator('#cardRows tr').count()) === 4, 'pack has 4 cards');
    const r = await fetch(BASE + '/api/admin/packs', { method: 'POST', headers: { 'X-Requested-With': 'whyme' } });
    ok(r.status === 401, 'admin API needs session');

    console.log('Landing (portrait)');
    const { ctx, p } = await mk({ width: 390, height: 844 });
    await p.goto(BASE + '/'); await p.waitForSelector('#packPills button');
    ok(await p.isVisible('.title-art'), 'title visible');
    ok((await p.textContent('#mailLink')) === 'whyme@gmail.com', 'contact email from config');
    ok((await p.locator('#rules').count()) === 1, 'rules section');
    const modes = await p.locator('#modePills button').allTextContents();
    ok(modes.join() === 'Deck,Random,Own', 'mode selector: ' + modes.join(', '));
    const pills = await p.locator('#packPills button').allTextContents();
    ok(pills.includes('Test Pack') && !pills.includes('Random') && !pills.includes('Own'), 'deck row: ' + pills.join(', '));

    console.log('Idea submission');
    await p.fill('#ideaText', 'Do a robot dance for 20 seconds.'); await p.click('#ideaForm button[type=submit]');
    await p.waitForFunction(() => /Thank you/.test(document.querySelector('#ideaMsg').textContent));
    await a.reload(); await a.click('.tab[data-tab=ideas]');
    ok(/robot dance/.test(await a.textContent('#ideas')), 'idea visible in admin');

    console.log('Game');
    await mode(p, 'deck'); await p.click('#packPills button[data-id]:has-text("Test Pack")');
    ok((await p.textContent('#cardsOut')).trim() === '4', 'card count = 4');
    await p.click('#playBtn');
    ok(await p.isVisible('#a2hs'), 'A2HS prompt on mobile');
    await p.click('#a2hsSkip'); await p.waitForSelector('#game:not([hidden])');
    ok(await p.isVisible('#sealPack'), 'sealed deck shown after Play');
    await openSeal(p);
    const g = () => p.evaluate(() => JSON.parse(JSON.stringify(window.__whyme.game)));
    let st = await g(); ok(st.phase === 'back' && st.deck.length === 4, 'face-down card');
    ok(new Set(st.deck.map(c => c.text)).size === 4, 'no repeated challenges');
    await p.click('#btnDone', { force: true }).catch(() => {}); ok((await g()).phase === 'back', 'done disabled before reveal');
    await dragCard(p, '#btnDone', .85); ok((await g()).phase !== 'front' && (await g()).history.length === 0, 'face-down card cannot be dragged to done');
    // play through, handling each card by type
    let sawTimer = false, sawInfo = false, sawPenalty = false, sawRefresh = false;
    for (let i = 0; i < 4; i++) {
      await p.click('#card', { position: { x: 60, y: 60 } }); await sleep(700);
      st = await g(); const c = st.deck[st.index];
      ok(st.phase === 'front' && (await p.textContent('#cardText')) === c.text, 'revealed: ' + c.text);
      if (c.info) {
        await p.click('#btnInfo'); ok((await p.textContent('#infoText')) === c.info, 'info popup'); await p.click('#infoClose'); sawInfo = true;
      }
      if (!sawRefresh) {
        await p.reload(); await p.waitForSelector('#game:not([hidden])'); await sleep(300);
        const s2 = await g(); ok(s2.index === st.index && s2.phase === 'front' && (await p.textContent('#cardText')) === c.text, 'refresh restores same card');
        sawRefresh = true;
      }
      if (c.timeSeconds) {
        ok(await p.isVisible('#timerStart'), 'timer waits for tap');
        await p.click('#timerStart'); await sleep(c.timeSeconds * 1000 + 900);
        st = await g(); ok(st.phase === 'penalty' && st.penaltyReason === 'time', 'timer expiry -> penalty');
        sawTimer = true;
      } else if (!sawPenalty) {
        let hot = false;
        await dragCard(p, '#btnFailed', .12); st = await g(); ok(st.phase === 'front', 'short drag snaps back (no resolve)');
        await dragCard(p, '#btnFailed', .85, { hold: async () => { hot = await p.evaluate(() => document.querySelector('#btnFailed').classList.contains('hot')); } });
        st = await g(); ok(hot, 'failed label highlights while dragging'); ok(st.phase === 'penalty', 'drag to failed -> penalty');
        ok(!(await p.evaluate(() => document.querySelector('#card').style.transform)), 'card transform reset after fly-off');
      } else {
        const n = st.history.length; await dragCard(p, '#btnDone', .85); st = await g();
        ok(st.history.length === n + 1 && st.history[n].result === 'done', 'drag to done -> done'); continue;
      }
      sawPenalty = true;
      ok(await p.isVisible('#penaltyDone'), 'penalty shown: ' + await p.textContent('#cardText'));
      ok(st.penalty && (['Sing the alphabet.'].includes(st.penalty)), 'pack penalty used');
      await p.click('#penaltyDone');
    }
    ok(sawTimer && sawInfo && sawPenalty, 'covered timer, info, penalty');
    st = await g(); ok(st.phase === 'end' && st.history.length === 4, 'end screen state');
    ok(await p.isVisible('#endView'), 'end screen visible');
    await p.reload(); await p.waitForSelector('#game:not([hidden])'); ok(await p.isVisible('#endView'), 'end screen survives refresh');
    await p.click('#againBtn'); st = await g(); ok(st.phase === 'back' && st.index === 0 && st.sealed, 'play again (sealed again)');
    await openSeal(p);
    await p.setViewportSize({ width: 844, height: 390 }); await sleep(300);
    ok(!(await p.evaluate(() => document.querySelector('#stage').classList.contains('rot'))), 'landscape: no rotation');
    await p.setViewportSize({ width: 390, height: 844 }); await sleep(300);
    ok(await p.evaluate(() => document.querySelector('#stage').classList.contains('rot')), 'portrait: stage rotated');
    await p.click('#gExit'); ok(await p.isVisible('#resume'), 'resume offered after exit');

    console.log('Own + Random');
    await mode(p, 'own'); ok(!(await p.isVisible('#packPills')) || (await p.getAttribute('#deckRow', 'aria-hidden')) === 'true', 'Own hides the deck row'); ok(await p.isDisabled('#playBtn'), 'Own empty -> play disabled');
    await p.click('#editOwn'); await p.fill('#ownText', 'Tell a joke.'); await p.click('#ownForm button[type=submit]');
    await p.fill('#ownText', 'Do a silly walk.'); await p.fill('#ownTime', '30'); await p.click('#ownForm button[type=submit]');
    ok((await p.locator('#ownList li').count()) === 2, 'own cards added');
    await p.click('#creator [data-close]');
    await p.reload(); await p.waitForSelector('#packPills button');
    ok((await p.textContent('#packInfo')).includes('2 cards'), 'own cards persisted');
    await mode(p, 'random'); ok((await p.getAttribute('#deckRow', 'aria-hidden')) === 'true' && !(await p.locator('#deckRow').evaluate(e => e.classList.contains('open'))), 'Random hides the deck row');
    await p.click('#cardsMinus'); await p.click('#cardsMinus');
    ok((await p.textContent('#cardsOut')).trim() === '13', 'random count adjustable');
    p.once('dialog', d => d.accept().catch(() => {}));
    await p.click('#playBtn'); await p.waitForSelector('#game:not([hidden])');
    st = await g(); ok(st.deck.length === 13 && st.selId === 'random', 'random game with 13 cards');

    console.log('Offline');
    await p.click('#gExit');
    await sleep(800); await ctx.setOffline(true); await p.reload(); await p.waitForSelector('#packPills button');
    ok((await p.locator('#packPills button').count()) >= 2 && (await p.locator('#modePills button').count()) === 3, 'loads offline from service worker');
    await ctx.setOffline(false);

    console.log('Decks (Legless Lizard, Eight Legged Octopus)');
    {
      const api = await (await ctx.request.get(BASE + '/api/packs')).json();
      const ids = api.map(x => x.id);
      ok(ids.includes('legless-lizard') && ids.includes('eight-legged-octopus'), 'both decks served: ' + ids.join(', '));
      ok(!ids.includes('creative-crab') && !ids.includes('quick-fire'), 'unpublished packs hidden from the API');
      await mode(p, 'deck'); const tabs = await p.locator('#packPills button[data-id]').evaluateAll(bs => bs.map(b => b.dataset.id));
      ok(!tabs.includes('creative-crab') && !tabs.includes('quick-fire'), 'unpublished packs hidden from the menu');
      const L = api.find(x => x.id === 'legless-lizard'), O = api.find(x => x.id === 'eight-legged-octopus');
      ok(L.cards.length === 24 && O.cards.length === 23, 'card counts 24 / 23');
      ok(L.cards.every(c => c.title) && O.cards.every(c => c.title), 'every deck card has a title');
      ok(L.penalties.join() === 'Drink 3 shots.' && O.penalties.join() === 'Drink 3 shots.', 'penalty Drink 3 shots.');
      const T = id => [...L.cards, ...O.cards].find(c => c.id === id);
      ok(T('ll02').timeSeconds === 180 && T('ll06').timeSeconds === 300 && T('eo20').timeSeconds === 8, 'timers present (Picture Perfect 180, Marco Polo 300, Happy Feet 8)');
      ok([...L.cards, ...O.cards].filter(c => c.timeSeconds).length === 15, 'timer count 15');
      ok(L.cards.filter(c => c.duo).length === 2 && O.cards.filter(c => c.duo).length === 2, 'DUO duplicates kept in the pack (2 + 2)');
      ok(/^\/packs\/.+\.png$/.test(L.image) && /^\/packs\/.+\.png$/.test(O.image), 'deck art used as pack image');
      // menu: Deck reveals the deck row
      await mode(p, 'random'); await sleep(450);
      ok(!(await p.locator('#deckRow').evaluate(e => e.classList.contains('open'))), 'deck row closed in Random');
      await mode(p, 'deck'); await sleep(450);
      ok(await p.locator('#deckRow').evaluate(e => e.classList.contains('open') && e.getAttribute('aria-hidden') === 'false' && e.getBoundingClientRect().height > 100), 'Deck reveals the deck row');
      await p.click('#packPills button[data-id=legless-lizard]');
      ok((await p.getAttribute('#packPills button[data-id=legless-lizard]', 'aria-selected')) === 'true', 'deck tile selected state');
      ok((await p.textContent('#packInfo')).includes('Legless Lizard'), 'description of the chosen deck');
      ok((await p.textContent('#cardsOut')).trim() === '24', 'Lizard default 24 cards');
      // portrait (rotated stage): sealed deck, refresh before opening shows it sealed again
      await p.click('#playBtn'); await p.waitForSelector('#sealPack');
      ok(await p.evaluate(() => document.querySelector('#stage').classList.contains('rot')), 'portrait: rotated stage');
      ok(await p.isHidden('.table') || await p.locator('.table').evaluate(e => getComputedStyle(e).visibility === 'hidden'), 'pile hidden while sealed');
      await p.reload(); await p.waitForSelector('#game:not([hidden])');
      ok(await p.isVisible('#sealPack') && (await g()).sealed, 'refresh before opening -> sealed deck again');
      await sleep(600); const sp = await centre(p, '#sealPack');
      ok(Math.abs(sp.dx) <= 1 && Math.abs(sp.dy) <= 1 && sp.h > sp.w, 'portrait: sealed pack centred and lying flat on the rotated stage');
      const sc = await centre(p, '.seal-cards'); ok(sp.w > sc.w * 1.05 && sp.h > sc.h * 1.05 && Math.abs(sc.dx) <= 1 && Math.abs(sc.dy) <= 1, 'pack is bigger than the card stack inside it, both centred');
      // short swipe does not open
      await swipe(p, 5, 25); await sleep(400);
      ok((await g()).sealed && await p.isVisible('#sealPack'), 'short swipe does not open');
      await swipe(p, 5, 85);
      await sleep(250); ok(await p.locator('#seal').evaluate(e => e.dataset.phase === 'pop' || e.dataset.phase === 'slide'), 'strip pops, wrapper slides');
      await p.waitForSelector('#seal', { state: 'hidden', timeout: 4000 });
      st = await g(); ok(!st.sealed && st.phase === 'back' && st.deck.length === 24 && (await p.evaluate(() => window.__whyme.opens)) >= 1, 'portrait swipe (mouse) opened the deck, pile ready');
      ok(st.deck.filter(c => c.duo).length === 2, 'both DUO copies dealt in a full game');
      const cc = await centre(p, '#card');
      ok(Math.abs(cc.dx) <= 1 && Math.abs(cc.dy) <= 1 && Math.abs(cc.w - sc.w) <= 1 && Math.abs(cc.h - sc.h) <= 1, `pile exactly where the stack inside the pack was (${cc.w.toFixed(0)}x${cc.h.toFixed(0)}, centre off ${cc.dx.toFixed(2)},${cc.dy.toFixed(2)})`);
      ok((await p.locator('#gCount, .g-count').count()) === 0 && !/\d+\s*\/\s*\d+/.test(await p.locator('#stage').evaluate(e => [...e.querySelectorAll('*')].filter(x => x.children.length === 0 && x.offsetParent).map(x => x.textContent).join(' '))), 'no cards-left counter');
      await p.reload(); await p.waitForSelector('#game:not([hidden])'); await sleep(200);
      ok(await p.isHidden('#seal') && !(await g()).sealed && (await p.evaluate(() => window.__whyme.opens)) === 0, 'refresh after opening -> pile, no seal');
      await p.click('#card', { position: { x: 60, y: 60 } }); await sleep(700);
      st = await g(); const c0 = st.deck[st.index];
      ok(st.phase === 'front' && (await p.evaluate(() => document.querySelector('#card').classList.contains('flipped'))), 'tap pile flips the top card');
      ok((await p.textContent('#cardTitle')) === c0.title.replace(/^DUO CARD:\s*/i, ''), 'title shown on the card');
      // landscape, right-to-left swipe with touch
      await p.click('#gExit'); await p.click('#packPills button[data-id=eight-legged-octopus]'); await p.click('#cardsMinus');
      await p.setViewportSize({ width: 844, height: 390 }); await sleep(300);
      p.once('dialog', d => d.accept().catch(() => {}));
      await p.click('#playBtn'); await p.waitForSelector('#sealPack');
      ok(!(await p.evaluate(() => document.querySelector('#stage').classList.contains('rot'))), 'landscape stage');
      await sleep(600); const lp = await centre(p, '#sealPack'); ok(Math.abs(lp.dx) <= 1 && Math.abs(lp.dy) <= 1 && lp.w > lp.h, 'landscape: sealed pack centred and horizontal');
      { const ex = await p.locator('#gExit').boundingBox(); ok(ex.x < 60 && ex.y < 30, 'back arrow in the top-left corner'); }
      await swipe(p, 96, 15, { touch: true }); await p.waitForSelector('#seal', { state: 'hidden', timeout: 4000 });
      st = await g(); ok(!st.sealed && st.deck.length === 22 && st.deck.filter(c => c.duo).length % 2 === 0, 'landscape touch swipe (right to left) opened; DUO pair kept (22 cards)');
      await p.click('#card', { position: { x: 60, y: 60 } }); await sleep(700); ok((await g()).phase === 'front', 'landscape: tap pile flips');
      await dragCard(p, '#btnFailed', .85, { touch: true }); ok((await g()).phase === 'penalty', 'landscape touch drag to failed -> penalty');
      // portrait touch swipe, and the tap fallbacks
      await p.setViewportSize({ width: 390, height: 844 }); await p.click('#gExit');
      p.once('dialog', d => d.accept().catch(() => {})); await p.click('#playBtn'); await p.waitForSelector('#sealPack');
      await swipe(p, 10, 90, { touch: true }); await p.waitForSelector('#seal', { state: 'hidden', timeout: 4000 });
      ok(!(await g()).sealed, 'portrait touch swipe opened');
      await p.click('#card', { position: { x: 60, y: 60 } }); await sleep(700);
      { const n = (await g()).history.length; await dragCard(p, '#btnDone', .85, { touch: true }); const s3 = await g(); ok(s3.history.length === n + 1 && s3.history[n].result === 'done', 'portrait (rotated) touch drag to done -> done'); }
      await p.keyboard.press('Escape');
      await p.click('#gExit'); p.once('dialog', d => d.accept().catch(() => {})); await p.click('#playBtn'); await p.waitForSelector('#sealPack'); await sleep(500);
      const tp = await p.evaluate(() => window.__whyme.tearPoint(30)); await p.mouse.click(tp.x, tp.y);
      await p.waitForSelector('#seal', { state: 'hidden', timeout: 4000 }); ok(!(await g()).sealed, 'tap on the tear line opens it');
      await p.click('#gExit'); p.once('dialog', d => d.accept().catch(() => {})); await p.click('#playBtn'); await p.waitForSelector('#sealPack');
      await p.waitForSelector('#sealTap:not([hidden])', { timeout: 6000 }); ok(true, "'Tap to open' appears after a few seconds");
      await p.click('#sealTap'); await p.waitForSelector('#seal', { state: 'hidden', timeout: 4000 }); ok(!(await g()).sealed, "'Tap to open' opens");
      // Random uses a plain navy pack
      await p.click('#gExit'); await mode(p, 'random'); p.once('dialog', d => d.accept().catch(() => {})); await p.click('#playBtn'); await p.waitForSelector('#sealPack');
      ok(await p.locator('#sealPack').evaluate(e => e.classList.contains('plain') && /plain-pack/.test(e.querySelector('.body .seal-art').style.backgroundImage)), 'Random: plain navy pack');
      await openSeal(p); ok(!(await g()).sealed, 'Random pack opens with the same swipe');
      await p.click('#gExit');
    }
    // reduced motion fallback
    {
      const rc = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
      const rp = await rc.newPage(); await rp.addInitScript(() => localStorage.setItem('whyme.a2hs.never', 'true'));
      await rp.goto(BASE + '/'); await rp.click('#modePills button[data-mode=deck]'); await rp.click('#packPills button[data-id=legless-lizard]');
      await rp.click('#playBtn');
      ok(await rp.locator('.tear-dot').evaluate(e => getComputedStyle(e).animationName === 'none'), 'reduced motion: no hint animation');
      const t0 = Date.now(); await swipe(rp, 5, 85);
      await rp.waitForSelector('#seal', { state: 'hidden', timeout: 3000 }); ok(Date.now() - t0 < 1500, 'reduced motion: simple fade (' + (Date.now() - t0) + ' ms)');
      await rc.close();
    }

    console.log('Scroll snap');
    { const sp = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: false });
      await sp.goto(BASE + '/'); await sp.evaluate(() => localStorage.setItem('whyme.a2hs.never', '1')); await sp.reload(); await sleep(400);
      ok(await sp.evaluate(() => window.__snap.points().length >= 4), 'section snap points defined');
      await sp.mouse.move(200, 400); await sp.mouse.wheel(0, 140); await sleep(1300);
      const y = await sp.evaluate(() => [scrollY, document.querySelector('#rules').offsetTop]); ok(Math.abs(y[0] - y[1]) <= 2, `light scroll snaps title -> How to play (${y[0]} vs ${y[1]})`);
      await sp.mouse.wheel(0, -120); await sleep(1300); ok((await sp.evaluate(() => scrollY)) === 0, 'light scroll up snaps back to the title');
      await sp.mouse.wheel(0, 40); await sleep(1300); ok(Math.abs((await sp.evaluate(() => scrollY)) - y[1]) <= 2, 'small scroll down again catches How to play');
      await sp.setViewportSize({ width: 360, height: 640 }); await sleep(300);
      await sp.evaluate(() => document.querySelector('#playBtn').scrollIntoView({ block: 'end', behavior: 'instant' })); await sleep(1200);
      const vis = await sp.evaluate(() => { const r = document.querySelector('#playBtn').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });
      ok(vis, 'tall section content (Play button) reachable, not trapped by snapping');
      await sp.close(); }
    console.log('No emoji');
    const txt = (await p.evaluate(() => document.body.innerText)) + (await a.evaluate(() => document.body.innerText));
    ok(!/\p{Extended_Pictographic}/u.test(txt), 'no emoji in UI');
    ok(errors.length === 0, 'no page errors ' + errors.join(' | '));
  } catch (e) { fail++; console.log('  FAIL exception: ' + e.message); }
  await browser.close(); srv.kill(); fs.rmSync(DATA, { recursive: true, force: true });
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
