// Hand-drawn ("sketch") drawing primitives for canvas.
// Lines wobble deterministically per seed; the global `boil` value changes a
// few times per second so outlines gently "boil" like an animated doodle.

export const S = { boil: 0, lw: 2.2 };

export function hash(n) {
  let t = (n + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const j = (seed, amt) => (hash(seed) - 0.5) * 2 * amt;

export function setBoil(timeMs) { S.boil = Math.floor(timeMs / 140) % 3; }

const k = (seed) => (seed | 0) * 7919 + S.boil * 104729;

// adds a wobbly segment (two passes for thick pens) to the current path
function seg(ctx, x1, y1, x2, y2, seed, amt, lw) {
  const s = k(seed);
  for (let p = 0; p < (lw < 1.6 ? 1 : 2); p++) {
    const b = s + p * 31;
    ctx.moveTo(x1 + j(b + 3, amt), y1 + j(b + 4, amt));
    ctx.quadraticCurveTo((x1 + x2) / 2 + j(b + 1, amt * 1.5), (y1 + y2) / 2 + j(b + 2, amt * 1.5), x2 + j(b + 5, amt), y2 + j(b + 6, amt));
  }
}
const pen = (ctx, color, lw) => { ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.beginPath(); };

export function line(ctx, x1, y1, x2, y2, seed = 0, amt = 1.4, color = '#2b2b2b', lw = S.lw) {
  pen(ctx, color, lw); seg(ctx, x1, y1, x2, y2, seed, amt, lw); ctx.stroke();
}

// polygon outline + offset crayon fill
export function poly(ctx, pts, seed = 0, fill = null, stroke = '#2b2b2b', amt = 1.4, lw = S.lw) {
  if (fill) {
    const s = k(seed) + 999;
    ctx.fillStyle = fill;
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
      const px = x + 2 + j(s + i * 3, amt), py = y + 2 + j(s + i * 3 + 1, amt);
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    });
    ctx.closePath(); ctx.fill();
  }
  if (stroke) { // one stroke() per outline: canvas cost is per call, not per segment
    pen(ctx, stroke, lw);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      seg(ctx, a[0], a[1], b[0], b[1], seed * 13 + i, amt, lw);
    }
    ctx.stroke();
  }
}

export function rect(ctx, x, y, w, h, seed = 0, fill = null, stroke = '#2b2b2b', amt = 1.4, lw = S.lw) {
  poly(ctx, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], seed, fill, stroke, amt, lw);
}

// wobbly ellipse; overshoots the start like a pencil circle
export function ellipse(ctx, cx, cy, rx, ry, seed = 0, fill = null, stroke = '#2b2b2b', amt = 1.2, lw = S.lw, rot = 0) {
  const s = k(seed);
  const n = 14;
  const pt = (i, off) => {
    const a = (i / n) * Math.PI * 2 + rot;
    const r = 1 + j(s + i * 5 + off, amt / Math.max(8, Math.min(rx, ry)));
    return [cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r];
  };
  if (fill) {
    ctx.fillStyle = fill; ctx.beginPath();
    for (let i = 0; i <= n; i++) { const [x, y] = pt(i % n, 7); i ? ctx.lineTo(x + 1.5, y + 1.5) : ctx.moveTo(x + 1.5, y + 1.5); }
    ctx.closePath(); ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    const total = n + 2;
    let [x0, y0] = pt(0, 0); ctx.moveTo(x0, y0);
    for (let i = 1; i <= total; i++) {
      const [x, y] = pt(i % n, 0);
      const [px, py] = pt((i - 1) % n, 0);
      ctx.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2);
    }
    ctx.stroke();
  }
}

// parallel hatching inside a rect (clipped)
export function hatch(ctx, x, y, w, h, color, gap = 9, seed = 0, lw = 1.2) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.strokeStyle = color; ctx.lineWidth = lw;
  ctx.beginPath();
  const s = k(seed);
  for (let d = -h; d < w; d += gap) {
    const o = j(s + d, 1.5);
    ctx.moveTo(x + d + o, y + h); ctx.lineTo(x + d + h + o, y);
  }
  ctx.stroke();
  ctx.restore();
}

// freehand curve through points
export function curve(ctx, pts, seed = 0, color = '#2b2b2b', lw = S.lw, amt = 1) {
  const s = k(seed);
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  const P = pts.map(([x, y], i) => [x + j(s + i * 2, amt), y + j(s + i * 2 + 1, amt)]);
  ctx.moveTo(P[0][0], P[0][1]);
  for (let i = 1; i < P.length - 1; i++) {
    ctx.quadraticCurveTo(P[i][0], P[i][1], (P[i][0] + P[i + 1][0]) / 2, (P[i][1] + P[i + 1][1]) / 2);
  }
  const L = P[P.length - 1]; ctx.lineTo(L[0], L[1]);
  ctx.stroke();
}

export function text(ctx, str, x, y, size = 24, color = '#2b2b2b', align = 'center', outline = null, rot = 0) {
  ctx.save();
  ctx.translate(x, y); if (rot) ctx.rotate(rot);
  ctx.font = `${size}px "Patrick Hand", "Comic Sans MS", "Chalkboard SE", cursive`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (outline) { ctx.lineWidth = Math.max(3, size / 6); ctx.strokeStyle = outline; ctx.lineJoin = 'round'; ctx.strokeText(str, 0, 0); }
  ctx.fillStyle = color; ctx.fillText(str, 0, 0);
  ctx.restore();
}

export function star(ctx, cx, cy, r, seed, fill = '#ffd23f') {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  poly(ctx, pts, seed, fill, '#2b2b2b', 0.8, 1.6);
}
