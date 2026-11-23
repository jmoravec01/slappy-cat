// Colours for the cat and the mouse, bought in the market with salmon. Shared by the server (prices, ids)
// and the browser (names, palettes). Item id: "cat:<slug>" / "mouse:<slug>"; the default of each is free.

// [slug, hex, czech name, english name, tier]  tier 1..5 -> price
const COLOURS = [
  ['ginger', '#f39c34', 'Zrzavá', 'Ginger', 1],
  ['mouse-grey', '#b8b2c8', 'Myší šedá', 'Mouse grey', 1],
  ['white', '#f7f4ee', 'Bílá', 'White', 2],
  ['cream', '#f3e3c3', 'Smetanová', 'Cream', 1],
  ['beige', '#dcc4a0', 'Béžová', 'Beige', 1],
  ['sand', '#e6c78f', 'Písková', 'Sand', 1],
  ['caramel', '#c98a4b', 'Karamelová', 'Caramel', 2],
  ['cinnamon', '#a8653a', 'Skořicová', 'Cinnamon', 2],
  ['chocolate', '#6b4128', 'Čokoládová', 'Chocolate', 2],
  ['coffee', '#8a5a44', 'Kávová', 'Coffee', 2],
  ['honey', '#f0b843', 'Medová', 'Honey', 2],
  ['mustard', '#d6a52a', 'Hořčičná', 'Mustard', 2],
  ['lemon', '#f4e04d', 'Citronová', 'Lemon', 3],
  ['banana', '#f7e98e', 'Banánová', 'Banana', 2],
  ['apricot', '#f8b27a', 'Meruňková', 'Apricot', 2],
  ['peach', '#ffc4a3', 'Broskvová', 'Peach', 2],
  ['pumpkin', '#ef7d22', 'Dýňová', 'Pumpkin', 2],
  ['salmon', '#f9906f', 'Lososová', 'Salmon', 3],
  ['coral', '#ff7b6b', 'Korálová', 'Coral', 3],
  ['strawberry', '#ff5c7a', 'Jahodová', 'Strawberry', 3],
  ['tomato', '#e8513b', 'Rajčatová', 'Tomato', 3],
  ['cherry', '#c62f45', 'Třešňová', 'Cherry', 3],
  ['wine', '#7d2340', 'Vínová', 'Wine', 3],
  ['raspberry', '#d63b75', 'Malinová', 'Raspberry', 3],
  ['pink', '#f7a1c4', 'Růžová', 'Pink', 2],
  ['bubblegum', '#ff8fd0', 'Žvýkačková', 'Bubblegum', 3],
  ['fuchsia', '#d43fb0', 'Fuchsiová', 'Fuchsia', 4],
  ['lavender', '#c3a6e8', 'Levandulová', 'Lavender', 3],
  ['violet', '#9b72d0', 'Fialková', 'Violet', 3],
  ['plum', '#6e4a8e', 'Švestková', 'Plum', 3],
  ['aubergine', '#4b2e5e', 'Lilková', 'Aubergine', 3],
  ['midnight', '#2c3566', 'Půlnoční', 'Midnight', 4],
  ['indigo', '#3f4fa8', 'Indigová', 'Indigo', 3],
  ['blueberry', '#4f5fd6', 'Borůvková', 'Blueberry', 3],
  ['royal-blue', '#3a6fd8', 'Královská modrá', 'Royal blue', 4],
  ['sky', '#7cc0f0', 'Nebeská', 'Sky blue', 3],
  ['ice', '#c8ecf7', 'Ledová', 'Ice', 3],
  ['turquoise', '#3cc7c0', 'Tyrkysová', 'Turquoise', 3],
  ['teal', '#2a9d8f', 'Mořská', 'Teal', 3],
  ['mint', '#9fe3c1', 'Mátová', 'Mint', 3],
  ['pistachio', '#b5d67a', 'Pistáciová', 'Pistachio', 3],
  ['lime', '#9ad14b', 'Limetková', 'Lime', 3],
  ['grass', '#5cb85c', 'Trávová', 'Grass', 3],
  ['forest', '#2f7a45', 'Lesní', 'Forest', 3],
  ['olive', '#8a8a3c', 'Olivová', 'Olive', 2],
  ['khaki', '#b9a86b', 'Khaki', 'Khaki', 2],
  ['sage', '#9caf88', 'Šalvějová', 'Sage', 2],
  ['ash', '#9a9a9a', 'Popelavá', 'Ash', 1],
  ['russian-blue', '#7b8ea3', 'Ruská modrá', 'Russian blue', 2],
  ['smoky', '#6f6a75', 'Kouřová', 'Smoky', 2],
  ['graphite', '#4a4d52', 'Grafitová', 'Graphite', 2],
  ['black', '#2e2a2a', 'Černá', 'Black', 3],
  ['rust', '#b5562a', 'Rezavá', 'Rust', 2],
  ['copper', '#c27a46', 'Měděná', 'Copper', 4],
  ['bronze', '#a7793c', 'Bronzová', 'Bronze', 4],
  ['silver', '#c9ced6', 'Stříbrná', 'Silver', 4],
  ['gold', '#e8c547', 'Zlatá', 'Gold', 5],
  ['neon-green', '#5dff5a', 'Neonově zelená', 'Neon green', 5],
  ['neon-pink', '#ff4fd8', 'Neonově růžová', 'Neon pink', 5],
  ['electric-blue', '#2bd3ff', 'Elektrická modrá', 'Electric blue', 5],
];
const PRICE = [0, 2, 3, 5, 8, 12];
export const DEFAULT = { cat: 'cat:ginger', mouse: 'mouse:mouse-grey' };

// darker (or, for dark fur, lighter) shade for stripes
function shade(hex) {
  const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255];
  const dark = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11 < 70;
  return '#' + c.map((v) => Math.round(dark ? v + (255 - v) * 0.3 : v * 0.78).toString(16).padStart(2, '0')).join('');
}

const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return (n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11; };

// Two-colour mixes: a main fur colour A plus a second colour B laid out by a pattern. A/B and B/A are different
// skins (black with white patches is not white with black patches).
export const PATTERNS = {
  tabby: { cs: 'pruhy', en: 'stripes', price: 6 },
  points: { cs: 'konečky', en: 'points', price: 8 },
  twotone: { cs: 'dvoubarva', en: 'two-tone', price: 10 },
  patches: { cs: 'flíčky', en: 'patches', price: 12 },
};
const MIX_BASE = ['white', 'black', 'ginger', 'cream', 'ash', 'chocolate', 'russian-blue', 'caramel', 'graphite', 'sand',
  'pink', 'lavender', 'sky', 'mint', 'gold', 'neon-pink', 'cherry', 'midnight'];
const FANCY = new Set(['pink', 'lavender', 'sky', 'mint', 'gold', 'neon-pink', 'cherry', 'midnight']); // +3 salmon
const MIXES_PER_PATTERN = 50;
const BY_SLUG = new Map(COLOURS.map((c) => [c[0], c]));
const PAIRS = [];
for (const a of MIX_BASE) for (const b of MIX_BASE) {
  if (a !== b && Math.abs(lum(BY_SLUG.get(a)[1]) - lum(BY_SLUG.get(b)[1])) > 45) PAIRS.push([a, b]); // must read as two colours
}

export const SKINS = [];
for (const kind of ['cat', 'mouse']) {
  for (const [slug, hex, cs, en, tier] of COLOURS) {
    const id = `${kind}:${slug}`;
    SKINS.push({ id, kind, hex, dark: shade(hex), name: { cs, en }, price: id === DEFAULT[kind] ? 0 : PRICE[tier] });
  }
  Object.entries(PATTERNS).forEach(([pat, P], pi) => {
    // walk the pair list with a stride so every pattern gets a different, varied set of 50
    // black/white and white/black in every pattern, the rest picked across the pair list
    const picks = ['white-black', 'black-white'];
    for (let k = 0; picks.length < MIXES_PER_PATTERN; k++) {
      const key = PAIRS[(k * 7 + pi * 13) % PAIRS.length].join('-');
      if (!picks.includes(key)) picks.push(key);
    }
    for (const key of picks) {
      const [a, b] = PAIRS.find((x) => x.join('-') === key);
      const A = BY_SLUG.get(a), B = BY_SLUG.get(b);
      SKINS.push({
        id: `${kind}:mix-${pat}-${a}-${b}`, kind, hex: A[1], dark: shade(A[1]), mix: { pat, hex: B[1], dark: shade(B[1]) },
        name: { cs: `${A[2]} / ${B[2]} · ${P.cs}`, en: `${A[3]} / ${B[3]} · ${P.en}` },
        price: P.price + (FANCY.has(a) || FANCY.has(b) ? 3 : 0),
      });
    }
  });
}
export const SKIN_BY_ID = new Map(SKINS.map((s) => [s.id, s]));
