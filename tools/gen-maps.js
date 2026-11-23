// Generates shared/maps.json from hand-tuned pattern pools + fixed seeds.
// Every map is proven beatable by the solver before it is written.
// Usage: node tools/gen-maps.js [--only N]
import { writeFileSync } from 'node:fs';
import { C, ACT, prepareMap, runReplay } from '../shared/sim.js';
import { solve } from '../shared/solver.js';

const G = C.GROUND_Y;

function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Builder {
  constructor(r) {
    this.r = r; this.x = 0; this.groundFrom = -1000;
    this.ground = []; this.solids = []; this.spikes = []; this.items = []; this.zones = []; this.signs = []; this.movers = [];
  }
  ri(a, b) { return a + Math.floor(this.r() * (b - a + 1)); }
  pick(arr) { return arr[Math.floor(this.r() * arr.length)]; }
  chance(p) { return this.r() < p; }
  run(w) { this.x += Math.round(w); }
  salmon(dx, dy) { this.cheese(dx, dy, 'salmon'); }
  cheese(dx, dy, kind = 'cheese') { this.items.push({ x: Math.round(this.x + dx), y: Math.round(G - dy), kind }); }
  spike(dx, n = 1) { for (let i = 0; i < n; i++) this.spikes.push({ x: this.x + dx + i * 30, y: G - 30, w: 30, h: 30 }); }
  pitStart() { if (this.x > this.groundFrom) this.ground.push([this.groundFrom, this.x]); }
  pitEnd() { this.groundFrom = this.x; }
  box(dx, w, h, y = G - h, kind = 'box') { this.solids.push({ x: this.x + dx, y, w, h, kind }); }
  sign(cs, en) { this.signs.push({ x: this.x, cs, en }); }
  // foil ball: bottom-left at (dx, height above the floor), starts when the mouse reaches trigDx
  foil(dx, up, vx, trigDx = 0, vy0 = 0) {
    this.movers.push({ x: this.x + dx, y: G - up, vx: Math.round(vx * 4) / 4, vy0, trig: this.x + trigDx });
  }
  finish(len) { this.run(len); this.ground.push([this.groundFrom, this.x + 900]); }
}

const BEAM_Y = G - 24; // bottom edge of an overhead beam: must duck

// ---- patterns: (b, d) where d = difficulty 0..1. Each starts with its own lead-in run.
const P = {
  spike1(b, d) {
    b.run(lead(b, d)); b.spike(0, 1);
    if (b.chance(0.6)) b.cheese(15, 62);
    b.run(30);
  },
  spike2(b, d) {
    b.run(lead(b, d)); b.spike(0, 2);
    if (b.chance(0.5)) b.cheese(30, 64);
    b.run(60);
  },
  spike3(b, d) {
    b.run(lead(b, d) + 20); b.spike(0, 3);
    if (b.chance(0.5)) b.cheese(45, 95, b.chance(0.3) ? 'gold' : 'cheese');
    b.run(90);
  },
  spikeDouble(b, d) { // two singles in quick succession
    b.run(lead(b, d)); b.spike(0, 1); b.run(30 + b.ri(130, 170) - d * 20); b.spike(0, 1); b.run(30);
  },
  beam(b, d) {
    const w = b.ri(80, 120 + Math.round(d * 260));
    b.run(lead(b, d)); b.box(0, w, BEAM_Y, 0, 'beam');
    for (let x = 30; x < w - 10; x += 70) if (b.chance(0.7)) b.cheese(x, 12);
    b.run(w);
  },
  pit(b, d) {
    const w = b.ri(70, 100 + Math.round(d * 90));
    b.run(lead(b, d)); b.pitStart(); b.cheese(w / 2, 52);
    if (d > 0.4 && b.chance(0.25)) b.cheese(w / 2, -34, 'gold');
    b.run(w); b.pitEnd(); b.run(40);
  },
  crate(b, d) { // a crate to hop over: touching it ends the run
    const h = b.pick([30, 40, 50]); const w = b.ri(40, 60 + Math.round(d * 60));
    b.run(lead(b, d)); b.box(0, w, h);
    if (b.chance(0.6)) b.cheese(w / 2, h + 48);
    b.run(w);
  },
  crateStack(b, d) { // two crates on top of each other: needs a double flap
    const h = 34 + b.ri(0, 6 + Math.round(d * 6)); const w = 50;
    b.run(lead(b, d) + 20); b.box(0, w, h); b.box(0, w, h, G - 2 * h);
    if (b.chance(0.5)) b.cheese(w / 2, 2 * h + 46, d > 0.5 && b.chance(0.4) ? 'gold' : 'cheese');
    b.run(w);
  },
  stairs(b, d) { // crates as steps: jump up onto each one (the sides are deadly)
    b.run(lead(b, d) + 20);
    const n = d > 0.5 ? 3 : 2;
    for (let i = 1; i <= n; i++) { b.box(0, 110, i * 30); if (i === n) b.cheese(55, i * 30 + 13); b.run(110); }
    if (d > 0.35 && b.chance(0.5)) { b.pitStart(); b.run(b.ri(80, 110)); b.pitEnd(); }
    b.run(40);
  },
  crateHop(b, d) { // crates over a hole: hop from top to top
    b.run(lead(b, d)); b.pitStart(); b.run(60);
    const n = b.ri(2, 3 + Math.round(d * 2));
    for (let i = 0; i < n; i++) {
      const h = b.pick([30, 40, 50]), w = b.ri(70, 110);
      b.box(0, w, C.WORLD_H + 400 - (G - h), G - h); b.cheese(w / 2, h + 13);
      b.run(w + b.ri(60, 80 + Math.round(d * 30)));
    }
    b.pitEnd(); b.run(40);
  },
  spikyCrate(b, d) { // a long crate with spikes on top: land on it, then jump the spikes
    const h = b.pick([30, 40]); const w = b.ri(220, 280);
    b.run(lead(b, d)); b.box(0, w, h);
    b.spikes.push({ x: b.x + w - 100, y: G - h - 30, w: 30, h: 30 });
    if (d > 0.6) b.spikes.push({ x: b.x + w - 70, y: G - h - 30, w: 30, h: 30 });
    b.cheese(60, h + 13); b.cheese(w - 85, h + 62);
    b.run(w);
  },
  longCrate(b, d) { // a long low crate: land on it or fly over
    const h = b.pick([26, 32, 38]); const w = b.ri(140, 180 + Math.round(d * 80));
    b.run(lead(b, d)); b.box(0, w, h);
    for (let x = 30; x < w - 10; x += 60) if (b.chance(0.6)) b.cheese(x, h + 50);
    b.run(w);
  },
  spikeBeam(b, d) { // jump the spike, dive under the beam
    b.run(lead(b, d)); b.spike(0, 1); b.run(30 + b.ri(120, 150));
    const w = b.ri(100, 220); b.box(0, w, BEAM_Y, 0, 'beam'); b.cheese(w / 2, 12); b.run(w);
  },
  beamSpike(b, d) { // duck under, then jump right out of it
    b.run(lead(b, d)); const w = b.ri(90, 160); b.box(0, w, BEAM_Y, 0, 'beam'); b.run(w + b.ri(60, 90));
    b.spike(0, d > 0.5 ? 2 : 1); b.run(d > 0.5 ? 60 : 30);
  },
  lowJump(b, d) { // low ceiling over spikes: small hop only
    b.run(lead(b, d)); const w = 200;
    b.box(-20, w + 40, 196, 0, 'beam'); b.spike(70, 1); b.cheese(85, 52); b.run(w + 20);
  },
  wideGap(b, d) { // a wide hole: double jump across it
    const w = b.ri(140, 170 + Math.round(d * 50));
    b.run(lead(b, d)); b.pitStart();
    for (let x = 40; x < w - 30; x += 50) b.cheese(x, 60 + (x % 100 === 40 ? 20 : 0));
    b.run(w); b.pitEnd(); b.run(40);
  },
  pipes(b, d) { // chimneys / pipes standing on the ground: jump through the gap between the halves
    b.run(lead(b, d) + 40);
    const n = b.ri(2, 3 + Math.round(d * 3)); const gap = Math.round(118 - d * 22);
    for (let i = 0; i < n; i++) {
      const bh = b.ri(24, 50 + Math.round(d * 40));           // lower pipe height
      const top = G - bh - gap;                              // bottom edge of the upper pipe
      b.box(0, 56, top, 0, 'pipe'); b.box(0, 56, bh, G - bh, 'pipe');
      if (b.chance(0.7)) b.cheese(28, bh + gap / 2, i === n - 1 && b.chance(0.3) ? 'gold' : 'cheese');
      b.run(56 + b.ri(170, 220) - Math.round(d * 40));
    }
  },
  tunnel(b, d) { // long beam: hold the right cheek all the way through
    const w = b.ri(300, 380 + Math.round(d * 300));
    b.run(lead(b, d)); b.box(0, w, BEAM_Y, 0, 'beam');
    for (let x = 40; x < w - 20; x += 90) b.cheese(x, 12);
    b.run(w);
  },
  crateBeam(b, d) { // hop a crate, then dive and hold under a beam behind it
    b.run(lead(b, d)); b.box(0, 50, 40); b.cheese(25, 88); b.run(50 + b.ri(120, 150));
    const w = b.ri(100, 180); b.box(0, w, BEAM_Y, 0, 'beam'); b.cheese(w / 2, 12); b.run(w);
  },
  hangSpikes(b, d) { // spikes hanging from a high beam above a pit: keep jumps low
    b.run(lead(b, d)); const w = b.ri(150, 190);
    b.box(-10, w + 20, 150, 0, 'beam');
    for (let x = 0; x < w; x += 30) b.spikes.push({ x: b.x + x, y: 150, w: 30, h: 30, dir: 'down' });
    b.pitStart(); b.run(25); b.cheese(w / 2 - 25, 40); b.run(w - 55); b.pitEnd(); b.run(30);
  },
  cheeseRun(b, d) { // bonus arc
    b.run(lead(b, d));
    for (let i = 0; i < 5; i++) b.cheese(i * 40, 13 + (i === 2 ? 50 : i % 2 ? 30 : 0));
    b.run(200);
  },
  foilRoll(b, d) { // a ball lying ahead (maybe still off screen) starts rolling at the mouse: jump it
    if (b.foilIntro) { b.foilIntro = false; b.run(160); b.sign('Pozor, alobal! Přeskoč ho', 'Foil ball! Jump over it'); b.run(200); }
    b.run(lead(b, d)); const D = b.ri(380, 680);
    b.foil(D, 0, -(1.5 + d * 2 + b.r()), 0); b.run(D + 80);
  },
  foilCrate(b, d) { // the ball pops out of a crate, drops to the floor and rolls back: jump it, then the crate
    b.run(lead(b, d)); const D = b.ri(380, 470), h = b.pick([36, 44]);
    b.box(D, 60, h); b.foil(D + 20, h, -(2 + d * 1.5), 0, -5); b.cheese(D + 30, h + 50); b.run(D + 60 + 160);
  },
  foilDrop(b, d) { // a ball falls from the top shelf right in front of the mouse (a shadow warns where)
    b.run(lead(b, d)); const D = b.ri(330, 420);
    b.foil(D, G + 40, b.chance(0.5) ? 0 : -1, 0); b.run(D + 140);
  },
};

// ---- salmon spots: exactly 3 per map, each needs a quick combo (double jump,
// crates, timing). Never in the same place as cheese.
const S = {
  salmonCrate(b, d) { // land on a crate, then double jump from it
    b.run(lead(b, d) + 40); const h = b.pick([44, 50]); b.box(0, 80, h);
    b.cheese(40, h + 13);
    b.salmon(120, h + 132); b.run(80 + 280);
  },
  salmonStairs(b, d) { // climb two crates, double jump from the top step
    b.run(lead(b, d) + 40);
    for (let i = 1; i <= 2; i++) { b.box(0, 90, i * 32); b.run(90); }
    b.salmon(50, 64 + 132); b.run(280);
  },
  salmonSpikes(b, d) { // high above a row of spikes: the second jump must come at the top of the first
    b.run(lead(b, d) + 40); b.spike(0, 3); b.salmon(45, 132); b.run(90 + 240);
  },
  salmonDip(b, d) { // down in a hole: drop in without jumping, grab it, double jump out
    b.run(lead(b, d) + 40); b.pitStart(); b.salmon(60, -22); b.run(170); b.pitEnd(); b.run(260);
  },
  salmonBeam(b, d) { // right behind a beam: let go and double jump straight away
    b.run(lead(b, d) + 40); const w = b.ri(120, 160); b.box(0, w, BEAM_Y, 0, 'beam'); b.cheese(w / 2, 12);
    b.salmon(w + 95, 112); b.run(w + 300);
  },
};

function lead(b, d) { return b.ri(160, 240) - Math.round(d * 110); }

// Five houses, four rooms each, getting harder from the country cottage to the villa.
const WORLDS = [
  { icon: '🏡', cs: 'Chalupa na venkově', en: 'Country cottage' },
  { icon: '🏢', cs: 'Panelák ve městě', en: 'City tower block' },
  { icon: '🏚️', cs: 'Chudá čtvrť', en: 'Poor quarter' },
  { icon: '🏙️', cs: 'Centrum města', en: 'City centre' },
  { icon: '🏰', cs: 'Luxusní vila', en: 'Luxury villa' },
];

const ALL = () => Object.keys(P);
// world, theme, names, speed, difficulty range, pattern pool, number of patterns, speed zones
const DEFS = [
  { w: 0, theme: 'kitchen', cs: 'Kuchyň s kamny', en: 'Cottage kitchen', speed: 4, d: [0, 0.15], n: 18, pool: ['spike1', 'spike1', 'beam', 'pit', 'crate', 'cheeseRun'], tutorial: true, salmon: ['salmonCrate', 'salmonSpikes', 'salmonStairs'] },
  { w: 0, theme: 'garden', cs: 'Zahrada', en: 'Garden', speed: 4.25, d: [0.08, 0.25], n: 22, pool: ['pit', 'spike1', 'spike2', 'crate', 'beam', 'crateHop', 'cheeseRun'] },
  { w: 0, theme: 'barn', cs: 'Stodola', en: 'Barn', speed: 4.25, d: [0.15, 0.32], n: 24, pool: ['crate', 'stairs', 'crateStack', 'spike2', 'pit', 'longCrate'] },
  { w: 0, theme: 'cellar', cs: 'Sklep s bramborami', en: 'Potato cellar', speed: 4.5, d: [0.22, 0.4], n: 24, pool: ['tunnel', 'beam', 'spikeBeam', 'spike2', 'lowJump', 'crateBeam'] },
  { w: 1, theme: 'living', cs: 'Obývák', en: 'Living room', speed: 4.5, d: [0.28, 0.45], n: 24, pool: ['spike1', 'spike2', 'beam', 'crate', 'stairs', 'crateStack', 'pit', 'spikeDouble', 'cheeseRun', 'foilRoll'], foilIntro: true },
  { w: 1, theme: 'bathroom', cs: 'Koupelna', en: 'Bathroom', speed: 4.75, d: [0.32, 0.5], n: 26, pool: ['spike2', 'spike3', 'beam', 'spikeBeam', 'pit', 'crate', 'spikyCrate', 'lowJump', 'cheeseRun', 'foilRoll'], zones: true },
  { w: 1, theme: 'stairwell', cs: 'Chodba paneláku', en: 'Stairwell', speed: 4.75, d: [0.38, 0.55], n: 26, pool: ['stairs', 'stairs', 'crateStack', 'beam', 'spike2', 'spikeDouble', 'lowJump', 'foilRoll', 'foilCrate'] },
  { w: 1, theme: 'roofs', cs: 'Střechy', en: 'Rooftops', speed: 4.5, d: [0.4, 0.58], n: 16, pool: ['pipes', 'pipes', 'pipes', 'spike2', 'wideGap', 'pit'] },
  { w: 2, theme: 'attic', cs: 'Podkrovní kutloch', en: 'Attic bedsit', speed: 4.75, d: [0.45, 0.62], n: 26, pool: ['stairs', 'crateStack', 'longCrate', 'spikyCrate', 'crateBeam', 'lowJump', 'hangSpikes', 'spike3', 'beam', 'foilCrate', 'foilDrop'] },
  { w: 2, theme: 'alley', cs: 'Ulička', en: 'Back alley', speed: 5, d: [0.5, 0.68], n: 28, pool: ['spike1', 'spike2', 'spikeDouble', 'beam', 'pit', 'crateHop', 'wideGap', 'beamSpike', 'crate', 'foilRoll', 'foilDrop'], zones: true },
  { w: 2, theme: 'laundry', cs: 'Prádelna', en: 'Laundry room', speed: 5, d: [0.55, 0.72], n: 28, pool: ['beam', 'beam', 'hangSpikes', 'lowJump', 'spikeBeam', 'beamSpike', 'spike2', 'crate', 'foilDrop'] },
  { w: 2, theme: 'sewer', cs: 'Kanál', en: 'Sewer', speed: 4.75, d: [0.58, 0.75], n: 20, pool: ['pipes', 'pipes', 'tunnel', 'hangSpikes', 'spikeBeam', 'pit'] },
  { w: 3, theme: 'bakery', cs: 'Pekárna', en: 'Bakery', speed: 5.25, d: [0.62, 0.8], n: 28, pool: ALL(), zones: true },
  { w: 3, theme: 'market', cs: 'Tržnice', en: 'Market hall', speed: 5.25, d: [0.66, 0.84], n: 30, pool: ['crate', 'crateHop', 'crateStack', 'longCrate', 'stairs', 'spikyCrate', 'spike2', 'cheeseRun', 'foilCrate'], zones: true },
  { w: 3, theme: 'metro', cs: 'Metro', en: 'Underground', speed: 5.5, d: [0.7, 0.88], n: 30, pool: ['tunnel', 'beam', 'spikeBeam', 'beamSpike', 'pit', 'wideGap', 'lowJump', 'spike3', 'foilRoll'], zones: true },
  { w: 3, theme: 'factory', cs: 'Sýrárna', en: 'Cheese factory', speed: 5.5, d: [0.74, 0.92], n: 32, pool: [...ALL(), 'spike3', 'pipes'], zones: true },
  { w: 4, theme: 'marble', cs: 'Mramorová hala', en: 'Marble hall', speed: 5.5, d: [0.78, 0.95], n: 32, pool: ['spike2', 'spike3', 'pit', 'wideGap', 'beamSpike', 'crateBeam', 'spikeDouble', 'crate', 'foilRoll', 'foilDrop'], zones: true },
  { w: 4, theme: 'library', cs: 'Knihovna', en: 'Library', speed: 5.5, d: [0.8, 0.96], n: 32, pool: ['stairs', 'longCrate', 'crateStack', 'hangSpikes', 'crateBeam', 'spikyCrate', 'beam', 'spike3', 'foilDrop'], zones: true },
  { w: 4, theme: 'pool', cs: 'Bazén', en: 'Pool', speed: 5.75, d: [0.82, 0.98], n: 32, pool: ['pit', 'pit', 'wideGap', 'crateHop', 'pipes', 'spike2', 'beam'], zones: true },
  { w: 4, theme: 'throne', cs: 'Kočičí trůn', en: 'Cat throne', speed: 5.75, d: [0.85, 1], n: 38, seed: 1847, pool: ALL().filter((k) => k !== 'cheeseRun'), zones: true },
];

function buildMap(i, seed) {
  const def = DEFS[i];
  const b = new Builder(rng(seed));
  b.foilIntro = !!def.foilIntro;
  b.run(420);
  if (def.tutorial) {
    b.sign('Plácni levou (A / ←) = SKOK', 'Slap left (A / ←) = JUMP');
    b.run(260); b.spike(0, 1); b.cheese(15, 62); b.run(30 + 360);
    b.sign('Drž pravou (D / →) = PODLEZ', 'Hold right (D / →) = DUCK');
    b.run(260); b.box(0, 110, BEAM_Y, 0, 'beam'); b.cheese(55, 12); b.run(110 + 300);
    b.sign('Dvojskok (A A) přes díry! Víc skoků ve vzduchu nejde.', 'Double jump (A A) over pits! No more in the air.');
    b.run(240); b.pitStart(); b.cheese(50, 52); b.run(110); b.pitEnd(); b.run(320);
    b.sign('Na bednu skoč shora, ze strany = konec!', 'Land on crates from above, sides = game over!');
    b.run(260); b.box(0, 120, 36); b.cheese(60, 49); b.run(120 + 260);
  }
  const salmonAt = new Set([Math.floor(def.n * 0.25), Math.floor(def.n * 0.55), Math.floor(def.n * 0.85)]);
  const spool = def.salmon || Object.keys(S);
  let last = '';
  for (let k = 0; k < def.n; k++) {
    if (salmonAt.has(k)) S[b.pick(spool)](b, def.d[0] + (def.d[1] - def.d[0]) * (k / def.n));
    const d = def.d[0] + (def.d[1] - def.d[0]) * (k / Math.max(1, def.n - 1));
    let name = b.pick(def.pool);
    if (name === last) name = b.pick(def.pool);
    last = name;
    P[name](b, d);
    if (def.zones && k > 4 && k % 9 === 0) {
      const sp = Math.round((def.speed + (b.chance(0.5) ? 0.75 : -0.5)) * 4) / 4;
      b.run(120); b.zones.push({ x: b.x, speed: sp }); b.sign(sp > def.speed ? '>>>' : '<<', sp > def.speed ? '>>>' : '<<');
    } else if (def.zones && k > 4 && k % 9 === 3 && b.zones.length) {
      b.run(120); b.zones.push({ x: b.x, speed: def.speed }); b.sign('=', '=');
    }
  }
  b.run(500);
  const length = b.x;
  b.finish(0);
  return {
    id: i + 1, world: def.w, theme: def.theme, name: { cs: def.cs, en: def.en }, speed: def.speed, length,
    ground: b.ground, solids: b.solids, spikes: b.spikes, items: b.items, zones: b.zones, signs: b.signs,
    ...(b.movers.length ? { movers: b.movers } : {}), // maps without foil keep their old hash (and scores)
  };
}

// Difficulty = the coarsest input timing (in ticks) at which the solver can
// still finish. Big = forgiving, small = needs precise slaps.
const GRID = [4, 5, 6, 8, 10, 12, 15];
const BANDS = [[12, 99], [12, 99], [12, 99], [10, 99], [10, 99], [10, 15], [10, 15], [10, 15], [8, 12], [8, 12], [8, 12], [6, 10], [6, 10], [6, 10], [6, 8], [5, 8], [5, 8], [5, 8], [5, 6], [5, 6]];
function coarsest(map) {
  const r5 = solve(map, { every: 5, budget: 6e5 });
  if (!r5.ok) return { best: 0 };
  for (const e of [...GRID].reverse()) {
    if (e <= 5) return { best: 5, sol: r5 };
    if (solve(map, { every: e, budget: 2e5 }).ok) return { best: e, sol: r5 };
  }
  return { best: 5, sol: r5 };
}

// Make sure ONE run can collect every item (all cheese + all 3 salmon). Cheese
// that can't be combined with the rest is removed; a salmon that can't be
// reached is a hard error (pick another seed / fix the pattern).
function makePerfectable(map, id) {
  for (let round = 0; round < 40; round++) {
    const r = solve(map, { every: 4, budget: 4e6, perfect: true });
    if (r.ok) {
      const check = runReplay(prepareMap(map), r.inputs);
      if (!check.finished || check.items !== map.items.length) throw new Error(`map ${id}: perfect replay mismatch`);
      console.log(`    map ${id}: perfect run exists (${map.items.length} items, score ${check.score})`);
      return check.score;
    }
    const it = map.items[r.blocker];
    if (!it) throw new Error(`map ${id}: perfect run impossible (budget?)`);
    if (it.kind === 'salmon') throw new Error(`map ${id}: salmon at x=${it.x} unreachable`);
    map.items.splice(r.blocker, 1);
  }
  throw new Error(`map ${id}: could not make perfectable`);
}

// --salmon-check: try every salmon spot alone at the slowest and fastest speed
if (process.argv.includes('--salmon-check')) {
  for (const name of Object.keys(S)) for (const speed of [4, 5.75]) {
    const b = new Builder(rng(7)); b.run(400); S[name](b, 0.5); b.run(300); const length = b.x; b.finish(0);
    const map = { id: 1, speed, length, ground: b.ground, solids: b.solids, spikes: b.spikes, items: b.items, zones: [] };
    const r = solve(map, { every: 4, perfect: true });
    console.log(name, speed, r.ok ? 'OK' : 'UNREACHABLE');
  }
  process.exit(0);
}

const only = process.argv.includes('--only') ? Number(process.argv[process.argv.indexOf('--only') + 1]) : null;
const fixed = process.argv.includes('--seeds') ? JSON.parse(process.argv[process.argv.indexOf('--seeds') + 1]) : null;
const out = [];
const seeds = [];
for (let i = 0; i < DEFS.length; i++) {
  if (only && only !== i + 1) continue;
  const [lo, hi] = BANDS[i];
  let pick = null;
  const start = fixed ? fixed[i] : DEFS[i].seed ?? 1000 + i * 77;
  for (let attempt = 0, seed = start; attempt < (fixed ? 1 : 16); attempt++, seed++) {
    const map = buildMap(i, seed);
    const c = coarsest(map);
    if (!c.best) { console.log(`map ${i + 1} seed ${seed}: too hard / unsolved`); continue; }
    const dist = c.best < lo ? lo - c.best : c.best > hi ? c.best - hi : 0;
    console.log(`map ${i + 1} seed ${seed}: coarsest ${c.best} (band ${lo}-${hi})`);
    if (pick && dist >= pick.dist) continue;
    try { map.perfect = makePerfectable(map, i + 1); } catch (e) { console.log('   ', e.message); continue; }
    pick = { map, seed, c, dist };
    if (dist === 0) break;
  }
  if (!pick) throw new Error(`map ${i + 1}: no solvable seed`);
  const { map, seed, c } = pick;
  const salmons = map.items.filter((it) => it.kind === 'salmon').length;
  if (salmons !== C.SALMON_PER_MAP) throw new Error(`map ${i + 1}: ${salmons} salmon`);
  const check = runReplay(prepareMap(map), c.sol.inputs);
  if (!check.finished) throw new Error('solver/replay mismatch');
  if (i === 0) map.demo = c.sol.inputs;
  map.difficulty = c.best;
  console.log(`==> map ${i + 1} ${map.name.cs}: seed ${seed}, coarsest ${c.best}, ${(check.ticks / 60).toFixed(1)}s, ${map.items.length} items`);
  out.push(map); seeds.push(seed);
}
if (!only) {
  writeFileSync(new URL('../shared/maps.json', import.meta.url), JSON.stringify({ version: 5, worlds: WORLDS, maps: out }));
  console.log('wrote shared/maps.json', JSON.stringify(seeds));
}
