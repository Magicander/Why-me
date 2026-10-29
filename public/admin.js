'use strict';
(() => {
const $ = s => document.querySelector(s);
const api = async (url, opts = {}) => {
  const r = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'whyme', ...(opts.headers || {}) },
    body: opts.body && typeof opts.body !== 'string' ? JSON.stringify(opts.body) : opts.body, credentials: 'same-origin' });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && !url.endsWith('/login')) { showLogin(); throw new Error('Session expired, log in again.'); }
  if (!r.ok) throw new Error(j.error || 'Request failed (' + r.status + ')');
  return j;
};
let packs = [], currentId = null;
const msg = (el, text, err) => { el.textContent = text; el.classList.toggle('err', !!err); };

function showLogin() { $('#app').hidden = true; $('#login').hidden = false; $('#pw').focus(); }
async function showApp() { $('#login').hidden = true; $('#app').hidden = false; await Promise.all([loadPacks(), loadIdeas(), loadPen()]); }

$('#loginForm').onsubmit = async e => {
  e.preventDefault();
  try { await api('/api/admin/login', { method: 'POST', body: { password: $('#pw').value } }); $('#pw').value = ''; msg($('#loginMsg'), ''); showApp(); }
  catch (err) { msg($('#loginMsg'), err.message, true); }
};
$('#logout').onclick = async () => { await api('/api/admin/logout', { method: 'POST' }).catch(() => {}); showLogin(); };
document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x === t));
  document.querySelectorAll('[data-view]').forEach(v => (v.hidden = v.dataset.view !== t.dataset.tab));
});

/* packs */
async function loadPacks() { packs = await api('/api/admin/packs'); renderList(); if (currentId) openPack(currentId); }
function renderList() {
  const ul = $('#packList'); ul.textContent = '';
  for (const p of packs) {
    const li = document.createElement('li'), b = document.createElement('button');
    b.type = 'button'; b.className = p.id === currentId ? 'on' : '';
    const img = document.createElement('img'); img.src = p.image || '/packs/random.svg'; img.alt = '';
    const s = document.createElement('span'); s.textContent = p.name;
    const sm = document.createElement('small'); sm.textContent = p.cards.length + ' cards' + (p.published === false ? ' / hidden' : '');
    s.append(sm); b.append(img, s); b.onclick = () => openPack(p.id); li.append(b); ul.append(li);
  }
}
$('#newPack').onclick = async () => {
  const p = await api('/api/admin/packs', { method: 'POST', body: { name: 'New pack', description: '', cards: [], penalties: [], published: false } });
  packs.push(p); currentId = p.id; renderList(); openPack(p.id); $('#pName').select();
};
function cardRow(c = {}) {
  const tr = document.createElement('tr');
  tr.innerHTML = '<td><input class="c-title" maxlength="80" placeholder="optional"><label class="c-duo-l"><input type="checkbox" class="c-duo"> DUO</label></td><td><textarea class="c-text" rows="2" maxlength="500" placeholder="Challenge text"></textarea></td><td><input class="c-time" type="number" min="0" max="3600" placeholder="none"></td><td><textarea class="c-info" rows="2" maxlength="1000" placeholder="optional"></textarea></td><td><button type="button" class="x">Remove</button></td>';
  tr.querySelector('.c-text').value = c.text || '';
  tr.querySelector('.c-title').value = c.title || '';
  tr.querySelector('.c-duo').checked = !!c.duo;
  tr.querySelector('.c-time').value = c.timeSeconds || '';
  tr.querySelector('.c-info').value = c.info || '';
  tr.dataset.id = c.id || '';
  tr.querySelector('.x').onclick = () => { tr.remove(); count(); };
  return tr;
}
const count = () => ($('#pCount').textContent = '(' + document.querySelectorAll('#cardRows tr').length + ')');
function openPack(id) {
  const p = packs.find(x => x.id === id); if (!p) return;
  currentId = id; renderList();
  const ed = $('#editor'); ed.textContent = ''; ed.append($('#editorTpl').content.cloneNode(true));
  $('#pImg').src = p.image || '/packs/random.svg';
  $('#pName').value = p.name; $('#pDesc').value = p.description || ''; $('#pPub').checked = p.published !== false;
  $('#pPen').value = (p.penalties || []).join('\n');
  const rows = $('#cardRows'); p.cards.forEach(c => rows.append(cardRow(c))); count();
  $('#addCard').onclick = () => { const r = cardRow(); rows.append(r); count(); r.querySelector('textarea').focus(); };
  $('#packForm').onsubmit = async e => {
    e.preventDefault();
    const cards = [...rows.querySelectorAll('tr')].map(tr => ({ id: tr.dataset.id || undefined, text: tr.querySelector('.c-text').value,
      title: tr.querySelector('.c-title').value, duo: tr.querySelector('.c-duo').checked,
      timeSeconds: Number(tr.querySelector('.c-time').value) || undefined, info: tr.querySelector('.c-info').value })).filter(c => c.text.trim());
    try {
      const up = await api('/api/admin/packs/' + id, { method: 'PUT', body: { name: $('#pName').value, description: $('#pDesc').value,
        published: $('#pPub').checked, cards, penalties: $('#pPen').value.split('\n').map(s => s.trim()).filter(Boolean) } });
      packs[packs.findIndex(x => x.id === id)] = up; openPack(id); msg($('#saveMsg'), 'Saved ' + up.cards.length + ' cards.');
    } catch (err) { msg($('#saveMsg'), err.message, true); }
  };
  $('#delPack').onclick = async () => {
    if (!confirm('Delete the pack "' + p.name + '"? This cannot be undone.')) return;
    await api('/api/admin/packs/' + id, { method: 'DELETE' }); currentId = null; await loadPacks();
    $('#editor').innerHTML = '<p class="a-empty">Pack deleted.</p>';
  };
  $('#pImgFile').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 2 * 1024 * 1024) { msg($('#saveMsg'), 'Image too large (max 2 MB).', true); return; }
    const rd = new FileReader();
    rd.onload = async () => {
      try { const up = await api('/api/admin/packs/' + id + '/image', { method: 'POST', body: { dataUrl: rd.result } });
        packs[packs.findIndex(x => x.id === id)] = { ...packs.find(x => x.id === id), image: up.image }; $('#pImg').src = up.image; renderList(); msg($('#saveMsg'), 'Image uploaded.'); }
      catch (err) { msg($('#saveMsg'), err.message, true); }
    };
    rd.readAsDataURL(f);
  };
  $('#importFile').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const format = /\.csv$/i.test(f.name) || f.type === 'text/csv' ? 'csv' : 'json';
    const mode = document.querySelector('input[name=imode]:checked').value;
    if (mode === 'replace' && !confirm('Replace all cards in this pack?')) { e.target.value = ''; return; }
    const rd = new FileReader();
    rd.onload = async () => {
      try {
        const r = await api('/api/admin/packs/' + id + '/import', { method: 'POST', body: { format, mode, content: rd.result } });
        packs[packs.findIndex(x => x.id === id)] = r.pack; openPack(id);
        msg($('#importMsg'), `Imported ${r.imported} cards${r.penalties ? ' and ' + r.penalties + ' penalties' : ''}${r.skipped ? ', skipped ' + r.skipped + ' invalid' : ''}. Pack has ${r.pack.cards.length} cards.`);
      } catch (err) { msg($('#importMsg'), err.message, true); }
    };
    rd.readAsText(f);
  };
}

/* ideas */
async function loadIdeas() {
  const ideas = await api('/api/admin/ideas');
  $('#ideaCount').textContent = ideas.length ? '(' + ideas.length + ')' : '';
  const ul = $('#ideas'); ul.textContent = '';
  if (!ideas.length) { ul.innerHTML = '<li><div>No ideas yet.</div></li>'; return; }
  for (const i of ideas) {
    const li = document.createElement('li'), d = document.createElement('div');
    const p = document.createElement('p'); p.textContent = i.text;
    const s = document.createElement('small'); s.textContent = [i.name, i.email, new Date(i.createdAt).toLocaleString()].filter(Boolean).join(' / ');
    d.append(p, s);
    const b = document.createElement('button'); b.className = 'pill pill-ghost'; b.type = 'button'; b.textContent = 'Delete';
    b.onclick = async () => { await api('/api/admin/ideas/' + i.id, { method: 'DELETE' }); loadIdeas(); };
    li.append(d, b); ul.append(li);
  }
}
async function loadPen() { $('#defPen').value = (await api('/api/admin/penalties')).join('\n'); }
$('#saveDefPen').onclick = async () => {
  try { const l = await api('/api/admin/penalties', { method: 'PUT', body: { penalties: $('#defPen').value.split('\n') } }); $('#defPen').value = l.join('\n'); msg($('#defPenMsg'), 'Saved ' + l.length + ' penalties.'); }
  catch (err) { msg($('#defPenMsg'), err.message, true); }
};

fetch('/api/admin/me', { credentials: 'same-origin' }).then(r => (r.ok ? showApp() : showLogin())).catch(showLogin);
})();
