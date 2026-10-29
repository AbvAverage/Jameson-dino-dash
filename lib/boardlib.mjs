// Pure board logic, shared by the Netlify function and the tests.
export const IDS = ['chris', 'maggie', 'addy', 'aurora', 'jameson'];
export const NAMES = { chris: 'Chris', maggie: 'Maggie', addy: 'Addy', aurora: 'Aurora', jameson: 'Jameson' };
// Players type their own name; the id is the name in lowercase letters and digits ("Big Dawg" -> "big-dawg").
export const MAX_PLAYERS = 40;
const ID_RE = /^[a-z0-9](?:[a-z0-9-]{0,18}[a-z0-9])?$/;
export function cleanName(n) {
  if (typeof n !== 'string') return '';
  return n.replace(/[^\p{L}\p{N} '’.-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16);
}
// Finds or creates a player's record. Returns null for a bad id, or when the board is full.
function playerFor(board, id, name) {
  if (typeof id !== 'string' || !ID_RE.test(id)) return null;
  const clean = cleanName(name);
  let c = board.players[id];
  if (!c) {
    if (Object.keys(board.players).length >= MAX_PLAYERS) return null;
    c = board.players[id] = { name: NAMES[id] || clean || id, best: 0, games: 0 };
  }
  c.name = NAMES[id] || clean || c.name || id;
  return c;
}
export const PRICES = { truck: 0, dino: 40, fire: 60, space: 80, power: 120, magnet: 150, rex: 300 };
const ITEMS = Object.keys(PRICES);
const OUTFITS = ['truck', 'dino', 'fire', 'space'];

// Scores carried over from the Claude version of the game.
export const SEED = {
  players: {
    chris: { name: 'Chris', best: 6742, bestAt: '2026-10-28T06:37:52.944Z', games: 10, last: 922, lastAt: '2026-10-29T03:54:11.422Z', bolts: 356, owned: ['rex'], outfit: 'truck', ride: true },
    maggie: { name: 'Maggie', best: 0, games: 0 },
    addy: { name: 'Addy', best: 0, games: 0 },
    aurora: { name: 'Aurora', best: 0, games: 0 },
    jameson: { name: 'Jameson', best: 0, games: 0 }
  },
  updatedAt: '2026-10-29T03:54:11.422Z'
};

function int(v, max) { v = Math.floor(Number(v)); return Number.isFinite(v) && v >= 0 ? Math.min(v, max) : null; }
function stamp(v) { return typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v)) ? v : null; }

export function emptyBoard() { return JSON.parse(JSON.stringify(SEED)); }

// Merge an incoming {players:{id:{...}}} patch into the board. Returns the new board, or null if the patch is unusable.
export function mergeBoard(cur, patch) {
  if (!patch || typeof patch !== 'object' || !patch.players || typeof patch.players !== 'object') return null;
  const board = cur && cur.players ? JSON.parse(JSON.stringify(cur)) : emptyBoard();
  let touched = false;
  for (const id of Object.keys(patch.players)) {
    if (!IDS.includes(id)) continue; // old copies of the game only know the five family names
    const p = patch.players[id];
    if (!p || typeof p !== 'object') continue;
    const c = playerFor(board, id, p.name);
    if (!c) continue;
    const best = int(p.best, 10000000);
    if (best !== null && best > (c.best || 0)) { c.best = best; const at = stamp(p.bestAt); if (at) c.bestAt = at; }
    const games = int(p.games, 1000000);
    if (games !== null) c.games = Math.max(c.games || 0, games);
    const last = int(p.last, 10000000);
    if (last !== null) c.last = last;
    const lastAt = stamp(p.lastAt);
    if (lastAt) c.lastAt = lastAt;
    // bolts and items only change through applyOp, where the server checks prices
    touched = true;
  }
  if (!touched) return null;
  board.updatedAt = new Date().toISOString();
  return board;
}

const MAX_SEEN = 400;
const MAX_EARN = 300;

// Apply one action from a device. Returns { board, changed, error }.
// Actions carry an opId so a retried save is never counted twice.
export function applyOp(cur, op, now = new Date().toISOString()) {
  const board = cur && cur.players ? JSON.parse(JSON.stringify(cur)) : emptyBoard();
  if (!op || typeof op !== 'object') return { board, changed: false, error: 'bad_op' };
  const { id, type, opId } = op;
  if (typeof opId !== 'string' || opId.length < 4 || opId.length > 40) return { board, changed: false, error: 'bad_op' };
  board.seen = Array.isArray(board.seen) ? board.seen : [];
  if (board.seen.includes(opId)) return { board, changed: false, error: null };
  const c = playerFor(board, id, op.name);
  if (!c) return { board, changed: false, error: 'unknown_player' };
  if (typeof c.bolts !== 'number') c.bolts = 0;
  if (!Array.isArray(c.owned)) c.owned = [];
  const at = stamp(op.at) || now;

  if (type === 'run') {
    const score = int(op.score, 10000000);
    if (score === null) return { board, changed: false, error: 'bad_score' };
    c.games = (c.games || 0) + 1;
    c.last = score; c.lastAt = at;
    if (score > (c.best || 0)) { c.best = score; c.bestAt = at; }
  } else if (type === 'earn') {
    const n = int(op.n, MAX_EARN);
    if (n === null || n < 1) return { board, changed: false, error: 'bad_amount' };
    c.bolts += n;
  } else if (type === 'buy') {
    const item = op.item;
    if (!(item in PRICES) || item === 'truck') return { board, changed: false, error: 'unknown_item' };
    if (c.owned.includes(item)) return { board, changed: false, error: 'already_owned' };
    if (c.bolts < PRICES[item]) return { board, changed: false, error: 'not_enough_bolts' };
    c.bolts -= PRICES[item];
    c.owned.push(item);
    if (OUTFITS.includes(item)) c.outfit = item;
    if (item === 'rex') c.ride = true;
  } else if (type === 'equip') {
    let did = false;
    if (op.outfit !== undefined) {
      if (!OUTFITS.includes(op.outfit) || (op.outfit !== 'truck' && !c.owned.includes(op.outfit))) return { board, changed: false, error: 'not_owned' };
      c.outfit = op.outfit; did = true;
    }
    if (op.ride !== undefined) {
      if (typeof op.ride !== 'boolean' || (op.ride && !c.owned.includes('rex'))) return { board, changed: false, error: 'not_owned' };
      c.ride = op.ride; did = true;
    }
    if (!did) return { board, changed: false, error: 'bad_op' };
  } else {
    return { board, changed: false, error: 'bad_op' };
  }
  board.seen.push(opId);
  if (board.seen.length > MAX_SEEN) board.seen = board.seen.slice(-MAX_SEEN);
  board.updatedAt = now;
  return { board, changed: true, error: null };
}

// What devices and the TV see (the retry list stays on the server).
export function publicBoard(board) {
  const out = JSON.parse(JSON.stringify(board));
  delete out.seen;
  return out;
}
