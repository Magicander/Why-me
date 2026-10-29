'use strict';
// WHY ME? server: static files + JSON API. Built-in modules only.
const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA = process.env.WHYME_DATA_DIR || path.join(ROOT, 'data');
const UPLOADS = path.join(DATA, 'uploads');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const PORT = Number(process.env.PORT || CONFIG.port || 3000);
const SECURE_COOKIE = process.env.COOKIE_SECURE === '1';

const FILES = {
  packs: path.join(DATA, 'packs.json'),
  ideas: path.join(DATA, 'ideas.json'),
  penalties: path.join(DATA, 'penalties.json'),
  admin: path.join(DATA, 'admin.json'),
};

fs.mkdirSync(UPLOADS, { recursive: true });
// First run: copy seed data
for (const n of ['packs', 'penalties', 'ideas']) {
  const target = path.join(DATA, n + '.json');
  if (!fs.existsSync(target)) fs.copyFileSync(path.join(ROOT, 'seed', n + '.json'), target);
}

// ---------- JSON file store (serialised writes, atomic rename) ----------
let writeChain = Promise.resolve();
function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJSON(file, value) {
  writeChain = writeChain.then(async () => {
    const tmp = file + '.' + process.pid + '.tmp';
    await fsp.writeFile(tmp, JSON.stringify(value, null, 2));
    await fsp.rename(tmp, file);
  });
  return writeChain;
}

// ---------- Admin password (scrypt hash) ----------
function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(pw, salt, 64).toString('hex') };
}
function ensureAdmin() {
  if (fs.existsSync(FILES.admin)) return;
  let pw = process.env.ADMIN_PASSWORD;
  if (!pw) {
    pw = crypto.randomBytes(9).toString('base64url');
    const f = path.join(DATA, 'initial-admin-password.txt');
    fs.writeFileSync(f, pw + '\n', { mode: 0o600 });
    console.log('[whyme] Generated admin password, stored in ' + f + ' (delete after reading).');
  }
  fs.writeFileSync(FILES.admin, JSON.stringify(hashPassword(pw), null, 2), { mode: 0o600 });
}
function checkPassword(pw) {
  const a = readJSON(FILES.admin, null);
  if (!a || typeof pw !== 'string') return false;
  const h = crypto.scryptSync(pw, a.salt, 64);
  return crypto.timingSafeEqual(h, Buffer.from(a.hash, 'hex'));
}
const sessions = new Map(); // token -> expiry ms
function newSession() {
  const t = crypto.randomBytes(32).toString('hex');
  sessions.set(t, Date.now() + CONFIG.sessionHours * 3600e3);
  return t;
}
function getCookie(req, name) {
  const m = (req.headers.cookie || '').split(/;\s*/).find(c => c.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}
function isAdmin(req) {
  const t = getCookie(req, 'whyme_admin');
  const exp = t && sessions.get(t);
  if (!exp) return false;
  if (exp < Date.now()) { sessions.delete(t); return false; }
  return true;
}
const loginAttempts = new Map(); // ip -> {n, until}
function rateLimited(map, ip, max, windowMs) {
  const now = Date.now();
  const e = map.get(ip) || { n: 0, until: now + windowMs };
  if (e.until < now) { e.n = 0; e.until = now + windowMs; }
  e.n++; map.set(ip, e);
  return e.n > max;
}
const ideaAttempts = new Map();

// ---------- Validation / import ----------
const id = () => crypto.randomBytes(6).toString('hex');
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
function cleanCard(c) {
  if (!c || typeof c !== 'object') return null;
  const text = str(c.text, 500);
  if (!text) return null;
  const out = { id: str(c.id, 40) || id(), text };
  const title = str(c.title, 80);
  if (title) out.title = title;
  if (c.duo === true || /^(1|true|yes|duo)$/i.test(String(c.duo || '').trim())) out.duo = true;
  const t = Number(c.timeSeconds);
  if (Number.isFinite(t) && t > 0) out.timeSeconds = Math.min(Math.round(t), 3600);
  const info = str(c.info, 1000);
  if (info) out.info = info;
  return out;
}
function cleanPack(p, existing = {}) {
  const pack = {
    id: existing.id || id(),
    name: str(p.name, 60) || existing.name || 'Untitled pack',
    description: typeof p.description === 'string' ? str(p.description, 400) : (existing.description || ''),
    image: existing.image || '',
    cards: Array.isArray(p.cards) ? p.cards.map(cleanCard).filter(Boolean) : (existing.cards || []),
    penalties: Array.isArray(p.penalties) ? p.penalties.map(x => str(x, 300)).filter(Boolean) : (existing.penalties || []),
    published: p.published === undefined ? (existing.published !== false) : !!p.published,
    updatedAt: new Date().toISOString(),
  };
  // the same challenge (title + text) must not appear twice in a pack, except DUO cards, which come in pairs
  const seen = new Set(), ids = new Set();
  pack.cards = pack.cards.filter(c => {
    const k = ((c.title || '') + '|' + c.text).toLowerCase();
    if (!c.duo) { if (seen.has(k)) return false; seen.add(k); }
    if (ids.has(c.id)) c.id = id();
    ids.add(c.id); return true;
  });
  return pack;
}
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',' || ch === ';') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = ''; if (row.some(x => x.trim())) rows.push(row); row = [];
    } else cur += ch;
  }
  row.push(cur); if (row.some(x => x.trim())) rows.push(row);
  if (!rows.length) return { cards: [], penalties: [] };
  const head = rows[0].map(h => h.trim().replace(/^\uFEFF/, '').toLowerCase());
  const col = n => head.indexOf(n.toLowerCase());
  const iType = col('type'), iText = col('text'), iTime = col('timeseconds'), iInfo = col('info'), iTitle = col('title'), iDuo = col('duo');
  if (iText < 0) throw new Error('CSV needs a header row with a "text" column');
  const cards = [], penalties = [];
  for (const r of rows.slice(1)) {
    const type = iType >= 0 ? (r[iType] || '').trim().toLowerCase() : 'card';
    if (type === 'penalty') { const t = (r[iText] || '').trim(); if (t) penalties.push(t); continue; }
    cards.push({ text: r[iText], title: iTitle >= 0 ? r[iTitle] : undefined, duo: iDuo >= 0 ? r[iDuo] : undefined, timeSeconds: iTime >= 0 ? r[iTime] : undefined, info: iInfo >= 0 ? r[iInfo] : undefined });
  }
  return { cards, penalties };
}
function parseImport(format, content) {
  if (typeof content !== 'string' || content.length > 2e6) throw new Error('File is empty or too large');
  let data;
  if (format === 'csv') data = parseCSV(content);
  else {
    try { data = JSON.parse(content); } catch { throw new Error('Invalid JSON'); }
    if (Array.isArray(data)) data = { cards: data };
    if (!data || typeof data !== 'object') throw new Error('JSON must be an array of cards or an object with "cards"');
  }
  const cards = (data.cards || []).map(c => cleanCard(typeof c === 'string' ? { text: c } : c));
  const bad = cards.filter(c => !c).length;
  return {
    cards: cards.filter(Boolean),
    penalties: (Array.isArray(data.penalties) ? data.penalties : []).map(x => str(x, 300)).filter(Boolean),
    name: str(data.name, 60), description: str(data.description, 400), skipped: bad,
  };
}

// ---------- HTTP helpers ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain' };
function send(res, code, body, headers = {}) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(code, { 'Content-Type': isObj ? 'application/json' : 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(isObj ? JSON.stringify(body) : body);
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(Object.assign(new Error('Payload too large'), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(Object.assign(new Error('Invalid JSON body'), { code: 400 })); } });
    req.on('error', reject);
  });
}
async function serveFile(res, file, cache) {
  try {
    const st = await fsp.stat(file);
    if (!st.isFile()) throw 0;
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size,
      'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' });
    fs.createReadStream(file).pipe(res);
  } catch { send(res, 404, 'Not found'); }
}
const publicPack = p => ({ id: p.id, name: p.name, description: p.description, image: p.image, cards: p.cards, penalties: p.penalties });

// ---------- Routes ----------
async function api(req, res, url) {
  const m = req.method, p = url.pathname;
  const ip = req.socket.remoteAddress;
  if (m === 'GET' && p === '/api/config') {
    return send(res, 200, { contactEmail: CONFIG.contactEmail, defaultPenalties: readJSON(FILES.penalties, []) });
  }
  if (m === 'GET' && p === '/api/packs') {
    return send(res, 200, readJSON(FILES.packs, []).filter(x => x.published !== false).map(publicPack));
  }
  if (m === 'POST' && p === '/api/ideas') {
    if (rateLimited(ideaAttempts, ip, 10, 3600e3)) return send(res, 429, { error: 'Too many ideas from you for now, try again later.' });
    const b = await readBody(req, 8e3);
    if (b.website) return send(res, 200, { ok: true }); // honeypot
    const text = str(b.text, CONFIG.maxIdeaLength);
    if (text.length < 5) return send(res, 400, { error: 'Please describe your challenge (at least 5 characters).' });
    const ideas = readJSON(FILES.ideas, []);
    ideas.unshift({ id: id(), text, name: str(b.name, 60), email: str(b.email, 120), createdAt: new Date().toISOString() });
    await writeJSON(FILES.ideas, ideas.slice(0, 5000));
    return send(res, 201, { ok: true });
  }
  // ---- admin ----
  if (m === 'POST' && p === '/api/admin/login') {
    if (rateLimited(loginAttempts, ip, 10, 15 * 60e3)) return send(res, 429, { error: 'Too many attempts. Wait 15 minutes.' });
    const b = await readBody(req, 4e3);
    if (!checkPassword(b.password)) return send(res, 401, { error: 'Wrong password' });
    loginAttempts.delete(ip);
    const t = newSession();
    return send(res, 200, { ok: true }, { 'Set-Cookie': `whyme_admin=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${CONFIG.sessionHours * 3600}${SECURE_COOKIE ? '; Secure' : ''}` });
  }
  if (!p.startsWith('/api/admin/')) return send(res, 404, { error: 'Not found' });
  if (!isAdmin(req)) return send(res, 401, { error: 'Not logged in' });
  if (m !== 'GET' && req.headers['x-requested-with'] !== 'whyme') return send(res, 403, { error: 'Bad request origin' });

  if (m === 'GET' && p === '/api/admin/me') return send(res, 200, { ok: true });
  if (m === 'POST' && p === '/api/admin/logout') {
    sessions.delete(getCookie(req, 'whyme_admin'));
    return send(res, 200, { ok: true }, { 'Set-Cookie': 'whyme_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
  }
  if (m === 'GET' && p === '/api/admin/packs') return send(res, 200, readJSON(FILES.packs, []));
  if (m === 'GET' && p === '/api/admin/ideas') return send(res, 200, readJSON(FILES.ideas, []));
  if (m === 'GET' && p === '/api/admin/penalties') return send(res, 200, readJSON(FILES.penalties, []));
  if (m === 'PUT' && p === '/api/admin/penalties') {
    const b = await readBody(req, 1e5);
    const list = (Array.isArray(b.penalties) ? b.penalties : []).map(x => str(x, 300)).filter(Boolean);
    await writeJSON(FILES.penalties, list); return send(res, 200, list);
  }
  let mm;
  if ((mm = p.match(/^\/api\/admin\/ideas\/([\w-]+)$/)) && m === 'DELETE') {
    await writeJSON(FILES.ideas, readJSON(FILES.ideas, []).filter(x => x.id !== mm[1])); return send(res, 200, { ok: true });
  }
  if (m === 'POST' && p === '/api/admin/packs') {
    const b = await readBody(req, 2e6);
    const packs = readJSON(FILES.packs, []);
    const pack = cleanPack(b); packs.push(pack);
    await writeJSON(FILES.packs, packs); return send(res, 201, pack);
  }
  if ((mm = p.match(/^\/api\/admin\/packs\/([\w-]+)(\/image|\/import)?$/))) {
    const packs = readJSON(FILES.packs, []);
    const i = packs.findIndex(x => x.id === mm[1]);
    if (i < 0) return send(res, 404, { error: 'Pack not found' });
    if (!mm[2] && m === 'PUT') {
      const b = await readBody(req, 2e6);
      packs[i] = cleanPack(b, packs[i]); await writeJSON(FILES.packs, packs); return send(res, 200, packs[i]);
    }
    if (!mm[2] && m === 'DELETE') {
      const [gone] = packs.splice(i, 1); await writeJSON(FILES.packs, packs);
      if (gone.image && gone.image.startsWith('/uploads/')) fsp.unlink(path.join(UPLOADS, path.basename(gone.image))).catch(() => {});
      return send(res, 200, { ok: true });
    }
    if (mm[2] === '/image' && m === 'POST') {
      const b = await readBody(req, CONFIG.maxUploadBytes * 1.4 + 1e4);
      const d = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(b.dataUrl || '');
      if (!d) return send(res, 400, { error: 'Image must be PNG, JPEG or WebP' });
      const buf = Buffer.from(d[2], 'base64');
      if (buf.length > CONFIG.maxUploadBytes) return send(res, 413, { error: 'Image too large (max 2 MB)' });
      const sig = { png: [0x89, 0x50], jpeg: [0xff, 0xd8], webp: [0x52, 0x49] }[d[1]];
      if (buf[0] !== sig[0] || buf[1] !== sig[1]) return send(res, 400, { error: 'File content does not match image type' });
      const name = packs[i].id + '-' + Date.now() + '.' + (d[1] === 'jpeg' ? 'jpg' : d[1]);
      await fsp.writeFile(path.join(UPLOADS, name), buf);
      const old = packs[i].image;
      packs[i].image = '/uploads/' + name; packs[i].updatedAt = new Date().toISOString();
      await writeJSON(FILES.packs, packs);
      if (old && old.startsWith('/uploads/')) fsp.unlink(path.join(UPLOADS, path.basename(old))).catch(() => {});
      return send(res, 200, packs[i]);
    }
    if (mm[2] === '/import' && m === 'POST') {
      const b = await readBody(req, 3e6);
      let parsed;
      try { parsed = parseImport(b.format === 'csv' ? 'csv' : 'json', b.content); } catch (e) { return send(res, 400, { error: e.message }); }
      const cur = packs[i];
      const replace = b.mode === 'replace';
      const next = cleanPack({
        cards: replace ? parsed.cards : [...cur.cards, ...parsed.cards],
        penalties: replace ? (parsed.penalties.length ? parsed.penalties : cur.penalties) : [...new Set([...cur.penalties, ...parsed.penalties])],
      }, cur);
      packs[i] = next; await writeJSON(FILES.packs, packs);
      return send(res, 200, { pack: next, imported: parsed.cards.length, skipped: parsed.skipped, penalties: parsed.penalties.length });
    }
  }
  return send(res, 404, { error: 'Not found' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    let p = decodeURIComponent(url.pathname);
    if (p.startsWith('/uploads/')) return serveFile(res, path.join(UPLOADS, path.basename(p)), 'public, max-age=86400');
    if (p === '/admin' || p === '/admin/') p = '/admin.html';
    if (p === '/') p = '/index.html';
    const file = path.normalize(path.join(PUBLIC, p));
    if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, 'Forbidden');
    const cache = /\.(html|js|css|webmanifest)$/.test(file) || p === '/sw.js' ? 'no-cache' : 'public, max-age=604800';
    return serveFile(res, file, cache);
  } catch (e) {
    send(res, e.code === 413 ? 413 : e.code === 400 ? 400 : 500, { error: e.code ? e.message : 'Server error' });
    if (!e.code) console.error(e);
  }
});

if (require.main === module) {
  ensureAdmin();
  server.listen(PORT, () => console.log(`[whyme] http://localhost:${PORT}  (admin: /admin)`));
}
module.exports = { parseCSV, parseImport, cleanPack, hashPassword };
