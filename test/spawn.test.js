// Tests that need a freshly started server process (start-up behaviour, env switches).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SERVER = new URL('../server/server.js', import.meta.url).pathname;

function start(env) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [SERVER], { env: { ...process.env, NODE_ENV: 'production', PORT: '0', HOST: '127.0.0.1', ...env } });
    let out = '';
    p.stdout.on('data', (d) => { out += d; const m = out.match(/http:\/\/127\.0\.0\.1:(\d+)/); if (m) resolve({ p, out: () => out, port: Number(m[1]) }); });
    p.on('exit', (c) => reject(new Error('server exited ' + c + ' ' + out)));
    setTimeout(() => reject(new Error('server did not start: ' + out)), 8000);
  });
}
const stop = (s) => new Promise((r) => { s.p.removeAllListeners('exit'); s.p.on('exit', r); s.p.kill('SIGTERM'); });

test('a changed map drops its stored runs on start-up', async () => {
  const dir = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'slappy-spawn-'));
  try {
    let s = await start({ DATA_DIR: dir });
    await stop(s);
    const db = new DatabaseSync(join(dir, 'slappy.db'));
    db.prepare("INSERT INTO users (id, name, pass, created) VALUES (1, 'x', 'x', 0)").run();
    for (const m of [1, 2]) db.prepare("INSERT INTO scores (user_id, map_id, score, cheese, gold, close, ticks, inputs, achieved) VALUES (1, ?, 5, 0, 0, 0, 1, '[]', 0)").run(m);
    db.prepare("UPDATE meta SET v = 'stale' WHERE k = 'maphash:1'").run();
    db.close();
    s = await start({ DATA_DIR: dir });
    await stop(s);
    assert.match(s.out(), /map 1 changed: removed 1 stored runs/);
    const left = new DatabaseSync(join(dir, 'slappy.db')).prepare('SELECT map_id FROM scores').all().map((r) => r.map_id);
    assert.deepEqual(left, [2], 'only the changed map lost its runs');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('CORS: only listed origins may call the API from another site', async () => {
  const dir = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'slappy-spawn-'));
  const s = await start({ DATA_DIR: dir, CORS_ORIGINS: 'https://friends.github.io' });
  try {
    const pre = (origin) => fetch(`http://127.0.0.1:${s.port}/api/login`, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
    const ok = await pre('https://friends.github.io');
    assert.equal(ok.status, 204);
    assert.equal(ok.headers.get('access-control-allow-origin'), 'https://friends.github.io');
    assert.match(ok.headers.get('access-control-allow-headers'), /Authorization/);
    const bad = await pre('https://evil.example');
    assert.equal(bad.headers.get('access-control-allow-origin'), null);
    const get = await fetch(`http://127.0.0.1:${s.port}/api/challenge`, { headers: { Origin: 'https://friends.github.io' } });
    assert.equal(get.headers.get('access-control-allow-origin'), 'https://friends.github.io');
  } finally { await stop(s); rmSync(dir, { recursive: true, force: true }); }
});

test('password guessing is capped per account, whatever the IP; junk X-Forwarded-For is ignored', async () => {
  const dir = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'slappy-spawn-'));
  const s = await start({ DATA_DIR: dir, TRUST_PROXY: '1', POW_BITS: '1' });
  try {
    const post = (path, body, xff) => fetch(`http://127.0.0.1:${s.port}/api/${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': xff }, body: JSON.stringify(body) });
    const c = await (await fetch(`http://127.0.0.1:${s.port}/api/challenge`)).json();
    let pow = 0; // POW_BITS=1: half of all nonces work, the server just checks it
    for (; pow < 64; pow++) { const r = await post('register', { name: 'victim', password: 'right-pass-1', challenge: c.challenge, pow: String(pow) }, '198.51.100.1'); if (r.status === 200) break; }
    assert.ok(pow < 64, 'registered');
    for (let i = 0; i < 10; i++) assert.equal((await post('login', { name: 'victim', password: 'nope-nope' }, `203.0.113.${i}`)).status, 401);
    assert.equal((await post('login', { name: 'VICTIM', password: 'right-pass-1' }, '203.0.113.99')).status, 429, 'locked for a while');
    // junk header values fall back to the socket address, so they share one bucket
    let last;
    for (let i = 0; i < 22; i++) last = (await post('login', { name: 'x' + i, password: 'whatever1' }, 'junk-' + i)).status;
    assert.equal(last, 429);
  } finally { await stop(s); rmSync(dir, { recursive: true, force: true }); }
});

test('TRUST_PROXY=1 keys rate limits on the last X-Forwarded-For entry', async () => {
  const dir = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'slappy-spawn-'));
  const s = await start({ DATA_DIR: dir, TRUST_PROXY: '1' });
  try {
    const login = (xff, name = 'nobody' + Math.random()) => fetch(`http://127.0.0.1:${s.port}/api/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': xff }, body: JSON.stringify({ name, password: 'wrong-pw' }),
    }).then((r) => r.status);
    // a client-chosen first entry must not help: the proxy appends the real IP last
    let last;
    for (let i = 0; i < 22; i++) last = await login(`10.0.0.${i}, 203.0.113.7`);
    assert.equal(last, 429);
    assert.equal(await login('203.0.113.8'), 401, 'another client is not blocked');
  } finally { await stop(s); rmSync(dir, { recursive: true, force: true }); }
});
