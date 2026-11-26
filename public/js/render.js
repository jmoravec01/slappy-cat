// Scene rendering: themes, world, mouse, cat, trap, HUD with the slappable butt.
// Everything is drawn as pixel art into a 480 x 270 frame (pixel.js) in game units, then scaled up.
import { C } from '../shared/sim.js';
import {
  INK, PW, PH, K, hash, line, poly, rect, ellipse, hatch, curve, text, star, textWidth, textScale,
  box, disc, oval, stripes, save, restore, translate, rotate, scale, alpha, clipEllipse, target, main, present, frame,
} from './pixel.js';
import { createFx, composite, createFrame } from '../vendor/pixelfx/core/fx.js';
import * as POW from '../vendor/pixelfx/fx/explosions/cartoon-pow.js';
import * as BURST from '../vendor/pixelfx/fx/pickups/collect-burst.js';
import * as POOF from '../vendor/pixelfx/fx/spawn/poof.js';
import * as CRIT from '../vendor/pixelfx/fx/impacts/crit-hit.js';
import * as CONFETTI from '../vendor/pixelfx/fx/ui/confetti.js';
import * as THUD from '../vendor/pixelfx/fx/impacts/blunt-hit.js';

export const W = 960, H = 540, VIEW_H = 360;
const G = C.GROUND_Y;
export const MOUSE_SCREEN_X = 330;
export const TRAP_OFFSET = 170;
// colours bought in the market: { hex, dark } or null for the default ginger cat / grey mouse
export const SKIN = { cat: null, mouse: null };

export const THEMES = {
  kitchen:  { bg: '#fdf3e1', far: '#f3d3a6', ground: '#c98f5a', top: '#8e5b33', box: '#e8b04a', beam: '#b07a48', pipe: '#7cc36b', spike: '#cfd5dd', decor: 'tiles' },
  living:   { bg: '#f4edff', far: '#d6c4f3', ground: '#9c6b4e', top: '#6f4630', box: '#f08a5d', beam: '#8d5a3b', pipe: '#6cc3a0', spike: '#c3c9d1', decor: 'frames' },
  garden:   { bg: '#e3f5ff', far: '#a6dc8f', ground: '#8a5d36', top: '#5fb350', box: '#d9a05b', beam: '#8a5a2b', pipe: '#64b85a', spike: '#a3a9b0', decor: 'hills' },
  cellar:   { bg: '#ebe4d6', far: '#c2b59c', ground: '#6e6253', top: '#4a4137', box: '#c4a26b', beam: '#6b4a2e', pipe: '#8aa07a', spike: '#959ca5', decor: 'bricks' },
  roofs:    { bg: '#33427a', far: '#4d5f9c', ground: '#b4483d', top: '#7c2b24', box: '#c9614f', beam: '#5a3b2e', pipe: '#c0533f', spike: '#dde1e7', decor: 'night', night: true },
  bathroom: { bg: '#e4f6f8', far: '#bde5ea', ground: '#8fcad3', top: '#4f9aa6', box: '#f2c14e', beam: '#7fb7c9', pipe: '#e7eef2', spike: '#c8d0d8', decor: 'bubbles' },
  attic:    { bg: '#f2e5d0', far: '#d8bf98', ground: '#a87b4f', top: '#6e4c2c', box: '#c79a5b', beam: '#7a5534', pipe: '#9c7a5a', spike: '#a9adb3', decor: 'rafters' },
  alley:    { bg: '#ffe6cf', far: '#eaa47c', ground: '#7d7d86', top: '#55555d', box: '#6aa0c8', beam: '#5a5a66', pipe: '#8a9a5b', spike: '#b9bec5', decor: 'city' },
  sewer:    { bg: '#dbe6d2', far: '#9db58e', ground: '#5f6f55', top: '#3e4a37', box: '#a3a36b', beam: '#4f5a49', pipe: '#7a8f6a', spike: '#a4aaa0', decor: 'bricks' },
  bakery:   { bg: '#fff3dd', far: '#f1cd97', ground: '#c58a4a', top: '#8a5a2b', box: '#f5c97a', beam: '#a0663a', pipe: '#d97b4d', spike: '#d6d9de', decor: 'tiles' },
  factory:  { bg: '#fffbe0', far: '#eadfb4', ground: '#d4a72c', top: '#9a7414', box: '#b9c3cf', beam: '#9a7a2a', pipe: '#e2a33a', spike: '#c9ced6', decor: 'holes' },
  throne:   { bg: '#f8e3ee', far: '#e7a9c8', ground: '#8e3b6b', top: '#5e2045', box: '#d65db1', beam: '#6d2c55', pipe: '#b23a85', spike: '#d9dde3', decor: 'crowns' },
  barn:     { bg: '#fbefd9', far: '#e2b57f', ground: '#8b5a2b', top: '#e3c04f', box: '#e8c55a', beam: '#7a4b26', pipe: '#a0522d', spike: '#c9ced6', decor: 'barn' },
  stairwell:{ bg: '#f3f5ea', far: '#a9cba3', ground: '#9a9a8f', top: '#6b6b63', box: '#c8a27a', beam: '#7d8a7a', pipe: '#8fae8a', spike: '#c3c9d1', decor: 'doors' },
  laundry:  { bg: '#eef1f6', far: '#c9d3e6', ground: '#8c8f99', top: '#5f636e', box: '#9ec5e8', beam: '#7a8598', pipe: '#9aa7bd', spike: '#c3c9d1', decor: 'laundry' },
  market:   { bg: '#fff4e0', far: '#f6b48a', ground: '#a0703f', top: '#6e4a26', box: '#d9a05b', beam: '#8a5a2b', pipe: '#6cc3a0', spike: '#c9ced6', decor: 'market' },
  metro:    { bg: '#e8ecef', far: '#f4dc8a', ground: '#55585e', top: '#2f3237', box: '#c9cfd8', beam: '#3f4a5a', pipe: '#7d8fa3', spike: '#dde1e7', decor: 'metro' },
  marble:   { bg: '#fbf8f3', far: '#e8e1d6', ground: '#cfc5b6', top: '#a8977d', box: '#f0e2c4', beam: '#c9a85c', pipe: '#d8c9a8', spike: '#aeb6c0', decor: 'columns' },
  library:  { bg: '#f6ecdc', far: '#c49a72', ground: '#7a4a2a', top: '#4e2e18', box: '#b5651d', beam: '#5a3820', pipe: '#8a6a4a', spike: '#c9ced6', decor: 'books' },
  pool:     { bg: '#e6f7ff', far: '#bfe9f7', ground: '#e9eef2', top: '#4fb3d9', box: '#ffb84d', beam: '#7fc8e8', pipe: '#f4f8fb', spike: '#c8d0d8', decor: 'pool', water: '#5ec4ea' },
};
THEMES.sewer.water = '#86a86f';
const PASTEL = ['#f7a1b5', '#9fd3f7', '#ffe08a', '#b6e3a1', '#d6c4f3', '#ffc59e'];

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}
const shade = (c, t = 0.22) => mix(c, '#1d1a2b', t); // darker step of a colour
const light = (c, t = 0.35) => mix(c, '#ffffff', t); // lighter step

// ---------------- pixelfx effects (one-shots in the same frame) ----------------
const FX = { pow: POW, burst: BURST, poof: POOF, crit: CRIT, confetti: CONFETTI, thud: THUD };
const live = [];
// x, y in game units; screen = true for effects that don't scroll with the world
export function spawnFx(kind, x, y, opts = {}, screen = false) {
  if (live.length > 12) live.shift();
  live.push({ fx: createFx(FX[kind], { ...opts, x: 0, y: 0 }), x, y, screen });
}
export function clearFx() { live.length = 0; }

// ---------------- background ----------------
function paper(th, camX) {
  box(0, 0, W, VIEW_H, th.bg);
  // wallpaper: a fine pixel line every 24 units and a faint dot grid that scrolls slowly
  const ln = th.night ? light(th.bg, 0.08) : shade(th.bg, 0.05), dot = th.night ? light(th.bg, 0.14) : shade(th.bg, 0.09);
  for (let y = 24; y < VIEW_H; y += 24) box(0, y, W, 2, ln);
  const off = (camX * 0.3) % 48;
  for (let x = -off; x < W; x += 48) for (let y = 12; y < VIEW_H; y += 48) box(x, y, 2, 2, dot);
}

const SP = 260; // width of one decor slot
function decor(th, camX, t) {
  const par = camX * 0.3;
  const i0 = Math.floor(par / SP) - 1;
  for (let i = i0; i < i0 + W / SP + 3; i++) decorSlot(th, i, i * SP - par, t);
}

const DK = 'rgba(29,26,43,0.35)'; // decor outline: soft so the decor stays behind the action
function decorSlot(th, i, x, t) {
  const sp = SP, r = hash(i * 17 + 3), r2 = hash(i * 31 + 7);
  switch (th.decor) {
    case 'tiles': {
      const y = 70 + r * 60;
      rect(0, x + 20, y, 70, 70, 0, th.far, DK);
      box(x + 54, y, 2, 70, shade(th.far, 0.15)); box(x + 20, y + 34, 70, 2, shade(th.far, 0.15));
      box(x + 24, y + 4, 26, 4, light(th.far, 0.4));
      break;
    }
    case 'frames':
      rect(0, x + 30, 60 + r * 50, 80 + r2 * 40, 60, 0, th.far, DK);
      curve(0, [[x + 40, 110 + r * 50], [x + 70, 80 + r * 50], [x + 100, 105 + r * 50]], i, shade(th.far, 0.3), 3);
      break;
    case 'hills':
      ellipse(0, x + 130, G + 10, 190, 90 + r * 50, i, th.far, DK);
      ellipse(0, x + 60 + r2 * 100, 60 + r * 40, 40, 16, i + 5, '#ffffff', 'rgba(29,26,43,0.2)');
      break;
    case 'bricks':
      for (let k = 0; k < 3; k++) rect(0, x + 20 + k * 70 + (k % 2) * 20, 60 + r * 120 + k * 22, 60, 22, 0, th.far, DK);
      break;
    case 'night': {
      for (let k = 0; k < 3; k++) {
        const sx = x + hash(i * 9 + k) * sp, sy = 20 + hash(i * 13 + k) * 140;
        star(0, sx, sy, 3 + hash(i + k) * 3 + ((t / 300 + k + i) % 3 < 0.4 ? 2 : 0), 0, '#fff6c2');
      }
      rect(0, x + 20, G - 90 - r * 90, 120, 200, 0, th.far, 'rgba(0,0,0,0.3)');
      for (let k = 0; k < 4; k++) if (hash(i * 3 + k) > 0.4) box(x + 35 + (k % 2) * 55, G - 70 - r * 90 + Math.floor(k / 2) * 40, 24, 22, '#ffe08a');
      break;
    }
    case 'bubbles': {
      const by = 60 + ((r2 * 200 - t * 0.02 + i * 40) % 250 + 250) % 250, br = 10 + r * 14;
      ellipse(0, x + r * sp, by, br, br, 0, 'rgba(255,255,255,0.6)', 'rgba(70,140,160,0.6)');
      box(x + r * sp - br * 0.4, by - br * 0.5, 4, 4, '#ffffff');
      break;
    }
    case 'rafters':
      line(0, x, 0, x + 120, 120, 0, 0, th.far, 12);
      line(0, x + 240, 0, x + 120, 120, 0, 0, th.far, 12);
      break;
    case 'city':
      rect(0, x + 10, G - 120 - r * 120, 100 + r2 * 60, 260, 0, th.far, DK);
      for (let k = 0; k < 6; k++) box(x + 25 + (k % 3) * 28, G - 100 - r * 120 + Math.floor(k / 3) * 36, 16, 20, hash(i * 6 + k) > 0.5 ? '#fff1b8' : light(th.far, 0.5));
      break;
    case 'holes': { // pipes and gauges of the cheese factory, kept pale so they don't look like pickups
      const gx = x + r * 120, gy = 50 + r2 * 120;
      box(x, gy + 36, sp, 8, th.far);
      ellipse(0, gx + 40, gy + 40, 22, 22, 0, '#fffdf2', 'rgba(154,116,20,0.6)');
      line(0, gx + 40, gy + 40, gx + 40 + 12 * Math.cos(t / 700 + i), gy + 40 - 12 * Math.abs(Math.sin(t / 700 + i)), 0, 0, '#c0392b', 2);
      break;
    }
    case 'barn': // plank wall and a little window
      for (let k = 0; k < 4; k++) box(x + k * 65, 0, 2, G, 'rgba(120,70,30,0.25)');
      if (r > 0.4) { rect(0, x + 90, 50 + r2 * 40, 70, 56, 0, '#d4ecff', DK); box(x + 124, 50 + r2 * 40, 2, 56, 'rgba(29,26,43,0.4)'); }
      break;
    case 'doors': // tower-block corridor: oil-painted lower wall, flat doors
      box(x, 150, sp, G - 150, mix(th.bg, th.far, 0.45));
      rect(0, x + 70, G - 150, 74, 150, 0, '#d9c3a0', DK);
      disc(x + 132, G - 75, 3, INK);
      text(0, String(1 + ((i % 40) + 40) % 40), x + 107, G - 128, 16, 'rgba(29,26,43,0.6)');
      break;
    case 'laundry': // washing line with clothes
      curve(0, [[x, 60], [x + 130, 82], [x + sp, 60]], i, 'rgba(29,26,43,0.4)', 2);
      for (let k = 0; k < 3; k++) {
        const cx = x + 40 + k * 75, cy = 64 + Math.sin((k + 0.5) / 3 * Math.PI) * 18;
        const w = 30 + hash(i * 3 + k) * 12, h = 34 + hash(i * 5 + k) * 18; // a T-shirt on pegs
        poly(0, [[cx, cy], [cx + w * 0.32, cy], [cx + w / 2, cy + 6], [cx + w * 0.68, cy], [cx + w, cy], [cx + w + 7, cy + h * 0.3], [cx + w * 0.82, cy + h * 0.36], [cx + w * 0.82, cy + h], [cx + w * 0.18, cy + h], [cx + w * 0.18, cy + h * 0.36], [cx - 7, cy + h * 0.3]], 0, PASTEL[(i * 3 + k + 60) % 6], DK);
      }
      break;
    case 'market': { // striped awning over a fruit stand
      const ay = 70 + r * 40;
      for (let k = 0; k < 6; k++) box(x + 30 + k * 30, ay, 30, 30, k % 2 ? th.far : '#fffaf0');
      rect(0, x + 30, ay, 180, 30, 0, null, DK);
      for (let k = 0; k < 5; k++) ellipse(0, x + 55 + k * 32, ay + 70, 12, 11, 0, PASTEL[(i + k + 60) % 6], DK);
      break;
    }
    case 'metro': // tiled band with the line sign
      box(x, 70, sp, 80, mix(th.bg, th.far, 0.6));
      if (r > 0.45) { rect(0, x + 100, 88, 44, 44, 0, '#e53935', INK); text(0, 'M', x + 122, 111, 30, '#fff'); }
      break;
    case 'columns': // marble columns and the odd chandelier
      rect(0, x + 40, 20, 44, G - 20, 0, th.far, DK);
      for (let k = 1; k < 4; k++) box(x + 40 + k * 11, 30, 2, G - 40, 'rgba(29,26,43,0.12)');
      if (r > 0.5) {
        box(x + 169, 0, 2, 40, 'rgba(29,26,43,0.4)');
        curve(0, [[x + 135, 46], [x + 170, 64], [x + 205, 46]], 0, '#c9a85c', 4);
        for (let k = 0; k < 3; k++) ellipse(0, x + 140 + k * 30, 40, 4, 7, 0, '#fff6c2', DK);
      }
      break;
    case 'books': { // bookshelf rows
      save(); alpha(0.7);
      for (let row = 0; row < 3; row++) {
        const by = 70 + row * 62;
        for (let bx = 8; bx < sp - 16; bx += 14) box(x + bx, by - 30 - hash(i * 31 + bx + row) * 14, 12, 44 + hash(i * 31 + bx + row) * 14 - 14, PASTEL[(bx + row + i * 7 + 600) % 6]);
        box(x, by + 14, sp, 6, th.far);
      }
      restore();
      break;
    }
    case 'pool': // big window with a palm
      rect(0, x + 40, 40, 150, 110, 0, '#d6f3ff', DK);
      if (r > 0.4) { curve(0, [[x + 115, 150], [x + 112, 110], [x + 120, 75]], 0, '#9b6b3f', 5); for (const s of [-1, 1]) curve(0, [[x + 120, 75], [x + 120 + s * 22, 66], [x + 120 + s * 38, 80]], 0, '#4caf50', 4); }
      break;
    case 'crowns': {
      const cx = x + r * 200, cy = 60 + r2 * 120;
      poly(0, [[cx - 22, cy + 12], [cx - 22, cy - 10], [cx - 11, cy], [cx, cy - 16], [cx + 11, cy], [cx + 22, cy - 10], [cx + 22, cy + 12]], 0, th.far, DK);
      break;
    }
  }
}

// ---------------- world objects ----------------
function drawGround(map, th, camX) {
  if (th.water) { // water at the bottom of every pit, with a moving pixel ripple
    box(0, G + 26, W, VIEW_H - G - 26, th.water);
    const off = (camX * 0.5) % 40;
    for (let x = -off; x < W; x += 40) box(x, G + 28, 16, 2, '#ffffff');
  }
  for (let gi = 0; gi < map.ground.length; gi++) {
    const [x1, x2] = map.ground[gi];
    if (x2 < camX - 20 || x1 > camX + W + 20) continue;
    const a = Math.max(x1, camX - 30), b = Math.min(x2, camX + W + 30);
    const sx = a - camX, w = b - a;
    box(sx, G, w, VIEW_H - G, th.ground);
    // world-anchored speckles (stones, grain) so the floor visibly scrolls
    const dk = shade(th.ground, 0.18), lt = light(th.ground, 0.18);
    for (let x = Math.ceil(a / 18) * 18; x < b; x += 18) {
      const h1 = hash(x), h2 = hash(x + 7);
      box(x - camX, G + 14 + h1 * 40, 4, 2, dk);
      if (h2 > 0.55) box(x - camX + 8, G + 30 + h2 * 24, 2, 2, lt);
    }
    box(sx, G, w, 8, th.top);
    box(sx, G, w, 2, light(th.top, 0.3));
    box(sx, G + 8, w, 2, shade(th.ground, 0.3));
    if (x1 >= camX - 30) box(x1 - camX, G, 2, VIEW_H - G, INK);
    if (x2 <= camX + W + 30) box(x2 - camX - 2, G, 2, VIEW_H - G, INK);
    if (th.decor === 'hills') { // grass tufts
      for (let x = Math.ceil(a / 47) * 47; x < b; x += 47) {
        const gx = x - camX;
        box(gx - 4, G - 6, 2, 6, '#3f8f3a'); box(gx, G - 10, 2, 10, '#3f8f3a'); box(gx + 4, G - 6, 2, 6, '#3f8f3a');
      }
    }
  }
}

function drawSolid(o, th, camX) {
  const x = o.x - camX;
  if (x > W + 10 || x + o.w < -10) return;
  const kind = o.kind;
  if (kind === 'beam') {
    const y0 = Math.max(o.y, -5), h = o.y + o.h - y0;
    rect(0, x, y0, o.w, h, 0, th.beam, INK);
    box(x + 2, y0, 4, h - 12, light(th.beam, 0.25));
    for (let px = 22; px < o.w - 6; px += 26) box(x + px, y0 + 4, 2, h - 18, shade(th.beam, 0.2));
    stripes(x, y0 + h - 12, o.w, 12, '#ffd23f', INK, 18); // warning tape on the lower edge
    box(x, y0 + h - 14, o.w, 2, INK);
  } else if (kind === 'pipe') {
    const top = o.y === 0;
    const y0 = top ? -5 : o.y, y1 = top ? o.y + o.h : Math.min(o.y + o.h, VIEW_H + 5);
    rect(0, x + 4, y0, o.w - 8, y1 - y0, 0, th.pipe, INK);
    box(x + 10, y0, 6, y1 - y0, light(th.pipe, 0.45));
    box(x + o.w - 16, y0, 6, y1 - y0, shade(th.pipe, 0.2));
    if (th.decor === 'night') for (let by = (top ? y1 - 20 : y0 + 26); top ? by > y0 : by < y1; by += top ? -18 : 18) box(x + 6, by, o.w - 12, 2, 'rgba(0,0,0,0.3)');
    const ly = top ? y1 - 18 : y0;
    rect(0, x - 2, ly, o.w + 4, 18, 0, th.pipe, INK);
    box(x + 4, ly + 2, o.w - 8, 4, light(th.pipe, 0.45));
  } else if (kind === 'ledge') {
    rect(0, x, o.y, o.w, o.h, 0, th.box, INK);
    hatch(0, x, o.y, o.w, o.h, shade(th.box, 0.2), 8);
    line(0, x + 10, o.y + o.h, x + 18, o.y + o.h + 14, 0, 0, INK, 2);
    line(0, x + o.w - 10, o.y + o.h, x + o.w - 18, o.y + o.h + 14, 0, 0, INK, 2);
  } else { // crate: planks, a dark frame and a cross brace
    rect(0, x, o.y, o.w, o.h, 0, th.box, INK);
    const dk = shade(th.box, 0.25);
    for (let py = o.y + 12; py < o.y + o.h - 6; py += 12) box(x + 2, py, o.w - 4, 2, shade(th.box, 0.12));
    rect(0, x + 6, o.y + 6, o.w - 12, o.h - 12, 0, null, dk);
    line(0, x + 8, o.y + o.h - 8, x + o.w - 8, o.y + 8, 0, 0, dk, 3);
    box(x + 2, o.y + 2, o.w - 4, 2, light(th.box, 0.4));
  }
}

function drawSpike(s, th, camX) {
  const x = s.x - camX;
  if (x > W + 10 || x + s.w < -10) return;
  const pts = s.dir === 'down'
    ? [[x, s.y], [x + s.w, s.y], [x + s.w / 2, s.y + s.h]]
    : [[x, s.y + s.h], [x + s.w / 2, s.y], [x + s.w, s.y + s.h]];
  poly(0, pts, 0, th.spike, INK);
  // a lit left face and a red tip
  const tipY = s.dir === 'down' ? s.y + s.h - 6 : s.y + 4;
  poly(0, s.dir === 'down' ? [[x + 4, s.y + 2], [x + s.w / 2, s.y + 2], [x + s.w / 2, s.y + s.h - 6]] : [[x + 4, s.y + s.h - 2], [x + s.w / 2, s.y + 6], [x + s.w / 2, s.y + s.h - 2]], 0, light(th.spike, 0.5), null);
  box(x + s.w / 2 - 2, tipY - 2, 4, 4, '#dd3333');
}

// crumpled foil ball; rot = how far it has rolled (radians)
function drawFoil(x, by, rot, seed) {
  const R = C.FOIL / 2, cx = x + R, cy = by - R, pts = [];
  for (let k = 0; k < 9; k++) {
    const a = rot + (k / 9) * Math.PI * 2, rr = R * (0.85 + hash(seed * 11 + k) * 0.25);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  poly(0, pts, 0, '#cfd6de', INK);
  for (let k = 0; k < 2; k++) { const a = rot + k * 2.6; box(cx + Math.cos(a) * R * 0.4 - 1, cy + Math.sin(a) * R * 0.4 - 1, 3, 3, '#8d96a3'); }
  box(cx - R * 0.5, cy - R * 0.55, 4, 4, '#ffffff');
}

function drawFoils(map, sim, camX) {
  if (!map.movers) return;
  for (let j = 0; j < map.movers.length; j++) {
    const m = map.movers[j], b = j * 4;
    const x = sim ? sim.mv[b] : m.x, by = sim ? sim.mv[b + 1] : m.y, sx = x - camX;
    if (sx < -40 || sx > W + 40 || by > VIEW_H + C.FOIL) continue;
    if (by < G - 4) { // in the air: a shadow on the floor shows where it will land
      const k = Math.max(0.25, 1 - (G - by) / 340);
      oval(sx + C.FOIL / 2, G - 2, 13 * k, 4 * k, `rgba(0,0,0,${0.3 * k})`);
    }
    if (by > -C.FOIL) drawFoil(sx, by, (x - m.x) / (C.FOIL / 2), j + 1);
  }
}

function drawCheese(ctx, x, y, gold, seed, t, scl = 1) {
  const b = t ? Math.round(Math.sin(t / 220 + seed) * 2) * 2 : 0; // bob in whole pixels
  y += b;
  const s = 13 * scl;
  if (gold && t) oval(x, y, s * 1.6, s * 1.6, 'rgba(255,215,64,0.3)');
  poly(0, [[x - s, y + s * 0.7], [x + s, y + s * 0.7], [x + s, y - s * 0.2], [x - s * 0.6, y - s * 0.8]], 0, gold ? '#ffb300' : '#ffd84d', INK);
  poly(0, [[x - s * 0.6, y - s * 0.8], [x + s, y - s * 0.2], [x + s * 0.4, y - s * 0.2]], 0, gold ? '#ffd970' : '#fff0a0', null); // lit top
  disc(x - s * 0.2, y + s * 0.2, s * 0.22, gold ? '#c77d00' : '#e3a90c');
  disc(x + s * 0.5, y + s * 0.05, s * 0.16, gold ? '#c77d00' : '#e3a90c');
  if (gold && t) star(0, x + s, y - s, 4 + Math.round(Math.abs(Math.sin(t / 160))) * 2, 0, '#fff6b0');
}

const TOUCH_SIGNS = {
  cs: [['(A / ←)', '(ťuk vlevo)'], ['(D / →)', '(drž prst vpravo)'], ['(A A A)', '(ťuk ťuk ťuk vlevo)']],
  en: [['(A / ←)', '(tap left)'], ['(D / →)', '(hold finger right)'], ['(A A A)', '(tap tap tap left)']],
};
// the rare goldfish: pops in with a burst, then shimmers
function drawGoldfish(x, y, t, age) {
  const pop = age < 300 ? age / 300 : 1, bob = Math.round(Math.sin(t / 200) * 2) * 2;
  save(); translate(x, y + bob); scale(pop, pop);
  oval(0, 0, 28, 28, `rgba(255,210,63,${0.3 + 0.15 * Math.sin(t / 120)})`);
  poly(0, [[-14, 0], [-30, -14], [-24, 0], [-30, 14]], 0, '#ff9f1c', INK); // flowing tail
  ellipse(0, 0, 0, 17, 12, 0, '#ffb300', INK);
  box(-10, -8, 14, 4, '#ffe08a');
  poly(0, [[-4, -11], [4, -19], [9, -10]], 0, '#ff9f1c', INK);
  disc(9, -3, 4, '#fff'); disc(10, -3, 2, INK);
  restore();
  for (let k = 0; k < 3; k++) star(0, x + Math.cos(t / 250 + k * 2.1) * 30, y + bob + Math.sin(t / 250 + k * 2.1) * 22, 3 + 2 * Math.abs(Math.sin(t / 150 + k)), 0, '#fff6b0');
}

export function drawSalmon(ctx, x, y, seed, t, scl = 1) {
  const hop = t ? Math.round(Math.abs(Math.sin(t / 260 + seed)) * -3) * 2 : 0;
  save(); translate(x, y + hop); scale(scl, scl);
  if (t) oval(0, 0, 26, 26, `rgba(255,140,105,${0.22 + 0.12 * Math.sin(t / 150 + seed)})`);
  poly(0, [[-16, 0], [-28, -11], [-25, 0], [-28, 11]], 0, '#f26d50', INK); // tail
  ellipse(0, 0, 0, 19, 10, 0, '#ff8c69', INK);
  save(); clipEllipse(0, 0, 18, 9);
  box(-20, 2, 40, 10, '#ffd0bf'); // belly
  for (const sx of [-8, -1, 6]) box(sx, -9, 3, 9, '#d9503a'); // stripes
  box(-12, -7, 8, 2, '#ffb39a'); // shine
  restore();
  poly(0, [[-4, -9], [3, -15], [8, -8]], 0, '#f26d50', INK); // fin
  disc(12, -2, 2, INK);
  restore();
  if (t) {
    star(0, x + 18 + Math.sin(t / 200) * 4, y - 16 + hop, 3 + 2 * Math.abs(Math.sin(t / 170)), 0, '#fff6b0');
    star(0, x - 20, y + 12 + hop, 2 + 2 * Math.abs(Math.cos(t / 190)), 0, '#fff6b0');
  }
}

function drawSign(sg, lang, camX, touch) {
  const x = sg.x - camX;
  if (x < -300 || x > W + 300) return;
  let str = sg[lang] || sg.cs;
  if (touch) for (const [a, b] of TOUCH_SIGNS[lang] || []) str = str.replace(a, b);
  const SPEED = { '>>>': ['RYCHLE! >>>', 'FAST! >>>'], '<<': ['<< POMALU', '<< SLOW'], '=': ['NORMÁLNÍ RYCHLOST', 'NORMAL SPEED'] };
  if (SPEED[str]) str = SPEED[str][lang === 'cs' ? 0 : 1];
  const w = Math.max(50, textWidth(str, textScale(20)) / K + 28);
  rect(0, x - 3, G - 130, 6, 130, 0, '#8d5a3b', INK);
  rect(0, x - w / 2, G - 172, w, 44, 0, '#fff7d6', INK);
  box(x - w / 2 + 2, G - 132, w - 4, 2, '#e6d9a8');
  text(0, str, x, G - 150, 20, INK);
}

function drawFinish(map, camX, t, trapClose) {
  const fx = map.length + C.MOUSE_W - camX;
  if (fx < W + 40 && fx > -60) {
    rect(0, fx - 2, G - 124, 6, 124, 0, '#8d5a3b', INK);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
      const wave = Math.round(Math.sin(t / 150 + c) * 1.5) * 2;
      box(fx + 4 + c * 12, G - 120 + r * 10 + wave, 12, 10, (r + c) % 2 ? INK : '#fff');
    }
  }
  const tx = map.length + TRAP_OFFSET - camX;
  if (tx > W + 120 || tx < -160) return;
  drawTrap(0, tx, trapClose, t);
}

export function drawTrap(ctx, tx, close, t) {
  rect(0, tx - 50, G - 14, 100, 14, 0, '#d9a066', INK); // board
  box(tx - 48, G - 12, 96, 2, '#f0c08a');
  hatch(0, tx - 48, G - 10, 96, 8, 'rgba(120,70,20,0.35)', 8);
  ellipse(0, tx, G - 16, 8, 6, 0, '#c7ccd3', INK); // spring coil
  if (close < 0.5) drawCheese(0, tx + 26, G - 22, false, 2, t, 0.7);
  if (close < 1) trapBar(0, tx, close);
}

// the snapping bar; drawn again over the mouse once the trap has closed
export function trapBar(ctx, tx, close) {
  const ang = Math.PI - close * Math.PI; // PI = left (open), 0 = right (closed)
  const len = 44;
  const ex = tx + Math.cos(ang) * len, ey = G - 14 - Math.sin(ang) * len * 0.9 - 2;
  line(0, tx, G - 16, ex, ey, 0, 0, INK, 6);
  line(0, tx, G - 16, ex, ey, 0, 0, '#9aa1aa', 3);
  if (close > 0 && close < 1) line(0, ex, ey, ex, ey - 6, 0, 0, '#9aa1aa', 4);
}

// ---------------- characters ----------------
export function drawMouse(ctx, x, by, o = {}) {
  const h = o.duck ? C.DUCK_H : C.MOUSE_H;
  const t = o.t || 0;
  save(); alpha(o.alpha ?? 1);
  const pal = o.ghost ? null : o.pal || SKIN.mouse, mx = pal && pal.mix; // mx: second colour + pattern
  const body = o.ghost ? '#9fc3ff' : pal?.hex || '#b8b2c8', ink = o.ghost ? '#3d5a8c' : INK;
  const ear = o.ghost ? '#cfe0ff' : mx && mx.pat === 'points' ? mx.hex : '#f7a1b5';
  const cy = by - h / 2 - 1;
  const phase = Math.floor(t / 70) % 4;
  // tail
  curve(0, [[x + 2, cy + 2], [x - 10, cy - 4 + (phase % 2) * 4], [x - 20, cy + 2], [x - 26, cy - 8]], 0, ear, 3);
  // legs
  if (!o.dead) {
    const air = o.air;
    const l1 = air ? 4 : [0, 4, 0, -4][phase], l2 = air ? -4 : -l1;
    box(x + 6 + l1, by - 4, 4, 5, ink);
    box(x + 20 + l2, by - 4, 4, 5, ink);
  }
  // body, with a lit back and a darker belly line
  const ry = Math.max(7, h / 2 + 1);
  ellipse(0, x + 14, cy, 16, ry, 0, body, ink);
  if (!o.ghost) {
    save(); clipEllipse(x + 14, cy, 16, ry);
    box(x - 2, cy + ry - 4, 32, 4, shade(body, 0.18));
    box(x + 4, cy - ry + 2, 14, 2, light(body, 0.4));
    restore();
  }
  if (mx) mousePattern(mx, x + 14, cy, ry);
  // head
  const hx = x + 28, hy = o.duck ? by - 8 : cy - 4;
  ellipse(0, hx, hy, 10, 9, 0, mx && mx.pat === 'points' ? mx.hex : body, ink);
  if (mx && mx.pat === 'patches') oval(hx - 2, hy - 2, 4, 3.5, mx.hex, 0.4);
  ellipse(0, hx - 4, hy - (o.duck ? 7 : 10), 6, 6, 0, ear, ink);
  box(hx - 6, hy - (o.duck ? 9 : 12), 4, 4, light(ear, 0.4));
  // nose + eye
  disc(hx + 10, hy + 1, 3, '#ff6f91');
  if (o.dead) {
    line(0, hx + 1, hy - 5, hx + 6, hy, 0, 0, ink, 2); line(0, hx + 6, hy - 5, hx + 1, hy, 0, 0, ink, 2);
  } else {
    box(hx + 1, hy - 4, o.scared ? 6 : 4, o.scared ? 6 : 4, ink);
    if (!o.scared) box(hx + 1, hy - 4, 2, 2, '#ffffff');
  }
  // whiskers
  box(hx + 10, hy + 2, 8, 2, ink);
  restore();
}

// second colour on the mouse's body, kept inside the body
function mousePattern(mx, cx, cy, ry) {
  save(); clipEllipse(cx, cy, 15, ry - 1);
  if (mx.pat === 'tabby') for (const dx of [-7, 0, 7]) box(cx + dx - 2, cy - ry, 4, ry * 1.2, mx.hex);
  else if (mx.pat === 'twotone') box(cx - 16, cy + ry * 0.15, 32, ry, mx.hex); // belly
  else if (mx.pat === 'patches') { oval(cx - 5, cy - 2, 5, 4, mx.hex, 0.5); oval(cx + 6, cy + 3, 3.5, 3, mx.hex); }
  else if (mx.pat === 'points') oval(cx - 15, cy, 6, ry, mx.hex); // darker rump
  restore();
}

function bubble(x, y, str, color, age) {
  if (age > 650) return;
  const pop = age < 90 ? 0.6 + (age / 90) * 0.5 : 1;
  save(); translate(x, y); scale(pop, pop);
  const w = textWidth(str, textScale(26)) / K + 30;
  poly(0, [[-12, 14], [-24, 36], [4, 16]], 0, '#fff', INK);
  rect(0, -w / 2, -22, w, 44, 0, '#fff', INK);
  box(-w / 2 + 2, 18, w - 4, 2, '#d8d4e6');
  text(0, str, 0, 0, 26, color);
  restore();
}

// ---------------- HUD: the cat's behind ----------------
function wobble(age) {
  if (age > 700) return 0;
  const tt = age / 1000;
  return Math.sin(tt * 38) * Math.exp(-tt * 7);
}

export function drawButt(ctx, bx, by, st, now, lang, scl = 0.8, o = {}) {
  save(); translate(bx, by);
  if (o.rot) rotate(o.rot);
  scale(scl * (1 + (o.fat || 0) * 0.35), scl * (1 - (o.fat || 0) * 0.05));
  drawButtInner(st, now, o);
  restore();
}

// a cartoon hand (skin + sleeve) seen from the palm side, fingers pointing up
function slapHand(x, y, s, rot, a) {
  if (a <= 0) return;
  save(); alpha(Math.min(1, a)); translate(x, y); rotate(rot); scale(s, s);
  const skin = '#ffd7b5';
  rect(0, -16, 26, 32, 26, 0, '#5b8def', INK); // sleeve
  box(-14, 28, 28, 4, '#8fb4ff');
  for (const [fx, fy, len, r] of [[-15, -6, 20, -0.35], [-6, -16, 26, -0.1], [4, -17, 27, 0.05], [13, -12, 23, 0.2]]) {
    save(); translate(fx, fy); rotate(r);
    ellipse(0, 0, -len / 2 + 6, 5.5, len / 2 + 2, 0, skin, INK);
    restore();
  }
  ellipse(0, 22, 4, 6, 13, 0, skin, INK, 0, 0, 0.9); // thumb
  ellipse(0, 0, 8, 19, 21, 0, skin, INK); // palm
  box(-8, 8, 16, 2, '#d9a184');
  restore();
}

// comic "SLAP!" starburst, two-tone with a hard shadow
function slapBurst(x, y, age, seed, rot) {
  if (age > 480) return;
  const pop = age < 90 ? 0.4 + (age / 90) * 0.8 : 1.2 - Math.min(0.2, (age - 90) / 400);
  save(); translate(x, y); scale(pop, pop);
  if (age > 360) alpha(1 - (age - 360) / 120);
  const pts = [], inner = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + rot, rr = i % 2 ? 30 : 52 + hash(seed + i) * 10;
    pts.push([Math.cos(a) * rr * 1.25, Math.sin(a) * rr * 0.8]);
    inner.push([Math.cos(a) * rr * 0.9, Math.sin(a) * rr * 0.55]);
  }
  poly(0, pts.map(([px, py]) => [px + 6, py + 6]), 0, 'rgba(29,26,43,0.45)', null);
  poly(0, pts, 0, '#ff8a2a', INK);
  poly(0, inner, 0, '#ffe14d', null);
  text(0, 'SLAP!', 0, 2, 34, '#e2302f', 'center', '#fff');
  restore();
}

function drawButtInner(st, now, o = {}) {
  const cx = 0, cy = 0;
  const pal = o.cat || SKIN.cat, orange = pal ? pal.hex : '#f39c34', dark = pal ? pal.dark : '#c96f1c';
  // mixes put the second colour (B) on: stripes (tabby), head/ears/paws/tail (points), cheeks/paws (two-tone), blobs (patches)
  const mx = pal && pal.mix, B = mx && mx.hex, pat = mx ? mx.pat : '';
  const earC = pat === 'points' ? B : orange, pawC = pat === 'points' || pat === 'twotone' ? B : orange;
  const tailC = pat === 'points' ? B : orange, headC = pat === 'points' ? B : orange, cheekC = pat === 'twotone' ? B : orange;
  const stripeC = pat === 'tabby' ? B : pat === 'twotone' ? mx.dark : dark, stripeW = pat === 'tabby' ? 8 : 5;
  const blob = (clip, x, y, rx, ry, rot) => { // a patch of B, kept inside the part it sits on
    save(); clipEllipse(clip[0], clip[1], clip[2], clip[3]); oval(x, y, rx, ry, B, rot); restore();
  };
  const sheen = (clip, x, y, rx, ry, c) => { save(); clipEllipse(clip[0], clip[1], clip[2], clip[3]); oval(x, y, rx, ry, c); restore(); };
  const la = now - (st.left || -1e6), ra = now - (st.right || -1e6);
  const tailSwish = Math.sin(now / 260) * 12 + (la < 300 ? -20 : 0) + (ra < 300 ? 20 : 0);
  // head (behind)
  poly(0, [[cx - 38, cy - 92], [cx - 30, cy - 128], [cx - 10, cy - 102]], 0, earC, INK);
  poly(0, [[cx + 10, cy - 102], [cx + 30, cy - 128], [cx + 38, cy - 92]], 0, earC, INK);
  poly(0, [[cx - 32, cy - 98], [cx - 29, cy - 116], [cx - 19, cy - 102]], 0, '#ffb3c6', null);
  poly(0, [[cx + 19, cy - 102], [cx + 29, cy - 116], [cx + 32, cy - 98]], 0, '#ffb3c6', null);
  ellipse(0, cx, cy - 86, 42, 34, 0, headC, INK); // points: dark face like a Siamese
  sheen([cx, cy - 86, 41, 33], cx - 14, cy - 104, 18, 8, light(headC, 0.3));
  if (pat === 'patches') blob([cx, cy - 86, 41, 33], cx + 16, cy - 98, 15, 11, 0.3);
  // body
  ellipse(0, cx, cy - 30, 92, 58, 0, orange, INK);
  sheen([cx, cy - 30, 91, 57], cx - 30, cy - 66, 44, 14, light(orange, 0.25));
  if (pat === 'patches') { const bd = [cx, cy - 30, 91, 57]; blob(bd, cx - 50, cy - 52, 26, 17, -0.4); blob(bd, cx + 56, cy - 36, 18, 13, 0.5); }
  for (const s of [-1, 1]) {
    curve(0, [[cx + s * 30, cy - 76], [cx + s * 44, cy - 54], [cx + s * 36, cy - 34]], 0, stripeC, stripeW);
    curve(0, [[cx + s * 60, cy - 60], [cx + s * 72, cy - 40], [cx + s * 66, cy - 22]], 0, stripeC, stripeW);
  }
  // paws
  ellipse(0, cx - 62, cy + 54, 22, 10, 0, pawC, INK);
  ellipse(0, cx + 62, cy + 54, 22, 10, 0, pawC, INK);
  // cheeks
  const cheek = (side, age, held) => {
    const w = held ? 0.55 : wobble(age);
    const x = cx + side * 50, y = cy + 14;
    const red = held ? 0.9 : age < 900 ? 1 - age / 900 : 0;
    save(); translate(x, y); scale(1 + w * 0.18, 1 - w * 0.14);
    const c = red > 0 ? mix(cheekC, '#ff5a5a', Math.round(red * 3) / 3 * 0.75) : cheekC; // reddening in 3 hard steps
    ellipse(0, 0, 0, 56, 50, 0, c, INK);
    sheen([0, 0, 55, 49], -side * 18, -26, 22, 10, light(c, 0.3));
    sheen([0, 0, 55, 49], side * 10, 40, 50, 14, shade(c, 0.15));
    if (pat === 'patches' && side < 0) blob([0, 0, 55, 49], -14, 12, 20, 15, 0.6);
    curve(0, [[side * 14, -30], [side * 30, -20], [side * 34, -2]], 0, stripeC, stripeW);
    restore();
    if (!held && red > 0) { // red handprint
      save(); alpha(Math.min(1, red * 1.2)); translate(x + side * 6, y - 2); rotate(side > 0 ? 0.35 : -0.35);
      oval(0, 6, 15, 17, '#e23d55');
      for (const [fx, fy, rx, ry, r] of [[-13, -8, 4, 12, -0.5], [-6, -17, 4, 13, -0.15], [2, -19, 4, 13, 0], [10, -15, 4, 12, 0.2], [17, 2, 4, 10, 1.0]]) oval(fx * side, fy, rx, ry, '#e23d55', r * side);
      restore();
    }
  };
  cheek(-1, la, false);
  cheek(1, ra, !!st.rightHeld);
  // tail from the top of the crack
  const tx = cx, ty = cy - 30;
  const tip = [cx + 40 + tailSwish, cy - 128];
  const tailPts = [[tx, ty], [tx + 6 + tailSwish * 0.3, ty - 40], [tip[0] - 20, tip[1] + 20], tip];
  curve(0, tailPts, 0, INK, 17);
  curve(0, tailPts, 0, tailC, 12);
  // the slapping hand jumps onto the cheek (and stays there while the right one is held)
  const handAt = (side, age, held, upAge) => {
    const hx = cx + side * 56, hy = cy + 16;
    let p, a = 1;
    if (age < 70) p = age / 70;                       // flying in
    else if (held) p = 1;                              // pressing
    else {
      const away = side < 0 ? age - 230 : upAge;      // left leaves on its own, right on release
      if (away < 0) p = 1; else { p = 1 - Math.min(1, away / 140); a = p; }
    }
    if (p <= 0) return;
    const fromX = hx + side * 110, fromY = hy - 90;
    const shake = held && age > 70 ? Math.round(Math.sin(now / 30)) * 2 : 0;
    slapHand(fromX + (hx - fromX) * p + shake, fromY + (hy - fromY) * p, 1.25 - p * 0.25, side * (0.5 - p * 0.3), a);
  };
  if (o.noHands) return;
  handAt(-1, la, false, 0);
  handAt(1, now - (st.right || -1e6), !!st.rightHeld, st.rightUp ? now - st.rightUp : 1e6);
  slapBurst(cx - 150, cy - 70, la, 380, -0.2);
  slapBurst(cx + 150, cy - 70, now - (st.right || -1e6), 390, 0.2);
  // impact sparks flying off the cheek
  for (const [age, side] of [[la, -1], [ra, 1]]) {
    if (age < 260) {
      const p = age / 260;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + side;
        star(0, cx + side * 50 + Math.cos(a) * (40 + p * 50), cy + 10 + Math.sin(a) * (30 + p * 40), 8 * (1 - p) + 3, 0, i % 2 ? '#ffd23f' : '#ffffff');
      }
    }
  }
}

function keycap(x, y, label) {
  const w = Math.max(40, textWidth(label, textScale(20)) / K + 20);
  rect(0, x - w / 2, y - 14, w, 34, 0, '#c9c4d8', INK); // key side
  rect(0, x - w / 2, y - 18, w, 30, 0, '#fff', INK);
  text(0, label, x, y - 3, 20);
}

function cushion(x, y) {
  ellipse(0, x, y, 82, 22, 0, '#c84f7d', INK);
  oval(x, y - 6, 66, 10, '#e0719a');
  oval(x - 20, y - 10, 30, 4, '#f3a6c2');
  for (const s of [-1, 1]) star(0, x + s * 78, y - 2, 6, 0, '#ffd23f');
}

function hudPanel(v, now) {
  const L = v.lang;
  // desk strip: cream panel with a pixel edge and ruled lines
  box(0, VIEW_H, W, H - VIEW_H, '#fffaf0');
  for (let y = VIEW_H + 30; y < H; y += 24) box(0, y, W, 2, '#ece8f4');
  box(60, VIEW_H, 2, H - VIEW_H, '#f3b8b0');
  box(0, VIEW_H, W, 6, INK);
  box(0, VIEW_H + 6, W, 2, '#d8d4e6');

  if (v.leap) cushion(W / 2, VIEW_H + 150);
  else drawButt(0, W / 2, VIEW_H + 110, v.butt, now, L);
  // controls hints next to the cheeks
  const touch = v.touch;
  keycap(W / 2 - 158, VIEW_H + 116, touch ? (L === 'cs' ? '← ťuk' : '← tap') : 'A / ←');
  text(0, L === 'cs' ? 'SKOK ↑' : 'JUMP ↑', W / 2 - 158, VIEW_H + 158, 20, '#2a7de1');
  keycap(W / 2 + 158, VIEW_H + 116, touch ? (L === 'cs' ? 'drž →' : 'hold →') : 'D / →');
  text(0, L === 'cs' ? 'DRŽ = PODLEZ ↓' : 'HOLD = DUCK ↓', W / 2 + 158, VIEW_H + 158, 18, '#e2574c');

  // left: map + progress
  if (v.map) {
    text(0, `${v.map.id}. ${v.map.name[L]}`, 80, VIEW_H + 40, 24, INK, 'left');
    const p = Math.max(0, Math.min(1, (v.sim ? v.sim.x : 0) / v.map.length));
    rect(0, 80, VIEW_H + 64, 200, 20, 0, '#fff', INK);
    if (p > 0) { box(84, VIEW_H + 68, 192 * p, 12, '#7bc142'); box(84, VIEW_H + 68, 192 * p, 4, '#a8e07a'); }
    if (v.bestProgress) box(83 + 194 * v.bestProgress, VIEW_H + 60, 4, 28, '#e2574c');
    text(0, `${Math.floor(p * 100)} %`, 292, VIEW_H + 74, 20, INK, 'left');
    if (v.watchName) text(0, (L === 'cs' ? 'Záznam: ' : 'Replay: ') + v.watchName, 80, VIEW_H + 110, 20, '#3d5a8c', 'left');
    else text(0, (L === 'cs' ? 'Pokus #' : 'Attempt #') + (v.attempt || 1), 80, VIEW_H + 110, 20, '#6b6680', 'left');
    if (v.ghostOn) { drawMouse(0, 86, VIEW_H + 168, { ghost: true, alpha: 0.6, t: 0 }); text(0, (L === 'cs' ? 'duch = tvůj rekord' : 'ghost = your best'), 128, VIEW_H + 156, 16, '#3d5a8c', 'left'); }
  }
  // right: score
  if (v.sim) {
    const sc = v.score || 0;
    text(0, String(sc), W - 80, VIEW_H + 42, 40, INK, 'right');
    drawCheese(0, W - 250, VIEW_H + 90, false, 1, 0, 0.9);
    text(0, `× ${v.sim.cheese}`, W - 228, VIEW_H + 92, 20, INK, 'left');
    if (v.sim.gold) { drawCheese(0, W - 160, VIEW_H + 90, true, 2, 0, 0.9); text(0, `× ${v.sim.gold}`, W - 138, VIEW_H + 92, 20, INK, 'left'); }
    drawSalmon(0, W - 248, VIEW_H + 126, 3, 0, 0.75);
    text(0, `× ${v.sim.salmon}/${C.SALMON_PER_MAP}`, W - 226, VIEW_H + 126, 20, v.sim.salmon === C.SALMON_PER_MAP ? '#e2574c' : INK, 'left');
    text(0, (L === 'cs' ? 'těsně: ' : 'close: ') + v.sim.close, W - 130, VIEW_H + 126, 16, '#6b6680', 'left');
    if (v.best) text(0, (L === 'cs' ? 'rekord: ' : 'best: ') + v.best, W - 80, VIEW_H + 156, 16, '#6b6680', 'right');
  }
}

// ---------------- main entry ----------------
let lastNow = 0;
// v: { map, sim, ghost, camX, lang, fx[], butt, catSay, end, mode, ... }
export function render(ctx, v, now) {
  target(main);
  const th = THEMES[v.map ? v.map.theme : 'kitchen'];
  const camX = Math.round(v.camX * K) / K; // whole frame pixels: the world never shimmers between pixels
  save();
  if (v.shake > 0) translate(Math.round((hash(now | 0) - 0.5) * v.shake / 2) * 2, Math.round((hash((now | 0) + 1) - 0.5) * v.shake / 2) * 2);
  paper(th, camX);
  decor(th, camX, now);
  if (v.map) {
    const map = v.map;
    drawGround(map, th, camX);
    for (const sg of map.signs || []) drawSign(sg, v.lang, camX, v.touch);
    for (const o of map.solids) drawSolid(o, th, camX);
    for (const s of map.spikes) drawSpike(s, th, camX);
    map.items.forEach((it, i) => {
      if (v.sim && v.sim.collected[i]) return;
      const x = it.x - camX; if (x < -30 || x > W + 30) return;
      if (it.kind === 'salmon') drawSalmon(0, x, it.y, i, now);
      else if (i === v.goldIdx && !(v.sim && v.sim.collected[i])) drawGoldfish(x, it.y, now, now - (v.goldAt || 0));
      else if (v.sim && i === v.sim.bonusIdx) { // this run's bonus salmon, on a blue glow
        oval(x, it.y, 22 + Math.round(Math.sin(now / 180)) * 2, 22 + Math.round(Math.sin(now / 180)) * 2, 'rgba(120,190,255,0.35)');
        drawSalmon(0, x, it.y, i, now, 0.8);
      } else drawCheese(0, x, it.y, it.kind === 'gold', i, now);
    });
    drawFoils(map, v.sim, camX);
    drawFinish(map, camX, now, v.end ? v.end.trap : 0);
  }
  // ghost
  if (v.ghost && !v.ghost.done) drawMouse(0, v.ghost.x - camX, v.ghost.by, { duck: v.ghost.duck > 0, t: now, ghost: true, alpha: 0.45, air: !v.ghost.onGround });
  // mouse
  if (v.mouse && v.mouse.visible) drawMouse(0, v.mouse.x - camX, v.mouse.by, { duck: v.mouse.duck, t: now, dead: v.mouse.dead, air: v.mouse.air, scared: v.mouse.scared });
  // jumps left (max 2 until landing), shown while airborne
  if (v.sim && v.mouse && v.mouse.visible && !v.end && !v.sim.onGround && !v.sim.dead) {
    const left = C.MAX_JUMPS - v.sim.jumps, mx = v.mouse.x - camX + 15, my = v.mouse.by - (v.mouse.duck ? C.DUCK_H : C.MOUSE_H) - 14;
    for (let k = 0; k < C.MAX_JUMPS; k++) rect(0, mx - 10 + k * 14, my - 4, 8, 8, 0, k < left ? '#2a7de1' : '#ffffff', INK);
  }
  if (v.end && v.end.trap >= 1) {
    const tx = v.map.length + TRAP_OFFSET - camX;
    trapBar(0, tx, 1);
    if (now % 600 < 400) text(0, 'SNAP!', tx + 10, G - 70, 30, '#e2574c', 'center', '#fff');
  }
  // particles / floating texts
  for (const p of v.fx) {
    const x = p.x - (p.screen ? 0 : camX);
    const a = Math.max(0, 1 - p.age / p.life);
    save(); alpha(a);
    if (p.kind === 'text') text(0, p.text, x, p.y, p.size || 24, p.color || INK, 'center', '#fff');
    else if (p.kind === 'star') star(0, x, p.y, p.r || 6, 0, p.color || '#ffd23f');
    else if (p.kind === 'dot') disc(x, p.y, p.r || 3, p.color || INK);
    restore();
  }
  restore();
  // pixelfx one-shots, in frame pixels
  const dt = Math.min(0.05, Math.max(0, (now - lastNow) / 1000)); lastNow = now;
  const fr = frame();
  if (live.length) fr.light.fill(0);
  for (let i = live.length - 1; i >= 0; i--) {
    const e = live[i];
    e.fx.update(dt);
    e.fx.options.x = Math.round((e.x - (e.screen ? 0 : camX)) * K); e.fx.options.y = Math.round(e.y * K);
    e.fx.draw(fr);
    if (e.fx.done()) live.splice(i, 1);
  }
  const lit = live.length > 0;
  if (v.hud) hudPanel(v, now);
  else { // menus: plain paper strip with the butt for decoration
    box(0, VIEW_H, W, H - VIEW_H, '#fffaf0');
    box(0, VIEW_H, W, 6, INK);
    drawButt(0, W / 2, VIEW_H + 110, v.butt, now, v.lang);
  }
  // what the cat says, next to its head in the bottom panel
  if (v.catSay && !v.leap) {
    const age = now - v.catSay.at;
    bubble(W / 2 + 130, VIEW_H - 26, v.catSay.text, v.catSay.color, v.catSay.hold ? Math.min(age, 300) : age);
  }
  // finale: the cat we've been slapping leaps out of the panel onto the trap
  if (v.leap) {
    const L = v.leap, p = L.p;
    const fromX = W / 2, fromY = VIEW_H + 110, toX = L.trapX - camX, toY = G - 30;
    const e = p < 1 ? p * p * (3 - 2 * p) : 1;
    const x = fromX + (toX - fromX) * e, y = fromY + (toY - fromY) * e - Math.sin(p * Math.PI) * 170;
    const sc = 0.8 + (0.5 - 0.8) * e;
    const wig = L.eat ? Math.sin(L.eat * Math.PI * 2) * 0.12 : 0;
    drawButt(0, x, y + (L.eat ? -Math.abs(Math.sin(L.eat * Math.PI)) * 6 : 0), v.butt, now, v.lang, sc, { fat: L.fat, rot: (p < 1 ? (0.5 - p) * 0.5 : 0) + wig, noHands: true });
  }
  if (v.banner) {
    const age = now - v.banner.at;
    if (age < v.banner.life) {
      const s = age < 120 ? 0.5 + (age / 120) * 0.5 : 1;
      save(); translate(W / 2, 150); scale(s, s);
      text(0, v.banner.text, 0, 0, v.banner.size || 64, v.banner.color || INK, 'center', '#fff');
      if (v.banner.sub) text(0, v.banner.sub, 0, 52, 26, INK, 'center', '#fff');
      restore();
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  present(ctx, ctx.canvas.width, ctx.canvas.height, lit, composite);
}

// market preview: the cat's behind and the running mouse in their own small frame (520 x 440 units)
const PREV = createFrame(260, 220);
export function renderPreview(ctx, cat, mouse, now, lang) {
  target(PREV);
  PREV.color.fill(0);
  drawButt(0, 260, 220, { left: -1e6, right: -1e6, rightHeld: false }, now, lang, 1.15, { cat });
  save(); translate(190, 425); scale(3, 3);
  drawMouse(0, 0, 0, { t: now, pal: mouse });
  restore();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  present(ctx, ctx.canvas.width, ctx.canvas.height, false);
  target(main);
}

export { drawCheese, PW, PH };
