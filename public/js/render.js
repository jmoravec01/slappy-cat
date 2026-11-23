// Scene rendering: themes, world, mouse, cat, trap, HUD with the slappable butt.
import { C } from '../shared/sim.js';
import { S, setBoil, hash, line, poly, rect, ellipse, hatch, curve, text, star } from './sketch.js';

export const W = 960, H = 540, VIEW_H = 360;
const G = C.GROUND_Y;
const INK = '#2b2b2b';
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

// ---------------- background ----------------
function paper(ctx, th, x = 0, w = W) {
  ctx.fillStyle = th.bg; ctx.fillRect(x, 0, w, VIEW_H);
  ctx.strokeStyle = th.night ? 'rgba(255,255,255,0.06)' : 'rgba(70,110,200,0.10)';
  ctx.lineWidth = 1; ctx.beginPath();
  for (let y = 24; y < VIEW_H; y += 24) { ctx.moveTo(x, y); ctx.lineTo(x + w, y); }
  ctx.stroke();
}

const SP = 260; // width of one decor slot
function decor(ctx, th, camX, t) {
  const par = camX * 0.3;
  const i0 = Math.floor(par / SP) - 1;
  for (let i = i0; i < i0 + W / SP + 3; i++) decorSlot(ctx, th, i, i * SP - par, t);
}

function decorSlot(ctx, th, i, x, t) {
  const sp = SP, r = hash(i * 17 + 3), r2 = hash(i * 31 + 7);
  {
    switch (th.decor) {
      case 'tiles':
        rect(ctx, x + 20, 70 + r * 60, 70, 70, i, th.far, 'rgba(43,43,43,0.35)', 1.5, 1.4);
        line(ctx, x + 55, 70 + r * 60, x + 55, 140 + r * 60, i + 1, 1, 'rgba(43,43,43,0.3)', 1.2);
        line(ctx, x + 20, 105 + r * 60, x + 90, 105 + r * 60, i + 2, 1, 'rgba(43,43,43,0.3)', 1.2);
        break;
      case 'frames':
        rect(ctx, x + 30, 60 + r * 50, 80 + r2 * 40, 60, i, th.far, 'rgba(43,43,43,0.5)', 1.5, 1.6);
        curve(ctx, [[x + 40, 110 + r * 50], [x + 70, 80 + r * 50], [x + 100, 105 + r * 50]], i, 'rgba(43,43,43,0.35)', 1.4);
        break;
      case 'hills':
        ellipse(ctx, x + 130, G + 10, 190, 90 + r * 50, i, th.far, 'rgba(43,43,43,0.3)', 3, 1.4);
        ellipse(ctx, x + 60 + r2 * 100, 60 + r * 40, 40, 16, i + 5, '#ffffff', 'rgba(43,43,43,0.25)', 2, 1.2);
        break;
      case 'bricks':
        for (let k = 0; k < 3; k++) rect(ctx, x + 20 + k * 70 + (k % 2) * 20, 60 + r * 120 + k * 22, 60, 22, i * 5 + k, th.far, 'rgba(43,43,43,0.25)', 1.5, 1.2);
        break;
      case 'night': {
        for (let k = 0; k < 3; k++) {
          const sx = x + hash(i * 9 + k) * sp, sy = 20 + hash(i * 13 + k) * 140;
          star(ctx, sx, sy, 3 + hash(i + k) * 3 + ((t / 300 + k + i) % 3 < 0.4 ? 2 : 0), i * 7 + k, '#fff6c2');
        }
        rect(ctx, x + 20, G - 90 - r * 90, 120, 200, i, th.far, 'rgba(0,0,0,0.25)', 1.5, 1.4);
        for (let k = 0; k < 4; k++) if (hash(i * 3 + k) > 0.4) rect(ctx, x + 35 + (k % 2) * 55, G - 70 - r * 90 + Math.floor(k / 2) * 40, 25, 22, i * 4 + k, 'rgba(255,224,138,0.45)', null);
        break;
      }
      case 'bubbles':
        ellipse(ctx, x + r * sp, 60 + ((r2 * 200 - t * 0.02 + i * 40) % 250 + 250) % 250, 10 + r * 14, 10 + r * 14, i, 'rgba(255,255,255,0.6)', 'rgba(70,140,160,0.5)', 1, 1.4);
        break;
      case 'rafters':
        line(ctx, x, 0, x + 120, 120, i, 2, th.far, 10);
        line(ctx, x + 240, 0, x + 120, 120, i + 1, 2, th.far, 10);
        break;
      case 'city':
        rect(ctx, x + 10, G - 120 - r * 120, 100 + r2 * 60, 260, i, th.far, 'rgba(43,43,43,0.25)', 1.5, 1.4);
        for (let k = 0; k < 6; k++) rect(ctx, x + 25 + (k % 3) * 28, G - 100 - r * 120 + Math.floor(k / 3) * 36, 16, 20, i * 6 + k, hash(i * 6 + k) > 0.5 ? '#fff1b8' : 'rgba(255,255,255,0.4)', null);
        break;
      case 'holes': { // pipes and gauges of the cheese factory, kept pale so they don't look like pickups
        const gx = x + r * 120, gy = 50 + r2 * 120;
        line(ctx, x, gy + 40, x + sp, gy + 40, i, 1.5, th.far, 8);
        ellipse(ctx, gx + 40, gy + 40, 22, 22, i + 1, '#fffdf2', 'rgba(154,116,20,0.5)', 1, 1.6);
        line(ctx, gx + 40, gy + 40, gx + 40 + 12 * Math.cos(t / 700 + i), gy + 40 - 12 * Math.abs(Math.sin(t / 700 + i)), i + 2, 0.3, '#c0392b', 1.6);
        break;
      }
      case 'barn': // plank wall and a little window
        for (let k = 0; k < 4; k++) line(ctx, x + k * 65, 0, x + k * 65, G, i * 4 + k, 1, 'rgba(120,70,30,0.25)', 1.4);
        if (r > 0.4) { rect(ctx, x + 90, 50 + r2 * 40, 70, 56, i, '#d4ecff', 'rgba(43,43,43,0.4)', 1.5, 1.6); line(ctx, x + 125, 50 + r2 * 40, x + 125, 106 + r2 * 40, i + 1, 1, 'rgba(43,43,43,0.35)', 1.4); }
        break;
      case 'doors': // tower-block corridor: oil-painted lower wall, flat doors
        ctx.fillStyle = th.far; ctx.globalAlpha = 0.45; ctx.fillRect(x, 150, sp, G - 150); ctx.globalAlpha = 1;
        rect(ctx, x + 70, G - 150, 74, 150, i, '#d9c3a0', 'rgba(43,43,43,0.4)', 1.5, 1.6);
        ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x + 132, G - 75, 3, 0, Math.PI * 2); ctx.fill();
        text(ctx, String(1 + ((i % 40) + 40) % 40), x + 107, G - 128, 16, 'rgba(43,43,43,0.6)');
        break;
      case 'laundry': // washing line with clothes
        curve(ctx, [[x, 60], [x + 130, 82], [x + sp, 60]], i, 'rgba(43,43,43,0.4)', 1.4);
        for (let k = 0; k < 3; k++) {
          const cx = x + 40 + k * 75, cy = 64 + Math.sin((k + 0.5) / 3 * Math.PI) * 18;
          const w = 30 + hash(i * 3 + k) * 12, h = 34 + hash(i * 5 + k) * 18; // a T-shirt on pegs
          poly(ctx, [[cx, cy], [cx + w * 0.32, cy], [cx + w / 2, cy + 6], [cx + w * 0.68, cy], [cx + w, cy], [cx + w + 7, cy + h * 0.3], [cx + w * 0.82, cy + h * 0.36], [cx + w * 0.82, cy + h], [cx + w * 0.18, cy + h], [cx + w * 0.18, cy + h * 0.36], [cx - 7, cy + h * 0.3]], i * 3 + k, PASTEL[(i * 3 + k + 60) % 6], 'rgba(43,43,43,0.3)', 1.2, 1.2);
        }
        break;
      case 'market': { // striped awning over a fruit stand
        const ay = 70 + r * 40;
        for (let k = 0; k < 6; k++) { ctx.fillStyle = k % 2 ? th.far : '#fffaf0'; ctx.fillRect(x + 30 + k * 30, ay, 30, 30); }
        rect(ctx, x + 30, ay, 180, 30, i, null, 'rgba(43,43,43,0.35)', 1.5, 1.4);
        for (let k = 0; k < 5; k++) ellipse(ctx, x + 55 + k * 32, ay + 70, 12, 11, i * 5 + k, PASTEL[(i + k + 60) % 6], 'rgba(43,43,43,0.3)', 1, 1.2);
        break;
      }
      case 'metro': // tiled band with the line sign
        ctx.fillStyle = th.far; ctx.globalAlpha = 0.6; ctx.fillRect(x, 70, sp, 80); ctx.globalAlpha = 1;
        if (r > 0.45) { rect(ctx, x + 100, 88, 44, 44, i, '#e53935', INK, 1, 1.6); text(ctx, 'M', x + 122, 111, 30, '#fff'); }
        break;
      case 'columns': // marble columns and the odd chandelier
        rect(ctx, x + 40, 20, 44, G - 20, i, th.far, 'rgba(43,43,43,0.25)', 1.5, 1.4);
        for (let k = 1; k < 4; k++) line(ctx, x + 40 + k * 11, 30, x + 40 + k * 11, G - 10, i * 4 + k, 0.8, 'rgba(43,43,43,0.15)', 1.2);
        if (r > 0.5) {
          line(ctx, x + 170, 0, x + 170, 40, i, 0.5, 'rgba(43,43,43,0.4)', 1.4);
          curve(ctx, [[x + 135, 46], [x + 170, 64], [x + 205, 46]], i + 1, '#c9a85c', 3);
          for (let k = 0; k < 3; k++) ellipse(ctx, x + 140 + k * 30, 40, 4, 7, i + k, '#fff6c2', 'rgba(43,43,43,0.3)', 0.5, 1);
        }
        break;
      case 'books': { // bookshelf rows
        ctx.globalAlpha = 0.55;
        for (let row = 0; row < 3; row++) {
          const by = 70 + row * 62;
          for (let bx = 8; bx < sp - 16; bx += 13) { ctx.fillStyle = PASTEL[(bx + row + i * 7 + 600) % 6]; ctx.fillRect(x + bx, by - 30 - hash(i * 31 + bx + row) * 14, 11, 44 + hash(i * 31 + bx + row) * 14 - 14); }
          ctx.fillStyle = th.far; ctx.fillRect(x, by + 14, sp, 6);
        }
        ctx.globalAlpha = 1;
        break;
      }
      case 'pool': // big window with a palm
        rect(ctx, x + 40, 40, 150, 110, i, '#d6f3ff', 'rgba(43,43,43,0.3)', 1.5, 1.4);
        if (r > 0.4) { curve(ctx, [[x + 115, 150], [x + 112, 110], [x + 120, 75]], i, '#9b6b3f', 4); for (const s of [-1, 1]) curve(ctx, [[x + 120, 75], [x + 120 + s * 22, 66], [x + 120 + s * 38, 80]], i + s + 3, '#4caf50', 3); }
        break;
      case 'crowns': {
        const cx = x + r * 200, cy = 60 + r2 * 120;
        poly(ctx, [[cx - 22, cy + 12], [cx - 22, cy - 10], [cx - 11, cy], [cx, cy - 16], [cx + 11, cy], [cx + 22, cy - 10], [cx + 22, cy + 12]], i, th.far, 'rgba(43,43,43,0.35)', 1, 1.4);
        break;
      }
    }
  }
}

// The background (paper + decor) is drawn once into narrow tiles, one set per pencil "boil" frame, and then only
// copied: most of a frame's drawing was background. Animated decor (stars, bubbles, gauges) stays live.
const TILE = 120, LIVE = new Set(['night', 'bubbles', 'holes']), tiles = new Map();
function tileFor(th, j, boil, px) {
  const key = th.decor + th.bg + '|' + j + '|' + boil + '|' + px;
  let c = tiles.get(key);
  if (c) { tiles.delete(key); tiles.set(key, c); return c; } // keep recently used at the end
  c = document.createElement('canvas');
  c.width = Math.round(TILE * px); c.height = Math.round(VIEW_H * px);
  const t = c.getContext('2d', { alpha: false }); // opaque: copying it needs no blending
  t.scale(c.width / TILE, c.height / VIEW_H);
  t.translate(-j * TILE, 0);
  paper(t, th, j * TILE, TILE);
  t.beginPath(); t.rect(j * TILE, 0, TILE, VIEW_H); t.clip();
  const saved = S.boil; S.boil = boil;
  for (let i = Math.floor((j * TILE - SP - 100) / SP); i * SP < (j + 1) * TILE + 100; i++) decorSlot(t, th, i, i * SP, 0);
  S.boil = saved;
  tiles.set(key, c);
  if (tiles.size > 40) tiles.delete(tiles.keys().next().value);
  return c;
}

function background(ctx, th, camX, t) {
  if (LIVE.has(th.decor)) { paper(ctx, th); decor(ctx, th, camX, t); return; }
  const m = ctx.getTransform(), par = camX * 0.3;
  const px = Math.min(2, Math.round(m.a * 4) / 4); // tile resolution follows the canvas, capped to save memory
  ctx.setTransform(1, 0, 0, 1, 0, 0); // draw in device pixels so neighbouring tiles meet without seams
  const top = Math.round(m.f), bottom = Math.round(m.f + VIEW_H * m.d);
  for (let j = Math.floor(par / TILE); j * TILE - par < W; j++) {
    const x0 = Math.round(m.e + (j * TILE - par) * m.a), x1 = Math.round(m.e + ((j + 1) * TILE - par) * m.a);
    ctx.drawImage(tileFor(th, j, S.boil, px), x0, top, x1 - x0, bottom - top);
  }
  ctx.setTransform(m);
}

// ---------------- world objects ----------------
function drawGround(ctx, map, th, camX) {
  if (th.water) { // water at the bottom of every pit
    ctx.fillStyle = th.water; ctx.fillRect(0, G + 26, W, VIEW_H - G - 26);
    curve(ctx, [[0, G + 26], [W / 4, G + 22], [W / 2, G + 28], [W * 3 / 4, G + 22], [W, G + 26]], 7, 'rgba(255,255,255,0.7)', 2);
  }
  for (let gi = 0; gi < map.ground.length; gi++) {
    const [x1, x2] = map.ground[gi];
    if (x2 < camX - 20 || x1 > camX + W + 20) continue;
    const a = Math.max(x1, camX - 30), b = Math.min(x2, camX + W + 30);
    const sx = a - camX, w = b - a;
    ctx.fillStyle = th.ground; ctx.fillRect(sx, G, w, VIEW_H - G);
    hatch(ctx, sx, G + 8, w, VIEW_H - G, 'rgba(0,0,0,0.15)', 12, gi);
    line(ctx, sx, G, sx + w, G, gi * 3 + 1, 1.2, INK, 2.6);
    ctx.fillStyle = th.top; ctx.fillRect(sx, G + 1, w, 5);
    if (x1 >= camX - 30) line(ctx, x1 - camX, G, x1 - camX, VIEW_H, gi * 3 + 2, 1.2);
    if (x2 <= camX + W + 30) line(ctx, x2 - camX, G, x2 - camX, VIEW_H, gi * 3 + 3, 1.2);
    if (th.decor === 'hills') { // grass tufts
      for (let x = Math.ceil(a / 47) * 47; x < b; x += 47) {
        const gx = x - camX;
        line(ctx, gx, G, gx - 4, G - 8, x, 1, '#3f8f3a', 1.6); line(ctx, gx + 3, G, gx + 5, G - 9, x + 1, 1, '#3f8f3a', 1.6);
      }
    }
  }
}

function drawSolid(ctx, o, th, camX, i) {
  const x = o.x - camX;
  if (x > W + 10 || x + o.w < -10) return;
  const kind = o.kind;
  if (kind === 'beam') {
    const y0 = Math.max(o.y, -5), h = o.y + o.h - y0;
    rect(ctx, x, y0, o.w, h, i, th.beam);
    for (let px = 22; px < o.w - 6; px += 26) line(ctx, x + px, y0 + 4, x + px, y0 + h - 14, i * 31 + px, 1, 'rgba(0,0,0,0.25)', 1.4);
    // warning stripes on the lower edge
    ctx.save(); ctx.beginPath(); ctx.rect(x + 2, y0 + h - 12, o.w - 4, 10); ctx.clip();
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(x, y0 + h - 12, o.w, 10);
    ctx.fillStyle = INK;
    for (let sx = -10; sx < o.w; sx += 18) { ctx.beginPath(); ctx.moveTo(x + sx, y0 + h); ctx.lineTo(x + sx + 8, y0 + h - 12); ctx.lineTo(x + sx + 16, y0 + h - 12); ctx.lineTo(x + sx + 8, y0 + h); ctx.fill(); }
    ctx.restore();
    line(ctx, x, y0 + h - 12, x + o.w, y0 + h - 12, i + 5, 1, INK, 1.6);
  } else if (kind === 'pipe') {
    const top = o.y === 0;
    const y0 = top ? -5 : o.y, y1 = top ? o.y + o.h : Math.min(o.y + o.h, VIEW_H + 5);
    rect(ctx, x + 4, y0, o.w - 8, y1 - y0, i, th.pipe);
    line(ctx, x + 14, y0 + 6, x + 14, y1 - 6, i + 3, 1, 'rgba(255,255,255,0.6)', 3);
    if (th.decor === 'night') for (let by = (top ? y1 - 20 : y0 + 26); top ? by > y0 : by < y1; by += top ? -18 : 18) line(ctx, x + 6, by, x + o.w - 6, by, i * 7 + by, 0.8, 'rgba(0,0,0,0.3)', 1.2);
    const ly = top ? y1 - 18 : y0;
    rect(ctx, x - 2, ly, o.w + 4, 18, i + 9, th.pipe);
  } else if (kind === 'ledge') {
    rect(ctx, x, o.y, o.w, o.h, i, th.box);
    hatch(ctx, x, o.y, o.w, o.h, 'rgba(0,0,0,0.2)', 8, i);
    line(ctx, x + 10, o.y + o.h, x + 18, o.y + o.h + 14, i + 1, 1, INK, 1.6);
    line(ctx, x + o.w - 10, o.y + o.h, x + o.w - 18, o.y + o.h + 14, i + 2, 1, INK, 1.6);
  } else { // crate
    rect(ctx, x, o.y, o.w, o.h, i, th.box);
    hatch(ctx, x, o.y, o.w, o.h, 'rgba(0,0,0,0.12)', 10, i);
    rect(ctx, x + 5, o.y + 5, o.w - 10, o.h - 10, i + 77, null, 'rgba(0,0,0,0.45)', 1, 1.4);
  }
}

function drawSpike(ctx, s, th, camX, i) {
  const x = s.x - camX;
  if (x > W + 10 || x + s.w < -10) return;
  const pts = s.dir === 'down'
    ? [[x, s.y], [x + s.w, s.y], [x + s.w / 2, s.y + s.h]]
    : [[x, s.y + s.h], [x + s.w / 2, s.y], [x + s.w, s.y + s.h]];
  poly(ctx, pts, i * 3 + 1, th.spike, INK, 1, 2);
  const tipY = s.dir === 'down' ? s.y + s.h - 7 : s.y + 7;
  line(ctx, x + s.w / 2, tipY, x + s.w / 2 + 2, tipY + (s.dir === 'down' ? -10 : 10), i, 0.5, '#d33', 2);
}

// crumpled foil ball; rot = how far it has rolled (radians)
function drawFoil(ctx, x, by, rot, seed) {
  const R = C.FOIL / 2, cx = x + R, cy = by - R, pts = [];
  for (let k = 0; k < 11; k++) {
    const a = rot + (k / 11) * Math.PI * 2, rr = R * (0.82 + hash(seed * 11 + k) * 0.3);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  poly(ctx, pts, seed, '#cfd6de', INK, 0.6, 1.8);
  for (let k = 0; k < 3; k++) { // crinkles + a shine
    const a = rot + k * 2.1 + hash(seed + k) * 0.6;
    line(ctx, cx + Math.cos(a) * R * 0.15, cy + Math.sin(a) * R * 0.15, cx + Math.cos(a + 0.5) * R * 0.75, cy + Math.sin(a + 0.5) * R * 0.75, seed * 3 + k, 0.4, 'rgba(43,43,43,0.45)', 1.1);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(cx - R * 0.35, cy - R * 0.4, 2.2, 0, Math.PI * 2); ctx.fill();
}

function drawFoils(ctx, map, sim, camX) {
  if (!map.movers) return;
  for (let j = 0; j < map.movers.length; j++) {
    const m = map.movers[j], b = j * 4;
    const x = sim ? sim.mv[b] : m.x, by = sim ? sim.mv[b + 1] : m.y, sx = x - camX;
    if (sx < -40 || sx > W + 40 || by > VIEW_H + C.FOIL) continue;
    if (by < G - 4) { // in the air: a shadow on the floor shows where it will land
      const k = Math.max(0.25, 1 - (G - by) / 340);
      ctx.fillStyle = `rgba(0,0,0,${0.25 * k})`; ctx.beginPath(); ctx.ellipse(sx + C.FOIL / 2, G - 2, 13 * k, 4 * k, 0, 0, Math.PI * 2); ctx.fill();
    }
    if (by > -C.FOIL) drawFoil(ctx, sx, by, (x - m.x) / (C.FOIL / 2), j + 1);
  }
}

function drawCheese(ctx, x, y, gold, seed, t, scale = 1) {
  const b = t ? Math.sin(t / 220 + seed) * 3 : 0;
  y += b;
  const s = 13 * scale;
  if (gold && t) {
    ctx.fillStyle = 'rgba(255,215,64,0.35)';
    ctx.beginPath(); ctx.arc(x, y, s * 1.8, 0, Math.PI * 2); ctx.fill();
  }
  poly(ctx, [[x - s, y + s * 0.7], [x + s, y + s * 0.7], [x + s, y - s * 0.2], [x - s * 0.6, y - s * 0.8]], seed, gold ? '#ffb300' : '#ffd84d', INK, 0.8, 1.8);
  ctx.fillStyle = gold ? '#c77d00' : '#e3a90c';
  ctx.beginPath(); ctx.arc(x - s * 0.2, y + s * 0.15, s * 0.22, 0, Math.PI * 2); ctx.arc(x + s * 0.5, y - s * 0.05, s * 0.15, 0, Math.PI * 2); ctx.fill();
  if (gold) star(ctx, x + s, y - s, 5 + Math.sin(t / 120) * 2, seed + 3, '#fff6b0');
}

const TOUCH_SIGNS = {
  cs: [['(A / ←)', '(ťuk vlevo)'], ['(D / →)', '(drž prst vpravo)'], ['(A A A)', '(ťuk ťuk ťuk vlevo)']],
  en: [['(A / ←)', '(tap left)'], ['(D / →)', '(hold finger right)'], ['(A A A)', '(tap tap tap left)']],
};
// salmon: the special yummy (3 per map). Jumps around and sparkles.
// the rare goldfish: pops in with a burst, then shimmers
function drawGoldfish(ctx, x, y, t, age) {
  const pop = age < 300 ? age / 300 : 1, bob = Math.sin(t / 200) * 4;
  ctx.save(); ctx.translate(x, y + bob); ctx.scale(pop, pop); ctx.rotate(Math.sin(t / 300) * 0.2);
  ctx.fillStyle = `rgba(255,210,63,${0.35 + 0.2 * Math.sin(t / 120)})`; ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fill();
  poly(ctx, [[-14, 0], [-30, -14], [-24, 0], [-30, 14]], 71, '#ff9f1c', INK, 0.6, 1.8); // flowing tail
  ellipse(ctx, 0, 0, 17, 12, 72, '#ffb300', INK, 0.8, 2);
  poly(ctx, [[-4, -11], [4, -19], [9, -10]], 73, '#ff9f1c', INK, 0.4, 1.4);
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(9, -3, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(10, -3, 2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  for (let k = 0; k < 3; k++) star(ctx, x + Math.cos(t / 250 + k * 2.1) * 30, y + bob + Math.sin(t / 250 + k * 2.1) * 22, 3 + 2 * Math.abs(Math.sin(t / 150 + k)), 74 + k, '#fff6b0');
}

export function drawSalmon(ctx, x, y, seed, t, scale = 1) {
  const hop = t ? Math.abs(Math.sin(t / 260 + seed)) * -6 : 0;
  const tilt = t ? Math.sin(t / 260 + seed) * 0.25 : -0.15;
  ctx.save(); ctx.translate(x, y + hop); ctx.rotate(tilt); ctx.scale(scale, scale);
  if (t) {
    const g = 0.25 + 0.15 * Math.sin(t / 150 + seed);
    ctx.fillStyle = `rgba(255,140,105,${g})`;
    ctx.beginPath(); ctx.arc(0, 0, 28, 0, Math.PI * 2); ctx.fill();
  }
  poly(ctx, [[-16, 0], [-28, -11], [-25, 0], [-28, 11]], seed + 1, '#f26d50', INK, 0.6, 1.8); // tail
  ellipse(ctx, 0, 0, 19, 10, seed + 2, '#ff8c69', INK, 0.8, 2);
  ctx.save(); ctx.beginPath(); ctx.ellipse(0, 0, 18, 9, 0, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#ffd0bf'; ctx.fillRect(-20, 2, 40, 10);                 // belly
  for (const sx of [-8, -1, 6]) line(ctx, sx, -8, sx + 3, 2, seed + sx, 0.4, '#d9503a', 1.6); // stripes
  ctx.restore();
  poly(ctx, [[-4, -9], [3, -15], [8, -8]], seed + 3, '#f26d50', INK, 0.4, 1.4); // fin
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(12, -2, 2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  if (t) {
    star(ctx, x + 18 + Math.sin(t / 200) * 4, y - 16 + hop, 4 + 2 * Math.abs(Math.sin(t / 170)), seed + 5, '#fff6b0');
    star(ctx, x - 20, y + 12 + hop, 3 + 2 * Math.abs(Math.cos(t / 190)), seed + 6, '#fff6b0');
  }
}

function drawSign(ctx, sg, lang, camX, touch) {
  const x = sg.x - camX;
  if (x < -300 || x > W + 300) return;
  let str = sg[lang] || sg.cs;
  if (touch) for (const [a, b] of TOUCH_SIGNS[lang] || []) str = str.replace(a, b);
  const SPEED = { '>>>': ['RYCHLE! >>>', 'FAST! >>>'], '<<': ['<< POMALU', '<< SLOW'], '=': ['NORMÁLNÍ RYCHLOST', 'NORMAL SPEED'] };
  if (SPEED[str]) str = SPEED[str][lang === 'cs' ? 0 : 1];
  ctx.font = '20px "Patrick Hand", cursive';
  const w = Math.max(50, ctx.measureText(str).width + 26);
  line(ctx, x, G, x, G - 130, sg.x, 1, INK, 3);
  rect(ctx, x - w / 2, G - 170, w, 40, sg.x + 1, '#fff7d6');
  text(ctx, str, x, G - 150, 20);
}

function drawFinish(ctx, map, camX, t, trapClose) {
  const fx = map.length + C.MOUSE_W - camX;
  if (fx < W + 40 && fx > -60) {
    line(ctx, fx, G, fx, G - 120, 5, 1, INK, 3);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
      const wave = Math.sin(t / 150 + c) * 3;
      ctx.fillStyle = (r + c) % 2 ? INK : '#fff';
      ctx.fillRect(fx + c * 12, G - 120 + r * 10 + wave, 12, 10);
    }
    rect(ctx, fx, G - 120, 48, 30, 6, null, INK, 1, 1.6);
  }
  const tx = map.length + TRAP_OFFSET - camX;
  if (tx > W + 120 || tx < -160) return;
  drawTrap(ctx, tx, trapClose, t);
}

export function drawTrap(ctx, tx, close, t) {
  // board
  rect(ctx, tx - 50, G - 14, 100, 14, 11, '#d9a066');
  hatch(ctx, tx - 50, G - 14, 100, 14, 'rgba(120,70,20,0.3)', 7, 12);
  // spring coil
  ellipse(ctx, tx, G - 16, 8, 6, 13, '#c7ccd3', INK, 0.6, 1.6);
  if (close < 0.5) drawCheese(ctx, tx + 26, G - 22, false, 2, t, 0.7);
  if (close < 1) trapBar(ctx, tx, close);
}

// the snapping bar; drawn again over the mouse once the trap has closed
export function trapBar(ctx, tx, close) {
  // bar rotates around (tx, G-14) from lying left (open) to lying right (closed)
  const ang = Math.PI - close * Math.PI; // PI = left, 0 = right
  const len = 44;
  const ex = tx + Math.cos(ang) * len, ey = G - 14 - Math.sin(ang) * len * 0.9 - 2;
  line(ctx, tx, G - 16, ex, ey, 14, 0.6, '#7d838b', 3.2);
  line(ctx, ex, ey, ex, ey - (close > 0 && close < 1 ? 6 : 0), 15, 0.4, '#7d838b', 3.2);
}

// ---------------- characters ----------------
export function drawMouse(ctx, x, by, o = {}) {
  const h = o.duck ? C.DUCK_H : C.MOUSE_H;
  const t = o.t || 0;
  const alpha = o.alpha ?? 1;
  ctx.save(); ctx.globalAlpha = alpha;
  const body = o.ghost ? '#9fc3ff' : (o.pal || SKIN.mouse)?.hex || '#b8b2c8', ear = o.ghost ? '#cfe0ff' : '#f7a1b5', ink = o.ghost ? '#3d5a8c' : INK;
  const seed = o.ghost ? 900 : 100;
  const cy = by - h / 2 - 1;
  const phase = Math.floor(t / 70) % 4;
  // tail
  curve(ctx, [[x + 2, cy + 2], [x - 10, cy - 4 + (phase % 2) * 4], [x - 20, cy + 2], [x - 26, cy - 8]], seed + 1, ear, 2.2);
  // legs
  if (!o.dead) {
    const air = o.air;
    const l1 = air ? 4 : [0, 5, 0, -5][phase], l2 = air ? -4 : -l1;
    line(ctx, x + 8, by - 3, x + 8 + l1, by + 1, seed + 2, 0.5, ink, 2);
    line(ctx, x + 22, by - 3, x + 22 + l2, by + 1, seed + 3, 0.5, ink, 2);
  }
  // body
  ellipse(ctx, x + 14, cy, 16, Math.max(7, h / 2 + 1), seed + 4, body, ink, 1, 2);
  // head
  const hx = x + 28, hy = o.duck ? by - 8 : cy - 4;
  ellipse(ctx, hx, hy, 10, 9, seed + 5, body, ink, 0.8, 2);
  ellipse(ctx, hx - 4, hy - (o.duck ? 7 : 10), 6, 6, seed + 6, ear, ink, 0.6, 1.8);
  // nose + eye
  ctx.fillStyle = '#ff6f91'; ctx.beginPath(); ctx.arc(hx + 10, hy + 1, 2.6, 0, Math.PI * 2); ctx.fill();
  if (o.dead) {
    line(ctx, hx + 1, hy - 5, hx + 6, hy, seed + 7, 0.3, ink, 1.6); line(ctx, hx + 6, hy - 5, hx + 1, hy, seed + 8, 0.3, ink, 1.6);
  } else {
    ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(hx + 3, hy - 2, o.scared ? 2.6 : 1.8, 0, Math.PI * 2); ctx.fill();
  }
  // whiskers
  line(ctx, hx + 9, hy + 2, hx + 18, hy - 1, seed + 9, 0.4, ink, 1);
  line(ctx, hx + 9, hy + 3, hx + 18, hy + 5, seed + 10, 0.4, ink, 1);
  ctx.restore();
}

function bubble(ctx, x, y, str, color, seed, age) {
  if (age > 650) return;
  const pop = age < 90 ? 0.6 + (age / 90) * 0.5 : 1.1 - Math.min(0.1, (age - 90) / 900);
  ctx.save(); ctx.translate(x, y); ctx.scale(pop, pop);
  ctx.font = '26px "Patrick Hand", cursive';
  const w = ctx.measureText(str).width + 24;
  ellipse(ctx, 0, 0, w / 2 + 4, 22, seed, '#fff', INK, 1.5, 2);
  poly(ctx, [[-10, 16], [-22, 34], [2, 19]], seed + 1, '#fff', null);
  line(ctx, -10, 18, -22, 34, seed + 2, 0.5, INK, 2); line(ctx, -22, 34, 1, 20, seed + 3, 0.5, INK, 2);
  text(ctx, str, 0, 1, 26, color);
  ctx.restore();
}

// ---------------- HUD: the cat's behind ----------------
function wobble(age) {
  if (age > 700) return 0;
  const tt = age / 1000;
  return Math.sin(tt * 38) * Math.exp(-tt * 7);
}

function hand(ctx, cx, cy, alpha, flip, seed) {
  if (alpha <= 0) return;
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(cx, cy); ctx.rotate(flip ? 0.35 : -0.35); if (flip) ctx.scale(-1, 1);
  const c = '#e23d55';
  ellipse(ctx, 0, 6, 15, 17, seed, c, null);
  const f = [[-13, -8, 4, 12, -0.5], [-6, -17, 4, 13, -0.15], [2, -19, 4, 13, 0], [10, -15, 4, 12, 0.2], [17, 2, 4, 10, 1.0]];
  ctx.fillStyle = c;
  for (const [x, y, rx, ry, r] of f) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, r, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

export function drawButt(ctx, bx, by, st, now, lang, scale = 0.8, o = {}) {
  ctx.save(); ctx.translate(bx, by);
  if (o.rot) ctx.rotate(o.rot);
  ctx.scale(scale * (1 + (o.fat || 0) * 0.35), scale * (1 - (o.fat || 0) * 0.05));
  drawButtInner(ctx, 0, 0, st, now, o);
  ctx.restore();
}

// a cartoon hand (skin + sleeve) seen from the palm side, fingers pointing up
function slapHand(ctx, x, y, s, rot, alpha, seed) {
  if (alpha <= 0) return;
  ctx.save(); ctx.globalAlpha = Math.min(1, alpha); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
  const skin = '#ffd7b5';
  rect(ctx, -16, 26, 32, 26, seed + 1, '#5b8def', INK, 0.8, 2.2); // sleeve
  for (const [fx, fy, len, r] of [[-15, -6, 20, -0.35], [-6, -16, 26, -0.1], [4, -17, 27, 0.05], [13, -12, 23, 0.2]]) {
    ctx.save(); ctx.translate(fx, fy); ctx.rotate(r);
    ellipse(ctx, 0, -len / 2 + 6, 5.5, len / 2 + 2, seed + fx, skin, INK, 0.5, 2);
    ctx.restore();
  }
  ellipse(ctx, 22, 4, 6, 13, seed + 7, skin, INK, 0.5, 2, 0.9); // thumb
  ellipse(ctx, 0, 8, 19, 21, seed + 8, skin, INK, 0.8, 2.2); // palm
  curve(ctx, [[-8, 6], [0, 12], [8, 8]], seed + 9, 'rgba(160,90,60,0.6)', 1.4);
  ctx.restore();
}

// comic "SLAP!" starburst
function slapBurst(ctx, x, y, age, seed, rot) {
  if (age > 480) return;
  const pop = age < 90 ? 0.4 + (age / 90) * 0.8 : 1.2 - Math.min(0.2, (age - 90) / 400);
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(pop, pop);
  ctx.globalAlpha = age > 360 ? 1 - (age - 360) / 120 : 1;
  const pts = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, rr = i % 2 ? 30 : 52 + hash(seed + i) * 10;
    pts.push([Math.cos(a) * rr * 1.25, Math.sin(a) * rr * 0.8]);
  }
  poly(ctx, pts, seed, '#ffe14d', INK, 1.2, 2.4);
  text(ctx, 'SLAP!', 0, 2, 34, '#e2302f', 'center', '#fff');
  ctx.restore();
}

function drawButtInner(ctx, cx, cy, st, now, o = {}) {
  const pal = o.cat || SKIN.cat, orange = pal ? pal.hex : '#f39c34', dark = pal ? pal.dark : '#c96f1c';
  const la = now - (st.left || -1e6), ra = now - (st.right || -1e6);
  const tailSwish = Math.sin(now / 260) * 12 + (la < 300 ? -20 : 0) + (ra < 300 ? 20 : 0);
  // head (behind)
  poly(ctx, [[cx - 38, cy - 92], [cx - 30, cy - 128], [cx - 10, cy - 102]], 301, orange, INK, 0.8, 2.2);
  poly(ctx, [[cx + 10, cy - 102], [cx + 30, cy - 128], [cx + 38, cy - 92]], 302, orange, INK, 0.8, 2.2);
  poly(ctx, [[cx - 33, cy - 98], [cx - 29, cy - 118], [cx - 18, cy - 102]], 303, '#ffb3c6', null);
  poly(ctx, [[cx + 18, cy - 102], [cx + 29, cy - 118], [cx + 33, cy - 98]], 304, '#ffb3c6', null);
  ellipse(ctx, cx, cy - 86, 42, 34, 305, orange, INK, 1.2, 2.4);
  // body
  ellipse(ctx, cx, cy - 30, 92, 58, 306, orange, INK, 1.5, 2.6);
  for (const s of [-1, 1]) {
    curve(ctx, [[cx + s * 30, cy - 76], [cx + s * 44, cy - 54], [cx + s * 36, cy - 34]], 307 + s, dark, 3);
    curve(ctx, [[cx + s * 60, cy - 60], [cx + s * 72, cy - 40], [cx + s * 66, cy - 22]], 309 + s, dark, 3);
  }
  // paws
  ellipse(ctx, cx - 62, cy + 54, 22, 10, 311, orange, INK, 0.8, 2);
  ellipse(ctx, cx + 62, cy + 54, 22, 10, 312, orange, INK, 0.8, 2);
  // cheeks
  const cheek = (side, age, seed, held) => {
    const w = held ? 0.55 : wobble(age);
    const x = cx + side * 50, y = cy + 14;
    const red = held ? 0.9 : age < 900 ? 1 - age / 900 : 0;
    ctx.save(); ctx.translate(x, y); ctx.scale(1 + w * 0.18, 1 - w * 0.14);
    const col = red > 0 ? mix(orange, '#ff5a5a', red * 0.75) : orange;
    ellipse(ctx, 0, 0, 56, 50, seed, col, INK, 1.4, 2.6);
    curve(ctx, [[side * 14, -30], [side * 30, -20], [side * 34, -2]], seed + 1, dark, 3);
    ctx.restore();
    hand(ctx, x + side * 6, y - 2, held ? 0 : red * 1.2, side > 0, seed + 3);
  };
  cheek(-1, la, 320, false);
  cheek(1, ra, 330, !!st.rightHeld);
  // tail from the top of the crack
  const tx = cx, ty = cy - 30;
  const tip = [cx + 40 + tailSwish, cy - 128];
  curve(ctx, [[tx, ty], [tx + 6 + tailSwish * 0.3, ty - 40], [tip[0] - 20, tip[1] + 20], tip], 340, orange, 13);
  curve(ctx, [[tx, ty], [tx + 6 + tailSwish * 0.3, ty - 40], [tip[0] - 20, tip[1] + 20], tip], 341, INK, 1.6);
  // the slapping hand jumps onto the cheek (and stays there while the right one is held)
  const handAt = (side, age, held, upAge) => {
    const hx = cx + side * 56, hy = cy + 16;
    let p, alpha = 1;
    if (age < 70) p = age / 70;                       // flying in
    else if (held) p = 1;                              // pressing
    else {
      const away = side < 0 ? age - 230 : upAge;      // left leaves on its own, right on release
      if (away < 0) p = 1; else { p = 1 - Math.min(1, away / 140); alpha = p; }
    }
    if (p <= 0) return;
    const fromX = hx + side * 110, fromY = hy - 90;
    const shake = held && age > 70 ? Math.sin(now / 30) * 1.5 : 0;
    slapHand(ctx, fromX + (hx - fromX) * p + shake, fromY + (hy - fromY) * p, 1.25 - p * 0.25, side * (0.5 - p * 0.3), alpha, 360 + side * 20);
  };
  if (!o.noHands) {
    handAt(-1, la, false, 0);
    handAt(1, now - (st.right || -1e6), !!st.rightHeld, st.rightUp ? now - st.rightUp : 1e6);
    slapBurst(ctx, cx - 150, cy - 70, la, 380, -0.2);
    slapBurst(ctx, cx + 150, cy - 70, now - (st.right || -1e6), 390, 0.2);
  }
  // impact stars
  if (o.noHands) return;
  for (const [age, side] of [[la, -1], [ra, 1]]) {
    if (age < 260) {
      const p = age / 260;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + side;
        star(ctx, cx + side * 50 + Math.cos(a) * (40 + p * 40), cy + 10 + Math.sin(a) * (30 + p * 30), 8 * (1 - p) + 2, 350 + i, '#ffd23f');
      }
    }
  }
}

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return `rgb(${r},${g},${bl})`;
}

function keycap(ctx, x, y, label, seed) {
  ctx.font = '20px "Patrick Hand", cursive';
  const w = Math.max(34, ctx.measureText(label).width + 16);
  rect(ctx, x - w / 2, y - 16, w, 32, seed, '#fff', INK, 1, 2);
  text(ctx, label, x, y, 20);
}

function cushion(ctx, x, y) {
  ellipse(ctx, x, y, 82, 22, 470, '#c84f7d', INK, 1.5, 2.4);
  ellipse(ctx, x, y - 5, 68, 12, 471, '#e0719a', null);
  for (const s of [-1, 1]) star(ctx, x + s * 78, y - 2, 6, 472 + s, '#ffd23f');
}

function hudPanel(ctx, v, now) {
  const L = v.lang;
  // torn paper strip
  ctx.fillStyle = '#fffaf0';
  ctx.beginPath(); ctx.moveTo(0, VIEW_H + 6);
  for (let x = 0; x <= W; x += 24) ctx.lineTo(x, VIEW_H + 4 + hash(x) * 6);
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(70,110,200,0.12)'; ctx.lineWidth = 1; ctx.beginPath();
  for (let y = VIEW_H + 30; y < H; y += 24) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
  line(ctx, 0, VIEW_H + 5, W, VIEW_H + 5, 400, 1.5, INK, 2.4);
  line(ctx, 60, VIEW_H + 8, 60, H, 401, 1, 'rgba(226,87,76,0.45)', 1.6);

  if (v.leap) cushion(ctx, W / 2, VIEW_H + 150);
  else drawButt(ctx, W / 2, VIEW_H + 110, v.butt, now, L);
  // controls hints next to the cheeks
  const touch = v.touch;
  keycap(ctx, W / 2 - 160, VIEW_H + 120, touch ? (L === 'cs' ? '← ťuk' : '← tap') : 'A / ←', 410);
  text(ctx, L === 'cs' ? 'SKOK ↑' : 'JUMP ↑', W / 2 - 160, VIEW_H + 156, 22, '#2a7de1');
  keycap(ctx, W / 2 + 160, VIEW_H + 120, touch ? (L === 'cs' ? 'drž →' : 'hold →') : 'D / →', 411);
  text(ctx, L === 'cs' ? 'DRŽ = PODLEZ ↓' : 'HOLD = DUCK ↓', W / 2 + 160, VIEW_H + 156, 20, '#e2574c');

  // left: map + progress
  if (v.map) {
    text(ctx, `${v.map.id}. ${v.map.name[L]}`, 80, VIEW_H + 40, 28, INK, 'left');
    const p = Math.max(0, Math.min(1, (v.sim ? v.sim.x : 0) / v.map.length));
    rect(ctx, 80, VIEW_H + 66, 200, 18, 420, '#fff');
    if (p > 0) { ctx.fillStyle = '#7bc142'; ctx.fillRect(83, VIEW_H + 69, 194 * p, 12); }
    if (v.bestProgress) line(ctx, 83 + 194 * v.bestProgress, VIEW_H + 62, 83 + 194 * v.bestProgress, VIEW_H + 88, 421, 0.5, '#e2574c', 2);
    text(ctx, `${Math.floor(p * 100)} %`, 290, VIEW_H + 76, 20, INK, 'left');
    if (v.watchName) text(ctx, (L === 'cs' ? 'Záznam: ' : 'Replay: ') + v.watchName, 80, VIEW_H + 110, 22, '#3d5a8c', 'left');
    else text(ctx, (L === 'cs' ? 'Pokus #' : 'Attempt #') + (v.attempt || 1), 80, VIEW_H + 110, 22, '#666', 'left');
    if (v.ghostOn) { drawMouse(ctx, 86, VIEW_H + 168, { ghost: true, alpha: 0.6, t: 0 }); text(ctx, (L === 'cs' ? 'duch = tvůj rekord' : 'ghost = your best'), 128, VIEW_H + 158, 18, '#3d5a8c', 'left'); }
  }
  // right: score
  if (v.sim) {
    const sc = v.score || 0;
    text(ctx, String(sc), W - 80, VIEW_H + 44, 44, INK, 'right');
    drawCheese(ctx, W - 250, VIEW_H + 90, false, 1, 0, 0.9);
    text(ctx, `× ${v.sim.cheese}`, W - 228, VIEW_H + 92, 24, INK, 'left');
    if (v.sim.gold) { drawCheese(ctx, W - 160, VIEW_H + 90, true, 2, 0, 0.9); text(ctx, `× ${v.sim.gold}`, W - 138, VIEW_H + 92, 24, INK, 'left'); }
    drawSalmon(ctx, W - 248, VIEW_H + 124, 3, 0, 0.75);
    text(ctx, `× ${v.sim.salmon}/${C.SALMON_PER_MAP}`, W - 226, VIEW_H + 126, 24, v.sim.salmon === C.SALMON_PER_MAP ? '#e2574c' : INK, 'left');
    text(ctx, (L === 'cs' ? 'těsně: ' : 'close: ') + v.sim.close, W - 120, VIEW_H + 126, 20, '#666', 'left');
    if (v.best) text(ctx, (L === 'cs' ? 'rekord: ' : 'best: ') + v.best, W - 80, VIEW_H + 154, 20, '#666', 'right');
  }
}

// ---------------- main entry ----------------
// v: { map, sim, ghost, camX, lang, fx[], butt, catSay, end, mode, ... }
export function render(ctx, v, now) {
  setBoil(now);
  const th = THEMES[v.map ? v.map.theme : 'kitchen'];
  ctx.save();
  if (v.shake > 0) ctx.translate((hash(now | 0) - 0.5) * v.shake, (hash((now | 0) + 1) - 0.5) * v.shake);
  background(ctx, th, v.camX, now);
  if (v.map) {
    const map = v.map, camX = v.camX;
    drawGround(ctx, map, th, camX);
    for (const sg of map.signs || []) drawSign(ctx, sg, v.lang, camX, v.touch);
    map.solids.forEach((o, i) => drawSolid(ctx, o, th, camX, i));
    map.spikes.forEach((s, i) => drawSpike(ctx, s, th, camX, i));
    map.items.forEach((it, i) => {
      if (v.sim && v.sim.collected[i]) return;
      const x = it.x - camX; if (x < -30 || x > W + 30) return;
      if (it.kind === 'salmon') drawSalmon(ctx, x, it.y, i, now);
      else if (i === v.goldIdx && !(v.sim && v.sim.collected[i])) drawGoldfish(ctx, x, it.y, now, now - (v.goldAt || 0));
      else if (v.sim && i === v.sim.bonusIdx) { // this run's bonus salmon, on a blue glow
        ctx.fillStyle = 'rgba(120,190,255,0.35)'; ctx.beginPath(); ctx.arc(x, it.y, 22 + Math.sin(now / 180) * 3, 0, Math.PI * 2); ctx.fill();
        drawSalmon(ctx, x, it.y, i, now, 0.8);
      } else drawCheese(ctx, x, it.y, it.kind === 'gold', i, now);
    });
    drawFoils(ctx, map, v.sim, camX);
    drawFinish(ctx, map, camX, now, v.end ? v.end.trap : 0);
  }
  // ghost
  if (v.ghost && !v.ghost.done) drawMouse(ctx, v.ghost.x - v.camX, v.ghost.by, { duck: v.ghost.duck > 0, t: now, ghost: true, alpha: 0.45, air: !v.ghost.onGround });
  // mouse
  if (v.mouse && v.mouse.visible) drawMouse(ctx, v.mouse.x - v.camX, v.mouse.by, { duck: v.mouse.duck, t: now, dead: v.mouse.dead, air: v.mouse.air, scared: v.mouse.scared });
  // jumps left (max 2 until landing), shown while airborne
  if (v.sim && v.mouse && v.mouse.visible && !v.end && !v.sim.onGround && !v.sim.dead) {
    const left = C.MAX_JUMPS - v.sim.jumps, mx = v.mouse.x - v.camX + 15, my = v.mouse.by - (v.mouse.duck ? C.DUCK_H : C.MOUSE_H) - 14;
    for (let k = 0; k < C.MAX_JUMPS; k++) {
      ctx.beginPath(); ctx.arc(mx - 6 + k * 12, my, 4, 0, Math.PI * 2);
      ctx.fillStyle = k < left ? '#2a7de1' : 'rgba(255,255,255,0.8)'; ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.stroke();
    }
  }
  if (v.end && v.end.trap >= 1) {
    const tx = v.map.length + TRAP_OFFSET - v.camX;
    trapBar(ctx, tx, 1);
    if (now % 600 < 400) text(ctx, 'SNAP!', tx + 10, G - 70, 30, '#e2574c', 'center', '#fff', -0.15);
  }
  // particles / floating texts
  for (const p of v.fx) {
    const x = p.x - (p.screen ? 0 : v.camX);
    const a = Math.max(0, 1 - p.age / p.life);
    ctx.save(); ctx.globalAlpha = a;
    if (p.kind === 'text') text(ctx, p.text, x, p.y, p.size || 24, p.color || INK, 'center', '#fff');
    else if (p.kind === 'star') star(ctx, x, p.y, p.r || 6, p.seed || 1, p.color || '#ffd23f');
    else if (p.kind === 'dot') { ctx.fillStyle = p.color || INK; ctx.beginPath(); ctx.arc(x, p.y, p.r || 3, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  ctx.restore();
  if (v.hud) hudPanel(ctx, v, now);
  else { // menus: plain paper strip with the butt for decoration
    ctx.fillStyle = '#fffaf0'; ctx.fillRect(0, VIEW_H, W, H - VIEW_H);
    line(ctx, 0, VIEW_H + 2, W, VIEW_H + 2, 400, 1.5, INK, 2.4);
    drawButt(ctx, W / 2, VIEW_H + 110, v.butt, now, v.lang);
  }
  // what the cat says, next to its head in the bottom panel
  if (v.catSay && !v.leap) {
    const age = now - v.catSay.at;
    bubble(ctx, W / 2 + 120, VIEW_H - 22, v.catSay.text, v.catSay.color, 500, v.catSay.hold ? Math.min(age, 300) : age);
  }
  // finale: the cat we've been slapping leaps out of the panel onto the trap
  if (v.leap) {
    const L = v.leap, p = L.p;
    const fromX = W / 2, fromY = VIEW_H + 110, toX = L.trapX - v.camX, toY = G - 30;
    const e = p < 1 ? p * p * (3 - 2 * p) : 1;
    const x = fromX + (toX - fromX) * e, y = fromY + (toY - fromY) * e - Math.sin(p * Math.PI) * 170;
    const sc = 0.8 + (0.5 - 0.8) * e;
    const wig = L.eat ? Math.sin(L.eat * Math.PI * 2) * 0.12 : 0;
    drawButt(ctx, x, y + (L.eat ? -Math.abs(Math.sin(L.eat * Math.PI)) * 6 : 0), v.butt, now, v.lang, sc, { fat: L.fat, rot: (p < 1 ? (0.5 - p) * 0.5 : 0) + wig, noHands: true });
  }
  if (v.banner) {
    const age = now - v.banner.at;
    if (age < v.banner.life) {
      const s = age < 120 ? age / 120 : 1;
      ctx.save(); ctx.translate(W / 2, 150); ctx.scale(s, s);
      text(ctx, v.banner.text, 0, 0, v.banner.size || 64, v.banner.color || INK, 'center', '#fff', -0.04);
      if (v.banner.sub) text(ctx, v.banner.sub, 0, 52, 28, INK, 'center', '#fff');
      ctx.restore();
    }
  }
}

export { drawCheese };
