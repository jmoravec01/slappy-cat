// Pixel-art drawing primitives. The scene is drawn in game units (960 x 540) into a 480 x 270 pixel frame
// with hard edges (own scanline rasteriser, no anti-aliasing), then scaled up nearest-neighbour.
// Same call shapes as the old sketch primitives (the ctx argument is ignored), plus a small transform stack,
// clip, alpha and a bitmap font with Czech accents. pixelfx effects draw into the same frame.
import { createFrame } from '../vendor/pixelfx/core/fx.js';
import { FONTS } from '../vendor/pixelfx/core/font.js';

export const PW = 480, PH = 270, K = PW / 960;
export const INK = '#1d1a2b';

export function hash(n) {
  let t = (n + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---------------- target frame, transform, alpha, clip ----------------
export const main = createFrame(PW, PH);
let F = main, FW = PW, FH = PH, BUF = F.color, MASK = null;
const st = { m: [K, 0, 0, K, 0, 0], alpha: 1, clip: null };
const stack = [];
export function target(frame, k = K) {
  F = frame; FW = frame.w; FH = frame.h; BUF = frame.color;
  st.m = [k, 0, 0, k, 0, 0]; st.alpha = 1; st.clip = null; stack.length = 0;
}
export const frame = () => F;
export function save() { stack.push({ m: st.m.slice(), alpha: st.alpha, clip: st.clip }); }
export function restore() { const s = stack.pop(); if (s) Object.assign(st, s); }
export function translate(x, y) { const m = st.m; m[4] += m[0] * x + m[2] * y; m[5] += m[1] * x + m[3] * y; }
export function scale(sx, sy = sx) { const m = st.m; m[0] *= sx; m[1] *= sx; m[2] *= sy; m[3] *= sy; }
export function rotate(r) {
  const m = st.m, c = Math.cos(r), s = Math.sin(r), [a, b, cc, d] = m;
  m[0] = a * c + cc * s; m[1] = b * c + d * s; m[2] = -a * s + cc * c; m[3] = -b * s + d * c;
}
export function alpha(a) { st.alpha *= a; }
const unit = () => Math.sqrt(Math.abs(st.m[0] * st.m[3] - st.m[1] * st.m[2])); // frame px per game unit
const TX = (x, y) => st.m[0] * x + st.m[2] * y + st.m[4];
const TY = (x, y) => st.m[1] * x + st.m[3] * y + st.m[5];

// ---------------- colours: '#rgb', '#rrggbb', 'rgb()', 'rgba()' -> {c: ABGR uint32, a} ----------------
const COLS = new Map();
export function col(s) {
  let v = COLS.get(s);
  if (v) return v;
  let r, g, b, a = 1;
  if (s[0] === '#') {
    let h = s.slice(1); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h.slice(0, 6), 16); r = n >> 16; g = (n >> 8) & 255; b = n & 255;
  } else { [r, g, b, a = 1] = s.slice(s.indexOf('(') + 1, -1).split(',').map(Number); }
  v = { c: ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0, a };
  if (COLS.size > 4000) COLS.clear();
  COLS.set(s, v);
  return v;
}

// 4x4 ordered dither: global alpha fades shapes in a pixel pattern instead of blending
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

function plot(i, c, a) {
  if (a >= 1) { BUF[i] = c; return; }
  const d = BUF[i], k = a, q = 1 - a; // translucent colour: blend over what is there
  BUF[i] = ((255 << 24) | ((((c >>> 16) & 255) * k + ((d >>> 16) & 255) * q) << 16) |
    ((((c >>> 8) & 255) * k + ((d >>> 8) & 255) * q) << 8) | ((c & 255) * k + (d & 255) * q)) >>> 0;
}
// fill pixels x0..x1 (inclusive) of row y
function span(y, x0, x1, cv) {
  if (y < 0 || y >= FH) return;
  if (x0 < 0) x0 = 0; if (x1 >= FW) x1 = FW - 1;
  if (x0 > x1) return;
  const ga = st.alpha, row = y * FW, clip = st.clip;
  if (ga >= 1 && cv.a >= 1 && !clip) { BUF.fill(cv.c, row + x0, row + x1 + 1); return; }
  for (let x = x0; x <= x1; x++) {
    if (clip && !clip[row + x]) continue;
    if (ga < 1 && ga <= BAYER[((y & 3) << 2) | (x & 3)]) continue;
    plot(row + x, cv.c, cv.a);
  }
}
export function pixel(px, py, color) { const x = px | 0, y = py | 0; span(y, x, x, col(color)); }

// scanline fill of a polygon given in frame pixels (pixel centres inside, even-odd)
const XS = [];
function fillPx(P, cv, ox = 0, oy = 0) {
  let y0 = Infinity, y1 = -Infinity;
  for (const p of P) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  y0 = Math.max(0, Math.ceil(y0 + oy - 0.5)); y1 = Math.min(FH - 1, Math.floor(y1 + oy - 0.5));
  const n = P.length;
  for (let y = y0; y <= y1; y++) {
    const yc = y + 0.5 - oy; XS.length = 0;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const [xi, yi] = P[i], [xj, yj] = P[j];
      if ((yi > yc) !== (yj > yc)) XS.push(xi + ((yc - yi) * (xj - xi)) / (yj - yi) + ox);
    }
    XS.sort((a, b) => a - b);
    for (let k = 0; k + 1 < XS.length; k += 2) span(y, Math.ceil(XS[k] - 0.5), Math.floor(XS[k + 1] - 0.5), cv);
  }
}
const toPx = (pts) => pts.map(([x, y]) => [TX(x, y), TY(x, y)]);
// fill + 1 px outline: the outline colour drawn four times one pixel off, the fill on top
function shape(P, fill, stroke) {
  if (stroke && fill) {
    const sv = col(stroke);
    fillPx(P, sv, -1, 0); fillPx(P, sv, 1, 0); fillPx(P, sv, 0, -1); fillPx(P, sv, 0, 1);
  }
  if (fill) fillPx(P, col(fill));
  else if (stroke) outlinePx(P, stroke);
}
function outlinePx(P, color) { for (let i = 0; i < P.length; i++) linePx(P[i], P[(i + 1) % P.length], col(color)); }
function linePx(a, b, cv) { // Bresenham
  let x0 = Math.floor(a[0]), y0 = Math.floor(a[1]);
  const x1 = Math.floor(b[0]), y1 = Math.floor(b[1]), dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let guard = 0; guard < 4000; guard++) {
    span(y0, x0, x0, cv);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
// a thick segment in frame px: a quad with square-ish caps
function thickPx(a, b, w, cv) {
  if (w < 1.6) return linePx(a, b, cv);
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, h = w / 2;
  const nx = (-dy / L) * h, ny = (dx / L) * h, ex = (dx / L) * h * 0.6, ey = (dy / L) * h * 0.6;
  fillPx([[a[0] - ex + nx, a[1] - ey + ny], [b[0] + ex + nx, b[1] + ey + ny], [b[0] + ex - nx, b[1] + ey - ny], [a[0] - ex - nx, a[1] - ey - ny]], cv);
}
function ellipsePts(cx, cy, rx, ry, rot = 0) {
  const n = Math.max(12, Math.min(64, Math.round((rx + ry) * unit() * 1.2)));
  const c = Math.cos(rot), s = Math.sin(rot), pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    pts.push([cx + x * c - y * s, cy + x * s + y * c]);
  }
  return pts;
}

// ---------------- clip (one level per save) ----------------
let maskPool = null;
export function clipEllipse(cx, cy, rx, ry, rot = 0) { clipPx(toPx(ellipsePts(cx, cy, rx, ry, rot))); }
export function clipRect(x, y, w, h) { clipPx(toPx([[x, y], [x + w, y], [x + w, y + h], [x, y + h]])); }
function clipPx(P) {
  if (!maskPool || maskPool.length !== FW * FH) maskPool = new Uint8Array(FW * FH);
  const prev = st.clip, m = maskPool; m.fill(0);
  const saveBuf = BUF, saveClip = st.clip, saveA = st.alpha;
  // rasterise the clip shape into the mask by drawing with a fake buffer
  st.clip = null; st.alpha = 1; BUF = { fill: (v, a, b) => m.fill(1, a, b) };
  fillPx(P, { c: 1, a: 1 });
  BUF = saveBuf; st.clip = saveClip; st.alpha = saveA;
  if (prev) for (let i = 0; i < m.length; i++) m[i] &= prev[i];
  st.clip = m;
}

// ---------------- sketch-compatible primitives (game units) ----------------
export function setBoil() {}
export function line(ctx, x1, y1, x2, y2, seed = 0, amt = 0, color = INK, lw = 2.2) {
  thickPx([TX(x1, y1), TY(x1, y1)], [TX(x2, y2), TY(x2, y2)], lw * unit(), col(color));
}
export function poly(ctx, pts, seed = 0, fill = null, stroke = INK) { shape(toPx(pts), fill, stroke); }
export function rect(ctx, x, y, w, h, seed = 0, fill = null, stroke = INK) {
  shape(toPx([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]), fill, stroke);
}
export function ellipse(ctx, cx, cy, rx, ry, seed = 0, fill = null, stroke = INK, amt = 0, lw = 0, rot = 0) {
  shape(toPx(ellipsePts(cx, cy, rx, ry, rot)), fill, stroke);
}
// diagonal pixel lines inside a rect, anchored to the rect's corner
export function hatch(ctx, x, y, w, h, color, gap = 9) {
  const x0 = Math.round(TX(x, y)), y0 = Math.round(TY(x, y)), x1 = Math.round(TX(x + w, y + h)), y1 = Math.round(TY(x + w, y + h));
  const g = Math.max(3, Math.round(gap * unit())), cv = col(color);
  for (let py = Math.max(0, y0); py < Math.min(FH, y1); py++)
    for (let px = Math.max(0, x0 + ((((py - y0) % g) + g) % g ? g - (((py - y0) % g) + g) % g : 0)); px < Math.min(FW, x1); px += g) span(py, px, px, cv);
}
export function curve(ctx, pts, seed = 0, color = INK, lw = 2.2) {
  const cv = col(color), P = [];
  P.push(pts[0]);
  for (let i = 1; i < pts.length - 1; i++) { // quadratic smoothing through the midpoints, like the old pen
    const a = i === 1 ? pts[0] : [(pts[i - 1][0] + pts[i][0]) / 2, (pts[i - 1][1] + pts[i][1]) / 2];
    const b = pts[i], c = [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2];
    for (let t = 0.25; t <= 1; t += 0.25) P.push([(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * b[0] + t * t * c[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * b[1] + t * t * c[1]]);
  }
  P.push(pts[pts.length - 1]);
  const w = lw * unit(), Q = toPx(P);
  for (let i = 1; i < Q.length; i++) thickPx(Q[i - 1], Q[i], w, cv);
}
export function star(ctx, cx, cy, r, seed = 0, fill = '#ffd23f') {
  const R = r * unit(), x = TX(cx, cy), y = TY(cx, cy);
  if (R < 3.5) { // a twinkle: plus with a bright centre
    const cv = col(fill), L = Math.max(1, Math.round(R)), X = Math.floor(x), Y = Math.floor(y);
    span(Y, X - L, X + L, cv); for (let k = 1; k <= L; k++) { span(Y - k, X, X, cv); span(Y + k, X, X, cv); }
    span(Y, X, X, col('#ffffff'));
    return;
  }
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  shape(toPx(pts), fill, INK);
}
// plain fills without outline
export function box(x, y, w, h, color) { fillPx(toPx([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]), col(color)); }
export function disc(cx, cy, r, color) {
  if (r * unit() < 0.8) return span(Math.floor(TY(cx, cy)), Math.floor(TX(cx, cy)), Math.floor(TX(cx, cy)), col(color));
  fillPx(toPx(ellipsePts(cx, cy, r, r)), col(color));
}
export function oval(cx, cy, rx, ry, color, rot = 0) { fillPx(toPx(ellipsePts(cx, cy, rx, ry, rot)), col(color)); }
// two-colour diagonal stripes (warning tape) inside a rect
export function stripes(x, y, w, h, c1, c2, period = 16) {
  const x0 = Math.round(TX(x, y)), y0 = Math.round(TY(x, y)), x1 = Math.round(TX(x + w, y + h)), y1 = Math.round(TY(x + w, y + h));
  const p = Math.max(4, Math.round(period * unit())), a = col(c1), b = col(c2);
  for (let py = Math.max(0, y0); py < Math.min(FH, y1); py++)
    for (let px = Math.max(0, x0); px < Math.min(FW, x1); px++) span(py, px, px, (((px - x0 + py) % p) + p) % p < p / 2 ? a : b);
}

// ---------------- text: pixelfx 5x7 font, upper case, with Czech accents composed on top ----------------
const BIG = FONTS.big.glyphs;
const g = (src) => { const rows = src.split('|'); return { w: rows[0].length, rows: rows.map((r) => [...r].map((c) => c === '#')) }; };
const EXTRA = {
  '↑': g('..#..|.###.|#.#.#|..#..|..#..|..#..|..#..'), '↓': g('..#..|..#..|..#..|..#..|#.#.#|.###.|..#..'),
  '←': g('.......|..#....|.#.....|#######|.#.....|..#....|.......'), '→': g('.......|....#..|.....#.|#######|.....#.|....#..|.......'),
  '×': g('.....|.....|#...#|.#.#.|..#..|.#.#.|#...#'), '✔': g('.....|....#|...#.|#.#..|.#...|.....|.....'),
  '…': g('.....|.....|.....|.....|.....|.....|#.#.#'), '"': g('#.#|#.#|...|...|...|...|...'), '&': g('.##..|#..#.|.##..|.#...|#.#.#|#..#.|.##.#'),
  '🐟': g('.........|.....##..|#..#####.|##########|#..######|..#####..|.........'), '#': BIG['#'],
};
const MARKS = { '\u0301': g('.#|#.'), '\u030c': g('#.#|.#.'), '\u030a': g('.#.|#.#'), '\u0308': g('#.#|...') };
function glyphs(str) {
  const out = [];
  for (const ch of String(str).toLocaleUpperCase('cs').normalize('NFD')) {
    if (MARKS[ch]) { if (out.length) out[out.length - 1].mark = MARKS[ch]; continue; }
    if (ch === ' ') { out.push({ space: true }); continue; }
    const gl = EXTRA[ch] || BIG[ch];
    if (gl) out.push({ gl });
  }
  return out;
}
export function textWidth(str, k = 1) {
  let w = 0;
  for (const q of glyphs(str)) w += (q.space ? 3 : q.gl.w) + 1;
  return Math.max(0, w - 1) * k;
}
// px size of a game-unit font size: ~ size/16 font pixels per frame pixel at the base scale
export const textScale = (size) => Math.max(1, Math.round((size * unit()) / 10));
export function text(ctx, str, x, y, size = 24, color = INK, align = 'center', outline = null) {
  const k = textScale(size), W = textWidth(str, k), H = 7 * k;
  let left = Math.round(TX(x, y) - (align === 'center' ? W / 2 : align === 'right' ? W : 0));
  const top = Math.round(TY(x, y) - H / 2);
  const runs = [];
  let cx = left;
  for (const q of glyphs(str)) {
    if (q.space) { cx += 4 * k; continue; }
    q.gl.rows.forEach((row, r) => row.forEach((on, c) => on && runs.push([cx + c * k, top + r * k])));
    if (q.mark) { const mx = cx + Math.floor((q.gl.w - q.mark.w) / 2) * k; q.mark.rows.forEach((row, r) => row.forEach((on, c) => on && runs.push([mx + c * k, top - (q.mark.rows.length + 1 - r) * k]))); }
    cx += (q.gl.w + 1) * k;
  }
  if (outline) { const ov = col(outline); for (const [px, py] of runs) for (let yy = py - 1; yy < py + k + 1; yy++) span(yy, px - 1, px + k, ov); }
  const cv = col(color);
  for (const [px, py] of runs) for (let yy = py; yy < py + k; yy++) span(yy, px, px + k - 1, cv);
}

// ---------------- present ----------------
const outs = new WeakMap(); // frame -> its own small canvas + ImageData
// copy the frame (plus light, if effects drew any) to the visible canvas, scaled up without smoothing
export function present(ctx, w, h, withLight, composite) {
  let o = outs.get(F);
  if (!o) {
    const lo = document.createElement('canvas'); lo.width = F.w; lo.height = F.h;
    o = { lo, raw: new ImageData(new Uint8ClampedArray(F.color.buffer), F.w, F.h), lit: new ImageData(F.w, F.h) };
    outs.set(F, o);
  }
  if (withLight) composite(F, o.lit.data, null);
  const lo = o.lo;
  lo.getContext('2d').putImageData(withLight ? o.lit : o.raw, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(lo, 0, 0, w, h);
}
