// Dev-only cross-browser smoke test (Chromium, Firefox, WebKit/Safari engine).
// Run inside the Playwright docker image against a running server:
//   docker run --rm --network host -v $PWD:/app -v /path/sol.json:/sol.json \
//     mcr.microsoft.com/playwright:v1.55.0-noble sh -c 'cd /tmp && npm i -s playwright@1.55.0 && node /app/tools/xbrowser.mjs'
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire('/tmp/');
const { chromium, firefox, webkit } = require('playwright');

const BASE = process.env.BASE || 'http://127.0.0.1:8077';
const sol = JSON.parse(readFileSync('/sol.json', 'utf8'));
const expected = JSON.parse(process.env.EXPECTED || 'null');
let failed = false;

for (const [name, bt] of [['chromium', chromium], ['firefox', firefox], ['webkit', webkit]]) {
  const browser = await bt.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(BASE + '/');
  await page.waitForTimeout(1500);
  await page.click('[data-act=maps]');
  await page.click('[data-map="1"]');
  await page.keyboard.press('d');
  await page.waitForTimeout(1500);
  await page.keyboard.press('a');
  await page.waitForTimeout(300);
  await page.keyboard.down('d');
  await page.waitForTimeout(250);
  const held = await page.evaluate(() => __slappy.sim.hold && __slappy.v.butt.rightHeld);
  await page.keyboard.up('d');
  await page.waitForTimeout(100);
  const st = await page.evaluate(() => ({ tick: __slappy.sim.tick, mode: __slappy.mode, inputs: __slappy.inputs.length, hold: __slappy.sim.hold }));
  st.heldWhilePressed = held;
  await page.screenshot({ path: `/app/.xb-${name}.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const paused = await page.evaluate(() => !document.querySelector('#scr-pause').classList.contains('hidden'));
  const scores = await page.evaluate(async (sol) => {
    const sim = await import('/shared/sim.js');
    const maps = (await (await fetch('/shared/maps.json')).json()).maps;
    return maps.map((m) => { const r = sim.runReplay(sim.prepareMap(m), sol[m.id]); return [r.finished, r.score, r.ticks]; });
  }, sol);
  const same = expected ? JSON.stringify(scores) === JSON.stringify(expected) : null;
  // registration proof of work runs in a module Web Worker
  const pow = await page.evaluate(async () => {
    const { solvePow, sha256Words, zeroBits } = await import('/js/pow.js');
    const n = await solvePow('xbrowser-check', 12);
    return zeroBits(sha256Words('xbrowser-check:' + n)) >= 12;
  });
  st.powWorker = pow;
  const ok = pow && st.tick > 30 && st.mode === 'play' && st.inputs >= 3 && held && !st.hold && paused && errors.length === 0 && same !== false;
  if (!ok) failed = true;
  console.log(JSON.stringify({ browser: name, version: browser.version(), ok, state: st, paused, deterministic: same, errors, scores: same ? 'match' : scores }));
  await browser.close();
}
process.exit(failed ? 1 : 0);
