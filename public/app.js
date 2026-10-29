'use strict';
/* Why Me? front-end. Plain JS, no frameworks. All game state lives in localStorage. */
(() => {
const $ = s => document.querySelector(s);
const KEY = { game: 'whyme.game.v1', own: 'whyme.own.v1', settings: 'whyme.settings.v1', never: 'whyme.a2hs.never',
  packs: 'whyme.packs.cache', config: 'whyme.config.cache', a2hsSeen: 'whyme.a2hs.session' };
const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const FALLBACK_PENALTIES = ['Do 10 jumping jacks.', 'Talk in a robot voice until your next turn.', 'Hold a plank for 20 seconds.'];

let packs = load(KEY.packs, []);
let config = load(KEY.config, { contactEmail: 'whyme@gmail.com', defaultPenalties: FALLBACK_PENALTIES });
let settings = load(KEY.settings, { selId: null, timers: true, counts: {} });
let own = load(KEY.own, []);
let game = load(KEY.game, null);

/* ---------- helpers ---------- */
function rnd(n) { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; }
function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const norm = t => String(t || '').trim().toLowerCase().replace(/\s+/g, ' ');
/* A card never repeats: dedup by id, and non-DUO cards also by title + text (so Random does not show the same challenge from two packs).
   DUO cards come in pairs on purpose, so identical DUO copies with different ids are kept. */
function uniqueCards(cards) {
  const ids = new Set(), texts = new Set();
  return cards.filter(c => {
    const k = norm((c.title || '') + '|' + c.text); if (!norm(c.text)) return false;
    if (c.id && ids.has(c.id)) return false;
    if (!c.duo) { if (texts.has(k)) return false; texts.add(k); }
    if (c.id) ids.add(c.id); return true;
  });
}
const duoKey = c => norm((c.title || '') + '|' + c.text);
/* pick n cards; a DUO card is only dealt together with its partner, which goes somewhere later in the deck */
function pickDeck(cards, n) {
  const pool = shuffle(cards), out = [], used = new Set();
  for (const c of pool) {
    if (out.length >= n) break;
    if (used.has(c)) continue;
    const mate = c.duo ? pool.find(o => o !== c && o.duo && !used.has(o) && duoKey(o) === duoKey(c)) : null;
    if (mate) { if (out.length + 2 > n) continue; used.add(mate); out.push(mate); }
    used.add(c); out.push(c);
  }
  return shuffle(out);
}
const fmt = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2600); }

/* ---------- data ---------- */
async function fetchData() {
  try {
    const [p, c] = await Promise.all([fetch('/api/packs').then(r => r.ok ? r.json() : Promise.reject()), fetch('/api/config').then(r => r.ok ? r.json() : Promise.reject())]);
    packs = p; config = c; save(KEY.packs, p); save(KEY.config, c);
    const imgs = p.map(x => x.image).filter(Boolean);
    if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage({ cacheUrls: imgs });
  } catch { /* offline: cached copy */ }
  renderContact(); renderMenu();
}
function selections() {
  const list = packs.map(p => ({ id: p.id, name: p.name, description: p.description, image: p.image || '/packs/random.svg', cards: p.cards, penalties: p.penalties, kind: 'pack' }));
  const all = uniqueCards(packs.flatMap(p => p.cards));
  list.push({ id: 'random', name: 'Random', description: 'A mix of cards from every pack. You choose how many.', image: '/packs/random.svg', cards: all,
    penalties: [...new Set(packs.flatMap(p => p.penalties || []))], kind: 'random' });
  list.push({ id: 'own', name: 'Own', description: 'Write your own cards. They stay on this phone.', image: '/packs/own.svg', cards: own, penalties: [], kind: 'own' });
  return list;
}
const isDeckArt = src => /\.(png|webp|jpe?g)$/i.test(src || '');
const decks = () => selections().filter(s => s.kind === 'pack');
const modeOf = id => (id === 'random' || id === 'own' ? id : 'deck');
/* mode Deck preselects the last chosen deck, or the first one */
const currentSel = () => {
  const l = selections(); const m = modeOf(settings.selId);
  if (m !== 'deck') return l.find(s => s.id === m);
  const d = l.filter(s => s.kind === 'pack');
  return d.find(s => s.id === settings.selId) || d.find(s => s.id === settings.deckId) || d[0] || l.find(s => s.id === 'random');
};
function countFor(sel) {
  const max = uniqueCards(sel.cards).length;
  const def = sel.kind === 'random' ? Math.min(15, max) : max;
  const v = settings.counts[sel.id];
  return Math.max(max ? 1 : 0, Math.min(max, v == null ? def : v));
}

/* ---------- landing ---------- */
function renderContact() {
  const a = $('#mailLink'); a.textContent = config.contactEmail; a.href = 'mailto:' + config.contactEmail;
}
function renderMenu() {
  const sel = currentSel();
  settings.selId = sel.id;
  const mode = modeOf(sel.id);
  if (mode === 'deck') settings.deckId = sel.id;
  for (const b of document.querySelectorAll('#modePills button')) {
    b.setAttribute('aria-selected', String(b.dataset.mode === mode));
    b.onclick = () => { const m = b.dataset.mode; settings.selId = m === 'deck' ? (settings.deckId || (decks()[0] || {}).id || 'random') : m; save(KEY.settings, settings); renderMenu(); };
  }
  const row = $('#deckRow'); row.classList.toggle('open', mode === 'deck'); row.setAttribute('aria-hidden', String(mode !== 'deck'));
  row.inert = mode !== 'deck';
  const pills = $('#packPills'); pills.textContent = '';
  for (const s of decks()) {
    const b = document.createElement('button');
    b.type = 'button'; b.role = 'tab'; b.dataset.id = s.id; b.className = 'deck-tile' + (isDeckArt(s.image) ? ' art' : '');
    const fig = document.createElement('span'); fig.className = 'tile-img';
    const im = document.createElement('img'); im.src = s.image; im.alt = ''; im.draggable = false; fig.append(im);
    const nm = document.createElement('span'); nm.className = 'tile-name'; nm.textContent = s.name;
    b.append(fig, nm);
    b.setAttribute('aria-selected', String(s.id === sel.id));
    b.onclick = () => { settings.selId = s.id; save(KEY.settings, settings); renderMenu(); };
    pills.append(b);
  }
  const info = $('#packInfo'); info.textContent = '';
  const img = document.createElement('img'); img.src = sel.image; img.alt = ''; img.className = isDeckArt(sel.image) ? 'art' : '';
  const box = document.createElement('div');
  const h = document.createElement('h3'); h.textContent = sel.name;
  const p = document.createElement('p'); p.textContent = sel.description + ' ';
  const total = uniqueCards(sel.cards).length;
  const cnt = document.createElement('span'); cnt.className = 'count'; cnt.textContent = total + (total === 1 ? ' card.' : ' cards.');
  p.append(cnt);
  box.append(h, p);
  if (sel.kind === 'own') {
    const e = document.createElement('button'); e.type = 'button'; e.className = 'linkish'; e.id = 'editOwn'; e.textContent = 'Edit my cards';
    e.onclick = openCreator; p.append(' ', e);
  }
  info.append(img, box);
  const tile = pills.querySelector('[aria-selected="true"]');
  if (tile && tile.scrollIntoView && pills.scrollWidth > pills.clientWidth) { const l = tile.offsetLeft - (pills.clientWidth - tile.offsetWidth) / 2; pills.scrollTo({ left: l, behavior: 'smooth' }); }
  const n = countFor(sel);
  $('#cardsOut').value = $('#cardsOut').textContent = n;
  $('#cardsMinus').disabled = n <= 1;
  $('#cardsPlus').disabled = n >= total;
  $('#timersToggle').checked = settings.timers !== false;
  $('#playBtn').disabled = total === 0;
  $('#menuNote').textContent = total === 0 ? (sel.kind === 'own' ? 'Add at least one card to play.' : 'This deck is empty.') : '';
  $('#resume').hidden = !(game && game.phase !== 'end');
  save(KEY.settings, settings);
}
function step(d) {
  const sel = currentSel(); const total = uniqueCards(sel.cards).length;
  settings.counts[sel.id] = Math.max(1, Math.min(total, countFor(sel) + d)); renderMenu();
}
let holdT;
for (const [id, d] of [['#cardsMinus', -1], ['#cardsPlus', 1]]) {
  const b = $(id);
  b.addEventListener('click', () => step(d));
  b.addEventListener('pointerdown', () => { holdT = setTimeout(function rep() { step(d); holdT = setTimeout(rep, 90); }, 450); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => clearTimeout(holdT));
}
$('#timersToggle').onchange = e => { settings.timers = e.target.checked; save(KEY.settings, settings); };

/* own creator */
function openCreator() { renderOwn(); $('#creator').hidden = false; setTimeout(() => $('#ownText').focus(), 50); }
function renderOwn() {
  const ul = $('#ownList'); ul.textContent = '';
  if (!own.length) { const li = document.createElement('li'); li.className = 'own-empty'; li.style.background = 'none'; li.style.color = ''; li.textContent = 'No cards yet. Write your first challenge above.'; ul.append(li); }
  own.forEach((c, i) => {
    const li = document.createElement('li'); const p = document.createElement('p'); p.textContent = c.text;
    const meta = [c.timeSeconds ? 'Timer ' + fmt(c.timeSeconds * 1000) : '', c.info ? 'Info: ' + c.info : ''].filter(Boolean).join(' / ');
    if (meta) { const s = document.createElement('small'); s.textContent = meta; p.append(s); }
    const del = document.createElement('button'); del.type = 'button'; del.textContent = 'Delete';
    del.onclick = () => { own.splice(i, 1); save(KEY.own, own); renderOwn(); renderMenu(); };
    li.append(p, del); ul.append(li);
  });
}
$('#ownForm').onsubmit = e => {
  e.preventDefault();
  const text = $('#ownText').value.trim(); if (!text) return;
  if (own.some(c => norm(c.text) === norm(text))) { toast('You already have this card.'); return; }
  const t = parseInt($('#ownTime').value, 10);
  const card = { id: 'own-' + Date.now().toString(36) + rnd(1e6).toString(36), text };
  if (t > 0) card.timeSeconds = Math.min(t, 3600);
  const info = $('#ownInfo').value.trim(); if (info) card.info = info;
  own.unshift(card); save(KEY.own, own); e.target.reset(); renderOwn(); renderMenu();
};
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => (b.closest('.overlay').hidden = true));

/* ideas */
$('#ideaForm').onsubmit = async e => {
  e.preventDefault();
  const f = e.target, msg = $('#ideaMsg');
  const body = Object.fromEntries(new FormData(f));
  if ((body.text || '').trim().length < 5) { msg.textContent = 'Please describe your challenge first.'; return; }
  msg.textContent = 'Sending...';
  try {
    const r = await fetch('/api/ideas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Could not send');
    f.reset(); msg.textContent = 'Thank you! Your idea was sent.';
  } catch (err) { msg.textContent = navigator.onLine === false ? 'You are offline. Try again later.' : err.message; }
};

/* ---------- add to home screen prompt ---------- */
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; });
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isMobile = () => isIOS() || /android|mobile/i.test(navigator.userAgent) || matchMedia('(pointer: coarse)').matches;
const ICON_SHARE = '<svg viewBox="0 0 34 34"><rect width="34" height="34" rx="9" fill="#003087"/><path d="M17 7v14M12 11l5-5 5 5M10 16v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_ADD = '<svg viewBox="0 0 34 34"><rect width="34" height="34" rx="9" fill="#003087"/><rect x="9" y="9" width="16" height="16" rx="4" fill="none" stroke="#fff" stroke-width="2.4"/><path d="M17 13v8M13 17h8" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>';
const ICON_MENU = '<svg viewBox="0 0 34 34"><rect width="34" height="34" rx="9" fill="#003087"/><circle cx="17" cy="10" r="2.4" fill="#fff"/><circle cx="17" cy="17" r="2.4" fill="#fff"/><circle cx="17" cy="24" r="2.4" fill="#fff"/></svg>';
function maybeA2HS(then) {
  if (!isMobile() || isStandalone() || load(KEY.never, false) || sessionStorage.getItem(KEY.a2hsSeen)) return then();
  sessionStorage.setItem(KEY.a2hsSeen, '1');
  const ios = isIOS();
  const steps = ios
    ? [[ICON_SHARE, 'iPhone / iPad', 'Tap Share in the browser bar'], [ICON_ADD, 'Then', 'Choose Add to Home Screen']]
    : [[ICON_MENU, 'Android', 'Open the browser menu'], [ICON_ADD, 'Then', 'Tap Add to Home screen or Install app']];
  $('#a2hsSteps').innerHTML = steps.map(([i, os, t]) => `<li>${i}<span><span class="os">${os}</span>${t}</span></li>`).join('');
  $('#a2hsInstall').hidden = !deferredInstall;
  const el = $('#a2hs'); el.hidden = false;
  const close = () => { el.hidden = true; then(); };
  $('#a2hsSkip').onclick = close;
  $('#a2hsNever').onclick = () => { save(KEY.never, true); close(); };
  $('#a2hsInstall').onclick = async () => { try { deferredInstall.prompt(); await deferredInstall.userChoice; } catch {} deferredInstall = null; close(); };
}

/* ---------- game state ---------- */
function newGame(sel) {
  const n = countFor(sel);
  const timers = settings.timers !== false;
  const deck = pickDeck(uniqueCards(sel.cards), n).map(c => {
    const o = { id: c.id, text: c.text };
    if (c.title) o.title = c.title;
    if (c.duo) o.duo = true;
    if (timers && c.timeSeconds > 0) o.timeSeconds = c.timeSeconds;
    if (c.info) o.info = c.info;
    return o;
  });
  let pens = (sel.penalties && sel.penalties.length ? sel.penalties : config.defaultPenalties) || [];
  if (!pens.length) pens = FALLBACK_PENALTIES;
  return { v: 1, selId: sel.id, title: sel.name, deck, index: 0, phase: 'back', history: [], penalty: null, penaltyReason: null,
    timer: null, penalties: shuffle(pens), penaltyPtr: 0, timers, count: n, inGame: true, startedAt: Date.now(),
    sealed: true, packImage: isDeckArt(sel.image) ? sel.image : null, packName: sel.name };
}
const persist = () => save(KEY.game, game);
const card = () => game && game.deck[game.index];

function reveal() {
  if (game.phase !== 'back') return;
  const c = card();
  game.phase = 'front';
  game.timer = c.timeSeconds ? { total: c.timeSeconds * 1000, remaining: c.timeSeconds * 1000, running: false, endsAt: 0 } : null;
  persist(); render(true);
}
function startTimer() {
  const t = game.timer; if (!t || t.running) return;
  t.running = true; t.endsAt = Date.now() + t.remaining; persist(); render();
}
function pauseTimer() {
  const t = game && game.timer; if (!t || !t.running) return;
  t.remaining = Math.max(0, t.endsAt - Date.now()); t.running = false; persist();
}
function markDone() {
  if (game.phase !== 'front') return;
  game.history.push({ id: card().id, text: card().text, result: 'done' });
  next();
}
function markFailed(reason) {
  if (game.phase !== 'front') return;
  game.history.push({ id: card().id, text: card().text, result: 'failed', reason: reason || 'pass' });
  game.timer = null;
  game.penalty = game.penalties[game.penaltyPtr % game.penalties.length];
  game.penaltyPtr++;
  game.penaltyReason = reason || 'pass';
  game.phase = 'penalty';
  game.history[game.history.length - 1].penalty = game.penalty;
  persist(); render();
}
function next() {
  game.timer = null; game.penalty = null; game.penaltyReason = null;
  game.index++;
  game.phase = game.index >= game.deck.length ? 'end' : 'back';
  persist(); render(false, true);
}

/* ---------- game view ---------- */
function layout() {
  const w = window.innerWidth, h = window.innerHeight, st = $('#stage');
  const portrait = h > w;
  st.style.setProperty('--sw', Math.max(w, h) + 'px');
  st.style.setProperty('--sh', Math.min(w, h) + 'px');
  st.style.setProperty('--vw', w + 'px');
  st.classList.toggle('rot', portrait);
}
function openGame() {
  game.inGame = true; persist();
  $('#game').hidden = false; document.body.style.overflow = 'hidden';
  layout(); render(false, false, true);
}
function closeGame() {
  pauseTimer();
  if (game) { game.inGame = false; persist(); }
  $('#game').hidden = true; document.body.style.overflow = '';
  renderMenu(); $('#menu').scrollIntoView();
}
function render(flipAnim, dealAnim, instant) {
  if (!game) return;
  renderSeal();
  const c = card(), el = $('#card');
  $('#endView').hidden = game.phase !== 'end';
  $('#infoPop').hidden = true;
  if (game.phase === 'end') { renderEnd(); tick(); return; }
  const remaining = game.deck.length - game.index - 1;
  $('#deckUnder').className = 'deck-under';   // same pile look for every card: no cards-left indicator
  const front = game.phase !== 'back';
  if (instant || !flipAnim) { el.classList.add('no-anim'); requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('no-anim'))); }
  el.classList.toggle('flipped', front);
  el.classList.toggle('is-penalty', game.phase === 'penalty');
  if (dealAnim) { el.classList.remove('deal'); void el.offsetWidth; el.classList.add('deal'); }
  const txt = $('#cardText'), kick = $('#cardKicker');
  if (game.phase === 'penalty') {
    kick.textContent = game.penaltyReason === 'time' ? 'Time is up - penalty' : 'Penalty';
    txt.textContent = game.penalty;
  } else if (front) {
    kick.textContent = c.duo ? 'DUO card' : c.timeSeconds ? 'Timed challenge' : 'Challenge';
    txt.textContent = c.text;
  }
  const ttl = $('#cardTitle'), tt = game.phase === 'front' && c.title ? c.title.replace(/^DUO CARD:\s*/i, '') : '';
  ttl.textContent = tt; ttl.hidden = !tt;
  txt.classList.toggle('long', (txt.textContent || '').length > (tt ? 110 : 140));
  txt.classList.toggle('xlong', (txt.textContent || '').length > 230);
  $('#penaltyDone').hidden = game.phase !== 'penalty';
  $('#btnDone').disabled = $('#btnFailed').disabled = game.phase !== 'front';
  const hasInfo = game.phase === 'front' && !!c.info;
  $('#btnInfo').disabled = !hasInfo; $('#btnInfo').classList.toggle('has-info', hasInfo);
  tick();
}
function tick() {
  const t = game && game.phase === 'front' ? game.timer : null;
  const pill = $('#gTimer'), startB = $('#timerStart');
  if (!t) { pill.hidden = true; startB.hidden = true; return; }
  let rem = t.running ? t.endsAt - Date.now() : t.remaining;
  if (t.running && rem <= 0) { markFailed('time'); return; }
  pill.hidden = false; pill.textContent = fmt(rem);
  pill.classList.toggle('low', t.running && rem <= 5000);
  startB.hidden = t.running;
  startB.textContent = (t.remaining < t.total ? 'Resume timer ' : 'Start timer ') + fmt(rem);
}
setInterval(() => { if (!$('#game').hidden) tick(); }, 200);

function renderEnd() {
  const done = game.history.filter(h => h.result === 'done').length;
  const failed = game.history.length - done;
  $('#endSum').textContent = `${game.title}: ${done} done, ${failed} failed. ${failed ? 'Penalties paid.' : 'Not a single penalty.'}`;
  const ul = $('#endList'); ul.textContent = '';
  for (const h of game.history) {
    const li = document.createElement('li'); li.className = h.result;
    const b = document.createElement('b'); b.textContent = h.result === 'done' ? 'Done' : (h.reason === 'time' ? 'Time' : 'Failed');
    const s = document.createElement('span'); s.textContent = h.text;
    li.append(b, s); ul.append(li);
  }
}

$('#card').addEventListener('click', e => { if (e.target.closest('button') || game.sealed) return; reveal(); });
$('#timerStart').onclick = startTimer;
$('#btnDone').onclick = markDone;
$('#btnFailed').onclick = () => markFailed('pass');
$('#penaltyDone').onclick = () => { if (game.phase === 'penalty') next(); };
$('#btnInfo').onclick = () => { const c = card(); if (!c || !c.info) return; $('#infoText').textContent = c.info; $('#infoPop').hidden = false; };
$('#infoClose').onclick = () => ($('#infoPop').hidden = true);
$('#gExit').onclick = closeGame;
$('#againBtn').onclick = () => {
  const sel = selections().find(s => s.id === game.selId) || currentSel();
  game = newGame(sel); persist(); render(false, false, true);
};
$('#menuBtn').onclick = () => { localStorage.removeItem(KEY.game); game = null; $('#game').hidden = true; document.body.style.overflow = ''; renderMenu(); $('#menu').scrollIntoView(); };
$('#playBtn').onclick = () => {
  const sel = currentSel();
  if (!uniqueCards(sel.cards).length) return;
  if (game && game.phase !== 'end' && game.index > 0 && !confirm('Start a new game? Your current game will be lost.')) return;
  maybeA2HS(() => { game = newGame(sel); persist(); openGame(); });
};
$('#resumeBtn').onclick = () => game && openGame();

window.addEventListener('resize', layout);
window.addEventListener('orientationchange', () => setTimeout(layout, 120));
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseTimer(); else if (!$('#game').hidden) render(); });
window.addEventListener('pagehide', pauseTimer);
window.addEventListener('storage', e => { if (e.key === KEY.game) { game = load(KEY.game, null); if (game && !$('#game').hidden) render(); } });

/* ---------- sealed deck: swipe across the top strip to tear it open ----------
   The seal lives inside the stage, so in portrait it is rotated with the game. Pointer positions are
   mapped into stage coordinates with the inverse of the stage transform, so "horizontal" always means
   along the strip, whatever way the phone is held. */
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const TEAR_Y = 10;            // tear line, % of pack height (along the long top edge of the flat pack)
const TEAR_DONE = 0.55;       // share of the pack width the finger must cover
let openCount = 0, sealBuilt = null, tapHintT = null, tear = null;
function zigPts(y, teeth, amp) { const a = []; for (let i = 0; i <= teeth; i++) a.push([i / teeth * 100, y + (i % 2 ? amp : -amp)]); return a; }
const LINE = zigPts(TEAR_Y, 22, .55);
const poly = pts => 'polygon(' + pts.map(([x, y]) => x.toFixed(2) + '% ' + y.toFixed(2) + '%').join(', ') + ')';
function lineYAt(x) { const i = Math.min(LINE.length - 2, Math.floor(x / 100 * (LINE.length - 1))); const [x0, y0] = LINE[i], [x1, y1] = LINE[i + 1]; return y0 + (y1 - y0) * ((x - x0) / (x1 - x0 || 1)); }
/* polygon of the strip part above the tear line between x0 and x1 (percent) */
function topClip(x0, x1) {
  if (x1 < x0) [x0, x1] = [x1, x0];
  const mid = LINE.filter(([x]) => x > x0 && x < x1);
  const lower = [[x0, lineYAt(x0)], ...mid, [x1, lineYAt(x1)]];
  return poly([[x0, -2], [x1, -2], ...lower.reverse()]);
}
function buildSeal() {
  const el = $('#seal'); el.textContent = '';
  const pack = document.createElement('div'); pack.className = 'seal-pack' + (game.packImage ? ' art' : ' plain'); pack.id = 'sealPack';
  const img = game.packImage || '/packs/plain-pack.svg';   // Random and Own: plain navy pack, same shape
  const piece = cls => { const d = document.createElement('div'); d.className = 'seal-piece ' + cls; const art = document.createElement('i'); art.className = 'seal-art'; art.style.backgroundImage = 'url("' + img + '")'; d.append(art);
    if (!game.packImage && cls === 'body') { const n = document.createElement('span'); n.className = 'plain-name'; n.textContent = game.packName || 'Why Me?'; d.append(n); }
    return d; };
  const body = piece('body'); body.style.clipPath = poly([...LINE, [100, 102], [0, 102]]);
  const rest = piece('top rest'), torn = piece('top torn');
  rest.style.clipPath = topClip(0, 100); torn.style.clipPath = topClip(0, 0);
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); line.setAttribute('class', 'tear-line'); line.setAttribute('viewBox', '0 0 100 100'); line.setAttribute('preserveAspectRatio', 'none');
  line.innerHTML = '<polyline points="' + LINE.map(([x, y]) => x + ',' + y).join(' ') + '" vector-effect="non-scaling-stroke"/>';
  const hit = document.createElement('div'); hit.className = 'tear-hit'; hit.id = 'tearHit'; hit.setAttribute('role', 'button'); hit.setAttribute('aria-label', 'Swipe across the top to open the deck'); hit.tabIndex = 0;
  const dot = document.createElement('i'); dot.className = 'tear-dot';
  pack.append(body, rest, torn, line, dot, hit);
  const hint = document.createElement('p'); hint.className = 'seal-hint'; hint.id = 'sealHint'; hint.textContent = 'Swipe to open';
  const tap = document.createElement('button'); tap.type = 'button'; tap.className = 'pill pill-navy seal-tap'; tap.id = 'sealTap'; tap.textContent = 'Tap to open'; tap.hidden = true;
  tap.onclick = () => autoTear(1);
  el.append(pack, hint, tap);
  hit.addEventListener('pointerdown', tearDown);
  hit.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); autoTear(1); } });
  clearTimeout(tapHintT); tapHintT = setTimeout(() => { if (game && game.sealed) tap.hidden = false; }, 3500);
}
function renderSeal() {
  const st = $('#stage'), el = $('#seal');
  if (!game.sealed) { if (!el.hidden && !el.dataset.leaving) { el.hidden = true; el.textContent = ''; } st.classList.remove('sealed'); sealBuilt = null; return; }
  st.classList.add('sealed'); el.hidden = false; delete el.dataset.leaving;
  const key = game.startedAt + '|' + game.packImage;
  if (sealBuilt !== key || !el.firstChild) { buildSeal(); sealBuilt = key; }
}
function toLocal(e) { const m = new DOMMatrix(getComputedStyle($('#stage')).transform).inverse(); return m.transformPoint(new DOMPoint(e.clientX, e.clientY)); }
function packBox() { const p = $('#sealPack'); return { left: p.offsetLeft, top: p.offsetTop, w: p.offsetWidth, h: p.offsetHeight }; }
function setTorn(x0, x1) {
  const pack = $('#sealPack'); if (!pack) return;
  const a = Math.max(0, Math.min(100, x0)), b = Math.max(0, Math.min(100, x1));
  const lo = Math.min(a, b), hi = Math.max(a, b);
  pack.querySelector('.torn').style.clipPath = topClip(lo, hi);
  pack.querySelector('.rest').style.clipPath = lo <= 0.01 ? topClip(hi, 100) : hi >= 99.99 ? topClip(0, lo) : topClip(0, 100);
  // the torn flap peels up a little, hinged at the finger
  const amt = (hi - lo) / 100;
  const torn = pack.querySelector('.torn'); torn.style.transformOrigin = (b >= a ? hi : lo) + '% ' + TEAR_Y + '%';
  torn.style.transform = `translateY(${-amt * 9}%) rotate(${(b >= a ? -1 : 1) * amt * 7}deg)`;
  const dot = pack.querySelector('.tear-dot'); dot.style.left = b + '%'; dot.style.top = lineYAt(b) + '%';
  pack.classList.toggle('tearing', hi - lo > 0.5);
}
function tearDown(e) {
  if (!game || !game.sealed || tear) return;
  e.preventDefault();
  const hit = e.currentTarget; try { hit.setPointerCapture(e.pointerId); } catch {}
  const p = toLocal(e), b = packBox();
  const x = (p.x - b.left) / b.w * 100;
  tear = { id: e.pointerId, x0: Math.max(0, Math.min(100, x)), x: x, t0: performance.now(), moved: 0 };
  $('#sealPack').classList.add('grab'); $('#sealHint').classList.add('active');
  const move = ev => {
    if (!tear || ev.pointerId !== tear.id) return;
    const q = toLocal(ev), bb = packBox();
    tear.x = (q.x - bb.left) / bb.w * 100; tear.moved = Math.max(tear.moved, Math.abs(tear.x - tear.x0));
    setTorn(tear.x0, tear.x);
    if (Math.abs(tear.x - tear.x0) / 100 >= TEAR_DONE || (tear.x0 > 2 && tear.x0 < 98 && (tear.x <= 0 || tear.x >= 100) && Math.abs(tear.x - tear.x0) > 35)) finishTear(tear.x >= tear.x0 ? 1 : -1);
  };
  const up = ev => {
    if (!tear || ev.pointerId !== tear.id) return;
    hit.removeEventListener('pointermove', move); hit.removeEventListener('pointerup', up); hit.removeEventListener('pointercancel', up);
    const t = tear; tear = null;
    if (!game.sealed) return;
    $('#sealPack').classList.remove('grab'); $('#sealHint').classList.remove('active');
    if (t.moved < 4 && ev.type === 'pointerup') { autoTear(t.x0 > 50 ? -1 : 1, t.x0); return; }   // a tap on the tear line opens it slowly
    // not far enough: the flap settles back
    const torn = $('#sealPack .torn'); torn.style.transition = 'transform .25s'; setTorn(t.x0, t.x0); setTimeout(() => (torn.style.transition = ''), 260);
  };
  hit.addEventListener('pointermove', move); hit.addEventListener('pointerup', up); hit.addEventListener('pointercancel', up);
}
/* tap fallback: the tear runs along the line by itself */
function autoTear(dir, from) {
  if (!game || !game.sealed || $('#sealPack').dataset.auto) return;
  $('#sealPack').dataset.auto = '1';
  const x0 = from != null ? (dir > 0 ? 0 : 100) : (dir > 0 ? 0 : 100);
  if (reduceMotion()) { finishTear(dir); return; }
  const t0 = performance.now(), D = 700;
  (function f(t) { const k = Math.min(1, (t - t0) / D); setTorn(x0, x0 + dir * k * 100 * TEAR_DONE); if (k < 1) requestAnimationFrame(f); else finishTear(dir); })(t0);
}
function finishTear(dir) {
  if (!game.sealed) return;
  tear = null; clearTimeout(tapHintT);
  game.sealed = false; persist(); openCount++;
  const el = $('#seal'), pack = $('#sealPack'), st = $('#stage');
  el.dataset.leaving = '1';
  const torn = pack.querySelector('.torn'), rest = pack.querySelector('.rest');
  pack.classList.remove('grab', 'tearing'); pack.classList.add('opened');
  $('#sealHint').hidden = true; $('#sealTap').hidden = true;
  const cleanup = () => { el.hidden = true; el.textContent = ''; delete el.dataset.leaving; delete el.dataset.phase; sealBuilt = null; };
  st.classList.remove('sealed'); st.classList.add('unsealing');
  render(false, false, true);
  if (reduceMotion()) {
    el.dataset.phase = 'gone';
    pack.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' });
    $('.table').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
    setTimeout(() => { st.classList.remove('unsealing'); cleanup(); }, 320);
    return;
  }
  // 1) whole strip pops off in the swipe direction
  torn.style.clipPath = topClip(0, 100); rest.style.display = 'none';
  torn.style.transformOrigin = (dir > 0 ? 100 : 0) + '% ' + TEAR_Y + '%';
  el.dataset.phase = 'pop';
  torn.animate([{ transform: torn.style.transform || 'none' },
    { transform: `translate(${dir * 18}%, -14%) rotate(${dir * 16}deg)`, offset: .35 },
    { transform: `translate(${dir * 120}%, -60%) rotate(${dir * 55}deg)`, opacity: 0 }], { duration: 520, easing: 'cubic-bezier(.3,.1,.6,1)', fill: 'forwards' });
  // 2) wrapper slides down and out, the pile stays
  const table = $('.table');
  table.animate([{ opacity: 0, transform: 'scale(.94)' }, { opacity: 0, transform: 'scale(.94)', offset: .3 }, { opacity: 1, transform: 'scale(1)' }], { duration: 1050, easing: 'ease-out' });
  setTimeout(() => { el.dataset.phase = 'slide'; }, 380);
  const sl = pack.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(0)', offset: .36 }, { transform: 'translateY(-3%)', offset: .45 },
    { transform: 'translateY(115%) rotate(3deg)', opacity: 1 }], { duration: 1200, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' });
  sl.onfinish = () => { st.classList.remove('unsealing'); cleanup(); };
}


/* ---------- boot ---------- */
renderContact(); renderMenu();
if (game && game.inGame && game.deck && game.deck.length) openGame();
fetchData();
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('/sw.js').catch(() => {});
window.__whyme = { get game() { return game; }, get opens() { return openCount; },
  /* screen position of a point on the tear line (x in % of the pack width), for tests and demos */
  tearPoint(x) { const p = $('#sealPack'); if (!p) return null; const b = packBox();
    const m = new DOMMatrix(getComputedStyle($('#stage')).transform);
    const q = m.transformPoint(new DOMPoint(b.left + b.w * x / 100, b.top + b.h * lineYAt(Math.max(0, Math.min(100, x))) / 100)); return { x: q.x, y: q.y }; } };
})();
