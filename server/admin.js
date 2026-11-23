// Slappy Cat moderation CLI (runs against the same SQLite file as the server).
//   node server/admin.js top [mapId]          best runs (default: overall)
//   node server/admin.js user <name>          a player's runs + attempts
//   node server/admin.js ban <name>           hide from boards, block login and uploads
//   node server/admin.js unban <name>
//   node server/admin.js delscore <name> <mapId>
// In Docker: docker exec slappy-cat node server/admin.js top
import { DatabaseSync } from 'node:sqlite';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const db = new DatabaseSync(process.env.DB_PATH || join(process.env.DATA_DIR || join(ROOT, 'data'), 'slappy.db'));
const [cmd, a, b] = process.argv.slice(2);
const user = (name) => {
  const u = db.prepare('SELECT id, name, banned, created FROM users WHERE name = ?').get(name);
  if (!u) { console.error('no such user:', name); process.exit(1); }
  return u;
};

switch (cmd) {
  case 'top':
    if (a) console.table(db.prepare(`SELECT u.name, s.score, s.cheese, s.gold, s.salmon, s.close, s.ticks, u.banned, datetime(s.achieved/1000,'unixepoch') AS at
      FROM scores s JOIN users u ON u.id = s.user_id WHERE s.map_id = ? ORDER BY s.score DESC LIMIT 30`).all(Number(a)));
    else console.table(db.prepare(`SELECT u.name, SUM(s.score) AS total, COUNT(*) AS maps, u.banned FROM scores s JOIN users u ON u.id = s.user_id
      GROUP BY s.user_id ORDER BY total DESC LIMIT 30`).all());
    break;
  case 'user': {
    const u = user(a);
    console.log(u);
    console.table(db.prepare(`SELECT s.map_id, s.score, s.ticks, json_array_length(s.inputs) AS inputs, IFNULL(t.runs, 0) AS attempts
      FROM scores s LEFT JOIN attempts t ON t.user_id = s.user_id AND t.map_id = s.map_id WHERE s.user_id = ? ORDER BY s.map_id`).all(u.id));
    break;
  }
  case 'ban': case 'unban': {
    const u = user(a);
    db.prepare('UPDATE users SET banned = ? WHERE id = ?').run(cmd === 'ban' ? 1 : 0, u.id);
    if (cmd === 'ban') db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
    console.log(`${cmd}ned ${u.name}`);
    break;
  }
  case 'delscore': {
    const u = user(a);
    const n = db.prepare('DELETE FROM scores WHERE user_id = ? AND map_id = ?').run(u.id, Number(b)).changes;
    console.log(`deleted ${n} run(s)`);
    break;
  }
  default:
    console.log('usage: node server/admin.js top [mapId] | user <name> | ban <name> | unban <name> | delscore <name> <mapId>');
}
