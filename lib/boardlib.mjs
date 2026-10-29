// Pure board logic, shared by the Netlify function and the tests.
export const IDS = ['chris', 'maggie', 'addy', 'aurora', 'jameson'];
export const NAMES = { chris: 'Chris', maggie: 'Maggie', addy: 'Addy', aurora: 'Aurora', jameson: 'Jameson' };
const ITEMS = ['truck', 'dino', 'fire', 'space', 'power', 'magnet', 'rex'];
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
    if (!IDS.includes(id)) continue;
    const p = patch.players[id];
    if (!p || typeof p !== 'object') continue;
    const c = board.players[id] || (board.players[id] = { name: NAMES[id], best: 0, games: 0 });
    c.name = NAMES[id];
    const best = int(p.best, 10000000);
    if (best !== null && best > (c.best || 0)) { c.best = best; const at = stamp(p.bestAt); if (at) c.bestAt = at; }
    const games = int(p.games, 1000000);
    if (games !== null) c.games = Math.max(c.games || 0, games);
    const last = int(p.last, 10000000);
    if (last !== null) c.last = last;
    const lastAt = stamp(p.lastAt);
    if (lastAt) c.lastAt = lastAt;
    const bolts = int(p.bolts, 1000000);
    if (bolts !== null) c.bolts = bolts;
    if (Array.isArray(p.owned)) c.owned = [...new Set(p.owned.filter((x) => ITEMS.includes(x)))];
    if (OUTFITS.includes(p.outfit)) c.outfit = p.outfit;
    if (typeof p.ride === 'boolean') c.ride = p.ride;
    touched = true;
  }
  if (!touched) return null;
  board.updatedAt = new Date().toISOString();
  return board;
}
