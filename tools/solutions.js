// Dev helper: print solver solutions for every map as JSON (for demo/QA).
import { readFileSync } from 'node:fs';
import { solve } from '../shared/solver.js';
import { prepareMap, runReplay } from '../shared/sim.js';
const { maps } = JSON.parse(readFileSync(new URL('../shared/maps.json', import.meta.url)));
const every = Number(process.argv[2] || 5);
const out = {};
for (const m of maps) {
  const r = solve(m, { every });
  const rr = r.ok ? runReplay(prepareMap(m), r.inputs) : null;
  out[m.id] = r.ok ? r.inputs : null;
  console.error(m.id, r.ok, rr && rr.score, rr && rr.cheese + '/' + m.items.length);
}
console.log(JSON.stringify(out));
