// Pixel renderer: hard edges only (no anti-aliased in-between colours), dithered alpha, clip, accents,
// and the vendored pixelfx effects load and draw.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFrame, createFx } from '../public/vendor/pixelfx/core/fx.js';
import * as px from '../public/js/pixel.js';

const BG = '#ffffff', FILL = '#ff8800';
const colours = (f) => new Set(f.color);
const c = (s) => px.col(s).c;

function fresh(w = 64, h = 64) {
  const f = createFrame(w, h);
  px.target(f, 1);
  px.box(0, 0, w, h, BG);
  return f;
}

test('shapes are hard-edged: only background, outline and fill colours', () => {
  const f = fresh();
  px.ellipse(0, 32, 32, 20, 13, 0, FILL, px.INK, 0, 0, 0.4);
  px.poly(0, [[5, 60], [30, 40], [60, 62]], 0, FILL, px.INK);
  px.line(0, 2, 2, 60, 30, 0, 0, px.INK, 3);
  assert.deepEqual([...colours(f)].sort(), [c(BG), c(FILL), c(px.INK)].sort());
});

test('global alpha dithers instead of blending', () => {
  const f = fresh(16, 16);
  px.save(); px.alpha(0.5); px.box(0, 0, 16, 16, FILL); px.restore();
  const n = f.color.filter((v) => v === c(FILL)).length;
  assert.deepEqual([...colours(f)].sort(), [c(BG), c(FILL)].sort());
  assert.equal(n, 128); // exactly half of a 4x4 Bayer pattern
});

test('clip keeps fills inside the clip shape and is undone by restore', () => {
  const f = fresh(40, 40);
  px.save(); px.clipEllipse(20, 20, 8, 8); px.box(0, 0, 40, 40, FILL); px.restore();
  assert.equal(f.color[0], c(BG));
  assert.equal(f.color[20 * 40 + 20], c(FILL));
  px.box(0, 0, 2, 2, FILL);
  assert.equal(f.color[0], c(FILL));
});

test('Czech accents are drawn above the letter', () => {
  const plain = fresh(40, 30); px.text(0, 'E', 20, 15, 10, px.INK);
  const accented = fresh(40, 30); px.text(0, 'ě', 20, 15, 10, px.INK);
  const ink = (f) => f.color.filter((v) => v === c(px.INK)).length;
  assert.ok(ink(accented) > ink(plain), 'caron adds pixels');
  assert.equal(px.textWidth('ŘEŽ'), px.textWidth('REZ'));
});

test('vendored pixelfx effects load and draw into a frame', async () => {
  for (const id of ['explosions/cartoon-pow', 'pickups/collect-burst', 'spawn/poof', 'impacts/crit-hit', 'ui/confetti', 'impacts/blunt-hit']) {
    const mod = await import(`../public/vendor/pixelfx/fx/${id}.js`);
    const f = createFrame(200, 160), fx = createFx(mod, { x: 100, y: 120 });
    let drawn = 0;
    for (let i = 0; i < 20; i++) { fx.update(1 / 30); fx.draw(f); }
    for (const v of f.color) if (v) drawn++;
    assert.ok(drawn > 0, id + ' drew nothing');
  }
});
