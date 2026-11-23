import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKINS, SKIN_BY_ID, PATTERNS, DEFAULT } from '../shared/skins.js';

test('market: 60 plain colours and 200 two-colour mixes for each of cat and mouse', () => {
  assert.equal(SKIN_BY_ID.size, SKINS.length, 'unique ids');
  for (const kind of ['cat', 'mouse']) {
    const all = SKINS.filter((s) => s.kind === kind), mixes = all.filter((s) => s.mix);
    assert.equal(all.length - mixes.length, 60);
    assert.equal(mixes.length, 200);
    for (const pat of Object.keys(PATTERNS)) {
      for (const pair of ['white-black', 'black-white']) assert.ok(SKIN_BY_ID.has(`${kind}:mix-${pat}-${pair}`), `${pat} ${pair}`);
    }
    assert.ok(mixes.every((s) => s.price > 0 && s.hex !== s.mix.hex));
    assert.equal(SKIN_BY_ID.get(DEFAULT[kind]).price, 0);
  }
});
