// Brute-force solver used to prove maps are beatable (tools + tests only, never served).
// Depth-first search over coarse decision points with state memoisation.
//
// perfect: the run must also collect EVERY item (cheese, gold, salmon). Items are
// passed in x order, so a branch that leaves one behind is pruned right away,
// which keeps the search about as small as a plain one.
import { C, ACT, prepareMap, createSim, cloneSim, step } from './sim.js';

// every: decide only every N ticks (bigger = more human-like timing needed)
// prefer: order in which actions are tried (DOWN = start holding, RELEASE = let go)
export function solve(map, { every = 4, prefer = [ACT.NONE, ACT.UP, ACT.DOWN, ACT.RELEASE], budget = 3e6, perfect = false } = {}) {
  if (every < 4) every = 4; // keeps the log inside the human limits (flap gap, events/s)
  const pm = map.solids ? prepareMap(map) : map;
  const items = pm.items; // sorted by x
  const seen = new Set();
  let work = 0;
  let best = { x: 0 };
  let blocker = -1; // highest item position that made a branch fail (perfect mode)
  const inputs = [];

  // first item the mouse has fully passed without taking it, or -1
  function missed(s) {
    while (s.ip < items.length && items[s.ip].x + items[s.ip].w <= s.x) {
      if (!s.collected[items[s.ip].idx]) return s.ip;
      s.ip++;
    }
    return -1;
  }
  function firstUncollected(s) {
    for (let i = 0; i < items.length; i++) if (!s.collected[items[i].idx]) return i;
    return -1;
  }

  function rec(s) {
    if (++work > budget) return false;
    let key = s.tick + ':' + Math.round(s.by) + ':' + Math.round(s.vy * 2) + ':' + (s.hold ? 1 : 0) + ':' + (s.onGround ? 1 : 0) + ':' + s.jumps;
    if (perfect) key += ':' + (s.cheese + s.gold + s.salmon);
    if (seen.has(key)) return false;
    seen.add(key);
    for (const act of prefer) {
      if (act === ACT.UP && s.jumps >= C.MAX_JUMPS) continue;
      if (act === ACT.DOWN && s.hold) continue;
      if (act === ACT.RELEASE && !s.hold) continue;
      const n = cloneSim(s);
      n.ip = s.ip;
      const t0 = n.tick;
      step(pm, n, act);
      for (let i = 1; i < every && !n.done; i++) step(pm, n, ACT.NONE);
      if (n.x > best.x) best = { x: n.x, tick: n.tick };
      if (perfect) {
        const m = n.finished ? firstUncollected(n) : missed(n);
        if (m >= 0) { if (m > blocker) blocker = m; continue; }
      }
      if (n.finished) { if (act) inputs.push([t0, act]); return true; }
      if (n.dead) continue;
      if (rec(n)) { if (act) inputs.push([t0, act]); return true; }
    }
    return false;
  }
  const s0 = createSim(pm);
  s0.ip = 0;
  const ok = rec(s0);
  inputs.reverse();
  return {
    ok, inputs: ok ? inputs : null, work, reached: best.x, length: pm.length,
    blocker: blocker >= 0 ? items[blocker].idx : -1, // raw map.items index of the item that could not be taken
  };
}
