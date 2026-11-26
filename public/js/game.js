// Game session: fixed-step simulation, input log, camera, effects, end scene.
import { C, ACT, prepareMap, createSim, step, scoreOf } from '../shared/sim.js';
import { render, W, MOUSE_SCREEN_X, TRAP_OFFSET, spawnFx, clearFx } from './render.js';
import * as audio from './audio.js';

const STEP = 1000 / C.TICK_RATE;
const G = C.GROUND_Y;

export class Game {
  constructor(canvas, hooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hooks = hooks;
    this.mode = 'idle'; // idle | demo | ready | play | dead | end | paused
    this.v = { fx: [], butt: { left: -1e6, right: -1e6, rightHeld: false }, camX: -200, lang: 'cs', hud: false };
    this.queue = [];
    this.qHold = false;      // is the right cheek held as far as the input log knows
    this.last = performance.now();
    this.acc = 0;
    this.perf = { d: [], bad: 0, good: 0 }; // frame-time watchdog, see watchFrame
    this.lang = 'cs';
    requestAnimationFrame((t) => this.frame(t));
  }

  setLang(l) { this.lang = l; this.v.lang = l; }
  t(cs, en) { return this.lang === 'cs' ? cs : en; }

  // --- lifecycle ---------------------------------------------------------
  load(map, { demo = false, ghost = null, best = 0, replay = null, replayName = '' } = {}) {
    this.map = map;
    this.dropHold();
    this.replay = replay;
    this.v.watchName = replay ? replayName : null;
    this.pm = prepareMap(map);
    this.ghostInputs = ghost;
    this.best = best;
    this.attempt = demo ? 1 : 0;
    this.bestProgress = 0;
    this.v.map = map;
    this.v.hud = !demo;
    this.v.best = best;
    this.v.banner = null;
    this.mode = demo ? 'demo' : 'idle'; // reset() hides a bonus salmon only outside demos
    this.reset();
    if (demo) { this.mode = 'demo'; this.demoInputs = map.demo || []; }
    else if (replay) { this.begin(); this.banner(this.t('Záznam: ', 'Replay: ') + replayName, null, 1500, 46, '#3d5a8c'); }
    else {
      this.mode = 'ready';
      const touch = this.hooks.isTouch && this.hooks.isTouch();
      const sub = touch ? this.t('ťukni vlevo nebo vpravo', 'tap left or right') : this.t('A / ← nebo D / →', 'A / ← or D / →');
      this.banner(this.t('Plácni a běž!', 'Slap to start!'), sub, 1e9, 56);
    }
  }

  reset() {
    const bonus = this.mode !== 'demo' && !this.replay && this.hooks.bonus ? this.hooks.bonus(this.pm) : -1;
    this.sim = createSim(this.pm, bonus);
    this.sim.events = [];
    this.goldAsked = false; this.v.goldIdx = -1; // is there a goldfish in this run? asked mid-run (see tick)
    this.inputs = [];
    this.queue.length = 0;
    this.qHold = false;
    this.lastFlap = -1e9;
    this.recent = [];
    this.acc = 0;
    this.ghost = this.ghostInputs && this.ghostInputs.length ? { sim: createSim(this.pm), k: 0 } : null;
    this.v.sim = this.sim;
    this.v.ghost = this.ghost ? this.ghost.sim : null;
    this.v.ghostOn = !!this.ghost;
    this.v.end = null;
    this.v.leap = null;
    this.v.shake = 0;
    this.v.mouse = { x: this.sim.x, by: this.sim.by, duck: false, visible: true, air: false };
    this.v.catSay = null;
    this.v.camX = this.sim.x - MOUSE_SCREEN_X;
    this.v.fx.length = 0;
    clearFx();
    this.v.attempt = this.attempt;
    this.v.bestProgress = this.bestProgress / this.map.length;
    this.v.score = 0;
    this.demoK = 0;
  }

  // a hold from before a restart or map change must not stick (replays skip release())
  dropHold() { this.qHold = false; this.v.butt.rightHeld = false; audio.growlStop(); }

  begin() {
    if (!this.replay && this.hooks.onBegin) this.hooks.onBegin();
    this.attempt++;
    this.reset();
    this.mode = 'play';
    this.v.banner = null;
    this.last = this.playAt = performance.now();
  }

  // Judges 2 s windows of real play (not menus, not the first seconds while the background tiles get drawn).
  // Too slow twice in a row -> fewer pixels; smooth for a while -> sharper again. A steady 30 Hz screen
  // (battery saving) is left alone: fewer pixels would not make it faster, only blurrier.
  watchFrame(dt) {
    const pf = this.perf;
    pf.d.push(dt);
    if (pf.d.length < 120) return;
    const d = pf.d.sort((a, b) => a - b), late = d.filter((x) => x > 22).length;
    pf.d = [];
    if (d[d.length - 1] > 99) return; // a hiccup (tab switch, GC): no verdict
    const slow = late > 30 && d[12] < 25;
    pf.bad = slow ? pf.bad + 1 : 0;
    pf.good = !slow && late < 6 ? pf.good + 1 : 0;
    if (pf.bad >= 2) { pf.bad = 0; this.hooks.onSlow && this.hooks.onSlow(); }
    if (pf.good >= 5) { pf.good = 0; this.hooks.onFast && this.hooks.onFast(); }
  }

  pause() {
    if (this.mode === 'play' || this.mode === 'ready') {
      this.prevMode = this.mode; this.mode = 'paused';
      this.release('right');
      return true;
    }
    return false;
  }
  resume() { if (this.mode === 'paused') { this.mode = this.prevMode || 'play'; this.last = performance.now(); this.acc = 0; } }
  stop() { this.mode = 'idle'; this.v.hud = false; this.replay = null; this.v.leap = null; this.release('right'); }
  restart() { if (this.map) { this.dropHold(); this.begin(); } }

  banner(textStr, sub, life = 900, size = 64, color) {
    this.v.banner = { text: textStr, sub, at: performance.now(), life, size, color };
  }

  // --- cat reactions (visual + sound) for a press / release -------------------
  react(side, down) {
    const now = performance.now(), b = this.v.butt;
    if (side === 'left') {
      if (!down) return;
      b.left = now;
      audio.slap(); audio.meow('up');
      this.v.catSay = { text: this.t('MŇAU!', 'MEOW!'), color: '#2a7de1', at: now };
    } else if (down) {
      if (b.rightHeld) return;
      b.right = now; b.rightHeld = true;
      audio.slap(); audio.growlStart();
      this.v.catSay = { text: 'MRRRR…', color: '#e2574c', at: now, hold: true };
    } else {
      if (!b.rightHeld) return;
      b.rightHeld = false; b.rightUp = now;
      audio.growlStop();
      if (this.v.catSay && this.v.catSay.hold) this.v.catSay = null;
    }
    if (this.v.mouse) this.v.mouse.scaredAt = now;
  }

  // --- input ---------------------------------------------------------------
  // side: 'left' (flap) or 'right' (hold = duck). Returns true when consumed.
  press(side) {
    if (this.replay && this.mode !== 'idle') return true;
    this.react(side, true);
    if (this.mode === 'ready') { this.begin(); return true; }
    if (this.mode === 'play') {
      if (side === 'left') { if (this.queue.length < 4) this.queue.push(ACT.UP); }
      else if (!this.qHold) { this.queue.push(ACT.DOWN); this.qHold = true; }
      return true;
    }
    return this.mode === 'dead' || this.mode === 'end';
  }

  release(side) {
    if (side !== 'right') return;
    if (this.replay && this.mode !== 'idle') return;
    this.react('right', false);
    if (this.qHold) { this.queue.push(ACT.RELEASE); this.qHold = false; }
  }

  // next queued action that keeps the log within the human limits of sim.validateInputs
  nextAct(tick) {
    if (!this.queue.length) return ACT.NONE;
    while (this.recent.length && this.recent[0] <= tick - C.TICK_RATE) this.recent.shift();
    if (this.recent.length >= C.MAX_EVENTS_PER_SEC) return ACT.NONE;
    const a = this.queue[0];
    if (a === ACT.UP && tick - this.lastFlap < C.MIN_FLAP_GAP) return ACT.NONE;
    this.queue.shift();
    if (a === ACT.UP) this.lastFlap = tick;
    this.recent.push(tick);
    return a;
  }

  // --- simulation ------------------------------------------------------------
  tick() {
    const s = this.sim;
    let act = ACT.NONE;
    if (this.mode === 'demo' || this.replay) {
      const d = this.mode === 'demo' ? this.demoInputs : this.replay;
      if (this.demoK < d.length && d[this.demoK][0] === s.tick) { act = d[this.demoK][1]; this.demoK++; }
      if (act && this.replay) this.react(act === ACT.UP ? 'left' : 'right', act !== ACT.RELEASE);
    } else {
      act = this.nextAct(s.tick);
      if (act) this.inputs.push([s.tick, act]);
    }
    if (this.mode === 'play' && !this.replay && !this.goldAsked && s.x > this.pm.length * 0.2 && this.hooks.goldfish) {
      this.goldAsked = true;
      const sim = s;
      this.hooks.goldfish().then((idx) => { // appears ahead of the mouse, unless this attempt is already over
        if (idx >= 0 && this.sim === sim && !sim.done) { this.v.goldIdx = idx; this.v.goldAt = performance.now(); if (this.mode === 'play') audio.sfx('gold'); }
      });
    }
    s.events.length = 0;
    step(this.pm, s, act);
    if (this.ghost && !this.ghost.sim.done) {
      const g = this.ghost, gi = this.ghostInputs;
      let ga = ACT.NONE;
      if (g.k < gi.length && gi[g.k][0] === g.sim.tick) { ga = gi[g.k][1]; g.k++; }
      step(this.pm, g.sim, ga);
    }
    for (const e of s.events) this.onEvent(e);
    if (s.x > this.bestProgress) this.bestProgress = s.x;
  }

  onEvent(e) {
    const now = performance.now();
    const quiet = this.mode === 'demo';
    if (e.t === 'item' && e.kind === 'salmon') {
      if (!quiet) audio.sfx('salmon');
      this.fx({ kind: 'text', x: e.x, y: e.y - 18, vy: -0.05, text: this.t('LOSOS! +1000', 'SALMON! +1000'), color: '#e2574c', life: 1200, size: 34 });
      for (let i = 0; i < 12; i++) this.fx({ kind: 'star', x: e.x, y: e.y, vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.9) * 0.4, life: 700, r: 6, seed: i, color: i % 2 ? '#ff8c69' : '#ffd23f' });
      this.v.catSay = { text: this.t('LOSOS!!', 'SALMON!!'), color: '#e2574c', at: now };
      if (!quiet) spawnFx('burst', e.x, e.y, { palette: ['#2a0a08', '#5c1a10', '#9a3420', '#d9503a', '#ff8c69', '#ffb39a', '#ffe0d4', '#ffffff'] });
    } else if (e.t === 'item' && e.idx === this.v.goldIdx) {
      if (!quiet) { audio.sfx('gold'); audio.sfx('salmon'); }
      this.fx({ kind: 'text', x: e.x, y: e.y - 16, vy: -0.04, text: this.t('ZLATÁ RYBKA! 🐟 +10', 'GOLDFISH! 🐟 +10'), color: '#e08a00', life: 1600, size: 34 });
      for (let i = 0; i < 16; i++) this.fx({ kind: 'star', x: e.x, y: e.y, vx: (Math.random() - 0.5) * 0.7, vy: (Math.random() - 0.9) * 0.45, life: 900, r: 7, seed: i, color: i % 2 ? '#ffd23f' : '#fff6b0' });
      this.v.catSay = { text: this.t('ZLATÁ!!', 'GOLD!!'), color: '#e08a00', at: now };
      if (!quiet) spawnFx('burst', e.x, e.y, { palette: ['#2a1405', '#5c3008', '#9a5a0e', '#d48e18', '#f5b92c', '#ffde5e', '#fff4bc', '#ffffff'] });
    } else if (e.t === 'item' && e.bonus) {
      if (!quiet) audio.sfx('salmon');
      this.fx({ kind: 'text', x: e.x, y: e.y - 14, vy: -0.05, text: this.t('BONUS 🐟 +1', 'BONUS 🐟 +1'), color: '#2a7de1', life: 1100, size: 28 });
      for (let i = 0; i < 8; i++) this.fx({ kind: 'star', x: e.x, y: e.y, vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.9) * 0.35, life: 600, r: 5, seed: i, color: '#9fd3f7' });
    } else if (e.t === 'item') {
      const gold = e.kind === 'gold';
      if (!quiet) audio.sfx(gold ? 'gold' : 'cheese');
      this.fx({ kind: 'text', x: e.x, y: e.y - 10, vy: -0.05, text: gold ? '+500' : '+100', color: gold ? '#e08a00' : '#c99a00', life: 800, size: gold ? 32 : 24 });
      for (let i = 0; i < (gold ? 8 : 4); i++) this.fx({ kind: 'star', x: e.x, y: e.y, vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.8) * 0.3, life: 500, r: 5, seed: i });
    } else if (e.t === 'foil') {
      if (!quiet) audio.sfx('foil');
    } else if (e.t === 'close') {
      if (!quiet) audio.sfx('close');
      this.fx({ kind: 'text', x: this.sim.x + 15, y: this.sim.by - 50, vy: -0.04, text: this.t('těsně! +25', 'close! +25'), color: '#7b4dd6', life: 700, size: 22 });
    } else if (e.t === 'die') {
      if (this.mode === 'demo') { this.reset(); return; }
      audio.growlStop();
      if (this.replay) { this.mode = 'idle'; this.hooks.onFinish(this.map, null); return; }
      this.mode = 'dead'; this.deadAt = now; this.deathShown = false;
      this.v.butt.rightHeld = false;
      audio.sfx('die');
      this.v.shake = 12;
      this.v.mouse.dead = true;
      spawnFx('crit', this.sim.x + 15, this.sim.by - 12);
      spawnFx('poof', this.sim.x + 15, this.sim.by);
      for (let i = 0; i < 10; i++) this.fx({ kind: 'star', x: this.sim.x + 15, y: this.sim.by - 12, vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.7) * 0.5, life: 650, r: 6, seed: i });
      const msgs = this.t(['Au!', 'Pííp!', 'Jejda!', 'Kňuk!'], ['Ouch!', 'Squeak!', 'Oops!', 'Eek!']);
      this.fx({ kind: 'text', x: this.sim.x + 15, y: this.sim.by - 60, vy: -0.03, text: msgs[this.attempt % msgs.length], color: '#e2574c', life: 800, size: 34 });
    } else if (e.t === 'finish') {
      if (this.mode === 'demo') { this.reset(); return; }
      audio.growlStop();
      this.v.butt.rightHeld = false;
      this.mode = 'end';
      this.hooks.onEnd && this.hooks.onEnd();
      this.endAt = now;
      const s = this.sim;
      this.result = { replay: !!this.replay, score: scoreOf(s), cheese: s.cheese, gold: s.gold, salmon: s.salmon, close: s.close,
        items: s.cheese + s.gold + s.salmon, itemsTotal: this.map.items.length, inputs: this.inputs.slice(), attempts: this.attempt, ticks: this.sim.tick };
      this.v.end = { trap: 0 };
      this.endState = { mouseX: this.sim.x, snapped: false, jumped: false, chomps: 0, burped: false, done: false };
      this.banner(this.t('CÍL!', 'FINISH!'), null, 1100, 72, '#2a9d4b');
      spawnFx('confetti', W / 2, G, {}, true);
    }
  }

  celebrate() {
    const colors = ['#ffd23f', '#e2574c', '#2a7de1', '#7bc142', '#7b4dd6', '#f39c34'];
    for (let i = 0; i < 46; i++) {
      this.fx({ kind: 'star', screen: true, x: Math.random() * W, y: -10 - Math.random() * 120, vx: (Math.random() - 0.5) * 0.15, vy: 0.05 + Math.random() * 0.15, life: 2600, r: 5 + Math.random() * 6, seed: i, color: colors[i % colors.length] });
    }
  }

  fx(p) { p.age = 0; p.vx = p.vx || 0; p.vy = p.vy || 0; this.v.fx.push(p); }

  // --- end scene: the mouse runs into the trap, then the cat we've been
  // slapping jumps out of the bottom panel and eats it ----------------------
  updateEnd(now, dt) {
    const es = this.endState, v = this.v;
    const trapX = this.map.length + TRAP_OFFSET;
    const stopX = trapX - 22;
    const speed = this.sim.speed * C.TICK_RATE / 1000;
    if (es.mouseX < stopX) {
      es.mouseX = Math.min(stopX, es.mouseX + speed * dt);
      v.mouse.x = es.mouseX; v.mouse.by = Math.min(G, v.mouse.by + 0.4 * dt); v.mouse.duck = false; v.mouse.air = v.mouse.by < G;
    } else if (!es.snapped) {
      es.snapped = true; es.snapAt = now; audio.sfx('snap'); v.shake = 8; v.mouse.dead = true;
      spawnFx('thud', stopX + 20, G - 4);
      for (let i = 0; i < 6; i++) this.fx({ kind: 'star', x: stopX + 20, y: G - 30, vx: (Math.random() - 0.5) * 0.5, vy: -Math.random() * 0.4, life: 600, r: 6, seed: i });
    }
    if (es.snapped) {
      v.end.trap = Math.min(1, (now - es.snapAt) / 110);
      const j = now - es.snapAt - 450;
      const FLIGHT = 650;
      if (j > 0) {
        if (!es.jumped) {
          es.jumped = true; audio.meow('up');
          v.catSay = { text: this.t('MŇAM!', 'YUM!'), color: '#e08a00', at: now };
        }
        const p = Math.min(1, j / FLIGHT);
        v.leap = { p, trapX, eat: 0, fat: 0 };
        if (p >= 1) {
          const c = j - FLIGHT;
          const n = Math.floor(c / 260);
          v.leap.eat = n < 3 ? (c % 260) / 260 : 0;
          if (n < 3 && es.chomps <= n) {
            es.chomps = n + 1; audio.sfx('nom');
            v.mouse.visible = false;
            this.fx({ kind: 'text', x: trapX + 40 + n * 34, y: G - 120 - n * 20, vy: -0.03, text: 'NOM', color: '#e2574c', life: 700, size: 30 + n * 6 });
          }
          if (n >= 3) v.leap.fat = Math.min(1, (c - 780) / 300);
          if (c > 1150 && !es.burped) { es.burped = true; audio.sfx('burp'); this.fx({ kind: 'text', x: trapX + 30, y: G - 150, vy: -0.03, text: 'BURP!', color: '#7b4dd6', life: 1200, size: 40 }); }
          if (c > 1900 && !es.done) { es.done = true; audio.sfx('win'); this.hooks.onFinish(this.map, this.result); }
        }
      }
    }
    const camTarget = Math.min(trapX - 560, this.sim.x - MOUSE_SCREEN_X + 300);
    v.camX += (camTarget - v.camX) * Math.min(1, dt / 300);
  }

  // --- frame ----------------------------------------------------------------
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    let dt = now - this.last; this.last = now;
    if (dt > 100) dt = 100;
    if (dt < 0) dt = 0;
    const v = this.v;
    if (this.map && (this.mode === 'play' || this.mode === 'demo')) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= STEP && n < 8 && (this.mode === 'play' || this.mode === 'demo')) { this.tick(); this.acc -= STEP; n++; }
      if (n >= 8) this.acc = 0;
      if (this.mode === 'play' && now - this.playAt > 3000) this.watchFrame(dt);
    }
    if (this.map) {
      const s = this.sim;
      if (this.mode === 'end') this.updateEnd(now, dt);
      else {
        const m = v.mouse;
        m.x = s.x; m.by = s.by; m.duck = s.duck > 0; m.air = !s.onGround;
        m.scared = m.scaredAt && now - m.scaredAt < 220;
        if (this.mode !== 'dead') m.dead = false;
        v.camX = s.x - MOUSE_SCREEN_X;
      }
      v.score = scoreOf(s);
      v.attempt = this.attempt;
      v.bestProgress = this.bestProgress / this.map.length;
      if (this.mode === 'dead' && !this.deathShown && now - this.deadAt > 650) {
        this.deathShown = true;
        this.hooks.onDeath && this.hooks.onDeath({ progress: s.x / this.map.length, best: this.bestProgress / this.map.length, cause: s.cause, score: scoreOf(s), attempt: this.attempt });
      }
    } else {
      v.camX += dt * 0.05;
    }
    if (v.shake > 0) v.shake = Math.max(0, v.shake - dt * 0.03);
    for (let i = v.fx.length - 1; i >= 0; i--) {
      const p = v.fx[i];
      p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === 'star') p.vy += (p.screen ? 0.0001 : 0.0008) * dt;
      if (p.age > p.life) v.fx.splice(i, 1);
    }
    v.touch = this.hooks.isTouch && this.hooks.isTouch();
    this.ctx.setTransform(this.canvas.width / W, 0, 0, this.canvas.height / 540, 0, 0);
    render(this.ctx, v, now);
  }
}
