// App shell: screens, input, accounts, leaderboards, results.
import { Game } from './game.js';
import { W, H, SKIN, drawButt, drawMouse } from './render.js';
import { SKINS, SKIN_BY_ID } from '../shared/skins.js';
import { bonusItem } from '../shared/sim.js';
import * as audio from './audio.js';
import { t as tr, STR } from './i18n.js';
import { store, api, OFFLINE } from './api.js';
import { solvePow } from './pow.js';

store.load();
if (!store.d.lang) store.d.lang = /^(cs|sk)/i.test(navigator.language || '') ? 'cs' : 'en';
let lang = store.d.lang;
audio.setMuted(store.d.muted);
audio.setMusic(store.d.music !== false);

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString(lang === 'cs' ? 'cs-CZ' : 'en-US');
const T = (k, v) => tr(lang, k, v);

const canvas = $('#game');
const stage = $('#stage');
const ui = $('#ui');
let touchMode = false;
let MAPS = [], WORLDS = [];
let server = { scores: {}, total: null }; // from /api/me
let current = null; // current map
let screen = 'menu';
let boardReturn = 'menu';
let boardSel = 'total';

const game = new Game(canvas, {
  onFinish: (map, res) => showResults(map, res),
  onDeath: (info) => showGameOver(info),
  onBegin: () => { if (!curTicket && current) fetchTicket(current.id); }, // the map-open fetch failed (offline blip): retry per attempt
  isTouch: () => touchMode,
  onEnd: () => $('#btn-pause').classList.add('hidden'), // nothing to pause in the end scene
  // repeat runs of a finished map hide a bonus salmon; its place comes from this run's ticket
  bonus: (pm) => (curTicket && current && store.d.user && server.scores[current.id] ? bonusItem(pm, curTicket.split('.')[2]) : -1),
  // only the server knows if this run has a goldfish; it answers once the run is 20 % in
  goldfish: async () => {
    if (!curTicket || !store.d.user) return -1;
    for (let i = 0; i < 5; i++) {
      try { return (await api.goldfish(curTicket)).idx; } catch (e) { if (e.code !== 'too_early') return -1; }
      await new Promise((r) => setTimeout(r, 1000));
    }
    return -1;
  },
  onSlow: () => {
    if (dprCap <= 1) return;
    if (performance.now() - raisedAt < 30000) capLocked = true; // sharper was too much: stay at this level
    dprCap -= 0.5; fit();
  },
  onFast: () => { if (!capLocked && dprCap < 2) { dprCap += 0.5; raisedAt = performance.now(); fit(); } },
});
game.setLang(lang);
window.__slappy = game; // debug handle

// ---------------- layout ----------------
let dprCap = 2, capLocked = false, raisedAt = -1e9; // resolution cap, moved by game.watchFrame
function fit() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const s = Math.min(vw / W, vh / H);
  const cw = Math.floor(W * s), ch = Math.floor(H * s);
  stage.style.width = cw + 'px'; stage.style.height = ch + 'px';
  const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
  canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
  ui.style.transform = `scale(${cw / W}, ${ch / H})`;
}
window.addEventListener('resize', fit);
window.addEventListener('orientationchange', () => setTimeout(fit, 200));
fit();

// ---------------- i18n ----------------
function applyLang() {
  document.documentElement.lang = lang;
  for (const el of $$('[data-t]')) el.textContent = T(el.dataset.t);
  $('#help-list').innerHTML = STR[lang].helpBody.map((l) => `<li>${l}</li>`).join('');
  game.setLang(lang);
  refreshMenu();
}

function refreshMenu() {
  $('#btn-sound').textContent = `🔊 ${T('sound')}: ${audio.isMuted() ? T('off') : T('on')}`;
  $('#btn-lang').textContent = `🌐 ${T('lang')}`;
  $('#btn-music').textContent = `🎵 ${T('music')}: ${audio.musicOn() ? T('on') : T('off')}`;
  $('#btn-ghost').textContent = `👻 ${T('ghostOn')}: ${store.d.ghost ? T('on') : T('off')}`;
  $('#btn-account').textContent = store.d.user ? `👤 ${store.d.user.name}` : T('login');
  $('#who').textContent = store.d.user
    ? T('hello', { name: store.d.user.name }) + (server.total && server.total.maps ? ` ${T('total')}: ${fmt(server.total.total)} (#${server.total.rank})` : '')
    : T(OFFLINE ? 'offline' : 'guest');
  for (const el of $$('[data-act=board], #btn-account')) el.classList.toggle('hidden', OFFLINE);
  const shopOk = !OFFLINE && !!store.d.user; // the market is for logged-in players
  $('#btn-shop').classList.toggle('hidden', !shopOk);
  $('.menu-buttons').classList.toggle('solo', !shopOk);
}

// ---------------- screens ----------------
function show(name) {
  screen = name;
  for (const s of $$('.screen')) s.classList.toggle('hidden', s.id !== 'scr-' + name);
  $('#btn-pause').classList.toggle('hidden', name !== 'play');
  // the map's tune while playing (also paused / after a crash), a calmer menu tune everywhere else
  if (name === 'play') { if (current) audio.music(current.id, current.speed); } else if (name !== 'pause' && name !== 'over') audio.music(0, 3);
  if (name === 'menu') { refreshMenu(); startDemo(); }
  if (name === 'maps') { renderMaps(); startDemo(); }
  if (name === 'board') loadBoard(boardSel);
  if (name === 'auth') renderAuth();
  if (name === 'help') startDemo();
  if (name === 'shop') openShop();
  const first = document.querySelector(`#scr-${name} .btn.primary:not(.hidden)`) || document.querySelector(`#scr-${name} .btn`);
  if (first && !touchMode && name !== 'auth') first.focus({ preventScroll: true });
}

function startDemo() {
  if (game.mode === 'demo' || !MAPS.length) return;
  game.load(MAPS[0], { demo: true });
}

// ---------------- maps ----------------
const isDone = (id) => store.completed(id) || !!server.scores[id];
const unlocked = (i) => i === 0 || isDone(MAPS[i - 1].id) || isDone(MAPS[i].id);
const bestOf = (id) => Math.max(store.best(id)?.score || 0, server.scores[id]?.score || 0);

function renderMaps() {
  const g = $('#map-grid');
  g.innerHTML = MAPS.map((m, i) => {
    const open = unlocked(i), done = isDone(m.id), best = bestOf(m.id), rank = server.scores[m.id]?.rank;
    const fish = Math.max(store.best(m.id)?.salmon || 0, server.scores[m.id]?.salmon || 0);
    const meta = !open ? T('lockedHint') : best ? `${T('best')}: ${fmt(best)}${rank ? ` · #${rank}` : ''} · 🐟 ${fish}/3` : T('notPlayed');
    const head = WORLDS[m.world] && (i === 0 || MAPS[i - 1].world !== m.world) ? `<h3 class="world">${WORLDS[m.world].icon || ''} ${esc(WORLDS[m.world][lang])}</h3>` : '';
    return `${head}<button class="map c${i % 20}${open ? '' : ' locked'}" data-map="${m.id}" ${open ? '' : 'aria-disabled="true"'}>
      <span class="badge">${!open ? '🔒' : done ? '✅' : '🐭'}</span>
      <div class="num">${m.id}.</div><div class="name">${esc(m.name[lang])}</div><div class="meta">${esc(meta)}</div></button>`;
  }).join('');
  const doneN = MAPS.filter((m) => isDone(m.id)).length;
  const sum = MAPS.reduce((a, m) => a + bestOf(m.id), 0);
  $('#maps-sum').textContent = `${T('mapsDone')}: ${doneN}/${MAPS.length} · ${T('total')}: ${fmt(sum)}`;
  $('#maps-note').textContent = doneN === MAPS.length ? T('allDone') : (store.d.user ? '' : T(OFFLINE ? 'offline' : 'guest'));
}

$('#map-grid').addEventListener('click', (e) => {
  const b = e.target.closest('.map');
  if (!b) return;
  const i = MAPS.findIndex((m) => m.id === Number(b.dataset.map));
  if (!unlocked(i)) { audio.sfx('click'); b.animate([{ transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'none' }], { duration: 200 }); return; }
  playMap(MAPS[i]);
});

// Run ticket: signed by the server when a map is opened. A finished run must be
// uploaded with it, and not sooner than the run could really have been played.
let curTicket = null;
async function fetchTicket(mapId) {
  curTicket = null;
  try { const r = await api.ticket(mapId); if (current && current.id === mapId) curTicket = r.ticket; } catch { /* offline */ }
}

function playMap(map) {
  if (!current || current.id !== map.id || !curTicket) { current = map; fetchTicket(map.id); }
  current = map;
  const local = store.best(map.id), srv = server.scores[map.id];
  let ghost = null;
  if (store.d.ghost) ghost = (srv && (!local || srv.score > local.score) ? srv.inputs : local?.inputs) || null;
  game.load(map, { ghost, best: bestOf(map.id) });
  show('play');
  audio.sfx('go');
}

// ---------------- results ----------------
const CAUSES = {
  cs: { spike: 'Bodlina!', box: 'Bedna!', beam: 'Trám!', pipe: 'Trubka!', wall: 'Náraz do zdi!', fall: 'Spadla do díry!', timeout: 'Došel čas!', foil: 'Kulička alobalu!' },
  en: { spike: 'Spikes!', box: 'A crate!', beam: 'A beam!', pipe: 'A pipe!', wall: 'Hit the wall!', fall: 'Fell into a hole!', timeout: 'Out of time!', foil: 'A foil ball!' },
};
let overAt = 0;
function showGameOver(info) {
  const pct = (x) => Math.floor(Math.max(0, Math.min(1, x)) * 100) + ' %';
  $('#over-cause').textContent = CAUSES[lang][info.cause] || CAUSES[lang].wall;
  $('#over-body').innerHTML = `<div class="lines">
    <div><span>${esc(T('progress'))}</span><span>${pct(info.progress)}</span></div>
    <div><span>${esc(T('bestProgress'))}</span><span>${pct(info.best)}</span></div>
    <div><span>${esc(T('attempts'))}</span><span>${info.attempt}</span></div></div>`;
  overAt = performance.now();
  rightHolders.clear();
  show('over');
}
function retryAfterDeath() {
  if (screen !== 'over' || performance.now() - overAt < 350) return;
  show('play'); game.restart();
}

async function showResults(map, res) {
  if (!res || res.replay) { game.stop(); show('board'); return; }
  res.ticket = curTicket;
  const noTicket = !curTicket;
  fetchTicket(map.id); // the next run needs a fresh one
  const improvedLocal = store.offer(map.id, res);
  const prevBest = server.scores[map.id]?.score || 0;
  const tot = (k) => map.items.filter((i) => (i.kind || 'cheese') === k).length;
  const lines = [
    [T('cheese'), `${res.cheese}/${tot('cheese')} × 100`],
    tot('gold') ? [T('gold'), `${res.gold}/${tot('gold')} × 500`] : null,
    [T('salmon'), `${res.salmon}/${tot('salmon')} × 1000`],
    [T('close'), `${res.close} × 25`],
    [T('finishBonus'), '1000'],
  ].filter(Boolean);
  const perfect = res.items === res.itemsTotal;
  const idx = MAPS.findIndex((m) => m.id === map.id);
  $('#btn-next').classList.toggle('hidden', idx >= MAPS.length - 1);
  $('#result-body').innerHTML = `<div class="lines">${lines.map(([a, b]) => `<div><span>${esc(a)}</span><span>${esc(b)}</span></div>`).join('')}
    <div class="tot"><span>${T('score')}</span><span>${fmt(res.score)}</span></div></div>
    <p class="perfect">${perfect ? esc(T('perfect')) : esc(T('missing', { n: res.itemsTotal - res.items }))}</p>
    <p class="flag" id="res-flag">${improvedLocal || res.score > prevBest ? T('newBest') : `${T('yourBest')}: ${fmt(Math.max(bestOf(map.id), res.score))}`}</p>
    <p class="note" id="res-status">${OFFLINE ? T('offline') : noTicket ? T('noTicket') : store.d.user ? T('saving') : T('loginToSave')}</p>
    <p class="note">${T('attempts')}: ${res.attempts}</p>`;
  show('results');
  if (improvedLocal) game.celebrate();
  if (!store.d.user || noTicket) return;
  try {
    const r = await api.submit(map.id, res.inputs, res.attempts, res.ticket);
    if (r.finished) {
      server.scores[map.id] = { ...(server.scores[map.id] || {}), score: r.best, rank: r.rank, inputs: r.improved ? res.inputs : server.scores[map.id]?.inputs };
      server.total = r.total;
      store.d.synced[map.id] = Math.max(store.d.synced[map.id] || 0, res.score); store.save();
      $('#res-status').textContent = `${T('saved')} · ${T('placed', { rank: r.rank, n: r.players })} · ${T('total')}: ${fmt(r.total.total)} (#${r.total.rank})` +
        (r.earned ? ` · ${T('walletGain', { n: r.earned, b: r.wallet })}` : '');
      if (store.d.shop && r.wallet != null) { store.d.shop.balance = r.wallet; store.save(); }
      if (r.improved) { $('#res-flag').textContent = T('newBest'); if (!improvedLocal) game.celebrate(); }
    }
  } catch (e) {
    $('#res-status').textContent = e.code === 'network' ? T('saveFailed') : T('err_' + e.code);
  }
}

// ---------------- leaderboard ----------------
function renderTabs() {
  $('#board-tabs').innerHTML = `<button class="tab${boardSel === 'total' ? ' active' : ''}" data-board="total">🏆 ${T('totalBoard')}</button>` +
    MAPS.map((m) => `<button class="tab${String(boardSel) === String(m.id) ? ' active' : ''}" data-board="${m.id}" title="${esc(m.name[lang])}">${m.id}</button>`).join('');
}
$('#board-rows').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-watch]');
  if (!b || boardSel === 'total') return;
  audio.initAudio();
  const map = MAPS.find((m) => String(m.id) === String(boardSel));
  try {
    const r = await api.replay(map.id, b.dataset.watch);
    current = map;
    boardReturn = 'menu';
    game.load(map, { replay: r.inputs, replayName: `${r.name} · ${fmt(r.score)}` });
    show('play');
  } catch (ex) { $('#board-me').textContent = T('err_' + (ex.code || 'network')); }
});
$('#board-tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-board]');
  if (b) loadBoard(b.dataset.board);
});

async function loadBoard(sel) {
  boardSel = sel;
  renderTabs();
  const rows = $('#board-rows');
  rows.innerHTML = '<tr><td>…</td></tr>';
  const mapName = sel === 'total' ? T('totalHint') : `${sel}. ${MAPS.find((m) => String(m.id) === String(sel))?.name[lang] || ''}`;
  $('#board-sum').textContent = mapName;
  try {
    const d = await api.board(sel, 100);
    if (boardSel !== sel) return;
    const me = store.d.user?.name;
    const head = sel === 'total' ? `<tr class="head"><td></td><td>${T('colPlayer')}</td><td class="m">🐟</td><td class="m" title="${esc(T('colEarnedHint'))}">${T('colEarned')}</td><td class="m" title="${esc(T('colGoldHint'))}">🐠</td><td class="m">${T('colMaps')}</td><td class="s">${T('colScore')}</td></tr>` : '';
    rows.innerHTML = d.rows.length ? head + d.rows.map((r) => `<tr class="${r.name === me ? 'me' : ''}"><td class="r">${r.rank}.</td><td>${esc(r.name)}</td>` +
      (sel === 'total' ? `<td class="m">🐟 ${r.salmon || 0}/${d.salmonTotal}</td><td class="m">${Number(r.earned) || 0}</td><td class="m">${Number(r.goldfish) || 0}</td><td class="m">${r.maps}/${d.mapCount} ${r.maps === d.mapCount ? '👑' : ''}</td><td class="s">${fmt(r.total)}</td>`
        : `<td class="m">🧀${r.cheese}${r.gold ? ` ⭐${r.gold}` : ''} 🐟${r.salmon}/${d.salmonTotal}${r.perfect ? ' ✨' : ''}</td><td class="s">${fmt(r.score)}</td><td class="w"><button class="tab" data-watch="${esc(r.name)}" title="${esc(T('watch'))}" aria-label="${esc(T('watch'))}"><svg viewBox="0 0 10 10" width="12" height="12"><path d="M2 1 L9 5 L2 9Z" fill="currentColor"/></svg></button></td>`) + '</tr>').join('')
      : `<tr><td>${T('emptyBoard')}</td></tr>`;
    $('#board-me').textContent = d.me ? `${T('you')}: #${d.me.rank} · ${fmt(sel === 'total' ? d.me.total : d.me.score)} · ${d.players} ${T('players')}` : (store.d.user ? `${d.players} ${T('players')}` : T('loginToSave'));
  } catch (e) {
    rows.innerHTML = `<tr><td>${esc(T('err_' + (e.code || 'network')))}</td></tr>`;
  }
}

// ---------------- auth ----------------
let authTab = 'login';
function renderAuth() {
  const inn = !!store.d.user;
  $('#auth-out').classList.toggle('hidden', inn);
  $('#auth-in').classList.toggle('hidden', !inn);
  if (inn) {
    $('#auth-hello').textContent = T('hello', { name: store.d.user.name });
    const done = MAPS.filter((m) => server.scores[m.id]).length;
    $('#auth-stats').textContent = `${T('mapsDone')}: ${done}/${MAPS.length}` + (server.total && server.total.maps ? ` · ${T('total')}: ${fmt(server.total.total)} · #${server.total.rank}` : '');
  } else {
    setAuthTab(authTab);
    setTimeout(() => !touchMode && $('#f-name').focus(), 30);
  }
}
function setAuthTab(tab) {
  authTab = tab;
  for (const b of $$('#auth-out .tab')) b.classList.toggle('active', b.dataset.tab === tab);
  $('#row-pass2').classList.toggle('hidden', tab !== 'register');
  $('#f-pass').autocomplete = tab === 'register' ? 'new-password' : 'current-password';
  $('#auth-submit').textContent = T(tab === 'register' ? 'register' : 'login');
  $('#auth-err').textContent = '';
  validateAuth();
}

// live checks while typing (same rules as the server)
const NAME_RE = /^[\p{Script=Latin}0-9_.-]{3,16}$/u; // same rule as the server
function hint(id, txt, cls) { const el = $(id); el.textContent = txt; el.className = 'hint' + (cls ? ' ' + cls : ''); }
function validateAuth() {
  const name = $('#f-name').value.trim(), pw = $('#f-pass').value, pw2 = $('#f-pass2').value;
  const reg = authTab === 'register';
  const nameOk = NAME_RE.test(name), pwOk = pw.length >= 8 && pw.length <= 200, pw2Ok = pw === pw2;
  if (reg) {
    hint('#h-name', name && !nameOk ? T('nameHint') : (nameOk ? '✔' : T('nameHint')), name ? (nameOk ? 'ok' : 'bad') : '');
    hint('#h-pass', !pw ? T('passHint') : pwOk ? T('passOk') : `${T('passHint')} (${pw.length}/8)`, pw ? (pwOk ? 'ok' : 'bad') : '');
    hint('#h-pass2', pw2 && !pw2Ok ? T('pass2Hint') : (pw2 && pw2Ok ? '✔' : ''), pw2 ? (pw2Ok ? 'ok' : 'bad') : '');
  } else { hint('#h-name', ''); hint('#h-pass', ''); hint('#h-pass2', ''); }
  const valid = reg ? nameOk && pwOk && pw2Ok : name.length > 0 && pw.length > 0;
  $('#auth-submit').disabled = !valid || authBusy;
  return valid;
}
let authBusy = false;
for (const id of ['#f-name', '#f-pass', '#f-pass2']) $(id).addEventListener('input', validateAuth);
$('#auth-out .tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) setAuthTab(b.dataset.tab); });

$('#auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#f-name').value.trim(), pw = $('#f-pass').value;
  const err = $('#auth-err');
  if (authTab === 'register' && pw !== $('#f-pass2').value) { err.textContent = T('err_mismatch'); return; }
  if (!validateAuth()) return;
  authBusy = true;
  $('#auth-submit').disabled = true;
  try {
    let r;
    if (authTab === 'register') {
      // proof of work: a second or so for a human, expensive for a script registering thousands of accounts
      err.className = 'err note'; err.textContent = T('robotWhy');
      const c = await api.challenge();
      let dots = 0;
      const pow = await solvePow(c.challenge, c.bits, () => { err.textContent = T('robotWhy') + ' ' + '●'.repeat(1 + (dots++ % 5)); });
      err.textContent = ''; err.className = 'err';
      r = await api.register(name, pw, c.challenge, pow);
    } else r = await api.login(name, pw);
    store.d.token = r.token; store.d.user = r.user; store.d.synced = {}; store.save();
    $('#f-pass').value = ''; $('#f-pass2').value = '';
    await syncWithServer();
    show('menu');
  } catch (ex) {
    err.textContent = T('err_' + (ex.code || 'network'));
  } finally { authBusy = false; err.className = 'err'; validateAuth(); }
});

// upload local bests the server doesn't have yet, then pull server bests
async function syncWithServer() {
  if (!store.d.token) return;
  try {
    let me = await api.me();
    let uploaded = false;
    for (const m of MAPS) {
      const local = store.best(m.id);
      const srv = me.scores[m.id];
      if (local && local.inputs && (!srv || local.score > srv.score)) {
        try { await api.submit(m.id, local.inputs, 0, local.ticket); uploaded = true; } catch { /* invalid/old run: ignore */ }
      }
    }
    if (uploaded) me = await api.me();
    server = { scores: me.scores, total: me.total };
    store.d.user = me.user; applyShop(me.shop);
  } catch { /* offline: keep local */ }
  refreshMenu();
}

// ---------------- market ----------------
let shopKind = 'cat', shopSel = null;
function applyShop(shop) { // what the player owns + wears; drawn everywhere through render.SKIN
  store.d.shop = shop || null; store.save();
  SKIN.cat = (shop && SKIN_BY_ID.get(shop.cat)) || null;
  SKIN.mouse = (shop && SKIN_BY_ID.get(shop.mouse)) || null;
}
if (store.d.user && store.d.shop) applyShop(store.d.shop);

function openShop() {
  if (!store.d.user) { show('auth'); return; }
  shopSel = null; $('#shop-err').textContent = '';
  renderShop();
  api.shop().then((s) => { applyShop(s); if (screen === 'shop') renderShop(); }).catch((e) => { $('#shop-err').textContent = T('err_' + (e.code || 'network')); });
  requestAnimationFrame(shopPreview);
}

function renderShop() {
  const sh = store.d.shop || { balance: 0, owned: [], cat: 'cat:ginger', mouse: 'mouse:mouse-grey' };
  $('#shop-sum').textContent = T('shopBalance', { n: sh.balance });
  for (const t of $$('#shop-tabs .tab')) t.classList.toggle('active', t.dataset.kind === shopKind);
  const worn = sh[shopKind];
  if (!shopSel || SKIN_BY_ID.get(shopSel).kind !== shopKind) shopSel = worn;
  const owns = (s) => s.price === 0 || sh.owned.includes(s.id);
  $('#shop-grid').innerHTML = SKINS.filter((s) => s.kind === shopKind).map((s) =>
    `<button class="sw${owns(s) ? ' own' : ''}${s.id === worn ? ' on' : ''}${s.id === shopSel ? ' sel' : ''}" data-skin="${s.id}" title="${esc(s.name[lang])}" aria-label="${esc(s.name[lang])}">` +
    `<i style="background:${s.hex}"></i>${s.id === worn ? '✔' : owns(s) ? '' : s.price + '🐟'}</button>`).join('');
  const s = SKIN_BY_ID.get(shopSel), btn = $('#shop-act');
  $('#shop-name').textContent = s.name[lang] + (s.price === 0 ? ` (${T('shopFree')})` : '');
  btn.disabled = false;
  if (s.id === worn) { btn.textContent = T('shopEquipped'); btn.disabled = true; }
  else if (owns(s)) btn.textContent = T('shopEquip');
  else if (sh.balance < s.price) { btn.textContent = T('shopShort', { n: s.price - sh.balance }); btn.disabled = true; }
  else btn.textContent = T('shopBuy', { n: s.price });
}

// live preview of the selected colour: the cat's behind and the running mouse
function shopPreview(now) {
  if (screen !== 'shop') return;
  requestAnimationFrame(shopPreview);
  const cv = $('#shop-preview'), c = cv.getContext('2d'), sel = SKIN_BY_ID.get(shopSel);
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height);
  const cat = sel && sel.kind === 'cat' ? sel : SKIN.cat, mouse = sel && sel.kind === 'mouse' ? sel : SKIN.mouse;
  drawButt(c, 260, 220, { left: -1e6, right: -1e6, rightHeld: false }, now, lang, 1.15, { cat: cat || { hex: '#f39c34', dark: '#c96f1c' } });
  c.save(); c.translate(190, 425); c.scale(3, 3);
  drawMouse(c, 0, 0, { t: now, pal: mouse || { hex: '#b8b2c8' } });
  c.restore();
}

$('#shop-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-kind]'); if (b) { shopKind = b.dataset.kind; shopSel = null; renderShop(); } });
$('#shop-grid').addEventListener('click', (e) => { const b = e.target.closest('[data-skin]'); if (b) { shopSel = b.dataset.skin; $('#shop-err').textContent = ''; renderShop(); } });
$('#shop-act').addEventListener('click', async () => {
  const s = SKIN_BY_ID.get(shopSel), sh = store.d.shop;
  if (!s || !sh) return;
  const buying = s.price > 0 && !sh.owned.includes(s.id);
  $('#shop-act').disabled = true;
  try {
    applyShop(await (buying ? api.buy(s.id) : api.equip(s.id)));
    if (buying) { audio.sfx('salmon'); game.celebrate(); }
    $('#shop-err').textContent = '';
  } catch (e) { $('#shop-err').textContent = T('err_' + (e.code || 'network')); }
  renderShop();
});

// ---------------- buttons ----------------
ui.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  audio.initAudio();
  audio.sfx('click');
  const a = b.dataset.act;
  switch (a) {
    case 'menu': show('menu'); break;
    case 'maps': rightHolders.clear(); game.stop(); show('maps'); break;
    case 'board': boardReturn = screen; boardSel = 'total'; show('board'); break;
    case 'mapboard': boardReturn = screen; boardSel = String(current?.id || 'total'); show('board'); break;
    case 'back': if (boardReturn === 'results') show('results'); else show(boardReturn === 'play' ? 'menu' : boardReturn || 'menu'); break;
    case 'auth': show('auth'); break;
    case 'help': show('help'); break;
    case 'shop': show('shop'); break;
    case 'sound': audio.setMuted(!audio.isMuted()); store.d.muted = audio.isMuted(); store.save(); refreshMenu(); break;
    case 'lang': lang = lang === 'cs' ? 'en' : 'cs'; store.d.lang = lang; store.save(); applyLang(); break;
    case 'music': audio.setMusic(!audio.musicOn()); store.d.music = audio.musicOn(); store.save(); refreshMenu(); break;
    case 'ghost': store.d.ghost = !store.d.ghost; store.save(); refreshMenu(); break;
    case 'logout':
      // local bests belong to the account that is logging out (they're on the server already)
      api.logout().catch(() => {}); applyShop(null); store.d.token = null; store.d.user = null; store.d.bests = {}; store.d.synced = {};
      server = { scores: {}, total: null }; store.save(); show('menu'); break;
    case 'retry': if (screen === 'over') { show('play'); game.restart(); } else if (current) playMap(current); break;
    case 'next': {
      const i = MAPS.findIndex((m) => m.id === current?.id);
      if (i >= 0 && i < MAPS.length - 1) playMap(MAPS[i + 1]); else show('maps');
      break;
    }
    case 'resume': show('play'); game.resume(); break;
  }
});
$('#btn-pause').addEventListener('click', () => doPause());

function doPause() { rightHolders.clear(); if (game.pause()) show('pause'); }

// ---------------- input ----------------
const LEFT = new Set(['KeyA', 'ArrowLeft']), RIGHT = new Set(['KeyD', 'ArrowRight']);
const SLAP_SCREENS = new Set(['play', 'menu', 'results', 'help']);
// several sources can hold the right cheek (D, →, a finger, a gamepad button)
const rightHolders = new Set();
function pressSide(side, src) {
  if (screen === 'over') { retryAfterDeath(); return; }
  if (!SLAP_SCREENS.has(screen)) return;
  if (side === 'right') { const first = rightHolders.size === 0; rightHolders.add(src); if (!first) return; }
  game.press(side);
}
function releaseSide(side, src) {
  if (side !== 'right' || !rightHolders.has(src)) return;
  rightHolders.delete(src);
  if (rightHolders.size === 0) game.release('right');
}
function releaseAll() { for (const s of [...rightHolders]) releaseSide('right', s); }

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return; // leave browser shortcuts alone
  audio.initAudio();
  if (LEFT.has(e.code) || RIGHT.has(e.code)) {
    e.preventDefault();
    if (e.repeat) return;
    pressSide(LEFT.has(e.code) ? 'left' : 'right', 'key:' + e.code);
    return;
  }
  if (screen === 'over' && (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyR')) { e.preventDefault(); retryAfterDeath(); return; }
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (screen === 'play') doPause();
    else if (screen === 'pause') { show('play'); game.resume(); }
    else if (screen === 'board') document.querySelector('#scr-board [data-act=back]').click();
    else if (screen !== 'menu') show('menu');
  } else if (e.code === 'KeyR' && (screen === 'play' || screen === 'pause' || screen === 'results') && current) {
    releaseAll(); playMap(current);
  } else if (e.code === 'Enter' && screen === 'results' && document.activeElement === document.body) {
    $('#btn-next').classList.contains('hidden') ? playMap(current) : $('#btn-next').click();
  }
});

window.addEventListener('keyup', (e) => { if (RIGHT.has(e.code)) releaseSide('right', 'key:' + e.code); });

canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch') touchMode = true;
  audio.initAudio();
  const r = canvas.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * H;
  const side = x < W / 2 ? 'left' : 'right';
  // in game the whole half of the screen is the cheek; on menus only the butt itself
  if (screen === 'play' || (y > 380 && Math.abs(x - W / 2) < 120)) {
    e.preventDefault();
    if (side === 'right') try { canvas.setPointerCapture(e.pointerId); } catch { /* old Safari */ }
    pressSide(side, 'ptr:' + e.pointerId);
  }
});
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(ev, (e) => releaseSide('right', 'ptr:' + e.pointerId));
// iOS/Safari unlock audio on the first real gesture end as well
for (const ev of ['pointerup', 'touchend', 'click', 'keydown']) document.addEventListener(ev, () => audio.initAudio(), { passive: true, capture: true });
if (matchMedia('(pointer: coarse)').matches) touchMode = true;
// iOS: no long-press magnifier / callout
canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => { if (e.target === canvas) e.preventDefault(); });

// gamepads: LB / d-pad left / X = left cheek, RB / d-pad right / B = right cheek
const padPrev = new Map();
function pollPads() {
  requestAnimationFrame(pollPads);
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) {
    if (!p) continue;
    const pressed = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
    const left = pressed(4) || pressed(14) || pressed(2) || pressed(6), right = pressed(5) || pressed(15) || pressed(1) || pressed(7);
    const start = pressed(9);
    const prev = padPrev.get(p.index) || {};
    if (left && !prev.left) { audio.initAudio(); pressSide('left', 'pad'); }
    if (right && !prev.right) { audio.initAudio(); pressSide('right', 'pad' + p.index); }
    if (!right && prev.right) releaseSide('right', 'pad' + p.index);
    if (start && !prev.start) { if (screen === 'play') doPause(); else if (screen === 'pause') { show('play'); game.resume(); } }
    padPrev.set(p.index, { left, right, start });
  }
}
window.addEventListener('gamepadconnected', () => { if (!padPrev.size) pollPads(); padPrev.set(-1, {}); });

document.addEventListener('visibilitychange', () => { if (document.hidden) { releaseAll(); if (screen === 'play') doPause(); } });
window.addEventListener('blur', () => { releaseAll(); if (screen === 'play' && game.mode === 'play') doPause(); });

// ---------------- boot ----------------
(async function boot() {
  applyLang();
  try { await document.fonts.load('20px "Patrick Hand"'); } catch { /* fine */ }
  for (let attempt = 0; attempt < 3 && !MAPS.length; attempt++) {
    try {
      const res = await fetch('shared/maps.json');
      if (res.ok) ({ maps: MAPS, worlds: WORLDS = [] } = await res.json());
    } catch { /* retry */ }
    if (!MAPS.length) await new Promise((r) => setTimeout(r, 1500));
  }
  if (!MAPS.length) { $('#who').textContent = T('bootFail'); $('[data-act=maps]').disabled = true; return; }
  show('menu');
  syncWithServer();
})();
