import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { solve } from '../shared/solver.js';
import { prepareMap } from '../shared/sim.js';

const dir = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'slappy-test-'));
process.env.NODE_ENV = 'test';
process.env.DATA_DIR = dir;
process.env.POW_BITS = '10';
process.env.REG_LIMIT = '50';
process.env.RUN_TIME_RATIO = '0';
process.env.GOLDFISH_ODDS = '1e9'; // no random goldfish, except in the goldfish test
const { maps } = JSON.parse(readFileSync(new URL('../shared/maps.json', import.meta.url)));

let server, base;
before(async () => {
  ({ server } = await import('../server/server.js'));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); rmSync(dir, { recursive: true, force: true }); });

async function req(method, path, body, token) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => null), headers: r.headers };
}

function solvePow(challenge, bits) {
  for (let n = 0; ; n++) {
    const h = createHash('sha256').update(`${challenge}:${n}`).digest();
    let z = 0;
    for (const b of h) { if (b === 0) { z += 8; continue; } z += Math.clz32(b) - 24; break; }
    if (z >= bits) return String(n);
  }
}
async function register(name, password) {
  const c = (await req('GET', '/api/challenge')).data;
  return req('POST', '/api/register', { name, password, challenge: c.challenge, pow: solvePow(c.challenge, c.bits) });
}
const ticket = async (mapId) => (await req('GET', `/api/ticket?map=${mapId}`)).data.ticket;
async function run(mapId, inputs, token, extra = {}) {
  return req('POST', '/api/runs', { mapId, inputs, ticket: await ticket(mapId), ...extra }, token);
}

const sol1 = solve(maps[0], { every: 4 }).inputs;
const sol2 = solve(maps[0], { every: 6, prefer: [0, 2, 3, 1] }).inputs;

test('static files and health', async () => {
  const r = await fetch(base + '/');
  assert.equal(r.status, 200);
  assert.match(await r.text(), /Slappy Cat/);
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal((await fetch(base + '/shared/maps.json')).status, 200);
  assert.equal((await fetch(base + '/shared/solver.js')).status, 404, 'solver is not served');
  assert.equal((await fetch(base + '/../server/server.js')).status, 404);
  assert.equal((await fetch(base + '/%2e%2e/server/server.js')).status, 404);
  assert.equal((await fetch(base + '/server/admin.js')).status, 404);
  assert.equal((await req('GET', '/health')).data.ok, true);
});

test('register needs a valid proof of work', async () => {
  const c = (await req('GET', '/api/challenge')).data;
  let r = await req('POST', '/api/register', { name: 'nopow', password: 'secret12' });
  assert.equal(r.data.error, 'bad_challenge');
  r = await req('POST', '/api/register', { name: 'nopow', password: 'secret12', challenge: c.challenge, pow: '1' });
  assert.equal(r.data.error, 'bad_challenge');
  r = await req('POST', '/api/register', { name: 'nopow', password: 'secret12', challenge: c.challenge.replace(/.$/, 'x'), pow: solvePow(c.challenge, c.bits) });
  assert.equal(r.data.error, 'bad_challenge', 'forged signature');
  const pow = solvePow(c.challenge, c.bits);
  r = await req('POST', '/api/register', { name: 'withpow', password: 'secret12', challenge: c.challenge, pow });
  assert.equal(r.status, 200);
  r = await req('POST', '/api/register', { name: 'withpow2', password: 'secret12', challenge: c.challenge, pow });
  assert.equal(r.data.error, 'bad_challenge', 'a challenge is single-use');
});

test('register / login / me', async () => {
  let r = await register('ab', 'secret12');
  assert.equal(r.status, 400); assert.equal(r.data.error, 'bad_name');
  r = await register('Kočka_1', '123');
  assert.equal(r.data.error, 'bad_password');
  r = await register('Kočka_1', 'secret12');
  assert.equal(r.status, 200); assert.ok(r.data.token);
  r = await register('kočka_1', 'secret12');
  assert.equal(r.status, 409, 'names are case-insensitive');
  for (const look of ['KOCKA_1', 'Kočka_l', 'Kocka_I']) {
    r = await register(look, 'secret12');
    assert.equal(r.data.error, 'name_taken', `lookalike ${look} is refused`);
  }
  r = await register('Коčka_2', 'secret12'); // Cyrillic К
  assert.equal(r.data.error, 'bad_name', 'only Latin script');
  r = await req('POST', '/api/login', { name: 'kocka_1', password: 'secret12' });
  assert.equal(r.status, 200, 'login folds case and accents too');
  r = await req('POST', '/api/login', { name: 'Kočka_1', password: 'wrong!!!' });
  assert.equal(r.status, 401);
  r = await req('POST', '/api/login', { name: 'Kočka_1', password: 'secret12' });
  assert.equal(r.status, 200);
  const me = await req('GET', '/api/me', null, r.data.token);
  assert.equal(me.data.user.name, 'Kočka_1');
  assert.deepEqual(me.data.scores, {});
  assert.equal((await req('GET', '/api/me', null, 'nope')).status, 401);
});

test('runs are verified server-side and leaderboards rank them', async () => {
  const a = (await register('alice', 'secret12')).data.token;
  const b = (await register('bob', 'secret12')).data.token;
  let r = await run(1, [], a);
  assert.equal(r.data.finished, false);
  r = await run(1, [[3, 7]], a);
  assert.equal(r.status, 400);
  r = await req('POST', '/api/runs', { mapId: 99, inputs: [] }, a);
  assert.equal(r.status, 404);
  r = await run(1, sol1, null);
  assert.equal(r.status, 401);
  r = await run(1, sol1, a, { attempts: 3 });
  assert.equal(r.data.finished, true); assert.equal(r.data.improved, true); assert.equal(r.data.rank, 1);
  const scoreA = r.data.score;
  r = await run(1, sol2, b);
  assert.equal(r.data.finished, true);
  const scoreB = r.data.score;
  r = await run(1, sol1, b, { score: 999999 });
  assert.equal(r.data.score, scoreA, 'client-claimed score is ignored');
  const board = (await req('GET', '/api/leaderboard?map=1', null, a)).data;
  assert.equal(board.rows.length, 2);
  assert.equal(board.salmonTotal, 3);
  assert.equal(typeof board.rows[0].salmon, 'number');
  assert.ok(board.rows[0].score >= board.rows[1].score);
  assert.equal(board.me.name, 'alice');
  const total = (await req('GET', '/api/leaderboard?map=total')).data;
  assert.equal(total.mapCount, maps.length);
  assert.equal(total.rows.length, 2);
  assert.equal(total.rows[0].total, Math.max(scoreA, scoreB));
  r = await run(1, sol1, a);
  assert.equal(r.data.improved, false, 'a worse/equal run does not replace the best');
  const me = (await req('GET', '/api/me', null, a)).data;
  assert.equal(me.scores[1].score, scoreA);
  assert.deepEqual(me.scores[1].inputs, sol1);
  assert.equal(me.total.maps, 1);
  const rep = (await req('GET', '/api/replay?map=1')).data;
  assert.ok(rep.inputs.length > 0);
});

test('run tickets: required, signed, single-use, real-time', async () => {
  const t = (await register('dave', 'secret12')).data.token;
  let r = await req('POST', '/api/runs', { mapId: 1, inputs: sol1 }, t);
  assert.equal(r.data.error, 'bad_ticket', 'no ticket');
  const tk = await ticket(1);
  r = await req('POST', '/api/runs', { mapId: 1, inputs: sol1, ticket: tk.replace(/.$/, tk.endsWith('A') ? 'B' : 'A') }, t);
  assert.equal(r.data.error, 'bad_ticket', 'forged ticket');
  r = await req('POST', '/api/runs', { mapId: 1, inputs: sol1, ticket: await ticket(2) }, t);
  assert.equal(r.data.error, 'bad_ticket', 'ticket for another map');
  process.env.RUN_TIME_RATIO = '0.9';
  r = await req('POST', '/api/runs', { mapId: 1, inputs: sol1, ticket: tk }, t);
  assert.equal(r.data.error, 'too_fast', 'a 35 s run cannot arrive 0 s after the ticket');
  process.env.RUN_TIME_RATIO = '0';
  r = await req('POST', '/api/runs', { mapId: 1, inputs: sol1, ticket: tk }, t);
  assert.equal(r.data.finished, true);
  r = await req('POST', '/api/runs', { mapId: 1, inputs: sol1, ticket: tk }, t);
  assert.equal(r.data.error, 'ticket_used');
});

test('inhuman input logs are rejected', async () => {
  const t = (await register('erin', 'secret12')).data.token;
  const spam = []; for (let i = 0; i < 40; i++) spam.push([i * 3, 1]);
  let r = await run(1, spam, t);
  assert.equal(r.data.error, 'bad_inputs', '20 flaps per second');
  r = await run(1, [[10, 1], [11, 1]], t);
  assert.equal(r.data.error, 'bad_inputs', 'two flaps 1 tick apart');
  r = await run(1, [[10, 3]], t);
  assert.equal(r.data.error, 'bad_inputs', 'release without press');
});

test('maps unlock in order and stored inputs are trimmed', async () => {
  const t = (await register('carol', 'secret12')).data.token;
  const sol2map = solve(maps[1], { every: 4 }).inputs;
  let r = await run(maps[1].id, sol2map, t);
  assert.equal(r.status, 403); assert.equal(r.data.error, 'locked');
  const pm = prepareMap(maps[0]);
  const pad = [...sol1, [pm.maxTicks - 20, 1], [pm.maxTicks - 10, 1]];
  r = await run(1, pad, t);
  assert.equal(r.data.finished, true);
  const me = (await req('GET', '/api/me', null, t)).data;
  assert.deepEqual(me.scores[1].inputs, sol1, 'padding after the finish is not stored');
  r = await run(maps[1].id, sol2map, t);
  assert.equal(r.data.finished, true, 'map 2 unlocked after map 1');
});

test('admin ban hides a player and blocks login', async () => {
  const t = (await register('mallory', 'secret12')).data.token;
  await run(1, sol1, t);
  assert.ok((await req('GET', '/api/leaderboard?map=1')).data.rows.some((r) => r.name === 'mallory'));
  execFileSync(process.execPath, [new URL('../server/admin.js', import.meta.url).pathname, 'ban', 'mallory'], { env: process.env });
  assert.ok(!(await req('GET', '/api/leaderboard?map=1')).data.rows.some((r) => r.name === 'mallory'));
  assert.equal((await req('GET', '/api/me', null, t)).status, 401, 'sessions revoked');
  assert.equal((await req('POST', '/api/login', { name: 'mallory', password: 'secret12' })).data.error, 'banned');
});

test('malformed request target does not crash the server', async () => {
  const net = await import('node:net');
  const port = server.address().port;
  const reply = await new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1', () => s.write('GET http://[ HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n'));
    let d = ''; s.on('data', (c) => { d += c; }); s.on('end', () => resolve(d)); s.on('error', () => resolve(d));
  });
  assert.match(reply, /^HTTP\/1\.1 400/);
  assert.equal((await req('GET', '/health')).data.ok, true);
});

test('rejects non-JSON posts and huge bodies', async () => {
  let r = await fetch(base + '/api/login', { method: 'POST', body: 'name=x', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  assert.equal(r.status, 415);
  r = await fetch(base + '/api/login', { method: 'POST', body: 'x'.repeat(300_000), headers: { 'Content-Type': 'application/json' } });
  assert.equal(r.status, 413);
});

test('login is rate limited per IP', async () => {
  let last;
  for (let i = 0; i < 22; i++) last = await req('POST', '/api/login', { name: 'alice', password: 'bad-pass' });
  assert.equal(last.status, 429);
});

test('market: salmon from finished runs pay for colours, checked on the server', async () => {
  const token = (await register('Shopper', 'secret12')).data.token;
  let r = await req('GET', '/api/shop', null, token);
  assert.deepEqual([r.data.balance, r.data.cat, r.data.mouse], [0, 'cat:ginger', 'mouse:mouse-grey']);
  assert.equal((await req('GET', '/api/shop')).status, 401, 'login needed');
  const perfect = solve(maps[0], { every: 4, perfect: true, budget: 4e6 }).inputs;
  r = await run(maps[0].id, perfect, token);
  assert.equal(r.data.salmon, 3); assert.equal(r.data.wallet, 3);
  r = await run(maps[0].id, perfect, token); // the perfect run takes every cheese, so also the bonus one
  assert.deepEqual([r.data.earned, r.data.wallet], [1, 4], 'a repeat pays only its bonus salmon');
  r = await run(maps[0].id, perfect.slice(0, 2), token); // dies early: nothing
  assert.equal(r.data.finished, false);
  r = await run(maps[0].id, perfect, token);
  assert.deepEqual([r.data.earned, r.data.wallet], [1, 5]);
  r = await run(maps[0].id, perfect, token);
  assert.equal(r.data.wallet, 6);
  assert.equal((await req('POST', '/api/shop/equip', { item: 'cat:gold' }, token)).data.error, 'not_owned');
  assert.equal((await req('POST', '/api/shop/buy', { item: 'cat:gold' }, token)).data.error, 'not_enough');
  assert.equal((await req('POST', '/api/shop/buy', { item: 'cat:nope' }, token)).status, 404);
  r = await req('POST', '/api/shop/buy', { item: 'cat:cream' }, token); // 2
  assert.equal(r.status, 200);
  assert.deepEqual([r.data.balance, r.data.cat, r.data.owned], [4, 'cat:cream', ['cat:cream']], 'paid and put on');
  assert.equal((await req('POST', '/api/shop/buy', { item: 'cat:cream' }, token)).data.error, 'owned');
  r = await req('POST', '/api/shop/buy', { item: 'mouse:pink' }, token); // 3
  assert.deepEqual([r.data.balance, r.data.mouse], [1, 'mouse:pink']);
  r = await req('POST', '/api/shop/equip', { item: 'cat:ginger' }, token);
  assert.equal(r.data.cat, 'cat:ginger', 'the default is always free to wear');
  assert.equal((await req('GET', '/api/me', null, token)).data.shop.mouse, 'mouse:pink');
});

test('goldfish: secret roll per open ticket, revealed mid-run only, pays 10 and shows on the board', async () => {
  const token = (await register('Goldie', 'secret12')).data.token;
  process.env.GOLDFISH_ODDS = '1'; process.env.RUN_TIME_RATIO = '0.9';
  try {
    const t1 = (await req('GET', '/api/ticket?map=1', null, token)).data.ticket;
    const t2 = (await req('GET', '/api/ticket?map=1', null, token)).data.ticket;
    assert.equal(t2, t1, 'asking again does not reroll');
    assert.equal((await req('GET', `/api/goldfish?ticket=${t1}`, null, token)).data.error, 'too_early', 'nothing before the run could be 20 % in');
    assert.equal((await req('GET', `/api/goldfish?ticket=${t1}`)).status, 401);
    process.env.RUN_TIME_RATIO = '0';
    const idx = (await req('GET', `/api/goldfish?ticket=${encodeURIComponent(t1)}`, null, token)).data.idx;
    assert.ok(idx >= 0 && (maps[0].items[idx].kind || 'cheese') === 'cheese', 'a goldfish sits on a plain cheese');
    const perfect = solve(maps[0], { every: 4, perfect: true, budget: 4e6 }).inputs;
    await req('GET', '/api/ticket?map=1', null, token); // the browser asks for the next ticket before submitting
    const r = await req('POST', '/api/runs', { mapId: 1, inputs: perfect, ticket: t1 }, token);
    assert.equal(r.data.goldfish, true);
    assert.equal(r.data.earned, 3 + 10, '3 first-time salmon + the goldfish');
    const t3 = (await req('GET', '/api/ticket?map=1', null, token)).data.ticket;
    assert.notEqual(t3, t1, 'a used ticket gets a fresh roll');
    const board = (await req('GET', '/api/leaderboard?map=total')).data.rows.find((x) => x.name === 'Goldie');
    assert.deepEqual([board.goldfish, board.earned], [1, 13]);
  } finally { process.env.GOLDFISH_ODDS = '1e9'; process.env.RUN_TIME_RATIO = '0'; }
});
