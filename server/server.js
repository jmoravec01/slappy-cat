// Slappy Cat server: static files + tiny JSON API + SQLite (node:sqlite).
// Zero npm dependencies. Scores are never trusted: the client uploads its
// input log and the server re-simulates the run with the shared engine.
import http from 'node:http';
import { isIP } from 'node:net';
import { readFileSync, statSync, mkdirSync } from 'node:fs';
import { join, normalize, extname, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual, createHash, createHmac } from 'node:crypto';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { prepareMap, runReplay, bonusItem } from '../shared/sim.js';
import { SKIN_BY_ID, DEFAULT as DEFAULT_SKIN } from '../shared/skins.js';

const scrypt = promisify(scryptCb);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR || join(ROOT, 'data');
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
// pages allowed to call the API from another origin, e.g. a GitHub Pages copy: "https://you.github.io"
const CORS_ORIGINS = new Set((process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean));
const SESSION_DAYS = 365;
const POW_BITS = Number(process.env.POW_BITS || 17);       // registration proof-of-work difficulty
const TICKET_MAX_AGE = 30 * 864e5;                          // a run ticket stays valid for 30 days
// a run cannot be submitted faster than it takes to play it (ratio of real time, minus latency slack)
const runTimeRatio = () => Number(process.env.RUN_TIME_RATIO ?? 0.9);
const goldfishOdds = () => Number(process.env.GOLDFISH_ODDS || 20); // 1 in N runs of a logged-in player
const GOLDFISH_PAY = 10;

// ---------- maps ----------
const MAPS_RAW = readFileSync(join(ROOT, 'shared/maps.json'), 'utf8');
const MAPS = JSON.parse(MAPS_RAW).maps;
const PM = new Map(MAPS.map((m) => [m.id, prepareMap(m)]));
const PREV_MAP = new Map(MAPS.map((m, i) => [m.id, i ? MAPS[i - 1].id : null])); // maps unlock in order

// ---------- database ----------
mkdirSync(DATA_DIR, { recursive: true });
export const db = new DatabaseSync(process.env.DB_PATH || join(DATA_DIR, 'slappy.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    pass TEXT NOT NULL,
    created INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS scores (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    map_id INTEGER NOT NULL,
    score INTEGER NOT NULL,
    cheese INTEGER NOT NULL,
    gold INTEGER NOT NULL,
    close INTEGER NOT NULL,
    ticks INTEGER NOT NULL,
    inputs TEXT NOT NULL,
    achieved INTEGER NOT NULL,
    PRIMARY KEY (user_id, map_id)
  );
  CREATE INDEX IF NOT EXISTS scores_map ON scores(map_id, score DESC, achieved);
  CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS used_tickets (nonce TEXT PRIMARY KEY, expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS owned (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item TEXT NOT NULL,
    bought INTEGER NOT NULL,
    PRIMARY KEY (user_id, item)
  );
  CREATE TABLE IF NOT EXISTS salmon_paid (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    map_id INTEGER NOT NULL,
    idx INTEGER NOT NULL,
    PRIMARY KEY (user_id, map_id, idx)
  );
  -- run tickets issued to logged-in players, with their secret goldfish roll (idx -1 = no goldfish)
  CREATE TABLE IF NOT EXISTS rolls (
    nonce TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    map_id INTEGER NOT NULL,
    ticket TEXT NOT NULL,
    issued INTEGER NOT NULL,
    gold_idx INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS rolls_open ON rolls(user_id, map_id, issued);
  CREATE TABLE IF NOT EXISTS attempts (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    map_id INTEGER NOT NULL,
    runs INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, map_id)
  );
`);

if (!db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'banned')) {
  db.exec('ALTER TABLE users ADD COLUMN banned INTEGER NOT NULL DEFAULT 0');
}
if (!db.prepare('PRAGMA table_info(scores)').all().some((c) => c.name === 'salmon')) {
  db.exec('ALTER TABLE scores ADD COLUMN salmon INTEGER NOT NULL DEFAULT 0');
}
const ITEMS = new Map(MAPS.map((m) => [m.id, { total: m.items.length, salmon: m.items.filter((i) => i.kind === 'salmon').length }]));
const SALMON_TOTAL = [...ITEMS.values()].reduce((a, b) => a + b.salmon, 0);
// Names that look alike share a key, so nobody can register a lookalike of another player:
// case, accents and the usual digit/letter swaps are folded (Tomáš = tomas = T0MAS, Il1 = lll).
export const nameKey = (n) => n.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[1i|]/g, 'l').replace(/0/g, 'o');
if (!db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'name_key')) {
  db.exec('ALTER TABLE users ADD COLUMN name_key TEXT');
  const set = db.prepare('UPDATE users SET name_key = ? WHERE id = ?'), seen = new Set();
  for (const u of db.prepare('SELECT id, name FROM users ORDER BY id').all()) {
    const k = nameKey(u.name); // an older lookalike keeps its login under name#id
    set.run(seen.has(k) ? `${k}#${u.id}` : k, u.id); seen.add(k);
  }
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_name_key ON users (name_key)');
if (!db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'goldfish')) db.exec('ALTER TABLE users ADD COLUMN goldfish INTEGER NOT NULL DEFAULT 0');
// market wallet: every salmon from a verified finished run is earned once; skins are paid from it
if (!db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'salmon_earned')) {
  db.exec(`ALTER TABLE users ADD COLUMN salmon_earned INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN salmon_spent INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN skin_cat TEXT;
    ALTER TABLE users ADD COLUMN skin_mouse TEXT;
    UPDATE users SET salmon_earned = (SELECT COALESCE(SUM(salmon), 0) FROM scores WHERE user_id = users.id);`);
}

const metaGet = (k) => db.prepare('SELECT v FROM meta WHERE k = ?').get(k)?.v;
const metaSet = (k, v) => db.prepare('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v').run(k, v);

// server secret for signing run tickets and registration challenges
let SECRET = process.env.TICKET_SECRET || metaGet('secret');
if (!SECRET) { SECRET = randomBytes(32).toString('base64url'); metaSet('secret', SECRET); }

// a changed map invalidates every stored run on it (the server re-simulates runs)
for (const m of MAPS) {
  const { demo, difficulty, ...layout } = m;
  const h = createHash('sha256').update(JSON.stringify(layout)).digest('hex').slice(0, 16);
  const key = 'maphash:' + m.id, old = metaGet(key);
  if (old && old !== h) {
    const n = db.prepare('DELETE FROM scores WHERE map_id = ?').run(m.id).changes;
    db.prepare('DELETE FROM salmon_paid WHERE map_id = ?').run(m.id); // its salmon moved: they pay again
    console.log(`map ${m.id} changed: removed ${n} stored runs`);
  }
  if (old !== h) metaSet(key, h);
}

const q = {
  userByName: db.prepare('SELECT id, name, pass, banned FROM users WHERE name_key = ?'),
  userByExactName: db.prepare('SELECT id, name, pass, banned FROM users WHERE name = ?'), // lookalikes from before name_key
  insertUser: db.prepare('INSERT INTO users (name, pass, created, name_key) VALUES (?, ?, ?, ?)'),
  insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, expires) VALUES (?, ?, ?)'),
  session: db.prepare('SELECT u.id, u.name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires > ? AND u.banned = 0'),
  ticketUsed: db.prepare('SELECT 1 FROM used_tickets WHERE nonce = ?'),
  useTicket: db.prepare('INSERT OR IGNORE INTO used_tickets (nonce, expires) VALUES (?, ?)'),
  purgeTickets: db.prepare('DELETE FROM used_tickets WHERE expires <= ?'),
  deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
  purgeSessions: db.prepare('DELETE FROM sessions WHERE expires <= ?'),
  myScores: db.prepare('SELECT map_id, score, cheese, gold, salmon, close, ticks, inputs FROM scores WHERE user_id = ?'),
  getScore: db.prepare('SELECT score FROM scores WHERE user_id = ? AND map_id = ?'),
  upsertScore: db.prepare(`INSERT INTO scores (user_id, map_id, score, cheese, gold, salmon, close, ticks, inputs, achieved)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (user_id, map_id) DO UPDATE SET score = excluded.score, cheese = excluded.cheese, gold = excluded.gold, salmon = excluded.salmon,
      close = excluded.close, ticks = excluded.ticks, inputs = excluded.inputs, achieved = excluded.achieved`),
  bumpAttempts: db.prepare(`INSERT INTO attempts (user_id, map_id, runs) VALUES (?, ?, ?)
    ON CONFLICT (user_id, map_id) DO UPDATE SET runs = runs + excluded.runs`),
  mapBoard: db.prepare(`SELECT u.name, s.score, s.cheese, s.gold, s.salmon, s.close, s.achieved FROM scores s JOIN users u ON u.id = s.user_id
    WHERE s.map_id = ? AND u.banned = 0 ORDER BY s.score DESC, s.achieved ASC LIMIT ?`),
  mapRank: db.prepare(`SELECT COUNT(*) + 1 AS rank FROM scores s JOIN users u ON u.id = s.user_id, (SELECT score, achieved FROM scores WHERE user_id = ? AND map_id = ?) me
    WHERE s.map_id = ? AND u.banned = 0 AND (s.score > me.score OR (s.score = me.score AND s.achieved < me.achieved))`),
  mapCount: db.prepare('SELECT COUNT(*) AS n FROM scores s JOIN users u ON u.id = s.user_id WHERE s.map_id = ? AND u.banned = 0'),
  totalBoard: db.prepare(`SELECT u.name, SUM(s.score) AS total, COUNT(*) AS maps, SUM(s.salmon) AS salmon, MAX(s.achieved) AS last,
    MAX(u.salmon_earned) AS earned, MAX(u.goldfish) AS goldfish
    FROM scores s JOIN users u ON u.id = s.user_id WHERE u.banned = 0 GROUP BY s.user_id ORDER BY total DESC, maps DESC, last ASC LIMIT ?`),
  totalMine: db.prepare('SELECT SUM(score) AS total, COUNT(*) AS maps, MAX(achieved) AS last FROM scores WHERE user_id = ?'),
  totalRank: db.prepare(`SELECT COUNT(*) + 1 AS rank FROM (SELECT SUM(s.score) AS total, COUNT(*) AS maps, MAX(s.achieved) AS last FROM scores s JOIN users u ON u.id = s.user_id WHERE u.banned = 0 GROUP BY s.user_id) t
    WHERE t.total > ? OR (t.total = ? AND (t.maps > ? OR (t.maps = ? AND t.last < ?)))`),
  totalCount: db.prepare('SELECT COUNT(DISTINCT s.user_id) AS n FROM scores s JOIN users u ON u.id = s.user_id WHERE u.banned = 0'),
  wallet: db.prepare('SELECT salmon_earned - salmon_spent AS balance, salmon_earned AS earned, skin_cat, skin_mouse FROM users WHERE id = ?'),
  lastRoll: db.prepare('SELECT nonce, ticket, issued, gold_idx FROM rolls WHERE user_id = ? AND map_id = ? ORDER BY issued DESC LIMIT 1'),
  roll: db.prepare('SELECT gold_idx, issued, map_id FROM rolls WHERE nonce = ? AND user_id = ?'),
  addRoll: db.prepare('INSERT INTO rolls (user_id, map_id, nonce, ticket, issued, gold_idx) VALUES (?, ?, ?, ?, ?, ?)'),
  purgeRolls: db.prepare('DELETE FROM rolls WHERE issued <= ?'),
  paySalmon: db.prepare('INSERT OR IGNORE INTO salmon_paid (user_id, map_id, idx) VALUES (?, ?, ?)'),
  caughtGoldfish: db.prepare('UPDATE users SET goldfish = goldfish + 1 WHERE id = ?'),
  earn: db.prepare('UPDATE users SET salmon_earned = salmon_earned + ? WHERE id = ?'),
  spend: db.prepare('UPDATE users SET salmon_spent = salmon_spent + ? WHERE id = ? AND salmon_earned - salmon_spent >= ?'),
  owned: db.prepare('SELECT item FROM owned WHERE user_id = ?'),
  owns: db.prepare('SELECT 1 FROM owned WHERE user_id = ? AND item = ?'),
  addOwned: db.prepare('INSERT INTO owned (user_id, item, bought) VALUES (?, ?, ?)'),
  setCat: db.prepare('UPDATE users SET skin_cat = ? WHERE id = ?'),
  setMouse: db.prepare('UPDATE users SET skin_mouse = ? WHERE id = ?'),
  replay: db.prepare('SELECT s.inputs, s.score, u.name FROM scores s JOIN users u ON u.id = s.user_id WHERE s.map_id = ? AND u.name = ? AND u.banned = 0'),
  topReplay: db.prepare('SELECT s.inputs, s.score, u.name FROM scores s JOIN users u ON u.id = s.user_id WHERE s.map_id = ? AND u.banned = 0 ORDER BY s.score DESC, s.achieved ASC LIMIT 1'),
};

// ---------- helpers ----------
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

async function hashPassword(pw) {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 32, { N: 16384, r: 8, p: 1 });
  return `s1$${salt.toString('base64')}$${key.toString('base64')}`;
}
async function checkPassword(pw, stored) {
  const [v, salt, key] = stored.split('$');
  if (v !== 's1') return false;
  const want = Buffer.from(key, 'base64');
  const got = await scrypt(pw, Buffer.from(salt, 'base64'), want.length, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(want, got);
}
const DUMMY_HASH = await hashPassword('timing-equaliser');

// ---------- signed tokens: run tickets + registration challenges ----------
const sign = (s) => createHmac('sha256', SECRET).update(s).digest('base64url').slice(0, 32);
function signedOk(token, parts) {
  if (typeof token !== 'string' || token.length > 200) return null;
  const p = token.split('.');
  if (p.length !== parts + 1) return null;
  const body = p.slice(0, parts).join('.'), sig = Buffer.from(p[parts]), want = Buffer.from(sign(body));
  if (sig.length !== want.length || !timingSafeEqual(sig, want)) return null;
  return p.slice(0, parts);
}
// A ticket is fetched when a map is opened; the run submitted with it must have
// taken at least as long (in real time) as the simulation says it did.
// Seconds an honest run needs to reach x (at the fastest speed of the map).
function secondsTo(pm, x) {
  let v = pm.speed;
  for (const z of pm.zones) if (z.speed > v) v = z.speed;
  return x / v / 60;
}

// Logged-in players get one open ticket per map. A new one (a new goldfish roll) only after the old one was used for a
// finished run or once a whole run could have been played: asking again and again can't fish for a goldfish faster
// than playing. The roll is secret: crypto randomness kept on the server, revealed only mid-run (GET /api/goldfish).
function ticketFor(user, mapId) {
  const pm = PM.get(mapId), now = Date.now(), row = q.lastRoll.get(user.id, mapId);
  if (row && !q.ticketUsed.get(row.nonce) && now - row.issued < secondsTo(pm, pm.length) * 1000 * runTimeRatio()) return row.ticket;
  const ticket = issueTicket(mapId), nonce = ticket.split('.')[2];
  let idx = -1;
  if (randomInt(goldfishOdds()) === 0) {
    const skip = bonusItem(pm, nonce); // not where a bonus salmon may hide
    const spots = pm.items.filter((o) => o.kind === 'cheese' && o.idx !== skip && o.x > pm.length * 0.3 && o.x < pm.length * 0.92);
    if (spots.length) idx = spots[randomInt(spots.length)].idx;
  }
  q.addRoll.run(user.id, mapId, nonce, ticket, now, idx);
  return ticket;
}

function issueTicket(mapId) {
  const body = `${mapId}.${Date.now()}.${randomBytes(9).toString('base64url')}`;
  return `${body}.${sign(body)}`;
}
function checkTicket(ticket, mapId, ticks) {
  const p = signedOk(ticket, 3);
  if (!p || Number(p[0]) !== mapId) throw new HttpError(400, 'bad_ticket');
  const age = Date.now() - Number(p[1]);
  if (!(age >= 0) || age > TICKET_MAX_AGE) throw new HttpError(400, 'bad_ticket');
  if (q.ticketUsed.get(p[2])) throw new HttpError(409, 'ticket_used');
  if (age < (ticks * 1000 / 60) * runTimeRatio() - 2000) throw new HttpError(400, 'too_fast');
  return p[2];
}
// proof of work for registration: find n so that sha256(challenge + ':' + n) starts with POW_BITS zero bits
const usedChallenges = new Map();
function zeroBits(buf) {
  let n = 0;
  for (const b of buf) { if (b === 0) { n += 8; continue; } n += Math.clz32(b) - 24; break; }
  return n;
}
function checkPow(challenge, nonce) {
  const p = signedOk(challenge, 3);
  if (!p) throw new HttpError(400, 'bad_challenge');
  const age = Date.now() - Number(p[0]);
  if (!(age >= 0) || age > 15 * 60_000 || usedChallenges.has(challenge)) throw new HttpError(400, 'bad_challenge');
  if (!/^\d{1,12}$/.test(String(nonce))) throw new HttpError(400, 'bad_challenge');
  const bits = Number(p[1]);
  if (zeroBits(createHash('sha256').update(`${challenge}:${nonce}`).digest()) < bits) throw new HttpError(400, 'bad_challenge');
  usedChallenges.set(challenge, Date.now() + 16 * 60_000);
}

function newSession(userId) {
  const token = randomBytes(32).toString('base64url');
  q.insertSession.run(sha256(token), userId, Date.now() + SESSION_DAYS * 864e5);
  return token;
}

// Rate-limit key for the client. Behind a proxy only the entry appended by the
// (single, trusted) proxy is reliable: the rightmost one. IPv6 is keyed per /64.
function clientIp(req) {
  let ip = req.socket.remoteAddress || '?';
  if (TRUST_PROXY) {
    const xf = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (xf.length && isIP(xf[xf.length - 1])) ip = xf[xf.length - 1]; // junk header -> the proxy's own address
  }
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (ip.includes(':')) ip = ip.split(':').slice(0, 4).join(':') + '::/64';
  return ip;
}

// fixed-window rate limiter: key -> {n, reset}
const buckets = new Map();
function limited(key, max, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b && buckets.size >= 50_000) return true; // flood of new keys: fail closed instead of growing without bound
  if (!b || b.reset <= now) { b = { n: 0, reset: now + windowMs }; buckets.set(key, b); }
  b.n++;
  return b.n > max;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.reset <= now) buckets.delete(k);
  for (const [k, t] of usedChallenges) if (t <= now) usedChallenges.delete(k);
  q.purgeSessions.run(now);
  q.purgeTickets.run(now);
  q.purgeRolls.run(now - TICKET_MAX_AGE);
}, 60_000).unref();

class HttpError extends Error { constructor(status, code) { super(code); this.status = status; this.code = code; } }

async function readJson(req, limit = 200_000) {
  if (Number(req.headers['content-length'] || 0) > limit) throw new HttpError(413, 'too_large');
  const chunks = []; let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new HttpError(413, 'too_large');
    chunks.push(c);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw new HttpError(400, 'bad_json'); }
}

function shopOf(userId) {
  const w = q.wallet.get(userId);
  // a skin that no longer exists in shared/skins.js (list regenerated) falls back to the free default
  const worn = (id, kind) => (SKIN_BY_ID.has(id) ? id : DEFAULT_SKIN[kind]);
  return { balance: w.balance, earned: w.earned, owned: q.owned.all(userId).map((r) => r.item),
    cat: worn(w.skin_cat, 'cat'), mouse: worn(w.skin_mouse, 'mouse') };
}

function auth(req) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return null;
  const row = q.session.get(sha256(h.slice(7)), Date.now());
  return row ? { id: row.id, name: row.name } : null;
}

const NAME_RE = /^[\p{Script=Latin}0-9_.-]{3,16}$/u; // Latin letters (with accents) only: no lookalike scripts
const PASS_MIN = 8;

function rankInfoForMap(userId, mapId) {
  const r = q.mapRank.get(userId, mapId, mapId);
  return r ? r.rank : null;
}

function totalOf(userId) {
  const t = q.totalMine.get(userId);
  if (!t || !t.maps) return { total: 0, maps: 0, rank: null };
  const r = q.totalRank.get(t.total, t.total, t.maps, t.maps, t.last);
  return { total: t.total, maps: t.maps, rank: r.rank };
}

// ---------- API ----------
const api = {
  'GET /api/challenge': (req) => {
    if (limited('chal:' + clientIp(req), 30, 600_000)) throw new HttpError(429, 'rate_limited');
    const body = `${Date.now()}.${POW_BITS}.${randomBytes(9).toString('base64url')}`;
    return { challenge: `${body}.${sign(body)}`, bits: POW_BITS };
  },

  'GET /api/ticket': (req, body, url) => {
    if (limited('ticket:' + clientIp(req), 300, 600_000)) throw new HttpError(429, 'rate_limited');
    const mapId = Number(url.searchParams.get('map'));
    if (!PM.has(mapId)) throw new HttpError(404, 'no_map');
    const u = auth(req);
    return { ticket: u ? ticketFor(u, mapId) : issueTicket(mapId) };
  },

  // mid-run: is there a goldfish in this run? Answered only once an honest run could be 20 % in, so it can't be
  // learned before the run (and rerolling is throttled by ticketFor).
  'GET /api/goldfish': (req, body, url) => {
    const u = auth(req);
    if (!u) throw new HttpError(401, 'no_session');
    if (limited('gold:' + u.id, 120, 600_000)) throw new HttpError(429, 'rate_limited');
    const p = signedOk(url.searchParams.get('ticket') || '', 3);
    if (!p) throw new HttpError(400, 'bad_ticket');
    const row = q.roll.get(p[2], u.id), pm = row && PM.get(row.map_id);
    if (!pm) return { idx: -1 };
    if (Date.now() - row.issued < secondsTo(pm, pm.length * 0.2) * 1000 * runTimeRatio()) throw new HttpError(425, 'too_early');
    return { idx: row.gold_idx };
  },

  'POST /api/register': async (req, body) => {
    if (limited('reg:' + clientIp(req), Number(process.env.REG_LIMIT || 8), 3600_000)) throw new HttpError(429, 'rate_limited');
    const name = String(body.name || '').trim().normalize('NFC');
    const pw = String(body.password || '');
    if (!NAME_RE.test(name)) throw new HttpError(400, 'bad_name');
    if (pw.length < PASS_MIN || pw.length > 200) throw new HttpError(400, 'bad_password');
    if (q.userByName.get(nameKey(name))) throw new HttpError(409, 'name_taken');
    checkPow(body.challenge, body.pow);
    const hash = await hashPassword(pw);
    let id;
    try { id = Number(q.insertUser.run(name, hash, Date.now(), nameKey(name)).lastInsertRowid); }
    catch { throw new HttpError(409, 'name_taken'); }
    return { token: newSession(id), user: { name } };
  },

  'POST /api/login': async (req, body) => {
    if (limited('login:' + clientIp(req), 20, 600_000)) throw new HttpError(429, 'rate_limited');
    const name = String(body.name || '').trim().normalize('NFC');
    const pw = String(body.password || '');
    const key = 'fail:' + nameKey(name), fails = buckets.get(key);
    if (fails && fails.reset > Date.now() && fails.n >= 10) throw new HttpError(429, 'rate_limited'); // per account, any IP
    const u = q.userByExactName.get(name) || q.userByName.get(nameKey(name));
    const ok = await checkPassword(pw, u ? u.pass : DUMMY_HASH);
    if (!u || !ok) { limited(key, 10, 900_000); throw new HttpError(401, 'bad_login'); }
    if (u.banned) throw new HttpError(403, 'banned');
    return { token: newSession(u.id), user: { name: u.name } };
  },

  'POST /api/logout': (req) => {
    const h = req.headers.authorization || '';
    if (h.startsWith('Bearer ')) q.deleteSession.run(sha256(h.slice(7)));
    return { ok: true };
  },

  'GET /api/shop': (req) => {
    const u = auth(req);
    if (!u) throw new HttpError(401, 'no_session');
    return shopOf(u.id);
  },

  'POST /api/shop/buy': (req, body) => {
    const u = auth(req);
    if (!u) throw new HttpError(401, 'no_session');
    if (limited('shop:' + u.id, 60, 600_000)) throw new HttpError(429, 'rate_limited');
    const item = SKIN_BY_ID.get(String(body.item));
    if (!item) throw new HttpError(404, 'no_item');
    if (item.price === 0 || q.owns.get(u.id, item.id)) throw new HttpError(409, 'owned');
    // the balance check and the debit are one statement, so two quick clicks cannot overspend
    if (!q.spend.run(item.price, u.id, item.price).changes) throw new HttpError(402, 'not_enough');
    q.addOwned.run(u.id, item.id, Date.now());
    (item.kind === 'cat' ? q.setCat : q.setMouse).run(item.id, u.id); // put it on straight away
    return shopOf(u.id);
  },

  'POST /api/shop/equip': (req, body) => {
    const u = auth(req);
    if (!u) throw new HttpError(401, 'no_session');
    const item = SKIN_BY_ID.get(String(body.item));
    if (!item) throw new HttpError(404, 'no_item');
    if (item.price !== 0 && !q.owns.get(u.id, item.id)) throw new HttpError(403, 'not_owned');
    (item.kind === 'cat' ? q.setCat : q.setMouse).run(item.id, u.id);
    return shopOf(u.id);
  },

  'GET /api/me': (req) => {
    const u = auth(req);
    if (!u) throw new HttpError(401, 'no_session');
    const scores = {};
    for (const s of q.myScores.all(u.id)) {
      scores[s.map_id] = { score: s.score, cheese: s.cheese, gold: s.gold, salmon: s.salmon, close: s.close, ticks: s.ticks, inputs: JSON.parse(s.inputs), rank: rankInfoForMap(u.id, s.map_id) };
    }
    return { user: { name: u.name }, scores, total: totalOf(u.id), shop: shopOf(u.id) };
  },

  'POST /api/runs': async (req, body) => {
    const u = auth(req);
    if (!u) throw new HttpError(401, 'no_session');
    if (limited('run:' + u.id, 40, 600_000) || limited('runip:' + clientIp(req), 120, 600_000)) throw new HttpError(429, 'rate_limited');
    const mapId = Number(body.mapId);
    const pm = PM.get(mapId);
    if (!pm) throw new HttpError(404, 'no_map');
    const prevMap = PREV_MAP.get(mapId);
    if (prevMap && !q.getScore.get(u.id, prevMap) && !q.getScore.get(u.id, mapId)) throw new HttpError(403, 'locked');
    const prev = q.getScore.get(u.id, mapId);
    const seed = prev && (signedOk(body.ticket, 3) || [])[2]; // repeat run: the bonus salmon hides where the ticket says
    const r = runReplay(pm, body.inputs, seed ? bonusItem(pm, seed) : -1);
    if (!r.valid) throw new HttpError(400, 'bad_inputs');
    if (!r.finished) return { finished: false, score: 0 };
    const nonce = checkTicket(body.ticket, mapId, r.ticks);
    q.useTicket.run(nonce, Date.now() + TICKET_MAX_AGE + 864e5);
    const attempts = Math.max(0, Math.min(500, Number(body.attempts) | 0)); // moderation stat, only for verified runs
    if (attempts) q.bumpAttempts.run(u.id, mapId, attempts);
    // each of a map's 3 salmon pays once ever; a repeat run adds at most its bonus salmon (single-use ticket)
    let earned = r.bonus;
    for (const idx of r.salmonIdx) earned += q.paySalmon.run(u.id, mapId, idx).changes;
    const roll = q.roll.get(nonce, u.id);
    const goldfish = !!roll && roll.map_id === mapId && roll.gold_idx >= 0 && r.collectedIdx.includes(roll.gold_idx);
    if (goldfish) { earned += GOLDFISH_PAY; q.caughtGoldfish.run(u.id); }
    if (earned) q.earn.run(earned, u.id);
    const improved = !prev || r.score > prev.score;
    // store only the inputs the run actually consumed (no padding after the finish)
    if (improved) q.upsertScore.run(u.id, mapId, r.score, r.cheese, r.gold, r.salmon, r.close, r.ticks, JSON.stringify(body.inputs.slice(0, r.used)), Date.now());
    return {
      finished: true, score: r.score, cheese: r.cheese, gold: r.gold, salmon: r.salmon, close: r.close, improved,
      items: r.items, itemsTotal: r.itemsTotal, perfect: r.items === r.itemsTotal,
      best: improved ? r.score : prev.score, previous: prev ? prev.score : null,
      rank: rankInfoForMap(u.id, mapId), players: q.mapCount.get(mapId).n, total: totalOf(u.id),
      wallet: q.wallet.get(u.id).balance, earned, goldfish,
    };
  },

  'GET /api/leaderboard': (req, body, url) => {
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit')) || 50));
    const u = auth(req);
    const map = url.searchParams.get('map');
    if (map && map !== 'total') {
      const mapId = Number(map);
      if (!PM.has(mapId)) throw new HttpError(404, 'no_map');
      const it = ITEMS.get(mapId);
      const rows = q.mapBoard.all(mapId, limit).map((r, i) => ({
        rank: i + 1, name: r.name, score: r.score, cheese: r.cheese, gold: r.gold, salmon: r.salmon, close: r.close,
        perfect: r.cheese + r.gold + r.salmon === it.total,
      }));
      let me = null;
      if (u) { const s = q.getScore.get(u.id, mapId); if (s) me = { name: u.name, score: s.score, rank: rankInfoForMap(u.id, mapId) }; }
      return { map: mapId, rows, me, players: q.mapCount.get(mapId).n, salmonTotal: it.salmon, itemsTotal: it.total };
    }
    const rows = q.totalBoard.all(limit).map((r, i) => ({ rank: i + 1, name: r.name, total: r.total, maps: r.maps, salmon: r.salmon, earned: r.earned, goldfish: r.goldfish }));
    let me = null;
    if (u) { const t = totalOf(u.id); if (t.maps) me = { name: u.name, ...t }; }
    return { map: 'total', mapCount: MAPS.length, salmonTotal: SALMON_TOTAL, rows, me, players: q.totalCount.get().n };
  },

  'GET /api/replay': (req, body, url) => {
    const mapId = Number(url.searchParams.get('map'));
    const name = url.searchParams.get('name');
    const row = name ? q.replay.get(mapId, name) : q.topReplay.get(mapId);
    if (!row) throw new HttpError(404, 'no_replay');
    return { name: row.name, score: row.score, inputs: JSON.parse(row.inputs) };
  },
};

// ---------- static files ----------
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
};
const fileCache = new Map(); // path -> {mtime, etag, raw, gz}

function loadFile(path) {
  let st;
  try { st = statSync(path); } catch { return null; }
  if (!st.isFile()) return null;
  const c = fileCache.get(path);
  if (c && c.mtime === st.mtimeMs) return c;
  const raw = readFileSync(path);
  const type = TYPES[extname(path)] || 'application/octet-stream';
  const compressible = /text|json|svg|javascript/.test(type) && raw.length > 512;
  const entry = { mtime: st.mtimeMs, etag: `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}`, raw, gz: compressible ? gzipSync(raw) : null, type };
  fileCache.set(path, entry);
  return entry;
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; media-src 'self' blob:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
};

function serveStatic(req, res, pathname) {
  let rel;
  if (pathname === '/') rel = 'public/index.html';
  else if (pathname.startsWith('/shared/')) rel = pathname.slice(1);
  else rel = 'public' + pathname;
  const full = normalize(join(ROOT, rel));
  if (!full.startsWith(join(ROOT, 'public') + sep) && !full.startsWith(join(ROOT, 'shared') + sep)) return false;
  if (full.endsWith('solver.js')) return false;
  const f = loadFile(full);
  if (!f) return false;
  const gz = !!(f.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || ''));
  const etag = f.etag + (gz ? '-gz"' : '"');
  const headers = { ...SECURITY_HEADERS, 'Content-Type': f.type, ETag: etag, Vary: 'Accept-Encoding' };
  headers['Cache-Control'] = /\.(woff2|png|mp3)$/.test(full) ? 'public, max-age=604800' : 'no-cache';
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); res.end(); return true; }
  let body = f.raw;
  if (gz) { body = f.gz; headers['Content-Encoding'] = 'gzip'; }
  headers['Content-Length'] = body.length;
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
  return true;
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  if (res.headersSent) return res.end();
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

export const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, 'http://x'); } catch { return sendJson(res, 400, { error: 'bad_request' }); }
  try {
    if (url.pathname.startsWith('/api/')) {
      const origin = req.headers.origin;
      if (origin && CORS_ORIGINS.has(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin');
        if (req.method === 'OPTIONS') {
          // Allow-Private-Network: Chrome asks for it when the API host resolves to a private address, e.g. a
          // Tailscale name seen from inside the tailnet
          res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '600',
            ...(req.headers['access-control-request-private-network'] ? { 'Access-Control-Allow-Private-Network': 'true' } : {}) });
          return res.end();
        }
      }
      const h = api[`${req.method} ${url.pathname}`];
      if (!h) throw new HttpError(404, 'not_found');
      if (req.method === 'POST' && !String(req.headers['content-type'] || '').startsWith('application/json')) throw new HttpError(415, 'json_only');
      const body = req.method === 'POST' ? await readJson(req) : null;
      return sendJson(res, 200, await h(req, body || {}, url));
    }
    if (url.pathname === '/health') return sendJson(res, 200, { ok: true });
    if ((req.method === 'GET' || req.method === 'HEAD') && serveStatic(req, res, url.pathname)) return;
    sendJson(res, 404, { error: 'not_found' });
  } catch (e) {
    if (e instanceof HttpError) {
      if (e.status === 413) res.setHeader('Connection', 'close');
      return sendJson(res, e.status, { error: e.code });
    }
    console.error(e);
    sendJson(res, 500, { error: 'server_error' });
  }
});

if (process.env.NODE_ENV !== 'test' || process.env.LISTEN === '1') {
  server.listen(PORT, HOST, () => console.log(`Slappy Cat on http://${HOST}:${server.address().port} (data: ${DATA_DIR})`));
}
process.on('unhandledRejection', (e) => console.error('unhandledRejection', e));
process.on('uncaughtException', (e) => { console.error('uncaughtException', e); process.exit(1); }); // Docker restarts us clean
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { server.close(); db.close(); process.exit(0); });
