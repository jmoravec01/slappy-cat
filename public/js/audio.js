// Procedural sound effects (Web Audio). Two cat "voices":
//   up   = bright, rising "MŇAU!"  (left cheek)
//   down = low, rolling "MRRRAU"  (right cheek)
// Recordings listed in sounds/sounds.json (CC0, see CREDITS.md) replace the synth voices once loaded;
// the synth stays as the fallback while they load or when a browser can't decode them.

let ctx = null, master = null, noiseBuf = null;
const samples = {};
const state = { muted: false, volume: 0.8 };

// Mobile browsers only start audio inside a real tap (touchend/pointerup/click, not touchstart), so every
// gesture retries until the context runs. iPhone: 'playback' keeps sound on with the silent switch on (iOS 17+).
function unlock() {
  ctx.resume().catch(() => {});
  const b = ctx.createBufferSource(); b.buffer = ctx.createBuffer(1, 1, 22050); b.connect(ctx.destination); b.start(0);
}

export function initAudio() {
  if (ctx) { if (ctx.state !== 'running') unlock(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* older Safari */ }
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = state.muted ? 0 : state.volume;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp); comp.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  unlock();
  if (mus.want) music(...mus.want);
  // sounds/sounds.json: {"meow-up": "file.mp3" | null, "meow-down": ...}
  fetch('sounds/sounds.json').then((r) => (r.ok ? r.json() : {})).then((list) => {
    for (const [name, file] of Object.entries(list || {})) {
      if (!file) continue;
      fetch('sounds/' + file).then((r) => (r.ok ? r.arrayBuffer() : null)).then((ab) => {
        if (ab) ctx.decodeAudioData(ab, (buf) => { samples[name] = { buf, at: soundStart(buf) }; }, () => {});
      }).catch(() => {});
    }
  }).catch(() => {});
}

// ---------- tiny procedural music: bass + pluck melody + hats ----------
const mus = { on: true, timer: null, step: 0, next: 0, bpm: 120, seed: 1, gain: null, key: 0, want: null, track: null };
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16]; // major pentatonic, two octaves-ish
const PROG = [0, 9, 5, 7]; // I - vi - IV - V (semitones from key)
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
function mrand(n) { let t = (n + mus.seed * 7919) | 0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }

function note(t, f, dur, type, vol) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(mus.gain); o.start(t); o.stop(t + dur + 0.02);
}

function schedule() {
  const spb = 60 / mus.bpm / 4; // 16th notes
  while (mus.next < ctx.currentTime + 0.25) {
    const s = mus.step % 64, bar = Math.floor(s / 16), b = s % 16, t = mus.next;
    const root = 48 + mus.key + PROG[bar];
    if (b % 4 === 0) {
      const bass = midi(root - 12 + (b === 8 ? 7 : 0));
      note(t, bass, spb * 3, 'triangle', 0.5);
      note(t, bass * 2, spb * 2, 'square', 0.12); // phone speakers can't play the low bass: this octave carries it
    }
    if (b % 2 === 1) { // hat
      const n = ctx.createBufferSource(); n.buffer = noiseBuf;
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
      n.connect(f); f.connect(g); g.connect(mus.gain); n.start(t, Math.random() * 0.5); n.stop(t + 0.05);
    }
    const r = mrand(s);
    if (r < (b % 4 === 0 ? 0.75 : 0.3)) {
      const deg = SCALE[Math.floor(mrand(s + 100) * SCALE.length)];
      note(t, midi(root + 12 + deg), spb * 1.6, 'square', 0.2);
    }
    mus.step++; mus.next += spb;
  }
}

// mapId 0 = menu tune, null = silence. Remembered, so it starts as soon as the first tap unlocks audio.
export function music(mapId, speed = 4.5) {
  mus.want = mapId == null ? null : [mapId, speed];
  const track = mus.want && mus.on && ctx ? mapId + ':' + speed : null;
  if (track === mus.track) return; // same tune keeps playing across menu screens
  mus.track = track;
  if (mus.timer) { clearInterval(mus.timer); mus.timer = null; }
  if (mus.gain) { const g = mus.gain; g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.1); setTimeout(() => g.disconnect(), 600); mus.gain = null; }
  if (!track) return;
  mus.seed = mapId || 99; mus.key = [0, 5, 7, 2, 9, 4, 0, 5, 7, 2, 9, 3][(mapId + 11) % 12];
  mus.bpm = 96 + speed * 8;
  mus.gain = ctx.createGain(); mus.gain.gain.value = 0.85; mus.gain.connect(master);
  mus.step = 0; mus.next = ctx.currentTime + 0.1;
  mus.timer = setInterval(schedule, 60);
  schedule();
}
export function setMusic(on) { mus.on = on; if (mus.want) music(...mus.want); }
export function musicOn() { return mus.on; }

export function setMuted(m) { state.muted = m; if (master) master.gain.value = m ? 0 : state.volume; }
export function isMuted() { return state.muted; }

// Safari keeps the MP3 encoder delay (~25 ms of silence) at the start: skip to the first audible sample
function soundStart(buf) {
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > 0.01) return i / buf.sampleRate;
  return 0;
}

function playSample(name, rate = 1) {
  const smp = samples[name];
  if (!smp) return false;
  const s = ctx.createBufferSource(); s.buffer = smp.buf; s.playbackRate.value = rate;
  s.connect(master); s.start(0, smp.at);
  return true;
}

const vary = (x, p = 0.06) => x * (1 + (Math.random() - 0.5) * 2 * p);

function env(g, t, peak, a, d, end) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.setValueAtTime(peak, t + d);
  g.gain.exponentialRampToValueAtTime(0.0001, t + end);
}

// formant-filtered sawtooth = surprisingly cat-like
function voice({ f0, f1, f2, dur, formants, rr = 0, gain = 0.5, open = [500, 3200, 900] }) {
  const t = ctx.currentTime + 0.005;
  const osc = ctx.createOscillator(); osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.linearRampToValueAtTime(f1, t + dur * 0.35);
  osc.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const vib = ctx.createOscillator(); vib.frequency.value = 7;
  const vibG = ctx.createGain(); vibG.gain.value = f1 * 0.015; vib.connect(vibG); vibG.connect(osc.frequency);
  // "m" at the start, mouth opens then closes ("mi-a-u")
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1;
  lp.frequency.setValueAtTime(open[0], t);
  lp.frequency.exponentialRampToValueAtTime(open[1], t + dur * 0.3);
  lp.frequency.exponentialRampToValueAtTime(open[2], t + dur);
  osc.connect(lp);
  const out = ctx.createGain(); env(out, t, gain, 0.03, dur * 0.6, dur);
  for (const [fa, fb, q, g] of formants) {
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = q;
    bp.frequency.setValueAtTime(fa, t); bp.frequency.exponentialRampToValueAtTime(fb, t + dur * 0.7);
    const bg = ctx.createGain(); bg.gain.value = g;
    lp.connect(bp); bp.connect(bg); bg.connect(out);
  }
  let am = null;
  if (rr) { // rolling "rrr": amplitude modulation
    am = ctx.createGain(); am.gain.value = 0.55;
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = rr;
    const lg = ctx.createGain(); lg.gain.value = 0.45; lfo.connect(lg); lg.connect(am.gain);
    out.connect(am); am.connect(master);
    lfo.start(t); lfo.stop(t + dur + 0.05);
  } else out.connect(master);
  osc.start(t); vib.start(t); osc.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
}

export function meow(dir) {
  if (!ctx || state.muted) return;
  if (dir === 'up') {
    if (playSample('meow-up', vary(1, 0.05))) return;
    const b = vary(620);
    voice({ f0: b * 0.9, f1: b * 1.35, f2: b * 0.8, dur: vary(0.34, 0.08), gain: 0.55,
      formants: [[900, 1300, 4, 1.4], [2300, 1700, 6, 0.9], [3600, 3000, 8, 0.4]], open: [600, 4000, 1200] });
  } else {
    if (playSample('meow-down', vary(1, 0.05))) return;
    const b = vary(210);
    voice({ f0: b * 1.1, f1: b * 1.25, f2: b * 0.75, dur: vary(0.48, 0.08), gain: 0.7, rr: 26,
      formants: [[500, 750, 3, 1.6], [1100, 900, 5, 0.9], [2400, 2000, 7, 0.3]], open: [300, 2200, 500] });
  }
}

// sustained low "MRRRRR" while the right cheek is held
let growl = null;
export function growlStart() {
  growlStop();
  if (!ctx || state.muted) return;
  if (samples['meow-down']) { playSample('meow-down', vary(1, 0.05)); return; }
  const t = ctx.currentTime + 0.005, b = vary(210);
  const osc = ctx.createOscillator(); osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(b * 1.1, t);
  osc.frequency.linearRampToValueAtTime(b * 1.25, t + 0.15);
  osc.frequency.linearRampToValueAtTime(b * 0.95, t + 2.5);
  const vib = ctx.createOscillator(); vib.frequency.value = 6;
  const vibG = ctx.createGain(); vibG.gain.value = b * 0.02; vib.connect(vibG); vibG.connect(osc.frequency);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1;
  lp.frequency.setValueAtTime(300, t); lp.frequency.exponentialRampToValueAtTime(2000, t + 0.15); lp.frequency.exponentialRampToValueAtTime(900, t + 0.7);
  osc.connect(lp);
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(0.6, t + 0.04);
  for (const [fa, fb, q, g] of [[500, 700, 3, 1.6], [1100, 950, 5, 0.9], [2400, 2100, 7, 0.3]]) {
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = q;
    bp.frequency.setValueAtTime(fa, t); bp.frequency.exponentialRampToValueAtTime(fb, t + 0.5);
    const bg = ctx.createGain(); bg.gain.value = g; lp.connect(bp); bp.connect(bg); bg.connect(out);
  }
  const am = ctx.createGain(); am.gain.value = 0.55;
  const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 26;
  const lg = ctx.createGain(); lg.gain.value = 0.45; lfo.connect(lg); lg.connect(am.gain);
  out.connect(am); am.connect(master);
  osc.start(t); vib.start(t); lfo.start(t);
  const g = { nodes: [osc, vib, lfo], out };
  g.timer = setTimeout(() => { if (growl === g) growlStop(); }, 6000);
  growl = g;
}
export function growlStop() {
  if (!growl || !ctx) { growl = null; return; }
  const g = growl; growl = null;
  clearTimeout(g.timer);
  const t = ctx.currentTime;
  g.out.gain.cancelScheduledValues(t);
  g.out.gain.setTargetAtTime(0.0001, t, 0.04);
  for (const n of g.nodes) { try { n.stop(t + 0.25); } catch { /* already stopped */ } }
}

function noise(t, dur, type, freq, q, gain) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); env(g, t, gain, 0.002, 0.005, dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}

function tone(t, type, f0, f1, dur, gain) {
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain(); env(g, t, gain, 0.005, dur * 0.3, dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}

export function slap() {
  if (!ctx || state.muted) return;
  if (playSample('slap', vary(1, 0.08))) return;
  const t = ctx.currentTime;
  noise(t, 0.09, 'bandpass', vary(1800, 0.15), 0.8, 0.9);
  noise(t, 0.05, 'highpass', 3500, 0.7, 0.35);
  tone(t, 'sine', 160, 60, 0.08, 0.6);
}

export function sfx(name) {
  if (!ctx || state.muted) return;
  const t = ctx.currentTime;
  switch (name) {
    case 'cheese': tone(t, 'triangle', 880, 1320, 0.09, 0.25); tone(t + 0.07, 'triangle', 1320, 1760, 0.12, 0.2); break;
    case 'gold': [988, 1319, 1568, 1976].forEach((f, i) => tone(t + i * 0.06, 'triangle', f, f * 1.01, 0.14, 0.22)); break;
    case 'close': tone(t, 'sine', 1400, 2400, 0.08, 0.12); break;
    case 'die': tone(t, 'square', 1800, 2600, 0.07, 0.12); tone(t + 0.07, 'square', 2400, 900, 0.18, 0.1); noise(t + 0.02, 0.2, 'lowpass', 400, 0.7, 0.6); break;
    case 'snap': noise(t, 0.12, 'highpass', 2000, 0.8, 0.9); tone(t, 'square', 300, 80, 0.1, 0.3); break;
    case 'nom': for (let i = 0; i < 3; i++) { noise(t + i * 0.2, 0.08, 'lowpass', 700, 1, 0.7); tone(t + i * 0.2, 'sine', 180, 110, 0.08, 0.4); } break;
    case 'burp': {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(95, t); o.frequency.linearRampToValueAtTime(70, t + 0.45);
      const am = ctx.createGain(); am.gain.value = 0.5; const lfo = ctx.createOscillator(); lfo.frequency.value = 38; const lg = ctx.createGain(); lg.gain.value = 0.5;
      lfo.connect(lg); lg.connect(am.gain);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
      const g = ctx.createGain(); env(g, t, 0.7, 0.03, 0.3, 0.5);
      o.connect(f); f.connect(am); am.connect(g); g.connect(master); o.start(t); lfo.start(t); o.stop(t + 0.55); lfo.stop(t + 0.55);
      break;
    }
    case 'salmon': [784, 988, 1175, 1568, 1976].forEach((f, i) => tone(t + i * 0.07, 'triangle', f, f * 1.02, 0.18, 0.24)); tone(t, 'sine', 220, 440, 0.3, 0.2); break;
    case 'win': [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.11, 'triangle', f, f, 0.22, 0.25)); break;
    case 'click': tone(t, 'triangle', 600, 500, 0.04, 0.15); break;
    case 'foil': for (let i = 0; i < 4; i++) noise(t + i * 0.035, 0.03, 'highpass', 5000 + i * 700, 0.8, 0.35); break; // crinkle
    case 'go': tone(t, 'triangle', 440, 880, 0.15, 0.2); break;
  }
}
