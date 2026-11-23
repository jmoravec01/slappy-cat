// Slappy Cat — deterministic game simulation.
// Shared by the browser (live play) and the server (replay verification), so
// it must stay bit-for-bit deterministic across JS engines: only + - * /,
// comparisons and integer ops. No Math.sin/sqrt/random, no Date.
//
// Rules:
//  - left cheek  (UP)        : jump; one more jump in the air (max 2 until you land again)
//  - right cheek (DOWN held) : duck while held; pressing it in the air = dive
//  - crates can be landed on from above (and walked on); hitting a crate from
//    the side or from below ends the run.
//  - touching any other obstacle (beam, pipe, spike, pit wall) ends the run.
//  - foil balls lie still until the mouse reaches their trigger x, then roll (vx), pop up (vy0) and fall
//    onto the floor or crates. The mouse's x depends on the tick only, so a ball's path does too.

export const C = Object.freeze({
  TICK_RATE: 60,
  WORLD_H: 360,
  GROUND_Y: 300,
  MOUSE_W: 30,
  MOUSE_H: 26,
  DUCK_H: 12,
  GRAVITY: 0.45,
  FLAP_VY: -7.2,
  DIVE_VY: 9,
  MAX_FALL: 11,
  CLOSE_PX: 8,      // "close shave" clearance
  START_X: 0,
  ITEM: 26,         // item hitbox size
  MAX_INPUTS: 6000,
  MIN_FLAP_GAP: 3,  // ticks between two flaps (50 ms): faster is not human
  MAX_JUMPS: 2,     // jump + one air jump, reset on landing
  MAX_EVENTS_PER_SEC: 16,
  SCORE: Object.freeze({ cheese: 100, gold: 500, salmon: 1000, close: 25, finish: 1000 }),
  SALMON_PER_MAP: 3,
  FOIL: 20,         // foil ball size; its hitbox is 3 px smaller on every side
});

// input events: UP = flap, DOWN = right cheek pressed, RELEASE = right cheek released
export const ACT = Object.freeze({ NONE: 0, UP: 1, DOWN: 2, RELEASE: 3 });

const CHUNK = 240; // ground is split into chunks so every collider is narrow

function lowerBound(arr, x) { // first index with arr[i].x >= x
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m].x < x) lo = m + 1; else hi = m; }
  return lo;
}

function maxW(arr) { let m = 0; for (const o of arr) if (o.w > m) m = o.w; return m; }

// Turn raw map JSON into a runtime structure (sorted arrays, hitboxes).
export function prepareMap(map) {
  const solids = [];
  for (const [x1, x2] of map.ground) {
    for (let x = x1; x < x2; x += CHUNK) {
      const w = Math.min(CHUNK, x2 - x);
      solids.push({ x, y: C.GROUND_Y, w, h: C.WORLD_H - C.GROUND_Y + 400, ground: true, id: -1 });
    }
  }
  const obstacles = []; // things that count for close shaves
  map.solids.forEach((s) => {
    const o = { x: s.x, y: s.y, w: s.w, h: s.h, ground: false, kind: s.kind || 'box', id: obstacles.length };
    solids.push(o); obstacles.push(o);
  });
  const spikes = map.spikes.map((s) => {
    const down = s.dir === 'down';
    const o = {
      x: s.x + s.w * 0.25, w: s.w * 0.5,
      y: down ? s.y : s.y + s.h * 0.35, h: s.h * 0.65,
      id: obstacles.length, spike: true,
    };
    obstacles.push(o);
    return o;
  });
  const items = map.items.map((it, i) => ({
    x: it.x - C.ITEM / 2, y: it.y - C.ITEM / 2, w: C.ITEM, h: C.ITEM, kind: it.kind || 'cheese', idx: i,
  }));
  const byX = (a, b) => a.x - b.x || a.y - b.y;
  solids.sort(byX); spikes.sort(byX); items.sort(byX);
  obstacles.sort(byX);
  const zones = (map.zones || []).slice().sort((a, b) => a.x - b.x);
  const movers = (map.movers || []).map((m) => ({ x: m.x, y: m.y, vx: m.vx, vy0: m.vy0 || 0, trig: m.trig }));
  const length = map.length;
  let minSpeed = map.speed;
  for (const z of zones) if (z.speed < minSpeed) minSpeed = z.speed;
  return {
    id: map.id, length, speed: map.speed, zones,
    solids, spikes, items, obstacles, movers,
    solidsMaxW: maxW(solids), spikesMaxW: maxW(spikes),
    itemCount: items.length,
    maxTicks: Math.ceil(length / minSpeed) + 120,
  };
}

// Repeat runs hide one bonus salmon in place of a plain cheese; which one comes from the run ticket, so it moves
// every run and the server can recompute it. It scores like the cheese it replaces (boards stay fair) and pays
// one salmon into the market wallet.
export function bonusItem(pm, seed) {
  const c = pm.items.filter((o) => o.kind === 'cheese');
  if (!c.length || !seed) return -1;
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return c[(h >>> 0) % c.length].idx;
}

export function createSim(pm, bonus = -1) {
  return {
    bonusIdx: bonus, bonus: 0,
    tick: 0, x: C.START_X, by: C.GROUND_Y, vy: 0, hold: false, duck: 0, onGround: true, jumps: 0,
    speed: pm.speed, zoneIdx: 0,
    dead: false, cause: '', finished: false, done: false,
    cheese: 0, gold: 0, salmon: 0, close: 0, flaps: 0, dives: 0,
    collected: new Uint8Array(pm.itemCount),
    mv: Float64Array.from(pm.movers.flatMap((m) => [m.x, m.y, 0, 0])), // per ball: x, bottom y, vy, active
    obsNext: 0, active: [], // close-shave tracking: [{o, min, disq}]
    events: null,          // optional array the client can read (pickups etc.)
  };
}

export function cloneSim(s) {
  const c = Object.assign({}, s);
  c.collected = s.collected.slice();
  c.mv = s.mv.slice();
  c.active = s.active.map((a) => ({ o: a.o, min: a.min, disq: a.disq }));
  c.events = null;
  return c;
}

export function scoreOf(s) {
  return s.cheese * C.SCORE.cheese + s.gold * C.SCORE.gold + (s.salmon || 0) * C.SCORE.salmon + s.close * C.SCORE.close +
    (s.finished ? C.SCORE.finish : 0);
}

function overlaps(l, t, r, b, o) {
  return l < o.x + o.w && r > o.x && t < o.y + o.h && b > o.y;
}

function emit(s, e) { if (s.events) s.events.push(e); }

function die(s, cause) { s.dead = true; s.done = true; s.cause = cause; emit(s, { t: 'die', cause }); }

// Advance one tick. act: one of ACT
export function step(pm, s, act) {
  if (s.done) return;
  // --- input ---
  if (act === ACT.UP) {
    if (s.jumps < C.MAX_JUMPS) { s.vy = C.FLAP_VY; s.onGround = false; s.flaps++; s.jumps++; }
  } else if (act === ACT.DOWN) {
    s.hold = true; s.dives++;
    if (!s.onGround && s.vy < C.DIVE_VY) s.vy = C.DIVE_VY;
  } else if (act === ACT.RELEASE) {
    s.hold = false;
  }
  s.duck = s.hold ? 1 : 0;
  const h = s.hold ? C.DUCK_H : C.MOUSE_H;

  // --- speed zones ---
  while (s.zoneIdx < pm.zones.length && pm.zones[s.zoneIdx].x <= s.x) {
    s.speed = pm.zones[s.zoneIdx].speed; s.zoneIdx++;
  }

  const solids = pm.solids;
  const sLo = lowerBound(solids, s.x - pm.solidsMaxW - 1);

  // --- horizontal: any contact while moving forward is fatal ---
  s.x += s.speed;
  const l = s.x, r = s.x + C.MOUSE_W;
  for (let i = sLo; i < solids.length && solids[i].x < r; i++) {
    const o = solids[i];
    if (overlaps(l, s.by - h, r, s.by, o)) { die(s, o.ground ? 'wall' : o.kind); return; }
  }

  // --- vertical: the floor and the tops of crates can be landed on ---
  s.vy += C.GRAVITY;
  if (s.vy > C.MAX_FALL) s.vy = C.MAX_FALL;
  const prevBottom = s.by;
  s.by += s.vy;
  s.onGround = false;
  for (let i = sLo; i < solids.length && solids[i].x < r; i++) {
    const o = solids[i];
    if (!overlaps(l, s.by - h, r, s.by, o)) continue;
    if ((o.ground || o.kind === 'box') && s.vy >= 0 && prevBottom <= o.y + 0.01) {
      s.by = o.y; s.vy = 0; s.onGround = true; s.jumps = 0;
      if (!o.ground) for (const a of s.active) if (a.o === o) a.disq = true; // standing on it is no close shave
    } else { die(s, o.ground ? 'wall' : o.kind); return; }
  }
  if (s.by - h < 0) { s.by = h; if (s.vy < 0) s.vy = 0; }
  if (s.by - h > C.WORLD_H) { die(s, 'fall'); return; }
  const top = s.by - h, bottom = s.by;

  // --- foil balls ---
  const F = C.FOIL;
  for (let j = 0, b = 0; j < pm.movers.length; j++, b += 4) {
    const m = pm.movers[j], mv = s.mv;
    let x = mv[b], y = mv[b + 1], vy = mv[b + 2];
    if (!mv[b + 3] && r >= m.trig) { mv[b + 3] = 1; vy = m.vy0; emit(s, { t: 'foil', j }); }
    if (mv[b + 3] && y < C.WORLD_H + 60) {
      x += m.vx;
      vy += C.GRAVITY; if (vy > C.MAX_FALL) vy = C.MAX_FALL;
      const prev = y; y += vy;
      if (vy >= 0) {
        for (let i = lowerBound(solids, x - pm.solidsMaxW - 1); i < solids.length && solids[i].x < x + F; i++) {
          const o = solids[i];
          if ((o.ground || o.kind === 'box') && x + F > o.x && x < o.x + o.w && prev <= o.y + 0.01 && y >= o.y) { y = o.y; vy = 0; }
        }
      }
      mv[b] = x; mv[b + 1] = y; mv[b + 2] = vy;
    }
    if (l < x + F - 3 && r > x + 3 && top < y - 3 && bottom > y - F + 3) { die(s, 'foil'); return; }
  }

  // --- spikes ---
  const sp = pm.spikes;
  for (let i = lowerBound(sp, l - pm.spikesMaxW - 1); i < sp.length && sp[i].x < r; i++) {
    if (overlaps(l, top, r, bottom, sp[i])) { die(s, 'spike'); return; }
  }

  // --- items ---
  const it = pm.items;
  for (let i = lowerBound(it, l - C.ITEM - 1); i < it.length && it[i].x < r; i++) {
    const o = it[i];
    if (s.collected[o.idx] || !overlaps(l, top, r, bottom, o)) continue;
    s.collected[o.idx] = 1;
    if (o.kind === 'gold') s.gold++; else if (o.kind === 'salmon') s.salmon++; else s.cheese++;
    if (o.idx === s.bonusIdx) s.bonus = 1;
    emit(s, { t: 'item', kind: o.kind, idx: o.idx, x: o.x + o.w / 2, y: o.y + o.h / 2, bonus: o.idx === s.bonusIdx });
  }

  // --- close shaves ---
  const obs = pm.obstacles;
  while (s.obsNext < obs.length && obs[s.obsNext].x < r) {
    s.active.push({ o: obs[s.obsNext], min: 1e9, disq: false }); s.obsNext++;
  }
  for (let i = s.active.length - 1; i >= 0; i--) {
    const a = s.active[i], o = a.o;
    if (l >= o.x + o.w) { // passed it
      if (!a.disq && a.min < C.CLOSE_PX) { s.close++; emit(s, { t: 'close', x: o.x + o.w / 2, y: o.y }); }
      s.active.splice(i, 1);
      continue;
    }
    if (r <= o.x) continue;
    let c;
    if (bottom <= o.y) c = o.y - bottom; else if (top >= o.y + o.h) c = top - (o.y + o.h); else c = 0;
    if (c < a.min) a.min = c;
  }

  s.tick++;
  if (s.x >= pm.length) { s.finished = true; s.done = true; emit(s, { t: 'finish' }); return; }
  if (s.tick >= pm.maxTicks) die(s, 'timeout');
}

// Validate an input log: [[tick, act], ...]. Besides the format this enforces
// what a human with a keyboard / touch screen can physically produce.
export function validateInputs(pm, inputs) {
  if (!Array.isArray(inputs) || inputs.length > C.MAX_INPUTS) return false;
  let last = -1, lastFlap = -1e9, hold = false;
  const win = []; // ticks of the events in the last second
  for (const e of inputs) {
    if (!Array.isArray(e) || e.length !== 2) return false;
    const [t, a] = e;
    if (!Number.isInteger(t) || t <= last || t < 0 || t > pm.maxTicks) return false;
    if (a === ACT.UP) {
      if (t - lastFlap < C.MIN_FLAP_GAP) return false;
      lastFlap = t;
    } else if (a === ACT.DOWN) {
      if (hold) return false;
      hold = true;
    } else if (a === ACT.RELEASE) {
      if (!hold) return false;
      hold = false;
    } else return false;
    win.push(t);
    while (win[0] <= t - C.TICK_RATE) win.shift();
    if (win.length > C.MAX_EVENTS_PER_SEC) return false;
    last = t;
  }
  return true;
}

// Re-run a whole attempt from its input log. Returns the outcome.
export function runReplay(pm, inputs, bonus = -1) {
  if (!validateInputs(pm, inputs)) return { valid: false };
  const s = createSim(pm, bonus);
  let k = 0;
  while (!s.done) {
    let act = ACT.NONE;
    if (k < inputs.length && inputs[k][0] === s.tick) { act = inputs[k][1]; k++; }
    step(pm, s, act);
  }
  return {
    valid: true, used: k, finished: s.finished, dead: s.dead, cause: s.cause, ticks: s.tick, x: s.x,
    cheese: s.cheese, gold: s.gold, salmon: s.salmon, close: s.close, score: scoreOf(s),
    items: s.cheese + s.gold + s.salmon, itemsTotal: pm.itemCount, bonus: s.bonus,
    salmonIdx: pm.items.filter((o) => o.kind === 'salmon' && s.collected[o.idx]).map((o) => o.idx),
    collectedIdx: pm.items.filter((o) => s.collected[o.idx]).map((o) => o.idx),
  };
}
