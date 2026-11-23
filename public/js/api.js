// Local persistence + server API.
const KEY = 'slappycat.v5'; // bump when rules or maps change (old local runs would be invalid)

const defaults = () => ({ lang: null, muted: false, ghost: false, token: null, user: null, bests: {}, synced: {}, shop: null });

export const store = {
  d: defaults(),
  load() {
    try { Object.assign(this.d, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* private mode etc. */ }
    return this;
  },
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.d)); } catch { /* ignore */ } },
  best(mapId) { return this.d.bests[mapId] || null; },
  // keep the better run; returns true when it improved
  offer(mapId, run) {
    const b = this.d.bests[mapId];
    if (b && b.score >= run.score) return false;
    this.d.bests[mapId] = { score: run.score, cheese: run.cheese, gold: run.gold, salmon: run.salmon || 0, close: run.close, inputs: run.inputs, ticket: run.ticket || null };
    this.save();
    return true;
  },
  completed(mapId) { return !!this.d.bests[mapId]; },
};

// where the API lives: same origin by default; a static copy (GitHub Pages) points this at the game server,
// or sets it to "none" to play offline with local progress only
const API = document.querySelector('meta[name="slappy-api"]')?.content || '';
export const OFFLINE = API === 'none';

async function call(method, path, body) {
  if (API === 'none') { const e = new Error('network'); e.code = 'network'; throw e; }
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (store.d.token) headers.Authorization = 'Bearer ' + store.d.token;
  let res;
  try {
    res = await fetch(API + 'api/' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    const e = new Error('network'); e.code = 'network'; throw e;
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) {
    const e = new Error((data && data.error) || 'server_error'); e.code = (data && data.error) || 'server_error'; e.status = res.status;
    if (res.status === 401 && path !== 'login') { store.d.token = null; store.d.user = null; store.save(); }
    throw e;
  }
  return data;
}

export const api = {
  challenge: () => call('GET', 'challenge'),
  ticket: (mapId) => call('GET', `ticket?map=${encodeURIComponent(mapId)}`),
  register: (name, password, challenge, pow) => call('POST', 'register', { name, password, challenge, pow }),
  login: (name, password) => call('POST', 'login', { name, password }),
  logout: () => call('POST', 'logout', {}),
  me: () => call('GET', 'me'),
  submit: (mapId, inputs, attempts, ticket) => call('POST', 'runs', { mapId, inputs, attempts, ticket }),
  replay: (map, name) => call('GET', `replay?map=${encodeURIComponent(map)}&name=${encodeURIComponent(name)}`),
  shop: () => call('GET', 'shop'),
  goldfish: (ticket) => call('GET', `goldfish?ticket=${encodeURIComponent(ticket)}`),
  buy: (item) => call('POST', 'shop/buy', { item }),
  equip: (item) => call('POST', 'shop/equip', { item }),
  board: (map, limit = 50) => call('GET', `leaderboard?map=${encodeURIComponent(map)}&limit=${limit}`),
};
