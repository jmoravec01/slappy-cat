import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { C, ACT, prepareMap, createSim, step, runReplay, validateInputs, scoreOf } from '../shared/sim.js';
import { solve } from '../shared/solver.js';

const { maps } = JSON.parse(readFileSync(new URL('../shared/maps.json', import.meta.url)));

test('there are many maps with unique ids', () => {
  assert.ok(maps.length >= 10);
  assert.equal(new Set(maps.map((m) => m.id)).size, maps.length);
});

for (const m of maps) {
  test(`map ${m.id} (${m.name.en}) is beatable and replays deterministically`, () => {
    const r = solve(m, { every: 4 });
    assert.ok(r.ok, `unsolved, reached ${r.reached}/${r.length}`);
    const pm = prepareMap(m);
    const a = runReplay(pm, r.inputs), b = runReplay(pm, r.inputs);
    assert.equal(a.finished, true);
    assert.deepEqual(a, b);
    assert.ok(a.score >= C.SCORE.finish);
  });
}

for (const m of maps) {
  test(`map ${m.id} has exactly 3 salmon and a perfect run (every item) exists`, () => {
    assert.equal(m.items.filter((i) => i.kind === 'salmon').length, C.SALMON_PER_MAP);
    const r = solve(m, { every: 4, perfect: true, budget: 4e6 });
    assert.ok(r.ok, 'no run collects everything');
    const rr = runReplay(prepareMap(m), r.inputs);
    assert.equal(rr.items, m.items.length);
    assert.equal(rr.salmon, 3);
  });
}

test('only two jumps until the mouse lands again', () => {
  const map = { id: 97, speed: 4, length: 3000, ground: [[-1000, 4000]], solids: [], spikes: [], items: [] };
  const pm = prepareMap(map);
  const s = createSim(pm);
  let minBy = s.by;
  const presses = new Set([0, 10, 20, 30]); // four presses in the air
  for (let t = 0; t < 40; t++) { step(pm, s, presses.has(t) ? ACT.UP : ACT.NONE); minBy = Math.min(minBy, s.by); }
  assert.equal(s.flaps, 2, 'third and fourth press are ignored');
  assert.ok(C.GROUND_Y - minBy < 120, `flew too high: ${C.GROUND_Y - minBy}`);
  for (let t = 0; t < 80; t++) step(pm, s, ACT.NONE); // land
  assert.equal(s.jumps, 0);
  step(pm, s, ACT.UP);
  assert.equal(s.flaps, 3, 'jumps reset after landing');
});

test('doing nothing dies on the first obstacle', () => {
  const r = runReplay(prepareMap(maps[0]), []);
  assert.equal(r.finished, false);
  assert.equal(r.dead, true);
});

test('flap goes up, dive comes down', () => {
  const pm = prepareMap(maps[0]);
  const s = createSim(pm);
  step(pm, s, ACT.UP);
  for (let i = 0; i < 5; i++) step(pm, s, ACT.NONE);
  assert.ok(s.by < C.GROUND_Y - 20);
  const y = s.by;
  step(pm, s, ACT.DOWN);
  assert.ok(s.by > y && s.duck > 0 && s.hold);
  step(pm, s, ACT.RELEASE);
  assert.equal(s.hold, false);
});

test('ducking lasts exactly as long as the right cheek is held', () => {
  const map = { id: 99, speed: 4, length: 2000, ground: [[-1000, 3000]], solids: [{ x: 200, y: 0, w: 600, h: C.GROUND_Y - 24, kind: 'beam' }], spikes: [], items: [] };
  const pm = prepareMap(map);
  assert.equal(runReplay(pm, [[30, ACT.DOWN]]).finished, true, 'held through the beam');
  assert.equal(runReplay(pm, [[30, ACT.DOWN], [230, ACT.RELEASE]]).finished, true, 'released after the beam');
  const early = runReplay(pm, [[30, ACT.DOWN], [100, ACT.RELEASE]]);
  assert.equal(early.dead, true, 'let go under the beam = crash'); assert.equal(early.cause, 'beam');
  assert.equal(runReplay(pm, []).dead, true, 'no slap = crash into the beam');
});

test('crates: land on top is fine, hitting the side ends the run', () => {
  const crate = { x: 300, y: C.GROUND_Y - 30, w: 200, h: 30, kind: 'box' };
  const map = { id: 98, speed: 4, length: 1200, ground: [[-1000, 3000]], solids: [crate], spikes: [], items: [] };
  const pm = prepareMap(map);
  const top = runReplay(pm, [[50, ACT.UP]]);
  assert.equal(top.finished, true, `landing on the crate: ${top.cause}`);
  assert.equal(top.close, 0, 'standing on a crate is not a close shave');
  const side = runReplay(pm, []);
  assert.equal(side.dead, true); assert.equal(side.cause, 'box');
  const beamMap = { ...map, solids: [{ ...crate, kind: 'beam' }] };
  const beam = runReplay(prepareMap(beamMap), [[50, ACT.UP]]);
  assert.equal(beam.dead, true, 'other obstacles still kill on any touch');
});

test('input validation rejects garbage', () => {
  const pm = prepareMap(maps[0]);
  assert.equal(validateInputs(pm, 'x'), false);
  assert.equal(validateInputs(pm, [[5, 1], [5, 2]]), false); // not strictly increasing
  assert.equal(validateInputs(pm, [[1, 3]]), false);
  assert.equal(validateInputs(pm, [[-1, 1]]), false);
  assert.equal(validateInputs(pm, [[1.5, 1]]), false);
  assert.equal(validateInputs(pm, [[pm.maxTicks + 1, 1]]), false);
  assert.equal(validateInputs(pm, new Array(C.MAX_INPUTS + 1).fill(0).map((_, i) => [i, 1])), false);
  assert.equal(validateInputs(pm, [[0, 1], [10, 2], [20, 3]]), true);
  assert.equal(validateInputs(pm, [[0, 2], [10, 2]]), false, 'double press');
  assert.equal(validateInputs(pm, [[0, 1], [1, 1]]), false, 'flaps too close');
  assert.equal(runReplay(pm, [[1, 9]]).valid, false);
});

test('score formula', () => {
  const s = { cheese: 3, gold: 1, close: 2, finished: true };
  assert.equal(scoreOf(s), 3 * 100 + 500 + 50 + 1000);
});

test('the bonus salmon replaces a plain cheese, moves with the seed and scores like the cheese', async () => {
  const { bonusItem } = await import('../shared/sim.js');
  const m = maps[0], pm = prepareMap(m);
  const spots = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((s) => bonusItem(pm, 'seed-' + s)));
  assert.ok(spots.size >= 4, 'different tickets, different places');
  for (const i of spots) assert.equal(m.items[i].kind || 'cheese', 'cheese');
  const perfect = solve(m, { every: 4, perfect: true, budget: 4e6 }).inputs;
  const plain = runReplay(pm, perfect), b = runReplay(pm, perfect, [...spots][0]);
  assert.equal(b.bonus, 1); assert.equal(plain.bonus, 0);
  assert.equal(b.score, plain.score, 'leaderboards stay fair');
  assert.equal(b.salmonIdx.length, 3);
});

test('a foil ball rolls at the mouse when triggered; it kills on contact and can be jumped', () => {
  const G = C.GROUND_Y;
  const map = { id: 99, speed: 4, length: 900, ground: [[-1000, 1900]], solids: [], spikes: [], items: [],
    movers: [{ x: 600, y: G, vx: -2, trig: 300 }] };
  const pm = prepareMap(map);
  const s = createSim(pm);
  while (!s.done && s.x + 4 + C.MOUSE_W < 300) step(pm, s, ACT.NONE);
  assert.equal(s.mv[0], 600, 'lies still until the mouse reaches the trigger');
  step(pm, s, ACT.NONE);
  assert.equal(s.mv[0], 598, 'then rolls towards the mouse');
  assert.equal(runReplay(pm, []).cause, 'foil');
  const r = solve(map, { every: 4 });
  assert.ok(r.ok && runReplay(pm, r.inputs).finished, 'a jump gets over it');
});

test('a foil ball popping out of a crate lands on the crate or the floor, never inside', () => {
  const G = C.GROUND_Y;
  const map = { id: 98, speed: 4, length: 3000, ground: [[-1000, 4000]], solids: [{ x: 1700, y: G - 40, w: 60, h: 40, kind: 'box' }], spikes: [], items: [],
    movers: [{ x: 1720, y: G - 40, vx: -2, vy0: -5, trig: -1000 }] }; // active at once, the mouse stays far away
  const pm = prepareMap(map), s = createSim(pm);
  let maxUp = 0;
  for (let i = 0; i < 100; i++) { step(pm, s, ACT.NONE); maxUp = Math.max(maxUp, G - 40 - s.mv[1]); }
  assert.ok(maxUp > 20, 'pops up first');
  assert.equal(s.mv[1], G, 'ends up on the floor');
  assert.ok(s.mv[0] < 1700 - C.FOIL, 'rolled off the crate to the left');
});
